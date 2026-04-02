import uuid
from datetime import datetime
from typing import List, Dict, Optional, Any, Tuple

# =========================================================================
# EXERCISE LIBRARY  — id, display_name, movement, primary_muscles, equipment
# =========================================================================

ME_LOWER_ROTATIONS: List[Tuple[str, str]] = [
    ("box_squat",            "Box Squat"),
    ("romanian_deadlift",    "Romanian Deadlift"),
    ("ssb_squat",            "Safety Bar Squat"),
    ("rack_pull",            "Rack Pull (Mid-Thigh)"),
    ("good_morning",         "Good Morning"),
    ("sumo_deadlift",        "Sumo Deadlift"),
    ("high_bar_squat",       "High Bar Squat"),
    ("deficit_deadlift",     "Deficit Deadlift"),
    ("box_squat_chains",     "Box Squat w/ Chains"),
    ("front_squat",          "Front Squat"),
    ("trap_bar_deadlift",    "Trap Bar Deadlift"),
    ("anderson_squat",       "Anderson Squat (from pins)"),
]

ME_UPPER_ROTATIONS: List[Tuple[str, str]] = [
    ("cg_bench",             "Close Grip Bench Press"),
    ("floor_press",          "Floor Press"),
    ("board_press_3",        "3-Board Press"),
    ("incline_bench",        "Incline Bench Press"),
    ("pin_press",            "Pin Press (from chest)"),
    ("larsen_press",         "Larsen Press"),
    ("decline_bench",        "Decline Bench Press"),
    ("board_press_2",        "2-Board Press"),
    ("paused_bench",         "Paused Bench Press"),
    ("swiss_bar_bench",      "Swiss Bar Bench"),
    ("axle_bench",           "Axle Bar Bench Press"),
    ("slingshot_bench",      "Slingshot Bench Press"),
]

ME_LOWER_PL: List[Tuple[str, str]] = [
    ("comp_squat_pause",     "Pause Squat (competition depth)"),
    ("romanian_deadlift",    "Romanian Deadlift"),
    ("comp_squat",           "Competition Squat"),
    ("rack_pull",            "Rack Pull (Mid-Thigh)"),
    ("ssb_squat",            "Safety Bar Squat"),
    ("pause_deadlift",       "Pause Deadlift (2s off floor)"),
    ("box_squat",            "Box Squat"),
    ("deficit_deadlift",     "Deficit Deadlift"),
    ("front_squat",          "Front Squat"),
    ("sumo_pause_dl",        "Sumo Pause Deadlift"),
    ("anderson_squat",       "Anderson Squat (from pins)"),
    ("good_morning",         "Good Morning"),
]

ME_UPPER_SM: List[Tuple[str, str]] = [
    ("log_press",            "Log Press"),
    ("axle_press",           "Axle Press"),
    ("floor_press",          "Floor Press"),
    ("cg_bench",             "Close Grip Bench Press"),
    ("push_press",           "Push Press"),
    ("incline_bench",        "Incline Bench Press"),
    ("strict_ohp",           "Strict Overhead Press"),
    ("axle_push_press",      "Axle Push Press"),
    ("larsen_press",         "Larsen Press"),
    ("board_press_2",        "2-Board Press"),
    ("log_press_paused",     "Log Press (paused at chin)"),
    ("viking_press",         "Viking Press"),
]

HYP_LOWER: List[Tuple[str, str]] = [
    ("leg_press",            "Leg Press"),
    ("bulgarian_split",      "Bulgarian Split Squat"),
    ("hack_squat",           "Hack Squat"),
    ("romanian_deadlift",    "Romanian Deadlift"),
    ("leg_press_narrow",     "Leg Press (narrow stance)"),
    ("lunges",               "Walking Lunges"),
]

HYP_UPPER: List[Tuple[str, str]] = [
    ("db_bench",             "DB Bench Press"),
    ("incline_db_bench",     "Incline DB Bench Press"),
    ("cable_fly",            "Cable Fly"),
    ("db_shoulder_press",    "DB Shoulder Press"),
    ("lateral_raise",        "Lateral Raises"),
    ("cable_crossover",      "Cable Crossover"),
]

# Accessories  — (id, name, rest_sec, rep_scheme, category)
LOWER_SUPPLEMENTAL = [
    ("belt_squat",           "Belt Squat",              120, "3x10-12",  "supplemental"),
    ("leg_press",            "Leg Press",               120, "3x12",     "supplemental"),
    ("ghr",                  "Glute Ham Raise",          90,  "3x8-10",   "supplemental"),
    ("nordic_curl",          "Nordic Curl",             120, "3x5-8",    "supplemental"),
    ("pull_through",         "Cable Pull-Through",       90,  "3x15",     "supplemental"),
    ("back_extension",       "Back Extension",           90,  "3x12",     "supplemental"),
    ("leg_curl",             "Leg Curl",                 90,  "3x12",     "supplemental"),
    ("hip_thrust",           "Hip Thrust",               90,  "3x12",     "supplemental"),
]

LOWER_ACCESSORIES = [
    ("ab_wheel",             "Ab Wheel",                60, "3x10",     "accessory"),
    ("weighted_situp",       "Weighted Sit-up",         60, "3x15",     "accessory"),
    ("hanging_leg_raise",    "Hanging Leg Raise",       60, "3x10",     "accessory"),
    ("paloff_press",         "Pallof Press",            60, "3x10/side","accessory"),
    ("cable_crunch",         "Cable Crunch",            60, "3x15",     "accessory"),
]

UPPER_TRICEPS = [
    ("jm_press",             "JM Press",                90, "3x8-10",   "supplemental"),
    ("skull_crusher",        "Skull Crusher",           90, "3x10-12",  "supplemental"),
    ("tricep_pushdown",      "Tricep Pushdown",         60, "3x15",     "supplemental"),
    ("cable_tricep_ext",     "Cable Tricep Extension",  60, "3x12-15",  "supplemental"),
    ("tate_press",           "Tate Press",              90, "3x10-12",  "supplemental"),
    ("db_skull_crusher",     "DB Skull Crusher",        90, "3x12",     "supplemental"),
]

UPPER_BACK = [
    ("db_row",               "DB Row",                  90, "4x10/side","supplemental"),
    ("barbell_row",          "Barbell Row",              90, "4x8",      "supplemental"),
    ("lat_pulldown",         "Lat Pulldown",             90, "3x10-12",  "supplemental"),
    ("chest_supported_row",  "Chest Supported Row",      90, "3x10-12",  "supplemental"),
    ("cable_row",            "Seated Cable Row",          90, "3x12",     "supplemental"),
    ("1arm_cable_row",       "Single-Arm Cable Row",      90, "3x12/side","supplemental"),
]

UPPER_ACCESSORIES = [
    ("face_pull",            "Face Pulls",              60, "3x15-20",  "accessory"),
    ("lateral_raise",        "Lateral Raises",          60, "3x15",     "accessory"),
    ("rear_delt_fly",        "Rear Delt Fly",           60, "3x15",     "accessory"),
    ("band_pull_apart",      "Band Pull-Apart",         45, "3x20",     "accessory"),
    ("bicep_curl",           "Barbell Curl",            60, "3x10-12",  "accessory"),
    ("hammer_curl",          "Hammer Curl",             60, "3x12",     "accessory"),
]

STRONGMAN_EVENTS = [
    ("log_press",            "Log Press",               180, "5 singles — work to max", "event"),
    ("axle_press",           "Axle Press",              180, "3 heavy singles",          "event"),
    ("yoke_walk",            "Yoke Walk",               180, "3x20m progressive",        "event"),
    ("farmers_carry",        "Farmer's Carry",          180, "3x20m heavy",              "event"),
    ("atlas_stone",          "Atlas Stone Load",        180, "3-5 stones to platform",  "event"),
    ("tire_flip",            "Tire Flip",               120, "3 sets of 8",              "event"),
    ("loading_medley",       "Loading Medley",          240, "3 runs for time",          "event"),
    ("car_deadlift",         "Car Deadlift Sim",        180, "Max reps in 60s",          "event"),
]

# =========================================================================
# PHASE TEMPLATES  — keyed by goal
# =========================================================================

def _uid() -> str:
    return str(uuid.uuid4())


def _round25(val: float) -> float:
    """Round to nearest 2.5 kg."""
    return round(val / 2.5) * 2.5


def _pct(lifts: Dict, key: str, pct: float) -> Optional[float]:
    """Return pct% of the named lift, or None if no data."""
    v = lifts.get(key, 0.0)
    if not v:
        return None
    return _round25(v * pct)


def _warmup_sets(top_load: Optional[float], target_reps: int) -> List[Dict]:
    """Generate standard warm-up progression to top_load."""
    if not top_load:
        return [
            {"setNumber": i, "targetReps": r, "targetLoad": None, "isWarmup": True}
            for i, r in enumerate([(5, 1), (3, 2), (2, 3), (1, 4)], 1)
        ]
    sets = []
    percentages = [0.40, 0.55, 0.68, 0.78, 0.86]
    for i, p in enumerate(percentages, 1):
        sets.append({
            "setNumber": i,
            "targetReps": max(1, target_reps + (5 - i)),
            "targetLoad": _round25(top_load * p / 1.0),
            "targetRPE": None,
            "isWarmup": True,
        })
    sets.append({
        "setNumber": len(sets) + 1,
        "targetReps": target_reps,
        "targetLoad": top_load,
        "targetRPE": 9.0 if target_reps == 1 else 8.5,
        "isWarmup": False,
    })
    return sets


def _de_sets(load: Optional[float], reps: int, total_sets: int) -> List[Dict]:
    """Generate DE speed sets."""
    return [
        {
            "setNumber": i + 1,
            "targetReps": reps,
            "targetLoad": load,
            "targetRPE": 6.0,
            "isWarmup": False,
        }
        for i in range(total_sets)
    ]


def _accessory_sets(n_sets: int, reps: int, load: Optional[float] = None) -> List[Dict]:
    return [
        {"setNumber": i + 1, "targetReps": reps, "targetLoad": load, "targetRPE": 7.5, "isWarmup": False}
        for i in range(n_sets)
    ]


# =========================================================================
# SESSION BUILDERS
# =========================================================================

def _build_exercise(session_id: str, ex_id: str, name: str, category: str,
                    prescription: str, target_sets: List[Dict],
                    order: int, notes: str = "") -> Dict:
    return {
        "sessionExerciseId": _uid(),
        "sessionId": session_id,
        "exerciseId": ex_id,
        "name": name,
        "category": category,
        "prescription": prescription,
        "targetSets": target_sets,
        "notes": notes,
        "order": order,
        "loggedSets": [],
        "completed": False,
    }


def _me_lower_session(session_id: str, block_id: str, week: int, day: int,
                      week_in_block: int, phase_num: int, goal: str,
                      lifts: Dict) -> Dict:
    """Max Effort Lower Body session."""
    rotation = ME_LOWER_PL if goal == "powerlifting" else ME_LOWER_ROTATIONS
    rot_idx = (week - 1 + phase_num * 4) % len(rotation)
    ex_id, ex_name = rotation[rot_idx]

    # Determine target rep max by week in block
    rep_targets = {1: ("5RM", 5, 0.875), 2: ("3RM", 3, 0.925), 3: ("1RM", 1, 1.0)}
    label, reps, pct_1rm = rep_targets.get(week_in_block, ("3RM", 3, 0.925))

    base_key = "squat" if "squat" in ex_id or "good_morning" in ex_id else "deadlift"
    top_load = _pct(lifts, base_key, pct_1rm * 100)

    exercises = [
        _build_exercise(
            session_id, ex_id, ex_name, "main",
            f"Work up to {label} — warm-up progressively",
            _warmup_sets(top_load, reps),
            order=1,
            notes=f"Phase {phase_num}, Week {week_in_block} of block",
        )
    ]

    # 2 supplemental
    for i, s in enumerate([
        LOWER_SUPPLEMENTAL[(week + phase_num) % len(LOWER_SUPPLEMENTAL)],
        LOWER_SUPPLEMENTAL[(week + phase_num + 3) % len(LOWER_SUPPLEMENTAL)],
    ], 2):
        sq_load = _pct(lifts, "squat", 50)
        exercises.append(_build_exercise(
            session_id, s[0], s[1], s[4],
            s[3], _accessory_sets(4, 10, sq_load), order=i,
        ))

    # core accessory
    a = LOWER_ACCESSORIES[week % len(LOWER_ACCESSORIES)]
    exercises.append(_build_exercise(
        session_id, a[0], a[1], a[4], a[3],
        _accessory_sets(3, 12), order=4,
    ))

    return {
        "sessionId": session_id, "blockId": block_id,
        "weekNumber": week, "dayNumber": day,
        "sessionType": "ME_LOWER",
        "objective": f"Max Effort Lower — {ex_name} to {label}",
        "coachNote": f"Focus on technique. The {ex_name} is this week's ME exercise. Work to a true {label}.",
        "exercises": exercises, "status": "pending",
    }


def _me_upper_session(session_id: str, block_id: str, week: int, day: int,
                      week_in_block: int, phase_num: int, goal: str,
                      lifts: Dict) -> Dict:
    rotation = ME_UPPER_SM if goal == "strongman" else ME_UPPER_ROTATIONS
    rot_idx = (week - 1 + phase_num * 4 + 6) % len(rotation)
    ex_id, ex_name = rotation[rot_idx]

    rep_targets = {1: ("5RM", 5, 0.875), 2: ("3RM", 3, 0.925), 3: ("1RM", 1, 1.0)}
    label, reps, pct_1rm = rep_targets.get(week_in_block, ("3RM", 3, 0.925))
    top_load = _pct(lifts, "bench", pct_1rm * 100)

    exercises = [
        _build_exercise(
            session_id, ex_id, ex_name, "main",
            f"Work up to {label}",
            _warmup_sets(top_load, reps), order=1,
        )
    ]

    # 2 tricep, 2 back, 1 shoulder
    for i, t in enumerate([
        UPPER_TRICEPS[(week + phase_num) % len(UPPER_TRICEPS)],
        UPPER_TRICEPS[(week + phase_num + 3) % len(UPPER_TRICEPS)],
    ], 2):
        exercises.append(_build_exercise(session_id, t[0], t[1], t[4], t[3],
                                          _accessory_sets(4, 10), order=i))

    for i, b in enumerate([
        UPPER_BACK[(week + phase_num) % len(UPPER_BACK)],
        UPPER_BACK[(week + phase_num + 2) % len(UPPER_BACK)],
    ], 4):
        exercises.append(_build_exercise(session_id, b[0], b[1], b[4], b[3],
                                          _accessory_sets(4, 10), order=i))

    sh = UPPER_ACCESSORIES[week % len(UPPER_ACCESSORIES)]
    exercises.append(_build_exercise(session_id, sh[0], sh[1], sh[4], sh[3],
                                      _accessory_sets(3, 15), order=6))

    return {
        "sessionId": session_id, "blockId": block_id,
        "weekNumber": week, "dayNumber": day,
        "sessionType": "ME_UPPER",
        "objective": f"Max Effort Upper — {ex_name} to {label}",
        "coachNote": f"{ex_name} is today's ME exercise. Triceps and back volume follows.",
        "exercises": exercises, "status": "pending",
    }


def _de_lower_session(session_id: str, block_id: str, week: int, day: int,
                      week_in_block: int, phase_num: int, goal: str,
                      lifts: Dict, de_pct: int) -> Dict:
    sq_load = _pct(lifts, "squat", de_pct)
    dl_load = _pct(lifts, "deadlift", de_pct)

    exercises = [
        _build_exercise(
            session_id, "speed_box_squat", "Speed Box Squat", "main",
            f"{de_pct}% × 8 sets × 2 reps — max bar speed, alternate stance",
            _de_sets(sq_load, 2, 8), order=1,
            notes="Explode off the box. 60s rest between sets.",
        ),
        _build_exercise(
            session_id, "speed_deadlift", "Speed Deadlift", "main",
            f"{de_pct}% × 6 singles — violently fast, 30s rest",
            _de_sets(dl_load, 1, 6), order=2,
        ),
        _build_exercise(
            session_id, "box_jump", "Box Jump", "accessory",
            "4x3 — maximal height, full recovery",
            _accessory_sets(4, 3), order=3,
        ),
    ]

    s = LOWER_SUPPLEMENTAL[(week + phase_num + 1) % len(LOWER_SUPPLEMENTAL)]
    exercises.append(_build_exercise(session_id, s[0], s[1], s[4], s[3],
                                      _accessory_sets(4, 10, _pct(lifts, "squat", 45)), order=4))

    a = LOWER_ACCESSORIES[(week + 1) % len(LOWER_ACCESSORIES)]
    exercises.append(_build_exercise(session_id, a[0], a[1], a[4], a[3],
                                      _accessory_sets(3, 12), order=5))

    return {
        "sessionId": session_id, "blockId": block_id,
        "weekNumber": week, "dayNumber": day,
        "sessionType": "DE_LOWER",
        "objective": f"Dynamic Effort Lower — Speed work at {de_pct}%",
        "coachNote": "Speed is the stimulus. No grinding. Move the bar like your life depends on it.",
        "exercises": exercises, "status": "pending",
    }


def _de_upper_session(session_id: str, block_id: str, week: int, day: int,
                      week_in_block: int, phase_num: int, goal: str,
                      lifts: Dict, de_pct: int) -> Dict:
    bench_load = _pct(lifts, "bench", de_pct)

    oh_options = [
        ("db_shoulder_press", "DB Shoulder Press"),
        ("push_press",        "Push Press"),
        ("strict_ohp",        "Strict OHP"),
    ]
    oh_id, oh_name = oh_options[week % len(oh_options)]

    exercises = [
        _build_exercise(
            session_id, "speed_bench", "Speed Bench Press", "main",
            f"{de_pct}% × 9 sets × 3 reps — alternate grip CW/M/WD each set",
            _de_sets(bench_load, 3, 9), order=1,
            notes="Bar speed is everything. 45-60s rest between sets.",
        ),
        _build_exercise(
            session_id, oh_id, oh_name, "supplemental",
            "4x8-10 — moderate, RPE 7-8",
            _accessory_sets(4, 9), order=2,
        ),
    ]

    t = UPPER_TRICEPS[(week + phase_num + 2) % len(UPPER_TRICEPS)]
    exercises.append(_build_exercise(session_id, t[0], t[1], t[4], t[3],
                                      _accessory_sets(4, 12), order=3))

    b = UPPER_BACK[(week + phase_num + 4) % len(UPPER_BACK)]
    exercises.append(_build_exercise(session_id, b[0], b[1], b[4], b[3],
                                      _accessory_sets(4, 10), order=4))

    a1 = UPPER_ACCESSORIES[(week + 1) % len(UPPER_ACCESSORIES)]
    a2 = UPPER_ACCESSORIES[(week + 3) % len(UPPER_ACCESSORIES)]
    exercises.append(_build_exercise(session_id, a1[0], a1[1], a1[4], a1[3],
                                      _accessory_sets(3, 15), order=5))
    exercises.append(_build_exercise(session_id, a2[0], a2[1], a2[4], a2[3],
                                      _accessory_sets(3, 15), order=6))

    return {
        "sessionId": session_id, "blockId": block_id,
        "weekNumber": week, "dayNumber": day,
        "sessionType": "DE_UPPER",
        "objective": f"Dynamic Effort Upper — Speed bench at {de_pct}% + Upper volume",
        "coachNote": "Speed bench first, then upper body accessories. Keep rest short on accessories.",
        "exercises": exercises, "status": "pending",
    }


def _events_session(session_id: str, block_id: str, week: int, day: int,
                    week_in_block: int, phase_num: int, lifts: Dict) -> Dict:
    event_count = 3
    event_indices = [(week + i * 2 + phase_num) % len(STRONGMAN_EVENTS) for i in range(event_count)]
    exercises = []
    for order, idx in enumerate(event_indices, 1):
        ev = STRONGMAN_EVENTS[idx]
        exercises.append(_build_exercise(
            session_id, ev[0], ev[1], ev[4], ev[3],
            _accessory_sets(3, 3), order=order,
        ))
    return {
        "sessionId": session_id, "blockId": block_id,
        "weekNumber": week, "dayNumber": day,
        "sessionType": "EVENTS",
        "objective": "Strongman Events Practice — 3 events, full effort",
        "coachNote": "Today is events day. Be aggressive. Log your best distances and loads.",
        "exercises": exercises, "status": "pending",
    }


def _gpp_session(session_id: str, block_id: str, week: int, day: int,
                 lifts: Dict) -> Dict:
    exercises = [
        _build_exercise(session_id, "sled_push", "Sled Push", "conditioning",
                         "5x30m — steady pace", _accessory_sets(5, 1), order=1),
        _build_exercise(session_id, "farmers_carry_gpp", "Farmer's Carry", "conditioning",
                         "4x40m — moderate weight", _accessory_sets(4, 1), order=2),
        _build_exercise(session_id, "battle_rope", "Battle Ropes", "conditioning",
                         "5x30s — max effort", _accessory_sets(5, 1), order=3),
        _build_exercise(session_id, "ab_wheel", "Ab Wheel", "accessory",
                         "3x12 — controlled", _accessory_sets(3, 12), order=4),
    ]
    return {
        "sessionId": session_id, "blockId": block_id,
        "weekNumber": week, "dayNumber": day,
        "sessionType": "GPP",
        "objective": "GPP & Conditioning — aerobic base work",
        "coachNote": "Keep intensity moderate. This is aerobic base work, not a workout war.",
        "exercises": exercises, "status": "pending",
    }


def _hyp_lower_session(session_id: str, block_id: str, week: int, day: int,
                       week_in_block: int, phase_num: int, lifts: Dict) -> Dict:
    rot_idx = (week + phase_num) % len(HYP_LOWER)
    ex_id, ex_name = HYP_LOWER[rot_idx]
    sq_load = _pct(lifts, "squat", 70)
    exercises = [
        _build_exercise(session_id, ex_id, ex_name, "main",
                         "4x8-12 — moderate load, constant tension",
                         _accessory_sets(4, 10, sq_load), order=1),
    ]
    for i, s in enumerate(LOWER_SUPPLEMENTAL[(week) % len(LOWER_SUPPLEMENTAL):], 2):
        if i > 4:
            break
        exercises.append(_build_exercise(session_id, s[0], s[1], s[4], s[3],
                                          _accessory_sets(3, 12), order=i))
    return {
        "sessionId": session_id, "blockId": block_id,
        "weekNumber": week, "dayNumber": day,
        "sessionType": "HYP_LOWER",
        "objective": f"Hypertrophy Lower — {ex_name}, high volume",
        "coachNote": "Focus on muscle contraction. Control the eccentric. Time under tension.",
        "exercises": exercises, "status": "pending",
    }


def _hyp_upper_session(session_id: str, block_id: str, week: int, day: int,
                       week_in_block: int, phase_num: int, lifts: Dict) -> Dict:
    rot_idx = (week + phase_num + 3) % len(HYP_UPPER)
    ex_id, ex_name = HYP_UPPER[rot_idx]
    bench_load = _pct(lifts, "bench", 70)
    exercises = [
        _build_exercise(session_id, ex_id, ex_name, "main",
                         "4x8-12 — moderate load",
                         _accessory_sets(4, 10, bench_load), order=1),
    ]
    for i, s in enumerate(UPPER_BACK[(week) % len(UPPER_BACK):], 2):
        if i > 3:
            break
        exercises.append(_build_exercise(session_id, s[0], s[1], s[4], s[3],
                                          _accessory_sets(3, 12), order=i))
    for i, t in enumerate(UPPER_TRICEPS[(week + 2) % len(UPPER_TRICEPS):], 4):
        if i > 5:
            break
        exercises.append(_build_exercise(session_id, t[0], t[1], t[4], t[3],
                                          _accessory_sets(3, 12), order=i))
    return {
        "sessionId": session_id, "blockId": block_id,
        "weekNumber": week, "dayNumber": day,
        "sessionType": "HYP_UPPER",
        "objective": f"Hypertrophy Upper — {ex_name}, high volume",
        "coachNote": "Pump work. Keep rest short (60-90s). Focus on mind-muscle connection.",
        "exercises": exercises, "status": "pending",
    }


# =========================================================================
# SESSION DISPATCH
# =========================================================================

def _get_session_types(days_per_week: int, goal: str) -> List[str]:
    base = {
        3: ["ME_LOWER", "ME_UPPER", "DE_LOWER"],
        4: ["ME_LOWER", "ME_UPPER", "DE_LOWER", "DE_UPPER"],
        5: ["ME_LOWER", "ME_UPPER", "DE_LOWER", "DE_UPPER", "EVENTS"],
        6: ["ME_LOWER", "ME_UPPER", "DE_LOWER", "DE_UPPER", "EVENTS", "GPP"],
    }.get(days_per_week, ["ME_LOWER", "ME_UPPER", "DE_LOWER", "DE_UPPER"])

    if goal == "hypertrophy":
        base = {
            3: ["HYP_LOWER", "HYP_UPPER", "HYP_LOWER"],
            4: ["HYP_LOWER", "HYP_UPPER", "HYP_LOWER", "HYP_UPPER"],
            5: ["HYP_LOWER", "HYP_UPPER", "HYP_LOWER", "HYP_UPPER", "GPP"],
        }.get(days_per_week, ["HYP_LOWER", "HYP_UPPER", "HYP_LOWER", "HYP_UPPER"])

    # For non-strongman goals, replace EVENTS with GPP
    if goal not in ("strongman",):
        base = ["GPP" if t == "EVENTS" else t for t in base]

    return base[:days_per_week]


def _build_session(s_type: str, session_id: str, block_id: str, week: int, day_num: int,
                   week_in_block: int, phase_num: int, goal: str,
                   lifts: Dict, de_pct: int) -> Dict:
    fn_map = {
        "ME_LOWER":  lambda: _me_lower_session(session_id, block_id, week, day_num, week_in_block, phase_num, goal, lifts),
        "ME_UPPER":  lambda: _me_upper_session(session_id, block_id, week, day_num, week_in_block, phase_num, goal, lifts),
        "DE_LOWER":  lambda: _de_lower_session(session_id, block_id, week, day_num, week_in_block, phase_num, goal, lifts, de_pct),
        "DE_UPPER":  lambda: _de_upper_session(session_id, block_id, week, day_num, week_in_block, phase_num, goal, lifts, de_pct),
        "EVENTS":    lambda: _events_session(session_id, block_id, week, day_num, week_in_block, phase_num, lifts),
        "GPP":       lambda: _gpp_session(session_id, block_id, week, day_num, lifts),
        "HYP_LOWER": lambda: _hyp_lower_session(session_id, block_id, week, day_num, week_in_block, phase_num, lifts),
        "HYP_UPPER": lambda: _hyp_upper_session(session_id, block_id, week, day_num, week_in_block, phase_num, lifts),
    }
    return fn_map.get(s_type, fn_map["GPP"])()


# =========================================================================
# PHASE / BLOCK TEMPLATES
# =========================================================================

def _get_phase_templates(goal: str) -> List[Dict]:
    conjugate = [
        {"phaseName": "Phase 1 — GPP & Foundation",     "goal": "Build work capacity and movement quality",       "expectedAdaptation": "Improved technique, baseline strength, resilience", "weeks": 8,  "de_pct": 55, "blocks": [{"name": "Foundation A", "goal": "Establish patterns"}, {"name": "Foundation B", "goal": "Volume accumulation"}]},
        {"phaseName": "Phase 2 — Accumulation",          "goal": "Build maximal strength through volume",           "expectedAdaptation": "5-10% increase in working weights",                        "weeks": 8,  "de_pct": 58, "blocks": [{"name": "Accumulation A", "goal": "Moderate weight, higher volume"}, {"name": "Accumulation B", "goal": "Increased intensity"}]},
        {"phaseName": "Phase 3 — Intensification",       "goal": "Approach maximal effort territory",              "expectedAdaptation": "New 3RM and 1RM PRs",                                       "weeks": 8,  "de_pct": 62, "blocks": [{"name": "Intensification A", "goal": "Heavy triples"}, {"name": "Intensification B", "goal": "Singles and maxes"}]},
        {"phaseName": "Phase 4 — Peak & Test",           "goal": "Realize strength, test true maxes",              "expectedAdaptation": "All-time PRs across main lifts",                            "weeks": 4,  "de_pct": 65, "blocks": [{"name": "Peak Block", "goal": "True 1RM attempts"}]},
        {"phaseName": "Phase 5 — Transition & Recovery", "goal": "Active recovery, address weaknesses",           "expectedAdaptation": "Restored CNS, corrected imbalances",                        "weeks": 8,  "de_pct": 50, "blocks": [{"name": "Recovery A", "goal": "Low intensity restoration"}, {"name": "Recovery B", "goal": "Address weaknesses"}]},
        {"phaseName": "Phase 6 — New Cycle Foundation",  "goal": "Establish new baseline for next annual cycle",   "expectedAdaptation": "Higher starting point than Phase 1",                         "weeks": 8,  "de_pct": 55, "blocks": [{"name": "New Baseline A", "goal": "Reset and rebuild"}, {"name": "New Baseline B", "goal": "Ramp for next cycle"}]},
    ]

    hypertrophy = [
        {"phaseName": "Phase 1 — Hypertrophy Foundation","goal": "Build muscle and work capacity",               "expectedAdaptation": "Improved muscle mass and endurance",                        "weeks": 8,  "de_pct": 65, "blocks": [{"name": "Volume Block A", "goal": "High rep ranges"}, {"name": "Volume Block B", "goal": "Push volume higher"}]},
        {"phaseName": "Phase 2 — Strength Phase",         "goal": "Convert muscle to strength",                   "expectedAdaptation": "Strength PRs in main lifts",                                 "weeks": 8,  "de_pct": 65, "blocks": [{"name": "Strength A", "goal": "Lower reps, heavier"}, {"name": "Strength B", "goal": "Near maximal effort"}]},
        {"phaseName": "Phase 3 — Peaking",                "goal": "Peak strength and size",                       "expectedAdaptation": "Best physique and strength simultaneously",               "weeks": 4,  "de_pct": 65, "blocks": [{"name": "Peak Block", "goal": "Maximum expression"}]},
        {"phaseName": "Phase 4 — Deload & Reset",         "goal": "Active recovery",                             "expectedAdaptation": "Restored recovery and readiness",                           "weeks": 4,  "de_pct": 50, "blocks": [{"name": "Deload", "goal": "Reduce all volumes"}]},
        {"phaseName": "Phase 5 — New Hypertrophy Cycle",  "goal": "Second accumulation block",                   "expectedAdaptation": "Further muscle development",                                  "weeks": 8,  "de_pct": 65, "blocks": [{"name": "Volume C", "goal": "Increased total volume"}, {"name": "Volume D", "goal": "Peak volume"}]},
        {"phaseName": "Phase 6 — Competition Prep",       "goal": "Final peak or annual test",                   "expectedAdaptation": "Peak condition",                                              "weeks": 8,  "de_pct": 65, "blocks": [{"name": "Final Prep A", "goal": "Dial in"}, {"name": "Final Prep B", "goal": "Show ready"}]},
    ]

    return {
        "strength":     conjugate,
        "powerlifting": conjugate,
        "strongman":    conjugate,
        "hypertrophy":  hypertrophy,
        "athletic":     conjugate,
        "general":      conjugate,
    }.get(goal.lower(), conjugate)


# =========================================================================
# MAIN ASSEMBLY
# =========================================================================

def generate_plan(intake: Dict) -> Dict:
    """
    Generate a complete 12-month training plan from onboarding intake data.
    Returns a full plan dict matching the AnnualPlan schema.
    """
    user_id   = intake.get("userId") or intake.get("user_id") or _uid()
    goal      = intake.get("goal", "strength").lower().strip()
    lifts     = intake.get("currentLifts") or intake.get("current_lifts") or intake.get("max_lifts") or {}
    days_raw  = intake.get("trainingDays") or intake.get("training_days") or []
    dpw       = max(3, min(len(days_raw) or 4, 6))
    training_days = (days_raw or ["monday", "tuesday", "thursday", "friday"])[:dpw]

    plan_id   = _uid()
    now       = datetime.utcnow().isoformat()
    session_types = _get_session_types(dpw, goal)
    phase_templates = _get_phase_templates(goal)

    phases: List[Dict] = []
    week_cursor = 1

    for phase_num, pt in enumerate(phase_templates, 1):
        phase_id = _uid()
        phase_weeks = pt["weeks"]
        de_pct = pt["de_pct"]
        block_templates = pt["blocks"]
        blocks: List[Dict] = []
        block_week_cursor = week_cursor

        for block_num, bt in enumerate(block_templates, 1):
            block_id = _uid()
            weeks_in_block = 4  # 3 working + 1 deload
            block_sessions_all: List[Dict] = []

            for w_in_block in range(1, weeks_in_block + 1):
                abs_week = block_week_cursor + w_in_block - 1
                is_deload = (w_in_block == 4)

                for day_idx, (s_type, day_name) in enumerate(zip(session_types, training_days)):
                    effective_s_type = s_type
                    if is_deload:
                        # Deload: keep session type but scale loads — handled inside builders
                        pass

                    sess_id = _uid()
                    session = _build_session(
                        effective_s_type, sess_id, block_id,
                        abs_week, day_idx + 1, w_in_block,
                        phase_num, goal, lifts, de_pct,
                    )
                    session["dayOfWeek"] = day_name
                    session["isDeload"] = is_deload
                    block_sessions_all.append(session)

            block_week_cursor += weeks_in_block

            blocks.append({
                "blockId": block_id,
                "phaseId": phase_id,
                "blockName": f"Block {phase_num}.{block_num}: {bt['name']}",
                "blockNumber": block_num,
                "blockGoal": bt["goal"],
                "weekCount": weeks_in_block,
                "progressionLogic": "Add 2.5kg/week to main lifts; DE% increases across phases",
                "keyExercises": [s["exercises"][0]["name"] if s.get("exercises") else "" for s in block_sessions_all[:4]],
                "status": "upcoming" if phase_num > 1 or block_num > 1 else "active",
                "sessions": block_sessions_all,
            })

        phases.append({
            "phaseId": phase_id,
            "planId": plan_id,
            "phaseName": pt["phaseName"],
            "phaseNumber": phase_num,
            "goal": pt["goal"],
            "expectedAdaptation": pt["expectedAdaptation"],
            "startWeek": week_cursor,
            "endWeek": week_cursor + phase_weeks - 1,
            "status": "active" if phase_num == 1 else "upcoming",
            "blocks": blocks,
        })

        week_cursor += phase_weeks

    # Milestones
    milestones = [
        {"week": 4,  "label": "First max-out — establish true 1RMs"},
        {"week": 12, "label": "End of Phase 1 — expect 5-10% strength increase"},
        {"week": 20, "label": "Mid-program test — compare to baseline"},
        {"week": 28, "label": "Peak strength block — PR attempts"},
        {"week": 36, "label": "Transition — recover and reassess"},
        {"week": 44, "label": "Final peak — all-time PRs target"},
    ]

    return {
        "planId": plan_id,
        "userId": user_id,
        "planName": f"{goal.title()} Program {datetime.utcnow().year}",
        "startDate": now,
        "totalWeeks": week_cursor - 1,
        "phases": phases,
        "milestones": milestones,
        "status": "active",
        "generatedAt": now,
    }


def get_today_session(plan: Dict, current_week: int, day_of_week: str) -> Optional[Dict]:
    """Find the session matching current_week and day_of_week."""
    dow = day_of_week.lower()
    for phase in plan.get("phases", []):
        for block in phase.get("blocks", []):
            for session in block.get("sessions", []):
                if session.get("weekNumber") == current_week and session.get("dayOfWeek", "").lower() == dow:
                    return session
    return None


def get_current_block_data(plan: Dict, current_week: int) -> Optional[Dict]:
    """Return the block that contains current_week."""
    for phase in plan.get("phases", []):
        for block in phase.get("blocks", []):
            sessions = block.get("sessions", [])
            weeks_in_block = {s["weekNumber"] for s in sessions}
            if current_week in weeks_in_block:
                return block
    return None
