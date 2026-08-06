"""Load suggestions from logged performance.

The athlete decides — this module never changes a prescription. It compares what
was actually logged against what was prescribed and returns a recommendation the
app can surface ("you're beating this, consider adding weight").

Design notes
------------
* Suggestions are advisory by design. Auto-adjusting loads from logged RPE goes
  wrong when athletes log inconsistently, which beta testers reliably do.
* A suggestion needs at least MIN_SESSIONS logged for that exercise, so one good
  or bad day never moves anything.
* Increments are deliberately small and bounded.
"""
from typing import List, Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

MIN_SESSIONS = 2          # sessions of evidence before suggesting anything
LOOKBACK_SESSIONS = 4     # how far back to read
EASY_MARGIN = 1.0         # logged RPE this far BELOW target = too easy
HARD_MARGIN = 1.0         # logged RPE this far ABOVE target = too heavy
STEP_UP = 0.05            # +5% suggested
STEP_DOWN = 0.07          # -7% suggested (back off faster than you build)


def _avg(vals: List[float]) -> Optional[float]:
    vals = [v for v in vals if v is not None]
    return sum(vals) / len(vals) if vals else None


def suggest_for_exercise(
    exercise: str,
    target_rpe: Optional[float],
    recent_logs: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Return a suggestion dict for one exercise, or None if there's nothing to say.

    recent_logs: newest-first log entries for this exercise, each with at least
                 {"rpe": float|None, "weight": float|None}
    """
    if not target_rpe or not recent_logs:
        return None

    logs = recent_logs[:LOOKBACK_SESSIONS]
    rpes = [l.get("rpe") for l in logs if l.get("rpe")]
    if len(rpes) < MIN_SESSIONS:
        return None

    avg_rpe = _avg(rpes)
    if avg_rpe is None:
        return None

    last_weight = next((l.get("weight") for l in logs if l.get("weight")), None)
    delta = avg_rpe - target_rpe

    if delta <= -EASY_MARGIN:
        direction, pct = "increase", STEP_UP
        reason = (f"Last {len(rpes)} sessions averaged RPE {avg_rpe:.1f} against a "
                  f"target of {target_rpe:.1f} — it's coming up easier than prescribed.")
    elif delta >= HARD_MARGIN:
        direction, pct = "decrease", -STEP_DOWN
        reason = (f"Last {len(rpes)} sessions averaged RPE {avg_rpe:.1f} against a "
                  f"target of {target_rpe:.1f} — you're working harder than prescribed.")
    else:
        return None

    suggested = round(last_weight * (1 + pct)) if last_weight else None
    return {
        "exercise":        exercise,
        "direction":       direction,
        "targetRPE":       target_rpe,
        "avgLoggedRPE":    round(avg_rpe, 1),
        "sessionsUsed":    len(rpes),
        "currentWeight":   last_weight,
        "suggestedWeight": suggested,
        "percentChange":   round(pct * 100),
        "reason":          reason,
        # Explicit: the app must not apply this without the athlete agreeing.
        "requiresConfirmation": True,
    }


async def build_suggestions(db, user_id: str, session) -> List[Dict[str, Any]]:
    """Suggestions for every main/supplemental exercise in a session.

    Reads the athlete's own logs only. Returns [] when there isn't enough
    evidence — silence is correct, a guess is not.
    """
    out: List[Dict[str, Any]] = []
    try:
        for ex in (getattr(session, "exercises", None) or []):
            cat = getattr(ex.category, "value", ex.category)
            if cat not in ("main", "supplemental"):
                continue
            work = [s for s in (ex.targetSets or []) if s.setType == "work"]
            target = next((s.targetRPE for s in reversed(work) if s.targetRPE), None)
            if not target:
                continue
            cursor = db.log.find(
                {"userId": user_id, "exercise": ex.name, "rpe": {"$gt": 0}}
            ).sort("date", -1).limit(LOOKBACK_SESSIONS * 3)
            docs = await cursor.to_list(LOOKBACK_SESSIONS * 3)
            # one entry per date — the heaviest logged set of that day
            by_date: Dict[str, Dict[str, Any]] = {}
            for d in docs:
                key = str(d.get("date"))
                cur = by_date.get(key)
                if cur is None or (d.get("weight") or 0) > (cur.get("weight") or 0):
                    by_date[key] = {"rpe": d.get("rpe"), "weight": d.get("weight")}
            recent = [by_date[k] for k in sorted(by_date.keys(), reverse=True)]
            s = suggest_for_exercise(ex.name, target, recent)
            if s:
                out.append(s)
    except Exception as e:  # advisory only — never break a session load
        logger.warning("[SUGGEST] failed to build load suggestions: %s", e)
        return []
    return out
