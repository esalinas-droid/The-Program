"""
Tests for:
1. POST /api/readiness - loadMultiplier and adjustmentPercent based on score thresholds
2. GET /api/readiness/today - returns loadMultiplier and adjustmentPercent
3. POST /api/profile/reset - clears 8 collections
4. plan_generator.py - _build_re_upper, _build_re_lower, _build_full_body functions and GOAL_DAY_MAPS
"""
import pytest
import requests
import os
import sys

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

# ── Auth helper ──────────────────────────────────────────────────────────────

def get_token(email, password):
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    if resp.status_code == 200:
        return resp.json().get("token")
    return None


@pytest.fixture(scope="module")
def auth_headers():
    token = get_token("user_b@theprogram.app", "HypertrophyB123")
    if not token:
        pytest.skip("Login failed — cannot run authenticated tests")
    return {"Authorization": f"Bearer {token}"}


# ── 1. POST /api/readiness — loadMultiplier & adjustmentPercent ───────────────

class TestReadinessEndpoint:
    """POST /api/readiness - score threshold tests"""

    def test_score_low_below_3(self, auth_headers):
        """Score 2 (all=2): avg=2.0 < 3.0 → multiplier 0.85, percent 15"""
        resp = requests.post(f"{BASE_URL}/api/readiness",
                             json={"sleepQuality": 2, "soreness": 2, "moodEnergy": 2},
                             headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "loadMultiplier" in data, "loadMultiplier missing from response"
        assert "adjustmentPercent" in data, "adjustmentPercent missing from response"
        assert data["loadMultiplier"] == 0.85, f"Expected 0.85 for score 2, got {data['loadMultiplier']}"
        assert data["adjustmentPercent"] == 15, f"Expected 15% for score 2, got {data['adjustmentPercent']}"
        assert data["readinessScore"] == pytest.approx(2.0, abs=0.01)
        print(f"PASS score=2: multiplier={data['loadMultiplier']}, percent={data['adjustmentPercent']}")

    def test_score_moderate_between_3_and_4(self, auth_headers):
        """Score 3.5 (3+4+3=10/3=3.33): 3.0 ≤ score < 4.0 → multiplier 0.90, percent 10"""
        resp = requests.post(f"{BASE_URL}/api/readiness",
                             json={"sleepQuality": 3, "soreness": 4, "moodEnergy": 3},
                             headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["loadMultiplier"] == 0.90, f"Expected 0.90 for score ~3.33, got {data['loadMultiplier']}"
        assert data["adjustmentPercent"] == 10, f"Expected 10% for score ~3.33, got {data['adjustmentPercent']}"
        print(f"PASS score=3.33: multiplier={data['loadMultiplier']}, percent={data['adjustmentPercent']}")

    def test_score_high_5_no_adjustment(self, auth_headers):
        """Score 5 (all=5): score >= 4.0 → multiplier 1.0, percent 0"""
        resp = requests.post(f"{BASE_URL}/api/readiness",
                             json={"sleepQuality": 5, "soreness": 5, "moodEnergy": 5},
                             headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["loadMultiplier"] == 1.0, f"Expected 1.0 for score 5, got {data['loadMultiplier']}"
        assert data["adjustmentPercent"] == 0, f"Expected 0% for score 5, got {data['adjustmentPercent']}"
        assert data["readinessScore"] == pytest.approx(5.0, abs=0.01)
        print(f"PASS score=5: multiplier={data['loadMultiplier']}, percent={data['adjustmentPercent']}")


# ── 2. GET /api/readiness/today ───────────────────────────────────────────────

class TestReadinessTodayEndpoint:
    """GET /api/readiness/today - returns loadMultiplier and adjustmentPercent"""

    def test_today_readiness_fields(self, auth_headers):
        # First submit a readiness check
        requests.post(f"{BASE_URL}/api/readiness",
                      json={"sleepQuality": 4, "soreness": 4, "moodEnergy": 4},
                      headers=auth_headers)
        resp = requests.get(f"{BASE_URL}/api/readiness/today", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("hasCheckedIn") == True, "Expected hasCheckedIn=True after posting readiness"
        readiness = data.get("readiness")
        assert readiness is not None, "readiness object is None"
        assert "loadMultiplier" in readiness, "loadMultiplier missing from /readiness/today"
        assert "adjustmentPercent" in readiness, "adjustmentPercent missing from /readiness/today"
        print(f"PASS readiness/today: loadMultiplier={readiness['loadMultiplier']}, adjustmentPercent={readiness['adjustmentPercent']}")


# ── 3. POST /api/profile/reset ────────────────────────────────────────────────

class TestProfileResetEndpoint:
    """POST /api/profile/reset - clears 8 collections"""

    def test_reset_returns_200_success(self, auth_headers):
        resp = requests.post(f"{BASE_URL}/api/profile/reset", headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success") == True, f"Expected success=True, got {data}"
        assert "message" in data, "message missing from reset response"
        print(f"PASS profile/reset: {data['message']}")

    def test_reset_clears_readiness_checks(self, auth_headers):
        """After reset, readiness/today should return hasCheckedIn=False"""
        # Check post-reset state
        resp = requests.get(f"{BASE_URL}/api/readiness/today", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("hasCheckedIn") == False, \
            f"Expected hasCheckedIn=False after reset, got {data.get('hasCheckedIn')}"
        print("PASS reset cleared readiness_checks")


# ── 4. plan_generator.py — code-level checks ─────────────────────────────────

class TestPlanGeneratorCode:
    """Verify plan_generator.py has the new builders and GOAL_DAY_MAPS"""

    def test_re_upper_exists(self):
        sys.path.insert(0, '/app/backend')
        from services.plan_generator import _build_re_upper
        assert callable(_build_re_upper), "_build_re_upper should be callable"
        print("PASS _build_re_upper exists")

    def test_re_lower_exists(self):
        sys.path.insert(0, '/app/backend')
        from services.plan_generator import _build_re_lower
        assert callable(_build_re_lower), "_build_re_lower should be callable"
        print("PASS _build_re_lower exists")

    def test_full_body_exists(self):
        sys.path.insert(0, '/app/backend')
        from services.plan_generator import _build_full_body
        assert callable(_build_full_body), "_build_full_body should be callable"
        print("PASS _build_full_body exists")

    def test_goal_day_maps_defined(self):
        sys.path.insert(0, '/app/backend')
        from services.plan_generator import GOAL_DAY_MAPS
        assert isinstance(GOAL_DAY_MAPS, dict), "GOAL_DAY_MAPS should be a dict"
        required_keys = ["hypertrophy", "athletic performance", "general fitness"]
        for key in required_keys:
            assert key in GOAL_DAY_MAPS, f"Missing key '{key}' in GOAL_DAY_MAPS"
        print(f"PASS GOAL_DAY_MAPS has keys: {list(GOAL_DAY_MAPS.keys())}")
