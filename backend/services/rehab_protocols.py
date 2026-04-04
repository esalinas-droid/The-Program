"""
Rehab Protocol Library (Task 8 — Phase 2 Batch 3)
==================================================
Curated, static 4-phase rehabilitation protocols per injury type.
RAG enhancement is applied on top at runtime — these protocols are the
safe, proven baseline that works even when Supabase is unavailable.

Phase definitions:
  1 — Acute          : pain management, gentle ROM, no load
  2 — Recovery       : controlled loading, restore full ROM
  3 — Strengthening  : progressive loading, build capacity
  4 — Return to Training: sport-specific, full loads, maintenance prehab

Progression rules (enforced in server.py):
  - Advance phase when ≥3 consecutive "clean" sessions
    (clean = pain ≤ 1 on all sets AND all prescribed sets completed)
  - Phase 4 is maintenance: never auto-graduates, runs indefinitely
"""

from typing import TypedDict


class RehabExercise(TypedDict):
    name: str
    prescription: str
    level: str          # gentle / light / moderate / high
    notes: str
    is_rag: bool        # True if added by RAG (marked differently in UI)


class RehabPhase(TypedDict):
    phase: int
    name: str
    duration_label: str
    goal: str
    criteria_to_advance: str
    sessions_required: int   # clean sessions needed to advance
    exercises: list          # list[RehabExercise]


# ══════════════════════════════════════════════════════════════════════════════
#  REHAB PROTOCOLS
# ══════════════════════════════════════════════════════════════════════════════

REHAB_PROTOCOLS: dict[str, list[RehabPhase]] = {

    # ── SHOULDER ──────────────────────────────────────────────────────────────
    "shoulder": [
        {
            "phase": 1, "name": "Acute Phase",
            "duration_label": "Days 1–14",
            "goal": "Reduce pain and inflammation, protect the shoulder, restore basic ROM",
            "criteria_to_advance": "No resting pain, 50% ROM restored, daily activities manageable",
            "sessions_required": 3,
            "exercises": [
                {"name": "Pendulum circles", "prescription": "3×30s each direction", "level": "gentle",
                 "notes": "Let gravity do the work, zero muscle force", "is_rag": False},
                {"name": "Passive shoulder flexion (wall walk)", "prescription": "3×10 reps", "level": "gentle",
                 "notes": "Use the wall to assist, go to comfortable range only", "is_rag": False},
                {"name": "Scapular retraction (isometric)", "prescription": "3×10 × 5s hold", "level": "gentle",
                 "notes": "Squeeze shoulder blades together gently", "is_rag": False},
                {"name": "Cervical ROM / neck rolls", "prescription": "2×10 each direction", "level": "gentle",
                 "notes": "Pain-free range only, unloads upper traps", "is_rag": False},
                {"name": "Ice / heat protocol", "prescription": "10–15 min every 2–3h", "level": "gentle",
                 "notes": "Ice first 72h; heat after for chronic tightness", "is_rag": False},
            ],
        },
        {
            "phase": 2, "name": "Recovery Phase",
            "duration_label": "Weeks 2–4",
            "goal": "Restore full ROM, begin light rotator cuff loading, re-establish motor control",
            "criteria_to_advance": "Full ROM, activities of daily living pain-free, no rest pain",
            "sessions_required": 3,
            "exercises": [
                {"name": "Band external rotation (side-lying)", "prescription": "3×15 each side", "level": "light",
                 "notes": "Use lightest band, elbow at 90°, small controlled range", "is_rag": False},
                {"name": "Band internal rotation", "prescription": "3×15 each side", "level": "light",
                 "notes": "Anchor band at elbow height", "is_rag": False},
                {"name": "Wall slides (overhead)", "prescription": "3×12 reps", "level": "light",
                 "notes": "Hands on wall, slide up maintaining contact", "is_rag": False},
                {"name": "Prone Y/T/W raises (no weight)", "prescription": "3×10 each position", "level": "light",
                 "notes": "Lie face down, raise arms into Y/T/W shapes", "is_rag": False},
                {"name": "Shoulder CARS (controlled articular rotations)", "prescription": "3×10 each direction", "level": "light",
                 "notes": "Full circumduction, no pain at any point", "is_rag": False},
            ],
        },
        {
            "phase": 3, "name": "Strengthening Phase",
            "duration_label": "Weeks 4–10",
            "goal": "Progressive loading, rotator cuff strength to 80% of contralateral side",
            "criteria_to_advance": "Pain-free pressing overhead, 80%+ strength symmetry, no pain with loaded activities",
            "sessions_required": 4,
            "exercises": [
                {"name": "Face pulls", "prescription": "3×15–20 @ light-moderate", "level": "moderate",
                 "notes": "Elbows high, external rotation at end range", "is_rag": False},
                {"name": "Cable external rotation", "prescription": "3×12–15 each", "level": "moderate",
                 "notes": "Progress load weekly, keep elbow tucked", "is_rag": False},
                {"name": "Dumbbell lateral raise (light)", "prescription": "3×12–15", "level": "moderate",
                 "notes": "Lead with elbow, slight forward lean", "is_rag": False},
                {"name": "DB Arnold press", "prescription": "3×10 @ moderate load", "level": "moderate",
                 "notes": "Full rotation through ROM, stop below pain threshold", "is_rag": False},
                {"name": "Push-up progression (wall → floor)", "prescription": "3×10–15", "level": "moderate",
                 "notes": "Begin at wall, progress to incline, then floor", "is_rag": False},
                {"name": "Band pull-aparts", "prescription": "3×20", "level": "light",
                 "notes": "Maintain tension throughout, arms straight", "is_rag": False},
            ],
        },
        {
            "phase": 4, "name": "Return to Training",
            "duration_label": "Ongoing maintenance",
            "goal": "Full return to barbell pressing, maintain rotator cuff health under competition load",
            "criteria_to_advance": "N/A — maintenance phase",
            "sessions_required": 999,
            "exercises": [
                {"name": "Barbell overhead press (light → build)", "prescription": "Start 50% 1RM, add 5% weekly", "level": "high",
                 "notes": "If pain recurs, drop 20% and rebuild", "is_rag": False},
                {"name": "Rotator cuff maintenance circuit", "prescription": "2×15 each plane (ER/IR/Y/T)", "level": "light",
                 "notes": "Keep as warm-up prehab, always before heavy pressing", "is_rag": False},
                {"name": "Band pull-aparts (maintenance)", "prescription": "3×20 pre-session", "level": "light",
                 "notes": "Non-negotiable prehab for pressing athletes", "is_rag": False},
                {"name": "Face pulls (maintenance)", "prescription": "2×20 end of each session", "level": "light",
                 "notes": "Counteract anterior stress from pressing", "is_rag": False},
            ],
        },
    ],

    # ── KNEE ──────────────────────────────────────────────────────────────────
    "knee": [
        {
            "phase": 1, "name": "Acute Phase",
            "duration_label": "Days 1–10",
            "goal": "Control pain/swelling, protect the joint, restore basic quad activation",
            "criteria_to_advance": "Swelling reduced, able to walk without limp, basic quad control",
            "sessions_required": 3,
            "exercises": [
                {"name": "Quad sets (isometric)", "prescription": "3×10 × 10s hold", "level": "gentle",
                 "notes": "Push knee into floor, squeeze quad, no pain", "is_rag": False},
                {"name": "Ankle pumps (circulation)", "prescription": "3×20 reps", "level": "gentle",
                 "notes": "Seated or lying, improves circulation, reduces swelling", "is_rag": False},
                {"name": "Supine heel slides", "prescription": "3×15 reps", "level": "gentle",
                 "notes": "Slowly bend and straighten knee, go to comfortable range", "is_rag": False},
                {"name": "Short arc quad (SAQ)", "prescription": "3×15 × 2s hold", "level": "gentle",
                 "notes": "Knee at 30° flexion, extend fully", "is_rag": False},
                {"name": "Ice 10–15 min protocol", "prescription": "Every 2–3 hours post-activity", "level": "gentle",
                 "notes": "Protect skin from direct ice contact", "is_rag": False},
            ],
        },
        {
            "phase": 2, "name": "Recovery Phase",
            "duration_label": "Weeks 2–4",
            "goal": "Full ROM, control quad/hamstring imbalance, basic functional movement",
            "criteria_to_advance": "Full ROM, single-leg balance 30s, stairs pain-free",
            "sessions_required": 3,
            "exercises": [
                {"name": "Straight leg raise", "prescription": "3×12–15 each side", "level": "light",
                 "notes": "Slow controlled, quad locked throughout", "is_rag": False},
                {"name": "Mini squats (0–45°)", "prescription": "3×15 reps", "level": "light",
                 "notes": "Weight through heels, knees track over toes", "is_rag": False},
                {"name": "Terminal knee extension (band)", "prescription": "3×20 each side", "level": "light",
                 "notes": "Band behind knee, actively extend last 30°", "is_rag": False},
                {"name": "Hip abduction (side-lying)", "prescription": "3×15 each side", "level": "light",
                 "notes": "Strengthens glutes to protect knee alignment", "is_rag": False},
                {"name": "Single-leg balance", "prescription": "3×30s each side", "level": "light",
                 "notes": "Eyes open first, progress to eyes closed", "is_rag": False},
            ],
        },
        {
            "phase": 3, "name": "Strengthening Phase",
            "duration_label": "Weeks 4–10",
            "goal": "Progressive squatting, eccentric quad loading, return to running prep",
            "criteria_to_advance": "Single-leg squat 10×, pain-free jogging, 90%+ quad strength",
            "sessions_required": 4,
            "exercises": [
                {"name": "Goblet squat (full depth)", "prescription": "3×12–15 @ bodyweight-light load", "level": "moderate",
                 "notes": "Full depth if tolerated, progress weight weekly", "is_rag": False},
                {"name": "Romanian deadlift (RDL)", "prescription": "3×12 @ light-moderate", "level": "moderate",
                 "notes": "Eccentric hamstring loading, protect the knee", "is_rag": False},
                {"name": "Step-up (box)", "prescription": "3×12 each side", "level": "moderate",
                 "notes": "Start 6\" box, progress height, controlled descent", "is_rag": False},
                {"name": "Eccentric leg press (slow lowering)", "prescription": "3×10 @ 4s lowering", "level": "moderate",
                 "notes": "Key for patellar tendinopathy — slow eccentric", "is_rag": False},
                {"name": "Clamshell with resistance band", "prescription": "3×20 each side", "level": "moderate",
                 "notes": "Glute med activation to stabilise knee", "is_rag": False},
                {"name": "Nordic hamstring curl", "prescription": "3×5–8 (eccentric only)", "level": "moderate",
                 "notes": "Start with band-assisted, build to full", "is_rag": False},
            ],
        },
        {
            "phase": 4, "name": "Return to Training",
            "duration_label": "Ongoing maintenance",
            "goal": "Full squat loading, competition prep, maintain knee health under heavy loading",
            "criteria_to_advance": "N/A — maintenance phase",
            "sessions_required": 999,
            "exercises": [
                {"name": "Barbell squat (build from 60% 1RM)", "prescription": "Add 5-10 lbs weekly as tolerated", "level": "high",
                 "notes": "Stop if 4+ pain — back off 20% and rebuild", "is_rag": False},
                {"name": "Terminal knee extension (prehab)", "prescription": "2×20 pre-squat session", "level": "light",
                 "notes": "Keep as mandatory warm-up before lower body sessions", "is_rag": False},
                {"name": "Eccentric single-leg press (maintenance)", "prescription": "2×10 each side", "level": "moderate",
                 "notes": "Maintains patellar tendon health under load", "is_rag": False},
                {"name": "Nordic curl (maintenance)", "prescription": "2×6 per session", "level": "moderate",
                 "notes": "Keep hamstring capacity strong to protect knee", "is_rag": False},
            ],
        },
    ],

    # ── LOWER BACK ────────────────────────────────────────────────────────────
    "lower_back": [
        {
            "phase": 1, "name": "Acute Phase",
            "duration_label": "Days 1–10",
            "goal": "Pain management, reduce muscle guarding, restore safe movement",
            "criteria_to_advance": "Able to sit/stand/walk comfortably, pain < 3/10 at rest",
            "sessions_required": 3,
            "exercises": [
                {"name": "Cat-cow stretch", "prescription": "3×10 reps (slow)", "level": "gentle",
                 "notes": "Go to comfortable range only, breathe throughout", "is_rag": False},
                {"name": "Knee-to-chest stretch", "prescription": "3×30s each side", "level": "gentle",
                 "notes": "Gentle pull, no forcing, feel a comfortable stretch", "is_rag": False},
                {"name": "Supine hip flexor stretch", "prescription": "3×30s each side", "level": "gentle",
                 "notes": "Lying down reduces spinal load", "is_rag": False},
                {"name": "Belly breathing (diaphragmatic)", "prescription": "5 min session", "level": "gentle",
                 "notes": "Reduces lumbar muscle tension via CNS reset", "is_rag": False},
                {"name": "Walking (gentle, flat surface)", "prescription": "10–15 min twice daily", "level": "gentle",
                 "notes": "Best acute LBP exercise — gentle movement beats rest", "is_rag": False},
            ],
        },
        {
            "phase": 2, "name": "Recovery Phase",
            "duration_label": "Weeks 2–4",
            "goal": "Restore lumbar mobility, begin core activation, pain-free daily function",
            "criteria_to_advance": "Forward bend to mid-shin, seated 30+ min comfortable, pain < 2/10",
            "sessions_required": 3,
            "exercises": [
                {"name": "McGill bird-dog", "prescription": "3×6 each side × 10s hold", "level": "light",
                 "notes": "Spine neutral throughout — no rotation or side bending", "is_rag": False},
                {"name": "Dead bug (McGill)", "prescription": "3×8 each side", "level": "light",
                 "notes": "Lower back stays flat against floor, slow controlled", "is_rag": False},
                {"name": "Glute bridge", "prescription": "3×15 × 2s hold at top", "level": "light",
                 "notes": "Activates glutes, reduces lumbar extensor overuse", "is_rag": False},
                {"name": "Side plank (modified — knee down)", "prescription": "3×20s each side", "level": "light",
                 "notes": "Build toward full side plank progressively", "is_rag": False},
                {"name": "Hip flexor lunge stretch", "prescription": "3×30s each side", "level": "light",
                 "notes": "Anterior pelvic tilt reduction — key for LBP", "is_rag": False},
            ],
        },
        {
            "phase": 3, "name": "Strengthening Phase",
            "duration_label": "Weeks 4–10",
            "goal": "Progressive loading of posterior chain, return to deadlifting patterns",
            "criteria_to_advance": "Bodyweight hinge pain-free, hip hinge under load tolerated, 90% daily function",
            "sessions_required": 4,
            "exercises": [
                {"name": "Romanian deadlift (light to moderate)", "prescription": "3×10–12 progressing", "level": "moderate",
                 "notes": "Start with DBs, hip hinge not squat, brace hard", "is_rag": False},
                {"name": "McGill Big 3 (curl-up, bird-dog, side plank)", "prescription": "As prescribed in Big 3 protocol", "level": "moderate",
                 "notes": "Stuart McGill's core stability circuit", "is_rag": False},
                {"name": "Goblet squat (hip dominant)", "prescription": "3×10–12", "level": "moderate",
                 "notes": "Ensures hip crease below knee without lumbar flex", "is_rag": False},
                {"name": "Hip hinge with band (resistance)", "prescription": "3×15", "level": "moderate",
                 "notes": "Band at hip crease, posterior loading pattern", "is_rag": False},
                {"name": "Farmer's carry (loaded)", "prescription": "3×30m @ moderate load", "level": "moderate",
                 "notes": "Core stability under load — crucial for deadlift return", "is_rag": False},
                {"name": "Back extensions (45° bench)", "prescription": "3×12–15 @ BW first", "level": "moderate",
                 "notes": "Erector spinae endurance training", "is_rag": False},
            ],
        },
        {
            "phase": 4, "name": "Return to Training",
            "duration_label": "Ongoing maintenance",
            "goal": "Full deadlift return, competition loading, maintain disc health under heavy pulls",
            "criteria_to_advance": "N/A — maintenance phase",
            "sessions_required": 999,
            "exercises": [
                {"name": "Barbell deadlift (build from 60% 1RM)", "prescription": "Add 10 lbs weekly as tolerated", "level": "high",
                 "notes": "Brace hard before every rep — belt when appropriate", "is_rag": False},
                {"name": "McGill bird-dog (maintenance)", "prescription": "2×6 each side pre-session", "level": "light",
                 "notes": "Keep as daily movement screen", "is_rag": False},
                {"name": "Glute bridge / hip thrust (maintenance)", "prescription": "3×15 pre-deadlift sessions", "level": "light",
                 "notes": "Activates glutes, reduces lumbar extensor dependence", "is_rag": False},
                {"name": "Hamstring curl (maintenance)", "prescription": "2×15 per session", "level": "moderate",
                 "notes": "Eccentric hamstring capacity protects lumbar disc", "is_rag": False},
            ],
        },
    ],

    # ── ELBOW ─────────────────────────────────────────────────────────────────
    "elbow": [
        {
            "phase": 1, "name": "Acute Phase",
            "duration_label": "Days 1–10",
            "goal": "Reduce tendon irritation, protect from further loading, restore pain-free ROM",
            "criteria_to_advance": "No pain at rest, able to grip without pain, basic ROM restored",
            "sessions_required": 3,
            "exercises": [
                {"name": "Forearm flexor stretch", "prescription": "3×30s each arm", "level": "gentle",
                 "notes": "Wrist back, elbow straight — hold at first point of tension only", "is_rag": False},
                {"name": "Forearm extensor stretch", "prescription": "3×30s each arm", "level": "gentle",
                 "notes": "Wrist forward, elbow straight", "is_rag": False},
                {"name": "Wrist circles (full ROM)", "prescription": "2×15 each direction", "level": "gentle",
                 "notes": "Pain-free range only", "is_rag": False},
                {"name": "Gentle massage — forearm belly", "prescription": "2–3 min each arm", "level": "gentle",
                 "notes": "Reduces muscle tension feeding elbow pain", "is_rag": False},
            ],
        },
        {
            "phase": 2, "name": "Recovery Phase",
            "duration_label": "Weeks 2–4",
            "goal": "Restore full wrist/elbow ROM, begin eccentric tendon loading",
            "criteria_to_advance": "Full ROM, grip pain-free, can carry objects without symptoms",
            "sessions_required": 3,
            "exercises": [
                {"name": "Eccentric wrist extension (tennis elbow)", "prescription": "3×15 @ light weight", "level": "light",
                 "notes": "Use good hand to help with concentric, resist with injured", "is_rag": False},
                {"name": "Eccentric wrist flexion (golfer's elbow)", "prescription": "3×15 @ light weight", "level": "light",
                 "notes": "Same principle — eccentric only, slow 3-4s lowering", "is_rag": False},
                {"name": "Wrist supination / pronation", "prescription": "3×15 each direction", "level": "light",
                 "notes": "Light weight, controlled, full range", "is_rag": False},
                {"name": "Grip strengthener (light)", "prescription": "3×15 reps @ light", "level": "light",
                 "notes": "Build tendon tolerance for grip-loading sports", "is_rag": False},
            ],
        },
        {
            "phase": 3, "name": "Strengthening Phase",
            "duration_label": "Weeks 4–8",
            "goal": "Full eccentric loading capacity, return to barbell gripping",
            "criteria_to_advance": "Pain-free barbell grip for 3+ sets, no symptoms 24h post-session",
            "sessions_required": 4,
            "exercises": [
                {"name": "Dumbbell wrist curl (full range)", "prescription": "3×12–15 progressing", "level": "moderate",
                 "notes": "Full extension at bottom, pause, full flexion at top", "is_rag": False},
                {"name": "Reverse curl", "prescription": "3×12 @ moderate load", "level": "moderate",
                 "notes": "Pronated grip curls — targets forearm extensors", "is_rag": False},
                {"name": "Farmer's carry (loaded grip)", "prescription": "3×30m @ moderate", "level": "moderate",
                 "notes": "Heavy gripping under load — rebuilds tendon capacity", "is_rag": False},
                {"name": "Towel pull-up (thick grip)", "prescription": "3×5–8", "level": "moderate",
                 "notes": "Thick grip reduces elbow stress vs. bar", "is_rag": False},
            ],
        },
        {
            "phase": 4, "name": "Return to Training",
            "duration_label": "Ongoing maintenance",
            "goal": "Full barbell return, competition training, maintain elbow health",
            "criteria_to_advance": "N/A — maintenance phase",
            "sessions_required": 999,
            "exercises": [
                {"name": "Barbell training (resume normal program)", "prescription": "Monitor elbow 24h after sessions", "level": "high",
                 "notes": "Stop if pain > 3/10 during or 24h post-session", "is_rag": False},
                {"name": "Eccentric wrist work (maintenance)", "prescription": "2×15 pre-session", "level": "light",
                 "notes": "Keep as pre-session prehab for all pressing days", "is_rag": False},
                {"name": "Forearm stretching (maintenance)", "prescription": "2×30s each arm post-session", "level": "gentle",
                 "notes": "Reduces cumulative tendon irritation", "is_rag": False},
            ],
        },
    ],

    # ── HIP ───────────────────────────────────────────────────────────────────
    "hip": [
        {
            "phase": 1, "name": "Acute Phase",
            "duration_label": "Days 1–7",
            "goal": "Reduce pain/guarding, protect hip from impingement, restore gentle ROM",
            "criteria_to_advance": "Comfortable walking, no pain at rest, basic hip flexion restored",
            "sessions_required": 3,
            "exercises": [
                {"name": "Hip pendulum swings (standing)", "prescription": "3×20 forward/back", "level": "gentle",
                 "notes": "Hold support, let leg swing freely", "is_rag": False},
                {"name": "Supine hip internal rotation stretch", "prescription": "3×30s each side", "level": "gentle",
                 "notes": "Lying down, knees bent, gently lower knees inward", "is_rag": False},
                {"name": "Figure-4 stretch (piriformis)", "prescription": "3×30s each side", "level": "gentle",
                 "notes": "Back lying, cross ankle over opposite knee", "is_rag": False},
                {"name": "Gentle walking (flat surface)", "prescription": "10–20 min twice daily", "level": "gentle",
                 "notes": "Best acute hip exercise — controlled, full stride if able", "is_rag": False},
            ],
        },
        {
            "phase": 2, "name": "Recovery Phase",
            "duration_label": "Weeks 2–4",
            "goal": "Restore full hip ROM, reactivate glutes and hip stabilisers",
            "criteria_to_advance": "Full hip ROM, pain-free single-leg stance, glutes activate on demand",
            "sessions_required": 3,
            "exercises": [
                {"name": "Clamshell (band)", "prescription": "3×20 each side", "level": "light",
                 "notes": "Glute med activation — critical for hip stability", "is_rag": False},
                {"name": "Hip circle (fire hydrant)", "prescription": "3×15 each side", "level": "light",
                 "notes": "On hands and knees, rotate hip in full circle", "is_rag": False},
                {"name": "Hip 90/90 stretch (internal + external)", "prescription": "3×60s each position", "level": "light",
                 "notes": "Best hip capsule mobilisation", "is_rag": False},
                {"name": "Side-lying hip abduction", "prescription": "3×15 each side", "level": "light",
                 "notes": "Straight leg, heel leads, toes face forward", "is_rag": False},
                {"name": "Glute bridge", "prescription": "3×15 × 2s hold", "level": "light",
                 "notes": "Squeeze glutes hard at top", "is_rag": False},
            ],
        },
        {
            "phase": 3, "name": "Strengthening Phase",
            "duration_label": "Weeks 4–10",
            "goal": "Progressive hip loading, return to bilateral squatting and pulling",
            "criteria_to_advance": "Single-leg squat 10× pain-free, hip flexion under load tolerated",
            "sessions_required": 4,
            "exercises": [
                {"name": "Hip thrust (barbell)", "prescription": "3×12–15 progressing", "level": "moderate",
                 "notes": "Full hip extension, drive through heels", "is_rag": False},
                {"name": "Bulgarian split squat", "prescription": "3×10 each side", "level": "moderate",
                 "notes": "Rear-foot elevation, front knee tracks over toe", "is_rag": False},
                {"name": "Copenhagen plank", "prescription": "3×20s each side", "level": "moderate",
                 "notes": "Hip adductor strength — key for groin/SI stability", "is_rag": False},
                {"name": "Romanian deadlift (hip hinge focus)", "prescription": "3×12 @ moderate", "level": "moderate",
                 "notes": "Hip crease behind ankle at bottom", "is_rag": False},
                {"name": "Cable pull-through", "prescription": "3×15", "level": "moderate",
                 "notes": "Hip dominant posterior chain pattern", "is_rag": False},
            ],
        },
        {
            "phase": 4, "name": "Return to Training",
            "duration_label": "Ongoing maintenance",
            "goal": "Full squat/deadlift return with maintained hip health",
            "criteria_to_advance": "N/A — maintenance phase",
            "sessions_required": 999,
            "exercises": [
                {"name": "Barbell squat / deadlift (resume)", "prescription": "Build from 60% over 4 weeks", "level": "high",
                 "notes": "Monitor hip after each session for 24h", "is_rag": False},
                {"name": "Hip 90/90 mobility (maintenance)", "prescription": "3×60s pre-session", "level": "gentle",
                 "notes": "Non-negotiable hip mobility for squat health", "is_rag": False},
                {"name": "Clamshell + Copenhagen (maintenance)", "prescription": "2×15 each", "level": "light",
                 "notes": "Hip stabiliser maintenance — keep these in warm-up", "is_rag": False},
            ],
        },
    ],

    # ── SI JOINT ──────────────────────────────────────────────────────────────
    "si_joint": [
        {
            "phase": 1, "name": "Acute Phase",
            "duration_label": "Days 1–10",
            "goal": "Reduce SI joint pain, protect from asymmetric loading, restore symmetric walking",
            "criteria_to_advance": "Pain < 3/10 walking, symmetric gait, sleeping without pain",
            "sessions_required": 3,
            "exercises": [
                {"name": "Supine knee rolling (rotation)", "prescription": "3×10 each side", "level": "gentle",
                 "notes": "Lying, knees bent, gently drop both knees to each side", "is_rag": False},
                {"name": "Sacral self-mobilisation (figure-4)", "prescription": "3×30s each side", "level": "gentle",
                 "notes": "Cross ankle over knee, gently press knee away", "is_rag": False},
                {"name": "Transverse abdominis activation", "prescription": "3×10 × 10s hold", "level": "gentle",
                 "notes": "Draw navel in gently (20–30% max), breathe normally", "is_rag": False},
                {"name": "Walking (symmetric, slow pace)", "prescription": "10–15 min twice daily", "level": "gentle",
                 "notes": "Equal step length both sides, avoid limping", "is_rag": False},
            ],
        },
        {
            "phase": 2, "name": "Recovery Phase",
            "duration_label": "Weeks 2–4",
            "goal": "Stabilise SI joint, activate deep core and glutes, pain-free single-leg activities",
            "criteria_to_advance": "Single-leg stance 30s, pain-free climbing stairs, daily activities comfortable",
            "sessions_required": 3,
            "exercises": [
                {"name": "Dead bug (core stability)", "prescription": "3×8 each side", "level": "light",
                 "notes": "Lower back flat throughout, opposite arm/leg", "is_rag": False},
                {"name": "Clam (band)", "prescription": "3×20 each side", "level": "light",
                 "notes": "Glute med stabiliser for pelvis/SI", "is_rag": False},
                {"name": "Bird-dog", "prescription": "3×8 each side × 8s hold", "level": "light",
                 "notes": "No rotation in lumbar spine", "is_rag": False},
                {"name": "Standing hip abduction (band)", "prescription": "3×15 each side", "level": "light",
                 "notes": "Minimal trunk shift, slow and controlled", "is_rag": False},
                {"name": "Glute bridge (single-leg progress)", "prescription": "3×12 each side", "level": "light",
                 "notes": "Single-leg adds SI joint stabilisation challenge", "is_rag": False},
            ],
        },
        {
            "phase": 3, "name": "Strengthening Phase",
            "duration_label": "Weeks 4–10",
            "goal": "Progressive bilateral loading, return to squatting and deadlifting patterns",
            "criteria_to_advance": "Bodyweight squat 15× pain-free, hip thrust under load tolerated",
            "sessions_required": 4,
            "exercises": [
                {"name": "Goblet squat (full depth)", "prescription": "3×12–15", "level": "moderate",
                 "notes": "Symmetric loading, knees track over toes", "is_rag": False},
                {"name": "Hip thrust (bilateral)", "prescription": "3×12–15 progressing", "level": "moderate",
                 "notes": "Avoids shear forces on SI joint vs. deadlift", "is_rag": False},
                {"name": "McGill Big 3 (daily)", "prescription": "As protocol — curl-up, bird-dog, side plank", "level": "moderate",
                 "notes": "SI joint stability requires strong deep core", "is_rag": False},
                {"name": "Split squat (front foot elevated)", "prescription": "3×10 each side", "level": "moderate",
                 "notes": "Single-leg loading with SI stabilisation demand", "is_rag": False},
                {"name": "Pallof press", "prescription": "3×12 each side", "level": "moderate",
                 "notes": "Anti-rotation core strength — critical for SI joint", "is_rag": False},
            ],
        },
        {
            "phase": 4, "name": "Return to Training",
            "duration_label": "Ongoing maintenance",
            "goal": "Full training return with consistent SI joint stability",
            "criteria_to_advance": "N/A — maintenance phase",
            "sessions_required": 999,
            "exercises": [
                {"name": "Barbell training (resume normal program)", "prescription": "Build load over 3–4 weeks", "level": "high",
                 "notes": "Avoid single-leg asymmetric loads until Phase 4 is stable", "is_rag": False},
                {"name": "McGill Big 3 (maintenance)", "prescription": "2× per week as warm-up", "level": "light",
                 "notes": "Permanent maintenance routine for SI health", "is_rag": False},
                {"name": "Hip 90/90 mobility (maintenance)", "prescription": "3×60s pre-session", "level": "gentle",
                 "notes": "Reduces SI joint capsular restriction under load", "is_rag": False},
            ],
        },
    ],

    # ── GENERAL (fallback for any other injury type) ──────────────────────────
    "general": [
        {
            "phase": 1, "name": "Acute Phase",
            "duration_label": "Days 1–7",
            "goal": "Protect the injured area, manage pain, maintain unaffected movement",
            "criteria_to_advance": "Pain < 3/10 at rest, basic movement restored in injured area",
            "sessions_required": 3,
            "exercises": [
                {"name": "Gentle ROM circles (affected joint)", "prescription": "3×10 each direction", "level": "gentle",
                 "notes": "Pain-free range only, no forcing", "is_rag": False},
                {"name": "Ice protocol", "prescription": "10–15 min every 2–3 hours", "level": "gentle",
                 "notes": "Acute injury management standard", "is_rag": False},
                {"name": "Isometric contraction (affected muscle)", "prescription": "3×10 × 5s hold", "level": "gentle",
                 "notes": "Light contraction only, no pain", "is_rag": False},
                {"name": "Breathing / relaxation", "prescription": "5 min daily", "level": "gentle",
                 "notes": "Reduces muscle guarding and pain sensitisation", "is_rag": False},
            ],
        },
        {
            "phase": 2, "name": "Recovery Phase",
            "duration_label": "Weeks 2–3",
            "goal": "Restore full ROM, begin light functional loading, pain-free daily activities",
            "criteria_to_advance": "Full ROM, basic loading pain-free, functional movement restored",
            "sessions_required": 3,
            "exercises": [
                {"name": "Controlled ROM exercises", "prescription": "3×15 full available range", "level": "light",
                 "notes": "Progress range daily if pain allows", "is_rag": False},
                {"name": "Light resistance (band or bodyweight)", "prescription": "3×12–15 @ low effort", "level": "light",
                 "notes": "Light loading stimulates tissue healing", "is_rag": False},
                {"name": "Stability drills (affected area)", "prescription": "3×30s", "level": "light",
                 "notes": "Proprioception and motor control retraining", "is_rag": False},
            ],
        },
        {
            "phase": 3, "name": "Strengthening Phase",
            "duration_label": "Weeks 3–8",
            "goal": "Progressive loading to 80% strength capacity, functional movement patterns",
            "criteria_to_advance": "80%+ symmetry in strength, pain-free functional testing",
            "sessions_required": 4,
            "exercises": [
                {"name": "Progressive resistance exercises (affected area)", "prescription": "3×10 progressing weekly", "level": "moderate",
                 "notes": "Increase load by 5–10% when all reps are clean", "is_rag": False},
                {"name": "Compound movement (modified for injury)", "prescription": "3×8–12 @ 60% normal load", "level": "moderate",
                 "notes": "Return to movement patterns with reduced intensity", "is_rag": False},
                {"name": "Balance / proprioception drills", "prescription": "3×30s progressively harder", "level": "moderate",
                 "notes": "Neural control restoration", "is_rag": False},
            ],
        },
        {
            "phase": 4, "name": "Return to Training",
            "duration_label": "Ongoing maintenance",
            "goal": "Full return to competition training with injury prevention focus",
            "criteria_to_advance": "N/A — maintenance phase",
            "sessions_required": 999,
            "exercises": [
                {"name": "Full training program (resume)", "prescription": "Build from 70% over 3–4 weeks", "level": "high",
                 "notes": "Monitor for symptom recurrence 24h after sessions", "is_rag": False},
                {"name": "Maintenance prehab circuit", "prescription": "2×15 key exercises pre-session", "level": "light",
                 "notes": "Stays permanently in warm-up to prevent recurrence", "is_rag": False},
            ],
        },
    ],
}


# ── Alias mapping (user-friendly names → protocol keys) ──────────────────────
INJURY_ALIASES: dict[str, str] = {
    "shoulder":          "shoulder",
    "rotator cuff":      "shoulder",
    "shoulder pain":     "shoulder",
    "shoulder impingement": "shoulder",

    "knee":              "knee",
    "knee pain":         "knee",
    "patellar":          "knee",
    "patella":           "knee",
    "acl":               "knee",
    "it band":           "knee",

    "lower back":        "lower_back",
    "low back":          "lower_back",
    "lower back pain":   "lower_back",
    "lumbar":            "lower_back",
    "disc":              "lower_back",
    "back pain":         "lower_back",

    "elbow":             "elbow",
    "tennis elbow":      "elbow",
    "golfer's elbow":    "elbow",
    "lateral epicondylitis": "elbow",
    "medial epicondylitis":  "elbow",

    "hip":               "hip",
    "hip pain":          "hip",
    "hip flexor":        "hip",
    "hip impingement":   "hip",
    "piriformis":        "hip",

    "si joint":          "si_joint",
    "si":                "si_joint",
    "sacroiliac":        "si_joint",
    "sacrum":            "si_joint",
}


def resolve_injury_key(injury_input: str) -> str:
    """Resolve a user's injury description to a protocol key."""
    normalized = injury_input.lower().strip()
    return INJURY_ALIASES.get(normalized, "general")


def get_protocol(injury_key: str) -> list:
    """Get all 4 phases for an injury type. Falls back to 'general'."""
    return REHAB_PROTOCOLS.get(injury_key, REHAB_PROTOCOLS["general"])


def get_phase(injury_key: str, phase_number: int) -> dict:
    """Get a specific phase (1-4) from a protocol."""
    phases = get_protocol(injury_key)
    for phase in phases:
        if phase["phase"] == phase_number:
            return dict(phase)
    return dict(phases[0])  # fallback to phase 1
