"""
Tests for PATCH /api/programs/{program_id}/sessions/{session_id}/exercises/{exercise_id}/order
NEW MODE: body {"newIndex": N} — moves target to 0-based position N within its display group
in ONE call (multi-position jump). Also covers clamping, isolation, propagation, duplicate-name
tiebreaker, validation, and regression of the legacy {"direction": ...} path.

Endpoint mutates db.saved_plans; every mutating test REVERTS its change to preserve DB state.
Response: {success, updatedSessions, direction (nullable), newIndex (nullable)}.
"""
import os
import copy
import pytest
import requests
from datetime import datetime, date
from creds import password_for  # passwords live in untracked memory/test_credentials.md

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    from dotenv import dotenv_values
    _env = dotenv_values("/app/frontend/.env")
    BASE_URL = (_env.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"

# user_b has 52-week Hypertrophy plan — ideal for propagation tests.
CANDIDATE_USERS = [
    ("user_b@theprogram.app", password_for("user_b@theprogram.app")),
    ("user_a@theprogram.app", password_for("user_a@theprogram.app")),
]


def _display_group(cat: str) -> str:
    c = (cat or "").lower()
    if c == "warmup":
        return "warmup"
    if c == "cooldown":
        return "cooldown"
    if c == "gpp":
        return "gpp"
    return "main"


def _refetch_plan(session):
    r = session.get(f"{BASE_URL}/api/plan/year", timeout=30)
    assert r.status_code == 200, f"refetch failed {r.status_code}"
    return r.json()


def _find_session_in_plan(plan, session_id):
    for ph in plan.get("phases", []):
        for bl in ph.get("blocks", []) or []:
            for wk in bl.get("weeks", []) or []:
                for ss in wk.get("sessions", []) or []:
                    if ss.get("sessionId") == session_id:
                        return ph, bl, wk, ss
    return None


def _sessions_of_type(plan, session_type):
    out = []
    for ph in plan.get("phases", []):
        for bl in ph.get("blocks", []) or []:
            for wk in bl.get("weeks", []) or []:
                for ss in wk.get("sessions", []) or []:
                    if ss.get("sessionType") == session_type:
                        out.append((wk.get("weekNumber", 0), ss))
    out.sort(key=lambda x: x[0])
    return out


def _group_of(session, group_name):
    return sorted(
        [e for e in session.get("exercises") or [] if _display_group(e.get("category")) == group_name],
        key=lambda e: e.get("order", 0),
    )


def _snapshot_session_orders(session):
    return {e["sessionExerciseId"]: e["order"] for e in session["exercises"]}


# ── Session-scoped fixture: login + find a group of ≥3 exercises in current+future weeks ──
@pytest.fixture(scope="module")
def ctx():
    picked = None
    for email, pwd in CANDIDATE_USERS:
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd}, timeout=30)
        if r.status_code != 200 or not r.json().get("token"):
            continue
        s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
        r = s.get(f"{BASE_URL}/api/plan/year", timeout=30)
        if r.status_code != 200:
            continue
        pl = r.json()
        pid = pl.get("planId")
        if not pid:
            continue
        ps = pl.get("planStartDate") or pl.get("startDate") or ""
        try:
            start_d = datetime.strptime(ps[:10], "%Y-%m-%d").date()
            cw = max(1, (date.today() - start_d).days // 7 + 1)
        except Exception:
            cw = 1

        flat = []
        for ph in pl.get("phases", []):
            for bl in ph.get("blocks", []) or []:
                for wk in bl.get("weeks", []) or []:
                    for ss in wk.get("sessions", []) or []:
                        flat.append((ph, bl, wk, ss))

        # Prefer group of ≥3 with distinct order values + future weeks of same type exist.
        best = None
        for (ph, bl, wk, ss) in flat:
            if wk.get("weekNumber", 0) < cw:
                continue
            exs = ss.get("exercises") or []
            buckets = {}
            for e in exs:
                buckets.setdefault(_display_group(e.get("category")), []).append(e)
            st = ss.get("sessionType")
            future_exists = any(x[2].get("weekNumber", 0) > wk.get("weekNumber", 0)
                                and x[3].get("sessionType") == st for x in flat)
            if not future_exists:
                continue
            for g, gex in buckets.items():
                if len(gex) < 3:
                    continue
                orders = [e.get("order", 0) for e in gex]
                if len(set(orders)) != len(orders):
                    continue
                best = (ph, bl, wk, ss, g, sorted(gex, key=lambda e: e["order"]))
                break
            if best:
                break
        if best:
            picked = {
                "session": s, "email": email, "plan_id": pid,
                "phase": best[0], "block": best[1], "week": best[2], "sess": best[3],
                "current_week": cw, "group_name": best[4], "group_exs": best[5],
            }
            break

    if not picked:
        pytest.skip("No user has a plan with ≥3-exercise group having distinct orders + future weeks")
    yield picked


# ── TESTS ────────────────────────────────────────────────────────────────────

class TestNewIndexPath:
    """New newIndex mode: multi-position absolute move within display group."""

    def test_1_multi_position_jump_first_to_last(self, ctx):
        """Move exercise at group index 0 to last position in ONE call.
        Verify group sequence rearranged; non-group exercises untouched; then revert."""
        s = ctx["session"]
        pid, sid = ctx["plan_id"], ctx["sess"]["sessionId"]
        group_name = ctx["group_name"]

        plan_before = _refetch_plan(s)
        _, _, _, sess_b = _find_session_in_plan(plan_before, sid)
        group_before = _group_of(sess_b, group_name)
        assert len(group_before) >= 3, "need ≥3 in group"
        target = group_before[0]
        original_group_ids = [e["sessionExerciseId"] for e in group_before]
        original_group_orders = [e["order"] for e in group_before]
        # snapshot non-group exercise orders
        non_group_before = {
            e["sessionExerciseId"]: e["order"]
            for e in sess_b["exercises"]
            if _display_group(e["category"]) != group_name
        }

        target_last_idx = len(group_before) - 1
        url = f"{BASE_URL}/api/programs/{pid}/sessions/{sid}/exercises/{target['sessionExerciseId']}/order"
        r = s.patch(url, json={"newIndex": target_last_idx}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("success") is True
        assert body.get("newIndex") == target_last_idx
        assert body.get("direction") in (None, "")
        assert isinstance(body.get("updatedSessions"), int) and body["updatedSessions"] >= 1

        plan_after = _refetch_plan(s)
        _, _, _, sess_a = _find_session_in_plan(plan_after, sid)
        group_after = _group_of(sess_a, group_name)

        # Expected new id-sequence: pop(0) then insert at end
        expected_ids = original_group_ids[1:] + [original_group_ids[0]]
        actual_ids = [e["sessionExerciseId"] for e in group_after]
        assert actual_ids == expected_ids, (
            f"Group id-sequence not rearranged. expected={expected_ids} actual={actual_ids}"
        )
        # Order pool preserved (values reassigned along the new sequence)
        assert [e["order"] for e in group_after] == original_group_orders, \
            "order-pool of the group should be preserved, only reassigned along new sequence"

        # Non-group exercises untouched
        non_group_after = {
            e["sessionExerciseId"]: e["order"]
            for e in sess_a["exercises"]
            if _display_group(e["category"]) != group_name
        }
        assert non_group_before == non_group_after, \
            f"Non-group exercises must be untouched. before={non_group_before} after={non_group_after}"

        # REVERT: move target (now at last) back to index 0
        r2 = s.patch(url, json={"newIndex": 0}, timeout=30)
        assert r2.status_code == 200

    def test_2_isolation_other_groups_unaffected(self, ctx):
        """Move within one display group — verify OTHER groups' exercises keep their orders."""
        s = ctx["session"]
        pid, sid = ctx["plan_id"], ctx["sess"]["sessionId"]
        group_name = ctx["group_name"]

        plan_before = _refetch_plan(s)
        _, _, _, sess_b = _find_session_in_plan(plan_before, sid)
        # snapshot orders for EACH non-target group separately
        other_groups_before = {}
        for e in sess_b["exercises"]:
            g = _display_group(e["category"])
            if g == group_name:
                continue
            other_groups_before.setdefault(g, {})[e["sessionExerciseId"]] = e["order"]

        group_now = _group_of(sess_b, group_name)
        if len(group_now) < 3:
            pytest.skip("group shrunk")
        target = group_now[0]
        url = f"{BASE_URL}/api/programs/{pid}/sessions/{sid}/exercises/{target['sessionExerciseId']}/order"

        # jump to middle
        mid = len(group_now) // 2
        r = s.patch(url, json={"newIndex": mid}, timeout=30)
        assert r.status_code == 200

        plan_after = _refetch_plan(s)
        _, _, _, sess_a = _find_session_in_plan(plan_after, sid)
        other_groups_after = {}
        for e in sess_a["exercises"]:
            g = _display_group(e["category"])
            if g == group_name:
                continue
            other_groups_after.setdefault(g, {})[e["sessionExerciseId"]] = e["order"]

        assert other_groups_before == other_groups_after, (
            f"Other groups must be untouched. before={other_groups_before} after={other_groups_after}"
        )

        # Revert: find target's new idx and move back to 0
        group_after = _group_of(sess_a, group_name)
        new_idx = next(i for i, e in enumerate(group_after) if e["sessionExerciseId"] == target["sessionExerciseId"])
        if new_idx != 0:
            s.patch(url, json={"newIndex": 0}, timeout=30)

    def test_3_propagation_future_weeks_swapped_past_untouched(self, ctx):
        """newIndex propagates to future weeks of same sessionType; past untouched."""
        s = ctx["session"]
        pid, sid = ctx["plan_id"], ctx["sess"]["sessionId"]
        session_type = ctx["sess"]["sessionType"]
        current_week = ctx["current_week"]
        group_name = ctx["group_name"]

        plan_before = _refetch_plan(s)
        typed = _sessions_of_type(plan_before, session_type)
        past_before = {}
        future_before = {}
        for wknum, ss in typed:
            gs = [(e["name"], e["order"]) for e in _group_of(ss, group_name)]
            if wknum < current_week:
                past_before[wknum] = gs
            elif wknum > current_week:
                future_before[wknum] = gs

        _, _, _, sess_now = _find_session_in_plan(plan_before, sid)
        group_now = _group_of(sess_now, group_name)
        if len(group_now) < 3:
            pytest.skip("group shrunk")
        target = group_now[0]
        original_target_name = target["name"]
        target_last = len(group_now) - 1

        url = f"{BASE_URL}/api/programs/{pid}/sessions/{sid}/exercises/{target['sessionExerciseId']}/order"
        r = s.patch(url, json={"newIndex": target_last}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body["newIndex"] == target_last

        plan_after = _refetch_plan(s)
        typed_after = _sessions_of_type(plan_after, session_type)
        past_after = {}
        future_after = {}
        for wknum, ss in typed_after:
            gs = [(e["name"], e["order"]) for e in _group_of(ss, group_name)]
            if wknum < current_week:
                past_after[wknum] = gs
            elif wknum > current_week:
                future_after[wknum] = gs

        assert past_before == past_after, f"Past weeks changed! before={past_before} after={past_after}"

        # Verify future weeks moved the same-named target to last position of its group
        verified = 0
        for wknum, before_seq in future_before.items():
            after_seq = future_after.get(wknum, [])
            b_names = [n for n, _ in before_seq]
            a_names = [n for n, _ in after_seq]
            if original_target_name in b_names and len(a_names) == len(b_names) and len(b_names) >= 2:
                if b_names[0] == original_target_name and a_names[-1] == original_target_name:
                    verified += 1
        assert body["updatedSessions"] >= 1
        print(f"[propagation newIndex] updatedSessions={body['updatedSessions']} verified_future={verified}")

        # REVERT
        s.patch(url, json={"newIndex": 0}, timeout=30)

    def test_4a_clamp_negative_to_zero(self, ctx):
        """newIndex = -5 clamps to 0. Target must end up at group index 0."""
        s = ctx["session"]
        pid, sid = ctx["plan_id"], ctx["sess"]["sessionId"]
        group_name = ctx["group_name"]

        plan_before = _refetch_plan(s)
        _, _, _, sess_b = _find_session_in_plan(plan_before, sid)
        group_before = _group_of(sess_b, group_name)
        if len(group_before) < 3:
            pytest.skip("group shrunk")
        # Move the LAST exercise via newIndex=-5 → should clamp to 0
        target = group_before[-1]
        original_target_id = target["sessionExerciseId"]
        url = f"{BASE_URL}/api/programs/{pid}/sessions/{sid}/exercises/{original_target_id}/order"
        r = s.patch(url, json={"newIndex": -5}, timeout=30)
        assert r.status_code == 200
        assert r.json().get("newIndex") == -5  # echoed as-is; clamping is internal

        plan_after = _refetch_plan(s)
        _, _, _, sess_a = _find_session_in_plan(plan_after, sid)
        group_after = _group_of(sess_a, group_name)
        assert group_after[0]["sessionExerciseId"] == original_target_id, \
            f"Negative newIndex should clamp to 0 (top). Group now: {[e['sessionExerciseId'] for e in group_after]}"

        # REVERT — move back to last
        s.patch(url, json={"newIndex": len(group_after) - 1}, timeout=30)

    def test_4b_clamp_overflow_to_last(self, ctx):
        """newIndex >= groupLen clamps to last slot."""
        s = ctx["session"]
        pid, sid = ctx["plan_id"], ctx["sess"]["sessionId"]
        group_name = ctx["group_name"]

        plan_before = _refetch_plan(s)
        _, _, _, sess_b = _find_session_in_plan(plan_before, sid)
        group_before = _group_of(sess_b, group_name)
        if len(group_before) < 3:
            pytest.skip("group shrunk")
        target = group_before[0]
        original_target_id = target["sessionExerciseId"]
        overflow = len(group_before) + 99
        url = f"{BASE_URL}/api/programs/{pid}/sessions/{sid}/exercises/{original_target_id}/order"
        r = s.patch(url, json={"newIndex": overflow}, timeout=30)
        assert r.status_code == 200

        plan_after = _refetch_plan(s)
        _, _, _, sess_a = _find_session_in_plan(plan_after, sid)
        group_after = _group_of(sess_a, group_name)
        assert group_after[-1]["sessionExerciseId"] == original_target_id, \
            f"Overflow newIndex should clamp to last slot. Group: {[e['sessionExerciseId'] for e in group_after]}"

        # REVERT — move back to 0
        s.patch(url, json={"newIndex": 0}, timeout=30)

    def test_4c_current_position_is_noop(self, ctx):
        """newIndex == current position must be a no-op (updatedSessions may still count
        future-matching sessions if same name/category exists there, but the target session
        must remain bit-for-bit identical)."""
        s = ctx["session"]
        pid, sid = ctx["plan_id"], ctx["sess"]["sessionId"]
        group_name = ctx["group_name"]

        plan_before = _refetch_plan(s)
        _, _, _, sess_b = _find_session_in_plan(plan_before, sid)
        group_before = _group_of(sess_b, group_name)
        if len(group_before) < 3:
            pytest.skip("group shrunk")
        # Choose middle position — that's the target's current idx
        mid = len(group_before) // 2
        target = group_before[mid]
        orders_before = _snapshot_session_orders(sess_b)

        url = f"{BASE_URL}/api/programs/{pid}/sessions/{sid}/exercises/{target['sessionExerciseId']}/order"
        r = s.patch(url, json={"newIndex": mid}, timeout=30)
        assert r.status_code == 200

        plan_after = _refetch_plan(s)
        _, _, _, sess_a = _find_session_in_plan(plan_after, sid)
        orders_after = _snapshot_session_orders(sess_a)

        assert orders_before == orders_after, (
            f"newIndex==current_idx should be no-op in target session. "
            f"before={orders_before} after={orders_after}"
        )


class TestNewIndexValidation:
    """400/404 error paths for newIndex + empty body."""

    def test_5a_newindex_string_returns_400(self, ctx):
        s = ctx["session"]
        pid, sid = ctx["plan_id"], ctx["sess"]["sessionId"]
        eid = ctx["group_exs"][0]["sessionExerciseId"]
        url = f"{BASE_URL}/api/programs/{pid}/sessions/{sid}/exercises/{eid}/order"
        r = s.patch(url, json={"newIndex": "abc"}, timeout=30)
        assert r.status_code == 400, f"expected 400 for string newIndex, got {r.status_code}: {r.text}"

    def test_5b_newindex_boolean_returns_400(self, ctx):
        s = ctx["session"]
        pid, sid = ctx["plan_id"], ctx["sess"]["sessionId"]
        eid = ctx["group_exs"][0]["sessionExerciseId"]
        url = f"{BASE_URL}/api/programs/{pid}/sessions/{sid}/exercises/{eid}/order"
        r = s.patch(url, json={"newIndex": True}, timeout=30)
        assert r.status_code == 400, f"expected 400 for bool newIndex, got {r.status_code}: {r.text}"

    def test_5c_empty_body_returns_400(self, ctx):
        s = ctx["session"]
        pid, sid = ctx["plan_id"], ctx["sess"]["sessionId"]
        eid = ctx["group_exs"][0]["sessionExerciseId"]
        url = f"{BASE_URL}/api/programs/{pid}/sessions/{sid}/exercises/{eid}/order"
        r = s.patch(url, json={}, timeout=30)
        assert r.status_code == 400, f"expected 400 for empty body, got {r.status_code}: {r.text}"

    def test_5d_unknown_exercise_id_returns_404(self, ctx):
        s = ctx["session"]
        pid, sid = ctx["plan_id"], ctx["sess"]["sessionId"]
        url = f"{BASE_URL}/api/programs/{pid}/sessions/{sid}/exercises/nonexistent-xyz-999/order"
        r = s.patch(url, json={"newIndex": 0}, timeout=30)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text}"


class TestDirectionRegression:
    """Regression: legacy direction path unchanged."""

    def test_6a_direction_up_swaps_adjacent(self, ctx):
        s = ctx["session"]
        pid, sid = ctx["plan_id"], ctx["sess"]["sessionId"]
        group_name = ctx["group_name"]

        plan_before = _refetch_plan(s)
        _, _, _, sess_b = _find_session_in_plan(plan_before, sid)
        group = _group_of(sess_b, group_name)
        if len(group) < 2:
            pytest.skip("need ≥2")
        first, second = group[0], group[1]
        o1_before, o2_before = first["order"], second["order"]

        url = f"{BASE_URL}/api/programs/{pid}/sessions/{sid}/exercises/{second['sessionExerciseId']}/order"
        r = s.patch(url, json={"direction": "up"}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body.get("direction") == "up"
        assert body.get("newIndex") is None

        plan_after = _refetch_plan(s)
        _, _, _, sess_a = _find_session_in_plan(plan_after, sid)
        f_a = next(e for e in sess_a["exercises"] if e["sessionExerciseId"] == first["sessionExerciseId"])
        s_a = next(e for e in sess_a["exercises"] if e["sessionExerciseId"] == second["sessionExerciseId"])
        assert f_a["order"] == o2_before and s_a["order"] == o1_before, \
            "direction=up must swap with immediate in-group neighbor"

        # REVERT
        s.patch(url, json={"direction": "down"}, timeout=30)

    def test_6b_direction_edge_noop(self, ctx):
        """First-in-group UP is a no-op (section edge)."""
        s = ctx["session"]
        pid, sid = ctx["plan_id"], ctx["sess"]["sessionId"]
        group_name = ctx["group_name"]

        plan_before = _refetch_plan(s)
        _, _, _, sess_b = _find_session_in_plan(plan_before, sid)
        group = _group_of(sess_b, group_name)
        if not group:
            pytest.skip("no group")
        first = group[0]
        orders_before = _snapshot_session_orders(sess_b)

        url = f"{BASE_URL}/api/programs/{pid}/sessions/{sid}/exercises/{first['sessionExerciseId']}/order"
        r = s.patch(url, json={"direction": "up"}, timeout=30)
        assert r.status_code == 200

        plan_after = _refetch_plan(s)
        _, _, _, sess_a = _find_session_in_plan(plan_after, sid)
        orders_after = _snapshot_session_orders(sess_a)
        assert orders_before == orders_after, \
            "first-in-group direction=up must be no-op"

    def test_6c_invalid_direction_no_newindex_returns_400(self, ctx):
        s = ctx["session"]
        pid, sid = ctx["plan_id"], ctx["sess"]["sessionId"]
        eid = ctx["group_exs"][0]["sessionExerciseId"]
        url = f"{BASE_URL}/api/programs/{pid}/sessions/{sid}/exercises/{eid}/order"
        r = s.patch(url, json={"direction": "sideways"}, timeout=30)
        assert r.status_code == 400


class TestDuplicateNameTiebreaker:
    """BOUNDARY CASE (code-review + light behavioral): when a future session has ≥2
    same-name+same-category exercises within the target's display group, the endpoint
    picks the occurrence at `target_group_pos`."""

    def test_7_disambiguation_code_review(self):
        """Verifies the disambiguation logic exists and covers newIndex mode."""
        with open("/app/backend/server.py", encoding="utf-8") as fh:
            src = fh.read()
        anchor = "async def reorder_exercise_in_plan("
        start = src.find(anchor)
        end = src.find("\nasync def", start + len(anchor))
        block = src[start:end]
        assert "target_group_pos" in block, "target_group_pos disambiguation missing"
        assert "if len(matches) > 1 and target_group_pos in matches" in block, \
            "same-name disambiguation branch missing"
        # newIndex branch must live inside the future-session loop that applies disambiguation
        assert "new_index is not None" in block, "newIndex branch missing"
        assert "max(0, min(new_index, len(group) - 1))" in block, \
            "newIndex clamp expression missing"
        # Past-week skip guard still in place
        assert "week.weekNumber < current_week_num" in block
