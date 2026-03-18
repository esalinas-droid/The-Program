from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pydantic import BaseModel, Field, ConfigDict, BeforeValidator
from typing import List, Optional, Any, Annotated
from datetime import datetime, timezone
import os
import logging
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── PyObjectId ──────────────────────────────────────────────────────────────
def validate_object_id(v: Any) -> str:
    if isinstance(v, ObjectId): return str(v)
    if isinstance(v, str): return v
    raise ValueError(f"Invalid ObjectId: {v}")

PyObjectId = Annotated[str, BeforeValidator(validate_object_id)]

class BaseDocument(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    model_config = ConfigDict(populate_by_name=True)

    def to_mongo(self) -> dict:
        d = self.model_dump(exclude={"id"}, exclude_none=False)
        return d

    @classmethod
    def from_mongo(cls, data: dict):
        if data and "_id" in data:
            data["_id"] = str(data["_id"])
        return cls(**data)

# ── Models ───────────────────────────────────────────────────────────────────
class AthleteProfile(BaseDocument):
    name: str = "Eric"
    experience: str = "Advanced"
    currentBodyweight: float = 274.0
    bw12WeekGoal: float = 255.0
    bwLongRunGoal: float = 230.0
    basePRs: dict = {}
    injuryFlags: List[str] = []
    avoidMovements: List[str] = []
    weaknesses: List[str] = []
    currentWeek: int = 1
    programStartDate: str = "2026-03-16"
    units: str = "lbs"
    onboardingComplete: bool = False
    notifications: dict = {
        "dailyReminder": True, "dailyReminderTime": "07:00",
        "deloadAlert": True, "prAlert": True, "weeklyCheckin": True
    }
    loseitConnected: bool = False
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updatedAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AthleteProfileUpdate(BaseModel):
    name: Optional[str] = None
    experience: Optional[str] = None
    currentBodyweight: Optional[float] = None
    bw12WeekGoal: Optional[float] = None
    bwLongRunGoal: Optional[float] = None
    basePRs: Optional[dict] = None
    injuryFlags: Optional[List[str]] = None
    avoidMovements: Optional[List[str]] = None
    weaknesses: Optional[List[str]] = None
    currentWeek: Optional[int] = None
    programStartDate: Optional[str] = None
    units: Optional[str] = None
    onboardingComplete: Optional[bool] = None
    notifications: Optional[dict] = None
    loseitConnected: Optional[bool] = None

class WorkoutLogEntry(BaseDocument):
    date: str
    week: int
    day: str
    sessionType: str
    exercise: str
    sets: int
    weight: float
    reps: int
    rpe: float
    pain: int
    completed: str
    bodyweight: Optional[float] = None
    notes: Optional[str] = None
    flag: Optional[str] = None
    e1rm: float = 0.0
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class WorkoutLogCreate(BaseModel):
    date: str
    week: int
    day: str
    sessionType: str
    exercise: str
    sets: int
    weight: float
    reps: int
    rpe: float
    pain: int
    completed: str
    bodyweight: Optional[float] = None
    notes: Optional[str] = None
    flag: Optional[str] = None

class CheckIn(BaseDocument):
    week: int
    date: str
    avgPain: float = 0.0
    avgRPE: float = 0.0
    completionRate: float = 0.0
    avgBodyweight: float = 0.0
    avgCalories: Optional[float] = None
    avgProtein: Optional[float] = None
    avgCarbs: Optional[float] = None
    avgFat: Optional[float] = None
    personalNotes: str = ""
    recommendations: List[str] = []
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CheckInCreate(BaseModel):
    week: int
    date: str
    avgPain: float
    avgRPE: float
    completionRate: float
    avgBodyweight: float
    avgCalories: Optional[float] = None
    avgProtein: Optional[float] = None
    avgCarbs: Optional[float] = None
    avgFat: Optional[float] = None
    personalNotes: str = ""
    recommendations: List[str] = []

# ── Helpers ──────────────────────────────────────────────────────────────────
def epley_e1rm(weight: float, reps: int) -> float:
    if reps <= 0 or weight <= 0: return 0.0
    if reps == 1: return weight
    return round(weight * (1 + reps / 30))

# ── Profile Endpoints ─────────────────────────────────────────────────────────
@api_router.get("/profile")
async def get_profile():
    doc = await db.profile.find_one({})
    if not doc:
        raise HTTPException(status_code=404, detail="Profile not found")
    return AthleteProfile.from_mongo(doc).model_dump(exclude={"id"})

@api_router.post("/profile")
async def create_profile(profile: AthleteProfileUpdate):
    existing = await db.profile.find_one({})
    data = {k: v for k, v in profile.model_dump().items() if v is not None}
    data["updatedAt"] = datetime.now(timezone.utc)
    if existing:
        await db.profile.update_one({"_id": existing["_id"]}, {"$set": data})
        doc = await db.profile.find_one({"_id": existing["_id"]})
    else:
        default = AthleteProfile(**data)
        result = await db.profile.insert_one(default.to_mongo())
        doc = await db.profile.find_one({"_id": result.inserted_id})
    return AthleteProfile.from_mongo(doc).model_dump(exclude={"id"})

@api_router.put("/profile")
async def update_profile(profile: AthleteProfileUpdate):
    existing = await db.profile.find_one({})
    if not existing:
        raise HTTPException(status_code=404, detail="Profile not found")
    data = {k: v for k, v in profile.model_dump().items() if v is not None}
    data["updatedAt"] = datetime.now(timezone.utc)
    await db.profile.update_one({"_id": existing["_id"]}, {"$set": data})
    doc = await db.profile.find_one({"_id": existing["_id"]})
    return AthleteProfile.from_mongo(doc).model_dump(exclude={"id"})

# ── Workout Log Endpoints ─────────────────────────────────────────────────────
@api_router.get("/log")
async def get_log_entries(week: Optional[int] = None, exercise: Optional[str] = None, 
                           session_type: Optional[str] = None, limit: int = 200):
    query = {}
    if week is not None: query["week"] = week
    if exercise: query["exercise"] = exercise
    if session_type: query["sessionType"] = session_type
    docs = await db.log.find(query).sort("date", -1).limit(limit).to_list(limit)
    return [WorkoutLogEntry.from_mongo(d).model_dump(exclude={"id"}) | {"id": str(d["_id"])} for d in docs]

@api_router.post("/log")
async def create_log_entry(entry: WorkoutLogCreate):
    e1rm = epley_e1rm(entry.weight, entry.reps)
    log = WorkoutLogEntry(**entry.model_dump(), e1rm=e1rm)
    data = log.to_mongo()
    result = await db.log.insert_one(data)
    doc = await db.log.find_one({"_id": result.inserted_id})
    return WorkoutLogEntry.from_mongo(doc).model_dump(exclude={"id"}) | {"id": str(result.inserted_id)}

@api_router.put("/log/{entry_id}")
async def update_log_entry(entry_id: str, entry: WorkoutLogCreate):
    e1rm = epley_e1rm(entry.weight, entry.reps)
    data = entry.model_dump()
    data["e1rm"] = e1rm
    await db.log.update_one({"_id": ObjectId(entry_id)}, {"$set": data})
    doc = await db.log.find_one({"_id": ObjectId(entry_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Entry not found")
    return WorkoutLogEntry.from_mongo(doc).model_dump(exclude={"id"}) | {"id": str(doc["_id"])}

@api_router.delete("/log/{entry_id}")
async def delete_log_entry(entry_id: str):
    result = await db.log.delete_one({"_id": ObjectId(entry_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"deleted": True}

@api_router.get("/log/stats/week/{week_num}")
async def get_week_stats(week_num: int):
    docs = await db.log.find({"week": week_num}).to_list(500)
    if not docs:
        return {"avgPain": 0, "avgRPE": 0, "completionRate": 0, "entries": 0}
    pain_vals = [d["pain"] for d in docs if d.get("pain") is not None]
    rpe_vals = [d["rpe"] for d in docs if d.get("rpe") is not None]
    completed = sum(1 for d in docs if d.get("completed") in ["Completed", "Modified"])
    total = len(docs)
    return {
        "avgPain": round(sum(pain_vals) / len(pain_vals), 1) if pain_vals else 0,
        "avgRPE": round(sum(rpe_vals) / len(rpe_vals), 1) if rpe_vals else 0,
        "completionRate": round(completed / total * 100) if total else 0,
        "entries": total
    }

# ── PR Endpoints ──────────────────────────────────────────────────────────────
TRACKED_EXERCISES = [
    "SSB Box Squat", "Back Squat", "Bench Press", "Floor Press", "Close-Grip Bench Press",
    "Conventional Deadlift", "Sumo Deadlift", "Trap Bar Deadlift (High Handle)",
    "Block Pull (Below Knee)", "Log Clean and Press", "Log Push Press",
    "Axle Clean and Press", "Axle Push Press", "Overhead Press (Barbell)",
    "Cambered Bar Box Squat", "Yoke Carry", "Farmers Carry", "Speed Box Squat",
    "Sandbag Carry", "Suitcase Carry", "Belt Squat"
]

@api_router.get("/prs")
async def get_prs():
    prs = []
    for exercise in TRACKED_EXERCISES:
        docs = await db.log.find({"exercise": exercise}).sort("e1rm", -1).to_list(500)
        if not docs:
            prs.append({"exercise": exercise, "lastDate": None, "bestWeight": 0, "bestReps": 0, "bestE1rm": 0, "latestNote": ""})
            continue
        best = max(docs, key=lambda d: d.get("e1rm", 0))
        latest = max(docs, key=lambda d: d.get("date", ""))
        prs.append({
            "exercise": exercise,
            "lastDate": latest.get("date"),
            "bestWeight": best.get("weight", 0),
            "bestReps": best.get("reps", 0),
            "bestE1rm": best.get("e1rm", 0),
            "latestNote": latest.get("notes", "")
        })
    return prs

@api_router.get("/prs/{exercise}")
async def get_pr_history(exercise: str):
    docs = await db.log.find({"exercise": exercise}).sort("date", 1).to_list(500)
    history = []
    for d in docs:
        history.append({
            "date": d.get("date"),
            "week": d.get("week"),
            "weight": d.get("weight", 0),
            "reps": d.get("reps", 0),
            "e1rm": d.get("e1rm", 0),
            "rpe": d.get("rpe", 0)
        })
    return history

@api_router.get("/prs/bests/overview")
async def get_bests_overview():
    categories = {
        "squat": ["SSB Box Squat", "Back Squat", "Belt Squat", "Cambered Bar Box Squat", "Trap Bar Deadlift (High Handle)"],
        "press": ["Floor Press", "Close-Grip Bench Press", "Bench Press", "Log Clean and Press", "Axle Clean and Press", "Log Push Press", "Axle Push Press", "Overhead Press (Barbell)"],
        "pull": ["Conventional Deadlift", "Sumo Deadlift", "Trap Bar Deadlift (High Handle)", "Block Pull (Below Knee)"]
    }
    result = {}
    for cat, exercises in categories.items():
        best_e1rm = 0
        best_exercise = None
        for ex in exercises:
            doc = await db.log.find_one({"exercise": ex}, sort=[("e1rm", -1)])
            if doc and doc.get("e1rm", 0) > best_e1rm:
                best_e1rm = doc["e1rm"]
                best_exercise = ex
        result[cat] = {"exercise": best_exercise, "e1rm": best_e1rm}
    return result

# ── Bodyweight Endpoints ───────────────────────────────────────────────────────
@api_router.get("/bodyweight")
async def get_bodyweight_history():
    docs = await db.log.find({"bodyweight": {"$ne": None}}).sort("date", 1).to_list(200)
    seen = set()
    bw_list = []
    for d in docs:
        if d.get("date") not in seen and d.get("bodyweight"):
            seen.add(d["date"])
            bw_list.append({"date": d["date"], "weight": d["bodyweight"]})
    return bw_list

# ── Check-In Endpoints ────────────────────────────────────────────────────────
@api_router.get("/checkin")
async def get_checkins():
    docs = await db.checkins.find({}).sort("week", -1).to_list(100)
    return [CheckIn.from_mongo(d).model_dump(exclude={"id"}) | {"id": str(d["_id"])} for d in docs]

@api_router.post("/checkin")
async def create_checkin(checkin: CheckInCreate):
    obj = CheckIn(**checkin.model_dump())
    result = await db.checkins.insert_one(obj.to_mongo())
    doc = await db.checkins.find_one({"_id": result.inserted_id})
    return CheckIn.from_mongo(doc).model_dump(exclude={"id"}) | {"id": str(result.inserted_id)}

@api_router.get("/checkin/week/{week_num}")
async def get_checkin_by_week(week_num: int):
    doc = await db.checkins.find_one({"week": week_num})
    if not doc:
        return None
    return CheckIn.from_mongo(doc).model_dump(exclude={"id"}) | {"id": str(doc["_id"])}

# ── Seed Endpoint ─────────────────────────────────────────────────────────────
@api_router.post("/seed")
async def seed_database():
    existing = await db.profile.find_one({})
    if existing:
        return {"message": "Database already seeded", "seeded": False}
    profile = AthleteProfile(
        name="Eric",
        experience="Advanced",
        currentBodyweight=274.0,
        bw12WeekGoal=255.0,
        bwLongRunGoal=230.0,
        basePRs={
            "backSquat": 500, "benchPress": 400, "axleDeadlift": 600,
            "axleOverhead_weight": 225, "axleOverhead_reps": 5,
            "logPress": 285, "yokeLoad": 740, "yokeDistance": 40,
            "farmersPerHand": 220, "ssbBoxSquat": 405
        },
        injuryFlags=["Right hamstring / nerve compression", "Low back", "Left knee"],
        avoidMovements=["Stone to shoulder", "Very low box squats", "Aggressive from-floor max deadlift"],
        weaknesses=["Hip drive", "Core stability", "Conditioning / between-set recovery"],
        currentWeek=1,
        programStartDate="2026-03-16",
        units="lbs",
        onboardingComplete=False
    )
    await db.profile.insert_one(profile.to_mongo())
    return {"message": "Database seeded with Eric's profile", "seeded": True}

@api_router.get("/")
async def root():
    return {"message": "The Program API", "version": "1.0.0"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
