"""Phase 2 Batch 3 Re-test: undo prehab fix + competition set hasCompetition fix"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

EMAIL = "user_a@theprogram.app"
PASSWORD = "StrongmanA123"


@pytest.fixture(scope="module")
def token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    t = resp.json().get("token")
    assert t, "No token in login response"
    print(f"Login OK")
    return t


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --- Ensure plan exists ---
def test_profile_intake(auth_headers):
    """Ensure a training plan exists for user_a"""
    payload = {
        "age": 30, "sex": "male", "bodyweight": 100, "sport": "strongman",
        "experience": "intermediate", "daysPerWeek": 4,
        "goal": "strength", "competitionDate": None
    }
    resp = requests.post(f"{BASE_URL}/api/profile/intake", json=payload, headers=auth_headers)
    assert resp.status_code in (200, 201), f"Intake failed: {resp.text}"
    data = resp.json()
    assert data.get("plan"), "No plan in intake response"
    print(f"Intake OK, plan has {len(data['plan'].get('phases', []))} phases")


# --- Setup prehab: clear injuries then re-add to create fresh prehab entries ---
def test_setup_prehab_entries(auth_headers):
    """Clear injury flags, re-apply SI joint to get fresh prehab additions logged"""
    # Clear first
    r1 = requests.post(f"{BASE_URL}/api/plan/apply-injury-update", json={"newInjuryFlags": []}, headers=auth_headers)
    assert r1.status_code == 200, f"Clear injuries failed: {r1.text}"

    # Re-apply SI Joint to trigger prehab addition
    r2 = requests.post(f"{BASE_URL}/api/plan/apply-injury-update",
                       json={"newInjuryFlags": ["SI Joint / Pelvis"]}, headers=auth_headers)
    assert r2.status_code == 200, f"Apply injury failed: {r2.text}"
    data = r2.json()
    prehab = data.get("changes_by_category", {}).get("prehab", [])
    print(f"Prehab exercises added: {len(prehab)}")
    assert len(prehab) > 0, "No prehab exercises were added to the plan"


# --- Change log ---
def test_change_log_has_prehab_entries(auth_headers):
    """GET /api/coach/change-log should have undoable prehab entries"""
    resp = requests.get(f"{BASE_URL}/api/coach/change-log", headers=auth_headers)
    assert resp.status_code == 200, f"Change log failed: {resp.text}"
    data = resp.json()
    entries = data.get("changes", [])
    undoable_prehab = [e for e in entries if e.get("undoable") and e.get("original") == "(none)"]
    print(f"Undoable prehab entries: {len(undoable_prehab)}")
    assert len(undoable_prehab) > 0, "No undoable prehab entries found"


# --- Core test: undo prehab addition ---
def test_undo_prehab_addition(auth_headers):
    """
    BUG FIX: undo for prehab addition (originalExercise='(none)') should
    REMOVE the exercise from all sessions instead of renaming to '(none)'.
    Must return success=true and reverted > 0.
    """
    resp = requests.get(f"{BASE_URL}/api/coach/change-log", headers=auth_headers)
    assert resp.status_code == 200
    entries = resp.json().get("changes", [])

    # Find fresh undoable prehab entry
    prehab_entry = next(
        (e for e in entries if e.get("undoable") and e.get("original") == "(none)" and not e.get("undone")),
        None
    )
    assert prehab_entry, "No undoable prehab entry found"

    change_id = prehab_entry["changeId"]
    replacement = prehab_entry["replacement"]
    print(f"Undoing prehab entry: changeId={change_id}, replacement={replacement}")

    undo_resp = requests.post(f"{BASE_URL}/api/coach/undo/{change_id}", headers=auth_headers)
    assert undo_resp.status_code == 200, f"Undo failed: {undo_resp.text}"
    undo_data = undo_resp.json()
    print(f"Undo response: {undo_data}")

    assert undo_data.get("success") is True, f"Expected success=true, got: {undo_data}"
    assert undo_data.get("reverted", 0) > 0, "Expected reverted > 0"
    assert undo_data.get("isPrehab") is True, "Expected isPrehab=true"
    assert "Removed prehab" in undo_data.get("message", ""), f"Unexpected message: {undo_data.get('message')}"


def test_change_log_entry_marked_undone(auth_headers):
    """After undo, the entry should have undone=true in the change log"""
    resp = requests.get(f"{BASE_URL}/api/coach/change-log", headers=auth_headers)
    assert resp.status_code == 200
    entries = resp.json().get("changes", [])
    undone_entries = [e for e in entries if e.get("undone") is True]
    print(f"Undone entries: {len(undone_entries)}")
    assert len(undone_entries) > 0, "No entries with undone=true after undo"


# --- Competition set ---
def test_competition_set_returns_has_competition_true(auth_headers):
    """
    BUG FIX: POST /api/competition/set must include hasCompetition=true in response.
    """
    resp = requests.post(
        f"{BASE_URL}/api/competition/set",
        json={"competitionDate": "2026-09-15", "eventName": "Test Event"},
        headers=auth_headers
    )
    assert resp.status_code == 200, f"Competition set failed: {resp.text}"
    data = resp.json()
    print(f"Competition set response: {data}")
    assert data.get("hasCompetition") is True, f"Expected hasCompetition=true, got: {data}"


def test_competition_set_past_date_returns_400(auth_headers):
    """POST /api/competition/set with past date should return 400"""
    resp = requests.post(
        f"{BASE_URL}/api/competition/set",
        json={"competitionDate": "2025-01-01", "eventName": "Past Event"},
        headers=auth_headers
    )
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
    print(f"Past date validation OK: {resp.status_code}")
