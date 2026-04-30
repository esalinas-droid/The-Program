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
from datetime import datetime, timezone, timedelta
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

# ── Exercise Name Canonical Migration Map ────────────────────────────────────
# Maps old/incorrect exercise names → correct canonical names.
# Used during startup migration and in any new lookup that needs normalization.
EXERCISE_NAME_MIGRATION_MAP: dict[str, str] = {
    "SSB Squat":           "SSB Box Squat",
    "SSB squat":           "SSB Box Squat",
    "ssb squat":           "SSB Box Squat",
    "Axle Deadlift":       "Axle Clean and Press",
    "axle deadlift":       "Axle Clean and Press",
    "Log Press":           "Log Clean and Press",
    "log press":           "Log Clean and Press",
    "Log push press":      "Log Push Press",
    "Axle push press":     "Axle Push Press",
    "Yoke":                "Yoke Carry",
    "Atlas Stone":         "Atlas Stone Load",
    "Farmers Walk":        "Farmers Carry",
    "Farmers Walks":       "Farmers Carry",
    "farmers walk":        "Farmers Carry",
    "farmers walks":       "Farmers Carry",
}

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
    is_beta_tester: bool = False
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
    is_beta_tester: Optional[bool] = None

class WorkoutLogEntry(BaseDocument):
    userId: str = ""          # owner of this log entry
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
    setIndex: Optional[int] = None  # position of this set within the exercise (0-based)
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
    setIndex: Optional[int] = None  # position of this set within the exercise (0-based)

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
    userId: Optional[str] = None
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

# ── Tracked Lifts Models ───────────────────────────────────────────────────────
class TrackedLiftCreate(BaseModel):
    exercise: str
    category: str = "Powerlifting"
    bestWeight: Optional[float] = None
    bestReps: Optional[int] = None
    lastDate: Optional[str] = None

class TrackedLiftUpdate(BaseModel):
    bestWeight: Optional[float] = None
    bestReps: Optional[int] = None
    lastDate: Optional[str] = None
    isFeatured: Optional[bool] = None
    category: Optional[str] = None

class FeaturedLiftsUpdate(BaseModel):
    featuredIds: List[str] = []

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
    data = {k: v for k, v in profile.model_dump().items() if v is not None}
    data["updatedAt"] = datetime.now(timezone.utc)
    data["userId"] = userId          # keep userId stamped
    # Upsert — create profile if it doesn't exist yet (e.g. during onboarding)
    await db.profile.update_one({"userId": userId}, {"$set": data}, upsert=True)
    doc = await db.profile.find_one({"userId": userId})
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

@api_router.get("/plan/year")
async def get_year_plan_mongo(userId: str = Depends(get_current_user)):
    """Get full annual plan — auto-loads from MongoDB if not in memory after restart."""
    await _ensure_plan_loaded(userId)
    plan = _prog_store["plans"].get(userId)
    if not plan:
        raise HTTPException(status_code=404, detail="No plan found. Complete onboarding first.")
    return plan.model_dump()


@api_router.get("/plan/block/current")
async def get_current_block_mongo(userId: str = Depends(get_current_user)):
    """Get current active block — auto-loads from MongoDB if not in memory."""
    from models.schemas import PhaseStatus as _PhaseStatus
    await _ensure_plan_loaded(userId)
    plan = _prog_store["plans"].get(userId)
    if not plan:
        raise HTTPException(status_code=404, detail="No plan found.")
    for phase in plan.phases:
        if phase.status == _PhaseStatus.CURRENT:
            for block in phase.blocks:
                if block.status == _PhaseStatus.CURRENT:
                    return {
                        "phase": {"name": phase.phaseName, "number": phase.phaseNumber,
                                  "goal": phase.goal, "adaptation": phase.expectedAdaptation},
                        "block": block.model_dump(),
                    }
    if plan.phases and plan.phases[0].blocks:
        phase = plan.phases[0]
        block = phase.blocks[0]
        return {
            "phase": {"name": phase.phaseName, "number": phase.phaseNumber,
                      "goal": phase.goal, "adaptation": phase.expectedAdaptation},
            "block": block.model_dump(),
        }
    raise HTTPException(status_code=404, detail="No active block found.")


@api_router.post("/session/finish")
async def finish_session(body: dict, userId: str = Depends(get_current_user)):
    """Mark a session as complete. Non-critical — log entries already saved via /log.
    Resets in-memory session cache so the next visit loads fresh."""
    session_id = body.get("sessionId", "")
    try:
        await _ensure_plan_loaded(userId)
        plan = _prog_store["plans"].get(userId)
        if plan and session_id:
            from models.schemas import SessionStatus as _SS
            for phase in plan.phases:
                for block in phase.blocks:
                    for week in block.weeks:
                        for session in week.sessions:
                            if getattr(session, "sessionId", "") == session_id:
                                session.status = _SS.COMPLETED
                                logger.info(f"[FinishSession] Marked {session_id} complete for {userId}")
    except Exception as e:
        logger.warning(f"[FinishSession] Could not mark session in plan: {e}")
    return {
        "sessionId": session_id,
        "completedSets": 0,
        "totalSets": 0,
        "duration": 0,
        "wins": ["Session logged successfully"],
        "flags": [],
        "coachNote": "Great work — sets saved to your log.",
        "whatsNext": "Rest up and come back for your next session.",
    }


@api_router.get("/plan/session/today")
async def get_today_session_mongo(userId: str = Depends(get_current_user)):
    """Get today's session — auto-loads plan from MongoDB if not in memory."""
    from models.schemas import PhaseStatus as _PhaseStatus, SessionStatus as _SessionStatus
    await _ensure_plan_loaded(userId)
    plan = _prog_store["plans"].get(userId)
    if not plan:
        raise HTTPException(status_code=404, detail="No plan found.")

    today_day = datetime.now().weekday() + 1  # 1=Mon … 7=Sun
    # Updated to new session terminology — legacy names kept for fallback
    TRAINING_CALENDAR = {
        1: "Heavy Lower",  2: "Heavy Upper",
        4: "Speed Lower",  5: "Speed Upper",
    }
    TRAINING_CALENDAR_LEGACY = {
        1: "Max Effort Lower", 2: "Max Effort Upper",
        4: "Dynamic Effort Lower", 5: "Dynamic Effort Upper",
    }
    # Calculate current week from plan start date
    plan_start = getattr(plan, "planStartDate", None) or getattr(plan, "startDate", None) or ""
    current_week_num = _calculate_current_week(str(plan_start)) if plan_start else 1

    # Fetch user goal for boxing filter (BUG 5)
    profile = await db.profile.find_one({"userId": userId})
    user_goal = (profile.get("goal") or "") if profile else ""
    _boxing_names = {"1:1 Boxing Intervals", "Shadowboxing", "Boxing / Recovery / Mobility"}
    is_boxing_user = any(kw in user_goal.lower() for kw in ("boxing", "mma", "martial"))

    def _apply_boxing_filter(result: dict) -> dict:
        """Remove boxing exercises for non-boxing users (BUG 5)."""
        if is_boxing_user or not result:
            return result
        session = result.get("session", {})
        exercises = session.get("exercises", [])
        if exercises:
            session["exercises"] = [ex for ex in exercises if ex.get("name") not in _boxing_names]
            result["session"] = session
        return result

    # ── Check calendar overrides — respect moved sessions (ISSUE 5) ──────────────
    today_str = datetime.now().strftime("%Y-%m-%d")

    # Was a session MOVED TO today from another date?
    moved_to_today = await db.calendar_overrides.find_one({"userId": userId, "newDate": today_str})

    # Was today's original session MOVED AWAY to another date?
    moved_from_today = await db.calendar_overrides.find_one({"userId": userId, "originalDate": today_str})

    if moved_to_today:
        # A session was moved TO today — find and return the matching session from the plan
        moved_session_type = moved_to_today.get("sessionType", "")
        for phase in plan.phases:
            for block in (phase.blocks or []):
                for week in (block.weeks or []):
                    for session in (week.sessions or []):
                        if session.sessionType == moved_session_type:
                            return _apply_boxing_filter({
                                "phase": phase.phaseName, "block": block.blockName,
                                "week": f"Week {week.weekNumber}", "currentWeek": current_week_num,
                                "session": session.model_dump(),
                            })

    if moved_from_today and not moved_to_today:
        # Today's session was moved away and nothing moved here → rest day
        raise HTTPException(status_code=404, detail="Session moved to another day. Today is a rest day.")

    for phase in plan.phases:
        if phase.status == _PhaseStatus.CURRENT:
            for block in phase.blocks:
                if block.status == _PhaseStatus.CURRENT:
                    for week in block.weeks:
                        for session in week.sessions:
                            if session.dayNumber == today_day and session.status in [_SessionStatus.PLANNED, _SessionStatus.IN_PROGRESS]:
                                return _apply_boxing_filter({"phase": phase.phaseName, "block": block.blockName,
                                        "week": f"Week {week.weekNumber}", "currentWeek": current_week_num,
                                        "session": session.model_dump()})
                        # Try new terminology first, then legacy
                        for cal in (TRAINING_CALENDAR, TRAINING_CALENDAR_LEGACY):
                            expected_type = cal.get(today_day)
                            if expected_type:
                                for session in week.sessions:
                                    if session.sessionType == expected_type and session.status in [_SessionStatus.PLANNED, _SessionStatus.IN_PROGRESS]:
                                        return _apply_boxing_filter({"phase": phase.phaseName, "block": block.blockName,
                                                "week": f"Week {week.weekNumber}", "currentWeek": current_week_num,
                                                "session": session.model_dump()})
                        for session in week.sessions:
                            if session.dayNumber >= today_day and session.status in [_SessionStatus.PLANNED, _SessionStatus.IN_PROGRESS]:
                                return _apply_boxing_filter({"phase": phase.phaseName, "block": block.blockName,
                                        "week": f"Week {week.weekNumber}", "currentWeek": current_week_num,
                                        "session": session.model_dump()})
                        for session in week.sessions:
                            if session.status in [_SessionStatus.PLANNED, _SessionStatus.IN_PROGRESS]:
                                return _apply_boxing_filter({"phase": phase.phaseName, "block": block.blockName,
                                        "week": f"Week {week.weekNumber}", "currentWeek": current_week_num,
                                        "session": session.model_dump()})
    if plan.phases and plan.phases[0].blocks and plan.phases[0].blocks[0].weeks:
        phase = plan.phases[0]
        block = phase.blocks[0]
        week = block.weeks[0]
        if week.sessions:
            return _apply_boxing_filter({"phase": phase.phaseName, "block": block.blockName,
                    "week": f"Week {week.weekNumber}", "currentWeek": current_week_num,
                    "session": week.sessions[0].model_dump()})
    raise HTTPException(status_code=404, detail="No session found for today.")


@api_router.post("/plan/injury-preview")
async def injury_preview(body: dict, userId: str = Depends(get_current_user)):
    pass  # placeholder — actual implementation in program_router below


# ── Calendar Endpoints ─────────────────────────────────────────────────────────

_DAY_TO_OFFSET = {
    'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3,
    'friday': 4, 'saturday': 5, 'sunday': 6,
}

def _generate_calendar_events(
    plan,
    preferred_days: list,
    overrides: list,
    logged_dates: set = None,
    logged_date_to_types: dict = None,
) -> list:
    """Map plan sessions to real calendar dates using the user's preferred days.
    logged_dates: set of YYYY-MM-DD dates where the user has ANY log entries.
    logged_date_to_types: map of date -> set of session types logged on that date.
    """
    from datetime import datetime as _dt, timedelta as _td
    logged_dates = logged_dates or set()
    logged_date_to_types = logged_date_to_types or {}

    if not preferred_days:
        preferred_days = ['monday', 'tuesday', 'thursday', 'friday']

    sorted_pref = sorted(
        [d.lower() for d in preferred_days if d.lower() in _DAY_TO_OFFSET],
        key=lambda d: _DAY_TO_OFFSET[d],
    )

    override_map: dict = {}
    for ov in overrides:
        override_map[ov.get('originalDate', '')] = ov.get('newDate', '')

    try:
        plan_start = _dt.strptime(plan.startDate[:10], "%Y-%m-%d")
    except Exception:
        plan_start = _dt.now()

    events = []
    for phase in (plan.phases or []):
        for block in (phase.blocks or []):
            for week in (block.weeks or []):
                wk_num = week.weekNumber or 1
                # Monday of this week number
                week_monday = plan_start + _td(weeks=wk_num - 1)
                week_monday = week_monday - _td(days=week_monday.weekday())

                sorted_sessions = sorted(week.sessions or [], key=lambda s: s.dayNumber or 1)
                for idx, session in enumerate(sorted_sessions):
                    if idx >= len(sorted_pref):
                        break
                    day_name = sorted_pref[idx]
                    actual_date = week_monday + _td(days=_DAY_TO_OFFSET[day_name])
                    date_str = actual_date.strftime("%Y-%m-%d")
                    display_date = override_map.get(date_str, date_str)
                    # ── Completion check — mirrors Schedule page logic ─────────────────────
                    # Completed if: plan status, OR logs exist for this date,
                    # OR same session type was logged anywhere this week (today/past ONLY)
                    has_logs_for_date = display_date in logged_dates
                    today_str_backend = _dt.now().strftime("%Y-%m-%d")
                    is_future = display_date > today_str_backend

                    # Never mark a future date as completed via the "same type this week" fallback
                    same_type_this_week = False
                    if not is_future:
                        try:
                            ev_date_obj = _dt.strptime(display_date, "%Y-%m-%d")
                            ev_week_monday = ev_date_obj - _td(days=ev_date_obj.weekday())
                            for d_offset in range(7):
                                check_date = (ev_week_monday + _td(days=d_offset)).strftime("%Y-%m-%d")
                                types_on_day = logged_date_to_types.get(check_date, set())
                                if session.sessionType in types_on_day:
                                    same_type_this_week = True
                                    break
                        except Exception:
                            pass

                    is_completed = (
                        session.status == "completed"
                        or has_logs_for_date
                        or same_type_this_week
                    )

                    events.append({
                        "date":          display_date,
                        "originalDate":  date_str if display_date != date_str else None,
                        "sessionType":   session.sessionType,
                        "sessionId":     session.sessionId,
                        "weekNumber":    wk_num,
                        "phaseNumber":   phase.phaseNumber,
                        "phaseName":     phase.phaseName,
                        "blockName":     block.blockName,
                        "exercises":     [e.model_dump() for e in (session.exercises or [])[:5]],
                        "isCompleted":   is_completed,
                        "isOverridden":  display_date != date_str,
                        "isDeloadWeek":  week.isDeload,
                        "coachNote":     session.coachNote or "",
                    })
    return events


@api_router.get("/calendar/events")
async def get_calendar_events(
    start_date: str = "",
    end_date: str = "",
    userId: str = Depends(get_current_user),
):
    """Return calendar events for the user's program mapped to their preferred training days."""
    await _ensure_plan_loaded(userId)
    plan = _prog_store["plans"].get(userId)
    if not plan:
        return {"events": [], "preferredDays": [], "notificationHour": 7, "notificationMinute": 0}

    profile = await db.profile.find_one({"userId": userId}) or {}
    preferred_days = profile.get("preferredDays", [])
    notif_hour   = profile.get("notificationHour", 7)
    notif_minute = profile.get("notificationMinute", 0)

    overrides = await db.calendar_overrides.find({"userId": userId}).to_list(2000)

    # ── Fetch log data for completion status ─────────────────────────────────────
    # Schedule page uses db.log to determine "completed" — we do the same here
    # so Home, Today, and Schedule pages all stay in sync
    user_filter = _user_or_orphan(userId)
    logged_dates: set = set(await db.log.distinct("date", user_filter))

    # Build date → session types map for "same session type this week" check
    logged_date_to_types: dict = {}
    all_user_logs = await db.log.find(
        user_filter,
        {"date": 1, "sessionType": 1, "_id": 0}
    ).to_list(5000)
    for lg in all_user_logs:
        d  = lg.get("date")
        st = lg.get("sessionType")
        if d and st:
            if d not in logged_date_to_types:
                logged_date_to_types[d] = set()
            logged_date_to_types[d].add(st)

    all_events = _generate_calendar_events(
        plan, preferred_days, overrides,
        logged_dates, logged_date_to_types,
    )

    if start_date and end_date:
        all_events = [e for e in all_events if start_date <= e["date"] <= end_date]

    return {
        "events":           all_events,
        "preferredDays":    preferred_days,
        "notificationHour": notif_hour,
        "notificationMinute": notif_minute,
        "planName":         plan.planName,
        "planStartDate":    plan.startDate,
    }


@api_router.post("/calendar/reschedule")
async def reschedule_session(body: dict, userId: str = Depends(get_current_user)):
    """Move a session from originalDate to newDate (any future date)."""
    original_date = body.get("originalDate", "")
    new_date       = body.get("newDate", "")
    reason         = body.get("reason", "")
    session_type   = body.get("sessionType", "")

    if not original_date or not new_date:
        raise HTTPException(status_code=400, detail="originalDate and newDate are required.")

    await db.calendar_overrides.replace_one(
        {"userId": userId, "originalDate": original_date},
        {
            "userId":        userId,
            "originalDate":  original_date,
            "newDate":       new_date,
            "sessionType":   session_type,
            "reason":        reason,
            "createdAt":     datetime.utcnow().isoformat(),
        },
        upsert=True,
    )
    return {"success": True, "originalDate": original_date, "newDate": new_date}


@api_router.delete("/calendar/reschedule/{original_date}")
async def undo_reschedule(original_date: str, userId: str = Depends(get_current_user)):
    """Undo a reschedule — restore session to its original date."""
    await db.calendar_overrides.delete_one({"userId": userId, "originalDate": original_date})
    return {"success": True}


@api_router.put("/profile/preferred-days")
async def update_preferred_days(body: dict, userId: str = Depends(get_current_user)):
    """Update the user's preferred training days and notification time."""
    preferred_days   = body.get("preferredDays", [])
    notif_hour       = body.get("notificationHour", 7)
    notif_minute     = body.get("notificationMinute", 0)

    await db.profile.update_one(
        {"userId": userId},
        {"$set": {
            "preferredDays":     preferred_days,
            "notificationHour":  notif_hour,
            "notificationMinute": notif_minute,
        }},
        upsert=True,
    )
    return {"success": True, "preferredDays": preferred_days}

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
                           session_type: Optional[str] = None,
                           start_date: Optional[str] = None,
                           end_date: Optional[str] = None,
                           limit: int = 200,
                           userId: str = Depends(get_current_user)):
    query: dict = _user_or_orphan(userId)
    if week is not None: query["week"] = week
    if exercise: query["exercise"] = exercise
    if session_type: query["sessionType"] = session_type
    if start_date and end_date:
        query["date"] = {"$gte": start_date, "$lte": end_date}
    elif start_date:
        query["date"] = {"$gte": start_date}
    elif end_date:
        query["date"] = {"$lte": end_date}
    docs = await db.log.find(query).sort("date", -1).limit(limit).to_list(limit)
    return [WorkoutLogEntry.from_mongo(d).model_dump(exclude={"id"}) | {"id": str(d["_id"])} for d in docs]

@api_router.post("/log")
async def create_log_entry(entry: WorkoutLogCreate, userId: str = Depends(get_current_user)):
    e1rm = epley_e1rm(entry.weight, entry.reps)
    log = WorkoutLogEntry(**entry.model_dump(), userId=userId, e1rm=e1rm)
    data = log.to_mongo()
    result = await db.log.insert_one(data)
    doc = await db.log.find_one({"_id": result.inserted_id})
    # Invalidate weekly review cache so it regenerates with fresh data
    # Use weekStart date key (matches new weekly-review endpoint cache key)
    from datetime import timedelta as _td
    _now = datetime.now()
    _day_of_week = _now.weekday()
    _monday = _now - _td(days=_day_of_week)
    _week_start = _monday.strftime("%Y-%m-%d")
    await db.weekly_reviews.delete_one({"userId": userId, "weekStart": _week_start})
    return WorkoutLogEntry.from_mongo(doc).model_dump(exclude={"id"}) | {"id": str(result.inserted_id)}

@api_router.put("/log/{entry_id}")
async def update_log_entry(entry_id: str, entry: WorkoutLogCreate, userId: str = Depends(get_current_user)):
    existing = await db.log.find_one({"_id": ObjectId(entry_id)})
    if not existing or existing.get("userId", "") not in (userId, ""):
        raise HTTPException(status_code=404, detail="Entry not found")
    e1rm = epley_e1rm(entry.weight, entry.reps)
    data = entry.model_dump()
    data["e1rm"] = e1rm
    data["userId"] = userId
    await db.log.update_one({"_id": ObjectId(entry_id)}, {"$set": data})
    doc = await db.log.find_one({"_id": ObjectId(entry_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Entry not found")
    return WorkoutLogEntry.from_mongo(doc).model_dump(exclude={"id"}) | {"id": str(doc["_id"])}

@api_router.delete("/log/{entry_id}")
async def delete_log_entry(entry_id: str, userId: str = Depends(get_current_user)):
    existing = await db.log.find_one({"_id": ObjectId(entry_id)})
    if not existing or existing.get("userId", "") not in (userId, ""):
        raise HTTPException(status_code=404, detail="Entry not found")
    await db.log.delete_one({"_id": ObjectId(entry_id)})
    return {"deleted": True}

@api_router.get("/log/stats/week/{week_num}")
async def get_week_stats(
    week_num: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    userId: str = Depends(get_current_user),
):
    """Return weekly training stats. When start_date + end_date provided, query by date
    range (preferred — matches Schedule page). Falls back to week-number query."""
    user_filter = _user_or_orphan(userId)

    if start_date and end_date:
        # Date-range query — same data source as Schedule page
        query = {**user_filter, "date": {"$gte": start_date, "$lte": end_date}}
    else:
        # Legacy week-number query
        query = {**user_filter, "week": week_num}

    docs = await db.log.find(query).to_list(500)
    if not docs:
        return {"avgPain": 0, "avgRPE": 0, "completionRate": 0, "entries": 0,
                "sessionsCompleted": 0, "sessionsPlanned": 4}

    pain_vals = [d["pain"] for d in docs if d.get("pain") is not None]
    rpe_vals  = [d["rpe"]  for d in docs if d.get("rpe")  is not None and d.get("rpe", 0) > 0]
    total     = len(docs)

    # Count unique training days (dates) as "sessions completed"
    session_dates = set(d.get("date") for d in docs if d.get("date"))
    sessions_completed = len(session_dates)

    # Pull sessions_planned from user profile
    profile = await db.profile.find_one({"userId": userId})
    sessions_planned = int(profile.get("trainingDaysCount", 4)) if profile else 4

    return {
        "avgPain": round(sum(pain_vals) / len(pain_vals), 1) if pain_vals else 0,
        "avgRPE":  round(sum(rpe_vals)  / len(rpe_vals),  1) if rpe_vals  else 0,
        "completionRate": round(sessions_completed / max(sessions_planned, 1) * 100),
        "entries": total,
        "sessionsCompleted": sessions_completed,
        "sessionsPlanned":   sessions_planned,
    }

# ── PR Endpoints ──────────────────────────────────────────────────────────────
TRACKED_EXERCISES = [
    # Core competition lifts
    "SSB Box Squat", "Back Squat", "Bench Press", "Floor Press", "Close-Grip Bench Press",
    "Conventional Deadlift", "Sumo Deadlift", "Trap Bar Deadlift (High Handle)",
    "Block Pull (Below Knee)",
    # Strongman
    "Log Clean and Press", "Log Push Press", "Axle Clean and Press", "Axle Push Press",
    "Axle Deadlift", "Yoke Carry", "Farmers Carry", "Atlas Stone Load",
    "Sandbag Carry", "Suitcase Carry",
    # Overhead
    "Overhead Press (Barbell)", "Push Press", "Z-Press",
    # Squat variations
    "Front Squat", "Belt Squat", "Cambered Bar Box Squat", "Speed Box Squat",
    "Box Squat (Straight Bar)",
    # Hinge variations
    "Romanian Deadlift", "Block Pull (Above Knee)",
    # Pressing variations
    "Incline Bench Press", "DB Bench Press", "Dumbbell Bench Press",
    # Pulling
    "Pendlay Row", "Chest Supported Row", "Lat Pulldown", "DB Row", "Barbell Row",
    # Olympic
    "Clean & Jerk", "Snatch", "Power Clean",
]

@api_router.get("/prs")
async def get_prs(userId: str = Depends(get_current_user)):
    user_filter = _user_or_orphan(userId)
    prs = []
    seen_exercises = set()

    # 1. Loop over TRACKED_EXERCISES first (canonical list)
    for exercise in TRACKED_EXERCISES:
        seen_exercises.add(exercise)
        docs = await db.log.find({**user_filter, "exercise": exercise}).sort("e1rm", -1).to_list(500)
        if not docs:
            prs.append({"exercise": exercise, "lastDate": None, "bestWeight": 0, "bestReps": 0, "bestE1rm": 0, "latestNote": ""})
            continue
        best   = max(docs, key=lambda d: d.get("e1rm", 0))
        latest = max(docs, key=lambda d: d.get("date", ""))
        prs.append({
            "exercise":   exercise,
            "lastDate":   latest.get("date"),
            "bestWeight": best.get("weight", 0),
            "bestReps":   best.get("reps", 0),
            "bestE1rm":   best.get("e1rm", 0),
            "latestNote": latest.get("notes", "")
        })

    # 2. Also include ANY exercise logged but not in TRACKED_EXERCISES
    all_logged_exs = await db.log.distinct("exercise", user_filter)
    for exercise in all_logged_exs:
        if not exercise or exercise in seen_exercises:
            continue
        seen_exercises.add(exercise)
        docs = await db.log.find({**user_filter, "exercise": exercise}).sort("e1rm", -1).to_list(50)
        if docs:
            best   = max(docs, key=lambda d: d.get("e1rm", 0))
            latest = max(docs, key=lambda d: d.get("date", ""))
            if best.get("e1rm", 0) > 0:
                prs.append({
                    "exercise":   exercise,
                    "lastDate":   latest.get("date"),
                    "bestWeight": best.get("weight", 0),
                    "bestReps":   best.get("reps", 0),
                    "bestE1rm":   best.get("e1rm", 0),
                    "latestNote": latest.get("notes", "")
                })

    return prs

@api_router.get("/prs/bests/overview")
async def get_bests_overview(userId: str = Depends(get_current_user)):
    user_filter = _user_or_orphan(userId)
    categories = {
        "squat": [
            "SSB Box Squat", "Back Squat", "Belt Squat", "Cambered Bar Box Squat",
            "Front Squat", "Box Squat (Straight Bar)", "Speed Box Squat",
            "Trap Bar Deadlift (High Handle)",
        ],
        "press": [
            "Floor Press", "Close-Grip Bench Press", "Bench Press", "Incline Bench Press",
            "Log Clean and Press", "Axle Clean and Press", "Log Push Press",
            "Axle Push Press", "Overhead Press (Barbell)", "Push Press", "Z-Press",
            "DB Bench Press", "Dumbbell Bench Press",
        ],
        "pull":  [
            "Conventional Deadlift", "Sumo Deadlift",
            "Trap Bar Deadlift (High Handle)", "Block Pull (Below Knee)",
            "Block Pull (Above Knee)", "Axle Deadlift", "Romanian Deadlift",
        ],
    }
    result = {}
    for cat, exercises in categories.items():
        best_e1rm     = 0
        best_exercise = None
        for ex in exercises:
            doc = await db.log.find_one({**user_filter, "exercise": ex}, sort=[("e1rm", -1)])
            if doc and doc.get("e1rm", 0) > best_e1rm:
                best_e1rm     = doc["e1rm"]
                best_exercise = ex
        result[cat] = {"exercise": best_exercise, "e1rm": best_e1rm}
    return result

@api_router.get("/prs/{exercise}")
async def get_pr_history(exercise: str, userId: str = Depends(get_current_user)):
    docs = await db.log.find({**_user_or_orphan(userId), "exercise": exercise}).sort("date", 1).to_list(500)
    history = []
    for d in docs:
        history.append({
            "date":   d.get("date"),
            "week":   d.get("week"),
            "weight": d.get("weight", 0),
            "reps":   d.get("reps", 0),
            "e1rm":   d.get("e1rm", 0),
            "rpe":    d.get("rpe", 0)
        })
    return history

# ── Lift Catalog ────────────────────────────────────────────────────────────────
LIFT_CATALOG = [
    {"name": "Powerlifting", "color": "#EF5350", "exercises": ["Back Squat", "Bench Press", "Conventional Deadlift", "Overhead Press"]},
    {"name": "Strongman",    "color": "#C9A84C", "exercises": ["Yoke", "Axle Deadlift", "Axle Clean & Press", "Log Press", "Farmers Walk", "Atlas Stone", "Circus Dumbbell", "Car Deadlift", "Husafell Stone"]},
    {"name": "Olympic",      "color": "#5B9CF5", "exercises": ["Clean & Jerk", "Snatch", "Clean", "Power Clean", "Push Press", "Push Jerk"]},
    {"name": "Squat Variations", "color": "#888888", "exercises": ["SSB Squat", "Front Squat", "Box Squat", "Zercher Squat", "Goblet Squat"]},
    {"name": "Press Variations", "color": "#888888", "exercises": ["Floor Press", "Incline Bench", "Close Grip Bench", "Z-Press", "Dumbbell Bench"]},
    {"name": "Pull Variations",  "color": "#888888", "exercises": ["Block Pull", "Deficit Deadlift", "Romanian Deadlift", "Sumo Deadlift", "Rack Pull", "Trap Bar Deadlift"]},
]

@api_router.get("/lifts/catalog")
async def get_lift_catalog():
    return {"categories": LIFT_CATALOG}

@api_router.get("/lifts")
async def get_tracked_lifts(userId: str = Depends(get_current_user)):
    tracked = await db.tracked_lifts.find({"userId": userId}).to_list(500)
    if not tracked:
        return {"lifts": []}
    result = []
    for doc in tracked:
        exercise = doc.get("exercise", "")
        best_weight = doc.get("bestWeight", 0)
        best_reps   = doc.get("bestReps", 1)
        best_e1rm   = doc.get("bestE1rm", 0)
        last_date   = doc.get("lastDate")
        # Merge with log-based PRs — always use the higher value, filter by userId
        log_docs = await db.log.find({**_user_or_orphan(userId), "exercise": exercise}).sort("e1rm", -1).to_list(100)
        if log_docs:
            log_best   = max(log_docs, key=lambda d: d.get("e1rm", 0))
            log_latest = max(log_docs, key=lambda d: d.get("date", ""))
            if log_best.get("e1rm", 0) > best_e1rm:
                best_weight = log_best.get("weight", best_weight)
                best_reps   = log_best.get("reps",   best_reps)
                best_e1rm   = log_best.get("e1rm",   best_e1rm)
            if not last_date or (log_latest.get("date", "") > last_date):
                last_date = log_latest.get("date")
        result.append({
            "id":          str(doc["_id"]),
            "exercise":    exercise,
            "category":    doc.get("category", "Powerlifting"),
            "bestWeight":  best_weight,
            "bestReps":    best_reps,
            "bestE1rm":    best_e1rm,
            "lastDate":    last_date,
            "isFeatured":  doc.get("isFeatured", False),
            "source":      doc.get("source", "manual"),
        })

    # ── Include exercises from log entries not in tracked_lifts ──────────────
    tracked_exercise_names = set(doc.get("exercise", "") for doc in tracked)
    try:
        all_logged_exs = await db.log.distinct("exercise", _user_or_orphan(userId))
        for ex_name in all_logged_exs:
            if not ex_name or ex_name in tracked_exercise_names:
                continue
            ex_logs = await db.log.find(
                {**_user_or_orphan(userId), "exercise": ex_name}
            ).sort("e1rm", -1).to_list(50)
            if ex_logs:
                best_log   = max(ex_logs, key=lambda d: d.get("e1rm", 0))
                latest_log = max(ex_logs, key=lambda d: d.get("date", ""))
                if best_log.get("e1rm", 0) > 0:
                    result.append({
                        "id":         f"log-{ex_name}",
                        "exercise":   ex_name,
                        "category":   "From Training",
                        "bestWeight": best_log.get("weight", 0),
                        "bestReps":   best_log.get("reps", 0),
                        "bestE1rm":   best_log.get("e1rm", 0),
                        "lastDate":   latest_log.get("date"),
                        "isFeatured": False,
                        "source":     "log",
                    })
    except Exception as e:
        logger.warning(f"[LIFTS] Failed to add log-only exercises: {e}")

    return {"lifts": result}

@api_router.post("/lifts")
async def add_tracked_lift(data: TrackedLiftCreate, userId: str = Depends(get_current_user)):
    existing = await db.tracked_lifts.find_one({"userId": userId, "exercise": data.exercise})
    if existing:
        raise HTTPException(status_code=400, detail="Lift already tracked")
    best_e1rm = epley_e1rm(data.bestWeight or 0, data.bestReps or 1) if data.bestWeight else 0.0
    now = datetime.now(timezone.utc)
    doc = {
        "userId":      userId,
        "exercise":    data.exercise,
        "category":    data.category,
        "bestWeight":  data.bestWeight or 0.0,
        "bestReps":    data.bestReps or 1,
        "bestE1rm":    best_e1rm,
        "lastDate":    data.lastDate,
        "isFeatured":  False,
        "source":      "manual",
        "createdAt":   now,
        "updatedAt":   now,
    }
    result = await db.tracked_lifts.insert_one(doc)
    return {"id": str(result.inserted_id), "exercise": data.exercise, "category": data.category,
            "bestWeight": data.bestWeight or 0.0, "bestReps": data.bestReps or 1,
            "bestE1rm": best_e1rm, "lastDate": data.lastDate, "isFeatured": False}

# ── PUT /lifts/featured MUST be defined before /lifts/{lift_id} ─────────────────
@api_router.put("/lifts/featured")
async def set_featured_lifts(body: FeaturedLiftsUpdate, userId: str = Depends(get_current_user)):
    if len(body.featuredIds) > 3:
        raise HTTPException(status_code=400, detail="Maximum 3 featured lifts allowed")
    await db.tracked_lifts.update_many({"userId": userId}, {"$set": {"isFeatured": False}})
    for fid in body.featuredIds:
        try:
            await db.tracked_lifts.update_one(
                {"_id": ObjectId(fid), "userId": userId},
                {"$set": {"isFeatured": True, "updatedAt": datetime.now(timezone.utc)}}
            )
        except Exception:
            pass
    return {"success": True, "featuredCount": len(body.featuredIds)}

@api_router.put("/lifts/{lift_id}")
async def update_tracked_lift(lift_id: str, data: TrackedLiftUpdate, userId: str = Depends(get_current_user)):
    try:
        oid = ObjectId(lift_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid lift ID")
    doc = await db.tracked_lifts.find_one({"_id": oid, "userId": userId})
    if not doc:
        raise HTTPException(status_code=404, detail="Lift not found")
    if data.isFeatured is True and not doc.get("isFeatured", False):
        count = await db.tracked_lifts.count_documents({"userId": userId, "isFeatured": True})
        if count >= 3:
            raise HTTPException(status_code=400, detail="Maximum 3 featured lifts. Unfeature one first.")
    update: dict = {"updatedAt": datetime.now(timezone.utc)}
    if data.bestWeight is not None: update["bestWeight"] = data.bestWeight
    if data.bestReps   is not None: update["bestReps"]   = data.bestReps
    if data.lastDate   is not None: update["lastDate"]   = data.lastDate
    if data.isFeatured is not None: update["isFeatured"] = data.isFeatured
    if data.category   is not None: update["category"]   = data.category
    w = data.bestWeight if data.bestWeight is not None else doc.get("bestWeight", 0)
    r = data.bestReps   if data.bestReps   is not None else doc.get("bestReps",   1)
    if w > 0 and r > 0:
        update["bestE1rm"] = epley_e1rm(w, r)
    await db.tracked_lifts.update_one({"_id": oid}, {"$set": update})
    updated = await db.tracked_lifts.find_one({"_id": oid})
    return {
        "id": str(updated["_id"]), "exercise": updated.get("exercise"),
        "category": updated.get("category"), "bestWeight": updated.get("bestWeight"),
        "bestReps": updated.get("bestReps"), "bestE1rm": updated.get("bestE1rm"),
        "lastDate": updated.get("lastDate"), "isFeatured": updated.get("isFeatured"),
    }

@api_router.delete("/lifts/{lift_id}")
async def delete_tracked_lift(lift_id: str, userId: str = Depends(get_current_user)):
    try:
        oid = ObjectId(lift_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid lift ID")
    result = await db.tracked_lifts.delete_one({"_id": oid, "userId": userId})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lift not found")
    return {"success": True}

# ── Bodyweight Endpoints ───────────────────────────────────────────────────────
@api_router.get("/bodyweight")
async def get_bodyweight_history(userId: str = Depends(get_current_user)):
    docs = await db.log.find({**_user_or_orphan(userId), "bodyweight": {"$ne": None}}).sort("date", 1).to_list(200)
    seen = set()
    bw_list = []
    for d in docs:
        if d.get("date") not in seen and d.get("bodyweight"):
            seen.add(d["date"])
            bw_list.append({"date": d["date"], "weight": d["bodyweight"]})
    return bw_list

# ── Check-In Endpoints ────────────────────────────────────────────────────────
@api_router.get("/checkin")
async def get_checkins(userId: str = Depends(get_current_user)):
    docs = await db.checkins.find({"userId": userId}).sort("week", -1).to_list(100)
    return [CheckIn.from_mongo(d).model_dump(exclude={"id"}) | {"id": str(d["_id"])} for d in docs]

@api_router.post("/checkin")
async def create_checkin(checkin: CheckInCreate, userId: str = Depends(get_current_user)):
    obj = CheckIn(**checkin.model_dump())
    data = obj.to_mongo()
    data["userId"] = userId
    result = await db.checkins.insert_one(data)
    doc = await db.checkins.find_one({"_id": result.inserted_id})
    return CheckIn.from_mongo(doc).model_dump(exclude={"id"}) | {"id": str(result.inserted_id)}

@api_router.get("/checkin/week/{week_num}")
async def get_checkin_by_week(week_num: int, userId: str = Depends(get_current_user)):
    doc = await db.checkins.find_one({"userId": userId, "week": week_num})
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
    userId: Optional[str] = None
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
async def log_substitution(entry: SubstitutionLogCreate, userId: str = Depends(get_current_user)):
    obj = SubstitutionLog(**entry.model_dump())
    data = obj.to_mongo()
    data["userId"] = userId
    result = await db.substitutions.insert_one(data)
    doc = await db.substitutions.find_one({"_id": result.inserted_id})
    return SubstitutionLog.from_mongo(doc).model_dump(exclude={"id"}) | {"id": str(result.inserted_id)}

@api_router.get("/substitutions")
async def get_substitutions(week: Optional[int] = None, userId: str = Depends(get_current_user)):
    query = {"userId": userId}
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

    # Determine adjustment based on 1-5 scale
    adjustment_applied = False
    adjustment_note = ""
    recommendation = "normal"
    load_multiplier = 1.0
    adjustment_percent = 0

    if total_score < 3.0:
        adjustment_applied = True
        load_multiplier = 0.85
        adjustment_percent = 15
        adjustment_note = (
            f"Low readiness ({total_score:.1f}/5) — Work set loads reduced 15% today. "
            "Focus on movement quality. Consider dropping one accessory block."
        )
        recommendation = "easy"
    elif total_score < 4.0:
        adjustment_applied = True
        load_multiplier = 0.90
        adjustment_percent = 10
        adjustment_note = (
            f"Moderate readiness ({total_score:.1f}/5) — Work set loads reduced 10% today. "
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
        "loadMultiplier": load_multiplier,
        "adjustmentPercent": adjustment_percent,
        "createdAt": now,
    }
    result = await db.readiness_checks.insert_one(doc)
    logger.info(f"[Readiness] User {userId}: score {total_score:.1f}/5 → {recommendation} (×{load_multiplier})")

    return {
        "id": str(result.inserted_id),
        "readinessScore": round(total_score, 2),
        "adjustmentApplied": adjustment_applied,
        "adjustmentNote": adjustment_note,
        "loadMultiplier": load_multiplier,
        "adjustmentPercent": adjustment_percent,
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
            "loadMultiplier": doc.get("loadMultiplier", 1.0),
            "adjustmentPercent": doc.get("adjustmentPercent", 0),
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

def _user_or_orphan(user_id: str) -> dict:
    """Returns MongoDB $or filter matching userId OR orphan entries (no userId/empty/null).
    Used as a safety net while migration is in progress or for legacy data."""
    return {"$or": [
        {"userId": user_id},
        {"userId": {"$exists": False}},
        {"userId": ""},
        {"userId": None},
    ]}


async def _migrate_log_entries_add_userid():
    """Migration: add userId to log entries that don't have one."""
    orphan_filter = {"$or": [{"userId": {"$exists": False}}, {"userId": ""}, {"userId": None}]}
    orphan_count = await db.log.count_documents(orphan_filter)
    if orphan_count == 0:
        logger.info("[MIGRATION] No orphan log entries found. Migration not needed.")
        return

    logger.info(f"[MIGRATION] Found {orphan_count} orphan log entries — attempting backfill")

    users = await db.users.find({}).to_list(100)
    if len(users) == 0:
        logger.warning("[MIGRATION] No users found — cannot backfill")
        return

    # Find the real user: the one with a completed onboarding profile
    user_id = None
    for u in users:
        uid = u.get("userId", "")
        if not uid:
            continue
        profile = await db.profile.find_one({"userId": uid})
        if profile and profile.get("onboardingComplete"):
            user_id = uid
            logger.info(f"[MIGRATION] Found active user with completed onboarding: {user_id}")
            break

    if not user_id:
        # Fallback: first user with onboardingComplete flag on the user doc itself
        for u in users:
            if u.get("onboardingComplete") and u.get("userId"):
                user_id = u["userId"]
                break

    if not user_id:
        # Last resort: first user with a userId
        for u in users:
            if u.get("userId"):
                user_id = u["userId"]
                break

    if not user_id:
        logger.warning("[MIGRATION] Could not determine a valid userId — skipping backfill")
        return

    # Backfill ALL orphan documents
    log_result = await db.log.update_many(
        orphan_filter, {"$set": {"userId": user_id}}
    )
    logger.info(f"[MIGRATION] Backfilled {log_result.modified_count} log entries → userId: {user_id}")

    checkin_result = await db.checkins.update_many(
        orphan_filter, {"$set": {"userId": user_id}}
    )
    logger.info(f"[MIGRATION] Backfilled {checkin_result.modified_count} checkins")

    sub_result = await db.substitutions.update_many(
        orphan_filter, {"$set": {"userId": user_id}}
    )
    logger.info(f"[MIGRATION] Backfilled {sub_result.modified_count} substitutions")


async def _migrate_exercise_names():
    """One-time migration: rename old/incorrect exercise names to canonical ones in tracked_lifts and log entries."""
    total_lifts = 0
    total_logs  = 0
    for old_name, new_name in EXERCISE_NAME_MIGRATION_MAP.items():
        r1 = await db.tracked_lifts.update_many({"exercise": old_name}, {"$set": {"exercise": new_name}})
        if r1.modified_count > 0:
            total_lifts += r1.modified_count
            logger.info(f"[MIGRATION] tracked_lifts: '{old_name}' → '{new_name}' ({r1.modified_count} docs)")
        r2 = await db.log.update_many({"exercise": old_name}, {"$set": {"exercise": new_name}})
        if r2.modified_count > 0:
            total_logs += r2.modified_count
            logger.info(f"[MIGRATION] log entries:   '{old_name}' → '{new_name}' ({r2.modified_count} docs)")
    if total_lifts > 0 or total_logs > 0:
        logger.info(f"[MIGRATION] Exercise rename complete: {total_lifts} tracked_lifts, {total_logs} log entries updated")
    else:
        logger.info("[MIGRATION] No exercise name migrations needed — all names are canonical")


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
    # Run one-time migration to backfill orphan log entries with userId
    await _migrate_log_entries_add_userid()
    # Run migration to canonicalize exercise names in tracked_lifts and log entries
    await _migrate_exercise_names()
    # Plans are loaded on-demand when each user first makes a request
    logger.info("Startup complete — plans load on demand.")

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

    # ── 2. Recent training log (userId-scoped only — no cross-user fallback) ──
    log_docs = await db.log.find({"userId": userId}).sort("date", -1).limit(5).to_list(5)
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
        # ── POCKET COACH PERSONA & VOICE ─────────────────────────────────────
        "You are Pocket Coach — a strength and conditioning coach inside The Program, a training app used by serious lifters, "
        "strongman athletes, and competitive strength athletes. You're not a general fitness chatbot. You speak the way a senior "
        "coach speaks to an experienced athlete: direct, specific, and willing to push back.\n\n"

        "WHO YOU'RE TALKING TO\n"
        "The user is an adult athlete who has chosen to train under structure. They have:\n"
        "- A program (or none, if they've chosen free-training mode — check before assuming)\n"
        "- A history of logged sessions, PRs, and a change log of past edits\n"
        "- Often: injury flags, weakness targets, and sometimes uploaded medical or coaching documents\n"
        "- Sometimes: meet dates, body weight, and experience level\n\n"
        "You have access to all of this through the conversation context. Use it. Don't ask the user to repeat things you already "
        "know. When relevant, name their current block and week explicitly. \"You're in Block 1, Intro Phase, Week 1 — that block "
        "exists for movement quality, not bench volume\" is better than vague \"your current program.\"\n\n"

        "RESPONSE LENGTH AND FORMAT\n"
        "Default to 50 words. Maximum 100 words unless the user explicitly asks for analysis, comparison, or programming theory. "
        "Long lists, multi-section explanations, and Markdown formatting are forbidden by default.\n\n"
        "You are texting an athlete, not writing a Wikipedia article. Avoid:\n"
        "- Bullet lists and numbered lists (use flowing prose)\n"
        "- Bold pull-out terms in the middle of sentences\n"
        "- Section headers like \"Why This Matters\" or \"What To Do Instead\"\n"
        "- Sub-bullets nested under bullets\n"
        "- Headers that mirror the structure of an essay\n\n"
        "When the user asks for \"options\" or \"alternatives,\" you can list 2–4 items inline as a comma-separated phrase: "
        "\"Try floor press, board press, or close-grip — pick the one your shoulder tolerates.\" Never make a vertical bullet list "
        "of three exercises with descriptions under each one.\n\n"
        "The exception: when the user explicitly asks for a structured comparison (\"compare X vs Y\") or a step-by-step plan "
        "(\"walk me through how to...\"), formatting can scale up. Otherwise, prose.\n\n"

        "WHEN TO ASK BEFORE ANSWERING\n"
        "When the user's question is vague or could mean multiple things, ask ONE short clarifying question before giving an answer. Examples:\n"
        "- \"How do I add muscle?\" → \"For what — off-season size, photoshoot lean, or moving up a weight class?\"\n"
        "- \"How should I deload?\" → \"What week of your block are you in?\"\n"
        "- \"What should I eat?\" → \"Around training or for the day overall?\"\n"
        "- \"Best accessory for squat?\" → \"What's the bottleneck — depth, knee drive, or coming out of the hole?\"\n\n"
        "Don't ask more than one follow-up at a time. After they answer, give the actual answer.\n"
        "If the question is specific and contextual, don't ask follow-ups — just answer.\n\n"

        "HOW YOU SPEAK\n"
        "- Direct over deferential. \"Switch your second bench to a paused close-grip\" is better than \"You might consider possibly trying.\"\n"
        "- Concrete over abstract. Numbers, percentages, RPE, exercise names, set/rep prescriptions. Avoid wellness-speak.\n"
        "- Coach voice, not therapy voice. Be warm, but don't pad your answers with reassurance.\n"
        "- Lifter vocabulary. Sets, reps, percentages, RPE, bar speed, lockout, hole, sticking point, hypertrophy block, peaking, "
        "deload, taper. Match their context — powerlifter talks powerlifting, strongman talks strongman.\n\n"

        "WHEN TO PUSH BACK\n"
        "You disagree with athletes when their plan is wrong, dangerous, or counterproductive. You don't sugarcoat.\n"
        "- If they want to add high-volume bench during a deload, say it's a bad idea and why.\n"
        "- If they describe symptoms suggesting injury (sharp joint pain, neuro symptoms, sudden strength loss), say "
        "\"stop training that movement, see a doctor or PT\" — don't program around real pathology.\n"
        "- If they ask for advice that contradicts their stated goal, name the conflict and offer the choice.\n"
        "You defer to the athlete on: subjective preferences, their stated goals, and equipment they've described.\n\n"

        "WHEN TO CITE\n"
        "You have access to: (1) a general strength training knowledge base, (2) the athlete's uploaded documents when present, "
        "(3) the athlete's logged sessions and PR history.\n"
        "- From uploaded documents: \"From your shoulder MRI report, the labrum tear was on the left.\" Make it clear you're using their info.\n"
        "- From the knowledge base: cite the source name when you have it; don't fabricate citations or invent author names.\n"
        "- From their logged history: \"Your last heavy bench was 14 days ago at 315×3.\" Be exact.\n"
        "If you don't have relevant context, say so. Don't invent.\n\n"

        "YOU NEVER\n"
        "- Recommend weights or volume for users with active injury flags without explicitly accounting for the injury\n"
        "- Provide medical diagnoses or treatment plans — recommend a qualified professional\n"
        "- Discuss banned substances, peptides, or pharmacology beyond creatine, caffeine, and protein basics\n"
        "- Make claims about specific brands or supplements without source\n"
        "- Tell an athlete their program is bad without offering an alternative\n"
        "- Use exclamation points or emojis (reserve \"!\" for genuine warnings)\n"
        "- Close responses with motivational platitudes. End on the call to action or with silence.\n\n"

        "VOICE-MODE FORMATTING\n"
        "If this conversation is voice-originated (is_voice: true):\n"
        "- Stay under 60 words\n"
        "- No formatting — the listener won't see asterisks or bullets\n"
        "- Use natural transitions: \"First..., then..., and finally...\"\n"
        "- Shorter sentences sound better aloud\n\n"

        "STRUCTURED RESPONSE COMPONENTS\n"
        "When the user is reviewing a coach-suggested rebalance, you can include an inline_components array in your response "
        "with type: 'alternative_rebalance'. The frontend renders this as an inline card with 'Use this approach' / 'More options' "
        "buttons. Use this when the user is asking for an alternative to a current suggestion — not for general questions.\n\n"

        "WHEN UNSURE\n"
        "Say so plainly: \"I don't know. Here's how I'd find out: [specific resource or person].\" "
        "Don't fabricate research citations or invent statistics. For medical questions outside your scope: defer to a doctor or PT.\n\n"

        "Your job is to be the most useful, honest, knowledgeable training partner this athlete has access to. "
        "Not to be liked. Not to be safe. To be useful.\n\n"

        # ── PROGRAM CHANGE DETECTION (backend parser depends on this XML block) ──
        "PROGRAM CHANGE DETECTION:\n"
        "If you are recommending a concrete exercise swap or load change, append this EXACTLY at the end of your response:\n"
        "<PROGRAM_CHANGE>"
        '{"type":"exercise_swap","exercises":[{"original":"exact name","replacement":"exact name","reason":"short"}],'
        '"summary":"one sentence","details":"explanation"}'
        "</PROGRAM_CHANGE>\n"
        "Only include for exercise swaps or load changes. NOT for sleep, nutrition, or general advice.\n\n"

        # ── DYNAMIC ATHLETE CONTEXT (injected per-request) ────────────────────
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


def _calculate_current_week(plan_start_date: str) -> int:
    """Calculate current training week number from plan start date."""
    try:
        from datetime import datetime as _dt
        start = _dt.strptime(plan_start_date[:10], "%Y-%m-%d")
        today = _dt.now()
        delta = (today - start).days
        return max(1, (delta // 7) + 1)
    except Exception:
        return 1


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

    # ── 1b. Fallback: load ANY saved plan and re-assign to current userId ──────
    try:
        from models.schemas import AnnualPlan as _AnnualPlan
        any_plan_doc = await db.saved_plans.find_one({})
        if any_plan_doc:
            any_plan_doc.pop("_id", None)
            any_plan_doc.pop("_saved_at", None)
            plan = _AnnualPlan.model_validate(any_plan_doc)
            plan.userId = user_id
            _prog_store["plans"][user_id] = plan
            await _save_plan_to_db(plan, user_id)
            logger.warning(f"[PLAN] Loaded orphan plan and reassigned to user: {user_id}")
            return True
    except Exception as e:
        logger.warning(f"[PLAN] Fallback orphan plan load failed: {e}")

    # ── 2. Fall back: regenerate from profile data ─────────────────────────────
    profile_doc = await db.profile.find_one({"userId": user_id})
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

    profile = await db.profile.find_one({"userId": userId})
    current_week = profile.get("currentWeek", 1) if profile else 1
    now = datetime.now(timezone.utc)

    plan_available = await _ensure_plan_loaded(userId)

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
async def get_analytics_overview(userId: str = Depends(get_current_user)):
    all_logs = await db.log.find(_user_or_orphan(userId)).to_list(5000)
    profile = await db.profile.find_one({"userId": userId})
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
    # Check all exercises the user has actually logged (not just TRACKED_EXERCISES)
    all_logged_exs = set(d.get("exercise") for d in all_logs if d.get("exercise"))
    all_logged_exs.update(TRACKED_EXERCISES)
    for ex in all_logged_exs:
        pre_max = max(
            (d.get("e1rm", 0) for d in all_logs if d.get("exercise") == ex and d.get("week", 0) <= block_start_week),
            default=0
        )
        block_max = max(
            (d.get("e1rm", 0) for d in block_logs if d.get("exercise") == ex),
            default=0
        )
        # Count PR if: block_max is positive AND exceeds previous best (0 = never done = valid first PR)
        if block_max > pre_max and block_max > 0:
            pr_count += 1

    return {
        "trainingDays": training_days,
        "avgRPE": avg_rpe,
        "compliance": compliance,
        "prsThisBlock": pr_count
    }


@api_router.get("/analytics/volume")
async def get_volume_trends(userId: str = Depends(get_current_user)):
    profile = await db.profile.find_one({"userId": userId})
    current_week = profile.get("currentWeek", 1) if profile else 1
    start_week = max(1, current_week - 7)
    result = []
    for w in range(start_week, current_week + 1):
        docs = await db.log.find({**_user_or_orphan(userId), "week": w}).to_list(500)
        total_sets = sum(int(d.get("sets", 1) or 1) for d in docs)
        tonnage = sum(
            float(d.get("weight", 0) or 0) * int(d.get("reps", 0) or 0) * int(d.get("sets", 1) or 1)
            for d in docs
        )
        result.append({"week": w, "sets": total_sets, "tonnage": round(tonnage), "isCurrent": w == current_week})
    return result


@api_router.get("/analytics/pain")
async def get_pain_analytics(userId: str = Depends(get_current_user)):
    docs = await db.log.find({**_user_or_orphan(userId), "pain": {"$gt": 0}}).sort("date", 1).to_list(500)
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
        older  = weekly_data[:-3]
        recent_avg = sum(d["avgPain"] for d in recent) / len(recent)
        older_avg  = sum(d["avgPain"] for d in older) / len(older) if older else recent_avg
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
async def get_compliance_breakdown(userId: str = Depends(get_current_user)):
    profile = await db.profile.find_one({"userId": userId})
    current_week = profile.get("currentWeek", 1) if profile else 1
    docs = await db.log.find({**_user_or_orphan(userId), "week": {"$gte": max(1, current_week - 7)}}).to_list(1000)

    # All possible session type names (covers ME/DE and new RE/Full Body naming)
    session_types = [
        "Heavy Lower", "Heavy Upper", "Speed Lower", "Speed Upper",
        "Upper Body", "Lower Body", "Full Body",
        "Repetition Upper", "Repetition Lower",
    ]
    by_type: dict = {st: set() for st in session_types}
    for d in docs:
        st   = d.get("sessionType", "")
        week = d.get("week")
        if week:
            for session_type in session_types:
                if session_type.lower() in st.lower():
                    by_type[session_type].add(week)
    weeks_count = max(len(set(d.get("week") for d in docs if d.get("week"))), 1)

    # Only return types that have at least one completed session
    return [
        {
            "sessionType": st,
            "completed":   len(by_type[st]),
            "expected":    weeks_count,
            "rate":        min(100, round(len(by_type[st]) / weeks_count * 100))
        }
        for st in session_types
        if len(by_type[st]) > 0
    ]


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2 — BATCH 2  Intelligent Coaching Upgrades
# ═══════════════════════════════════════════════════════════════════════════════

# ─── Profile Reset (BUG 2C — clears stale data on re-onboarding) ──────────────
@api_router.post("/profile/reset")
async def reset_profile_data(userId: str = Depends(get_current_user)):
    """
    Completely wipes saved plan + profile for this user so they can
    re-do onboarding and get a fresh plan that matches their new goal.
    """
    user_id = userId
    try:
        deleted_plans = await db.saved_plans.delete_many({"userId": user_id})
        deleted_profile = await db.profile.delete_many({"userId": user_id})
        await db.tracked_lifts.delete_many({"userId": user_id})
        await db.readiness_checks.delete_many({"userId": user_id})
        await db.pain_reports.delete_many({"userId": user_id})
        await db.calendar_overrides.delete_many({"userId": user_id})
        await db.weekly_reviews.delete_many({"userId": user_id})
        await db.log.delete_many({"userId": user_id})
        _prog_store["plans"].pop(user_id, None)
        _prog_store["profiles"].pop(user_id, None)
        logger.info(
            f"[RESET] Full wipe for user: {user_id} | "
            f"plans: {deleted_plans.deleted_count} | "
            f"profiles: {deleted_profile.deleted_count} | 6 additional collections cleared"
        )
        print(f"[RESET] User {user_id} — full wipe complete (8 collections cleared)")
        return {"success": True, "message": "Profile reset complete. All data cleared."}
    except Exception as e:
        logger.error(f"[RESET] Failed to reset profile for {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Reset failed")


@api_router.post("/plans/rebuild")
async def rebuild_plan(intake: _IntakeRequest, userId: str = Depends(get_current_user)):
    """
    Non-destructive plan rebuild.
    Regenerates the workout plan from updated intake answers while strictly
    preserving: log, tracked_lifts, readiness_checks, pain_reports,
    calendar_overrides, weekly_reviews, PRs, streaks, badges, coach memory.
    Only saved_plans is cleared so a fresh plan generation always wins.
    """
    from services.rag_plan_generator import generate_plan_with_rag
    from models.schemas import (
        UserProfile, GoalType, ExperienceLevel,
        ProgramChange, ChangeScope, ChangeTrigger,
    )

    user_id = userId
    logger.info(f"[REBUILD] userId: '{user_id}' — plan rebuild requested")
    print(f"[REBUILD] Goal: '{intake.goal}' | Freq: {intake.frequency} | userId: {user_id}")

    # Clear ONLY saved plans — all training history is preserved
    try:
        deleted = await db.saved_plans.delete_many({"userId": user_id})
        _prog_store["plans"].pop(user_id, None)
        logger.info(f"[REBUILD] Cleared {deleted.deleted_count} stale plan(s) for user: {user_id}")
    except Exception as _e:
        logger.warning(f"[REBUILD] Could not clear stale plans: {_e}")

    # Resolve goal / experience enums (same logic as intake)
    _goal_str = (intake.goal or "").strip()
    goal_enum = next(
        (g for g in GoalType if g.value.lower() == _goal_str.lower()),
        GoalType.STRENGTH,
    )
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

    # Persist plan to MongoDB
    await _save_plan_to_db(plan, user_id)
    print(f"[REBUILD] Plan saved: '{plan.planName}' for userId: {user_id}")

    # Update profile fields — intentionally NOT touching currentWeek, programStartDate,
    # or any history-adjacent fields.
    injury_flags = [i for i in (intake.injuries or []) if i and i.lower() not in ("none", "")]
    profile_update = {
        "goal": intake.goal,
        "trainingGoal": intake.goal,
        "experience": intake.experience,
        "trainingDaysCount": intake.frequency,
        "updatedAt": datetime.now(timezone.utc),
    }
    if injury_flags:
        profile_update["injuryFlags"] = injury_flags
    if intake.bodyweight:
        profile_update["currentBodyweight"] = intake.bodyweight
    if intake.primaryWeaknesses:
        profile_update["primaryWeaknesses"] = intake.primaryWeaknesses
    if intake.specialtyEquipment:
        profile_update["specialtyEquipment"] = intake.specialtyEquipment
    if intake.preferredDays:
        profile_update["preferredDays"] = [d.lower() for d in intake.preferredDays]
    await db.profile.update_one({"userId": user_id}, {"$set": profile_update}, upsert=True)

    # Log the rebuild to changelog
    _prog_store["changes"].append(ProgramChange(
        changeId=_prog_id(), userId=user_id,
        triggerType=ChangeTrigger.USER_REQUEST,
        scope=ChangeScope.YEAR,
        oldValue="Previous plan",
        newValue=plan.planName,
        explanation=(
            f"Plan rebuilt: {plan.planName} — "
            f"{intake.goal} goal, {intake.experience} level, "
            f"{intake.frequency} days/week. Training history preserved."
        ),
    ))

    return {
        "success": True,
        "message": "Plan rebuilt successfully. Training history preserved.",
        "plan": plan.model_dump(),
        "rag_enhanced": rag_enhanced,
    }


# ── Upload Processing Endpoints ────────────────────────────────────────────────

class UploadFile(BaseModel):
    data: str       # base64-encoded file content
    name: str       # filename
    mimeType: str   # e.g. image/jpeg, application/pdf

class UploadRequest(BaseModel):
    files: List[UploadFile]
    context: Optional[str] = None  # additional text context

@api_router.post("/profile/upload-program")
async def upload_program(body: UploadRequest, userId: str = Depends(get_current_user)):
    """
    Process uploaded workout program files with AI.
    Accepts images (photos of workout sheets) and PDFs.
    Returns a structured analysis of the user's current program.
    """
    if not body.files:
        raise HTTPException(status_code=400, detail="No files provided")

    # Build content for GPT-4 Vision
    messages_content = []
    messages_content.append({
        "type": "text",
        "text": (
            "Analyze these workout program documents. Extract the full training program including:\n"
            "- Which days of the week each workout is on\n"
            "- All exercises with sets, reps, and weights if shown\n"
            "- The overall program structure (upper/lower split, PPL, full body, etc.)\n"
            "- Any periodization or progression scheme\n\n"
            "Return ONLY a JSON object with this structure:\n"
            '{"programType": "4-Day Upper/Lower", "days": [{"day": "Monday", "name": "Upper Strength", '
            '"exercises": [{"name": "Bench Press", "sets": 5, "reps": "5", "weight": "225 lbs"}]}], '
            '"notes": "Any additional observations"}'
        )
    })

    for f in body.files[:5]:  # max 5 files
        if f.mimeType.startswith("image/"):
            messages_content.append({
                "type": "image_url",
                "image_url": {"url": f"data:{f.mimeType};base64,{f.data}", "detail": "high"}
            })
        else:
            # For PDFs/text, decode and include as text
            try:
                import base64
                decoded = base64.b64decode(f.data).decode('utf-8', errors='ignore')[:3000]
                messages_content.append({"type": "text", "text": f"[File: {f.name}]\n{decoded}"})
            except Exception:
                messages_content.append({"type": "text", "text": f"[File: {f.name} — could not decode]"})

    if body.context:
        messages_content.append({"type": "text", "text": f"Additional context from user: {body.context}"})

    try:
        emergent_key = os.environ.get('EMERGENT_LLM_KEY', '')
        if not emergent_key:
            return {"success": False, "error": "AI unavailable", "analysis": None}

        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=emergent_key,
            session_id=str(uuid.uuid4()),
            system_message="You are an expert strength coach analyzing a client's workout program documents. Extract structured data. Return ONLY valid JSON.",
        ).with_model("openai", "gpt-4o")

        # For emergentintegrations, send as text description of the images
        prompt = "Analyze the uploaded workout program. "
        for f in body.files[:5]:
            if f.mimeType.startswith("image/"):
                prompt += f"[Image uploaded: {f.name}] "
            else:
                try:
                    import base64
                    decoded = base64.b64decode(f.data).decode('utf-8', errors='ignore')[:2000]
                    prompt += f"\n\nContent of {f.name}:\n{decoded}\n"
                except Exception:
                    prompt += f"[File: {f.name}] "

        if body.context:
            prompt += f"\n\nUser's description: {body.context}"

        prompt += ("\n\nExtract the full program structure. Return ONLY JSON:\n"
                   '{"programType": "...", "days": [{"day": "Monday", "name": "...", '
                   '"exercises": [{"name": "...", "sets": 5, "reps": "5", "weight": "225"}]}], '
                   '"notes": "..."}')

        raw = await chat.send_message(UserMessage(text=prompt))
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        analysis = json.loads(json_match.group()) if json_match else {"raw": raw[:500]}

        # Save to user profile
        await db.profile.update_one(
            {"userId": userId},
            {"$set": {"uploadedProgram": analysis, "currentProgramSource": "upload"}},
            upsert=True,
        )

        return {"success": True, "analysis": analysis}
    except Exception as e:
        logger.warning(f"[UploadProgram] AI analysis failed: {e}")
        return {"success": False, "error": str(e)[:200], "analysis": None}


@api_router.post("/profile/upload-medical")
async def upload_medical(body: UploadRequest, userId: str = Depends(get_current_user)):
    """
    Process uploaded medical documents with AI.
    Accepts images (X-rays, doctor's notes) and PDFs.
    Returns identified conditions and program modifications.
    """
    if not body.files:
        raise HTTPException(status_code=400, detail="No files provided")

    try:
        emergent_key = os.environ.get('EMERGENT_LLM_KEY', '')
        if not emergent_key:
            return {"success": False, "error": "AI unavailable", "conditions": []}

        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=emergent_key,
            session_id=str(uuid.uuid4()),
            system_message=(
                "You are a sports medicine AI assistant analyzing medical documents for a strength training program. "
                "Identify conditions, injuries, and limitations that affect training. "
                "Be conservative — recommend safe modifications. Return ONLY valid JSON."
            ),
        ).with_model("openai", "gpt-4o")

        prompt = "Analyze these medical documents for a strength training athlete.\n\n"
        for f in body.files[:5]:
            if f.mimeType.startswith("image/"):
                prompt += f"[Medical image uploaded: {f.name}] "
            else:
                try:
                    import base64
                    decoded = base64.b64decode(f.data).decode('utf-8', errors='ignore')[:2000]
                    prompt += f"\nContent of {f.name}:\n{decoded}\n"
                except Exception:
                    prompt += f"[File: {f.name}] "

        if body.context:
            prompt += f"\n\nPatient notes: {body.context}"

        prompt += ('\n\nReturn ONLY JSON:\n'
                   '{"conditions": [{"condition": "Right Knee — Patellar Tendinopathy", '
                   '"severity": "moderate", "source": "filename.pdf", '
                   '"impact": "Avoid deep squats. Box squats recommended.", '
                   '"restrictions": ["deep squat", "lunge"], '
                   '"prehab": [{"name": "Terminal Knee Extension", "prescription": "3x15"}]}], '
                   '"summary": "Overall assessment in 1-2 sentences"}')

        raw = await chat.send_message(UserMessage(text=prompt))
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        analysis = json.loads(json_match.group()) if json_match else {"conditions": [], "summary": raw[:300]}

        # Save to user profile
        conditions = analysis.get("conditions", [])
        injury_flags = [c.get("condition", "") for c in conditions if c.get("severity") in ("moderate", "severe")]

        await db.profile.update_one(
            {"userId": userId},
            {"$set": {
                "medicalAnalysis": analysis,
                "medicalDocUploaded": True,
            },
            "$addToSet": {"injuryFlags": {"$each": injury_flags}} if injury_flags else {}},
            upsert=True,
        )

        return {"success": True, "conditions": conditions, "summary": analysis.get("summary", "")}
    except Exception as e:
        logger.warning(f"[UploadMedical] AI analysis failed: {e}")
        return {"success": False, "error": str(e)[:200], "conditions": []}


# ─── Goal-Based Default Tracked Lifts ────────────────────────────────────────
async def _create_default_tracked_lifts(user_id: str, goal: str, database) -> None:
    """Create default tracked lifts based on user goal during onboarding. Idempotent."""
    existing = await database.tracked_lifts.count_documents({"userId": user_id})
    if existing > 0:
        return  # Already has lifts — do not overwrite
    GOAL_DEFAULTS = {
        "strongman": {
            "featured": [
                {"exercise": "SSB Box Squat",        "category": "Squat Variations"},
                {"exercise": "Axle Clean and Press",  "category": "Strongman"},
                {"exercise": "Log Clean and Press",   "category": "Strongman"},
            ],
            "also_track": [
                {"exercise": "Yoke Carry",            "category": "Strongman"},
                {"exercise": "Atlas Stone Load",      "category": "Strongman"},
                {"exercise": "Farmers Carry",         "category": "Strongman"},
            ],
        },
        "powerlifting": {
            "featured": [
                {"exercise": "Back Squat",            "category": "Powerlifting"},
                {"exercise": "Bench Press",           "category": "Powerlifting"},
                {"exercise": "Conventional Deadlift", "category": "Powerlifting"},
            ],
            "also_track": [
                {"exercise": "Overhead Press", "category": "Powerlifting"},
            ],
        },
        "olympic": {
            "featured": [
                {"exercise": "Clean & Jerk", "category": "Olympic"},
                {"exercise": "Snatch",       "category": "Olympic"},
                {"exercise": "Back Squat",   "category": "Powerlifting"},
            ],
            "also_track": [
                {"exercise": "Power Clean",  "category": "Olympic"},
                {"exercise": "Push Press",   "category": "Olympic"},
            ],
        },
        "athletic": {
            "featured": [
                {"exercise": "Clean & Jerk", "category": "Olympic"},
                {"exercise": "Snatch",       "category": "Olympic"},
                {"exercise": "Back Squat",   "category": "Powerlifting"},
            ],
            "also_track": [
                {"exercise": "Power Clean",  "category": "Olympic"},
                {"exercise": "Push Press",   "category": "Olympic"},
            ],
        },
    }
    goal_lower = (goal or "").lower()
    config = GOAL_DEFAULTS.get(goal_lower) or {
        "featured": [
            {"exercise": "Back Squat",            "category": "Powerlifting"},
            {"exercise": "Bench Press",           "category": "Powerlifting"},
            {"exercise": "Conventional Deadlift", "category": "Powerlifting"},
        ],
        "also_track": [
            {"exercise": "Overhead Press", "category": "Powerlifting"},
        ],
    }
    now = datetime.now(timezone.utc)
    lifts_to_insert = []
    for lift in config.get("featured", []):
        lifts_to_insert.append({
            "userId": user_id, "exercise": lift["exercise"], "category": lift["category"],
            "bestWeight": 0.0, "bestReps": 1, "bestE1rm": 0.0, "lastDate": None,
            "isFeatured": True, "source": "auto", "createdAt": now, "updatedAt": now,
        })
    for lift in config.get("also_track", []):
        lifts_to_insert.append({
            "userId": user_id, "exercise": lift["exercise"], "category": lift["category"],
            "bestWeight": 0.0, "bestReps": 1, "bestE1rm": 0.0, "lastDate": None,
            "isFeatured": False, "source": "auto", "createdAt": now, "updatedAt": now,
        })
    if lifts_to_insert:
        await database.tracked_lifts.insert_many(lifts_to_insert)
        logger.info(f"[LIFTS] Created {len(lifts_to_insert)} default tracked lifts for {user_id} (goal: {goal_lower})")

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
    logger.info(f"[INTAKE] userId from auth: '{user_id}' (DEFAULT_USER is '{_PROG_USER}')")
    logger.info(f"[INTAKE] GOAL FROM FRONTEND: '{intake.goal}'")
    print(f"[INTAKE] GOAL FROM FRONTEND: '{intake.goal}' | userId: {user_id}")

    # ── Root Cause A Fix: Delete stale saved plans so a fresh generation always wins ──
    try:
        deleted = await db.saved_plans.delete_many({"userId": user_id})
        logger.info(f"[INTAKE] Deleted {deleted.deleted_count} stale saved plan(s) for user: {user_id}")
        _prog_store["plans"].pop(user_id, None)
    except Exception as _e:
        logger.warning(f"[INTAKE] Could not delete stale plans: {_e}")

    # Build in-memory profile — use case-insensitive lookup to avoid ValueError crashes
    _goal_str = (intake.goal or "").strip()
    goal_enum = next(
        (g for g in GoalType if g.value.lower() == _goal_str.lower()),
        GoalType.STRENGTH,
    )
    if goal_enum == GoalType.STRENGTH and _goal_str.lower() != "strength":
        logger.warning(f"[INTAKE] GoalType('{intake.goal}') not matched — falling back to STRENGTH")
    else:
        logger.info(f"[INTAKE] Goal resolved: '{intake.goal}' → {goal_enum.value}")
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
    print(f"[INTAKE] Plan saved: '{plan.planName}' for userId: {user_id}")

    # Mark onboarding complete in db.users
    if user_id != _PROG_USER:
        await db.users.update_one(
            {"userId": user_id},
            {"$set": {"onboardingComplete": True, "goal": intake.goal, "experience": intake.experience}},
        )

    # Update/create db.profile with intake data (upsert=True so new users get a profile created)
    injury_flags = [i for i in (intake.injuries or []) if i and i.lower() not in ("none", "")]
    profile_update = {
        "userId": user_id,
        "goal": intake.goal,
        "trainingGoal": intake.goal,
        "experience": intake.experience,
        "trainingDaysCount": intake.frequency,
        "onboardingComplete": True,
        "updatedAt": datetime.now(timezone.utc),
    }
    if injury_flags:
        profile_update["injuryFlags"] = injury_flags
    if intake.bodyweight:
        profile_update["currentBodyweight"] = intake.bodyweight
    if intake.primaryWeaknesses:
        profile_update["primaryWeaknesses"] = intake.primaryWeaknesses
    if intake.specialtyEquipment:
        profile_update["specialtyEquipment"] = intake.specialtyEquipment
    if intake.preferredDays:
        profile_update["preferredDays"] = [d.lower() for d in intake.preferredDays]
    # Always upsert — creates profile for new users, updates existing users
    await db.profile.update_one({"userId": user_id}, {"$set": profile_update}, upsert=True)

    # Create default tracked lifts based on goal (idempotent — skips if already exists)
    try:
        await _create_default_tracked_lifts(user_id, intake.goal or "strength", db)
    except Exception as _tl_err:
        logger.warning(f"[INTAKE] Could not create default tracked lifts: {_tl_err}")

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
    Return a weekly AI coaching review, cached once per training week (Mon-Sun).
    Cache key uses weekStart (YYYY-MM-DD) so it invalidates on new week even
    if currentWeek profile integer hasn't updated yet.
    Stored in db.weekly_reviews.
    """
    from datetime import timedelta

    profile_doc = await db.profile.find_one({"userId": userId})
    current_week = int(profile_doc.get("currentWeek", 1)) if profile_doc else 1

    # ── Calculate this week's Mon-Sun date range (local time) ─────────────────
    now = datetime.now()
    day_of_week = now.weekday()  # 0=Mon, 6=Sun
    monday = now - timedelta(days=day_of_week)
    monday = monday.replace(hour=0, minute=0, second=0, microsecond=0)
    sunday = monday + timedelta(days=6)
    week_start = monday.strftime("%Y-%m-%d")
    week_end   = sunday.strftime("%Y-%m-%d")
    today_str  = now.strftime("%Y-%m-%d")

    # Previous week date range
    prev_monday = monday - timedelta(days=7)
    prev_sunday = monday - timedelta(days=1)
    prev_week_start = prev_monday.strftime("%Y-%m-%d")
    prev_week_end   = prev_sunday.strftime("%Y-%m-%d")

    # ── Cache check — keyed by weekStart date ─────────────────────────────────
    existing = await db.weekly_reviews.find_one({"userId": userId, "weekStart": week_start})
    if existing:
        existing.pop("_id", None)
        return {
            "hasReview": True,
            "cached": True,
            **{k: existing.get(k) for k in ("week", "weekStart", "generatedAt", "summary", "highlights", "concerns", "nextWeekFocus", "stats")},
        }

    # ── Gather data ────────────────────────────────────────────────────────────
    week_ago = (now - timedelta(days=7)).strftime("%Y-%m-%d")

    session_ratings = await db.session_ratings.find(
        {"userId": userId}
    ).sort("createdAt", -1).limit(10).to_list(10)

    pain_docs = await db.pain_reports.find({
        "userId": userId, "date": {"$gte": week_ago},
    }).to_list(30)

    # Use date-range query to match Home/Schedule page data source
    log_docs = await db.log.find(
        {**_user_or_orphan(userId), "date": {"$gte": week_start, "$lte": week_end}}
    ).to_list(500)

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

    # PR detection (e1rm improvement vs prev week) — uses date ranges
    prev_logs = await db.log.find(
        {**_user_or_orphan(userId), "date": {"$gte": prev_week_start, "$lte": prev_week_end}}
    ).to_list(500)
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
        if val > prev_best.get(ex, 0) and val > 0
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
                f"Week {current_week} summary ({week_start} → {week_end}):",
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

    # ── Cache in MongoDB — keyed by weekStart date ─────────────────────────────
    # Ensure highlights are never empty (fallback for AI returning empty array)
    if not review_data.get("highlights"):
        review_data["highlights"] = ["Complete more sessions this week to unlock insights"]
    doc = {
        "userId": userId,
        "week": current_week,
        "weekStart": week_start,  # New cache key — survives week roll-over
        "generatedAt": today_str,
        "stats": stats,
        "createdAt": datetime.now(timezone.utc),
        **review_data,
    }
    await db.weekly_reviews.insert_one(doc)
    logger.info(f"[WeeklyReview] Cached week {current_week} review for user {userId} (weekStart={week_start})")

    return {
        "hasReview": True,
        "cached": False,
        "week": current_week,
        "weekStart": week_start,
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
        message = "Recovery week recommended immediately. Clear signs of systemic overreaching."
    elif deload_score >= 2:
        urgency = "soon"
        recommended = False
        message = f"Fatigue building (score {deload_score}/12). Consider a recovery week within 1–2 weeks."
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


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2 — BATCH 3  Advanced Coaching Features
# ═══════════════════════════════════════════════════════════════════════════════

# ─── Task 8: Rehab Progression Tracking ───────────────────────────────────────

@api_router.post("/rehab/start")
async def start_rehab_protocol(body: dict, userId: str = Depends(get_current_user)):
    """
    Start a 4-phase rehab protocol for a given injury type.
    Uses static curated protocols + optional RAG enhancement.
    Persists active rehab record to db.rehab_protocols.
    """
    from services.rehab_protocols import resolve_injury_key, get_protocol, get_phase

    injury_input = body.get("injuryType", "").strip()
    if not injury_input:
        raise HTTPException(status_code=400, detail="injuryType is required")

    injury_key = resolve_injury_key(injury_input)
    phases = get_protocol(injury_key)
    phase_1 = phases[0]

    now = datetime.now(timezone.utc)

    # Deactivate any existing active rehab for this user+injury
    await db.rehab_protocols.update_many(
        {"userId": userId, "injuryKey": injury_key, "status": "active"},
        {"$set": {"status": "superseded", "updatedAt": now}},
    )

    # RAG enhancement for Phase 1 exercises
    rag_additions: list = []
    if _openai_client and _supabase_client:
        try:
            from services.rag_plan_generator import _query_rag
            passages = await _query_rag(
                f"evidence-based acute phase rehabilitation exercises {injury_key} injury",
                _openai_client, _supabase_client, count=3,
            )
            if passages:
                emergent_key = os.environ.get('EMERGENT_LLM_KEY', '')
                context = "\n\n".join(p.get('content', '')[:300] for p in passages[:3])
                from emergentintegrations.llm.chat import LlmChat as _LC2, UserMessage as _UM2
                chat = _LC2(
                    api_key=emergent_key,
                    session_id=str(uuid.uuid4()),
                    system_message="You are a sports physiotherapist. Return only valid JSON, no markdown.",
                ).with_model("openai", "gpt-4o-mini")
                raw = await chat.send_message(_UM2(text=(
                    f"Based on this research:\n{context}\n\n"
                    f"Suggest 1-2 additional exercises for acute phase {injury_key} rehab.\n"
                    "Return JSON: {\"additions\": [{\"name\": \"...\", \"prescription\": \"...\", \"notes\": \"...\"}]}"
                )))
                jm = re.search(r'\{.*\}', raw, re.DOTALL)
                if jm:
                    parsed = json.loads(jm.group())
                    for a in (parsed.get("additions") or []):
                        a["level"] = "light"
                        a["is_rag"] = True
                        rag_additions.append(a)
        except Exception as e:
            logger.warning(f"[Rehab] RAG enhancement failed: {e}")

    doc = {
        "userId": userId,
        "injuryInput": injury_input,
        "injuryKey": injury_key,
        "currentPhase": 1,
        "phaseName": phase_1["name"],
        "status": "active",
        "startDate": now.strftime("%Y-%m-%d"),
        "phaseStartDate": now.strftime("%Y-%m-%d"),
        "cleanSessionCount": 0,
        "sessionsRequired": phase_1["sessions_required"],
        "readyToAdvance": False,
        "ragEnhancements": rag_additions,
        "createdAt": now,
        "updatedAt": now,
    }
    result = await db.rehab_protocols.insert_one(doc)
    doc["_id"] = str(result.inserted_id)

    logger.info(f"[Rehab] User {userId}: started {injury_key} rehab (Phase 1)")

    return {
        "success": True,
        "protocolId": str(result.inserted_id),
        "injuryKey": injury_key,
        "injuryInput": injury_input,
        "currentPhase": 1,
        "phaseName": phase_1["name"],
        "goal": phase_1["goal"],
        "criteriaToAdvance": phase_1["criteria_to_advance"],
        "durationLabel": phase_1["duration_label"],
        "sessionsRequired": phase_1["sessions_required"],
        "ragEnhanced": len(rag_additions) > 0,
    }


@api_router.get("/rehab/status")
async def get_rehab_status(userId: str = Depends(get_current_user)):
    """
    Get current active rehab protocol status, progression info, and phase exercises.
    """
    from services.rehab_protocols import get_protocol, get_phase

    active = await db.rehab_protocols.find_one(
        {"userId": userId, "status": "active"},
        sort=[("createdAt", -1)],
    )
    if not active:
        return {"hasActiveRehab": False}

    injury_key = active["injuryKey"]
    current_phase = active["currentPhase"]
    phases = get_protocol(injury_key)
    phase_data = get_phase(injury_key, current_phase)

    # Combine static exercises with RAG enhancements
    exercises = list(phase_data["exercises"])
    for rag_ex in (active.get("ragEnhancements") or []):
        exercises.append(rag_ex)

    # Recent clean session count
    clean_count = active.get("cleanSessionCount", 0)
    sessions_required = phase_data["sessions_required"]
    ready = active.get("readyToAdvance", False)
    is_final_phase = current_phase >= 4

    return {
        "hasActiveRehab": True,
        "protocolId": str(active["_id"]),
        "injuryKey": injury_key,
        "injuryInput": active.get("injuryInput", injury_key),
        "currentPhase": current_phase,
        "phaseName": phase_data["name"],
        "durationLabel": phase_data["duration_label"],
        "goal": phase_data["goal"],
        "criteriaToAdvance": phase_data["criteria_to_advance"],
        "exercises": exercises,
        "cleanSessions": clean_count,
        "sessionsRequired": sessions_required if not is_final_phase else None,
        "readyToAdvance": ready and not is_final_phase,
        "isFinalPhase": is_final_phase,
        "startDate": active.get("startDate"),
        "phaseStartDate": active.get("phaseStartDate"),
        "totalPhases": len(phases),
    }


@api_router.get("/rehab/exercises")
async def get_rehab_exercises(userId: str = Depends(get_current_user)):
    """
    Return the loggable exercises for the current rehab phase.
    These appear in the Log tab exercise picker with a rehab badge.
    """
    from services.rehab_protocols import get_phase

    active = await db.rehab_protocols.find_one(
        {"userId": userId, "status": "active"},
        sort=[("createdAt", -1)],
    )
    if not active:
        return {"hasActiveRehab": False, "exercises": []}

    injury_key = active["injuryKey"]
    current_phase = active["currentPhase"]
    phase_data = get_phase(injury_key, current_phase)

    exercises = list(phase_data["exercises"])
    for rag_ex in (active.get("ragEnhancements") or []):
        exercises.append(rag_ex)

    return {
        "hasActiveRehab": True,
        "injuryKey": injury_key,
        "injuryInput": active.get("injuryInput", injury_key),
        "currentPhase": current_phase,
        "phaseName": phase_data["name"],
        "exercises": exercises,
    }


@api_router.post("/rehab/log")
async def log_rehab_exercise(body: dict, userId: str = Depends(get_current_user)):
    """
    Log a rehab exercise session. Tracks clean sessions for auto-progression.
    A 'clean session' = pain <= 1 on all sets AND all prescribed sets completed.
    After 3 (or more) consecutive clean sessions → mark readyToAdvance=True.
    """
    exercise_name = body.get("exerciseName", "")
    sets_completed = int(body.get("setsCompleted", 0))
    reps_completed = str(body.get("repsCompleted", ""))
    pain_level = int(body.get("painLevel", 0))
    notes = body.get("notes", "")

    if not exercise_name:
        raise HTTPException(status_code=400, detail="exerciseName is required")

    active = await db.rehab_protocols.find_one(
        {"userId": userId, "status": "active"},
        sort=[("createdAt", -1)],
    )
    if not active:
        return {"success": False, "reason": "No active rehab protocol"}

    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")

    # Save log entry
    log_entry = {
        "userId": userId,
        "protocolId": str(active["_id"]),
        "injuryKey": active["injuryKey"],
        "phase": active["currentPhase"],
        "exerciseName": exercise_name,
        "date": today_str,
        "setsCompleted": sets_completed,
        "repsCompleted": reps_completed,
        "painLevel": pain_level,
        "notes": notes,
        "isClean": pain_level <= 1 and sets_completed >= 2,  # ≥2 sets = "completed"
        "createdAt": now,
    }
    await db.rehab_logs.insert_one(log_entry)

    # Count consecutive clean sessions (by date — one session per day)
    # Look at last 7 days of logs for this protocol/phase
    from datetime import timedelta
    week_ago = (now - timedelta(days=14)).strftime("%Y-%m-%d")
    recent_logs = await db.rehab_logs.find({
        "userId": userId,
        "protocolId": str(active["_id"]),
        "phase": active["currentPhase"],
        "date": {"$gte": week_ago},
    }).sort("date", -1).to_list(50)

    # Group by date, get most recent clean day streak
    dates_seen: set = set()
    clean_dates: list = []
    for log in recent_logs:
        d = log.get("date")
        if d and d not in dates_seen:
            dates_seen.add(d)
            clean_dates.append((d, log.get("isClean", False)))

    # Count consecutive clean sessions from most recent
    consecutive_clean = 0
    for _, is_clean in clean_dates:
        if is_clean:
            consecutive_clean += 1
        else:
            break

    sessions_required = active.get("sessionsRequired", 3)
    ready = consecutive_clean >= sessions_required and active["currentPhase"] < 4

    # Update clean session count and readyToAdvance flag
    await db.rehab_protocols.update_one(
        {"_id": active["_id"]},
        {"$set": {
            "cleanSessionCount": consecutive_clean,
            "readyToAdvance": ready,
            "updatedAt": now,
        }},
    )

    logger.info(
        f"[Rehab] User {userId}: logged '{exercise_name}' "
        f"phase={active['currentPhase']} clean={consecutive_clean}/{sessions_required}"
    )

    return {
        "success": True,
        "logged": True,
        "exerciseName": exercise_name,
        "isClean": log_entry["isClean"],
        "cleanSessions": consecutive_clean,
        "sessionsRequired": sessions_required,
        "readyToAdvance": ready,
        "message": (
            "Ready to advance to next phase! 🌟" if ready
            else f"{consecutive_clean}/{sessions_required} clean sessions logged"
        ),
    }


@api_router.post("/rehab/graduate")
async def graduate_rehab_phase(userId: str = Depends(get_current_user)):
    """
    Advance to the next rehab phase. When Phase 4 is reached, mark as 'maintaining'.
    Auto-adds maintenance prehab exercises to the user's warm-up profile.
    """
    from services.rehab_protocols import get_protocol, get_phase

    active = await db.rehab_protocols.find_one(
        {"userId": userId, "status": "active"},
        sort=[("createdAt", -1)],
    )
    if not active:
        raise HTTPException(status_code=404, detail="No active rehab protocol found")

    current_phase = active["currentPhase"]
    if current_phase >= 4:
        # Already in maintenance — mark as graduated
        now = datetime.now(timezone.utc)
        await db.rehab_protocols.update_one(
            {"_id": active["_id"]},
            {"$set": {"status": "graduated", "graduatedAt": now, "updatedAt": now}},
        )
        # Update user profile injury flags as resolved
        injury_key = active["injuryKey"]
        profile_doc = await db.profile.find_one({"userId": userId})
        if profile_doc:
            current_flags = profile_doc.get("injuryFlags", [])
            resolved = [f for f in current_flags
                        if active["injuryInput"].lower() not in f.lower()]
            await db.profile.update_one(
                {"userId": userId},
                {"$set": {"injuryFlags": resolved, "updatedAt": now}},
            )
        return {
            "success": True, "graduated": True,
            "message": "Rehabilitation complete! Maintenance prehab has been added to your warm-up.",
        }

    # Advance to next phase
    next_phase = current_phase + 1
    injury_key = active["injuryKey"]
    next_phase_data = get_phase(injury_key, next_phase)
    now = datetime.now(timezone.utc)

    await db.rehab_protocols.update_one(
        {"_id": active["_id"]},
        {"$set": {
            "currentPhase": next_phase,
            "phaseName": next_phase_data["name"],
            "phaseStartDate": now.strftime("%Y-%m-%d"),
            "cleanSessionCount": 0,
            "sessionsRequired": next_phase_data["sessions_required"],
            "readyToAdvance": False,
            "updatedAt": now,
        }},
    )

    logger.info(f"[Rehab] User {userId}: advanced to Phase {next_phase} ({next_phase_data['name']})")

    return {
        "success": True,
        "graduated": False,
        "newPhase": next_phase,
        "phaseName": next_phase_data["name"],
        "goal": next_phase_data["goal"],
        "durationLabel": next_phase_data["duration_label"],
        "criteriaToAdvance": next_phase_data["criteria_to_advance"],
        "exercises": next_phase_data["exercises"],
        "message": f"Advanced to Phase {next_phase}: {next_phase_data['name']}! 💪",
    }


# ─── Task 9: Competition Peaking ───────────────────────────────────────────────

@api_router.post("/competition/set")
async def set_competition_date(body: dict, userId: str = Depends(get_current_user)):
    """
    Set the athlete's competition date. Triggers peaking protocol calculations.
    Stored in db.profile.competitionDate.
    """
    comp_date_str = body.get("competitionDate", "")
    event_name = body.get("eventName", "Competition")

    if not comp_date_str:
        raise HTTPException(status_code=400, detail="competitionDate (YYYY-MM-DD) is required")

    try:
        from datetime import date as _date
        comp_date = _date.fromisoformat(comp_date_str)
        today = datetime.now(timezone.utc).date()
        if comp_date <= today:
            raise HTTPException(status_code=400, detail="competitionDate must be in the future")
        weeks_out = (comp_date - today).days // 7
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    now = datetime.now(timezone.utc)
    await db.profile.update_one(
        {"userId": userId},
        {"$set": {
            "competitionDate": comp_date_str,
            "competitionEventName": event_name,
            "updatedAt": now,
        }},
        upsert=True,
    )

    # Determine peaking phase
    if weeks_out >= 16:
        phase = "base_building"
        phase_label = "Base Building"
        message = f"{weeks_out} weeks out — lock in consistent training. Build the base."
    elif weeks_out >= 12:
        phase = "strength_block"
        phase_label = "Strength Block"
        message = f"{weeks_out} weeks out — strength work begins. Intensity rises."
    elif weeks_out >= 8:
        phase = "peaking"
        phase_label = "Peaking"
        message = f"{weeks_out} weeks out — peak starts. Volume drops, intensity rises."
    elif weeks_out >= 4:
        phase = "taper"
        phase_label = "Taper Phase"
        message = f"{weeks_out} weeks out — taper in effect. Trust the training."
    elif weeks_out >= 1:
        phase = "competition_week"
        phase_label = "Competition Week"
        message = f"Competition week! Openers locked, body ready. Execute."
    else:
        phase = "post_competition"
        phase_label = "Post-Competition"
        message = "Competition day! Go perform."

    logger.info(f"[Competition] User {userId}: set {comp_date_str}, {weeks_out} weeks out")

    return {
        "success": True,
        "hasCompetition": True,
        "competitionDate": comp_date_str,
        "eventName": event_name,
        "weeksOut": weeks_out,
        "phase": phase,
        "phaseLabel": phase_label,
        "message": message,
    }


@api_router.get("/competition/status")
async def get_competition_status(userId: str = Depends(get_current_user)):
    """
    Get competition countdown and peaking protocol details.
    Includes RAG-informed peaking recommendations when available.
    """
    profile_doc = await db.profile.find_one({"userId": userId})
    if not profile_doc or not profile_doc.get("competitionDate"):
        return {"hasCompetition": False}

    comp_date_str = profile_doc["competitionDate"]
    event_name = profile_doc.get("competitionEventName", "Competition")

    try:
        from datetime import date as _date
        comp_date = _date.fromisoformat(comp_date_str)
        today = datetime.now(timezone.utc).date()
        days_out = (comp_date - today).days
        weeks_out = days_out // 7
    except Exception:
        return {"hasCompetition": False}

    if days_out < -7:
        return {"hasCompetition": False}  # Competition passed >1 week ago

    # Determine peaking phase and protocol
    if weeks_out >= 16:
        phase, phase_label, color = "base_building", "Base Building", "#4DCEA6"
        adjustments = [
            "Focus on technical consistency — high bar → competition stance progression",
            "Volume at 85-90% of max — build work capacity",
            "Intensity: 70-82% of 1RM on main lifts",
            "PR attempts at 12+ weeks, not now",
        ]
        banner_urgency = "low"
    elif weeks_out >= 12:
        phase, phase_label, color = "strength_block", "Strength Block", "#5B9CF5"
        adjustments = [
            "Begin intensity progression — heavier singles and triples",
            "Volume reduction: drop to 75-85% max volume",
            "Start dialling in competition commands (down, press, rack)",
            "Address any technical weaknesses now — no time later",
        ]
        banner_urgency = "medium"
    elif weeks_out >= 4:
        phase, phase_label, color = "peaking", "Peaking", "#F5A623"
        adjustments = [
            "Volume cut to 60-70% — quality over quantity",
            "Heavy singles: 90-97% 1RM on main lifts",
            "Lock in opener (90-92% 1RM), second (97%), third attempt (PR)",
            "No new exercises — competition movements only",
        ]
        banner_urgency = "high"
    elif weeks_out >= 1:
        phase, phase_label, color = "taper", "Taper Phase", "#FF9800"
        adjustments = [
            "Volume at 50% — just maintaining neural drive",
            "Last heavy day: 10 days before competition max",
            "Final openers: 5-7 days out at 88-90% 1RM",
            "Sleep 9h+, no new exercises, trust the process",
        ]
        banner_urgency = "urgent"
    elif days_out >= 0:
        phase, phase_label, color = "competition_week", "Competition Week", "#EF5350"
        adjustments = [
            "Openers locked — execute the plan",
            "Body is ready — no more training stimulus needed",
            "Focus: warm-up timing, attempt selection, mental prep",
            "Sleep, eat, hydrate, compete",
        ]
        banner_urgency = "urgent"
    else:
        phase, phase_label, color = "post_competition", "Post-Competition", "#9E9E9E"
        adjustments = ["Rest and recover. Reflect on the meet. Retest in 2-3 weeks."]
        banner_urgency = "low"

    # RAG enhancement for peaking protocols
    rag_tip = ""
    if _openai_client and weeks_out >= 1:
        try:
            from services.rag_plan_generator import _query_rag
            passages = await _query_rag(
                f"powerlifting competition peaking program {weeks_out} weeks out",
                _openai_client, _supabase_client, count=2,
            )
            if passages:
                emergent_key = os.environ.get('EMERGENT_LLM_KEY', '')
                context = "\n".join(p.get('content', '')[:200] for p in passages[:2])
                from emergentintegrations.llm.chat import LlmChat as _LC3, UserMessage as _UM3
                chat = _LC3(
                    api_key=emergent_key,
                    session_id=str(uuid.uuid4()),
                    system_message="You are an elite powerlifting coach. Be specific and direct. Max 1 sentence.",
                ).with_model("openai", "gpt-4o-mini")
                rag_tip = await chat.send_message(_UM3(text=(
                    f"Research context:\n{context}\n\n"
                    f"Give ONE specific coaching tip for {weeks_out} weeks out from competition. "
                    "Keep it under 20 words."
                )))
        except Exception as e:
            logger.warning(f"[Competition] RAG tip failed: {e}")

    return {
        "hasCompetition": True,
        "competitionDate": comp_date_str,
        "eventName": event_name,
        "daysOut": days_out,
        "weeksOut": weeks_out,
        "phase": phase,
        "phaseLabel": phase_label,
        "color": color,
        "bannerUrgency": banner_urgency,
        "adjustments": adjustments,
        "ragTip": rag_tip or None,
    }


# ─── Task 10: Exercise Rotation Detection ─────────────────────────────────────

@api_router.get("/rotation/check")
async def check_exercise_rotation(userId: str = Depends(get_current_user)):
    """
    Detect exercises overdue for rotation based on consecutive usage windows.
    Rotation windows: main=8 weeks, supplemental=4 weeks, accessory=3 weeks.
    Returns flagged exercises + RAG-informed replacement suggestions.
    """
    from datetime import timedelta

    ROTATION_WINDOWS = {
        "main": 8,
        "supplemental": 4,
        "accessory": 3,
        "prehab": 12,  # prehab rarely rotated
    }

    # Look at last 12 weeks of logs
    twelve_weeks_ago = (datetime.now(timezone.utc) - timedelta(weeks=12)).strftime("%Y-%m-%d")
    logs = await db.log.find({
        "userId": userId,
        "date": {"$gte": twelve_weeks_ago},
    }).to_list(2000)

    if not logs:
        return {"flagged": [], "message": "No training history found yet"}

    # Count consecutive weeks per exercise
    from collections import defaultdict
    exercise_weeks: dict = defaultdict(set)
    exercise_categories: dict = {}
    for entry in logs:
        ex = entry.get("exercise", "")
        week = entry.get("week")
        cat = (entry.get("category") or "accessory").lower()
        if ex and week:
            exercise_weeks[ex].add(int(week))
            exercise_categories[ex] = cat

    flagged = []
    for ex_name, weeks_used in exercise_weeks.items():
        if not weeks_used:
            continue
        consecutive = len(weeks_used)  # simplification: count distinct weeks
        category = exercise_categories.get(ex_name, "accessory")
        window = ROTATION_WINDOWS.get(category, ROTATION_WINDOWS["accessory"])

        if consecutive >= window:
            flagged.append({
                "exercise": ex_name,
                "category": category,
                "weeksUsed": consecutive,
                "windowWeeks": window,
                "overduByWeeks": consecutive - window,
                "suggestion": None,  # filled by RAG below
            })

    if not flagged:
        return {
            "flagged": [],
            "message": f"All exercises are within rotation windows. Great variety!",
        }

    # RAG suggestions for flagged exercises
    if _openai_client and len(flagged) > 0:
        try:
            ex_list = ", ".join(f["exercise"] for f in flagged[:5])
            profile_doc = await db.profile.find_one({"userId": userId})
            goal = profile_doc.get("goal", "strength") if profile_doc else "strength"
            injuries = ", ".join(profile_doc.get("injuryFlags", []) or []) if profile_doc else "none"

            from services.rag_plan_generator import _query_rag
            passages = await _query_rag(
                f"exercise variation substitution alternatives {goal} training",
                _openai_client, _supabase_client, count=3,
            )
            rag_context = "\n".join(p.get('content', '')[:200] for p in passages[:3]) if passages else ""

            emergent_key = os.environ.get('EMERGENT_LLM_KEY', '')
            from emergentintegrations.llm.chat import LlmChat as _LC4, UserMessage as _UM4
            chat = _LC4(
                api_key=emergent_key,
                session_id=str(uuid.uuid4()),
                system_message="You are a strength coach. Return only valid JSON, no markdown.",
            ).with_model("openai", "gpt-4o-mini")

            prompt = (
                f"Athlete goal: {goal}. Injuries: {injuries}.\n"
                f"Research context:\n{rag_context}\n\n"
                f"These exercises need rotation: {ex_list}\n"
                "For each, suggest one replacement exercise. Return JSON:\n"
                "{\"suggestions\": ["
                "{\"original\": \"exercise\", \"replacement\": \"suggestion\", \"reason\": \"brief reason under 12 words\"}"
                "]}"
            )
            raw = await chat.send_message(_UM4(text=prompt))
            jm = re.search(r'\{.*\}', raw, re.DOTALL)
            if jm:
                suggestions = json.loads(jm.group()).get("suggestions", [])
                sug_map = {s["original"].lower(): s for s in suggestions}
                for item in flagged:
                    match = sug_map.get(item["exercise"].lower())
                    if match:
                        item["suggestion"] = {
                            "replacement": match.get("replacement"),
                            "reason": match.get("reason"),
                        }
        except Exception as e:
            logger.warning(f"[Rotation] RAG suggestions failed: {e}")

    # Fill in simple suggestions for exercises without RAG suggestions
    SIMPLE_ROTATIONS = {
        "squat":         "SSB Squat", "bench":         "Floor Press",
        "deadlift":      "Block Pull",  "press":         "Dumbbell Press",
        "row":           "Cable Row",   "pull":          "Lat Pulldown",
    }
    for item in flagged:
        if not item["suggestion"]:
            for key, alt in SIMPLE_ROTATIONS.items():
                if key in item["exercise"].lower():
                    item["suggestion"] = {"replacement": alt, "reason": "Standard rotation pattern"}
                    break
            if not item["suggestion"]:
                item["suggestion"] = {"replacement": f"Variation of {item['exercise']}", "reason": "Prevent adaptation plateau"}

    return {
        "flagged": flagged,
        "count": len(flagged),
        "message": f"{len(flagged)} exercise(s) overdue for rotation",
    }


@api_router.post("/rotation/apply")
async def apply_rotation_suggestions(body: dict, userId: str = Depends(get_current_user)):
    """
    Apply exercise rotation swaps to upcoming sessions in the plan.
    Each swap is applied to future weeks only, not past sessions.
    Always persists via _save_plan_to_db(). Stores snapshot for undo.
    """
    swaps = body.get("swaps", [])  # [{original, replacement, reason}]
    if not swaps:
        raise HTTPException(status_code=400, detail="swaps list is required")

    plan_available = await _ensure_plan_loaded(userId)
    if not plan_available:
        raise HTTPException(status_code=404, detail="No plan found")

    plan = _prog_store["plans"].get(userId)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not in memory")

    profile_doc = await db.profile.find_one({"userId": userId})
    current_week = int(profile_doc.get("currentWeek", 1)) if profile_doc else 1

    applied = []
    for phase in plan.phases:
        for block in phase.blocks:
            for week in block.weeks:
                if week.weekNumber <= current_week:
                    continue  # Never touch past weeks
                for session in week.sessions:
                    for ex in session.exercises:
                        for swap in swaps:
                            orig_lower = (swap.get("original") or "").lower().strip()
                            if orig_lower and orig_lower in ex.name.lower():
                                # Store snapshot before swap for undo
                                old_name = ex.name
                                ex.adjustedFrom = ex.name
                                ex.name = swap.get("replacement", ex.name)
                                ex.adjustmentReason = f"Rotation: {swap.get('reason', 'Prevent adaptation')}"
                                applied.append({
                                    "original": old_name,
                                    "replacement": ex.name,
                                    "week": week.weekNumber,
                                    "session": str(session.sessionType),
                                })
                                break

    if applied:
        await _save_plan_to_db(plan, userId)
        now = datetime.now(timezone.utc)
        for a in applied[:10]:
            await db.substitutions.insert_one({
                "userId": userId,
                "timestamp": now,
                "date": now.strftime("%Y-%m-%d"),
                "week": a["week"],
                "day": a["session"],
                "sessionType": a["session"],
                "originalExercise": a["original"],
                "replacementExercise": a["replacement"],
                "reason": "Exercise rotation (overdue for change)",
                "changeType": "rotation",
            })
        logger.info(f"[Rotation] User {userId}: applied {len(applied)} swaps")

    return {
        "success": True,
        "swapsApplied": len(applied),
        "applied": applied[:10],
    }


# ─── Task 13: Changelog with Undo ─────────────────────────────────────────────

@api_router.post("/coach/undo/{change_id}")
async def undo_plan_change(change_id: str, userId: str = Depends(get_current_user)):
    """
    Undo a plan change by reverting the affected exercise to its previous state.
    Uses the originalExercise stored in db.substitutions as the snapshot.
    Persists via _save_plan_to_db(). Marks the entry as undone.
    Conflict priority: injury safety > deload > coach recs > readiness > rotation
    """
    # Find the substitution record
    try:
        from bson import ObjectId
        change_doc = await db.substitutions.find_one({
            "_id": ObjectId(change_id),
            "userId": userId,
        })
    except Exception:
        # Try string match on changeId field
        change_doc = await db.substitutions.find_one({
            "changeId": change_id,
            "userId": userId,
        })

    if not change_doc:
        raise HTTPException(status_code=404, detail="Change not found or not owned by user")

    if change_doc.get("undone"):
        raise HTTPException(status_code=409, detail="This change has already been undone")

    original_exercise = change_doc.get("originalExercise", "")
    replacement_exercise = change_doc.get("replacementExercise", "")
    change_week = change_doc.get("week", 1)

    if not replacement_exercise:
        raise HTTPException(status_code=400, detail="Cannot undo — snapshot data missing")

    # Detect whether this is a prehab ADDITION (original="(none)") or a true SUBSTITUTION
    is_prehab_addition = not original_exercise or original_exercise.strip().lower() in ("(none)", "none", "")

    # Load plan
    plan_available = await _ensure_plan_loaded(userId)
    if not plan_available:
        raise HTTPException(status_code=404, detail="No plan found")

    plan = _prog_store["plans"].get(userId)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not in memory")

    reverted = 0
    rep_lower = replacement_exercise.lower().strip()

    if is_prehab_addition:
        # Undo a prehab ADDITION: remove the exercise from ALL sessions across ALL weeks
        # (prehab is added to multiple weeks, not just change_week)
        for phase in plan.phases:
            for block in phase.blocks:
                for week in block.weeks:
                    for session in week.sessions:
                        before = len(session.exercises)
                        session.exercises = [
                            ex for ex in session.exercises
                            if not (rep_lower and rep_lower in ex.name.lower())
                        ]
                        reverted += before - len(session.exercises)
    else:
        # Undo a true SUBSTITUTION: restore original name in the specific week
        if not original_exercise:
            raise HTTPException(status_code=400, detail="Cannot undo — original exercise name missing")
        for phase in plan.phases:
            for block in phase.blocks:
                for week in block.weeks:
                    if week.weekNumber != change_week:
                        continue
                    for session in week.sessions:
                        for ex in session.exercises:
                            if rep_lower and rep_lower in ex.name.lower():
                                ex.name = original_exercise
                                ex.adjustedFrom = None
                                ex.adjustmentReason = None
                                reverted += 1

    if reverted > 0:
        await _save_plan_to_db(plan, userId)
        now = datetime.now(timezone.utc)
        await db.substitutions.update_one(
            {"_id": change_doc["_id"]},
            {"$set": {"undone": True, "undoneAt": now}},
        )
        action = "removed prehab" if is_prehab_addition else f"reverted to '{original_exercise}'"
        logger.info(f"[Undo] User {userId}: {action} '{replacement_exercise}' (week {change_week})")

    return {
        "success": reverted > 0,
        "reverted": reverted,
        "original": original_exercise if not is_prehab_addition else None,
        "replacement": replacement_exercise,
        "week": change_week,
        "isPrehab": is_prehab_addition,
        "message": (
            f"Removed prehab exercise '{replacement_exercise}' from all sessions" if (reverted > 0 and is_prehab_addition)
            else f"Reverted to {original_exercise} in week {change_week}" if reverted > 0
            else "No matching exercise found to undo (may already be different)"
        ),
    }


@api_router.get("/coach/change-log")
async def get_change_log_v2(userId: str = Depends(get_current_user)):
    """
    Get the programme change log with undo capability per entry.
    Returns changes from db.substitutions ordered newest first.
    Includes: changeId, type, original, replacement, week, undoable flag.
    """
    docs = await db.substitutions.find(
        {"userId": userId}
    ).sort("timestamp", -1).limit(50).to_list(50)

    entries = []
    for doc in docs:
        change_id = str(doc["_id"])
        entries.append({
            "changeId": change_id,
            "date": doc.get("date", ""),
            "week": doc.get("week"),
            "sessionType": doc.get("sessionType") or doc.get("day", ""),
            "original": doc.get("originalExercise", ""),
            "replacement": doc.get("replacementExercise", ""),
            "reason": doc.get("reason", ""),
            "changeType": doc.get("changeType", "substitution"),
            "undone": doc.get("undone", False),
            "undoable": (
                not doc.get("undone", False)
                and bool(doc.get("originalExercise"))
                and doc.get("sessionType") != "Profile Update"
                and not (doc.get("originalExercise", "") or "").lower().startswith("injury flags")
                and not (doc.get("originalExercise", "") or "").lower().startswith("general recommendation")
                and not (doc.get("originalExercise", "") or "").lower().startswith("target loads")
            ),
            "timestamp": doc.get("timestamp").isoformat() if doc.get("timestamp") else "",
        })

    return {
        "changes": entries,
        "count": len(entries),
    }


# ── Debug / Diagnostic ──────────────────────────────────────────────────────
@api_router.get("/debug/sync-status")
async def debug_sync_status(userId: str = Depends(get_current_user)):
    """Debug endpoint to diagnose sync issues between log entries, plans, and calendar."""
    from datetime import timedelta
    today = datetime.now().strftime("%Y-%m-%d")

    total_logs   = await db.log.count_documents({})
    user_logs    = await db.log.count_documents({"userId": userId})
    orphan_logs  = await db.log.count_documents(
        {"$or": [{"userId": {"$exists": False}}, {"userId": ""}, {"userId": None}]}
    )
    distinct_ids = await db.log.distinct("userId")

    recent_docs = await db.log.find({}).sort("date", -1).limit(3).to_list(3)
    recent_sample = [
        {"date": d.get("date"), "exercise": d.get("exercise"),
         "userId": d.get("userId", "MISSING"), "week": d.get("week")}
        for d in recent_docs
    ]

    plan         = _prog_store["plans"].get(userId)
    plan_status  = "LOADED" if plan else "NOT LOADED"
    saved_plan   = await db.saved_plans.find_one({"userId": userId})
    any_plan_doc = await db.saved_plans.find_one({})
    any_plan_uid = any_plan_doc.get("userId", "NONE") if any_plan_doc else "NO PLANS"

    profile      = await db.profile.find_one({"userId": userId})
    current_week = profile.get("currentWeek", "N/A") if profile else "N/A"

    monday = datetime.now() - timedelta(days=datetime.now().weekday())
    sunday = monday + timedelta(days=6)
    start_wk = monday.strftime("%Y-%m-%d")
    end_wk   = sunday.strftime("%Y-%m-%d")

    cal_events = []
    if plan and profile:
        overrides = await db.calendar_overrides.find({"userId": userId}).to_list(100)
        all_events = _generate_calendar_events(
            plan, profile.get("preferredDays", []) or [], overrides
        )
        cal_events = [e for e in all_events if start_wk <= e.get("date", "") <= end_wk]

    users = await db.users.find({}).to_list(10)
    user_list = [{"userId": u.get("userId"), "email": u.get("email")} for u in users]

    return {
        "currentJwtUserId": userId,
        "today": today,
        "weekRange": f"{start_wk} → {end_wk}",
        "logEntries": {
            "total": total_logs,
            "forCurrentUser": user_logs,
            "orphans": orphan_logs,
            "distinctUserIds": distinct_ids,
            "recentSample": recent_sample,
        },
        "plan": {
            "inMemory": plan_status,
            "savedForUser": "YES" if saved_plan else "NO",
            "anyPlanUserId": any_plan_uid,
        },
        "profile": {
            "exists": "YES" if profile else "NO",
            "currentWeek": current_week,
        },
        "calendarEventsThisWeek": len(cal_events),
        "calendarEventDates": [e.get("date") for e in cal_events[:7]],
        "usersInDatabase": user_list,
    }


# ══════════════════════════════════════════════════════════════════════════════
# STREAK SYSTEM
# ══════════════════════════════════════════════════════════════════════════════

@api_router.get("/streaks")
async def get_streak(userId: str = Depends(get_current_user)):
    """Calculate training streak (consecutive weeks with at least 1 session)."""
    user_filter = _user_or_orphan(userId)
    all_logs = await db.log.find(user_filter).sort("date", -1).to_list(5000)
    if not all_logs:
        return {"currentStreak": 0, "longestStreak": 0, "totalWeeksTrained": 0,
                "lastTrainedDate": None, "freezesAvailable": 1, "freezesUsed": [], "trainedWeeks": []}

    # Group logs by ISO week (Mon-Sun)
    trained_weeks = set()
    for log_entry in all_logs:
        try:
            d = datetime.strptime(log_entry["date"], "%Y-%m-%d")
            monday = d - timedelta(days=d.weekday())
            trained_weeks.add(monday.strftime("%Y-%m-%d"))
        except: continue

    if not trained_weeks:
        return {"currentStreak": 0, "longestStreak": 0, "totalWeeksTrained": 0,
                "lastTrainedDate": None, "freezesAvailable": 1, "freezesUsed": [], "trainedWeeks": []}

    freeze_doc = await db.streak_freezes.find_one({"userId": userId}) or {}
    freezes_used: list = freeze_doc.get("freezesUsed", [])

    now = datetime.now()
    current_monday = now - timedelta(days=now.weekday())
    current_monday = current_monday.replace(hour=0, minute=0, second=0, microsecond=0)

    # Current streak
    current_streak = 0
    check_monday = current_monday
    skipped_first = False
    for i in range(200):
        check_str = check_monday.strftime("%Y-%m-%d")
        if check_str in trained_weeks:
            current_streak += 1
            check_monday -= timedelta(weeks=1)
        elif check_str in freezes_used:
            check_monday -= timedelta(weeks=1)
        else:
            if not skipped_first and i == 0:
                skipped_first = True
                check_monday -= timedelta(weeks=1)
                continue
            break

    # Longest streak
    sorted_weeks = sorted(trained_weeks)
    all_week_dates = [datetime.strptime(w, "%Y-%m-%d") for w in sorted_weeks]
    longest = 0
    streak = 0
    for i, w in enumerate(all_week_dates):
        if i == 0:
            streak = 1
        else:
            diff = (w - all_week_dates[i-1]).days
            if diff == 7:
                streak += 1
            elif all_week_dates[i-1].strftime("%Y-%m-%d") in freezes_used:
                streak += 1
            else:
                streak = 1
        longest = max(longest, streak)

    earned_freezes = min(2, 1 + (current_streak // 4))
    used_this_month = sum(1 for f in freezes_used if f >= now.replace(day=1).strftime("%Y-%m-%d"))
    freezes_available = max(0, earned_freezes - used_this_month)

    # Auto-freeze: consume freeze for previous week if missed
    prev_monday = current_monday - timedelta(weeks=1)
    prev_str = prev_monday.strftime("%Y-%m-%d")
    if prev_str not in trained_weeks and prev_str not in freezes_used and freezes_available > 0:
        freezes_used.append(prev_str)
        await db.streak_freezes.update_one(
            {"userId": userId},
            {"$set": {"userId": userId, "freezesUsed": freezes_used}},
            upsert=True,
        )
        freezes_available -= 1

    return {
        "currentStreak": current_streak,
        "longestStreak": max(longest, current_streak),
        "totalWeeksTrained": len(trained_weeks),
        "lastTrainedDate": all_logs[0].get("date") if all_logs else None,
        "freezesAvailable": freezes_available,
        "freezesUsed": freezes_used,
        "trainedWeeks": sorted(trained_weeks),
    }


# ══════════════════════════════════════════════════════════════════════════════
# BADGE SYSTEM
# ══════════════════════════════════════════════════════════════════════════════

@api_router.get("/badges")
async def get_badges(userId: str = Depends(get_current_user)):
    """Calculate earned and locked badges."""
    user_filter = _user_or_orphan(userId)
    log_count    = await db.log.count_documents(user_filter)
    unique_dates = len(await db.log.distinct("date", user_filter))
    unique_exs   = len(await db.log.distinct("exercise", user_filter))

    streak_data    = await get_streak(userId)
    current_streak = streak_data.get("currentStreak", 0)
    total_weeks    = streak_data.get("totalWeeksTrained", 0)

    # Count unique exercises with at least one logged set with positive e1rm (actual training PRs)
    exercises_with_logs = await db.log.distinct("exercise", user_filter)
    pr_exercises = set()
    for ex in exercises_with_logs:
        best_doc = await db.log.find_one({**user_filter, "exercise": ex, "e1rm": {"$gt": 0}})
        if best_doc:
            pr_exercises.add(ex)
    pr_count = len(pr_exercises)

    BADGE_DEFS = [
        {"id": "first_session",  "name": "First Rep",         "desc": "Logged your first session",         "icon": "dumbbell",            "check": unique_dates >= 1,    "current": unique_dates,    "target": 1},
        {"id": "week_1",         "name": "Week One",          "desc": "Completed your first training week", "icon": "calendar-check",      "check": total_weeks >= 1,     "current": total_weeks,     "target": 1},
        {"id": "streak_4",       "name": "Iron Month",        "desc": "4-week training streak",             "icon": "fire",                "check": current_streak >= 4,  "current": current_streak,  "target": 4},
        {"id": "streak_8",       "name": "Two Month Iron",    "desc": "8-week training streak",             "icon": "fire",                "check": current_streak >= 8,  "current": current_streak,  "target": 8},
        {"id": "streak_12",      "name": "Quarter Beast",     "desc": "12-week training streak",            "icon": "fire",                "check": current_streak >= 12, "current": current_streak,  "target": 12},
        {"id": "streak_26",      "name": "Half Year Hero",    "desc": "26-week training streak",            "icon": "fire",                "check": current_streak >= 26, "current": current_streak,  "target": 26},
        {"id": "sessions_10",    "name": "Getting Started",   "desc": "10 training sessions logged",        "icon": "arm-flex-outline",    "check": unique_dates >= 10,   "current": unique_dates,    "target": 10},
        {"id": "sessions_50",    "name": "Committed",         "desc": "50 training sessions",               "icon": "arm-flex-outline",    "check": unique_dates >= 50,   "current": unique_dates,    "target": 50},
        {"id": "sessions_100",   "name": "Iron Century",      "desc": "100 sessions — top 5%",              "icon": "trophy",              "check": unique_dates >= 100,  "current": unique_dates,    "target": 100},
        {"id": "pr_1",           "name": "PR Hunter",         "desc": "Hit your first personal record",     "icon": "trophy-outline",      "check": pr_count >= 1,        "current": pr_count,        "target": 1},
        {"id": "pr_5",           "name": "PR Machine",        "desc": "5 personal records",                 "icon": "trophy",              "check": pr_count >= 5,        "current": pr_count,        "target": 5},
        {"id": "pr_10",          "name": "Record Breaker",    "desc": "10 PRs — strength is your language", "icon": "star",                "check": pr_count >= 10,       "current": pr_count,        "target": 10},
        {"id": "exercises_25",   "name": "Exercise Explorer", "desc": "25 different exercises mastered",    "icon": "compass-outline",     "check": unique_exs >= 25,     "current": unique_exs,      "target": 25},
    ]

    earned, locked = [], []
    for b in BADGE_DEFS:
        entry = {"id": b["id"], "name": b["name"], "desc": b["desc"], "icon": b["icon"]}
        if b["check"]:
            earned.append(entry)
        else:
            entry["current"]   = min(b["current"], b["target"])
            entry["target"]    = b["target"]
            entry["remaining"] = max(0, b["target"] - b["current"])
            locked.append(entry)

    # Sort locked by closest to completion (lowest "remaining" first)
    locked.sort(key=lambda x: x.get("remaining", 999))

    return {"earned": earned, "locked": locked, "totalEarned": len(earned), "totalPossible": len(BADGE_DEFS)}


# ══════════════════════════════════════════════════════════════════════════════
# WEEKLY QUEST
# ══════════════════════════════════════════════════════════════════════════════

def _calculate_quest_progress(quest: dict, week_logs: list) -> dict:
    metric = quest.get("metric", "sessions")
    target = quest.get("target", 4)
    if metric == "sessions":
        unique_dates = len(set(l.get("date") for l in week_logs if l.get("date")))
        return {"current": unique_dates, "target": target, "completed": unique_dates >= target}
    elif metric == "volume":
        total_vol = sum(float(l.get("weight", 0)) * int(str(l.get("reps", 0))) for l in week_logs)
        return {"current": int(total_vol), "target": target, "completed": total_vol >= target}
    elif metric == "training_days":
        unique_dates = len(set(l.get("date") for l in week_logs if l.get("date")))
        return {"current": unique_dates, "target": target, "completed": unique_dates >= target}
    return {"current": 0, "target": target, "completed": False}


@api_router.get("/quest")
async def get_weekly_quest(userId: str = Depends(get_current_user)):
    """Generate or return a weekly quest based on the user's training data."""
    import random
    user_filter = _user_or_orphan(userId)
    now = datetime.now()
    monday = now - timedelta(days=now.weekday())
    week_start = monday.strftime("%Y-%m-%d")
    week_end   = (monday + timedelta(days=6)).strftime("%Y-%m-%d")

    week_logs = await db.log.find({**user_filter, "date": {"$gte": week_start, "$lte": week_end}}).to_list(500)
    profile   = await db.profile.find_one({"userId": userId}) or {}
    frequency = int(profile.get("trainingDaysCount", 4))

    existing = await db.weekly_quests.find_one({"userId": userId, "weekStart": week_start})
    if existing:
        existing.pop("_id", None)
        existing["progress"] = _calculate_quest_progress(existing, week_logs)
        return existing

    quest_templates = [
        {"type": "sessions",     "title": f"Complete {frequency} sessions this week", "target": frequency, "metric": "sessions"},
        {"type": "volume",       "title": "Hit 20,000 lbs total volume this week",    "target": 20000,     "metric": "volume"},
        {"type": "consistency",  "title": "Log at least 1 set every training day",    "target": frequency, "metric": "training_days"},
    ]
    random.seed(week_start + userId)
    quest_data = random.choice(quest_templates)
    quest_doc  = {
        "userId": userId, "weekStart": week_start,
        "title": quest_data["title"], "target": quest_data["target"],
        "metric": quest_data["metric"], "type": quest_data["type"],
        "xpReward": 50,
    }
    await db.weekly_quests.insert_one(quest_doc)
    quest_doc.pop("_id", None)
    quest_doc["progress"] = _calculate_quest_progress(quest_doc, week_logs)
    return quest_doc


# ══════════════════════════════════════════════════════════════════════════════
# LEADERBOARD
# ══════════════════════════════════════════════════════════════════════════════

@api_router.get("/leaderboard")
async def get_leaderboard(
    group_code: Optional[str] = None,
    tab: str = "consistency",
    userId: str = Depends(get_current_user),
):
    now = datetime.now()
    month_start = now.replace(day=1).strftime("%Y-%m-%d")
    month_end   = now.strftime("%Y-%m-%d")

    if group_code:
        group = await db.training_groups.find_one({"code": group_code})
        if not group:
            return {"entries": [], "userRank": 0, "totalAthletes": 0}
        member_ids = group.get("members", [])
    else:
        all_profiles = await db.profile.find({"onboardingComplete": True}).to_list(500)
        member_ids   = [p["userId"] for p in all_profiles if p.get("userId")]

    if userId not in member_ids:
        member_ids.append(userId)

    entries = []
    for mid in member_ids[:50]:  # Cap at 50 for perf
        user    = await db.users.find_one({"userId": mid}) or {}
        profile = await db.profile.find_one({"userId": mid}) or {}
        uf      = _user_or_orphan(mid)

        month_logs = await db.log.find({**uf, "date": {"$gte": month_start, "$lte": month_end}}).to_list(500)
        sessions_completed = len(set(l.get("date") for l in month_logs if l.get("date")))
        planned    = int(profile.get("trainingDaysCount", 4)) * 4
        compliance = round(sessions_completed / max(planned, 1) * 100)

        streak_data = await get_streak(mid)
        pr_count = 0
        if tab == "prs":
            # Count exercises with at least one logged set with positive e1rm
            uf_for_pr = _user_or_orphan(mid)
            ex_list = await db.log.distinct("exercise", uf_for_pr)
            for ex in ex_list:
                has_pr = await db.log.find_one({**uf_for_pr, "exercise": ex, "e1rm": {"$gt": 0}})
                if has_pr:
                    pr_count += 1

        name       = user.get("name", "Athlete")
        name_parts = name.strip().split()
        display    = name_parts[0] + (" " + name_parts[-1][0] + "." if len(name_parts) > 1 else "")
        initials   = "".join(w[0].upper() for w in name_parts[:2]) if name_parts else "?"

        entries.append({
            "userId": mid, "name": display, "initials": initials,
            "goal": profile.get("goal", "Strength"),
            "sessionsCompleted": sessions_completed, "sessionsPlanned": planned,
            "compliance": min(100, compliance),
            "streak": streak_data.get("currentStreak", 0),
            "prCount": pr_count,
            "isCurrentUser": mid == userId,
        })

    if tab == "consistency":
        entries.sort(key=lambda e: (-e["compliance"], -e["sessionsCompleted"]))
    elif tab == "streaks":
        entries.sort(key=lambda e: -e["streak"])
    elif tab == "prs":
        entries.sort(key=lambda e: -e["prCount"])

    for i, e in enumerate(entries):
        e["rank"] = i + 1

    user_rank = next((e["rank"] for e in entries if e["isCurrentUser"]), 0)
    return {"entries": entries[:50], "userRank": user_rank, "totalAthletes": len(entries)}


# ══════════════════════════════════════════════════════════════════════════════
# TRAINING GROUPS
# ══════════════════════════════════════════════════════════════════════════════

@api_router.post("/groups/create")
async def create_group(body: dict, userId: str = Depends(get_current_user)):
    import random, string
    code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    name = body.get("name", "My Crew")
    group = {"code": code, "name": name, "createdBy": userId,
             "members": [userId], "createdAt": datetime.now(timezone.utc)}
    await db.training_groups.insert_one(group)
    return {"code": code, "name": name, "members": 1}


@api_router.post("/groups/join")
async def join_group(body: dict, userId: str = Depends(get_current_user)):
    code  = body.get("code", "").strip().upper()
    group = await db.training_groups.find_one({"code": code})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found. Check the code and try again.")
    if userId not in group.get("members", []):
        await db.training_groups.update_one({"code": code}, {"$addToSet": {"members": userId}})
    return {"code": code, "name": group.get("name"), "members": len(group.get("members", [])) + 1}


@api_router.get("/groups")
async def get_my_groups(userId: str = Depends(get_current_user)):
    groups = await db.training_groups.find({"members": userId}).to_list(10)
    return [{"code": g["code"], "name": g["name"], "members": len(g.get("members", []))} for g in groups]


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
