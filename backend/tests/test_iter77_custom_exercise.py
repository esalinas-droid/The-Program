"""
Iteration 77 - Custom User-Exercises endpoints tests (backend part of review).

Covers the backend items called out in the review request:
  1. POST /api/user-exercises with full custom-shape body {name, category:'cooldown',
     prescriptionType:'timed', videoUrl, defaultPrescription} then GET list → exercise
     is returned with category/prescriptionType/videoUrl preserved.
  2. POST with minimal body {name} → defaults applied, no 500.
  3. User-scoping: user B's list does NOT contain user A's custom exercise.
"""
import os
import pytest
import requests
from creds import password_for  # passwords live in untracked memory/test_credentials.md

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")

USER_A = {"email": "user_a@theprogram.app", "password": password_for("user_a@theprogram.app")}
USER_B = {"email": "user_b@theprogram.app", "password": password_for("user_b@theprogram.app")}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    body = r.json()
    assert "token" in body, f"login response missing token field: {body}"
    return body["token"]


@pytest.fixture(scope="module")
def token_a():
    return _login(USER_A)


@pytest.fixture(scope="module")
def token_b():
    return _login(USER_B)


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ── (1) Full custom-shape create then GET list preserves all fields ─────────
class TestCreateAndListFullShape:
    created_id = None

    def test_create_full_shape(self, token_a):
        payload = {
            "name": "TEST_QA Cooldown Stretch 77",
            "category": "cooldown",
            "prescriptionType": "timed",
            "videoUrl": "https://youtu.be/xyz123",
            "defaultPrescription": "3x30s",
        }
        r = requests.post(f"{BASE_URL}/api/user-exercises", json=payload, headers=_hdr(token_a), timeout=15)
        assert r.status_code == 200, f"expected 200 got {r.status_code}: {r.text}"
        d = r.json()
        assert d["name"] == payload["name"]
        assert d["category"] == "cooldown"
        assert d["prescriptionType"] == "timed"
        assert d["videoUrl"] == "https://youtu.be/xyz123"
        assert d["defaultPrescription"] == "3x30s"
        assert d["isArchived"] is False
        assert "id" in d and isinstance(d["id"], str) and len(d["id"]) > 0
        TestCreateAndListFullShape.created_id = d["id"]

    def test_list_returns_created(self, token_a):
        assert TestCreateAndListFullShape.created_id is not None, "prior create failed"
        r = requests.get(f"{BASE_URL}/api/user-exercises", headers=_hdr(token_a), timeout=15)
        assert r.status_code == 200
        exs = r.json().get("exercises", [])
        match = next((e for e in exs if e.get("id") == TestCreateAndListFullShape.created_id), None)
        assert match is not None, "created exercise not found in list"
        assert match["category"] == "cooldown"
        assert match["prescriptionType"] == "timed"
        assert match["videoUrl"] == "https://youtu.be/xyz123"
        assert match["defaultPrescription"] == "3x30s"


# ── (2) Minimal body {name} → defaults, no 500 ─────────────────────────────
class TestCreateMinimal:
    def test_create_name_only(self, token_a):
        payload = {"name": "TEST_Minimal 77"}
        r = requests.post(f"{BASE_URL}/api/user-exercises", json=payload, headers=_hdr(token_a), timeout=15)
        assert r.status_code == 200, f"expected 200 got {r.status_code}: {r.text}"
        d = r.json()
        assert d["name"] == "TEST_Minimal 77"
        # category defaults to 'custom'
        assert d["category"] == "custom"
        # optional fields should be present but None/empty (no 500, no missing keys)
        assert d.get("defaultPrescription", "") == ""
        assert d["prescriptionType"] is None
        assert d["videoUrl"] is None
        assert d["isArchived"] is False
        # cleanup
        requests.delete(f"{BASE_URL}/api/user-exercises/{d['id']}", headers=_hdr(token_a), timeout=15)


# ── (3) User-scoping — user B should not see user A's custom exercise ─────
class TestUserScoping:
    def test_user_b_does_not_see_user_a_exercise(self, token_a, token_b):
        # Ensure A has a distinctive exercise
        payload = {"name": "TEST_ScopingProbe_77_UserA", "category": "custom"}
        r = requests.post(f"{BASE_URL}/api/user-exercises", json=payload, headers=_hdr(token_a), timeout=15)
        assert r.status_code == 200
        a_id = r.json()["id"]

        # User A must see it
        ra = requests.get(f"{BASE_URL}/api/user-exercises", headers=_hdr(token_a), timeout=15)
        assert ra.status_code == 200
        a_ids = [e["id"] for e in ra.json()["exercises"]]
        a_names = [e["name"] for e in ra.json()["exercises"]]
        assert a_id in a_ids
        assert "TEST_ScopingProbe_77_UserA" in a_names

        # User B must NOT see it
        rb = requests.get(f"{BASE_URL}/api/user-exercises", headers=_hdr(token_b), timeout=15)
        assert rb.status_code == 200
        b_ids = [e["id"] for e in rb.json()["exercises"]]
        b_names = [e["name"] for e in rb.json()["exercises"]]
        assert a_id not in b_ids, "user B leaked user A's exercise id"
        assert "TEST_ScopingProbe_77_UserA" not in b_names, "user B leaked user A's exercise name"

        # cleanup
        requests.delete(f"{BASE_URL}/api/user-exercises/{a_id}", headers=_hdr(token_a), timeout=15)


# ── Cleanup module-scoped created row ─────────────────────────────────────
def teardown_module(module):
    try:
        tok = _login(USER_A)
        if TestCreateAndListFullShape.created_id:
            requests.delete(
                f"{BASE_URL}/api/user-exercises/{TestCreateAndListFullShape.created_id}",
                headers={"Authorization": f"Bearer {tok}"},
                timeout=15,
            )
    except Exception:
        pass
