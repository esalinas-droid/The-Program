"""
Vision-based workout-log image parser.

Strategy pattern: dispatches to Claude (default) or OpenAI based on the model arg.
Returns a structured dict with session metadata + exercises, matching the
schema the frontend uses for /api/log/session-bulk.

Model routing:
  "claude-*"  → emergentintegrations LlmChat (EMERGENT_LLM_KEY)
  "gpt-*"     → AsyncOpenAI (OPENAI_API_KEY)
"""

import base64
import json
import os
import uuid
from typing import Dict, Optional
from openai import AsyncOpenAI
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

_openai: Optional[AsyncOpenAI] = None

_TRANSCRIBE_MSG = (
    "Transcribe this single workout session exactly as shown. "
    "Return only the JSON object — no commentary, no markdown fences."
)

_EMERGENT_MODEL_PROVIDER = "anthropic"
_CLAUDE_MODEL_ID = "claude-sonnet-4-5-20250929"  # full dated ID used by existing coach code


def _get_openai() -> AsyncOpenAI:
    global _openai
    if _openai is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY env var not set")
        _openai = AsyncOpenAI(api_key=api_key)
    return _openai


def _get_emergent_key() -> str:
    key = os.getenv("EMERGENT_LLM_KEY", "")
    if not key:
        raise RuntimeError("EMERGENT_LLM_KEY env var not set")
    return key


SYSTEM_PROMPT = """You are a session-log transcriber for a fitness app's tracker mode. A user has uploaded ONE image of ONE workout session they performed (or will perform today). Your job is one-to-one transcription of exactly what is visible in that image — nothing more.

CRITICAL CONCEPTUAL FRAME:
- You are NOT designing a workout.
- You are NOT completing a partial workout.
- You are NOT filling in what "should" be there.
- You are NOT interpreting program context.
- You ARE transcribing a single session as a log entry.

Even if the image is clearly part of a larger weekly program (e.g. labeled "Tuesday", "Day 2", "Week 9 — ME Upper", or part of a multi-day spreadsheet), your output represents ONLY that one day's exercises as transcribed. Do not extrapolate from the program context. Do not add "typical" Tuesday exercises. Do not complete patterns. The user wants to log what they did or are doing — not what a program designer would prescribe.

If the image shows 4 exercises, return 4 exercises. Never 5. Never 3. If a section is sparse or shows only main lifts, that's correct — return only those main lifts. Sparse is fine; complete is wrong if "complete" required invention.

Now parse the image into STRICT JSON in this shape — no commentary, no markdown fences:
{
  "session_title": "Week 9 — Tuesday — ME Upper",
  "session_date": null,
  "confidence": "high",
  "exercises": [
    {
      "name": "Back squat",
      "prescriptionType": "weighted",
      "sets": [
        {"weight": 135, "reps": 5, "rpe": null},
        {"weight": 185, "reps": 5, "rpe": null}
      ]
    }
  ]
}

─── SESSION METADATA RULES ───────────────────────────────────────────────────
- session_title: copy the most prominent heading text VERBATIM from the image
  (e.g. "Push Day", "Week 3 — Day 2", "ME Upper"). If no clear heading: null.
  The title MUST come from actual image text — do NOT invent or categorize.
  If the image says "ME Upper", return "ME Upper" — not "Full Body" or "Upper Body Day".
- session_date: ISO format (YYYY-MM-DD) if a specific date is visible in the image.
  If only relative text is present ("today", "Tuesday", "Week 9"): null.
- confidence: "high" if the image is clear and all exercises are unambiguous.
  "medium" if some fields had to be inferred or the image shows multiple days.
  "low" if significant guesswork was required or no exercises could be found.

─── EXERCISE SCHEMA RULES ────────────────────────────────────────────────────
- prescriptionType is one of: weighted, timed, distance, height, calories, emom, amrap, for_time
- weighted sets have {weight, reps, rpe?}
- timed sets have {duration, unit: "sec"|"min", rpe?}
- distance sets have {distance, unit: "ft"|"m"|"yd", load?, rpe?}
- height sets have {heightVal, unit: "in"|"cm", rpe?}
- calories sets have {calories, rpe?}
- emom/amrap/for_time sets have {weight?, reps?, duration?, rpe?}
- Numeric fields may be null if not visible. RPE is optional, often missing.
- Use the units shown in the image (lbs vs kg — backend handles conversion).
- Combine multiple sets of the same exercise into one entry with multiple sets.

─── ANTI-HALLUCINATION GROUNDING RULES ──────────────────────────────────────
- Extract ONLY what is clearly visible in the image. Do NOT add common exercises
  that "usually go with" what you see. Do NOT fill in missing sets/reps with
  "typical" values. If a field is unreadable, return null for it — not a guess.
- If the image shows MULTIPLE workout days or sections (e.g. "Monday" and
  "Tuesday" both visible), parse ONLY the day/section that takes up the most
  visible space or is most clearly the focus. Set confidence="medium" and append
  " (1 of 2 days visible)" to the session_title (e.g. "Tuesday (1 of 2 days visible)").
- If you cannot find exercises but can see the page is a workout log (vs an
  irrelevant image), return an empty exercises array AND confidence="low".
- If the image is completely unrelated to fitness (a landscape, receipt, etc.),
  return {"session_title": null, "session_date": null, "confidence": "low", "exercises": []}.
- DO NOT add warmup, cooldown, mobility, or stretch sections unless they are
  EXPLICITLY listed in the image with named exercises and reps/duration. If the
  image shows main lifts only, return main lifts only. It is correct and expected
  for a parsed workout to have no warmup or cooldown — most written programs only
  list the working sets.
- DO NOT add "common" finisher exercises (e.g. abs, cardio, foam rolling) unless
  they are visibly written in the image.
- If you find yourself about to add an exercise because it "usually goes" with
  the others, STOP. Return only what is verifiably visible.
- Preserve the visual top-to-bottom order of exercises from the image. The order
  in your "exercises" array MUST match the reading order of the image (top first,
  bottom last). Do not group, reorganize, or sort exercises.
"""


def _empty_result() -> Dict:
    return {"session_title": None, "session_date": None, "confidence": "low", "exercises": []}


async def _claude_parse(image_bytes: bytes, model: str) -> Dict:
    """Parse via Claude through emergentintegrations (uses EMERGENT_LLM_KEY)."""
    b64 = base64.b64encode(image_bytes).decode("ascii")
    chat = LlmChat(
        api_key=_get_emergent_key(),
        session_id=str(uuid.uuid4()),
        system_message=SYSTEM_PROMPT,
    ).with_model(_EMERGENT_MODEL_PROVIDER, _CLAUDE_MODEL_ID)

    response_text: str = await chat.send_message(
        UserMessage(
            text=_TRANSCRIBE_MSG,
            file_contents=[ImageContent(image_base64=b64)],
        )
    )

    # Strip markdown fences if Claude wraps the JSON
    content = response_text.strip()
    if content.startswith("```"):
        parts = content.split("```")
        content = parts[1] if len(parts) > 1 else content
        if content.startswith("json"):
            content = content[4:]
        content = content.strip()

    parsed = json.loads(content)
    return {
        "session_title": parsed.get("session_title"),
        "session_date":  parsed.get("session_date"),
        "confidence":    parsed.get("confidence", "low"),
        "exercises":     parsed.get("exercises") or [],
    }


async def _openai_parse(image_bytes: bytes, model: str) -> Dict:
    b64 = base64.b64encode(image_bytes).decode("ascii")
    client = _get_openai()
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": [
                {"type": "text", "text": _TRANSCRIBE_MSG},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            ]},
        ],
        response_format={"type": "json_object"},
        max_tokens=1500,
    )
    content = response.choices[0].message.content or "{}"
    parsed = json.loads(content)
    return {
        "session_title": parsed.get("session_title"),
        "session_date":  parsed.get("session_date"),
        "confidence":    parsed.get("confidence", "low"),
        "exercises":     parsed.get("exercises") or [],
    }


async def parse_workout_image(image_bytes: bytes, model: str = "claude-sonnet-4-5") -> Dict:
    """
    Returns a dict with {session_title, session_date, confidence, exercises}.
    Caller is responsible for credit management and refund-on-empty-result.
    """
    if model.startswith("claude"):
        return await _claude_parse(image_bytes, model)
    if model.startswith("gpt"):
        return await _openai_parse(image_bytes, model)
    raise ValueError(f"Unsupported vision model: {model}")
