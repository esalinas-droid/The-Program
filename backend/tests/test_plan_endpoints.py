"""
Tests for new MongoDB-backed plan endpoints:
  GET /api/plan/year
  GET /api/plan/block/current
  GET /api/plan/session/today
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

TEST_EMAIL = "user_a@theprogram.app"
TEST_PASSWORD = "StrongmanA123"


@pytest.fixture(scope="module")
def auth_token():
    """Login and return JWT token for user_a."""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    data = resp.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"No token in response: {data}"
    return token


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


class TestPlanYear:
    """GET /api/plan/year — Annual plan structure tests"""

    def test_returns_200(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/plan/year", headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200 got {resp.status_code}: {resp.text}"

    def test_has_plan_name(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/plan/year", headers=auth_headers)
        data = resp.json()
        assert "planName" in data, f"Missing planName in: {list(data.keys())}"
        assert data["planName"], "planName is empty"

    def test_has_total_weeks(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/plan/year", headers=auth_headers)
        data = resp.json()
        assert "totalWeeks" in data, "Missing totalWeeks"
        assert data["totalWeeks"] == 52, f"Expected 52 weeks, got {data['totalWeeks']}"

    def test_has_phases_array(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/plan/year", headers=auth_headers)
        data = resp.json()
        assert "phases" in data, "Missing phases"
        assert isinstance(data["phases"], list), "phases must be a list"
        assert len(data["phases"]) > 0, "phases array is empty"

    def test_phase_structure(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/plan/year", headers=auth_headers)
        data = resp.json()
        phase = data["phases"][0]
        required_fields = ["phaseNumber", "phaseName", "startWeek", "endWeek", "goal", "expectedAdaptation", "blocks"]
        for field in required_fields:
            assert field in phase, f"Phase missing field: {field}"

    def test_phase_blocks_have_key_exercises(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/plan/year", headers=auth_headers)
        data = resp.json()
        phase = data["phases"][0]
        assert len(phase["blocks"]) > 0, "Phase has no blocks"
        block = phase["blocks"][0]
        assert "keyExercises" in block, f"Block missing keyExercises, keys: {list(block.keys())}"

    def test_blocks_have_weeks_with_deload(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/plan/year", headers=auth_headers)
        data = resp.json()
        phase = data["phases"][0]
        block = phase["blocks"][0]
        assert "weeks" in block, "Block missing weeks"
        assert len(block["weeks"]) > 0, "Block has no weeks"
        week = block["weeks"][0]
        assert "isDeload" in week, f"Week missing isDeload, keys: {list(week.keys())}"

    def test_requires_auth(self):
        """Endpoint must reject requests without token."""
        resp = requests.get(f"{BASE_URL}/api/plan/year")
        assert resp.status_code in [401, 403, 422], f"Expected auth error, got {resp.status_code}"


class TestPlanBlockCurrent:
    """GET /api/plan/block/current — Current block tests"""

    def test_returns_200(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/plan/block/current", headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200 got {resp.status_code}: {resp.text}"

    def test_has_phase_and_block(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/plan/block/current", headers=auth_headers)
        data = resp.json()
        assert "phase" in data, f"Missing 'phase' key: {list(data.keys())}"
        assert "block" in data, f"Missing 'block' key: {list(data.keys())}"

    def test_phase_has_required_fields(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/plan/block/current", headers=auth_headers)
        data = resp.json()
        phase = data["phase"]
        for field in ["name", "number", "goal", "adaptation"]:
            assert field in phase, f"Phase missing field: {field}"

    def test_block_has_name(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/plan/block/current", headers=auth_headers)
        data = resp.json()
        block = data["block"]
        assert "blockName" in block, f"Block missing blockName: {list(block.keys())}"

    def test_requires_auth(self):
        resp = requests.get(f"{BASE_URL}/api/plan/block/current")
        assert resp.status_code in [401, 403, 422], f"Expected auth error, got {resp.status_code}"


class TestPlanSessionToday:
    """GET /api/plan/session/today — Today's session tests"""

    def test_returns_200(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/plan/session/today", headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200 got {resp.status_code}: {resp.text}"

    def test_has_session(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/plan/session/today", headers=auth_headers)
        data = resp.json()
        assert "session" in data, f"Missing 'session' key: {list(data.keys())}"

    def test_session_has_type(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/plan/session/today", headers=auth_headers)
        data = resp.json()
        session = data["session"]
        assert "sessionType" in session, f"Session missing sessionType: {list(session.keys())}"
        assert session["sessionType"], "sessionType is empty"

    def test_session_has_exercises(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/plan/session/today", headers=auth_headers)
        data = resp.json()
        session = data["session"]
        assert "exercises" in session, f"Session missing exercises: {list(session.keys())}"
        assert isinstance(session["exercises"], list), "exercises must be a list"
        assert len(session["exercises"]) > 0, "Session has no exercises"

    def test_exercises_have_required_fields(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/plan/session/today", headers=auth_headers)
        data = resp.json()
        exercises = data["session"]["exercises"]
        ex = exercises[0]
        for field in ["name", "category", "prescription"]:
            assert field in ex, f"Exercise missing field '{field}': {list(ex.keys())}"

    def test_requires_auth(self):
        resp = requests.get(f"{BASE_URL}/api/plan/session/today")
        assert resp.status_code in [401, 403, 422], f"Expected auth error, got {resp.status_code}"
