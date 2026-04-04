"""
The Program — AI Plan Generator
Generates a structured 12-month training plan from onboarding intake data.
Maps goals to periodization models, builds phases/blocks/sessions with real exercises.
"""

from datetime import datetime, timedelta
from typing import List, Dict, Optional
import uuid
import logging

from models.schemas import (
    AnnualPlan, Phase, Block, Week, Session, SessionExercise,
    TargetSet, WarmupProtocol, Milestone,
    GoalType, SessionType, ExerciseCategory, PhaseStatus, SessionStatus,
    IntakeRequest, CurrentLifts
)

logger = logging.getLogger(__name__)


def _id():
    return str(uuid.uuid4())[:12]


# ─── Exercise Database ────────────────────────────────────────────────────────

EXERCISE_DB = {
    # Main pressing
    "Floor Press": {"pattern": "Push", "muscles": ["Chest", "Triceps"], "equipment": "Barbell", "cues": ["Pin shoulders back", "Pause on floor 1-count", "Drive through triceps"]},
    "Close-Grip Bench": {"pattern": "Push", "muscles": ["Triceps", "Chest"], "equipment": "Barbell", "cues": ["Elbows tucked", "Touch lower sternum"]},
    "2-Board Press": {"pattern": "Push", "muscles": ["Triceps", "Chest"], "equipment": "Barbell", "cues": ["Pause on boards", "Explosive lockout"]},
    "Incline Bench": {"pattern": "Push", "muscles": ["Upper Chest", "Shoulders"], "equipment": "Barbell", "cues": ["30-45° angle", "Drive head into bench"]},
    "Speed Bench": {"pattern": "Push", "muscles": ["Chest", "Triceps"], "equipment": "Barbell", "cues": ["EMOM", "Explosive off chest", "50-60% + bands/chains"]},

    # Main squatting
    "SSB Squat": {"pattern": "Squat", "muscles": ["Quads", "Upper Back"], "equipment": "Safety Squat Bar", "cues": ["Fight to stay upright", "Spread the floor"]},
    "Box Squat": {"pattern": "Squat", "muscles": ["Glutes", "Hamstrings", "Quads"], "equipment": "Barbell", "cues": ["Sit back", "Pause on box", "Explode up"]},
    "Front Squat": {"pattern": "Squat", "muscles": ["Quads", "Core"], "equipment": "Barbell", "cues": ["Elbows high", "Chest up"]},
    "Speed Squat": {"pattern": "Squat", "muscles": ["Quads", "Glutes"], "equipment": "Barbell", "cues": ["EMOM", "55-65% + bands", "Fast out of the hole"]},
    "Belt Squat": {"pattern": "Squat", "muscles": ["Quads", "Glutes"], "equipment": "Belt Squat Machine", "cues": ["Upright torso", "Full depth"]},

    # Main pulling
    "Block Pull": {"pattern": "Hinge", "muscles": ["Back", "Glutes", "Hamstrings"], "equipment": "Barbell", "cues": ["Pull slack out", "Drive hips through"]},
    "Deficit Deadlift": {"pattern": "Hinge", "muscles": ["Back", "Hamstrings", "Glutes"], "equipment": "Barbell", "cues": ["Hips low start", "Chest up off floor"]},
    "Speed Deadlift": {"pattern": "Hinge", "muscles": ["Back", "Glutes"], "equipment": "Barbell", "cues": ["60-70%", "Reset each rep", "Violent hip extension"]},
    "Romanian Deadlift": {"pattern": "Hinge", "muscles": ["Hamstrings", "Glutes"], "equipment": "Barbell", "cues": ["Soft knees", "Hinge at hips", "Bar close to body"]},

    # Supplemental / Accessories
    "Pendlay Row": {"pattern": "Pull", "muscles": ["Lats", "Upper Back"], "equipment": "Barbell", "cues": ["Dead stop each rep", "Chest to bar explosively"]},
    "Weighted Pull-Up": {"pattern": "Pull", "muscles": ["Lats", "Biceps"], "equipment": "Pull-Up Bar", "cues": ["Dead hang start", "Chin over bar"]},
    "Incline DB Press": {"pattern": "Push", "muscles": ["Upper Chest", "Shoulders"], "equipment": "Dumbbells", "cues": ["Control the eccentric", "45° incline"]},
    "DB Lateral Raise": {"pattern": "Isolation", "muscles": ["Side Delts"], "equipment": "Dumbbells", "cues": ["Slight forward lean", "Lead with elbows"]},
    "Tricep Pushdown": {"pattern": "Isolation", "muscles": ["Triceps"], "equipment": "Cable", "cues": ["Lock elbows at sides", "Full extension"]},
    "Hammer Curl": {"pattern": "Isolation", "muscles": ["Biceps", "Brachialis"], "equipment": "Dumbbells", "cues": ["Neutral grip", "Control both phases"]},
    "Face Pull": {"pattern": "Pull", "muscles": ["Rear Delts", "Rotator Cuff"], "equipment": "Cable", "cues": ["External rotate at top", "Squeeze rear delts"]},
    "Band Pull-Apart": {"pattern": "Pull", "muscles": ["Rear Delts"], "equipment": "Band", "cues": ["High reps", "Squeeze at end range"]},
    "GHR": {"pattern": "Hinge", "muscles": ["Hamstrings", "Glutes"], "equipment": "GHR Machine", "cues": ["Slow eccentric", "Squeeze glutes at top"]},
    "Reverse Hyper": {"pattern": "Hinge", "muscles": ["Glutes", "Lower Back"], "equipment": "Reverse Hyper Machine", "cues": ["Controlled swing", "Squeeze at top"]},
    "Bulgarian Split Squat": {"pattern": "Squat", "muscles": ["Quads", "Glutes"], "equipment": "Dumbbells", "cues": ["Front knee over toes", "Upright torso"]},
    "Ab Wheel": {"pattern": "Core", "muscles": ["Abs", "Core"], "equipment": "Ab Wheel", "cues": ["Brace hard", "Don't hyperextend"]},
    "Sled Push": {"pattern": "Carry", "muscles": ["Quads", "Conditioning"], "equipment": "Sled", "cues": ["Low handle", "Drive through legs"]},
    "Farmer Carry": {"pattern": "Carry", "muscles": ["Grip", "Core", "Traps"], "equipment": "Farmer Handles", "cues": ["Shoulders packed", "Short quick steps"]},

    # Strongman events
    "Log Press": {"pattern": "Push", "muscles": ["Shoulders", "Triceps"], "equipment": "Log", "cues": ["Clean to rack", "Dip and drive"]},
    "Axle Deadlift": {"pattern": "Hinge", "muscles": ["Back", "Grip"], "equipment": "Axle", "cues": ["Double overhand or mixed", "Pull slack out"]},
    "Yoke Walk": {"pattern": "Carry", "muscles": ["Core", "Legs", "Upper Back"], "equipment": "Yoke", "cues": ["Pick to hips", "Short fast steps"]},
    "Atlas Stone": {"pattern": "Hinge", "muscles": ["Full Body"], "equipment": "Atlas Stone", "cues": ["Lap first", "Extend hips hard"]},
    "Sandbag Carry": {"pattern": "Carry", "muscles": ["Core", "Grip"], "equipment": "Sandbag", "cues": ["Bear hug tight", "Stay upright"]},
}


# ─── Session Templates ────────────────────────────────────────────────────────


# ─── Injury Contraindication Filter ─────────────────────────────────────────

_INJURY_CONTRAINDICATIONS: Dict[str, List[str]] = {
    "Shoulder (general)":     ["Floor Press", "Speed Bench", "2-Board Press", "Close-Grip Bench", "Incline Bench", "Log Press", "Axle Press"],
    "Rotator Cuff":           ["Floor Press", "Speed Bench", "2-Board Press", "Log Press", "Axle Press", "DB Lateral Raise"],
    "Lower Back / Lumbar":    ["Block Pull", "Deficit Deadlift", "Romanian Deadlift", "Speed Deadlift", "Reverse Hyper"],
    "SI Joint / Pelvis":      ["Block Pull", "Deficit Deadlift", "Romanian Deadlift", "Speed Deadlift", "Bulgarian Split Squat"],
    "Hip / Hip Flexor":       ["Box Squat", "Bulgarian Split Squat", "Front Squat", "Yoke Walk", "Sled Push"],
    "Knee (general)":         ["Box Squat", "SSB Squat", "Bulgarian Split Squat", "Belt Squat", "Front Squat"],
    "Patellar Tendinitis":    ["Box Squat", "Front Squat", "Belt Squat"],
    "Ankle / Foot":           ["Box Squat", "Front Squat", "Sled Push"],
    "Elbow / Tennis Elbow":   ["Close-Grip Bench", "Tricep Pushdown", "Hammer Curl"],
    "Wrist / Forearm":        ["Close-Grip Bench", "SSB Squat"],
}

def _filter_injured(exercises: List[SessionExercise], injuries: List[str]) -> List[SessionExercise]:
    """Remove exercises contraindicated by user's active injuries."""
    blocked: set = set()
    for inj in injuries:
        for key, ex_list in _INJURY_CONTRAINDICATIONS.items():
            if key.lower() in inj.lower() or inj.lower() in key.lower():
                blocked.update(ex_list)
    filtered = []
    for ex in exercises:
        if ex.name in blocked:
            # Find a safe substitute (basic barbell press / squat)
            if ex.category == ExerciseCategory.MAIN:
                ex.notes = (ex.notes or "") + " [Modified — original blocked by injury]"
                ex.name = "Barbell Row" if ex.category == ExerciseCategory.SUPPLEMENTAL else ex.name
            else:
                continue  # Drop non-main blocked accessories
        filtered.append(ex)
    return filtered


def _has_equip(equipment: List[str], key: str) -> bool:
    """Check if equipment key matches any item in user's equipment list."""
    if not equipment:
        return False
    key_lower = key.lower()
    return any(key_lower in e.lower() or e.lower() in key_lower for e in equipment)


# ─── Session Templates ────────────────────────────────────────────────────────

def _build_me_upper(lifts: CurrentLifts, unit: str,
                    goal: str = "strength",
                    injuries: List[str] = None,
                    equipment: List[str] = None) -> List[SessionExercise]:
    injuries = injuries or []
    equipment = equipment or []
    bench_max = lifts.bench or 135

    # ── Goal-specific main exercise ───────────────────────────────────────────
    blocked_upper = set()
    for inj in injuries:
        for key, ex_list in _INJURY_CONTRAINDICATIONS.items():
            if key.lower() in inj.lower() or inj.lower() in key.lower():
                blocked_upper.update(ex_list)

    if goal in ("strongman", "strongman_competition"):
        if _has_equip(equipment, "log") and "Log Press" not in blocked_upper:
            main_name, main_label = "Log Press", "Log clean & press"
        elif _has_equip(equipment, "axle") and "Axle Press" not in blocked_upper:
            main_name, main_label = "Axle Press", "Axle strict/push press"
            if "Axle Press" not in EXERCISE_DB:
                EXERCISE_DB["Axle Press"] = {"pattern": "Push", "muscles": ["Shoulders", "Triceps"], "equipment": "Axle", "cues": ["Clean to rack or from stands", "Full lockout overhead"]}
        elif "Incline Bench" not in blocked_upper:
            main_name, main_label = "Incline Bench", "Incline bench — overhead carry-over"
        else:
            main_name, main_label = "Close-Grip Bench", "Tricep/lockout strength"
    elif goal in ("powerlifting", "powerlifting_competition"):
        candidates = ["2-Board Press", "Close-Grip Bench", "Incline Bench", "Floor Press"]
        main_name = next((c for c in candidates if c not in blocked_upper), "Close-Grip Bench")
        main_label = "Competition bench variation"
    elif goal in ("hypertrophy", "bodybuilding"):
        candidates = ["Incline Bench", "Floor Press", "Incline DB Press", "Close-Grip Bench"]
        main_name = next((c for c in candidates if c not in blocked_upper), "Close-Grip Bench")
        main_label = "Hypertrophy pressing — control the eccentric"
    else:  # strength / general
        candidates = ["Floor Press", "2-Board Press", "Close-Grip Bench", "Incline Bench"]
        main_name = next((c for c in candidates if c not in blocked_upper), "Close-Grip Bench")
        main_label = "Rotate variation weekly"

    # ── Rep/load scheme varies by goal ────────────────────────────────────────
    if goal in ("hypertrophy", "bodybuilding"):
        main_sets = [
            TargetSet(setNumber=1, targetLoad="Light", targetReps="15", setType="warmup"),
            TargetSet(setNumber=2, targetLoad=str(int(bench_max * 0.55)), targetReps="10", setType="warmup"),
            TargetSet(setNumber=3, targetLoad=str(int(bench_max * 0.70)), targetReps="8", setType="work"),
            TargetSet(setNumber=4, targetLoad=str(int(bench_max * 0.75)), targetReps="8", setType="work"),
            TargetSet(setNumber=5, targetLoad=str(int(bench_max * 0.80)), targetReps="6-8", setType="work", targetRPE=8.0),
        ]
        main_prx = "5×8 — moderate load, controlled reps"
    else:
        main_sets = [
            TargetSet(setNumber=1, targetLoad="Bar", targetReps="10", setType="warmup"),
            TargetSet(setNumber=2, targetLoad=str(int(bench_max * 0.5)), targetReps="5", setType="warmup"),
            TargetSet(setNumber=3, targetLoad=str(int(bench_max * 0.7)), targetReps="3", setType="ramp"),
            TargetSet(setNumber=4, targetLoad=str(int(bench_max * 0.85)), targetReps="1", setType="ramp"),
            TargetSet(setNumber=5, targetLoad=str(int(bench_max * 0.95)), targetReps="1", setType="work"),
            TargetSet(setNumber=6, targetLoad=str(int(bench_max * 1.0)) + "+", targetReps="1", setType="work", targetRPE=9.5),
        ]
        main_prx = "Work to 1RM"

    main_cues = EXERCISE_DB.get(main_name, {}).get("cues", [])

    # ── Supplemental ─────────────────────────────────────────────────────────
    if goal in ("strongman", "strongman_competition"):
        supp = [SessionExercise(
            sessionExerciseId=_id(), name="Weighted Pull-Up", category=ExerciseCategory.SUPPLEMENTAL,
            prescription="4×5-8 — lat strength for overhead stability",
            targetSets=[TargetSet(setNumber=i, targetReps="5-8", setType="work") for i in range(1, 5)],
        )]
    elif goal in ("hypertrophy", "bodybuilding"):
        supp = [SessionExercise(
            sessionExerciseId=_id(), name="DB Lateral Raise", category=ExerciseCategory.SUPPLEMENTAL,
            prescription="4×12-15 — superset with front raises",
            targetSets=[TargetSet(setNumber=i, targetReps="12-15", setType="work") for i in range(1, 5)],
        )]
    else:
        supp = [SessionExercise(
            sessionExerciseId=_id(), name="Pendlay Row", category=ExerciseCategory.SUPPLEMENTAL,
            prescription="4×6-8", cues=EXERCISE_DB["Pendlay Row"]["cues"],
            targetSets=[TargetSet(setNumber=i, targetLoad=str(int(bench_max * 0.7)), targetReps="6-8", setType="work") for i in range(1, 5)],
        )]

    exercises = [
        SessionExercise(
            sessionExerciseId=_id(), name=main_name, category=ExerciseCategory.MAIN,
            prescription=main_prx, cues=main_cues,
            targetSets=main_sets, notes=main_label, lastPerformance=f"{bench_max} × 1"
        ),
        *supp,
        SessionExercise(
            sessionExerciseId=_id(), name="Incline DB Press" if goal in ("hypertrophy", "bodybuilding") else "Tricep Pushdown",
            category=ExerciseCategory.ACCESSORY,
            prescription="3×10-12" if goal in ("hypertrophy", "bodybuilding") else "3×15-20",
            targetSets=[TargetSet(setNumber=i, targetReps="10-12" if goal in ("hypertrophy", "bodybuilding") else "15-20", setType="work") for i in range(1, 4)],
        ),
        SessionExercise(
            sessionExerciseId=_id(), name="Hammer Curl", category=ExerciseCategory.ACCESSORY,
            prescription="3×12-15",
            targetSets=[TargetSet(setNumber=i, targetReps="12-15", setType="work") for i in range(1, 4)],
        ),
        SessionExercise(
            sessionExerciseId=_id(), name="Face Pull", category=ExerciseCategory.PREHAB,
            prescription="3×15-20", cues=EXERCISE_DB["Face Pull"]["cues"],
            targetSets=[TargetSet(setNumber=i, targetReps="15-20", setType="work") for i in range(1, 4)],
            notes="Rear delt health — don't skip"
        ),
    ]
    return _filter_injured(exercises, injuries)


def _build_me_lower(lifts: CurrentLifts, unit: str,
                    goal: str = "strength",
                    injuries: List[str] = None,
                    equipment: List[str] = None) -> List[SessionExercise]:
    injuries = injuries or []
    equipment = equipment or []
    squat_max = lifts.squat or 185
    dl_max = lifts.deadlift or 225

    blocked_lower = set()
    for inj in injuries:
        for key, ex_list in _INJURY_CONTRAINDICATIONS.items():
            if key.lower() in inj.lower() or inj.lower() in key.lower():
                blocked_lower.update(ex_list)

    # ── Goal-specific main exercise ───────────────────────────────────────────
    if goal in ("strongman", "strongman_competition"):
        if _has_equip(equipment, "yoke") and "Yoke Walk" not in blocked_lower:
            main_name = "Yoke Walk"
            main_prx = "Work to max 20m carry + heavy singles"
            main_label = "Yoke — pick to hips, short fast steps"
            main_sets = [
                TargetSet(setNumber=1, targetLoad=str(int(squat_max * 0.6)), targetReps="20m", setType="warmup"),
                TargetSet(setNumber=2, targetLoad=str(int(squat_max * 0.8)), targetReps="20m", setType="ramp"),
                TargetSet(setNumber=3, targetLoad=str(int(squat_max * 0.95)), targetReps="20m", setType="work"),
                TargetSet(setNumber=4, targetLoad=str(int(squat_max * 1.0)), targetReps="20m", setType="work", targetRPE=9.0),
            ]
            main_cues = EXERCISE_DB["Yoke Walk"]["cues"]
        else:
            main_name = "Axle Deadlift" if _has_equip(equipment, "axle") else "Block Pull"
            main_prx = "Work to 1RM"
            main_label = "Strongman pull variation"
            main_sets = [
                TargetSet(setNumber=1, targetLoad="Bar", targetReps="5", setType="warmup"),
                TargetSet(setNumber=2, targetLoad=str(int(dl_max * 0.55)), targetReps="3", setType="warmup"),
                TargetSet(setNumber=3, targetLoad=str(int(dl_max * 0.75)), targetReps="2", setType="ramp"),
                TargetSet(setNumber=4, targetLoad=str(int(dl_max * 0.90)), targetReps="1", setType="ramp"),
                TargetSet(setNumber=5, targetLoad=str(int(dl_max * 1.00)), targetReps="1", setType="work", targetRPE=9.5),
            ]
            main_cues = EXERCISE_DB.get(main_name, {}).get("cues", [])
    elif goal in ("powerlifting", "powerlifting_competition"):
        candidates = ["Box Squat", "Pause Squat", "Front Squat", "SSB Squat"]
        if "Pause Squat" not in EXERCISE_DB:
            EXERCISE_DB["Pause Squat"] = {"pattern": "Squat", "muscles": ["Quads", "Glutes"], "equipment": "Barbell", "cues": ["3s pause in hole", "Stay tight", "Drive knees out"]}
        main_name = next((c for c in candidates if c not in blocked_lower), "SSB Squat")
        main_prx = "Work to 1RM — competition squat variation"
        main_label = "Competition squat building block"
        main_sets = [
            TargetSet(setNumber=1, targetLoad="Bar", targetReps="10", setType="warmup"),
            TargetSet(setNumber=2, targetLoad=str(int(squat_max * 0.5)), targetReps="5", setType="warmup"),
            TargetSet(setNumber=3, targetLoad=str(int(squat_max * 0.7)), targetReps="3", setType="ramp"),
            TargetSet(setNumber=4, targetLoad=str(int(squat_max * 0.85)), targetReps="1", setType="ramp"),
            TargetSet(setNumber=5, targetLoad=str(int(squat_max * 1.0)) + "+", targetReps="1", setType="work", targetRPE=9.5),
        ]
        main_cues = EXERCISE_DB.get(main_name, {}).get("cues", [])
    elif goal in ("hypertrophy", "bodybuilding"):
        candidates = ["Romanian Deadlift", "Bulgarian Split Squat", "SSB Squat"]
        main_name = next((c for c in candidates if c not in blocked_lower), "Romanian Deadlift")
        main_prx = "4×10-12 — controlled, feel the hamstrings"
        main_label = "Hypertrophy lower — build the posterior chain"
        main_sets = [
            TargetSet(setNumber=1, targetLoad="Light", targetReps="15", setType="warmup"),
            TargetSet(setNumber=2, targetLoad=str(int(dl_max * 0.45)), targetReps="12", setType="warmup"),
            TargetSet(setNumber=3, targetLoad=str(int(dl_max * 0.55)), targetReps="10-12", setType="work"),
            TargetSet(setNumber=4, targetLoad=str(int(dl_max * 0.60)), targetReps="10-12", setType="work"),
            TargetSet(setNumber=5, targetLoad=str(int(dl_max * 0.65)), targetReps="8-10", setType="work", targetRPE=8.0),
        ]
        main_cues = EXERCISE_DB.get(main_name, {}).get("cues", [])
    else:  # strength / general
        candidates = ["SSB Squat", "Box Squat", "Front Squat"]
        main_name = next((c for c in candidates if c not in blocked_lower), "Box Squat")
        main_prx = "Work to 1RM"
        main_label = "Rotate variation weekly"
        main_sets = [
            TargetSet(setNumber=1, targetLoad="Bar", targetReps="10", setType="warmup"),
            TargetSet(setNumber=2, targetLoad=str(int(squat_max * 0.5)), targetReps="5", setType="warmup"),
            TargetSet(setNumber=3, targetLoad=str(int(squat_max * 0.7)), targetReps="3", setType="ramp"),
            TargetSet(setNumber=4, targetLoad=str(int(squat_max * 0.85)), targetReps="1", setType="ramp"),
            TargetSet(setNumber=5, targetLoad=str(int(squat_max * 1.0)) + "+", targetReps="1", setType="work", targetRPE=9.5),
        ]
        main_cues = EXERCISE_DB.get(main_name, {}).get("cues", [])

    # ── Supplemental ─────────────────────────────────────────────────────────
    if goal in ("strongman", "strongman_competition"):
        supp_name = "Atlas Stone" if (_has_equip(equipment, "stone") and "Atlas Stone" not in blocked_lower) else "Block Pull"
        supp = [SessionExercise(
            sessionExerciseId=_id(), name=supp_name, category=ExerciseCategory.SUPPLEMENTAL,
            prescription="3×3-5 — heavy", cues=EXERCISE_DB.get(supp_name, {}).get("cues", []),
            targetSets=[TargetSet(setNumber=i, targetReps="3-5", setType="work") for i in range(1, 4)],
        )]
    elif goal in ("hypertrophy", "bodybuilding"):
        supp = [SessionExercise(
            sessionExerciseId=_id(), name="Bulgarian Split Squat" if "Bulgarian Split Squat" not in blocked_lower else "GHR",
            category=ExerciseCategory.SUPPLEMENTAL,
            prescription="4×10-12/side", cues=EXERCISE_DB.get("Bulgarian Split Squat", {}).get("cues", []),
            targetSets=[TargetSet(setNumber=i, targetReps="10-12/side", setType="work") for i in range(1, 5)],
        )]
    else:
        supp = [SessionExercise(
            sessionExerciseId=_id(), name="Block Pull" if "Block Pull" not in blocked_lower else "Romanian Deadlift",
            category=ExerciseCategory.SUPPLEMENTAL,
            prescription="3×3-5", cues=EXERCISE_DB.get("Block Pull", {}).get("cues", []),
            targetSets=[TargetSet(setNumber=i, targetReps="3-5", setType="work") for i in range(1, 4)],
        )]

    exercises = [
        SessionExercise(
            sessionExerciseId=_id(), name=main_name, category=ExerciseCategory.MAIN,
            prescription=main_prx, cues=main_cues,
            targetSets=main_sets, notes=main_label,
            lastPerformance=f"{squat_max} × 1" if "Squat" in main_name or "Yoke" in main_name else f"{dl_max} × 1"
        ),
        *supp,
        SessionExercise(
            sessionExerciseId=_id(), name="GHR" if "GHR" not in blocked_lower else "Reverse Hyper",
            category=ExerciseCategory.ACCESSORY,
            prescription="3×12-15", cues=EXERCISE_DB.get("GHR", {}).get("cues", []),
            targetSets=[TargetSet(setNumber=i, targetReps="12-15", setType="work") for i in range(1, 4)],
        ),
        SessionExercise(
            sessionExerciseId=_id(), name="Ab Wheel", category=ExerciseCategory.PREHAB,
            prescription="3×10-15",
            targetSets=[TargetSet(setNumber=i, targetReps="10-15", setType="work") for i in range(1, 4)],
        ),
    ]
    return _filter_injured(exercises, injuries)


def _build_de_upper(lifts: CurrentLifts, unit: str,
                    goal: str = "strength",
                    injuries: List[str] = None,
                    equipment: List[str] = None) -> List[SessionExercise]:
    injuries = injuries or []
    equipment = equipment or []
    bench_max = lifts.bench or 135
    speed_load = int(bench_max * 0.5)

    blocked = set()
    for inj in injuries:
        for key, ex_list in _INJURY_CONTRAINDICATIONS.items():
            if key.lower() in inj.lower() or inj.lower() in key.lower():
                blocked.update(ex_list)

    if goal in ("strongman", "strongman_competition"):
        if _has_equip(equipment, "log") and "Log Press" not in blocked:
            main_name = "Log Press"
            main_prx = f"6×2 @ {speed_load}{unit} — speed + technique focus"
        else:
            main_name = "Speed Bench"
            main_prx = f"9×3 @ {speed_load}{unit}"
        main_cues = EXERCISE_DB.get(main_name, {}).get("cues", [])
        main_sets = [TargetSet(setNumber=i, targetLoad=str(speed_load), targetReps="2" if "Log" in main_name else "3", setType="work") for i in range(1, 7 if "Log" in main_name else 10)]
    elif goal in ("hypertrophy", "bodybuilding"):
        main_name = "Incline Bench" if "Incline Bench" not in blocked else "Floor Press"
        main_prx = f"4×8 @ {int(bench_max * 0.65)}{unit} — moderate load, control"
        main_cues = EXERCISE_DB.get(main_name, {}).get("cues", [])
        main_sets = [TargetSet(setNumber=i, targetLoad=str(int(bench_max * 0.65)), targetReps="8", setType="work") for i in range(1, 5)]
    else:
        main_name = "Speed Bench" if "Speed Bench" not in blocked else "Close-Grip Bench"
        main_prx = f"9×3 @ {speed_load}{unit}"
        main_cues = EXERCISE_DB.get(main_name, {}).get("cues", [])
        main_sets = [TargetSet(setNumber=i, targetLoad=str(speed_load), targetReps="3", setType="work") for i in range(1, 10)]

    exercises = [
        SessionExercise(
            sessionExerciseId=_id(), name=main_name, category=ExerciseCategory.MAIN,
            prescription=main_prx, cues=main_cues,
            targetSets=main_sets,
            notes="EMOM — every rep explosive" if goal not in ("hypertrophy", "bodybuilding") else "Control the negative"
        ),
        SessionExercise(
            sessionExerciseId=_id(), name="Weighted Pull-Up", category=ExerciseCategory.SUPPLEMENTAL,
            prescription="4×6-8",
            targetSets=[TargetSet(setNumber=i, targetReps="6-8", setType="work") for i in range(1, 5)],
        ),
        SessionExercise(
            sessionExerciseId=_id(), name="DB Lateral Raise", category=ExerciseCategory.ACCESSORY,
            prescription="3×15-20",
            targetSets=[TargetSet(setNumber=i, targetReps="15-20", setType="work") for i in range(1, 4)],
        ),
        SessionExercise(
            sessionExerciseId=_id(), name="Hammer Curl", category=ExerciseCategory.ACCESSORY,
            prescription="3×12-15",
            targetSets=[TargetSet(setNumber=i, targetReps="12-15", setType="work") for i in range(1, 4)],
        ),
        SessionExercise(
            sessionExerciseId=_id(), name="Band Pull-Apart", category=ExerciseCategory.PREHAB,
            prescription="100 total",
            targetSets=[TargetSet(setNumber=1, targetReps="100 total", setType="work")],
        ),
    ]
    return _filter_injured(exercises, injuries)


def _build_de_lower(lifts: CurrentLifts, unit: str,
                    goal: str = "strength",
                    injuries: List[str] = None,
                    equipment: List[str] = None) -> List[SessionExercise]:
    injuries = injuries or []
    equipment = equipment or []
    squat_max = lifts.squat or 185
    dl_max = lifts.deadlift or 225
    speed_squat = int(squat_max * 0.55)
    speed_dl = int(dl_max * 0.65)

    blocked = set()
    for inj in injuries:
        for key, ex_list in _INJURY_CONTRAINDICATIONS.items():
            if key.lower() in inj.lower() or inj.lower() in key.lower():
                blocked.update(ex_list)

    if goal in ("strongman", "strongman_competition"):
        # Events day — strongman specific
        if _has_equip(equipment, "farmers") and "Farmer Carry" not in blocked:
            main_name = "Farmer Carry"
            main_prx = f"6×30m @ {int(squat_max * 0.5)}{unit}/hand — fast turns"
            main_sets = [TargetSet(setNumber=i, targetLoad=str(int(squat_max * 0.5)), targetReps="30m", setType="work") for i in range(1, 7)]
        elif _has_equip(equipment, "yoke") and "Yoke Walk" not in blocked:
            main_name = "Yoke Walk"
            main_prx = f"6×20m @ {int(squat_max * 0.7)}{unit} — speed runs"
            main_sets = [TargetSet(setNumber=i, targetLoad=str(int(squat_max * 0.7)), targetReps="20m", setType="work") for i in range(1, 7)]
        else:
            main_name = "Sandbag Carry" if _has_equip(equipment, "sandbag") else "Sled Push"
            main_prx = f"6×30m — strongman conditioning"
            main_sets = [TargetSet(setNumber=i, targetReps="30m", setType="work") for i in range(1, 7)]

        exercises = [
            SessionExercise(
                sessionExerciseId=_id(), name=main_name, category=ExerciseCategory.MAIN,
                prescription=main_prx, cues=EXERCISE_DB.get(main_name, {}).get("cues", []),
                targetSets=main_sets, notes="Events day — build speed and efficiency"
            ),
            SessionExercise(
                sessionExerciseId=_id(), name="Speed Deadlift" if "Speed Deadlift" not in blocked else "Romanian Deadlift",
                category=ExerciseCategory.SUPPLEMENTAL,
                prescription=f"6×1 @ {speed_dl}{unit} — reset each rep",
                targetSets=[TargetSet(setNumber=i, targetLoad=str(speed_dl), targetReps="1", setType="work") for i in range(1, 7)],
            ),
            SessionExercise(
                sessionExerciseId=_id(), name="Reverse Hyper", category=ExerciseCategory.ACCESSORY,
                prescription="3×15-20",
                targetSets=[TargetSet(setNumber=i, targetReps="15-20", setType="work") for i in range(1, 4)],
            ),
        ]
    elif goal in ("hypertrophy", "bodybuilding"):
        hip_thrust_name = "Hip Thrust"
        if "Hip Thrust" not in EXERCISE_DB:
            EXERCISE_DB["Hip Thrust"] = {"pattern": "Hinge", "muscles": ["Glutes", "Hamstrings"], "equipment": "Barbell", "cues": ["Drive through heels", "Full hip extension at top"]}
        exercises = [
            SessionExercise(
                sessionExerciseId=_id(), name="Romanian Deadlift" if "Romanian Deadlift" not in blocked else "GHR",
                category=ExerciseCategory.MAIN,
                prescription=f"4×10-12 @ {int(dl_max * 0.55)}{unit} — slow eccentric",
                cues=EXERCISE_DB.get("Romanian Deadlift", {}).get("cues", []),
                targetSets=[TargetSet(setNumber=i, targetLoad=str(int(dl_max * 0.55)), targetReps="10-12", setType="work") for i in range(1, 5)],
                notes="Feel the hamstrings stretch at the bottom"
            ),
            SessionExercise(
                sessionExerciseId=_id(), name=hip_thrust_name, category=ExerciseCategory.SUPPLEMENTAL,
                prescription="4×12-15 — glute squeeze at top",
                cues=EXERCISE_DB["Hip Thrust"]["cues"],
                targetSets=[TargetSet(setNumber=i, targetReps="12-15", setType="work") for i in range(1, 5)],
            ),
            SessionExercise(
                sessionExerciseId=_id(), name="Leg Press" if "Leg Press" not in blocked else "Goblet Squat",
                category=ExerciseCategory.ACCESSORY,
                prescription="3×15-20",
                targetSets=[TargetSet(setNumber=i, targetReps="15-20", setType="work") for i in range(1, 4)],
            ),
        ]
        if "Leg Press" not in EXERCISE_DB:
            EXERCISE_DB["Leg Press"] = {"pattern": "Squat", "muscles": ["Quads", "Glutes"], "equipment": "Machine", "cues": ["Full depth", "Drive through heels"]}
        if "Goblet Squat" not in EXERCISE_DB:
            EXERCISE_DB["Goblet Squat"] = {"pattern": "Squat", "muscles": ["Quads", "Core"], "equipment": "Dumbbells", "cues": ["Elbows inside knees", "Chest up"]}
    else:
        exercises = [
            SessionExercise(
                sessionExerciseId=_id(), name="Speed Squat" if "Speed Squat" not in blocked else "Box Squat",
                category=ExerciseCategory.MAIN,
                prescription=f"10×2 @ {speed_squat}{unit}+bands", cues=EXERCISE_DB.get("Speed Squat", {}).get("cues", []),
                targetSets=[TargetSet(setNumber=i, targetLoad=str(speed_squat), targetReps="2", setType="work") for i in range(1, 11)],
                notes="EMOM — fast out of the hole"
            ),
            SessionExercise(
                sessionExerciseId=_id(), name="Speed Deadlift" if "Speed Deadlift" not in blocked else "Romanian Deadlift",
                category=ExerciseCategory.SUPPLEMENTAL,
                prescription=f"8×1 @ {speed_dl}{unit}",
                targetSets=[TargetSet(setNumber=i, targetLoad=str(speed_dl), targetReps="1", setType="work") for i in range(1, 9)],
            ),
            SessionExercise(
                sessionExerciseId=_id(), name="Reverse Hyper", category=ExerciseCategory.ACCESSORY,
                prescription="3×15-20",
                targetSets=[TargetSet(setNumber=i, targetReps="15-20", setType="work") for i in range(1, 4)],
            ),
            SessionExercise(
                sessionExerciseId=_id(), name="Sled Push" if "Sled Push" not in blocked else "Farmer Carry",
                category=ExerciseCategory.ACCESSORY,
                prescription="4×40yd",
                targetSets=[TargetSet(setNumber=i, targetReps="40yd", setType="work") for i in range(1, 5)],
            ),
        ]
    return _filter_injured(exercises, injuries)


def _build_gpp() -> List[SessionExercise]:
    return [
        SessionExercise(sessionExerciseId=_id(), name="Sled Push", category=ExerciseCategory.ACCESSORY, prescription="6×40yd",
            targetSets=[TargetSet(setNumber=i, targetReps="40yd", setType="work") for i in range(1, 7)]),
        SessionExercise(sessionExerciseId=_id(), name="Band Pull-Apart", category=ExerciseCategory.PREHAB, prescription="100 total",
            targetSets=[TargetSet(setNumber=1, targetReps="100 total", setType="work")]),
        SessionExercise(sessionExerciseId=_id(), name="Ab Wheel", category=ExerciseCategory.PREHAB, prescription="3×10-15",
            targetSets=[TargetSet(setNumber=i, targetReps="10-15", setType="work") for i in range(1, 4)]),
    ]




# ─── Warmup Templates ────────────────────────────────────────────────────────

WARMUPS = {
    "upper": WarmupProtocol(label="Upper Body Warm-Up", duration="8-10 min", steps=[
        "Band pull-aparts × 25", "Shoulder dislocates × 15", "Light DB press × 12", "Face pull × 15", "Empty bar press × 10"
    ]),
    "lower": WarmupProtocol(label="Lower Body Warm-Up", duration="10 min", steps=[
        "Hip circles × 10/side", "Goblet squat × 10", "Band walks × 15/side", "Hip flexor stretch × 30s/side", "Empty bar squat × 10"
    ]),
    "gpp": WarmupProtocol(label="General Warm-Up", duration="5 min", steps=[
        "Light jog 2 min", "Dynamic stretching", "Band pull-aparts × 20"
    ]),
}


# ─── Session Builder ──────────────────────────────────────────────────────────

def _build_session(session_type: SessionType, lifts: CurrentLifts, unit: str, week: int, day: int, block_id: str,
                   goal: str = "strength", injuries: List[str] = None, equipment: List[str] = None) -> Session:
    injuries = injuries or []
    equipment = equipment or []
    type_map = {
        SessionType.ME_UPPER: ("Max effort pressing day. Work to a heavy single, then build volume.", _build_me_upper, "upper"),
        SessionType.ME_LOWER: ("Max effort squat/pull day. Work to a heavy single, then accessories.", _build_me_lower, "lower"),
        SessionType.DE_UPPER: ("Dynamic effort pressing. Speed work with accommodating resistance.", _build_de_upper, "upper"),
        SessionType.DE_LOWER: ("Dynamic effort squat/pull. Speed and power development.", _build_de_lower, "lower"),
        SessionType.GPP: ("General physical preparedness. Low-intensity recovery work.", _build_gpp, "gpp"),
    }

    objective, builder, warmup_key = type_map.get(session_type, type_map[SessionType.ME_UPPER])

    if session_type == SessionType.GPP:
        exercises = builder()
    else:
        exercises = builder(lifts, unit, goal=goal, injuries=injuries, equipment=equipment)

    return Session(
        sessionId=_id(),
        blockId=block_id,
        weekNumber=week,
        dayNumber=day,
        sessionType=session_type,
        objective=objective,
        coachNote=_generate_coach_note(session_type, week),
        exercises=exercises,
        warmup=WARMUPS.get(warmup_key, WARMUPS["upper"]),
        status=SessionStatus.PLANNED,
    )


def _generate_coach_note(session_type: SessionType, week: int) -> str:
    notes = {
        SessionType.ME_UPPER: f"Week {week} — push for a new variation PR if movement quality is clean. If the bar slows, call it. Don't grind.",
        SessionType.ME_LOWER: f"Week {week} — build to a heavy single. Focus on speed out of the hole. Back off if form breaks.",
        SessionType.DE_UPPER: f"Week {week} — speed is the priority. Every rep should be explosive. If speed drops, lower the weight.",
        SessionType.DE_LOWER: f"Week {week} — fast and violent. Reset each rep on speed pulls. Compensatory acceleration on squats.",
        SessionType.GPP: f"Week {week} — recovery session. Keep intensity low. Focus on blood flow and movement quality.",
    }
    return notes.get(session_type, f"Week {week} — train hard, recover harder.")


# ─── Split Templates ──────────────────────────────────────────────────────────

# Maps frequency → list of (SessionType, calendar_day_number)
# Calendar day numbers: Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6, Sun=7
# Matches The Program's scheduling so get_today_session endpoint finds correct session
DAY_MAPS = {
    3: [
        (SessionType.ME_LOWER, 1),   # Monday
        (SessionType.ME_UPPER, 2),   # Tuesday
        (SessionType.DE_UPPER, 5),   # Friday
    ],
    4: [
        (SessionType.ME_LOWER, 1),   # Monday
        (SessionType.ME_UPPER, 2),   # Tuesday
        (SessionType.DE_LOWER, 4),   # Thursday
        (SessionType.DE_UPPER, 5),   # Friday
    ],
    5: [
        (SessionType.ME_LOWER, 1),   # Monday
        (SessionType.ME_UPPER, 2),   # Tuesday
        (SessionType.GPP, 3),        # Wednesday (recovery)
        (SessionType.DE_LOWER, 4),   # Thursday
        (SessionType.DE_UPPER, 5),   # Friday
    ],
    6: [
        (SessionType.ME_LOWER, 1),   # Monday
        (SessionType.ME_UPPER, 2),   # Tuesday
        (SessionType.GPP, 3),        # Wednesday
        (SessionType.DE_LOWER, 4),   # Thursday
        (SessionType.DE_UPPER, 5),   # Friday
        (SessionType.GPP, 6),        # Saturday
    ],
}

# Keep SPLIT_TEMPLATES for backwards compatibility
SPLIT_TEMPLATES = {
    3: [SessionType.ME_LOWER, SessionType.ME_UPPER, SessionType.DE_UPPER],
    4: [SessionType.ME_LOWER, SessionType.ME_UPPER, SessionType.DE_LOWER, SessionType.DE_UPPER],
    5: [SessionType.ME_LOWER, SessionType.ME_UPPER, SessionType.GPP, SessionType.DE_LOWER, SessionType.DE_UPPER],
    6: [SessionType.ME_LOWER, SessionType.ME_UPPER, SessionType.GPP, SessionType.DE_LOWER, SessionType.DE_UPPER, SessionType.GPP],
}


# ─── Phase Templates ──────────────────────────────────────────────────────────

PHASE_TEMPLATES = {
    GoalType.STRENGTH: [
        {"name": "Intro Phase", "goal": "Build work capacity and movement quality", "adaptation": "Motor pattern refinement, connective tissue prep", "weeks": 4},
        {"name": "Base Strength", "goal": "Establish baseline loading on all primary movements", "adaptation": "Strength endurance, volume tolerance", "weeks": 8},
        {"name": "Accumulation", "goal": "Progressive overload with increasing intensity", "adaptation": "Muscle hypertrophy, strength gains", "weeks": 8},
        {"name": "Intensification", "goal": "Push intensity while managing fatigue", "adaptation": "Peak strength expression, neural drive", "weeks": 8},
        {"name": "Peaking", "goal": "Maximize strength expression on primary lifts", "adaptation": "1RM performance, competition prep", "weeks": 6},
        {"name": "Competition Prep", "goal": "Fine-tune openers and peak for competition", "adaptation": "Peak performance, confidence building", "weeks": 4},
        {"name": "Off-Season", "goal": "Recovery, address weaknesses, build base for next cycle", "adaptation": "Recovery, hypertrophy, GPP", "weeks": 14},
    ],
    GoalType.STRONGMAN: [
        {"name": "Intro Phase", "goal": "Build work capacity with event exposure", "adaptation": "Movement skill, conditioning base", "weeks": 4},
        {"name": "Base Strength", "goal": "Build absolute strength foundation", "adaptation": "Strength endurance, event technique", "weeks": 8},
        {"name": "Event Specialization", "goal": "Focus on competition events", "adaptation": "Event-specific strength and skill", "weeks": 8},
        {"name": "Intensification", "goal": "Push event weights toward competition loads", "adaptation": "Peak strength, event confidence", "weeks": 8},
        {"name": "Peaking", "goal": "Practice competition events at target weights", "adaptation": "Competition readiness", "weeks": 6},
        {"name": "Competition Prep", "goal": "Taper and peak for competition day", "adaptation": "Peak performance", "weeks": 4},
        {"name": "Off-Season", "goal": "Recovery, address weaknesses", "adaptation": "GPP, hypertrophy, rehab", "weeks": 14},
    ],
}

# Default to strength template for other goals
for goal in [GoalType.POWERLIFTING, GoalType.HYPERTROPHY, GoalType.ATHLETIC, GoalType.GENERAL]:
    PHASE_TEMPLATES[goal] = PHASE_TEMPLATES[GoalType.STRENGTH]


# ─── Main Generator ──────────────────────────────────────────────────────────

def generate_plan(intake: IntakeRequest) -> AnnualPlan:
    """Generate a complete 12-month training plan from intake data."""

    # Case-insensitive GoalType lookup: "strongman" matches "Strongman"
    _goal_str = (intake.goal or "").strip()
    goal = next(
        (g for g in GoalType if g.value.lower() == _goal_str.lower()),
        GoalType.STRENGTH,
    )
    plan_id = _id()
    start_date = datetime.now()
    frequency = intake.frequency or 4
    split = SPLIT_TEMPLATES.get(frequency, SPLIT_TEMPLATES[4])
    phase_templates = PHASE_TEMPLATES.get(goal, PHASE_TEMPLATES[GoalType.STRENGTH])

    # Build goal-specific plan name
    plan_names = {
        GoalType.STRENGTH: "The Program — Strength",
        GoalType.STRONGMAN: "The Program — Strongman",
        GoalType.POWERLIFTING: "The Program — Powerlifting",
        GoalType.HYPERTROPHY: "The Program — Hypertrophy",
        GoalType.ATHLETIC: "The Program — Athletic Performance",
        GoalType.GENERAL: "The Program — General Strength",
    }
    print(f"[PLANGEN] intake.goal='{intake.goal}' -> GoalType={goal.value} -> planName={plan_names.get(goal)}")

    phases = []
    running_week = 1
    deload_weeks = []
    testing_weeks = []

    # Get the correct day map with real calendar day numbers
    day_map = DAY_MAPS.get(frequency, DAY_MAPS[4])

    for i, tmpl in enumerate(phase_templates):
        phase_id = _id()
        phase_start = running_week
        phase_end = running_week + tmpl["weeks"] - 1
        blocks = []

        # Split phase into 3-4 week blocks
        weeks_remaining = tmpl["weeks"]
        block_num = 1
        block_start_week = running_week

        while weeks_remaining > 0:
            block_weeks = min(4, weeks_remaining)
            block_id = _id()
            is_deload_block = block_num > 0 and block_num % 4 == 0

            # Build weeks for this block
            week_objects = []
            for w in range(block_weeks):
                current_week = block_start_week + w
                is_deload = is_deload_block and w == block_weeks - 1

                if is_deload:
                    deload_weeks.append(current_week)

                # Build sessions using real calendar day numbers (Mon=1...Fri=5)
                sessions = []
                for stype, cal_day in day_map:
                    session = _build_session(
                        stype, intake.lifts, intake.liftUnit, current_week, cal_day, block_id,
                        goal=intake.goal,
                        injuries=intake.injuries,
                        equipment=(intake.specialtyEquipment or []) + (intake.gym or []),
                    )
                    sessions.append(session)

                week_obj = Week(
                    weekId=_id(),
                    blockId=block_id,
                    weekNumber=current_week,
                    sessions=sessions,
                    isDeload=is_deload,
                    status=PhaseStatus.CURRENT if current_week == 1 else PhaseStatus.UPCOMING,
                )
                week_objects.append(week_obj)

            block = Block(
                blockId=block_id,
                phaseId=phase_id,
                blockName=f"{tmpl['name']} — Block {block_num}",
                blockNumber=block_num,
                blockGoal=tmpl["goal"],
                weekCount=block_weeks,
                startDate=(start_date + timedelta(weeks=block_start_week - 1)).strftime("%Y-%m-%d"),
                endDate=(start_date + timedelta(weeks=block_start_week + block_weeks - 2)).strftime("%Y-%m-%d"),
                progressionLogic="ME variations rotate weekly. DE loads increase 5%/week. Accessories hold volume steady.",
                riskAreas=_get_risk_areas(intake.injuries),
                keyExercises=[ex.name for s in (week_objects[0].sessions if week_objects else []) for ex in s.exercises if ex.category == ExerciseCategory.MAIN][:4],
                weeks=week_objects,
                status=PhaseStatus.CURRENT if i == 0 and block_num == 1 else PhaseStatus.UPCOMING,
            )
            blocks.append(block)

            block_start_week += block_weeks
            weeks_remaining -= block_weeks
            block_num += 1

        phase = Phase(
            phaseId=phase_id,
            planId=plan_id,
            phaseName=tmpl["name"],
            phaseNumber=i + 1,
            goal=tmpl["goal"],
            expectedAdaptation=tmpl["adaptation"],
            startWeek=phase_start,
            endWeek=phase_end,
            blocks=blocks,
            status=PhaseStatus.CURRENT if i == 0 else PhaseStatus.UPCOMING,
        )
        phases.append(phase)
        running_week = phase_end + 1

    # Add testing weeks
    testing_weeks = [4, 16, 28, 38]

    # Build milestones
    milestones = _build_milestones(intake, start_date)

    plan = AnnualPlan(
        planId=plan_id,
        userId=intake.goal,  # Will be replaced with actual userId
        planName=plan_names.get(goal, "Strength Program"),
        startDate=start_date.strftime("%Y-%m-%d"),
        totalWeeks=52,
        phases=phases,
        milestones=milestones,
        deloadWeeks=deload_weeks,
        testingWeeks=testing_weeks,
        status="active",
    )

    return plan


def _get_risk_areas(injuries: List[str]) -> List[str]:
    risk_map = {
        "Shoulder": "Shoulder mobility on overhead pressing",
        "Lower Back / Lumbar": "Lower back fatigue from deadlift volume",
        "Knee": "Knee tracking on squat variations",
        "Hip / Hip Flexor": "Hip mobility and squat depth",
        "Elbow": "Elbow stress on pressing movements",
    }
    risks = [risk_map.get(inj, f"{inj} management") for inj in injuries if inj != "None"]
    if not risks:
        risks = ["Sleep and recovery consistency", "Progressive overload pacing"]
    return risks[:3]


def _build_milestones(intake: IntakeRequest, start_date: datetime) -> List[Milestone]:
    milestones = []
    lifts = intake.lifts

    if lifts.squat:
        milestones.append(Milestone(
            name=f"Squat {int(lifts.squat * 1.1)} {intake.liftUnit}",
            targetDate=(start_date + timedelta(weeks=16)).strftime("%Y-%m-%d"),
            targetValue=str(int(lifts.squat * 1.1)),
        ))
    if lifts.bench:
        milestones.append(Milestone(
            name=f"Bench {int(lifts.bench * 1.1)} {intake.liftUnit}",
            targetDate=(start_date + timedelta(weeks=20)).strftime("%Y-%m-%d"),
            targetValue=str(int(lifts.bench * 1.1)),
        ))
    if lifts.deadlift:
        milestones.append(Milestone(
            name=f"Deadlift {int(lifts.deadlift * 1.1)} {intake.liftUnit}",
            targetDate=(start_date + timedelta(weeks=16)).strftime("%Y-%m-%d"),
            targetValue=str(int(lifts.deadlift * 1.1)),
        ))

    milestones.append(Milestone(
        name="Complete Block 1",
        targetDate=(start_date + timedelta(weeks=4)).strftime("%Y-%m-%d"),
    ))

    return milestones


# ─── Exercise Alternatives ────────────────────────────────────────────────────

ALTERNATIVES = {
    "Floor Press": [
        {"name": "Close-Grip Bench", "reason": "pain", "explanation": "Reduces shoulder stress while maintaining tricep emphasis"},
        {"name": "2-Board Press", "reason": "pain", "explanation": "Shortened ROM reduces shoulder strain at bottom"},
        {"name": "Incline DB Press", "reason": "equipment", "explanation": "Similar pressing pattern with dumbbells"},
    ],
    "SSB Squat": [
        {"name": "Front Squat", "reason": "equipment", "explanation": "Maintains upright torso emphasis without SSB"},
        {"name": "Box Squat", "reason": "pain", "explanation": "Controlled depth reduces knee/hip stress"},
        {"name": "Belt Squat", "reason": "pain", "explanation": "Removes spinal loading entirely"},
    ],
    "Block Pull": [
        {"name": "Romanian Deadlift", "reason": "pain", "explanation": "Reduces lower back demand while training hip hinge"},
        {"name": "Deficit Deadlift", "reason": "preference", "explanation": "Increases ROM for more posterior chain work"},
    ],
    "Speed Bench": [
        {"name": "Close-Grip Bench", "reason": "equipment", "explanation": "Can be done without bands/chains"},
        {"name": "Incline DB Press", "reason": "pain", "explanation": "Less shoulder stress with neutral grip option"},
    ],
    "Speed Squat": [
        {"name": "Box Squat", "reason": "pain", "explanation": "Controlled depth, less knee stress"},
        {"name": "Belt Squat", "reason": "pain", "explanation": "No spinal loading"},
    ],
}


def get_alternatives(exercise_name: str, reason: str) -> List[Dict]:
    """Get exercise alternatives for a given exercise and reason."""
    alts = ALTERNATIVES.get(exercise_name, [])
    # Filter by reason, or return all if no exact match
    matched = [a for a in alts if a["reason"] == reason]
    if not matched:
        matched = alts[:3]
    return matched
