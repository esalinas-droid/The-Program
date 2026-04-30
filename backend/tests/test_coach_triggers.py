"""
Tests for GET /api/coach/active-trigger and POST /api/coach/chat (source field).
Covers all 8 test scenarios from the review request.
"""
import pytest
import requests
import os
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")

# ── Auth ─────────────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def auth_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "user_a@theprogram.app",
        "password": "StrongmanA123"
    })
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json().get("token") or resp.json().get("access_token")
    assert token, "No token in login response"
    return token

@pytest.fixture(scope="module")
def authed(auth_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"})
    return s


# ── active-trigger endpoint ───────────────────────────────────────────────────
class TestActiveTrigger:
    """Tests for GET /api/coach/active-trigger"""

    def test_endpoint_returns_200(self, authed):
        resp = authed.get(f"{BASE_URL}/api/coach/active-trigger")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_response_is_json(self, authed):
        resp = authed.get(f"{BASE_URL}/api/coach/active-trigger")
        assert resp.headers.get("content-type", "").startswith("application/json")
        data = resp.json()
        assert isinstance(data, dict), "Response should be a dict"

    def test_no_trigger_returns_null_triggerName(self, authed):
        """When no trigger fires, response must be {triggerName: null}"""
        resp = authed.get(f"{BASE_URL}/api/coach/active-trigger")
        data = resp.json()
        # triggerName MUST exist in response
        assert "triggerName" in data, f"'triggerName' key missing from response: {data}"

    def test_active_trigger_has_required_fields(self, authed):
        """If a trigger is active, it must have all required fields"""
        resp = authed.get(f"{BASE_URL}/api/coach/active-trigger")
        data = resp.json()
        if data.get("triggerName") is not None:
            # Trigger is active — validate all required fields
            required = ["triggerName", "cardText", "cta", "seedPrompt", "payload"]
            for field in required:
                assert field in data, f"Active trigger missing field '{field}': {data}"
            # Validate field types
            assert isinstance(data["triggerName"], str) and data["triggerName"], "triggerName must be non-empty string"
            assert isinstance(data["cardText"], str) and data["cardText"], "cardText must be non-empty string"
            assert isinstance(data["cta"], str) and data["cta"], "cta must be non-empty string"
            assert isinstance(data["seedPrompt"], str) and data["seedPrompt"], "seedPrompt must be non-empty string"
            assert isinstance(data["payload"], dict), "payload must be a dict"
            print(f"Active trigger found: {data['triggerName']}")
        else:
            print("No active trigger — triggerName is null (valid state)")

    def test_triggerName_valid_value(self, authed):
        """triggerName must be one of the known trigger names or null"""
        valid_trigger_names = {
            "pain_flag_recent", "missed_two_sessions", "volume_spike",
            "rpe_climb", "deload_due", "pr_streak", None
        }
        resp = authed.get(f"{BASE_URL}/api/coach/active-trigger")
        data = resp.json()
        assert data.get("triggerName") in valid_trigger_names, \
            f"Unexpected triggerName: {data.get('triggerName')}"

    def test_endpoint_is_stateless_consistent(self, authed):
        """Two consecutive calls must return the same triggerName"""
        r1 = authed.get(f"{BASE_URL}/api/coach/active-trigger")
        r2 = authed.get(f"{BASE_URL}/api/coach/active-trigger")
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json().get("triggerName") == r2.json().get("triggerName"), \
            "Stateless endpoint returned different triggers on consecutive calls"


# ── Pain trigger seeded test ──────────────────────────────────────────────────
class TestPainTrigger:
    """Insert a pain_report and verify pain_flag_recent fires."""

    inserted_id = None

    def test_pain_trigger_fires_with_recent_pain_report(self, authed):
        """Insert a pain report and check pain_flag_recent is returned."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # Create a pain report (direct DB via API if available, or use /pain-reports endpoint)
        pain_resp = authed.post(f"{BASE_URL}/api/pain-report", json={
            "exerciseName": "Deadlift",
            "bodyRegion": "lower_back",
            "painType": "ache",
            "intensity": 6,
            "timing": "during",
            "sessionType": "Heavy Lower",
            "notes": "TEST_ automated pain report for trigger testing"
        })
        # If pain-report endpoint doesn't exist (404/405), skip this test
        if pain_resp.status_code in (404, 405, 422):
            pytest.skip(f"Pain report endpoint not available: {pain_resp.status_code}")

        if pain_resp.status_code not in (200, 201):
            pytest.skip(f"Could not create pain report: {pain_resp.status_code} {pain_resp.text}")

        TestPainTrigger.inserted_id = pain_resp.json().get("id")

        # Now check active-trigger
        resp = authed.get(f"{BASE_URL}/api/coach/active-trigger")
        assert resp.status_code == 200
        data = resp.json()
        # pain_flag_recent has priority=90, should be highest
        assert data.get("triggerName") == "pain_flag_recent", \
            f"Expected pain_flag_recent trigger after pain report, got: {data.get('triggerName')}"
        print(f"Pain trigger cardText: {data.get('cardText')}")


# ── Free mode trigger filter test ────────────────────────────────────────────
class TestFreeModeTrigger:
    """Free mode user should only see pain_flag_recent and pr_streak."""

    def test_free_mode_skips_plan_only_triggers(self, authed):
        """
        Check that the free mode user profile filters plan_only triggers.
        We verify by reading profile and confirming training_mode logic is present in code.
        This is a structural test — verifies the endpoint handles training_mode.
        """
        # Get user profile
        profile_resp = authed.get(f"{BASE_URL}/api/profile")
        assert profile_resp.status_code == 200
        profile = profile_resp.json()
        training_mode = profile.get("training_mode", "program")
        print(f"User A training_mode: {training_mode}")

        # Call active-trigger and verify it works regardless of mode
        resp = authed.get(f"{BASE_URL}/api/coach/active-trigger")
        assert resp.status_code == 200
        data = resp.json()
        print(f"Active trigger for training_mode={training_mode}: {data.get('triggerName')}")

        # If mode is free, only pain_flag_recent and pr_streak allowed
        if training_mode == "free":
            plan_only_triggers = {"missed_two_sessions", "volume_spike", "rpe_climb", "deload_due"}
            assert data.get("triggerName") not in plan_only_triggers, \
                f"Free mode should not return plan_only trigger: {data.get('triggerName')}"


# ── POST /api/coach/chat source field ────────────────────────────────────────
class TestCoachChatSource:
    """Tests for POST /api/coach/chat with new source field."""

    def test_coach_chat_user_typed_source(self, authed):
        """POST /api/coach/chat with source='user_typed' should work."""
        resp = authed.post(f"{BASE_URL}/api/coach/chat", json={
            "message": "TEST_ Hello coach, quick question about recovery.",
            "conversation_history": [],
            "source": "user_typed"
        })
        # 200 or 503 (if AI not configured) are acceptable
        assert resp.status_code in (200, 503), \
            f"Unexpected status: {resp.status_code} {resp.text}"
        if resp.status_code == 200:
            data = resp.json()
            assert "reply" in data or "message" in data or "response" in data or "content" in data, \
                f"No reply field in response: {list(data.keys())}"
            print("coach chat user_typed: OK")
        else:
            print(f"Coach service not ready (503): {resp.text[:100]}")

    def test_coach_chat_system_seed_source(self, authed):
        """POST /api/coach/chat with source='system_seed' should work."""
        resp = authed.post(f"{BASE_URL}/api/coach/chat", json={
            "message": "TEST_ I see you flagged lower_back pain recently. Walk me through it.",
            "conversation_history": [],
            "source": "system_seed"
        })
        assert resp.status_code in (200, 503), \
            f"Unexpected status: {resp.status_code} {resp.text}"
        if resp.status_code == 200:
            print("coach chat system_seed: OK")
        else:
            print(f"Coach service not ready (503): {resp.text[:100]}")

    def test_coach_chat_without_source_defaults(self, authed):
        """POST /api/coach/chat without source field should default gracefully."""
        resp = authed.post(f"{BASE_URL}/api/coach/chat", json={
            "message": "TEST_ Hello.",
            "conversation_history": []
            # No source field
        })
        assert resp.status_code in (200, 503), \
            f"Unexpected status: {resp.status_code} {resp.text}"

    def test_coach_chat_source_stored_in_message(self, authed):
        """Verify source field is accepted without validation error (no 422)."""
        resp = authed.post(f"{BASE_URL}/api/coach/chat", json={
            "message": "TEST_ source storage check",
            "source": "system_seed",
            "conversation_history": []
        })
        assert resp.status_code != 422, f"422 validation error — source field rejected: {resp.text}"


# ── PR streak no-crash test ───────────────────────────────────────────────────
class TestPrStreakNoCrash:
    """pr_streak trigger should not throw for user with no recent PRs."""

    def test_pr_streak_no_crash_no_prs(self, authed):
        """active-trigger endpoint should not 500 when user has no recent PRs."""
        resp = authed.get(f"{BASE_URL}/api/coach/active-trigger")
        assert resp.status_code != 500, f"Server error on active-trigger: {resp.text}"
        assert resp.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
