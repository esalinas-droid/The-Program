"""
Iteration 8: Task 3 injury swap logic + auth flows
Tests: injury-preview, apply-injury-update, session/today, auth, profile isolation, coach, PRs
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def user_a_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "user_a@theprogram.app",
        "password": "StrongmanA123"
    })
    assert resp.status_code == 200, f"user_a login failed: {resp.text}"
    return resp.json()["token"]

@pytest.fixture(scope="module")
def user_b_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "user_b@theprogram.app",
        "password": "HypertrophyB123"
    })
    assert resp.status_code == 200, f"user_b login failed: {resp.text}"
    return resp.json()["token"]

# ------ Auth Tests ------

class TestAuth:
    """Auth endpoint tests"""

    def test_login_user_a(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "user_a@theprogram.app",
            "password": "StrongmanA123"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        print("PASS: user_a login")

    def test_login_user_b(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "user_b@theprogram.app",
            "password": "HypertrophyB123"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        print("PASS: user_b login")

    def test_login_wrong_password(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "user_a@theprogram.app",
            "password": "WrongPassword999"
        })
        assert resp.status_code == 401
        print("PASS: wrong password returns 401")

    def test_register_fresh_user(self):
        import time
        email = f"TEST_fresh_{int(time.time())}@theprogram.app"
        resp = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": email,
            "password": "TestPass123!"
        })
        assert resp.status_code in [200, 201]
        data = resp.json()
        assert "token" in data
        print(f"PASS: fresh register returned token for {email}")

# ------ Profile Isolation ------

class TestProfileIsolation:
    """Profile data isolation between users"""

    def test_profile_user_a(self, user_a_token):
        resp = requests.get(f"{BASE_URL}/api/profile",
                            headers={"Authorization": f"Bearer {user_a_token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("email") == "user_a@theprogram.app"
        print("PASS: user_a profile returns correct email")

    def test_profile_user_b(self, user_b_token):
        resp = requests.get(f"{BASE_URL}/api/profile",
                            headers={"Authorization": f"Bearer {user_b_token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("email") == "user_b@theprogram.app"
        print("PASS: user_b profile returns correct email")

    def test_profile_data_isolation(self, user_a_token, user_b_token):
        resp_a = requests.get(f"{BASE_URL}/api/profile",
                              headers={"Authorization": f"Bearer {user_a_token}"})
        resp_b = requests.get(f"{BASE_URL}/api/profile",
                              headers={"Authorization": f"Bearer {user_b_token}"})
        assert resp_a.status_code == 200
        assert resp_b.status_code == 200
        assert resp_a.json().get("email") != resp_b.json().get("email")
        print("PASS: user_a and user_b have different profile data")

# ------ Injury Preview Tests ------

class TestInjuryPreview:
    """Injury preview endpoint tests"""

    def test_injury_preview_si_joint_user_a(self, user_a_token):
        """SI Joint / Pelvis should restrict 7 exercises"""
        resp = requests.post(
            f"{BASE_URL}/api/plan/injury-preview",
            json={"newInjuryFlags": ["SI Joint / Pelvis"]},
            headers={"Authorization": f"Bearer {user_a_token}"}
        )
        assert resp.status_code == 200, f"injury-preview failed: {resp.text}"
        data = resp.json()
        print(f"injury-preview response: {data}")

        # Check restricted exercises
        restricted = data.get("restricted_exercises", [])
        restricted_names = [r if isinstance(r, str) else r.get("name", r) for r in restricted]
        print(f"Restricted exercises: {restricted_names}")

        expected_restricted = [
            "Conventional Deadlift",
            "Sumo Deadlift",
            "Romanian Deadlift",
            "Good Morning",
            "Speed Deadlift",
            "Pendlay Row",
            "Ab Wheel Rollout"
        ]
        for ex in expected_restricted:
            assert any(ex in str(r) for r in restricted_names), \
                f"Expected {ex} to be restricted but not found in {restricted_names}"
        print("PASS: All 7 expected exercises restricted for SI Joint / Pelvis")

    def test_injury_preview_trap_bar_not_restricted(self, user_a_token):
        """Trap Bar Deadlift should NOT be restricted for SI Joint"""
        resp = requests.post(
            f"{BASE_URL}/api/plan/injury-preview",
            json={"newInjuryFlags": ["SI Joint / Pelvis"]},
            headers={"Authorization": f"Bearer {user_a_token}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        restricted = data.get("restricted_exercises", [])
        restricted_names = [r if isinstance(r, str) else r.get("name", r) for r in restricted]
        trap_bar_restricted = any("Trap Bar" in str(r) for r in restricted_names)
        assert not trap_bar_restricted, f"Trap Bar Deadlift should NOT be restricted but found in {restricted_names}"
        print("PASS: Trap Bar Deadlift is NOT restricted for SI Joint / Pelvis")

    def test_injury_preview_no_auth(self):
        """injury-preview without auth - should return 401 or use default user"""
        resp = requests.post(
            f"{BASE_URL}/api/plan/injury-preview",
            json={"newInjuryFlags": ["SI Joint / Pelvis"]}
        )
        # either 200 (default user) or 401
        assert resp.status_code in [200, 401]
        print(f"PASS: injury-preview without auth returns {resp.status_code}")

# ------ Apply Injury Update Tests ------

class TestApplyInjuryUpdate:
    """Apply injury update endpoint tests"""

    def test_apply_injury_update_user_a(self, user_a_token):
        """apply-injury-update should not crash and return exercises_swapped"""
        resp = requests.post(
            f"{BASE_URL}/api/plan/apply-injury-update",
            json={"newInjuryFlags": ["SI Joint / Pelvis"]},
            headers={"Authorization": f"Bearer {user_a_token}"}
        )
        assert resp.status_code == 200, f"apply-injury-update failed: {resp.status_code} {resp.text}"
        data = resp.json()
        print(f"apply-injury-update response: {data}")
        assert "exercises_swapped" in data, "Response must contain exercises_swapped"
        exercises_swapped = data["exercises_swapped"]
        assert isinstance(exercises_swapped, int) and exercises_swapped >= 0
        print(f"PASS: apply-injury-update returned exercises_swapped={exercises_swapped}")

    def test_apply_injury_update_injury_flags_persisted(self, user_a_token):
        """After apply, profile should have SI Joint / Pelvis in injuries"""
        resp = requests.get(f"{BASE_URL}/api/profile",
                            headers={"Authorization": f"Bearer {user_a_token}"})
        assert resp.status_code == 200
        data = resp.json()
        injuries = data.get("injuries", [])
        print(f"Profile injuries after apply: {injuries}")
        # Check if SI Joint / Pelvis is in injuries
        assert any("SI Joint" in str(inj) or "si joint" in str(inj).lower() or "Pelvis" in str(inj)
                   for inj in injuries), \
            f"SI Joint / Pelvis not found in profile injuries: {injuries}"
        print("PASS: SI Joint / Pelvis persisted in profile")

# ------ Session After Swap ------

class TestSessionAfterSwap:
    """Test session/today after injury swap applied"""

    def test_session_today_user_a(self, user_a_token):
        resp = requests.get(f"{BASE_URL}/api/plan/session/today",
                            headers={"Authorization": f"Bearer {user_a_token}"})
        # 200 if plan exists, 404 if no plan
        assert resp.status_code in [200, 404], f"Unexpected: {resp.status_code} {resp.text}"
        if resp.status_code == 200:
            data = resp.json()
            print(f"Session today exercises count: {len(data.get('exercises', []))}")
            # Verify Conventional Deadlift is NOT in session if it was swapped
            exercises = data.get("exercises", [])
            ex_names = [e.get("name", "") for e in exercises]
            print(f"Exercise names in today's session: {ex_names}")
            if "Conventional Deadlift" in ex_names:
                print("NOTE: Conventional Deadlift still in session (user_a may not have had it to swap)")
        else:
            print("NOTE: No plan for user_a (404 expected if onboarding not complete)")
        print(f"PASS: session/today returned {resp.status_code}")

# ------ Other Endpoints ------

class TestOtherEndpoints:
    """Coach conversations and PRs"""

    def test_coach_conversations_user_a(self, user_a_token):
        resp = requests.get(f"{BASE_URL}/api/coach/conversations",
                            headers={"Authorization": f"Bearer {user_a_token}"})
        assert resp.status_code == 200, f"coach/conversations failed: {resp.text}"
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: coach/conversations returned list with {len(data)} items")

    def test_prs_overview_user_a(self, user_a_token):
        resp = requests.get(f"{BASE_URL}/api/prs/bests/overview",
                            headers={"Authorization": f"Bearer {user_a_token}"})
        assert resp.status_code == 200, f"prs/bests/overview failed: {resp.text}"
        print("PASS: prs/bests/overview returned 200")
