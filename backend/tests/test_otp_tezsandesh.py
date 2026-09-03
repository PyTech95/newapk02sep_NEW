"""Backend tests for the TezSandesh WhatsApp OTP integration.

The external TezSandesh API is fully mocked with respx — no real WhatsApp
messages are ever sent. Tests exercise the real FastAPI endpoints
(/api/auth/otp/request, /verify, /resend) through an in-process ASGI client so
that rate-limiting, challenge storage and session issuance are all covered.
"""
import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import jwt
import pytest
import respx
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

import server
from services.tezsandesh_otp import provider

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
SEND_URL = "https://tezsandesh.com/api/v1/otp/send"
VERIFY_URL = "https://tezsandesh.com/api/v1/otp/verify"
RESEND_URL = "https://tezsandesh.com/api/v1/otp/resend"


def _uphone():
    # Unique valid Indian mobile per test -> isolated rate-limit buckets.
    return "+9198" + f"{uuid.uuid4().int % 100000000:08d}"


def _hdr():
    return {"X-Forwarded-For": f"10.{uuid.uuid4().int % 255}.{uuid.uuid4().int % 255}.{1 + uuid.uuid4().int % 254}"}


def asgi():
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="http://testserver")


def run(coro_factory):
    """Run an async test body in a fresh loop with an in-loop Mongo client."""
    async def wrapper():
        client = AsyncIOMotorClient(MONGO_URL)
        server.db = client[DB_NAME]
        provider._client = None
        try:
            return await coro_factory(client[DB_NAME])
        finally:
            provider._client = None
            client.close()
    return asyncio.run(wrapper())


# 1. send OTP success
@respx.mock(assert_all_mocked=False, assert_all_called=False)
def test_send_success(respx_mock):
    route = respx_mock.post(SEND_URL).mock(return_value=httpx.Response(200, json={"request_id": "otp_ok_1"}))

    async def body(db):
        phone = _uphone()
        async with asgi() as ac:
            r = await ac.post("/api/auth/otp/request", json={"phone": phone}, headers=_hdr())
        assert r.status_code == 200, r.text
        assert r.json()["channel"] == "whatsapp"
        assert route.called
        assert route.calls.last.request.headers.get("Idempotency-Key")
        doc = await db.otps.find_one({"phone": phone})
        assert doc and doc["request_id"] == "otp_ok_1" and "code" not in doc
    run(body)


# 2. send provider failure (5xx)
@respx.mock(assert_all_mocked=False, assert_all_called=False)
def test_send_provider_failure(respx_mock):
    respx_mock.post(SEND_URL).mock(return_value=httpx.Response(500, json={"detail": "boom"}))

    async def body(db):
        async with asgi() as ac:
            r = await ac.post("/api/auth/otp/request", json={"phone": _uphone()}, headers=_hdr())
        assert r.status_code == 503
        assert "Unable to send" in r.json()["detail"]
    run(body)


# 3. invalid number
@respx.mock(assert_all_mocked=False, assert_all_called=False)
def test_send_invalid_number(respx_mock):
    respx_mock.post(SEND_URL).mock(return_value=httpx.Response(200, json={"request_id": "x"}))

    async def body(db):
        async with asgi() as ac:
            r = await ac.post("/api/auth/otp/request", json={"phone": "12345"}, headers=_hdr())
        assert r.status_code == 400
    run(body)


# 4. verify success + session creation
@respx.mock(assert_all_mocked=False, assert_all_called=False)
def test_verify_success_creates_session(respx_mock):
    respx_mock.post(SEND_URL).mock(return_value=httpx.Response(200, json={"request_id": "otp_v1"}))
    respx_mock.post(VERIFY_URL).mock(return_value=httpx.Response(200, json={"verified": True}))

    async def body(db):
        phone = _uphone()
        async with asgi() as ac:
            await ac.post("/api/auth/otp/request", json={"phone": phone}, headers=_hdr())
            r = await ac.post("/api/auth/otp/verify",
                              json={"phone": phone, "code": "123456", "name": "Test User"}, headers=_hdr())
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data and data["user"]["phone"] == phone
        claims = jwt.decode(data["access_token"], server.JWT_SECRET, algorithms=[server.JWT_ALGO])
        assert claims["sub"]
        doc = await db.otps.find_one({"phone": phone})
        assert doc["consumed"] is True and doc["status"] == "verified"
    run(body)


# 5. incorrect OTP
@respx.mock(assert_all_mocked=False, assert_all_called=False)
def test_verify_incorrect(respx_mock):
    respx_mock.post(SEND_URL).mock(return_value=httpx.Response(200, json={"request_id": "otp_bad"}))
    respx_mock.post(VERIFY_URL).mock(return_value=httpx.Response(400, json={"detail": {"code": "INVALID_OTP"}}))

    async def body(db):
        phone = _uphone()
        async with asgi() as ac:
            await ac.post("/api/auth/otp/request", json={"phone": phone}, headers=_hdr())
            r = await ac.post("/api/auth/otp/verify", json={"phone": phone, "code": "000000"}, headers=_hdr())
        assert r.status_code == 401
        assert "Invalid verification code" in r.json()["detail"]
    run(body)


# 6. expired OTP (no live challenge)
@respx.mock(assert_all_mocked=False, assert_all_called=False)
def test_verify_expired(respx_mock):
    respx_mock.post(VERIFY_URL).mock(return_value=httpx.Response(200, json={"verified": True}))

    async def body(db):
        phone = _uphone()
        await db.otps.insert_one({
            "phone": phone, "request_id": "otp_exp", "purpose": "login", "reference_id": "r",
            "status": "sent", "created_at": datetime.now(timezone.utc) - timedelta(minutes=10),
            "expires_at": datetime.now(timezone.utc) - timedelta(minutes=5),
            "attempts": 0, "resend_count": 0, "last_sent_at": datetime.now(timezone.utc), "consumed": False,
        })
        async with asgi() as ac:
            r = await ac.post("/api/auth/otp/verify", json={"phone": phone, "code": "123456"}, headers=_hdr())
        assert r.status_code == 401
        assert "expired" in r.json()["detail"].lower()
    run(body)


# 7. resend success
@respx.mock(assert_all_mocked=False, assert_all_called=False)
def test_resend_success(respx_mock):
    route = respx_mock.post(RESEND_URL).mock(return_value=httpx.Response(200, json={"ok": True}))

    async def body(db):
        phone = _uphone()
        await db.otps.insert_one({
            "phone": phone, "request_id": "otp_rs", "purpose": "login", "reference_id": "r",
            "status": "sent", "created_at": datetime.now(timezone.utc) - timedelta(seconds=120),
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=4),
            "attempts": 0, "resend_count": 0,
            "last_sent_at": datetime.now(timezone.utc) - timedelta(seconds=120), "consumed": False,
        })
        async with asgi() as ac:
            r = await ac.post("/api/auth/otp/resend", json={"phone": phone}, headers=_hdr())
        assert r.status_code == 200, r.text
        assert route.called
        doc = await db.otps.find_one({"phone": phone})
        assert doc["resend_count"] == 1
    run(body)


# 8. resend rate limit (cooldown)
@respx.mock(assert_all_mocked=False, assert_all_called=False)
def test_resend_cooldown_blocked(respx_mock):
    respx_mock.post(RESEND_URL).mock(return_value=httpx.Response(200, json={"ok": True}))

    async def body(db):
        phone = _uphone()
        await db.otps.insert_one({
            "phone": phone, "request_id": "otp_cd", "purpose": "login", "reference_id": "r",
            "status": "sent", "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=4),
            "attempts": 0, "resend_count": 0,
            "last_sent_at": datetime.now(timezone.utc), "consumed": False,
        })
        async with asgi() as ac:
            r = await ac.post("/api/auth/otp/resend", json={"phone": phone}, headers=_hdr())
        assert r.status_code == 429
    run(body)


# 9. invalid request_id on verify (provider 404) -> invalid code to user
@respx.mock(assert_all_mocked=False, assert_all_called=False)
def test_verify_provider_404(respx_mock):
    respx_mock.post(VERIFY_URL).mock(return_value=httpx.Response(404, json={"detail": {"code": "NOT_FOUND"}}))

    async def body(db):
        phone = _uphone()
        await db.otps.insert_one({
            "phone": phone, "request_id": "otp_404", "purpose": "login", "reference_id": "r",
            "status": "sent", "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=4),
            "attempts": 0, "resend_count": 0, "last_sent_at": datetime.now(timezone.utc), "consumed": False,
        })
        async with asgi() as ac:
            r = await ac.post("/api/auth/otp/verify", json={"phone": phone, "code": "111111"}, headers=_hdr())
        assert r.status_code == 401
    run(body)


# 10. provider timeout on send
@respx.mock(assert_all_mocked=False, assert_all_called=False)
def test_send_timeout(respx_mock):
    respx_mock.post(SEND_URL).mock(side_effect=httpx.ConnectTimeout("timeout"))

    async def body(db):
        async with asgi() as ac:
            r = await ac.post("/api/auth/otp/request", json={"phone": _uphone()}, headers=_hdr())
        assert r.status_code == 503
    run(body)


# 11. duplicate send supersedes the previous live challenge
@respx.mock(assert_all_mocked=False, assert_all_called=False)
def test_duplicate_send_supersedes(respx_mock):
    respx_mock.post(SEND_URL).mock(side_effect=[
        httpx.Response(200, json={"request_id": "otp_first"}),
        httpx.Response(200, json={"request_id": "otp_second"}),
    ])

    async def body(db):
        phone = _uphone()
        async with asgi() as ac:
            await ac.post("/api/auth/otp/request", json={"phone": phone}, headers=_hdr())
            await db.otps.update_many(
                {"phone": phone},
                {"$set": {"created_at": datetime.now(timezone.utc) - timedelta(seconds=120)}},
            )
            r2 = await ac.post("/api/auth/otp/request", json={"phone": phone}, headers=_hdr())
        assert r2.status_code == 200, r2.text
        live = await db.otps.find({"phone": phone, "consumed": False}).to_list(10)
        assert len(live) == 1 and live[0]["request_id"] == "otp_second"
    run(body)


# 12. phone normalization
def test_phone_normalization():
    from services.phone import InvalidPhone, normalize_phone
    assert normalize_phone("9876543210") == "+919876543210"
    assert normalize_phone("919876543210") == "+919876543210"
    assert normalize_phone("+91 98765 43210") == "+919876543210"
    with pytest.raises(InvalidPhone):
        normalize_phone("12345")
    with pytest.raises(InvalidPhone):
        normalize_phone("")
