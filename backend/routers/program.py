"""
The Program — Core API Router
FastAPI endpoints for the AI coaching app.
Uses in-memory storage (swap to MongoDB with motor for production).
"""

from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from typing import Dict, List, Optional
import uuid

from models.schemas import (
    UserProfile, AnnualPlan, Session, LoggedSet, PainEntry,
    CoachMemoryFact, ProgramChange, WorkoutLog, ProgressMetric,
    IntakeRequest, LogSetRequest, AdjustExerciseRequest,
    FinishSessionRequest, PostWorkoutReview,
    CurrentLifts, GoalType, ExperienceLevel,
    ChangeScope, ChangeTrigger, SessionStatus, PhaseStatus
)
from services.plan_generator import generate_plan, get_alternatives
from database import db
from middleware import get_current_user, DEFAULT_USER


program_router = APIRouter(prefix="/api")

# ─── In-Memory Storage (replace with MongoDB) ────────────────────────────────

_store: Dict = {
    "profiles": {},       # userId -> UserProfile
    "plans": {},          # userId -> AnnualPlan
    "logged_sets": [],    # List[LoggedSet]
    "pain_entries": [],   # List[PainEntry]
    "memory_facts": [],   # List[CoachMemoryFact]
    "changes": [],        # List[ProgramChange]
    "workout_logs": [],   # List[WorkoutLog]
    "progress": [],       # List[ProgressMetric]
}


def _id():
    return str(uuid.uuid4())[:12]


# NOTE: The following routes were previously defined here but are SHADOWED by
# definitions in server.py (which registers api_router before program_router):
#   POST /profile/intake     (live: server.py:3089)
#   GET  /plan/year          (live: server.py:341)
#   GET  /plan/block/current (live: server.py:351)
#   GET  /plan/session/today (live: server.py:410)
# The duplicate handlers were removed to prevent confusion. Do not re-add them
# here without first removing them from server.py.


# ─── Session Execution ────────────────────────────────────────────────────────

@program_router.post("/session/start")
async def start_session(data: Dict, userId: str = Depends(get_current_user)):
    """Mark a session as in-progress."""
    session_id = data.get("sessionId", "")
    plan = _store["plans"].get(userId)
    if plan:
        for phase in plan.phases:
            for block in phase.blocks:
                for week in block.weeks:
                    for session in week.sessions:
                        if session.sessionId == session_id:
                            session.status = SessionStatus.IN_PROGRESS
                            session.startedAt = datetime.now()
                            return {"success": True, "sessionId": session_id}
    return {"success": False, "error": "Session not found"}


@program_router.post("/session/log-set")
async def log_set(data: LogSetRequest, userId: str = Depends(get_current_user)):
    """Log a single set."""
    logged = LoggedSet(
        loggedSetId=_id(),
        sessionExerciseId=data.sessionExerciseId,
        setNumber=data.setNumber,
        actualLoad=data.actualLoad,
        actualReps=data.actualReps,
        actualRPE=data.actualRPE,
        painScore=data.painScore,
        painLocation=data.painLocation,
        painNote=data.painNote,
    )
    _store["logged_sets"].append(logged)

    # If pain is high, create a pain entry and suggest modification
    if data.painScore >= 3:
        pain = PainEntry(
            painId=_id(), userId=userId,
            exerciseId=data.sessionExerciseId,
            location=data.painLocation or "unknown",
            score=data.painScore,
            note=data.painNote,
        )
        _store["pain_entries"].append(pain)

    # Check for PR
    if data.actualLoad and data.actualReps:
        _check_and_record_pr(data)

    return {"success": True, "loggedSet": logged.model_dump()}


@program_router.post("/session/adjust-exercise")
async def adjust_exercise(data: AdjustExerciseRequest, userId: str = Depends(get_current_user)):
    """Get 3 ranked alternatives for an exercise given a reason."""
    alternatives = get_alternatives(data.exerciseName, data.reason)

    if not alternatives:
        # Generic fallback alternatives
        alternatives = [
            {"name": "DB variation", "reason": data.reason, "explanation": f"Dumbbell version reduces {data.reason}-related stress"},
            {"name": "Machine variation", "reason": data.reason, "explanation": f"Machine provides controlled movement path"},
            {"name": "Bodyweight variation", "reason": data.reason, "explanation": f"No equipment needed, adjustable difficulty"},
        ]

    # Log the change
    _store["changes"].append(ProgramChange(
        changeId=_id(), userId=userId,
        triggerType=ChangeTrigger.USER_REQUEST if data.reason == "preference" else ChangeTrigger.PAIN,
        scope=ChangeScope.DAY,
        oldValue=data.exerciseName,
        newValue=f"Alternatives offered: {', '.join(a['name'] for a in alternatives)}",
        explanation=f"Exercise adjustment requested for {data.exerciseName} due to {data.reason}.",
    ))

    return {
        "exercise": data.exerciseName,
        "reason": data.reason,
        "alternatives": alternatives,
    }


@program_router.post("/session/apply-adjustment")
async def apply_adjustment(data: Dict, userId: str = Depends(get_current_user)):
    """Apply an exercise substitution."""
    old_exercise = data.get("oldExercise", "")
    new_exercise = data.get("newExercise", "")
    session_id = data.get("sessionId", "")
    reason = data.get("reason", "preference")

    _store["changes"].append(ProgramChange(
        changeId=_id(), userId=userId,
        triggerType=ChangeTrigger.USER_REQUEST,
        scope=ChangeScope.DAY,
        oldValue=old_exercise,
        newValue=new_exercise,
        explanation=f"Swapped {old_exercise} → {new_exercise} due to {reason}. Training intent preserved.",
    ))

    return {"success": True, "old": old_exercise, "new": new_exercise}


# NOTE: POST /session/finish is shadowed by server.py:379 (api_router wins).
# Removed the duplicate handler here.


# ─── Pain ─────────────────────────────────────────────────────────────────────

@program_router.post("/pain")
async def log_pain(data: Dict, userId: str = Depends(get_current_user)):
    """Log a pain entry."""
    entry = PainEntry(
        painId=_id(), userId=userId,
        exerciseId=data.get("exerciseId"),
        sessionId=data.get("sessionId"),
        location=data.get("location", ""),
        score=data.get("score", 0),
        painType=data.get("type"),
        note=data.get("note"),
    )
    _store["pain_entries"].append(entry)
    return {"success": True, "pain": entry.model_dump()}


@program_router.get("/pain/trends")
async def get_pain_trends(userId: str = Depends(get_current_user)):
    """Get pain trends over time."""
    entries = [e for e in _store["pain_entries"] if e.userId == userId]
    # Group by location
    by_location = {}
    for e in entries:
        loc = e.location or "unknown"
        if loc not in by_location:
            by_location[loc] = []
        by_location[loc].append({"score": e.score, "date": e.timestamp.isoformat()})
    return {"trends": by_location, "totalEntries": len(entries)}


# ─── Coach ────────────────────────────────────────────────────────────────────

# NOTE: GET /coach/change-log is shadowed by server.py:4695 (api_router wins).
# Removed the duplicate handler here.


@program_router.get("/coach/memory")
async def get_coach_memory(userId: str = Depends(get_current_user)):
    """Get confirmed coach memory facts."""
    facts = [f for f in _store["memory_facts"] if f.userId == userId and f.confirmed]
    return {"facts": [f.model_dump() for f in facts]}


# ─── Progress ─────────────────────────────────────────────────────────────────

@program_router.get("/progress/prs")
async def get_prs(userId: str = Depends(get_current_user)):
    """Get personal records."""
    prs = [p for p in _store["progress"] if p.userId == userId and p.metricType == "pr"]
    if not prs:
        # Generate mock PRs from intake
        profile = _store["profiles"].get(userId)
        if profile and profile.currentLifts:
            lifts = profile.currentLifts
            mock_prs = []
            if lifts.squat:
                mock_prs.append({"exercise": "Squat", "value": lifts.squat, "unit": profile.liftUnit, "date": datetime.now().isoformat(), "isNew": False})
            if lifts.bench:
                mock_prs.append({"exercise": "Bench", "value": lifts.bench, "unit": profile.liftUnit, "date": datetime.now().isoformat(), "isNew": False})
            if lifts.deadlift:
                mock_prs.append({"exercise": "Deadlift", "value": lifts.deadlift, "unit": profile.liftUnit, "date": datetime.now().isoformat(), "isNew": False})
            if lifts.ohp:
                mock_prs.append({"exercise": "OHP", "value": lifts.ohp, "unit": profile.liftUnit, "date": datetime.now().isoformat(), "isNew": False})
            return {"prs": mock_prs}
    return {"prs": [p.model_dump() for p in prs]}


@program_router.get("/progress/e1rm/{exercise_name}")
async def get_e1rm(exercise_name: str):
    """Get estimated 1RM trend for an exercise."""
    # Mock data — in production, calculate from logged sets
    return {
        "exercise": exercise_name,
        "trend": [
            {"week": 1, "e1rm": 275},
            {"week": 2, "e1rm": 280},
            {"week": 3, "e1rm": 285},
            {"week": 4, "e1rm": 282},
        ],
        "current": 285,
    }


@program_router.get("/progress/volume")
async def get_volume_trends():
    """Get weekly volume trends."""
    return {
        "weeks": [
            {"week": 1, "totalSets": 85, "tonnage": 42500},
            {"week": 2, "totalSets": 88, "tonnage": 44800},
            {"week": 3, "totalSets": 90, "tonnage": 46200},
            {"week": 4, "totalSets": 72, "tonnage": 35000},  # deload
        ]
    }


@program_router.get("/progress/compliance")
async def get_compliance(userId: str = Depends(get_current_user)):
    """Get session completion rates."""
    logs = [l for l in _store["workout_logs"] if l.userId == userId]
    total = len(logs)
    return {
        "overall": 0.92 if total == 0 else total / max(total + 1, 1),
        "totalCompleted": total,
        "totalPlanned": total + 2,
    }


@program_router.get("/progress/bodyweight")
async def get_bodyweight(userId: str = Depends(get_current_user)):
    """Get bodyweight trend."""
    profile = _store["profiles"].get(userId)
    bw = profile.bodyweight if profile and profile.bodyweight else 200
    return {
        "current": bw,
        "trend": [
            {"date": "2026-03-01", "weight": bw - 2},
            {"date": "2026-03-15", "weight": bw - 1},
            {"date": "2026-04-01", "weight": bw},
        ]
    }


# ─── Uploads ──────────────────────────────────────────────────────────────────

@program_router.post("/uploads/confirm")
async def confirm_facts(data: Dict, userId: str = Depends(get_current_user)):
    """Confirm extracted facts as coach memory."""
    facts = data.get("facts", [])
    for f in facts:
        fact = CoachMemoryFact(
            factId=_id(), userId=userId,
            factType=f.get("type", "general"),
            factValue=f.get("value", ""),
            source="upload", confirmed=True,
        )
        _store["memory_facts"].append(fact)
    return {"success": True, "confirmedCount": len(facts)}


# ─── Helper ───────────────────────────────────────────────────────────────────

def _check_and_record_pr(data: LogSetRequest):
    """Check if a logged set is a new PR and record it."""
    # In production, compare against historical data
    pass
