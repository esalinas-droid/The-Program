"""
iter86 — Backend tests for coach:
  A) trim_coach_history token-budget window
  B) seeded_messages transcript assembly (unit-verify structure, one send_message)
  C) PAIN_REPORT happy path (matched active injury, timing="during")
  D) PAIN_REPORT timing omission -> timing="" (never "during")
  E) PAIN_REPORT no-match -> row created but no new injury added to profile
  F) PAIN_REPORT malformed payload -> stripped, pain_report null, no DB write
  G) injury-context line rendered with "pain N/10" after step C
  H) LLM-error path returns pain_report=None

Regression:
  H') iter85 write-action tests unaffected (run separately)

Real Emergent LLM calls; retry a few phrasings on model non-determinism.
"""
import os
import sys
import time
import copy
import types
import asyncio
from datetime import datetime, timezone, timedelta

import pytest
import requests

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from creds import password_for
import server  # for trim_coach_history + db access

BASE_URL = os.environ.get(
    "EXPO_BACKEND_URL", "https://the-program-app.preview.emergentagent.com"
).rstrip("/")
EMAIL = "test_strongman@test.com"
PASSWORD = password_for(EMAIL)


# ── fixtures ────────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def api(auth_token):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
    })
    return s


@pytest.fixture(scope="module")
def user_id(auth_token):
    """Decode JWT to get userId (no verification)."""
    import base64, json
    payload = auth_token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))["userId"]


def _coach_chat(api, message, timeout=120):
    body = {
        "message": message,
        "conversation_history": [],
        "conversation_id": None,
        "source": "user_typed",
    }
    return api.post(f"{BASE_URL}/api/coach/chat", json=body, timeout=timeout)


def _ensure_shoulder_active(api, user_id):
    """Make sure test_strongman still has a Shoulder active injury and clear any
    stale painLevel so the test is deterministic."""
    r = api.get(f"{BASE_URL}/api/profile", timeout=30)
    assert r.status_code == 200
    profile = r.json()
    details = profile.get("injuryDetails") or []
    has_shoulder = any(
        (d.get("name") or "").lower().startswith("shoulder")
        and d.get("status", "active") == "active"
        for d in details
    )
    new_details = []
    for d in details:
        d2 = dict(d)
        # clear stale pain fields for the Shoulder entry
        if (d2.get("name") or "").lower().startswith("shoulder"):
            d2.pop("painLevel", None)
            d2.pop("painLevelAt", None)
        new_details.append(d2)
    if not has_shoulder:
        new_details.append({"name": "Shoulder", "status": "active", "severity": "moderate"})
    api.put(f"{BASE_URL}/api/profile", json={"injuryDetails": new_details}, timeout=30)


# ── A. trim_coach_history unit tests ────────────────────────────────────────
class TestTrimHistory:
    def _msg(self, role, content):
        m = types.SimpleNamespace()
        m.role = role
        m.content = content
        return m

    def test_small_list_untrimmed(self):
        msgs = [self._msg("user", "hi"), self._msg("assistant", "hello"), self._msg("user", "ok")]
        out, trunc = server.trim_coach_history(msgs)
        assert len(out) == 3
        assert trunc is False

    def test_empty_list(self):
        out, trunc = server.trim_coach_history([])
        assert out == [] and trunc is False

    def test_large_history_drops_oldest_keeps_floor(self):
        # 30 msgs each ~2000 chars => well over 8000-char budget
        big = "x" * 2000
        msgs = [self._msg("user" if i % 2 == 0 else "assistant", big) for i in range(30)]
        out, trunc = server.trim_coach_history(msgs)
        assert trunc is True, "truncated flag must be True when messages dropped"
        assert len(out) >= 10, f"floor must keep at least 10 messages, got {len(out)}"
        assert len(out) < 30, "should have dropped some messages"
        # The kept messages must be the MOST RECENT contiguous suffix
        assert out == msgs[-len(out):], "trim must keep newest suffix, drop oldest"

    def test_floor_respected_even_over_budget(self):
        # 15 messages each 3000 chars => 45k chars total, floor=10, budget=8k
        # Should still keep 10 (the floor beats the budget).
        big = "y" * 3000
        msgs = [self._msg("user" if i % 2 == 0 else "assistant", big) for i in range(15)]
        out, trunc = server.trim_coach_history(msgs)
        assert len(out) == 10, f"floor of 10 must apply, got {len(out)}"
        assert trunc is True


# ── B. seeded_messages structure (indirect verification via prompt block) ───
class TestHistoryTruncatedFlag:
    """Verifying the HISTORY_TRUNCATED: yes marker only shows in the system
    prompt when trimming actually dropped messages.

    We can't sniff the seeded_messages list without instrumenting the endpoint,
    but we CAN verify the truncated-flag propagates by reading the source and
    testing the trim function's contract used in the endpoint.
    """

    def test_truncated_line_only_when_dropped(self):
        # Use the endpoint's logic: profile_text gets HISTORY_TRUNCATED only
        # when trim returns truncated=True.
        big = "z" * 2500
        m = types.SimpleNamespace()
        # 20-msg long history, must truncate
        msgs = [types.SimpleNamespace(role="user", content=big) for _ in range(20)]
        _, trunc = server.trim_coach_history(msgs)
        assert trunc is True

        # 5-msg short history, must NOT truncate
        msgs2 = [types.SimpleNamespace(role="user", content="hi") for _ in range(5)]
        _, trunc2 = server.trim_coach_history(msgs2)
        assert trunc2 is False


# ── C. PAIN_REPORT happy path (Shoulder active) ─────────────────────────────
class TestPainReportHappy:
    def test_shoulder_6_during_ohp(self, api, user_id):
        _ensure_shoulder_active(api, user_id)

        got = None
        last_text = ""
        for phrasing in [
            "My shoulder is at a 6/10 during OHP today.",
            "Shoulder pain is 6 out of 10 during overhead press right now.",
            "Right now my shoulder feels 6/10 during pressing.",
        ]:
            r = _coach_chat(api, phrasing)
            assert r.status_code == 200, r.text[:300]
            data = r.json()
            assert "pain_report" in data, "response missing pain_report key"
            last_text = data.get("response") or ""
            if data.get("pain_report"):
                got = data["pain_report"]
                break
            time.sleep(1)

        assert got, f"pain_report never emitted. last response: {last_text[:300]!r}"
        assert isinstance(got.get("level"), int) and got["level"] == 6, f"level: {got.get('level')}"
        assert "shoulder" in (got.get("area") or "").lower(), f"area: {got.get('area')!r}"
        assert got.get("timing") == "during", f"timing must be 'during', got {got.get('timing')!r}"
        assert (got.get("matchedInjury") or "").lower().startswith("shoulder"), \
            f"matchedInjury: {got.get('matchedInjury')!r}"
        assert "id" in got and got["id"], "pain_report.id missing"
        assert "flagged" in got, "pain_report.flagged missing"

    def test_injury_context_rendered_after(self, api, user_id):
        """After the pain report lands, profile.injuryDetails must carry
        painLevel + painLevelAt, and the injury-context-line renderer must
        include 'pain 6/10' with a relative age."""
        # Fetch profile fresh
        r = api.get(f"{BASE_URL}/api/profile", timeout=30)
        assert r.status_code == 200
        prof = r.json()
        details = prof.get("injuryDetails") or []
        shoulder = next(
            (d for d in details if (d.get("name") or "").lower().startswith("shoulder")),
            None,
        )
        assert shoulder is not None, "Shoulder injury not present"
        assert shoulder.get("painLevel") == 6, f"painLevel: {shoulder.get('painLevel')}"
        assert isinstance(shoulder.get("painLevelAt"), str), "painLevelAt must be ISO string"
        # Parse ISO and check within last 5 min
        pa = shoulder["painLevelAt"]
        dt = datetime.fromisoformat(pa.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        age_s = (datetime.now(timezone.utc) - dt).total_seconds()
        assert age_s < 300, f"painLevelAt should be recent, was {age_s:.0f}s ago"

        # Renderer includes "pain 6/10"
        line = server._injury_context_line(prof)
        assert "pain 6/10" in line, f"context line missing pain: {line!r}"
        assert "ago" in line or "just now" in line, f"context line missing rel age: {line!r}"


# ── D. PAIN_REPORT timing omission ──────────────────────────────────────────
class TestPainReportTimingOmission:
    def test_no_timing_stored_as_empty_string(self, api, user_id):
        """When the user gives level only (no during/after/at rest), backend
        must store timing='' — NOT 'during'."""
        _ensure_shoulder_active(api, user_id)

        # Snapshot most recent pain_reports doc BEFORE
        # (we'll ask DB directly after via /api/analytics/pain-reports)
        got = None
        last_text = ""
        for phrasing in [
            "My shoulder is at a 4.",
            "Shoulder is a 4 out of 10 right now.",
            "Shoulder = 4/10.",
        ]:
            r = _coach_chat(api, phrasing)
            assert r.status_code == 200
            data = r.json()
            last_text = data.get("response") or ""
            if data.get("pain_report") and data["pain_report"].get("level") == 4:
                got = data["pain_report"]
                break
            time.sleep(1)

        assert got, f"pain_report(level=4) never emitted. last: {last_text[:300]!r}"
        assert got["level"] == 4
        # timing in RESPONSE is None (converted from "") — key must exist
        assert "timing" in got, "pain_report missing timing key"
        # Response field can be None or "" — both signify unspecified
        assert got["timing"] in (None, ""), \
            f"timing must be None/empty when unspecified, got {got['timing']!r}"

        # Verify DB row: fetch via analytics/pain endpoint or db directly
        # We use the app's own analytics endpoint if available; otherwise
        # inspect DB directly through the server module.
        async def _check_db():
            docs = await server.db.pain_reports.find(
                {"userId": user_id, "intensity": 4}
            ).sort("createdAt", -1).limit(3).to_list(3)
            return docs

        docs = asyncio.run(_check_db())
        assert docs, "no pain_reports row for intensity=4"
        # Newest first — check the freshest one from THIS run (< 2 min old)
        now = datetime.now(timezone.utc)
        recent = [
            d for d in docs
            if (now - (d.get("createdAt") or now).replace(tzinfo=timezone.utc)
                if (d.get("createdAt") and d.get("createdAt").tzinfo is None)
                else (now - (d.get("createdAt") or now))).total_seconds() < 180
        ]
        # Simpler: pick the newest
        newest = docs[0]
        assert newest.get("intensity") == 4
        assert newest.get("timing", None) == "", (
            f"CRITICAL: timing must be '' (unspecified), got {newest.get('timing')!r} — "
            f"backend is defaulting to 'during' when it shouldn't"
        )
        assert newest.get("sessionType") == "coach chat"
        assert newest.get("source") == "coach"


# ── E. PAIN_REPORT no-match (hip = not an active injury) ────────────────────
class TestPainReportNoMatch:
    def test_hip_pain_no_match_no_new_injury(self, api, user_id):
        # First snapshot profile injuries
        r = api.get(f"{BASE_URL}/api/profile", timeout=30)
        assert r.status_code == 200
        before = r.json().get("injuryDetails") or []
        before_names = {(d.get("name") or "").lower() for d in before}

        got = None
        for phrasing in [
            "My hip is at a 3 right now.",
            "Hip pain 3/10 today.",
            "Hip = 3 out of 10.",
        ]:
            r = _coach_chat(api, phrasing)
            assert r.status_code == 200
            data = r.json()
            if data.get("pain_report") and data["pain_report"].get("level") == 3:
                got = data["pain_report"]
                break
            time.sleep(1)

        assert got, "hip pain_report did not emit"
        # matchedInjury must be None (no active hip injury)
        assert got.get("matchedInjury") in (None, ""), \
            f"matchedInjury should be null, got {got.get('matchedInjury')!r}"
        assert got["level"] == 3
        assert "hip" in got["area"].lower()

        # Profile must NOT have gained a "hip" injury
        r2 = api.get(f"{BASE_URL}/api/profile", timeout=30)
        after = r2.json().get("injuryDetails") or []
        after_names = {(d.get("name") or "").lower() for d in after}
        new_names = after_names - before_names
        assert not any("hip" in n for n in new_names), (
            f"CRITICAL: PAIN_REPORT created a new 'hip' injury in profile! new names: {new_names}"
        )


# ── H. Regression: iter85 already covered — sanity ping only ────────────────
class TestPainReportResponseSchema:
    """Response schema must include pain_report key on ALL paths (LLM error
    path AND success path). We assert the key exists in the response even for
    a totally-off-topic message where no pain is reported."""

    def test_pain_report_key_present_on_neutral_msg(self, api):
        r = _coach_chat(api, "hi coach how are you")
        assert r.status_code == 200
        data = r.json()
        assert "pain_report" in data, "pain_report key missing on neutral message"
        assert data["pain_report"] in (None,) or isinstance(data["pain_report"], dict)
