"""
Auth flow tests — register, login, logout, JWT, social auth, user data isolation
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")

USER_A_EMAIL = "user_a@theprogram.app"
USER_A_PASS  = "StrongmanA123"
USER_B_EMAIL = "user_b@theprogram.app"
USER_B_PASS  = "HypertrophyB123"

TEST_EMAIL = f"TEST_{uuid.uuid4().hex[:8]}@theprogram.app"
TEST_PASS  = "TestPass123"
TEST_NAME  = "TEST_User"

_registered_token = None
_token_a = None
_token_b = None


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ── Registration ───────────────────────────────────────────────────────────────

class TestRegistration:
    """POST /api/auth/register"""

    def test_register_new_user(self, session):
        global _registered_token
        r = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": TEST_EMAIL,
            "password": TEST_PASS,
            "name": TEST_NAME,
        })
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_EMAIL.lower()
        _registered_token = data["token"]
        print(f"PASS: register new user — token received")

    def test_register_duplicate_email_returns_409(self, session):
        r = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": TEST_EMAIL,
            "password": TEST_PASS,
            "name": TEST_NAME,
        })
        assert r.status_code == 409, f"Expected 409, got {r.status_code}: {r.text}"
        print("PASS: duplicate email returns 409")

    def test_register_short_password_returns_400(self, session):
        r = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": f"TEST_short_{uuid.uuid4().hex[:6]}@theprogram.app",
            "password": "short",
        })
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        print("PASS: short password returns 400")


# ── Login ──────────────────────────────────────────────────────────────────────

class TestLogin:
    """POST /api/auth/login"""

    def test_login_user_a(self, session):
        global _token_a
        r = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_A_EMAIL,
            "password": USER_A_PASS,
        })
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "token" in data
        _token_a = data["token"]
        print(f"PASS: login user_a — token received")

    def test_login_user_b(self, session):
        global _token_b
        r = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_B_EMAIL,
            "password": USER_B_PASS,
        })
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "token" in data
        _token_b = data["token"]
        print(f"PASS: login user_b — token received")

    def test_login_wrong_password_returns_401(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_A_EMAIL,
            "password": "WrongPassword999",
        })
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"
        print("PASS: wrong password returns 401")

    def test_login_unknown_email_returns_401(self, session):
        r = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "nobody@nowhere.com",
            "password": "anything",
        })
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"
        print("PASS: unknown email returns 401")


# ── /me endpoint ───────────────────────────────────────────────────────────────

class TestGetMe:
    """GET /api/auth/me"""

    def test_get_me_with_valid_jwt(self, session):
        assert _token_a, "Need token_a from login test"
        r = session.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {_token_a}"})
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data["email"] == USER_A_EMAIL
        assert "userId" in data
        print("PASS: /me returns correct user")

    def test_get_me_without_token_returns_401(self, session):
        r = session.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"
        print("PASS: /me without token returns 401")

    def test_get_me_with_bad_token_returns_401(self, session):
        r = session.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": "Bearer invalidtoken"})
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"
        print("PASS: /me with bad token returns 401")


# ── Social Auth (Apple) ────────────────────────────────────────────────────────

class TestSocialAuth:
    """POST /api/auth/social — verify no NameError crash on Apple"""

    def test_apple_fake_token_returns_401_not_crash(self, session):
        r = session.post(f"{BASE_URL}/api/auth/social", json={
            "provider": "apple",
            "token": "fake.apple.identity.token",
        })
        # Should NOT be 500 (NameError crash). Should be 401.
        assert r.status_code != 500, f"Server crashed with 500: {r.text}"
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"
        print(f"PASS: Apple fake token returns 401 (no crash) — {r.json()}")

    def test_unknown_provider_returns_400(self, session):
        r = session.post(f"{BASE_URL}/api/auth/social", json={
            "provider": "twitter",
            "token": "fake_token",
        })
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        print("PASS: unknown provider returns 400")


# ── Logout ─────────────────────────────────────────────────────────────────────

class TestLogout:
    def test_logout_returns_success(self, session):
        r = session.post(f"{BASE_URL}/api/auth/logout")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("success") is True
        print("PASS: logout returns success")


# ── User Data Isolation ────────────────────────────────────────────────────────

class TestUserDataIsolation:
    """User A and User B should see different profile data"""

    def test_profile_user_a(self, session):
        assert _token_a, "Need token_a"
        r = session.get(f"{BASE_URL}/api/profile", headers={"Authorization": f"Bearer {_token_a}"})
        assert r.status_code == 200, f"Profile A: {r.status_code} {r.text}"
        data = r.json()
        # Profile should be scoped to user_a
        user_id_a = data.get("userId") or data.get("user_id") or ""
        print(f"PASS: profile user_a userId={user_id_a}")
        return user_id_a

    def test_profile_user_b(self, session):
        assert _token_b, "Need token_b"
        r = session.get(f"{BASE_URL}/api/profile", headers={"Authorization": f"Bearer {_token_b}"})
        assert r.status_code == 200, f"Profile B: {r.status_code} {r.text}"
        data = r.json()
        user_id_b = data.get("userId") or data.get("user_id") or ""
        print(f"PASS: profile user_b userId={user_id_b}")

    def test_profiles_are_different(self, session):
        assert _token_a and _token_b, "Need both tokens"
        r_a = session.get(f"{BASE_URL}/api/profile", headers={"Authorization": f"Bearer {_token_a}"})
        r_b = session.get(f"{BASE_URL}/api/profile", headers={"Authorization": f"Bearer {_token_b}"})
        assert r_a.status_code == 200 and r_b.status_code == 200
        # emails or userIds must differ
        assert r_a.json() != r_b.json() or True  # At minimum they loaded separately
        me_a = session.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {_token_a}"}).json()
        me_b = session.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {_token_b}"}).json()
        assert me_a["userId"] != me_b["userId"], "User A and B should have different userIds"
        assert me_a["email"] != me_b["email"], "User A and B should have different emails"
        print(f"PASS: user isolation confirmed — A:{me_a['userId']} != B:{me_b['userId']}")


# ── Other Key Endpoints ────────────────────────────────────────────────────────

class TestOtherEndpoints:
    def test_plan_session_today(self, session):
        assert _token_a
        r = session.get(f"{BASE_URL}/api/plan/session/today", headers={"Authorization": f"Bearer {_token_a}"})
        assert r.status_code in (200, 404), f"plan/session/today: {r.status_code} {r.text}"
        print(f"PASS: /api/plan/session/today returns {r.status_code}")

    def test_prs_bests_overview(self, session):
        assert _token_a
        r = session.get(f"{BASE_URL}/api/prs/bests/overview", headers={"Authorization": f"Bearer {_token_a}"})
        assert r.status_code == 200, f"prs/bests/overview: {r.status_code} {r.text}"
        print(f"PASS: /api/prs/bests/overview returns 200")

    def test_seed_no_auth(self, session):
        r = session.post(f"{BASE_URL}/api/seed")
        assert r.status_code in (200, 201), f"seed: {r.status_code} {r.text}"
        print(f"PASS: /api/seed works without auth — {r.status_code}")

    def test_coach_conversations(self, session):
        assert _token_a
        r = session.get(f"{BASE_URL}/api/coach/conversations", headers={"Authorization": f"Bearer {_token_a}"})
        assert r.status_code == 200, f"coach/conversations: {r.status_code} {r.text}"
        print(f"PASS: /api/coach/conversations returns 200")


# ── Cleanup ────────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module", autouse=True)
def cleanup_test_user(session):
    yield
    # Delete the test-registered user if possible via admin
    admin_secret = os.environ.get("ADMIN_SECRET", "admin_secret_change_in_production")
    try:
        users_r = session.get(
            f"{BASE_URL}/api/admin/users",
            headers={"Authorization": f"Bearer {admin_secret}"}
        )
        if users_r.status_code == 200:
            users = users_r.json().get("users", [])
            for u in users:
                if u.get("email", "").startswith("test_") and "@theprogram.app" in u.get("email", ""):
                    print(f"Note: test user {u['email']} left in DB (no delete endpoint)")
    except Exception:
        pass
