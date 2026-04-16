"""
Tests for calendar sync fix: Home THIS WEEK + Calendar events isCompleted
mirrors Schedule page logic using db.log entries.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")

# Test user with known log data
EMAIL = "user_a@theprogram.app"
PASSWORD = "StrongmanA123"


@pytest.fixture(scope="module")
def auth_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if resp.status_code != 200:
        pytest.skip(f"Login failed: {resp.status_code} {resp.text}")
    return resp.json().get("token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


# Test 4: Backend starts cleanly — /api/calendar/events returns 200
def test_calendar_events_200(auth_headers):
    resp = requests.get(
        f"{BASE_URL}/api/calendar/events",
        params={"start_date": "2026-04-13", "end_date": "2026-04-19"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:300]}"
    data = resp.json()
    assert "events" in data, "Response missing 'events' key"
    print(f"PASS: calendar/events returned 200 with {len(data['events'])} events")


# Test 1: date 2026-04-15 should have isCompleted=true if logs exist for that date
def test_calendar_event_april15_completed(auth_headers):
    resp = requests.get(
        f"{BASE_URL}/api/calendar/events",
        params={"start_date": "2026-04-13", "end_date": "2026-04-19"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    events = resp.json().get("events", [])
    april15_events = [e for e in events if e.get("date") == "2026-04-15"]
    print(f"Events on 2026-04-15: {april15_events}")
    if not april15_events:
        pytest.skip("No events scheduled for 2026-04-15 for this user")
    for ev in april15_events:
        assert ev.get("isCompleted") is True, (
            f"Expected isCompleted=True for 2026-04-15 event, got: {ev}"
        )
    print(f"PASS: 2026-04-15 events all have isCompleted=True")


# Test 3: Future training days (no logs) should have isCompleted=false
def test_future_events_not_completed(auth_headers):
    # Use a far future date range
    resp = requests.get(
        f"{BASE_URL}/api/calendar/events",
        params={"start_date": "2027-01-01", "end_date": "2027-01-31"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    events = resp.json().get("events", [])
    if not events:
        pytest.skip("No events scheduled for 2027-01 for this user")
    completed = [e for e in events if e.get("isCompleted")]
    print(f"Future events: {len(events)}, completed: {len(completed)}")
    assert len(completed) == 0, (
        f"Expected 0 completed future events, got {len(completed)}: {completed[:3]}"
    )
    print("PASS: All future events have isCompleted=False")


# Check all events structure
def test_calendar_events_structure(auth_headers):
    resp = requests.get(
        f"{BASE_URL}/api/calendar/events",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    events = data.get("events", [])
    if events:
        ev = events[0]
        required_keys = ["date", "sessionType", "isCompleted", "weekNumber"]
        for k in required_keys:
            assert k in ev, f"Missing key '{k}' in event: {ev}"
    print(f"PASS: Event structure valid, total events: {len(events)}")


# Test backend logs for errors
def test_no_backend_errors():
    import subprocess
    result = subprocess.run(
        ["tail", "-n", "50", "/var/log/supervisor/backend.out.log"],
        capture_output=True, text=True
    )
    log = result.stdout
    errors = [l for l in log.splitlines() if "TypeError" in l or "AttributeError" in l or "500" in l]
    print(f"Backend log errors: {errors}")
    assert len(errors) == 0, f"Backend errors found: {errors}"
    print("PASS: No TypeError/AttributeError in backend logs")
