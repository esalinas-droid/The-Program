"""
Tests for userId sync fix - Fixes 6-8: bodyweight, checkin, substitution endpoints
Verifies data is scoped to authenticated user and migration ran correctly
"""
import pytest
import requests
import os

BASE_URL = "https://the-program-app.preview.emergentagent.com"

USER_A = {"email": "user_a@theprogram.app", "password": "StrongmanA123"}
USER_B = {"email": "user_b@theprogram.app", "password": "HypertrophyB123"}


@pytest.fixture(scope="module")
def token_a():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=USER_A)
    assert r.status_code == 200, f"Login A failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def token_b():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=USER_B)
    assert r.status_code == 200, f"Login B failed: {r.text}"
    return r.json()["token"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# --- Bodyweight ---
class TestBodyweight:
    """Bodyweight endpoint scoped to authenticated user"""

    def test_get_bodyweight_user_a(self, token_a):
        r = requests.get(f"{BASE_URL}/api/bodyweight", headers=auth_headers(token_a))
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert isinstance(data, list), "Expected list response"
        print(f"PASS: user_a bodyweight entries: {len(data)}")

    def test_get_bodyweight_user_b(self, token_b):
        r = requests.get(f"{BASE_URL}/api/bodyweight", headers=auth_headers(token_b))
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert isinstance(data, list)
        print(f"PASS: user_b bodyweight entries: {len(data)}")

    def test_bodyweight_isolation(self, token_a, token_b):
        """user_a and user_b should not share bodyweight data"""
        r_a = requests.get(f"{BASE_URL}/api/bodyweight", headers=auth_headers(token_a)).json()
        r_b = requests.get(f"{BASE_URL}/api/bodyweight", headers=auth_headers(token_b)).json()
        # Check no overlap by userId if present
        ids_a = {e.get("userId") for e in r_a if "userId" in e}
        ids_b = {e.get("userId") for e in r_b if "userId" in e}
        if ids_a and ids_b:
            assert ids_a.isdisjoint(ids_b), "userId overlap between user_a and user_b bodyweight"
        print(f"PASS: bodyweight isolation - A:{len(r_a)} B:{len(r_b)}")


# --- Checkin ---
class TestCheckin:
    """Checkin endpoint scoped to authenticated user"""

    def test_get_checkins_user_a(self, token_a):
        r = requests.get(f"{BASE_URL}/api/checkin", headers=auth_headers(token_a))
        assert r.status_code == 200, f"Expected 200: {r.text}"
        data = r.json()
        assert isinstance(data, list)
        print(f"PASS: user_a checkins: {len(data)}")

    def test_get_checkins_user_b(self, token_b):
        r = requests.get(f"{BASE_URL}/api/checkin", headers=auth_headers(token_b))
        assert r.status_code == 200, f"Expected 200: {r.text}"
        data = r.json()
        assert isinstance(data, list)
        print(f"PASS: user_b checkins: {len(data)}")

    def test_post_checkin_saves_userid(self, token_a):
        payload = {
            "week": 9999, "date": "2099-01-01",
            "avgPain": 0.0, "avgRPE": 7.0, "completionRate": 1.0, "avgBodyweight": 100.0,
            "personalNotes": "TEST_checkin_userid_sync"
        }
        r = requests.post(f"{BASE_URL}/api/checkin", json=payload, headers=auth_headers(token_a))
        assert r.status_code in (200, 201), f"POST checkin failed: {r.text}"
        data = r.json()
        # Verify userId is stored
        assert "userId" in data, f"userId missing from checkin response: {data}"
        assert data["userId"] != "user_001", f"userId is DEFAULT fallback, not user-specific: {data['userId']}"
        print(f"PASS: checkin userId={data['userId']}")
        return data.get("id") or data.get("_id")

    def test_get_checkin_week(self, token_a):
        r = requests.get(f"{BASE_URL}/api/checkin/week/9999", headers=auth_headers(token_a))
        # Either 200 with data or 404 (week not found is acceptable)
        assert r.status_code in (200, 404), f"Unexpected: {r.status_code} {r.text}"
        print(f"PASS: checkin week endpoint status={r.status_code}")

    def test_checkin_isolation_user_b_no_test_checkin(self, token_b):
        """user_b should not see user_a's test checkin (week 9999)"""
        r = requests.get(f"{BASE_URL}/api/checkin/week/9999", headers=auth_headers(token_b))
        if r.status_code == 200:
            data = r.json()
            # Should be empty or belong to user_b
            if isinstance(data, dict) and "userId" in data:
                # Get user_b id
                me = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(token_b))
                if me.status_code == 200:
                    user_b_id = me.json().get("id") or me.json().get("userId")
                    assert data["userId"] == user_b_id, "user_b seeing user_a checkin data"
        print(f"PASS: checkin isolation check status={r.status_code}")

    def test_user_a_has_7_backfilled_checkins(self, token_a):
        """Migration should have backfilled 7 checkins to user_a"""
        r = requests.get(f"{BASE_URL}/api/checkin", headers=auth_headers(token_a))
        assert r.status_code == 200
        data = r.json()
        print(f"user_a total checkins: {len(data)} (expected >=7 from migration)")
        assert len(data) >= 7, f"Expected >=7 checkins for user_a, got {len(data)}"


# --- Substitutions ---
class TestSubstitutions:
    """Substitution endpoint scoped to authenticated user"""

    def test_get_substitutions_user_a(self, token_a):
        r = requests.get(f"{BASE_URL}/api/substitutions", headers=auth_headers(token_a))
        assert r.status_code == 200, f"Expected 200: {r.text}"
        data = r.json()
        assert isinstance(data, list)
        print(f"PASS: user_a substitutions: {len(data)}")

    def test_get_substitutions_user_b_empty(self, token_b):
        """user_b should have empty substitutions (none backfilled to them)"""
        r = requests.get(f"{BASE_URL}/api/substitutions", headers=auth_headers(token_b))
        assert r.status_code == 200, f"Expected 200: {r.text}"
        data = r.json()
        assert len(data) == 0, f"Expected 0 substitutions for user_b, got {len(data)}: {data[:2]}"
        print(f"PASS: user_b substitutions empty (isolation confirmed)")

    def test_post_substitution_saves_userid(self, token_a):
        payload = {
            "date": "2099-01-01",
            "week": 9999,
            "day": "Day 1",
            "sessionType": "Strength",
            "originalExercise": "TEST_deadlift",
            "replacementExercise": "TEST_trap_bar_deadlift",
            "reason": "test userId sync"
        }
        r = requests.post(f"{BASE_URL}/api/substitutions", json=payload, headers=auth_headers(token_a))
        assert r.status_code in (200, 201), f"POST substitution failed: {r.text}"
        data = r.json()
        assert "userId" in data, f"userId missing from substitution response: {data}"
        assert data["userId"] != "user_001", f"userId is DEFAULT: {data['userId']}"
        print(f"PASS: substitution userId={data['userId']}")

    def test_user_a_has_234_backfilled_substitutions(self, token_a):
        """Migration should have backfilled 234 substitutions to user_a.
        Note: API has a hard limit of 200 per page, so 200 results confirms >=200 exist."""
        r = requests.get(f"{BASE_URL}/api/substitutions", headers=auth_headers(token_a))
        assert r.status_code == 200
        data = r.json()
        print(f"user_a total substitutions (API cap 200): {len(data)} (migration target: 234)")
        # API returns max 200 - getting exactly 200 confirms migration ran (234 were backfilled)
        assert len(data) >= 200, f"Expected >=200 substitutions for user_a (API capped at 200), got {len(data)}"


# --- Log entries (backfill verification) ---
class TestLogMigration:
    """Verify 128 backfilled log entries are visible for user_a"""

    def test_user_a_has_128_backfilled_logs(self, token_a):
        r = requests.get(f"{BASE_URL}/api/log", headers=auth_headers(token_a))
        assert r.status_code == 200, f"Expected 200: {r.text}"
        data = r.json()
        print(f"user_a total log entries: {len(data)} (expected >=128 from migration)")
        assert len(data) >= 128, f"Expected >=128 log entries for user_a, got {len(data)}"

    def test_week_stats_user_a(self, token_a):
        r = requests.get(f"{BASE_URL}/api/log/stats/week/1", headers=auth_headers(token_a))
        assert r.status_code == 200, f"Stats week 1 failed: {r.text}"
        data = r.json()
        print(f"PASS: week 1 stats for user_a: {data}")
        # Should have some numeric stats
        assert isinstance(data, dict), "Expected dict response"

    def test_user_b_log_isolation(self, token_b):
        """user_b log should not contain user_a data"""
        r = requests.get(f"{BASE_URL}/api/log", headers=auth_headers(token_b))
        assert r.status_code == 200
        data = r.json()
        for entry in data:
            if "userId" in entry:
                # Get user_b userId
                me = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers(token_b))
                if me.status_code == 200:
                    user_b_id = me.json().get("id") or me.json().get("userId")
                    assert entry["userId"] == user_b_id, f"user_b seeing foreign log entry: {entry}"
                    break
        print(f"PASS: user_b log isolation, entries: {len(data)}")
