"""Tests for POST /api/session/finish endpoint and related flows"""
import pytest
import requests
import os

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")

@pytest.fixture(scope="module")
def auth_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "user_a@theprogram.app",
        "password": "StrongmanA123"
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json().get("token")

@pytest.fixture(scope="module")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

class TestSessionFinish:
    """Tests for session finish endpoint"""

    def test_finish_session_no_session_id(self, auth_headers):
        """POST with empty sessionId should still return 200"""
        resp = requests.post(f"{BASE_URL}/api/session/finish", json={}, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "wins" in data
        assert "coachNote" in data
        print("PASS: finish with empty sessionId returns 200")

    def test_finish_session_with_session_id(self, auth_headers):
        """POST with a sessionId returns proper response"""
        today_resp = requests.get(f"{BASE_URL}/api/plan/session/today", headers=auth_headers)
        assert today_resp.status_code == 200
        today_data = today_resp.json()
        session_id = today_data.get("sessionId", "test-session-123")

        resp = requests.post(f"{BASE_URL}/api/session/finish", json={"sessionId": session_id}, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["sessionId"] == session_id
        assert "wins" in data
        assert isinstance(data["wins"], list)
        assert len(data["wins"]) > 0
        print(f"PASS: finish session {session_id} returns 200 with wins")

    def test_finish_session_response_structure(self, auth_headers):
        """Verify response has all expected fields"""
        resp = requests.post(f"{BASE_URL}/api/session/finish", json={"sessionId": "test-123"}, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        required_keys = ["sessionId", "completedSets", "totalSets", "duration", "wins", "flags", "coachNote", "whatsNext"]
        for key in required_keys:
            assert key in data, f"Missing key: {key}"
        print("PASS: response has all required keys")

    def test_plan_session_today_accessible(self, auth_headers):
        """Today session endpoint still works after finish"""
        resp = requests.get(f"{BASE_URL}/api/plan/session/today", headers=auth_headers)
        assert resp.status_code == 200
        print("PASS: /api/plan/session/today accessible after finish")
