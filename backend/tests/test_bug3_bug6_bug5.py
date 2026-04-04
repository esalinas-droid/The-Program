"""
Tests for BUG 3 (goal mapping in intake), BUG 6 (changelog API), BUG 5 (log creation/listing)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

def get_token(email, password):
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json().get("token") or resp.json().get("access_token")

@pytest.fixture(scope="module")
def user_a_token():
    return get_token("user_a@theprogram.app", "StrongmanA123")

# BUG 3: Goal mapping tests
class TestGoalMapping:
    """BUG 3 - POST /api/profile/intake goal mapping to plan name"""

    def test_strongman_goal_returns_strongman_plan(self, user_a_token):
        headers = {"Authorization": f"Bearer {user_a_token}"}
        payload = {
            "name": "Test User A",
            "goal": "Strongman",
            "experience": "advanced",
            "trainingDays": 4,
            "injuries": [],
            "gymTypes": [],
            "equipmentAccess": []
        }
        resp = requests.post(f"{BASE_URL}/api/profile/intake", json=payload, headers=headers)
        assert resp.status_code == 200, f"Intake failed: {resp.text}"
        data = resp.json()
        plan_name = data.get("plan_name") or data.get("program_name") or str(data)
        print(f"Plan name returned for Strongman: {plan_name}")
        assert "Strongman" in plan_name or "strongman" in plan_name.lower(), \
            f"Expected 'Strongman' in plan name, got: {plan_name}"

    def test_general_fitness_goal_returns_general_plan(self, user_a_token):
        headers = {"Authorization": f"Bearer {user_a_token}"}
        payload = {
            "name": "Test User A",
            "goal": "General Fitness",
            "experience": "beginner",
            "trainingDays": 3,
            "injuries": [],
            "gymTypes": [],
            "equipmentAccess": []
        }
        resp = requests.post(f"{BASE_URL}/api/profile/intake", json=payload, headers=headers)
        assert resp.status_code == 200, f"Intake failed: {resp.text}"
        data = resp.json()
        plan_name = data.get("plan_name") or data.get("program_name") or str(data)
        print(f"Plan name returned for General Fitness: {plan_name}")
        assert "General" in plan_name or "general" in plan_name.lower() or "Fitness" in plan_name, \
            f"Expected 'General' in plan name, got: {plan_name}"


# BUG 6: Changelog API
class TestChangelogAPI:
    """BUG 6 - GET /api/coach/change-log should return {changes: []} without 500"""

    def test_changelog_returns_200(self, user_a_token):
        headers = {"Authorization": f"Bearer {user_a_token}"}
        resp = requests.get(f"{BASE_URL}/api/coach/change-log", headers=headers)
        assert resp.status_code == 200, f"Changelog returned {resp.status_code}: {resp.text}"

    def test_changelog_returns_changes_list(self, user_a_token):
        headers = {"Authorization": f"Bearer {user_a_token}"}
        resp = requests.get(f"{BASE_URL}/api/coach/change-log", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        print(f"Changelog response: {data}")
        assert "changes" in data, f"Expected 'changes' key, got: {data}"
        assert isinstance(data["changes"], list), f"Expected list, got: {type(data['changes'])}"


# BUG 5: Log creation and listing
class TestLogCRUD:
    """BUG 5 - POST /api/log creates entry, GET /api/log lists entries"""

    def test_create_log_entry(self, user_a_token):
        headers = {"Authorization": f"Bearer {user_a_token}"}
        payload = {
            "date": "2026-01-15",
            "week": 1,
            "day": "Monday",
            "sessionType": "Squat",
            "exercise": "Squat",
            "sets": 3,
            "weight": 135.0,
            "reps": 5,
            "rpe": 7.0,
            "pain": 0,
            "completed": "yes",
            "notes": "TEST_ log entry for bug5 verification"
        }
        resp = requests.post(f"{BASE_URL}/api/log", json=payload, headers=headers)
        print(f"Create log status: {resp.status_code}, body: {resp.text[:300]}")
        assert resp.status_code in [200, 201], f"Log creation failed: {resp.text}"

    def test_list_log_entries(self, user_a_token):
        headers = {"Authorization": f"Bearer {user_a_token}"}
        resp = requests.get(f"{BASE_URL}/api/log", headers=headers)
        print(f"List log status: {resp.status_code}, body: {resp.text[:300]}")
        assert resp.status_code == 200, f"Log listing failed: {resp.text}"
        data = resp.json()
        assert isinstance(data, list) or isinstance(data, dict), f"Unexpected response: {data}"
