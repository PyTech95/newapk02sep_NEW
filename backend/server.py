import os
import uuid
import json
import random
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta

import jwt
import bcrypt
import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ.get("JWT_SECRET", "neksathi-dev-secret")
JWT_ALGO = "HS256"
TOKEN_DAYS = 30
ESCALATE_AFTER = int(os.environ.get("SOS_ESCALATE_SECONDS", "120"))

app = FastAPI(title="NekSathi API")
api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)
logger = logging.getLogger("neksathi")


# ---------------- push notifications (Emergent managed relay) ----------------
PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
_push_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": PUSH_KEY},
    timeout=10.0,
)


async def send_push(recipients: list, data: dict, idempotency_key: str = None) -> None:
    if not recipients:
        return
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")
    payload = {"recipients": recipients[:100], "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    resp = await _push_client.post("/api/v1/push/trigger", json=payload)
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()


# ---------------- helpers ----------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except (ValueError, TypeError):
        return False


def make_token(uid: str) -> str:
    payload = {"sub": uid, "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_DAYS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def clean(doc: dict) -> dict:
    doc = dict(doc)
    doc.pop("_id", None)
    return doc


def invite_code() -> str:
    return "".join(random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", k=6))


def qr_id() -> str:
    return uuid.uuid4().hex[:12]


DEFAULT_PREFS = {
    "whatsapp": True, "email": True, "push": True,
    "incident_alerts": True, "speed_alerts": True, "marketing": False, "ringtone": "classic",
}


def user_public(u: dict) -> dict:
    return {
        "id": u["id"], "email": u["email"], "name": u.get("name", ""), "phone": u.get("phone", ""),
        "is_admin": u.get("is_admin", False), "is_dealer": False, "is_org": False,
        "suspended": False, "notify_prefs": u.get("notify_prefs", DEFAULT_PREFS),
        "escalate_seconds": u.get("escalate_seconds", ESCALATE_AFTER),
        "avatar_base64": u.get("avatar_base64"),
    }


async def current_user(cred: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
    if not cred:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(cred.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    u = await db.users.find_one({"id": payload.get("sub")})
    if not u:
        raise HTTPException(401, "User not found")
    return u


async def run_escalation(uid: str):
    """Lazy SOS escalation: alert the next emergency contact every N seconds
    (per-user, default ESCALATE_AFTER) while an SOS stays unacknowledged."""
    user = await db.users.find_one({"id": uid})
    after = max(30, int((user or {}).get("escalate_seconds", ESCALATE_AFTER)))
    contacts = await db.contacts.find({"owner_id": uid}).to_list(50)
    if not contacts:
        return
    now = datetime.now(timezone.utc)
    open_events = await db.sos.find({"owner_id": uid, "acknowledged": False}).to_list(100)
    for ev in open_events:
        try:
            created = datetime.fromisoformat(ev["created_at"].replace("Z", "+00:00"))
        except Exception:
            continue
        elapsed = (now - created).total_seconds()
        level = ev.get("escalation_level", 0)
        target = min(len(contacts), int(elapsed // after))
        if target > level:
            for i in range(level, target):
                c = contacts[i]
                await db.alerts.insert_one({
                    "id": str(uuid.uuid4()), "owner_id": uid, "type": "sos_escalation",
                    "message": f"No response — SOS auto-escalated to {c['name']} ({c['phone']})",
                    "created_at": now_iso(),
                })
            await db.sos.update_one({"id": ev["id"]}, {"$set": {
                "escalation_level": target, "escalated": True, "notified": max(ev.get("notified", 0), target),
            }})


# ---------------- models ----------------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str = Field(min_length=6)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class OtpReqIn(BaseModel):
    phone: str

class OtpVerifyIn(BaseModel):
    phone: str
    code: str
    name: Optional[str] = None

class MeUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    notify_prefs: Optional[dict] = None
    escalate_seconds: Optional[int] = None

class SosIn(BaseModel):
    latitude: float
    longitude: float
    message: Optional[str] = None

class ContactIn(BaseModel):
    name: str
    phone: str
    relation: Optional[str] = None

class LiveShareIn(BaseModel):
    duration_minutes: int = 60

class LocationIn(BaseModel):
    latitude: float
    longitude: float
    battery: Optional[int] = None

class SafeZoneIn(BaseModel):
    name: str
    latitude: float
    longitude: float
    radius_m: int = 300

class FamilyIn(BaseModel):
    name: str

class JoinIn(BaseModel):
    invite_code: str

class VehicleIn(BaseModel):
    number_plate: str
    vehicle_type: str = "car"
    make_model: Optional[str] = None

class VehicleUpdate(BaseModel):
    number_plate: str
    vehicle_type: str = "car"
    make_model: Optional[str] = None
    color: Optional[str] = None

class TagIn(BaseModel):
    name: str
    tag_type: str = "bag"

class TagUpdate(BaseModel):
    name: str
    tag_type: str = "bag"
    reward_text: Optional[str] = None
    description: Optional[str] = None

class CardIn(BaseModel):
    display_name: str
    title: Optional[str] = None
    phone: Optional[str] = None

class LostIn(BaseModel):
    enabled: bool

class DeviceIn(BaseModel):
    name: str
    platform: str = "android"
    model: Optional[str] = None

class ScanReportIn(BaseModel):
    type: Optional[str] = None
    scanner_note: Optional[str] = None
    scanner_phone: Optional[str] = None
    scanner_lat: Optional[float] = None
    scanner_lng: Optional[float] = None

class CardMsgIn(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    message: Optional[str] = None


# ---------------- auth ----------------
async def _auth_response(u: dict) -> dict:
    return {"access_token": make_token(u["id"]), "token_type": "bearer", "user": user_public(u)}


@api.post("/auth/register")
async def register(body: RegisterIn):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Email already registered")
    u = {
        "id": str(uuid.uuid4()), "email": email, "name": body.name, "phone": body.phone,
        "password": hash_pw(body.password), "is_admin": False, "notify_prefs": dict(DEFAULT_PREFS),
        "avatar_base64": None, "created_at": now_iso(),
    }
    await db.users.insert_one(u)
    return await _auth_response(u)


@api.post("/auth/login")
async def login(body: LoginIn):
    u = await db.users.find_one({"email": body.email.lower()})
    if not u or not verify_pw(body.password, u.get("password", "")):
        raise HTTPException(401, "Invalid email or password")
    return await _auth_response(u)


@api.post("/auth/otp/request")
async def otp_request(body: OtpReqIn):
    code = f"{random.randint(0, 999999):06d}"
    await db.otps.update_one(
        {"phone": body.phone},
        {"$set": {"code": code, "expires": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()}},
        upsert=True,
    )
    # No WhatsApp provider in this workspace -> expose dev_code so the flow is usable.
    return {"ok": True, "channel": "whatsapp", "dev_code": code, "live": False}


@api.post("/auth/otp/verify")
async def otp_verify(body: OtpVerifyIn):
    rec = await db.otps.find_one({"phone": body.phone})
    if not rec or rec.get("code") != body.code.strip():
        raise HTTPException(400, "Invalid or expired code")
    await db.otps.delete_one({"phone": body.phone})
    u = await db.users.find_one({"phone": body.phone})
    if not u:
        u = {
            "id": str(uuid.uuid4()), "email": f"{uuid.uuid4().hex[:8]}@phone.neksathi",
            "name": body.name or "NekSathi User", "phone": body.phone,
            "password": hash_pw(uuid.uuid4().hex), "is_admin": False,
            "notify_prefs": dict(DEFAULT_PREFS), "avatar_base64": None, "created_at": now_iso(),
        }
        await db.users.insert_one(u)
    return await _auth_response(u)


@api.get("/auth/me")
async def get_me(u: dict = Depends(current_user)):
    return user_public(u)


@api.put("/auth/me")
async def update_me(body: MeUpdate, u: dict = Depends(current_user)):
    upd = {}
    if body.name is not None:
        upd["name"] = body.name
    if body.phone is not None:
        upd["phone"] = body.phone
    if body.notify_prefs is not None:
        prefs = {**u.get("notify_prefs", DEFAULT_PREFS), **body.notify_prefs}
        upd["notify_prefs"] = prefs
    if body.escalate_seconds is not None:
        upd["escalate_seconds"] = max(30, int(body.escalate_seconds))
    if upd:
        await db.users.update_one({"id": u["id"]}, {"$set": upd})
        u = await db.users.find_one({"id": u["id"]})
    return user_public(u)


# ---------------- personal safety ----------------
@api.post("/me/sos")
async def create_sos(body: SosIn, u: dict = Depends(current_user)):
    n_contacts = await db.contacts.count_documents({"owner_id": u["id"]})
    ev = {
        "id": str(uuid.uuid4()), "owner_id": u["id"], "latitude": body.latitude, "longitude": body.longitude,
        "message": body.message, "notified": max(n_contacts, 1), "channels": ["whatsapp", "push"],
        "has_photo": False, "acknowledged": False, "escalated": False, "escalation_level": 0, "created_at": now_iso(),
    }
    await db.sos.insert_one(ev)
    await db.users.update_one({"id": u["id"]}, {"$set": {"last_lat": body.latitude, "last_lng": body.longitude, "last_seen": now_iso()}})
    await db.trails.insert_one({"owner_id": u["id"], "latitude": body.latitude, "longitude": body.longitude, "ts": now_iso()})
    # Guardian Push Alert: notify family members (except the sender) that an SOS is active.
    try:
        fid = u.get("family_id")
        if fid:
            members = await db.users.find({"family_id": fid}).to_list(50)
            recipients = [m["id"] for m in members if m["id"] != u["id"]]
            if recipients:
                await send_push(
                    recipients=recipients,
                    data={
                        "title": f"🆘 {u.get('name', 'A family member')} needs help",
                        "message": body.message or "SOS triggered — tap to see their live location.",
                        "action_url": "/(tabs)/family",
                    },
                    idempotency_key=ev["id"],
                )
    except Exception as e:
        logger.warning("Guardian push failed (non-blocking): %s", e)
    return clean(ev)


@api.get("/me/sos-events")
async def sos_events(u: dict = Depends(current_user)):
    await run_escalation(u["id"])
    rows = await db.sos.find({"owner_id": u["id"]}).sort("created_at", -1).to_list(200)
    return [clean(r) for r in rows]


@api.post("/me/sos/{sid}/ack")
async def ack_sos(sid: str, u: dict = Depends(current_user)):
    r = await db.sos.update_one({"id": sid, "owner_id": u["id"]}, {"$set": {"acknowledged": True}})
    if r.matched_count == 0:
        raise HTTPException(404, "SOS not found")
    return {"ok": True}


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str  # "android" | "ios"
    device_token: str


@api.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody):
    resp = await _push_client.post("/api/v1/push/users/register", json=body.model_dump())
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()
    return {"status": "registered"}


@api.get("/me/emergency-contacts")
async def list_contacts(u: dict = Depends(current_user)):
    rows = await db.contacts.find({"owner_id": u["id"]}).to_list(200)
    return [clean(r) for r in rows]


@api.post("/me/emergency-contacts")
async def add_contact(body: ContactIn, u: dict = Depends(current_user)):
    n = await db.contacts.count_documents({"owner_id": u["id"]})
    c = {
        "id": str(uuid.uuid4()), "owner_id": u["id"], "name": body.name, "phone": body.phone,
        "relation": body.relation, "is_primary": n == 0, "created_at": now_iso(),
    }
    await db.contacts.insert_one(c)
    return clean(c)


@api.delete("/me/emergency-contacts/{cid}")
async def del_contact(cid: str, u: dict = Depends(current_user)):
    await db.contacts.delete_one({"id": cid, "owner_id": u["id"]})
    return {"ok": True}


@api.post("/me/live-share")
async def live_share(body: LiveShareIn, u: dict = Depends(current_user)):
    ls = {
        "id": str(uuid.uuid4()), "owner_id": u["id"], "token": uuid.uuid4().hex, "label": None,
        "active": True, "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=body.duration_minutes)).isoformat().replace("+00:00", "Z"),
        "created_at": now_iso(),
    }
    await db.liveshares.insert_one(ls)
    return clean(ls)


@api.post("/me/location")
async def ping_location(body: LocationIn, u: dict = Depends(current_user)):
    await db.users.update_one({"id": u["id"]}, {"$set": {
        "last_lat": body.latitude, "last_lng": body.longitude, "last_battery": body.battery, "last_seen": now_iso(),
    }})
    await db.trails.insert_one({"owner_id": u["id"], "latitude": body.latitude, "longitude": body.longitude, "ts": now_iso()})
    return {"ok": True, "transitions": []}


@api.get("/me/safe-zones")
async def list_zones(u: dict = Depends(current_user)):
    rows = await db.zones.find({"owner_id": u["id"]}).to_list(200)
    return [clean(r) for r in rows]


@api.post("/me/safe-zones")
async def add_zone(body: SafeZoneIn, u: dict = Depends(current_user)):
    z = {
        "id": str(uuid.uuid4()), "owner_id": u["id"], "name": body.name, "latitude": body.latitude,
        "longitude": body.longitude, "radius_m": body.radius_m, "notify": True, "last_inside": None, "created_at": now_iso(),
    }
    await db.zones.insert_one(z)
    return clean(z)


@api.delete("/me/safe-zones/{zid}")
async def del_zone(zid: str, u: dict = Depends(current_user)):
    await db.zones.delete_one({"id": zid, "owner_id": u["id"]})
    return {"ok": True}


# ---------------- family ----------------
def member_from_user(mu: dict, fam: dict, me_id: str) -> dict:
    return {
        "member_id": mu["id"], "user_id": mu["id"], "name": mu.get("name", ""),
        "role": "guardian" if mu["id"] == fam.get("owner_id") else "member",
        "is_me": mu["id"] == me_id, "share_location": True, "share_activity": True,
        "latitude": mu.get("last_lat"), "longitude": mu.get("last_lng"),
        "battery": mu.get("last_battery"), "last_seen": mu.get("last_seen"),
    }


@api.get("/family")
async def get_family(u: dict = Depends(current_user)):
    fid = u.get("family_id")
    if not fid:
        return {"in_family": False}
    fam = await db.families.find_one({"id": fid})
    if not fam:
        return {"in_family": False}
    members = await db.users.find({"family_id": fid}).to_list(50)
    out = []
    for m in members:
        mem = member_from_user(m, fam, u["id"])
        tr = await db.trails.find({"owner_id": m["id"]}).sort("ts", -1).limit(12).to_list(12)
        mem["trail"] = [{"latitude": t["latitude"], "longitude": t["longitude"]} for t in reversed(tr)]
        out.append(mem)
    return {
        "in_family": True, "id": fam["id"], "name": fam["name"],
        "is_guardian": fam.get("owner_id") == u["id"], "invite_code": fam["invite_code"],
        "max_members": 5, "members": out,
    }


@api.post("/family")
async def create_family(body: FamilyIn, u: dict = Depends(current_user)):
    fam = {"id": str(uuid.uuid4()), "name": body.name, "owner_id": u["id"], "invite_code": invite_code(), "created_at": now_iso()}
    await db.families.insert_one(fam)
    await db.users.update_one({"id": u["id"]}, {"$set": {"family_id": fam["id"]}})
    return {"id": fam["id"], "name": fam["name"], "invite_code": fam["invite_code"], "is_guardian": True, "in_family": True}


@api.post("/family/join")
async def join_family(body: JoinIn, u: dict = Depends(current_user)):
    fam = await db.families.find_one({"invite_code": body.invite_code.upper()})
    if not fam:
        raise HTTPException(404, "Invalid invite code")
    count = await db.users.count_documents({"family_id": fam["id"]})
    if count >= 5:
        raise HTTPException(400, "Family is full")
    await db.users.update_one({"id": u["id"]}, {"$set": {"family_id": fam["id"]}})
    return {"ok": True, "family_id": fam["id"]}


@api.get("/family/sos")
async def family_sos(u: dict = Depends(current_user)):
    fid = u.get("family_id")
    if not fid:
        return []
    members = await db.users.find({"family_id": fid}).to_list(50)
    ids = [m["id"] for m in members]
    names = {m["id"]: m.get("name", "Family member") for m in members}
    rows = await db.sos.find({"owner_id": {"$in": ids}, "acknowledged": False}).sort("created_at", -1).to_list(50)
    out = []
    for r in rows:
        c = clean(r)
        c["owner_name"] = names.get(r["owner_id"], "Family member")
        c["is_me"] = r["owner_id"] == u["id"]
        out.append(c)
    return out


@api.post("/family/sos/{sid}/ack")
async def family_ack(sid: str, u: dict = Depends(current_user)):
    ev = await db.sos.find_one({"id": sid})
    if not ev:
        raise HTTPException(404, "SOS not found")
    owner = await db.users.find_one({"id": ev["owner_id"]})
    if not u.get("family_id") or not owner or owner.get("family_id") != u.get("family_id"):
        raise HTTPException(403, "Not in the same family")
    await db.sos.update_one({"id": sid}, {"$set": {"acknowledged": True, "acknowledged_by": u.get("name")}})
    if ev["owner_id"] != u["id"]:
        await db.alerts.insert_one({
            "id": str(uuid.uuid4()), "owner_id": ev["owner_id"], "type": "sos_ack",
            "message": f"{u.get('name')} acknowledged your SOS — help is coming", "created_at": now_iso(),
        })
    return {"ok": True}


# ---------------- smart QR ----------------
@api.get("/vehicles")
async def list_vehicles(u: dict = Depends(current_user)):
    return [clean(r) for r in await db.vehicles.find({"owner_id": u["id"]}).to_list(200)]


@api.post("/vehicles")
async def add_vehicle(body: VehicleIn, u: dict = Depends(current_user)):
    v = {
        "id": str(uuid.uuid4()), "owner_id": u["id"], "number_plate": body.number_plate,
        "vehicle_type": body.vehicle_type, "make_model": body.make_model, "color": None,
        "qr_id": qr_id(), "speed_limit_kmh": 80, "lost_mode": False, "created_at": now_iso(),
    }
    await db.vehicles.insert_one(v)
    return clean(v)


@api.put("/vehicles/{vid}")
async def update_vehicle(vid: str, body: VehicleUpdate, u: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vid, "owner_id": u["id"]})
    if not v:
        raise HTTPException(404, "Not found")
    upd = body.model_dump(exclude_none=True)
    await db.vehicles.update_one({"id": vid}, {"$set": upd})
    return clean(await db.vehicles.find_one({"id": vid}))


@api.post("/vehicles/{vid}/lost_mode")
async def vehicle_lost(vid: str, body: LostIn, u: dict = Depends(current_user)):
    v = await db.vehicles.find_one({"id": vid, "owner_id": u["id"]})
    if not v:
        raise HTTPException(404, "Not found")
    await db.vehicles.update_one({"id": vid}, {"$set": {"lost_mode": body.enabled}})
    return clean(await db.vehicles.find_one({"id": vid}))


@api.get("/tags")
async def list_tags(u: dict = Depends(current_user)):
    return [clean(r) for r in await db.tags.find({"owner_id": u["id"]}).to_list(200)]


@api.post("/tags")
async def add_tag(body: TagIn, u: dict = Depends(current_user)):
    t = {
        "id": str(uuid.uuid4()), "owner_id": u["id"], "name": body.name, "tag_type": body.tag_type,
        "description": None, "blood_group": None, "reward_text": None, "qr_id": qr_id(),
        "lost_mode": False, "created_at": now_iso(),
    }
    await db.tags.insert_one(t)
    return clean(t)


@api.put("/tags/{tid}")
async def update_tag(tid: str, body: TagUpdate, u: dict = Depends(current_user)):
    t = await db.tags.find_one({"id": tid, "owner_id": u["id"]})
    if not t:
        raise HTTPException(404, "Not found")
    await db.tags.update_one({"id": tid}, {"$set": body.model_dump(exclude_none=True)})
    return clean(await db.tags.find_one({"id": tid}))


@api.post("/tags/{tid}/lost_mode")
async def tag_lost(tid: str, body: LostIn, u: dict = Depends(current_user)):
    t = await db.tags.find_one({"id": tid, "owner_id": u["id"]})
    if not t:
        raise HTTPException(404, "Not found")
    await db.tags.update_one({"id": tid}, {"$set": {"lost_mode": body.enabled}})
    return clean(await db.tags.find_one({"id": tid}))


@api.get("/cards")
async def list_cards(u: dict = Depends(current_user)):
    return [clean(r) for r in await db.cards.find({"owner_id": u["id"]}).to_list(200)]


@api.post("/cards")
async def add_card(body: CardIn, u: dict = Depends(current_user)):
    c = {
        "id": str(uuid.uuid4()), "owner_id": u["id"], "display_name": body.display_name,
        "title": body.title, "company": None, "phone": body.phone, "email": None,
        "qr_id": qr_id(), "created_at": now_iso(),
    }
    await db.cards.insert_one(c)
    return clean(c)


# ---------------- alerts & incidents ----------------
@api.get("/alerts")
async def list_alerts(u: dict = Depends(current_user)):
    await run_escalation(u["id"])
    return [clean(r) for r in await db.alerts.find({"owner_id": u["id"]}).sort("created_at", -1).to_list(200)]


@api.get("/incidents")
async def list_incidents(u: dict = Depends(current_user)):
    rows = [clean(r) for r in await db.incidents.find({"owner_id": u["id"]}).sort("created_at", -1).to_list(200)]
    return {"count": len(rows), "results": rows}


# ---------------- devices (anti-theft) ----------------
@api.get("/devices")
async def list_devices(u: dict = Depends(current_user)):
    return [clean(r) for r in await db.devices.find({"owner_id": u["id"]}).to_list(200)]


@api.post("/devices")
async def add_device(body: DeviceIn, u: dict = Depends(current_user)):
    d = {
        "id": str(uuid.uuid4()), "owner_id": u["id"], "name": body.name, "platform": body.platform,
        "lock_threshold": 3, "guardian_contact_id": None, "super_admin_alerts": True,
        "locked": False, "siren_active": False, "created_at": now_iso(), "last_seen": now_iso(),
    }
    await db.devices.insert_one(d)
    return clean(d)


@api.get("/devices/{did}/lock-state")
async def lock_state(did: str, u: dict = Depends(current_user)):
    d = await db.devices.find_one({"id": did, "owner_id": u["id"]})
    if not d:
        raise HTTPException(404, "Not found")
    return {"locked": d.get("locked", False), "lock_threshold": d.get("lock_threshold", 3)}


@api.get("/devices/{did}/siren-state")
async def siren_state(did: str, u: dict = Depends(current_user)):
    d = await db.devices.find_one({"id": did, "owner_id": u["id"]})
    if not d:
        raise HTTPException(404, "Not found")
    return {"siren_active": d.get("siren_active", False)}


@api.post("/devices/{did}/intruder")
async def intruder(did: str, u: dict = Depends(current_user)):
    d = await db.devices.find_one({"id": did, "owner_id": u["id"]})
    if not d:
        raise HTTPException(404, "Not found")
    await db.alerts.insert_one({
        "id": str(uuid.uuid4()), "owner_id": u["id"], "type": "intruder",
        "message": f"Intruder attempt on {d['name']}", "created_at": now_iso(),
    })
    return {"ok": True}


@api.post("/devices/{did}/sim-swap")
async def sim_swap(did: str, u: dict = Depends(current_user)):
    d = await db.devices.find_one({"id": did, "owner_id": u["id"]})
    if not d:
        raise HTTPException(404, "Not found")
    await db.alerts.insert_one({
        "id": str(uuid.uuid4()), "owner_id": u["id"], "type": "sim_swap",
        "message": f"SIM swap detected on {d['name']}", "created_at": now_iso(),
    })
    return {"ok": True}


# ---------------- public scan / report ----------------
@api.get("/public/qr/{qrid}")
async def public_qr(qrid: str):
    v = await db.vehicles.find_one({"qr_id": qrid})
    if v:
        return {"kind": "vehicle", "number_plate": v["number_plate"], "vehicle_type": v["vehicle_type"],
                "lost_mode": v.get("lost_mode", False), "reward_text": None, "qr_id": qrid}
    t = await db.tags.find_one({"qr_id": qrid})
    if t:
        return {"kind": "tag_guardian", "name": t["name"], "tag_type": t["tag_type"],
                "lost_mode": t.get("lost_mode", False), "reward_text": t.get("reward_text"), "qr_id": qrid}
    raise HTTPException(404, "QR not found")


@api.get("/public/card/{qrid}")
async def public_card(qrid: str):
    c = await db.cards.find_one({"qr_id": qrid})
    if not c:
        raise HTTPException(404, "Card not found")
    return {"kind": "card", "display_name": c["display_name"], "title": c.get("title"), "phone": c.get("phone"), "qr_id": qrid}


async def _owner_of_qr(qrid: str, collection):
    return await collection.find_one({"qr_id": qrid})


@api.post("/public/qr/{qrid}/incident")
async def public_incident(qrid: str, body: ScanReportIn):
    item = await db.vehicles.find_one({"qr_id": qrid}) or await db.tags.find_one({"qr_id": qrid})
    if not item:
        raise HTTPException(404, "QR not found")
    inc = {
        "id": str(uuid.uuid4()), "owner_id": item["owner_id"], "qr_id": qrid,
        "type": body.type or "other", "scanner_note": body.scanner_note, "scanner_phone": body.scanner_phone,
        "scanner_lat": body.scanner_lat, "scanner_lng": body.scanner_lng, "created_at": now_iso(),
    }
    await db.incidents.insert_one(inc)
    return {"ok": True}


@api.post("/public/tag/{qrid}/alert")
async def public_tag_alert(qrid: str, body: ScanReportIn):
    t = await db.tags.find_one({"qr_id": qrid})
    if not t:
        raise HTTPException(404, "Tag not found")
    al = {
        "id": str(uuid.uuid4()), "owner_id": t["owner_id"], "type": body.type or "found",
        "message": body.scanner_note or "Someone scanned your tag", "scanner_phone": body.scanner_phone,
        "scanner_lat": body.scanner_lat, "scanner_lng": body.scanner_lng, "created_at": now_iso(),
    }
    await db.alerts.insert_one(al)
    return {"ok": True}


@api.post("/public/card/{qrid}/message")
async def public_card_message(qrid: str, body: CardMsgIn):
    c = await db.cards.find_one({"qr_id": qrid})
    if not c:
        raise HTTPException(404, "Card not found")
    await db.alerts.insert_one({
        "id": str(uuid.uuid4()), "owner_id": c["owner_id"], "type": "card_message",
        "message": f"{body.name or 'Someone'}: {body.message or ''}", "scanner_phone": body.phone, "created_at": now_iso(),
    })
    return {"ok": True}


@api.get("/")
async def root():
    return {"service": "NekSathi API", "ok": True}


# ---------------- public scan landing page (browser, no app needed) ----------------
SCAN_PAGE = """<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<title>NekSathi — Scan</title>
<style>
  :root{--bg:#06060f;--card:#12121f;--line:#242438;--text:#eef;--dim:#98a0b8;--teal:#22d3ee;--red:#ff4d5e;--green:#34d399;--amber:#fbbf24;--purple:#a78bfa;}
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{margin:0;background:radial-gradient(1200px 500px at 50% -10%,rgba(34,211,238,.10),transparent),var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;padding:22px 16px 40px;min-height:100vh}
  .wrap{max-width:460px;margin:0 auto}
  .brand{text-align:center;font-weight:800;font-size:26px;letter-spacing:.5px;margin:4px 0 2px}
  .brand span{color:var(--teal)}
  .tag{text-align:center;color:var(--dim);font-size:12.5px;margin-bottom:16px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px;margin-bottom:14px}
  .banner{border-radius:14px;padding:13px 15px;margin-bottom:14px;font-weight:600;font-size:14px}
  .banner.lost{background:rgba(255,77,94,.12);border:1px solid rgba(255,77,94,.4);color:#ffb3ba}
  .banner.ok{background:rgba(52,211,153,.10);border:1px solid rgba(52,211,153,.3);color:#a7f3d0}
  .banner.ice{background:rgba(167,139,250,.12);border:1px solid rgba(167,139,250,.4);color:#ddd0ff}
  h1{font-size:23px;margin:2px 0 4px;letter-spacing:.5px}
  .sub{color:var(--dim);font-size:14px}
  .chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
  .pill{background:#0c0c18;border:1px solid var(--line);border-radius:999px;padding:6px 11px;font-size:12.5px;color:var(--dim)}
  .reward{margin-top:12px;background:rgba(251,191,36,.10);border:1px solid rgba(251,191,36,.35);color:#fde68a;border-radius:12px;padding:12px 14px;font-size:14px}
  .qh{font-size:13px;color:var(--dim);margin:16px 0 8px;font-weight:600}
  .reasons{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .reason{display:flex;align-items:center;gap:9px;background:#0c0c18;border:1px solid var(--line);border-radius:14px;padding:13px 12px;font-size:14px;font-weight:600;cursor:pointer;color:var(--text)}
  .reason .ic{font-size:18px}
  .reason.sel{border-color:var(--teal);background:rgba(34,211,238,.10);color:#bff5ff}
  .reason.full{grid-column:1/3}
  label{display:block;font-size:12px;color:var(--dim);margin:16px 0 6px;letter-spacing:.4px;text-transform:uppercase}
  input,textarea{width:100%;background:#0c0c18;border:1px solid var(--line);border-radius:12px;color:var(--text);padding:12px 14px;font-size:15px;font-family:inherit}
  textarea{min-height:78px;resize:vertical}
  button{width:100%;border:0;border-radius:14px;padding:15px;font-size:16px;font-weight:700;margin-top:16px;cursor:pointer}
  button:disabled{opacity:.6}
  .primary{background:var(--teal);color:#04121a}
  .call{display:flex;align-items:center;justify-content:center;gap:8px;background:var(--green);color:#04120c;border-radius:14px;padding:15px;font-size:16px;font-weight:700;margin-top:12px;text-decoration:none}
  .loc{display:flex;align-items:center;gap:10px;margin-top:14px;color:var(--dim);font-size:13.5px}
  .loc input{width:auto}
  .priv{display:flex;gap:8px;align-items:flex-start;margin-top:14px;color:var(--dim);font-size:12.5px;line-height:1.5}
  .done{text-align:center;padding:26px 10px}
  .done .ico{font-size:46px}
  .muted{color:var(--dim);font-size:12.5px;text-align:center;margin-top:16px;line-height:1.5}
  .err{text-align:center;padding:26px 10px}
  .err .ico{font-size:40px}
  .hide{display:none}
</style></head>
<body><div class="wrap">
  <div class="brand">Nek<span>Sathi</span></div>
  <div class="tag">Har Musibat Mein, Ek Nek Sathi</div>
  <div id="app"><div class="muted">Loading…</div></div>
  <div class="muted">🔒 The owner's phone number stays private. Powered by NekSathi.</div>
</div>
<script>
const DATA = __DATA__;
const QRID = "__QRID__";
const app = document.getElementById("app");
let coords = null, reason = null;

function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function val(id){const e=document.getElementById(id);return e?e.value.trim():"";}

function grabLocation(cb){
  if(!navigator.geolocation){cb();return;}
  navigator.geolocation.getCurrentPosition(
    p=>{coords={lat:p.coords.latitude,lng:p.coords.longitude};cb();},
    ()=>cb(),{enableHighAccuracy:true,timeout:8000}
  );
}
function done(msg){
  app.innerHTML='<div class="card"><div class="done"><div class="ico">✅</div><h1>Thank you!</h1><p class="sub" style="text-transform:none;margin-top:8px">'+esc(msg)+'</p></div></div>';
  window.scrollTo(0,0);
}
async function post(url, body){
  const r = await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!r.ok) throw new Error("failed");
  return r.json();
}
function sendReport(url, extraType){
  const btn=document.getElementById("send"); btn.disabled=true; btn.textContent="Sending…";
  const share=document.getElementById("f_share").checked;
  const fire=async()=>{
    const b={type:extraType||reason||"other",scanner_note:val("f_note")||null,scanner_phone:val("f_phone")||null,
             scanner_lat:coords?coords.lat:null,scanner_lng:coords?coords.lng:null};
    try{await post(url,b);done("The owner has been alerted"+(coords?" with your location":"")+". They may call you back on a private line. Thank you for your kindness!");}
    catch(e){btn.disabled=false;btn.textContent="Send to owner";alert("Could not send. Please try again.");}
  };
  if(share) grabLocation(fire); else fire();
}
function reportForm(sendUrl, extraType){
  return '<label>Message to the owner</label><textarea id="f_note" placeholder="Describe what you see (optional)"></textarea>'+
    '<label>Your phone (optional)</label><input id="f_phone" placeholder="So the owner can call you back privately"/>'+
    '<div class="loc"><input type="checkbox" id="f_share" checked/><span>Share my current location with the owner</span></div>'+
    '<button class="primary" id="send" onclick="sendReport(\\''+sendUrl+'\\''+(extraType?",'"+extraType+"'":"")+')">Send to owner</button>'+
    '<div class="priv">🔒<span>Your report is delivered privately through NekSathi — the owner never sees your number unless you share it.</span></div>';
}

function renderVehicle(){
  const lost=!!DATA.lost_mode;
  const bits=[DATA.vehicle_type,DATA.make_model,DATA.color].filter(Boolean).map(esc);
  const banner = lost
    ? '<div class="banner lost">🔴 This vehicle is reported <b>LOST/STOLEN</b>. Please help return it.</div>'
    : '<div class="banner ok">🟢 This vehicle is protected by NekSathi. Reach the owner privately.</div>';
  const reward = (lost && DATA.reward_text) ? '<div class="reward">🎁 '+esc(DATA.reward_text)+'</div>' : '';
  let reasons =
    '<div class="reason full" data-r="wrong_parking"><span class="ic">🅿️</span> Wrong / blocking parking</div>'+
    '<div class="reason" data-r="accident"><span class="ic">💥</span> Accident</div>'+
    '<div class="reason" data-r="lights_on"><span class="ic">💡</span> Lights / window</div>'+
    '<div class="reason" data-r="theft"><span class="ic">🚨</span> Suspicious</div>'+
    (lost?'<div class="reason" data-r="found"><span class="ic">🔎</span> I found it</div>':'<div class="reason" data-r="other"><span class="ic">✉️</span> Other</div>');
  app.innerHTML = banner+
    '<div class="card"><h1>'+esc(DATA.number_plate)+'</h1><div class="sub">'+(bits.join(' · ')||'Vehicle')+'</div>'+reward+
    '<div class="qh">WHY ARE YOU REACHING THE OWNER?</div><div class="reasons" id="reasons">'+reasons+'</div>'+
    '<div id="formbox" class="hide">'+reportForm("/api/public/qr/"+QRID+"/incident")+'</div></div>';
  wireReasons();
}
function renderTag(){
  const lost=!!DATA.lost_mode;
  const banner = lost
    ? '<div class="banner lost">🔴 This item is reported <b>LOST</b>. Please help return it to the owner.</div>'
    : '<div class="banner ok">🟢 This item is protected by NekSathi.</div>';
  const reward = (lost && DATA.reward_text) ? '<div class="reward">🎁 '+esc(DATA.reward_text)+'</div>' : '';
  let pills='';
  if(DATA.blood_group) pills+='<span class="pill">🩸 '+esc(DATA.blood_group)+'</span>';
  if(DATA.description) pills+='<span class="pill">'+esc(DATA.description)+'</span>';
  app.innerHTML = banner+
    '<div class="card"><h1>'+esc(DATA.name)+'</h1><div class="sub" style="text-transform:capitalize">'+esc(DATA.tag_type||'Tag')+'</div>'+
    (pills?'<div class="chips">'+pills+'</div>':'')+reward+
    '<div class="qh">FOUND THIS? LET THE OWNER KNOW</div>'+
    reportForm("/api/public/tag/"+QRID+"/alert","found")+'</div>';
}
function renderCard(){
  const bits=[DATA.title,DATA.company].filter(Boolean).map(esc);
  let call = DATA.phone ? '<a class="call" href="tel:'+esc(DATA.phone)+'">📞 Call '+esc(DATA.display_name)+'</a>' : '';
  app.innerHTML =
    '<div class="banner ice">🪪 Emergency / contact card</div>'+
    '<div class="card"><h1>'+esc(DATA.display_name)+'</h1><div class="sub">'+(bits.join(' · ')||'Contact card')+'</div>'+call+
    '<div class="qh">SEND A MESSAGE</div>'+
    '<label>Your name</label><input id="f_name" placeholder="Your name"/>'+
    '<label>Your phone (optional)</label><input id="f_phone" placeholder="So they can reach you"/>'+
    '<label>Message</label><textarea id="f_msg" placeholder="Write a message to the owner"></textarea>'+
    '<button class="primary" id="cardsend">Send message</button></div>';
  document.getElementById("cardsend").onclick=async()=>{
    const btn=document.getElementById("cardsend"); btn.disabled=true; btn.textContent="Sending…";
    try{await post("/api/public/card/"+QRID+"/message",{name:val("f_name"),phone:val("f_phone"),message:val("f_msg")});
        done("Your message has been delivered to the owner.");}
    catch(e){btn.disabled=false;btn.textContent="Send message";alert("Could not send. Please try again.");}
  };
}
function wireReasons(){
  const box=document.getElementById("formbox");
  document.querySelectorAll("#reasons .reason").forEach(el=>{
    el.onclick=()=>{
      document.querySelectorAll("#reasons .reason").forEach(x=>x.classList.remove("sel"));
      el.classList.add("sel"); reason=el.getAttribute("data-r"); box.classList.remove("hide");
      const note=document.getElementById("f_note");
      const hints={wrong_parking:"e.g. Your vehicle is blocking a gate at ...",accident:"e.g. Minor accident near ...",lights_on:"e.g. Your headlights are on / window open",theft:"e.g. Someone is tampering with your vehicle",found:"e.g. Found parked at ...",other:""};
      if(note) note.placeholder=hints[reason]||"Describe what you see (optional)";
      box.scrollIntoView({behavior:"smooth",block:"nearest"});
    };
  });
}
function render(){
  if(!DATA){app.innerHTML='<div class="card"><div class="err"><div class="ico">🔍</div><h1>Not registered</h1><p class="sub" style="text-transform:none;margin-top:8px">This QR code isn\\'t linked to a NekSathi item yet.</p></div></div>';return;}
  if(DATA.kind==="vehicle") return renderVehicle();
  if(DATA.kind==="card") return renderCard();
  return renderTag();
}
render();
</script></body></html>"""


async def _resolve_scan(qrid: str):
    v = await db.vehicles.find_one({"qr_id": qrid})
    if v:
        owner = await db.users.find_one({"id": v["owner_id"]})
        return {"kind": "vehicle", "number_plate": v["number_plate"], "vehicle_type": v.get("vehicle_type"),
                "make_model": v.get("make_model"), "color": v.get("color"),
                "owner_phone": (owner or {}).get("phone"),
                "lost_mode": v.get("lost_mode", False), "reward_text": v.get("reward_text"), "qr_id": qrid}
    t = await db.tags.find_one({"qr_id": qrid})
    if t:
        owner = await db.users.find_one({"id": t["owner_id"]})
        return {"kind": "tag_guardian", "name": t["name"], "tag_type": t.get("tag_type"),
                "blood_group": t.get("blood_group"), "description": t.get("description"),
                "owner_phone": (owner or {}).get("phone"),
                "lost_mode": t.get("lost_mode", False), "reward_text": t.get("reward_text"), "qr_id": qrid}
    c = await db.cards.find_one({"qr_id": qrid})
    if c:
        return {"kind": "card", "display_name": c["display_name"], "title": c.get("title"),
                "company": c.get("company"), "phone": c.get("phone"), "qr_id": qrid}
    return None


@api.get("/s/{qrid}", response_class=HTMLResponse)
async def scan_page(qrid: str):
    data = await _resolve_scan(qrid)
    html = SCAN_PAGE.replace("__DATA__", json.dumps(data)).replace("__QRID__", qrid)
    return HTMLResponse(content=html)


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO)


@app.on_event("startup")
async def seed():
    demo_email = "demo@neksathi.app"
    demo = await db.users.find_one({"email": demo_email})
    if not demo:
        demo = {
            "id": str(uuid.uuid4()), "email": demo_email, "name": "Demo User", "phone": "+919000000000",
            "password": hash_pw("demo1234"), "is_admin": False, "notify_prefs": dict(DEFAULT_PREFS),
            "avatar_base64": None, "created_at": now_iso(),
        }
        await db.users.insert_one(demo)
        logger.info("Seeded demo user %s", demo_email)

    if demo.get("seeded"):
        return

    did = demo["id"]

    def trail(base_lat, base_lng, n=8):
        pts = []
        for i in range(n):
            pts.append({"owner_id": None, "latitude": base_lat + i * 0.0016, "longitude": base_lng + i * 0.0012,
                        "ts": (datetime.now(timezone.utc) - timedelta(minutes=(n - i) * 6)).isoformat().replace("+00:00", "Z")})
        return pts

    # Family with the demo user as guardian + two sample members with live trails.
    fam = {"id": str(uuid.uuid4()), "name": "Sharma Family", "owner_id": did, "invite_code": invite_code(), "created_at": now_iso()}
    await db.families.insert_one(fam)
    await db.users.update_one({"id": did}, {"$set": {"family_id": fam["id"], "last_lat": 19.0760, "last_lng": 72.8777, "last_battery": 82, "last_seen": now_iso()}})

    demo_pts = trail(19.0760, 72.8777)
    for p in demo_pts:
        p["owner_id"] = did
    await db.trails.insert_many(demo_pts)

    members = [
        {"name": "Aarav", "lat": 19.0896, "lng": 72.8656, "battery": 64},
        {"name": "Meera", "lat": 19.0630, "lng": 72.8990, "battery": 27},
    ]
    for m in members:
        mid = str(uuid.uuid4())
        await db.users.insert_one({
            "id": mid, "email": f"{m['name'].lower()}@demo.neksathi", "name": m["name"], "phone": "+9190000001",
            "password": hash_pw(uuid.uuid4().hex), "is_admin": False, "notify_prefs": dict(DEFAULT_PREFS),
            "avatar_base64": None, "family_id": fam["id"], "last_lat": m["lat"], "last_lng": m["lng"],
            "last_battery": m["battery"], "last_seen": now_iso(), "created_at": now_iso(),
        })
        pts = trail(m["lat"] - 0.01, m["lng"] - 0.008)
        for p in pts:
            p["owner_id"] = mid
        await db.trails.insert_many(pts)

    # Emergency contacts, safe zone, a vehicle and a tag so the app feels alive.
    await db.contacts.insert_many([
        {"id": str(uuid.uuid4()), "owner_id": did, "name": "Priya (Sister)", "phone": "+919812345678", "relation": "Sister", "is_primary": True, "created_at": now_iso()},
        {"id": str(uuid.uuid4()), "owner_id": did, "name": "Rahul (Friend)", "phone": "+919887654321", "relation": "Friend", "is_primary": False, "created_at": now_iso()},
    ])
    await db.zones.insert_one({"id": str(uuid.uuid4()), "owner_id": did, "name": "Home", "latitude": 19.0760, "longitude": 72.8777, "radius_m": 250, "notify": True, "last_inside": True, "created_at": now_iso()})
    await db.vehicles.insert_one({"id": str(uuid.uuid4()), "owner_id": did, "number_plate": "MH01AB1234", "vehicle_type": "car", "make_model": "Hyundai Creta", "color": "White", "qr_id": qr_id(), "speed_limit_kmh": 80, "lost_mode": False, "created_at": now_iso()})
    await db.tags.insert_one({"id": str(uuid.uuid4()), "owner_id": did, "name": "School Bag", "tag_type": "bag", "description": "Kids' school bag", "blood_group": None, "reward_text": None, "qr_id": qr_id(), "lost_mode": False, "created_at": now_iso()})
    await db.devices.insert_one({"id": str(uuid.uuid4()), "owner_id": did, "name": "Pixel 8", "platform": "android", "lock_threshold": 3, "guardian_contact_id": None, "super_admin_alerts": True, "locked": False, "siren_active": False, "created_at": now_iso(), "last_seen": now_iso()})

    await db.users.update_one({"id": did}, {"$set": {"seeded": True}})
    logger.info("Seeded demo data for %s", demo_email)


@app.on_event("shutdown")
async def shutdown():
    client.close()
