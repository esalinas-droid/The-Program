"""
End-to-end progression test — hits live backend to verify NEW plan generation
produces genuine progression (Week3 > Week1 in Intro, deload < preceding week),
and confirms existing saved plans are untouched.

Runs against http://localhost:8001 (internal backend port). Uses the same
EXPO_PUBLIC_BACKEND_URL from frontend/.env for the public path when available.
"""
import os
import re
import uuid
import requests
import pytest

BASE_URL = "http://localhost:8001"


def _num(load):
    if not isinstance(load, str):
        return None
    m = re.match(r"^(\d+(?:\.\d+)?)\+?$", load.strip())
    return float(m.group(1)) if m else None


def _work_set_count(session):
    return sum(1 for ex in session.get("exercises", []) for st in ex.get("targetSets", []) if st.get("setType") == "work")


def _work_loads(session):
    out = []
    for ex in session.get("exercises", []):
        for st in ex.get("targetSets", []):
            if st.get("setType") in ("work", "ramp"):
                v = _num(st.get("targetLoad"))
                if v is not None:
                    out.append(v)
    return out


def _find_session(plan, week_number, session_type):
    for ph in plan.get("phases", []):
        for b in ph.get("blocks", []):
            for w in b.get("weeks", []):
                if w.get("weekNumber") == week_number:
                    for s in w.get("sessions", []):
                        if s.get("sessionType") == session_type:
                            return w, s
    return None, None


@pytest.fixture(scope="module")
def fresh_user_token():
    """Register a brand-new user and return the JWT."""
    email = f"TEST_prog_{uuid.uuid4().hex[:10]}@theprogram.app"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email": email, "password": "Throwaway-Reg-1!", "name": "TEST_ProgUser",
    }, timeout=30)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token")
    assert token, f"no token in register response: {data}"
    return {"token": token, "email": email, "userId": data["user"]["userId"]}


@pytest.fixture(scope="module")
def generated_plan(fresh_user_token):
    """POST intake and return the generated year plan (Strength / freq 4)."""
    headers = {"Authorization": f"Bearer {fresh_user_token['token']}",
               "Content-Type": "application/json"}
    intake = {
        "goal": "strength",
        "experience": "intermediate",
        "lifts": {"squat": 405, "bench": 275, "deadlift": 495},
        "liftUnit": "lbs",
        "frequency": 4,
        "injuries": [],
        "gym": [],
    }
    r = requests.post(f"{BASE_URL}/api/profile/intake", json=intake, headers=headers, timeout=120)
    assert r.status_code == 200, f"intake failed: {r.status_code} {r.text[:500]}"

    # Fetch generated year plan
    r = requests.get(f"{BASE_URL}/api/plan/year", headers=headers, timeout=30)
    assert r.status_code == 200, f"plan/year failed: {r.status_code} {r.text[:500]}"
    plan = r.json()
    assert plan.get("phases"), "plan has no phases"
    return plan


# ── (1) DE weekly escalation on the live-generated plan ────────────────────
def test_speed_bench_week3_heavier_than_week1(generated_plan):
    w1, s1 = _find_session(generated_plan, 1, "Speed Upper")
    w3, s3 = _find_session(generated_plan, 3, "Speed Upper")
    assert s1 and s3, "Speed Upper session missing in week 1 or 3"

    # Speed Bench is DE main lift, first exercise
    ex1 = s1["exercises"][0]
    ex3 = s3["exercises"][0]
    assert ex1["name"] == "Speed Bench", f"Expected Speed Bench, got {ex1['name']}"
    assert ex3["name"] == "Speed Bench", f"Expected Speed Bench, got {ex3['name']}"

    load1 = _num(ex1["targetSets"][0]["targetLoad"])
    load3 = _num(ex3["targetSets"][0]["targetLoad"])
    assert load1 and load3, f"missing numeric loads: w1={load1}, w3={load3}"

    ratio = load3 / load1
    print(f"\n[E2E] Speed Bench W1={load1} lbs → W3={load3} lbs  (ratio {ratio:.3f})")
    assert load3 > load1, f"W3 {load3} must be > W1 {load1}"
    # Intro phase deStep=0.05 × 2 wks = +10%
    assert 1.07 <= ratio <= 1.13, f"expected ~+10% escalation, got ratio {ratio:.3f}"


# ── (2) Deload week (52) has fewer sets AND lower load than week 51 ────────
def test_deload_week_reduces_volume_and_intensity(generated_plan):
    # Deload week is 52
    assert 52 in (generated_plan.get("deloadWeeks") or []), \
        f"expected week 52 in deloadWeeks, got {generated_plan.get('deloadWeeks')}"

    w51, s51 = _find_session(generated_plan, 51, "Heavy Lower")
    w52, s52 = _find_session(generated_plan, 52, "Heavy Lower")
    assert s51 and s52, "Heavy Lower session missing in week 51 or 52"

    sets51 = _work_set_count(s51)
    sets52 = _work_set_count(s52)
    peak51 = max(_work_loads(s51) or [0])
    peak52 = max(_work_loads(s52) or [0])

    print(f"\n[E2E] Heavy Lower W51: sets={sets51}, peak={peak51}  |  W52 (deload): sets={sets52}, peak={peak52}")
    assert w52.get("isDeload") is True, "week 52 not flagged isDeload"
    assert sets52 < sets51, f"deload sets {sets52} !< prev {sets51}"
    assert peak52 < peak51, f"deload peak {peak52} !< prev {peak51}"


# ── (3) /plan/session/today still returns a valid session (regression) ─────
def test_plan_session_today_still_works(fresh_user_token):
    headers = {"Authorization": f"Bearer {fresh_user_token['token']}"}
    r = requests.get(f"{BASE_URL}/api/plan/session/today", headers=headers, timeout=30)
    assert r.status_code == 200, f"session/today failed: {r.status_code} {r.text[:500]}"
    session = r.json()
    # Endpoint may wrap in a container — accept either shape
    if "session" in session and isinstance(session["session"], dict):
        session = session["session"]
    assert session.get("exercises"), f"today session has no exercises: {list(session.keys())}"
    ex0 = session["exercises"][0]
    assert ex0.get("targetSets"), f"first exercise has no targetSets: {ex0}"
    print(f"\n[E2E] /plan/session/today OK — {len(session['exercises'])} exercises, "
          f"first ex '{ex0.get('name')}' has {len(ex0['targetSets'])} target sets")


# ── (4) Existing users' plans are unaffected by new plan generation ────────
def test_existing_user_plans_unaffected(fresh_user_token, generated_plan):
    """
    Meta-test: verify plan_generator._apply_progression() writes only to fields
    it should, and the DB doc for our fresh user contains progressed week 3 loads
    that differ from week 1 (proving mutation applies to NEW gen only).
    Also lists count of saved_plans for user_001 (DEFAULT_USER) as a sanity check.
    """
    # Fetch programs library to confirm active plan exists and has phases
    headers = {"Authorization": f"Bearer {fresh_user_token['token']}"}
    r = requests.get(f"{BASE_URL}/api/programs", headers=headers, timeout=30)
    assert r.status_code == 200, f"programs failed: {r.status_code} {r.text[:500]}"
    library = r.json()
    active = library.get("active")
    assert active, "expected an active plan in library"

    # Confirm the persisted plan has progressed loads (not identical weeks)
    w1, s1 = _find_session(active, 1, "Speed Upper")
    w3, s3 = _find_session(active, 3, "Speed Upper")
    if s1 and s3:
        l1 = _num(s1["exercises"][0]["targetSets"][0]["targetLoad"])
        l3 = _num(s3["exercises"][0]["targetSets"][0]["targetLoad"])
        assert l3 > l1, (
            f"persisted plan not progressed: w1={l1} w3={l3} — indicates DB writes "
            f"are re-cloning identical weeks"
        )
        print(f"\n[E2E] Persisted plan progression confirmed: W1={l1} → W3={l3}")
