"""
services/warmup_cooldown.py — shared warm-up and cool-down templates.

Single source of truth for the default warm-up steps and cool-down exercises
that used to be hardcoded (and duplicated) in server.py (/warmup/today, the
startup cooldown migration) and routers/documents.py. Consumers pick a template
with classify_session(sessionType).

Shapes (kept identical to what server.py already serves so wiring is drop-in):
  WARMUP_TEMPLATES[kind]   -> list[str]   — one plain-language step per entry,
                              "Name — prescription" (the shape GET /warmup/today
                              returns in its "steps" array).
  COOLDOWN_TEMPLATES[kind] -> list[tuple] — (exercise_id, name, prescription,
                              notes), the shape of server.py's _COOLDOWN_ITEMS.
"""

# Session-type buckets the templates are keyed by.
_KINDS = ("upper", "lower", "gpp", "event", "full")


def classify_session(session_type: str) -> str:
    """Map a session type string to a template kind.

    Case-insensitive substring rules:
      "Event Training"            -> "event"
      recovery/conditioning/gpp   -> "gpp"
      anything with "lower"       -> "lower"
      anything with "upper"       -> "upper"
      unknown / full body         -> "full"
    """
    stype = (session_type or "").lower()
    if "event" in stype:
        return "event"
    if "recovery" in stype or "conditioning" in stype or "gpp" in stype:
        return "gpp"
    if "lower" in stype:
        return "lower"
    if "upper" in stype:
        return "upper"
    return "full"


# ─── Warm-up templates ────────────────────────────────────────────────────────
# "lower" and "upper" are the two lists GET /warmup/today has always served
# (base steps plus the closing bar work — injury/readiness additions stay in
# the endpoint). The other kinds add variety per session type.

WARMUP_TEMPLATES = {
    "lower": [
        "Hip circles — 10 reps each direction (slow, deliberate)",
        "Leg swings — 10 forward / 10 lateral per leg",
        "Goblet squat — 10 reps bodyweight (pause 1s at bottom)",
        "Hip flexor stretch — 30s per side",
        "Band walks — 15 steps each direction",
        "Empty bar squat — 2 × 10 (groove the pattern)",
    ],
    "upper": [
        "Band pull-aparts — 3 × 20 (scapular retraction)",
        "Shoulder dislocates (band) — 15 reps slow",
        "Face pulls (light) — 20 reps",
        "Light dumbbell press — 12 reps (not taxing)",
        "Thoracic extension over foam roller — 30s",
        "Empty bar press — 2 × 10 slow tempo (groove the press)",
    ],
    "gpp": [
        "Easy bike, row, or brisk walk — 3 min (raise the heart rate gently)",
        "World's greatest stretch — 5 per side (lunge, reach, rotate)",
        "Arm circles — 10 each direction",
        "Band pull-aparts — 2 × 15",
        "Bodyweight squat — 10 reps (smooth and controlled)",
    ],
    "event": [
        "Light sled drag — 2 easy trips (wake up the legs)",
        "Shoulder dislocates (band) — 15 reps slow",
        "Hip openers — 10 per side (deep lunge, knee circles out)",
        "Dead bug — 8 per side (brace before you load)",
        "Ramp up on today's first event — 3 light runs, building pace each run",
    ],
    "full": [
        "Easy jog or jumping jacks — 2 min",
        "Hip circles — 10 reps each direction",
        "Band pull-aparts — 2 × 15",
        "Bodyweight squat — 10 reps (smooth and controlled)",
        "Push-up — 10 reps (full range, controlled)",
        "Empty bar work on today's first lift — 2 × 10",
    ],
}


# ─── Cool-down templates ──────────────────────────────────────────────────────
# Each entry: (exercise_id, name, prescription, notes) — the exact tuple shape
# server.py's _COOLDOWN_ITEMS uses, so its dict-builder unpacks these as-is.

COOLDOWN_TEMPLATES = {
    "lower": [
        ("cd-sled-drag",       "Backward Sled Drag / Walk",      "6 trips × 40ft or 5 min walk", "Sled drag backward or brisk 5-min walk"),
        ("cd-hip-flexor",      "Hip Flexor Stretch",             "45s per side",                 "Kneeling hip flexor — hold the stretch"),
        ("cd-hamstring",       "Hamstring Stretch",              "45s per side",                 "Seated or standing — easy reach, no bouncing"),
        ("cd-foam-roll-legs",  "Foam Roll Legs",                 "2 min per area",               "Quads, hamstrings, calves, glutes"),
        ("cd-breathing",       "Deep Breathing / Box Breathing", "2 min",                        "4 count in, 4 count hold, 4 count out"),
    ],
    "upper": [
        ("cd-chest-stretch",   "Doorway Chest Stretch",          "45s per side",                 "Forearm on the frame — open the chest"),
        ("cd-lat-stretch",     "Lat Stretch on Rack",            "45s per side",                 "Grab the upright, hinge back, let the side lengthen"),
        ("cd-foam-roll-upper", "Foam Roll Upper Back and Lats",  "2 min per area",               "Slow passes — pause on tight spots"),
        ("cd-breathing",       "Deep Breathing / Box Breathing", "2 min",                        "4 count in, 4 count hold, 4 count out"),
    ],
    "gpp": [
        ("cd-easy-walk",       "Easy Walk",                      "5 min",                        "Relaxed pace — let the heart rate come down"),
        ("cd-couch-stretch",   "Couch Stretch",                  "45s per side",                 "Rear foot up, squeeze the glute, breathe into it"),
        ("cd-childs-pose",     "Child's Pose",                   "1 min",                        "Arms long, relaxed breathing"),
        ("cd-breathing",       "Deep Breathing / Box Breathing", "2 min",                        "4 count in, 4 count hold, 4 count out"),
    ],
    "event": [
        ("cd-walking-flush",   "Walking Flush",                  "5 min easy walk",              "Easy pace — shake the arms out as you go"),
        ("cd-bar-hang",        "Bar Hang",                       "3 × 20-30s",                   "Hang from a bar and let the spine stretch out"),
        ("cd-hip-flexor",      "Hip Flexor Stretch",             "45s per side",                 "Kneeling hip flexor — hold the stretch"),
        ("cd-breathing",       "Deep Breathing / Box Breathing", "2 min",                        "4 count in, 4 count hold, 4 count out"),
    ],
    "full": [
        ("cd-easy-walk",       "Easy Walk",                      "5 min",                        "Relaxed pace — let the heart rate come down"),
        ("cd-hip-flexor",      "Hip Flexor Stretch",             "45s per side",                 "Kneeling hip flexor — hold the stretch"),
        ("cd-chest-stretch",   "Doorway Chest Stretch",          "45s per side",                 "Forearm on the frame — open the chest"),
        ("cd-foam-roll",       "Foam Roll Major Muscle Groups",  "2 min per area",               "Quads, hamstrings, calves, lats, upper back"),
        ("cd-breathing",       "Deep Breathing / Box Breathing", "2 min",                        "4 count in, 4 count hold, 4 count out"),
    ],
}
