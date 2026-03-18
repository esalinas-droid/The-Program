"""Backend API tests for The Program app"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

@pytest.fixture
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s

# Health
class TestHealth:
    def test_root(self, client):
        r = client.get(f"{BASE_URL}/api/")
        assert r.status_code == 200
        assert "Program" in r.json().get("message", "")

# Profile
class TestProfile:
    def test_seed_idempotent(self, client):
        r = client.post(f"{BASE_URL}/api/seed")
        assert r.status_code == 200

    def test_get_profile(self, client):
        r = client.get(f"{BASE_URL}/api/profile")
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "Eric"
        assert d["currentBodyweight"] == 274.0
        assert d["currentWeek"] == 1
        assert "basePRs" in d
        assert "injuryFlags" in d
        assert "_id" not in d

    def test_update_profile_units(self, client):
        r = client.put(f"{BASE_URL}/api/profile", json={"units": "kg"})
        assert r.status_code == 200
        assert r.json()["units"] == "kg"
        # Reset
        client.put(f"{BASE_URL}/api/profile", json={"units": "lbs"})

    def test_update_onboarding_complete(self, client):
        r = client.put(f"{BASE_URL}/api/profile", json={"onboardingComplete": True})
        assert r.status_code == 200
        assert r.json()["onboardingComplete"] == True
        # Reset
        client.put(f"{BASE_URL}/api/profile", json={"onboardingComplete": False})

# Log
class TestLog:
    entry_id = None

    def test_create_log_entry(self, client):
        payload = {
            "date": "2026-01-15", "week": 1, "day": "Monday",
            "sessionType": "Max Effort Lower", "exercise": "SSB Box Squat",
            "sets": 1, "weight": 405.0, "reps": 1, "rpe": 9.0,
            "pain": 0, "completed": "Completed"
        }
        r = client.post(f"{BASE_URL}/api/log", json=payload)
        assert r.status_code == 200
        d = r.json()
        assert d["exercise"] == "SSB Box Squat"
        assert d["e1rm"] > 0
        assert "id" in d
        TestLog.entry_id = d["id"]

    def test_get_log(self, client):
        r = client.get(f"{BASE_URL}/api/log")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_log_by_week(self, client):
        r = client.get(f"{BASE_URL}/api/log?week=1")
        assert r.status_code == 200

    def test_week_stats(self, client):
        r = client.get(f"{BASE_URL}/api/log/stats/week/1")
        assert r.status_code == 200
        d = r.json()
        assert "avgPain" in d and "avgRPE" in d

    def test_delete_log_entry(self, client):
        if not TestLog.entry_id:
            pytest.skip("No entry to delete")
        r = client.delete(f"{BASE_URL}/api/log/{TestLog.entry_id}")
        assert r.status_code == 200

# PRs
class TestPRs:
    def test_get_all_prs(self, client):
        r = client.get(f"{BASE_URL}/api/prs")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 21  # 21 tracked exercises

    def test_pr_fields(self, client):
        r = client.get(f"{BASE_URL}/api/prs")
        d = r.json()[0]
        assert "exercise" in d
        assert "bestE1rm" in d
        assert "bestWeight" in d

    def test_get_bests_overview(self, client):
        r = client.get(f"{BASE_URL}/api/prs/bests/overview")
        assert r.status_code == 200
        d = r.json()
        assert "squat" in d and "press" in d and "pull" in d

    def test_pr_history_for_exercise(self, client):
        r = client.get(f"{BASE_URL}/api/prs/SSB%20Box%20Squat")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

# Bodyweight
class TestBodyweight:
    def test_get_bodyweight_history(self, client):
        r = client.get(f"{BASE_URL}/api/bodyweight")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

# Check-in
class TestCheckin:
    checkin_id = None

    def test_create_checkin(self, client):
        payload = {
            "week": 99, "date": "2026-01-15",
            "avgPain": 1.0, "avgRPE": 7.5,
            "completionRate": 85.0, "avgBodyweight": 274.0,
            "personalNotes": "TEST_note"
        }
        r = client.post(f"{BASE_URL}/api/checkin", json=payload)
        assert r.status_code == 200
        d = r.json()
        assert d["week"] == 99
        TestCheckin.checkin_id = d.get("id")

    def test_get_checkins(self, client):
        r = client.get(f"{BASE_URL}/api/checkin")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_checkin_by_week(self, client):
        r = client.get(f"{BASE_URL}/api/checkin/week/99")
        assert r.status_code == 200
        d = r.json()
        assert d is not None
        assert d["week"] == 99
