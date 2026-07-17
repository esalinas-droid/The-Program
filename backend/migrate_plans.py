"""
Migration: apply the progressed engine to FUTURE weeks of existing generator-built plans.

SAFETY MODEL
------------
* Weeks at or before the user's current calculated week are NEVER modified — they
  are copied verbatim from the pre-migration backup (which equals the original doc),
  preserving all logged history, notes and completed statuses byte-for-byte.
* FUTURE weeks are rebuilt deterministically from the ORIGINAL base session (stored
  in the backup) via services.plan_generator._apply_progression. Because the old
  engine stored the *unprogressed* builder base, applying progression to it yields
  exactly what the fixed engine now produces for that week — no 1RM reconstruction
  needed, and it stays continuous with the plan's own baseline.
* Idempotent: future weeks are always re-derived from the immutable backup, so a
  second run produces identical output (detected + reported as a no-op).
* Backups are written to `saved_plans_backup_premigration` ONCE (never overwritten),
  BEFORE any plan document is modified.

USAGE
    python migrate_plans.py backup   <planId> [<planId> ...]
    python migrate_plans.py migrate  <planId> [--commit] [--target COLL]
    python migrate_plans.py delete-junk <userId> [--commit]
Without --commit, migrate runs as a dry-run (no writes) and prints the report.
"""
import argparse
import asyncio
import copy
import json
import os
from datetime import datetime

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

from models.schemas import SessionExercise, SessionType, ExerciseCategory
from services.plan_generator import (
    _apply_progression, _phase_prog_params, _blocked_set, ProgContext,
    MIN_WEEKS_FOR_BLOCK_DELOAD, PHASE_NO_BLOCK_DELOAD,
)

load_dotenv()
BACKUP_COLL = "saved_plans_backup_premigration"

_SPEED = {SessionType.DE_UPPER.value, SessionType.DE_LOWER.value, SessionType.EVENT_TRAINING.value}
_MAX_EFFORT = {SessionType.ME_UPPER.value, SessionType.ME_LOWER.value}


def _db():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return c[os.environ["DB_NAME"]]


def _calc_current_week(start_date: str) -> int:
    try:
        start = datetime.strptime(str(start_date)[:10], "%Y-%m-%d")
        return max(1, ((datetime.now() - start).days // 7) + 1)
    except Exception:
        return 1


def _clean(doc: dict) -> dict:
    d = dict(doc)
    d.pop("_id", None)
    d.pop("_saved_at", None)
    return d


async def _get_injuries(db, user_id: str):
    prof = await db.profile.find_one({"userId": user_id}) or {}
    flags = [i for i in (prof.get("injuryFlags") or []) if i and str(i).lower() != "none"]
    return flags


def _rebuild_future_weeks(doc: dict, current_week: int, injuries: list):
    """Return (migrated_doc, stats). Mutates a deep copy of `doc`."""
    new_doc = copy.deepcopy(doc)
    blocked = _blocked_set(injuries)
    preserved, regenerated = 0, 0
    sample = None

    for pi, phase in enumerate(new_doc.get("phases", [])):
        phase_name = phase.get("phaseName", "")
        params = _phase_prog_params(phase_name)
        phase_opts_out = phase_name in PHASE_NO_BLOCK_DELOAD
        for block in phase.get("blocks", []):
            weeks = sorted(block.get("weeks", []), key=lambda w: w.get("weekNumber", 0))
            block_weeks = len(weeks)
            block_has_deload = (block_weeks > MIN_WEEKS_FOR_BLOCK_DELOAD) and not phase_opts_out
            for wpos, week in enumerate(weeks):
                wk_num = week.get("weekNumber", 0)
                if wk_num <= current_week:
                    preserved += 1
                    continue  # byte-identical: untouched
                regenerated += 1
                is_deload = block_has_deload and (wpos == block_weeks - 1)
                week["isDeload"] = is_deload
                for sess in week.get("sessions", []):
                    stype = sess.get("sessionType", "")
                    ctx = ProgContext(
                        week_in_block=wpos + 1,
                        global_week=wk_num,
                        block_number=block.get("blockNumber", 1),
                        phase_index=pi,
                        phase_name=phase_name,
                        is_deload=is_deload,
                        plan_id=new_doc.get("planId", ""),
                        params=params,
                        is_speed=stype in _SPEED,
                        is_max_effort=stype in _MAX_EFFORT,
                        blocked=blocked,
                    )
                    # Rebuild models from stored (original base) exercises, progress, dump back
                    ex_models = [SessionExercise.model_validate(e) for e in sess.get("exercises", [])]
                    _apply_progression(ex_models, ctx)
                    sess["exercises"] = [e.model_dump(mode="json") for e in ex_models]

                # capture one before/after sample (first regenerated main lift)
                if sample is None and week.get("sessions"):
                    orig_wk = next(
                        (w for p in doc["phases"] for b in p["blocks"] for w in b["weeks"]
                         if w.get("weekNumber") == wk_num), None,
                    )
                    if orig_wk and orig_wk.get("sessions"):
                        s_old = orig_wk["sessions"][0]
                        s_new = week["sessions"][0]
                        def _main(s):
                            for e in s.get("exercises", []):
                                if e.get("category") == ExerciseCategory.MAIN.value:
                                    return e
                            return s.get("exercises", [{}])[0]
                        mo, mn = _main(s_old), _main(s_new)
                        sample = {
                            "weekNumber": wk_num,
                            "sessionType": s_new.get("sessionType"),
                            "before": {"name": mo.get("name"), "loads": [t.get("targetLoad") for t in mo.get("targetSets", [])]},
                            "after":  {"name": mn.get("name"), "loads": [t.get("targetLoad") for t in mn.get("targetSets", [])]},
                        }

    return new_doc, {"preserved": preserved, "regenerated": regenerated, "sample": sample}


def _past_weeks_identical(orig: dict, migrated: dict, current_week: int) -> bool:
    def past(doc):
        out = {}
        for p in doc.get("phases", []):
            for b in p.get("blocks", []):
                for w in b.get("weeks", []):
                    if w.get("weekNumber", 0) <= current_week:
                        out[w["weekNumber"]] = w
        return out
    return past(orig) == past(migrated)


async def cmd_backup(plan_ids):
    db = _db()
    made = 0
    for pid in plan_ids:
        doc = await db.saved_plans.find_one({"planId": pid})
        if not doc:
            print(f"[backup] planId={pid} NOT FOUND — skipped")
            continue
        exists = await db[BACKUP_COLL].find_one({"planId": pid})
        if exists:
            print(f"[backup] planId={pid} already backed up — kept original (not overwritten)")
            continue
        b = _clean(doc)
        b["_backed_up_at"] = datetime.utcnow().isoformat()
        await db[BACKUP_COLL].insert_one(b)
        made += 1
        print(f"[backup] planId={pid} user={doc.get('userId')} status={doc.get('status')} -> backed up")
    total = await db[BACKUP_COLL].count_documents({})
    print(f"[backup] new backups this run: {made} | total backups in {BACKUP_COLL}: {total}")


async def cmd_migrate(plan_id, commit, target):
    db = _db()
    # 1. Ensure a pre-migration backup exists (created from current doc, once)
    await cmd_backup([plan_id])
    backup = await db[BACKUP_COLL].find_one({"planId": plan_id})
    if not backup:
        print(f"[migrate] no backup for {plan_id} — abort")
        return
    original = _clean(backup)  # immutable source of truth (base sessions)
    current_stored = _clean(await db.saved_plans.find_one({"planId": plan_id}))

    current_week = _calc_current_week(original.get("startDate"))
    injuries = await _get_injuries(db, original.get("userId"))

    migrated, stats = _rebuild_future_weeks(original, current_week, injuries)

    # Safety assertions
    assert _past_weeks_identical(original, migrated, current_week), "PAST WEEKS CHANGED — aborting"

    # Idempotency / no-op detection vs what is currently stored
    is_noop = _clean(migrated) == current_stored
    total_weeks = stats["preserved"] + stats["regenerated"]

    print("=" * 72)
    print(f"[migrate] planId={plan_id} user={original.get('userId')} status={original.get('status')}")
    print(f"          startDate={str(original.get('startDate'))[:10]} currentWeek={current_week} injuries={injuries or 'none'}")
    print(f"          weeks total={total_weeks} preserved(<=wk{current_week})={stats['preserved']} regenerated(future)={stats['regenerated']}")
    print(f"          past_weeks_byte_identical=TRUE")
    if stats["sample"]:
        s = stats["sample"]
        print(f"          SAMPLE future wk{s['weekNumber']} [{s['sessionType']}] main lift:")
        print(f"            BEFORE {s['before']['name']}: {s['before']['loads']}")
        print(f"            AFTER  {s['after']['name']}: {s['after']['loads']}")
    print(f"          second-run-would-be-noop / equals-current-stored: {is_noop}")

    if not commit:
        print("[migrate] DRY-RUN — no write performed. Re-run with --commit to persist.")
        return
    if is_noop:
        print("[migrate] result identical to stored doc — NO-OP, skipping write.")
        return

    out = _clean(migrated)
    out["_saved_at"] = datetime.utcnow().isoformat()
    coll = db[target]
    await coll.replace_one({"planId": plan_id}, out, upsert=True)
    print(f"[migrate] WROTE migrated plan to '{target}' (planId={plan_id}).")


async def cmd_delete_junk(user_id, commit):
    db = _db()
    usr = await db.users.find_one({"userId": user_id})
    logs = await db.log.count_documents({"userId": user_id})
    ratings = await db.session_ratings.count_documents({"userId": user_id})
    print(f"[delete-junk] user={user_id} email={usr.get('email') if usr else None} name={usr.get('name') if usr else None}")
    print(f"              logs={logs} ratings={ratings}")
    is_junk = bool(usr) and str(usr.get("email", "")).startswith("test_prog_") and logs == 0 and ratings == 0
    if not is_junk:
        print("[delete-junk] NOT unambiguously test junk — ABORT (no deletion).")
        return
    if not commit:
        print("[delete-junk] DRY-RUN — would delete saved_plans/profile/users/tracked_lifts for this user.")
        return
    r1 = await db.saved_plans.delete_many({"userId": user_id})
    r2 = await db.profile.delete_many({"userId": user_id})
    r3 = await db.tracked_lifts.delete_many({"userId": user_id})
    r4 = await db.users.delete_many({"userId": user_id})
    print(f"[delete-junk] deleted saved_plans={r1.deleted_count} profile={r2.deleted_count} tracked_lifts={r3.deleted_count} users={r4.deleted_count}")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("backup"); b.add_argument("plan_ids", nargs="+")
    m = sub.add_parser("migrate"); m.add_argument("plan_id"); m.add_argument("--commit", action="store_true"); m.add_argument("--target", default="saved_plans")
    d = sub.add_parser("delete-junk"); d.add_argument("user_id"); d.add_argument("--commit", action="store_true")
    args = ap.parse_args()

    if args.cmd == "backup":
        asyncio.run(cmd_backup(args.plan_ids))
    elif args.cmd == "migrate":
        asyncio.run(cmd_migrate(args.plan_id, args.commit, args.target))
    elif args.cmd == "delete-junk":
        asyncio.run(cmd_delete_junk(args.user_id, args.commit))


if __name__ == "__main__":
    main()
