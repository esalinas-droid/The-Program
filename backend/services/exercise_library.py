"""
Exercise library — used by the plan generator to select exercises
based on training goal, phase, block, and injury profile.
"""
from typing import List, Dict, Any

# ─── Exercise data ────────────────────────────────────────────────────────────
# Each entry: id → {name, pattern, category, equipment, contraindications,
#                   load_ref, applicable_goals, applicable_phases,
#                   applicable_session_types, primary_muscles, cues}

EXERCISE_DB: Dict[str, Dict[str, Any]] = {

    # ── ME Lower Main ─────────────────────────────────────────────────────────
    "ssb_box_squat": {
        "name": "SSB Box Squat",
        "pattern": "squat", "category": "main",
        "equipment": ["ssb", "squat_rack", "box"],
        "contraindications": ["knee_severe"],
        "load_ref": "squat",
        "applicable_goals": ["strength", "strongman", "powerlifting"],
        "applicable_phases": ["Foundation", "Strength Base", "Intensification", "Competition Prep"],
        "applicable_session_types": ["ME Lower"],
        "primary_muscles": ["Quads", "Upper Back"],
        "cues": ["Push handles forward", "Stay tall", "Drive knees out"]
    },
    "conventional_deadlift": {
        "name": "Conventional Deadlift",
        "pattern": "hinge", "category": "main",
        "equipment": ["barbell", "plates"],
        "contraindications": ["low_back_severe", "hamstring_severe"],
        "load_ref": "deadlift",
        "applicable_goals": ["strength", "strongman", "powerlifting"],
        "applicable_phases": ["Strength Base", "Intensification", "Competition Prep"],
        "applicable_session_types": ["ME Lower"],
        "primary_muscles": ["Hamstrings", "Glutes", "Back"],
        "cues": ["Pull the slack out", "Lat pillars", "Drive through the floor"]
    },
    "trap_bar_deadlift": {
        "name": "Trap Bar Deadlift",
        "pattern": "hinge", "category": "main",
        "equipment": ["trap_bar", "plates"],
        "contraindications": ["low_back_moderate"],
        "load_ref": "deadlift",
        "applicable_goals": ["strength", "strongman", "hypertrophy", "general"],
        "applicable_phases": ["Foundation", "Strength Base"],
        "applicable_session_types": ["ME Lower"],
        "primary_muscles": ["Quads", "Hamstrings", "Glutes"],
        "cues": ["Neutral spine", "Drive the floor away", "Full lockout"]
    },
    "rdl": {
        "name": "Romanian Deadlift",
        "pattern": "hinge", "category": "main",
        "equipment": ["barbell", "plates"],
        "contraindications": ["hamstring_severe"],
        "load_ref": "deadlift",
        "applicable_goals": ["strength", "hypertrophy", "strongman", "general"],
        "applicable_phases": ["Foundation", "Strength Base", "Hypertrophy"],
        "applicable_session_types": ["ME Lower", "DE Lower"],
        "primary_muscles": ["Hamstrings", "Glutes"],
        "cues": ["Proud chest", "Bar stays close to legs", "Chase the stretch"]
    },
    "good_morning": {
        "name": "Good Morning",
        "pattern": "hinge", "category": "main",
        "equipment": ["barbell", "squat_rack"],
        "contraindications": ["low_back_severe"],
        "load_ref": "squat",
        "applicable_goals": ["strength", "powerlifting"],
        "applicable_phases": ["Foundation", "Strength Base"],
        "applicable_session_types": ["ME Lower"],
        "primary_muscles": ["Hamstrings", "Lower Back", "Glutes"],
        "cues": ["Push hips back", "Maintain neutral spine", "Control the descent"]
    },
    "pause_squat": {
        "name": "Pause Back Squat",
        "pattern": "squat", "category": "main",
        "equipment": ["barbell", "squat_rack"],
        "contraindications": ["knee_moderate"],
        "load_ref": "squat",
        "applicable_goals": ["strength", "powerlifting"],
        "applicable_phases": ["Foundation", "Strength Base"],
        "applicable_session_types": ["ME Lower"],
        "primary_muscles": ["Quads", "Glutes"],
        "cues": ["3-second pause in the hole", "Stay tight", "Drive hard out"]
    },
    "block_pull": {
        "name": "Block Pull (Below Knee)",
        "pattern": "hinge", "category": "main",
        "equipment": ["barbell", "plates", "blocks"],
        "contraindications": [],
        "load_ref": "deadlift",
        "applicable_goals": ["strength", "strongman", "powerlifting"],
        "applicable_phases": ["Intensification", "Competition Prep"],
        "applicable_session_types": ["ME Lower"],
        "primary_muscles": ["Back", "Hamstrings"],
        "cues": ["Reset on each rep", "Lat pillars", "Drive hips through"]
    },
    "log_clean_press": {
        "name": "Log Clean and Press",
        "pattern": "push", "category": "main",
        "equipment": ["log"],
        "contraindications": ["shoulder_severe", "elbow_severe"],
        "load_ref": "log",
        "applicable_goals": ["strongman"],
        "applicable_phases": ["Foundation", "Strength Base", "Intensification", "Competition Prep"],
        "applicable_session_types": ["ME Upper"],
        "primary_muscles": ["Shoulders", "Triceps", "Upper Back"],
        "cues": ["Clean the log first", "Dip and drive", "Lock out overhead"]
    },

    # ── ME Upper Main ─────────────────────────────────────────────────────────
    "floor_press": {
        "name": "Floor Press",
        "pattern": "push", "category": "main",
        "equipment": ["barbell", "plates"],
        "contraindications": ["shoulder_severe"],
        "load_ref": "bench",
        "applicable_goals": ["strength", "strongman", "powerlifting", "hypertrophy"],
        "applicable_phases": ["Foundation", "Strength Base", "Intensification", "Competition Prep"],
        "applicable_session_types": ["ME Upper"],
        "primary_muscles": ["Chest", "Triceps"],
        "cues": ["Pin shoulders into floor", "Drive through triceps", "Touch elbows to floor"]
    },
    "close_grip_bench": {
        "name": "Close-Grip Bench Press",
        "pattern": "push", "category": "main",
        "equipment": ["barbell", "bench", "squat_rack"],
        "contraindications": ["shoulder_moderate", "elbow_severe"],
        "load_ref": "bench",
        "applicable_goals": ["strength", "strongman", "powerlifting", "hypertrophy"],
        "applicable_phases": ["Foundation", "Strength Base", "Intensification"],
        "applicable_session_types": ["ME Upper"],
        "primary_muscles": ["Triceps", "Chest"],
        "cues": ["Elbows tucked", "Drive triceps", "Full lockout"]
    },
    "incline_db_press": {
        "name": "Incline DB Press",
        "pattern": "push", "category": "main",
        "equipment": ["dumbbells", "incline_bench"],
        "contraindications": [],
        "load_ref": "bench",
        "applicable_goals": ["hypertrophy", "strength", "general", "athletic"],
        "applicable_phases": ["Foundation", "Hypertrophy"],
        "applicable_session_types": ["ME Upper", "DE Upper"],
        "primary_muscles": ["Upper Chest", "Front Delts"],
        "cues": ["30-45 degree angle", "Full stretch at bottom", "Touch at top"]
    },
    "axle_clean_press": {
        "name": "Axle Clean and Press",
        "pattern": "push", "category": "main",
        "equipment": ["axle"],
        "contraindications": ["shoulder_severe"],
        "load_ref": "axle",
        "applicable_goals": ["strongman"],
        "applicable_phases": ["Strength Base", "Intensification", "Competition Prep"],
        "applicable_session_types": ["ME Upper"],
        "primary_muscles": ["Shoulders", "Triceps", "Traps"],
        "cues": ["Continental clean", "Dip and drive", "Full lockout"]
    },
    "ohp_barbell": {
        "name": "Overhead Press (Barbell)",
        "pattern": "push", "category": "main",
        "equipment": ["barbell", "squat_rack"],
        "contraindications": ["shoulder_severe"],
        "load_ref": "ohp",
        "applicable_goals": ["strength", "strongman", "hypertrophy", "athletic"],
        "applicable_phases": ["Foundation", "Strength Base"],
        "applicable_session_types": ["ME Upper"],
        "primary_muscles": ["Shoulders", "Triceps", "Upper Chest"],
        "cues": ["Full grip", "Drive bar overhead", "Lock hips"]
    },

    # ── DE Exercises ───────────────────────────────────────────────────────────
    "speed_box_squat": {
        "name": "Speed Box Squat (SSB)",
        "pattern": "squat", "category": "main",
        "equipment": ["ssb", "squat_rack", "box"],
        "contraindications": ["knee_severe"],
        "load_ref": "squat",
        "applicable_goals": ["strength", "strongman", "powerlifting"],
        "applicable_phases": ["Foundation", "Strength Base", "Intensification", "Competition Prep"],
        "applicable_session_types": ["DE Lower"],
        "primary_muscles": ["Quads", "Glutes"],
        "cues": ["Max bar speed", "50-60% 1RM", "8 sets of 2"]
    },
    "speed_deadlift": {
        "name": "Speed Conventional Deadlift",
        "pattern": "hinge", "category": "main",
        "equipment": ["barbell", "plates"],
        "contraindications": ["low_back_severe"],
        "load_ref": "deadlift",
        "applicable_goals": ["strength", "strongman", "powerlifting"],
        "applicable_phases": ["Foundation", "Strength Base", "Intensification", "Competition Prep"],
        "applicable_session_types": ["DE Lower"],
        "primary_muscles": ["Hamstrings", "Glutes", "Back"],
        "cues": ["Compensatory acceleration", "55-65% 1RM", "6 sets of 1"]
    },
    "speed_bench": {
        "name": "Speed Bench Press",
        "pattern": "push", "category": "main",
        "equipment": ["barbell", "bench", "squat_rack"],
        "contraindications": ["shoulder_severe"],
        "load_ref": "bench",
        "applicable_goals": ["strength", "strongman", "powerlifting"],
        "applicable_phases": ["Foundation", "Strength Base", "Intensification", "Competition Prep"],
        "applicable_session_types": ["DE Upper"],
        "primary_muscles": ["Chest", "Triceps", "Lats"],
        "cues": ["50-60% 1RM", "Max intent", "8 sets of 3"]
    },

    # ── Supplemental Lower ────────────────────────────────────────────────────
    "belt_squat": {
        "name": "Belt Squat",
        "pattern": "squat", "category": "supplemental",
        "equipment": ["belt_squat_machine"],
        "contraindications": [],
        "load_ref": "squat",
        "applicable_goals": ["strength", "strongman", "hypertrophy", "general"],
        "applicable_phases": ["Foundation", "Strength Base", "Intensification"],
        "applicable_session_types": ["DE Lower", "ME Lower"],
        "primary_muscles": ["Quads", "Glutes"],
        "cues": ["Upright posture", "Full depth", "Drive through floor"]
    },
    "ghr": {
        "name": "Glute-Ham Raise",
        "pattern": "hinge", "category": "supplemental",
        "equipment": ["ghr_machine"],
        "contraindications": ["knee_severe"],
        "load_ref": None,
        "applicable_goals": ["strength", "strongman", "powerlifting"],
        "applicable_phases": ["Foundation", "Strength Base", "Intensification"],
        "applicable_session_types": ["DE Lower"],
        "primary_muscles": ["Hamstrings", "Glutes"],
        "cues": ["Start from full extension", "Curl body up", "Controlled negative"]
    },
    "hip_thrust": {
        "name": "Hip Thrust",
        "pattern": "hinge", "category": "supplemental",
        "equipment": ["barbell", "bench"],
        "contraindications": [],
        "load_ref": None,
        "applicable_goals": ["strength", "hypertrophy", "athletic", "general"],
        "applicable_phases": ["Foundation", "Hypertrophy"],
        "applicable_session_types": ["DE Lower"],
        "primary_muscles": ["Glutes"],
        "cues": ["Drive hips to ceiling", "Posterior pelvic tilt at top", "Full extension"]
    },
    "leg_curl": {
        "name": "Lying Leg Curl",
        "pattern": "hinge", "category": "supplemental",
        "equipment": ["leg_curl_machine"],
        "contraindications": ["hamstring_severe"],
        "load_ref": None,
        "applicable_goals": ["hypertrophy", "strength", "general"],
        "applicable_phases": ["Foundation", "Hypertrophy"],
        "applicable_session_types": ["DE Lower"],
        "primary_muscles": ["Hamstrings"],
        "cues": ["Full range", "Squeeze at top", "Slow negative"]
    },
    "leg_press": {
        "name": "Leg Press",
        "pattern": "squat", "category": "supplemental",
        "equipment": ["leg_press_machine"],
        "contraindications": ["knee_moderate"],
        "load_ref": "squat",
        "applicable_goals": ["hypertrophy", "strength", "general"],
        "applicable_phases": ["Foundation", "Hypertrophy"],
        "applicable_session_types": ["DE Lower"],
        "primary_muscles": ["Quads", "Glutes"],
        "cues": ["Full range of motion", "No lockout", "Controlled descent"]
    },

    # ── Supplemental Upper ────────────────────────────────────────────────────
    "pendlay_row": {
        "name": "Pendlay Row",
        "pattern": "pull", "category": "supplemental",
        "equipment": ["barbell", "plates"],
        "contraindications": ["low_back_severe"],
        "load_ref": "deadlift",
        "applicable_goals": ["strength", "strongman", "powerlifting", "hypertrophy"],
        "applicable_phases": ["Foundation", "Strength Base", "Intensification"],
        "applicable_session_types": ["ME Upper"],
        "primary_muscles": ["Lats", "Upper Back", "Biceps"],
        "cues": ["Bar to floor every rep", "Flat back", "Explosive pull"]
    },
    "chest_supported_row": {
        "name": "Chest-Supported Row",
        "pattern": "pull", "category": "supplemental",
        "equipment": ["incline_bench", "dumbbells"],
        "contraindications": [],
        "load_ref": None,
        "applicable_goals": ["hypertrophy", "strength", "general", "athletic"],
        "applicable_phases": ["Foundation", "Hypertrophy"],
        "applicable_session_types": ["ME Upper", "DE Upper"],
        "primary_muscles": ["Lats", "Rhomboids", "Rear Delts"],
        "cues": ["Chest stays on pad", "Elbows to ribs", "Full stretch at bottom"]
    },
    "lat_pulldown": {
        "name": "Lat Pulldown",
        "pattern": "pull", "category": "supplemental",
        "equipment": ["cable_machine"],
        "contraindications": ["shoulder_severe"],
        "load_ref": None,
        "applicable_goals": ["hypertrophy", "strength", "general", "athletic"],
        "applicable_phases": ["Foundation", "Hypertrophy"],
        "applicable_session_types": ["ME Upper", "DE Upper"],
        "primary_muscles": ["Lats"],
        "cues": ["Pull to chest", "Elbows down and back", "No momentum"]
    },
    "db_row": {
        "name": "Single-Arm DB Row",
        "pattern": "pull", "category": "supplemental",
        "equipment": ["dumbbells"],
        "contraindications": [],
        "load_ref": None,
        "applicable_goals": ["hypertrophy", "strength", "general", "athletic"],
        "applicable_phases": ["Foundation", "Hypertrophy", "Strength Base"],
        "applicable_session_types": ["ME Upper", "DE Upper"],
        "primary_muscles": ["Lats", "Biceps"],
        "cues": ["Elbow to hip", "Rotate torso", "Full stretch"]
    },

    # ── Accessories ───────────────────────────────────────────────────────────
    "face_pull": {
        "name": "Face Pull",
        "pattern": "pull", "category": "accessory",
        "equipment": ["cable_machine"],
        "contraindications": [],
        "load_ref": None,
        "applicable_goals": ["strength", "hypertrophy", "strongman", "general", "athletic"],
        "applicable_phases": ["Foundation", "Strength Base", "Intensification", "Competition Prep"],
        "applicable_session_types": ["ME Upper", "DE Upper"],
        "primary_muscles": ["Rear Delts", "Rotator Cuff"],
        "cues": ["Pull to forehead", "External rotation at end", "Light weight"]
    },
    "band_pull_apart": {
        "name": "Band Pull-Apart",
        "pattern": "pull", "category": "accessory",
        "equipment": ["resistance_band"],
        "contraindications": [],
        "load_ref": None,
        "applicable_goals": ["strength", "hypertrophy", "strongman", "general", "athletic"],
        "applicable_phases": ["Foundation", "Strength Base", "Intensification", "Competition Prep"],
        "applicable_session_types": ["ME Upper", "DE Upper"],
        "primary_muscles": ["Rear Delts", "Rhomboids"],
        "cues": ["Arms straight", "Full retraction", "Control return"]
    },
    "tricep_pushdown": {
        "name": "Tricep Pushdown",
        "pattern": "push", "category": "accessory",
        "equipment": ["cable_machine"],
        "contraindications": ["elbow_severe"],
        "load_ref": None,
        "applicable_goals": ["strength", "hypertrophy", "strongman", "general"],
        "applicable_phases": ["Foundation", "Strength Base", "Intensification"],
        "applicable_session_types": ["ME Upper", "DE Upper"],
        "primary_muscles": ["Triceps"],
        "cues": ["Elbows pinned to sides", "Full extension", "Control the return"]
    },
    "db_curl": {
        "name": "DB Curl",
        "pattern": "pull", "category": "accessory",
        "equipment": ["dumbbells"],
        "contraindications": [],
        "load_ref": None,
        "applicable_goals": ["hypertrophy", "strength", "general"],
        "applicable_phases": ["Foundation", "Hypertrophy"],
        "applicable_session_types": ["ME Upper", "DE Upper"],
        "primary_muscles": ["Biceps"],
        "cues": ["Full supination", "Controlled negative", "No swinging"]
    },
    "ab_wheel": {
        "name": "Ab Wheel",
        "pattern": "isolation", "category": "accessory",
        "equipment": ["ab_wheel"],
        "contraindications": ["low_back_severe"],
        "load_ref": None,
        "applicable_goals": ["strength", "hypertrophy", "strongman", "general", "athletic"],
        "applicable_phases": ["Foundation", "Strength Base", "Intensification"],
        "applicable_session_types": ["ME Lower", "DE Lower"],
        "primary_muscles": ["Core", "Lats"],
        "cues": ["Hollow body position", "Pull back with lats", "No lower back arch"]
    },
    "reverse_hyper": {
        "name": "Reverse Hyper",
        "pattern": "hinge", "category": "accessory",
        "equipment": ["reverse_hyper_machine"],
        "contraindications": [],
        "load_ref": None,
        "applicable_goals": ["strength", "powerlifting", "strongman"],
        "applicable_phases": ["Foundation", "Strength Base", "Intensification"],
        "applicable_session_types": ["ME Lower", "DE Lower"],
        "primary_muscles": ["Lower Back", "Glutes"],
        "cues": ["Decompresses spine", "Full arc", "Squeeze glutes at top"]
    },
    "dead_bug": {
        "name": "Dead Bug",
        "pattern": "isolation", "category": "accessory",
        "equipment": [],
        "contraindications": [],
        "load_ref": None,
        "applicable_goals": ["strength", "hypertrophy", "strongman", "general", "athletic"],
        "applicable_phases": ["Foundation", "Strength Base", "Intensification"],
        "applicable_session_types": ["ME Lower", "DE Lower", "ME Upper", "DE Upper"],
        "primary_muscles": ["Core", "Hip Flexors"],
        "cues": ["Low back stays flat", "Breathe", "Opposite arm and leg"]
    },
    "pallof_press": {
        "name": "Pallof Press",
        "pattern": "isolation", "category": "accessory",
        "equipment": ["cable_machine"],
        "contraindications": [],
        "load_ref": None,
        "applicable_goals": ["strength", "hypertrophy", "strongman", "general", "athletic"],
        "applicable_phases": ["Foundation", "Strength Base", "Intensification"],
        "applicable_session_types": ["ME Lower", "DE Lower"],
        "primary_muscles": ["Core"],
        "cues": ["Anti-rotation", "Hips square", "Slow and controlled"]
    },
    "tricep_extension": {
        "name": "Skull Crusher",
        "pattern": "push", "category": "accessory",
        "equipment": ["barbell", "bench"],
        "contraindications": ["elbow_severe"],
        "load_ref": None,
        "applicable_goals": ["strength", "hypertrophy"],
        "applicable_phases": ["Foundation", "Strength Base"],
        "applicable_session_types": ["ME Upper", "DE Upper"],
        "primary_muscles": ["Triceps"],
        "cues": ["Elbows in", "Lower to forehead", "Full extension"]
    },
    "hammer_curl": {
        "name": "Hammer Curl",
        "pattern": "pull", "category": "accessory",
        "equipment": ["dumbbells"],
        "contraindications": [],
        "load_ref": None,
        "applicable_goals": ["hypertrophy", "strength", "general"],
        "applicable_phases": ["Foundation", "Hypertrophy"],
        "applicable_session_types": ["ME Upper", "DE Upper"],
        "primary_muscles": ["Brachialis", "Forearms"],
        "cues": ["Neutral grip throughout", "Full range", "No swinging"]
    },

    # ── GPP / Carries / Conditioning ──────────────────────────────────────────
    "farmer_carry": {
        "name": "Farmer Carry",
        "pattern": "carry", "category": "gpp",
        "equipment": ["farmer_handles"],
        "contraindications": ["wrist_severe"],
        "load_ref": "farmers",
        "applicable_goals": ["strength", "strongman", "general", "athletic"],
        "applicable_phases": ["Foundation", "Strength Base", "Intensification", "Competition Prep"],
        "applicable_session_types": ["DE Lower", "GPP"],
        "primary_muscles": ["Traps", "Forearms", "Core"],
        "cues": ["Tall spine", "Retract shoulders", "Purposeful stride"]
    },
    "yoke_carry": {
        "name": "Yoke Carry",
        "pattern": "carry", "category": "gpp",
        "equipment": ["yoke"],
        "contraindications": [],
        "load_ref": "yoke",
        "applicable_goals": ["strongman"],
        "applicable_phases": ["Strength Base", "Intensification", "Competition Prep"],
        "applicable_session_types": ["GPP", "ME Lower"],
        "primary_muscles": ["Quads", "Traps", "Core"],
        "cues": ["Short quick steps", "Eyes up", "Drive through ground"]
    },
    "sled_push": {
        "name": "Sled Push",
        "pattern": "carry", "category": "gpp",
        "equipment": ["sled"],
        "contraindications": [],
        "load_ref": None,
        "applicable_goals": ["strength", "strongman", "general", "athletic"],
        "applicable_phases": ["Foundation", "Strength Base", "Intensification"],
        "applicable_session_types": ["DE Lower", "GPP"],
        "primary_muscles": ["Quads", "Glutes", "Calves"],
        "cues": ["45 degree angle", "Drive through the floor", "Arms locked"]
    },
    "sandbag_carry": {
        "name": "Sandbag Carry",
        "pattern": "carry", "category": "gpp",
        "equipment": ["sandbag"],
        "contraindications": [],
        "load_ref": None,
        "applicable_goals": ["strongman", "general"],
        "applicable_phases": ["Strength Base", "Intensification", "Competition Prep"],
        "applicable_session_types": ["GPP"],
        "primary_muscles": ["Core", "Shoulders", "Quads"],
        "cues": ["Bag on shoulder", "Upright posture", "Quick steps"]
    },
}

# ─── Helper functions ─────────────────────────────────────────────────────────

def get_exercises_for_session(
    session_type: str,
    phase_name: str,
    goal: str,
    injuries: list,
    equipment_access: list,
    block_number: int = 1,
) -> Dict[str, List[str]]:
    """
    Returns {main:[], supplemental:[], accessories:[], gpp:[]} exercise IDs
    filtered by goal, phase, injuries, and available equipment.
    """
    # Build injury keyword set from injury strings
    injury_keywords = set()
    for inj in injuries:
        inj_lower = inj.lower()
        if "knee" in inj_lower:    injury_keywords.add("knee_moderate"); injury_keywords.add("knee_severe" if "severe" in inj_lower else "")
        if "back" in inj_lower or "lumbar" in inj_lower: injury_keywords.add("low_back_moderate"); injury_keywords.add("low_back_severe" if "severe" in inj_lower else "")
        if "hamstring" in inj_lower: injury_keywords.add("hamstring_severe" if "severe" in inj_lower else "hamstring_moderate")
        if "shoulder" in inj_lower: injury_keywords.add("shoulder_severe" if "severe" in inj_lower else "shoulder_moderate")
        if "elbow" in inj_lower:   injury_keywords.add("elbow_severe")
    injury_keywords.discard("")

    result: Dict[str, List[str]] = {"main": [], "supplemental": [], "accessories": [], "gpp": []}

    for ex_id, ex in EXERCISE_DB.items():
        # Check goal match
        if goal not in ex.get("applicable_goals", []):
            if "general" not in ex.get("applicable_goals", []):
                continue
        # Check phase match
        if phase_name not in ex.get("applicable_phases", []):
            continue
        # Check session type match
        if session_type not in ex.get("applicable_session_types", []):
            continue
        # Check contraindications
        if any(c in injury_keywords for c in ex.get("contraindications", [])):
            continue
        # Map to result
        cat = ex.get("category", "accessory")
        if cat == "main":
            result["main"].append(ex_id)
        elif cat == "supplemental":
            result["supplemental"].append(ex_id)
        elif cat in ("accessory", "prehab"):
            result["accessories"].append(ex_id)
        elif cat == "gpp":
            result["gpp"].append(ex_id)

    return result


def get_exercise_name(ex_id: str) -> str:
    return EXERCISE_DB.get(ex_id, {}).get("name", ex_id)


def get_exercise_cues(ex_id: str) -> List[str]:
    return EXERCISE_DB.get(ex_id, {}).get("cues", [])


def get_exercise_load_ref(ex_id: str) -> Optional[str]:
    return EXERCISE_DB.get(ex_id, {}).get("load_ref")


from typing import Optional
