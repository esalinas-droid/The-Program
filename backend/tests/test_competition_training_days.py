"""
Tests for bug fixes:
1. trainingDays should reflect user's selected frequency (not hardcoded to 4)
2. Competition Prep phase should only appear when hasCompetition=true
3. Adjust preferences button — tested via intake/reset flow
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")

@pytest.fixture(scope="module")
def auth_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "user_a@theprogram.app",
        "password": "StrongmanA123"
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["token"]


@pytest.fixture
def authed(auth_token):
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"})
    return session


def reset_profile(authed):
    resp = authed.post(f"{BASE_URL}/api/profile/reset")
    assert resp.status_code == 200, f"Reset failed: {resp.text}"


def do_intake(authed, frequency, has_competition, competition_date=None):
    payload = {
        "goal": "Strongman",
        "experience": "Advanced",
        "lifts": {"squat": 400, "bench": 250, "deadlift": 500},
        "liftUnit": "lbs",
        "frequency": frequency,
        "injuries": [],
        "gym": [],
        "hasCompetition": has_competition,
    }
    if competition_date:
        payload["competitionDate"] = competition_date
    resp = authed.post(f"{BASE_URL}/api/profile/intake", json=payload)
    assert resp.status_code == 200, f"Intake failed: {resp.text}"
    return resp.json()


class TestTrainingDays:
    """trainingDays should reflect user's frequency selection"""

    def test_frequency_3_training_days(self, authed):
        reset_profile(authed)
        result = do_intake(authed, frequency=3, has_competition=False)
        plan = result.get("plan", result)
        assert plan.get("trainingDays") == 3, f"Expected trainingDays=3, got {plan.get('trainingDays')}"
        print("PASS: trainingDays=3 for frequency=3")

    def test_frequency_5_training_days(self, authed):
        reset_profile(authed)
        result = do_intake(authed, frequency=5, has_competition=True)
        plan = result.get("plan", result)
        assert plan.get("trainingDays") == 5, f"Expected trainingDays=5, got {plan.get('trainingDays')}"
        print("PASS: trainingDays=5 for frequency=5")

    def test_frequency_4_training_days(self, authed):
        reset_profile(authed)
        result = do_intake(authed, frequency=4, has_competition=False)
        plan = result.get("plan", result)
        assert plan.get("trainingDays") == 4, f"Expected trainingDays=4, got {plan.get('trainingDays')}"
        print("PASS: trainingDays=4 for frequency=4")


class TestCompetitionPhase:
    """Competition Prep phase should only appear when hasCompetition=true"""

    def _get_phase_names(self, plan):
        phases = plan.get("phases", [])
        return [p.get("phaseName") for p in phases]

    def test_no_competition_no_comp_prep_phase(self, authed):
        reset_profile(authed)
        result = do_intake(authed, frequency=3, has_competition=False)
        plan = result.get("plan", result)
        phase_names = self._get_phase_names(plan)
        print(f"Phases (no comp): {phase_names}")
        assert "Competition Prep" not in phase_names, f"Competition Prep should NOT appear; got phases: {phase_names}"
        # Phase 6 should be Strength Consolidation
        if len(phase_names) >= 6:
            assert phase_names[5] == "Strength Consolidation", f"Phase 6 should be 'Strength Consolidation', got '{phase_names[5]}'"
        print("PASS: No Competition Prep phase when hasCompetition=false")

    def test_has_competition_includes_comp_prep_phase(self, authed):
        reset_profile(authed)
        result = do_intake(authed, frequency=5, has_competition=True)
        plan = result.get("plan", result)
        phase_names = self._get_phase_names(plan)
        print(f"Phases (with comp): {phase_names}")
        assert "Competition Prep" in phase_names, f"Competition Prep should appear; got phases: {phase_names}"
        if len(phase_names) >= 6:
            assert phase_names[5] == "Competition Prep", f"Phase 6 should be 'Competition Prep', got '{phase_names[5]}'"
        print("PASS: Competition Prep phase present when hasCompetition=true")

    def test_no_competition_default_frequency_no_comp_prep(self, authed):
        reset_profile(authed)
        result = do_intake(authed, frequency=4, has_competition=False)
        plan = result.get("plan", result)
        phase_names = self._get_phase_names(plan)
        print(f"Phases (no comp, freq=4): {phase_names}")
        assert "Competition Prep" not in phase_names, f"Competition Prep should NOT appear; got phases: {phase_names}"
        print("PASS: No Competition Prep phase when hasCompetition=false and frequency=4")

    def test_competition_date_only_includes_comp_prep(self, authed):
        """Only competitionDate set (no hasCompetition) — should still include competition phase"""
        reset_profile(authed)
        result = do_intake(authed, frequency=4, has_competition=False, competition_date="2026-08-15")
        plan = result.get("plan", result)
        phase_names = self._get_phase_names(plan)
        print(f"Phases (competitionDate only): {phase_names}")
        assert "Competition Prep" in phase_names, f"Competition Prep should appear when competitionDate set; got phases: {phase_names}"
        print("PASS: Competition Prep phase present when competitionDate set")


class TestGetYearPlanTrainingDays:
    """GET /api/plan/year should return correct trainingDays"""

    def test_get_year_plan_training_days_after_intake(self, authed):
        reset_profile(authed)
        do_intake(authed, frequency=3, has_competition=False)
        resp = authed.get(f"{BASE_URL}/api/plan/year")
        assert resp.status_code == 200, f"GET /api/plan/year failed: {resp.text}"
        plan = resp.json()
        assert plan.get("trainingDays") == 3, f"Expected trainingDays=3 from year plan, got {plan.get('trainingDays')}"
        print("PASS: GET /api/plan/year returns trainingDays=3")
