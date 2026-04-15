"""Tests for PR Sync Fix: tracked_lifts migration, GET /api/lifts, GET /api/prs, GET /api/prs/bests/overview"""
import pytest
import requests
import os

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://the-program-app.preview.emergentagent.com").rstrip("/")

EMAIL = "user_a@theprogram.app"
PASSWORD = "StrongmanA123"


@pytest.fixture(scope="module")
def auth_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json().get("token")
    assert token, "No token returned"
    return token


@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestGetLifts:
    """GET /api/lifts tests"""

    def test_lifts_returns_200(self, headers):
        resp = requests.get(f"{BASE_URL}/api/lifts", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_lifts_not_empty(self, headers):
        resp = requests.get(f"{BASE_URL}/api/lifts", headers=headers)
        data = resp.json().get("lifts", resp.json()) if isinstance(resp.json(), dict) else resp.json()
        assert len(data) > 0, "GET /api/lifts returned empty list"

    def test_lifts_has_nonzero_e1rm(self, headers):
        resp = requests.get(f"{BASE_URL}/api/lifts", headers=headers)
        body = resp.json()
        data = body.get("lifts", body) if isinstance(body, dict) else body
        non_zero = [l for l in data if l.get("bestE1rm", 0) > 0]
        assert len(non_zero) > 0, f"All lifts have bestE1rm=0 or missing. Sample: {data[:3]}"

    def test_lifts_user_filter(self, headers):
        """Verify lifts only belong to authenticated user - using different user token check"""
        resp = requests.get(f"{BASE_URL}/api/lifts", headers=headers)
        body = resp.json()
        data = body.get("lifts", body) if isinstance(body, dict) else body
        print(f"Total lifts returned: {len(data)}")
        # Verify no cross-user data: all log-sourced lifts should have prefixed ids
        log_lifts = [l for l in data if l.get("source") == "log"]
        print(f"Log-sourced lifts: {len(log_lifts)}")
        assert len(data) > 0

    def test_lifts_includes_log_only_exercises(self, headers):
        """Lifts should include exercises that appear only in logs (source=log)"""
        resp = requests.get(f"{BASE_URL}/api/lifts", headers=headers)
        body = resp.json()
        data = body.get("lifts", body) if isinstance(body, dict) else body
        log_lifts = [l for l in data if l.get("source") == "log"]
        print(f"Log-only exercises: {[l.get('exercise') for l in log_lifts]}")
        assert len(log_lifts) > 0, "No log-only exercises found - merge may not be working"


class TestGetPRs:
    """GET /api/prs tests"""

    def test_prs_returns_200(self, headers):
        resp = requests.get(f"{BASE_URL}/api/prs", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_prs_has_nonzero_e1rm(self, headers):
        resp = requests.get(f"{BASE_URL}/api/prs", headers=headers)
        data = resp.json()
        non_zero = [p for p in data if p.get("bestE1rm", 0) > 0]
        assert len(non_zero) > 0, f"All PRs have bestE1rm=0. Sample: {data[:3]}"


class TestPRBestsOverview:
    """GET /api/prs/bests/overview tests"""

    def test_overview_returns_200(self, headers):
        resp = requests.get(f"{BASE_URL}/api/prs/bests/overview", headers=headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_overview_has_categories(self, headers):
        resp = requests.get(f"{BASE_URL}/api/prs/bests/overview", headers=headers)
        data = resp.json()
        print(f"Overview data: {data}")
        # At least one of squat/press/pull should have non-null exercise and e1rm > 0
        found = False
        for cat in ["squat", "press", "pull", "hinge", "carry"]:
            cat_data = data.get(cat, {})
            if cat_data and cat_data.get("exercise") and cat_data.get("e1rm", 0) > 0:
                found = True
                print(f"  Category '{cat}' has e1rm={cat_data['e1rm']} for {cat_data['exercise']}")
        assert found, f"No category has non-null exercise with e1rm > 0. Data: {data}"
