"""
Manual migration: assign all orphan log entries, checkins, and substitutions
to user_a@theprogram.app (primary Strongman test user).
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

# user_a@theprogram.app  (confirmed Strongman advanced — matches SSB Box Squat orphan data)
PRIMARY_USER_ID = "5e5f0dd7-1fe7-4df4-b813-4b02d5e9e902"

async def migrate():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    # Logs
    orphan_count = await db.log.count_documents({"userId": {"$exists": False}})
    if orphan_count:
        result = await db.log.update_many(
            {"userId": {"$exists": False}},
            {"$set": {"userId": PRIMARY_USER_ID}}
        )
        print(f"[MIGRATION] Backfilled {result.modified_count}/{orphan_count} log entries → userId: {PRIMARY_USER_ID}")
    else:
        print("[MIGRATION] No orphan log entries. Skipped.")

    # Checkins
    checkin_count = await db.checkins.count_documents({"userId": {"$exists": False}})
    if checkin_count:
        result = await db.checkins.update_many(
            {"userId": {"$exists": False}},
            {"$set": {"userId": PRIMARY_USER_ID}}
        )
        print(f"[MIGRATION] Backfilled {result.modified_count}/{checkin_count} checkins → userId: {PRIMARY_USER_ID}")
    else:
        print("[MIGRATION] No orphan checkins. Skipped.")

    # Substitutions
    sub_count = await db.substitutions.count_documents({"userId": {"$exists": False}})
    if sub_count:
        result = await db.substitutions.update_many(
            {"userId": {"$exists": False}},
            {"$set": {"userId": PRIMARY_USER_ID}}
        )
        print(f"[MIGRATION] Backfilled {result.modified_count}/{sub_count} substitutions → userId: {PRIMARY_USER_ID}")
    else:
        print("[MIGRATION] No orphan substitutions. Skipped.")

    # Final verification
    remaining_log = await db.log.count_documents({"userId": {"$exists": False}})
    remaining_checkin = await db.checkins.count_documents({"userId": {"$exists": False}})
    remaining_sub = await db.substitutions.count_documents({"userId": {"$exists": False}})

    print(f"\n[VERIFICATION] Remaining orphans:")
    print(f"  log:           {remaining_log}")
    print(f"  checkins:      {remaining_checkin}")
    print(f"  substitutions: {remaining_sub}")

    if remaining_log == 0 and remaining_checkin == 0 and remaining_sub == 0:
        print("\n✅ Migration COMPLETE — all entries now have userId.")
    else:
        print("\n⚠️  Some entries still missing userId!")

    client.close()

asyncio.run(migrate())
