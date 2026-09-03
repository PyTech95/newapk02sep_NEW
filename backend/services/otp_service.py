"""OTP orchestration: NekSathi rate-limiting + challenge storage on top of the
TezSandesh managed OTP provider.

TezSandesh owns OTP generation & verification. NekSathi only:
  * normalizes the phone number,
  * adds its own abuse protection (per-phone / per-IP limits, resend cooldown),
  * stores the provider request_id (never the OTP),
  * issues the existing app session after a successful provider verify.
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from pymongo import ReturnDocument

from .phone import InvalidPhone, mask_phone, normalize_phone
from .tezsandesh_otp import ProviderRejected, ProviderUnavailable, provider

log = logging.getLogger("neksathi.otp")

OTP_TTL_SECONDS = 300           # provider code lifetime we track locally
RESEND_COOLDOWN_SECONDS = 60    # provider allows 1 resend / minute
MAX_RESENDS_PER_REQUEST = 3     # provider allows max 3 resends / request
SEND_PER_PHONE_PER_HOUR = 5     # NekSathi layer: new sends per phone
SEND_PER_IP_PER_HOUR = 30
VERIFY_PER_PHONE_PER_HOUR = 20
VERIFY_PER_IP_PER_HOUR = 100

_indexes_ready = False


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    """Mongo returns tz-naive UTC datetimes; make them tz-aware for math."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def ensure_indexes(db) -> None:
    global _indexes_ready
    if _indexes_ready:
        return
    await db.otps.create_index("phone")
    await db.otps.create_index("expires_at", expireAfterSeconds=0)
    await db.rate_limits.create_index("expires_at", expireAfterSeconds=0)
    _indexes_ready = True


async def _rate_limit(db, key: str, max_count: int, window_seconds: int) -> bool:
    """Fixed-window counter in Mongo. Returns True if the call is allowed."""
    now = _now()
    bucket = int(now.timestamp() // window_seconds)
    doc = await db.rate_limits.find_one_and_update(
        {"_id": f"{key}:{bucket}"},
        {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": now + timedelta(seconds=window_seconds + 60)}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return doc.get("count", 1) <= max_count


def _norm(phone_raw: str) -> str:
    try:
        return normalize_phone(phone_raw)
    except InvalidPhone:
        raise HTTPException(400, "Please enter a valid phone number")


def _map_send_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ProviderUnavailable):
        return HTTPException(503, "Unable to send verification code. Please try again.")
    if isinstance(exc, ProviderRejected):
        if exc.status_code == 429 or exc.code == "RATE_LIMIT":
            return HTTPException(429, "Please wait before requesting another code.")
        # 401/403/subscription/config problems -> generic user message, detailed log.
        log.error("otp send provider config error status=%s code=%s", exc.status_code, exc.code or "-")
        return HTTPException(503, "Unable to send verification code. Please try again.")
    return HTTPException(503, "Unable to send verification code. Please try again.")


async def request_otp(db, phone_raw: str, ip: str, purpose: str = "login") -> dict:
    await ensure_indexes(db)
    phone = _norm(phone_raw)

    if not await _rate_limit(db, f"send:phone:{phone}", SEND_PER_PHONE_PER_HOUR, 3600):
        raise HTTPException(429, "Too many attempts. Please try again later.")
    if not await _rate_limit(db, f"send:ip:{ip}", SEND_PER_IP_PER_HOUR, 3600):
        raise HTTPException(429, "Too many attempts. Please try again later.")

    # Resend cooldown against the most recent live challenge.
    active = await db.otps.find_one(
        {"phone": phone, "consumed": False, "expires_at": {"$gt": _now()}},
        sort=[("created_at", -1)],
    )
    if active:
        age = (_now() - _aware(active["created_at"])).total_seconds()
        if age < RESEND_COOLDOWN_SECONDS:
            raise HTTPException(429, "Please wait before requesting another code.")

    reference_id = active.get("reference_id") if active else None
    if not reference_id:
        existing = await db.users.find_one({"phone": phone})
        reference_id = existing["id"] if existing else f"guest:{uuid.uuid4().hex[:12]}"

    idem = uuid.uuid4().hex
    try:
        request_id = await provider.send(phone, purpose, reference_id, idem)
    except (ProviderUnavailable, ProviderRejected) as exc:
        raise _map_send_error(exc)

    # A fresh send supersedes older live challenges for this phone.
    await db.otps.update_many({"phone": phone, "consumed": False}, {"$set": {"consumed": True}})
    await db.otps.insert_one({
        "phone": phone,
        "request_id": request_id,
        "purpose": purpose,
        "reference_id": reference_id,
        "status": "sent",
        "created_at": _now(),
        "expires_at": _now() + timedelta(seconds=OTP_TTL_SECONDS),
        "attempts": 0,
        "resend_count": 0,
        "last_sent_at": _now(),
        "consumed": False,
    })
    log.info("otp sent phone=%s", mask_phone(phone))
    return {"ok": True, "channel": "whatsapp", "live": True, "expires_in": OTP_TTL_SECONDS}


async def resend_otp(db, phone_raw: str, ip: str) -> dict:
    await ensure_indexes(db)
    phone = _norm(phone_raw)

    if not await _rate_limit(db, f"send:ip:{ip}", SEND_PER_IP_PER_HOUR, 3600):
        raise HTTPException(429, "Too many attempts. Please try again later.")

    challenge = await db.otps.find_one(
        {"phone": phone, "consumed": False, "expires_at": {"$gt": _now()}},
        sort=[("created_at", -1)],
    )
    if not challenge:
        # Nothing to resend -> start a fresh send.
        return await request_otp(db, phone_raw, ip)

    if (_now() - _aware(challenge["last_sent_at"])).total_seconds() < RESEND_COOLDOWN_SECONDS:
        raise HTTPException(429, "Please wait before requesting another code.")
    if challenge.get("resend_count", 0) >= MAX_RESENDS_PER_REQUEST:
        raise HTTPException(429, "Resend limit reached. Please try again later.")

    try:
        await provider.resend(challenge["request_id"])
    except (ProviderUnavailable, ProviderRejected) as exc:
        raise _map_send_error(exc)

    await db.otps.update_one(
        {"_id": challenge["_id"]},
        {"$inc": {"resend_count": 1}, "$set": {"last_sent_at": _now()}},
    )
    log.info("otp resent phone=%s", mask_phone(phone))
    return {"ok": True, "channel": "whatsapp", "live": True, "expires_in": OTP_TTL_SECONDS}


async def verify_and_get_phone(db, phone_raw: str, code: str, ip: str) -> str:
    await ensure_indexes(db)
    phone = _norm(phone_raw)
    code = (code or "").strip()
    if not code:
        raise HTTPException(400, "Please enter the verification code")

    if not await _rate_limit(db, f"verify:phone:{phone}", VERIFY_PER_PHONE_PER_HOUR, 3600):
        raise HTTPException(429, "Too many attempts. Please try again later.")
    if not await _rate_limit(db, f"verify:ip:{ip}", VERIFY_PER_IP_PER_HOUR, 3600):
        raise HTTPException(429, "Too many attempts. Please try again later.")

    challenge = await db.otps.find_one_and_update(
        {"phone": phone, "consumed": False, "expires_at": {"$gt": _now()}},
        {"$inc": {"attempts": 1}},
        sort=[("created_at", -1)],
        return_document=ReturnDocument.AFTER,
    )
    if not challenge:
        raise HTTPException(401, "Verification code expired. Please request a new one.")

    try:
        result = await provider.verify(challenge["request_id"], phone, code)
    except ProviderUnavailable:
        raise HTTPException(503, "Unable to verify code right now. Please try again.")

    if not result.get("verified"):
        if result.get("reason") == "expired":
            raise HTTPException(401, "Verification code expired. Please request a new one.")
        raise HTTPException(401, "Invalid verification code.")

    # One-time consumption (atomic): a second concurrent verify loses.
    consumed = await db.otps.find_one_and_update(
        {"_id": challenge["_id"], "consumed": False},
        {"$set": {"consumed": True, "status": "verified", "verified_at": _now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not consumed:
        raise HTTPException(401, "Invalid verification code.")

    log.info("otp verified phone=%s", mask_phone(phone))
    return phone


async def get_status(request_id: str) -> dict:
    try:
        return await provider.status(request_id)
    except ProviderUnavailable:
        raise HTTPException(503, "Status unavailable. Please try again.")
    except ProviderRejected as exc:
        raise HTTPException(404 if exc.status_code == 404 else 400, "Unable to fetch status.")
