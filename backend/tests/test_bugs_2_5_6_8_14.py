"""
Bug regression tests for Bugs 2, 5, 6, 8, 14
- Bug 2+6+14: Onboarding with auth, all fields sent, bodyweight included
- Bug 5: Goal-specific exercises
- Bug 8: Settings save flow (injury-preview, apply-injury-update, change-log)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")

# Test user credentials
STRONGMAN_EMAIL = "test_strongman@test.com"
STRONGMAN_PASS = "TestPass123"
HYPERTROPHY_EMAIL = "test_hypertrophy@test.com"
HYPERTROPHY_PASS = "TestPass123"


@pytest.fixture(scope="module")
def strongman_token():
    """Register + login strongman user, return JWT token."""
    session = requests.Session()
    # Try register first (may already exist)
    session.post(f"{BASE_URL}/api/auth/register", json={
        "email": STRONGMAN_EMAIL,
        "password": STRONGMAN_PASS,
        "name": "Test Strongman"
    })
    # Login
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": STRONGMAN_EMAIL,
        "password": STRONGMAN_PASS
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json().get("token") or resp.json().get("access_token")
    assert token, f"No token in response: {resp.json()}"
    return token


@pytest.fixture(scope="module")
def hypertrophy_token():
    """Register + login hypertrophy user, return JWT token."""
    session = requests.Session()
    session.post(f"{BASE_URL}/api/auth/register", json={
        "email": HYPERTROPHY_EMAIL,
        "password": HYPERTROPHY_PASS,
        "name": "Test Hypertrophy"
    })
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": HYPERTROPHY_EMAIL,
        "password": HYPERTROPHY_PASS
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json().get("token") or resp.json().get("access_token")
    assert token, f"No token in response: {resp.json()}"
    return token


@pytest.fixture(scope="module")
def strongman_intake_response(strongman_token):
    """POST intake for strongman user."""
    headers = {"Authorization": f"Bearer {strongman_token}"}
    payload = {
        "goal": "strongman",
        "experience": "advanced",
        "lifts": {"squat": 500, "bench": 350, "deadlift": 600},
        "liftUnit": "lbs",
        "frequency": 4,
        "injuries": ["Shoulder (general)"],
        "gym": ["Home Gym"],
        "bodyweight": 220,
        "primaryWeaknesses": ["Overhead Strength", "Grip"],
        "specialtyEquipment": ["log", "axle", "yoke", "chains", "bands"],
        "sleepHours": 7,
        "stressLevel": "moderate"
    }
    resp = requests.post(f"{BASE_URL}/api/profile/intake", json=payload, headers=headers)
    assert resp.status_code == 200, f"Intake failed: {resp.text}"
    return resp.json()


@pytest.fixture(scope="module")
def hypertrophy_intake_response(hypertrophy_token):
    """POST intake for hypertrophy user."""
    headers = {"Authorization": f"Bearer {hypertrophy_token}"}
    payload = {
        "goal": "hypertrophy",
        "experience": "beginner",
        "lifts": {"squat": 185, "bench": 135, "deadlift": 225},
        "liftUnit": "lbs",
        "frequency": 4,
        "injuries": ["Knee (general)"],
        "gym": ["Commercial Gym"],
        "bodyweight": 165
    }
    resp = requests.post(f"{BASE_URL}/api/profile/intake", json=payload, headers=headers)
    assert resp.status_code == 200, f"Intake failed: {resp.text}"
    return resp.json()


# ── BUG 2+6+14: Auth flow, all fields, bodyweight ─────────────────────────────

class TestAuthRegisterLogin:
    """Bug 2: Onboarding uses auth (JWT), not DEFAULT_USER"""

    def test_register_strongman(self):
        resp = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": STRONGMAN_EMAIL, "password": STRONGMAN_PASS, "name": "Test Strongman"
        })
        assert resp.status_code in (200, 201, 409), f"Register: {resp.text}"
        print(f"Register strongman: {resp.status_code}")

    def test_login_strongman(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": STRONGMAN_EMAIL, "password": STRONGMAN_PASS
        })
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        data = resp.json()
        assert "token" in data or "access_token" in data, f"No token: {data}"
        print(f"Login strongman OK, userId in response: {data.get('userId') or data.get('user', {}).get('userId')}")

    def test_register_hypertrophy(self):
        resp = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": HYPERTROPHY_EMAIL, "password": HYPERTROPHY_PASS, "name": "Test Hypertrophy"
        })
        assert resp.status_code in (200, 201, 409), f"Register: {resp.text}"

    def test_login_hypertrophy(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": HYPERTROPHY_EMAIL, "password": HYPERTROPHY_PASS
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data or "access_token" in data


class TestStrongmanIntake:
    """Bug 6: All fields sent. Bug 14: Bodyweight sent. Bug 2: userId is from JWT (not DEFAULT_USER)"""

    def test_intake_success(self, strongman_intake_response):
        assert strongman_intake_response.get("success") is True
        print("Strongman intake success=True")

    def test_profile_has_userId(self, strongman_intake_response):
        profile = strongman_intake_response.get("profile", {})
        user_id = profile.get("userId")
        assert user_id is not None, f"No userId in profile: {profile.keys()}"
        assert user_id != "user_001", f"userId is DEFAULT_USER! Bug 2 not fixed. Got: {user_id}"
        print(f"Strongman userId: {user_id}")

    def test_bodyweight_in_profile(self, strongman_intake_response):
        """Bug 14: bodyweight should be stored/returned"""
        profile = strongman_intake_response.get("profile", {})
        bw = profile.get("bodyweight") or profile.get("currentBodyweight")
        assert bw == 220, f"Expected bodyweight=220, got: {bw}"
        print(f"Bodyweight stored: {bw}")

    def test_me_upper_log_press(self, strongman_intake_response):
        """Bug 5+6: Strongman with log equipment. 
        NOTE: User has Shoulder (general) injury which blocks Log Press.
        Shoulder injury blocks: Floor Press, Speed Bench, 2-Board Press, Close-Grip Bench, Incline Bench, Log Press, Axle Press
        So fallback is expected. Verify it's NOT Floor Press (also blocked), i.e., injury filter works.
        """
        plan = strongman_intake_response.get("plan", {})
        me_upper_exercises = _get_session_exercises(plan, "ME_UPPER")
        main_exercises = [e["name"] for e in me_upper_exercises if e.get("category") == "main"]
        print(f"ME Upper main exercises: {main_exercises}")
        # Floor Press should not appear (blocked by shoulder injury)
        assert "Floor Press" not in main_exercises, (
            f"Floor Press should be blocked by Shoulder (general) injury in ME_UPPER main"
        )
        # Main exercise should exist
        assert len(main_exercises) > 0, "ME Upper must have at least one main exercise"

    def test_no_floor_press_shoulder_injury(self, strongman_intake_response):
        """Shoulder injury should block Floor Press"""
        plan = strongman_intake_response.get("plan", {})
        all_exercise_names = _get_all_exercise_names(plan)
        print(f"All strongman exercises (sample): {all_exercise_names[:10]}")
        assert "Floor Press" not in all_exercise_names, (
            f"Floor Press should be blocked by Shoulder (general) injury. Found in plan."
        )

    def test_me_lower_yoke_walk(self, strongman_intake_response):
        """Strongman with yoke → Yoke Walk as main lower exercise"""
        plan = strongman_intake_response.get("plan", {})
        me_lower_exercises = _get_session_exercises(plan, "ME_LOWER")
        main_exercises = [e["name"] for e in me_lower_exercises if e.get("category") == "main"]
        print(f"ME Lower main exercises: {main_exercises}")
        assert "Yoke Walk" in main_exercises, (
            f"Expected Yoke Walk in ME_LOWER (strongman + yoke equip), got: {main_exercises}"
        )


class TestHypertrophyIntake:
    """Bug 5: Goal-specific exercises for hypertrophy"""

    def test_intake_success(self, hypertrophy_intake_response):
        assert hypertrophy_intake_response.get("success") is True

    def test_profile_userId_not_default(self, hypertrophy_intake_response):
        profile = hypertrophy_intake_response.get("profile", {})
        user_id = profile.get("userId")
        assert user_id is not None
        assert user_id != "user_001", f"userId is DEFAULT_USER! Got: {user_id}"
        print(f"Hypertrophy userId: {user_id}")

    def test_no_box_squat_knee_injury(self, hypertrophy_intake_response):
        """Knee injury blocks Box Squat and Bulgarian Split Squat"""
        plan = hypertrophy_intake_response.get("plan", {})
        all_names = _get_all_exercise_names(plan)
        print(f"Hypertrophy exercises (sample): {all_names[:10]}")
        assert "Box Squat" not in all_names, f"Box Squat should be blocked by Knee (general) injury"
        assert "Bulgarian Split Squat" not in all_names, f"Bulgarian Split Squat should be blocked by Knee injury"

    def test_me_lower_rdl_or_hip_thrust(self, hypertrophy_intake_response):
        """Hypertrophy ME Lower should use RDL or Hip Thrust, not Box Squat"""
        plan = hypertrophy_intake_response.get("plan", {})
        me_lower_exercises = _get_session_exercises(plan, "ME_LOWER")
        main_exercises = [e["name"] for e in me_lower_exercises if e.get("category") == "main"]
        print(f"Hypertrophy ME Lower main: {main_exercises}")
        # RDL should be there (knee injury blocks Bulgarian Split Squat, so RDL is fallback)
        assert "Romanian Deadlift" in main_exercises or "Hip Thrust" in main_exercises, (
            f"Expected Romanian Deadlift or Hip Thrust as main lower, got: {main_exercises}"
        )


class TestGoalSpecificDifference:
    """Bug 5: Both plans should have completely different exercises"""

    def test_strongman_vs_hypertrophy_main_upper_different(
        self, strongman_intake_response, hypertrophy_intake_response
    ):
        s_plan = strongman_intake_response.get("plan", {})
        h_plan = hypertrophy_intake_response.get("plan", {})
        s_main = [e["name"] for e in _get_session_exercises(s_plan, "ME_UPPER") if e.get("category") == "main"]
        h_main = [e["name"] for e in _get_session_exercises(h_plan, "ME_UPPER") if e.get("category") == "main"]
        print(f"Strongman ME Upper main: {s_main}")
        print(f"Hypertrophy ME Upper main: {h_main}")
        assert s_main != h_main, f"Plans should differ. Both have: {s_main}"

    def test_strongman_vs_hypertrophy_main_lower_different(
        self, strongman_intake_response, hypertrophy_intake_response
    ):
        s_plan = strongman_intake_response.get("plan", {})
        h_plan = hypertrophy_intake_response.get("plan", {})
        s_main = [e["name"] for e in _get_session_exercises(s_plan, "ME_LOWER") if e.get("category") == "main"]
        h_main = [e["name"] for e in _get_session_exercises(h_plan, "ME_LOWER") if e.get("category") == "main"]
        print(f"Strongman ME Lower main: {s_main}")
        print(f"Hypertrophy ME Lower main: {h_main}")
        assert s_main != h_main, f"Plans should differ. Both have: {s_main}"


# ── BUG 8: Settings save flow ─────────────────────────────────────────────────

class TestSettingsSaveFlow:
    """Bug 8: injury-preview, apply-injury-update, change-log"""

    def test_injury_preview(self, strongman_token):
        headers = {"Authorization": f"Bearer {strongman_token}"}
        resp = requests.post(
            f"{BASE_URL}/api/plan/injury-preview",
            json={"newInjuryFlags": ["Lower Back / Lumbar"]},
            headers=headers
        )
        assert resp.status_code == 200, f"injury-preview failed: {resp.text}"
        data = resp.json()
        print(f"injury-preview response keys: {list(data.keys())}")
        assert any(k in data for k in ("addedInjuries", "removedInjuries", "exercisesRestricted", "hasChanges")), (
            f"Expected addedInjuries/removedInjuries/exercisesRestricted in response, got: {data}"
        )
        # Bug 8: Should detect new injuries
        assert data.get("hasChanges") is True or len(data.get("addedInjuries", [])) > 0, (
            f"Expected hasChanges=True when adding new injury. Got: {data}"
        )

    def test_apply_injury_update(self, strongman_token):
        headers = {"Authorization": f"Bearer {strongman_token}"}
        resp = requests.post(
            f"{BASE_URL}/api/plan/apply-injury-update",
            json={"newInjuryFlags": ["Lower Back / Lumbar"]},
            headers=headers
        )
        assert resp.status_code == 200, f"apply-injury-update failed: {resp.text}"
        print(f"apply-injury-update OK: {resp.json().get('success')}")

    def test_change_log_has_entries(self, strongman_token):
        headers = {"Authorization": f"Bearer {strongman_token}"}
        resp = requests.get(f"{BASE_URL}/api/coach/change-log", headers=headers)
        assert resp.status_code == 200, f"change-log failed: {resp.text}"
        data = resp.json()
        changes = data.get("changes") or data.get("log") or data if isinstance(data, list) else []
        print(f"change-log entries count: {len(changes)}")
        assert len(changes) > 0, "Expected at least 1 change-log entry after intake + injury update"


# ── REGRESSION: Other endpoints ───────────────────────────────────────────────

class TestRegressionEndpoints:
    """Verify existing endpoints still work after bug fixes"""

    def test_competition_status_strongman(self, strongman_token):
        headers = {"Authorization": f"Bearer {strongman_token}"}
        resp = requests.get(f"{BASE_URL}/api/competition/status", headers=headers)
        assert resp.status_code == 200, f"competition/status failed: {resp.text}"
        print("competition/status OK")

    def test_rotation_check_strongman(self, strongman_token):
        headers = {"Authorization": f"Bearer {strongman_token}"}
        resp = requests.get(f"{BASE_URL}/api/rotation/check", headers=headers)
        assert resp.status_code == 200, f"rotation/check failed: {resp.text}"
        print("rotation/check OK")

    def test_rehab_status_strongman(self, strongman_token):
        headers = {"Authorization": f"Bearer {strongman_token}"}
        resp = requests.get(f"{BASE_URL}/api/rehab/status", headers=headers)
        assert resp.status_code == 200, f"rehab/status failed: {resp.text}"
        print("rehab/status OK")

    def test_competition_status_hypertrophy(self, hypertrophy_token):
        headers = {"Authorization": f"Bearer {hypertrophy_token}"}
        resp = requests.get(f"{BASE_URL}/api/competition/status", headers=headers)
        assert resp.status_code == 200

    def test_rotation_check_hypertrophy(self, hypertrophy_token):
        headers = {"Authorization": f"Bearer {hypertrophy_token}"}
        resp = requests.get(f"{BASE_URL}/api/rotation/check", headers=headers)
        assert resp.status_code == 200


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_session_exercises(plan: dict, session_type: str) -> list:
    """Extract exercises from first matching session type in first phase/block/week.
    Handles both enum-style ('ME_UPPER') and label-style ('Max Effort Upper') session types.
    """
    # Build keyword map
    type_keywords = {
        "ME_UPPER": ["me_upper", "max effort upper"],
        "ME_LOWER": ["me_lower", "max effort lower"],
        "DE_UPPER": ["de_upper", "dynamic effort upper"],
        "DE_LOWER": ["de_lower", "dynamic effort lower"],
    }
    keywords = type_keywords.get(session_type.upper(), [session_type.lower()])
    phases = plan.get("phases", [])
    for phase in phases:
        for block in phase.get("blocks", []):
            for week in block.get("weeks", []):
                for session in week.get("sessions", []):
                    stype = session.get("sessionType", "").lower()
                    if any(kw in stype for kw in keywords):
                        return session.get("exercises", [])
    return []


def _get_all_exercise_names(plan: dict) -> list:
    """Get all unique exercise names across first week of first block."""
    phases = plan.get("phases", [])
    names = []
    for phase in phases[:1]:  # Only first phase to save time
        for block in phase.get("blocks", [])[:1]:
            for week in block.get("weeks", [])[:1]:
                for session in week.get("sessions", []):
                    for ex in session.get("exercises", []):
                        names.append(ex.get("name", ""))
    return list(set(names))
