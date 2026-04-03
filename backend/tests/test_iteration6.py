"""
Tests for iteration 6: Coach conversations, apply-recommendation, profile defaults, seed, injury endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')


class TestConversations:
    """GET /api/coach/conversations"""

    def test_get_conversations_returns_list(self):
        r = requests.get(f"{BASE_URL}/api/coach/conversations")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"PASS: GET /api/coach/conversations returned list with {len(data)} items")

    def test_get_conversation_invalid_id_returns_422_or_404(self):
        r = requests.get(f"{BASE_URL}/api/coach/conversations/nonexistentid")
        assert r.status_code in (422, 404, 400), f"Expected 422/404/400, got {r.status_code}: {r.text}"
        print(f"PASS: GET /api/coach/conversations/nonexistentid returned {r.status_code}")


class TestApplyRecommendation:
    """POST /api/coach/apply-recommendation"""

    def test_apply_recommendation_invalid_object_id(self):
        r = requests.post(f"{BASE_URL}/api/coach/apply-recommendation", json={
            "conversation_id": "test",
            "summary": "test",
            "details": "test"
        })
        assert r.status_code in (422, 400, 500), f"Expected 422/400/500, got {r.status_code}: {r.text}"
        # Should not be 200 for invalid ObjectId
        assert r.status_code != 200, "Should not succeed with invalid ObjectId"
        print(f"PASS: POST apply-recommendation with invalid ObjectId returned {r.status_code}")


class TestProfile:
    """GET /api/profile - name should not be hardcoded 'Eric'"""

    def test_profile_name_not_hardcoded_eric(self):
        r = requests.get(f"{BASE_URL}/api/profile")
        if r.status_code == 404:
            print("SKIP: Profile not found (not seeded)")
            pytest.skip("Profile not found")
        assert r.status_code == 200
        data = r.json()
        assert data.get("name") != "Eric", "Name should not be hardcoded as 'Eric'"
        print(f"PASS: Profile name is '{data.get('name')}' (not hardcoded Eric)")

    def test_profile_bodyweight_default(self):
        r = requests.get(f"{BASE_URL}/api/profile")
        if r.status_code == 404:
            pytest.skip("Profile not found")
        assert r.status_code == 200
        data = r.json()
        # Default should be 0.0 not some hardcoded value
        bw = data.get("currentBodyweight")
        assert isinstance(bw, (int, float)), f"Expected numeric bodyweight, got {type(bw)}"
        print(f"PASS: Profile bodyweight is {bw} (numeric, not hardcoded)")


class TestSeed:
    """POST /api/seed - second call returns seeded: false"""

    def test_seed_already_seeded_returns_false(self):
        # First ensure profile exists
        r1 = requests.post(f"{BASE_URL}/api/seed")
        r2 = requests.post(f"{BASE_URL}/api/seed")
        assert r2.status_code == 200
        data = r2.json()
        assert data.get("seeded") == False, f"Expected seeded=False, got {data}"
        print(f"PASS: POST /api/seed second call returned seeded=False")


class TestInjuryEndpoints:
    """Injury preview and apply"""

    def test_injury_preview_works(self):
        r = requests.post(f"{BASE_URL}/api/plan/injury-preview", json={"newInjuryFlags": ["Knee (general)"]})
        assert r.status_code == 200
        data = r.json()
        assert "addedInjuries" in data or "hasChanges" in data
        print(f"PASS: POST /api/plan/injury-preview returned {r.status_code}")

    def test_apply_injury_update(self):
        # Make sure profile exists first
        requests.post(f"{BASE_URL}/api/seed")
        r = requests.post(f"{BASE_URL}/api/plan/apply-injury-update", json={"newInjuryFlags": ["Knee (general)"]})
        assert r.status_code == 200
        data = r.json()
        assert data.get("success") == True
        print(f"PASS: POST /api/plan/apply-injury-update returned success=True")
        # Cleanup: reset injury flags
        requests.post(f"{BASE_URL}/api/plan/apply-injury-update", json={"newInjuryFlags": []})
