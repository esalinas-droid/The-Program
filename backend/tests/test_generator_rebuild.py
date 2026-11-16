"""
Pure tests for the generator-rebuild batch (no live server needed).

Covers:
  1. _recovery_volume_mult — sleep/stress/occupation now scale accessory volume.
  2. Weakness wiring — a selected primary weakness swaps a generic filler
     accessory for a weakness-targeting exercise; no weaknesses = no change;
     session volume never grows.
  3. rescale_single_exercise — the apply path for load suggestions scales one
     exercise from a given week forward, loads AND prescription text, and
     leaves completed weeks untouched.

Run:  pytest tests/test_generator_rebuild.py -v
"""
import pytest

from models.schemas import IntakeRequest, CurrentLifts
from services.plan_generator import (
    generate_plan,
    _recovery_volume_mult,
    _WEAKNESS_ACCESSORIES,
    _GENERIC_FILLER_ACCESSORIES,
)
from services.max_rescale import rescale_single_exercise


def _intake(**over):
    base = dict(
        goal="strongman",
        experience="intermediate",
        lifts=CurrentLifts(squat=455, bench=315, deadlift=550, overheadPress=225),
        frequency=4,
    )
    base.update(over)
    return IntakeRequest(**base)


def _week_exercises(plan, week_no):
    for phase in plan.phases:
        for block in phase.blocks:
            for week in block.weeks:
                if week.weekNumber == week_no:
                    return [ex for s in week.sessions for ex in s.exercises]
    return []


def _work_set_count(plan, week_no, categories=("supplemental", "accessory")):
    n = 0
    for ex in _week_exercises(plan, week_no):
        cat = getattr(ex.category, "value", ex.category)
        if str(cat).lower() in categories:
            n += sum(1 for s in ex.targetSets if s.setType == "work")
    return n


class TestRecoveryScaling:
    def test_good_recovery_is_neutral(self):
        assert _recovery_volume_mult(7, "low", "sedentary") == 1.0
        assert _recovery_volume_mult(None, None, None) == 1.0

    def test_each_factor_trims(self):
        assert _recovery_volume_mult(5, "low", "sedentary") < 1.0
        assert _recovery_volume_mult(8, "very_high", "sedentary") < 1.0
        assert _recovery_volume_mult(8, "low", "manual") < 1.0

    def test_stacked_factors_floor_at_080(self):
        assert _recovery_volume_mult(5, "very_high", "manual") == 0.80

    def test_poor_recovery_reduces_accessory_volume_in_plan(self):
        rested = generate_plan(_intake(), plan_id="test-rested")
        wrecked = generate_plan(
            _intake(sleepHours=5, stressLevel="very_high", occupationType="manual"),
            plan_id="test-wrecked",
        )
        assert _work_set_count(wrecked, 1) < _work_set_count(rested, 1)


class TestWeaknessWiring:
    WEAKNESS = "Core stability / bracing"
    MARKER = "targets your weakness"   # stamped into the swapped exercise's notes

    def _marked(self, plan, weeks=(1, 2, 3)):
        return [
            ex for wk in weeks for ex in _week_exercises(plan, wk)
            if self.MARKER in str(getattr(ex, "notes", "") or "")
        ]

    def test_weakness_exercise_appears_in_early_weeks(self):
        plan = generate_plan(_intake(primaryWeaknesses=[self.WEAKNESS]), plan_id="test-weak")
        marked = self._marked(plan)
        assert marked, "no weakness-targeted accessory appeared in weeks 1-3"
        targets = {name for name, _, _ in _WEAKNESS_ACCESSORIES[self.WEAKNESS][1]}
        assert {ex.name for ex in marked} <= targets

    def test_no_weaknesses_means_no_weakness_exercises(self):
        plan = generate_plan(_intake(), plan_id="test-noweak")
        assert not self._marked(plan)

    def test_swap_never_grows_session_volume(self):
        base = generate_plan(_intake(), plan_id="test-vol")
        weak = generate_plan(_intake(primaryWeaknesses=[self.WEAKNESS]), plan_id="test-vol")
        # Same plan_id = deterministic build; the swap replaces a filler, so
        # exercise COUNT per week must not increase.
        for wk in (1, 2, 3):
            assert len(_week_exercises(weak, wk)) <= len(_week_exercises(base, wk))

    def test_filler_actually_displaced(self):
        plan = generate_plan(_intake(primaryWeaknesses=[self.WEAKNESS]), plan_id="test-disp")
        base = generate_plan(_intake(), plan_id="test-disp")
        def fillers(p, wk):
            return sum(1 for ex in _week_exercises(p, wk) if ex.name in _GENERIC_FILLER_ACCESSORIES)
        assert any(fillers(plan, wk) < fillers(base, wk) for wk in (1, 2, 3))


class TestRescaleSingleExercise:
    def _doc(self):
        def week(n):
            return {
                "weekNumber": n,
                "sessions": [{
                    "exercises": [{
                        "name": "Bench Press",
                        "prescription": "5×5 @ 100lbs",
                        "targetSets": [
                            {"setType": "work", "targetLoad": "100", "targetReps": "5"},
                        ],
                    }, {
                        "name": "Back Squat",
                        "prescription": "5×5 @ 200lbs",
                        "targetSets": [
                            {"setType": "work", "targetLoad": "200", "targetReps": "5"},
                        ],
                    }],
                }],
            }
        return {"phases": [{"blocks": [{"weeks": [week(1), week(2)]}]}]}

    def test_scales_only_from_week_and_only_that_exercise(self):
        doc, touched = rescale_single_exercise(self._doc(), "Bench Press", 1.05, from_week=2)
        assert touched == 1
        weeks = doc["phases"][0]["blocks"][0]["weeks"]
        w1_bench = weeks[0]["sessions"][0]["exercises"][0]
        w2_bench = weeks[1]["sessions"][0]["exercises"][0]
        w2_squat = weeks[1]["sessions"][0]["exercises"][1]
        assert w1_bench["targetSets"][0]["targetLoad"] == "100"     # past untouched
        assert w2_bench["targetSets"][0]["targetLoad"] == "105"     # future scaled
        assert "105" in w2_bench["prescription"]                     # text rewritten
        assert w2_squat["targetSets"][0]["targetLoad"] == "200"     # other lift untouched

    def test_noop_multiplier_touches_nothing(self):
        doc, touched = rescale_single_exercise(self._doc(), "Bench Press", 1.0, from_week=1)
        assert touched == 0
