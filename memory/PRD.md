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
