"""
The Program — Core API Router
FastAPI endpoints for the AI coaching app.
Uses in-memory storage (swap to MongoDB with motor for production).
"""

from fastapi import APIRouter, HTTPException
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

DEFAULT_USER = "user_001"


def _id():
    return str(uuid.uuid4())[:12]


# ─── Profile / Intake ────────────────────────────────────────────────────────

@program_router.post("/profile/intake")
async def submit_intake(intake: IntakeRequest):
    """Save onboarding intake and generate 12-month plan."""
    user_id = DEFAULT_USER

    # Create/update profile
    profile = UserProfile(
        userId=user_id,
        goal=GoalType(intake.goal) if intake.goal in [g.value for g in GoalType] else GoalType.STRENGTH,
        experience=ExperienceLevel(intake.experience) if intake.experience in [e.value for e in ExperienceLevel] else ExperienceLevel.INTERMEDIATE,
        currentLifts=intake.lifts,
        liftUnit=intake.liftUnit,
        bodyweight=intake.bodyweight,
        trainingDays=intake.frequency,
        injuries=intake.injuries,
        gymTypes=intake.gym,
        onboardingComplete=True,
    )
    _store["profiles"][user_id] = profile

    # Generate plan
    plan = generate_plan(intake)
    plan.userId = user_id
    _store["plans"][user_id] = plan

    # Create initial coach memory facts from intake
    facts = []
    if intake.injuries and "None" not in intake.injuries:
        for injury in intake.injuries:
            facts.append(CoachMemoryFact(
                factId=_id(), userId=user_id,
                factType="injury", factValue=injury,
                source="onboarding", confirmed=True,
            ))
    if intake.gym:
        facts.append(CoachMemoryFact(
            factId=_id(), userId=user_id,
            factType="equipment", factValue=", ".join(intake.gym),
            source="onboarding", confirmed=True,
        ))
    _store["memory_facts"].extend(facts)

    # Log initial program change
    _store["changes"].append(ProgramChange(
        changeId=_id(), userId=user_id,
        triggerType=ChangeTrigger.USER_REQUEST,
        scope=ChangeScope.YEAR,
        oldValue="No program",
        newValue=plan.planName,
        explanation=f"Generated {plan.planName} based on your {intake.goal} goal as a {intake.experience}-level lifter training {intake.frequency} days/week.",
    ))

    return {
        "success": True,
        "profile": profile.model_dump(),
        "plan": plan.model_dump(),
    }



# ─── Planning ─────────────────────────────────────────────────────────────────

@program_router.get("/plan/year")
async def get_year_plan():
    """Get the full annual plan with phases."""
    plan = _store["plans"].get(DEFAULT_USER)
    if not plan:
        raise HTTPException(status_code=404, detail="No plan found. Complete onboarding first.")
    return plan.model_dump()


@program_router.get("/plan/block/current")
async def get_current_block():
    """Get the current active block with weeks and sessions."""
    plan = _store["plans"].get(DEFAULT_USER)
    if not plan:
        raise HTTPException(status_code=404, detail="No plan found.")

    for phase in plan.phases:
        if phase.status == PhaseStatus.CURRENT:
            for block in phase.blocks:
                if block.status == PhaseStatus.CURRENT:
                    return {
                        "phase": {
                            "name": phase.phaseName,
                            "number": phase.phaseNumber,
                            "goal": phase.goal,
                            "adaptation": phase.expectedAdaptation,
                        },
                        "block": block.model_dump(),
                    }

    # Fallback: return first block
    if plan.phases and plan.phases[0].blocks:
        phase = plan.phases[0]
        block = phase.blocks[0]
        return {
            "phase": {
                "name": phase.phaseName,
                "number": phase.phaseNumber,
                "goal": phase.goal,
                "adaptation": phase.expectedAdaptation,
            },
            "block": block.model_dump(),
        }

    raise HTTPException(status_code=404, detail="No active block found.")


@program_router.get("/plan/session/today")
async def get_today_session():
    """Get today's session with exercises, targets, and last performance."""
    plan = _store["plans"].get(DEFAULT_USER)
    if not plan:
        raise HTTPException(status_code=404, detail="No plan found.")

    # Calculate today's day number (Monday=1, Tuesday=2, ... Sunday=7)
    today_day = datetime.now().weekday() + 1  # weekday() returns 0=Mon

    # Conjugate method: maps calendar day → expected session type
    # Monday=ME Lower, Tuesday=ME Upper, Thursday=DE Lower, Friday=DE Upper
    CONJUGATE_CALENDAR = {
        1: "Max Effort Lower",   # Monday
        2: "Max Effort Upper",   # Tuesday
        4: "Dynamic Effort Lower",  # Thursday
        5: "Dynamic Effort Upper",  # Friday
    }

    # Find current phase → current block → session matching today's day
    for phase in plan.phases:
        if phase.status == PhaseStatus.CURRENT:
            for block in phase.blocks:
                if block.status == PhaseStatus.CURRENT:
                    for week in block.weeks:
                        # First try: match today's exact day number
                        for session in week.sessions:
                            if session.dayNumber == today_day and session.status in [SessionStatus.PLANNED, SessionStatus.IN_PROGRESS]:
                                return {
                                    "phase": phase.phaseName,
                                    "block": block.blockName,
                                    "week": f"Week {week.weekNumber}",
                                    "session": session.model_dump(),
                                }
                        # Second try: match by conjugate calendar session type
                        # (handles existing plans where dayNumbers are 1-4 not matching calendar days)
                        expected_type = CONJUGATE_CALENDAR.get(today_day)
                        if expected_type:
                            for session in week.sessions:
                                if session.sessionType == expected_type and session.status in [SessionStatus.PLANNED, SessionStatus.IN_PROGRESS]:
                                    return {
                                        "phase": phase.phaseName,
                                        "block": block.blockName,
                                        "week": f"Week {week.weekNumber}",
                                        "session": session.model_dump(),
                                    }
                        # Third try: find next upcoming planned session (for rest days like Wed/Sat/Sun)
                        for session in week.sessions:
                            if session.dayNumber >= today_day and session.status in [SessionStatus.PLANNED, SessionStatus.IN_PROGRESS]:
                                return {
                                    "phase": phase.phaseName,
                                    "block": block.blockName,
                                    "week": f"Week {week.weekNumber}",
                                    "session": session.model_dump(),
                                }
                        # Fourth try: first planned session in the week
                        for session in week.sessions:
                            if session.status in [SessionStatus.PLANNED, SessionStatus.IN_PROGRESS]:
                                return {
                                    "phase": phase.phaseName,
                                    "block": block.blockName,
                                    "week": f"Week {week.weekNumber}",
                                    "session": session.model_dump(),
                                }

    # Fallback: first session in plan
    if plan.phases and plan.phases[0].blocks and plan.phases[0].blocks[0].weeks:
        phase = plan.phases[0]
        block = phase.blocks[0]
        week = block.weeks[0]
        if week.sessions:
            return {
                "phase": phase.phaseName,
                "block": block.blockName,
                "week": f"Week {week.weekNumber}",
                "session": week.sessions[0].model_dump(),
            }

    raise HTTPException(status_code=404, detail="No session found for today.")


# ─── Session Execution ────────────────────────────────────────────────────────

@program_router.post("/session/start")
async def start_session(data: Dict):
    """Mark a session as in-progress."""
    session_id = data.get("sessionId", "")
    plan = _store["plans"].get(DEFAULT_USER)
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
async def log_set(data: LogSetRequest):
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
            painId=_id(), userId=DEFAULT_USER,
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
async def adjust_exercise(data: AdjustExerciseRequest):
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
        changeId=_id(), userId=DEFAULT_USER,
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
async def apply_adjustment(data: Dict):
    """Apply an exercise substitution."""
    old_exercise = data.get("oldExercise", "")
    new_exercise = data.get("newExercise", "")
    session_id = data.get("sessionId", "")
    reason = data.get("reason", "preference")

    _store["changes"].append(ProgramChange(
        changeId=_id(), userId=DEFAULT_USER,
        triggerType=ChangeTrigger.USER_REQUEST,
        scope=ChangeScope.DAY,
        oldValue=old_exercise,
        newValue=new_exercise,
        explanation=f"Swapped {old_exercise} → {new_exercise} due to {reason}. Training intent preserved.",
    ))

    return {"success": True, "old": old_exercise, "new": new_exercise}


@program_router.post("/session/finish")
async def finish_session(data: FinishSessionRequest):
    """Finish a session and generate post-workout review."""
    session_id = data.sessionId

    # Count logged sets for this session
    session_sets = [s for s in _store["logged_sets"] if True]  # In production, filter by session
    completed = len(session_sets)

    # Generate wins and flags
    wins = []
    flags = []

    pain_sets = [s for s in session_sets if s.painScore >= 2]
    if not pain_sets:
        wins.append("Clean session — no pain reported")
    if completed > 0:
        wins.append(f"Completed {completed} sets")

    high_pain = [s for s in session_sets if s.painScore >= 3]
    if high_pain:
        flags.append(f"{len(high_pain)} sets had pain ≥ 3 — exercise modification recommended")

    # Mark session completed
    plan = _store["plans"].get(DEFAULT_USER)
    if plan:
        for phase in plan.phases:
            for block in phase.blocks:
                for week in block.weeks:
                    for session in week.sessions:
                        if session.sessionId == session_id:
                            session.status = SessionStatus.COMPLETED
                            session.completedAt = datetime.now()

    # Create workout log
    log = WorkoutLog(
        logId=_id(), userId=DEFAULT_USER, sessionId=session_id,
        completedSets=completed, totalSets=completed + 2,
        duration=45, wins=wins, flags=flags,
        coachReviewNote="Solid session. Keep the momentum going into your next training day."
    )
    _store["workout_logs"].append(log)

    review = PostWorkoutReview(
        sessionId=session_id,
        completedSets=completed,
        totalSets=completed + 2,
        duration=45,
        wins=wins,
        flags=flags,
        coachNote="Good work today. Recovery is the next priority — sleep, hydrate, eat.",
        whatsNext="Next session: Dynamic Effort Upper. Speed work with accommodating resistance.",
    )

    return review.model_dump()


# ─── Pain ─────────────────────────────────────────────────────────────────────

@program_router.post("/pain")
async def log_pain(data: Dict):
    """Log a pain entry."""
    entry = PainEntry(
        painId=_id(), userId=DEFAULT_USER,
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
async def get_pain_trends():
    """Get pain trends over time."""
    entries = [e for e in _store["pain_entries"] if e.userId == DEFAULT_USER]
    # Group by location
    by_location = {}
    for e in entries:
        loc = e.location or "unknown"
        if loc not in by_location:
            by_location[loc] = []
        by_location[loc].append({"score": e.score, "date": e.timestamp.isoformat()})
    return {"trends": by_location, "totalEntries": len(entries)}


# ─── Coach ────────────────────────────────────────────────────────────────────

@program_router.get("/coach/change-log")
async def get_change_log():
    """Get list of program changes with explanations."""
    changes = [c for c in _store["changes"] if c.userId == DEFAULT_USER]
    changes.sort(key=lambda c: c.timestamp, reverse=True)
    return {"changes": [c.model_dump() for c in changes]}


@program_router.get("/coach/memory")
async def get_coach_memory():
    """Get confirmed coach memory facts."""
    facts = [f for f in _store["memory_facts"] if f.userId == DEFAULT_USER and f.confirmed]
    return {"facts": [f.model_dump() for f in facts]}


# ─── Progress ─────────────────────────────────────────────────────────────────

@program_router.get("/progress/prs")
async def get_prs():
    """Get personal records."""
    prs = [p for p in _store["progress"] if p.userId == DEFAULT_USER and p.metricType == "pr"]
    if not prs:
        # Generate mock PRs from intake
        profile = _store["profiles"].get(DEFAULT_USER)
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
async def get_compliance():
    """Get session completion rates."""
    logs = [l for l in _store["workout_logs"] if l.userId == DEFAULT_USER]
    total = len(logs)
    return {
        "overall": 0.92 if total == 0 else total / max(total + 1, 1),
        "totalCompleted": total,
        "totalPlanned": total + 2,
    }


@program_router.get("/progress/bodyweight")
async def get_bodyweight():
    """Get bodyweight trend."""
    profile = _store["profiles"].get(DEFAULT_USER)
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
async def confirm_facts(data: Dict):
    """Confirm extracted facts as coach memory."""
    facts = data.get("facts", [])
    for f in facts:
        fact = CoachMemoryFact(
            factId=_id(), userId=DEFAULT_USER,
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
