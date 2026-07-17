# Program Generator — Diagnostic Report

**Scope:** Investigation only. No code was changed, no `.env` was modified, no keys were written to any tracked file.
**Date of investigation:** 2026-07-17
**Focus user:** `65b8cfdd-86ad-4037-8bd2-9abd940135f6`

---

## TL;DR (read this first)

1. **The generator is NOT capping at Week 1.** Every generated plan physically contains the full **52 weeks / 7 phases / 14 blocks**, built up-front and persisted to Mongo. The "only Week 1" symptom is a **perception bug, not a scope bug**.
2. **The real defect: every week is a byte-for-byte clone.** Within a block, all 3–4 weeks are identical. Worse, loads/reps/sets are also identical **across all 14 blocks and all 7 phases** — a "Peaking" week in month 10 prescribes the exact same numbers as "Intro" week 1. There is **no load progression, no volume wave, and no exercise rotation across weeks.** Only the *week number* and the *coach-note text* change.
3. **Migration scope = every tester with a generated plan.** All **3** rule-based 52-week plans in the DB are in the identical-weeks state (14/14 blocks each). This is a **systemic generator bug**, not a one-account repair. Only the one *imported CSV* plan is exempt (it's a 1-week import, not generator output).
4. **The 404 oddity is by-design behavior + a client-side fallback**, not a data-loss bug (details in §5).
5. **Generation cost is effectively $0 and near-instant** — the plan body is pure deterministic Python. An optional RAG/LLM pass only does light metadata tweaks and is a no-op in this fork (details in §6).

---

## 1. Onboarding → Program-Build Pipeline

**Entry point:** `POST /api/profile/intake` → `submit_intake_rag()` (`server.py:5808`).

Flow:
1. Archives any existing `status:"active"` plan for the user (`saved_plans` → `status:"archived"`).
2. Resolves the goal string to a `GoalType` (case-insensitive; defaults to `STRENGTH`).
3. Builds an in-memory `UserProfile`.
4. Calls `generate_plan_with_rag(intake, _openai_client, _supabase_client)` (`services/rag_plan_generator.py:37`).
5. Sets `plan.userId`, persists via `_save_plan_to_db()` (`server.py:4591`), marks onboarding complete, upserts `db.profile`.

**`generate_plan_with_rag` (the "AI" wrapper):**
- Step 1 always calls the deterministic `generate_plan(intake)` (`services/plan_generator.py:986`) to build the entire plan body.
- Steps 2–7 are an *optional* enrichment pass: embed a few query strings (`text-embedding-3-small`), retrieve research passages from a Supabase vector table, ask `gpt-4o-mini` for **injury-based exercise swaps + up to 2 prehab additions**, and apply them.
- On *any* failure or missing client, it returns the base plan unchanged.

**Key architectural fact:** the LLM path **does not author sessions, loads, reps, or weekly progression.** It can only (a) swap an exercise name when the athlete reports an injury, and (b) append prehab movements to the first session of each week. All programming logic is deterministic code in `plan_generator.py`.

**DB writes:** `_save_plan_to_db()` writes one document per `planId` into `saved_plans` via `replace_one(upsert=True)`. The full nested `phases → blocks → weeks → sessions → exercises → targetSets` tree is stored as one document (`plan.model_dump(mode="json")`).

---

## 2. Week-Generation Scope (up-front vs on-demand)

**Verdict: fully up-front.** `generate_plan()` iterates `PHASE_TEMPLATES` and eagerly materializes every week:

```
for phase_template in phase_templates:        # 7 phases
    while weeks_remaining > 0:                 # split into ≤4-week blocks
        for w in range(block_weeks):           # each week
            for stype, cal_day in day_map:     # each training day
                session = _build_session(...)  # full exercise list built now
```

Phase templates (`PHASE_TEMPLATES_NO_COMP` / `PHASE_TEMPLATES`) sum to **52 weeks** (4+8+8+8+6+4+14), producing **7 phases** and **14 blocks**. There is **no on-demand/lazy week generation** anywhere — nothing generates "next week" later. The DB confirms every plan carries all 52 week-objects at write time (see §4).

So the "only Week 1 exists" hypothesis is **false at the data layer**. The data for weeks 2–52 is present; it's just identical to week 1.

---

## 3. Progression Logic (escalation, rotation, volume waves)

This is the core defect. **There is no per-week progression mechanism at all.**

- `_build_session(session_type, lifts, unit, week, day, block_id, goal, injuries, equipment)` receives `week`, **but `week` is only used to interpolate the coach-note string** (`_generate_coach_note`). It is **never** passed into the exercise builders.
- The builders (`_build_me_upper`, `_build_me_lower`, `_build_de_*`, `_build_re_*`, `_build_full_body`, `_build_gpp`) compute every load as a **fixed percentage of the athlete's static onboarding 1RM** (e.g. `int(bench_max * 0.7)`). They take **no week, block, or phase argument**, so they cannot escalate.
- **Rotation:** exercise selection is deterministic per (goal, injury, equipment) — it produces the *same* main lift every week. Comments like `"Rotate variation weekly"` and block metadata `"ME variations rotate weekly. DE loads increase 5%/week"` (`plan_generator.py:1094`) are **aspirational strings only** — no code implements them.
- **Volume waves / deload:** a block is flagged `is_deload` when `block_num % 4 == 0` and the last week gets `isDeload=True`, but **this flag changes no loads, reps, or sets** — the deload week's prescription is identical to the loading weeks. It's a label with no effect.
- **Cross-phase:** because loads are `% × static 1RM` with no phase multiplier, the "Peaking" phase (week ~37) prescribes the **same weights** as "Intro" (week 1).

**DB proof (identical-content check):** hashing each session's `(name, prescription, targetSets[load/reps/type/RPE])` and comparing week-over-week:

| userId (prefix) | plan | blocks | blocks w/ identical weeks | day-1 session sig phase0 vs phase3 vs phase6 |
|---|---|---|---|---|
| `65b8cfdd` | The Program — Strength (active) | 14 | **14/14** | all identical |
| `65b8cfdd` | The Program — General Strength (archived) | 14 | **14/14** | all identical |
| `dab8da9f` | The Program — General Strength (active) | 14 | **14/14** | all identical |
| `ab6f7d7b` | The Program — General Strength (active) | 14 | **14/14** | all identical |
| `5e5f0dd7` | Imported: Test CSV Plan (active) | 1 | n/a (single week) | n/a |

(One incidental single-session hash difference was seen in one plan's Block-1 Week-4 "Speed Lower"; it does not reflect any progression logic — the generator has no RNG or week-driven branch, so it is an artifact of a pre-existing plan built under a slightly older code revision. Every other week in every other block is a perfect clone.)

---

## 4. Actual DB Data Inspection — user `65b8cfdd-86ad-4037-8bd2-9abd940135f6`

The focus user has **two** plan documents in `saved_plans`:

**Plan A — active** (`The Program — Strength (Research-Optimized)`)
- `startDate=2026-05-18`, `totalWeeks=52`, `trainingDays=6`
- Structure: **7 phases, 14 blocks, 52 week-objects** (weekRange 1–52)
- All **312 sessions** have `status="planned"`
- Block-1 layout (days): Heavy Lower(1), Heavy Upper(2), Recovery/Conditioning(3), Speed Lower(4), Speed Upper(5), Recovery/Conditioning(6)
- Weeks 1/2/3/4 session signatures: **identical** (all four weeks are clones)
- Computed current week (from startDate vs today 2026-07-17): **week 9** — so the plan *is* advancing on the calendar; it just serves clone content.

**Plan B — archived** (`The Program — General Strength (Research-Optimized)`)
- `startDate=2026-07-13` (future-dated), `totalWeeks=52`, `trainingDays=3`
- Structure: **7 phases, 14 blocks, 52 week-objects**
- All **156 sessions** `status="planned"`
- Weeks 1–4 signatures: identical.

**Profile:** `training_mode="program"`, `goal="Strength"`, `currentWeek=1`.

**Structural summary of the whole `saved_plans` collection:** 5 documents / 4 distinct users — 3 generator-built 52-week plans (all broken as above) + 1 archived generator plan (broken) + 1 imported 1-week CSV plan.

---

## 5. The 404 Oddity (`/api/plan/session/today` returns 404 while the client renders a session)

**This is expected behavior, not a bug in isolation.** `get_today_session_mongo()` (`server.py:1105`) raises `404` in several legitimate cases:

1. **Free-training mode** — `if profile.training_mode == "free": raise 404` (`server.py:1111`). (User `5e5f0dd7` is in this state.)
2. **Session moved away** — a `calendar_overrides` "moved from today" with nothing moved in → 404 "rest day" (`server.py:1176`).
3. **Status filter excludes completed sessions** — every lookup path requires `session.status in [PLANNED, IN_PROGRESS]`. Once a session is marked `completed`, the endpoint skips it and can 404.
4. **No week/day resolves** — falls through to `404 "No session found for today."` (`server.py:1259`).

**Why the client still shows a session anyway:** the Today screen (`frontend/app/(tabs)/today.tsx`) is deliberately resilient to this 404:
- It renders a **hardcoded fallback session** when `getTodaySession` 404s (see the code comment at `today.tsx:3984-3986`).
- It **re-hydrates locally added exercises** from `AsyncStorage` (`ADDED_EXERCISES_KEY`) independently of the API result (`today.tsx:3987-4001`).
- The finish flow **intentionally does NOT call `finishSession`** precisely because marking `status="completed"` would make `/plan/session/today` skip the session and "return a DIFFERENT one," which previously looked like data loss (`today.tsx:5032-5071`). `db.log` is treated as the source of truth for completion, not `session.status`.

**Conclusion:** the 404 + rendered-session combination happens when the client is in a state (free mode, completed session, moved/rest day, or cold start) where the backend correctly has nothing "planned" to serve, but the client shows its fallback/cached view. It is a **contract mismatch between endpoint semantics and the client's fallback**, not evidence of missing plan data. For the focus user's active plan specifically, today (Fri / week 9) *does* resolve to a planned session, so they should not currently 404 on that plan.

---

## 6. Generation Cost / Time Profile

- **Plan body (deterministic):** pure Python loops with no I/O. Builds ~52 weeks × 3–6 sessions × ~5 exercises ≈ **1,500 exercise objects** in memory. Cost = **$0**, latency ≈ **milliseconds**.
- **RAG/LLM enrichment (optional):** at most **3 embedding calls** (`text-embedding-3-small`, 512-dim) + **1 `gpt-4o-mini` chat completion** (~1–2K input tokens, <500 output). That's a **fraction of a cent per plan**; latency is dominated by the single chat call (~2–5s). It uses two credential paths: embeddings via the raw OpenAI client (`OPENAI_API_KEY`), the chat via `emergentintegrations` (`EMERGENT_LLM_KEY`).
- **In THIS fork environment:** `OPENAI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_KEY` are **absent**. So embeddings fail → no passages → the RAG pass **no-ops and returns the base plan**. **No LLM cost is incurred here.** (The 2 existing "(Research-Optimized)" plans were clearly built in an environment where those keys *were* set.)

**Bottom line:** generation is cheap and fast today. Adding real week-to-week progression will not meaningfully change cost if it stays deterministic; only a decision to author each week via LLM would introduce real per-plan cost/latency.

---

## Environment / Key Hygiene Note (per your instruction)

- `EMERGENT_LLM_KEY` in this fork is **present and looks valid** (`sk-eme…` prefix, 30 chars, not a placeholder). It was **not** modified or written by me.
- `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY` are **not set** in this fork (see §6) — flagging rather than restoring. If you want to reproduce the production RAG cost profile or exercise the LLM path, those three need to be provided in the environment. I did **not** run any billable LLM call during this investigation.

**Repo hygiene:** this report contains only `userId`s (already in the task brief), collection/field names, structural counts, and content *hashes* — no secrets, connection strings, tokens, or user content.

---

## Recommended fix framing (for the future fix prompt — not implemented)

1. **Thread `week` (and block/phase context) into the exercise builders** so loads/reps can escalate (e.g. weekly % step, top-set intensity ramp, deload actually deloads).
2. **Implement the promised rotation** — cycle main-lift variations across weeks instead of returning the first candidate every time.
3. **Make `isDeload` functional** — reduce volume/intensity on flagged weeks.
4. **Give phases distinct intensity/volume profiles** so "Peaking" ≠ "Intro".
5. **Migration:** this is systemic — a fix must **regenerate/repair all existing generator-built plans** (3 active + 1 archived here; every tester in production), not just the focus account. Consider a one-off migration that rebuilds each active plan from its stored intake/profile with the new progression logic while preserving completed-log history.
6. **404 contract:** decide whether the Today endpoint should return the completed/most-relevant session (with a status) rather than 404, to remove the client's need for a hardcoded fallback.
