"""
Vision-based workout-log image parser.

Strategy pattern: dispatches to OpenAI or Anthropic based on the model arg.
Returns a structured dict with session metadata + exercises, matching the
schema the frontend uses for /api/log/session-bulk.
"""

import base64
import json
import os
from typing import Dict, List, Optional
from openai import AsyncOpenAI

_openai: Optional[AsyncOpenAI] = None


def _get_openai() -> AsyncOpenAI:
    global _openai
    if _openai is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY env var not set")
        _openai = AsyncOpenAI(api_key=api_key)
    return _openai


SYSTEM_PROMPT = """You are parsing a workout-log image into structured data.

Return STRICT JSON in this shape — no commentary, no markdown fences:
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
"""


def _empty_result() -> Dict:
    return {"session_title": None, "session_date": None, "confidence": "low", "exercises": []}


async def _openai_parse(image_bytes: bytes, model: str) -> Dict:
    b64 = base64.b64encode(image_bytes).decode("ascii")
    client = _get_openai()
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": [
                {"type": "text", "text": "Parse this workout log."},
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
        "session_date": parsed.get("session_date"),
        "confidence": parsed.get("confidence", "low"),
        "exercises": parsed.get("exercises") or [],
    }


async def parse_workout_image(image_bytes: bytes, model: str = "gpt-4o") -> Dict:
    """
    Returns a dict with {session_title, session_date, confidence, exercises}.
    Caller is responsible for credit management and refund-on-empty-result.
    """
    if model.startswith("gpt"):
        return await _openai_parse(image_bytes, model)
    # Future: claude support
    raise ValueError(f"Unsupported vision model: {model}")
