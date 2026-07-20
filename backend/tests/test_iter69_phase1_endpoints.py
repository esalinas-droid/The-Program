"""
Tests for Phase 1 features:
- PATCH /programs/{programId}/sessions/{sessionId}/exercises/{exerciseId}/category
- PATCH /programs/{programId}/sessions/{sessionId}/exercises/{exerciseId}/order
- GET /plan/session/today (planId field)
- POST /profile/switch-mode (program and free modes)
"""
import pytest
import requests
import os
from creds import password_for  # passwords live in untracked memory/test_credentials.md

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")

# Credentials
USER_A = {"email": "user_a@theprogram.app", "password": password_for("user_a@theprogram.app")}
USER_B = {"email": "user_b@theprogram.app", "password": password_for("user_b@theprogram.app")}


@pytest.fixture(scope="module")
def token_a():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=USER_A)
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def token_b():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=USER_B)
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── GET /plan/session/today (planId field) ────────────────────────────────────

class TestTodaySessionPlanId:
    def test_today_returns_plan_id_field(self, token_a):
        r = requests.get(f"{BASE_URL}/api/plan/session/today", headers=auth(token_a))
        if r.status_code == 200:
            data = r.json()
            assert "planId" in data, f"planId missing in today response: {list(data.keys())}"
            print(f"PASS: planId present in today response: '{data['planId']}'")
        elif r.status_code == 404:
            print("SKIP: No session today (rest day) — planId check skipped")
        else:
            pytest.fail(f"Unexpected status {r.status_code}: {r.text}")

    def test_today_returns_plan_id_field_user_b(self, token_b):
        r = requests.get(f"{BASE_URL}/api/plan/session/today", headers=auth(token_b))
        if r.status_code == 200:
            data = r.json()
            assert "planId" in data, f"planId missing in today response"
            print(f"PASS: planId present for user_b: '{data['planId']}'")
        elif r.status_code == 404:
            print("SKIP: No session today for user_b")
        else:
            pytest.fail(f"Unexpected status {r.status_code}: {r.text}")


# ── POST /profile/switch-mode ─────────────────────────────────────────────────

class TestSwitchMode:
    def test_switch_to_free_mode(self, token_a):
        r = requests.post(f"{BASE_URL}/api/profile/switch-mode",
                          json={"mode": "free"}, headers=auth(token_a))
        assert r.status_code == 200, f"Expected 200: {r.text}"
        data = r.json()
        assert data["success"] is True
        assert data["mode"] == "free"
        assert data["needsPathChoice"] is False
        assert "profile" in data
        print("PASS: switch to free mode works")

    def test_switch_to_program_mode(self, token_a):
        r = requests.post(f"{BASE_URL}/api/profile/switch-mode",
                          json={"mode": "program"}, headers=auth(token_a))
        assert r.status_code == 200, f"Expected 200: {r.text}"
        data = r.json()
        assert data["success"] is True
        assert data["mode"] == "program"
        assert data["needsPathChoice"] is True
        assert "profile" in data
        print("PASS: switch to program mode works, needsPathChoice=True")

    def test_switch_mode_invalid(self, token_a):
        r = requests.post(f"{BASE_URL}/api/profile/switch-mode",
                          json={"mode": "invalid"}, headers=auth(token_a))
        assert r.status_code == 400
        print("PASS: invalid mode returns 400")

    def test_switch_mode_no_auth(self):
        r = requests.post(f"{BASE_URL}/api/profile/switch-mode", json={"mode": "free"})
        assert r.status_code in (401, 403)
        print("PASS: unauthenticated request rejected")


# ── Module-level fixture for exercise session context using user_b ─────────────

@pytest.fixture(scope="module")
def exercise_session_context(token_b):
    """Get planId, sessionId, exerciseId from today's session for user_b."""
    r = requests.get(f"{BASE_URL}/api/plan/session/today", headers=auth(token_b))
    if r.status_code != 200:
        pytest.skip(f"No session today for user_b (status {r.status_code})")
    data = r.json()
    plan_id = data.get("planId")
    session = data.get("session") or {}
    session_id = session.get("sessionId")
    exercises = session.get("exercises", [])
    if not plan_id or not session_id or not exercises:
        pytest.skip(f"Missing data: planId={plan_id}, sessionId={session_id}, exCount={len(exercises)}")
    exercise_id = exercises[0].get("sessionExerciseId")
    if not exercise_id:
        pytest.skip(f"No sessionExerciseId on first exercise (name: {exercises[0].get('name')})")
    return {
        "planId": plan_id,
        "sessionId": session_id,
        "exerciseId": exercise_id,
        "originalCategory": exercises[0].get("category", "main"),
    }


# ── PATCH exercise category / order ──────────────────────────────────────────

class TestExerciseCategoryAndOrder:
    def test_update_exercise_category(self, token_b, exercise_session_context):
        ctx = exercise_session_context
        new_cat = "accessory" if ctx["originalCategory"] != "accessory" else "supplemental"
        r = requests.patch(
            f"{BASE_URL}/api/programs/{ctx['planId']}/sessions/{ctx['sessionId']}/exercises/{ctx['exerciseId']}/category",
            json={"category": new_cat},
            headers=auth(token_b)
        )
        assert r.status_code == 200, f"category PATCH failed: {r.text}"
        data = r.json()
        assert data["success"] is True
        assert data["category"] == new_cat
        assert "updatedSessions" in data
        assert data["updatedSessions"] >= 1
        print(f"PASS: category changed to '{new_cat}' in {data['updatedSessions']} sessions")

    def test_update_exercise_category_invalid(self, token_b, exercise_session_context):
        ctx = exercise_session_context
        r = requests.patch(
            f"{BASE_URL}/api/programs/{ctx['planId']}/sessions/{ctx['sessionId']}/exercises/{ctx['exerciseId']}/category",
            json={"category": "invalid_cat"},
            headers=auth(token_b)
        )
        assert r.status_code == 400
        print("PASS: invalid category returns 400")

    def test_move_exercise_down(self, token_b, exercise_session_context):
        ctx = exercise_session_context
        r = requests.patch(
            f"{BASE_URL}/api/programs/{ctx['planId']}/sessions/{ctx['sessionId']}/exercises/{ctx['exerciseId']}/order",
            json={"direction": "down"},
            headers=auth(token_b)
        )
        assert r.status_code == 200, f"order PATCH failed: {r.text}"
        data = r.json()
        assert data["success"] is True
        assert data["direction"] == "down"
        assert "updatedSessions" in data
        print(f"PASS: exercise moved down in {data['updatedSessions']} sessions")

    def test_move_exercise_up(self, token_b, exercise_session_context):
        ctx = exercise_session_context
        r = requests.patch(
            f"{BASE_URL}/api/programs/{ctx['planId']}/sessions/{ctx['sessionId']}/exercises/{ctx['exerciseId']}/order",
            json={"direction": "up"},
            headers=auth(token_b)
        )
        assert r.status_code == 200, f"order PATCH failed: {r.text}"
        data = r.json()
        assert data["success"] is True
        assert data["direction"] == "up"
        print(f"PASS: exercise moved up in {data['updatedSessions']} sessions")

    def test_move_exercise_invalid_direction(self, token_b, exercise_session_context):
        ctx = exercise_session_context
        r = requests.patch(
            f"{BASE_URL}/api/programs/{ctx['planId']}/sessions/{ctx['sessionId']}/exercises/{ctx['exerciseId']}/order",
            json={"direction": "sideways"},
            headers=auth(token_b)
        )
        assert r.status_code == 400
        print("PASS: invalid direction returns 400")

    def test_exercise_endpoints_wrong_plan_id(self, token_b, exercise_session_context):
        ctx = exercise_session_context
        r = requests.patch(
            f"{BASE_URL}/api/programs/NONEXISTENT_PLAN/sessions/{ctx['sessionId']}/exercises/{ctx['exerciseId']}/category",
            json={"category": "main"},
            headers=auth(token_b)
        )
        assert r.status_code == 404
        print("PASS: non-existent plan returns 404")
