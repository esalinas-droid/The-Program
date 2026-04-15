"""Tests for badges endpoint - UP NEXT redesign verification"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://the-program-app.preview.emergentagent.com').rstrip('/')

@pytest.fixture
def auth_headers():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "user_a@theprogram.app",
        "password": "StrongmanA123"
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json().get("token")
    return {"Authorization": f"Bearer {token}"}

class TestBadgesEndpoint:
    def test_badges_returns_200(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/badges", headers=auth_headers)
        assert resp.status_code == 200

    def test_badges_structure(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/badges", headers=auth_headers)
        data = resp.json()
        assert "earned" in data
        assert "locked" in data
        assert "totalPossible" in data
        assert isinstance(data["earned"], list)
        assert isinstance(data["locked"], list)

    def test_locked_badges_have_current_target_remaining(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/badges", headers=auth_headers)
        data = resp.json()
        for badge in data["locked"]:
            assert "current" in badge, f"Badge {badge.get('id')} missing 'current'"
            assert "target" in badge, f"Badge {badge.get('id')} missing 'target'"
            assert "remaining" in badge, f"Badge {badge.get('id')} missing 'remaining'"
            assert badge["remaining"] >= 0
            assert badge["target"] > 0

    def test_locked_badges_sorted_by_remaining_asc(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/badges", headers=auth_headers)
        data = resp.json()
        locked = data["locked"]
        if len(locked) > 1:
            remainings = [b["remaining"] for b in locked]
            assert remainings == sorted(remainings), f"Locked not sorted by remaining: {remainings}"

    def test_earned_badges_have_icon_name_desc(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/badges", headers=auth_headers)
        data = resp.json()
        for badge in data["earned"]:
            assert "id" in badge
            assert "name" in badge
            assert "icon" in badge
            assert "desc" in badge

    def test_total_possible(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/badges", headers=auth_headers)
        data = resp.json()
        total = data["totalPossible"]
        assert total == len(data["earned"]) + len(data["locked"])
        print(f"Total badges: {total}, Earned: {len(data['earned'])}, Locked: {len(data['locked'])}")
        print(f"First 3 locked (UP NEXT): {[b['name'] + ' remaining=' + str(b['remaining']) for b in data['locked'][:3]]}")
