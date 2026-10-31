"""Regression tests for the build-39 feedback batch (Oct 30, 2026).

Pure tests run anywhere. The live tests are the deploy gate: run them against
the deployed backend and they fail on a backend without these fixes.

Run pure tests only (no server needed):
    pytest tests/test_build39_fixes.py -k pure -v
Run everything against a deployed backend:
    EXPO_PUBLIC_BACKEND_URL=https://... pytest tests/test_build39_fixes.py -v
"""
import os
import sys
import uuid

import pytest
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
API = f"{BASE_URL}/api"
T = 180
PASSWORD = "RegressionPass123!"


# ── Pure: shared warm-up/cool-down templates ─────────────────────────────────

class TestWarmupModulePure:
    def test_pure_classify_session_covers_the_day_types(self):
        from services.warmup_cooldown import classify_session
        assert classify_session("Event Training") == "event"
        assert classify_session("Recovery / Conditioning") == "gpp"
        assert classify_session("Heavy Lower") == "lower"
        assert classify_session("Heavy Upper") == "upper"
        assert classify_session("Something Unknown") == "full"

    def test_pure_every_kind_has_distinct_templates(self):
        from services.warmup_cooldown import WARMUP_TEMPLATES, COOLDOWN_TEMPLATES
        kinds = {"upper", "lower", "gpp", "event", "full"}
        assert set(WARMUP_TEMPLATES) == kinds
        assert set(COOLDOWN_TEMPLATES) == kinds
        # The whole point: warm-ups are no longer one-size-fits-all.
        assert WARMUP_TEMPLATES["event"] != WARMUP_TEMPLATES["lower"]
        assert COOLDOWN_TEMPLATES["event"] != COOLDOWN_TEMPLATES["upper"]
        for k in kinds:
            assert all(isinstance(s, str) for s in WARMUP_TEMPLATES[k])
            assert all(len(t) == 4 for t in COOLDOWN_TEMPLATES[k])


class TestCardioPreferencesPure:
    def test_pure_prefs_reach_the_conditioning_day(self):
        from models.schemas import IntakeRequest
        from services.plan_generator import generate_plan
        base = dict(goal="Strongman competition prep", frequency=5,
                    experience="Intermediate", equipment=["Barbell", "Rack", "Sled"],
                    injuries=[], age=30, bodyweight=200)
        plan = generate_plan(IntakeRequest(**base, cardioPreferences=["rowing", "boxing"]))
        names = [e.name for ph in plan.phases for bl in ph.blocks
                 for wk in bl.weeks for s in wk.sessions
                 if "Conditioning" in str(s.sessionType) or "GPP" in str(s.sessionType)
                 for e in s.exercises]
        assert any("Row" in n for n in names), "chosen cardio never appears"

    def test_pure_no_prefs_keeps_the_old_default(self):
        from models.schemas import IntakeRequest
        from services.plan_generator import generate_plan
        base = dict(goal="Strongman competition prep", frequency=5,
                    experience="Intermediate", equipment=["Barbell", "Rack", "Sled"],
                    injuries=[], age=30, bodyweight=200)
        plan = generate_plan(IntakeRequest(**base))
        gpp_first = next(([e.name for e in s.exercises]
                          for ph in plan.phases for bl in ph.blocks
                          for wk in bl.weeks for s in wk.sessions
                          if "GPP" in str(s.sessionType) or "Conditioning" in str(s.sessionType)), [])
        assert gpp_first and gpp_first[0].startswith("Sled"), gpp_first
        assert not any("Row" in n or "Boxing" in n for n in gpp_first)


# ── Live API ─────────────────────────────────────────────────────────────────

def _account():
    email = f"zz-b39-{uuid.uuid4().hex[:8]}@theprogram.app"
    requests.post(f"{API}/auth/register",
                  json={"email": email, "password": PASSWORD, "name": "ZZ B39"}, timeout=T)
    token = requests.post(f"{API}/auth/login",
                          json={"email": email, "password": PASSWORD}, timeout=T).json()["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def live_account():
    headers = _account()
    yield headers
    requests.delete(f"{API}/auth/delete-account", headers=headers, timeout=120)


def _log(headers, **over):
    body = {"date": "2026-10-29", "week": 1, "day": "Monday", "sessionType": "Training",
            "exercise": "Front Squat", "sets": 1, "weight": 225, "reps": 5,
            "rpe": 7, "pain": 0, "completed": "yes"}
    body.update(over)
    return requests.post(f"{API}/log", headers=headers, timeout=T, json=body)


class TestCompletedFilter:
    def test_unlogged_set_is_not_a_pr(self, live_account):
        """A scanned 600-lb target you never lifted must not mint a PR."""
        _log(live_account, weight=600, reps=1, completed="no")
        _log(live_account, weight=225, reps=5, completed="yes")
        prs = requests.get(f"{API}/prs", headers=live_account, timeout=T).json()
        row = next((p for p in prs if p["exercise"] == "Front Squat" and p.get("bestWeight")), None)
        assert row is not None, "the real set vanished from /prs"
        assert row["bestWeight"] < 600, f"un-done 600 counted as best: {row}"

    def test_streak_ignores_unfinished_rows(self, live_account):
        _log(live_account, date="2026-10-28", completed="no")
        streak = requests.get(f"{API}/streaks", headers=live_account, timeout=T).json()
        assert streak.get("currentStreak", 0) == 0, "completed:'no' rows granted streak credit"


class TestCalendarLoggedEvents:
    def test_tracker_logs_show_on_the_calendar(self, live_account):
        """A tracker-mode athlete with no plan used to get a 100% blank calendar."""
        _log(live_account, date="2026-10-28", sessionType="Push Day", completed="yes")
        resp = requests.get(f"{API}/calendar/events?start=2026-10-20&end=2026-11-05",
                            headers=live_account, timeout=T)
        assert resp.status_code == 200
        events = resp.json().get("events", [])
        logged = [e for e in events if e.get("kind") == "logged" and e.get("date") == "2026-10-28"]
        assert logged, f"logged workout missing from calendar events: {events[:5]}"
        assert logged[0].get("isCompleted") is True
        assert any("Front Squat" in x for x in logged[0].get("exercises", []))


class TestPreferredDaysValidation:
    def test_junk_day_names_are_rejected_not_stored(self, live_account):
        """'mon'/'tue' used to be stored silently and blank the whole calendar."""
        bad = requests.put(f"{API}/profile/preferred-days", headers=live_account,
                           timeout=T, json={"preferredDays": ["mon", "tue"]})
        assert bad.status_code == 400
        good = requests.put(f"{API}/profile/preferred-days", headers=live_account,
                            timeout=T, json={"preferredDays": ["monday", "thursday"]})
        assert good.status_code == 200

    def test_warmup_today_survives_without_a_plan(self, live_account):
        resp = requests.get(f"{API}/warmup/today", headers=live_account, timeout=T)
        assert resp.status_code == 200, resp.text
        assert resp.json().get("steps"), "warmup endpoint returned no steps"


class TestRoleClaim:
    def test_me_reports_athlete_role(self, live_account):
        me = requests.get(f"{API}/auth/me", headers=live_account, timeout=T).json()
        user = me.get("user", me)
        assert user.get("role") == "athlete"
