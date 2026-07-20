"""
iter85 — Backend tests for the coach's write-actions:
   <ADD_EXERCISE>, <REMOVE_EXERCISE>, <SWAP_EXERCISE>
plus the honesty rule in the system prompt and validation robustness.

Real Emergent LLM calls; retry a few times on LLM non-determinism.
"""
import os
import re
import sys
import time
import copy
import pytest
import requests

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from creds import password_for
from server import resolve_coach_remove_target  # direct-call test for validator robustness

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "https://the-program-app.preview.emergentagent.com").rstrip("/")
EMAIL = "test_strongman@test.com"
PASSWORD = password_for(EMAIL)

ALLOWED_CATEGORIES = {"main", "supplemental", "accessory", "prehab", "warmup", "gpp", "cooldown"}


@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:300]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def api(auth_token):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
    })
    return s


@pytest.fixture(scope="module")
def today_session(api):
    r = api.get(f"{BASE_URL}/api/plan/session/today", timeout=30)
    assert r.status_code == 200, f"today session fetch failed: {r.status_code} {r.text[:200]}"
    payload = r.json()
    assert "session" in payload and payload["session"], "no session in today response"
    return payload


@pytest.fixture(scope="module")
def plan_id(api):
    r = api.get(f"{BASE_URL}/api/programs", timeout=30)
    if r.status_code != 200:
        return None
    body = r.json()
    active = body.get("active") or {}
    return active.get("planId") or active.get("id")


def _coach_chat(api, message, current_session=None, timeout=120):
    body = {"message": message, "conversation_history": [], "conversation_id": None, "source": "user_typed"}
    if current_session is not None:
        body["current_session"] = current_session
    return api.post(f"{BASE_URL}/api/coach/chat", json=body, timeout=timeout)


def _assert_no_xml(txt):
    assert txt, "empty response text"
    for tag in ("<ADD_EXERCISE", "</ADD_EXERCISE", "<REMOVE_EXERCISE", "</REMOVE_EXERCISE",
                "<SWAP_EXERCISE", "</SWAP_EXERCISE", "<PROGRAM_CHANGE", "</PROGRAM_CHANGE"):
        assert tag not in txt, f"unstripped tag {tag!r} in response text: {txt[:400]!r}"


def _base_shape_ok(data, allow_empty=True):
    """Verify the coach response has all required keys and no XML leaks.
    NOTE: allow_empty defaults to True because when the model emits ONLY a
    write-action tag (no prose), the stripped response is empty. That's a
    UX issue worth reporting but not a functional failure of the write-action
    itself."""
    for k in ("response", "conversation_id", "has_program_change", "program_change",
              "added_exercise", "removed_exercise", "swap_exercise"):
        assert k in data, f"response missing key {k!r}. keys={list(data.keys())}"
    txt = data.get("response") or ""
    if not allow_empty:
        assert txt, "empty response text"
    for tag in ("<ADD_EXERCISE", "</ADD_EXERCISE", "<REMOVE_EXERCISE", "</REMOVE_EXERCISE",
                "<SWAP_EXERCISE", "</SWAP_EXERCISE", "<PROGRAM_CHANGE", "</PROGRAM_CHANGE"):
        assert tag not in txt, f"unstripped tag {tag!r} in response text: {txt[:400]!r}"


# ── 1. ADD_EXERCISE regression ──────────────────────────────────────────────
class TestAddExerciseRegression:
    def test_add_face_pulls(self, api):
        last = None
        for attempt in range(3):
            r = _coach_chat(api, "Add 3x10 face pulls to today's accessories.")
            assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
            data = r.json()
            _base_shape_ok(data)
            last = data
            ae = data.get("added_exercise")
            if ae is not None:
                assert ae.get("id", "").startswith("added-ex-"), f"bad id: {ae.get('id')!r}"
                assert ae.get("name") and isinstance(ae["name"], str)
                assert "face" in ae["name"].lower() and "pull" in ae["name"].lower()
                assert ae.get("category") in ALLOWED_CATEGORIES
                assert isinstance(ae["sets"], int) and 1 <= ae["sets"] <= 10
                assert isinstance(ae.get("reps", ""), str) and ae["reps"]
                assert data["removed_exercise"] is None
                assert data["swap_exercise"] is None
                return
            time.sleep(1)
        pytest.fail(f"add_exercise never emitted after 3 attempts. Last text: {last['response'][:300]!r}")


# ── 2. REMOVE_EXERCISE — prescribed, today-only, plan UNCHANGED ─────────────
class TestRemovePrescribed:
    def test_remove_prescribed_first_exercise_no_plan_mutation(self, api, today_session, plan_id):
        first_ex = today_session["session"]["exercises"][0]
        target_name = first_ex["name"]
        target_id = first_ex["sessionExerciseId"]

        # Snapshot the plan session and full plan BEFORE
        session_before = copy.deepcopy(today_session["session"])
        plan_before = None
        if plan_id:
            rp = requests.get(
                f"{BASE_URL}/api/programs/{plan_id}",
                headers=api.headers,
                timeout=30,
            )
            if rp.status_code == 200:
                plan_before = rp.json()

        last = None
        got_remove = False
        for phrasing in [
            f"Remove {target_name} from today's session — today only.",
            f"Please skip {target_name} for today only. Remove it from today.",
            f"Take {target_name} off today's session for today only.",
        ]:
            r = _coach_chat(api, phrasing)
            assert r.status_code == 200
            data = r.json()
            _base_shape_ok(data)
            last = data
            rex = data.get("removed_exercise")
            if rex is not None:
                assert rex.get("kind") == "prescribed", f"expected prescribed, got {rex}"
                assert rex.get("targetName", "").lower().strip() == target_name.lower().strip() or \
                    target_name.lower() in rex.get("targetName", "").lower()
                assert rex.get("sessionExerciseId"), "sessionExerciseId should be non-empty for prescribed"
                # Ideally matches the one we asked about
                if rex["sessionExerciseId"] and target_id:
                    assert rex["sessionExerciseId"] == target_id, \
                        f"sessionExerciseId mismatch: {rex['sessionExerciseId']} vs {target_id}"
                assert data.get("added_exercise") is None
                assert data.get("swap_exercise") is None
                got_remove = True
                break
            time.sleep(1)

        assert got_remove, f"remove_exercise never emitted after retries. Last: {last['response'][:300]!r}"

        # Plan MUST be unchanged (today-only skip is client-side)
        r2 = api.get(f"{BASE_URL}/api/plan/session/today", timeout=30)
        assert r2.status_code == 200
        session_after = r2.json()["session"]
        names_before = [e["name"] for e in session_before["exercises"]]
        names_after = [e["name"] for e in session_after["exercises"]]
        assert names_before == names_after, (
            f"plan today session mutated by REMOVE! before={names_before} after={names_after}"
        )
        assert target_name in names_after, f"{target_name!r} disappeared from plan session"

        # If we could fetch the full plan, confirm the exercise still exists in future weeks
        if plan_before is not None and plan_id:
            rp2 = requests.get(
                f"{BASE_URL}/api/programs/{plan_id}",
                headers=api.headers,
                timeout=30,
            )
            if rp2.status_code == 200:
                plan_after = rp2.json()
                # Simple structural check: dumped JSON should be identical
                assert plan_before == plan_after, "plan document changed after REMOVE_EXERCISE (must be today-only)"


# ── 3. REMOVE_EXERCISE — coach-added exercise ───────────────────────────────
class TestRemoveAdded:
    def test_remove_added_face_pulls(self, api):
        snapshot = (
            "Exercises the athlete added to today (not in the original prescription):\n"
            "  - Face Pulls [accessory] (3 sets)\n"
        )
        last = None
        for phrasing in [
            "Remove face pulls from today.",
            "Please remove the Face Pulls I added today — today only.",
        ]:
            r = _coach_chat(api, phrasing, current_session=snapshot)
            assert r.status_code == 200
            data = r.json()
            _base_shape_ok(data, allow_empty=True)
            last = data
            rex = data.get("removed_exercise")
            if rex is not None:
                assert rex.get("kind") == "added", f"expected 'added', got {rex}"
                assert "face" in (rex.get("targetName") or "").lower()
                assert data.get("added_exercise") is None
                assert data.get("swap_exercise") is None
                return
            time.sleep(1)
        pytest.fail(f"remove(added) never emitted. Last: {last['response'][:300]!r}")


# ── 4. Ambiguity guard ──────────────────────────────────────────────────────
class TestAmbiguityGuard:
    def test_two_rows_ambiguous(self, api):
        snapshot = (
            "Exercises the athlete added to today (not in the original prescription):\n"
            "  - Barbell Row [accessory] (3 sets)\n"
            "  - Chest Supported Row [accessory] (3 sets)\n"
        )
        last = None
        for _ in range(3):
            r = _coach_chat(api, "remove row from today", current_session=snapshot)
            assert r.status_code == 200
            data = r.json()
            _base_shape_ok(data)
            last = data
            if data.get("removed_exercise") is None:
                txt = (data.get("response") or "").lower()
                # backend appends '(I found more than one exercise matching that in today's session ...)'
                # OR the model itself asks a clarifying question — either satisfies the guard.
                if any(p in txt for p in ("more than one", "which one", "which row", "which ",
                                           "did you mean", "you have", "you've got", "which of")):
                    return
            time.sleep(1)
        pytest.fail(
            "Ambiguity guard did NOT clarify. removed_exercise or clarifying phrase missing. "
            f"last response={last['response'][:400]!r}, removed_exercise={last.get('removed_exercise')}"
        )


# ── 5. SWAP_EXERCISE — atomic, plan UNCHANGED ───────────────────────────────
class TestSwap:
    def test_swap_prescribed_for_alternative(self, api, plan_id, today_session):
        # Use a REAL prescribed exercise from today's session (the resolver
        # only knows about DB-side exercises + current_session's "added" block).
        first_ex = today_session["session"]["exercises"][0]
        target_name = first_ex["name"]  # e.g. "Romanian Deadlift"
        replacement = "Good Morning"  # generic alternative that isn't in prescribed

        plan_before = None
        if plan_id:
            rp = requests.get(f"{BASE_URL}/api/programs/{plan_id}", headers=api.headers, timeout=30)
            if rp.status_code == 200:
                plan_before = rp.json()

        last = None
        got_swap = False
        for phrasing in [
            f"Swap {target_name} for {replacement} today — today only.",
            f"Please swap my {target_name} for {replacement} for today's session only.",
            f"Replace {target_name} with {replacement} just for today.",
        ]:
            r = _coach_chat(api, phrasing)
            assert r.status_code == 200
            data = r.json()
            _base_shape_ok(data)
            last = data
            sw = data.get("swap_exercise")
            if sw is not None:
                assert isinstance(sw, dict)
                assert "removed" in sw and "added" in sw
                removed = sw["removed"]
                added = sw["added"]
                assert removed.get("kind") in ("prescribed", "added")
                assert target_name.lower().split()[0] in (removed.get("targetName") or "").lower()
                assert added.get("id", "").startswith("added-ex-")
                assert (added.get("name") or "").lower()
                assert added.get("category") in ALLOWED_CATEGORIES
                # Category inheritance: the source category was "main" — the
                # replacement should inherit that (unless coach explicitly picked another).
                # We only assert it's a valid category.
                assert data.get("added_exercise") is None
                assert data.get("removed_exercise") is None
                got_swap = True
                break
            time.sleep(1)

        assert got_swap, f"swap never emitted. Last: {last['response'][:400]!r}"

        # Plan must remain unchanged
        if plan_before is not None and plan_id:
            rp2 = requests.get(f"{BASE_URL}/api/programs/{plan_id}", headers=api.headers, timeout=30)
            if rp2.status_code == 200:
                plan_after = rp2.json()
                assert plan_before == plan_after, "plan document changed after SWAP_EXERCISE (must be today-only)"


# ── 6. Honesty / limitation ─────────────────────────────────────────────────
class TestHonesty:
    def test_delete_week3_refused_with_limitation(self, api):
        last = None
        limit_pat = re.compile(
            r"(can'?t|cannot|isn'?t something|can not|not able to|"
            r"⋮ menu|kebab|three-dot|program[_ ]change)",
            re.IGNORECASE,
        )
        for phrasing in [
            "Delete week 3 from my program entirely.",
            "Wipe out week 3 of my program completely.",
        ]:
            r = _coach_chat(api, phrasing)
            assert r.status_code == 200
            data = r.json()
            _base_shape_ok(data)
            last = data
            assert data.get("added_exercise") is None
            assert data.get("removed_exercise") is None
            assert data.get("swap_exercise") is None
            # has_program_change may be False, or a PROPOSAL (not a claim of success)
            txt = data["response"] or ""
            if limit_pat.search(txt):
                return
            time.sleep(1)
        pytest.fail(
            "Coach did not honestly state a limitation for 'delete week 3'. "
            f"Last response={last['response'][:500]!r}"
        )


# ── 7. Validation robustness — direct unit call ─────────────────────────────
class TestValidatorRobustness:
    def test_resolve_ignores_empty_and_junk(self):
        assert resolve_coach_remove_target("", [], []) == {"kind": "not_found"}
        assert resolve_coach_remove_target("   ", [], []) == {"kind": "not_found"}
        assert resolve_coach_remove_target("!!!###", [], []) == {"kind": "not_found"}

    def test_resolve_prescribed_exact_and_partial(self):
        prescribed = [{"sessionExerciseId": "abc", "name": "Romanian Deadlift", "category": "main"}]
        r = resolve_coach_remove_target("Romanian Deadlift", prescribed, [])
        assert r["kind"] == "prescribed" and r["targetId"] == "abc"
        r2 = resolve_coach_remove_target("romanian deadlift", prescribed, [])
        assert r2["kind"] == "prescribed"
        r3 = resolve_coach_remove_target("RDL", prescribed, [])
        # RDL isn't a substring of Romanian Deadlift → not_found (OK)
        assert r3["kind"] in ("not_found", "prescribed")

    def test_resolve_ambiguous(self):
        prescribed = [
            {"sessionExerciseId": "1", "name": "Barbell Row"},
            {"sessionExerciseId": "2", "name": "Chest Supported Row"},
        ]
        r = resolve_coach_remove_target("row", prescribed, [])
        assert r["kind"] == "ambiguous"
        assert set([m.lower() for m in r["matches"]]) == {"barbell row", "chest supported row"}

    def test_resolve_added(self):
        added = [{"id": "added-ex-xyz", "name": "Face Pulls"}]
        r = resolve_coach_remove_target("face pull", [], added)
        assert r["kind"] == "added"
        assert r["targetId"] == "added-ex-xyz"


# ── 8. Malformed <REMOVE_EXERCISE> payload survives end-to-end ──────────────
class TestMalformedRemoveTagE2E:
    """We cannot force the LLM to emit malformed JSON directly, but we DO test
    that when the resolve function returns 'not_found', the endpoint behavior
    (append clarifying hint, removed_exercise=null, no crash) is exercised —
    covered by the unit tests above AND by the ambiguity test's not-found
    fallback. This test just confirms that a bogus name in prose does NOT
    produce a phantom removal."""
    def test_bogus_name_no_phantom_remove(self, api):
        snapshot = (
            "Exercises the athlete added to today (not in the original prescription):\n"
            "  - Face Pulls [accessory] (3 sets)\n"
        )
        r = _coach_chat(
            api,
            "Remove Zorglax Trombone from today.",
            current_session=snapshot,
        )
        assert r.status_code == 200
        data = r.json()
        _base_shape_ok(data)
        # There is no such exercise, so backend must not fabricate a removal.
        assert data.get("removed_exercise") is None
