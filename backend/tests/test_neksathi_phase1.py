"""Phase 1 backend tests against the LIVE prod neksathi-deploy backend.
Covers: auth (login/me/register), public scan resolvers, and public
incident/alert/message POSTs used by the in-app scan-report flow.
"""

import os
import time
import uuid

import pytest
import requests

BASE_URL = "https://neksathi-deploy.preview.emergentagent.com"

EXISTING_EMAIL = "e1tester1788162692@gmail.com"
EXISTING_PASSWORD = "Test@1234"

QR_VEHICLE = "c3cb0830-e60d-4a4d-a211-8ceb6089d59e"
QR_TAG = "e17282a6-71f8-4f15-b86f-3712e73aaee8"
QR_CARD = "f8279712-1ae0-4fac-8c59-711230ae02c2"


@pytest.fixture(scope="module")
def s():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def token(s):
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": EXISTING_EMAIL, "password": EXISTING_PASSWORD},
               timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data and "user" in data
    return data["access_token"]


# ---------- Auth ----------
class TestAuth:
    def test_login_existing(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": EXISTING_EMAIL, "password": EXISTING_PASSWORD},
                   timeout=20)
        assert r.status_code == 200
        assert r.json()["user"]["email"] == EXISTING_EMAIL

    def test_me_unauth(self, s):
        r = s.get(f"{BASE_URL}/api/auth/me", timeout=20)
        assert r.status_code == 401

    def test_me_authed(self, s, token):
        r = s.get(f"{BASE_URL}/api/auth/me",
                  headers={"Authorization": f"Bearer {token}"}, timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert j["email"] == EXISTING_EMAIL
        assert "id" in j

    def test_register_new_gmail(self, s):
        # gmail.com is accepted; .test is not
        uniq = uuid.uuid4().hex[:10]
        email = f"e1auto{uniq}@gmail.com"
        phone = f"+9199{int(time.time()) % 100000000:08d}"
        r = s.post(f"{BASE_URL}/api/auth/register",
                   json={"name": "AutoTest", "email": email,
                         "phone": phone, "password": "Test@1234"},
                   timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["user"]["email"] == email
        assert "access_token" in j

    def test_register_rejects_test_domain(self, s):
        uniq = uuid.uuid4().hex[:8]
        r = s.post(f"{BASE_URL}/api/auth/register",
                   json={"name": "Bad", "email": f"nope{uniq}@example.test",
                         "phone": f"+9198{int(time.time()) % 100000000:08d}",
                         "password": "Test@1234"},
                   timeout=20)
        assert r.status_code >= 400


# ---------- Public resolvers ----------
class TestResolvers:
    def test_resolve_vehicle(self, s):
        r = s.get(f"{BASE_URL}/api/public/qr/{QR_VEHICLE}", timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("number_plate") == "MH01ZZ9999"
        assert (j.get("make_model") or "").lower().startswith("honda")
        assert j.get("owner_first_name") == "E1"

    def test_resolve_tag(self, s):
        r = s.get(f"{BASE_URL}/api/public/tag/{QR_TAG}", timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("name") == "Kids Bag"

    def test_resolve_card(self, s):
        r = s.get(f"{BASE_URL}/api/public/card/{QR_CARD}", timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("display_name") == "Ravi Kumar"
        assert j.get("title") == "Engineer"
        assert (j.get("phone") or "").endswith("9812345678")

    def test_resolve_unknown_returns_404(self, s):
        r = s.get(f"{BASE_URL}/api/public/qr/deadbeef-0000-0000-0000-000000000000",
                  timeout=20)
        assert r.status_code == 404


# ---------- Public incident / alert / message ----------
class TestPublicActions:
    def test_vehicle_incident(self, s):
        r = s.post(f"{BASE_URL}/api/public/qr/{QR_VEHICLE}/incident",
                   json={"type": "wrong_parking",
                         "note": "TEST_phase1_vehicle",
                         "scanner_lat": 19.07, "scanner_lng": 72.87},
                   timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        # portal_number is used by 'Call owner' tel: link
        assert "portal_number" in j or j.get("call_available") in (True, False)
        assert j.get("minutes_left") is None or isinstance(j["minutes_left"], int)

    def test_tag_alert(self, s):
        r = s.post(f"{BASE_URL}/api/public/tag/{QR_TAG}/alert",
                   json={"type": "found",
                         "note": "TEST_phase1_tag",
                         "scanner_lat": 19.07, "scanner_lng": 72.87},
                   timeout=20)
        assert r.status_code in (200, 201), r.text

    def test_card_message(self, s):
        r = s.post(f"{BASE_URL}/api/public/card/{QR_CARD}/message",
                   json={"name": "Auto Tester",
                         "phone": "+919000000099",
                         "message": "TEST_phase1_card_message"},
                   timeout=20)
        assert r.status_code in (200, 201), r.text
