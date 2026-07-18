"""
Seed script: analytics test users for the AI-coach analytics/clinician layer.
Idempotent — re-running clears and re-seeds each user's logs/pain reports.

Users (password for all: Analytics123):
  analytics_creep@test.com   — 4 weeks of bench @185 with RPE 7→7.5→8.5→9 (RPE creep)
  analytics_e1rm@test.com    — entered bench 1RM 300; best sets imply e1RM ~325 (+8%)
  analytics_injury@test.com  — active shoulder injury; pain reports clustering after Overhead Press, rising
  analytics_thin@test.com    — only 1 week of logs (low-confidence path)
  analytics_empty@test.com   — zero logs / zero analytics (coach must work normally)

Run:  cd /app/backend && python seed_analytics_test_users.py
"""
import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient

from services.training_analytics import refresh_training_analytics

PASSWORD = "Analytics123"
SEED_TAG = "analytics_seed"


def _day(days_ago: int) -> str:
    return (datetime.now(timezone.utc).date() - timedelta(days=days_ago)).isoformat()


def _log(uid, days_ago, exercise, weight, reps, rpe, sets=3, pain=0, session="Heavy Upper", notes=None):
    w, r = float(weight), int(reps)
    e1rm = 0.0 if (w <= 0 or r <= 0) else (w if r == 1 else round(w * (1 + r / 30)))
    return {
        "userId": uid, "date": _day(days_ago), "week": 1, "day": "Mon",
        "sessionType": session, "exercise": exercise, "sets": sets,
        "weight": w, "reps": r, "rpe": float(rpe), "pain": pain,
        "completed": "yes", "notes": notes, "e1rm": e1rm,
        "createdAt": datetime.now(timezone.utc), "_seed": SEED_TAG,
    }


async def ensure_user(db, email, name):
    doc = await db.users.find_one({"email": email})
    if doc:
        return doc["userId"]
    import uuid
    pw_hash = bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt()).decode()
    uid = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.insert_one({
        "userId": uid, "email": email, "name": name,
        "authProvider": "email", "passwordHash": pw_hash,
        "signupDate": now_iso, "lastLoginDate": now_iso,
        "onboardingComplete": True, "goal": None, "experience": None,
        "pushNotificationToken": None, "emailVerified": True, "marketingOptIn": False,
    })
    return uid


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc)

    # ── 1. RPE creep user ────────────────────────────────────────────────────
    uid = await ensure_user(db, "analytics_creep@test.com", "Creep Carl")
    await db.log.delete_many({"userId": uid})
    await db.pain_reports.delete_many({"userId": uid})
    await db.profile.update_one({"userId": uid}, {"$set": {
        "userId": uid, "name": "Creep Carl", "goal": "Strength", "experience": "Intermediate",
        "basePRs": {"bench": 225, "squat": 315}, "units": "lbs", "trainingDaysCount": 3,
        "injuryFlags": [], "injuryDetails": [], "training_mode": "free",
        "onboardingComplete": True, "updatedAt": now,
    }}, upsert=True)
    logs = []
    for days_ago, rpe in [(23, 7.0), (16, 7.5), (9, 8.5), (2, 9.0)]:
        logs.append(_log(uid, days_ago, "Bench Press", 185, 5, rpe))
        logs.append(_log(uid, days_ago, "Back Squat", 225, 5, 7.0, session="Heavy Lower"))
        logs.append(_log(uid, days_ago - 2 if days_ago > 2 else 1, "Barbell Row", 155, 8, 7.0, session="Heavy Upper"))
    await db.log.insert_many(logs)
    await refresh_training_analytics(db, uid)
    print(f"creep user seeded: {uid} ({len(logs)} logs)")

    # ── 2. Effective-1RM divergence user ─────────────────────────────────────
    uid = await ensure_user(db, "analytics_e1rm@test.com", "Effective Eddie")
    await db.log.delete_many({"userId": uid})
    await db.pain_reports.delete_many({"userId": uid})
    await db.profile.update_one({"userId": uid}, {"$set": {
        "userId": uid, "name": "Effective Eddie", "goal": "Strength", "experience": "Advanced",
        "basePRs": {"bench": 300, "squat": 405}, "units": "lbs", "trainingDaysCount": 3,
        "injuryFlags": [], "injuryDetails": [], "training_mode": "free",
        "onboardingComplete": True, "updatedAt": now,
    }}, upsert=True)
    logs = []
    # bench best sets: 295×3 → Epley e1RM = 325 (+8.3% over entered 300)
    for days_ago, w in [(24, 275), (17, 280), (10, 285), (3, 295)]:
        logs.append(_log(uid, days_ago, "Bench Press", w, 3, 8.0))
        logs.append(_log(uid, days_ago, "Back Squat", 315, 5, 7.0, session="Heavy Lower"))
        logs.append(_log(uid, days_ago - 1 if days_ago > 1 else 1, "Pull-Up", 0, 10, 7.0))
    await db.log.insert_many(logs)
    await refresh_training_analytics(db, uid)
    print(f"e1rm user seeded: {uid} ({len(logs)} logs)")

    # ── 3. Injury + rising pain cluster user ─────────────────────────────────
    uid = await ensure_user(db, "analytics_injury@test.com", "Painful Pat")
    await db.log.delete_many({"userId": uid})
    await db.pain_reports.delete_many({"userId": uid})
    await db.profile.update_one({"userId": uid}, {"$set": {
        "userId": uid, "name": "Painful Pat", "goal": "Strength", "experience": "Intermediate",
        "basePRs": {"ohp": 185, "bench": 275}, "units": "lbs", "trainingDaysCount": 3,
        "injuryFlags": ["Shoulder (general)"],
        "injuryDetails": [{"name": "Shoulder (general)", "status": "active", "severity": "moderate"}],
        "training_mode": "free", "onboardingComplete": True, "updatedAt": now,
    }}, upsert=True)
    logs = []
    for days_ago, pain in [(18, 2), (11, 3), (5, 5), (2, 6)]:
        logs.append(_log(uid, days_ago, "Overhead Press", 135, 5, 8.0, pain=pain,
                         notes="shoulder ached after pressing" if pain >= 5 else None))
        logs.append(_log(uid, days_ago, "Bench Press", 225, 5, 7.0))
        logs.append(_log(uid, days_ago - 1 if days_ago > 1 else 1, "Barbell Row", 165, 8, 7.0))
    await db.log.insert_many(logs)
    # Structured pain reports clustered on Overhead Press, rising intensity
    await db.pain_reports.insert_many([
        {"userId": uid, "date": _day(d), "bodyRegion": "Shoulder", "painType": "sharp",
         "intensity": inten, "exerciseName": "Overhead Press",
         "createdAt": now, "_seed": SEED_TAG}
        for d, inten in [(18, 3), (11, 4), (5, 6), (2, 7)]
    ])
    await refresh_training_analytics(db, uid)
    print(f"injury user seeded: {uid}")

    # ── 4. Thin-data user (1 week of logs) ───────────────────────────────────
    uid = await ensure_user(db, "analytics_thin@test.com", "Thin Data Tina")
    await db.log.delete_many({"userId": uid})
    await db.pain_reports.delete_many({"userId": uid})
    await db.profile.update_one({"userId": uid}, {"$set": {
        "userId": uid, "name": "Thin Data Tina", "goal": "Hypertrophy", "experience": "Beginner",
        "basePRs": {"bench": 135}, "units": "lbs", "trainingDaysCount": 3,
        "injuryFlags": [], "injuryDetails": [], "training_mode": "free",
        "onboardingComplete": True, "updatedAt": now,
    }}, upsert=True)
    logs = []
    for days_ago in [5, 3, 1]:
        logs.append(_log(uid, days_ago, "Bench Press", 115, 8, 7.5))
        logs.append(_log(uid, days_ago, "Back Squat", 155, 8, 7.0, session="Heavy Lower"))
    await db.log.insert_many(logs)
    await refresh_training_analytics(db, uid)
    print(f"thin user seeded: {uid}")

    # ── 5. Zero-analytics user ───────────────────────────────────────────────
    uid = await ensure_user(db, "analytics_empty@test.com", "Empty Evan")
    await db.log.delete_many({"userId": uid})
    await db.training_analytics.delete_many({"userId": uid})
    await db.profile.update_one({"userId": uid}, {"$set": {
        "userId": uid, "name": "Empty Evan", "goal": "Strength", "experience": "Beginner",
        "basePRs": {}, "units": "lbs", "trainingDaysCount": 4,
        "injuryFlags": [], "injuryDetails": [], "training_mode": "free",
        "onboardingComplete": True, "updatedAt": now,
    }}, upsert=True)
    print(f"empty user seeded: {uid}")

    print("done.")


if __name__ == "__main__":
    asyncio.run(main())
