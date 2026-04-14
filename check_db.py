import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

async def check():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    # Count orphans
    orphan_count = await db.log.count_documents({"userId": {"$exists": False}})
    print(f"Orphan log entries: {orphan_count}")

    checkin_orphans = await db.checkins.count_documents({"userId": {"$exists": False}})
    print(f"Orphan checkins: {checkin_orphans}")

    sub_orphans = await db.substitutions.count_documents({"userId": {"$exists": False}})
    print(f"Orphan substitutions: {sub_orphans}")

    # Check users
    users = await db.users.find({}).to_list(100)
    print(f"Total users: {len(users)}")
    for u in users:
        uid = u.get("userId", "N/A")
        email = u.get("email", "N/A")
        count = await db.log.count_documents({"userId": uid})
        print(f"  userId={uid}, email={email}, log_entries={count}")

    # Sample orphan
    sample = await db.log.find_one({"userId": {"$exists": False}})
    if sample:
        print(f"Sample orphan: date={sample.get('date')}, exercise={sample.get('exercise')}")

    client.close()

asyncio.run(check())
