# The Program — PRD & Architecture Reference

**Last Updated:** June 2025
**Status:** Beta — Phase 2 COMPLETE (All Batches 1–3 verified, 34/34 QA tests passing)

---

## OVERVIEW

The Program is a mobile-first conjugate method strongman training app for advanced athletes. Built with React Native / Expo, FastAPI backend, MongoDB storage, and a Supabase RAG vector database powering an AI coaching assistant.

**Primary athlete:** Eric — Advanced/Elite strongman competitor
**Program:** 52-week conjugate periodization, 6 days/week, 312 total sessions

---

## TECH STACK

| Layer | Technology |
|-------|-----------|
| Frontend | React Native / Expo SDK 54, Expo Router v3 (file-based routing) |
| Backend | FastAPI (Python), Uvicorn, Motor (async MongoDB driver) |
| Database | MongoDB (local) |
| Vector DB | Supabase (PostgreSQL + pgvector) — 3,804 chunks, 37 books |
| AI Coach | Claude Sonnet 4.5 via emergentintegrations + sentence-transformers all-MiniLM-L6-v2 |
| Notifications | expo-notifications |
| Storage | @react-native-async-storage/async-storage (local cache) |
| Share | react-native-view-shot + expo-sharing |

---

## ARCHITECTURE

```
/app
├── backend/
│   ├── server.py          — FastAPI app, all endpoints, RAG pipeline
│   └── .env               — MONGO_URL, DB_NAME, EMERGENT_LLM_KEY, SUPABASE_URL, SUPABASE_KEY
└── frontend/
    ├── app/               — Expo Router screens (file-based)
    │   ├── _layout.tsx    — Root stack layout, seed on startup, notifications setup
    │   ├── index.tsx      — Entry: checks onboarding → redirects to /onboarding or /(tabs)
    │   ├── settings.tsx   — Settings modal (units, notifications, Lose It, reset)
    │   ├── onboarding/    — 6-step onboarding wizard (pre-filled with Eric's data)
    │   │   ├── index.tsx  — Step 1: Athlete Info
    │   │   ├── step2.tsx  — Step 2: Bodyweight Goals
    │   │   ├── step3.tsx  — Step 3: Baseline PRs
    │   │   ├── step4.tsx  — Step 4: Injury & Weakness Profile
    │   │   ├── step5.tsx  — Step 5: Program Start
    │   │   └── step6.tsx  — Step 6: Nutrition Connect (Lose It placeholder)
    │   ├── (tabs)/        — Bottom tab navigation (5 tabs)
    │   │   ├── _layout.tsx
    │   │   ├── index.tsx  — Dashboard (Home)
    │   │   ├── today.tsx  — Today's Session + Week View
    │   │   ├── log.tsx    — Workout Log entry + history
    │   │   ├── track.tsx  — PR table + line charts + bodyweight chart
    │   │   └── tools.tsx  — Tools hub menu
    │   └── tools/         — Tool sub-screens
    │       ├── coach.tsx  — Pocket Coach (AI chat with RAG)
    │       ├── calculator.tsx
    │       ├── converter.tsx
    │       ├── barguide.tsx
    │       ├── checkin.tsx
    │       └── library.tsx
    └── src/
        ├── constants/theme.ts     — Full design system (black/gold palette)
        ├── types/index.ts         — TypeScript interfaces
        ├── utils/
        │   ├── api.ts             — All backend API calls
        │   ├── storage.ts         — AsyncStorage helpers
        │   ├── calculations.ts    — e1RM, plate math, unit conversion, program utils
        │   └── notifications.ts   — expo-notifications scheduling (4 notification types)
        └── data/
            ├── programData.ts     — Algorithmic 52-week program generator
            └── exerciseList.ts    — 112 exercises, session types, dropdown options
```

---

## DATA MODELS

### AthleteProfile (MongoDB + AsyncStorage)
```
name, experience, currentBodyweight, bw12WeekGoal, bwLongRunGoal,
basePRs{}, injuryFlags[], avoidMovements[], weaknesses[],
currentWeek, programStartDate, units, onboardingComplete,
notifications{dailyReminder, dailyReminderTime, deloadAlert, prAlert, weeklyCheckin},
loseitConnected
```

### WorkoutLogEntry (MongoDB)
```
date, week, day, sessionType, exercise, sets, weight, reps,
rpe, pain, completed, bodyweight?, notes?, flag?, e1rm, createdAt
```

### CheckIn (MongoDB)
```
week, date, avgPain, avgRPE, completionRate, avgBodyweight,
avgCalories?, avgProtein?, avgCarbs?, avgFat?,
personalNotes, recommendations[], createdAt
```

---

## API ENDPOINTS

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/seed | Seed Eric's profile on first launch |
| GET | /api/profile | Get athlete profile |
| POST | /api/profile | Create/update profile |
| PUT | /api/profile | Update profile fields |
| GET | /api/log | List log entries (filter: week, exercise, session_type) |
| POST | /api/log | Create log entry (auto-calculates e1rm) |
| PUT | /api/log/{id} | Update log entry |
| DELETE | /api/log/{id} | Delete log entry |
| GET | /api/log/stats/week/{n} | Week stats (avgPain, avgRPE, completionRate) |
| GET | /api/prs | All PRs for 21 tracked exercises |
| GET | /api/prs/bests/overview | Best e1RM by category (squat/press/pull) |
| GET | /api/prs/{exercise} | PR history for one exercise |
| GET | /api/bodyweight | Bodyweight history from log |
| GET | /api/checkin | List all check-ins |
| POST | /api/checkin | Create weekly check-in |
| GET | /api/checkin/week/{n} | Get check-in for a specific week |
| POST | /api/coach/chat | RAG-powered AI coach chat |

---

## POCKET COACH RAG PIPELINE

1. User sends message via `POST /api/coach/chat`
2. Backend generates embedding using `sentence-transformers/all-MiniLM-L6-v2`
3. Supabase `match_documents` RPC retrieves top 5 relevant passages from 3,804 chunks (37 books)
4. System prompt assembled with: athlete profile + current week/block/phase + last 5 log entries + retrieved passages
5. Claude Sonnet 4.5 (via emergentintegrations) generates response with source citations
6. Frontend displays coach bubble with source citations below

**Supabase table:** `document_chunks` — columns: id, title, page, content, embedding (vector 384-dim)
**Model:** `all-MiniLM-L6-v2` — loaded once at server startup, cached in memory

---

## PROGRAM DATA — 52-WEEK GENERATION

Program data is generated algorithmically in `src/data/programData.ts`:

- **Deload weeks:** 4, 8, 12, 20, 24, 28, 32, 36, 40, 44, 48, 52
- **Wave position** per week: Intro → Build → Peak → Deload (cycles)
- **ME Lower rotation:** SSB (pos1) → Cambered (pos2) → Trap Bar (pos3) → Belt Squat (deload)
- **ME Upper rotation:** Floor Press (pos1) → CGBP (pos2) → Log C&P (pos3) → CGBP/Floor (deload)
- **Wednesday:** Always Boxing/Recovery/Mobility (fixed protocol)
- **Intensity scaling** by block: RPE 7 (Block 1) → RPE 8-8.5 (Block 6), top 5 → top 3 sets
- **7 blocks:** Rebuild/Recomp → Build Strength → Intensify → Volume-Strength → Strength Emphasis → Event/Peak Prep → Flexible/Pivot

---

## NOTIFICATION SYSTEM

| Type | Trigger | Content |
|------|---------|---------|
| Daily Training Reminder | Daily at user-set time | Tomorrow's session type + main lift |
| Deload Week Alert | Monday of deload weeks (dates pre-calculated from programStartDate) | "Keep intensity low, move well." |
| Weekly Check-In Reminder | Every Sunday 7pm | "Time for your weekly check-in." |
| PR Alert | Immediately when flag = "✓ PR" on log entry | "New PR 🏆 — {exercise}: {weight} lbs. e1RM {e1rm} lbs." |

All toggleable individually in Settings. Scheduling via `expo-notifications` (DailyTrigger / DateTrigger / WeeklyTrigger / immediate null trigger).

---

## COLOR SYSTEM (Black & Gold Theme)

```
Background primary:    #0D0D0D
Background cards:      #1A1A1A
Background elevated:   #242424
Accent gold:           #C9A84C
Accent light gold:     #E8C96A
Accent blue:           #2E75B6
Border:                #2A2A2A
Text primary:          #FFFFFF
Text secondary:        #AAAAAA
Text muted:            #666666
```

Session colors use dark tinted backgrounds + left border:
- ME Lower: `#1A1200` bg, gold border
- ME Upper: `#1A1500` bg, light gold border
- DE Lower: `#001A0D` bg, green border
- DE Upper: `#000D1A` bg, blue border
- Strongman Event: `#0D001A` bg, purple border
- Boxing/Recovery: `#1A0D00` bg, amber border
- Deload: `#141414` bg, gray border

---

## ATHLETE PROFILE — PRE-LOADED (ERIC)

| Field | Value |
|-------|-------|
| Name | Eric |
| Experience | Advanced |
| Current BW | 274 lbs |
| 12-Week Goal | 255 lbs |
| Long-Run Goal | 230 lbs |
| Current Week | 1 |
| Program Start | March 16, 2026 |
| Injury Flags | Right hamstring/nerve compression, Low back, Left knee |
| Weaknesses | Hip drive, Core stability, Conditioning/recovery |
| Avoid | Stone to shoulder, Very low box squats, Aggressive floor pulls |
| Back Squat e1RM | 500 lbs |
| Bench Press e1RM | ~400 lbs |
| Log Press | 285 × 1 |
| Yoke | 740 lbs × 40 ft |
| Farmers | 220 lbs/hand |
| SSB Box Squat | 405 lbs |

---

## PHASES COMPLETED

| Phase | Status | Date |
|-------|--------|------|
| Phase 1 — Black/Gold color overhaul | ✅ Complete | March 2026 |
| Phase 2 — Pocket Coach RAG + Supabase + Claude | ✅ Complete | March 2026 |
| Phase 3A — Injury warning banners on Today screen | ✅ Complete | March 2026 |
| Phase 3B — Log This Session pre-fill | ✅ Complete | March 2026 |
| Push notifications (4 types, individually toggleable) | ✅ Complete | March 2026 |
| Onboarding (6 steps, pre-filled Eric's data) | ✅ Complete | March 2026 |
| Dashboard (all sections, mock Lose It nutrition) | ✅ Complete | March 2026 |
| Today's Session + Week View | ✅ Complete | March 2026 |
| Workout Log (entry form, live e1RM, history) | ✅ Complete | March 2026 |
| PR Tracking (21 exercises, charts, BW chart) | ✅ Complete | March 2026 |
| Tools (Calculator, Converter, Bar Guide, Check-In, Library) | ✅ Complete | March 2026 |
| Settings (units toggle, notifications, Lose It placeholder) | ✅ Complete | March 2026 |

---

## OPEN ISSUES / BACKLOG

### P0 — Must Fix
- [ ] Phase 3C: Finish Session summary modal (exercises, volume, top set, e1RM, avg RPE, avg pain, PR flags, Share card)

### P1 — High Priority
- [ ] Lose It OAuth integration (awaiting API credentials)
- [ ] Cloud sync backup (iCloud / Google Drive)
- [ ] Share card image export (1080×1080 branded card)
- [ ] Weekly Check-In notification: wire Sunday scheduling to toggleNotif

### P2 — Nice to Have
- [ ] Log entry edit/delete UI
- [ ] Session completion tracking (mark sessions as Completed/Modified/Skipped from Today screen)
- [ ] Program week auto-advance based on programStartDate
- [ ] Offline mode enhancements (full AsyncStorage cache with sync queue)
- [ ] Bar Guide: real bar photos/illustrations
- [ ] Coach conversation persistence (across sessions via AsyncStorage)

---

## KEY DESIGN DECISIONS

1. **Algorithmic program data** — 52 weeks generated from 4-week wave templates rather than storing 312 static rows. Maintainable and extensible.
2. **Offline-first with backend sync** — AsyncStorage as immediate cache, MongoDB backend as authoritative store. App works without network after first load.
3. **RAG for coaching** — Supabase vector DB with 3,804 chunks from 37 S&C books provides grounded, citation-backed responses instead of hallucinated advice.
4. **Injury-aware system** — Injury flags set in onboarding drive rehab drills (Today screen), warning banners (Today screen), and coach context (RAG system prompt).
5. **No Lose It data logging** — The Program only reads nutrition data from Lose It. It never logs food. Clear separation of concerns.
6. **Emergent LLM key** — Single universal key for Claude Sonnet 4.5 across all AI features. No separate API key management for the user.

---

## AI COACH CONTEXT UPGRADE (June 2026 fork — COMPLETE)

Five context upgrades to `/api/coach/chat` (server.py):
1. **Session notes** — notes from today + last ~10 logged days injected (`ATHLETE'S SESSION NOTES`, ~500-token cap, dedup by date+exercise+text).
2. **Cross-session memory** — `db.coach_memory` per-user rolling summary (≤120 words), updated via `asyncio.create_task(_update_coach_memory)` after each chat. Folds a conversation when ≥6 unsummarized messages OR any unsummarized messages + 30 min quiet (conversation-end proxy). Progress tracked via `memorySummarizedCount` on each conversation doc.
3. **Onboarding Q/A** — `_build_onboarding_qa()` injects raw `profile.onboardingAnswers` (persisted at intake + captured on every profile edit via `_onboarding_capture_updates`), falling back to derived profile fields; missing answers flagged "(not captured)" — never fabricated.
4. **Injury status + severity** — `profile.injuryDetails: [{name, status: active|past, severity: mild|moderate|severe}]` (additive). INVARIANT: `injuryFlags` = ACTIVE injury names, derived/reconciled in the same write everywhere (PUT/POST /profile, apply-injury-update, intake, rebuild, rehab graduate) via `_active_flags_from_details` / `_reconcile_details_with_flags`. Legacy flags w/o details = active/moderate. Coach prompt has INJURY HANDLING rules per status/severity. UI selectors in onboarding step 8 + Settings Injuries card.
5. **Meet awareness** — `_meet_context()` injects days/weeks-out from `profile.competitionDate`; <3 weeks = explicit taper-protection directive; ≤21 days past = post-meet recovery bias.

Context injection order in system prompt: PROFILE → TRAINING CONTEXT → MEET COUNTDOWN → RECENT SESSIONS → SESSION NOTES → today/live/block/program → readiness/pain/ratings → COACH MEMORY → ONBOARDING INTAKE → RAG.

All verified e2e with test_strongman@test.com (taper answer, note reference, severity-aware pressing advice, memory doc created).

---

## ANALYTICS + CLINICIAN LAYER (July 2026 fork — COMPLETE)

**Part 1 — Analytics engine**: `/app/backend/services/training_analytics.py`
- Metrics: weekly volume (total + squat/hinge/press/pull, 6 wks), intensity distribution (RPE ≤7/8/9+ per week), RPE creep (4–6 comparable-load exposures, ±5% median load, flag Δ≥1.0 at flat load), fatigue index (documented: ACWR (7d vol ÷ 28d weekly baseline) + 7d-vs-28d avg-RPE delta, weighted; explanation string stored), PR progression (best e1RM/week per main lift), effective 1RM (best-set Epley last 28d, stored ALONGSIDE entered basePRs, never overwrites; downward divergence requires best-set RPE ≥8), compliance (distinct log days vs trainingDaysCount×4), pain trends (PAIN DATA EXISTS: log.pain per entry + db.pain_reports — path A used; per-injury rising/stable/falling over 28d halves + movement correlations ≥2 reports).
- ALL thresholds are named constants at top of the module (Eric tunes there).
- Storage: `db.training_analytics` per-user doc; refreshed via `asyncio.create_task` after POST /log, /log/session-bulk, /log/session-update, /tracker/commit-set; staleness recompute (>24h) at coach-chat time via `get_training_analytics()`. Endpoints: GET /api/analytics (?refresh=true), GET /api/analytics/block-recommendations.
- Block-boundary hook: `get_block_recommendations(db, userId, upcoming_block)` → startLoads (effective vs entered basis), volumeModifier (fatigue/compliance gated, clamped 0.8–1.1), painCautions, rationale. NOT wired into plan generator (later task).

**Part 2 — Coach behavior**: TRENDS block injected (~250 tokens, non-neutral signals only); prompt rules: deload answers must cite trend evidence; >5% effective-1RM divergence → PROGRAM_CHANGE proposal type "load_update" (confirm-only, NEVER auto-applied); clinician mode (active+rising pain → advise modification with correlation evidence; severity gates aggressiveness); "data suggests" vs "you told me"; <3 wks data → explicit low-confidence. Analytics failure → chat works as before. ADD_EXERCISE / memory / RAG / voice untouched.

Tests: `tests/test_training_analytics.py` (22 unit tests). Seed: `seed_analytics_test_users.py` (5 scenario users, see test_credentials.md).

---

## SECURITY CLEANUP (July 2026 — COMPLETE)
- `memory/test_credentials.md` removed from git tracking (`git rm --cached`) + gitignored (also `backend/.env.local`). File kept locally; tests read it via `backend/tests/creds.py`.
- Admin endpoint GET /api/admin/users: env-only `ADMIN_API_SECRET` (no default). Unset ⇒ 403 "disabled". Strong value set in local `backend/.env.local`. **PROD: must set ADMIN_API_SECRET in Deployment Secrets or the endpoint stays disabled.**
- All 10 test-account passwords rotated (5 analytics + user_a/user_b/strongman/hypertrophy/fresh_user_c); new values only in the untracked credentials file. `seed_analytics_test_users.py` now generates a random password per run (printed + auto-synced into the credentials file) and rotates on reseed.
- 35+ test files migrated from hardcoded passwords → `creds.password_for(email)`; remaining literals are throwaway registration passwords only. Tracked test_reports/test_result.md scrubbed of old literals.
- DEFAULT_USER (user_001): no-JWT fallback already removed from middleware.get_current_user — requests without a valid JWT get 401 in ALL environments (verified live). Constant retained for legacy log lines only; no user_001 login account exists. NOT exploitable in prod.

---

## TRANSPARENCY SCREENS (July 2026 — COMPLETE)
- **Settings → "WHAT YOUR COACH KNOWS ABOUT YOU"**: renders coach_memory summary; "Correct this" → POST /api/coach/memory/correction (authoritative correction folded via memory summarizer, overrides conflicts, returns updated summary, "Your coach will remember that." confirm); "Clear coach memory" → confirm dialog → DELETE /api/coach/memory (conversations keep memorySummarizedCount so cleared content never refolds); friendly empty state.
- **/trends screen** (entry: Programs tab → "Training trends" row): read-only render of db.training_analytics — fatigue (Fresh/Normal/Elevated/High + engine explanation), RPE creep (flag-only), strength (entered vs effective 1RM, trend arrows, diverge note), weekly volume stacked custom bars by pattern (session-type theme colors), pain trends (active injuries, neutral tone), compliance. Cards render only when data exists; empty state for no-data users; lowConfidence banner; "updated Xm ago"; GET /api/analytics recomputes >24h stale on open.
- Endpoints: GET/POST-correction/DELETE /api/coach/memory — all JWT-scoped to own user (401 unauth). No hardcoded hex in new screens (theme tokens only). Verified: test_reports/iteration_84.json (9/9 backend + full frontend pass).

---

## COACH WRITE-ACTIONS: REMOVE + SWAP + HONESTY (July 2026 — COMPLETE)

**FIX 1 — Honesty rule** (`server.py` system prompt): coach may only claim add/remove/swap when the corresponding XML tag is emitted; for out-of-capability requests ("delete week 3", "clear my logs") it MUST state the limitation and offer the real path (⋮ menu for permanent removal, PROGRAM_CHANGE for proposals). At most one write-action tag per reply. Backend-appended failure notes prohibit false success claims.

**FIX 2 — Two new write-actions** (both today-only; plan and future weeks are NEVER touched by these):
- `<REMOVE_EXERCISE>{"name":"..."}</REMOVE_EXERCISE>` — resolves target name against today's session (prescribed exercises from `_fs` + coach-/manually-added parsed from `current_session` snapshot).
  - `kind: "prescribed"` → client writes `sessionExerciseId` into AsyncStorage `today_skipped_exercises` (`{date, skipped:[{sessionExerciseId,name}]}`). Today filters these out on render. Day-roll auto-purges the key.
  - `kind: "added"` → client removes matching-name row from AsyncStorage `today_added_exercises` (the existing manual-add store).
  - Ambiguity guard: multi-match → coach asks "Which one?" and does NOT emit a tag. Not found → coach asks for the exact name.
- `<SWAP_EXERCISE>{"remove":{"name":"..."},"add":{ADD schema}}</SWAP_EXERCISE>` — atomic; add-half inherits removed's section by default. Same validation + ambiguity rules as REMOVE. If remove-half fails, add is NOT applied.
- Same server-side sanitization/clamping as ADD_EXERCISE (`resolve_coach_remove_target`, `validate_coach_added_exercise`; category whitelist main/supplemental/accessory/prehab/warmup/gpp/cooldown, sets 1-10, reps as short string).
- Response schema (`/api/coach/chat`) now includes `removed_exercise` and `swap_exercise` alongside `added_exercise` / `program_change`.
- Existing manual kebab-menu Remove (`DELETE /api/programs/.../exercises/…`) is UNCHANGED — that endpoint still permanently removes from current+future weeks of the session type. The coach's REMOVE explicitly does NOT reuse it.

**FIX 3 — Today cache invalidation** (targeted): Coach screen writes AsyncStorage `today_pending_invalidation = timestamp` after any successful mutation (Add / Remove / Swap / applied PROGRAM_CHANGE). Today's `useFocusEffect` consumes the flag at the top, clears it, resets `initialLoadDone`, and forces a full session rebuild. All other Today caches (added sets, logged state, set values) still restore normally.

**Empty-response fallback**: when Claude emits only a tag with no prose, backend synthesizes a canonical confirmation ("Removed X from today's session (today only — your plan and future weeks are untouched)." / add / swap variants).

Tests: `/app/backend/tests/test_iter85_coach_writeactions.py` (11 passing). Frontend Playwright verified via testing_agent (iteration 85): remove-prescribed flow drops the exercise from Today without pull-to-refresh; skip-list survives reload; day-roll purges stale entries; ADD regression preserved; ambiguity + honesty behaviors confirmed. Report: `/app/test_reports/iteration_85.json`.

---

## COACH INTEGRITY, CONSISTENCY, INTENT + PAIN 0–10 (July 2026 — COMPLETE)

**1. Token-budgeted history window + true assistant seeding (`server.py`).**
Old code sent `conversation_history[-5:]` AND replayed each user message through `chat.send_message()` (N+1 real LLM calls) while never seeding assistant replies — so the coach literally could not see its own prior responses, causing self-contradictions. Replaced with `trim_coach_history(all_hist)`: ~8000-char budget (≈2000 tokens), floor of 10 messages, oldest dropped first. The trimmed transcript is now handed to `LlmChat(initial_messages=[system, user, assistant, ...])` and a **single** `send_message()` call is made per turn. When the trim drops messages, the ATHLETE PROFILE block carries `HISTORY_TRUNCATED: yes` so the CONSISTENCY rule can gate its behavior.

**2. System-prompt additions.**
- **DISPUTE PROTOCOL** — on pushback, check current session state first, state plainly what's true now, admit failure directly, never retcon earlier messages.
- **CONSISTENCY WITHIN A CONVERSATION** — reversing a prior recommendation requires explicit acknowledgement + reason; under HISTORY_TRUNCATED, must not assert what was said earlier.
- **INTENT DETECTION** — distinguish permission ("should I skip?"), report ("I skipped"), hypothetical ("what if I skipped?"). Mid-session questions get short decisive answers.
- **INJURY-DAY LOAD APPROPRIATENESS** — for new symptom/flare on ME days, first response call is proceed/cap RPE/swap/move ME. Mobility comes after.

**3. Pain level (0–10) end-to-end.**
- **Schema**: `InjuryDetail` gains `painLevel?: 0–10` and `painLevelAt?: ISO` (frontend types + backend `_clean_injury_details` preserves them).
- **Injury context render**: `_injury_context_line` outputs "Shoulder (active, moderate, pain 6/10 reported 2h ago)" using `_relative_age`.
- **System-prompt rule**: "PAIN LEVEL (0–10) — ASK, USE, RECORD" — ask ONE concise 0–10 question before prescribing on new/worsening symptoms; scale guidance in 0–3 / 4–6 / 7+ bands.
- **`<PAIN_REPORT>` write-action** — `{area, level, timing?, note?}`. Timing is OPTIONAL — "during" | "after" | "at rest" — stored as `""` (unspecified) when omitted, NEVER defaulted to "during". Level clamped 0–10, area sanitized. On emit: inserts `db.pain_reports` (`sessionType: "coach chat"`, `source: "coach"`) → feeds analytics pain-trend engine; fuzzy-matches active injuries via `_normalize_ex_name` and updates matched injury's `painLevel` + `painLevelAt`; never creates new injuries. Response includes `pain_report: { id, area, level, timing, matchedInjury, flagged }`.
- **Onboarding step 8**: per-active-injury "Pain right now (optional)" 0–10 chip row, skippable. Past injuries hide it.
- **Settings**: same chip row inside each active injury card. Toggle-to-past hides the row; toggle-back restores the stored value.

Tests: `/app/backend/tests/test_iter86_coach_pain_history.py` (10/10 pass) + `test_iter85_coach_writeactions.py` (11/11 regression). Frontend Playwright verified pain-chip persistence, active/past visibility, and behavioral smoke tests for continuity (22-msg conversation, no contradiction), dispute (admits directly, no retcon), and intent detection (permission/report/hypothetical distinguished cleanly). Report: `/app/test_reports/iteration_86.json`.

Optional follow-up (not blocking): pipe `today_skipped_exercises` from the client into `current_session` so the coach can hold its ground on false disputes with client-side state visible.
