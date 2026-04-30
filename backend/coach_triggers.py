"""
coach_triggers.py — Proactive coaching trigger engine.

Each trigger:
  - check(db, userId, profile) → (active: bool, payload: dict)
  - priority: higher = surfaced first
  - card_text_fn(payload) → str
  - cta: str
  - seed_prompt_fn(payload) → str

All triggers return False for free-mode users except pain_flag_recent and pr_streak
(which don't depend on a training plan).
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Any

# ── helpers ──────────────────────────────────────────────────────────────────
def _days_ago_str(n: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=n)).strftime("%Y-%m-%d")

def _today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")

WEEKDAY_NAMES = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]


# ═════════════════════════════════════════════════════════════════════════════
# TRIGGER 1 — missed_two_sessions  (priority 80)
# ═════════════════════════════════════════════════════════════════════════════
async def check_missed_two_sessions(db: Any, userId: str, profile: dict) -> tuple[bool, dict]:
    """User has missed 2+ expected training days in the last 7 days."""
    preferred = [d.lower() for d in (profile.get("preferredDays") or [])]
    if not preferred:
        return False, {}

    today   = datetime.now(timezone.utc).date()
    cutoff  = today - timedelta(days=7)

    # Build the set of expected training dates in the window (exclude today — not yet due)
    expected_dates: set[str] = set()
    for offset in range(1, 8):   # 1..7 days ago (all in the past)
        d = today - timedelta(days=offset)
        if WEEKDAY_NAMES[d.weekday()] in preferred:
            expected_dates.add(d.strftime("%Y-%m-%d"))

    if not expected_dates:
        return False, {}

    # Dates where user actually logged something
    logged = set(await db.log.distinct(
        "date",
        {"userId": userId, "date": {"$gte": cutoff.strftime("%Y-%m-%d"), "$lte": today.strftime("%Y-%m-%d")}},
    ))

    missed = expected_dates - logged
    missed_count = len(missed)
    if missed_count >= 2:
        return True, {"missed_count": missed_count}
    return False, {}


# ═════════════════════════════════════════════════════════════════════════════
# TRIGGER 2 — volume_spike  (priority 60)
# ═════════════════════════════════════════════════════════════════════════════
async def check_volume_spike(db: Any, userId: str, profile: dict) -> tuple[bool, dict]:
    """Total volume this week is 30%+ above the 4-week trailing average."""
    today = _today_str()
    week_start = _days_ago_str(7)
    four_weeks_start = _days_ago_str(35)

    async def _volume(start: str, end: str) -> float:
        docs = await db.log.find(
            {"userId": userId, "date": {"$gte": start, "$lte": end}}
        ).to_list(2000)
        return sum(
            (d.get("weight", 0) or 0) * (d.get("reps", 0) or 0)
            for d in docs
        )

    current_vol = await _volume(week_start, today)
    prev_vol_total = await _volume(four_weeks_start, week_start)
    prev_weekly_avg = prev_vol_total / 4.0 if prev_vol_total > 0 else 0

    if prev_weekly_avg < 100:   # not enough historical volume to compare meaningfully
        return False, {}

    if current_vol > prev_weekly_avg * 1.30:
        pct = round((current_vol / prev_weekly_avg - 1) * 100)
        return True, {"pct": pct, "current_vol": round(current_vol), "avg_vol": round(prev_weekly_avg)}
    return False, {}


# ═════════════════════════════════════════════════════════════════════════════
# TRIGGER 3 — pain_flag_recent  (priority 90  — fires for ALL users)
# ═════════════════════════════════════════════════════════════════════════════
async def check_pain_flag_recent(db: Any, userId: str, profile: dict) -> tuple[bool, dict]:
    """User logged a pain report in the last 3 days."""
    three_days = _days_ago_str(3)
    docs = await db.pain_reports.find(
        {"userId": userId, "date": {"$gte": three_days}}
    ).sort("date", -1).limit(5).to_list(5)

    if not docs:
        return False, {}

    # Collect unique body parts from recent reports
    body_parts: list[str] = []
    for d in docs:
        bp = d.get("bodyPart") or d.get("area") or d.get("location") or ""
        if bp and bp not in body_parts:
            body_parts.append(bp)

    return True, {"body_parts": body_parts[:3], "report_count": len(docs)}


# ═════════════════════════════════════════════════════════════════════════════
# TRIGGER 4 — rpe_climb  (priority 50)
# ═════════════════════════════════════════════════════════════════════════════
async def check_rpe_climb(db: Any, userId: str, profile: dict) -> tuple[bool, dict]:
    """Average RPE of last 3 sessions is 9.0+ and 0.5+ above the previous 3."""
    ratings = await db.session_ratings.find(
        {"userId": userId}
    ).sort("createdAt", -1).limit(6).to_list(6)

    if len(ratings) < 4:
        return False, {}

    recent_rpes  = [r.get("rpe", 0) for r in ratings[:3]]
    previous_rpes = [r.get("rpe", 0) for r in ratings[3:6]]

    if not recent_rpes or not previous_rpes:
        return False, {}

    avg_recent   = sum(recent_rpes)  / len(recent_rpes)
    avg_previous = sum(previous_rpes) / len(previous_rpes)

    if avg_recent >= 9.0 and (avg_recent - avg_previous) >= 0.5:
        return True, {
            "avg_recent": round(avg_recent, 1),
            "avg_previous": round(avg_previous, 1),
        }
    return False, {}


# ═════════════════════════════════════════════════════════════════════════════
# TRIGGER 5 — deload_due  (priority 40)
# ═════════════════════════════════════════════════════════════════════════════
async def check_deload_due(db: Any, userId: str, profile: dict) -> tuple[bool, dict]:
    """User is in week 4+ of a block with no recovery week taken in 5 weeks."""
    current_week = profile.get("currentWeek", 1)
    if current_week < 4:
        return False, {}

    # Check if a deload was recommended/taken in the last 5 weeks
    five_weeks = _days_ago_str(35)
    recent_deload = await db.deload_history.find_one(
        {"userId": userId, "date": {"$gte": five_weeks}}
    )
    if recent_deload:
        return False, {}

    return True, {"current_week": current_week}


# ═════════════════════════════════════════════════════════════════════════════
# TRIGGER 6 — pr_streak  (priority 20  — fires for ALL users)
# ═════════════════════════════════════════════════════════════════════════════
async def check_pr_streak(db: Any, userId: str, profile: dict) -> tuple[bool, dict]:
    """User hit 2+ PRs (new best e1rm per exercise) in the last 7 days."""
    seven_days = _days_ago_str(7)
    today = _today_str()

    # Recent logs
    recent_docs = await db.log.find(
        {"userId": userId, "date": {"$gte": seven_days, "$lte": today}, "e1rm": {"$gt": 0}}
    ).to_list(500)

    if not recent_docs:
        return False, {}

    # Best e1rm per exercise in recent window
    recent_bests: dict[str, float] = {}
    for d in recent_docs:
        ex = d.get("exercise", "")
        e  = d.get("e1rm", 0)
        if ex and e > recent_bests.get(ex, 0):
            recent_bests[ex] = e

    pr_exercises: list[str] = []
    for exercise, new_best in recent_bests.items():
        # Historical best before the recent window
        hist_doc = await db.log.find_one(
            {"userId": userId, "exercise": exercise, "date": {"$lt": seven_days}},
            sort=[("e1rm", -1)],
        )
        old_best = hist_doc.get("e1rm", 0) if hist_doc else 0
        if new_best > old_best:
            pr_exercises.append(exercise)

    if len(pr_exercises) >= 2:
        return True, {"pr_count": len(pr_exercises), "pr_exercises": pr_exercises[:3]}
    return False, {}


# ═════════════════════════════════════════════════════════════════════════════
# TRIGGER REGISTRY
# ═════════════════════════════════════════════════════════════════════════════
TRIGGERS = [
    {
        "name":     "pain_flag_recent",
        "priority": 90,
        "plan_only": False,
        "check":    check_pain_flag_recent,
        "card_text": lambda p: (
            f"You flagged {', '.join(p['body_parts'])} pain recently. Let's adjust the plan."
            if p.get("body_parts") else
            "You flagged pain recently. Let's adjust the plan."
        ),
        "cta":      "Talk to Coach",
        "seed_prompt": lambda p: (
            f"I flagged {', '.join(p['body_parts'])} pain. Can we talk through it — when it hurts, what loads aggravate it, what helps?"
            if p.get("body_parts") else
            "I flagged some pain recently. Can we talk through it — when it hurts, what loads aggravate it, what helps?"
        ),
    },
    {
        "name":     "missed_two_sessions",
        "priority": 80,
        "plan_only": True,
        "check":    check_missed_two_sessions,
        "card_text": lambda p: f"You've missed {p.get('missed_count', 2)} sessions this week. Let's recalibrate.",
        "cta":      "Talk to Coach",
        "seed_prompt": lambda p: (
            f"I missed {p.get('missed_count', 2)} sessions this week. Help me figure out what's getting in the way before I just push forward — tight schedule, low energy, or something else?"
        ),
    },
    {
        "name":     "volume_spike",
        "priority": 60,
        "plan_only": True,
        "check":    check_volume_spike,
        "card_text": lambda p: f"Your volume jumped {p.get('pct', 30)}% this week. Time to dial it back?",
        "cta":      "Ask Coach",
        "seed_prompt": lambda p: (
            f"My volume jumped {p.get('pct', 30)}% this week. Is this intentional progress or a sign I'm chasing the dragon? Help me check in."
        ),
    },
    {
        "name":     "rpe_climb",
        "priority": 50,
        "plan_only": True,
        "check":    check_rpe_climb,
        "card_text": lambda p: f"Your RPE is climbing ({p.get('avg_recent', 9.0)}). Recovery check-in?",
        "cta":      "Ask Coach",
        "seed_prompt": lambda p: (
            f"My RPE is climbing — last 3 sessions averaged {p.get('avg_recent', 9.0)} vs. {p.get('avg_previous', 8.0)} before. Is it accumulated fatigue, life stress, or load that's too high?"
        ),
    },
    {
        "name":     "deload_due",
        "priority": 40,
        "plan_only": True,
        "check":    check_deload_due,
        "card_text": lambda p: f"You're due for a recovery week (week {p.get('current_week', 4)}). Let's plan it.",
        "cta":      "Talk to Coach",
        "seed_prompt": lambda p: (
            f"I've been pushing for {p.get('current_week', 4)} weeks straight. Should I make this week a recovery week, or push through?"
        ),
    },
    {
        "name":     "pr_streak",
        "priority": 20,
        "plan_only": False,
        "check":    check_pr_streak,
        "card_text": lambda p: f"You hit {p.get('pr_count', 2)} PRs this week. Nice.",
        "cta":      "Tell Coach",
        "seed_prompt": lambda p: (
            f"I hit {p.get('pr_count', 2)} PRs this week — "
            f"{', '.join(p.get('pr_exercises', []))}. "
            "What's clicking? Is it programming, sleep, technique?"
        ),
    },
]

TRIGGERS_SORTED = sorted(TRIGGERS, key=lambda t: t["priority"], reverse=True)


async def get_active_trigger(db: Any, userId: str) -> dict | None:
    """
    Run all applicable triggers for this user and return the highest-priority
    active one as a serialisable dict, or None if nothing fires.
    """
    profile = await db.profile.find_one({"userId": userId}) or {}
    is_free = profile.get("training_mode") == "free"

    for trigger in TRIGGERS_SORTED:
        if is_free and trigger.get("plan_only"):
            continue

        try:
            active, payload = await trigger["check"](db, userId, profile)
        except Exception:
            continue   # never let a trigger crash the endpoint

        if active:
            return {
                "triggerName": trigger["name"],
                "cardText":    trigger["card_text"](payload),
                "cta":         trigger["cta"],
                "seedPrompt":  trigger["seed_prompt"](payload),
                "payload":     payload,
            }

    return None
