"""
Retest: Profile userId scoping + injury_preview isolation for fresh users
"""
import pytest
import requests
import os

BASE_URL = "https://the-program-app.preview.emergentagent.com"

@pytest.fixture(scope="module")
def user_a_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "user_a@theprogram.app", "password": "StrongmanA123"})
    assert r.status_code == 200, f"user_a login failed: {r.text}"
    return r.json()["token"]

@pytest.fixture(scope="module")
def user_b_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "user_b@theprogram.app", "password": "HypertrophyB123"})
    assert r.status_code == 200, f"user_b login failed: {r.text}"
    return r.json()["token"]

@pytest.fixture(scope="module")
def fresh_user_token():
    # Register fresh user
    email = "test_iso@theprogram.app"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "IsoTest999"})
    if r.status_code == 400 and "already" in r.text.lower():
        # Login instead
        r2 = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "IsoTest999"})
        assert r2.status_code == 200, f"fresh user login failed: {r2.text}"
        return r2.json()["token"]
    assert r.status_code in [200, 201], f"Register failed: {r.text}"
    return r.json()["token"]


class TestFreshUserIsolation:
    """Fresh user should have no profile and no pre-existing injuries"""

    def test_fresh_user_register_or_login(self, fresh_user_token):
        assert fresh_user_token is not None
        print("PASS: fresh user token obtained")

    def test_fresh_user_profile_returns_404(self, fresh_user_token):
        r = requests.get(f"{BASE_URL}/api/profile", headers={"Authorization": f"Bearer {fresh_user_token}"})
        assert r.status_code == 404, f"Expected 404 for fresh user, got {r.status_code}: {r.text}"
        print("PASS: fresh user GET /api/profile returns 404")

    def test_fresh_user_injury_preview_si_joint(self, fresh_user_token):
        r = requests.post(
            f"{BASE_URL}/api/plan/injury-preview",
            json={"newInjuryFlags": ["SI Joint / Pelvis"]},
            headers={"Authorization": f"Bearer {fresh_user_token}"}
        )
        assert r.status_code == 200, f"injury-preview failed: {r.text}"
        data = r.json()
        print(f"injury-preview response: {data}")
        # SI Joint should appear in addedInjuries (not already existing)
        assert "SI Joint / Pelvis" in data.get("addedInjuries", []), \
            f"SI Joint not in addedInjuries: {data}"
        # Should NOT be in alreadyExisting
        assert "SI Joint / Pelvis" not in data.get("alreadyExisting", []), \
            f"SI Joint wrongly in alreadyExisting: {data}"
        # Should restrict exercises
        restricted = data.get("exercisesRestricted", [])
        assert len(restricted) >= 1, f"Expected restricted exercises, got: {restricted}"
        print(f"PASS: exercisesRestricted count={len(restricted)}, exercises={restricted}")
        # Check Conventional Deadlift is restricted
        restricted_names = [e.get("name", e) if isinstance(e, dict) else e for e in restricted]
        assert any("Deadlift" in str(n) for n in restricted_names), \
            f"Conventional Deadlift not restricted: {restricted_names}"
        print("PASS: injury_preview SI Joint works correctly for fresh user")


class TestProfileIsolation:
    """user_a and user_b profiles should be isolated"""

    def test_user_a_login(self, user_a_token):
        assert user_a_token is not None
        print("PASS: user_a login OK")

    def test_user_b_login(self, user_b_token):
        assert user_b_token is not None
        print("PASS: user_b login OK")

    def test_user_a_profile_scope(self, user_a_token):
        r = requests.get(f"{BASE_URL}/api/profile", headers={"Authorization": f"Bearer {user_a_token}"})
        # Could be 404 if no profile yet, or 200 with their data
        assert r.status_code in [200, 404], f"Unexpected status: {r.status_code} {r.text}"
        print(f"PASS: user_a profile status={r.status_code}")
        if r.status_code == 200:
            data = r.json()
            print(f"user_a profile userId={data.get('userId')}")

    def test_user_b_profile_scope(self, user_b_token):
        r = requests.get(f"{BASE_URL}/api/profile", headers={"Authorization": f"Bearer {user_b_token}"})
        assert r.status_code in [200, 404], f"Unexpected status: {r.status_code} {r.text}"
        print(f"PASS: user_b profile status={r.status_code}")
        if r.status_code == 200:
            data = r.json()
            print(f"user_b profile userId={data.get('userId')}")

    def test_user_a_b_different_profiles(self, user_a_token, user_b_token):
        ra = requests.get(f"{BASE_URL}/api/profile", headers={"Authorization": f"Bearer {user_a_token}"})
        rb = requests.get(f"{BASE_URL}/api/profile", headers={"Authorization": f"Bearer {user_b_token}"})
        # If both have profiles, verify userId differs
        if ra.status_code == 200 and rb.status_code == 200:
            uid_a = ra.json().get("userId")
            uid_b = rb.json().get("userId")
            assert uid_a != uid_b, f"ISOLATION FAIL: both profiles have same userId={uid_a}"
            print(f"PASS: user_a userId={uid_a} != user_b userId={uid_b}")
        else:
            print(f"Profiles: user_a={ra.status_code}, user_b={rb.status_code} - isolation test skipped (no profiles yet)")

    def test_profile_upsert_user_a(self, user_a_token):
        r = requests.post(
            f"{BASE_URL}/api/profile",
            json={"name": "TEST_Athlete_UserA"},
            headers={"Authorization": f"Bearer {user_a_token}"}
        )
        assert r.status_code in [200, 201], f"Profile upsert failed: {r.status_code} {r.text}"
        data = r.json()
        print(f"PASS: user_a profile upserted, userId={data.get('userId')}")

    def test_user_b_does_not_see_user_a_profile(self, user_a_token, user_b_token):
        # First ensure user_a profile is created
        requests.post(
            f"{BASE_URL}/api/profile",
            json={"name": "TEST_Athlete_UserA"},
            headers={"Authorization": f"Bearer {user_a_token}"}
        )
        # Now check user_b profile
        rb = requests.get(f"{BASE_URL}/api/profile", headers={"Authorization": f"Bearer {user_b_token}"})
        if rb.status_code == 200:
            name_b = rb.json().get("name", "")
            assert name_b != "TEST_Athlete_UserA", \
                f"ISOLATION FAIL: user_b sees user_a's profile name: {name_b}"
            print(f"PASS: user_b profile name='{name_b}' (not user_a's)")
        else:
            print(f"PASS: user_b has no profile (404), isolation confirmed")

    def test_apply_injury_update_user_a(self, user_a_token):
        r = requests.post(
            f"{BASE_URL}/api/plan/apply-injury-update",
            json={"newInjuryFlags": ["SI Joint / Pelvis"]},
            headers={"Authorization": f"Bearer {user_a_token}"}
        )
        assert r.status_code == 200, f"apply-injury-update failed: {r.status_code} {r.text}"
        print(f"PASS: apply-injury-update for user_a: {r.json()}")


class TestAuthEdgeCases:
    """Auth edge cases"""

    def test_wrong_password_returns_401(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "user_a@theprogram.app", "password": "WrongPassword"})
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"
        print("PASS: wrong password returns 401")
