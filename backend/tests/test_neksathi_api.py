"""Sanity tests for the external NekSathi API used by the mobile app."""
import os
import pytest
import requests

BASE_URL = "https://neksathi-deploy.preview.emergentagent.com"
DEMO_EMAIL = "demo@neksathi.app"
DEMO_PASSWORD = "demo1234"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and "user" in data
    return data["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Auth ----------
def test_auth_me(headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=20)
    assert r.status_code == 200
    u = r.json()
    assert u["email"] == DEMO_EMAIL
    assert "notify_prefs" in u


def test_auth_login_bad_password():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": DEMO_EMAIL, "password": "wrong"}, timeout=20)
    assert r.status_code in (400, 401)


# ---------- Personal safety ----------
def test_sos_flow(headers):
    r = requests.post(f"{BASE_URL}/api/me/sos", headers=headers,
                      json={"latitude": 19.076, "longitude": 72.877, "message": "TEST_sos"}, timeout=20)
    assert r.status_code in (200, 201), r.text
    ev = r.json()
    assert "id" in ev
    # history
    hist = requests.get(f"{BASE_URL}/api/me/sos-events", headers=headers, timeout=20)
    assert hist.status_code == 200
    assert any(e["id"] == ev["id"] for e in hist.json())


def test_emergency_contacts_crud(headers):
    payload = {"name": "TEST_Contact", "phone": "+911234567890", "relation": "friend"}
    c = requests.post(f"{BASE_URL}/api/me/emergency-contacts", headers=headers, json=payload, timeout=20)
    assert c.status_code in (200, 201), c.text
    cid = c.json()["id"]
    lst = requests.get(f"{BASE_URL}/api/me/emergency-contacts", headers=headers, timeout=20)
    assert lst.status_code == 200
    assert any(x["id"] == cid for x in lst.json())
    d = requests.delete(f"{BASE_URL}/api/me/emergency-contacts/{cid}", headers=headers, timeout=20)
    assert d.status_code in (200, 204)


def test_safe_zones_crud(headers):
    payload = {"name": "TEST_Zone", "latitude": 19.076, "longitude": 72.877, "radius_m": 250}
    c = requests.post(f"{BASE_URL}/api/me/safe-zones", headers=headers, json=payload, timeout=20)
    assert c.status_code in (200, 201), c.text
    zid = c.json()["id"]
    lst = requests.get(f"{BASE_URL}/api/me/safe-zones", headers=headers, timeout=20)
    assert lst.status_code == 200
    assert any(x["id"] == zid for x in lst.json())
    d = requests.delete(f"{BASE_URL}/api/me/safe-zones/{zid}", headers=headers, timeout=20)
    assert d.status_code in (200, 204)


def test_live_share(headers):
    r = requests.post(f"{BASE_URL}/api/me/live-share", headers=headers,
                      json={"duration_minutes": 30}, timeout=20)
    assert r.status_code in (200, 201), r.text


# ---------- Family ----------
def test_family_get(headers):
    r = requests.get(f"{BASE_URL}/api/family", headers=headers, timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert "in_family" in body


# ---------- Smart QR ----------
def test_vehicle_create_and_list(headers):
    r = requests.post(f"{BASE_URL}/api/vehicles", headers=headers,
                      json={"number_plate": "TEST-AB1234", "vehicle_type": "car"}, timeout=20)
    assert r.status_code in (200, 201), r.text
    vid = r.json()["id"]
    lst = requests.get(f"{BASE_URL}/api/vehicles", headers=headers, timeout=20)
    assert lst.status_code == 200
    assert any(v["id"] == vid for v in lst.json())


def test_tag_create_and_list(headers):
    r = requests.post(f"{BASE_URL}/api/tags", headers=headers,
                      json={"name": "TEST_Bag", "tag_type": "bag"}, timeout=20)
    assert r.status_code in (200, 201), r.text
    assert "qr_id" in r.json()


def test_card_create_and_list(headers):
    r = requests.post(f"{BASE_URL}/api/cards", headers=headers,
                      json={"display_name": "TEST_Card"}, timeout=20)
    assert r.status_code in (200, 201), r.text
    assert "qr_id" in r.json()


# ---------- Devices (anti-theft) ----------
def test_device_register_and_reports(headers):
    r = requests.post(f"{BASE_URL}/api/devices", headers=headers,
                      json={"name": "TEST_Device", "platform": "android"}, timeout=20)
    assert r.status_code in (200, 201), r.text
    did = r.json()["id"]
    ls = requests.get(f"{BASE_URL}/api/devices/{did}/lock-state", headers=headers, timeout=20)
    assert ls.status_code == 200
    ss = requests.get(f"{BASE_URL}/api/devices/{did}/siren-state", headers=headers, timeout=20)
    assert ss.status_code == 200
    i = requests.post(f"{BASE_URL}/api/devices/{did}/intruder", headers=headers, json={}, timeout=20)
    assert i.status_code in (200, 201, 202), i.text
    s = requests.post(f"{BASE_URL}/api/devices/{did}/sim-swap", headers=headers, json={}, timeout=20)
    assert s.status_code in (200, 201, 202), s.text


# ---------- Alerts / Incidents ----------
def test_alerts_and_incidents(headers):
    a = requests.get(f"{BASE_URL}/api/alerts", headers=headers, timeout=20)
    assert a.status_code == 200
    i = requests.get(f"{BASE_URL}/api/incidents", headers=headers, timeout=20)
    assert i.status_code == 200


# ---------- Profile update ----------
def test_update_me(headers):
    # keep name/phone unchanged, just toggle a pref
    r = requests.put(f"{BASE_URL}/api/auth/me", headers=headers,
                     json={"notify_prefs": {"push": True}}, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json().get("notify_prefs", {}).get("push") is True
