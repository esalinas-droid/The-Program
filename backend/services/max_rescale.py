"""Rescale a live program when an athlete updates a training max.

Every prescribed load in a plan is a percentage of a max the athlete entered.
When a max changes, the honest thing is to move the loads that were derived from
it — without touching block structure, week position, logged history, or any
session that has already happened.

Deliberately a rescale, not a regeneration: rebuilding the plan would reset the
athlete's place in it. Changing a number should adjust the training, not restart
it.
"""
from typing import Dict, List, Any, Tuple
import logging

logger = logging.getLogger(__name__)

# Which exercises derive their load from which max. Mirrors how
# plan_generator builds each session.
MAX_TO_EXERCISES: Dict[str, set] = {
    "squat": {
        "Box Squat", "SSB Squat", "Front Squat", "Belt Squat", "Cambered Bar Box Squat",
        "SSB Box Squat", "Speed Box Squat", "Speed Squat", "Bulgarian Split Squat",
        "Pause Squat", "Goblet Squat", "Leg Press",
    },
    "bench": {
        "Floor Press", "Close-Grip Bench", "2-Board Press", "Incline Bench",
        "Speed Bench", "Incline DB Press", "Bench Press",
    },
    "deadlift": {
        "Block Pull", "Deficit Deadlift", "Romanian Deadlift", "Speed Deadlift",
        "Axle Deadlift", "Trap Bar Deadlift", "Sumo Deadlift",
    },
    "log_press":   {"Log Press", "Axle Press"},
    "yoke_walk":   {"Yoke Walk"},
    "atlas_stone": {"Atlas Stone"},
    "farmer_walk": {"Farmer Carry"},
}

# Loads that aren't numbers and must never be scaled.
_NON_NUMERIC = {"bar", "light", "bodyweight", "bw", "empty"}


def _scale_load(val, mult):
    """Scale a numeric targetLoad string, preserving a trailing '+'."""
    if not isinstance(val, str):
        return val
    s = val.strip()
    if not s or s.lower() in _NON_NUMERIC:
        return val
    suffix, core = "", s
    if core.endswith("+"):
        suffix, core = "+", core[:-1].strip()
    try:
        return str(int(round(float(core) * mult))) + suffix
    except (ValueError, TypeError):
        return val


def changed_maxes(old: Dict[str, Any], new: Dict[str, Any]) -> Dict[str, float]:
    """Maxes whose value actually moved, as {key: multiplier}."""
    out: Dict[str, float] = {}
    for key in MAX_TO_EXERCISES:
        try:
            o = float(old.get(key) or 0)
            n = float(new.get(key) or 0)
        except (TypeError, ValueError):
            continue
        if o > 0 and n > 0 and abs(n - o) > 0.01:
            out[key] = n / o
    return out


def rescale_plan_doc(plan_doc: dict, multipliers: Dict[str, float],
                     from_week: int = 1) -> Tuple[dict, int]:
    """Scale future loads in a saved plan document.

    Only weeks >= from_week are touched, so completed training stays an accurate
    record of what was actually prescribed at the time.

    Returns (plan_doc, exercises_touched).
    """
    if not multipliers or not plan_doc:
        return plan_doc, 0

    ex_to_mult: Dict[str, float] = {}
    for max_key, mult in multipliers.items():
        for ex_name in MAX_TO_EXERCISES.get(max_key, ()):
            ex_to_mult[ex_name] = mult

    touched = 0
    for phase in plan_doc.get("phases", []) or []:
        for block in phase.get("blocks", []) or []:
            for week in block.get("weeks", []) or []:
                if (week.get("weekNumber") or 0) < from_week:
                    continue
                for session in week.get("sessions", []) or []:
                    for ex in session.get("exercises", []) or []:
                        mult = ex_to_mult.get(ex.get("name"))
                        if not mult:
                            continue
                        for st in ex.get("targetSets", []) or []:
                            if st.get("setType") in ("work", "ramp"):
                                st["targetLoad"] = _scale_load(st.get("targetLoad"), mult)
                        # The human-readable prescription often embeds the load;
                        # stale text is how the app ends up lying to the athlete.
                        prx = ex.get("prescription")
                        if isinstance(prx, str) and prx:
                            ex["prescription"] = _rescale_numbers_in_text(prx, mult)
                        touched += 1
    return plan_doc, touched


def _rescale_numbers_in_text(text: str, mult: float) -> str:
    """Scale standalone weight numbers inside a prescription string.

    Only touches numbers that look like loads (3+ digits, or 2 digits followed by
    a unit), so rep schemes like "6×3" and distances like "20m" survive intact.
    """
    import re

    def repl(m):
        num = float(m.group(1))
        return str(int(round(num * mult))) + m.group(2)

    # e.g. "455lbs", "@ 455", "225 kg" — but not "6×3" or "20m"
    return re.sub(r"\b(\d{2,4})(\s?(?:lbs?|kgs?)\b|(?=\s|$))", repl, text)


def detect_pr_candidates(basePRs: Dict[str, Any], logs: List[dict]) -> List[dict]:
    """Logged lifts that beat the athlete's recorded max.

    Advisory only — returns candidates for the athlete to confirm. Never writes.
    """
    best: Dict[str, float] = {}
    for log in logs or []:
        name = log.get("exercise")
        w = log.get("weight")
        reps = log.get("reps") or 0
        if not name or not w or reps < 1:
            continue
        # Only treat near-singles as max attempts; a set of 8 is not a new 1RM.
        if reps > 3:
            continue
        if w > best.get(name, 0):
            best[name] = float(w)

    out = []
    for max_key, ex_names in MAX_TO_EXERCISES.items():
        try:
            current = float(basePRs.get(max_key) or 0)
        except (TypeError, ValueError):
            continue
        for ex in ex_names:
            logged = best.get(ex)
            if logged and current > 0 and logged > current:
                out.append({
                    "maxKey":       max_key,
                    "exercise":     ex,
                    "currentMax":   current,
                    "loggedWeight": logged,
                    "increase":     round(logged - current, 1),
                    "reason":       f"You logged {ex} at {logged:.0f} — above your recorded max of {current:.0f}.",
                    "requiresConfirmation": True,
                })
                break
    return out
