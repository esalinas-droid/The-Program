"""
test_7b_extraction.py — Verify build_annual_plan LLM extraction on all 5 7A test formats.
Run directly: python test_7b_extraction.py
"""
import asyncio
import json
import os
import sys
import time

sys.path.insert(0, "/app/backend")

os.environ.setdefault("EMERGENT_LLM_KEY", "sk-emergent-fAd8f9eB10a2fA81f7")

from services.plan_extractor import extract_plan_from_text, build_annual_plan

# ── Test parsedTexts (real outputs from 7A test run) ──────────────────────────
MOCK_PROFILE = {
    "experience":       "intermediate",
    "trainingDaysCount": 4,
    "injuryFlags":      [],
    "gymTypes":         ["barbell_gym"],
    "units":            "lbs",
}
MOCK_PRS = [
    {"exercise": "Back Squat",  "weight": 315, "reps": 1},
    {"exercise": "Bench Press", "weight": 225, "reps": 1},
    {"exercise": "Deadlift",    "weight": 405, "reps": 1},
]

TEST_FILES = {
    "TXT": """STRENGTH BLOCK — WEEK 1
========================
Day 1 (Monday): Lower — Squat Focus
  - Back Squat: 5x5 @ 80% 1RM
  - Romanian Deadlift: 4x8 @ 65%
  - Leg Press: 3x12
  - Calf Raises: 4x15

Day 2 (Wednesday): Upper — Push
  - Bench Press: 5x5 @ 80% 1RM
  - Overhead Press: 4x6 @ 70%
  - Incline DB Press: 3x10
  - Tricep Pushdown: 3x12

Day 3 (Friday): Full Body — Deadlift Focus
  - Deadlift: 5x3 @ 85% 1RM
  - Pull-Ups: 4x6
  - Barbell Row: 4x8
  - Face Pulls: 3x15

Notes: Rest 90-120s between working sets. Deload on week 4.""",

    "DOCX": """12-Week Powerlifting Program
Week 1 — Accumulation Phase
Primary Goal: Build work capacity and technique consistency.
Session A — Squat + Accessories
Exercise	Sets	Reps	Intensity
Back Squat	4	6	75% 1RM
Front Squat	2	4	65% 1RM
Bulgarian Split Squat	3	8/leg	RPE 7
Coach note: Pause 2 seconds at bottom on all squat variations.""",

    "PDF (text)": """Hypertrophy Program - 8 Weeks
Designed by Coach Marcus | RPE-Based Training
Phase 1: Foundation (Weeks 1-4)
Training Days: Monday, Wednesday, Friday
Session Length: 60-75 minutes

DAY 1 - CHEST & TRICEPS
  Flat Barbell Bench Press - 4x8-10 @ RPE 7
  Incline DB Press - 3x10-12 @ RPE 7
  Cable Chest Fly - 3x12-15 @ RPE 6
  Tricep Dips - 3x10-12 bodyweight
  Overhead Tricep Extension - 3x12 @ RPE 6

DAY 2 - BACK & BICEPS
  Weighted Pull-Ups - 4x6-8 @ RPE 8
  Barbell Row - 4x8 @ RPE 7
  Seated Cable Row - 3x10-12 @ RPE 6
  Face Pulls - 3x15 @ RPE 5
  Barbell Curl - 3x10-12 @ RPE 7
DAY 3 - LEGS & SHOULDERS
  Back Squat - 4x6-8 @ RPE 8
  Romanian Deadlift - 3x10 @ RPE 7
  Leg Press - 3x12-15 @ RPE 6
  Overhead Press - 4x6-8 @ RPE 8
  Lateral Raises - 4x15-20 @ RPE 6

PROGRESSION MODEL:
  - Add 2.5kg when you hit top of rep range at RPE < 7
  - Deload week 5: reduce volume by 40%, keep intensity

NUTRITION TARGETS (per training day):
  Protein: 0.8-1g per lb bodyweight
  Calories: maintenance + 200-300 surplus
  Pre-workout: 40-60g carbs 60 min before""",

    "JPG": """WORKOUT CARD - UPPER BODY A
Exercise: Bench Press
Sets: 4 | Reps: 6-8 | RPE: 8
Exercise: Overhead Press
Sets: 3 | Reps: 8-10 | RPE: 7
Exercise: Dumbbell Row
Sets: 4 | Reps: 10-12 | RPE: 7
Notes: Rest 2 min between compound sets
Target: 3000 calories, 200g protein""",

    "PDF (scan)": """SCANNED TRAINING LOG - WEEK 3
Monday: Squat Day
Warm-up: 5 min bike + mobility work
Back Squat: 140kg x 5 x 5
Pause Squat: 100kg x 3 x 3
Leg Press: 200kg x 4 x 10
Wednesday: Bench Day
Bench Press: 102.5kg x 4 x 5
DB Incline: 36kg x 3 x 10
Cable Row: 70kg x 4 x 12
Notes: Feeling strong, add 2.5kg next week""",
}


async def test_format(fmt_name: str, text: str) -> dict:
    print(f"\n{'='*60}")
    print(f"  TESTING: {fmt_name}")
    print(f"  Input chars: {len(text)}")
    print("="*60)

    t_start = time.time()

    try:
        result = await extract_plan_from_text(
            parsed_text  = text,
            profile      = MOCK_PROFILE,
            prs          = MOCK_PRS,
            emergent_key = os.environ["EMERGENT_LLM_KEY"],
        )
        latency   = result["latency_seconds"]
        cost      = result["approx_cost_usd"]
        extracted = result["extracted"]
        confidence = extracted.get("confidence", {})

        print(f"  Latency:     {latency:.1f}s")
        print(f"  Approx cost: ${cost:.4f}")
        print(f"  Input chars: {result['input_chars']}, Output chars: {result['output_chars']}")
        print(f"\n  confidence.summary:")
        print(f"    {confidence.get('summary', '(none)')}")
        print(f"  confidence.high: {confidence.get('high', [])}")
        print(f"  confidence.low:  {confidence.get('low', [])}")
        print(f"  skeleton_mode:   {confidence.get('couldn_extract_sessions', False)}")

        print(f"\n  Extracted plan structure:")
        print(f"    name:               {extracted.get('name')}")
        print(f"    totalWeeks:         {extracted.get('totalWeeks')}")
        print(f"    trainingDaysPerWeek:{extracted.get('trainingDaysPerWeek')}")
        print(f"    phases:             {[(p.get('name'), p.get('weeks')) for p in extracted.get('phases', [])]}")
        print(f"    deloadWeeks:        {extracted.get('deloadWeeks')}")
        print(f"    sessionTemplates:   {[(t.get('templateId'), t.get('name'), len(t.get('exercises',[]))) for t in extracted.get('sessionTemplates', [])]}")
        print(f"    weeklyRotation:     {extracted.get('weeklyRotation')}")

        # Build the annual plan
        plan = build_annual_plan(extracted, "test-user", "test-doc")
        total_sessions = sum(
            len(wk.get("sessions", []))
            for ph in plan.get("phases", [])
            for bl in ph.get("blocks", [])
            for wk in bl.get("weeks", [])
        )
        total_exercises = sum(
            len(sess.get("exercises", []))
            for ph in plan.get("phases", [])
            for bl in ph.get("blocks", [])
            for wk in bl.get("weeks", [])
            for sess in wk.get("sessions", [])
        )
        print(f"\n  Generated AnnualPlan:")
        print(f"    planId:          {plan.get('planId', '')[:12]}")
        print(f"    phases:          {len(plan.get('phases', []))}")
        print(f"    total sessions:  {total_sessions}")
        print(f"    total exercises: {total_exercises}")
        print(f"    sourceDocumentId:{plan.get('sourceDocumentId')}")

        # Week 1 preview
        w1_sessions = []
        if plan.get("phases"):
            ph = plan["phases"][0]
            if ph.get("blocks"):
                bl = ph["blocks"][0]
                if bl.get("weeks"):
                    w1_sessions = bl["weeks"][0].get("sessions", [])
        print(f"\n  WEEK 1 SESSIONS:")
        for sess in w1_sessions[:4]:
            exes = [e.get("name") for e in sess.get("exercises", [])]
            print(f"    Day {sess.get('dayNumber')}: {sess.get('objective')} — {exes}")

        return {"format": fmt_name, "status": "PASS", "latency": latency, "cost": cost, "skeleton": confidence.get("couldn_extract_sessions", False)}

    except Exception as exc:
        print(f"  ERROR: {exc}")
        import traceback; traceback.print_exc()
        return {"format": fmt_name, "status": "FAIL", "error": str(exc)}


async def main():
    results = []
    for fmt_name, text in TEST_FILES.items():
        result = await test_format(fmt_name, text)
        results.append(result)

    print(f"\n\n{'='*60}")
    print("  SUMMARY")
    print("="*60)
    total_cost = 0
    for r in results:
        status = r["status"]
        icon = "✅" if status == "PASS" else "❌"
        extras = ""
        if status == "PASS":
            extras = f"  latency={r['latency']:.1f}s  cost=${r['cost']:.4f}  skeleton={r['skeleton']}"
        else:
            extras = f"  error={r.get('error', '')[:80]}"
        print(f"  {icon}  {r['format']}: {status}{extras}")
        if status == "PASS":
            total_cost += r.get("cost", 0)
    print(f"\n  Total approx cost for 5 extractions: ${total_cost:.4f}")
    print("="*60)


asyncio.run(main())
