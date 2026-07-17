"""
DB-state verification of saved_plans migration for planId=a00d80fe-900.
Pure read-only checks against MongoDB. Does NOT modify any documents.
"""
import os
import sys
import copy
import subprocess
import pytest
from pymongo import MongoClient
from dotenv import load_dotenv

# Ensure backend is importable so we can compare structure if needed
sys.path.insert(0, "/app/backend")
load_dotenv("/app/backend/.env")

PLAN_ID = "a00d80fe-900"
USER_ID = "dab8da9f-abc9-4e0c-a2aa-54bfb3077303"
CURRENT_WEEK = 15
EXPECTED_BACKUP_PLAN_IDS = {"f3d196a9-dcb", "a00d80fe-900", "1e449a13-3b0", "e086c645-cc2"}
EXPECTED_DELOAD_FUTURE_WEEKS = {16, 20, 24, 28, 32, 38, 42, 46, 50}
BACKUP_COLL = "saved_plans_backup_premigration"


@pytest.fixture(scope="module")
def db():
    client = MongoClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def migrated_plan(db):
    doc = db.saved_plans.find_one({"planId": PLAN_ID})
    assert doc is not None, f"Migrated plan {PLAN_ID} missing from saved_plans"
    doc.pop("_id", None)
    return doc


@pytest.fixture(scope="module")
def backup_plan(db):
    doc = db[BACKUP_COLL].find_one({"planId": PLAN_ID})
    assert doc is not None, f"Backup plan {PLAN_ID} missing from {BACKUP_COLL}"
    doc.pop("_id", None)
    return doc


def _iter_weeks(doc):
    for phase in doc.get("phases", []):
        for block in phase.get("blocks", []):
            for week in block.get("weeks", []):
                yield phase, block, week


def _weeks_by_number(doc):
    return {w["weekNumber"]: w for _, _, w in _iter_weeks(doc)}


# ---------- Structure regression ----------
def test_plan_structure_intact(migrated_plan):
    assert migrated_plan.get("userId") == USER_ID
    assert migrated_plan.get("status") == "active"
    assert str(migrated_plan.get("startDate"))[:10] == "2026-04-06"
    phases = migrated_plan.get("phases", [])
    assert len(phases) == 7, f"Expected 7 phases, got {len(phases)}"
    weeks = list(_iter_weeks(migrated_plan))
    assert len(weeks) == 52, f"Expected 52 weeks total, got {len(weeks)}"
    # Every week has sessions with exercises; loaded (non-warmup/cooldown) exercises must have targetSets
    _NONLOADED = {"warmup", "cooldown", "conditioning"}
    for _, _, w in weeks:
        assert w.get("sessions"), f"week {w.get('weekNumber')} has no sessions"
        for s in w["sessions"]:
            assert s.get("exercises"), f"week {w.get('weekNumber')} session {s.get('sessionType')} has no exercises"
            for ex in s["exercises"]:
                if (ex.get("category") or "").lower() in _NONLOADED:
                    continue
                assert ex.get("targetSets"), f"exercise {ex.get('name')} wk{w.get('weekNumber')} cat={ex.get('category')} missing targetSets"


# ---------- Backups ----------
def test_backup_contains_all_four_plans(db):
    ids_in_backup = {d["planId"] for d in db[BACKUP_COLL].find({}, {"planId": 1})}
    missing = EXPECTED_BACKUP_PLAN_IDS - ids_in_backup
    assert not missing, f"Missing backups for planIds: {missing}"


def test_backup_docs_are_complete(db):
    _NONLOADED = {"warmup", "cooldown", "conditioning"}
    for pid in EXPECTED_BACKUP_PLAN_IDS:
        d = db[BACKUP_COLL].find_one({"planId": pid})
        assert d is not None, f"Backup for {pid} missing"
        assert d.get("phases"), f"Backup {pid} has no phases"
        wcount = sum(1 for _, _, _ in _iter_weeks(d))
        assert wcount == 52, f"Backup {pid} expected 52 weeks, got {wcount}"
        for _, _, w in _iter_weeks(d):
            for s in w.get("sessions", []):
                assert s.get("exercises"), f"Backup {pid} wk{w.get('weekNumber')} session no exercises"
                for e in s["exercises"]:
                    if (e.get("category") or "").lower() in _NONLOADED:
                        continue
                    assert e.get("targetSets"), \
                        f"Backup {pid} wk{w.get('weekNumber')} {e.get('name')} cat={e.get('category')} missing targetSets"


# ---------- HARD RULE: past weeks byte-identical ----------
def test_past_weeks_byte_identical_to_backup(migrated_plan, backup_plan):
    mig_weeks = _weeks_by_number(migrated_plan)
    bak_weeks = _weeks_by_number(backup_plan)
    diffs = []
    for wnum in sorted(bak_weeks.keys()):
        if wnum <= CURRENT_WEEK:
            if mig_weeks.get(wnum) != bak_weeks.get(wnum):
                diffs.append(wnum)
    assert not diffs, (
        f"CRITICAL: past weeks not byte-identical to backup. Differing weeks: {diffs}"
    )


# ---------- Future weeks show progression, not clones ----------
def test_future_weeks_differ_from_backup(migrated_plan, backup_plan):
    mig_weeks = _weeks_by_number(migrated_plan)
    bak_weeks = _weeks_by_number(backup_plan)
    identical_future = []
    for wnum in sorted(bak_weeks.keys()):
        if wnum > CURRENT_WEEK:
            if mig_weeks.get(wnum) == bak_weeks.get(wnum):
                identical_future.append(wnum)
    # In a broken clone plan, backup future weeks are identical clones of week 1.
    # After migration, most/all future weeks must differ. Allow at most 1 coincidental match.
    assert len(identical_future) <= 1, (
        f"Future weeks that are still identical to backup (should have progressed): {identical_future}"
    )


def _find_session(week, session_type):
    for s in week.get("sessions", []):
        if s.get("sessionType") == session_type:
            return s
    return None


def _find_exercise_by_name(sess, needle: str):
    """Find first exercise whose name contains needle (case-insensitive)."""
    for e in sess.get("exercises", []):
        if needle.lower() in (e.get("name") or "").lower():
            return e
    return None


def _numeric_load(ex):
    if not ex:
        return None
    loads = []
    for t in ex.get("targetSets", []) or []:
        v = t.get("targetLoad")
        if v is None:
            continue
        try:
            loads.append(float(str(v).replace("+", "").strip()))
        except (TypeError, ValueError):
            continue
    return max(loads) if loads else None


def test_speed_lower_week17_lt_week19(migrated_plan):
    """DE step ~+10% within the Building block: wk17 Speed Squat load < wk19 Speed Squat load."""
    from models.schemas import SessionType
    weeks = _weeks_by_number(migrated_plan)
    w17 = weeks.get(17); w19 = weeks.get(19)
    assert w17 and w19, "weeks 17 and 19 required"

    s17 = _find_session(w17, SessionType.DE_LOWER.value)
    s19 = _find_session(w19, SessionType.DE_LOWER.value)
    assert s17 and s19, "DE_LOWER session missing in wk17 or wk19"

    ex17 = _find_exercise_by_name(s17, "Speed Squat")
    ex19 = _find_exercise_by_name(s19, "Speed Squat")
    assert ex17 and ex19, "Speed Squat exercise not present in DE_LOWER sessions"

    l17 = _numeric_load(ex17); l19 = _numeric_load(ex19)
    print(f"[Speed Squat] wk17 load={l17}  wk19 load={l19}")
    assert l17 is not None and l19 is not None, f"Loads missing (l17={l17}, l19={l19})"
    assert l17 < l19, f"Expected wk17 < wk19; got wk17={l17}, wk19={l19}"
    ratio = (l19 - l17) / l17
    assert 0.05 <= ratio <= 0.20, f"Expected ~+10% (allow 5-20%), got {ratio:.2%} (l17={l17}, l19={l19})"


# ---------- Deload weeks flagged correctly ----------
def test_future_deload_weeks_flagged(migrated_plan):
    mig_weeks = _weeks_by_number(migrated_plan)
    wrong = []
    for wnum, w in mig_weeks.items():
        if wnum <= CURRENT_WEEK:
            continue  # past weeks are what they are (immutable)
        expected = wnum in EXPECTED_DELOAD_FUTURE_WEEKS
        actual = bool(w.get("isDeload"))
        if actual != expected:
            wrong.append((wnum, expected, actual))
    assert not wrong, f"Deload flag mismatches (weekNumber, expected, actual): {wrong}"


# ---------- Idempotency ----------
def test_migration_is_idempotent(db):
    """Re-run `migrate a00d80fe-900 --commit`; it must report NO-OP and not change the doc."""
    before = db.saved_plans.find_one({"planId": PLAN_ID})
    assert before is not None
    before_copy = copy.deepcopy(before)
    before_copy.pop("_id", None)

    result = subprocess.run(
        ["python3", "migrate_plans.py", "migrate", PLAN_ID, "--commit"],
        cwd="/app/backend",
        capture_output=True,
        text=True,
        timeout=120,
    )
    stdout = result.stdout + result.stderr
    print(stdout)
    assert result.returncode == 0, f"migrate script failed: {stdout}"
    assert "NO-OP" in stdout, f"Second run was not detected as NO-OP:\n{stdout}"
    assert "second-run-would-be-noop / equals-current-stored: True" in stdout, \
        f"Idempotency flag not set true:\n{stdout}"

    after = db.saved_plans.find_one({"planId": PLAN_ID})
    after.pop("_id", None)
    # _saved_at may be present on both or absent; compare payload
    b = {k: v for k, v in before_copy.items() if k != "_saved_at"}
    a = {k: v for k, v in after.items() if k != "_saved_at"}
    assert a == b, "Idempotency violated: document changed on second migrate run"


# ---------- OTHER 3 plans MUST NOT be migrated yet ----------
def test_other_three_plans_untouched(db):
    """The other 3 planIds should still equal their backup (main agent will migrate them later)."""
    other_ids = EXPECTED_BACKUP_PLAN_IDS - {PLAN_ID}
    still_clone = []
    for pid in other_ids:
        live = db.saved_plans.find_one({"planId": pid})
        back = db[BACKUP_COLL].find_one({"planId": pid})
        if not live or not back:
            continue
        live.pop("_id", None); live.pop("_saved_at", None); live.pop("_backed_up_at", None)
        back.pop("_id", None); back.pop("_saved_at", None); back.pop("_backed_up_at", None)
        if live == back:
            still_clone.append(pid)
    # Expect all 3 to still equal their backups (untouched)
    assert set(still_clone) == other_ids, (
        f"Some non-target plans have been mutated! Untouched: {still_clone}, expected {other_ids}"
    )
