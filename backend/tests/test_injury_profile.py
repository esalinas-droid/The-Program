"""Tests for injury preview, apply-injury-update, and extended profile fields"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module", autouse=True)
def ensure_profile(session):
    """Ensure profile exists before tests"""
    r = session.get(f"{BASE_URL}/api/profile")
    if r.status_code == 404:
        session.post(f"{BASE_URL}/api/seed")


# ── injury-preview tests ──────────────────────────────────────────────────────

class TestInjuryPreview:
    """POST /api/plan/injury-preview"""

    def test_preview_with_new_injury_flags_returns_restricted(self, session):
        """Adding knee severe injury should restrict knee exercises"""
        payload = {"newInjuryFlags": ["Severe knee injury"]}
        r = session.post(f"{BASE_URL}/api/plan/injury-preview", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "exercisesRestricted" in data
        assert "exercisesRestored" in data
        assert "hasChanges" in data
        assert "addedInjuries" in data
        assert "removedInjuries" in data
        print(f"Preview result: hasChanges={data['hasChanges']}, restricted={len(data['exercisesRestricted'])}, restored={len(data['exercisesRestored'])}")

    def test_preview_with_shoulder_injury_restricts_shoulder_exercises(self, session):
        """Adding shoulder severe should restrict shoulder exercises"""
        # First clear injuries
        session.put(f"{BASE_URL}/api/profile", json={"injuryFlags": []})
        payload = {"newInjuryFlags": ["Severe shoulder injury"]}
        r = session.post(f"{BASE_URL}/api/plan/injury-preview", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["hasChanges"] == True
        restricted_names = [e["name"] for e in data["exercisesRestricted"]]
        # Floor Press, Speed Bench Press, OHP, etc. should be restricted
        assert len(data["exercisesRestricted"]) > 0, "Should restrict shoulder exercises"
        assert "Severe shoulder injury" in data["addedInjuries"]
        print(f"Shoulder restricted: {restricted_names}")

    def test_preview_with_empty_flags_no_current_injuries_returns_no_changes(self, session):
        """Empty new flags + no current injuries = hasChanges: false"""
        # Clear profile injuries first
        session.put(f"{BASE_URL}/api/profile", json={"injuryFlags": []})
        payload = {"newInjuryFlags": []}
        r = session.post(f"{BASE_URL}/api/plan/injury-preview", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["hasChanges"] == False
        print(f"No changes: {data['summary']}")

    def test_preview_restores_exercises_when_injury_removed(self, session):
        """Removing injury should restore exercises"""
        # Set current injuries with knee
        session.put(f"{BASE_URL}/api/profile", json={"injuryFlags": ["Severe knee injury"]})
        # Preview with no injuries (removing knee)
        payload = {"newInjuryFlags": []}
        r = session.post(f"{BASE_URL}/api/plan/injury-preview", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["hasChanges"] == True
        assert len(data["exercisesRestored"]) > 0, "Should restore knee exercises"
        print(f"Restored: {[e['name'] for e in data['exercisesRestored']]}")

    def test_preview_response_structure(self, session):
        """Response has all expected fields with correct types"""
        r = session.post(f"{BASE_URL}/api/plan/injury-preview", json={"newInjuryFlags": ["back pain"]})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data["exercisesRestricted"], list)
        assert isinstance(data["exercisesRestored"], list)
        assert isinstance(data["hasChanges"], bool)
        assert isinstance(data["addedInjuries"], list)
        assert isinstance(data["removedInjuries"], list)
        assert isinstance(data["summary"], str)
        # Check exercise entry structure if any
        if data["exercisesRestricted"]:
            ex = data["exercisesRestricted"][0]
            assert "name" in ex
            assert "category" in ex
            assert "reason" in ex


# ── apply-injury-update tests ─────────────────────────────────────────────────

class TestApplyInjuryUpdate:
    """POST /api/plan/apply-injury-update"""

    def test_apply_saves_new_injury_flags(self, session):
        """Should update injuryFlags in profile"""
        new_flags = ["Right shoulder strain", "Low back"]
        r = session.post(f"{BASE_URL}/api/plan/apply-injury-update", json={"newInjuryFlags": new_flags})
        assert r.status_code == 200
        data = r.json()
        assert data["success"] == True
        # Verify persisted in profile
        profile = session.get(f"{BASE_URL}/api/profile").json()
        assert set(profile["injuryFlags"]) == set(new_flags), f"Expected {new_flags}, got {profile['injuryFlags']}"

    def test_apply_returns_added_removed_arrays(self, session):
        """Response includes added and removed arrays"""
        # Set initial state
        session.put(f"{BASE_URL}/api/profile", json={"injuryFlags": ["Low back"]})
        # Apply new flags
        r = session.post(f"{BASE_URL}/api/plan/apply-injury-update",
                         json={"newInjuryFlags": ["Right knee", "Low back"]})
        assert r.status_code == 200
        data = r.json()
        assert data["success"] == True
        assert "added" in data
        assert "removed" in data
        assert "Right knee" in data["added"]
        assert "Low back" not in data["added"]  # Already existed
        print(f"Added: {data['added']}, Removed: {data['removed']}")

    def test_apply_logs_to_substitutions(self, session):
        """Should create a substitution log entry"""
        import time
        # Get current substitution count
        subs_before = session.get(f"{BASE_URL}/api/substitutions").json()
        count_before = len(subs_before)

        session.post(f"{BASE_URL}/api/plan/apply-injury-update",
                     json={"newInjuryFlags": ["Wrist pain"]})

        time.sleep(0.5)
        subs_after = session.get(f"{BASE_URL}/api/substitutions").json()
        assert len(subs_after) > count_before, "Should have logged substitution"
        # Find the Profile Update entry (may not be first due to missing timestamp field)
        profile_updates = [s for s in subs_after if s.get("sessionType") == "Profile Update"]
        assert len(profile_updates) > 0, "Should have a 'Profile Update' substitution log entry"
        print(f"Logged substitution: {profile_updates[0]['reason']}")

    def test_apply_with_no_profile_returns_404(self, session):
        """No profile scenario - if no profile returns 404 (hard to test without dropping DB)"""
        # This is a negative test - just ensure the endpoint exists and normal case works
        r = session.post(f"{BASE_URL}/api/plan/apply-injury-update", json={"newInjuryFlags": []})
        assert r.status_code in [200, 404]


# ── PUT /api/profile extended fields ─────────────────────────────────────────

class TestProfileExtendedFields:
    """PUT /api/profile with new fields"""

    def test_put_profile_accepts_goal(self, session):
        r = session.put(f"{BASE_URL}/api/profile", json={"goal": "hypertrophy"})
        assert r.status_code == 200
        data = r.json()
        assert data["goal"] == "hypertrophy"

    def test_put_profile_accepts_primaryWeaknesses(self, session):
        r = session.put(f"{BASE_URL}/api/profile", json={"primaryWeaknesses": ["lockout", "hip drive"]})
        assert r.status_code == 200
        assert r.json()["primaryWeaknesses"] == ["lockout", "hip drive"]

    def test_put_profile_accepts_specialtyEquipment(self, session):
        r = session.put(f"{BASE_URL}/api/profile", json={"specialtyEquipment": ["SSB", "Yoke"]})
        assert r.status_code == 200
        assert r.json()["specialtyEquipment"] == ["SSB", "Yoke"]

    def test_put_profile_accepts_sleepHours(self, session):
        r = session.put(f"{BASE_URL}/api/profile", json={"sleepHours": 8.5})
        assert r.status_code == 200
        assert r.json()["sleepHours"] == 8.5

    def test_put_profile_accepts_stressLevel(self, session):
        r = session.put(f"{BASE_URL}/api/profile", json={"stressLevel": "high"})
        assert r.status_code == 200
        assert r.json()["stressLevel"] == "high"

    def test_put_profile_accepts_occupationType(self, session):
        r = session.put(f"{BASE_URL}/api/profile", json={"occupationType": "active"})
        assert r.status_code == 200
        assert r.json()["occupationType"] == "active"

    def test_put_profile_accepts_competition_fields(self, session):
        payload = {
            "hasCompetition": True,
            "competitionDate": "2026-06-15",
            "competitionType": "Strongman"
        }
        r = session.put(f"{BASE_URL}/api/profile", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["hasCompetition"] == True
        assert data["competitionDate"] == "2026-06-15"
        assert data["competitionType"] == "Strongman"

    def test_put_profile_accepts_gymTypes(self, session):
        r = session.put(f"{BASE_URL}/api/profile", json={"gymTypes": ["commercial", "home"]})
        assert r.status_code == 200
        assert r.json()["gymTypes"] == ["commercial", "home"]

    def test_put_profile_accepts_trainingDaysCount(self, session):
        r = session.put(f"{BASE_URL}/api/profile", json={"trainingDaysCount": 5})
        assert r.status_code == 200
        assert r.json()["trainingDaysCount"] == 5

    def test_put_profile_all_new_fields_at_once(self, session):
        payload = {
            "goal": "strength",
            "primaryWeaknesses": ["deadlift lockout"],
            "specialtyEquipment": ["log", "axle"],
            "sleepHours": 7.5,
            "stressLevel": "moderate",
            "occupationType": "sedentary",
            "hasCompetition": True,
            "competitionDate": "2026-08-01",
            "competitionType": "Powerlifting",
            "gymTypes": ["private"],
            "trainingDaysCount": 4
        }
        r = session.put(f"{BASE_URL}/api/profile", json=payload)
        assert r.status_code == 200
        data = r.json()
        for key, val in payload.items():
            assert data[key] == val, f"Field {key}: expected {val}, got {data[key]}"


# ── GET /api/profile returns new fields ──────────────────────────────────────

class TestGetProfileNewFields:
    """GET /api/profile returns all new fields"""

    def test_get_profile_returns_all_new_fields(self, session):
        r = session.get(f"{BASE_URL}/api/profile")
        assert r.status_code == 200
        data = r.json()
        new_fields = [
            "goal", "primaryWeaknesses", "specialtyEquipment",
            "sleepHours", "stressLevel", "occupationType",
            "hasCompetition", "gymTypes", "trainingDaysCount"
        ]
        for field in new_fields:
            assert field in data, f"Missing field: {field}"
        print(f"All new fields present: {new_fields}")

    def test_get_profile_optional_fields_present(self, session):
        """competitionDate and competitionType are optional but should appear"""
        r = session.get(f"{BASE_URL}/api/profile")
        data = r.json()
        # These optional fields should be in response (even if None)
        assert "competitionDate" in data
        assert "competitionType" in data
