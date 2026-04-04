"""
Full onboarding flow tests: register, login, intake (Strongman + Hypertrophy),
PUT /api/profile upsert, GET /api/profile, GET /api/plan/session/today
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")

EMAIL = "onboard_test@test.com"
PASSWORD = "OnboardTest123"

@pytest.fixture(scope="module")
def jwt_token():
    # Try register (ignore if already exists)
    requests.post(f"{BASE_URL}/api/auth/register", json={"email": EMAIL, "password": PASSWORD, "name": "Onboard Test"})
    # Login
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    data = resp.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"No token in response: {data}"
    return token


@pytest.fixture(scope="module")
def auth_headers(jwt_token):
    return {"Authorization": f"Bearer {jwt_token}", "Content-Type": "application/json"}


class TestRegisterLogin:
    def test_register_new_user(self):
        resp = requests.post(f"{BASE_URL}/api/auth/register", json={"email": EMAIL, "password": PASSWORD, "name": "Onboard Test"})
        # 200/201 or 400 if already exists — both acceptable
        assert resp.status_code in (200, 201, 400), f"Unexpected: {resp.text}"
        print(f"Register status: {resp.status_code}")

    def test_login_returns_token(self, jwt_token):
        assert jwt_token, "JWT token must be non-empty"
        print(f"JWT obtained: {jwt_token[:30]}...")


class TestStrongmanIntake:
    def test_strongman_intake_200(self, auth_headers):
        payload = {
            "goal": "Strongman",
            "experience": "Advanced",
            "currentLifts": {"squat": 500, "bench": 350, "deadlift": 600},
            "trainingFrequency": 4,
            "gymType": ["Home Gym"],
            "specialtyEquipment": ["log", "yoke"],
            "injuries": []
        }
        resp = requests.post(f"{BASE_URL}/api/profile/intake", json=payload, headers=auth_headers)
        assert resp.status_code == 200, f"Intake failed: {resp.text}"
        self.__class__.intake_data = resp.json()
        print(f"Strongman intake status: {resp.status_code}")

    def test_strongman_plan_name(self):
        data = self.__class__.intake_data
        plan = data.get("plan", {})
        plan_name = plan.get("planName", "")
        print(f"Plan name: {plan_name}")
        assert "Strongman" in plan_name, f"Expected 'Strongman' in planName, got: '{plan_name}'"

    def test_strongman_user_id_not_default(self):
        data = self.__class__.intake_data
        profile = data.get("profile", {})
        user_id = profile.get("userId", "")
        print(f"userId: {user_id}")
        assert user_id != "user_001", f"userId should not be DEFAULT_USER 'user_001', got: '{user_id}'"
        assert user_id != "", "userId should not be empty"

    def test_strongman_lowercase_goal_also_works(self, auth_headers):
        """Defensive check: lowercase 'strongman' should also work due to case-insensitive lookup"""
        payload = {
            "goal": "strongman",
            "experience": "Advanced",
            "currentLifts": {"squat": 500, "bench": 350, "deadlift": 600},
            "trainingFrequency": 4,
            "gymType": ["Home Gym"],
            "specialtyEquipment": ["log", "yoke"],
            "injuries": []
        }
        resp = requests.post(f"{BASE_URL}/api/profile/intake", json=payload, headers=auth_headers)
        assert resp.status_code == 200, f"Lowercase goal failed: {resp.text}"
        data = resp.json()
        plan_name = data.get("plan", {}).get("planName", "")
        print(f"Lowercase strongman plan name: {plan_name}")
        assert "Strongman" in plan_name or "strongman" in plan_name.lower(), f"Plan name doesn't reflect strongman: {plan_name}"


class TestPutProfile:
    def test_put_profile_upsert_200(self, auth_headers):
        payload = {"experience": "Advanced", "goal": "Strongman", "onboardingComplete": True}
        resp = requests.put(f"{BASE_URL}/api/profile", json=payload, headers=auth_headers)
        assert resp.status_code == 200, f"PUT /api/profile failed: {resp.text}"
        print(f"PUT /api/profile status: {resp.status_code}")

    def test_get_profile_after_upsert(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/profile", headers=auth_headers)
        assert resp.status_code == 200, f"GET /api/profile failed: {resp.text}"
        data = resp.json()
        print(f"Profile data: {data}")
        assert data.get("userId") != "user_001", "Profile userId should not be DEFAULT_USER"


class TestHypertrophyIntake:
    def test_hypertrophy_intake_200(self, auth_headers):
        payload = {
            "goal": "Hypertrophy",
            "experience": "Beginner",
            "currentLifts": {},
            "trainingFrequency": 3,
            "gymType": ["Commercial Gym"],
            "specialtyEquipment": [],
            "injuries": ["Knee (general)"]
        }
        resp = requests.post(f"{BASE_URL}/api/profile/intake", json=payload, headers=auth_headers)
        assert resp.status_code == 200, f"Hypertrophy intake failed: {resp.text}"
        self.__class__.hypertrophy_data = resp.json()
        print(f"Hypertrophy intake status: {resp.status_code}")

    def test_hypertrophy_plan_name(self):
        data = self.__class__.hypertrophy_data
        plan_name = data.get("plan", {}).get("planName", "")
        print(f"Hypertrophy plan name: {plan_name}")
        assert "Hypertrophy" in plan_name, f"Expected 'Hypertrophy' in planName, got: '{plan_name}'"

    def test_hypertrophy_different_from_strongman(self):
        strongman_data = TestStrongmanIntake.intake_data
        hyper_data = self.__class__.hypertrophy_data
        strongman_plan_name = strongman_data.get("plan", {}).get("planName", "")
        hyper_plan_name = hyper_data.get("plan", {}).get("planName", "")
        print(f"Strongman: {strongman_plan_name}, Hypertrophy: {hyper_plan_name}")
        assert strongman_plan_name != hyper_plan_name, "Plans should differ between goals"


class TestTodaySession:
    def test_today_session_200(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/plan/session/today", headers=auth_headers)
        assert resp.status_code == 200, f"Today session failed: {resp.status_code} {resp.text}"
        data = resp.json()
        print(f"Today session keys: {list(data.keys())}")
        assert data, "Today session response should not be empty"
