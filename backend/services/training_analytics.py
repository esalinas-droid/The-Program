"""
Training Analytics Engine
═════════════════════════
Computes rolling per-user training trends from db.log (+ db.pain_reports +
db.profile) and stores them in the `training_analytics` collection — stored,
NOT recomputed from raw logs on every chat.

PAIN-DATA FINDING (task requirement): per-set/per-session pain data DOES exist
in the current log model — `WorkoutLogEntry.pain` (0-10 int, present on every
log entry) plus the dedicated `db.pain_reports` collection ({date, bodyRegion,
painType, intensity, exerciseName}). Pain trends are therefore computed from
this structured data (path A). Session-note text mining was NOT needed.

Consumers:
  • coach chat (server.py) — via get_training_analytics() + build_trends_context()
  • future proactive triggers (P3) — the stored doc is plain structured data
  • future rolling plan generation (P0) — via get_block_recommendations()

Simplifications (documented):
  • Volume per log entry = weight(lbs) × reps × max(sets,1). Bulk per-set logs
    carry sets=1..N; legacy single-entry logs carry the full set count.
  • "Weeks" are rolling 7-day windows ending today (week 0 = last 7 days).
  • Effective 1RM matches COMPETITION-style lifts only: variation keywords
    (close-grip, incline, paused, …) are excluded so a close-grip bench PR
    never overwrites the bench basis.
  • kg entries are normalized to lbs (× 2.20462) — e1rm in db.log is already lbs.
"""

import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════
# TUNABLE THRESHOLDS — all analytics knobs live HERE (Eric: tune this block)
# ═══════════════════════════════════════════════════════════════════════════
ANALYTICS_STALE_HOURS      = 24     # recompute at coach-chat time if doc older than this
LOG_LOOKBACK_DAYS          = 56     # raw-log fetch window (covers all metrics below)

VOLUME_WEEKS               = 6      # weekly-volume lookback (rolling 7-day buckets)
VOLUME_TRAJECTORY_PCT      = 15.0   # week-over-week volume change worth surfacing to coach

RPE_CREEP_MIN_EXPOSURES    = 4      # min comparable-load exposures required to call a trend
RPE_CREEP_MAX_EXPOSURES    = 6      # only the most recent N exposures are considered
RPE_CREEP_LOAD_TOLERANCE   = 0.05   # ±5% of median top-set load counts as "comparable load"
RPE_CREEP_FLAG_DELTA       = 1.0    # RPE rise (last vs first exposure) that flags creep
RPE_CREEP_LOAD_FLAT_TOL    = 1.02   # load counts as "flat" if last ≤ first × this

EFFECTIVE_1RM_WINDOW_DAYS  = 28     # "last block" window for effective-1RM computation
EFFECTIVE_1RM_DELTA_PCT    = 5.0    # |effective − entered| % beyond which coach may PROPOSE update
EFFECTIVE_1RM_DOWN_MIN_RPE = 8.0    # a DOWNWARD divergence only counts if the best set was hard
                                    # (RPE ≥ this) — submaximal training sets can't prove a 1RM drop;
                                    # an UPWARD divergence is proven by any logged set

# Fatigue index = ACWR_WEIGHT × (acute:chronic volume ratio − 1) + RPE_WEIGHT × (7d avg RPE − 28d avg RPE)
#   acute  = total volume last 7 days
#   chronic = total volume last 28 days ÷ 4 (per-week baseline)
# Positive index ⇒ training load and/or perceived effort above the athlete's own baseline.
FATIGUE_ACWR_WEIGHT        = 1.0
FATIGUE_RPE_WEIGHT         = 0.5
FATIGUE_MODERATE_THRESHOLD = 0.25   # index ≥ this ⇒ "moderate"
FATIGUE_HIGH_THRESHOLD     = 0.50   # index ≥ this ⇒ "high"

COMPLIANCE_WEEKS           = 4      # sessions completed vs planned window
COMPLIANCE_LOW_PCT         = 80.0   # below this the coach surfaces compliance

PAIN_TREND_WINDOW_DAYS     = 28     # pain trend window (split into two 14-day halves)
PAIN_TREND_DELTA           = 0.5    # avg-intensity change between halves ⇒ rising/falling
PAIN_TREND_MIN_EVENTS      = 2      # fewer events than this ⇒ "insufficient data"
PAIN_CLUSTER_MIN_REPORTS   = 2      # pain events tied to one movement to flag a correlation

MIN_CONFIDENT_WEEKS        = 3      # <3 distinct weeks of logs ⇒ low-confidence, coach must say so

# Block-boundary recommendation knobs (get_block_recommendations)
BLOCK_VOL_MOD_HIGH_FATIGUE     = 0.90   # volume multiplier when fatigue = high
BLOCK_VOL_MOD_MODERATE_FATIGUE = 0.95   # volume multiplier when fatigue = moderate
BLOCK_VOL_MOD_LOW_COMPLIANCE   = 0.90   # extra multiplier when compliance < 70%
BLOCK_VOL_MOD_PROGRESS_BONUS   = 1.05   # when fresh + compliant + no creep
BLOCK_COMPLIANCE_CUT_PCT       = 70.0
BLOCK_COMPLIANCE_BONUS_PCT     = 90.0
BLOCK_VOL_MOD_MIN, BLOCK_VOL_MOD_MAX = 0.80, 1.10
# Start-load basis: effective 1RM is used whenever effective1RM[lift].diverges is True
# (see EFFECTIVE_1RM_DELTA_PCT + EFFECTIVE_1RM_DOWN_MIN_RPE above).
# ═══════════════════════════════════════════════════════════════════════════

KG_TO_LBS = 2.20462

# Movement-pattern classifier (keyword → pattern); first match wins, else "other"
_PATTERN_KEYWORDS = [
    ("squat", ["squat", "leg press", "lunge", "step up", "step-up", "hack"]),
    ("hinge", ["deadlift", "rdl", "romanian", "good morning", "hip thrust", "glute bridge",
               "back extension", "swing", "pull-through", "pull through", "hamstring curl", "leg curl"]),
    ("press", ["bench", "press", "push-up", "pushup", "dip", "jerk", "fly", "flye",
               "tricep", "skull", "pushdown"]),
    ("pull",  ["row", "pull-up", "pullup", "pulldown", "pull down", "chin", "curl",
               "shrug", "face pull", "lat ", "rear delt"]),
]

# Entered-1RM (profile.basePRs) key ← competition-lift matcher.
# `exclude` keywords mark variations that must NOT count toward the comp lift.
_MAIN_LIFT_MATCHERS = {
    "squat":    {"include": ["squat"],
                 "exclude": ["front", "box", "ssb", "safety", "goblet", "split", "hack",
                             "belt", "pause", "tempo", "pin", "zercher", "overhead"]},
    "bench":    {"include": ["bench"],
                 "exclude": ["close-grip", "close grip", "incline", "decline", "pause",
                             "paused", "pin", "board", "floor", "spoto", "larsen", "dumbbell", "db "]},
    "deadlift": {"include": ["deadlift"],
                 "exclude": ["romanian", "rdl", "stiff", "deficit", "block", "rack",
                             "snatch", "trap bar", "trap-bar", "pause", "paused", "single"]},
    "ohp":      {"include": ["overhead press", "ohp", "strict press", "military press"],
                 "exclude": ["dumbbell", "db ", "seated", "push press"]},
    "log":      {"include": ["log press", "log clean"], "exclude": []},
    "axle":     {"include": ["axle"], "exclude": []},
}


def _to_lbs(weight, unit) -> float:
    try:
        w = float(weight or 0)
    except (TypeError, ValueError):
        return 0.0
    if unit and str(unit).lower() in ("kg", "kgs"):
        return w * KG_TO_LBS
    return w


def _epley(weight_lbs: float, reps: int) -> float:
    if weight_lbs <= 0 or reps <= 0:
        return 0.0
    if reps == 1:
        return weight_lbs
    return round(weight_lbs * (1 + reps / 30))


def _classify_pattern(exercise: str) -> str:
    ex = (exercise or "").lower()
    for pattern, keywords in _PATTERN_KEYWORDS:
        if any(k in ex for k in keywords):
            return pattern
    return "other"


def _match_main_lift(exercise: str):
    """Return the basePRs key ('squat'/'bench'/...) for a competition-style lift, or None."""
    ex = (exercise or "").lower()
    for key, m in _MAIN_LIFT_MATCHERS.items():
        if any(inc in ex for inc in m["include"]) and not any(exc in ex for exc in m["exclude"]):
            return key
    return None


def _parse_date(s):
    try:
        return datetime.strptime(str(s)[:10], "%Y-%m-%d").date()
    except Exception:
        return None


def _entry_volume(entry: dict) -> float:
    """Volume = weight(lbs) × reps × max(sets,1). Conditioning (weight/reps 0) → 0."""
    w = _to_lbs(entry.get("weight"), entry.get("weightUnit"))
    try:
        reps = int(entry.get("reps") or 0)
        sets = max(int(entry.get("sets") or 1), 1)
    except (TypeError, ValueError):
        return 0.0
    if w <= 0 or reps <= 0:
        return 0.0
    return w * reps * sets


def _entry_set_count(entry: dict) -> int:
    try:
        return max(int(entry.get("sets") or 1), 1)
    except (TypeError, ValueError):
        return 1


# ─── Metric computations (pure; operate on pre-fetched docs) ─────────────────

def _weekly_volume(logs, today):
    """VOLUME_WEEKS rolling 7-day buckets, newest first (week 0 = last 7 days)."""
    weeks = []
    for i in range(VOLUME_WEEKS):
        end = today - timedelta(days=7 * i)
        start = end - timedelta(days=6)
        total, by_pattern = 0.0, {"squat": 0.0, "hinge": 0.0, "press": 0.0, "pull": 0.0, "other": 0.0}
        for e in logs:
            d = e["_date"]
            if start <= d <= end:
                v = _entry_volume(e)
                if v > 0:
                    total += v
                    by_pattern[_classify_pattern(e.get("exercise"))] += v
        weeks.append({
            "weekIndex": i,
            "weekStart": start.isoformat(),
            "weekEnd": end.isoformat(),
            "total": round(total),
            "byPattern": {k: round(v) for k, v in by_pattern.items()},
        })
    return weeks


def _intensity_distribution(logs, today):
    """Per rolling week: % of working sets at RPE ≤7 / 7–9 / ≥9."""
    out = []
    for i in range(VOLUME_WEEKS):
        end = today - timedelta(days=7 * i)
        start = end - timedelta(days=6)
        le7 = mid = hi = 0
        for e in logs:
            if not (start <= e["_date"] <= end):
                continue
            rpe = e.get("rpe") or 0
            w = _to_lbs(e.get("weight"), e.get("weightUnit"))
            if rpe <= 0 or w <= 0:
                continue
            n = _entry_set_count(e)
            if rpe <= 7:
                le7 += n
            elif rpe < 9:
                mid += n
            else:
                hi += n
        tot = le7 + mid + hi
        out.append({
            "weekIndex": i,
            "weekStart": start.isoformat(),
            "workingSets": tot,
            "pctRpeLe7": round(100 * le7 / tot, 1) if tot else None,
            "pctRpe8":   round(100 * mid / tot, 1) if tot else None,
            "pctRpe9Plus": round(100 * hi / tot, 1) if tot else None,
        })
    return out


def _rpe_creep(logs):
    """Per repeated lift: RPE trend across the last 4–6 exposures at comparable
    top-set loads (±RPE_CREEP_LOAD_TOLERANCE of the median). Flags rising RPE
    at flat/declining load."""
    by_ex = {}
    for e in logs:
        w = _to_lbs(e.get("weight"), e.get("weightUnit"))
        rpe = e.get("rpe") or 0
        if w <= 0 or rpe <= 0 or not e.get("exercise"):
            continue
        by_ex.setdefault(e["exercise"], []).append(e)

    flags, all_trends = [], []
    for ex, entries in by_ex.items():
        # top set per date
        by_date = {}
        for e in entries:
            d = e["_date"]
            w = _to_lbs(e.get("weight"), e.get("weightUnit"))
            cur = by_date.get(d)
            if cur is None or w > cur[0]:
                by_date[d] = (w, float(e.get("rpe")))
        if len(by_date) < RPE_CREEP_MIN_EXPOSURES:
            continue
        exposures = sorted(by_date.items())[-RPE_CREEP_MAX_EXPOSURES:]  # [(date, (load, rpe))]
        loads = sorted(l for _, (l, _r) in exposures)
        median = loads[len(loads) // 2]
        comparable = [(d, l, r) for d, (l, r) in exposures
                      if abs(l - median) <= median * RPE_CREEP_LOAD_TOLERANCE]
        if len(comparable) < RPE_CREEP_MIN_EXPOSURES:
            continue
        first_d, first_l, first_r = comparable[0]
        last_d, last_l, last_r = comparable[-1]
        delta = round(last_r - first_r, 1)
        load_flat = last_l <= first_l * RPE_CREEP_LOAD_FLAT_TOL
        trend = {
            "exercise": ex,
            "exposures": [{"date": d.isoformat(), "load": round(l), "rpe": r} for d, l, r in comparable],
            "rpeDelta": delta,
            "loadFlat": load_flat,
            "flagged": bool(delta >= RPE_CREEP_FLAG_DELTA and load_flat),
        }
        all_trends.append(trend)
        if trend["flagged"]:
            flags.append(trend)
    return {"flags": flags, "trends": all_trends}


def _fatigue_index(logs, today):
    """Documented composite (see module constants):
    index = ACWR_WEIGHT × (acute:chronic − 1) + RPE_WEIGHT × (rpe7d − rpe28d)."""
    vol7 = sum(_entry_volume(e) for e in logs if (today - e["_date"]).days < 7)
    vol28 = sum(_entry_volume(e) for e in logs if (today - e["_date"]).days < 28)
    chronic_weekly = vol28 / 4.0
    acwr = (vol7 / chronic_weekly) if chronic_weekly > 0 else None

    def _avg_rpe(days):
        vals = [float(e["rpe"]) for e in logs
                if (today - e["_date"]).days < days and (e.get("rpe") or 0) > 0]
        return round(sum(vals) / len(vals), 2) if vals else None

    rpe7, rpe28 = _avg_rpe(7), _avg_rpe(28)
    rpe_delta = round(rpe7 - rpe28, 2) if (rpe7 is not None and rpe28 is not None) else None

    if acwr is None:
        return {"status": "unknown", "index": None, "acwr": None,
                "vol7d": round(vol7), "chronicWeekly": round(chronic_weekly),
                "rpe7d": rpe7, "rpe28d": rpe28, "rpeDelta": rpe_delta,
                "explanation": "Not enough logged volume in the last 28 days to compute fatigue."}

    index = FATIGUE_ACWR_WEIGHT * (acwr - 1.0) + FATIGUE_RPE_WEIGHT * (rpe_delta or 0.0)
    status = ("high" if index >= FATIGUE_HIGH_THRESHOLD
              else "moderate" if index >= FATIGUE_MODERATE_THRESHOLD
              else "normal")
    explanation = (
        f"7-day volume {round(vol7):,} lbs vs 28-day weekly baseline {round(chronic_weekly):,} lbs "
        f"(ratio {acwr:.2f})"
        + (f"; avg RPE last 7d {rpe7} vs 28d {rpe28} (Δ{rpe_delta:+.2f})" if rpe_delta is not None else "")
        + f" → index {index:.2f} = {status}."
    )
    return {"status": status, "index": round(index, 3), "acwr": round(acwr, 2),
            "vol7d": round(vol7), "chronicWeekly": round(chronic_weekly),
            "rpe7d": rpe7, "rpe28d": rpe28, "rpeDelta": rpe_delta,
            "explanation": explanation}


def _pr_progression(logs, today):
    """Per main lift: best e1RM (Epley from best logged set) per rolling week."""
    out = {}
    for e in logs:
        lift = _match_main_lift(e.get("exercise"))
        if not lift:
            continue
        w = _to_lbs(e.get("weight"), e.get("weightUnit"))
        reps = int(e.get("reps") or 0)
        e1 = float(e.get("e1rm") or 0) or _epley(w, reps)
        if e1 <= 0:
            continue
        wk = min((today - e["_date"]).days // 7, VOLUME_WEEKS - 1)
        if (today - e["_date"]).days >= 7 * VOLUME_WEEKS:
            continue
        rec = out.setdefault(lift, {})
        rec[wk] = max(rec.get(wk, 0.0), e1)
    result = {}
    for lift, weeks in out.items():
        series = [{"weekIndex": i, "bestE1rm": round(weeks[i])} for i in sorted(weeks)]
        firsts = [s for s in sorted(series, key=lambda x: -x["weekIndex"])]  # oldest first
        trend_pct = None
        if len(firsts) >= 2 and firsts[0]["bestE1rm"] > 0:
            trend_pct = round(100 * (firsts[-1]["bestE1rm"] - firsts[0]["bestE1rm"]) / firsts[0]["bestE1rm"], 1)
        result[lift] = {"weekly": series, "trendPct": trend_pct}
    return result


def _effective_1rm(logs, profile, today):
    """Per main lift: best e1RM over the last block (EFFECTIVE_1RM_WINDOW_DAYS),
    stored ALONGSIDE the user-entered 1RM (profile.basePRs) — never overwrites it."""
    base_prs = (profile or {}).get("basePRs") or {}
    unit = ((profile or {}).get("units") or "lbs").lower()
    best = {}
    for e in logs:
        if (today - e["_date"]).days >= EFFECTIVE_1RM_WINDOW_DAYS:
            continue
        lift = _match_main_lift(e.get("exercise"))
        if not lift:
            continue
        w = _to_lbs(e.get("weight"), e.get("weightUnit"))
        e1 = float(e.get("e1rm") or 0) or _epley(w, int(e.get("reps") or 0))
        if e1 > best.get(lift, {}).get("effective", 0):
            best[lift] = {"effective": round(e1),
                          "bestSet": {"date": e["_date"].isoformat(),
                                      "weight": round(w), "reps": int(e.get("reps") or 0),
                                      "rpe": float(e.get("rpe") or 0)}}
    out = {}
    for lift, rec in best.items():
        entered_raw = base_prs.get(lift)
        entered = None
        if entered_raw:
            entered = round(float(entered_raw) * (KG_TO_LBS if unit in ("kg", "kgs") else 1.0))
        delta_pct = (round(100 * (rec["effective"] - entered) / entered, 1)
                     if entered else None)
        # Upward divergence: any logged set proves capacity.
        # Downward divergence: only a hard set (RPE ≥ EFFECTIVE_1RM_DOWN_MIN_RPE) proves a drop.
        best_rpe = rec["bestSet"].get("rpe") or 0
        diverges = bool(delta_pct is not None and (
            delta_pct > EFFECTIVE_1RM_DELTA_PCT
            or (delta_pct < -EFFECTIVE_1RM_DELTA_PCT and best_rpe >= EFFECTIVE_1RM_DOWN_MIN_RPE)
        ))
        out[lift] = {**rec, "entered": entered, "deltaPct": delta_pct, "diverges": diverges}
    return out


def _compliance(logs, profile, today):
    """Distinct training days logged vs planned (profile.trainingDaysCount × weeks)."""
    planned_per_week = int((profile or {}).get("trainingDaysCount") or 4)
    planned = planned_per_week * COMPLIANCE_WEEKS
    days = {e["_date"] for e in logs if (today - e["_date"]).days < 7 * COMPLIANCE_WEEKS}
    completed = len(days)
    pct = round(min(100.0, 100.0 * completed / planned), 1) if planned else None
    return {"completedSessions": completed, "plannedSessions": planned,
            "pct": pct, "windowWeeks": COMPLIANCE_WEEKS}


def _pain_trends(logs, pain_reports, profile, today):
    """Per-injury pain trend (rising/stable/falling over PAIN_TREND_WINDOW_DAYS)
    + movement correlations. Events come from BOTH structured sources:
    log.pain (0-10 per entry) and db.pain_reports (region + intensity + exercise)."""
    events = []
    for e in logs:
        p = e.get("pain") or 0
        if p > 0 and (today - e["_date"]).days < PAIN_TREND_WINDOW_DAYS:
            events.append({"date": e["_date"], "intensity": float(p),
                           "region": None, "exercise": e.get("exercise")})
    for r in pain_reports:
        d = _parse_date(r.get("date"))
        if d and (today - d).days < PAIN_TREND_WINDOW_DAYS:
            events.append({"date": d, "intensity": float(r.get("intensity") or 0),
                           "region": (r.get("bodyRegion") or "").strip() or None,
                           "exercise": r.get("exerciseName")})

    half = PAIN_TREND_WINDOW_DAYS // 2

    def _trend_for(evts):
        if len(evts) < PAIN_TREND_MIN_EVENTS:
            return {"trend": "insufficient", "events": len(evts), "recentAvg": None, "earlierAvg": None}
        recent = [x["intensity"] for x in evts if (today - x["date"]).days < half]
        earlier = [x["intensity"] for x in evts if (today - x["date"]).days >= half]
        r_avg = round(sum(recent) / len(recent), 1) if recent else None
        e_avg = round(sum(earlier) / len(earlier), 1) if earlier else None
        if r_avg is None or e_avg is None:
            trend = "stable"
        elif r_avg - e_avg >= PAIN_TREND_DELTA:
            trend = "rising"
        elif e_avg - r_avg >= PAIN_TREND_DELTA:
            trend = "falling"
        else:
            trend = "stable"
        return {"trend": trend, "events": len(evts), "recentAvg": r_avg, "earlierAvg": e_avg}

    # Per-injury: match events whose region shares a keyword with the injury name
    per_injury = []
    for inj in (profile or {}).get("injuryDetails") or []:
        name = inj.get("name") or ""
        words = {w.strip("()/").lower() for w in name.split() if len(w) > 3}
        matched = [ev for ev in events
                   if ev["region"] and any(w in ev["region"].lower() or ev["region"].lower() in w
                                           for w in words)]
        per_injury.append({"injury": name, "status": inj.get("status"),
                           "severity": inj.get("severity"), **_trend_for(matched)})

    # Movement correlations: pain events clustering after specific exercises
    by_exercise = {}
    for ev in events:
        if ev.get("exercise"):
            by_exercise.setdefault(ev["exercise"], []).append(ev)
    correlations = [
        {"exercise": ex, "reports": len(evts),
         "avgIntensity": round(sum(x["intensity"] for x in evts) / len(evts), 1),
         "regions": sorted({x["region"] for x in evts if x["region"]})}
        for ex, evts in by_exercise.items() if len(evts) >= PAIN_CLUSTER_MIN_REPORTS
    ]
    correlations.sort(key=lambda c: -c["reports"])
    return {"overall": _trend_for(events), "perInjury": per_injury,
            "correlations": correlations, "totalEvents": len(events)}


# ─── Public API ───────────────────────────────────────────────────────────────

async def compute_training_analytics(db, user_id: str) -> dict:
    """Compute the full analytics doc for a user (pure read; does not store)."""
    today = datetime.now(timezone.utc).date()
    cutoff = (today - timedelta(days=LOG_LOOKBACK_DAYS)).isoformat()

    raw_logs = await db.log.find(
        {"userId": user_id, "date": {"$gte": cutoff}}
    ).to_list(5000)
    logs = []
    for e in raw_logs:
        d = _parse_date(e.get("date"))
        if d:
            e["_date"] = d
            logs.append(e)

    profile = await db.profile.find_one({"userId": user_id}) or {}
    pain_reports = await db.pain_reports.find(
        {"userId": user_id, "date": {"$gte": cutoff}}
    ).to_list(500)

    data_weeks = len({(e["_date"].isocalendar()[0], e["_date"].isocalendar()[1])
                      for e in logs if (today - e["_date"]).days < 7 * VOLUME_WEEKS})

    return {
        "userId": user_id,
        "computedAt": datetime.now(timezone.utc),
        "logCount": len(logs),
        "dataWeeks": data_weeks,
        "lowConfidence": data_weeks < MIN_CONFIDENT_WEEKS,
        "weeklyVolume": _weekly_volume(logs, today),
        "intensityDistribution": _intensity_distribution(logs, today),
        "rpeCreep": _rpe_creep(logs),
        "fatigue": _fatigue_index(logs, today),
        "prProgression": _pr_progression(logs, today),
        "effective1RM": _effective_1rm(logs, profile, today),
        "compliance": _compliance(logs, profile, today),
        "painTrends": _pain_trends(logs, pain_reports, profile, today),
    }


async def refresh_training_analytics(db, user_id: str):
    """Compute and upsert the per-user training_analytics doc. Never raises —
    designed to run as a fire-and-forget background task after logging."""
    try:
        doc = await compute_training_analytics(db, user_id)
        await db.training_analytics.update_one(
            {"userId": user_id}, {"$set": doc}, upsert=True
        )
        logger.info(f"[Analytics] refreshed for user={user_id} (logs={doc['logCount']}, weeks={doc['dataWeeks']})")
        return doc
    except Exception as e:
        logger.warning(f"[Analytics] refresh failed for user={user_id}: {e}")
        return None


async def get_training_analytics(db, user_id: str, max_age_hours: float = ANALYTICS_STALE_HOURS):
    """Return the stored analytics doc, recomputing if missing or stale.
    Returns None on any failure — callers must treat analytics as optional."""
    try:
        doc = await db.training_analytics.find_one({"userId": user_id})
        if doc:
            ts = doc.get("computedAt")
            if isinstance(ts, datetime):
                ts = ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
                age_h = (datetime.now(timezone.utc) - ts).total_seconds() / 3600
                if age_h <= max_age_hours:
                    return doc
        return await refresh_training_analytics(db, user_id)
    except Exception as e:
        logger.warning(f"[Analytics] get failed for user={user_id}: {e}")
        return None


def build_trends_context(analytics: dict) -> str:
    """Compact TRENDS block (~250 tokens) for the coach system prompt.
    Only NON-NEUTRAL signals are included — no token spend on 'all normal'."""
    if not analytics or not analytics.get("logCount"):
        return ""
    lines = []

    if analytics.get("lowConfidence"):
        lines.append(
            f"DATA WINDOW: only {analytics.get('dataWeeks', 0)} week(s) of logs — trends are "
            "LOW-CONFIDENCE. Say so explicitly; do not overclaim from thin data."
        )

    fat = analytics.get("fatigue") or {}
    if fat.get("status") in ("moderate", "high"):
        lines.append(f"Fatigue {fat['status'].upper()}: {fat.get('explanation', '')}")

    for f in (analytics.get("rpeCreep") or {}).get("flags", [])[:3]:
        ev = f.get("exposures", [])
        seq = ", ".join(f"{x['rpe']:g}@{x['load']}" for x in ev)
        lines.append(
            f"RPE creep on {f['exercise']}: RPE went {seq} across {len(ev)} sessions at ~flat load "
            f"(Δ{f['rpeDelta']:+g})."
        )

    wv = analytics.get("weeklyVolume") or []
    if len(wv) >= 2 and wv[1]["total"] > 0:
        chg = 100 * (wv[0]["total"] - wv[1]["total"]) / wv[1]["total"]
        if abs(chg) >= VOLUME_TRAJECTORY_PCT:
            lines.append(
                f"Volume {'up' if chg > 0 else 'down'} {abs(chg):.0f}% this week "
                f"({wv[0]['total']:,} vs {wv[1]['total']:,} lbs prior week)."
            )

    for lift, rec in (analytics.get("effective1RM") or {}).items():
        if rec.get("diverges"):
            bs = rec.get("bestSet") or {}
            lines.append(
                f"Effective 1RM {lift}: ~{rec['effective']} lbs (best set {bs.get('weight')}×{bs.get('reps')} "
                f"on {bs.get('date')}) vs entered {rec['entered']} lbs ({rec['deltaPct']:+.1f}%). "
                f"You MAY propose updating training loads — as a PROGRAM_CHANGE proposal only."
            )

    pain = analytics.get("painTrends") or {}
    for pi in pain.get("perInjury", []):
        if pi.get("trend") in ("rising", "falling"):
            lines.append(
                f"Pain trend — {pi['injury']} ({pi.get('status')}, {pi.get('severity')}): {pi['trend'].upper()} "
                f"(recent avg {pi.get('recentAvg')}/10 vs earlier {pi.get('earlierAvg')}/10, {pi.get('events')} reports)."
            )
    for c in pain.get("correlations", [])[:2]:
        lines.append(
            f"Pain clusters after {c['exercise']}: {c['reports']} reports, avg {c['avgIntensity']}/10"
            + (f" ({', '.join(c['regions'])})" if c.get("regions") else "") + "."
        )

    comp = analytics.get("compliance") or {}
    if comp.get("pct") is not None and comp["pct"] < COMPLIANCE_LOW_PCT:
        lines.append(
            f"Compliance {comp['pct']:.0f}%: {comp['completedSessions']}/{comp['plannedSessions']} "
            f"sessions in the last {comp['windowWeeks']} weeks."
        )

    return "\n".join(f"- {ln}" for ln in lines)[:1200]


async def get_block_recommendations(db, user_id: str, upcoming_block: dict | None = None) -> dict:
    """Block-boundary hook for P0's rolling plan generation (NOT wired into the
    plan generator yet — that is a later task). Given a user (and optionally the
    upcoming block dict), return recommended parameter adjustments:
      startLoads     — per main lift, which 1RM basis to program from
      volumeModifier — multiplier for the upcoming block's volume
      painCautions   — active injuries trending up (protective handling)
      rationale      — human-readable reasons for every adjustment
    Purely advisory — the caller decides whether to apply."""
    analytics = await get_training_analytics(db, user_id)
    if not analytics:
        return {"userId": user_id, "available": False, "startLoads": {},
                "volumeModifier": 1.0, "painCautions": [], "rationale": ["No analytics available — defaults."]}

    rationale = []
    profile = await db.profile.find_one({"userId": user_id}) or {}
    base_prs = profile.get("basePRs") or {}
    unit = (profile.get("units") or "lbs").lower()

    start_loads = {}
    for lift, rec in (analytics.get("effective1RM") or {}).items():
        entered = rec.get("entered")
        if rec.get("diverges"):
            start_loads[lift] = {"basis1RM": rec["effective"], "source": "effective",
                                 "entered": entered, "deltaPct": rec["deltaPct"]}
            rationale.append(
                f"{lift}: program from effective 1RM {rec['effective']} lbs "
                f"(diverges {rec['deltaPct']:+.1f}% from entered {entered})."
            )
        elif entered:
            start_loads[lift] = {"basis1RM": entered, "source": "entered",
                                 "entered": entered, "deltaPct": rec.get("deltaPct")}
    # entered PRs with no recent log evidence stay as-is
    for lift, val in base_prs.items():
        if lift not in start_loads and val:
            lbs = round(float(val) * (KG_TO_LBS if unit in ("kg", "kgs") else 1.0))
            start_loads[lift] = {"basis1RM": lbs, "source": "entered", "entered": lbs, "deltaPct": None}

    vol = 1.0
    fat = analytics.get("fatigue") or {}
    if fat.get("status") == "high":
        vol *= BLOCK_VOL_MOD_HIGH_FATIGUE
        rationale.append(f"Fatigue HIGH ({fat.get('explanation','')}) → volume ×{BLOCK_VOL_MOD_HIGH_FATIGUE}.")
    elif fat.get("status") == "moderate":
        vol *= BLOCK_VOL_MOD_MODERATE_FATIGUE
        rationale.append(f"Fatigue moderate → volume ×{BLOCK_VOL_MOD_MODERATE_FATIGUE}.")

    comp = analytics.get("compliance") or {}
    if comp.get("pct") is not None and comp["pct"] < BLOCK_COMPLIANCE_CUT_PCT:
        vol *= BLOCK_VOL_MOD_LOW_COMPLIANCE
        rationale.append(f"Compliance {comp['pct']:.0f}% (<{BLOCK_COMPLIANCE_CUT_PCT:.0f}%) → volume ×{BLOCK_VOL_MOD_LOW_COMPLIANCE}.")

    creep_flags = (analytics.get("rpeCreep") or {}).get("flags", [])
    if (fat.get("status") == "normal" and not creep_flags
            and comp.get("pct") is not None and comp["pct"] >= BLOCK_COMPLIANCE_BONUS_PCT
            and not analytics.get("lowConfidence")):
        vol *= BLOCK_VOL_MOD_PROGRESS_BONUS
        rationale.append(f"Fresh, compliant, no RPE creep → volume ×{BLOCK_VOL_MOD_PROGRESS_BONUS}.")

    vol = round(min(max(vol, BLOCK_VOL_MOD_MIN), BLOCK_VOL_MOD_MAX), 3)

    pain_cautions = [
        {"injury": pi["injury"], "severity": pi.get("severity"), "trend": pi["trend"]}
        for pi in (analytics.get("painTrends") or {}).get("perInjury", [])
        if pi.get("status") == "active" and pi.get("trend") == "rising"
    ]
    for pc in pain_cautions:
        rationale.append(f"Active injury '{pc['injury']}' pain RISING → protect aggravating patterns in next block.")

    if analytics.get("lowConfidence"):
        rationale.append(f"Only {analytics.get('dataWeeks')} week(s) of data — adjustments are conservative/low-confidence.")

    return {
        "userId": user_id,
        "available": True,
        "computedAt": analytics.get("computedAt"),
        "upcomingBlock": (upcoming_block or {}).get("blockName") if upcoming_block else None,
        "startLoads": start_loads,
        "volumeModifier": vol,
        "painCautions": pain_cautions,
        "rationale": rationale,
    }
