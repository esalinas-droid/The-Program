"""
Iter 83 — Analytics engine + coach clinician/data-driven layer integration tests.

Covers:
  * GET /api/analytics for each seeded scenario user (creep / e1rm / injury / thin / empty)
  * GET /api/analytics/block-recommendations for the e1rm user (effective-1RM basis)
  * POST /api/coach/chat scenarios that must cite actual analytics numbers
  * NO-AUTO-APPLY guarantee: profile.basePRs unchanged after PROGRAM_CHANGE proposal
  * Background refresh: logging as analytics_empty triggers training_analytics doc creation
  * Staleness recompute: backdating computedAt >24h forces re-run at GET time
  * Regressions: coach ADD_EXERCISE + POST /api/log basic health

All API base URL comes from EXPO_PUBLIC_BACKEND_URL env var (no hardcoding).
"""
import os
import sys
import time
import pytest
import requests
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
import asyncio  # noqa: E402

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

# Seed users
ANALYTICS_PW = "Analytics123"
USERS = {
    "creep": "analytics_creep@test.com",
    "e1rm":  "analytics_e1rm@test.com",
    "injury":"analytics_injury@test.com",
    "thin":  "analytics_thin@test.com",
    "empty": "analytics_empty@test.com",
}

STRONGMAN = ("test_strongman@test.com", "TestPass123")


# ── helpers ───────────────────────────────────────────────────────────────────

def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    body = r.json()
    return body["token"], body["user"]["userId"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _mongo():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.new_event_loop().run_until_complete(coro)


# ── session-scoped auth ───────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def tokens():
    out = {}
    for key, email in USERS.items():
        tok, uid = _login(email, ANALYTICS_PW)
        out[key] = {"token": tok, "userId": uid, "email": email}
    return out


@pytest.fixture(scope="session")
def strongman():
    tok, uid = _login(*STRONGMAN)
    return {"token": tok, "userId": uid}


# ═════════════════════════════════════════════════════════════════════════════
# 1. GET /api/analytics — data present per scenario
# ═════════════════════════════════════════════════════════════════════════════

class TestAnalyticsEndpoint:
    def test_creep_user_has_bench_rpe_creep_flag(self, tokens):
        t = tokens["creep"]
        r = requests.get(f"{BASE_URL}/api/analytics", headers=_hdr(t["token"]), timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data.get("available") is True, f"analytics should be available: {data}"
        assert data.get("dataWeeks", 0) >= 3, f"dataWeeks: {data.get('dataWeeks')}"

        flags = data["rpeCreep"]["flags"]
        bench_flags = [f for f in flags if f["exercise"] == "Bench Press"]
        assert bench_flags, f"expected a Bench Press RPE-creep flag, got {flags}"
        exposures = bench_flags[0]["exposures"]
        rpes = [x["rpe"] for x in exposures]
        loads = [x["load"] for x in exposures]
        assert 7.0 in rpes and 9.0 in rpes, f"missing 7 or 9 in rpes: {rpes}"
        assert 7.5 in rpes and 8.5 in rpes, f"missing 7.5 or 8.5 in rpes: {rpes}"
        assert all(abs(l - 185) < 0.1 for l in loads), f"loads not all 185: {loads}"

        fat = data.get("fatigue") or {}
        assert isinstance(fat.get("explanation"), str) and fat["explanation"], \
            f"fatigue.explanation must be a non-empty string: {fat}"

    def test_e1rm_user_shows_divergence_and_proposal_flag(self, tokens):
        r = requests.get(f"{BASE_URL}/api/analytics",
                         headers=_hdr(tokens["e1rm"]["token"]), timeout=20)
        assert r.status_code == 200
        data = r.json()
        bench = data.get("effective1RM", {}).get("bench") or {}
        assert bench.get("entered") == 300, f"entered bench should stay 300: {bench}"
        eff = bench.get("effective")
        assert eff is not None and 320 <= eff <= 330, f"effective bench ~324 expected, got {eff}"
        assert bench.get("diverges") is True, f"bench should diverge (>5%): {bench}"

    def test_injury_user_shows_rising_shoulder_and_ohp_correlation(self, tokens):
        r = requests.get(f"{BASE_URL}/api/analytics",
                         headers=_hdr(tokens["injury"]["token"]), timeout=20)
        assert r.status_code == 200
        pain = r.json().get("painTrends") or {}
        per = pain.get("perInjury") or []
        rising = [p for p in per if p.get("trend") == "rising"]
        assert rising, f"expected rising injury trend, got {per}"
        corr = pain.get("correlations") or []
        ohp = [c for c in corr if c.get("exercise") == "Overhead Press"]
        assert ohp and ohp[0]["reports"] >= 3, f"expected OHP correlation with >=3 reports: {corr}"

    def test_thin_user_low_confidence(self, tokens):
        r = requests.get(f"{BASE_URL}/api/analytics",
                         headers=_hdr(tokens["thin"]["token"]), timeout=20)
        assert r.status_code == 200
        data = r.json()
        # Either lowConfidence flag set, or dataWeeks < MIN_CONFIDENT_WEEKS
        assert data.get("lowConfidence") is True or data.get("dataWeeks", 99) < 3, \
            f"thin user should be low-confidence: dataWeeks={data.get('dataWeeks')} lowConf={data.get('lowConfidence')}"

    def test_empty_user_returns_gracefully(self, tokens):
        r = requests.get(f"{BASE_URL}/api/analytics",
                         headers=_hdr(tokens["empty"]["token"]), timeout=20)
        assert r.status_code == 200, f"empty user analytics should still 200: {r.text}"
        # Either available:false or logCount 0 — must not error
        data = r.json()
        assert isinstance(data, dict)


# ═════════════════════════════════════════════════════════════════════════════
# 2. GET /api/analytics/block-recommendations for e1rm user
# ═════════════════════════════════════════════════════════════════════════════

class TestBlockRecommendations:
    def test_e1rm_start_loads_use_effective_basis(self, tokens):
        r = requests.get(f"{BASE_URL}/api/analytics/block-recommendations",
                         headers=_hdr(tokens["e1rm"]["token"]), timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        data = r.json()
        assert data.get("available") is True, f"block-recs should be available: {data}"
        bench = (data.get("startLoads") or {}).get("bench") or {}
        assert bench.get("source") == "effective", f"bench source should be 'effective': {bench}"
        basis = bench.get("basis1RM")
        assert basis is not None and 320 <= basis <= 330, f"basis1RM ~324 expected: {basis}"
        vm = data.get("volumeModifier")
        assert vm is not None and 0.8 <= vm <= 1.1, f"volumeModifier out of expected range: {vm}"
        rationale = data.get("rationale")
        if isinstance(rationale, list):
            assert rationale and any((str(x) or "").strip() for x in rationale), \
                f"rationale list should be non-empty: {rationale}"
        else:
            assert (rationale or "").strip(), "rationale should be non-empty"


# ═════════════════════════════════════════════════════════════════════════════
# 3. Coach chat — data-driven, non-deterministic (accept-if-cites-numbers)
# ═════════════════════════════════════════════════════════════════════════════

def _coach(tok, message, cid=None, timeout=90):
    body = {"message": message}
    if cid:
        body["conversation_id"] = cid
    r = requests.post(f"{BASE_URL}/api/coach/chat", headers=_hdr(tok),
                      json=body, timeout=timeout)
    return r


class TestCoachDataDrivenAdvising:
    def test_creep_deload_cites_actual_rpe_numbers(self, tokens):
        r = _coach(tokens["creep"]["token"], "Should I deload?")
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        text = (r.json().get("response") or "").lower()
        # accept as long as the reply talks about deload AND cites the actual signals
        assert "deload" in text or "back off" in text or "reduce" in text, \
            f"reply must address deload: {text[:400]}"
        # Must cite RPE 7 (or 7.0) and RPE 9 (or 9.0), and the 185 load
        assert ("rpe 7" in text or "at 7" in text or "from 7" in text or "7.0" in text or " 7 " in text), \
            f"missing RPE 7 citation: {text[:600]}"
        assert ("rpe 9" in text or "9.0" in text or " 9 " in text or "to 9" in text), \
            f"missing RPE 9 citation: {text[:600]}"
        assert "185" in text, f"missing 185 lbs load citation: {text[:600]}"

    def test_e1rm_user_load_update_proposes_and_never_auto_applies(self, tokens):
        # Pre-state: DB basePRs.bench must be 300
        async def _get_pre():
            db = _mongo()
            return await db.profile.find_one({"userId": tokens["e1rm"]["userId"]})
        pre = _run(_get_pre())
        assert pre and pre.get("basePRs", {}).get("bench") == 300, \
            f"seed precondition: bench must be 300, got {pre.get('basePRs') if pre else None}"

        r = _coach(tokens["e1rm"]["token"],
                   "My bench feels lighter than my entered 1RM. Should we update my training loads?")
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        body = r.json()
        assert body.get("has_program_change") is True, \
            f"has_program_change must be true: {body}"
        pc = body.get("program_change") or {}
        assert pc.get("type") == "load_update", f"program_change.type must be load_update: {pc}"

        # payload should carry bench 300 → ~324 (allow 320..330 tolerance)
        payload_str = str(pc)
        assert "bench" in payload_str.lower(), f"payload must reference bench: {pc}"
        assert "300" in payload_str, f"payload should reference current 300: {pc}"
        assert any(str(v) in payload_str for v in (322, 323, 324, 325, 326, 327, 328)), \
            f"payload should propose ~324: {pc}"

        # Response language must PROPOSE, not claim applied
        text = (body.get("response") or "").lower()
        proposes = any(w in text for w in [
            "propose", "suggest", "recommend", "would you", "want me to",
            "shall i", "if you approve", "please confirm", "confirm", "let me know",
            "with your approval", "if you'd like",
        ])
        assert proposes, f"reply must propose, not claim applied: {text[:500]}"
        applied_wording = any(w in text for w in [
            "i've updated", "i have updated", "updated your", "i applied",
            "i've applied", "loads have been updated",
        ])
        assert not applied_wording, f"reply must NOT claim auto-applied: {text[:500]}"

        # ── critical NO-AUTO-APPLY guarantee: db.profile.basePRs.bench still 300
        time.sleep(1)  # allow any background task to (incorrectly) fire
        async def _get_post():
            db = _mongo()
            return await db.profile.find_one({"userId": tokens["e1rm"]["userId"]})
        post = _run(_get_post())
        assert post.get("basePRs", {}).get("bench") == 300, \
            f"NO-AUTO-APPLY VIOLATED: bench changed after chat: {post.get('basePRs')}"

    def test_injury_user_response_cites_ohp_and_advises_modification(self, tokens):
        r = _coach(tokens["injury"]["token"],
                   "How should I handle pressing given my shoulder?")
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        text = (r.json().get("response") or "").lower()
        # cites Overhead Press or OHP
        cites_ohp = ("overhead press" in text) or ("ohp" in text) or ("overhead" in text)
        assert cites_ohp, f"response must cite Overhead Press: {text[:600]}"
        # advises modification/substitution/reduction
        advises = any(w in text for w in [
            "modif", "substitut", "swap", "replace", "reduce", "lower",
            "landmine", "incline", "avoid", "pause", "back off", "de-load",
            "deload", "temporarily",
        ])
        assert advises, f"response must advise a modification/substitution: {text[:600]}"

    def test_thin_user_gets_low_confidence_disclaimer(self, tokens):
        r = _coach(tokens["thin"]["token"], "Should I deload?")
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        text = (r.json().get("response") or "").lower()
        disclaims = any(p in text for p in [
            "limited data", "not enough data", "only a week", "only 1 week",
            "one week", "1 week", "2 weeks", "two weeks", "short window",
            "small window", "insufficient", "too early", "need more",
            "low confidence", "low-confidence", "not much data", "less than",
            "thin", "haven't accumulated", "not accumulated", "baseline is thin",
            "few sessions", "3 sessions", "only logged",
        ])
        assert disclaims, f"thin-data reply must disclaim limited window: {text[:600]}"

    def test_empty_user_chat_works_and_analytics_absence_never_breaks(self, tokens):
        r = _coach(tokens["empty"]["token"], "Hey coach, what should I focus on today?")
        assert r.status_code == 200, f"empty user chat must 200: {r.status_code} {r.text[:400]}"
        body = r.json()
        assert body.get("conversation_id"), f"conversation_id must be returned: {body}"
        assert (body.get("response") or "").strip(), "response must be non-empty"


# ═════════════════════════════════════════════════════════════════════════════
# 4. Background refresh + staleness recompute
# ═════════════════════════════════════════════════════════════════════════════

class TestBackgroundRefreshAndStaleness:
    def test_log_triggers_background_analytics_refresh_for_empty_user(self, tokens):
        uid = tokens["empty"]["userId"]
        tok = tokens["empty"]["token"]
        # Snapshot pre-state
        async def _pre():
            db = _mongo()
            return await db.training_analytics.find_one({"userId": uid})
        pre = _run(_pre())
        pre_updated = pre and pre.get("computedAt")

        # Post a log
        payload = {
            "date": datetime.now(timezone.utc).date().isoformat(),
            "sessionType": "Heavy Upper", "exercise": "Bench Press",
            "sets": 3, "weight": 135, "reps": 5, "rpe": 7, "pain": 0,
            "completed": "yes", "week": 1, "day": "Mon",
        }
        r = requests.post(f"{BASE_URL}/api/log", headers=_hdr(tok),
                          json=payload, timeout=20)
        assert r.status_code in (200, 201), f"POST /api/log must succeed: {r.status_code} {r.text[:300]}"
        entry = r.json()
        assert entry.get("exercise") == "Bench Press", f"log entry echoed back: {entry}"

        # Poll up to ~10s for background refresh
        async def _find():
            db = _mongo()
            return await db.training_analytics.find_one({"userId": uid})

        found = None
        for _ in range(10):
            time.sleep(1)
            found = _run(_find())
            if found and found.get("logCount", 0) >= 1:
                # if pre existed, ensure it recomputed
                if pre_updated and found.get("computedAt") == pre_updated:
                    continue
                break
        assert found is not None, "no training_analytics doc after log"
        assert found.get("logCount", 0) >= 1, f"logCount should be >=1: {found.get('logCount')}"

        # Also visible via GET /api/analytics
        g = requests.get(f"{BASE_URL}/api/analytics", headers=_hdr(tok), timeout=15)
        assert g.status_code == 200
        assert g.json().get("logCount", 0) >= 1

    def test_stale_analytics_recomputes_on_get(self, tokens):
        uid = tokens["creep"]["userId"]
        tok = tokens["creep"]["token"]
        old_time = datetime.now(timezone.utc) - timedelta(hours=30)

        async def _backdate():
            db = _mongo()
            await db.training_analytics.update_one(
                {"userId": uid}, {"$set": {"computedAt": old_time}}
            )
            return await db.training_analytics.find_one({"userId": uid})

        pre = _run(_backdate())
        assert pre and pre.get("computedAt") is not None
        pre_ts = pre["computedAt"]

        # GET should recompute
        r = requests.get(f"{BASE_URL}/api/analytics", headers=_hdr(tok), timeout=20)
        assert r.status_code == 200
        # small wait for recompute if async
        time.sleep(1)

        async def _after():
            db = _mongo()
            return await db.training_analytics.find_one({"userId": uid})
        after = _run(_after())
        new_ts = after.get("computedAt")
        # normalize: mongo may return naive datetime, backdate is aware
        def _norm(t):
            if isinstance(t, datetime):
                return t.replace(tzinfo=timezone.utc) if t.tzinfo is None else t.astimezone(timezone.utc)
            return t
        assert _norm(new_ts) > _norm(pre_ts), \
            f"stale doc should recompute: pre={pre_ts} post={new_ts}"


# ═════════════════════════════════════════════════════════════════════════════
# 5. Regressions
# ═════════════════════════════════════════════════════════════════════════════

class TestRegressions:
    def test_coach_add_exercise_still_works(self, strongman):
        r = _coach(strongman["token"], "Add 3x10 face pulls to today")
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        body = r.json()
        ae = body.get("added_exercise")
        assert ae, f"added_exercise missing: {body}"
        # loose match: contains 'face' somewhere in the name
        name = str(ae.get("name") or ae.get("exercise") or "").lower()
        assert "face" in name, f"added_exercise name should include 'face': {ae}"

    def test_post_log_normal_flow_no_slowdown(self, strongman):
        payload = {
            "date": datetime.now(timezone.utc).date().isoformat(),
            "sessionType": "Heavy Upper", "exercise": "Bench Press",
            "sets": 3, "weight": 185, "reps": 5, "rpe": 7, "pain": 0,
            "completed": "yes", "week": 1, "day": "Mon",
        }
        start = time.time()
        r = requests.post(f"{BASE_URL}/api/log", headers=_hdr(strongman["token"]),
                          json=payload, timeout=15)
        elapsed = time.time() - start
        assert r.status_code in (200, 201), f"POST /api/log failed: {r.status_code} {r.text[:300]}"
        assert elapsed < 5.0, f"POST /api/log too slow ({elapsed:.1f}s) — bg hook may be blocking"
        body = r.json()
        assert body.get("exercise") == "Bench Press", f"entry echoed: {body}"
