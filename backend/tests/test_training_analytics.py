"""
Unit tests for services/training_analytics.py (pure metric functions +
trends-context builder). DB-integration paths are covered by API tests.
"""
import sys
import os
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.training_analytics import (
    _rpe_creep, _fatigue_index, _effective_1rm, _pain_trends, _compliance,
    _weekly_volume, _intensity_distribution, _classify_pattern, _match_main_lift,
    build_trends_context,
    RPE_CREEP_FLAG_DELTA, EFFECTIVE_1RM_DELTA_PCT,
    FATIGUE_HIGH_THRESHOLD, MIN_CONFIDENT_WEEKS,
)

TODAY = datetime.now(timezone.utc).date()


def _entry(days_ago, exercise, weight, reps, rpe, sets=3, pain=0, e1rm=None, unit=None):
    w, r = float(weight), int(reps)
    if e1rm is None:
        e1rm = 0.0 if (w <= 0 or r <= 0) else (w if r == 1 else round(w * (1 + r / 30)))
    return {
        "_date": TODAY - timedelta(days=days_ago),
        "date": (TODAY - timedelta(days=days_ago)).isoformat(),
        "exercise": exercise, "weight": w, "reps": r, "rpe": float(rpe),
        "sets": sets, "pain": pain, "e1rm": e1rm, "weightUnit": unit,
    }


# ─── classifiers ──────────────────────────────────────────────────────────────

def test_pattern_classifier():
    assert _classify_pattern("Back Squat") == "squat"
    assert _classify_pattern("Romanian Deadlift") == "hinge"
    assert _classify_pattern("Close-Grip Bench Press") == "press"
    assert _classify_pattern("Barbell Row") == "pull"
    assert _classify_pattern("Farmers Carry") == "other"


def test_main_lift_matcher_excludes_variations():
    assert _match_main_lift("Bench Press") == "bench"
    assert _match_main_lift("Close-Grip Bench Press") is None
    assert _match_main_lift("Back Squat") == "squat"
    assert _match_main_lift("Front Squat") is None
    assert _match_main_lift("Deadlift") == "deadlift"
    assert _match_main_lift("Romanian Deadlift") is None
    assert _match_main_lift("Log Press") == "log"


# ─── RPE creep ────────────────────────────────────────────────────────────────

def test_rpe_creep_flags_rising_rpe_at_flat_load():
    logs = [
        _entry(23, "Bench Press", 185, 5, 7.0),
        _entry(16, "Bench Press", 185, 5, 7.5),
        _entry(9,  "Bench Press", 185, 5, 8.5),
        _entry(2,  "Bench Press", 185, 5, 9.0),
    ]
    result = _rpe_creep(logs)
    assert len(result["flags"]) == 1
    flag = result["flags"][0]
    assert flag["exercise"] == "Bench Press"
    assert flag["rpeDelta"] >= RPE_CREEP_FLAG_DELTA
    assert flag["loadFlat"] is True
    assert [x["rpe"] for x in flag["exposures"]] == [7.0, 7.5, 8.5, 9.0]


def test_rpe_creep_not_flagged_when_load_rises_too():
    logs = [
        _entry(23, "Bench Press", 185, 5, 7.0),
        _entry(16, "Bench Press", 225, 5, 7.5),   # +21% load — not comparable
        _entry(9,  "Bench Press", 185, 5, 7.0),
        _entry(2,  "Bench Press", 190, 5, 7.5),
    ]
    result = _rpe_creep(logs)
    assert result["flags"] == []


def test_rpe_creep_needs_min_exposures():
    logs = [_entry(9, "Bench Press", 185, 5, 7.0), _entry(2, "Bench Press", 185, 5, 9.0)]
    assert _rpe_creep(logs)["flags"] == []


# ─── fatigue ──────────────────────────────────────────────────────────────────

def test_fatigue_high_on_volume_spike_and_rpe_jump():
    # 3 quiet weeks then a massive week 0 spike with high RPE
    logs = []
    for d in (25, 18, 11):
        logs.append(_entry(d, "Back Squat", 200, 5, 6.5, sets=3))
    for d in (1, 2, 3, 4, 5):
        logs.append(_entry(d, "Back Squat", 300, 8, 9.5, sets=6))
    fat = _fatigue_index(logs, TODAY)
    assert fat["status"] == "high"
    assert fat["index"] >= FATIGUE_HIGH_THRESHOLD
    assert "ratio" in fat["explanation"]  # explanation must state WHY


def test_fatigue_normal_on_steady_training():
    logs = [_entry(d, "Back Squat", 225, 5, 7.0, sets=3) for d in range(1, 28, 3)]
    fat = _fatigue_index(logs, TODAY)
    assert fat["status"] == "normal"


def test_fatigue_unknown_without_volume():
    assert _fatigue_index([], TODAY)["status"] == "unknown"


# ─── effective 1RM ────────────────────────────────────────────────────────────

def test_effective_1rm_divergence():
    profile = {"basePRs": {"bench": 300}, "units": "lbs"}
    logs = [_entry(3, "Bench Press", 295, 3, 8.0)]   # Epley = 295×1.1 = 324.5 → round → 324
    out = _effective_1rm(logs, profile, TODAY)
    assert out["bench"]["effective"] == 324
    assert out["bench"]["entered"] == 300
    assert abs(out["bench"]["deltaPct"] - 8.0) < 0.2
    assert out["bench"]["diverges"] is True          # > EFFECTIVE_1RM_DELTA_PCT


def test_effective_1rm_never_overwrites_entered():
    profile = {"basePRs": {"bench": 300}, "units": "lbs"}
    out = _effective_1rm([_entry(3, "Bench Press", 295, 3, 8.0)], profile, TODAY)
    assert profile["basePRs"]["bench"] == 300         # untouched
    assert out["bench"]["entered"] == 300


def test_effective_1rm_within_tolerance_not_flagged():
    profile = {"basePRs": {"bench": 320}, "units": "lbs"}
    out = _effective_1rm([_entry(3, "Bench Press", 295, 3, 8.0)], profile, TODAY)  # 325 vs 320 = +1.6%
    assert out["bench"]["diverges"] is False


def test_effective_1rm_kg_entered_converted():
    profile = {"basePRs": {"bench": 136}, "units": "kg"}   # ≈ 300 lbs
    out = _effective_1rm([_entry(3, "Bench Press", 295, 3, 8.0)], profile, TODAY)
    assert 295 <= out["bench"]["entered"] <= 305


def test_effective_1rm_submax_set_cannot_prove_a_drop():
    # Entered 315, best logged squat is a submax 225×5 @ RPE 7 (e1RM 262, −16.8%)
    profile = {"basePRs": {"squat": 315}, "units": "lbs"}
    out = _effective_1rm([_entry(3, "Back Squat", 225, 5, 7.0)], profile, TODAY)
    assert out["squat"]["diverges"] is False   # submaximal → no downward flag
    # …but the same delta from a HARD set (RPE 9) does prove a drop
    out2 = _effective_1rm([_entry(3, "Back Squat", 225, 5, 9.0)], profile, TODAY)
    assert out2["squat"]["diverges"] is True


# ─── pain trends ──────────────────────────────────────────────────────────────

def _pain_report(days_ago, intensity, region="Shoulder", exercise="Overhead Press"):
    return {"date": (TODAY - timedelta(days=days_ago)).isoformat(),
            "bodyRegion": region, "intensity": intensity, "exerciseName": exercise}


def test_pain_rising_trend_and_correlation():
    profile = {"injuryDetails": [{"name": "Shoulder (general)", "status": "active", "severity": "moderate"}]}
    reports = [_pain_report(18, 3), _pain_report(11, 4), _pain_report(5, 6), _pain_report(2, 7)]
    out = _pain_trends([], reports, profile, TODAY)
    inj = out["perInjury"][0]
    assert inj["injury"] == "Shoulder (general)"
    assert inj["trend"] == "rising"
    corr = out["correlations"][0]
    assert corr["exercise"] == "Overhead Press"
    assert corr["reports"] == 4


def test_pain_falling_trend():
    profile = {"injuryDetails": [{"name": "Shoulder (general)", "status": "active", "severity": "mild"}]}
    reports = [_pain_report(20, 7), _pain_report(16, 6), _pain_report(6, 3), _pain_report(2, 2)]
    out = _pain_trends([], reports, profile, TODAY)
    assert out["perInjury"][0]["trend"] == "falling"


def test_pain_from_log_pain_field_counts():
    out = _pain_trends([_entry(3, "Overhead Press", 135, 5, 8, pain=6),
                        _entry(1, "Overhead Press", 135, 5, 8, pain=7)], [], {}, TODAY)
    assert out["totalEvents"] == 2
    assert out["correlations"][0]["exercise"] == "Overhead Press"


# ─── compliance / volume ──────────────────────────────────────────────────────

def test_compliance():
    profile = {"trainingDaysCount": 3}
    logs = [_entry(d, "Back Squat", 225, 5, 7) for d in (1, 3, 5, 8, 10, 15, 17, 22, 24)]
    comp = _compliance(logs, profile, TODAY)
    assert comp["plannedSessions"] == 12
    assert comp["completedSessions"] == 9
    assert comp["pct"] == 75.0


def test_weekly_volume_buckets_and_patterns():
    logs = [_entry(2, "Back Squat", 200, 5, 7, sets=3),      # 3000 lbs, squat
            _entry(3, "Barbell Row", 100, 10, 7, sets=2)]    # 2000 lbs, pull
    wv = _weekly_volume(logs, TODAY)
    assert wv[0]["total"] == 5000
    assert wv[0]["byPattern"]["squat"] == 3000
    assert wv[0]["byPattern"]["pull"] == 2000
    assert wv[1]["total"] == 0


def test_intensity_distribution():
    logs = [_entry(2, "Bench Press", 185, 5, 7.0, sets=2),
            _entry(2, "Bench Press", 185, 5, 8.0, sets=1),
            _entry(3, "Bench Press", 185, 5, 9.5, sets=1)]
    dist = _intensity_distribution(logs, TODAY)[0]
    assert dist["workingSets"] == 4
    assert dist["pctRpeLe7"] == 50.0
    assert dist["pctRpe8"] == 25.0
    assert dist["pctRpe9Plus"] == 25.0


# ─── trends context builder ───────────────────────────────────────────────────

def test_trends_context_only_non_neutral():
    analytics = {
        "logCount": 30, "dataWeeks": 4, "lowConfidence": False,
        "fatigue": {"status": "normal", "explanation": "fine"},
        "rpeCreep": {"flags": []},
        "weeklyVolume": [{"total": 10000}, {"total": 10100}],
        "effective1RM": {"bench": {"effective": 305, "entered": 300, "deltaPct": 1.7,
                                   "diverges": False, "bestSet": {}}},
        "painTrends": {"perInjury": [{"injury": "Knee", "trend": "stable"}], "correlations": []},
        "compliance": {"pct": 92.0, "completedSessions": 11, "plannedSessions": 12, "windowWeeks": 4},
    }
    assert build_trends_context(analytics) == ""   # everything neutral → zero tokens


def test_trends_context_includes_signals_and_low_confidence():
    analytics = {
        "logCount": 6, "dataWeeks": 1, "lowConfidence": True,
        "fatigue": {"status": "high", "explanation": "ratio 1.8"},
        "rpeCreep": {"flags": [{"exercise": "Bench Press", "rpeDelta": 2.0,
                                "exposures": [{"date": "d", "load": 185, "rpe": 7.0},
                                              {"date": "d", "load": 185, "rpe": 9.0}]}]},
        "weeklyVolume": [{"total": 18000}, {"total": 10000}],
        "effective1RM": {"bench": {"effective": 325, "entered": 300, "deltaPct": 8.3,
                                   "diverges": True, "bestSet": {"weight": 295, "reps": 3, "date": "d"}}},
        "painTrends": {"perInjury": [{"injury": "Shoulder (general)", "status": "active",
                                      "severity": "moderate", "trend": "rising",
                                      "recentAvg": 5.7, "earlierAvg": 3.0, "events": 4}],
                       "correlations": [{"exercise": "Overhead Press", "reports": 4,
                                         "avgIntensity": 5.0, "regions": ["Shoulder"]}]},
        "compliance": {"pct": 60.0, "completedSessions": 7, "plannedSessions": 12, "windowWeeks": 4},
    }
    ctx = build_trends_context(analytics)
    assert "LOW-CONFIDENCE" in ctx
    assert "Fatigue HIGH" in ctx
    assert "RPE creep on Bench Press" in ctx
    assert "Effective 1RM bench" in ctx and "PROGRAM_CHANGE proposal" in ctx
    assert "Shoulder (general)" in ctx and "RISING" in ctx
    assert "Overhead Press: 4 reports" in ctx
    assert "Compliance 60%" in ctx
    assert len(ctx) <= 1200


def test_trends_context_empty_analytics_safe():
    assert build_trends_context(None) == ""
    assert build_trends_context({}) == ""
    assert build_trends_context({"logCount": 0}) == ""
