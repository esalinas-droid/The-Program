"""Regression tests for the Sept 2026 batch: injury swaps, tour replay, log ids.

Each of these shipped broken in a way that looked fine from the outside, so the
assertions deliberately check the observable behaviour rather than the shape of
a response:

  * The injury preview used to return null and the swap rules matched exercise
    names the generator never emits, so reporting a lumbar injury changed
    nothing. Asserting "preview returns 200" would have passed the whole time.
  * Replay tour cleared has_completed_tour but not tour_version, and Settings
    masked it by writing the local cache. Only server state is checked here.
  * Four /log/{id} routes returned 500 for ids the app itself mints.

Self-contained: every test builds and deletes its own account, so there is no
dependency on seeded users or on the order tests run in.

Run against a local backend:
    EXPO_PUBLIC_BACKEND_URL=http://127.0.0.1:8000 pytest tests/test_injury_tour_logid.py -v
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
API = f"{BASE_URL}/api"
T = 180

TOUR_VERSION_CONSTANT = 1        # frontend/src/components/TourOverlay.tsx
INJURY = "Lower Back / Lumbar"
PASSWORD = "RegressionPass123!"


def _make_account(with_plan=True):
    email = f"zz-reg-{uuid.uuid4().hex[:8]}@theprogram.app"
    requests.post(f"{API}/auth/register",
                  json={"email": email, "password": PASSWORD, "name": "ZZ Regression"}, timeout=T)
    token = requests.post(f"{API}/auth/login",
                          json={"email": email, "password": PASSWORD}, timeout=T).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    if with_plan:
        requests.post(f"{API}/profile/intake", headers=headers, json={
            "goal": "strongman", "experience": "intermediate",
            "lifts": {"squat": 455, "bench": 315, "deadlift": 550, "log_press": 240,
                      "yoke_walk": 700, "atlas_stone": 300, "farmer_walk": 275},
            "frequency": 4, "gym": ["Strongman Gym"],
            "specialtyEquipment": ["Yoke", "Log Bar", "Atlas Stones", "Farmer Handles"],
            "name": "ZZ Regression"}, timeout=600)
    return headers


@pytest.fixture
def account():
    headers = _make_account()
    yield headers
    requests.delete(f"{API}/auth/delete-account", headers=headers, timeout=120)


@pytest.fixture
def bare_account():
    headers = _make_account(with_plan=False)
    yield headers
    requests.delete(f"{API}/auth/delete-account", headers=headers, timeout=120)


def _current_block_names(headers):
    """Exercise names in the block the injury endpoints actually touch."""
    plan = requests.get(f"{API}/plan/year", headers=headers, timeout=T).json()
    plan = plan.get("plan") or plan
    week = requests.get(f"{API}/profile", headers=headers, timeout=T).json().get("currentWeek") or 1

    blocks = [b for ph in plan["phases"] for b in ph["blocks"]]
    chosen = next((b for b in blocks if b.get("status") == "current"), None)
    if chosen is None:
        for b in blocks:
            weeks = [w["weekNumber"] for w in b["weeks"]]
            if weeks and min(weeks) <= week <= max(weeks):
                chosen = b
                break
    chosen = chosen or blocks[0]
    return {ex["name"]
            for w in chosen["weeks"]
            for s in w["sessions"]
            for ex in s["exercises"]}


class TestInjuryPreview:
    def test_preview_reports_real_restrictions(self, account):
        """A lumbar injury must actually restrict something in a strongman plan.

        The old keyword table ("conventional deadlift", "RDL", "good morning")
        matched nothing the generator emits, so this returned an empty list.
        """
        before = _current_block_names(account)
        assert "Speed Deadlift" in before, "fixture plan should contain Speed Deadlift"

        preview = requests.post(f"{API}/plan/injury-preview", headers=account,
                                json={"newInjuryFlags": [INJURY]}, timeout=T).json()
        assert preview is not None, "endpoint returned null — the stub is back"
        for key in ("addedInjuries", "removedInjuries", "exercisesRestricted",
                    "exercisesRestored", "hasChanges", "summary"):
            assert key in preview, f"response is missing {key}"

        names = [e["name"] for e in preview["exercisesRestricted"]]
        assert names, "a lumbar injury restricted nothing"
        assert "Speed Deadlift" in names
        assert len(names) == len(set(names)), "duplicate rows — the modal keys by name"

    def test_reverse_hyper_is_not_restricted(self, account):
        """Reverse Hyper decompresses the lumbar spine and is prescribed as prehab
        for this same injury, so it must never be swapped out for it."""
        preview = requests.post(f"{API}/plan/injury-preview", headers=account,
                                json={"newInjuryFlags": [INJURY]}, timeout=T).json()
        assert "Reverse Hyper" not in [e["name"] for e in preview["exercisesRestricted"]]

    def test_preview_changes_nothing(self, account):
        """Preview must be read-only — it runs before the athlete confirms."""
        before_plan = _current_block_names(account)
        requests.post(f"{API}/plan/injury-preview", headers=account,
                      json={"newInjuryFlags": [INJURY]}, timeout=T)
        assert _current_block_names(account) == before_plan
        profile = requests.get(f"{API}/profile", headers=account, timeout=T).json()
        assert (profile.get("injuryFlags") or []) == []

    def test_preview_matches_apply(self, account):
        """Every exercise the preview names must really be gone after applying.

        A preview that promises a change the apply path won't make is worse than
        showing nothing at all.
        """
        preview = requests.post(f"{API}/plan/injury-preview", headers=account,
                                json={"newInjuryFlags": [INJURY]}, timeout=T).json()
        promised = [e["name"] for e in preview["exercisesRestricted"]]

        resp = requests.post(f"{API}/plan/apply-injury-update", headers=account,
                             json={"newInjuryFlags": [INJURY]}, timeout=T)
        assert resp.status_code == 200

        after = _current_block_names(account)
        still_there = [n for n in promised if n in after]
        assert not still_there, f"preview promised these would change: {still_there}"


class TestReplayTour:
    def _would_tour_run(self, profile):
        """The exact condition Home evaluates (app/(tabs)/index.tsx)."""
        return (bool(profile.get("onboardingComplete"))
                and not profile.get("has_completed_tour")
                and (profile.get("tour_version") or 0) < TOUR_VERSION_CONSTANT)

    def test_replay_rearms_tour_from_server_state_alone(self, account):
        """reset-tour must clear tour_version too.

        Settings also writes tour_version: 0 into the local cache, which hid this
        on the device that pressed the button. A fresh install or second device
        has no such cache and reads the profile from here.
        """
        requests.post(f"{API}/profile/complete-tour", headers=account, timeout=T)
        done = requests.get(f"{API}/profile", headers=account, timeout=T).json()
        assert not self._would_tour_run(done), "tour should not run once completed"

        requests.post(f"{API}/profile/reset-tour", headers=account, timeout=T)
        replayed = requests.get(f"{API}/profile", headers=account, timeout=T).json()
        assert replayed.get("tour_version") == 0, "reset-tour left tour_version stale"
        assert self._would_tour_run(replayed), "tour will not run after Replay tour"


class TestLogIdHandling:
    """The app mints its own ids ("added-ex-…") and stores them alongside real
    database ids, so these routes receive unparseable ids in normal use."""

    ROUTES = ["", "/notes", "/effort", "/fieldshape"]

    def _call(self, headers, entry_id, suffix):
        url = f"{API}/log/{entry_id}{suffix}"
        if suffix == "":
            return requests.put(url, headers=headers, timeout=T, json={
                "date": "2026-09-18", "week": 1, "day": "Friday", "sessionType": "Training",
                "exercise": "X", "sets": 1, "weight": 100, "reps": 5,
                "rpe": 7, "pain": 0, "completed": "yes"})
        if suffix == "/notes":
            return requests.patch(url, headers=headers, json={"notes": "x"}, timeout=T)
        if suffix == "/effort":
            return requests.patch(url, headers=headers, json={"reps_in_tank": 2}, timeout=T)
        return requests.patch(url, headers=headers, json={"fields": [{"type": "weight"}]}, timeout=T)

    @pytest.mark.parametrize("entry_id", [
        "added-ex-1756_not-an-objectid",   # what the app actually generates
        "tracker-ex-manual-123",
        "ffffffffffffffffffffffff",        # well formed, simply absent
    ])
    def test_unknown_id_is_404_not_500(self, bare_account, entry_id):
        for suffix in self.ROUTES:
            resp = self._call(bare_account, entry_id, suffix)
            assert resp.status_code == 404, \
                f"/log/{{id}}{suffix} returned {resp.status_code} for {entry_id!r}"
        resp = requests.delete(f"{API}/log/{entry_id}", headers=bare_account, timeout=T)
        assert resp.status_code == 404

    def test_real_id_still_works(self, bare_account):
        """The guard must not break the happy path."""
        created = requests.post(f"{API}/log", headers=bare_account, timeout=T, json={
            "date": "2026-09-18", "week": 1, "day": "Friday", "sessionType": "Training",
            "exercise": "Front Squat", "sets": 1, "weight": 225, "reps": 5,
            "rpe": 7, "pain": 0, "completed": "yes"}).json()
        entry_id = created.get("id") or created.get("_id")
        assert entry_id

        for suffix in self.ROUTES:
            resp = self._call(bare_account, entry_id, suffix)
            assert resp.status_code == 200, \
                f"/log/{{id}}{suffix} returned {resp.status_code} for a real id"
        assert requests.delete(f"{API}/log/{entry_id}",
                               headers=bare_account, timeout=T).status_code == 200
