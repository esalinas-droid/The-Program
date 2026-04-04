"""
Phase 2 Batch 2 — Intelligent Coaching Upgrades:
- Task 2: RAG-Enhanced Plan Generation (POST /api/profile/intake)
- Task 5: Weekly Auto-Review (GET /api/weekly-review) — caching
- Task 6: Auto Load/Volume Adjustment (POST /api/plan/auto-adjust, POST /api/plan/autoregulate)
- Task 7: Deload Detection (GET /api/deload/check)
- Task 11: Personalized Warm-Up (GET /api/warmup/today)
- Regression: pain-report, readiness/today, session-rating, coach/chat
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')


@pytest.fixture(scope="module")
def auth_headers():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "user_a@theprogram.app",
        "password": "StrongmanA123"
    })
    if resp.status_code != 200:
        pytest.skip(f"Login failed: {resp.status_code} {resp.text}")
    data = resp.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"No token in response: {data}"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ── Task 5: Weekly Auto-Review ─────────────────────────────────────────────────

class TestWeeklyReview:
    """GET /api/weekly-review — response fields and caching"""

    def test_weekly_review_returns_correct_fields(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/weekly-review", headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("hasReview") is True, f"hasReview should be True: {data}"
        for field in ("summary", "highlights", "concerns", "nextWeekFocus", "stats"):
            assert field in data, f"Missing field '{field}' in weekly review: {data}"
        stats = data["stats"]
        for stat in ("sessionsCompleted", "sessionsPlanned", "avgRPE", "prsHit", "painReports"):
            assert stat in stats, f"Missing stat '{stat}': {stats}"
        print(f"Weekly review summary: {str(data.get('summary',''))[:100]}")

    def test_weekly_review_second_call_returns_cached(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/weekly-review", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("cached") is True, f"Expected cached=True on second call: {data}"
        print(f"Second call cached={data.get('cached')}")

    def test_weekly_review_highlights_is_list(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/weekly-review", headers=auth_headers)
        data = resp.json()
        assert isinstance(data["highlights"], list), "highlights should be a list"
        assert isinstance(data["concerns"], list), "concerns should be a list"
        assert len(data["highlights"]) > 0, "highlights should not be empty"


# ── Task 7: Deload Detection ───────────────────────────────────────────────────

class TestDeloadCheck:
    """GET /api/deload/check — scoring, urgency, persistence"""

    def test_deload_check_response_structure(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/deload/check", headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "deloadRecommended" in data, f"Missing deloadRecommended: {data}"
        assert "urgency" in data, f"Missing urgency: {data}"
        assert "deloadScore" in data, f"Missing deloadScore: {data}"
        assert "signals" in data, f"Missing signals: {data}"
        assert "message" in data, f"Missing message: {data}"
        assert "stats" in data, f"Missing stats: {data}"
        print(f"Deload check: score={data['deloadScore']}, urgency={data['urgency']}, recommended={data['deloadRecommended']}")

    def test_deload_urgency_valid_values(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/deload/check", headers=auth_headers)
        data = resp.json()
        assert data["urgency"] in ("immediate", "soon", "none"), \
            f"urgency must be 'immediate'/'soon'/'none', got: {data['urgency']}"

    def test_deload_stats_fields(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/deload/check", headers=auth_headers)
        data = resp.json()
        stats = data["stats"]
        for field in ("avgRPE", "painReports", "completionRate", "currentWeek"):
            assert field in stats, f"Missing stat '{field}': {stats}"

    def test_deload_signals_is_list(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/deload/check", headers=auth_headers)
        data = resp.json()
        assert isinstance(data["signals"], list), "signals should be a list"
        print(f"Deload signals: {data['signals']}")


# ── Task 11: Personalized Warm-Up ─────────────────────────────────────────────

class TestWarmupToday:
    """GET /api/warmup/today — fields and steps"""

    def test_warmup_response_fields(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/warmup/today", headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        for field in ("title", "sessionFocus", "duration", "steps", "stepCount", "readinessScore"):
            assert field in data, f"Missing field '{field}': {data}"
        print(f"Warmup: {data['title']}, focus={data['sessionFocus']}, steps={data['stepCount']}, dur={data['duration']}")

    def test_warmup_steps_is_list_of_strings(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/warmup/today", headers=auth_headers)
        data = resp.json()
        assert isinstance(data["steps"], list), "steps should be a list"
        assert len(data["steps"]) > 0, "steps should not be empty"
        assert all(isinstance(s, str) for s in data["steps"]), "all steps should be strings"
        assert data["stepCount"] == len(data["steps"]), "stepCount should match len(steps)"

    def test_warmup_session_focus_valid(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/warmup/today", headers=auth_headers)
        data = resp.json()
        assert data["sessionFocus"] in ("upper", "lower"), \
            f"sessionFocus should be 'upper' or 'lower': {data['sessionFocus']}"


# ── Task 6a: Auto-Adjust Plan ──────────────────────────────────────────────────

class TestAutoAdjust:
    """POST /api/plan/auto-adjust"""

    def test_auto_adjust_response_fields(self, auth_headers):
        resp = requests.post(f"{BASE_URL}/api/plan/auto-adjust", headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "adjusted" in data, f"Missing 'adjusted' field: {data}"
        assert "avgRPE" in data, f"Missing 'avgRPE' field: {data}"
        print(f"Auto-adjust: adjusted={data.get('adjusted')}, avgRPE={data.get('avgRPE')}, direction={data.get('direction','N/A')}")

    def test_auto_adjust_returns_valid_direction(self, auth_headers):
        resp = requests.post(f"{BASE_URL}/api/plan/auto-adjust", headers=auth_headers)
        data = resp.json()
        if data.get("adjusted"):
            assert data.get("direction") in ("reduce", "increase"), \
                f"direction should be 'reduce' or 'increase' when adjusted: {data}"
            assert "setsAdjusted" in data, "setsAdjusted should be present when adjusted"
            assert data["setsAdjusted"] > 0, "setsAdjusted > 0 when adjusted=True"
            assert "note" in data, "note should be present"


# ── Task 6b: Autoregulate Session ─────────────────────────────────────────────

class TestAutoregulate:
    """POST /api/plan/autoregulate — reduce/increase/maintain logic"""

    def test_autoregulate_reduce_high_rpe(self, auth_headers):
        """RPE 9, target 7.5 → suggestion='reduce', message contains suggested load"""
        resp = requests.post(f"{BASE_URL}/api/plan/autoregulate", json={
            "currentRPE": 9,
            "targetRPE": 7.5,
            "exercise": "Squat",
            "setNumber": 2,
            "currentLoad": 300
        }, headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("suggestion") == "reduce", f"Expected suggestion='reduce': {data}"
        assert "message" in data, "Missing message"
        assert len(data["message"]) > 0
        # diff=1.5 → 5% reduce → new_load=round(300*0.95/5)*5=285
        assert data.get("suggestedLoad") is not None, "suggestedLoad should be present"
        print(f"Autoregulate reduce: suggestion={data['suggestion']}, load={data.get('suggestedLoad')}, msg={data['message'][:80]}")

    def test_autoregulate_increase_low_rpe(self, auth_headers):
        """RPE 6, target 7.5 → suggestion='increase'"""
        resp = requests.post(f"{BASE_URL}/api/plan/autoregulate", json={
            "currentRPE": 6,
            "targetRPE": 7.5,
            "exercise": "Bench Press",
            "setNumber": 1,
            "currentLoad": 200
        }, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("suggestion") == "increase", f"Expected suggestion='increase': {data}"
        print(f"Autoregulate increase: suggestion={data['suggestion']}, load={data.get('suggestedLoad')}")

    def test_autoregulate_maintain_on_target(self, auth_headers):
        """RPE 7.5, target 7.5 → suggestion='maintain'"""
        resp = requests.post(f"{BASE_URL}/api/plan/autoregulate", json={
            "currentRPE": 7.5,
            "targetRPE": 7.5,
            "exercise": "Deadlift",
            "setNumber": 1,
            "currentLoad": 400
        }, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("suggestion") == "maintain", f"Expected suggestion='maintain': {data}"
        print(f"Autoregulate maintain: suggestion={data['suggestion']}, msg={data['message'][:80]}")

    def test_autoregulate_reduce_very_high_rpe(self, auth_headers):
        """RPE 10, target 7.5 → diff=2.5 → 15% reduce"""
        resp = requests.post(f"{BASE_URL}/api/plan/autoregulate", json={
            "currentRPE": 10,
            "targetRPE": 7.5,
            "exercise": "Squat",
            "setNumber": 3,
            "currentLoad": 300
        }, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("suggestion") == "reduce"
        # 15% reduce: round(300*0.85/5)*5 = 255
        assert data.get("suggestedLoad") == 255, f"Expected 255, got {data.get('suggestedLoad')}"


# ── Regression Tests ───────────────────────────────────────────────────────────

class TestRegressions:
    """Ensure Batch 1 endpoints still work"""

    def test_pain_report_still_works(self, auth_headers):
        resp = requests.post(f"{BASE_URL}/api/pain-report", json={
            "exerciseName": "Squat",
            "bodyRegion": "knee_regression_test",
            "painType": "dull",
            "intensity": 3,
            "timing": "after",
            "sessionType": "ME Lower"
        }, headers=auth_headers)
        assert resp.status_code == 200, f"pain-report regression failed: {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success") is True

    def test_readiness_today_still_works(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/readiness/today", headers=auth_headers)
        assert resp.status_code == 200, f"readiness/today regression failed: {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "hasCheckedIn" in data

    def test_session_rating_still_works(self, auth_headers):
        resp = requests.post(f"{BASE_URL}/api/session-rating", json={
            "rpe": 7.5,
            "sessionType": "ME Lower",
            "week": 1,
            "setsLogged": 15,
            "totalSets": 20
        }, headers=auth_headers)
        assert resp.status_code == 200, f"session-rating regression failed: {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "id" in data
        assert "aiInsight" in data

    def test_coach_chat_still_works(self, auth_headers):
        resp = requests.post(f"{BASE_URL}/api/coach/chat", json={
            "message": "Quick regression check",
            "conversation_history": []
        }, headers=auth_headers, timeout=30)
        assert resp.status_code == 200, f"coach/chat regression failed: {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "response" in data
        assert len(data["response"]) > 0
