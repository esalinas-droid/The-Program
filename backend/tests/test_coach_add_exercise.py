"""
Backend tests for the new AI coach WRITE-ACTION: add-exercise-to-today's-session.

Endpoint under test: POST /api/coach/chat

Verifies:
1. Add-exercise happy path (name/sets/reps + tag stripping + id prefix)
2. Category coercion (allowed set only; nonsense → 'accessory' default)
3. Malformed / no-name edge case → 200, added_exercise is null, sensible reply
4. No false trigger on non-add messages (warm-up question)
5. Context freshness — coach honours the `current_session` snapshot (2b)
6. Regression — existing response fields still present; PROGRAM_CHANGE still works

Real LLM calls hit Claude via emergentintegrations; output is non-deterministic
so where the LLM's cooperation is required we retry the message a couple of
times before concluding failure (per the request).
"""
import os
import time
import re
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "https://the-program-app.preview.emergentagent.com").rstrip("/")
EMAIL    = "user_a@theprogram.app"
PASSWORD = "StrongmanA123"

ALLOWED_CATEGORIES = {"main", "supplemental", "accessory", "prehab", "warmup", "gpp", "cooldown"}


# ── Shared fixtures ──────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def auth_token():
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
    data = resp.json()
    assert "token" in data and data["token"], "Login response missing token"
    return data["token"]


@pytest.fixture(scope="module")
def api(auth_token):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
    })
    return s


def _coach_chat(api, message: str, current_session: str | None = None, timeout: int = 120):
    body = {"message": message, "conversation_history": []}
    if current_session is not None:
        body["current_session"] = current_session
    r = api.post(f"{BASE_URL}/api/coach/chat", json=body, timeout=timeout)
    return r


def _coach_chat_retry(api, message, current_session=None, expect_added=True, retries=3):
    """Send the message; retry a couple times if the LLM fails to emit/omit as expected."""
    last = None
    for i in range(retries):
        r = _coach_chat(api, message, current_session=current_session)
        last = r
        if r.status_code != 200:
            time.sleep(1)
            continue
        data = r.json()
        got_added = data.get("added_exercise") is not None
        if got_added == expect_added:
            return r, data
        time.sleep(1)
    return last, (last.json() if last is not None and last.status_code == 200 else None)


# ── Shape helpers ────────────────────────────────────────────────────────────
COACH_KEYS = {"response", "sources", "conversation_id", "has_program_change", "program_change", "added_exercise"}


def _assert_response_shape(data):
    missing = COACH_KEYS - set(data.keys())
    assert not missing, f"Coach response missing keys: {missing}. Got keys={list(data.keys())}"
    assert isinstance(data["response"], str) and data["response"].strip(), "response text empty"
    # tag must never leak into user-facing text
    assert "<ADD_EXERCISE>" not in data["response"], "response contains unstripped <ADD_EXERCISE> tag"
    assert "</ADD_EXERCISE>" not in data["response"], "response contains unstripped </ADD_EXERCISE> tag"
    assert "<PROGRAM_CHANGE>" not in data["response"], "response contains unstripped <PROGRAM_CHANGE> tag"


# ── Test 1: happy path — add face pulls 3x12 ─────────────────────────────────
class TestAddExerciseHappyPath:
    def test_add_face_pulls_3x12(self, api):
        r, data = _coach_chat_retry(
            api,
            "Add face pulls to today's session, 3 sets of 12.",
            expect_added=True,
        )
        assert r.status_code == 200, f"Status {r.status_code}: {r.text[:400]}"
        assert data is not None
        _assert_response_shape(data)

        ae = data["added_exercise"]
        assert ae is not None, (
            "Model did not emit <ADD_EXERCISE> for an explicit add request even after retries. "
            f"response={data['response'][:400]!r}"
        )
        # Shape
        assert isinstance(ae.get("id"), str) and ae["id"].startswith("added-ex-"), f"bad id: {ae.get('id')!r}"
        assert isinstance(ae.get("name"), str) and ae["name"].strip(), "name must be non-empty"
        assert "face" in ae["name"].lower() and "pull" in ae["name"].lower(), f"unexpected name: {ae['name']!r}"
        assert ae.get("category") in ALLOWED_CATEGORIES, f"invalid category: {ae.get('category')!r}"
        assert isinstance(ae.get("sets"), int) and 1 <= ae["sets"] <= 10, f"bad sets: {ae.get('sets')!r}"
        # sets requested = 3 — allow small drift but strongly expect 3
        assert ae["sets"] == 3, f"expected sets=3, got {ae['sets']}"
        # reps expected to contain 12 (user asked "3 sets of 12")
        assert "12" in str(ae.get("reps", "")), f"reps missing 12: {ae.get('reps')!r}"
        assert ae.get("source") == "coach"

        # user-visible confirmation should mention what was added (loose check)
        low = data["response"].lower()
        assert "face" in low and "pull" in low, "coach response should mention the added exercise"


# ── Test 2: category coercion ────────────────────────────────────────────────
class TestCategoryCoercion:
    def test_prehab_style_add_yields_valid_category(self, api):
        # Ask for a mobility/prehab-style exercise — category should be a valid one.
        r, data = _coach_chat_retry(
            api,
            "Add banded shoulder dislocates to today for shoulder prehab, 2 sets of 15.",
            expect_added=True,
        )
        assert r.status_code == 200
        assert data is not None
        _assert_response_shape(data)
        ae = data["added_exercise"]
        assert ae is not None, "coach didn't emit add for a clear add request"
        # Whatever the model picked, it MUST be one of the allowed categories —
        # the backend coerces nonsense to 'accessory' so this can never be
        # anything else.
        assert ae["category"] in ALLOWED_CATEGORIES, f"invalid category leaked: {ae['category']!r}"


# ── Test 3: malformed / no name — safe default ───────────────────────────────
class TestMalformedAdd:
    def test_no_name_add_returns_null_added_exercise(self, api):
        """A vague / nameless add request must not 500, added_exercise must be null,
        and the coach should ask for the name rather than fabricate one."""
        # Ask ambiguously so the model either doesn't emit a tag OR emits a
        # tag with no valid name. Either way the API must be safe.
        r = _coach_chat(
            api,
            "Add something to today. I don't remember the name.",
        )
        assert r.status_code == 200, f"unexpected {r.status_code}: {r.text[:400]}"
        data = r.json()
        _assert_response_shape(data)
        # The whole point: even if the model tries something silly, backend
        # never returns an invalid added_exercise.
        ae = data.get("added_exercise")
        if ae is not None:
            # If it did add something, it MUST at least be well-shaped.
            # But the *intent* of the test is that a no-name request should
            # NOT produce a phantom add — flag it if it does.
            pytest.fail(
                "Coach fabricated an added_exercise for a nameless request. "
                f"added_exercise={ae!r}"
            )


# ── Test 4: no false trigger ─────────────────────────────────────────────────
class TestNoFalseTrigger:
    def test_warmup_question_does_not_add(self, api):
        # This is an *advice* question, not an add. Retry a few times to
        # tolerate LLM noise; MUST end up with added_exercise=None.
        r, data = _coach_chat_retry(
            api,
            "How should I warm up before squats?",
            expect_added=False,
        )
        assert r.status_code == 200
        assert data is not None
        _assert_response_shape(data)
        assert data["added_exercise"] is None, (
            "Coach phantom-added an exercise for a general advice question. "
            f"added_exercise={data['added_exercise']!r}"
        )
        # And no <ADD_EXERCISE> tag should have leaked into the text.
        assert "<ADD_EXERCISE" not in data["response"]


# ── Test 5: context freshness (2b) — current_session honoured ────────────────
class TestCurrentSessionContext:
    def test_coach_sees_live_snapshot(self, api):
        snapshot = (
            "Exercises the athlete added to today:\n"
            "  - Face Pulls [accessory] (3 sets)\n"
            "Sets logged so far today:\n"
            "  - Back Squat: 315 x5"
        )
        # Ask a state-reflection question; retry a couple times to smooth
        # over LLM phrasing variance.
        best = None
        for _ in range(3):
            r = _coach_chat(
                api,
                "What does my session look like right now?",
                current_session=snapshot,
            )
            assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
            data = r.json()
            _assert_response_shape(data)
            text = data["response"].lower()
            mentions_facepulls = ("face pull" in text) or ("facepull" in text)
            mentions_backsquat = ("back squat" in text) or ("315" in text)
            if mentions_facepulls and mentions_backsquat:
                best = (data, True); break
            best = (data, mentions_facepulls and mentions_backsquat)
            time.sleep(1)
        data, ok = best
        assert ok, (
            "Coach did not reflect BOTH the live-added Face Pulls AND the logged "
            f"Back Squat set from the current_session snapshot. response={data['response'][:600]!r}"
        )


# ── Test 6: regression — response shape + PROGRAM_CHANGE still works ─────────
class TestRegression:
    def test_response_shape_on_plain_message(self, api):
        r = _coach_chat(api, "What's the point of accumulation blocks?")
        assert r.status_code == 200
        data = r.json()
        _assert_response_shape(data)
        assert data["added_exercise"] is None
        assert data["has_program_change"] in (True, False)
        # For a generic educational question we don't expect a program change,
        # but we don't fail if the model volunteers one — we only care the
        # field is well-shaped.
        if data["has_program_change"]:
            assert isinstance(data["program_change"], dict)
        else:
            assert data["program_change"] is None or isinstance(data["program_change"], dict)
        assert isinstance(data["conversation_id"], str) and data["conversation_id"]

    def test_program_change_swap_still_fires(self, api):
        # Ask for an explicit exercise swap — the existing <PROGRAM_CHANGE>
        # path should still work end-to-end. LLM is non-deterministic so retry.
        got_swap = False
        last_data = None
        for _ in range(3):
            r = _coach_chat(
                api,
                "My shoulder is bothering me on flat bench today — swap it for a floor press. Confirm the swap.",
            )
            assert r.status_code == 200
            data = r.json()
            _assert_response_shape(data)
            last_data = data
            if data.get("has_program_change") and data.get("program_change"):
                got_swap = True
                break
            time.sleep(1)
        # Report as an assertion but don't hard-fail the whole suite if the
        # LLM stubbornly refuses on this one turn — it's a regression signal.
        assert got_swap, (
            "<PROGRAM_CHANGE> swap did not fire after 3 attempts for an explicit swap request. "
            f"last_response={last_data['response'][:400] if last_data else None!r}"
        )
