"""
services/plan_extractor.py — LLM-powered training program extraction (Prompt 7B).

Converts raw parsedText from a user-uploaded document into a full AnnualPlan
using GPT-4o. Called by POST /api/documents/{id}/build-plan.

IMPORTANT: This module is import-only at call time (never at server startup) to
avoid circular imports with server.py.
"""

import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ── Short ID helper (matches plan_generator.py convention) ───────────────────
def _id() -> str:
    return str(uuid.uuid4())[:12]


# ── Default weekly rotation fallbacks ────────────────────────────────────────
_DEFAULT_ROTATIONS: dict[int, list[str]] = {
    2: ["A", "B"],
    3: ["A", "B", "C"],
    4: ["A", "B", "A", "B"],
    5: ["A", "B", "C", "A", "B"],
    6: ["A", "B", "C", "A", "B", "C"],
}

# Day number map: training days per week → list of day numbers (1=Mon…7=Sun)
_DAY_MAPS: dict[int, list[int]] = {
    2: [1, 4],
    3: [1, 3, 5],
    4: [1, 2, 4, 5],
    5: [1, 2, 3, 5, 6],
    6: [1, 2, 3, 4, 5, 6],
}

# ── Session type inference ────────────────────────────────────────────────────
_SESSION_TYPE_KEYWORDS: list[tuple[list[str], str]] = [
    (["heavy lower", "squat", "lower body", "lower", "deadlift"], "Heavy Lower"),
    (["heavy upper", "bench", "press", "upper body", "upper", "chest"], "Heavy Upper"),
    (["speed lower", "dynamic lower", "de lower"], "Speed Lower"),
    (["speed upper", "dynamic upper", "de upper"], "Speed Upper"),
    (["rep upper", "repetition upper", "hypertrophy upper", "volume upper"], "Repetition Upper"),
    (["rep lower", "repetition lower", "hypertrophy lower", "volume lower"], "Repetition Lower"),
    (["full body", "total body", "compound", "big three"], "Full Body"),
    (["conditioning", "recovery", "gpp", "cardio", "aerobic"], "Recovery / Conditioning"),
    (["event", "strongman"], "Event Training"),
]

def _infer_session_type(name: str) -> str:
    lower = name.lower()
    for keywords, session_type in _SESSION_TYPE_KEYWORDS:
        if any(kw in lower for kw in keywords):
            return session_type
    return "Full Body"


# ── Approximate cost calculator ───────────────────────────────────────────────
def _approx_cost(input_chars: int, output_chars: int) -> float:
    """GPT-4o pricing: $5/1M input, $15/1M output tokens. ~4 chars/token."""
    input_tokens  = input_chars  / 4.0
    output_tokens = output_chars / 4.0
    return round((input_tokens * 5 + output_tokens * 15) / 1_000_000, 5)


# ── LLM system prompt ─────────────────────────────────────────────────────────
EXTRACTION_SYSTEM_PROMPT = """You are an expert strength and conditioning coach who specialises in reading training program documents and converting them into structured digital plans.

Your ONLY job is to output valid JSON matching the schema below. Never add commentary, markdown formatting, or explanation outside the JSON.

RULES:
1. Be conservative — better to extract less accurately than to hallucinate specifics.
2. Never invent exercise weights or percentages that aren't in the source text.
3. When the source is ambiguous about weekly rotation, use the simplest repeating pattern.
4. If you cannot find session exercises, still fill sessionTemplates as best you can with the exercises mentioned anywhere in the document.
5. Use the lifter profile to sanity-check intensity — if the document prescribes 5×5 @ 200kg but the lifter squats 100kg, note that in assumptions.
6. Return ALL JSON fields even if you have to leave some as defaults.

OUTPUT SCHEMA (return ONLY this JSON, nothing else):
{
  "name": "<50-char user-friendly program name>",
  "totalWeeks": <int>,
  "trainingDaysPerWeek": <int>,
  "phases": [
    {
      "name": "<phase name e.g. Accumulation>",
      "weeks": <int — number of weeks in this phase>,
      "focus": "<e.g. hypertrophy, strength, peaking, deload>"
    }
  ],
  "deloadWeeks": [<int week numbers where deload occurs>],
  "milestones": [
    {"week": <int>, "description": "<milestone description>"}
  ],
  "sessionTemplates": [
    {
      "templateId": "<single letter or short code, e.g. A, B, C>",
      "name": "<session name e.g. Heavy Lower, Upper Hypertrophy>",
      "exercises": [
        {
          "name": "<exercise name>",
          "category": "<main|supplemental|accessory|prehab>",
          "sets": <int>,
          "reps": "<e.g. 5 or 8-10 or AMRAP>",
          "intensity": "<e.g. RPE 7 or 75% or bodyweight or empty string>",
          "notes": "<optional coaching note or empty string>"
        }
      ]
    }
  ],
  "weeklyRotation": ["<templateId per training day, e.g. A, B, A, B for 4-day week>"],
  "confidence": {
    "summary": "<2-3 sentence plain-English description of what this program is and what you extracted>",
    "high": ["<list of fields extracted with high confidence>"],
    "low": ["<list of fields you had to guess or assume>"],
    "assumptions": [
      {
        "field": "<field name>",
        "what_you_assumed": "<what value you used>",
        "why": "<why you had to assume>"
      }
    ],
    "couldn_extract_sessions": <true if you could not find exercise detail, false otherwise>
  }
}"""


# ── Main extraction function ──────────────────────────────────────────────────
async def extract_plan_from_text(
    parsed_text: str,
    profile: dict,
    prs: list[dict],
    emergent_key: str,
) -> dict:
    """
    Call GPT-4o to extract a structured plan from parsedText.

    Args:
        parsed_text:   The raw text extracted from the uploaded document.
        profile:       The user's AthleteProfile dict (for context injection).
        prs:           List of the user's recent PRs (for weight sanity-checking).
        emergent_key:  The EMERGENT_LLM_KEY for emergentintegrations.

    Returns:
        dict with keys: extracted (dict), input_chars (int), output_chars (int),
                        latency_seconds (float), approx_cost_usd (float),
                        raw_llm_response (str)
    Raises:
        RuntimeError on LLM call failure.
    """
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    # ── Build profile context ────────────────────────────────────────────────
    injuries     = profile.get("injuryFlags") or []
    equipment    = profile.get("specialtyEquipment") or profile.get("gymTypes") or []
    experience   = profile.get("experience", "intermediate")
    training_days = profile.get("trainingDaysCount", 4)
    units        = profile.get("units", "lbs")

    # Build PR summary (top 6 by date)
    pr_lines: list[str] = []
    for pr in sorted(prs, key=lambda x: x.get("date", ""), reverse=True)[:6]:
        lift  = pr.get("exercise", pr.get("lift", ""))
        wt    = pr.get("weight", pr.get("1rm", ""))
        reps  = pr.get("reps", 1)
        if lift and wt:
            pr_lines.append(f"  - {lift}: {wt} {units} × {reps}")
    pr_text = "\n".join(pr_lines) if pr_lines else "  (no PRs on record)"

    # ── Truncate parsed_text to 80K chars to stay well within GPT-4o context ─
    MAX_INPUT_CHARS = 80_000
    text_to_send = parsed_text[:MAX_INPUT_CHARS]
    truncated_note = ""
    if len(parsed_text) > MAX_INPUT_CHARS:
        truncated_note = f"\n[NOTE: Document was truncated to {MAX_INPUT_CHARS} chars — {len(parsed_text) - MAX_INPUT_CHARS} chars omitted]"

    user_prompt = f"""Here is the parsed text from a training program document:

---
{text_to_send}{truncated_note}
---

The lifter's profile:
  - Experience level:     {experience}
  - Preferred training days/week: {training_days}
  - Active injuries/flags:  {', '.join(injuries) if injuries else 'None'}
  - Equipment/gym type:     {', '.join(equipment) if equipment else 'Standard barbell gym'}
  - Weight unit preference: {units}

Recent PRs (use for weight-sanity checking only — never prescribe above these):
{pr_text}

Convert this document into the JSON plan structure defined in the system prompt.
Remember: output ONLY the JSON object, no other text."""

    input_chars = len(EXTRACTION_SYSTEM_PROMPT) + len(user_prompt)
    t_start = time.time()

    chat = LlmChat(
        api_key=emergent_key,
        session_id=str(uuid.uuid4()),
        system_message=EXTRACTION_SYSTEM_PROMPT,
    ).with_model("openai", "gpt-4o")

    try:
        raw_response = await chat.send_message(UserMessage(text=user_prompt))
    except Exception as exc:
        raise RuntimeError(f"GPT-4o LLM call failed: {exc}") from exc

    latency = round(time.time() - t_start, 2)
    output_chars = len(raw_response or "")

    # ── Parse JSON from response ─────────────────────────────────────────────
    extracted = _parse_llm_json(raw_response)

    return {
        "extracted":         extracted,
        "input_chars":       input_chars,
        "output_chars":      output_chars,
        "latency_seconds":   latency,
        "approx_cost_usd":   _approx_cost(input_chars, output_chars),
        "raw_llm_response":  (raw_response or "")[:2000],  # truncate for logging
    }


def _parse_llm_json(raw: str) -> dict:
    """Extract and parse the JSON object from the LLM response."""
    if not raw:
        raise ValueError("Empty LLM response")

    # 1. Try direct parse
    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError:
        pass

    # 2. Try extracting largest JSON block with regex
    # Match outermost {...} block (handles markdown code fences too)
    raw_clean = re.sub(r"```(?:json)?", "", raw).strip()
    match = re.search(r"\{.*\}", raw_clean, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not parse JSON from LLM response. First 500 chars: {raw[:500]}")


# ── Week generation from extracted plan ──────────────────────────────────────
def build_annual_plan(
    extracted: dict,
    user_id: str,
    doc_id: str,
    override_name: Optional[str] = None,
) -> dict:
    """
    Convert the LLM-extracted plan dict into a full AnnualPlan (as a plain dict
    ready for Pydantic construction or direct MongoDB insertion).

    Returns the AnnualPlan as a dict. Caller is responsible for Pydantic
    validation via AnnualPlan(**result).

    Args:
        extracted:      The dict returned by extract_plan_from_text().extracted
        user_id:        The owning user ID.
        doc_id:         The source document ID (stored as sourceDocumentId).
        override_name:  If set, use this as the plan's display name.
    """
    from models.schemas import (
        AnnualPlan, Phase, Block, Week, Session, SessionExercise,
        TargetSet, WarmupProtocol, Milestone,
        SessionType, ExerciseCategory, PhaseStatus, SessionStatus,
    )

    plan_id        = str(uuid.uuid4())
    now            = datetime.now(timezone.utc)
    total_weeks    = max(1, int(extracted.get("totalWeeks", 12)))
    training_days  = min(6, max(1, int(extracted.get("trainingDaysPerWeek", 4))))
    deload_weeks   = set(int(w) for w in extracted.get("deloadWeeks", []) if w)
    display_name   = override_name or extracted.get("name", "Imported Program")[:50]

    # ── Session templates dict ────────────────────────────────────────────────
    templates: dict[str, dict] = {}
    for tmpl in (extracted.get("sessionTemplates") or []):
        tid = str(tmpl.get("templateId", "A")).strip()
        templates[tid] = tmpl

    has_sessions = bool(templates and any(
        t.get("exercises") for t in templates.values()
    ))

    # ── Weekly rotation ───────────────────────────────────────────────────────
    rotation = [str(r).strip() for r in (extracted.get("weeklyRotation") or [])]
    if not rotation or len(rotation) != training_days:
        rotation = _DEFAULT_ROTATIONS.get(training_days, ["A", "B", "A", "B"])

    # ── Day number map ────────────────────────────────────────────────────────
    day_numbers = _DAY_MAPS.get(training_days, _DAY_MAPS[4])

    # ── Build phases / blocks / weeks / sessions ─────────────────────────────
    phases_data = extracted.get("phases") or []
    if not phases_data:
        phases_data = [{"name": "Main Block", "weeks": total_weeks, "focus": "strength"}]

    # Normalise so phases cover exactly totalWeeks (add/trim last phase)
    declared_weeks = sum(int(p.get("weeks", 4)) for p in phases_data)
    if declared_weeks != total_weeks and phases_data:
        diff = total_weeks - declared_weeks
        phases_data[-1]["weeks"] = max(1, int(phases_data[-1].get("weeks", 4)) + diff)

    phases = []
    current_week = 1

    for ph_idx, ph_data in enumerate(phases_data):
        phase_week_count = max(1, int(ph_data.get("weeks", 4)))
        phase_id = _id()

        weeks: list = []
        for w_off in range(phase_week_count):
            week_num  = current_week + w_off
            is_deload = week_num in deload_weeks
            week_id   = _id()
            sessions: list = []

            for day_idx, day_num in enumerate(day_numbers):
                tid      = rotation[day_idx % len(rotation)]
                template = templates.get(tid, {})
                sess_id  = _id()
                exercises: list = []

                for ex_idx, ex_data in enumerate(template.get("exercises") or []):
                    sets_count = max(1, int(ex_data.get("sets", 3)))
                    if is_deload:
                        sets_count = max(1, sets_count - 1)

                    reps_str   = str(ex_data.get("reps", "8")).strip() or "8"
                    intensity  = str(ex_data.get("intensity", "")).strip()

                    # Build prescription string
                    if intensity:
                        prescription = f"{sets_count}x{reps_str} @ {intensity}"
                    else:
                        prescription = f"{sets_count}x{reps_str}"

                    # Build TargetSets
                    target_sets = []
                    for s_num in range(1, sets_count + 1):
                        target_sets.append(TargetSet(
                            setNumber=s_num,
                            targetReps=reps_str,
                            setType="work",
                            targetRPE=float(
                                re.search(r"rpe\s*(\d+\.?\d*)", intensity.lower()).group(1)
                                if re.search(r"rpe\s*(\d+\.?\d*)", intensity.lower()) else 7
                            ) if intensity else None,
                        ))

                    cat_raw = str(ex_data.get("category", "accessory")).lower()
                    cat = "main" if cat_raw == "main" else \
                          "supplemental" if cat_raw == "supplemental" else \
                          "prehab" if cat_raw == "prehab" else "accessory"

                    exercises.append(SessionExercise(
                        sessionExerciseId = _id(),
                        name              = str(ex_data.get("name", "Exercise")),
                        category          = cat,
                        prescription      = prescription,
                        targetSets        = target_sets,
                        order             = ex_idx,
                        notes             = str(ex_data.get("notes", "")),
                    ))

                sessions.append(Session(
                    sessionId   = sess_id,
                    blockId     = "",   # set below after block created
                    weekNumber  = week_num,
                    dayNumber   = day_num,
                    sessionType = _infer_session_type(template.get("name", "Full Body")),
                    objective   = template.get("name", ""),
                    coachNote   = f"Session {tid}" if tid else "",
                    exercises   = exercises,
                    status      = SessionStatus.PLANNED,
                ))

            weeks.append(Week(
                weekId     = week_id,
                blockId    = "",   # set below
                weekNumber = week_num,
                sessions   = sessions,
                isDeload   = is_deload,
            ))

        # Create block (one block per phase for imported plans)
        block_id = _id()
        # Back-fill blockId into weeks and sessions
        for wk in weeks:
            object.__setattr__(wk, "blockId", block_id) if hasattr(wk, "__setattr__") else None
            wk.__dict__["blockId"] = block_id
            for sess in wk.sessions:
                sess.__dict__["blockId"] = block_id

        block = Block(
            blockId          = block_id,
            phaseId          = phase_id,
            blockName        = ph_data.get("name", f"Block {ph_idx + 1}"),
            blockNumber      = ph_idx + 1,
            blockGoal        = str(ph_data.get("focus", "")),
            weekCount        = phase_week_count,
            weeks            = weeks,
        )

        phases.append(Phase(
            phaseId           = phase_id,
            planId            = plan_id,
            phaseName         = str(ph_data.get("name", f"Phase {ph_idx + 1}")),
            phaseNumber       = ph_idx + 1,
            goal              = str(ph_data.get("focus", "")),
            expectedAdaptation= str(ph_data.get("focus", "")),
            startWeek         = current_week,
            endWeek           = current_week + phase_week_count - 1,
            blocks            = [block],
        ))

        current_week += phase_week_count

    # ── Milestones ───────────────────────────────────────────────────────────
    milestones = []
    for ms in (extracted.get("milestones") or []):
        milestones.append(Milestone(
            name        = str(ms.get("description", "Milestone")),
            targetDate  = "",
            targetValue = f"Week {ms.get('week', 1)}",
        ))

    # ── Assemble AnnualPlan ──────────────────────────────────────────────────
    plan = AnnualPlan(
        planId           = plan_id,
        userId           = user_id,
        planName         = f"Imported: {display_name}",
        name             = display_name,
        startDate        = now.strftime("%Y-%m-%d"),
        totalWeeks       = total_weeks,
        trainingDays     = training_days,
        phases           = phases,
        deloadWeeks      = sorted(deload_weeks),
        milestones       = milestones,
        status           = "active",
        createdAt        = now,
        lastModified     = now,
        generatedAt      = now,
        sourceDocumentId = doc_id,
    )

    plan_dict = plan.model_dump(mode="json")
    plan_dict["_has_sessions"] = has_sessions   # metadata for response only
    return plan_dict


# ── Logging helper ────────────────────────────────────────────────────────────
async def log_extraction(
    db,
    user_id: str,
    doc_id: str,
    input_chars: int,
    output_chars: int,
    latency_seconds: float,
    approx_cost_usd: float,
    success: bool,
    skeleton_mode: bool,
) -> None:
    """Write extraction metadata to db.llm_extractions."""
    try:
        record = {
            "userId":           user_id,
            "documentId":       doc_id,
            "inputChars":       input_chars,
            "outputChars":      output_chars,
            "inputTokensApprox":  round(input_chars  / 4),
            "outputTokensApprox": round(output_chars / 4),
            "latencySeconds":   latency_seconds,
            "approxCostUsd":    approx_cost_usd,
            "success":          success,
            "skeletonMode":     skeleton_mode,
            "createdAt":        datetime.now(timezone.utc),
        }
        await db.llm_extractions.insert_one(record)

        # Warn if over thresholds
        if latency_seconds > 90:
            logger.warning(
                "[LLM EXTRACT] SLOW extraction: user=%s doc=%s latency=%.1fs",
                user_id, doc_id, latency_seconds,
            )
        if approx_cost_usd > 0.50:
            logger.warning(
                "[LLM EXTRACT] HIGH COST extraction: user=%s doc=%s cost=$%.3f",
                user_id, doc_id, approx_cost_usd,
            )

        logger.info(
            "[LLM EXTRACT] user=%s doc=%s in=%d out=%d latency=%.1fs cost=$%.4f success=%s skeleton=%s",
            user_id, doc_id, input_chars, output_chars,
            latency_seconds, approx_cost_usd, success, skeleton_mode,
        )
    except Exception as exc:
        logger.warning("[LLM EXTRACT] Failed to log extraction: %s", exc)
