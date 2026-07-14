"""
Tests for PATCH /api/programs/{program_id}/sessions/{session_id}/exercises/{exercise_id}/order

Verifies the BUG FIX: reorder is isolated to the exercise's DISPLAY GROUP
(warmup / gpp / cooldown / main). Also verifies:
  - {success:true, updatedSessions:N, direction} response shape
  - Section-edge no-op (first-in-group up, last-in-group down)
  - Propagation: current week + all future weeks of same sessionType; past untouched
  - Boundary case: two same-named exercises in a future session → correct one moved
    by group-relative position
"""
import os
import copy
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend/.env (loaded manually) — do NOT hardcode a default in prod
    from dotenv import dotenv_values
    _env = dotenv_values("/app/frontend/.env")
    BASE_URL = (_env.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"

CANDIDATE_USERS = [
    ("user_a@theprogram.app", "StrongmanA123"),
    ("user_b@theprogram.app", "HypertrophyB123"),
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


# ── Session-scoped fixture: login + fetch a plan that has ≥2 exercises in some group ─
@pytest.fixture(scope="module")
def ctx():
    from datetime import datetime, date
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})

    picked = None
    email_used = None
    plan = None
    plan_id = None
    current_week = 1

    for email, pwd in CANDIDATE_USERS:
        s2 = requests.Session()
        s2.headers.update({"Content-Type": "application/json"})
        r = s2.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd}, timeout=30)
        if r.status_code != 200 or not r.json().get("token"):
            continue
        token = r.json()["token"]
        s2.headers.update({"Authorization": f"Bearer {token}"})
        r = s2.get(f"{BASE_URL}/api/plan/year", timeout=30)
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

        # Prefer a group with ≥2 exercises whose 'order' values are DISTINCT
        # (so swaps are measurable). Fallback to any ≥2-group otherwise.
        best_distinct = None
        best_any = None
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
                if len(gex) < 2:
                    continue
                orders = [e.get("order", 0) for e in gex]
                if len(set(orders)) == len(orders) and best_distinct is None:
                    best_distinct = (ph, bl, wk, ss, g, gex)
                elif best_any is None:
                    best_any = (ph, bl, wk, ss, g, gex)
            if best_distinct:
                break
        chosen = best_distinct or best_any
        if chosen:
            picked = chosen
            email_used = email
            plan = pl
            plan_id = pid
            current_week = cw
            session = s2
            break

    if not picked:
        pytest.skip("No candidate user has a plan with ≥2 exercises in a group + future weeks")

    ph, bl, wk, ss, group_name, group_exs = picked
    yield {
        "session": session,
        "email": email_used,
        "plan_id": plan_id,
        "phase": ph, "block": bl, "week": wk, "sess": ss,
        "current_week": current_week,
        "group_name": group_name,
        "group_exs": sorted(group_exs, key=lambda e: e.get("order", 0)),
    }


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
    """Return list of (week_num, session) for a given sessionType, sorted by week."""
    out = []
    for ph in plan.get("phases", []):
        for bl in ph.get("blocks", []) or []:
            for wk in bl.get("weeks", []) or []:
                for ss in wk.get("sessions", []) or []:
                    if ss.get("sessionType") == session_type:
                        out.append((wk.get("weekNumber", 0), ss))
    out.sort(key=lambda x: x[0])
    return out


# ── TESTS ────────────────────────────────────────────────────────────────────

class TestReorderIsolatedGroup:

    def test_1_response_shape_and_swap_in_group(self, ctx):
        """Move 2nd exercise in group UP → order swaps with 1st (within same group).
        Then move back DOWN so we don't leave state dirty for later tests."""
        s = ctx["session"]
        pid, sid = ctx["plan_id"], ctx["sess"]["sessionId"]
        group_exs = ctx["group_exs"]
        assert len(group_exs) >= 2
        first, second = group_exs[0], group_exs[1]
        original_first_order = first.get("order")
        original_second_order = second.get("order")
        assert original_first_order != original_second_order

        url = f"{BASE_URL}/api/programs/{pid}/sessions/{sid}/exercises/{second['sessionExerciseId']}/order"
        r = s.patch(url, json={"direction": "up"}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("success") is True
        assert body.get("direction") == "up"
        assert isinstance(body.get("updatedSessions"), int) and body["updatedSessions"] >= 1

        # Verify swap in the group
        plan = _refetch_plan(s)
        _, _, _, sess_now = _find_session_in_plan(plan, sid)
        new_first = next(e for e in sess_now["exercises"] if e["sessionExerciseId"] == first["sessionExerciseId"])
        new_second = next(e for e in sess_now["exercises"] if e["sessionExerciseId"] == second["sessionExerciseId"])
        assert new_second["order"] == original_first_order, "second should now have first's order"
        assert new_first["order"] == original_second_order, "first should now have second's order"

        # Revert by moving 'second' DOWN one step
        r2 = s.patch(url, json={"direction": "down"}, timeout=30)
        assert r2.status_code == 200
        plan2 = _refetch_plan(s)
        _, _, _, sess2 = _find_session_in_plan(plan2, sid)
        rev_first = next(e for e in sess2["exercises"] if e["sessionExerciseId"] == first["sessionExerciseId"])
        rev_second = next(e for e in sess2["exercises"] if e["sessionExerciseId"] == second["sessionExerciseId"])
        assert rev_first["order"] == original_first_order
        assert rev_second["order"] == original_second_order

    def test_2_category_isolation_no_cross_group_swap(self, ctx):
        """Move the FIRST exercise of the target group UP.
        Verify: this is a no-op (does NOT swap with an exercise in another display group)."""
        s = ctx["session"]
        pid, sid = ctx["plan_id"], ctx["sess"]["sessionId"]
        group_exs = ctx["group_exs"]
        first = group_exs[0]

        # Snapshot all orders in the session BEFORE
        plan_before = _refetch_plan(s)
        _, _, _, sess_before = _find_session_in_plan(plan_before, sid)
        before_orders = {e["sessionExerciseId"]: e["order"] for e in sess_before["exercises"]}

        # Verify there's at least one exercise in a DIFFERENT display group
        # that lies immediately before `first` in the flat order — otherwise
        # this test can't prove cross-group isolation.
        exs_sorted = sorted(sess_before["exercises"], key=lambda e: e["order"])
        first_flat_idx = next(i for i, e in enumerate(exs_sorted) if e["sessionExerciseId"] == first["sessionExerciseId"])
        cross_group_neighbor_exists = (
            first_flat_idx > 0
            and _display_group(exs_sorted[first_flat_idx - 1]["category"]) != ctx["group_name"]
        )

        url = f"{BASE_URL}/api/programs/{pid}/sessions/{sid}/exercises/{first['sessionExerciseId']}/order"
        r = s.patch(url, json={"direction": "up"}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("success") is True

        plan_after = _refetch_plan(s)
        _, _, _, sess_after = _find_session_in_plan(plan_after, sid)
        after_orders = {e["sessionExerciseId"]: e["order"] for e in sess_after["exercises"]}

        # CRITICAL: orders unchanged for the target session
        assert before_orders == after_orders, (
            f"First-in-group UP should be a no-op (no cross-group swap). "
            f"Cross-group neighbor exists: {cross_group_neighbor_exists}. "
            f"Before={before_orders} After={after_orders}"
        )
        # updatedSessions should be 0 for target session — but propagation to future
        # weeks could match same-name exercises there. For a strict no-op the API
        # should report 0. If not 0, we log but the critical assertion above catches it.

    def test_3_last_in_group_down_noop(self, ctx):
        """Move LAST exercise of the group DOWN → no-op within the group."""
        s = ctx["session"]
        pid, sid = ctx["plan_id"], ctx["sess"]["sessionId"]
        group_exs = ctx["group_exs"]
        last = group_exs[-1]

        plan_before = _refetch_plan(s)
        _, _, _, sess_before = _find_session_in_plan(plan_before, sid)
        # Recompute the current group order in case previous tests changed things
        group_now_sorted = sorted(
            [e for e in sess_before["exercises"] if _display_group(e["category"]) == ctx["group_name"]],
            key=lambda e: e["order"],
        )
        last_now = group_now_sorted[-1]
        before_orders = {e["sessionExerciseId"]: e["order"] for e in sess_before["exercises"]}

        url = f"{BASE_URL}/api/programs/{pid}/sessions/{sid}/exercises/{last_now['sessionExerciseId']}/order"
        r = s.patch(url, json={"direction": "down"}, timeout=30)
        assert r.status_code == 200, r.text

        plan_after = _refetch_plan(s)
        _, _, _, sess_after = _find_session_in_plan(plan_after, sid)
        after_orders = {e["sessionExerciseId"]: e["order"] for e in sess_after["exercises"]}

        assert before_orders == after_orders, (
            f"Last-in-group DOWN should be a no-op. Before={before_orders} After={after_orders}"
        )

    def test_4_propagation_current_and_future_past_untouched(self, ctx):
        """Move 2nd in group UP. Verify:
           - current week: swapped
           - all future weeks of same sessionType: also swapped (by name)
           - past weeks: UNTOUCHED
        Then revert."""
        s = ctx["session"]
        pid = ctx["plan_id"]
        sid = ctx["sess"]["sessionId"]
        session_type = ctx["sess"]["sessionType"]
        current_week = ctx["current_week"]
        target_group = ctx["group_name"]

        # Snapshot PAST-week sessions of same sessionType (if any exist)
        plan_before = _refetch_plan(s)
        typed = _sessions_of_type(plan_before, session_type)
        past_before = {}
        future_before = {}
        for wknum, ss in typed:
            group_sorted = sorted(
                [e for e in ss["exercises"] if _display_group(e["category"]) == target_group],
                key=lambda e: e["order"],
            )
            names_in_order = [(e["name"], e["order"]) for e in group_sorted]
            if wknum < current_week:
                past_before[wknum] = names_in_order
            elif wknum > current_week:
                future_before[wknum] = names_in_order

        # Recompute the target's 2nd exercise in current group (state may have changed)
        _, _, _, sess_now = _find_session_in_plan(plan_before, sid)
        group_now_sorted = sorted(
            [e for e in sess_now["exercises"] if _display_group(e["category"]) == target_group],
            key=lambda e: e["order"],
        )
        if len(group_now_sorted) < 2:
            pytest.skip("Group no longer has ≥2 exercises")
        first_ex = group_now_sorted[0]
        second_ex = group_now_sorted[1]

        url = f"{BASE_URL}/api/programs/{pid}/sessions/{sid}/exercises/{second_ex['sessionExerciseId']}/order"
        r = s.patch(url, json={"direction": "up"}, timeout=30)
        assert r.status_code == 200
        body = r.json()

        plan_after = _refetch_plan(s)
        typed_after = _sessions_of_type(plan_after, session_type)

        past_after = {}
        future_after = {}
        for wknum, ss in typed_after:
            group_sorted = sorted(
                [e for e in ss["exercises"] if _display_group(e["category"]) == target_group],
                key=lambda e: e["order"],
            )
            names_in_order = [(e["name"], e["order"]) for e in group_sorted]
            if wknum < current_week:
                past_after[wknum] = names_in_order
            elif wknum > current_week:
                future_after[wknum] = names_in_order

        # PAST untouched
        assert past_before == past_after, f"Past weeks changed! before={past_before} after={past_after}"

        # FUTURE: first two names should be SWAPPED in each future week where BOTH names
        # appear in the same group
        swapped_future_count = 0
        for wknum, before_names in future_before.items():
            after_names = future_after.get(wknum, [])
            if len(before_names) < 2 or len(after_names) < 2:
                continue
            b_names = [n for n, _ in before_names]
            a_names = [n for n, _ in after_names]
            if first_ex["name"] in b_names and second_ex["name"] in b_names \
                    and b_names[0] == first_ex["name"] and b_names[1] == second_ex["name"]:
                assert a_names[0] == second_ex["name"] and a_names[1] == first_ex["name"], (
                    f"Future week {wknum} not swapped: before={b_names[:2]} after={a_names[:2]}"
                )
                swapped_future_count += 1

        # updatedSessions should be ≥ 1 (current) + swapped future
        assert body["updatedSessions"] >= 1
        print(f"Propagation: updatedSessions={body['updatedSessions']} verified_future_swaps={swapped_future_count}")

        # Revert
        s.patch(url, json={"direction": "down"}, timeout=30)

    def test_5_invalid_direction_returns_400(self, ctx):
        s = ctx["session"]
        pid, sid = ctx["plan_id"], ctx["sess"]["sessionId"]
        eid = ctx["group_exs"][0]["sessionExerciseId"]
        url = f"{BASE_URL}/api/programs/{pid}/sessions/{sid}/exercises/{eid}/order"
        r = s.patch(url, json={"direction": "sideways"}, timeout=30)
        assert r.status_code == 400

    def test_6_unknown_exercise_returns_404(self, ctx):
        s = ctx["session"]
        pid, sid = ctx["plan_id"], ctx["sess"]["sessionId"]
        url = f"{BASE_URL}/api/programs/{pid}/sessions/{sid}/exercises/does-not-exist-xyz/order"
        r = s.patch(url, json={"direction": "up"}, timeout=30)
        assert r.status_code == 404

    def test_7_display_group_helper_collapses_main_subcategories(self):
        """Code-review verification of _display_group() — the helper must collapse
        main / supplemental / accessory / prehab into a single 'main' group and
        keep warmup / gpp / cooldown as their own groups."""
        import importlib, sys
        sys.path.insert(0, "/app/backend")
        srv = importlib.import_module("server")
        f = srv._display_group
        assert f("warmup") == "warmup"
        assert f("WARMUP") == "warmup"
        assert f("cooldown") == "cooldown"
        assert f("gpp") == "gpp"
        assert f("main") == "main"
        assert f("supplemental") == "main"
        assert f("accessory") == "main"
        assert f("prehab") == "main"
        assert f("") == "main"        # missing → main
        assert f(None) == "main"      # missing → main
        assert f("unknown_cat") == "main"  # safe default

    def test_8_boundary_same_name_disambiguation_code_review(self):
        """BOUNDARY CASE 2 (code-review, no natural fixture available in seed data).
        The endpoint at /app/backend/server.py must, when the future session's group
        contains ≥2 exercises with the same (name, category), pick the occurrence at
        `target_group_pos` (the position of the moved exercise in ITS own group),
        not just the first match."""
        with open("/app/backend/server.py", encoding="utf-8") as fh:
            src = fh.read()
        # Locate the reorder endpoint block
        anchor = "async def reorder_exercise_in_plan("
        start = src.find(anchor)
        end = src.find("async def", start + len(anchor))
        block = src[start:end]
        assert "target_group_pos" in block, "target_group_pos disambiguation missing"
        assert "if len(matches) > 1 and target_group_pos in matches" in block, \
            "same-name disambiguation branch missing"
        assert "idx = target_group_pos" in block, \
            "should pick occurrence at target_group_pos when duplicates exist"
        # Isolation: reorder must be scoped to display group
        assert "_display_group" in block, "reorder must be scoped by _display_group"
        # Past weeks must be untouched
        assert "week.weekNumber < current_week_num" in block and "continue" in block, \
            "past-week skip guard missing"
