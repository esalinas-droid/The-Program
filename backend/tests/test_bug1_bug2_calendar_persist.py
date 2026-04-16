"""
Tests for BUG1 (future sessions not marked completed) and BUG2 (logged sets persistence).
Also tests regression: all 5 tabs load, calendar events correct.
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL') or os.environ.get('EXPO_BACKEND_URL')
if not BASE_URL:
    BASE_URL = open('/app/frontend/.env').read().split('EXPO_PUBLIC_BACKEND_URL=')[1].split('\n')[0].strip()

AUTH_HEADERS_A = None
AUTH_HEADERS_B = None

@pytest.fixture(scope="module", autouse=True)
def setup_auth():
    global AUTH_HEADERS_A, AUTH_HEADERS_B
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email":"user_a@theprogram.app","password":"StrongmanA123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    token_a = r.json()["token"]
    AUTH_HEADERS_A = {"Authorization": f"Bearer {token_a}", "Content-Type": "application/json"}

    r2 = requests.post(f"{BASE_URL}/api/auth/login", json={"email":"user_b@theprogram.app","password":"HypertrophyB123"})
    if r2.status_code == 200:
        token_b = r2.json()["token"]
        AUTH_HEADERS_B = {"Authorization": f"Bearer {token_b}", "Content-Type": "application/json"}


class TestCalendarEventsFutureSessions:
    """BUG1: Future sessions should NEVER be isCompleted=true via same-type-this-week fallback"""

    def test_calendar_events_returns_200(self):
        r = requests.get(f"{BASE_URL}/api/calendar/events", headers=AUTH_HEADERS_A)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"

    def _get_events(self, headers):
        r = requests.get(f"{BASE_URL}/api/calendar/events", headers=headers)
        assert r.status_code == 200
        d = r.json()
        return d.get("events", d) if isinstance(d, dict) else d

    def test_future_sessions_not_completed(self):
        events = self._get_events(AUTH_HEADERS_A)
        today_str = datetime.now().strftime("%Y-%m-%d")
        future_completed = [e for e in events if isinstance(e, dict) and e.get("date","") > today_str and e.get("isCompleted")]
        assert len(future_completed) == 0, (
            f"BUG1 FAIL: {len(future_completed)} future events marked isCompleted=True: "
            + str([f"{e['date']}:{e['sessionType']}" for e in future_completed[:5]])
        )

    def test_past_sessions_can_be_completed(self):
        """Past sessions CAN be completed — just verifying structure"""
        events = self._get_events(AUTH_HEADERS_A)
        today_str = datetime.now().strftime("%Y-%m-%d")
        past_events = [e for e in events if isinstance(e, dict) and e.get("date", "") <= today_str]
        if past_events:
            assert "isCompleted" in past_events[0], "Events missing isCompleted field"

    def test_user_b_calendar_future_not_completed(self):
        """BUG1 regression check for user_b"""
        if not AUTH_HEADERS_B:
            pytest.skip("User B auth unavailable")
        events = self._get_events(AUTH_HEADERS_B)
        today_str = datetime.now().strftime("%Y-%m-%d")
        future_completed = [e for e in events if isinstance(e, dict) and e.get("date","") > today_str and e.get("isCompleted")]
        assert len(future_completed) == 0, (
            f"BUG1 FAIL user_b: {[e['date'] for e in future_completed]}"
        )


class TestTodaySessionLoad:
    """Regression: Today endpoint works"""

    def test_today_session_loads(self):
        r = requests.get(f"{BASE_URL}/api/plan/session/today", headers=AUTH_HEADERS_A)
        assert r.status_code in [200, 204], f"Expected 200/204, got {r.status_code}"

    def test_today_session_structure(self):
        r = requests.get(f"{BASE_URL}/api/plan/session/today", headers=AUTH_HEADERS_A)
        if r.status_code == 204:
            pytest.skip("No session today")
        data = r.json()
        assert "session" in data or "exercises" in data, f"Unexpected structure: {list(data.keys())}"


class TestWorkoutLogAPI:
    """BUG2: Workout log create/fetch (persistence backend)"""
    _created_id = None

    def test_create_log_entry(self):
        today_str = datetime.now().strftime("%Y-%m-%d")
        payload = {
            "date": today_str,
            "week": 1,
            "day": datetime.now().strftime("%A"),
            "sessionType": "Training",
            "exercise": "TEST_Squat",
            "sets": 1,
            "weight": 100,
            "reps": 5,
            "rpe": 7,
            "pain": 0,
            "completed": "yes"
        }
        r = requests.post(f"{BASE_URL}/api/log", json=payload, headers=AUTH_HEADERS_A)
        assert r.status_code in [200, 201], f"Expected 201, got {r.status_code}: {r.text}"
        data = r.json()
        entry_id = data.get("_id") or data.get("id")
        assert entry_id, "No ID in response"
        TestWorkoutLogAPI._created_id = entry_id

    def test_fetch_logs_contains_created(self):
        if not TestWorkoutLogAPI._created_id:
            pytest.skip("Log not created")
        r = requests.get(f"{BASE_URL}/api/log", headers=AUTH_HEADERS_A)
        assert r.status_code == 200
        logs = r.json()
        ids = [str(l.get("_id") or l.get("id","")) for l in logs]
        assert TestWorkoutLogAPI._created_id in ids, "Created log not found in fetch"

    def test_delete_log_entry(self):
        if not TestWorkoutLogAPI._created_id:
            pytest.skip("Log not created")
        r = requests.delete(f"{BASE_URL}/api/log/{TestWorkoutLogAPI._created_id}", headers=AUTH_HEADERS_A)
        assert r.status_code in [200, 204], f"Delete failed: {r.status_code}"
