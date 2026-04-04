"""
Tests for Phase 2 Batch 1 — Intelligent Coaching Upgrades:
- Pain Report API (POST/GET /api/pain-report)
- Readiness Check API (POST /api/readiness, GET /api/readiness/today)
- Session Rating API (POST /api/session-rating, GET /api/session-rating/latest)
- Coach Chat userId scoping fix
- Coach Conversations userId filtering
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get JWT token for user_a"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "user_a@theprogram.app",
        "password": "StrongmanA123"
    })
    if resp.status_code != 200:
        pytest.skip(f"Login failed: {resp.status_code} {resp.text}")
    token = resp.json().get("token") or resp.json().get("access_token")
    assert token, f"No token in response: {resp.json()}"
    return token

@pytest.fixture(scope="module")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


# ── Pain Report Tests ─────────────────────────────────────────────────────────

class TestPainReport:
    """Pain report POST/GET endpoints"""

    def test_create_pain_report(self, auth_headers):
        resp = requests.post(f"{BASE_URL}/api/pain-report", json={
            "exerciseName": "Conventional Deadlift",
            "bodyRegion": "lower_back_test_region",
            "painType": "dull",
            "intensity": 4,
            "timing": "during",
            "sessionType": "ME Lower",
            "notes": "Test pain report 1"
        }, headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success") is True
        assert "id" in data
        assert "flagged" in data
        print(f"Pain report created: id={data['id']}, flagged={data['flagged']}")

    def test_create_pain_report_2(self, auth_headers):
        """Second report - not yet flagged"""
        resp = requests.post(f"{BASE_URL}/api/pain-report", json={
            "exerciseName": "Romanian Deadlift",
            "bodyRegion": "lower_back_test_region",
            "painType": "ache",
            "intensity": 3,
            "timing": "after",
            "sessionType": "ME Lower",
            "notes": "Test pain report 2"
        }, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is True
        # Second report: count=1 before this, so same_region_count=1, flagged=False (need >=2)
        print(f"Pain report 2 created: flagged={data['flagged']}")

    def test_create_pain_report_3_triggers_flag(self, auth_headers):
        """Third report of same region should trigger flag"""
        resp = requests.post(f"{BASE_URL}/api/pain-report", json={
            "exerciseName": "Good Morning",
            "bodyRegion": "lower_back_test_region",
            "painType": "sharp",
            "intensity": 6,
            "timing": "during",
            "sessionType": "ME Lower",
            "notes": "Test pain report 3"
        }, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is True
        assert data.get("flagged") is True, f"Expected flagged=True on 3rd report, got: {data}"
        assert data.get("alertMessage") is not None
        print(f"Pain report 3 flagged: {data['alertMessage']}")

    def test_get_pain_reports(self, auth_headers):
        """GET pain reports should return list and flaggedRegions"""
        resp = requests.get(f"{BASE_URL}/api/pain-report", headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "reports" in data
        assert "flaggedRegions" in data
        assert "hasPainAlerts" in data
        assert len(data["reports"]) >= 3
        # lower_back_test_region should be flagged (3 reports in 7 days)
        assert "lower_back_test_region" in data["flaggedRegions"], \
            f"Expected lower_back_test_region in flaggedRegions: {data['flaggedRegions']}"
        assert data["hasPainAlerts"] is True
        print(f"Flagged regions: {data['flaggedRegions']}, total reports: {len(data['reports'])}")


# ── Readiness Check Tests ──────────────────────────────────────────────────────

class TestReadiness:
    """Readiness check POST/GET endpoints"""

    def test_post_readiness_low(self, auth_headers):
        """Low readiness should trigger easy adjustment"""
        resp = requests.post(f"{BASE_URL}/api/readiness", json={
            "sleepQuality": 2,
            "soreness": 1,
            "moodEnergy": 2
        }, headers=auth_headers)
        # May already have readiness today - 200 either way expected
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "readinessScore" in data
        assert "adjustmentApplied" in data
        assert "adjustmentNote" in data
        assert "recommendation" in data
        print(f"Readiness response: score={data['readinessScore']}, rec={data['recommendation']}")

    def test_get_today_readiness_has_checked_in(self, auth_headers):
        """After submitting readiness, GET /readiness/today should return hasCheckedIn=True"""
        resp = requests.get(f"{BASE_URL}/api/readiness/today", headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "hasCheckedIn" in data
        # We just submitted one above so should be True
        assert data["hasCheckedIn"] is True, f"Expected hasCheckedIn=True: {data}"
        assert data["readiness"] is not None
        assert "sleepQuality" in data["readiness"]
        assert "totalScore" in data["readiness"]
        print(f"Today readiness: hasCheckedIn={data['hasCheckedIn']}, score={data['readiness']['totalScore']}")

    def test_readiness_score_normal(self, auth_headers):
        """Verify readiness recommendation for good scores"""
        resp = requests.post(f"{BASE_URL}/api/readiness", json={
            "sleepQuality": 5,
            "soreness": 5,
            "moodEnergy": 5
        }, headers=auth_headers)
        # This is a second submission today — it will still succeed (no unique constraint)
        assert resp.status_code == 200
        data = resp.json()
        assert data["readinessScore"] == 5.0
        assert data["recommendation"] == "normal"
        assert data["adjustmentApplied"] is False
        print(f"Normal readiness: score={data['readinessScore']}, note={data['adjustmentNote'][:50]}")


# ── Session Rating Tests ───────────────────────────────────────────────────────

class TestSessionRating:
    """Session rating POST/GET endpoints with AI insight"""

    def test_post_session_rating(self, auth_headers):
        """Create a session rating and verify aiInsight returned"""
        resp = requests.post(f"{BASE_URL}/api/session-rating", json={
            "rpe": 8.0,
            "sessionType": "ME Lower",
            "week": 3,
            "notes": "Deadlift felt heavy today",
            "setsLogged": 18,
            "totalSets": 20
        }, headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "id" in data
        assert "aiInsight" in data
        assert "rpe" in data
        assert "completionPct" in data
        assert data["rpe"] == 8.0
        assert data["completionPct"] == 90  # 18/20 = 90%
        assert len(data["aiInsight"]) > 0, "aiInsight should not be empty"
        print(f"Session rating created: rpe={data['rpe']}, completionPct={data['completionPct']}, insight='{data['aiInsight'][:80]}...'")

    def test_get_latest_session_rating(self, auth_headers):
        """GET /session-rating/latest should return the rating just created"""
        resp = requests.get(f"{BASE_URL}/api/session-rating/latest", headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("hasRating") is True
        assert data.get("rating") is not None
        rating = data["rating"]
        assert "rpe" in rating
        assert "aiInsight" in rating
        assert "sessionType" in rating
        assert rating["sessionType"] == "ME Lower"
        print(f"Latest rating: rpe={rating['rpe']}, sessionType={rating['sessionType']}")

    def test_session_rating_completion_calculation(self, auth_headers):
        """Verify completion percentage calculation"""
        resp = requests.post(f"{BASE_URL}/api/session-rating", json={
            "rpe": 7.0,
            "sessionType": "DE Upper",
            "week": 3,
            "setsLogged": 10,
            "totalSets": 0  # zero total sets → 0%
        }, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["completionPct"] == 0
        print(f"Zero totalSets completion: {data['completionPct']}%")


# ── Coach Chat userId Scoping Tests ───────────────────────────────────────────

class TestCoachChatScoping:
    """Verify coach chat and conversations are userId-scoped"""

    def test_coach_conversations_filtered_by_user(self, auth_headers):
        """GET /coach/conversations should only return this user's conversations"""
        resp = requests.get(f"{BASE_URL}/api/coach/conversations", headers=auth_headers)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list)
        print(f"Conversations for user_a: {len(data)} conversations")

    def test_coach_chat_creates_conversation_for_user(self, auth_headers):
        """POST /coach/chat should create a conversation scoped to authenticated user"""
        resp = requests.post(f"{BASE_URL}/api/coach/chat", json={
            "message": "What should I focus on for recovery today?",
            "conversation_history": []
        }, headers=auth_headers, timeout=30)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "response" in data
        assert "conversation_id" in data
        assert len(data["response"]) > 0
        print(f"Coach chat response (first 100 chars): {data['response'][:100]}")

        # Now verify the conversation appears in the user's list
        conv_resp = requests.get(f"{BASE_URL}/api/coach/conversations", headers=auth_headers)
        assert conv_resp.status_code == 200
        conversations = conv_resp.json()
        conv_ids = [c["id"] for c in conversations]
        assert data["conversation_id"] in conv_ids, \
            f"New conversation {data['conversation_id']} not in user's list: {conv_ids}"
        print(f"Conversation correctly scoped to user: {data['conversation_id']}")

    def test_user_b_cannot_see_user_a_conversations(self):
        """User B should NOT see User A's conversations (userId scoping check)"""
        # Login as User B
        resp_b = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "user_b@theprogram.app",
            "password": "HypertrophyB123"
        })
        if resp_b.status_code != 200:
            pytest.skip("User B login failed")
        token_b = resp_b.json().get("token") or resp_b.json().get("access_token")
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # Login as User A to get their conversations
        resp_a = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "user_a@theprogram.app",
            "password": "StrongmanA123"
        })
        token_a = resp_a.json().get("token") or resp_a.json().get("access_token")
        headers_a = {"Authorization": f"Bearer {token_a}"}

        convs_a = requests.get(f"{BASE_URL}/api/coach/conversations", headers=headers_a).json()
        convs_b = requests.get(f"{BASE_URL}/api/coach/conversations", headers=headers_b).json()

        ids_a = {c["id"] for c in convs_a}
        ids_b = {c["id"] for c in convs_b}
        overlap = ids_a & ids_b
        assert len(overlap) == 0, f"User B can see User A's conversations: {overlap}"
        print(f"User isolation verified: User A has {len(ids_a)}, User B has {len(ids_b)}, overlap={len(overlap)}")
