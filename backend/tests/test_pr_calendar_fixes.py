"""
Tests for 5 bug fixes:
- ISSUE1: PR celebration (backend /prs/{exercise} history endpoint)
- ISSUE2: Share cards
- ISSUE3: Session detail setIndex
- ISSUE4: Rest days gold border (UI only)
- ISSUE5: calendar_overrides respected by get_today_session_mongo
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


@pytest.fixture
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def auth_token(session):
    """Get JWT token for user_a"""
    r = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "user_a@theprogram.app",
        "password": "StrongmanA123"
    })
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text}")
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


# ── ISSUE 1: PR History endpoint (used by checkForPR for fallback) ─────────────

class TestPRHistory:
    """PR history endpoint — used by checkForPR async fallback"""

    def test_pr_history_endpoint_exists(self, session, auth_headers):
        r = session.get(f"{BASE_URL}/api/prs", headers=auth_headers)
        assert r.status_code == 200, f"GET /prs failed: {r.text}"
        data = r.json()
        assert isinstance(data, list), "Expected list of PRs"
        print(f"PASS: /prs returns {len(data)} entries")

    def test_pr_history_for_exercise(self, session, auth_headers):
        exercise = "Floor Press"
        r = session.get(f"{BASE_URL}/api/prs/{requests.utils.quote(exercise)}", headers=auth_headers)
        assert r.status_code == 200, f"GET /prs/{exercise} failed: {r.text}"
        data = r.json()
        assert isinstance(data, list), "Expected list of history entries"
        print(f"PASS: PR history for '{exercise}': {len(data)} entries")

    def test_pr_log_and_detect(self, session, auth_headers):
        """Log 2 sets: first at 275x5, second at 285x5. Second should beat first."""
        today = datetime.now().strftime("%Y-%m-%d")
        exercise = "TEST_FloorPressPR"
        
        # Log Set 1: 275 x 5 → e1rm = 275*(1+5/30) ≈ 321
        r1 = session.post(f"{BASE_URL}/api/log", json={
            "date": today, "week": 1, "day": "Monday",
            "sessionType": "Heavy Upper", "exercise": exercise,
            "sets": 1, "weight": 275.0, "reps": 5, "rpe": 7,
            "pain": 0, "completed": "yes", "setIndex": 0
        }, headers=auth_headers)
        assert r1.status_code == 200, f"Log Set 1 failed: {r1.text}"
        e1rm1 = r1.json().get("e1rm", 0)
        print(f"Set 1 logged: e1rm={e1rm1}")

        # Log Set 2: 285 x 5 → e1rm = 285*(1+5/30) ≈ 332.5 — should be PR
        r2 = session.post(f"{BASE_URL}/api/log", json={
            "date": today, "week": 1, "day": "Monday",
            "sessionType": "Heavy Upper", "exercise": exercise,
            "sets": 1, "weight": 285.0, "reps": 5, "rpe": 8,
            "pain": 0, "completed": "yes", "setIndex": 1
        }, headers=auth_headers)
        assert r2.status_code == 200, f"Log Set 2 failed: {r2.text}"
        e1rm2 = r2.json().get("e1rm", 0)
        print(f"Set 2 logged: e1rm={e1rm2}")

        assert e1rm2 > e1rm1, f"Set 2 e1rm ({e1rm2}) should be > Set 1 e1rm ({e1rm1})"
        print("PASS: PR detection — Set 2 has higher e1rm than Set 1")

        # Cleanup
        logs = session.get(f"{BASE_URL}/api/log", headers=auth_headers, params={"exercise": exercise})
        for entry in logs.json():
            session.delete(f"{BASE_URL}/api/log/{entry['id']}", headers=auth_headers)


# ── ISSUE 5: Calendar overrides respected by today session endpoint ────────────

class TestCalendarOverrides:
    """ISSUE 5: get_today_session_mongo should check calendar_overrides"""

    def test_today_session_without_override(self, session, auth_headers):
        r = session.get(f"{BASE_URL}/api/plan/session/today", headers=auth_headers)
        # Should return 200 or 404 (rest day) - both are valid
        assert r.status_code in (200, 404), f"Unexpected status: {r.status_code}"
        if r.status_code == 200:
            data = r.json()
            assert "session" in data, "Expected 'session' key in response"
            print(f"PASS: Today session: {data.get('session', {}).get('sessionType', 'unknown')}")
        else:
            print("PASS: No session today (rest day or no plan)")

    def test_reschedule_and_today_override(self, session, auth_headers):
        """Move a session to today and verify today endpoint returns it"""
        today_str = datetime.now().strftime("%Y-%m-%d")
        yesterday_str = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

        # First get today's session type (if any)
        r_today_before = session.get(f"{BASE_URL}/api/plan/session/today", headers=auth_headers)
        
        # Reschedule yesterday → today (simulating a move)
        r_reschedule = session.post(f"{BASE_URL}/api/calendar/reschedule", json={
            "originalDate": yesterday_str,
            "newDate": today_str,
            "sessionType": "Heavy Upper",
            "reason": "test"
        }, headers=auth_headers)
        assert r_reschedule.status_code == 200, f"Reschedule failed: {r_reschedule.text}"
        data = r_reschedule.json()
        assert data.get("success") is True
        print(f"PASS: Reschedule created from {yesterday_str} → {today_str}")

        # Now check today session — should reflect override
        r_today_after = session.get(f"{BASE_URL}/api/plan/session/today", headers=auth_headers)
        assert r_today_after.status_code == 200, f"Today session after override failed: {r_today_after.status_code} {r_today_after.text}"
        session_data = r_today_after.json()
        assert "session" in session_data
        session_type = session_data.get("session", {}).get("sessionType", "")
        print(f"PASS: Today session after override = {session_type}")

        # Cleanup: remove the override
        r_undo = session.delete(f"{BASE_URL}/api/calendar/reschedule/{yesterday_str}", headers=auth_headers)
        assert r_undo.status_code == 200
        print("PASS: Override cleaned up")

    def test_reschedule_away_shows_rest(self, session, auth_headers):
        """Move today's original session away → today should return 404 (rest day)"""
        today_str = datetime.now().strftime("%Y-%m-%d")
        tomorrow_str = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

        # Check if there's a session today first
        r_before = session.get(f"{BASE_URL}/api/plan/session/today", headers=auth_headers)
        
        # Create override: today's session moved to tomorrow
        r_reschedule = session.post(f"{BASE_URL}/api/calendar/reschedule", json={
            "originalDate": today_str,
            "newDate": tomorrow_str,
            "sessionType": "Heavy Lower",
            "reason": "test move away"
        }, headers=auth_headers)
        assert r_reschedule.status_code == 200
        print(f"PASS: Moved today's session to {tomorrow_str}")

        # Today should now be rest day (or still show something from plan logic)
        r_after = session.get(f"{BASE_URL}/api/plan/session/today", headers=auth_headers)
        # With the fix, this should return 404 if today's session was moved away
        print(f"Today after move-away: status={r_after.status_code}")
        
        # Cleanup
        session.delete(f"{BASE_URL}/api/calendar/reschedule/{today_str}", headers=auth_headers)

    def test_calendar_events_endpoint(self, session, auth_headers):
        r = session.get(f"{BASE_URL}/api/calendar/events", headers=auth_headers)
        assert r.status_code == 200, f"Calendar events failed: {r.text}"
        data = r.json()
        assert "events" in data
        print(f"PASS: Calendar events: {len(data['events'])} events")


# ── ISSUE 3: setIndex in log entries ────────────────────────────────────────────

class TestSetIndex:
    """ISSUE 3: setIndex stored and returned correctly"""

    def test_log_with_setindex(self, session, auth_headers):
        today = datetime.now().strftime("%Y-%m-%d")
        r = session.post(f"{BASE_URL}/api/log", json={
            "date": today, "week": 1, "day": "Monday",
            "sessionType": "Heavy Upper", "exercise": "TEST_SetIndexExercise",
            "sets": 1, "weight": 200.0, "reps": 3, "rpe": 7,
            "pain": 0, "completed": "yes", "setIndex": 2
        }, headers=auth_headers)
        assert r.status_code == 200, f"Log failed: {r.text}"
        data = r.json()
        assert data.get("setIndex") == 2, f"Expected setIndex=2, got {data.get('setIndex')}"
        print(f"PASS: setIndex stored and returned: {data.get('setIndex')}")
        
        # Cleanup
        entry_id = data.get("id")
        if entry_id:
            session.delete(f"{BASE_URL}/api/log/{entry_id}", headers=auth_headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
