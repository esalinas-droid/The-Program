"""
Tests for BUG 2 fixes: goal mapping, profile reset endpoint, and change-log endpoint.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_BACKEND_URL', '').rstrip('/')

def get_token(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json().get("token")

@pytest.fixture(scope="module")
def user_a_token():
    return get_token("user_a@theprogram.app", "StrongmanA123")

@pytest.fixture(scope="module")
def user_b_token():
    return get_token("user_b@theprogram.app", "HypertrophyB123")


class TestProfileReset:
    """Test new /api/profile/reset endpoint (BUG 2C fix)"""

    def test_profile_reset_returns_success(self, user_a_token):
        r = requests.post(
            f"{BASE_URL}/api/profile/reset",
            headers={"Authorization": f"Bearer {user_a_token}"}
        )
        assert r.status_code == 200, f"Reset failed with {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("success") is True, f"Expected success=true, got: {data}"
        print(f"PASS: /api/profile/reset returned success=true")


class TestGoalMapping:
    """Test goal mapping correctness (BUG 2 root causes)"""

    def test_strongman_goal_returns_strongman_plan(self, user_a_token):
        # Reset first
        requests.post(f"{BASE_URL}/api/profile/reset", headers={"Authorization": f"Bearer {user_a_token}"})

        intake_payload = {
            "goal": "Strongman",
            "experience": "advanced",
            "currentBodyweight": 220,
            "bw12WeekGoal": 225,
            "bwLongRunGoal": 230,
            "units": "lbs",
            "injuries": ["SI Joint"],
            "equipment": ["log", "axle", "yoke"],
            "weaknesses": []
        }
        r = requests.post(
            f"{BASE_URL}/api/profile/intake",
            json=intake_payload,
            headers={"Authorization": f"Bearer {user_a_token}"}
        )
        assert r.status_code == 200, f"Intake failed: {r.status_code} {r.text}"
        data = r.json()
        plan_name = data.get("plan", {}).get("planName", data.get("planName", ""))
        print(f"Strongman intake -> planName: '{plan_name}'")
        assert "Strongman" in plan_name, f"Expected 'Strongman' in planName, got: '{plan_name}'"
        print(f"PASS: Strongman goal returns planName containing 'Strongman'")

    def test_hypertrophy_goal_after_reset(self, user_b_token):
        # Reset first
        reset_r = requests.post(f"{BASE_URL}/api/profile/reset", headers={"Authorization": f"Bearer {user_b_token}"})
        assert reset_r.status_code == 200

        intake_payload = {
            "goal": "Hypertrophy",
            "experience": "intermediate",
            "currentBodyweight": 175,
            "bw12WeekGoal": 180,
            "bwLongRunGoal": 185,
            "units": "lbs",
            "injuries": ["knee"],
            "equipment": [],
            "weaknesses": []
        }
        r = requests.post(
            f"{BASE_URL}/api/profile/intake",
            json=intake_payload,
            headers={"Authorization": f"Bearer {user_b_token}"}
        )
        assert r.status_code == 200, f"Intake failed: {r.status_code} {r.text}"
        data = r.json()
        plan_name = data.get("plan", {}).get("planName", data.get("planName", ""))
        print(f"Hypertrophy intake -> planName: '{plan_name}'")
        assert "Hypertrophy" in plan_name, f"Expected 'Hypertrophy' in planName, got: '{plan_name}'"
        print(f"PASS: Hypertrophy goal returns planName containing 'Hypertrophy'")

    def test_general_fitness_goal_returns_general_strength(self, user_a_token):
        # Reset first
        requests.post(f"{BASE_URL}/api/profile/reset", headers={"Authorization": f"Bearer {user_a_token}"})

        intake_payload = {
            "goal": "General Fitness",
            "experience": "beginner",
            "currentBodyweight": 180,
            "bw12WeekGoal": 180,
            "bwLongRunGoal": 180,
            "units": "lbs",
            "injuries": [],
            "equipment": [],
            "weaknesses": []
        }
        r = requests.post(
            f"{BASE_URL}/api/profile/intake",
            json=intake_payload,
            headers={"Authorization": f"Bearer {user_a_token}"}
        )
        assert r.status_code == 200, f"Intake failed: {r.status_code} {r.text}"
        data = r.json()
        plan_name = data.get("plan", {}).get("planName", data.get("planName", ""))
        print(f"General Fitness intake -> planName: '{plan_name}'")
        assert "General Strength" in plan_name or "General" in plan_name, \
            f"Expected 'General Strength' in planName, got: '{plan_name}'"
        print(f"PASS: General Fitness goal returns planName containing 'General Strength'")


class TestChangeLog:
    """Test /api/coach/change-log endpoint"""

    def test_change_log_returns_without_error(self, user_a_token):
        r = requests.get(
            f"{BASE_URL}/api/coach/change-log",
            headers={"Authorization": f"Bearer {user_a_token}"}
        )
        assert r.status_code == 200, f"change-log failed: {r.status_code} {r.text}"
        data = r.json()
        assert "changes" in data, f"Expected 'changes' key, got: {data}"
        assert isinstance(data["changes"], list), f"Expected changes to be a list"
        print(f"PASS: /api/coach/change-log returns changes list (len={len(data['changes'])})")
