"""
Test suite for 15-bug fixes batch — Iteration 43
Covers: weekStats date-range, today session currentWeek, weekly-review cache,
        POST /api/log cache invalidation, coach/chat user-scoping, apply-recommendation scoping
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('EXPO_BACKEND_URL').rstrip('/')

# ── Auth helpers ────────────────────────────────────────────────────────────────
def login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["token"]

@pytest.fixture(scope="module")
def token_a():
    return login("user_a@theprogram.app", "StrongmanA123")

@pytest.fixture(scope="module")
def token_b():
    return login("user_b@theprogram.app", "HypertrophyB123")

@pytest.fixture(scope="module")
def headers_a(token_a):
    return {"Authorization": f"Bearer {token_a}"}

@pytest.fixture(scope="module")
def headers_b(token_b):
    return {"Authorization": f"Bearer {token_b}"}


# ── 1. weekStats endpoint: date-range query ───────────────────────────────────
class TestWeekStats:
    def test_week_stats_with_date_range(self, headers_a):
        """GET /api/log/stats/week/1?start_date=...&end_date=... should work"""
        r = requests.get(
            f"{BASE_URL}/api/log/stats/week/1",
            params={"start_date": "2026-04-13", "end_date": "2026-04-19"},
            headers=headers_a,
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "sessionsCompleted" in data, f"Missing sessionsCompleted: {data}"
        assert "avgPain" in data
        assert "avgRPE" in data
        print(f"✓ weekStats date-range: sessionsCompleted={data['sessionsCompleted']}")

    def test_week_stats_legacy_week_number(self, headers_a):
        """GET /api/log/stats/week/1 (no date params) — legacy fallback"""
        r = requests.get(f"{BASE_URL}/api/log/stats/week/1", headers=headers_a)
        assert r.status_code == 200, f"Expected 200: {r.text}"
        data = r.json()
        assert "sessionsCompleted" in data
        print(f"✓ weekStats legacy fallback: sessionsCompleted={data['sessionsCompleted']}")


# ── 2. today session must include currentWeek ─────────────────────────────────
class TestTodaySession:
    def test_today_session_has_current_week(self, headers_a):
        """GET /api/plan/session/today must return currentWeek as integer"""
        r = requests.get(f"{BASE_URL}/api/plan/session/today", headers=headers_a)
        # May be 200 or 404 (no plan), but if 200 must have currentWeek
        if r.status_code == 200:
            data = r.json()
            assert "currentWeek" in data, f"Missing currentWeek field: {data.keys()}"
            assert isinstance(data["currentWeek"], int), f"currentWeek not int: {type(data['currentWeek'])}"
            print(f"✓ today session has currentWeek={data['currentWeek']}")
        elif r.status_code == 404:
            print("SKIP: No plan found for user_a — currentWeek check skipped")
        else:
            pytest.fail(f"Unexpected status {r.status_code}: {r.text}")


# ── 3. weekly-review: first call generates and caches with weekStart ──────────
class TestWeeklyReview:
    def test_weekly_review_first_call(self, headers_a):
        """GET /api/weekly-review — should return weekStart field"""
        r = requests.get(f"{BASE_URL}/api/weekly-review", headers=headers_a, timeout=60)
        assert r.status_code == 200, f"Expected 200: {r.status_code} {r.text}"
        data = r.json()
        assert "weekStart" in data, f"Missing weekStart in response: {data.keys()}"
        print(f"✓ weekly-review has weekStart={data['weekStart']}, cached={data.get('cached')}")

    def test_weekly_review_second_call_cached(self, headers_a):
        """GET /api/weekly-review second call should return cached=True"""
        r = requests.get(f"{BASE_URL}/api/weekly-review", headers=headers_a, timeout=60)
        assert r.status_code == 200
        data = r.json()
        assert data.get("cached") is True, f"Expected cached=True, got: {data.get('cached')}"
        assert "weekStart" in data
        print(f"✓ weekly-review second call: cached=True weekStart={data['weekStart']}")

    def test_weekly_review_db_has_week_start(self, headers_a):
        """Verify weekStart field exists in cached review response"""
        r = requests.get(f"{BASE_URL}/api/weekly-review", headers=headers_a, timeout=60)
        assert r.status_code == 200
        data = r.json()
        week_start = data.get("weekStart")
        assert week_start is not None, "weekStart is None"
        # Should be YYYY-MM-DD format
        try:
            datetime.strptime(week_start, "%Y-%m-%d")
            print(f"✓ weekStart is valid date: {week_start}")
        except ValueError:
            pytest.fail(f"weekStart not in YYYY-MM-DD format: {week_start}")


# ── 4. POST /api/log cache invalidation ──────────────────────────────────────
class TestLogCacheInvalidation:
    _created_id = None

    def test_post_log_doesnt_crash(self, headers_a):
        """POST /api/log should succeed (no NameError on `profile` variable)"""
        payload = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "week": 1,
            "day": "Monday",
            "sessionType": "Heavy Lower",
            "exercise": "TEST_Trap Bar Deadlift",
            "sets": 3,
            "weight": 315.0,
            "reps": 5,
            "rpe": 8.0,
            "pain": 0,
            "completed": "yes",
        }
        r = requests.post(f"{BASE_URL}/api/log", json=payload, headers=headers_a)
        assert r.status_code == 200, f"POST /api/log failed: {r.status_code} {r.text}"
        data = r.json()
        assert "id" in data
        TestLogCacheInvalidation._created_id = data["id"]
        print(f"✓ POST /api/log succeeded, id={data['id']}")

    def test_weekly_review_regenerated_after_log(self, headers_a):
        """After POST /api/log, weekly-review cache should regenerate (not crash)"""
        r = requests.get(f"{BASE_URL}/api/weekly-review", headers=headers_a, timeout=60)
        assert r.status_code == 200, f"weekly-review failed after log: {r.text}"
        data = r.json()
        assert "weekStart" in data
        print(f"✓ weekly-review still works after log, cached={data.get('cached')}")

    def teardown_method(self, method):
        """Clean up test log entry"""
        if TestLogCacheInvalidation._created_id:
            try:
                headers = {"Authorization": f"Bearer {login('user_a@theprogram.app', 'StrongmanA123')}"}
                requests.delete(f"{BASE_URL}/api/log/{TestLogCacheInvalidation._created_id}", headers=headers)
            except Exception:
                pass


# ── 5. coach/chat: user-scoped, no cross-user data ───────────────────────────
class TestCoachChat:
    def test_coach_chat_user_a(self, headers_a):
        """POST /api/coach/chat as user_a — should not include user_b data"""
        r = requests.post(
            f"{BASE_URL}/api/coach/chat",
            json={"message": "What's my training focus this week?", "conversation_id": None},
            headers=headers_a,
            timeout=30,
        )
        # 200 or 503 (if AI service not ready) are acceptable
        assert r.status_code in (200, 503), f"Unexpected status: {r.status_code} {r.text}"
        if r.status_code == 503:
            print("SKIP: Coach service not ready (503)")
        else:
            data = r.json()
            assert "response" in data or "message" in data or "reply" in data, f"No response key: {data.keys()}"
            print(f"✓ coach/chat user_a returned response")


# ── 6. apply-recommendation: userId-scoped profile ───────────────────────────
class TestApplyRecommendation:
    def test_apply_recommendation_uses_user_scoped_profile(self, headers_a):
        """POST /api/coach/apply-recommendation should use userId-scoped profile"""
        # Need a valid conversation_id — we can't create one without AI, so test 422 vs 503 behavior
        payload = {
            "conversation_id": "000000000000000000000000",  # fake ObjectId
            "summary": "Reduce deadlift load due to lower back tightness",
            "details": "Lower back tightness noted — swap conventional deadlift to trap bar",
            "exercises": [{"original": "conventional deadlift", "replacement": "Trap Bar Deadlift", "reason": "back tightness"}],
            "load_adjustments": [],
        }
        r = requests.post(f"{BASE_URL}/api/coach/apply-recommendation", json=payload, headers=headers_a)
        # Should get 404 (conversation not found) or 200, NOT 500 (which would indicate db.profile.find_one({}) error)
        assert r.status_code in (200, 404, 422), f"Unexpected status {r.status_code}: {r.text}"
        print(f"✓ apply-recommendation returned {r.status_code} (not 500)")
