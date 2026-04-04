from routers.program import program_router, _store as _prog_store, _id as _prog_id
from routers.auth import auth_router, admin_router
from middleware import DEFAULT_USER as _PROG_USER, get_current_user
from models.schemas import (
    IntakeRequest as _IntakeRequest,
    CurrentLifts as _CurrentLifts,
    ChangeTrigger as _ChangeTrigger,
    ChangeScope as _ChangeScope,
    ProgramChange as _ProgramChange,
)
from services.plan_generator import generate_plan as _generate_plan
from fastapi import FastAPI, APIRouter, HTTPException, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pydantic import BaseModel, Field, ConfigDict, BeforeValidator
from typing import List, Optional, Any, Annotated
from datetime import datetime, timezone
import os
import re
import json
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
async def get_profile(userId: str = Depends(get_current_user)):
    doc = await db.profile.find_one({"userId": userId})
    if not doc:
        # Graceful fallback for users who haven't completed onboarding yet
        raise HTTPException(status_code=404, detail="Profile not found")
    return AthleteProfile.from_mongo(doc).model_dump(exclude={"id"})

@api_router.post("/profile")
async def create_profile(profile: AthleteProfileUpdate, userId: str = Depends(get_current_user)):
    existing = await db.profile.find_one({"userId": userId})
    data = {k: v for k, v in profile.model_dump().items() if v is not None}
    data["updatedAt"] = datetime.now(timezone.utc)
    data["userId"] = userId          # always stamp userId
    if existing:
        await db.profile.update_one({"_id": existing["_id"]}, {"$set": data})
        doc = await db.profile.find_one({"_id": existing["_id"]})
    else:
        default = AthleteProfile(**data)
        d = default.to_mongo()
        d["userId"] = userId
        result = await db.profile.insert_one(d)
        doc = await db.profile.find_one({"_id": result.inserted_id})
    return AthleteProfile.from_mongo(doc).model_dump(exclude={"id"})

@api_router.put("/profile")
async def update_profile(profile: AthleteProfileUpdate, userId: str = Depends(get_current_user)):
    existing = await db.profile.find_one({"userId": userId})
    if not existing:
        raise HTTPException(status_code=404, detail="Profile not found")
    data = {k: v for k, v in profile.model_dump().items() if v is not None}
    data["updatedAt"] = datetime.now(timezone.utc)
    data["userId"] = userId          # keep userId stamped
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
        # SI Joint / Pelvis / Sacroiliac — spinal instability pattern
        if "si joint" in inj_lower or "pelvis" in inj_lower or "sacroiliac" in inj_lower or "sacro" in inj_lower:
            keywords.add("si_joint_moderate")
            keywords.add("low_back_moderate")
        # Upper back / thoracic spine
        if "thoracic" in inj_lower or "upper back" in inj_lower or "thorax" in inj_lower:
            keywords.add("upper_back_moderate")
    keywords.discard("")
    return keywords

_EXERCISE_CONTRAINDICATIONS = [
    {"name": "SSB Box Squat",              "contra": ["knee_severe"],                                       "cat": "ME Lower"},
    {"name": "Speed Box Squat",            "contra": ["knee_severe"],                                       "cat": "DE Lower"},
    {"name": "Pause Back Squat",           "contra": ["knee_moderate"],                                     "cat": "ME Lower"},
    {"name": "Belt Squat",                 "contra": [],                                                    "cat": "ME Lower"},
    {"name": "Conventional Deadlift",      "contra": ["low_back_severe", "hamstring_severe", "si_joint_moderate"], "cat": "ME Lower"},
    {"name": "Sumo Deadlift",              "contra": ["hip_moderate", "low_back_severe", "si_joint_moderate"], "cat": "ME Lower"},
    {"name": "Trap Bar Deadlift",          "contra": ["low_back_severe"],                                   "cat": "ME Lower"},
    {"name": "Romanian Deadlift (RDL)",    "contra": ["hamstring_severe", "si_joint_moderate"],             "cat": "ME Lower"},
    {"name": "Good Morning",               "contra": ["low_back_severe", "si_joint_moderate"],              "cat": "ME Lower"},
    {"name": "Block Pull",                 "contra": [],                                                    "cat": "ME Lower"},
    {"name": "Speed Deadlift",             "contra": ["low_back_severe", "si_joint_moderate"],              "cat": "DE Lower"},
    {"name": "Leg Press",                  "contra": ["knee_moderate"],                                     "cat": "Accessory"},
    {"name": "Glute-Ham Raise (GHR)",      "contra": ["knee_severe", "hamstring_severe"],                   "cat": "Accessory"},
    {"name": "Lying Leg Curl",             "contra": ["hamstring_severe"],                                  "cat": "Accessory"},
    {"name": "Standing Leg Curl",          "contra": ["hamstring_severe"],                                  "cat": "Accessory"},
    {"name": "Floor Press",                "contra": ["shoulder_severe"],                                   "cat": "ME Upper"},
    {"name": "Close-Grip Bench Press",     "contra": ["shoulder_moderate", "elbow_severe"],                 "cat": "ME Upper"},
    {"name": "JM Press",                   "contra": ["elbow_severe"],                                     "cat": "ME Upper"},
    {"name": "Speed Bench Press",          "contra": ["shoulder_severe"],                                   "cat": "DE Upper"},
    {"name": "Overhead Press (Barbell)",   "contra": ["shoulder_severe"],                                   "cat": "ME Upper"},
    {"name": "Log Clean and Press",        "contra": ["shoulder_severe", "elbow_severe"],                   "cat": "ME Upper / Strongman"},
    {"name": "Axle Press",                 "contra": ["shoulder_severe", "wrist_severe"],                   "cat": "ME Upper / Strongman"},
    {"name": "Pendlay Row",                "contra": ["low_back_severe", "si_joint_moderate"],              "cat": "Supplemental"},
    {"name": "Lat Pulldown",               "contra": ["shoulder_severe"],                                   "cat": "Supplemental"},
    {"name": "Ab Wheel Rollout",           "contra": ["low_back_severe", "si_joint_moderate"],              "cat": "Accessory"},
    {"name": "Tricep Pushdown",            "contra": ["elbow_severe"],                                      "cat": "Accessory"},
    {"name": "Skull Crusher / EZ Bar",     "contra": ["elbow_severe"],                                      "cat": "Accessory"},
    {"name": "Tate Press",                 "contra": ["elbow_severe"],                                      "cat": "Accessory"},
    {"name": "Farmer Carry",               "contra": ["wrist_severe"],                                      "cat": "GPP / Strongman"},
    {"name": "Zercher Carry",              "contra": ["elbow_severe", "low_back_severe"],                   "cat": "GPP / Strongman"},
    {"name": "Yoke Carry",                 "contra": ["low_back_severe"],                                   "cat": "GPP / Strongman"},
    {"name": "Stone to Shoulder",          "contra": ["low_back_severe", "shoulder_severe", "hip_moderate"],"cat": "Strongman"},
    {"name": "Keg Toss",                   "contra": ["shoulder_severe", "low_back_severe"],                "cat": "Strongman"},
]

@api_router.post("/plan/injury-preview")
async def injury_preview(body: dict, userId: str = Depends(get_current_user)):
    """Preview how changing injury flags would affect the training program."""
    new_injuries = body.get("newInjuryFlags", [])
    # Scope to current user only — never fall back to default user's injuries
    profile = await db.profile.find_one({"userId": userId})
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
async def apply_injury_update(body: dict, userId: str = Depends(get_current_user)):
    """
    Save accepted injury flag changes to profile AND physically swap restricted exercises
    in the current block, then persist to MongoDB so Today/Log tabs reflect changes immediately.
    """
    new_injuries = body.get("newInjuryFlags", [])

    # ── 1. Fetch profile (scoped to userId — never inherit default user) ─────────
    profile = await db.profile.find_one({"userId": userId})
    if not profile:
        raise HTTPException(404, "Profile not found for this user")

    old_injuries = profile.get("injuryFlags", [])
    added   = [i for i in new_injuries   if i not in old_injuries]
    removed = [i for i in old_injuries   if i not in new_injuries]
    now     = datetime.now(timezone.utc)
    current_week = profile.get("currentWeek", 1)

    # ── 2. Update profile ─────────────────────────────────────────────────────
    await db.profile.update_one(
        {"_id": profile["_id"]},
        {"$set": {"injuryFlags": new_injuries, "updatedAt": now}}
    )

    # ── 3. Swap exercises in current block for newly-added injuries ───────────
    changes_by_category: dict = {"main": [], "supplemental": [], "accessory": [], "prehab": []}
    total_swapped = 0
    plan = None

    if added:
        plan_available = await _ensure_plan_loaded(userId)
        if plan_available:
            plan = _prog_store["plans"].get(userId)
            if plan:
                current_block = _find_current_block(plan, current_week)
                if current_block:
                    prehab_added: set = set()

                    for inj_flag in added:
                        injury_type = _detect_injury_type(inj_flag)
                        injury_cfg  = _INJURY_MAP.get(injury_type) if injury_type else None
                        if not injury_cfg:
                            logger.warning(f"No injury config found for: {inj_flag} (type={injury_type})")
                            continue

                        for week_obj in current_block.weeks:
                            for session in week_obj.sessions:
                                for ex in list(session.exercises):
                                    ex_lower = ex.name.lower()
                                    cat = ex.category.value if hasattr(ex.category, "value") else str(ex.category)

                                    restrict = injury_cfg.get("restrict_keywords", [])
                                    if not any(rk in ex_lower for rk in restrict):
                                        continue

                                    new_name, swap_reason = None, ""
                                    if cat == "main":
                                        pair = injury_cfg.get("main_swap")
                                        if pair:
                                            new_name, swap_reason = pair
                                    elif cat == "supplemental":
                                        for kw, (r, rs) in injury_cfg.get("supplemental_swaps", {}).items():
                                            if kw in ex_lower:
                                                new_name, swap_reason = r, rs
                                                break
                                    elif cat == "accessory":
                                        for kw, (r, rs) in injury_cfg.get("accessory_swaps", {}).items():
                                            if kw in ex_lower:
                                                new_name, swap_reason = r, rs
                                                break

                                    if new_name and new_name.lower() != ex_lower:
                                        old_name = ex.name
                                        ex.name = new_name
                                        ex.adjustedFrom = old_name
                                        ex.adjustmentReason = swap_reason
                                        ex.notes = f"Injury ({inj_flag}): {swap_reason}"
                                        dest = cat if cat in changes_by_category else "accessory"
                                        changes_by_category[dest].append({
                                            "from": old_name, "to": new_name, "reason": swap_reason,
                                            "session": session.sessionType.value if hasattr(session.sessionType, "value") else str(session.sessionType),
                                            "week": week_obj.weekNumber,
                                        })
                                        total_swapped += 1
                                        logger.info(f"[InjuryUpdate] Swapped '{old_name}' → '{new_name}' ({swap_reason})")

                                # ── Add prehab exercises (once per week, injury-matched session) ──
                                if injury_cfg:
                                    stype = session.sessionType.value if hasattr(session.sessionType, "value") else str(session.sessionType)
                                    stype_lower = stype.lower()
                                    injury_is_lower = injury_type in ("si joint", "lower back", "knee")
                                    injury_is_upper = injury_type in ("bicep", "shoulder")
                                    is_lower = "lower" in stype_lower
                                    is_upper = "upper" in stype_lower
                                    relevant = (
                                        (injury_is_lower and is_lower) or
                                        (injury_is_upper and is_upper) or
                                        (not injury_is_lower and not injury_is_upper)
                                    )
                                    prehab_key = f"{week_obj.weekNumber}_{inj_flag}"
                                    if relevant and prehab_key not in prehab_added:
                                        from models.schemas import SessionExercise as SE, ExerciseCategory as EC, TargetSet as TS
                                        import re as _re2
                                        for i, pb in enumerate(injury_cfg.get("prehab_to_add", [])):
                                            if not any(pb["name"].lower() in e.name.lower() for e in session.exercises):
                                                sets_str  = pb["prescription"].split("x")[0] if "x" in pb["prescription"] else "3"
                                                reps_str  = pb["prescription"].split("x")[-1].strip() if "x" in pb["prescription"] else "15"
                                                reps_clean = _re2.sub(r'[^0-9]', '', reps_str) or "15"
                                                sets_clean = _re2.sub(r'[^0-9]', '', sets_str) or "3"
                                                pb_ex = SE(
                                                    sessionExerciseId=_prog_id(), name=pb["name"],
                                                    category=EC.PREHAB, prescription=pb["prescription"],
                                                    notes=pb["notes"], order=len(session.exercises) + i + 1,
                                                    targetSets=[TS(setNumber=j+1, targetReps=reps_clean, setType="work") for j in range(int(sets_clean))],
                                                )
                                                session.exercises.append(pb_ex)
                                                changes_by_category["prehab"].append({
                                                    "from": "(none)", "to": pb["name"], "reason": pb["notes"],
                                                    "session": stype, "week": week_obj.weekNumber,
                                                })
                                                total_swapped += 1
                                        prehab_added.add(prehab_key)

    # ── 4. Persist updated plan to MongoDB so Today/Log tabs reflect changes ──
    if plan and total_swapped > 0:
        await _save_plan_to_db(plan, userId)
        logger.info(f"[InjuryUpdate] Saved {total_swapped} exercise changes for user {userId}")

    # ── 5. Log to substitutions changelog ─────────────────────────────────────
    all_changes = [ch for lst in changes_by_category.values() for ch in lst]
    if all_changes:
        for ch in all_changes:
            await db.substitutions.insert_one({
                "userId": userId,
                "timestamp": now, "date": now.strftime("%Y-%m-%d"),
                "week": current_week, "day": "Settings — Injury Update",
                "sessionType": ch.get("session", "Program Update"),
                "originalExercise": ch["from"], "replacementExercise": ch["to"],
                "reason": ch["reason"],
            })
    else:
        reason_parts = []
        if added:   reason_parts.append(f"Added: {', '.join(added)}")
        if removed: reason_parts.append(f"Resolved: {', '.join(removed)}")
        await db.substitutions.insert_one({
            "userId": userId,
            "timestamp": now, "date": now.strftime("%Y-%m-%d"),
            "week": current_week, "day": "Settings — Injury Update",
            "sessionType": "Profile Update",
            "originalExercise": f"Injury Flags: {', '.join(old_injuries) or 'None'}",
            "replacementExercise": f"Injury Flags: {', '.join(new_injuries) or 'None'}",
            "reason": "User accepted injury update. " + ". ".join(reason_parts),
        })

    # ── 6. Build response summary ──────────────────────────────────────────────
    n_main = len(changes_by_category["main"])
    n_supp = len(changes_by_category["supplemental"])
    n_acc  = len(changes_by_category["accessory"])
    n_pre  = len(changes_by_category["prehab"])
    parts  = []
    if n_main: parts.append(f"{n_main} main lift{'s' if n_main>1 else ''} updated")
    if n_supp: parts.append(f"{n_supp} supplemental updated")
    if n_acc:  parts.append(f"{n_acc} accessory updated")
    if n_pre:  parts.append(f"{n_pre} prehab exercise{'s' if n_pre>1 else ''} added")

    msg = f"Program updated: {', '.join(parts)}." if parts else "Injury flags saved. Check back next session for adjusted exercises."

    return {
        "success":             True,
        "message":             msg,
        "added":               added,
        "removed":             removed,
        "exercises_swapped":   total_swapped,
        "changes_by_category": changes_by_category,
        "changes":             all_changes,
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

# ── Pain Report Models & Endpoints ───────────────────────────────────────────

class PainReportCreate(BaseModel):
    exerciseName: str = ""
    bodyRegion: str = ""
    painType: str = ""   # sharp | dull | ache | burning
    intensity: int = 0   # 1–10
    timing: str = "during"  # during | after | both
    sessionType: str = ""
    notes: str = ""


@api_router.post("/pain-report")
async def create_pain_report(body: PainReportCreate, userId: str = Depends(get_current_user)):
    """Log a pain report tied to a specific exercise, scoped to user."""
    profile = await db.profile.find_one({"userId": userId})
    week = profile.get("currentWeek", 1) if profile else 1
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y-%m-%d")

    # Pattern detection: same region 3+ times in last 7 days → flag
    from datetime import timedelta
    seven_days_ago = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    same_region_count = await db.pain_reports.count_documents({
        "userId": userId,
        "bodyRegion": body.bodyRegion,
        "date": {"$gte": seven_days_ago},
    })
    flagged = same_region_count >= 2  # third occurrence triggers flag

    doc = {
        "userId": userId,
        "exerciseName": body.exerciseName,
        "bodyRegion": body.bodyRegion,
        "painType": body.painType,
        "intensity": body.intensity,
        "timing": body.timing,
        "sessionType": body.sessionType,
        "notes": body.notes,
        "date": date_str,
        "week": week,
        "flagged": flagged,
        "createdAt": now,
    }
    result = await db.pain_reports.insert_one(doc)
    logger.info(f"[PainReport] User {userId}: {body.bodyRegion} {body.intensity}/10 during {body.exerciseName}")

    alert_message = None
    if flagged:
        alert_message = f"Pattern Alert: {body.bodyRegion} pain reported {same_region_count + 1}x in 7 days. Your coach has been flagged."

    return {
        "success": True,
        "id": str(result.inserted_id),
        "flagged": flagged,
        "alertMessage": alert_message,
    }


@api_router.get("/pain-report")
async def get_pain_reports(days: int = 30, userId: str = Depends(get_current_user)):
    """Get recent pain reports for the user with pattern flags."""
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=days)).strftime("%Y-%m-%d")
    docs = await db.pain_reports.find({
        "userId": userId,
        "date": {"$gte": since},
    }).sort("createdAt", -1).limit(50).to_list(50)

    # Detect regions with 3+ reports in last 7 days
    seven_days_ago = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    recent_docs = [d for d in docs if d.get("date", "") >= seven_days_ago]
    region_counts: dict = {}
    for d in recent_docs:
        r = d.get("bodyRegion", "")
        if r:
            region_counts[r] = region_counts.get(r, 0) + 1
    flagged_regions = [r for r, c in region_counts.items() if c >= 3]

    reports = [{
        "id": str(d["_id"]),
        "exerciseName": d.get("exerciseName", ""),
        "bodyRegion": d.get("bodyRegion", ""),
        "painType": d.get("painType", ""),
        "intensity": d.get("intensity", 0),
        "timing": d.get("timing", ""),
        "date": d.get("date", ""),
        "week": d.get("week", 1),
        "flagged": d.get("flagged", False),
    } for d in docs]

    return {
        "reports": reports,
        "flaggedRegions": flagged_regions,
        "hasPainAlerts": len(flagged_regions) > 0,
    }


# ── Readiness Check Models & Endpoints ───────────────────────────────────────

class ReadinessCreate(BaseModel):
    sleepQuality: int   # 1–5 (1=poor, 5=great)
    soreness: int       # 1–5 (1=very sore, 5=fresh)
    moodEnergy: int     # 1–5 (1=low, 5=high)


@api_router.post("/readiness")
async def create_readiness(body: ReadinessCreate, userId: str = Depends(get_current_user)):
    """Save pre-session readiness check and return auto-adjustment recommendation."""
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y-%m-%d")

    # Score: average of three 1-5 metrics (higher = better readiness)
    total_score = (body.sleepQuality + body.soreness + body.moodEnergy) / 3.0

    # Determine adjustment
    adjustment_applied = False
    adjustment_note = ""
    recommendation = "normal"
    if total_score < 2.5:
        adjustment_applied = True
        adjustment_note = (
            f"Low readiness ({total_score:.1f}/5) — Reduce work set loads by 15% today. "
            "Focus on movement quality. Consider dropping one accessory block."
        )
        recommendation = "easy"
    elif total_score < 3.5:
        adjustment_applied = True
        adjustment_note = (
            f"Moderate readiness ({total_score:.1f}/5) — Reduce work set loads by 10% today. "
            "Extend warm-up by 5 minutes. Full session is on the menu."
        )
        recommendation = "moderate"
    else:
        adjustment_note = f"Good readiness ({total_score:.1f}/5) — Full training intensity. Go get it."

    doc = {
        "userId": userId,
        "date": date_str,
        "sleepQuality": body.sleepQuality,
        "soreness": body.soreness,
        "moodEnergy": body.moodEnergy,
        "totalScore": round(total_score, 2),
        "adjustmentApplied": adjustment_applied,
        "adjustmentNote": adjustment_note,
        "createdAt": now,
    }
    result = await db.readiness_checks.insert_one(doc)
    logger.info(f"[Readiness] User {userId}: score {total_score:.1f}/5 → {recommendation}")

    return {
        "id": str(result.inserted_id),
        "readinessScore": round(total_score, 2),
        "adjustmentApplied": adjustment_applied,
        "adjustmentNote": adjustment_note,
        "recommendation": recommendation,
    }


@api_router.get("/readiness/today")
async def get_today_readiness(userId: str = Depends(get_current_user)):
    """Check if user has done a readiness check today."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    doc = await db.readiness_checks.find_one({"userId": userId, "date": today})
    if not doc:
        return {"hasCheckedIn": False, "readiness": None}
    return {
        "hasCheckedIn": True,
        "readiness": {
            "sleepQuality": doc.get("sleepQuality"),
            "soreness": doc.get("soreness"),
            "moodEnergy": doc.get("moodEnergy"),
            "totalScore": doc.get("totalScore"),
            "adjustmentApplied": doc.get("adjustmentApplied"),
            "adjustmentNote": doc.get("adjustmentNote"),
        },
    }


# ── Session Rating Models & Endpoints ────────────────────────────────────────

class SessionRatingCreate(BaseModel):
    sessionType: str = ""
    week: int = 1
    rpe: float
    notes: str = ""
    setsLogged: int = 0
    totalSets: int = 0


def _get_fallback_insight(rpe: float, completion_pct: float, session_type: str) -> str:
    """Fallback insight if AI call fails."""
    if rpe >= 9:
        return f"RPE {rpe}/10 — near-maximal effort today. Prioritize recovery tonight: protein within 30 min, 8+ hours sleep. This push deposits in the next block."
    elif rpe >= 7:
        return f"RPE {rpe}/10 with {completion_pct:.0f}% completion — solid stimulus delivered. Recovery starts now. Protein, water, sleep."
    else:
        return f"RPE {rpe}/10 — energy in reserve. If this was a deload, perfect execution. Otherwise push 0.5-1 RPE harder next {session_type} session."


@api_router.post("/session-rating")
async def create_session_rating(body: SessionRatingCreate, userId: str = Depends(get_current_user)):
    """Save post-session RPE and generate a brief AI insight."""
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y-%m-%d")
    completion_pct = round(body.setsLogged / body.totalSets * 100) if body.totalSets > 0 else 0

    # Pull last 3 same-type sessions for trend context
    prev_ratings = await db.session_ratings.find({
        "userId": userId, "sessionType": body.sessionType,
    }).sort("createdAt", -1).limit(3).to_list(3)
    avg_recent_rpe = sum(r.get("rpe", 7) for r in prev_ratings) / len(prev_ratings) if prev_ratings else body.rpe

    ai_insight = ""
    if _openai_client:
        try:
            rpe_trend = "up" if body.rpe > avg_recent_rpe + 0.5 else "down" if body.rpe < avg_recent_rpe - 0.5 else "stable"
            ctx = (
                f"Session: {body.sessionType}, Week {body.week}. "
                f"RPE: {body.rpe}/10 (trend: {rpe_trend} vs avg {avg_recent_rpe:.1f}). "
                f"Completion: {completion_pct}%. Sets: {body.setsLogged}/{body.totalSets}."
            )
            if body.notes:
                ctx += f" Athlete note: {body.notes}"

            emergent_key = os.environ.get('EMERGENT_LLM_KEY', '')
            import uuid as _uuid_mod
            chat_id = str(_uuid_mod.uuid4())
            from emergentintegrations.llm.chat import LlmChat as _LC, UserMessage as _UM
            insight_chat = _LC(
                api_key=emergent_key,
                session_id=chat_id,
                system_message=(
                    "You are a strength coach. Give 1-2 sentences of post-session insight based on the data. "
                    "Be specific and actionable. Focus on recovery, readiness, or a performance signal. "
                    "No filler phrases. Max 60 words."
                )
            ).with_model("anthropic", "claude-sonnet-4-5-20250929")
            raw_insight = await insight_chat.send_message(_UM(text=ctx))
            ai_insight = raw_insight.strip()[:400]
        except Exception as e:
            logger.warning(f"[SessionRating] AI insight failed: {e}")
            ai_insight = _get_fallback_insight(body.rpe, completion_pct, body.sessionType)
    else:
        ai_insight = _get_fallback_insight(body.rpe, completion_pct, body.sessionType)

    doc = {
        "userId": userId,
        "sessionType": body.sessionType,
        "week": body.week,
        "date": date_str,
        "rpe": body.rpe,
        "notes": body.notes,
        "aiInsight": ai_insight,
        "setsLogged": body.setsLogged,
        "totalSets": body.totalSets,
        "completionPct": completion_pct,
        "createdAt": now,
    }
    result = await db.session_ratings.insert_one(doc)
    logger.info(f"[SessionRating] User {userId}: RPE {body.rpe} — {session_type if (session_type := body.sessionType) else 'session'}")

    return {
        "id": str(result.inserted_id),
        "aiInsight": ai_insight,
        "rpe": body.rpe,
        "completionPct": completion_pct,
    }


@api_router.get("/session-rating/latest")
async def get_latest_session_rating(userId: str = Depends(get_current_user)):
    """Get the most recent session rating for the user."""
    doc = await db.session_ratings.find_one({"userId": userId}, sort=[("createdAt", -1)])
    if not doc:
        return {"hasRating": False, "rating": None}
    return {
        "hasRating": True,
        "rating": {
            "id": str(doc["_id"]),
            "sessionType": doc.get("sessionType"),
            "week": doc.get("week"),
            "date": doc.get("date"),
            "rpe": doc.get("rpe"),
            "aiInsight": doc.get("aiInsight"),
            "completionPct": doc.get("completionPct"),
        },
    }


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
    # Pre-load plan from MongoDB into memory so all plan endpoints work immediately
    await _ensure_plan_loaded()
    logger.info("Startup complete — plan preloaded.")

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
async def coach_chat(request: CoachRequest, userId: str = Depends(get_current_user)):
    if not _openai_client or not _supabase_client:
        raise HTTPException(status_code=503, detail="Coach service not ready yet")

    # ── 1. Athlete profile (userId-scoped) ────────────────────────────────────
    profile_doc = await db.profile.find_one({"userId": userId})
    profile_text = "Athlete profile not yet set up."
    if profile_doc:
        name = profile_doc.get('name', '') or 'Athlete'
        exp  = profile_doc.get('experience', '') or 'Unknown'
        bw   = profile_doc.get('currentBodyweight', 0)
        bw_str = f"{bw} lbs" if bw and bw > 0 else "Not provided"
        injuries  = profile_doc.get('injuryFlags', [])
        weaknesses = profile_doc.get('weaknesses', []) or profile_doc.get('primaryWeaknesses', [])
        avoid = profile_doc.get('avoidMovements', [])
        goal  = profile_doc.get('goal', 'strength')
        sleep_hrs = profile_doc.get('sleepHours', 7.0)
        profile_text = (
            f"Name: {name} | Experience: {exp} | BW: {bw_str} | Goal: {goal}\n"
            f"Week: {profile_doc.get('currentWeek', 1)} | Sleep: {sleep_hrs}h avg\n"
            f"Injuries: {', '.join(injuries) if injuries else 'None'}\n"
            f"Weaknesses: {', '.join(weaknesses) if weaknesses else 'None'}\n"
            f"Avoid: {', '.join(avoid) if avoid else 'None'}"
        )

    # ── 2. Recent training log (userId-scoped) ────────────────────────────────
    log_docs = await db.log.find({"userId": userId}).sort("date", -1).limit(5).to_list(5)
    if not log_docs:
        log_docs = await db.log.find({}).sort("date", -1).limit(5).to_list(5)
    recent_log = "No recent sessions logged."
    if log_docs:
        lines = [
            f"- {d.get('date')} | {d.get('sessionType','?')} | {d.get('exercise')} {d.get('sets')}×{d.get('reps')} @{d.get('weight')}lbs RPE{d.get('rpe')}"
            for d in log_docs
        ]
        recent_log = "\n".join(lines)

    # ── 3. Training week / block / phase ──────────────────────────────────────
    week = profile_doc.get('currentWeek', 1) if profile_doc else 1
    block = 1 if week <= 4 else 2 if week <= 8 else 3 if week <= 12 else 4 if week <= 20 else 5 if week <= 32 else 6 if week <= 44 else 7
    deload_weeks = [4,8,12,20,24,28,32,36,40,44,48,52]
    phase = "Deload" if week in deload_weeks else (["Intro","Build","Peak"][(week - max([0]+[dw for dw in deload_weeks if dw < week]) - 1) % 3])

    # ── 4. Today's readiness check (if done) ─────────────────────────────────
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    readiness_doc = await db.readiness_checks.find_one({"userId": userId, "date": today_str})
    readiness_context = ""
    if readiness_doc:
        rs = readiness_doc
        readiness_context = (
            f"Today's readiness — Sleep: {rs.get('sleepQuality')}/5, "
            f"Soreness: {rs.get('soreness')}/5, Energy: {rs.get('moodEnergy')}/5 "
            f"→ Score: {rs.get('totalScore', 0):.1f}/5"
        )
        if rs.get('adjustmentApplied'):
            readiness_context += f"\nAdjustment: {rs.get('adjustmentNote', '')}"

    # ── 5. Recent pain reports (last 14 days, max 5) ──────────────────────────
    from datetime import timedelta
    fourteen_days_ago = (datetime.now(timezone.utc) - timedelta(days=14)).strftime("%Y-%m-%d")
    pain_docs = await db.pain_reports.find({
        "userId": userId,
        "date": {"$gte": fourteen_days_ago},
    }).sort("createdAt", -1).limit(5).to_list(5)

    pain_context = ""
    if pain_docs:
        pain_lines = [
            f"- {d.get('date')}: {d.get('bodyRegion')} ({d.get('painType')}, {d.get('intensity')}/10) during {d.get('exerciseName')}"
            for d in pain_docs
        ]
        pain_context = "Recent pain log:\n" + "\n".join(pain_lines)
        # Check for flagged patterns
        region_counts: dict = {}
        for d in pain_docs:
            r = d.get("bodyRegion", "")
            region_counts[r] = region_counts.get(r, 0) + 1
        flagged = [r for r, c in region_counts.items() if c >= 3]
        if flagged:
            pain_context += f"\n⚠ PATTERN: {', '.join(flagged)} reported 3+ times — prioritise rehab/coach review."

    # ── 6. Last 3 session RPE ratings ─────────────────────────────────────────
    rating_docs = await db.session_ratings.find({"userId": userId}).sort("createdAt", -1).limit(3).to_list(3)
    rating_context = ""
    if rating_docs:
        r_lines = [f"- {d.get('date')}: {d.get('sessionType')} RPE {d.get('rpe')}/10, {d.get('completionPct', 0):.0f}% completion" for d in rating_docs]
        rating_context = "Recent session ratings:\n" + "\n".join(r_lines)

    # ── 7. RAG: retrieve relevant passages ────────────────────────────────────
    embedding_response = await _openai_client.embeddings.create(
        model='text-embedding-3-small',
        input=request.message,
        dimensions=512
    )
    embedding = embedding_response.data[0].embedding

    retrieved_passages = ""
    sources = []
    try:
        rag_result = _supabase_client.rpc(
            'match_documents',
            {'query_embedding': embedding, 'match_threshold': 0.3, 'match_count': 4}
        ).execute()
        if rag_result.data:
            passage_lines = []
            for i, chunk in enumerate(rag_result.data):
                source  = chunk.get('metadata', {}).get('source', 'Coaching Library')
                content = chunk.get('content', '')[:300]  # cap each passage to save tokens
                passage_lines.append(f"[{i+1}] {content}")
                sources.append({"title": source, "page": "", "preview": content[:120]})
            retrieved_passages = "\n\n".join(passage_lines)
    except Exception as e:
        logger.warning(f"Supabase query failed: {e}")
        retrieved_passages = ""

    # ── 8. Build enhanced system prompt (target < 3500 tokens) ───────────────
    coaching_intelligence = ""
    if readiness_context:
        coaching_intelligence += f"\n\nREADINESS:\n{readiness_context}"
    if pain_context:
        coaching_intelligence += f"\n\nPAIN HISTORY:\n{pain_context}"
    if rating_context:
        coaching_intelligence += f"\n\nSESSION RATINGS:\n{rating_context}"

    rag_section = f"\n\nCOACHING LIBRARY EXCERPTS:\n{retrieved_passages}" if retrieved_passages else ""

    system_prompt = (
        "You are an expert strength coach specialising in powerlifting, strongman, injury management, and recovery. "
        "You coach a specific athlete. Always respect their injuries — never recommend anything that conflicts with flagged areas. "
        "Conflict priority: injury safety > deload > readiness > general coaching.\n\n"
        "RESPONSE RULES:\n"
        "- No citation numbers ([1], [2]) or source lists.\n"
        "- Use clean headers (##), bullets, and bold for readability.\n"
        "- Be specific, practical, and direct. This is an advanced athlete.\n"
        "- Keep responses concise — 150–300 words unless a full programme is requested.\n\n"
        "PROGRAM CHANGE DETECTION:\n"
        "If recommending a concrete exercise swap or load change, append this EXACTLY at end:\n"
        "<PROGRAM_CHANGE>"
        '{"type":"exercise_swap","exercises":[{"original":"exact name","replacement":"exact name","reason":"short"}],'
        '"summary":"one sentence","details":"explanation"}'
        "</PROGRAM_CHANGE>\n"
        "Only include for exercise swaps/load changes. NOT for sleep, nutrition, or general advice.\n\n"
        f"ATHLETE PROFILE:\n{profile_text}\n\n"
        f"TRAINING CONTEXT:\nWeek {week} | Block {block} | {phase} Phase"
        f"\n\nRECENT SESSIONS:\n{recent_log}"
        f"{coaching_intelligence}"
        f"{rag_section}"
    )

    # ── 9. Build chat with last 5 messages only (token budget) ───────────────
    emergent_key = os.environ.get('EMERGENT_LLM_KEY', '')
    session_id   = str(uuid.uuid4())
    chat = LlmChat(
        api_key=emergent_key,
        session_id=session_id,
        system_message=system_prompt
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    # Only send last 5 history messages to save tokens
    limited_history = request.conversation_history[-5:] if len(request.conversation_history) > 5 else request.conversation_history
    for msg in limited_history:
        if msg.role == "user":
            await chat.send_message(UserMessage(text=msg.content))

    response_text = await chat.send_message(UserMessage(text=request.message))

    # ── 10. Parse <PROGRAM_CHANGE> block ──────────────────────────────────────
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

    # ── 11. Persist conversation to MongoDB (userId-scoped) ───────────────────
    now = datetime.now(timezone.utc)
    conversation_id = request.conversation_id
    user_msg_doc = {"role": "user", "content": request.message, "timestamp": now.isoformat()}
    assistant_msg_doc = {
        "role": "assistant", "content": clean_response, "timestamp": now.isoformat(),
        "hasProgramChange": has_program_change, "programChange": program_change,
    }

    if conversation_id:
        try:
            conv_oid = ObjectId(conversation_id)
            await db.conversations.update_one(
                {"_id": conv_oid, "userId": userId},
                {"$push": {"messages": {"$each": [user_msg_doc, assistant_msg_doc]}},
                 "$set": {"updatedAt": now, "hasProgramChange": has_program_change}}
            )
        except Exception:
            conversation_id = None

    if not conversation_id:
        title = request.message[:60] + ("..." if len(request.message) > 60 else "")
        conv_doc = {
            "userId": userId,
            "title": title,
            "messages": [user_msg_doc, assistant_msg_doc],
            "hasProgramChange": has_program_change,
            "createdAt": now, "updatedAt": now,
        }
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
async def get_conversations(userId: str = Depends(get_current_user)):
    """Get all conversations for the current user, newest first."""
    docs = await db.conversations.find({"userId": userId}).sort("updatedAt", -1).limit(50).to_list(50)
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


async def _save_plan_to_db(plan, uid: str = None) -> None:
    """Persist the in-memory plan to MongoDB so it survives server restarts."""
    user_id = uid or (plan.userId if hasattr(plan, 'userId') else _PROG_USER)
    try:
        from models.schemas import AnnualPlan as _AnnualPlan  # local import to avoid circular
        plan_dict = plan.model_dump(mode='json')
        plan_dict['_saved_at'] = datetime.utcnow().isoformat()
        await db.saved_plans.replace_one(
            {"userId": user_id},
            plan_dict,
            upsert=True,
        )
        logger.info(f"Plan persisted to MongoDB saved_plans for user: {user_id}")
    except Exception as e:
        logger.warning(f"Failed to persist plan to MongoDB: {e}")


async def _ensure_plan_loaded(uid: str = None) -> bool:
    """Load plan from MongoDB (saved_plans first, then regenerate) if not in memory."""
    user_id = uid or _PROG_USER
    if _prog_store["plans"].get(user_id):
        return True

    # ── 1. Try loading the previously saved/modified plan from MongoDB ─────────
    try:
        from models.schemas import AnnualPlan as _AnnualPlan
        saved = await db.saved_plans.find_one({"userId": user_id})
        if saved:
            saved.pop("_id", None)
            saved.pop("_saved_at", None)
            plan = _AnnualPlan.model_validate(saved)
            _prog_store["plans"][user_id] = plan
            logger.info(f"Plan loaded from MongoDB saved_plans: {plan.planName}")
            return True
    except Exception as e:
        logger.warning(f"Could not load saved plan from MongoDB: {e}")

    # ── 2. Fall back: regenerate from profile data ─────────────────────────────
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
        plan.userId = user_id
        _prog_store["plans"][user_id] = plan
        # Immediately persist so future restarts don't have to regenerate
        await _save_plan_to_db(plan, user_id)
        logger.info(f"Plan regenerated and saved for user: {plan.planName}")
        return True
    except Exception as e:
        logger.warning(f"Plan regeneration failed: {e}")
        return False


class ApplyRecommendationRequest(BaseModel):
    conversation_id: str
    summary: str
    details: str = ""
    exercises: List[dict] = []  # [{original, replacement, reason}]


# ── Injury → Exercise Restriction Map ────────────────────────────────────────
_INJURY_MAP = {
    "bicep": {
        "restrict_keywords": [
            "barbell curl", "ez-bar curl", "ez curl", "dumbbell curl",
            "chin-up", "chin up", "supinated row", "underhand row",
            "preacher curl", "incline curl", "hammer curl",
        ],
        "main_swap":         ("Neutral Grip Pull-Down",            "reduces bicep tendon load"),
        "supplemental_swaps": {
            "chin-up":        ("Lat Pull-Down (Neutral Grip)",     "removes bicep peak load"),
            "chin up":        ("Lat Pull-Down (Neutral Grip)",     "removes bicep peak load"),
            "supinated row":  ("Pronated Grip Row",                "removes supination stress"),
            "underhand row":  ("Pronated Grip Row",                "removes supination stress"),
        },
        "accessory_swaps": {
            "barbell curl":   ("Eccentric Hammer Curl @50%",       "eccentric loading for tendon healing"),
            "ez-bar curl":    ("Reverse Curl @50%",                "reduces bicep tendon stress"),
            "ez curl":        ("Reverse Curl @50%",                "reduces bicep tendon stress"),
            "dumbbell curl":  ("Eccentric Hammer Curl @50%",       "eccentric loading for tendon healing"),
            "preacher curl":  ("Eccentric Reverse Curl",           "controlled eccentric for tendon"),
            "incline curl":   ("Wrist Roller Eccentric",           "forearm/tendon rehab"),
            "hammer curl":    ("Eccentric Hammer Curl @50%",       "eccentric loading for tendon healing"),
        },
        "prehab_to_add": [
            {"name": "Band Bicep Curl (Eccentric Focus)", "prescription": "3x15", "notes": "Slow 4-sec lowering, tendon prehab"},
            {"name": "Reverse Wrist Curl",               "prescription": "3x20", "notes": "Forearm/tendon health, light weight"},
        ],
    },
    "shoulder": {
        "restrict_keywords": [
            "overhead press", "military press", "push press", "z-press",
            "behind the neck", "upright row", "wide-grip bench", "wide grip bench",
        ],
        "main_swap":         ("Landmine Press",                    "reduces shoulder impingement"),
        "supplemental_swaps": {
            "overhead press": ("Landmine Press",                   "eliminates overhead impingement"),
            "military press": ("Landmine Press",                   "eliminates overhead impingement"),
            "push press":     ("Dumbbell Push Press (Neutral)",    "neutral grip reduces impingement"),
            "z-press":        ("Seated Dumbbell Press",            "controlled shoulder-safe press"),
            "upright row":    ("Face Pull",                        "removes impingement pattern"),
        },
        "accessory_swaps": {
            "behind the neck": ("Face Pull",                       "posterior shoulder health"),
            "wide-grip bench": ("Close Grip Bench Press",          "reduces shoulder stress"),
            "wide grip bench": ("Close Grip Bench Press",          "reduces shoulder stress"),
        },
        "prehab_to_add": [
            {"name": "Band External Rotation",  "prescription": "3x20", "notes": "Rotator cuff health"},
            {"name": "Face Pull",               "prescription": "4x15", "notes": "Rear delt + external rotation prehab"},
        ],
    },
    "si joint": {
        "restrict_keywords": [
            "conventional deadlift", "sumo deadlift", "good morning",
            "stiff leg", "romanian deadlift", "rdl",
            "deep squat", "below parallel", "back squat",
        ],
        "main_swap":         ("Trap Bar Deadlift",              "neutral stance reduces SI joint torque"),
        "supplemental_swaps": {
            "conventional deadlift": ("Trap Bar Deadlift",      "neutral stance, less rotational force on SI joint"),
            "sumo deadlift":         ("Belt Squat",             "eliminates hip abduction load on SI joint"),
            "romanian deadlift":     ("Nordic Hamstring Curl",  "removes SI joint hinge pattern"),
            "rdl":                   ("Nordic Hamstring Curl",  "removes SI joint hinge pattern"),
            "stiff leg":             ("Nordic Hamstring Curl",  "removes SI joint hinge pattern"),
            "back squat":            ("Box Squat (Above Parallel)", "limits depth, reduces SI joint shear"),
        },
        "accessory_swaps": {
            "good morning":    ("Reverse Hyper",               "decompresses SI joint while training posterior chain"),
            "deep squat":      ("Box Squat (Above Parallel)",  "limits depth to protect SI joint"),
            "below parallel":  ("Box Squat (Above Parallel)",  "limits depth to protect SI joint"),
        },
        "prehab_to_add": [
            {"name": "Dead Bug (Core Stabilization)", "prescription": "3x10 (per side)", "notes": "SI joint stability, neutral pelvis bracing"},
            {"name": "Clamshell (Band)",               "prescription": "3x20 (per side)", "notes": "Glute med activation to reduce SI joint stress"},
        ],
    },
    "lower back": {
        "restrict_keywords": [
            "conventional deadlift", "good morning", "stiff leg",
            "romanian deadlift", "rdl", "back extension", "hyperextension",
        ],
        "main_swap":         ("Trap Bar Deadlift",                 "neutral spine, reduces lumbar stress"),
        "supplemental_swaps": {
            "conventional deadlift": ("Trap Bar Deadlift",         "neutral spine, less lumbar stress"),
            "romanian deadlift":     ("Belt Squat",                "removes spinal compression"),
            "rdl":                   ("Belt Squat",                "removes spinal compression"),
            "stiff leg":             ("Nordic Hamstring Curl",     "reduces lumbar load"),
        },
        "accessory_swaps": {
            "good morning":    ("Reverse Hyper",                   "decompresses lumbar spine"),
            "back extension":  ("Reverse Hyper",                   "decompresses lumbar spine"),
            "hyperextension":  ("McGill Big 3 Circuit",            "spine rehab protocol"),
        },
        "prehab_to_add": [
            {"name": "McGill Bird-Dog", "prescription": "3x10 (per side)", "notes": "Lumbar stability, spine safe"},
            {"name": "Reverse Hyper",  "prescription": "3x15",            "notes": "Lumbar decompression + glute activation"},
        ],
    },
    "knee": {
        "restrict_keywords": [
            "deep squat", "lunge", "leg extension", "full squat",
            "below parallel squat", "olympic squat", "front squat",
        ],
        "main_swap":         ("Box Squat (Above Parallel)",        "reduces knee flexion stress"),
        "supplemental_swaps": {
            "lunge":           ("Reverse Lunge (Short Step)",      "less knee shear than forward lunge"),
            "front squat":     ("Goblet Squat to Box",             "box limits depth for knee safety"),
            "olympic squat":   ("Box Squat (Above Parallel)",      "limits depth for knee protection"),
        },
        "accessory_swaps": {
            "deep squat":      ("Belt Squat",                      "unloads spine and knee"),
            "leg extension":   ("Terminal Knee Extension",         "VMO activation, lower knee stress"),
            "full squat":      ("Box Squat (Above Parallel)",      "limits depth for knee protection"),
        },
        "prehab_to_add": [
            {"name": "Terminal Knee Extension (Band)", "prescription": "3x20", "notes": "VMO + patellar tracking rehab"},
            {"name": "Calf Raise (Eccentric)",         "prescription": "3x15", "notes": "Tendon health, load management"},
        ],
    },
}

_INJURY_ALIAS = {
    "bicep tendonitis": "bicep", "biceps": "bicep", "bicep strain": "bicep",
    "bicep tendon": "bicep", "elbow pain": "bicep", "elbow tendonitis": "bicep",
    "shoulder impingement": "shoulder", "shoulder pain": "shoulder",
    "rotator cuff": "shoulder", "shoulder injury": "shoulder",
    "low back": "lower back", "lumbar": "lower back", "back pain": "lower back",
    "disc herniation": "lower back",
    # SI Joint maps to its own key (has its own injury config)
    "si joint": "si joint", "si joint / pelvis": "si joint",
    "sacroiliac": "si joint", "sacroiliac joint": "si joint", "pelvis": "si joint",
    "knee pain": "knee", "patellar tendonitis": "knee", "patellar": "knee",
    "knee tendonitis": "knee", "it band": "knee", "patella": "knee",
    "sciatica": "lower back",
}


def _detect_injury_type(text: str) -> Optional[str]:
    text_lower = text.lower()
    for alias, injury_type in _INJURY_ALIAS.items():
        if alias in text_lower:
            return injury_type
    for injury_type in _INJURY_MAP:
        if injury_type in text_lower:
            return injury_type
    return None


def _find_current_block(plan, current_week: int):
    from models.schemas import PhaseStatus
    for phase in plan.phases:
        for block in phase.blocks:
            if block.status == PhaseStatus.CURRENT:
                return block
    for phase in plan.phases:
        for block in phase.blocks:
            if block.weeks:
                min_w = min(w.weekNumber for w in block.weeks)
                max_w = max(w.weekNumber for w in block.weeks)
                if min_w <= current_week <= max_w:
                    return block
    if plan.phases and plan.phases[0].blocks:
        return plan.phases[0].blocks[0]
    return None


@api_router.post("/coach/apply-recommendation")
async def apply_recommendation(body: ApplyRecommendationRequest, userId: str = Depends(get_current_user)):
    try:
        conv_oid = ObjectId(body.conversation_id)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid conversation_id format")

    profile = await db.profile.find_one({})
    current_week = profile.get("currentWeek", 1) if profile else 1
    now = datetime.now(timezone.utc)

    plan_available = await _ensure_plan_loaded()

    changes_by_category: dict = {"main": [], "supplemental": [], "accessory": [], "prehab": []}
    total_swapped = 0
    current_block = None

    if plan_available:
        plan = _prog_store["plans"].get(userId)
        if plan:
            current_block = _find_current_block(plan, current_week)
            if current_block:
                full_text    = f"{body.summary} {body.details}".lower()
                injury_type  = _detect_injury_type(full_text)
                injury_cfg   = _INJURY_MAP.get(injury_type) if injury_type else None
                prehab_added: set = set()

                for week_obj in current_block.weeks:
                    for session in week_obj.sessions:
                        for ex in list(session.exercises):
                            ex_lower = ex.name.lower()
                            cat      = ex.category.value if hasattr(ex.category, "value") else str(ex.category)
                            swapped  = False

                            # ── 1. AI-specified explicit swaps ──────────────
                            for swap in body.exercises:
                                orig = (swap.get("original") or "").strip().lower()
                                repl = (swap.get("replacement") or "").strip()
                                rsn  = (swap.get("reason") or body.summary).strip()
                                if not orig or not repl:
                                    continue
                                kws = [orig] + [w for w in orig.split() if len(w) > 3]
                                if any(kw in ex_lower for kw in kws):
                                    old = ex.name
                                    ex.name = repl
                                    ex.adjustedFrom = old
                                    ex.adjustmentReason = rsn
                                    ex.notes = f"Coach: {rsn}" if not ex.notes else f"{ex.notes} | Coach: {rsn}"
                                    dest = cat if cat in changes_by_category else "main"
                                    changes_by_category[dest].append({
                                        "from": old, "to": repl, "reason": rsn,
                                        "session": session.sessionType.value if hasattr(session.sessionType, "value") else str(session.sessionType),
                                        "week": week_obj.weekNumber,
                                    })
                                    total_swapped += 1
                                    swapped = True
                                    break

                            if swapped or not injury_cfg:
                                continue

                            # ── 2. Injury-map swaps by category ─────────────
                            restrict = injury_cfg.get("restrict_keywords", [])
                            if not any(rk in ex_lower for rk in restrict):
                                continue

                            new_name, swap_reason = None, ""
                            if cat == "main":
                                pair = injury_cfg.get("main_swap")
                                if pair:
                                    new_name, swap_reason = pair
                            elif cat == "supplemental":
                                for kw, (r, rs) in injury_cfg.get("supplemental_swaps", {}).items():
                                    if kw in ex_lower:
                                        new_name, swap_reason = r, rs
                                        break
                            elif cat == "accessory":
                                for kw, (r, rs) in injury_cfg.get("accessory_swaps", {}).items():
                                    if kw in ex_lower:
                                        new_name, swap_reason = r, rs
                                        break

                            if new_name and new_name.lower() != ex_lower:
                                old = ex.name
                                ex.name = new_name
                                ex.adjustedFrom = old
                                ex.adjustmentReason = swap_reason
                                ex.notes = f"Coach ({injury_type}): {swap_reason}"
                                dest = cat if cat in changes_by_category else "accessory"
                                changes_by_category[dest].append({
                                    "from": old, "to": new_name, "reason": swap_reason,
                                    "session": session.sessionType.value if hasattr(session.sessionType, "value") else str(session.sessionType),
                                    "week": week_obj.weekNumber,
                                })
                                total_swapped += 1

                        # ── 3. Add prehab (once per week, first relevant session only) ──
                        if injury_cfg:
                            stype = session.sessionType.value if hasattr(session.sessionType, "value") else str(session.sessionType)
                            stype_lower = stype.lower()
                            is_upper = "upper" in stype_lower
                            is_lower = "lower" in stype_lower
                            injury_is_upper = injury_type in ("bicep", "shoulder")
                            injury_is_lower = injury_type in ("lower back", "knee")
                            relevant = (
                                (injury_is_upper and is_upper) or
                                (injury_is_lower and is_lower) or
                                (not injury_is_upper and not injury_is_lower)
                            )
                            # Add prehab once per week (first relevant session)
                            if relevant and week_obj.weekNumber not in prehab_added:
                                from models.schemas import SessionExercise as SE, ExerciseCategory as EC, TargetSet as TS
                                for i, pb in enumerate(injury_cfg.get("prehab_to_add", [])):
                                    if not any(pb["name"].lower() in e.name.lower() for e in session.exercises):
                                        sets_str = pb["prescription"].split("x")[0] if "x" in pb["prescription"] else "3"
                                        reps_str = pb["prescription"].split("x")[-1].strip() if "x" in pb["prescription"] else "15"
                                        # Remove non-numeric from reps string
                                        import re as _re2
                                        reps_clean = _re2.sub(r'[^0-9]', '', reps_str) or "15"
                                        sets_clean = _re2.sub(r'[^0-9]', '', sets_str) or "3"
                                        pb_ex = SE(
                                            sessionExerciseId=_prog_id(), name=pb["name"],
                                            category=EC.PREHAB, prescription=pb["prescription"],
                                            notes=pb["notes"], order=len(session.exercises) + i + 1,
                                            targetSets=[TS(setNumber=j+1, targetReps=reps_clean, setType="work") for j in range(int(sets_clean))],
                                        )
                                        session.exercises.append(pb_ex)
                                        changes_by_category["prehab"].append({
                                            "from": "(none)", "to": pb["name"], "reason": pb["notes"],
                                            "session": stype, "week": week_obj.weekNumber,
                                        })
                                        total_swapped += 1
                                prehab_added.add(week_obj.weekNumber)

    # ── Log to MongoDB ────────────────────────────────────────────────────────
    all_changes = [ch for lst in changes_by_category.values() for ch in lst]
    if all_changes:
        for ch in all_changes:
            cat_label = next((cat for cat, lst in changes_by_category.items() if ch in lst), "general")
            await db.substitutions.insert_one({
                "timestamp": now, "date": now.strftime("%Y-%m-%d"),
                "week": current_week, "day": "Coach Recommendation",
                "sessionType": ch.get("session", "Program Update"),
                "originalExercise": ch["from"], "replacementExercise": ch["to"],
                "reason": ch["reason"], "category": cat_label,
                "conversationId": body.conversation_id, "blockWeek": ch.get("week"),
            })
        _prog_store["changes"].append(_ProgramChange(
            changeId=_prog_id(), userId=userId,
            triggerType=_ChangeTrigger.USER_REQUEST, scope=_ChangeScope.BLOCK,
            oldValue="; ".join(c["from"] for c in all_changes[:5]),
            newValue="; ".join(c["to"] for c in all_changes[:5]),
            explanation=f"Coach applied to current block: {body.summary}",
        ))
    else:
        await db.substitutions.insert_one({
            "timestamp": now, "date": now.strftime("%Y-%m-%d"),
            "week": current_week, "day": "Coach Recommendation",
            "sessionType": "Program Update",
            "originalExercise": "General Recommendation",
            "replacementExercise": body.summary,
            "reason": body.details or body.summary,
            "conversationId": body.conversation_id,
        })

    await db.conversations.update_one(
        {"_id": conv_oid}, {"$set": {"recommendationApplied": True, "updatedAt": now}}
    )

    # ── Build summary ─────────────────────────────────────────────────────────
    n_main = len(changes_by_category["main"])
    n_supp = len(changes_by_category["supplemental"])
    n_acc  = len(changes_by_category["accessory"])
    n_pre  = len(changes_by_category["prehab"])
    parts  = []
    if n_main: parts.append(f"{n_main} main lift{'s' if n_main>1 else ''}")
    if n_supp: parts.append(f"{n_supp} supplemental")
    if n_acc:  parts.append(f"{n_acc} accessory")
    if n_pre:  parts.append(f"{n_pre} prehab added")

    if current_block and current_block.weeks:
        min_w = min(w.weekNumber for w in current_block.weeks)
        max_w = max(w.weekNumber for w in current_block.weeks)
        scope = f"current block (wks {min_w}–{max_w})"
    else:
        scope = "current block"

    msg = f"Applied to {scope}: {', '.join(parts)} updated." if parts else "Logged to your program changelog."

    # ── Persist the updated plan so changes survive server restarts ───────────
    if plan and total_swapped > 0:
        await _save_plan_to_db(plan)

    return {
        "success": True, "message": msg,
        "exercises_swapped": total_swapped,
        "changes_by_category": changes_by_category,
        "changes": all_changes,
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


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2 — BATCH 2  Intelligent Coaching Upgrades
# ═══════════════════════════════════════════════════════════════════════════════

# ─── Task 2: RAG-Enhanced Plan Generation ─────────────────────────────────────
# This route shadows the one in program_router because api_router is included
# first, so every POST /api/profile/intake comes here.

@api_router.post("/profile/intake")
async def submit_intake_rag(intake: _IntakeRequest, userId: str = Depends(get_current_user)):
    """
    RAG-Enhanced intake endpoint.
    Generates a 12-month plan augmented with Supabase knowledge retrieval.
    Falls back to rule-based plan if RAG / AI is unavailable.
    Every plan generation is persisted via _save_plan_to_db().
    """
    from services.rag_plan_generator import generate_plan_with_rag
    from models.schemas import (
        UserProfile, GoalType, ExperienceLevel,
        CoachMemoryFact, ProgramChange, ChangeScope, ChangeTrigger,
    )

    user_id = userId

    # Build in-memory profile
    try:
        goal_enum = GoalType(intake.goal)
    except ValueError:
        goal_enum = GoalType.STRENGTH
    try:
        exp_enum = ExperienceLevel(intake.experience)
    except ValueError:
        exp_enum = ExperienceLevel.INTERMEDIATE

    profile = UserProfile(
        userId=user_id,
        goal=goal_enum,
        experience=exp_enum,
        currentLifts=intake.lifts,
        liftUnit=intake.liftUnit,
        bodyweight=intake.bodyweight,
        trainingDays=intake.frequency,
        injuries=intake.injuries,
        gymTypes=intake.gym,
        onboardingComplete=True,
    )
    _prog_store["profiles"][user_id] = profile

    # Generate RAG-enhanced plan (graceful fallback inside)
    plan = await generate_plan_with_rag(intake, _openai_client, _supabase_client)
    plan.userId = user_id
    _prog_store["plans"][user_id] = plan
    rag_enhanced = "(Research-Optimized)" in plan.planName

    # Persist plan to MongoDB (CRITICAL — survives restarts)
    await _save_plan_to_db(plan, user_id)

    # Mark onboarding complete in db.users
    if user_id != _PROG_USER:
        await db.users.update_one(
            {"userId": user_id},
            {"$set": {"onboardingComplete": True, "goal": intake.goal, "experience": intake.experience}},
        )

    # Update db.profile with intake data
    injury_flags = [i for i in (intake.injuries or []) if i and i.lower() not in ("none", "")]
    profile_update = {
        "goal": intake.goal,
        "trainingGoal": intake.goal,
        "trainingDaysCount": intake.frequency,
        "onboardingComplete": True,
        "updatedAt": datetime.now(timezone.utc),
    }
    if injury_flags:
        profile_update["injuryFlags"] = injury_flags
    if intake.bodyweight:
        profile_update["currentBodyweight"] = intake.bodyweight
    existing_profile = await db.profile.find_one({"userId": user_id})
    if existing_profile:
        await db.profile.update_one({"userId": user_id}, {"$set": profile_update})

    # Log initial program change
    _prog_store["changes"].append(ProgramChange(
        changeId=_prog_id(), userId=user_id,
        triggerType=ChangeTrigger.USER_REQUEST,
        scope=ChangeScope.YEAR,
        oldValue="No program",
        newValue=plan.planName,
        explanation=(
            f"Generated {plan.planName} (RAG-enhanced) — "
            f"{intake.goal} goal, {intake.experience} level, "
            f"{intake.frequency} days/week."
        ),
    ))

    # Seed coach memory facts
    for inj in (intake.injuries or []):
        if inj and inj.lower() not in ("none", ""):
            _prog_store["memory_facts"].append(CoachMemoryFact(
                factId=_prog_id(), userId=user_id,
                factType="injury", factValue=inj,
                source="onboarding", confirmed=True,
            ))

    return {
        "success": True,
        "profile": profile.model_dump(),
        "plan": plan.model_dump(),
        "rag_enhanced": rag_enhanced,
    }


# ─── Task 5: Weekly Auto-Review ────────────────────────────────────────────────

@api_router.get("/weekly-review")
async def get_weekly_review(userId: str = Depends(get_current_user)):
    """
    Return a weekly AI coaching review, cached once per training week.
    Generates on first call for the week; returns cache on subsequent calls.
    Stored in db.weekly_reviews.
    """
    from datetime import timedelta

    profile_doc = await db.profile.find_one({"userId": userId})
    current_week = int(profile_doc.get("currentWeek", 1)) if profile_doc else 1
    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")

    # ── Cache check ────────────────────────────────────────────────────────────
    existing = await db.weekly_reviews.find_one({"userId": userId, "week": current_week})
    if existing:
        existing.pop("_id", None)
        return {
            "hasReview": True,
            "cached": True,
            **{k: existing.get(k) for k in ("week", "generatedAt", "summary", "highlights", "concerns", "nextWeekFocus", "stats")},
        }

    # ── Gather data ────────────────────────────────────────────────────────────
    week_ago = (now - timedelta(days=7)).strftime("%Y-%m-%d")

    session_ratings = await db.session_ratings.find(
        {"userId": userId}
    ).sort("createdAt", -1).limit(10).to_list(10)

    pain_docs = await db.pain_reports.find({
        "userId": userId, "date": {"$gte": week_ago},
    }).to_list(30)

    log_docs = await db.log.find({"userId": userId, "week": current_week}).to_list(500)

    # Stats
    sessions_planned = int(profile_doc.get("trainingDaysCount", 4)) if profile_doc else 4
    session_dates = set(d.get("date") for d in log_docs if d.get("date"))
    sessions_completed = len(session_dates)

    week_ratings = [r for r in session_ratings if r.get("week") == current_week]
    avg_rpe = (
        sum(r.get("rpe", 0) for r in week_ratings) / len(week_ratings)
        if week_ratings else 0.0
    )

    pain_count = len(pain_docs)
    pain_regions = list(set(d.get("bodyRegion") for d in pain_docs if d.get("bodyRegion")))

    # PR detection (e1rm improvement vs prev week)
    prev_logs = await db.log.find({"userId": userId, "week": current_week - 1}).to_list(500)
    this_best: dict = {}
    for d in log_docs:
        ex = d.get("exercise", "")
        e1rm = float(d.get("e1rm", 0) or 0)
        if ex and e1rm > this_best.get(ex, 0):
            this_best[ex] = e1rm
    prev_best: dict = {}
    for d in prev_logs:
        ex = d.get("exercise", "")
        e1rm = float(d.get("e1rm", 0) or 0)
        if ex and e1rm > prev_best.get(ex, 0):
            prev_best[ex] = e1rm
    pr_count = sum(
        1 for ex, val in this_best.items()
        if val > prev_best.get(ex, 0) and prev_best.get(ex, 0) > 0
    )

    stats = {
        "sessionsCompleted": sessions_completed,
        "sessionsPlanned": sessions_planned,
        "avgRPE": round(avg_rpe, 1),
        "prsHit": pr_count,
        "painReports": pain_count,
    }

    # ── Fallback review (no AI needed) ────────────────────────────────────────
    def _fallback_review() -> dict:
        highlights = []
        concerns = []
        completion_pct = round(sessions_completed / max(sessions_planned, 1) * 100)

        if sessions_completed >= sessions_planned:
            highlights.append(f"Full attendance — {sessions_completed}/{sessions_planned} sessions completed")
        elif sessions_completed > 0:
            highlights.append(f"{sessions_completed}/{sessions_planned} sessions logged")
        if pr_count > 0:
            highlights.append(f"{pr_count} new e1RM PRs this week")
        if pain_count == 0 and sessions_completed > 0:
            highlights.append("Zero pain reports — clean week")

        if avg_rpe >= 8.5:
            concerns.append(f"Average RPE {avg_rpe:.1f}/10 is high — prioritise recovery")
        if pain_count >= 4:
            concerns.append(f"{pain_count} pain reports in 7 days — monitor closely")
        if sessions_completed < sessions_planned * 0.6 and sessions_planned > 0:
            concerns.append(f"Attendance at {completion_pct}% — log sessions consistently")

        if avg_rpe >= 8.5:
            next_focus = "Recovery is the priority. Lower loads 10%, extend warm-ups."
        elif avg_rpe <= 6.0 and avg_rpe > 0:
            next_focus = "RPE headroom available — push intensity next week."
        else:
            next_focus = "Continue progressive overload with full intent."

        summary = f"Week {current_week} — {completion_pct}% attendance" + (
            f", avg RPE {avg_rpe:.1f}/10" if avg_rpe > 0 else ""
        ) + "."

        return {
            "summary": summary,
            "highlights": highlights or ["Complete more sessions to unlock insights"],
            "concerns": concerns,
            "nextWeekFocus": next_focus,
        }

    # ── AI-generated review ────────────────────────────────────────────────────
    review_data: dict = {}
    if _openai_client:
        try:
            context_lines = [
                f"Week {current_week} summary:",
                f"- Sessions: {sessions_completed}/{sessions_planned} completed",
                f"- Avg RPE: {avg_rpe:.1f}/10" if avg_rpe > 0 else "- No RPE data yet",
                f"- PRs logged: {pr_count}",
                f"- Pain reports: {pain_count}" + (f" ({', '.join(pain_regions)})" if pain_regions else ""),
            ]
            if week_ratings:
                context_lines.append("Session RPEs: " + ", ".join(
                    f"{r.get('sessionType','?')} {r.get('rpe','?')}" for r in week_ratings[:4]
                ))
            context = "\n".join(context_lines)

            emergent_key = os.environ.get('EMERGENT_LLM_KEY', '')
            from emergentintegrations.llm.chat import LlmChat as _LC, UserMessage as _UM
            chat = _LC(
                api_key=emergent_key,
                session_id=str(uuid.uuid4()),
                system_message="You are an expert strength coach writing weekly training reviews. Be specific, data-driven, and use a direct coaching voice. Return ONLY valid JSON.",
            ).with_model("anthropic", "claude-sonnet-4-5-20250929")

            ai_prompt = f"""{context}

Write a weekly review as JSON (no markdown):
{{
  "summary": "2-3 sentences: what happened this week and overall quality",
  "highlights": ["specific achievement 1", "specific achievement 2"],
  "concerns": ["specific concern if any (omit if none)"],
  "nextWeekFocus": "1-2 concrete action items for next training week"
}}"""

            raw = await chat.send_message(_UM(text=ai_prompt))
            j = re.search(r'\{.*\}', raw, re.DOTALL)
            if j:
                review_data = json.loads(j.group())
                logger.info(f"[WeeklyReview] AI review generated for user {userId} week {current_week}")
        except Exception as e:
            logger.warning(f"[WeeklyReview] AI failed: {e} — using fallback")

    if not review_data:
        review_data = _fallback_review()

    # ── Cache in MongoDB ───────────────────────────────────────────────────────
    # Ensure highlights are never empty (fallback for AI returning empty array)
    if not review_data.get("highlights"):
        review_data["highlights"] = ["Complete more sessions this week to unlock insights"]
    doc = {
        "userId": userId,
        "week": current_week,
        "generatedAt": today_str,
        "stats": stats,
        "createdAt": now,
        **review_data,
    }
    await db.weekly_reviews.insert_one(doc)
    logger.info(f"[WeeklyReview] Cached week {current_week} review for user {userId}")

    return {
        "hasReview": True,
        "cached": False,
        "week": current_week,
        "generatedAt": today_str,
        "stats": stats,
        **review_data,
    }


# ─── Task 6: Automatic Load & Volume Adjustment ────────────────────────────────

@api_router.post("/plan/auto-adjust")
async def auto_adjust_plan(userId: str = Depends(get_current_user)):
    """
    Analyse recent RPE trends and automatically adjust upcoming loads.
    - avg RPE >= 8.5  → reduce loads 10% for recovery
    - avg RPE >= 8.0  → reduce loads 5%
    - avg RPE <= 6.0  → increase loads 5% (room to push)
    - 5+ pain reports in 2 weeks → additional reduction cap
    Always persists via _save_plan_to_db().
    """
    from datetime import timedelta

    recent_ratings = await db.session_ratings.find(
        {"userId": userId}
    ).sort("createdAt", -1).limit(5).to_list(5)

    if len(recent_ratings) < 2:
        return {"adjusted": False, "reason": "Not enough session data (need at least 2 sessions)"}

    avg_rpe = sum(r.get("rpe", 7) for r in recent_ratings) / len(recent_ratings)

    if avg_rpe >= 8.5:
        factor, direction, note = 0.90, "reduce", f"Avg RPE {avg_rpe:.1f}/10 — loads reduced 10% for recovery"
    elif avg_rpe >= 8.0:
        factor, direction, note = 0.95, "reduce", f"Avg RPE {avg_rpe:.1f}/10 — loads reduced 5%"
    elif avg_rpe <= 6.0:
        factor, direction, note = 1.05, "increase", f"Avg RPE {avg_rpe:.1f}/10 — loads increased 5% (RPE headroom)"
    else:
        return {
            "adjusted": False,
            "reason": f"RPE {avg_rpe:.1f}/10 is optimal — no adjustment needed",
            "avgRPE": round(avg_rpe, 1),
        }

    # Pain data: extra reduction cap
    two_weeks_ago = (datetime.now(timezone.utc) - timedelta(days=14)).strftime("%Y-%m-%d")
    pain_docs = await db.pain_reports.find({
        "userId": userId, "date": {"$gte": two_weeks_ago},
    }).to_list(30)
    if len(pain_docs) >= 5:
        factor = min(factor, 0.90)
        direction = "reduce"
        note += f"; {len(pain_docs)} pain reports → extra caution"

    # Load plan into memory
    plan_available = await _ensure_plan_loaded(userId)
    if not plan_available:
        return {"adjusted": False, "reason": "No plan found — complete onboarding first"}

    plan = _prog_store["plans"].get(userId)
    if not plan:
        return {"adjusted": False, "reason": "Plan not in memory"}

    profile_doc = await db.profile.find_one({"userId": userId})
    current_week = int(profile_doc.get("currentWeek", 1)) if profile_doc else 1

    sets_adjusted = 0
    changes: list = []

    for phase in plan.phases:
        for block in phase.blocks:
            for week in block.weeks:
                if not (current_week <= week.weekNumber <= current_week + 2):
                    continue  # Only adjust current + next 2 weeks
                for session in week.sessions:
                    for ex in session.exercises:
                        cat_str = str(ex.category).lower()
                        if cat_str not in ("main", "supplemental"):
                            continue
                        for ts in ex.targetSets:
                            if ts.setType not in ("work", "ramp"):
                                continue
                            load_str = (ts.targetLoad or "").strip()
                            numeric = re.sub(r'[^0-9.]', '', load_str)
                            if not numeric or float(numeric) <= 0:
                                continue
                            old_load = float(numeric)
                            new_load = round(old_load * factor / 5) * 5
                            if new_load != round(old_load / 5) * 5:
                                ts.targetLoad = str(int(new_load))
                                sets_adjusted += 1
                    if sets_adjusted > 0 and not any(
                        c["exercise"] == ex.name and c["week"] == week.weekNumber
                        for c in changes
                    ):
                        changes.append({
                            "exercise": ex.name,
                            "session": str(session.sessionType),
                            "week": week.weekNumber,
                            "direction": direction,
                        })

    if sets_adjusted > 0:
        await _save_plan_to_db(plan, userId)
        # Log adjustment
        now = datetime.now(timezone.utc)
        await db.substitutions.insert_one({
            "userId": userId,
            "timestamp": now,
            "date": now.strftime("%Y-%m-%d"),
            "week": current_week,
            "day": "Auto-Adjustment",
            "sessionType": "Multiple Sessions",
            "originalExercise": f"Target loads (avg RPE {avg_rpe:.1f})",
            "replacementExercise": f"Loads {direction}d {abs(1 - factor) * 100:.0f}%",
            "reason": note,
        })
        logger.info(f"[AutoAdjust] User {userId}: {sets_adjusted} sets {direction}d (RPE {avg_rpe:.1f})")

    return {
        "adjusted": sets_adjusted > 0,
        "direction": direction if sets_adjusted > 0 else "none",
        "setsAdjusted": sets_adjusted,
        "avgRPE": round(avg_rpe, 1),
        "factor": factor,
        "note": note,
        "changes": changes[:10],
    }


@api_router.post("/plan/autoregulate")
async def autoregulate_session(body: dict, userId: str = Depends(get_current_user)):
    """
    Mid-session RPE feedback — real-time load suggestion after each set.
    Returns: suggestion (reduce/increase/maintain) + coaching message + suggested load.
    """
    current_rpe = float(body.get("currentRPE", 7.0))
    target_rpe = float(body.get("targetRPE", 7.5))
    current_load = float(body.get("currentLoad", 0) or 0)
    diff = current_rpe - target_rpe
    new_load = None

    if diff >= 2.0:
        suggestion = "reduce"
        pct = 15 if diff >= 2.5 else 10
        new_load = round(current_load * (1 - pct / 100) / 5) * 5 if current_load > 0 else None
        load_msg = f" Drop to ~{new_load} lbs next set ({pct}% less)." if new_load else f" Reduce by {pct}%."
        message = f"RPE {int(current_rpe)}/10 — that was heavy.{load_msg}"
    elif diff >= 1.0:
        suggestion = "reduce"
        new_load = round(current_load * 0.95 / 5) * 5 if current_load > 0 else None
        load_msg = f" Try {new_load} lbs next set." if new_load else " Reduce slightly."
        message = f"RPE {int(current_rpe)}/10 slightly high.{load_msg}"
    elif diff <= -2.0:
        suggestion = "increase"
        new_load = round(current_load * 1.10 / 5) * 5 if current_load > 0 else None
        load_msg = f" Add {new_load} lbs next set." if new_load else " Add 10–15 lbs."
        message = f"RPE {int(current_rpe)}/10 — plenty in the tank.{load_msg}"
    elif diff <= -1.0:
        suggestion = "increase"
        new_load = round(current_load * 1.05 / 5) * 5 if current_load > 0 else None
        load_msg = f" Try {new_load} lbs next set." if new_load else " Add 5 lbs."
        message = f"RPE {int(current_rpe)}/10 — room to push.{load_msg}"
    else:
        suggestion = "maintain"
        message = f"RPE {int(current_rpe)}/10 — right in the zone. Stay at current load."

    return {
        "suggestion": suggestion,
        "message": message,
        "currentRPE": current_rpe,
        "targetRPE": target_rpe,
        "suggestedLoad": new_load,
    }


# ─── Task 7: Deload Detection ──────────────────────────────────────────────────

@api_router.get("/deload/check")
async def check_deload_needed(userId: str = Depends(get_current_user)):
    """
    Analyse training signals to detect if a deload week is needed.
    Scoring: RPE fatigue + pain frequency + session completion rate.
    Logs recommendation to db.deload_history when score >= 4.
    Conflict priority: injury safety > deload > all else.
    """
    from datetime import timedelta

    profile_doc = await db.profile.find_one({"userId": userId})
    current_week = int(profile_doc.get("currentWeek", 1)) if profile_doc else 1
    now = datetime.now(timezone.utc)
    two_weeks_ago = (now - timedelta(weeks=2)).strftime("%Y-%m-%d")
    three_weeks_ago = (now - timedelta(weeks=3)).strftime("%Y-%m-%d")

    # Recent RPE (last 5 sessions)
    recent_ratings = await db.session_ratings.find(
        {"userId": userId}
    ).sort("createdAt", -1).limit(5).to_list(5)
    avg_rpe = sum(r.get("rpe", 7) for r in recent_ratings) / len(recent_ratings) if recent_ratings else 7.0

    # Pain frequency (last 2 weeks)
    pain_docs = await db.pain_reports.find({
        "userId": userId, "date": {"$gte": two_weeks_ago},
    }).to_list(50)
    pain_count = len(pain_docs)
    flagged_regions = list({
        d.get("bodyRegion") for d in pain_docs
        if d.get("flagged") and d.get("bodyRegion")
    })

    # Session completion rate (last 3 weeks)
    log_docs = await db.log.find({
        "userId": userId, "date": {"$gte": three_weeks_ago},
    }).to_list(500)
    sessions_completed = len({d.get("date") for d in log_docs if d.get("date")})
    expected = int(profile_doc.get("trainingDaysCount", 4)) * 3 if profile_doc else 12
    completion_rate = sessions_completed / expected if expected > 0 else 1.0

    # Scoring
    deload_score = 0
    signals: list = []

    if avg_rpe >= 9.0:
        deload_score += 3
        signals.append(f"Avg RPE {avg_rpe:.1f}/10 — near-maximal fatigue sustained")
    elif avg_rpe >= 8.5:
        deload_score += 2
        signals.append(f"Avg RPE {avg_rpe:.1f}/10 — high systemic fatigue")

    if pain_count >= 7:
        deload_score += 3
        signals.append(f"{pain_count} pain reports in 2 weeks — injury risk elevated")
    elif pain_count >= 4:
        deload_score += 2
        signals.append(f"{pain_count} pain reports in 2 weeks — accumulating")

    if flagged_regions:
        deload_score += 2
        signals.append(f"Recurring pain in: {', '.join(flagged_regions)}")

    if completion_rate < 0.60:
        deload_score += 2
        signals.append(f"Completion {round(completion_rate * 100)}% — possible overreaching or fatigue")

    # Scheduled deload weeks (every 4th week per block)
    SCHEDULED_DELOAD_WEEKS = {4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52}
    if current_week in SCHEDULED_DELOAD_WEEKS:
        deload_score += 2
        signals.append(f"Week {current_week} is a scheduled deload week in the programme")

    # Verdict
    if deload_score >= 4:
        urgency = "immediate"
        recommended = True
        message = "Deload recommended immediately. Clear signs of systemic overreaching."
    elif deload_score >= 2:
        urgency = "soon"
        recommended = False
        message = f"Fatigue building (score {deload_score}/12). Consider a deload within 1–2 weeks."
    else:
        urgency = "none"
        recommended = False
        message = f"No deload needed. Training fatigue is well managed (score {deload_score}/12)."

    # Log when deload is recommended (prevent duplicate entries per week)
    if recommended:
        exists = await db.deload_history.find_one({"userId": userId, "week": current_week})
        if not exists:
            await db.deload_history.insert_one({
                "userId": userId,
                "week": current_week,
                "triggeredAt": now,
                "date": now.strftime("%Y-%m-%d"),
                "deloadScore": deload_score,
                "signals": signals,
                "avgRPE": round(avg_rpe, 1),
                "painCount": pain_count,
                "completionRate": round(completion_rate, 2),
                "urgency": urgency,
            })
            logger.info(f"[Deload] User {userId}: deload logged — score={deload_score}, RPE={avg_rpe:.1f}")

    return {
        "deloadRecommended": recommended,
        "urgency": urgency,
        "deloadScore": deload_score,
        "signals": signals,
        "message": message,
        "stats": {
            "avgRPE": round(avg_rpe, 1),
            "painReports": pain_count,
            "completionRate": round(completion_rate * 100),
            "currentWeek": current_week,
        },
    }


# ─── Task 11: Personalized Warm-Up ────────────────────────────────────────────

@api_router.get("/warmup/today")
async def get_personalized_warmup(userId: str = Depends(get_current_user)):
    """
    Return a personalized warm-up for today's session.
    Tailored to: session focus (upper/lower), injury flags, and readiness score.
    """
    profile_doc = await db.profile.find_one({"userId": userId})
    injuries = profile_doc.get("injuryFlags", []) if profile_doc else []

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    readiness_doc = await db.readiness_checks.find_one({"userId": userId, "date": today_str})
    readiness_score = float(readiness_doc.get("totalScore", 5.0)) if readiness_doc else 5.0

    # Determine session focus
    today_day = datetime.now().weekday() + 1  # 1=Mon … 7=Sun
    CALENDAR = {1: "lower", 2: "upper", 4: "lower", 5: "upper"}
    session_focus = CALENDAR.get(today_day, "upper")

    # Override with actual plan session type if available
    plan_available = await _ensure_plan_loaded(userId)
    if plan_available:
        plan = _prog_store["plans"].get(userId)
        if plan:
            for phase in plan.phases:
                for block in phase.blocks:
                    for week in block.weeks:
                        for session in week.sessions:
                            if session.dayNumber == today_day:
                                stype = str(session.sessionType or "").lower()
                                session_focus = "lower" if "lower" in stype else "upper"

    # Injury flags
    inj_lower = any(
        any(k in inj.lower() for k in ["knee", "hip", "lower back", "lumbar", "si joint", "hamstring", "quad"])
        for inj in injuries
    )
    inj_upper = any(
        any(k in inj.lower() for k in ["shoulder", "elbow", "wrist", "rotator", "bicep", "pec"])
        for inj in injuries
    )
    extended = readiness_score < 3.5

    if session_focus == "lower":
        steps = [
            "Hip circles — 10 reps each direction (slow, deliberate)",
            "Leg swings — 10 forward / 10 lateral per leg",
            "Goblet squat — 10 reps bodyweight (pause 1s at bottom)",
            "Hip flexor stretch — 30s per side",
            "Band walks — 15 steps each direction",
        ]
        if extended:
            steps += ["Cossack squat — 5 per side (mobility)", "Glute bridge — 15 reps (hip activation)"]
        if inj_lower:
            if any("knee" in i.lower() for i in injuries):
                steps.insert(2, "Terminal knee extensions (band) — 20 reps per leg")
            if any(k in i.lower() for i in injuries for k in ["si", "hip"]):
                steps.insert(2, "Dead bug — 8 per side (core / SI stability)")
                steps.append("Clamshell (band) — 20 per side")
            if any(k in i.lower() for i in injuries for k in ["back", "lumbar"]):
                steps.insert(1, "Cat-cow — 10 reps (lumbar mobility)")
                steps.insert(2, "McGill bird-dog — 6 per side")
        steps.append("Empty bar squat — 2 × 10 (groove the pattern)")
        duration = "10–15 min" if extended else "8–12 min"
        title = "Lower Body Warm-Up"
    else:
        steps = [
            "Band pull-aparts — 3 × 20 (scapular retraction)",
            "Shoulder dislocates (band) — 15 reps slow",
            "Face pulls (light) — 20 reps",
            "Light dumbbell press — 12 reps (not taxing)",
            "Thoracic extension over foam roller — 30s",
        ]
        if extended:
            steps += ["Wrist circles — 10 each direction", "Scapular push-ups — 10 reps"]
        if inj_upper:
            if any(k in i.lower() for i in injuries for k in ["shoulder", "rotator"]):
                steps.insert(1, "External rotation (band) — 20 per arm")
                steps.insert(2, "Internal rotation (band) — 20 per arm")
            if any("elbow" in i.lower() for i in injuries):
                steps.insert(0, "Forearm flexor stretch — 30s per arm")
                steps.insert(1, "Forearm extensor stretch — 30s per arm")
        steps.append("Empty bar press — 2 × 10 slow tempo (groove the press)")
        duration = "8–12 min" if extended else "6–10 min"
        title = "Upper Body Warm-Up"

    readiness_note = ""
    if readiness_score < 2.5:
        readiness_note = "Low readiness today — take your time, extend rest between warm-up sets."
    elif readiness_score < 3.5:
        readiness_note = "Moderate readiness — thorough warm-up is key. Don't rush this."

    return {
        "title": title,
        "sessionFocus": session_focus,
        "duration": duration,
        "steps": steps,
        "stepCount": len(steps),
        "readinessScore": readiness_score,
        "readinessNote": readiness_note,
        "hasInjuryModifications": inj_lower or inj_upper,
        "extended": extended,
    }


app.include_router(api_router)
app.include_router(program_router)
app.include_router(auth_router)
app.include_router(admin_router)

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
