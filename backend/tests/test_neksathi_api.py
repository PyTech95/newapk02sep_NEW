"""End-to-end regression tests for the in-workspace NekSathi FastAPI backend."""
import os
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_API_URL")
            or os.environ.get("EXPO_BACKEND_URL")
            or "https://mobile-safety-app-2.preview.emergentagent.com").rstrip("/")
DEMO_EMAIL = "demo@neksathi.app"
DEMO_PASSWORD = "demo1234"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and "user" in data
    assert data["user"]["email"] == DEMO_EMAIL
    return data["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Auth ----------
def test_root_ok():
    r = requests.get(f"{BASE_URL}/api/", timeout=15)
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_auth_me(headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=20)
    assert r.status_code == 200
    u = r.json()
    assert u["email"] == DEMO_EMAIL
    assert "notify_prefs" in u


def test_auth_login_bad_password():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": DEMO_EMAIL, "password": "wrong"}, timeout=20)
    assert r.status_code == 401


def test_auth_me_requires_token():
    r = requests.get(f"{BASE_URL}/api/auth/me", timeout=15)
    assert r.status_code == 401


def test_register_new_user():
    unique = uuid.uuid4().hex[:10]
    email = f"TEST_{unique}@neksathi.test.example.com"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={
        "name": "TEST User", "email": email,
        "phone": f"+9199{unique[:8]}", "password": "test1234",
    }, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "access_token" in body and body["user"]["email"] == email.lower()
    # duplicate should 409
    dup = requests.post(f"{BASE_URL}/api/auth/register", json={
        "name": "TEST User", "email": email,
        "phone": f"+9199{unique[:8]}", "password": "test1234",
    }, timeout=20)
    assert dup.status_code == 409


def test_otp_request_and_verify():
    phone = f"+919{uuid.uuid4().int % 1000000000:09d}"
    r = requests.post(f"{BASE_URL}/api/auth/otp/request", json={"phone": phone}, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    dev_code = body.get("dev_code")
    assert dev_code and len(dev_code) == 6
    v = requests.post(f"{BASE_URL}/api/auth/otp/verify",
                      json={"phone": phone, "code": dev_code, "name": "TEST_OTP"}, timeout=20)
    assert v.status_code == 200, v.text
    assert "access_token" in v.json()
    # wrong code fails
    bad = requests.post(f"{BASE_URL}/api/auth/otp/verify",
                        json={"phone": phone, "code": "000000"}, timeout=20)
    assert bad.status_code == 400


# ---------- Profile ----------
def test_update_me(headers):
    r = requests.put(f"{BASE_URL}/api/auth/me", headers=headers,
                     json={"notify_prefs": {"push": True, "marketing": False}}, timeout=20)
    assert r.status_code == 200, r.text
    prefs = r.json().get("notify_prefs", {})
    assert prefs.get("push") is True
    assert prefs.get("marketing") is False


# ---------- Personal safety ----------
def test_sos_flow(headers):
    r = requests.post(f"{BASE_URL}/api/me/sos", headers=headers,
                      json={"latitude": 19.076, "longitude": 72.877, "message": "TEST_sos"}, timeout=20)
    assert r.status_code == 200, r.text
    ev = r.json()
    assert "id" in ev and ev["message"] == "TEST_sos"
    hist = requests.get(f"{BASE_URL}/api/me/sos-events", headers=headers, timeout=20)
    assert hist.status_code == 200
    assert any(e["id"] == ev["id"] for e in hist.json())


def test_emergency_contacts_crud(headers):
    payload = {"name": "TEST_Contact", "phone": "+911234567890", "relation": "friend"}
    c = requests.post(f"{BASE_URL}/api/me/emergency-contacts", headers=headers, json=payload, timeout=20)
    assert c.status_code == 200, c.text
    cid = c.json()["id"]
    lst = requests.get(f"{BASE_URL}/api/me/emergency-contacts", headers=headers, timeout=20)
    assert lst.status_code == 200
    assert any(x["id"] == cid for x in lst.json())
    d = requests.delete(f"{BASE_URL}/api/me/emergency-contacts/{cid}", headers=headers, timeout=20)
    assert d.status_code == 200
    # verify gone
    lst2 = requests.get(f"{BASE_URL}/api/me/emergency-contacts", headers=headers, timeout=20)
    assert not any(x["id"] == cid for x in lst2.json())


def test_safe_zones_crud(headers):
    payload = {"name": "TEST_Zone", "latitude": 19.076, "longitude": 72.877, "radius_m": 250}
    c = requests.post(f"{BASE_URL}/api/me/safe-zones", headers=headers, json=payload, timeout=20)
    assert c.status_code == 200, c.text
    zid = c.json()["id"]
    lst = requests.get(f"{BASE_URL}/api/me/safe-zones", headers=headers, timeout=20)
    assert lst.status_code == 200 and any(x["id"] == zid for x in lst.json())
    d = requests.delete(f"{BASE_URL}/api/me/safe-zones/{zid}", headers=headers, timeout=20)
    assert d.status_code == 200


def test_live_share_and_location(headers):
    r = requests.post(f"{BASE_URL}/api/me/live-share", headers=headers,
                      json={"duration_minutes": 30}, timeout=20)
    assert r.status_code == 200 and r.json().get("active") is True
    loc = requests.post(f"{BASE_URL}/api/me/location", headers=headers,
                        json={"latitude": 19.1, "longitude": 72.9, "battery": 78}, timeout=20)
    assert loc.status_code == 200 and loc.json().get("ok") is True


# ---------- Family (isolate on a fresh user so we don't corrupt demo) ----------
@pytest.fixture(scope="module")
def fresh_user():
    unique = uuid.uuid4().hex[:10]
    email = f"TEST_fam_{unique}@neksathi.test.example.com"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={
        "name": "TEST Family Owner", "email": email,
        "phone": f"+9188{unique[:8]}", "password": "test1234",
    }, timeout=20)
    assert r.status_code == 200
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def test_family_create_and_join(fresh_user):
    g = requests.get(f"{BASE_URL}/api/family", headers=fresh_user, timeout=20)
    assert g.status_code == 200 and g.json().get("in_family") is False
    c = requests.post(f"{BASE_URL}/api/family", headers=fresh_user,
                      json={"name": "TEST_Family"}, timeout=20)
    assert c.status_code == 200, c.text
    fam = c.json()
    assert fam["in_family"] is True and "invite_code" in fam
    # second user joins
    unique = uuid.uuid4().hex[:10]
    reg = requests.post(f"{BASE_URL}/api/auth/register", json={
        "name": "TEST Joiner", "email": f"TEST_join_{unique}@neksathi.test.example.com",
        "phone": f"+9177{unique[:8]}", "password": "test1234",
    }, timeout=20)
    assert reg.status_code == 200
    joiner_headers = {"Authorization": f"Bearer {reg.json()['access_token']}",
                      "Content-Type": "application/json"}
    j = requests.post(f"{BASE_URL}/api/family/join", headers=joiner_headers,
                      json={"invite_code": fam["invite_code"]}, timeout=20)
    assert j.status_code == 200 and j.json().get("ok") is True
    # bad code
    bad = requests.post(f"{BASE_URL}/api/family/join", headers=joiner_headers,
                       json={"invite_code": "ZZZZZZ"}, timeout=20)
    assert bad.status_code == 404


# ---------- Smart QR ----------
@pytest.fixture(scope="module")
def vehicle(headers):
    r = requests.post(f"{BASE_URL}/api/vehicles", headers=headers,
                      json={"number_plate": f"TEST-{uuid.uuid4().hex[:6].upper()}",
                            "vehicle_type": "car"}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def test_vehicle_update_and_lost(headers, vehicle):
    vid = vehicle["id"]
    upd = requests.put(f"{BASE_URL}/api/vehicles/{vid}", headers=headers, json={
        "number_plate": vehicle["number_plate"], "vehicle_type": "bike",
        "make_model": "TEST_Model", "color": "red",
    }, timeout=20)
    assert upd.status_code == 200, upd.text
    assert upd.json()["vehicle_type"] == "bike" and upd.json()["color"] == "red"
    lost = requests.post(f"{BASE_URL}/api/vehicles/{vid}/lost_mode", headers=headers,
                        json={"enabled": True}, timeout=20)
    assert lost.status_code == 200 and lost.json()["lost_mode"] is True


@pytest.fixture(scope="module")
def tag(headers):
    r = requests.post(f"{BASE_URL}/api/tags", headers=headers,
                     json={"name": "TEST_Bag", "tag_type": "bag"}, timeout=20)
    assert r.status_code == 200
    return r.json()


def test_tag_update_and_lost(headers, tag):
    tid = tag["id"]
    upd = requests.put(f"{BASE_URL}/api/tags/{tid}", headers=headers, json={
        "name": "TEST_Bag_Updated", "tag_type": "bag",
        "reward_text": "TEST_reward_500", "description": "TEST desc",
    }, timeout=20)
    assert upd.status_code == 200 and upd.json()["reward_text"] == "TEST_reward_500"
    lost = requests.post(f"{BASE_URL}/api/tags/{tid}/lost_mode", headers=headers,
                       json={"enabled": True}, timeout=20)
    assert lost.status_code == 200 and lost.json()["lost_mode"] is True


@pytest.fixture(scope="module")
def card(headers):
    r = requests.post(f"{BASE_URL}/api/cards", headers=headers,
                     json={"display_name": "TEST_Card", "title": "Engineer",
                           "phone": "+911111111111"}, timeout=20)
    assert r.status_code == 200
    return r.json()


def test_lists_include_created(headers, vehicle, tag, card):
    v = requests.get(f"{BASE_URL}/api/vehicles", headers=headers, timeout=20).json()
    assert any(x["id"] == vehicle["id"] for x in v)
    t = requests.get(f"{BASE_URL}/api/tags", headers=headers, timeout=20).json()
    assert any(x["id"] == tag["id"] for x in t)
    c = requests.get(f"{BASE_URL}/api/cards", headers=headers, timeout=20).json()
    assert any(x["id"] == card["id"] for x in c)


# ---------- Public scan / report ----------
def test_public_qr_vehicle(vehicle):
    r = requests.get(f"{BASE_URL}/api/public/qr/{vehicle['qr_id']}", timeout=20)
    assert r.status_code == 200, r.text
    assert r.json()["kind"] == "vehicle"
    assert r.json()["number_plate"] == vehicle["number_plate"]


def test_public_qr_tag(tag):
    r = requests.get(f"{BASE_URL}/api/public/qr/{tag['qr_id']}", timeout=20)
    assert r.status_code == 200
    assert r.json()["kind"] == "tag_guardian"


def test_public_card(card):
    r = requests.get(f"{BASE_URL}/api/public/card/{card['qr_id']}", timeout=20)
    assert r.status_code == 200
    assert r.json()["kind"] == "card"


def test_public_qr_not_found():
    r = requests.get(f"{BASE_URL}/api/public/qr/deadbeef0000", timeout=15)
    assert r.status_code == 404


def test_public_incident_and_alert_flow(headers, vehicle, tag, card):
    # public incident on vehicle QR
    inc = requests.post(f"{BASE_URL}/api/public/qr/{vehicle['qr_id']}/incident",
                        json={"type": "accident", "scanner_note": "TEST_incident",
                              "scanner_phone": "+919999999999",
                              "scanner_lat": 19.1, "scanner_lng": 72.9}, timeout=20)
    assert inc.status_code == 200
    # public tag alert
    ta = requests.post(f"{BASE_URL}/api/public/tag/{tag['qr_id']}/alert",
                      json={"type": "found", "scanner_note": "TEST_tag_found",
                            "scanner_phone": "+919999999998"}, timeout=20)
    assert ta.status_code == 200
    # public card message
    cm = requests.post(f"{BASE_URL}/api/public/card/{card['qr_id']}/message",
                      json={"name": "Scanner", "phone": "+919999999997",
                            "message": "TEST_hi"}, timeout=20)
    assert cm.status_code == 200
    # reflect in owner's alerts + incidents
    alerts = requests.get(f"{BASE_URL}/api/alerts", headers=headers, timeout=20).json()
    assert any("TEST_tag_found" in (a.get("message") or "") for a in alerts)
    assert any("TEST_hi" in (a.get("message") or "") for a in alerts)
    incs = requests.get(f"{BASE_URL}/api/incidents", headers=headers, timeout=20).json()
    assert incs.get("count", 0) >= 1
    assert any(i.get("scanner_note") == "TEST_incident" for i in incs.get("results", []))


# ---------- Devices (anti-theft) ----------
def test_device_register_and_reports(headers):
    r = requests.post(f"{BASE_URL}/api/devices", headers=headers,
                      json={"name": "TEST_Device", "platform": "android"}, timeout=20)
    assert r.status_code == 200, r.text
    did = r.json()["id"]
    ls = requests.get(f"{BASE_URL}/api/devices/{did}/lock-state", headers=headers, timeout=20)
    assert ls.status_code == 200 and "locked" in ls.json()
    ss = requests.get(f"{BASE_URL}/api/devices/{did}/siren-state", headers=headers, timeout=20)
    assert ss.status_code == 200 and "siren_active" in ss.json()
    assert requests.post(f"{BASE_URL}/api/devices/{did}/intruder",
                         headers=headers, json={}, timeout=20).status_code == 200
    assert requests.post(f"{BASE_URL}/api/devices/{did}/sim-swap",
                         headers=headers, json={}, timeout=20).status_code == 200
    # 404 for bogus device
    bogus = requests.get(f"{BASE_URL}/api/devices/does-not-exist/lock-state",
                        headers=headers, timeout=20)
    assert bogus.status_code == 404



# ---------- Scan finder landing page (primary bug fix) ----------
import re
import json as _json


def _extract_scan_data(html: str):
    """Extract the DATA constant embedded by /api/s/{qrid}."""
    m = re.search(r"const\s+DATA\s*=\s*(.+?);\s*\n", html)
    assert m, "DATA constant not found in scan page"
    return _json.loads(m.group(1))


def test_scan_page_vehicle(vehicle):
    r = requests.get(f"{BASE_URL}/api/s/{vehicle['qr_id']}", timeout=20)
    assert r.status_code == 200, r.text
    assert "text/html" in r.headers.get("content-type", "").lower()
    assert "NekSathi" in r.text and "Loading" in r.text
    data = _extract_scan_data(r.text)
    assert data is not None
    assert data["kind"] == "vehicle"
    assert data["number_plate"] == vehicle["number_plate"]
    assert data["qr_id"] == vehicle["qr_id"]


def test_scan_page_tag(tag):
    r = requests.get(f"{BASE_URL}/api/s/{tag['qr_id']}", timeout=20)
    assert r.status_code == 200
    assert "text/html" in r.headers.get("content-type", "").lower()
    data = _extract_scan_data(r.text)
    assert data["kind"] == "tag_guardian"
    # tag may have been renamed by test_tag_update_and_lost; just assert non-empty
    assert data.get("name")
    assert data.get("tag_type") == tag["tag_type"]
    # reward_text and lost_mode keys must be present (may be null/false)
    assert "reward_text" in data and "lost_mode" in data


def test_scan_page_card(card):
    r = requests.get(f"{BASE_URL}/api/s/{card['qr_id']}", timeout=20)
    assert r.status_code == 200
    assert "text/html" in r.headers.get("content-type", "").lower()
    data = _extract_scan_data(r.text)
    assert data["kind"] == "card"
    assert data["display_name"] == card["display_name"]


def test_scan_page_unknown_qrid_returns_html_not_json_404():
    """Bug fix: unknown QR must render friendly HTML page, NOT raw 404."""
    r = requests.get(f"{BASE_URL}/api/s/garbage-does-not-exist-xyz", timeout=20)
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:200]}"
    assert "text/html" in r.headers.get("content-type", "").lower()
    assert "NekSathi" in r.text
    # DATA must be null so client-side renders the "not registered" message
    data = _extract_scan_data(r.text)
    assert data is None


def test_scan_page_seeded_demo_vehicle():
    """Seed vehicle (MH01AB1234) must resolve via /api/s/{qr_id}."""
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=15)
    assert r.status_code == 200
    tok = r.json()["access_token"]
    vh = requests.get(f"{BASE_URL}/api/vehicles",
                      headers={"Authorization": f"Bearer {tok}"}, timeout=15).json()
    seeded = next((v for v in vh if v["number_plate"] == "MH01AB1234"), None)
    assert seeded, "seeded demo vehicle missing"
    r2 = requests.get(f"{BASE_URL}/api/s/{seeded['qr_id']}", timeout=20)
    assert r2.status_code == 200
    data = _extract_scan_data(r2.text)
    assert data["kind"] == "vehicle" and data["number_plate"] == "MH01AB1234"
