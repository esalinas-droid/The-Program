"""
RAG-Enhanced Plan Generator (Task 2 — Phase 2 Batch 2)
=======================================================
Augments the base rule-based plan with evidence-based recommendations
retrieved from the Supabase vector knowledge base.

Gracefully falls back to the base plan if RAG or AI is unavailable.
"""
import os
import json
import re
import uuid
import logging

logger = logging.getLogger(__name__)


async def _query_rag(query: str, openai_client, supabase_client, count: int = 3) -> list:
    """Query Supabase vector DB for relevant research passages."""
    try:
        emb = await openai_client.embeddings.create(
            model='text-embedding-3-small',
            input=query,
            dimensions=512,
        )
        embedding = emb.data[0].embedding
        result = supabase_client.rpc(
            'match_documents',
            {'query_embedding': embedding, 'match_threshold': 0.3, 'match_count': count},
        ).execute()
        return result.data or []
    except Exception as e:
        logger.warning(f"[RAG] Query failed for '{query[:50]}': {e}")
        return []


async def generate_plan_with_rag(intake, openai_client, supabase_client):
    """
    Generate a training plan augmented with RAG knowledge retrieval.

    Steps:
      1. Generate the base rule-based plan (always succeeds)
      2. Build queries based on injuries + goal
      3. Retrieve relevant research passages from Supabase
      4. Ask AI for evidence-based exercise recommendations
      5. Apply modifications to the plan
      6. Return the enriched plan (or base plan on any failure)

    Args:
        intake: IntakeRequest pydantic model
        openai_client: AsyncOpenAI instance (or None)
        supabase_client: Supabase client instance (or None)

    Returns:
        AnnualPlan — either RAG-enriched or base fallback
    """
    from services.plan_generator import generate_plan

    # Step 1: Always generate the base plan first (safe fallback)
    plan = generate_plan(intake)
    logger.info(f"[RAG Plan] Base plan: {plan.planName}")

    # Step 2: Skip RAG if AI clients are unavailable
    if not openai_client or not supabase_client:
        logger.warning("[RAG Plan] AI clients unavailable — returning base plan")
        return plan

    # Step 3: Build contextual RAG queries
    injuries_list = [i for i in (intake.injuries or []) if i and i.lower() not in ("none", "")]
    goal = (intake.goal or "strength").lower()

    queries = []
    if injuries_list:
        injury_str = ", ".join(injuries_list)
        queries.append(f"exercise modifications for athletes with {injury_str}")
        queries.append(f"safe training protocols powerlifting {injury_str}")
    else:
        queries.append("optimal powerlifting accessory work injury prevention")

    goal_queries = {
        "strength":     "maximal strength development periodization program powerlifting",
        "strongman":    "strongman competition training event specificity programming",
        "powerlifting": "powerlifting competition peaking program structure",
        "hypertrophy":  "muscle hypertrophy volume load progressive overload",
        "athletic":     "athletic performance strength power speed training",
        "general":      "general strength conditioning progressive overload",
    }
    queries.append(goal_queries.get(goal, goal_queries["strength"]))

    # Step 4: Query RAG (max 3 queries to control latency)
    all_passages: list = []
    seen_ids: set = set()
    for q in queries[:3]:
        passages = await _query_rag(q, openai_client, supabase_client, count=3)
        for p in passages:
            pid = p.get('id')
            if pid and pid not in seen_ids:
                seen_ids.add(pid)
                all_passages.append(p)

    if not all_passages:
        logger.warning("[RAG Plan] No passages found — returning base plan")
        return plan

    logger.info(f"[RAG Plan] Retrieved {len(all_passages)} unique passages")

    # Step 5: Build AI prompt with RAG context
    rag_context = "\n\n".join([
        f"[Research {i + 1}]\n{p.get('content', '')[:350]}"
        for i, p in enumerate(all_passages[:5])
    ])

    injuries_str = ", ".join(injuries_list) if injuries_list else "None"

    current_program_section = ""
    if intake.currentProgram and intake.currentProgram.strip():
        current_program_section = f"\n- Current Program: {intake.currentProgram.strip()[:1000]}"

    prompt = f"""Based on the sports science research below, suggest evidence-based adjustments for this athlete's training plan.

ATHLETE PROFILE:
- Goal: {goal}
- Experience: {intake.experience or 'intermediate'}
- Injuries/Limitations: {injuries_str}
- Training frequency: {intake.frequency or 4} days/week
- 1RMs: Squat {getattr(intake.lifts, 'squat', None) or 'unknown'}, Bench {getattr(intake.lifts, 'bench', None) or 'unknown'}, Deadlift {getattr(intake.lifts, 'deadlift', None) or 'unknown'} {intake.liftUnit}{current_program_section}

RESEARCH CONTEXT:
{rag_context}

Return ONLY a JSON object — no markdown, no explanation:
{{
  "exercise_adjustments": [
    {{"original": "exercise_name_in_plan", "replacement": "better_alternative", "reason": "brief reason under 15 words", "category": "main"}}
  ],
  "prehab_additions": [
    {{"name": "prehab_exercise", "prescription": "3x15", "reason": "injury prevention rationale"}}
  ],
  "rag_coach_note": "One sentence research-backed note for this athlete"
}}

Rules:
- ONLY suggest exercise_adjustments when athlete has injuries (injuries_str != "None")
- If athlete provided a Current Program description, prioritize exercises and structure from their existing program in your recommendations
- Max 3 exercise_adjustments, max 2 prehab_additions
- category values: main, supplemental, accessory, or prehab
- If no injury-based adjustments needed, return empty exercise_adjustments array
- Keep exercise names concise and realistic"""

    # Step 6: Call AI
    try:
        emergent_key = os.environ.get('EMERGENT_LLM_KEY', '')
        if not emergent_key:
            logger.warning("[RAG Plan] No EMERGENT_LLM_KEY — returning base plan")
            return plan

        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=emergent_key,
            session_id=str(uuid.uuid4()),
            system_message="You are an expert sports scientist providing evidence-based training recommendations. Return ONLY valid JSON with no markdown.",
        ).with_model("openai", "gpt-4o-mini")

        raw = await chat.send_message(UserMessage(text=prompt))

        # Extract JSON from response (guard against markdown wrapping)
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if not json_match:
            logger.warning(f"[RAG Plan] AI response not JSON: {raw[:120]}")
            return plan

        recs = json.loads(json_match.group())
        adj_count = len(recs.get('exercise_adjustments', []))
        pre_count = len(recs.get('prehab_additions', []))
        logger.info(f"[RAG Plan] AI: {adj_count} adjustments, {pre_count} prehab")

    except Exception as e:
        logger.warning(f"[RAG Plan] AI call failed: {e} — returning base plan")
        return plan

    # Step 7: Apply recommendations safely
    try:
        plan = _apply_rag_recommendations(plan, recs)
        return plan
    except Exception as e:
        logger.warning(f"[RAG Plan] Apply failed: {e} — regenerating base plan")
        from services.plan_generator import generate_plan as _gen
        return _gen(intake)


def _apply_rag_recommendations(plan, recs: dict):
    """
    Apply RAG-AI exercise recommendations to the plan in place.
    Swaps exercises, adds prehab, annotates the plan name.
    """
    from models.schemas import SessionExercise, ExerciseCategory, TargetSet

    exercise_adjustments = recs.get("exercise_adjustments") or []
    prehab_additions = recs.get("prehab_additions") or []

    adjustments_applied = 0
    prehab_added: set = set()  # track sessions that already got prehab

    for phase in plan.phases:
        for block in phase.blocks:
            for week in block.weeks:
                for session in week.sessions:

                    # ── Exercise swaps ────────────────────────────────────────
                    for ex in session.exercises:
                        for adj in exercise_adjustments:
                            orig = (adj.get("original") or "").lower().strip()
                            if orig and orig in ex.name.lower():
                                ex.adjustedFrom = ex.name
                                ex.name = adj.get("replacement", ex.name)
                                ex.adjustmentReason = adj.get("reason", "RAG-based adjustment")
                                reason_note = adj.get("reason", "")
                                if reason_note:
                                    ex.notes = (ex.notes or "") + f" [Research: {reason_note}]"
                                adjustments_applied += 1
                                break  # one swap per exercise

                    # ── Prehab additions (first session of each week only) ────
                    week_key = f"w{week.weekNumber}"
                    if prehab_additions and week_key not in prehab_added and week.sessions and session == week.sessions[0]:
                        for pb in prehab_additions:
                            pb_name = (pb.get("name") or "").strip()
                            if not pb_name:
                                continue
                            # Skip duplicate prehab
                            if any(pb_name.lower() in e.name.lower() for e in session.exercises):
                                continue

                            prescription = pb.get("prescription", "3x15")
                            try:
                                sets_str, reps_str = prescription.split("x", 1)
                                num_sets = int(re.sub(r'[^0-9]', '', sets_str) or "3")
                                num_reps = re.sub(r'[^0-9\-]', '', reps_str) or "15"
                                num_reps_clean = re.sub(r'[^0-9]', '', num_reps) or "15"
                            except Exception:
                                num_sets = 3
                                num_reps_clean = "15"

                            pb_ex = SessionExercise(
                                sessionExerciseId=str(uuid.uuid4())[:12],
                                name=pb_name,
                                category=ExerciseCategory.PREHAB,
                                prescription=prescription,
                                notes=pb.get("reason", "Evidence-based prehab"),
                                order=len(session.exercises) + 1,
                                targetSets=[
                                    TargetSet(
                                        setNumber=j + 1,
                                        targetReps=num_reps_clean,
                                        setType="work",
                                    )
                                    for j in range(num_sets)
                                ],
                            )
                            session.exercises.append(pb_ex)
                        prehab_added.add(week_key)

    # Mark plan as AI-optimized
    if adjustments_applied > 0 or prehab_additions:
        plan.planName = f"{plan.planName} (Research-Optimized)"

    logger.info(
        f"[RAG Plan] Applied {adjustments_applied} swaps, "
        f"{len(prehab_additions)} prehab types across {len(prehab_added)} weeks"
    )
    return plan
