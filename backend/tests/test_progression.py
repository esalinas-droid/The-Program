"""
Progression-engine tests for services/plan_generator.py.

Asserts the deterministic generator produces a genuinely PROGRESSED plan
(not identical week clones), covering:
  (a) DE work escalates within a block by the template's weekly % step
  (b) Max-Effort main-lift variation rotates across weeks within a block
  (c) Deload weeks have reduced volume AND intensity vs the adjacent week
  (d) A peaking-phase week loads heavier than an intro-phase week (same movement)
  (e) Two generations with the same planId are identical (determinism)
  (f) Injury exclusions still hold for rotated Max-Effort variations
"""
import re
import pytest

from services.plan_generator import generate_plan, PHASE_PROGRESSION, ROTATION_POOLS
from models.schemas import IntakeRequest, CurrentLifts

PLAN_ID = "PYTEST_PROG_SEED"


def _intake(injuries=None, frequency=4):
    return IntakeRequest(
        goal="strength",
        experience="intermediate",
        lifts=CurrentLifts(squat=405, bench=275, deadlift=495),
        liftUnit="lbs",
        frequency=frequency,
        injuries=injuries or [],
        gym=[],
    )


@pytest.fixture(scope="module")
def plan():
    return generate_plan(_intake(), plan_id=PLAN_ID)


def _weeks(plan):
    """Yield (phase, block, week) for every week in the plan."""
    for ph in plan.phases:
        for b in ph.blocks:
            for w in b.weeks:
                yield ph, b, w


def _session(plan, week_number, session_type):
    for ph, b, w in _weeks(plan):
        if w.weekNumber == week_number:
            for s in w.sessions:
                if s.sessionType == session_type:
                    return ph, b, w, s
    return None


def _num(load):
    """Parse a numeric target load, ignoring a trailing '+'. Returns None if non-numeric."""
    if not isinstance(load, str):
        return None
    m = re.match(r"^(\d+(?:\.\d+)?)\+?$", load.strip())
    return float(m.group(1)) if m else None


def _work_loads(session):
    return [
        _num(st.targetLoad)
        for ex in session.exercises
        for st in ex.targetSets
        if st.setType in ("work", "ramp") and _num(st.targetLoad) is not None
    ]


def _work_set_count(session):
    return sum(1 for ex in session.exercises for st in ex.targetSets if st.setType == "work")


# ── (a) DE weekly escalation ──────────────────────────────────────────────────
def test_de_work_escalates_within_block(plan):
    """Speed Upper (DE) load in week 3 exceeds week 1 of the same (Intro) block by
    the Intro phase's deStep × 2 weeks."""
    _, _, _, s1 = _session(plan, 1, "Speed Upper")
    _, _, _, s3 = _session(plan, 3, "Speed Upper")

    main1 = _num(s1.exercises[0].targetSets[0].targetLoad)
    main3 = _num(s3.exercises[0].targetSets[0].targetLoad)
    assert main1 and main3

    expected_ratio = 1 + PHASE_PROGRESSION["Intro Phase"]["deStep"] * 2  # weeks 1→3
    actual_ratio = main3 / main1
    assert main3 > main1, "DE work must be heavier in week 3 than week 1"
    assert abs(actual_ratio - expected_ratio) < 0.03, (
        f"DE ratio {actual_ratio:.3f} != expected {expected_ratio:.3f}"
    )


# ── (b) ME variation rotation ─────────────────────────────────────────────────
def test_me_variation_rotates_within_block(plan):
    """The Max-Effort lower main lift is not identical across weeks 1-4 of the Intro block."""
    mains = []
    for wk in (1, 2, 3, 4):
        r = _session(plan, wk, "Heavy Lower")
        if r:
            mains.append(r[3].exercises[0].name)
    assert len(mains) >= 3
    assert len(set(mains)) > 1, f"ME main should rotate across weeks, got {mains}"
    # every rotated variation is a legitimate member of its movement pool
    for name in mains:
        assert name in ROTATION_POOLS["Squat"], f"{name} not a valid squat variation"


# ── (c) Deload actually deloads ───────────────────────────────────────────────
def test_deload_reduces_volume_and_intensity(plan):
    """Every isDeload week has fewer working sets AND lower peak load than the
    immediately-preceding week's matching session."""
    assert plan.deloadWeeks, "plan should schedule at least one deload week"
    checked = 0
    for ph, b, w in _weeks(plan):
        if not w.isDeload:
            continue
        prev = _session(plan, w.weekNumber - 1, w.sessions[0].sessionType)
        if not prev:
            continue
        dl_sess = w.sessions[0]
        prev_sess = prev[3]

        dl_sets = _work_set_count(dl_sess)
        prev_sets = _work_set_count(prev_sess)
        dl_peak = max(_work_loads(dl_sess) or [0])
        prev_peak = max(_work_loads(prev_sess) or [0])

        assert dl_sets < prev_sets, (
            f"week {w.weekNumber} deload sets {dl_sets} !< prev {prev_sets}"
        )
        assert dl_peak < prev_peak, (
            f"week {w.weekNumber} deload peak {dl_peak} !< prev {prev_peak}"
        )
        checked += 1
    assert checked >= 1


# ── (d) Phase-level intensity: peaking > intro ────────────────────────────────
def test_peaking_heavier_than_intro_same_movement(plan):
    """Speed Bench (a non-rotating DE lift) loads heavier in the Peaking phase
    than in the Intro phase for the same week-in-block."""
    peak_week = None
    for ph in plan.phases:
        if ph.phaseName == "Peaking":
            peak_week = ph.blocks[0].weeks[0].weekNumber
            break
    assert peak_week is not None

    _, _, _, intro = _session(plan, 1, "Speed Upper")
    _, _, _, peak = _session(plan, peak_week, "Speed Upper")
    assert intro.exercises[0].name == peak.exercises[0].name == "Speed Bench"

    intro_load = _num(intro.exercises[0].targetSets[0].targetLoad)
    peak_load = _num(peak.exercises[0].targetSets[0].targetLoad)
    assert peak_load > intro_load, (
        f"Peaking load {peak_load} must exceed Intro load {intro_load}"
    )


# ── (e) Determinism ───────────────────────────────────────────────────────────
def _strip_volatile(d):
    """Remove auto-generated timestamps that legitimately vary per call."""
    d = dict(d)
    d.pop("generatedAt", None)
    d.pop("lastModified", None)
    d.pop("createdAt", None)
    d.pop("updatedAt", None)
    return d


def test_generation_is_deterministic():
    """Two generations with the same planId produce identical programming."""
    a = _strip_volatile(generate_plan(_intake(), plan_id="DETERMINISM_SEED").model_dump(mode="json"))
    b = _strip_volatile(generate_plan(_intake(), plan_id="DETERMINISM_SEED").model_dump(mode="json"))
    assert a == b


# ── Per-block deloads (PART 1) ────────────────────────────────────────────────
def test_last_week_of_standard_block_is_deload(plan):
    """The final week of a standard (>2-week, non-opt-out) block is a deload, and
    the first week of the next block returns to normal (non-deload) loading."""
    from services.plan_generator import MIN_WEEKS_FOR_BLOCK_DELOAD, PHASE_NO_BLOCK_DELOAD

    checked = 0
    for ph in plan.phases:
        for b in ph.blocks:
            if b.weekCount <= MIN_WEEKS_FOR_BLOCK_DELOAD or ph.phaseName in PHASE_NO_BLOCK_DELOAD:
                continue
            weeks = sorted(b.weeks, key=lambda w: w.weekNumber)
            # last week of the block must be a deload
            assert weeks[-1].isDeload, (
                f"{ph.phaseName} {b.blockName}: last week {weeks[-1].weekNumber} not deload"
            )
            # all earlier weeks in the block are normal
            for w in weeks[:-1]:
                assert not w.isDeload, f"{b.blockName} week {w.weekNumber} unexpectedly deload"
            checked += 1
    assert checked >= 3, "expected several standard blocks to carry a deload week"


def test_loading_resumes_after_block_deload(plan):
    """After a block's deload week, the next block's first week resumes normal
    (heavier) DE loading rather than staying at deload levels."""
    # Intro block ends week 4 (deload); Base Strength block starts week 5 (normal)
    w4 = _session(plan, 4, "Speed Upper")
    w5 = _session(plan, 5, "Speed Upper")
    assert w4 and w5
    assert w4[2].isDeload and not w5[2].isDeload
    load4 = _num(w4[3].exercises[0].targetSets[0].targetLoad)
    load5 = _num(w5[3].exercises[0].targetSets[0].targetLoad)
    assert load5 > load4, f"post-deload week5 load {load5} should exceed deload week4 {load4}"

def test_injury_exclusions_hold_after_rotation():
    """With Patellar Tendinitis (blocks Box/Front/Belt squat), no rotated ME lower
    main is ever a contraindicated variation across the whole plan."""
    from services.plan_generator import _blocked_set

    injured = generate_plan(_intake(injuries=["Patellar Tendinitis"]), plan_id="INJ_SEED")
    blocked = _blocked_set(["Patellar Tendinitis"])
    assert blocked & set(ROTATION_POOLS["Squat"]), "test injury must block some squat variations"

    violations = []
    for ph, b, w in _weeks(injured):
        for s in w.sessions:
            if s.sessionType == "Heavy Lower":
                main = s.exercises[0].name
                if main in blocked:
                    violations.append((w.weekNumber, main))
    assert not violations, f"rotated ME main hit a blocked variation: {violations[:5]}"
