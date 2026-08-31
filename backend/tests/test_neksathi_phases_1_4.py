"""
End-to-end pytest suite for NekSathi Phases 1-4 against the LIVE prod backend.

Backend base: EXPO_PUBLIC_API_URL from /app/frontend/.env
Login: demo@neksathi.app / demo1234
"""
import os
import time
import uuid
import pytest
import requests
from pathlib import Path


def _read_env(key: str) -> str:
    fp = Path("/app/frontend/.env")
    for line in fp.read_text().splitlines():
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError(f"{key} missing")


BASE = _read_env("EXPO_PUBLIC_API_URL").rstrip("/")
API = f"{BASE}/api"

DEMO_EMAIL = "demo@neksathi.app"
DEMO_PASS = "demo1234"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def token() -> str:
    r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASS}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def me(token) -> dict:
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def s(token):
    ss = requests.Session()
    ss.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return ss


# ---------- Phase 1: Auth ----------
class TestAuth:
    def test_login_returns_token_and_user(self, token, me):
        assert token and me["email"] == DEMO_EMAIL
        assert me["name"]  # Demo User

    def test_bad_password_rejected(self):
        r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": "wrong"}, timeout=15)
        assert r.status_code in (400, 401)


# ---------- Phase 2: SOS ----------
class TestSOS:
    def test_trigger_ack_and_location(self, s):
        # trigger
        r = s.post(f"{API}/me/sos", json={"latitude": 19.076, "longitude": 72.877, "message": "TEST_pytest"}, timeout=15)
        assert r.status_code in (200, 201), r.text
        ev = r.json()
        assert "id" in ev
        sid = ev["id"]

        # ping location while active — should return {ok, transitions?}
        rp = s.post(f"{API}/me/location", json={"latitude": 19.076, "longitude": 72.877}, timeout=15)
        assert rp.status_code == 200, rp.text
        body = rp.json()
        assert body.get("ok") is True

        # ack
        ra = s.post(f"{API}/me/sos-events/{sid}/ack", json={}, timeout=15)
        assert ra.status_code == 200, ra.text
        assert ra.json().get("acknowledged") is True

    def test_list_sos_events(self, s):
        r = s.get(f"{API}/me/sos-events", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- Phase 3: Family ----------
class TestFamily:
    def test_get_family_demo(self, s):
        r = s.get(f"{API}/family", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("in_family") is True
        assert data.get("name")  # "My Family"
        assert "members" in data and len(data["members"]) >= 1
        assert data.get("invite_code")

    def test_family_active_sos_shape(self, s):
        r = s.get(f"{API}/family/active-sos", timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "items" in j and isinstance(j["items"], list)
        # If any item present, verify keys
        for it in j["items"]:
            for k in ("id", "member_name", "latitude", "longitude", "created_at"):
                assert k in it, f"missing key {k} in family active-sos item"


# ---------- Phase 4: Smart QR ----------
class TestSmartQR:
    def test_list_vehicles(self, s):
        r = s.get(f"{API}/vehicles", timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 1
        v = arr[0]
        for k in ("id", "qr_id", "number_plate", "vehicle_type"):
            assert k in v

    def test_list_tags(self, s):
        r = s.get(f"{API}/tags", timeout=15)
        assert r.status_code == 200 and isinstance(r.json(), list)

    def test_list_cards(self, s):
        r = s.get(f"{API}/cards", timeout=15)
        assert r.status_code == 200 and isinstance(r.json(), list)

    def test_add_and_toggle_vehicle_lost(self, s):
        plate = f"TS{uuid.uuid4().hex[:6].upper()}"
        r = s.post(f"{API}/vehicles", json={"number_plate": plate, "vehicle_type": "car", "make_model": "TEST Car"}, timeout=15)
        assert r.status_code in (200, 201), r.text
        veh = r.json()
        vid = veh["id"]

        # correct body: {enabled}
        r_on = s.post(f"{API}/vehicles/{vid}/lost_mode", json={"enabled": True}, timeout=15)
        assert r_on.status_code == 200, r_on.text
        assert r_on.json().get("lost_mode") is True

        # wrong body {lost_mode} must be 422
        r_bad = s.post(f"{API}/vehicles/{vid}/lost_mode", json={"lost_mode": True}, timeout=15)
        assert r_bad.status_code == 422, f"expected 422 got {r_bad.status_code}: {r_bad.text}"

        r_off = s.post(f"{API}/vehicles/{vid}/lost_mode", json={"enabled": False}, timeout=15)
        assert r_off.status_code == 200

    def test_tag_lost_mode_contract(self, s):
        tags = s.get(f"{API}/tags", timeout=15).json()
        if not tags:
            pytest.skip("no tags")
        tid = tags[0]["id"]
        r_bad = s.post(f"{API}/tags/{tid}/lost_mode", json={"lost_mode": True}, timeout=15)
        assert r_bad.status_code == 422
        r_ok = s.post(f"{API}/tags/{tid}/lost_mode", json={"enabled": tags[0].get("lost_mode", False)}, timeout=15)
        assert r_ok.status_code == 200


# ---------- Phase 1 scan flow (public) ----------
class TestPublicScan:
    def test_vehicle_public_and_incident(self, s):
        veh_list = s.get(f"{API}/vehicles", timeout=15).json()
        qr = veh_list[0]["qr_id"]
        # public resolve (no auth)
        r = requests.get(f"{API}/public/qr/{qr}", timeout=15)
        assert r.status_code == 200, r.text
        # send incident
        ri = requests.post(f"{API}/public/qr/{qr}/incident",
                           json={"type": "wrong_parking", "note": "TEST_pytest", "scanner_lat": None, "scanner_lng": None},
                           timeout=15)
        assert ri.status_code == 200, ri.text
        j = ri.json()
        assert "id" in j
        # minutes_left approximately 15
        if "minutes_left" in j:
            assert 0 < int(j["minutes_left"]) <= 20

    def test_tag_public_and_alert(self, s):
        tags = s.get(f"{API}/tags", timeout=15).json()
        if not tags:
            pytest.skip("no tags")
        qr = tags[0]["qr_id"]
        r = requests.get(f"{API}/public/tag/{qr}", timeout=15)
        assert r.status_code == 200, r.text
        ra = requests.post(f"{API}/public/tag/{qr}/alert",
                           json={"type": "found", "note": "TEST_pytest", "scanner_lat": None, "scanner_lng": None},
                           timeout=15)
        assert ra.status_code == 200, ra.text

    def test_card_public_and_message(self, s):
        cards = s.get(f"{API}/cards", timeout=15).json()
        if not cards:
            pytest.skip("no cards")
        qr = cards[0]["qr_id"]
        r = requests.get(f"{API}/public/card/{qr}", timeout=15)
        assert r.status_code == 200, r.text
        # correct payload {from_name, phone, body}
        rm = requests.post(f"{API}/public/card/{qr}/message",
                           json={"from_name": "TEST_pytest", "phone": "+919000009999", "body": "hello from pytest"},
                           timeout=15)
        assert rm.status_code == 200, rm.text

    def test_card_wrong_payload_422(self, s):
        cards = s.get(f"{API}/cards", timeout=15).json()
        if not cards:
            pytest.skip("no cards")
        qr = cards[0]["qr_id"]
        rm = requests.post(f"{API}/public/card/{qr}/message",
                           json={"name": "x", "phone": "+91", "message": "y"},
                           timeout=15)
        assert rm.status_code == 422
