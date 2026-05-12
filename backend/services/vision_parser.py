"""
Vision-based workout-log image parser.

Strategy pattern: dispatches to OpenAI or Anthropic based on the model arg.
Returns a list of parsed exercises matching the schema the frontend already
uses for /api/log/session-bulk.
"""

import base64
import json
import os
from typing import List, Optional
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

Rules:
- prescriptionType is one of: weighted, timed, distance, height, calories, emom, amrap, for_time
- weighted sets have {weight, reps, rpe?}
- timed sets have {duration, unit: "sec"|"min", rpe?}
- distance sets have {distance, unit: "ft"|"m"|"yd", load?, rpe?}
- height sets have {heightVal, unit: "in"|"cm", rpe?}
- calories sets have {calories, rpe?}
- emom/amrap/for_time sets have {weight?, reps?, duration?, rpe?}
- Numeric fields may be null if not visible. RPE is optional, often missing.
- If you cannot identify any exercises (image is unreadable, irrelevant, blank), return {"exercises": []}.
- Use the units shown in the image (lbs vs kg — backend handles conversion).
- Combine multiple sets of the same exercise into one entry with multiple sets.
"""


async def _openai_parse(image_bytes: bytes, model: str) -> List[dict]:
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
    return parsed.get("exercises", [])


async def parse_workout_image(image_bytes: bytes, model: str = "gpt-4o-mini") -> List[dict]:
    """
    Returns a list of exercise dicts matching the prescription schema.
    Caller is responsible for credit management and refund-on-empty-result.
    """
    if model.startswith("gpt"):
        return await _openai_parse(image_bytes, model)
    # Future: claude support
    raise ValueError(f"Unsupported vision model: {model}")
