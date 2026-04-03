from routers.program import program_router, _store as _prog_store, DEFAULT_USER as _PROG_USER, _id as _prog_id
from models.schemas import (
    IntakeRequest as _IntakeRequest,
    CurrentLifts as _CurrentLifts,
    ChangeTrigger as _ChangeTrigger,
    ChangeScope as _ChangeScope,
    ProgramChange as _ProgramChange,
)
from services.plan_generator import generate_plan as _generate_plan
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
    name: str = ""
    experience: str = ""
    currentBodyweight: float = 0.0
    bw12WeekGoal: float = 0.0
    bwLongRunGoal: float = 0.0
    basePRs: dict = {}
    injuryFlags: List[str] = []
    avoidMovements: List[str] = []
    weaknesses: List[str] = []
    currentWeek: int = 1
    programStartDate: str = ""
    units: str = "lbs"
    onboardingComplete: bool = False
    notifications: dict = {
        "dailyReminder": True, "dailyReminderTime": "07:00",
        "deloadAlert": True, "prAlert": True, "weeklyCheckin": True
    }
    loseitConnected: bool = False
    # Extended onboarding / coaching intelligence fields
    goal: str = "strength"
    primaryWeaknesses: List[str] = []
    specialtyEquipment: List[str] = []
    sleepHours: float = 7.0
    stressLevel: str = "moderate"
    occupationType: str = "sedentary"
    hasCompetition: bool = False
    competitionDate: Optional[str] = None
    competitionType: Optional[str] = None
    gymTypes: List[str] = []
    trainingDaysCount: int = 4
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
    # Extended onboarding / coaching intelligence fields
    goal: Optional[str] = None
    primaryWeaknesses: Optional[List[str]] = None
    specialtyEquipment: Optional[List[str]] = None
    sleepHours: Optional[float] = None
    stressLevel: Optional[str] = None
    occupationType: Optional[str] = None
    hasCompetition: Optional[bool] = None
    competitionDate: Optional[str] = None
    competitionType: Optional[str] = None
    gymTypes: Optional[List[str]] = None
    trainingDaysCount: Optional[int] = None

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

# ── Injury Intelligence ───────────────────────────────────────────────────────

def _build_injury_keywords(injuries: list) -> set:
    keywords = set()
    for inj in injuries:
        inj_lower = inj.lower()
        if "knee" in inj_lower:
            keywords.add("knee_moderate")
            if "severe" in inj_lower: keywords.add("knee_severe")
        if "back" in inj_lower or "lumbar" in inj_lower:
            keywords.add("low_back_moderate")
            if "severe" in inj_lower: keywords.add("low_back_severe")
        if "hamstring" in inj_lower or "bicep femoris" in inj_lower:
            keywords.add("hamstring_moderate")
            if "severe" in inj_lower: keywords.add("hamstring_severe")
        if "shoulder" in inj_lower or "rotator" in inj_lower:
            keywords.add("shoulder_moderate")
            if "severe" in inj_lower: keywords.add("shoulder_severe")
        if "elbow" in inj_lower or "tricep" in inj_lower or "bicep" in inj_lower:
            keywords.add("elbow_severe")
        if "wrist" in inj_lower: keywords.add("wrist_severe")
        if "hip" in inj_lower or "groin" in inj_lower: keywords.add("hip_moderate")
        if "nerve" in inj_lower or "sciatica" in inj_lower: keywords.add("low_back_moderate")
    keywords.discard("")
    return keywords

_EXERCISE_CONTRAINDICATIONS = [
    {"name": "SSB Box Squat",              "contra": ["knee_severe"],                               "cat": "ME Lower"},
    {"name": "Speed Box Squat",            "contra": ["knee_severe"],                               "cat": "DE Lower"},
    {"name": "Pause Back Squat",           "contra": ["knee_moderate"],                             "cat": "ME Lower"},
    {"name": "Belt Squat",                 "contra": [],                                            "cat": "ME Lower"},
    {"name": "Conventional Deadlift",      "contra": ["low_back_severe", "hamstring_severe"],       "cat": "ME Lower"},
    {"name": "Sumo Deadlift",              "contra": ["hip_moderate", "low_back_severe"],           "cat": "ME Lower"},
    {"name": "Trap Bar Deadlift",          "contra": ["low_back_moderate"],                         "cat": "ME Lower"},
    {"name": "Romanian Deadlift (RDL)",    "contra": ["hamstring_severe"],                          "cat": "ME Lower"},
    {"name": "Good Morning",               "contra": ["low_back_severe"],                           "cat": "ME Lower"},
    {"name": "Block Pull",                 "contra": [],                                            "cat": "ME Lower"},
    {"name": "Speed Deadlift",             "contra": ["low_back_severe"],                           "cat": "DE Lower"},
    {"name": "Leg Press",                  "contra": ["knee_moderate"],                             "cat": "Accessory"},
    {"name": "Glute-Ham Raise (GHR)",      "contra": ["knee_severe", "hamstring_severe"],           "cat": "Accessory"},
    {"name": "Lying Leg Curl",             "contra": ["hamstring_severe"],                          "cat": "Accessory"},
    {"name": "Standing Leg Curl",          "contra": ["hamstring_severe"],                          "cat": "Accessory"},
    {"name": "Floor Press",                "contra": ["shoulder_severe"],                           "cat": "ME Upper"},
    {"name": "Close-Grip Bench Press",     "contra": ["shoulder_moderate", "elbow_severe"],         "cat": "ME Upper"},
    {"name": "JM Press",                   "contra": ["elbow_severe"],                              "cat": "ME Upper"},
    {"name": "Speed Bench Press",          "contra": ["shoulder_severe"],                           "cat": "DE Upper"},
    {"name": "Overhead Press (Barbell)",   "contra": ["shoulder_severe"],                           "cat": "ME Upper"},
    {"name": "Log Clean and Press",        "contra": ["shoulder_severe", "elbow_severe"],           "cat": "ME Upper / Strongman"},
    {"name": "Axle Press",                 "contra": ["shoulder_severe", "wrist_severe"],           "cat": "ME Upper / Strongman"},
    {"name": "Pendlay Row",                "contra": ["low_back_severe"],                           "cat": "Supplemental"},
    {"name": "Lat Pulldown",               "contra": ["shoulder_severe"],                           "cat": "Supplemental"},
    {"name": "Ab Wheel Rollout",           "contra": ["low_back_severe"],                           "cat": "Accessory"},
    {"name": "Tricep Pushdown",            "contra": ["elbow_severe"],                              "cat": "Accessory"},
    {"name": "Skull Crusher / EZ Bar",     "contra": ["elbow_severe"],                              "cat": "Accessory"},
    {"name": "Tate Press",                 "contra": ["elbow_severe"],                              "cat": "Accessory"},
    {"name": "Farmer Carry",               "contra": ["wrist_severe"],                              "cat": "GPP / Strongman"},
    {"name": "Zercher Carry",              "contra": ["elbow_severe", "low_back_severe"],           "cat": "GPP / Strongman"},
    {"name": "Yoke Carry",                 "contra": ["low_back_severe"],                           "cat": "GPP / Strongman"},
    {"name": "Stone to Shoulder",          "contra": ["low_back_severe", "shoulder_severe", "hip_moderate"], "cat": "Strongman"},
    {"name": "Keg Toss",                   "contra": ["shoulder_severe", "low_back_severe"],        "cat": "Strongman"},
]

@api_router.post("/plan/injury-preview")
async def injury_preview(body: dict):
    """Preview how changing injury flags would affect the training program."""
    new_injuries = body.get("newInjuryFlags", [])
    profile = await db.profile.find_one({})
    current_injuries = profile.get("injuryFlags", []) if profile else []

    old_kw = _build_injury_keywords(current_injuries)
    new_kw = _build_injury_keywords(new_injuries)

    added_inj   = [i for i in new_injuries    if i not in current_injuries]
    removed_inj = [i for i in current_injuries if i not in new_injuries]

    restricted = []
    restored   = []
    for ex in _EXERCISE_CONTRAINDICATIONS:
        was_blocked = any(c in old_kw for c in ex["contra"])
        is_blocked  = any(c in new_kw for c in ex["contra"])
        if not was_blocked and is_blocked:
            trigger = next(
                (inj for inj in added_inj
                 if any(c in _build_injury_keywords([inj]) for c in ex["contra"])),
                "new injury"
            )
            restricted.append({"name": ex["name"], "category": ex["cat"], "reason": f"Restricted by: {trigger}"})
        elif was_blocked and not is_blocked:
            restored.append({"name": ex["name"], "category": ex["cat"], "reason": "Injury resolved — exercise restored"})

    parts = []
    if added_inj:   parts.append(f"{len(added_inj)} injury flag(s) added")
    if removed_inj: parts.append(f"{len(removed_inj)} injury flag(s) resolved")
    if restricted:  parts.append(f"{len(restricted)} exercise(s) restricted")
    if restored:    parts.append(f"{len(restored)} exercise(s) restored")

    return {
        "addedInjuries":        added_inj,
        "removedInjuries":      removed_inj,
        "exercisesRestricted":  restricted,
        "exercisesRestored":    restored,
        "hasChanges":           bool(added_inj or removed_inj),
        "summary":              ". ".join(parts) + "." if parts else "No changes detected.",
    }


@api_router.post("/plan/apply-injury-update")
async def apply_injury_update(body: dict):
    """Save accepted injury flag changes to the athlete profile and log the change."""
    new_injuries = body.get("newInjuryFlags", [])
    profile = await db.profile.find_one({})
    if not profile:
        raise HTTPException(404, "Profile not found")

    old_injuries = profile.get("injuryFlags", [])
    added   = [i for i in new_injuries   if i not in old_injuries]
    removed = [i for i in old_injuries   if i not in new_injuries]

    await db.profile.update_one(
        {"_id": profile["_id"]},
        {"$set": {"injuryFlags": new_injuries, "updatedAt": datetime.now(timezone.utc)}}
    )

    reason_parts = []
    if added:   reason_parts.append(f"Added: {', '.join(added)}")
    if removed: reason_parts.append(f"Resolved: {', '.join(removed)}")
    reason = "User accepted injury update. " + ". ".join(reason_parts)

    from datetime import datetime as _dt
    change_doc = {
        "timestamp": datetime.now(timezone.utc),
        "date": _dt.now(timezone.utc).strftime("%Y-%m-%d"),
        "week": profile.get("currentWeek", 1),
        "day": "Profile",
        "sessionType": "Profile Update",
        "originalExercise": f"Injury Flags: {', '.join(old_injuries) or 'None'}",
        "replacementExercise": f"Injury Flags: {', '.join(new_injuries) or 'None'}",
        "reason": reason.strip(),
    }
    await db.substitutions.insert_one(change_doc)

    return {
        "success": True,
        "message": "Injury flags updated. Your program will adapt to new restrictions.",
        "added":   added,
        "removed": removed,
    }


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
# ── Exercise Substitution Log ─────────────────────────────────────────────────
class SubstitutionLog(BaseDocument):
    date: str
    week: int
    day: str
    sessionType: str
    originalExercise: str
    replacementExercise: str
    reason: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SubstitutionLogCreate(BaseModel):
    date: str
    week: int
    day: str
    sessionType: str
    originalExercise: str
    replacementExercise: str
    reason: str

@api_router.post("/substitutions")
async def log_substitution(entry: SubstitutionLogCreate):
    obj = SubstitutionLog(**entry.model_dump())
    result = await db.substitutions.insert_one(obj.to_mongo())
    doc = await db.substitutions.find_one({"_id": result.inserted_id})
    return SubstitutionLog.from_mongo(doc).model_dump(exclude={"id"}) | {"id": str(result.inserted_id)}

@api_router.get("/substitutions")
async def get_substitutions(week: Optional[int] = None):
    query = {}
    if week is not None:
        query["week"] = week
    docs = await db.substitutions.find(query).sort("timestamp", -1).to_list(200)
    return [SubstitutionLog.from_mongo(d).model_dump(exclude={"id"}) | {"id": str(d["_id"])} for d in docs]

@api_router.post("/seed")
async def seed_database():
    existing = await db.profile.find_one({})
    if existing:
        return {"message": "Database already seeded", "seeded": False}
    profile = AthleteProfile(
        name="",
        experience="",
        currentBodyweight=0.0,
        bw12WeekGoal=0.0,
        bwLongRunGoal=0.0,
        basePRs={},
        injuryFlags=[],
        avoidMovements=[],
        weaknesses=[],
        currentWeek=1,
        programStartDate=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        units="lbs",
        onboardingComplete=False
    )
    await db.profile.insert_one(profile.to_mongo())
    return {"message": "Database seeded with blank profile", "seeded": True}

@api_router.get("/")
async def root():
    return {"message": "The Program API", "version": "1.0.0"}

# ── OpenAI + Supabase for Pocket Coach ───────────────────────────────────────
from openai import AsyncOpenAI
from supabase import create_client
from emergentintegrations.llm.chat import LlmChat, UserMessage
import uuid

_openai_client = None
_supabase_client = None

@app.on_event("startup")
async def load_models():
    global _openai_client, _supabase_client
    logger.info("Initializing OpenAI client...")
    _openai_client = AsyncOpenAI(api_key=os.environ.get('OPENAI_API_KEY', ''))
    logger.info("OpenAI client initialized.")
    _supabase_client = create_client(
        os.environ.get('SUPABASE_URL', ''),
        os.environ.get('SUPABASE_KEY', '')
    )
    logger.info("Supabase client initialized.")

# ── Coach Models ──────────────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str
    content: str

class CoachRequest(BaseModel):
    message: str
    conversation_history: List[ChatMessage] = []
    conversation_id: Optional[str] = None

class CoachConversation(BaseDocument):
    userId: str = "default"
    title: str = ""
    messages: List[dict] = []
    hasProgramChange: bool = False
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updatedAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ── POST /api/coach/chat ──────────────────────────────────────────────────────
@api_router.post("/coach/chat")
async def coach_chat(request: CoachRequest):
    if not _openai_client or not _supabase_client:
        raise HTTPException(status_code=503, detail="Coach service not ready yet")

    profile_doc = await db.profile.find_one({})
    profile_text = "Athlete profile not yet set up."
    if profile_doc:
        name = profile_doc.get('name', '') or 'Athlete'
        exp = profile_doc.get('experience', '') or 'Unknown'
        bw = profile_doc.get('currentBodyweight', 0)
        bw_str = f"{bw} lbs" if bw and bw > 0 else "Not provided"
        bw_goal = profile_doc.get('bw12WeekGoal', 0)
        bw_goal_str = f"{bw_goal} lbs" if bw_goal and bw_goal > 0 else "Not set"
        injuries = profile_doc.get('injuryFlags', [])
        weaknesses = profile_doc.get('weaknesses', []) or profile_doc.get('primaryWeaknesses', [])
        avoid = profile_doc.get('avoidMovements', [])
        profile_text = (
            f"Name: {name}\n"
            f"Experience: {exp}\n"
            f"Bodyweight: {bw_str}\n"
            f"Current Week: {profile_doc.get('currentWeek', 1)}\n"
            f"Injury Flags: {', '.join(injuries) if injuries else 'None'}\n"
            f"Weaknesses: {', '.join(weaknesses) if weaknesses else 'None'}\n"
            f"Avoid: {', '.join(avoid) if avoid else 'None'}\n"
            f"12-Week BW Goal: {bw_goal_str}"
        )

    log_docs = await db.log.find({}).sort("date", -1).limit(5).to_list(5)
    recent_log = "No recent sessions logged."
    if log_docs:
        lines = [f"- {d.get('date')} {d.get('exercise')} {d.get('sets')}x{d.get('reps')} @{d.get('weight')}lbs RPE{d.get('rpe')}" for d in log_docs]
        recent_log = "\n".join(lines)

    week = profile_doc.get('currentWeek', 1) if profile_doc else 1
    block = 1 if week <= 4 else 2 if week <= 8 else 3 if week <= 12 else 4 if week <= 20 else 5 if week <= 32 else 6 if week <= 44 else 7
    deload_weeks = [4,8,12,20,24,28,32,36,40,44,48,52]
    phase = "Deload" if week in deload_weeks else (["Intro","Build","Peak"][(week - max([0]+[d for d in deload_weeks if d < week]) - 1) % 3])

    embedding_response = await _openai_client.embeddings.create(
        model='text-embedding-3-small',
        input=request.message,
        dimensions=512
    )
    embedding = embedding_response.data[0].embedding

    retrieved_passages = ""
    sources = []
    try:
        result = _supabase_client.rpc(
            'match_documents',
            {
                'query_embedding': embedding,
                'match_threshold': 0.3,
                'match_count': 5
            }
        ).execute()
        if result.data:
            passage_lines = []
            for i, chunk in enumerate(result.data):
                source = chunk.get('metadata', {}).get('source', 'Unknown Source')
                content = chunk.get('content', '')
                passage_lines.append(f"[{i+1}] {source}\n{content}")
                sources.append({"title": source, "page": "", "preview": content[:120]})
            retrieved_passages = "\n\n".join(passage_lines)
    except Exception as e:
        logger.warning(f"Supabase query failed: {e}")
        retrieved_passages = "No reference passages available."

    system_prompt = f"""You are an expert strength and conditioning coach specializing in powerlifting, strongman, sports nutrition, injury management, and recovery. You are coaching a specific athlete whose full profile is below. Always consider their injuries, weaknesses, and current training phase. Draw from the provided reference passages when relevant. Be specific, practical, and direct — this athlete is advanced. Never recommend anything that conflicts with their injury flags.

IMPORTANT RESPONSE FORMATTING RULES:
- Do NOT include academic-style citations like "[1]", "[2]", or footnote references.
- Do NOT list sources at the end of your response.
- If you draw from reference material, weave the information naturally into your response without citing it.
- Use clean headers (##, ###), bullet points, and bold text for readability.
- Keep responses focused and actionable.

PROGRAM CHANGE DETECTION:
If your recommendation includes a concrete change to the athlete's training program (e.g., swapping an exercise, changing volume/intensity, modifying a lift), append EXACTLY this block at the very end of your response (after all other content):
<PROGRAM_CHANGE>{{"type": "exercise_swap", "exercises": [{{"original": "exact current exercise name", "replacement": "exact replacement exercise name", "reason": "short reason"}}], "summary": "one-sentence summary of the change", "details": "full explanation of what and why"}}</PROGRAM_CHANGE>

Rules for <PROGRAM_CHANGE>:
- "original" must be the exact exercise name as it appears in the program (e.g., "Overhead Press", "Floor Press", "Box Squat")
- "replacement" must be a specific exercise name, not generic advice
- If recommending multiple exercise swaps, include all of them in the "exercises" array
- Only include <PROGRAM_CHANGE> for concrete exercise changes or load modifications — NOT for general advice
- Do NOT include <PROGRAM_CHANGE> for stretching, sleep, or nutrition advice alone

ATHLETE PROFILE:
{profile_text}

CURRENT TRAINING CONTEXT:
Week: {week} | Block: {block} | Phase: {phase}
Recent sessions:
{recent_log}

REFERENCE PASSAGES FROM COACHING LIBRARY:
{retrieved_passages}"""

    emergent_key = os.environ.get('EMERGENT_LLM_KEY', '')
    session_id = str(uuid.uuid4())
    chat = LlmChat(
        api_key=emergent_key,
        session_id=session_id,
        system_message=system_prompt
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    for msg in request.conversation_history:
        if msg.role == "user":
            await chat.send_message(UserMessage(text=msg.content))

    response_text = await chat.send_message(UserMessage(text=request.message))

    # ── Parse <PROGRAM_CHANGE> block ─────────────────────────────────────────
    import re as _re, json as _json
    program_change = None
    has_program_change = False
    clean_response = response_text

    pc_match = _re.search(r'<PROGRAM_CHANGE>(.*?)</PROGRAM_CHANGE>', response_text, _re.DOTALL)
    if pc_match:
        has_program_change = True
        try:
            program_change = _json.loads(pc_match.group(1).strip())
        except Exception:
            program_change = {"type": "recommendation", "summary": pc_match.group(1).strip(), "details": ""}
        clean_response = response_text[:pc_match.start()].rstrip()

    # ── Persist conversation to MongoDB ──────────────────────────────────────
    now = datetime.now(timezone.utc)
    conversation_id = request.conversation_id
    user_msg_doc = {"role": "user", "content": request.message, "timestamp": now.isoformat()}
    assistant_msg_doc = {"role": "assistant", "content": clean_response, "timestamp": now.isoformat(),
                         "hasProgramChange": has_program_change, "programChange": program_change}

    if conversation_id:
        try:
            conv_oid = ObjectId(conversation_id)
            await db.conversations.update_one(
                {"_id": conv_oid},
                {"$push": {"messages": {"$each": [user_msg_doc, assistant_msg_doc]}},
                 "$set": {"updatedAt": now, "hasProgramChange": has_program_change}}
            )
        except Exception:
            # Invalid ObjectId — create new conversation instead
            conversation_id = None

    if not conversation_id:
        title = request.message[:60] + ("..." if len(request.message) > 60 else "")
        conv_doc = {"userId": "default", "title": title, "messages": [user_msg_doc, assistant_msg_doc],
                    "hasProgramChange": has_program_change, "createdAt": now, "updatedAt": now}
        ins = await db.conversations.insert_one(conv_doc)
        conversation_id = str(ins.inserted_id)

    return {
        "response": clean_response,
        "sources": sources,
        "conversation_id": conversation_id,
        "has_program_change": has_program_change,
        "program_change": program_change,
    }


# ── Conversation Endpoints ────────────────────────────────────────────────────

@api_router.get("/coach/conversations")
async def get_conversations():
    """Get all conversations for the default user, newest first."""
    docs = await db.conversations.find({"userId": "default"}).sort("updatedAt", -1).limit(50).to_list(50)
    result = []
    for d in docs:
        cu = d.get("createdAt", "")
        uu = d.get("updatedAt", "")
        result.append({
            "id": str(d["_id"]),
            "title": d.get("title", "Conversation"),
            "hasProgramChange": d.get("hasProgramChange", False),
            "messageCount": len(d.get("messages", [])),
            "createdAt": cu.isoformat() if hasattr(cu, 'isoformat') else str(cu),
            "updatedAt": uu.isoformat() if hasattr(uu, 'isoformat') else str(uu),
        })
    return result


@api_router.get("/coach/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    """Get full conversation with messages."""
    try:
        oid = ObjectId(conversation_id)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid conversation ID format")
    doc = await db.conversations.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Conversation not found")
    cu = doc.get("createdAt", "")
    uu = doc.get("updatedAt", "")
    return {
        "id": str(doc["_id"]),
        "title": doc.get("title", "Conversation"),
        "messages": doc.get("messages", []),
        "hasProgramChange": doc.get("hasProgramChange", False),
        "createdAt": cu.isoformat() if hasattr(cu, 'isoformat') else str(cu),
        "updatedAt": uu.isoformat() if hasattr(uu, 'isoformat') else str(uu),
    }


@api_router.delete("/coach/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    try:
        oid = ObjectId(conversation_id)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid conversation ID format")
    result = await db.conversations.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"deleted": True}


async def _ensure_plan_loaded() -> bool:
    """Reload plan into _prog_store from MongoDB profile if not present after a server restart."""
    if _prog_store["plans"].get(_PROG_USER):
        return True

    profile_doc = await db.profile.find_one({})
    if not profile_doc:
        return False

    try:
        base_prs = profile_doc.get('basePRs') or {}
        lifts = _CurrentLifts(
            squat=base_prs.get('backSquat') or base_prs.get('squat'),
            bench=base_prs.get('benchPress') or base_prs.get('bench'),
            deadlift=base_prs.get('axleDeadlift') or base_prs.get('deadlift'),
        )
        exp_raw = (profile_doc.get('experience') or 'intermediate').lower().strip()
        exp_map = {'advanced': 'advanced', 'elite': 'elite', 'beginner': 'beginner', 'novice': 'beginner'}
        experience = exp_map.get(exp_raw.split()[0], 'intermediate')

        intake = _IntakeRequest(
            goal=profile_doc.get('trainingGoal') or 'strength',
            experience=experience,
            lifts=lifts,
            liftUnit=profile_doc.get('units') or 'lbs',
            frequency=int(profile_doc.get('trainingDays') or 4),
            injuries=[i for i in (profile_doc.get('injuryFlags') or []) if i and i != 'None'],
            gym=profile_doc.get('gymTypes') or [],
            bodyweight=profile_doc.get('currentBodyweight') or None,
        )
        plan = _generate_plan(intake)
        plan.userId = _PROG_USER
        _prog_store["plans"][_PROG_USER] = plan
        logger.info(f"Plan reloaded into memory from MongoDB profile: {plan.planName}")
        return True
    except Exception as e:
        logger.warning(f"Plan regeneration failed: {e}")
        return False


class ApplyRecommendationRequest(BaseModel):
    conversation_id: str
    summary: str
    details: str = ""
    exercises: List[dict] = []  # [{original, replacement, reason}]


@api_router.post("/coach/apply-recommendation")
async def apply_recommendation(body: ApplyRecommendationRequest):
    try:
        conv_oid = ObjectId(body.conversation_id)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid conversation_id format")

    profile = await db.profile.find_one({})
    week = profile.get("currentWeek", 1) if profile else 1
    now = datetime.now(timezone.utc)

    # ── Ensure plan is in memory (reload from MongoDB profile if server restarted) ──
    plan_available = await _ensure_plan_loaded()

    # ── Apply exercise swaps to the active in-memory plan ────────────────────
    total_swapped = 0
    changes_applied = []

    if body.exercises and plan_available:
        plan = _prog_store["plans"].get(_PROG_USER)
        if plan:
            for swap in body.exercises:
                original_raw = (swap.get("original") or "").strip()
                replacement = (swap.get("replacement") or "").strip()
                reason = (swap.get("reason") or body.summary or "coach recommendation").strip()
                if not original_raw or not replacement:
                    continue

                original_lower = original_raw.lower()
                # Fuzzy keywords: full phrase + individual words > 3 chars
                keywords = [original_lower] + [w for w in original_lower.split() if len(w) > 3]

                session_count = 0
                for phase in plan.phases:
                    for block in phase.blocks:
                        for week_obj in block.weeks:
                            for session in week_obj.sessions:
                                for ex in session.exercises:
                                    ex_lower = ex.name.lower()
                                    if any(kw in ex_lower for kw in keywords):
                                        ex.name = replacement
                                        ex.notes = (
                                            f"Coach sub: {reason}"
                                            if not ex.notes
                                            else f"{ex.notes} | Coach: {reason}"
                                        )
                                        session_count += 1
                                        total_swapped += 1

                if session_count > 0:
                    changes_applied.append({
                        "original": original_raw,
                        "replacement": replacement,
                        "sessions_updated": session_count,
                    })
                    _prog_store["changes"].append(_ProgramChange(
                        changeId=_prog_id(), userId=_PROG_USER,
                        triggerType=_ChangeTrigger.USER_REQUEST,
                        scope=_ChangeScope.YEAR,
                        oldValue=original_raw,
                        newValue=replacement,
                        explanation=f"Coach: swap {original_raw} → {replacement}. {reason}",
                    ))

    # ── Always log to MongoDB substitutions ──────────────────────────────────
    if changes_applied:
        for ch in changes_applied:
            await db.substitutions.insert_one({
                "timestamp": now, "date": now.strftime("%Y-%m-%d"),
                "week": week, "day": "Coach Recommendation",
                "sessionType": "Program Update",
                "originalExercise": ch["original"],
                "replacementExercise": ch["replacement"],
                "reason": body.details or body.summary,
                "conversationId": body.conversation_id,
                "sessionsUpdated": ch["sessions_updated"],
            })
    else:
        # Fallback: log the general recommendation even without specific exercise swaps
        await db.substitutions.insert_one({
            "timestamp": now, "date": now.strftime("%Y-%m-%d"),
            "week": week, "day": "Coach Recommendation",
            "sessionType": "Program Update",
            "originalExercise": "General Recommendation",
            "replacementExercise": body.summary,
            "reason": body.details or body.summary,
            "conversationId": body.conversation_id,
        })

    await db.conversations.update_one(
        {"_id": conv_oid},
        {"$set": {"recommendationApplied": True, "updatedAt": now}}
    )

    msg = (
        f"Applied! {total_swapped} exercise{'s' if total_swapped != 1 else ''} updated across your program."
        if total_swapped > 0
        else "Recommendation logged to your program changelog."
    )

    return {
        "success": True,
        "message": msg,
        "exercises_swapped": total_swapped,
        "changes": changes_applied,
    }

# ── Analytics Endpoints ───────────────────────────────────────────────────────

@api_router.get("/analytics/overview")
async def get_analytics_overview():
    all_logs = await db.log.find({}).to_list(5000)
    profile = await db.profile.find_one({})
    current_week = profile.get("currentWeek", 1) if profile else 1

    training_days = len(set(d.get("date", "") for d in all_logs if d.get("date")))

    deload_weeks_list = [4, 8, 12, 20, 24, 28, 32, 36, 40, 44, 48, 52]
    prev_deloads = [w for w in deload_weeks_list if w < current_week]
    block_start_week = prev_deloads[-1] if prev_deloads else 0

    recent_rpe = [
        d.get("rpe", 0) for d in all_logs
        if d.get("week", 0) >= max(1, current_week - 7)
        and d.get("rpe") is not None and d.get("rpe", 0) > 0
    ]
    avg_rpe = round(sum(recent_rpe) / len(recent_rpe), 1) if recent_rpe else 0.0

    weeks_trained = set(d.get("week") for d in all_logs if d.get("week"))
    weeks_count = max(len(weeks_trained), 1)
    session_types_per_week: dict = {}
    for d in all_logs:
        w = d.get("week")
        st = d.get("sessionType", "")
        if w and st:
            if w not in session_types_per_week:
                session_types_per_week[w] = set()
            session_types_per_week[w].add(st)
    total_sessions = sum(len(v) for v in session_types_per_week.values())
    expected_sessions = weeks_count * 4
    compliance = min(100, round(total_sessions / expected_sessions * 100)) if expected_sessions > 0 else 0

    block_logs = [d for d in all_logs if d.get("week", 0) > block_start_week]
    pr_count = 0
    for ex in TRACKED_EXERCISES:
        pre_max = max(
            (d.get("e1rm", 0) for d in all_logs if d.get("exercise") == ex and d.get("week", 0) <= block_start_week),
            default=0
        )
        block_max = max(
            (d.get("e1rm", 0) for d in block_logs if d.get("exercise") == ex),
            default=0
        )
        if block_max > pre_max and pre_max > 0:
            pr_count += 1

    return {
        "trainingDays": training_days,
        "avgRPE": avg_rpe,
        "compliance": compliance,
        "prsThisBlock": pr_count
    }


@api_router.get("/analytics/volume")
async def get_volume_trends():
    profile = await db.profile.find_one({})
    current_week = profile.get("currentWeek", 1) if profile else 1
    start_week = max(1, current_week - 7)
    result = []
    for w in range(start_week, current_week + 1):
        docs = await db.log.find({"week": w}).to_list(500)
        total_sets = sum(int(d.get("sets", 1) or 1) for d in docs)
        tonnage = sum(
            float(d.get("weight", 0) or 0) * int(d.get("reps", 0) or 0) * int(d.get("sets", 1) or 1)
            for d in docs
        )
        result.append({"week": w, "sets": total_sets, "tonnage": round(tonnage), "isCurrent": w == current_week})
    return result


@api_router.get("/analytics/pain")
async def get_pain_analytics():
    docs = await db.log.find({"pain": {"$gt": 0}}).sort("date", 1).to_list(500)
    if not docs:
        return {"hasPain": False, "locations": [], "trend": "clean", "weeklyData": []}
    weekly: dict = {}
    for d in docs:
        w = d.get("week", 0)
        if w not in weekly:
            weekly[w] = []
        weekly[w].append(d.get("pain", 0))
    weekly_data = [
        {"week": w, "avgPain": round(sum(v) / len(v), 1), "count": len(v)}
        for w, v in sorted(weekly.items())
    ]
    if len(weekly_data) >= 2:
        recent = weekly_data[-3:]
        older = weekly_data[:-3]
        recent_avg = sum(d["avgPain"] for d in recent) / len(recent)
        older_avg = sum(d["avgPain"] for d in older) / len(older) if older else recent_avg
        if recent_avg < older_avg * 0.9:
            trend = "decreasing"
        elif recent_avg > older_avg * 1.1:
            trend = "increasing"
        else:
            trend = "stable"
    else:
        trend = "stable"
    pain_by_ex: dict = {}
    for d in docs:
        ex = d.get("exercise", "Unknown")
        pain_by_ex[ex] = pain_by_ex.get(ex, 0) + 1
    top_locations = sorted(pain_by_ex.items(), key=lambda x: x[1], reverse=True)[:5]
    return {
        "hasPain": True,
        "locations": [{"exercise": ex, "count": cnt} for ex, cnt in top_locations],
        "trend": trend,
        "weeklyData": weekly_data[-8:]
    }


@api_router.get("/analytics/compliance")
async def get_compliance_breakdown():
    profile = await db.profile.find_one({})
    current_week = profile.get("currentWeek", 1) if profile else 1
    docs = await db.log.find({"week": {"$gte": max(1, current_week - 7)}}).to_list(1000)
    session_types = ["ME Lower", "ME Upper", "DE Lower", "DE Upper"]
    by_type: dict = {st: set() for st in session_types}
    for d in docs:
        st = d.get("sessionType", "")
        week = d.get("week")
        if week:
            for session_type in session_types:
                if session_type.lower() in st.lower():
                    by_type[session_type].add(week)
    weeks_count = max(len(set(d.get("week") for d in docs if d.get("week"))), 1)
    return [
        {
            "sessionType": st,
            "completed": len(by_type[st]),
            "expected": weeks_count,
            "rate": min(100, round(len(by_type[st]) / weeks_count * 100))
        }
        for st in session_types
    ]


app.include_router(api_router)
app.include_router(program_router)

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
