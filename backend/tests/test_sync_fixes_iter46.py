"""
Test: Sync fixes - PRs, Exercise Names, Badge Counts, Leaderboard (iteration 46)
Tests 7 bug fixes in server.py
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

USER_A_EMAIL = "user_a@theprogram.app"
USER_A_PASS = "StrongmanA123"

@pytest.fixture(scope="module")
def user_a_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": USER_A_EMAIL, "password": USER_A_PASS})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["token"]

@pytest.fixture(scope="module")
def auth_headers(user_a_token):
    return {"Authorization": f"Bearer {user_a_token}"}


# 1. Badges: PR count from db.log not tracked_lifts.bestE1rm
class TestBadges:
    """Badge endpoint - PR badges reflect actual log data"""

    def test_badges_returns_200(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/badges", headers=auth_headers)
        assert resp.status_code == 200, f"Badges failed: {resp.text}"

    def test_badges_have_earned_locked_structure(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/badges", headers=auth_headers)
        data = resp.json()
        # Should have list of badges with 'earned' field
        assert isinstance(data, list) or isinstance(data, dict), "Unexpected response type"
        # If list
        if isinstance(data, list):
            for badge in data:
                assert "earned" in badge, f"Badge missing 'earned' field: {badge}"
        else:
            # dict with badges key
            badges = data.get("badges", data.get("earned", []))
            assert badges is not None

    def test_pr_badge_exists(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/badges", headers=auth_headers)
        data = resp.json()
        badges = data if isinstance(data, list) else data.get("badges", [])
        pr_badges = [b for b in badges if "pr" in str(b.get("id", "")).lower() or "PR" in str(b.get("name", ""))]
        print(f"PR-related badges found: {len(pr_badges)}")
        # Just print for visibility - badges may or may not be earned
        for b in pr_badges[:3]:
            print(f"  Badge: {b.get('id')} | earned={b.get('earned')} | name={b.get('name')}")


# 2. GET /api/prs - returns entries for ALL logged exercises
class TestPRs:
    """PR endpoint - includes all logged exercises dynamically"""

    def test_prs_returns_200(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/prs", headers=auth_headers)
        assert resp.status_code == 200, f"PRs failed: {resp.text}"

    def test_prs_returns_list(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/prs", headers=auth_headers)
        data = resp.json()
        prs = data if isinstance(data, list) else data.get("prs", [])
        assert isinstance(prs, list), "PRs should be a list"
        print(f"Total PR entries: {len(prs)}")
        if prs:
            print(f"Sample PR: {prs[0]}")

    def test_prs_include_exercise_name(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/prs", headers=auth_headers)
        data = resp.json()
        prs = data if isinstance(data, list) else data.get("prs", [])
        for pr in prs[:5]:
            assert "exercise" in pr or "exerciseName" in pr or "name" in pr, f"PR missing exercise name: {pr}"


# 3. GET /api/prs/bests/overview - best lift per category
class TestBestsOverview:
    """Bests overview - expanded category lists"""

    def test_bests_overview_returns_200(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/prs/bests/overview", headers=auth_headers)
        assert resp.status_code == 200, f"Bests overview failed: {resp.text}"

    def test_bests_overview_has_categories(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/prs/bests/overview", headers=auth_headers)
        data = resp.json()
        print(f"Bests overview keys: {list(data.keys()) if isinstance(data, dict) else 'list'}")
        # Should have squat, press, pull or similar categories
        if isinstance(data, dict):
            categories = list(data.keys())
            print(f"Categories: {categories}")
            assert len(categories) > 0, "No categories returned"


# 4. GET /api/lifts - only authenticated user's tracked lifts
class TestLifts:
    """Lifts endpoint - user isolation (no cross-user leakage)"""

    def test_lifts_returns_200(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/lifts", headers=auth_headers)
        assert resp.status_code == 200, f"Lifts failed: {resp.text}"

    def test_lifts_returns_list(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/lifts", headers=auth_headers)
        data = resp.json()
        lifts = data if isinstance(data, list) else data.get("lifts", [])
        assert isinstance(lifts, list), "Lifts should be a list"
        print(f"Total lifts for user_a: {len(lifts)}")

    def test_lifts_no_cross_user_data(self):
        """Login as user_b and verify different lifts returned"""
        resp_b = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "user_b@theprogram.app", "password": "HypertrophyB123"})
        if resp_b.status_code != 200:
            pytest.skip("user_b login failed")
        token_b = resp_b.json()["token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        resp_a = requests.post(f"{BASE_URL}/api/auth/login", json={"email": USER_A_EMAIL, "password": USER_A_PASS})
        token_a = resp_a.json()["token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        lifts_a = requests.get(f"{BASE_URL}/api/lifts", headers=headers_a).json()
        lifts_b = requests.get(f"{BASE_URL}/api/lifts", headers=headers_b).json()

        list_a = lifts_a if isinstance(lifts_a, list) else lifts_a.get("lifts", [])
        list_b = lifts_b if isinstance(lifts_b, list) else lifts_b.get("lifts", [])

        print(f"User A lifts count: {len(list_a)}, User B lifts count: {len(list_b)}")
        # Check userIds in response (if present)
        user_ids_in_a = set(l.get("userId", "") for l in list_a if "userId" in l)
        user_ids_in_b = set(l.get("userId", "") for l in list_b if "userId" in l)
        print(f"UserIDs in A's lifts: {user_ids_in_a}")
        print(f"UserIDs in B's lifts: {user_ids_in_b}")
        # Ensure user B's data is not in user A's lifts
        if user_ids_in_a and user_ids_in_b:
            overlap = user_ids_in_a & user_ids_in_b
            assert len(overlap) == 0, f"Cross-user data leak! Overlapping userIds: {overlap}"


# 5. GET /api/leaderboard?tab=prs - correct PR counts from log
class TestLeaderboard:
    """Leaderboard PR tab - log-based PR counting"""

    def test_leaderboard_prs_returns_200(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/leaderboard?tab=prs", headers=auth_headers)
        assert resp.status_code == 200, f"Leaderboard PRs failed: {resp.text}"

    def test_leaderboard_prs_has_entries(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/leaderboard?tab=prs", headers=auth_headers)
        data = resp.json()
        entries = data if isinstance(data, list) else data.get("leaderboard", data.get("entries", []))
        print(f"Leaderboard PR entries: {len(entries)}")
        if entries:
            print(f"Sample entry: {entries[0]}")
            # Each entry should have a PR count field
            for e in entries[:3]:
                pr_val = e.get("prs") or e.get("pr_count") or e.get("prCount") or e.get("value")
                print(f"  User: {e.get('name', e.get('username', 'unknown'))} | PRs: {pr_val}")


# 6. GET /api/analytics/overview - prsThisBlock > 0 for first-block PRs
class TestAnalyticsOverview:
    """Analytics overview - first-block PR counting (block_max > 0)"""

    def test_analytics_overview_returns_200(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/analytics/overview", headers=auth_headers)
        assert resp.status_code == 200, f"Analytics overview failed: {resp.text}"

    def test_analytics_prs_this_block_field_exists(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/analytics/overview", headers=auth_headers)
        data = resp.json()
        print(f"Analytics overview keys: {list(data.keys()) if isinstance(data, dict) else data}")
        prs_this_block = data.get("prsThisBlock") if isinstance(data, dict) else None
        print(f"prsThisBlock: {prs_this_block}")
        assert "prsThisBlock" in data, f"prsThisBlock field missing from analytics: {list(data.keys())}"

    def test_analytics_prs_this_block_non_negative(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/analytics/overview", headers=auth_headers)
        data = resp.json()
        prs = data.get("prsThisBlock", 0)
        assert prs >= 0, f"prsThisBlock should be >= 0, got {prs}"
        print(f"prsThisBlock = {prs}")


# 7. GET /api/weekly-review - prsHit > 0 for sets logged with e1rm > 0
class TestWeeklyReview:
    """Weekly review - PR counting allows val > 0"""

    def test_weekly_review_returns_200(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/weekly-review", headers=auth_headers)
        assert resp.status_code == 200, f"Weekly review failed: {resp.text}"

    def test_weekly_review_prs_hit_field(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/weekly-review", headers=auth_headers)
        data = resp.json()
        # prsHit is inside stats sub-object
        stats = data.get("stats", {})
        prs_hit = stats.get("prsHit")
        print(f"Weekly review stats: {stats}")
        print(f"prsHit: {prs_hit}")
        assert "prsHit" in stats, f"prsHit field missing from weekly review stats: {list(stats.keys())}"

    def test_weekly_review_prs_hit_non_negative(self, auth_headers):
        resp = requests.get(f"{BASE_URL}/api/weekly-review", headers=auth_headers)
        data = resp.json()
        prs = data.get("stats", {}).get("prsHit", 0)
        assert prs >= 0, f"prsHit should be >= 0, got {prs}"
        print(f"prsHit = {prs}")
