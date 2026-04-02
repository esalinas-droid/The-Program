from fastapi import APIRouter, HTTPException, Query
from typing import Optional, Dict, List, Any
from datetime import datetime, date
import uuid
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.schemas import (
    IntakeRequest, IntakeResponse,
    UserProfile,
    LogSetRequest, FinishSessionRequest, AdjustExerciseRequest,
    WorkoutLog,
)
from services.plan_generator import generate_plan, get_today_session, get_current_block_data

router = APIRouter()

# =======================================================================
# IN-MEMORY STORAGE  (replaced with MongoDB in production)
# =======================================================================
_profiles: Dict[str, dict]   = {}   # userId  -> profile dict
_plans:    Dict[str, dict]   = {}   # userId  -> plan dict
_active:   Dict[str, dict]   = {}   # userId  -> {sessionId, exercise_sets{}}
_logs:     List[dict]        = []
_changes:  List[dict]        = []
_prs:      Dict[str, dict]   = {}   # userId -> {exerciseId -> best_estimated_1rm}
_pain_log: List[dict]        = []


# -----------------------------------------------------------------------
# HELPERS
# -----------------------------------------------------------------------

def _epley_1rm(weight: float, reps: int) -> float:
    return weight * (1 + reps / 30) if reps > 1 else weight


def _check_pr(user_id: str, ex_id: str, weight: float, reps: int) -> bool:
    est = _epley_1rm(weight, reps)
    user_prs = _prs.setdefault(user_id, {})
    if ex_id not in user_prs or est > user_prs[ex_id]["estimated1RM"]:
        user_prs[ex_id] = {
            "exerciseId": ex_id,
            "estimated1RM": round(est, 1),
            "actualWeight": weight,
            "actualReps": reps,
            "date": datetime.utcnow().isoformat(),
        }
        return True
    return False


# =======================================================================
# PROFILE
# =======================================================================

@router.post("/profile/intake", response_model=IntakeResponse)
async def submit_intake(body: IntakeRequest):
    """Save profile from onboarding, generate full annual plan, return both."""
    user_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    profile = {
        "userId": user_id,
        "name": body.name,
        "email": body.email,
        "goal": body.goal.lower(),
        "experience": body.experience.lower(),
        "currentLifts": body.currentLifts,
        "liftUnit": body.liftUnit,
        "bodyweight": body.bodyweight,
        "trainingDays": [d.lower() for d in body.trainingDays],
        "injuries": body.injuries,
        "gymTypes": body.gymTypes,
        "onboardingComplete": True,
        "currentWeek": 1,
        "createdAt": now,
    }
    _profiles[user_id] = profile

    intake_dict = body.dict()
    intake_dict["userId"] = user_id
    plan = generate_plan(intake_dict)
    _plans[user_id] = plan

    return IntakeResponse(
        userId=user_id,
        profile=UserProfile(**profile),
        plan=plan,
        message=f"Welcome, {body.name}! Your 12-month program is ready.",
    )


@router.get("/profile")
async def get_profile(userId: str = Query(...)):
    p = _profiles.get(userId)
    if not p:
        raise HTTPException(404, "Profile not found")
    return p


@router.put("/profile")
async def update_profile(body: dict, userId: str = Query(...)):
    if userId not in _profiles:
        raise HTTPException(404, "Profile not found")
    body.pop("userId", None)
    body["updatedAt"] = datetime.utcnow().isoformat()
    _profiles[userId].update(body)
    return _profiles[userId]


# =======================================================================
# PLAN
# =======================================================================

@router.get("/plan/year")
async def get_year_plan(userId: str = Query(...)):
    """Return annual plan with phase/block summaries (exercises omitted for performance)."""
    plan = _plans.get(userId)
    if not plan:
        raise HTTPException(404, "Plan not found. Complete onboarding first.")

    # Lightweight version — strip session exercises to reduce payload
    summary_phases = []
    for phase in plan.get("phases", []):
        summary_blocks = []
        for block in phase.get("blocks", []):
            session_previews = [
                {
                    "weekNumber": s["weekNumber"],
                    "dayNumber": s["dayNumber"],
                    "dayOfWeek": s.get("dayOfWeek", ""),
                    "sessionType": s["sessionType"],
                    "objective": s["objective"],
                    "isDeload": s.get("isDeload", False),
                    "status": s["status"],
                }
                for s in block.get("sessions", [])
            ]
            summary_blocks.append({
                **{k: v for k, v in block.items() if k != "sessions"},
                "sessionPreviews": session_previews,
            })
        summary_phases.append({
            **{k: v for k, v in phase.items() if k != "blocks"},
            "blocks": summary_blocks,
        })

    return {
        "planId": plan["planId"],
        "userId": userId,
        "planName": plan["planName"],
        "startDate": plan["startDate"],
        "totalWeeks": plan["totalWeeks"],
        "milestones": plan.get("milestones", []),
        "status": plan["status"],
        "generatedAt": plan["generatedAt"],
        "phases": summary_phases,
    }


@router.get("/plan/block/current")
async def get_current_block(userId: str = Query(...)):
    """Return the current training block including full session + exercise data."""
    profile = _profiles.get(userId)
    if not profile:
        raise HTTPException(404, "Profile not found")
    plan = _plans.get(userId)
    if not plan:
        raise HTTPException(404, "Plan not found")

    current_week = profile.get("currentWeek", 1)
    block = get_current_block_data(plan, current_week)
    if not block:
        raise HTTPException(404, f"No block found for week {current_week}")
    return {**block, "currentWeek": current_week}


@router.get("/plan/session/today")
async def get_today_session_api(
    userId: str = Query(...),
    weekOverride: Optional[int] = Query(None),
    dayOverride: Optional[str] = Query(None),
):
    """Return today's training session with full exercise prescriptions."""
    profile = _profiles.get(userId)
    if not profile:
        raise HTTPException(404, "Profile not found")
    plan = _plans.get(userId)
    if not plan:
        raise HTTPException(404, "Plan not found. Complete onboarding to generate a plan.")

    current_week = weekOverride or profile.get("currentWeek", 1)
    today = dayOverride or date.today().strftime("%A").lower()

    session = get_today_session(plan, current_week, today)
    if not session:
        training_days = profile.get("trainingDays", [])
        if today not in [d.lower() for d in training_days]:
            return {
                "restDay": True,
                "message": f"{today.capitalize()} is a rest day. Recover well.",
                "currentWeek": current_week,
                "trainingDays": training_days,
            }
        raise HTTPException(404, f"No session for week {current_week}, {today}")

    return {
        **session,
        "currentWeek": current_week,
        "planGoal": plan.get("goal", plan.get("planName", "")),
    }


@router.get("/plan/week/{week_number}")
async def get_week_sessions(week_number: int, userId: str = Query(...)):
    plan = _plans.get(userId)
    if not plan:
        raise HTTPException(404, "Plan not found")
    for phase in plan.get("phases", []):
        for block in phase.get("blocks", []):
            week_sessions = [s for s in block.get("sessions", []) if s["weekNumber"] == week_number]
            if week_sessions:
                return {
                    "weekNumber": week_number,
                    "phaseName": phase["phaseName"],
                    "blockName": block["blockName"],
                    "sessions": week_sessions,
                }
    raise HTTPException(404, f"Week {week_number} not found")


@router.post("/plan/advance-week")
async def advance_week(userId: str = Query(...)):
    if userId not in _profiles:
        raise HTTPException(404, "Profile not found")
    _profiles[userId]["currentWeek"] = _profiles[userId].get("currentWeek", 1) + 1
    return {"currentWeek": _profiles[userId]["currentWeek"]}


# =======================================================================
# SESSION LOGGING
# =======================================================================

@router.post("/session/log-set")
async def log_set(body: LogSetRequest, userId: str = Query(...)):
    """Log a single set. Auto-detects PRs."""
    now = datetime.utcnow().isoformat()
    user_active = _active.setdefault(userId, {})
    sess_data = user_active.setdefault(body.sessionId, {"sets": [], "startedAt": now})

    set_entry = {
        "sessionExerciseId": body.sessionExerciseId,
        "setNumber": body.setNumber,
        "actualLoad": body.actualLoad,
        "actualReps": body.actualReps,
        "actualRPE": body.actualRPE,
        "painScore": body.painScore,
        "notes": body.notes,
        "timestamp": now,
    }
    sess_data["sets"].append(set_entry)

    is_pr = False
    if body.actualLoad and body.actualReps:
        is_pr = _check_pr(userId, body.sessionExerciseId, body.actualLoad, body.actualReps)

        if body.painScore and body.painScore >= 4:
            _pain_log.append({
                "userId": userId, "exerciseId": body.sessionExerciseId,
                "score": body.painScore, "timestamp": now,
            })

    return {"success": True, "isPR": is_pr, "message": "Set logged" + (" — NEW PR!" if is_pr else "")}


@router.post("/session/finish")
async def finish_session(body: FinishSessionRequest, userId: str = Query(...)):
    """Complete a session. Returns summary with wins and flags."""
    now = datetime.utcnow().isoformat()
    sess_data = _active.get(userId, {}).get(body.sessionId, {"sets": []})
    sets = sess_data.get("sets", [])

    # Tally stats
    total_volume = sum(
        (s.get("actualLoad") or 0) * (s.get("actualReps") or 0) for s in sets
    )
    pr_exercises = [
        s["sessionExerciseId"] for s in sets
        if s.get("actualLoad") and s.get("actualReps")
        and _check_pr(userId, s["sessionExerciseId"], s["actualLoad"], s["actualReps"])
    ]
    pain_flags = [s for s in sets if (s.get("painScore") or 0) >= 5]

    log = {
        "logId": str(uuid.uuid4()),
        "userId": userId,
        "sessionId": body.sessionId,
        "completedSets": len(sets),
        "totalSets": len(sets),
        "duration": body.duration,
        "totalVolume": round(total_volume, 1),
        "prCount": len(pr_exercises),
        "notes": body.notes,
        "completedAt": now,
    }
    _logs.append(log)

    # Clean up active session
    if userId in _active and body.sessionId in _active[userId]:
        del _active[userId][body.sessionId]

    return {
        "success": True,
        "logId": log["logId"],
        "summary": {
            "setsCompleted": len(sets),
            "totalVolume": log["totalVolume"],
            "newPRs": len(pr_exercises),
            "prExercises": pr_exercises,
            "painFlags": len(pain_flags),
            "duration": body.duration,
        },
        "wins": [
            f"Completed {len(sets)} sets",
            *(f"PR on {ex}!" for ex in pr_exercises),
        ],
        "flags": [
            f"High pain score on set ({s['sessionExerciseId']})" for s in pain_flags
        ],
        "message": "Session complete. Great work!",
    }


@router.post("/session/adjust-exercise")
async def adjust_exercise(body: AdjustExerciseRequest, userId: str = Query(...)):
    """Return 3 exercise alternatives given exercise + reason."""
    from services.plan_generator import (
        ME_LOWER_ROTATIONS, ME_UPPER_ROTATIONS,
        LOWER_SUPPLEMENTAL, UPPER_BACK, UPPER_TRICEPS,
    )

    reason = body.reason.lower()
    ex_id  = body.sessionExerciseId.lower()

    # Simple heuristic: pick alternatives from the same pool
    if any(k in ex_id for k in ["squat", "deadlift", "pull", "good_morning"]):
        pool = [(x[0], x[1]) for x in ME_LOWER_ROTATIONS]
    elif any(k in ex_id for k in ["bench", "press", "floor"]):
        pool = [(x[0], x[1]) for x in ME_UPPER_ROTATIONS]
    elif any(k in ex_id for k in ["tricep", "skull", "jm", "tate"]):
        pool = [(x[0], x[1]) for x in UPPER_TRICEPS]
    elif any(k in ex_id for k in ["row", "pulldown", "lat"]):
        pool = [(x[0], x[1]) for x in UPPER_BACK]
    else:
        pool = [(x[0], x[1]) for x in LOWER_SUPPLEMENTAL]

    # Filter out the original exercise
    alternatives = [p for p in pool if p[0] != ex_id][:3]

    change_doc = {
        "changeId": str(uuid.uuid4()),
        "userId": userId,
        "triggerType": reason,
        "scope": "session",
        "oldValue": body.sessionExerciseId,
        "newValue": alternatives[0][0] if alternatives else None,
        "explanation": f"User requested {reason} — {len(alternatives)} alternatives provided",
        "timestamp": datetime.utcnow().isoformat(),
    }
    _changes.append(change_doc)

    return {
        "alternatives": [
            {"exerciseId": a[0], "name": a[1]} for a in alternatives
        ],
        "change": change_doc,
    }


# =======================================================================
# COACH
# =======================================================================

@router.get("/coach/change-log")
async def get_change_log(userId: str = Query(...), limit: int = Query(20)):
    user_changes = [c for c in _changes if c.get("userId") == userId]
    return {"changes": user_changes[-limit:][::-1], "total": len(user_changes)}


@router.get("/coach/workout-history")
async def get_workout_history(userId: str = Query(...), limit: int = Query(10)):
    user_logs = [l for l in _logs if l.get("userId") == userId]
    return {"logs": user_logs[-limit:][::-1], "total": len(user_logs)}


# =======================================================================
# PROGRESS
# =======================================================================

@router.get("/progress/prs")
async def get_prs(userId: str = Query(...)):
    user_prs = _prs.get(userId, {})
    pr_list = sorted(user_prs.values(), key=lambda x: x["exerciseId"])
    return {"prs": pr_list, "total": len(pr_list)}


@router.post("/progress/record-pr")
async def record_pr(body: dict, userId: str = Query(...)):
    ex_id = body.get("exerciseId", "")
    value = float(body.get("value", 0))
    user_prs = _prs.setdefault(userId, {})
    user_prs[ex_id] = {
        "exerciseId": ex_id,
        "estimated1RM": value,
        "actualWeight": value,
        "actualReps": 1,
        "date": datetime.utcnow().isoformat(),
        "notes": body.get("notes", ""),
    }
    return {"success": True, "pr": user_prs[ex_id]}


@router.get("/progress/pain-log")
async def get_pain_log(userId: str = Query(...)):
    user_pain = [p for p in _pain_log if p.get("userId") == userId]
    return {"entries": user_pain, "total": len(user_pain)}
