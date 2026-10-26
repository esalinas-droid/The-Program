"""Regression tests for the long-term history repairs (audit items, Oct 2026).

Pure-function tests run anywhere. The API tests run against BASE_URL and are
the deploy gate for these fixes — against a backend without them they fail,
which is the point.

Run pure tests only (no server needed):
    pytest tests/test_audit_repairs.py -k pure -v
Run everything against a deployed backend:
    EXPO_PUBLIC_BACKEND_URL=https://... pytest tests/test_audit_repairs.py -v
"""
import os
import sys
import uuid

import pytest
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from services.max_rescale import _to_max_unit, detect_pr_candidates  # noqa: E402

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
API = f"{BASE_URL}/api"
T = 180
PASSWORD = "RegressionPass123!"


# ── Pure: unit-aware PR suggestions ──────────────────────────────────────────

class TestPrSuggestionUnitsPure:
    def test_pure_lbs_log_does_not_beat_heavier_kg_max(self):
        """315 logged in lbs is NOT above a 180 kg (≈397 lb) max."""
        out = detect_pr_candidates(
            {"squat": 180},
            [{"exercise": "Back Squat", "weight": 315, "reps": 1, "weightUnit": "lb"}],
            max_unit="kgs",
        )
        assert out == []

    def test_pure_kg_log_beats_lbs_max_after_conversion(self):
        """150 kg (≈330 lb) IS above a 315 lb max, even though 150 < 315 raw."""
        out = detect_pr_candidates(
            {"squat": 315},
            [{"exercise": "Back Squat", "weight": 150, "reps": 1, "weightUnit": "kg"}],
            max_unit="lbs",
        )
        assert len(out) == 1
        assert out[0]["loggedWeight"] == pytest.approx(330.7, abs=0.5)

    def test_pure_untagged_log_is_treated_as_lbs(self):
        """None unit = legacy lbs, matching every read path in the app."""
        assert _to_max_unit(100, None, "lbs") == 100
        assert _to_max_unit(100, None, "kgs") == pytest.approx(45.36, abs=0.01)

    def test_pure_same_unit_passes_through_exactly(self):
        assert _to_max_unit(142.5, "kg", "kgs") == 142.5

    def test_pure_rep_gate_still_applies(self):
        """A set of 8 is not a max attempt, whatever the units."""
        out = detect_pr_candidates(
            {"squat": 100},
            [{"exercise": "Back Squat", "weight": 200, "reps": 8, "weightUnit": "kg"}],
            max_unit="kgs",
        )
        assert out == []


# ── Live API: everything below needs the deployed fixes ──────────────────────

def _account():
    email = f"zz-aud-{uuid.uuid4().hex[:8]}@theprogram.app"
    requests.post(f"{API}/auth/register",
                  json={"email": email, "password": PASSWORD, "name": "ZZ Audit"}, timeout=T)
    token = requests.post(f"{API}/auth/login",
                          json={"email": email, "password": PASSWORD}, timeout=T).json()["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def live_account():
    headers = _account()
    yield headers
    requests.delete(f"{API}/auth/delete-account", headers=headers, timeout=120)


class TestTrackerCommitUnits:
    def test_commit_set_stores_unit_and_normalizes_e1rm(self, live_account):
        """The tracker commit path was the ONE writer that dropped the unit:
        a 100 kg set was stored unitless and scored as 100 lbs, forever."""
        requests.post(f"{API}/tracker/commit-set", headers=live_account, timeout=T, json={
            "setId": "aud-set-1", "date": "2026-10-26", "sessionTitle": "Audit",
            "exercise": "Front Squat", "setIndex": 0, "prescriptionType": "weighted",
            "weight": 100, "reps": 3, "rpe": 8, "weightUnit": "kg"})
        rows = requests.get(f"{API}/log?week=0&exercise=Front%20Squat",
                            headers=live_account, timeout=T).json()
        row = next(r for r in rows if r.get("setId") == "aud-set-1")
        assert row["weightUnit"] == "kg"
        # 100 kg x3 ≈ 220.5 lb x3 → Epley ≈ 242.5; unitless-as-lbs would be ~110.
        assert 230 < row["e1rm"] < 255, f"e1rm {row['e1rm']} looks unit-blind"

    def test_height_sets_mint_no_e1rm(self, live_account):
        """A 30-inch box jump is not a 30 lb lift — no more fake strength PRs."""
        requests.post(f"{API}/tracker/commit-set", headers=live_account, timeout=T, json={
            "setId": "aud-set-2", "date": "2026-10-26", "sessionTitle": "Audit",
            "exercise": "Box Jump", "setIndex": 0, "prescriptionType": "height",
            "heightVal": 30, "heightUnit": "in", "reps": 3, "rpe": 7})
        rows = requests.get(f"{API}/log?week=0&exercise=Box%20Jump",
                            headers=live_account, timeout=T).json()
        row = next(r for r in rows if r.get("setId") == "aud-set-2")
        assert row["e1rm"] == 0


class TestLogListLimit:
    def test_limit_param_is_honored_and_clamped(self, live_account):
        for i in range(5):
            requests.post(f"{API}/log", headers=live_account, timeout=T, json={
                "date": "2026-10-26", "week": 1, "day": "Monday", "sessionType": "Training",
                "exercise": f"Lift {i}", "sets": 1, "weight": 100, "reps": 5,
                "rpe": 7, "pain": 0, "completed": "yes"})
        two = requests.get(f"{API}/log?limit=2", headers=live_account, timeout=T).json()
        assert len(two) == 2
        absurd = requests.get(f"{API}/log?limit=999999", headers=live_account, timeout=T)
        assert absurd.status_code == 200, "an absurd limit must clamp, not crash"


class TestPrListCarriesUnit:
    def test_best_entries_name_their_unit(self, live_account):
        requests.post(f"{API}/log", headers=live_account, timeout=T, json={
            "date": "2026-10-26", "week": 1, "day": "Monday", "sessionType": "Training",
            "exercise": "Front Squat", "sets": 1, "weight": 142.5, "reps": 1,
            "rpe": 9, "pain": 0, "completed": "yes", "weightUnit": "kg"})
        prs = requests.get(f"{API}/prs", headers=live_account, timeout=T).json()
        row = next(p for p in prs if p["exercise"] == "Front Squat" and p.get("bestWeight"))
        assert row.get("bestUnit") == "kg", "a kg best displayed as a bare number reads as lbs"
