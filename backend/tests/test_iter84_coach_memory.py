"""
Iteration 84 — Coach memory transparency endpoints
Covers:
- GET /api/coach/memory unauthenticated → 401
- GET /api/analytics unauthenticated → 401
- POST /api/coach/memory/correction with a real correction → 200, folded into summary
- Correction reflected in subsequent GET /api/coach/memory
- Coach chat afterwards mentions/reflects corrected info
- Empty correction → 400
- DELETE /api/coach/memory → {deleted: true} then GET → {summary: null}
- Coach chat still works after memory cleared
"""
import os
import time
import pytest
import requests

from creds import password_for

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL",
                          "https://the-program-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

INJURY_USER = "analytics_injury@test.com"


# ── auth helper ───────────────────────────────────────────────────────────────
def _login(email: str) -> str:
    pw = password_for(email)
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def injury_token():
    return _login(INJURY_USER)


@pytest.fixture(scope="module")
def h(injury_token):
    return {"Authorization": f"Bearer {injury_token}", "Content-Type": "application/json"}


# ── auth requirement ──────────────────────────────────────────────────────────
class TestUnauth:
    def test_get_memory_requires_auth(self):
        r = requests.get(f"{API}/coach/memory", timeout=15)
        assert r.status_code == 401, f"expected 401 got {r.status_code} {r.text[:200]}"

    def test_get_analytics_requires_auth(self):
        r = requests.get(f"{API}/analytics", timeout=15)
        assert r.status_code == 401, f"expected 401 got {r.status_code} {r.text[:200]}"

    def test_post_correction_requires_auth(self):
        r = requests.post(f"{API}/coach/memory/correction",
                          json={"correction": "hi"}, timeout=15)
        assert r.status_code == 401

    def test_delete_memory_requires_auth(self):
        r = requests.delete(f"{API}/coach/memory", timeout=15)
        assert r.status_code == 401


# ── correction happy-path (Claude ~5-30s) ─────────────────────────────────────
class TestCorrectionFlow:
    def test_empty_correction_400(self, h):
        r = requests.post(f"{API}/coach/memory/correction",
                          json={"correction": "   "}, headers=h, timeout=15)
        assert r.status_code == 400, f"expected 400 got {r.status_code} {r.text[:200]}"

    def test_correction_folds_and_persists(self, h):
        correction = ("my left knee is 100% fine now, cleared by my physio "
                      "and I have no pain during squats")
        r = requests.post(f"{API}/coach/memory/correction",
                          json={"correction": correction}, headers=h, timeout=90)
        assert r.status_code == 200, f"expected 200 got {r.status_code} {r.text[:300]}"
        data = r.json()
        assert "summary" in data and isinstance(data["summary"], str) and data["summary"]
        assert data.get("updatedAt")
        summary_lower = data["summary"].lower()
        # correction must be incorporated somehow — accept 'knee', 'physio' or 'cleared'
        assert any(kw in summary_lower for kw in ("knee", "physio", "cleared")), \
            f"correction not reflected in summary: {data['summary']!r}"

        # ── verify persistence ────────────────────────────────────────────────
        g = requests.get(f"{API}/coach/memory", headers=h, timeout=15)
        assert g.status_code == 200
        gdata = g.json()
        assert gdata.get("summary") == data["summary"]
        assert gdata.get("updatedAt")

    def test_correction_reflected_in_coach_chat(self, h):
        # Ask what the coach remembers → response should reflect the knee correction
        r = requests.post(f"{API}/coach/chat",
                          json={"message": "what do you remember about me?"},
                          headers=h, timeout=90)
        assert r.status_code == 200, f"chat failed: {r.status_code} {r.text[:200]}"
        body = r.json()
        assert body.get("response"), "empty chat response"
        rl = body["response"].lower()
        # Should mention knee / physio / cleared somewhere (memory is authoritative)
        assert any(kw in rl for kw in ("knee", "physio", "cleared", "fine")), \
            f"chat did not surface memory correction: {body['response'][:400]!r}"


# ── delete flow ───────────────────────────────────────────────────────────────
class TestClearMemory:
    def test_delete_and_then_null_summary(self, h):
        r = requests.delete(f"{API}/coach/memory", headers=h, timeout=15)
        assert r.status_code == 200, f"delete failed: {r.status_code} {r.text[:200]}"
        assert r.json().get("deleted") is True

        g = requests.get(f"{API}/coach/memory", headers=h, timeout=15)
        assert g.status_code == 200
        gd = g.json()
        assert gd.get("summary") is None, f"summary not cleared: {gd}"

    def test_chat_still_works_after_clear(self, h):
        # Ensure absence-of-memory does not crash the coach chat path
        r = requests.post(f"{API}/coach/chat",
                          json={"message": "hi coach, quick check"},
                          headers=h, timeout=90)
        assert r.status_code == 200, f"chat failed post-clear: {r.status_code} {r.text[:300]}"
        assert r.json().get("response")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
