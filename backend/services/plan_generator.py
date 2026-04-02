"""
Deterministic 12-month training plan generator.
Takes intake profile data and returns a structured AnnualPlan + first week sessions.
No AI call required — rule-based periodization logic.
"""
import uuid
import math
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional

from .exercise_library import EXERCISE_DB, get_exercises_for_session, get_exercise_name


def _id() -> str:
    return str(uuid.uuid4())[:12]


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Phase templates by training model ───────────────────────────────────────

PHASE_TEMPLATES: Dict[str, List[Dict]] = {
    "conjugate": [
        {"name": "Foundation",        "weeks": 12, "goal": "Movement quality, GPP, baseline strength",
         "adaptation": "Re-establish motor patterns, address weak points, build work capacity"},
        {"name": "Strength Base",      "weeks": 12, "goal": "Raw strength accumulation",
         "adaptation": "Progressive overload on competition movements, build structural strength"},
        {"name": "Intensification",    "weeks": 12, "goal": "Maximum strength and rate of force development",
         "adaptation": "Heavier loading, shorter volume, peak force output"},
        {"name": "Competition Prep",   "weeks": 12, "goal": "Event-specific prep and peaking",
         "adaptation": "Competition movements, taper, peak performance"},
        {"name": "Transition",         "weeks": 4,  "goal": "Active recovery, reassessment, reset",
         "adaptation": "Systemic recovery, address accumulated fatigue, plan next cycle"},
    ],
    "block_hypertrophy": [
        {"name": "Accumulation",       "weeks": 16, "goal": "Maximum hypertrophy volume",
         "adaptation": "High-volume training, mechanical tension and metabolic stress"},
        {"name": "Intensification",    "weeks": 12, "goal": "Convert size to strength",
         "adaptation": "Heavier loads, strength patterns, neural adaptations"},
        {"name": "Realization",        "weeks": 8,  "goal": "Peak strength expression",
         "adaptation": "Competition or testing week performance"},
        {"name": "Deload/Transition",  "weeks": 8,  "goal": "Recovery and next cycle preparation",
         "adaptation": "Systemic recovery, address weak points"},
        {"name": "New Accumulation",   "weeks": 8,  "goal": "Second hypertrophy wave",
         "adaptation": "Volume with heavier base, compound improvements"},
    ],
    "balanced": [
        {"name": "General Fitness",    "weeks": 12, "goal": "Build all qualities simultaneously",
         "adaptation": "Strength, endurance, mobility — concurrent development"},
        {"name": "Strength Emphasis",  "weeks": 10, "goal": "Prioritise strength gains",
         "adaptation": "Heavier compound work, deemphasise cardio"},
        {"name": "Conditioning Block", "weeks": 10, "goal": "Raise work capacity",
         "adaptation": "Metabolic conditioning, circuit work, carries"},
        {"name": "Peak Fitness",       "weeks": 12, "goal": "Peak physical performance",
         "adaptation": "All qualities at high level"},
        {"name": "Maintenance",        "weeks": 8,  "goal": "Maintain gains, reduce fatigue",
         "adaptation": "Reduced volume, maintained intensity"},
    ],
}


# ─── Session templates by goal + frequency ───────────────────────────────────

SESSION_TYPES_BY_FREQ: Dict[int, List[str]] = {
    3: ["ME Lower", "ME Upper", "DE Lower"],
    4: ["ME Lower", "ME Upper", "DE Lower", "DE Upper"],
    5: ["ME Lower", "ME Upper", "DE Lower", "DE Upper", "GPP"],
    6: ["ME Lower", "ME Upper", "DE Lower", "DE Upper", "GPP", "GPP"],
}

# Day-of-week assignment (1=Mon ... 7=Sun)
SESSION_DAY_MAP: Dict[int, List[int]] = {
    3: [1, 3, 5],
    4: [1, 3, 5, 6],
    5: [1, 2, 4, 5, 6],
    6: [1, 2, 3, 5, 6, 7],
}

DAY_NAMES = {1: "Monday", 2: "Tuesday", 3: "Wednesday",
             4: "Thursday", 5: "Friday", 6: "Saturday", 7: "Sunday"}

# Load percentages (of 1RM) for each phase and session type
LOAD_PARAMS: Dict[str, Dict[str, Dict]] = {
    "Foundation": {
        "ME": {"warmup_pcts": [0.45, 0.55, 0.65], "working_pcts": [0.70, 0.77, 0.83], "working_reps": [3, 2, 1], "rpes": [7, 8, 8.5]},
        "DE": {"pct": 0.55, "sets": 8, "reps": 2, "rpe": 6},
        "supp_pct": 0.55, "supp_reps": 8, "acc_rpe": 7,
    },
    "Strength Base": {
        "ME": {"warmup_pcts": [0.50, 0.60, 0.70], "working_pcts": [0.75, 0.82, 0.88], "working_reps": [3, 2, 1], "rpes": [7.5, 8.5, 9]},
        "DE": {"pct": 0.60, "sets": 8, "reps": 2, "rpe": 6.5},
        "supp_pct": 0.60, "supp_reps": 6, "acc_rpe": 7.5,
    },
    "Intensification": {
        "ME": {"warmup_pcts": [0.55, 0.65, 0.75], "working_pcts": [0.82, 0.88, 0.93], "working_reps": [2, 1, 1], "rpes": [8, 9, 9.5]},
        "DE": {"pct": 0.65, "sets": 6, "reps": 2, "rpe": 7},
        "supp_pct": 0.65, "supp_reps": 5, "acc_rpe": 8,
    },
    "Competition Prep": {
        "ME": {"warmup_pcts": [0.60, 0.70, 0.80], "working_pcts": [0.87, 0.92, 0.97], "working_reps": [2, 1, 1], "rpes": [8.5, 9, 9.5]},
        "DE": {"pct": 0.68, "sets": 6, "reps": 1, "rpe": 7},
        "supp_pct": 0.65, "supp_reps": 4, "acc_rpe": 8,
    },
    "Transition": {
        "ME": {"warmup_pcts": [0.40, 0.50], "working_pcts": [0.60, 0.65], "working_reps": [5, 3], "rpes": [6, 6.5]},
        "DE": {"pct": 0.45, "sets": 6, "reps": 2, "rpe": 5},
        "supp_pct": 0.50, "supp_reps": 10, "acc_rpe": 6,
    },
    "Accumulation": {
        "ME": {"warmup_pcts": [0.50, 0.60], "working_pcts": [0.65, 0.72, 0.78], "working_reps": [5, 4, 3], "rpes": [7, 7.5, 8]},
        "DE": {"pct": 0.55, "sets": 4, "reps": 10, "rpe": 7},
        "supp_pct": 0.55, "supp_reps": 12, "acc_rpe": 7,
    },
    "Realization": {
        "ME": {"warmup_pcts": [0.55, 0.65, 0.75], "working_pcts": [0.82, 0.87, 0.92], "working_reps": [3, 2, 1], "rpes": [8, 8.5, 9]},
        "DE": {"pct": 0.60, "sets": 6, "reps": 3, "rpe": 7},
        "supp_pct": 0.60, "supp_reps": 6, "acc_rpe": 7.5,
    },
    "General Fitness": {
        "ME": {"warmup_pcts": [0.45, 0.55], "working_pcts": [0.65, 0.72], "working_reps": [5, 4], "rpes": [6.5, 7.5]},
        "DE": {"pct": 0.50, "sets": 4, "reps": 8, "rpe": 6},
        "supp_pct": 0.50, "supp_reps": 12, "acc_rpe": 6.5,
    },
    "Strength Emphasis": {
        "ME": {"warmup_pcts": [0.50, 0.60, 0.70], "working_pcts": [0.75, 0.82], "working_reps": [3, 2], "rpes": [7.5, 8.5]},
        "DE": {"pct": 0.55, "sets": 6, "reps": 3, "rpe": 6.5},
        "supp_pct": 0.55, "supp_reps": 8, "acc_rpe": 7,
    },
    "Conditioning Block": {
        "ME": {"warmup_pcts": [0.45, 0.55], "working_pcts": [0.65, 0.70], "working_reps": [5, 5], "rpes": [6.5, 7.5]},
        "DE": {"pct": 0.50, "sets": 5, "reps": 5, "rpe": 6},
        "supp_pct": 0.50, "supp_reps": 15, "acc_rpe": 6.5,
    },
    "Peak Fitness": {
        "ME": {"warmup_pcts": [0.55, 0.65, 0.72], "working_pcts": [0.78, 0.84], "working_reps": [4, 2], "rpes": [7.5, 8.5]},
        "DE": {"pct": 0.58, "sets": 6, "reps": 3, "rpe": 6.5},
        "supp_pct": 0.58, "supp_reps": 8, "acc_rpe": 7.5,
    },
    "Maintenance": {
        "ME": {"warmup_pcts": [0.45, 0.55], "working_pcts": [0.68, 0.72], "working_reps": [4, 3], "rpes": [6.5, 7]},
        "DE": {"pct": 0.50, "sets": 4, "reps": 4, "rpe": 5.5},
        "supp_pct": 0.52, "supp_reps": 10, "acc_rpe": 6.5,
    },
    "New Accumulation": {
        "ME": {"warmup_pcts": [0.50, 0.60], "working_pcts": [0.67, 0.73, 0.78], "working_reps": [5, 4, 3], "rpes": [7, 7.5, 8]},
        "DE": {"pct": 0.55, "sets": 4, "reps": 10, "rpe": 7},
        "supp_pct": 0.55, "supp_reps": 12, "acc_rpe": 7,
    },
}


# ─── ME exercise rotation (conjugate method) ──────────────────────────────────

ME_LOWER_ROTATION: Dict[str, List[str]] = {
    "strength": ["ssb_box_squat", "rdl", "good_morning", "trap_bar_deadlift",
                 "ssb_box_squat", "conventional_deadlift", "pause_squat", "block_pull"],
    "strongman": ["ssb_box_squat", "trap_bar_deadlift", "rdl", "conventional_deadlift",
                  "ssb_box_squat", "good_morning", "block_pull", "pause_squat"],
    "hypertrophy": ["rdl", "trap_bar_deadlift", "leg_press", "pause_squat",
                    "rdl", "conventional_deadlift", "belt_squat", "hip_thrust"],
    "general": ["trap_bar_deadlift", "rdl", "leg_press", "hip_thrust",
                "trap_bar_deadlift", "pause_squat", "rdl", "belt_squat"],
    "athletic": ["trap_bar_deadlift", "pause_squat", "rdl", "hip_thrust",
                 "trap_bar_deadlift", "conventional_deadlift", "rdl", "belt_squat"],
}

ME_UPPER_ROTATION: Dict[str, List[str]] = {
    "strength": ["floor_press", "close_grip_bench", "incline_db_press", "ohp_barbell",
                 "floor_press", "close_grip_bench", "incline_db_press", "ohp_barbell"],
    "strongman": ["floor_press", "log_clean_press", "axle_clean_press", "ohp_barbell",
                  "floor_press", "close_grip_bench", "log_clean_press", "axle_clean_press"],
    "hypertrophy": ["incline_db_press", "close_grip_bench", "floor_press", "ohp_barbell",
                    "incline_db_press", "close_grip_bench", "floor_press", "ohp_barbell"],
    "general": ["ohp_barbell", "incline_db_press", "close_grip_bench", "floor_press",
                "ohp_barbell", "incline_db_press", "close_grip_bench", "floor_press"],
    "athletic": ["ohp_barbell", "incline_db_press", "close_grip_bench", "floor_press",
                 "ohp_barbell", "incline_db_press", "close_grip_bench", "floor_press"],
}


# ─── Coach notes by phase ─────────────────────────────────────────────────────

COACH_NOTES: Dict[str, Dict[str, str]] = {
    "Foundation": {
        "ME Lower": "Focus on movement quality. Every rep should be textbook. Stay under RPE 8.5 today.",
        "ME Upper": "Build your pressing foundation. Technique over load — always. Set the baseline.",
        "DE Lower": "Speed work: bar has to move fast or it does not count. 55% feels light — make it look violent.",
        "DE Upper": "Compensatory acceleration. You are training rate of force development, not max strength. Bar speed is the metric.",
        "GPP": "General prep work. Build your conditioning base and address structural weaknesses.",
    },
    "Strength Base": {
        "ME Lower": "Time to load the patterns we built. Push your top set toward RPE 8.5-9. Compete with yourself.",
        "ME Upper": "Drive your pressing numbers up. The work in Foundation has earned you these heavier loads.",
        "DE Lower": "Speed with load. The bar should jump off the floor. Every single rep counts.",
        "DE Upper": "60% should feel explosive. If you cannot move it fast, something is wrong with your setup.",
        "GPP": "Carry heavy, push hard, recover smart.",
    },
    "Intensification": {
        "ME Lower": "We are in maximum strength territory. Your technique has to hold at 90%+. No breaks in the chain.",
        "ME Upper": "Big weights, big focus. The ramp-up sets are not warm-ups — they are precision work.",
        "DE Lower": "High intent speed work. 65% with maximal acceleration.",
        "DE Upper": "65% speed bench. The speed you build here pays off on max effort days.",
        "GPP": "Conditioning maintained at lower volume. Protect your recovery this block.",
    },
    "Competition Prep": {
        "ME Lower": "Peak performance territory. Trust the preparation and attack this.",
        "ME Upper": "You have been building toward this. Show up with intent and execute.",
        "DE Lower": "Maintained speed work. Competition sharpness is the goal.",
        "DE Upper": "Crisp technique, fast bar. You are sharpening, not grinding.",
        "GPP": "Event-specific work. Train what you will compete in.",
    },
    "Transition": {
        "ME Lower": "Deload week. 60% max effort. Move well, not heavy.",
        "ME Upper": "Active recovery pressing. Focus on technique and shoulder health.",
        "DE Lower": "Light speed work. Reset your system.",
        "DE Upper": "Easy session. Accumulate movement quality.",
        "GPP": "Light GPP. Recovery focus.",
    },
}


# ─── Warm-up protocols ────────────────────────────────────────────────────────

WARMUP_PROTOCOLS: Dict[str, str] = {
    "ME Lower": "5 min bike/row → 2×10 Band Pull-Aparts → 2×10 Glute Bridges → 1×10 Air Squats → 2×5 Goblet Squat",
    "ME Upper": "5 min cardio → 2×15 Band Pull-Aparts → 2×12 Face Pull (light) → 2×10 Shoulder CARs → 1×8 Empty bar press",
    "DE Lower": "5 min bike → 2×30s Hip Flexor Stretch → 2×10 Glute Bridges → 1×10 Air Squats",
    "DE Upper": "5 min bike/row → 2×15 Band Pull-Aparts → 2×10 Shoulder CARs → 1×8 Speed ramp sets",
    "GPP": "5-10 min general cardio → Dynamic stretch → Activation work",
    "Off": "",
}


# ─── Round to nearest 5 for load calculation ─────────────────────────────────

def _round5(v: float) -> float:
    return max(float(round(v / 5) * 5), 0.0)


def _calc_load(pr: float, pct: float, unit: str = "lbs") -> float:
    if pr <= 0:
        return 0.0
    raw = pr * pct
    # Round to nearest 2.5 for kg, nearest 5 for lbs
    divisor = 2.5 if unit == "kg" else 5.0
    return max(float(round(raw / divisor) * divisor), 0.0)


def _get_pr_for_exercise(ex_id: str, lifts: Dict[str, float]) -> float:
    ex = EXERCISE_DB.get(ex_id, {})
    ref = ex.get("load_ref")
    if not ref:
        return 0.0
    return lifts.get(ref, 0.0)


# ─── Build target sets for a main (ME/DE) exercise ───────────────────────────

def _build_me_sets(ex_id: str, lifts: Dict[str, float],
                  phase_name: str, unit: str) -> List[Dict]:
    """Return list of TargetSet dicts for a max-effort exercise."""
    pr = _get_pr_for_exercise(ex_id, lifts)
    params = LOAD_PARAMS.get(phase_name, LOAD_PARAMS["Foundation"]).get("ME", {})
    warmup_pcts: List[float] = params.get("warmup_pcts", [0.45, 0.55, 0.65])
    working_pcts: List[float] = params.get("working_pcts", [0.70, 0.77, 0.83])
    working_reps: List[int]   = params.get("working_reps", [3, 2, 1])
    rpes: List[float]          = params.get("rpes", [7, 8, 8.5])

    sets = []
    # Warm-up sets
    warmup_reps = [5, 3, 1]
    for i, pct in enumerate(warmup_pcts):
        reps = warmup_reps[i] if i < len(warmup_reps) else 1
        sets.append({
            "setNumber": i + 1,
            "targetLoad": _calc_load(pr, pct, unit) if pr > 0 else 0.0,
            "loadUnit": unit,
            "targetReps": reps,
            "targetRPE": float(i + 5),  # 5, 6, 7 for warm-ups
            "isAmrap": False,
            "notes": "Warm-up"
        })
    # Working sets
    offset = len(warmup_pcts)
    for i, (pct, reps, rpe) in enumerate(zip(working_pcts, working_reps, rpes)):
        sets.append({
            "setNumber": offset + i + 1,
            "targetLoad": _calc_load(pr, pct, unit) if pr > 0 else 0.0,
            "loadUnit": unit,
            "targetReps": reps,
            "targetRPE": rpe,
            "isAmrap": i == len(working_pcts) - 1,  # last set is AMRAP
            "notes": "Top set" if i == len(working_pcts) - 1 else "Working set"
        })
    return sets


def _build_de_sets(ex_id: str, lifts: Dict[str, float],
                  phase_name: str, unit: str) -> List[Dict]:
    """Return list of TargetSet dicts for a dynamic-effort exercise."""
    pr = _get_pr_for_exercise(ex_id, lifts)
    params = LOAD_PARAMS.get(phase_name, LOAD_PARAMS["Foundation"]).get("DE", {})
    pct  = params.get("pct", 0.55)
    sets_n = params.get("sets", 8)
    reps   = params.get("reps", 2)
    rpe    = params.get("rpe", 6)

    load = _calc_load(pr, pct, unit) if pr > 0 else 0.0
    return [{
        "setNumber": i + 1,
        "targetLoad": load,
        "loadUnit": unit,
        "targetReps": reps,
        "targetRPE": rpe,
        "isAmrap": False,
        "notes": f"Set {i+1}/{sets_n} — max speed"
    } for i in range(sets_n)]


def _build_supp_sets(pr_ref: float, phase_name: str, unit: str,
                    default_sets: int = 3) -> List[Dict]:
    """Return target sets for a supplemental exercise."""
    params = LOAD_PARAMS.get(phase_name, LOAD_PARAMS["Foundation"])
    pct  = params.get("supp_pct", 0.55)
    reps = params.get("supp_reps", 8)
    load = _calc_load(pr_ref, pct, unit) if pr_ref > 0 else 0.0
    return [{
        "setNumber": i + 1,
        "targetLoad": load,
        "loadUnit": unit,
        "targetReps": reps,
        "targetRPE": 7.5,
        "isAmrap": False,
        "notes": None
    } for i in range(default_sets)]


def _build_acc_sets(rpe: float = 7.0, default_sets: int = 3,
                   reps: int = 12) -> List[Dict]:
    """Return target sets for an accessory exercise (RPE-based, no load calc)."""
    return [{
        "setNumber": i + 1,
        "targetLoad": 0.0,
        "loadUnit": "lbs",
        "targetReps": reps,
        "targetRPE": rpe,
        "isAmrap": False,
        "notes": "Select load by feel" if i == 0 else None
    } for i in range(default_sets)]


# ─── Generate sessions for one week ──────────────────────────────────────────

def generate_week_sessions(
    week_number: int,
    plan_id: str,
    profile: Dict[str, Any],
    phase_name: str,
    block_number: int = 1,
) -> List[Dict]:
    """
    Generate all training sessions for a given week.
    Returns a list of PlanSession-compatible dicts.
    """
    goal          = profile.get("goal", "strength")
    training_days = min(max(int(profile.get("trainingDays", 4)), 3), 6)
    lifts         = profile.get("currentLifts", {})
    injuries      = profile.get("injuries", [])
    unit          = profile.get("liftUnit", "lbs")
    equipment     = profile.get("equipmentAccess", [])

    session_types = SESSION_TYPES_BY_FREQ.get(training_days, SESSION_TYPES_BY_FREQ[4])
    session_days  = SESSION_DAY_MAP.get(training_days, SESSION_DAY_MAP[4])

    sessions = []
    for i, (stype, day_num) in enumerate(zip(session_types, session_days)):
        sid = _id()
        exercises = _build_exercises_for_session(
            session_type=stype,
            phase_name=phase_name,
            goal=goal,
            lifts=lifts,
            injuries=injuries,
            equipment=equipment,
            unit=unit,
            block_number=block_number,
            week_number=week_number,
        )
        coach_note = (COACH_NOTES.get(phase_name, {})
                      .get(stype, f"Execute {stype} with full intent."))
        warmup = WARMUP_PROTOCOLS.get(stype, "")

        sessions.append({
            "sessionId": sid,
            "planId": plan_id,
            "weekNumber": week_number,
            "dayNumber": day_num,
            "dayLabel": DAY_NAMES.get(day_num, f"Day {day_num}"),
            "sessionType": stype,
            "objective": _session_objective(stype, phase_name),
            "coachNote": coach_note,
            "warmup": warmup,
            "exercises": exercises,
            "status": "planned",
            "startedAt": None,
            "completedAt": None,
            "createdAt": _now().isoformat(),
        })

    return sessions


def _session_objective(session_type: str, phase_name: str) -> str:
    objectives = {
        "ME Lower": "Max effort lower body — build raw strength",
        "ME Upper": "Max effort upper body — pressing strength development",
        "DE Lower": "Dynamic effort lower — speed and rate of force development",
        "DE Upper": "Dynamic effort upper — compensatory acceleration",
        "GPP": "General physical preparedness — carries, conditioning, accessories",
    }
    base = objectives.get(session_type, "Training session")
    if phase_name == "Transition":
        return base + " (deload intensity)"
    return base


def _build_exercises_for_session(
    session_type: str,
    phase_name: str,
    goal: str,
    lifts: Dict[str, float],
    injuries: list,
    equipment: list,
    unit: str,
    block_number: int,
    week_number: int,
) -> List[Dict]:
    """Select and configure exercises for a single session."""
    exercises = []
    order = 0

    # ── Main exercise ──────────────────────────────────────────────────────────
    main_ex_id = _select_main_exercise(
        session_type, phase_name, goal, injuries, week_number
    )
    if main_ex_id:
        is_de = session_type.startswith("DE")
        if is_de:
            target_sets = _build_de_sets(main_ex_id, lifts, phase_name, unit)
        else:
            target_sets = _build_me_sets(main_ex_id, lifts, phase_name, unit)

        ex_data = EXERCISE_DB.get(main_ex_id, {})
        exercises.append({
            "exerciseId": main_ex_id,
            "name": ex_data.get("name", main_ex_id),
            "category": "main",
            "prescription": _get_prescription(main_ex_id, session_type, phase_name),
            "targetSets": target_sets,
            "order": order,
            "notes": "; ".join(ex_data.get("cues", [])[:2]),
        })
        order += 1

    # ── Supplemental exercises ─────────────────────────────────────────────────
    supp_ids = _select_supplemental(
        session_type, phase_name, goal, injuries, limit=2
    )
    for ex_id in supp_ids:
        ex_data = EXERCISE_DB.get(ex_id, {})
        ref_key = ex_data.get("load_ref")
        pr_ref  = lifts.get(ref_key, 0.0) if ref_key else 0.0
        params = LOAD_PARAMS.get(phase_name, LOAD_PARAMS["Foundation"])
        supp_pct  = params.get("supp_pct", 0.55)
        supp_reps = params.get("supp_reps", 8)
        load = _calc_load(pr_ref, supp_pct, unit) if pr_ref > 0 else 0.0
        target_sets = [{
            "setNumber": j + 1,
            "targetLoad": load,
            "loadUnit": unit,
            "targetReps": supp_reps,
            "targetRPE": 7.5,
            "isAmrap": False,
            "notes": None,
        } for j in range(3)]
        exercises.append({
            "exerciseId": ex_id,
            "name": ex_data.get("name", ex_id),
            "category": "supplemental",
            "prescription": f"3×{supp_reps} @ RPE 7-8",
            "targetSets": target_sets,
            "order": order,
            "notes": None,
        })
        order += 1

    # ── Accessories ────────────────────────────────────────────────────────────
    acc_ids = _select_accessories(
        session_type, phase_name, goal, injuries, limit=3
    )
    params = LOAD_PARAMS.get(phase_name, LOAD_PARAMS["Foundation"])
    acc_rpe = params.get("acc_rpe", 7)
    for ex_id in acc_ids:
        ex_data = EXERCISE_DB.get(ex_id, {})
        target_sets = _build_acc_sets(rpe=acc_rpe, default_sets=3, reps=12)
        exercises.append({
            "exerciseId": ex_id,
            "name": ex_data.get("name", ex_id),
            "category": "accessory",
            "prescription": "3×12 @ RPE 7-8, select load by feel",
            "targetSets": target_sets,
            "order": order,
            "notes": None,
        })
        order += 1

    # ── GPP (if GPP session) ───────────────────────────────────────────────────
    if session_type == "GPP":
        gpp_exercises = ["farmer_carry", "sled_push", "sandbag_carry"]
        for ex_id in gpp_exercises[:2]:
            if _is_safe(ex_id, injuries):
                ex_data = EXERCISE_DB.get(ex_id, {})
                ref_key = ex_data.get("load_ref")
                pr_ref  = lifts.get(ref_key, 0.0) if ref_key else 0.0
                target_sets = [{
                    "setNumber": j + 1,
                    "targetLoad": _calc_load(pr_ref, 0.60, unit) if pr_ref > 0 else 0.0,
                    "loadUnit": unit,
                    "targetReps": 1,
                    "targetRPE": 7.0,
                    "isAmrap": False,
                    "notes": "50-60ft distance" if j == 0 else None,
                } for j in range(3)]
                exercises.append({
                    "exerciseId": ex_id,
                    "name": ex_data.get("name", ex_id),
                    "category": "gpp",
                    "prescription": "3 trips × 50-60 ft",
                    "targetSets": target_sets,
                    "order": order,
                    "notes": None,
                })
                order += 1

    return exercises


def _is_safe(ex_id: str, injuries: list) -> bool:
    ex = EXERCISE_DB.get(ex_id, {})
    contra = set(ex.get("contraindications", []))
    if not contra:
        return True
    inj_lower = " ".join(injuries).lower()
    if any(c.replace("_moderate", "").replace("_severe", "") in inj_lower for c in contra):
        return False
    return True


def _select_main_exercise(
    session_type: str,
    phase_name: str,
    goal: str,
    injuries: list,
    week_number: int,
) -> Optional[str]:
    """Select the main exercise for a session using rotation."""
    rotation_key = goal if goal in ME_LOWER_ROTATION else "strength"
    rotation: List[str] = []

    if "Lower" in session_type:
        if session_type.startswith("DE"):
            rotation = ["speed_box_squat", "speed_deadlift"]
        else:
            rotation = ME_LOWER_ROTATION.get(rotation_key,
                        ME_LOWER_ROTATION["strength"])
    elif "Upper" in session_type:
        if session_type.startswith("DE"):
            return "speed_bench"
        else:
            rotation = ME_UPPER_ROTATION.get(rotation_key,
                        ME_UPPER_ROTATION["strength"])
    elif session_type == "GPP":
        return None

    if not rotation:
        return None

    # Use week index to rotate exercises
    idx = (week_number - 1) % len(rotation)
    candidate = rotation[idx]

    # If candidate is unsafe due to injuries, try next
    for offset in range(len(rotation)):
        ex_id = rotation[(idx + offset) % len(rotation)]
        if _is_safe(ex_id, injuries):
            return ex_id

    return None


def _select_supplemental(
    session_type: str,
    phase_name: str,
    goal: str,
    injuries: list,
    limit: int = 2,
) -> List[str]:
    """Select supplemental exercises for a session."""
    SUPP_MAP: Dict[str, List[str]] = {
        "ME Lower":  ["belt_squat", "rdl", "ghr", "hip_thrust", "leg_curl"],
        "ME Upper":  ["pendlay_row", "chest_supported_row", "lat_pulldown", "db_row"],
        "DE Lower":  ["belt_squat", "leg_curl", "hip_thrust", "ghr"],
        "DE Upper":  ["db_row", "lat_pulldown", "chest_supported_row", "incline_db_press"],
        "GPP":       [],
    }
    candidates = SUPP_MAP.get(session_type, [])
    result = [ex for ex in candidates if _is_safe(ex, injuries)]
    return result[:limit]


def _select_accessories(
    session_type: str,
    phase_name: str,
    goal: str,
    injuries: list,
    limit: int = 3,
) -> List[str]:
    """Select accessories for a session."""
    ACC_MAP: Dict[str, List[str]] = {
        "ME Lower":  ["ab_wheel", "reverse_hyper", "dead_bug", "pallof_press"],
        "ME Upper":  ["face_pull", "band_pull_apart", "tricep_pushdown", "db_curl", "hammer_curl"],
        "DE Lower":  ["ab_wheel", "reverse_hyper", "dead_bug", "pallof_press"],
        "DE Upper":  ["face_pull", "band_pull_apart", "tricep_extension", "db_curl"],
        "GPP":       ["face_pull", "band_pull_apart", "dead_bug"],
    }
    candidates = ACC_MAP.get(session_type, [])
    result = [ex for ex in candidates if _is_safe(ex, injuries)]
    return result[:limit]


def _get_prescription(ex_id: str, session_type: str, phase_name: str) -> str:
    if session_type.startswith("DE"):
        params = LOAD_PARAMS.get(phase_name, {}).get("DE", {})
        sets = params.get("sets", 8)
        reps = params.get("reps", 2)
        pct  = int(params.get("pct", 0.55) * 100)
        return f"{sets}×{reps} @ {pct}% 1RM — max speed"
    else:
        params = LOAD_PARAMS.get(phase_name, {}).get("ME", {})
        working_pcts = params.get("working_pcts", [0.75, 0.82, 0.88])
        top_pct = int(working_pcts[-1] * 100) if working_pcts else 88
        return f"Build to top set @ {top_pct}% 1RM (RPE 9)"


# ─── Main plan generation entry point ────────────────────────────────────────

def generate_annual_plan(profile: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate a complete 52-week annual training plan.
    Returns plan dict + first week's sessions.
    """
    goal        = profile.get("goal", "strength")
    experience  = profile.get("experience", "intermediate")
    start_date  = profile.get("programStartDate") or datetime.now().strftime("%Y-%m-%d")

    # Determine training model
    if goal in ("strength", "powerlifting"):
        model = "conjugate"
    elif goal == "strongman":
        model = "conjugate"
    elif goal == "hypertrophy":
        model = "block_hypertrophy"
    else:
        model = "balanced"

    plan_id     = f"plan_{_id()}"
    phase_templates = PHASE_TEMPLATES.get(model, PHASE_TEMPLATES["conjugate"])

    phases = []
    deload_weeks = []
    current_week = 1
    phase_num    = 1
    block_counter = 1

    for pt in phase_templates:
        phase_id   = f"phase_{_id()}"
        total_weeks = pt["weeks"]
        phase_start = current_week
        phase_end   = current_week + total_weeks - 1

        blocks = []
        weeks_remaining = total_weeks
        block_start = current_week

        while weeks_remaining > 0:
            block_len  = min(4, weeks_remaining)
            is_deload  = (block_len == 4)   # deload on week 4 of each block
            block_end  = block_start + block_len - 1

            if is_deload:
                deload_weeks.append(block_end)

            block_id = f"block_{_id()}"
            blocks.append({
                "blockId":         block_id,
                "planId":          plan_id,
                "phaseId":         phase_id,
                "blockName":       f"{pt['name']} Block {block_counter}",
                "blockNumber":     block_counter,
                "blockGoal":       _block_goal(pt["name"], block_counter),
                "startWeek":       block_start,
                "endWeek":         block_end,
                "weekCount":       block_len,
                "isDeload":        is_deload,
                "progressionLogic": _progression_logic(model, pt["name"]),
                "riskAreas":       _risk_areas(profile),
                "keyExercises":    _key_exercises(goal, pt["name"]),
                "status":          "upcoming",
            })

            block_counter  += 1
            block_start    += block_len
            weeks_remaining -= block_len

        phases.append({
            "phaseId":            phase_id,
            "planId":             plan_id,
            "phaseName":          pt["name"],
            "phaseNumber":        phase_num,
            "goal":               pt["goal"],
            "expectedAdaptation": pt["adaptation"],
            "startWeek":          phase_start,
            "endWeek":            phase_end,
            "blocks":             blocks,
            "status":             "current" if phase_num == 1 else "upcoming",
        })

        current_week += total_weeks
        phase_num    += 1

    # Generate first week's sessions
    first_phase_name = phases[0]["phaseName"] if phases else "Foundation"
    week1_sessions = generate_week_sessions(
        week_number=1,
        plan_id=plan_id,
        profile=profile,
        phase_name=first_phase_name,
        block_number=1,
    )

    # Build milestones
    milestones = _build_milestones(phases, goal)

    return {
        "planId":         plan_id,
        "userId":         profile.get("userId", "default"),
        "planName":       f"12-Month {goal.title()} Program",
        "trainingModel":  model,
        "startDate":      start_date,
        "totalWeeks":     52,
        "phases":         phases,
        "deloadWeeks":    deload_weeks,
        "testingWeeks":   [w for w in deload_weeks if w % 12 == 0],
        "milestones":     milestones,
        "status":         "active",
        "generatedAt":    _now().isoformat(),
        "lastModified":   _now().isoformat(),
        "week1Sessions":  week1_sessions,
    }


def _block_goal(phase_name: str, block_num: int) -> str:
    goals = {
        "Foundation":      ["Movement quality + GPP", "Volume accumulation", "Volume peak"],
        "Strength Base":   ["Hypertrophy-Strength bridge", "Pure strength", "Strength peak"],
        "Intensification": ["Intensification 1 — load ramp", "Intensification 2 — heavy", "Intensification peak"],
        "Competition Prep":["Competition prep 1", "Competition prep 2", "Final peak"],
        "Transition":      ["Active recovery"],
        "Accumulation":    ["Volume accumulation 1", "Volume accumulation 2", "Volume peak"],
        "Intensification (hypertrophy)": ["Convert volume to strength", "Strength emphasis", "Strength peak"],
        "Realization":     ["Peak strength", "Testing week"],
        "General Fitness": ["Base fitness", "Build endurance+strength", "Fitness peak"],
        "Strength Emphasis": ["Strength focus 1", "Strength focus 2"],
        "Conditioning Block": ["Conditioning 1", "Conditioning 2"],
        "Peak Fitness":    ["Peak performance", "Peak performance 2"],
        "Maintenance":     ["Maintenance", "Maintenance 2"],
    }
    phase_list = goals.get(phase_name, ["Training block"])
    idx = (block_num - 1) % len(phase_list)
    return phase_list[idx]


def _progression_logic(model: str, phase_name: str) -> str:
    if model == "conjugate":
        return "Rotate ME exercises every 1-2 weeks. Add 5-10 lbs to DE work each block. Supplemental stays within rep range."
    elif model == "block_hypertrophy":
        return "Add 1 set per week on main lifts. Keep RPE at ceiling within rep range. Deload on week 4."
    else:
        return "Progressive overload: add 5-10 lbs when top set RPE drops below target."


def _risk_areas(profile: Dict) -> List[str]:
    return profile.get("injuries", [])[:3]


def _key_exercises(goal: str, phase_name: str) -> List[str]:
    if goal in ("strength", "powerlifting"):
        return ["SSB Box Squat", "Floor Press", "Conventional Deadlift"]
    elif goal == "strongman":
        return ["SSB Box Squat", "Log Clean and Press", "Yoke Carry"]
    elif goal == "hypertrophy":
        return ["Romanian Deadlift", "Incline DB Press", "Lat Pulldown"]
    else:
        return ["Trap Bar Deadlift", "OHP Barbell", "DB Row"]


def _build_milestones(phases: List[Dict], goal: str) -> List[Dict]:
    milestones = []
    for phase in phases:
        if phase["phaseName"] in ("Strength Base", "Intensification", "Competition Prep", "Realization"):
            milestones.append({
                "week": phase["startWeek"],
                "label": f"Start of {phase['phaseName']}",
                "type": "phase_start",
            })
    # Testing weeks at 12, 24, 36, 48, 52
    for w in [12, 24, 36, 48, 52]:
        milestones.append({
            "week": w,
            "label": f"Week {w} — Testing & Assessment",
            "type": "testing",
        })
    return milestones


# ─── Get sessions for a specific week (on-demand generation) ─────────────────

def get_sessions_for_week(
    week_number: int,
    plan: Dict[str, Any],
    profile: Dict[str, Any],
) -> List[Dict]:
    """
    Given a plan and profile, generate sessions for any week number.
    Called when a user navigates to a week that hasn't been generated yet.
    """
    # Find the phase for this week
    phase_name = "Foundation"
    block_number = 1
    for phase in plan.get("phases", []):
        if phase["startWeek"] <= week_number <= phase["endWeek"]:
            phase_name = phase["phaseName"]
            for block in phase.get("blocks", []):
                if block["startWeek"] <= week_number <= block["endWeek"]:
                    block_number = block["blockNumber"]
                    break
            break

    return generate_week_sessions(
        week_number=week_number,
        plan_id=plan.get("planId", "plan_default"),
        profile=profile,
        phase_name=phase_name,
        block_number=block_number,
    )
