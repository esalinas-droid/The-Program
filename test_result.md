#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: >
  Build a mobile-first strength training app "The Program" for advanced athletes.
  CURRENT SESSION: 4-part Major Update:
  1. PRE-WORKOUT READINESS AUTO-ADJUST: Backend POST /api/readiness now returns loadMultiplier (0.85/0.90/1.0) and adjustmentPercent (15/10/0) based on 1-5 score. Frontend today.tsx shows colored readiness banner with override button, and applies load multiplier to work set weights with strikethrough display.
  2. RESET PROGRAM BUG FIX: Backend POST /api/profile/reset now deletes 8 collections (saved_plans, profile, tracked_lifts, readiness_checks, pain_reports, calendar_overrides, weekly_reviews, log). Frontend settings.tsx clears AsyncStorage on reset with saveProfile({}).
  3. PROGRAM REVEAL REDESIGN: program-reveal.tsx fetches user goal and shows goal-specific split days and "Your Program Explained" section with timeline. Also adds plan retry logic.
  4. PROGRAM QUALITY UPGRADE: plan_generator.py adds _build_re_upper, _build_re_lower, _build_full_body builders and GOAL_DAY_MAPS routing Hypertrophy->RE, Athletic->FULL_BODY, General->RE+Full mix.

backend:
  - task: "TASK1 - POST /api/readiness returns loadMultiplier and adjustmentPercent"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Updated readiness endpoint. Changed thresholds from 2.5/3.5 to 3.0/4.0 for 1-5 scale. Added loadMultiplier (0.85/0.90/1.0) and adjustmentPercent (15/10/0) to response. Also updated GET /api/readiness/today to return these fields from DB."

  - task: "TASK2 - POST /api/profile/reset clears all 8 collections"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added delete_many for tracked_lifts, readiness_checks, pain_reports, calendar_overrides, weekly_reviews, log collections in addition to existing saved_plans and profile."

  - task: "TASK4 - Goal-specific session builders in plan_generator.py"
    implemented: true
    working: "NA"
    file: "backend/services/plan_generator.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added _build_re_upper (4x8-12 hypertrophy pressing), _build_re_lower (posterior chain volume), _build_full_body (compound push+pull+hinge+carry). Added GOAL_DAY_MAPS routing Hypertrophy to RE_, Athletic to FULL_BODY, General to RE_+FULL_BODY mix. Updated _build_session type_map and _generate_coach_note."
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Removed duplicate 'from routers.program import program_router' on line 13 and duplicate app.include_router(program_router) + broken try/except block importing 'IntakeResponse'. Backend now starts clean with no warnings."

  - task: "All program router endpoints accessible via /api prefix"
    implemented: true
    working: true
    file: "backend/routers/program.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "program_router is registered once cleanly. All 19 endpoints from program.py accessible."

  - task: "Fix get_today_session to return correct session type for current weekday"
    implemented: true
    working: true
    file: "backend/routers/program.py"
    stuck_count: 1
    priority: "high"
    needs_retesting: true
    status_history:
      - working: false
        agent: "main"
        comment: "Backend was returning Max Effort Upper for Friday because dayNumbers were 1-4 but Friday=weekday()+1=5. No exact match fallback went to first session."
      - working: true
        agent: "main"
        comment: "Added CONJUGATE_CALENDAR dict {1:ME Lower, 2:ME Upper, 4:DE Lower, 5:DE Upper}. Added second try: match by session TYPE from CONJUGATE_CALENDAR. Friday (5) now correctly finds Dynamic Effort Upper session by type match."

  - task: "Fix plan_generator.py to use correct calendar day numbers"
    implemented: true
    working: true
    file: "backend/services/plan_generator.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Replaced SPLIT_TEMPLATES (sequential 1-4) with DAY_MAPS that use real calendar day numbers: Mon(1)=ME Lower, Tue(2)=ME Upper, Thu(4)=DE Lower, Fri(5)=DE Upper. New plans now have correct dayNumbers matching calendar days."

frontend:
  - task: "Add analyticsApi and substitutionApi to api.ts"
    implemented: true
    working: true
    file: "frontend/src/utils/api.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Added analyticsApi (overview, volume, pain, compliance) and substitutionApi (log, list) exports at end of api.ts."

  - task: "StatBox component and statsGrid style in index.tsx"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Added StatBox functional component before QuickAction and added statsGrid/statBox/statBoxValue/statBoxLabel styles to StyleSheet."

  - task: "Fix track.tsx double loadAll + safety timer"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/track.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Removed the redundant useEffect that called loadAll() and had a 5s safety timer. Removed debug console.logs. Single useFocusEffect remains."

  - task: "Post-Workout Review screen (review.tsx)"
    implemented: true
    working: "NA"
    file: "frontend/app/review.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Built review.tsx — full-screen post-workout review with animated hero (checkered flag + session badge), 4-stat grid, Wins card, Coach Wrap card, What's Next card, and fixed bottom CTA. today.tsx now navigates here on FINISH SESSION with setsLogged/totalSets/sessionType/week params. Screen registered in _layout.tsx."

  - task: "Rest Period Selector — Smart per-exercise rest timer on Today page"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/today.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: >
          Implemented full REST_CONFIG (primary/speed/supplemental/accessory/prehab with correct
          options and defaults per user spec). RestSelector component added to ExerciseCard
          (between header and set rows, only when expanded). CustomRestModal bottom sheet with
          animated slide-up and min/sec inputs. RestTimerBar updated to count-DOWN (not up)
          showing exerciseName + 4:32 / 5:00 format + thin progress bar. Auto-stop + haptic
          when countdown reaches 0. Reset resets to full duration. Timer uses timerTarget +
          timerExerciseName state vars. handleLog computes exercise-specific rest duration.

  - task: "today.tsx FINISH SESSION navigates to review screen"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/today.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "handleFinish now routes to /review with setsLogged, totalSets, sessionType, week params instead of /(tabs)."

  - task: "Session type sync across Home, Today, and Log tabs"
    implemented: true
    working: true
    file: "frontend/app/(tabs)/index.tsx, today.tsx, log.tsx, src/constants/theme.ts"
    stuck_count: 2
    priority: "high"
    needs_retesting: true
    status_history:
      - working: false
        agent: "user"
        comment: "Home shows DE Upper, Today shows Dynamic Effort Upper, Log shows Max Effort Upper. All inconsistent."
      - working: true
        agent: "main"
        comment: "Fixed: 1) theme.ts getSessionStyle now recognizes full backend names (Dynamic Effort Upper/Max Effort Upper) with same styles. 2) index.tsx uses displaySession that prefers programSession.session.sessionType from API. 3) log.tsx uses local getTodaySession() as initial state then overrides with API. All 3 tabs now use backend API session type as single source of truth."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "Manage Lifts — Custom PR tracking + Featured Lifts on Progress page"
    - "Auto-advance exercise on Today page after all sets complete"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: >
      FULL QA RUN requested. Current app state after rollback to f169829 + 3 targeted fixes.
      Backend: 14 program endpoints confirmed responding. Plan generated (52 weeks, 7 phases).
      Today is Friday April 3 2026 (day_number=5). The plan has no Friday session so fallback
      returns ME Upper Day 1 (expected behavior - conjugate program only has 4 training days).
      Bottom nav confirmed: 5 tabs ONLY (Home, Today, Log, Track, Tools) - no Changes tab.
      
      Key files at current state:
      - today.tsx: 1008 lines (rich UI with AI session panel, substitution, exercise tracking)
      - log.tsx: 993 lines (exercise picker, RPE/pain sliders, PR alerts, share card)
      - track.tsx: 767 lines (analytics, PRs, bodyweight chart, compliance)
      - tools.tsx: 58 lines (menu with 7 cards including changelog)
      - tools/: calculator, converter, barguide, checkin, coach, library, changelog all present
      - program-reveal.tsx: 699 lines (52-week plan reveal with phase timeline)
      - review.tsx: 459 lines (post-workout review)
      - api.ts: 136 lines (programApi + analyticsApi + substitutionApi)
      
      Please test ALL screens thoroughly:
      1. Home tab - coach directive, weekly stats, PR bests
      2. Today tab - session type, exercises, coach note, sections
      3. Log tab - session type default, exercise picker, RPE/pain sliders, logging a set
      4. Track tab - PRs, bodyweight chart, compliance, no blank sections
      5. Tools tab - all 7 cards visible, each tool opens without errors
      6. Bottom nav - only 5 tabs (no Changes)
      7. Program-reveal - can navigate to /program-reveal
      8. Review screen - can navigate to /review with params
      Report ALL bugs found including severity. Fix nothing yourself.

  - agent: "main"
    message: >
      NEW SESSION: Enhanced Onboarding + Editable Settings + Injury Sync Flow.
      
      BACKEND CHANGES (server.py):
      1. AthleteProfile model expanded with 11 new fields:
         goal, primaryWeaknesses, specialtyEquipment, sleepHours, stressLevel,
         occupationType, hasCompetition, competitionDate, competitionType, gymTypes, trainingDaysCount
      2. AthleteProfileUpdate model expanded with same 11 fields (all Optional).
      3. NEW: POST /api/plan/injury-preview — returns exercises restricted/restored for given injury flags
      4. NEW: POST /api/plan/apply-injury-update — saves new injuryFlags to MongoDB + logs to substitutions
      5. Helper: _build_injury_keywords() and _EXERCISE_CONTRAINDICATIONS list (32 exercises mapped)
      
      FRONTEND CHANGES:
      1. onboarding-intake.tsx — COMPLETELY REWRITTEN (11 steps from 7):
         Step 1: Goal (6 options)
         Step 2: Experience (4 options with detail)
         Step 3: Current Lifts (expanded with Strongman lifts for Strongman goal)
         Step 4: NEW — Bodyweight + 12-week goal
         Step 5: Training Frequency (3/4/5/6 days)
         Step 6: NEW — Primary Weaknesses (17 options, multi-select)
         Step 7: NEW — Specialty Equipment (17 options, multi-select)
         Step 8: Injuries (22 options incl. None)
         Step 9: NEW — Recovery Profile (sleep/stress/occupation)
         Step 10: NEW — Gym Types + Competition calendar (combined)
         Step 11: Upload (optional)
         handleComplete now also calls profileApi.update() to sync all new fields to MongoDB
      
      2. settings.tsx — COMPLETELY REWRITTEN with edit mode:
         - Pencil icon enters edit mode
         - Editable: Name (TextInput), Body Weight (TextInput), Experience (chip selector)
         - Editable: Injury Flags (remove X + Add modal)
         - Editable: Weaknesses/Targets (remove X + Add modal)
         - Injury sync flow: if injuries change → calls POST /api/plan/injury-preview
           → shows full preview modal with restricted/restored exercises → requires Accept
         - Cancel/Save bar floating at bottom in edit mode
         - New sections: WEAKNESSES & TARGETS, shows Goal field
      
      3. src/types/index.ts — AthleteProfile interface expanded with 11 new optional fields
      4. src/utils/api.ts — Added InjuryPreviewResult interface and planApi object
      
      Please test:
      1. Backend: POST /api/plan/injury-preview with {"newInjuryFlags": ["Knee (general)", "Lower Back / Lumbar"]}
         → should return restricted/restored exercises list
      2. Backend: POST /api/plan/apply-injury-update with {"newInjuryFlags": ["Knee (general)"]}
         → should update MongoDB profile injuryFlags and log to substitutions
      3. Backend: PUT /api/profile with new fields (primaryWeaknesses, specialtyEquipment, sleepHours etc)
         → should save all fields to MongoDB
      4. Backend: GET /api/profile → verify new fields appear in response
      5. Frontend: Navigate to /onboarding-intake → should show 11 steps (1 of 11 counter)
      6. Frontend: Navigate to /settings → should show pencil edit icon, injury flags in red chips,
         weaknesses in gold chips, Goal field in Athlete section
      
      Root Cause: The backend plan_generator was assigning dayNumbers 1-4 sequentially (for a 4-day split),
      but Friday = weekday()+1 = 5. The get_today_session endpoint found no match for dayNumber=5 and 
      fell back to the FIRST session (Max Effort Lower). This caused Today/Log to show "Max Effort Upper"
      while Home showed "DE Upper" (from local programData.ts).
      
      Fixes Applied:
      1. plan_generator.py: Added DAY_MAPS with proper calendar day numbers:
         Mon(1)=ME Lower, Tue(2)=ME Upper, Thu(4)=DE Lower, Fri(5)=DE Upper
         Sessions now have correct dayNumbers matching actual calendar weekdays.
      
      2. program.py get_today_session: Added CONJUGATE_CALENDAR fallback dict:
         {1: "Max Effort Lower", 2: "Max Effort Upper", 4: "Dynamic Effort Lower", 5: "Dynamic Effort Upper"}
         When exact dayNumber match fails (old plans), it matches by session TYPE mapped to today's weekday.
      
      3. theme.ts getSessionStyle(): Extended to recognize full backend names:
         "Dynamic Effort Upper" → de_upper style, "Max Effort Lower" → me_lower style, etc.
      
      4. index.tsx: Added displaySession variable that prefers programSession.session.sessionType
         (from API) over local todaySession.sessionType. All session badges now use displaySession.
      
      5. log.tsx: Added getTodaySession import. useFocusEffect now sets session type from local 
         programData first (instant), then overrides with API response if available.
      
      Backend verified: Friday now returns sessionType="Dynamic Effort Upper", dayNumber=5.
      All 4 sessions: Mon→Max Effort Lower, Tue→Max Effort Upper, Thu→Dynamic Effort Lower, Fri→Dynamic Effort Upper.
      
      NOTE: Backend uses in-memory storage. To test, first POST /api/profile/intake to generate plan,
      then test today session endpoint. Plan generation needed after each backend restart.
      
      Please test:
      1. Backend: POST /api/profile/intake (frequency=4), then GET /api/plan/session/today 
         → should return sessionType="Dynamic Effort Upper" (today is Friday)
      2. Frontend Home tab: session badge should show "Dynamic Effort Upper" with correct blue color
      3. Frontend Today tab: session type header should show "Dynamic Effort Upper"
      4. Frontend Log tab: session type should show "Dynamic Effort Upper" (not "ME Upper" default)
      All three tabs must show identical session type.

backend:
  # ── Phase 2 Batch 3 NEW TASKS ──────────────────────────────────────────────

  - task: "Phase 2 Batch 3 — Task 8: Rehab Progression Tracking"
    implemented: true
    working: "YES"
    file: "backend/server.py, backend/services/rehab_protocols.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "YES"
        agent: "testing"
        comment: >
          All 5 rehab tests pass: rehab/start (lower_back, knee), rehab/status, rehab/exercises,
          rehab/log. Static core + RAG enhancement. Auto-progression after clean sessions.

  - task: "Phase 2 Batch 3 — Task 9: Competition Peaking"
    implemented: true
    working: "YES"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "YES"
        agent: "testing"
        comment: >
          All competition tests pass. competition/set, competition/status, both close/far dates.
          hasCompetition=true now included in competition/set response (bug fix applied).

  - task: "Phase 2 Batch 3 — Task 10: Exercise Rotation Detection"
    implemented: true
    working: "YES"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "YES"
        agent: "testing"
        comment: "GET /api/rotation/check returns flagged count and message. Functional."

  - task: "Phase 2 Batch 3 — Task 13: Changelog with Undo"
    implemented: true
    working: "YES"
    file: "backend/server.py, frontend/app/tools/changelog.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "YES"
        agent: "testing"
        comment: >
          Undo bug fixed: prehab additions (original='(none)') now correctly REMOVE the exercise
          from ALL sessions (reverted=4, success=true, isPrehab=true). True substitutions still
          restore original exercise name. Undone entry confirmed with undone=true in changelog.

  - task: "Remove hardcoded Eric profile data from server.py seed endpoint"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "AthleteProfile defaults now blank (name='', currentBodyweight=0.0, etc). Seed endpoint creates blank profile. No more hardcoded Eric data."

  - task: "Branding: Replace Conjugate Method with The Program"
    implemented: true
    working: true
    file: "backend/services/plan_generator.py, backend/models/core.py, frontend multiple files"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "All conjugate references replaced: plan names use The Program — Strength etc, trainingModel=the_program, all frontend text updated. Zero conjugate refs in user-facing code confirmed by grep."

  - task: "Coach conversation persistence - new MongoDB endpoints"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Added CoachConversation model. New endpoints: GET /api/coach/conversations, GET /api/coach/conversations/{id}, DELETE /api/coach/conversations/{id}, POST /api/coach/apply-recommendation. POST /api/coach/chat now persists messages to MongoDB and returns conversation_id."

  - task: "Coach chat endpoint: parse PROGRAM_CHANGE block, return has_program_change"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "System prompt updated with PROGRAM_CHANGE detection instruction. Response parser strips <PROGRAM_CHANGE> block, returns clean response + has_program_change bool + program_change dict."

  - task: "Apply recommendation endpoint logs to changelog"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "POST /api/coach/apply-recommendation inserts to substitutions collection and marks conversation as applied."

  - task: "Phase 2 Batch 2 — Task 2: RAG-Enhanced Plan Generation"
    implemented: true
    working: true
    file: "backend/services/rag_plan_generator.py, backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Created services/rag_plan_generator.py with async generate_plan_with_rag(). POST /api/profile/intake added to api_router (shadows program_router). Queries Supabase, calls GPT-4o-mini, applies exercise swaps + prehab. Fallback to base plan on any failure. Persists via _save_plan_to_db(). Supabase verified live: returned 4 passages for test query."

  - task: "Phase 2 Batch 2 — Task 5: Weekly Auto-Review"
    implemented: true
    working: true
    file: "backend/server.py, frontend/app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "GET /api/weekly-review added. Caches in db.weekly_reviews by (userId, week). Generates AI review (Claude Sonnet) or fallback rule-based review. Second call returns cached=True. Frontend index.tsx replaced COMING SOON with real review card showing highlights, concerns, nextWeekFocus, stats."

  - task: "Phase 2 Batch 2 — Task 6: Auto Load & Volume Adjustment + Autoregulation"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "POST /api/plan/auto-adjust: analyzes last 5 RPEs, adjusts main/supplemental loads by +/-5-10%, persists via _save_plan_to_db(). POST /api/plan/autoregulate: mid-session RPE feedback, returns suggestion+message+suggestedLoad. Tested: autoregulate returns 'reduce' + '285 lbs' for RPE 8.5/target 7.5/load 300."

  - task: "Phase 2 Batch 2 — Task 7: Deload Detection"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "GET /api/deload/check: scoring system (RPE fatigue +2/+3, pain count +2/+3, flagged regions +2, completion +2, scheduled week +2, max 12). score>=4 -> immediate deload. Logs to db.deload_history (no duplicate per week). Frontend index.tsx shows orange DELOAD RECOMMENDED card with signals."

  - task: "Phase 2 Batch 2 — Task 11: Personalized Warm-Up"
    implemented: true
    working: true
    file: "backend/server.py, frontend/app/(tabs)/today.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "GET /api/warmup/today: session_focus (upper/lower) from plan or weekday calendar. Injury-specific steps added (knee TKEs, shoulder IR/ER, back cat-cow/bird-dog). Extended warm-up when readiness<3.5. Frontend today.tsx: replaced static WARMUP_STEPS with API data, added injury mod badge and readiness note."

frontend:
  - task: "Coach screen: conversation history modal with New/Load/Delete"
    implemented: true
    working: true
    file: "frontend/app/tools/coach.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Added history button in header (clock icon with badge). Conversation History modal shows list of past conversations. Can create new conversation, load existing, delete. ConversationHistoryModal component added."

  - task: "Coach screen: Apply to My Program button"
    implemented: true
    working: true
    file: "frontend/app/tools/coach.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "MessageBubble shows Apply button only when hasProgramChange=true. Tapping calls coachApi.applyRecommendation, shows success alert with option to view changelog."

  - task: "Coach screen: Expandable Applied Summary"
    implemented: true
    working: true
    file: "frontend/app/tools/coach.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Added ApplyResult/ExerciseChange/ChangesByCategory types. Added appliedResults state. applyRecommendation now stores full backend response. MessageBubble replaced static Applied button with expandable green summary card. Shows 'Applied to Current Block — X exercises modified'. Tapping expands to show MAIN LIFTS, SUPPLEMENTAL, ACCESSORY, PREHAB categories with From→To rows, each category has its own color. Backend changes_by_category parsed and rendered correctly."

  - task: "Coach screen: text selectable messages"
    implemented: true
    working: true
    file: "frontend/app/tools/coach.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "All Text components in MessageBubble and MarkdownText have selectable={true} prop."

  - task: "Onboarding training days: remove conjugate wording"
    implemented: true
    working: true
    file: "frontend/app/onboarding-intake.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Training days descriptions updated: '3 max effort sessions/week' and 'Classic 4-day ME+DE split' replacing old conjugate references."

  - task: "Apple Sign-In backend - missing jwt import in auth.py"
    implemented: true
    working: true
    file: "backend/routers/auth.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: false
        agent: "main"
        comment: "CRITICAL BUG: auth.py used jwt.get_unverified_header() and jwt.decode() but had NO 'import jwt' statement. NameError would crash Apple Sign-In flow at runtime."
      - working: true
        agent: "main"
        comment: "Fixed: Added 'import jwt' on line 22 of auth.py. PyJWT 2.11.0 is installed. Backend auto-reloaded successfully. All jwt calls in _verify_apple_token() will now work."

  - task: "Auth endpoints - register, login, me, social, logout"
    implemented: true
    working: true
    file: "backend/routers/auth.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "POST /api/auth/register, POST /api/auth/login, GET /api/auth/me, POST /api/auth/social, POST /api/auth/logout all implemented. Register uses bcrypt. Login verifies bcrypt hash. JWT tokens HS256, 30-day expiry. Social supports google/apple/facebook providers."

  - task: "User data isolation - all endpoints scoped by userId"
    implemented: true
    working: true
    file: "backend/middleware.py, backend/routers/program.py, backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "All MongoDB queries use get_current_user dependency to scope by userId. Fallback to DEFAULT_USER (user_001) if no JWT provided. Test users: user_a@theprogram.app (StrongmanA123), user_b@theprogram.app (HypertrophyB123)."

  - task: "Apple Sign-In frontend - graceful fallback"
    implemented: true
    working: true
    file: "frontend/app/auth.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Added isAvailableAsync() check before signInAsync(). If Apple Sign-In not available on device, shows Alert with 'Apple Sign-In will be available soon' message and redirect to email. Non-cancel errors also show friendly Alert instead of error box. Apple button (black, white Apple logo) hidden on Android/web via Platform.OS === 'ios' check."

metadata:
  created_by: "main_agent"
  version: "4.0"
  test_sequence: 4
  run_ui: false

test_plan:
  current_focus:
    - "Phase 2 Batch 3 — Task 8: Rehab Progression Tracking (GET /api/rehab/exercises, POST /api/rehab/log)"
    - "Phase 2 Batch 3 — Task 9: Competition Peaking (GET /api/competition/status)"
    - "Phase 2 Batch 3 — Task 10: Exercise Rotation Detection (GET /api/rotation/check)"
    - "Phase 2 Batch 3 — Task 13: Changelog with Undo (GET /api/coach/change-log, POST /api/coach/undo/{id})"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: >
      NEW SESSION: Audit + 4 tasks implemented.
      
      AUDIT CLEAN: All hardcoded Eric data removed from old onboarding files.
      onboarding/index.tsx: useState('') for name+experience.
      onboarding/step6.tsx: all fallbacks blank/0, goal='strength', date=today().
      auth.tsx: placeholder='Your full name'.
      
      TASK 1 (KEYBOARD FIX): onboarding-intake.tsx - added automaticallyAdjustKeyboardInsets={true},
      keyboardDismissMode='on-drag', increased bottom spacer from 24px to 120px.
      
      TASK 2 (UNLIMITED SELECTION): Already correct in new onboarding - no maxSelections found.
      
      TASK 3 (MAJOR FIX - Settings injuries update program):
        - _build_injury_keywords: added 'si joint', 'pelvis', 'sacroiliac' -> si_joint_moderate + low_back_moderate
        - _EXERCISE_CONTRAINDICATIONS: si_joint_moderate added to Conventional Deadlift, Sumo, Romanian, Good Morning, Speed Deadlift, Pendlay Row, Ab Wheel. Trap Bar fixed to contra=['low_back_severe'] (NOT moderate - it IS the safe replacement for SI Joint)
        - _INJURY_MAP: Added 'si joint' key with restrict_keywords, main_swap (Trap Bar), supplemental_swaps, accessory_swaps (good morning->Reverse Hyper, deep squat->Box Squat Above Parallel), prehab (Dead Bug + Clamshell)
        - _INJURY_ALIAS: 'si joint' now maps to 'si joint' (not 'lower back')
        - injury_preview: Now scoped by userId=Depends(get_current_user). Correctly shows 7 restricted exercises for SI Joint.
        - apply_injury_update: Now scoped by userId. RUNS FULL EXERCISE SWAP LOOP. Persists to MongoDB via _save_plan_to_db. Returns exercises_swapped count and changes_by_category.
        - settings.tsx: handleAcceptInjuryChanges shows Alert with exercises_swapped count.
      
      TASK 4 (APPLE BUTTON FIX): auth.tsx - replaced AppleAuthentication.AppleAuthenticationButton
      with custom TouchableOpacity + MaterialCommunityIcons 'apple'. Black bg, white text.
      Always renders on Platform.OS === 'ios'. isAvailableAsync check in handler only.
      Alert: "Apple Sign-In requires a standalone build. Please use email for now."
      
      TEST CREDENTIALS:
      - user_a@theprogram.app / StrongmanA123
      - user_b@theprogram.app / HypertrophyB123
      - DEFAULT_USER fallback: user_001 (has completed onboarding)
      
      Please test:
      1. POST /api/plan/injury-preview with {"newInjuryFlags":["SI Joint / Pelvis"]} AND empty existing injuries — should show 7 restricted exercises (Conventional Deadlift, Sumo, Romanian, Good Morning, Speed Deadlift, Pendlay Row, Ab Wheel). Trap Bar should NOT be restricted.
      2. POST /api/auth/login with user_a credentials -> get JWT
      3. POST /api/plan/apply-injury-update with {"newInjuryFlags":["SI Joint / Pelvis"]} + JWT from step 2 — should swap exercises (exercises_swapped > 0), persist to MongoDB
      4. GET /api/plan/session/today with same JWT — should show updated exercises (Conventional Deadlift replaced with Trap Bar Deadlift if it was in the session)
      5. POST /api/auth/login with wrong password → 401
      6. Data isolation: user_a and user_b get different data
      7. All other endpoints still work: /api/profile, /api/prs/bests/overview, /api/coach/conversations

  - agent: "main"
    message: >
      Implemented all 8 tasks from user request. Key changes:
      
      PRE-REQ: Removed all hardcoded Eric data from server.py (name, bodyweight, injuries, dates).
      Seed endpoint now creates blank profile. plan_generator.py defaults changed to 135/185/225.
      
      TASK 1 (BRANDING): Zero conjugate references in user-facing code. Replaced in:
      models/core.py, plan_generator.py (plan names), onboarding-intake.tsx (training day descriptions),
      program-reveal.tsx (5 locations), roadmap.tsx, changes.tsx, log.tsx.
      Backend CONJUGATE_CALENDAR constant preserved (internal routing logic).
      
      TASK 2 (UNLIMITED SELECTIONS): onboarding already had no limit. Training day descriptions updated.
      
      TASK 3 (COACH CLEANUP + APPLY): System prompt updated to block citation formatting.
      <PROGRAM_CHANGE> block detection added. Apply to My Program button in coach.tsx.
      
      TASK 4 (CONVERSATION HISTORY): Full MongoDB persistence. History modal in coach.tsx.
      New/Load/Delete conversations. Full history context passed to AI. Selectable text.
      
      TASK 5 (SETTINGS AUTO-APPLY): Already correctly implemented with confirmation modal.
      
      TASK 6 (BACKEND ENDPOINTS): 
        - GET/DELETE /api/coach/conversations
        - GET /api/coach/conversations/{id}
        - POST /api/coach/apply-recommendation
        - Updated POST /api/coach/chat (persists, returns conversation_id + program_change)
      
      Please test all backend endpoints especially the new coach conversation endpoints.


  - agent: "main"
    message: >
      Phase 2 Batch 2 fully implemented. All 5 tasks complete.

      TASK 2 — RAG-Enhanced Plan Generation:
      - Created /app/backend/services/rag_plan_generator.py
      - New async generate_plan_with_rag(intake, openai_client, supabase_client)
      - Queries Supabase vector DB (verified: 4 passages returned for test query)
      - Uses GPT-4o-mini to generate exercise swaps + prehab based on RAG context
      - Applies modifications to ALL phases/blocks in the plan
      - Graceful fallback to base plan if RAG/AI unavailable
      - RAG intake endpoint (POST /api/profile/intake) added to api_router in server.py
        (shadows program_router version — api_router is included first)
      - Plan marked "(Research-Optimized)" when RAG modifications applied
      - Persists via _save_plan_to_db() as required

      TASK 5 — Weekly Auto-Review:
      - GET /api/weekly-review — generates AI review (Claude Sonnet) based on:
        session_ratings, pain_reports, log data, PR detection
      - Caches in db.weekly_reviews by (userId, week) — generates ONCE per week
      - Fallback review if AI unavailable (rule-based analysis)
      - Frontend index.tsx: replaced COMING SOON with real review card
        (highlights, concerns, nextWeekFocus, stats strip)
      - TESTED: cache works — second call returns cached=True ✓

      TASK 6 — Automatic Load & Volume Adjustment:
      - POST /api/plan/auto-adjust: analyzes last 5 session RPEs
        - avg RPE >= 8.5: reduce loads 10%
        - avg RPE >= 8.0: reduce loads 5%
        - avg RPE <= 6.0: increase loads 5%
        - 5+ pain reports in 2 weeks: extra reduction cap
        - Adjusts only current + next 2 weeks, main/supplemental exercises
        - Persists via _save_plan_to_db()
      - POST /api/plan/autoregulate: real-time mid-session RPE feedback
        - Returns: suggestion (reduce/increase/maintain) + message + suggestedLoad
        - TESTED: RPE 8.5, target 7.5 → "reduce", suggested 285 lbs ✓

      TASK 7 — Deload Detection:
      - GET /api/deload/check: scoring system (max 12 points)
        - avg RPE >= 8.5/9.0: +2/+3
        - pain count >= 4/7 in 2 weeks: +2/+3
        - flagged regions: +2
        - completion < 60%: +2
        - scheduled deload week (every 4th): +2
        - score >= 4: immediate deload recommended
        - Logs to db.deload_history (no duplicate per week)
      - Frontend index.tsx: shows orange DELOAD RECOMMENDED card with signals
        (conflict priority: injury safety > deload > everything else)

      TASK 11 — Personalized Warm-Up:
      - GET /api/warmup/today: tailored to session type, injury flags, readiness
        - Detects session_focus (upper/lower) from plan or weekday calendar
        - Adds injury-specific steps (knee TKEs, shoulder IR/ER, back bird-dogs etc.)
        - Extends warm-up if readiness_score < 3.5
      - Frontend today.tsx: replaced static WARMUP_STEPS with API data
        - Shield icon shows when injury modifications present
        - Orange readiness note shows if readiness < 3.5

      api.ts: Added weeklyReviewApi, autoAdjustApi, deloadApi, warmupApi

      TEST RESULTS (manual): All 5 new endpoints return HTTP 200 ✓
      Test credentials: /app/memory/test_credentials.md

      Please test these backend endpoints:
      - GET /api/weekly-review (cached and non-cached)
      - GET /api/deload/check (signals + scoring logic)
      - GET /api/warmup/today (injury modifications + session focus)
      - POST /api/plan/auto-adjust (RPE analysis + load adjustment)
      - POST /api/plan/autoregulate (mid-session RPE feedback)
      Also verify POST /api/profile/intake still works (RAG-enhanced version)



  - agent: "main"
    message: >
      NEW FEATURE: Training Day Picker (Onboarding) + Calendar Tool + Notifications
      
      Backend changes (server.py + schemas.py):
      1. Added `preferredDays: List[str] = []` to IntakeRequest schema
      2. POST /api/profile/intake now saves preferredDays to profile
      3. NEW: GET /api/calendar/events?start_date=&end_date= — generates calendar events from plan+preferredDays
         Returns: {events:[{date,sessionType,weekNumber,phaseName,exercises,isOverridden}], preferredDays, notificationHour, planName}
      4. NEW: POST /api/calendar/reschedule — {originalDate,newDate,sessionType,reason} stores override in db.calendar_overrides
      5. NEW: DELETE /api/calendar/reschedule/{original_date} — undo reschedule
      6. NEW: PUT /api/profile/preferred-days — {preferredDays,notificationHour,notificationMinute}
      
      Frontend (onboarding-intake.tsx):
      1. Step 5 now has TWO parts: frequency picker + day picker
      2. Day picker shows Mon-Sun toggles; smart defaults set when frequency is chosen
      3. canContinue case 5 now requires selectedDays.length === trainingDays
      4. preferredDays sent with intake payload
      
      New file: /app/frontend/app/tools/calendar.tsx
      - Monthly calendar (react-native-calendars) with colored session dots
      - Tap any day → see session details (exercises, sets/reps, coach note)
      - "Move Session" button → pick any future date + reason
      - "Restore" button on rescheduled sessions
      - Bell icon → notification settings modal (hour/minute picker)
      - Schedules local notifications for next 8 weeks of training days
      - training schedule banner at bottom showing preferred days
      
      tools.tsx: Added "Workout Calendar" as first item in tools list
      tools/_layout.tsx: Added calendar screen
      
      Please test:
      1. GET /api/calendar/events — call PUT /api/profile/preferred-days first with [monday,wednesday,friday], then verify events are on correct weekdays
      2. POST /api/calendar/reschedule {originalDate, newDate} — verify override stored
      3. GET /api/calendar/events again — verify event appears on newDate not originalDate
      4. DELETE /api/calendar/reschedule/{original_date} — verify undo works
      5. PUT /api/profile/preferred-days {preferredDays:["monday","thursday","saturday"],notificationHour:9}
      
      Credentials: user_a@theprogram.app / StrongmanA123

      
      Backend changes (schemas.py + plan_generator.py):
      1. Added `hasCompetition: bool = False` to IntakeRequest schema (was missing — frontend was sending it but it was ignored)
      2. Added `trainingDays: int = 4` to AnnualPlan schema (was only on UserProfile before)
      3. Added `PHASE_TEMPLATES_NO_COMP` — non-competition versions of all phase templates where Phase 6 = "Strength Consolidation" instead of "Competition Prep"
      4. `generate_plan()` now checks `intake.hasCompetition` (or `intake.competitionDate`) to select correct template
      5. `generate_plan()` now sets `trainingDays=frequency` in AnnualPlan constructor
      
      Frontend (program-reveal.tsx):
      1. "4 Days / Wk" badge now shows `plan?.trainingDays ?? 4` (dynamic from API)
      2. "4 sessions / week" split section now shows `plan?.trainingDays ?? 4` (dynamic)
      3. "Adjust preferences" button fixed: now uses `router.replace('/onboarding-intake')` instead of `router.back()` (which was going to wrong screen since program-reveal was opened with replace())
      4. cardAnims pool expanded from 8 to 15 slots (handles AI-generated plans with variable phase counts)
      
      VERIFIED by manual API tests:
      - intake with hasCompetition=false, frequency=3 → trainingDays=3, Phase 6="Strength Consolidation" ✅
      - intake with hasCompetition=true, frequency=5 → trainingDays=5, Phase 6="Competition Prep" ✅
      - GET /api/plan/year returns trainingDays correctly ✅
      
      Please test:
      1. POST /api/profile/reset, then POST /api/profile/intake {goal:"Strength", frequency:3, hasCompetition:false}
         — plan.trainingDays should be 3, phases should NOT include "Competition Prep" (Phase 6 = "Strength Consolidation")
      2. POST /api/profile/reset, then POST /api/profile/intake {goal:"Strongman", frequency:5, hasCompetition:true, competitionDate:"2026-08-15"}
         — plan.trainingDays should be 5, phases SHOULD include "Competition Prep" as Phase 6
      3. POST /api/profile/reset, then POST /api/profile/intake {goal:"Powerlifting", frequency:4, hasCompetition:false}
         — plan.trainingDays should be 4, no competition phase
      
      Credentials: user_a@theprogram.app / StrongmanA123


frontend:
  - task: "Today Page Terminology Fix — ExCategory types and getCategoryStyle labels"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/today.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: >
          Changed ExCategory type from 'maxeffort'|'dynamiceffort' to 'primary'|'speed'.
          Updated buildTodayExercisesFromLocal and buildTodayExercisesFromApi to use new keys.
          Updated getCategoryStyle labels: Primary, Speed, Support, Accessory, Injury Prevention.
          Removed Eric's hardcoded numbers (315x1, 375, etc.) from mock EXERCISES array.
          Updated SESSION_OBJECTIVES map comment to reference new terminology.

  - task: "Today Page UI — Thin gold progress bar at top"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/today.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "3px height gold (#C9A84C) progress bar at very top of page. Fills based on loggedSets/totalSets."

  - task: "Today Page UI — Compact session header with slim italic coach note"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/today.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: >
          Replaced the full coach card (header+avatar+label) with a slim left-bordered italic note.
          Session header is now compact: context line, title, objective.
          Added compact readiness strip (⚡ GOOD TO GO / MODERATE / LOW + %) below header.

  - task: "Today Page UI — Collapsible exercise cards (first expanded, rest collapsed)"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/today.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: >
          ExerciseCard now collapsible. First exercise expanded by default (set during exercises load).
          Header always shows: category badge, exercise name, prescription, set progress pill (x/total), chevron.

  - task: "Today Page UI — Editable weight/reps TextInputs inside set rows"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/today.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: >
          SetRow completely rewritten. Each set row now has:
          - Numbered circle (colored by set type: warmup=gold, ramp=blue, work=white)
          - WU/RM/W type tag
          - Editable TextInput for weight (numeric keyboard)
          - × separator
          - Editable TextInput for reps
          - Inline LOG button (logs the edited values to backend)
          - Check icon when logged
          State managed by setValues: Record<string, {weight, reps}> at TodayScreen level.
          Initialized from exercise.sets when exercises load, updated on input change.
          handleLog now reads from setValues[setId] before falling back to set defaults.

  - task: "Today Page UI — Per-exercise effort selector (1-5 gold circles)"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/today.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: >
          Effort selector added at the bottom of each expanded exercise card.
          5 circles labeled 1-5. Unselected: dark (#1A1A1E) bg, muted number.
          Selected: gold (#C9A84C) fill, dark (#0A0A0C) number.
          State: efforts: Record<exerciseId, number> at TodayScreen level.
          Per exercise, not per set (as per user spec).

  - task: "Today Page UI — Pill action buttons: Swap, Pain, Add Set"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/today.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: >
          Three pill action buttons inside each expanded card:
          - Swap (muted, opens AdjustModal)
          - Pain (red #EF5350, opens PainReportModal)
          - Add Set (gold, appends a new work set to the exercise's sets array)
          Replaced the old 'Adjust Exercise' + 'Report Pain' row.

  - task: "Today Page UI — Sticky rest timer between scroll and bottom bar"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/today.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: >
          RestTimerBar moved OUTSIDE the ScrollView to a fixed position between scroll content
          and the bottom bar. This makes it sticky/always visible while scrolling through exercises.

  - task: "Today Page UI — FINISH SESSION disabled until 50% sets logged"
    implemented: true
    working: "NA"
    file: "frontend/app/(tabs)/today.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: >
          canFinish = loggedCount >= totalSets / 2.
          Button visually disabled (gray bg, muted text) when < 50% sets logged.
          Button active (gold) when >= 50% sets logged.
          Bottom bar also shows set count, label, and % pill.

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 26
  run_ui: true

test_plan:
  current_focus:
    - "Today Page Terminology Fix — ExCategory types and getCategoryStyle labels"
    - "Today Page UI — Thin gold progress bar at top"
    - "Today Page UI — Compact session header with slim italic coach note"
    - "Today Page UI — Collapsible exercise cards (first expanded, rest collapsed)"
    - "Today Page UI — Editable weight/reps TextInputs inside set rows"
    - "Today Page UI — Per-exercise effort selector (1-5 gold circles)"
    - "Today Page UI — Pill action buttons: Swap, Pain, Add Set"
    - "Today Page UI — Sticky rest timer between scroll and bottom bar"
    - "Today Page UI — FINISH SESSION disabled until 50% sets logged"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: >
      LOG PAGE UX/UI REDESIGN complete. Changes:

      BUG FIXES:
      1. Removed INITIAL_EXERCISES hardcoded array (Floor Press 225, Pendlay Row 185, etc.)
      2. Removed KeyboardAvoidingView — uses keyboardShouldPersistTaps="handled" instead
      3. Removed PainModal component (pain reported on Today tab)
      4. Removed RPERow component (replaced by per-exercise effort selector)
      5. SetData.rpe and SetData.pain fields removed from interface
      6. Added effortRating: number to ExerciseLog interface (0=unset, 6-10)

      UI REDESIGN:
      7. Session header: LEFT=session badge + "Workout Log" title + date/week; RIGHT=live session timer (appears after first set logged)
      8. QuickStatsStrip: 3 pills — Sets (teal when active), LB Volume (live), Avg RPE (gold when set)
      9. ExerciseCards: collapsed shows name + subline (prescription + "Last: x") + progress pill + chevron
      10. ExerciseCards expanded: column headers (TARGET | WEIGHT | REPS), set rows, effort selector (6-10), action pills
      11. SetRow: numbered circle + target ref + editable weight input + × + editable reps input + LOG button; logged=teal strikethrough
      12. Active set (first unlogged): gold border on inputs
      13. Per-exercise effort circles: 6-10, gold when selected (RPE scale)
      14. Action pills: "+ Set" | "Notes" | "History"
      15. RestTimerBar: always visible from page open (idle state shows configured time in muted gray, counts down after first set)
      16. Session elapsed timer: auto-starts on first set logged, shows in header
      17. Volume computation: weight × reps per logged set, formatted with commas
      18. Avg RPE: average of all effortRating > 0 per exercise

      Test credentials: user_a@theprogram.app / StrongmanA123
      
      Navigate to Log tab and verify:
      - Page loads with today's exercises from API (NOT Floor Press/Pendlay Row hardcoded data)
      - RestTimerBar visible immediately in idle/muted state showing "1:30"
      - Log a set → timer starts counting down, session timer appears in header
      - QuickStatsStrip updates live (sets count, volume, RPE)
      - Exercise cards collapse/expand
      - Column headers (TARGET | WEIGHT | × | REPS) visible in expanded card
      - Editable weight and reps inputs
      - Active set has gold border
      - Effort circles 6-10, tap one → turns gold
      - "+ Set" adds a set row; "Notes" shows text input; "History" opens drawer
      - FINISH SESSION disabled <50%, gold when >=50%

      BUG FIXES:
      1. ExCategory type updated: 'maxeffort' → 'primary', 'dynamiceffort' → 'speed'
      2. getCategoryStyle labels updated: Primary, Speed, Support, Accessory, Injury Prevention
      3. Eric's hardcoded numbers (315x1, 375, etc.) removed from mock EXERCISES array
      4. buildTodayExercisesFromLocal and buildTodayExercisesFromApi updated to use new category names

      === CROSS-TAB SYNC FIX v2 (setIndex-based precise sync applied 2025-06-12) ===
      ROOT CAUSE IDENTIFIED: Previous count-based sync was fundamentally broken for middle-set
      removals. setIndex field now stored in each log entry so both tabs can do exact-position
      matching instead of guessing via count.

      Changes:
      - backend/server.py: WorkoutLogCreate + WorkoutLogEntry → added optional setIndex field
      - today.tsx handleLog: computes setIdx from exercises array, passes setIndex to logApi.create
      - today.tsx handleEditSave: same
      - log.tsx handleLogSet: same
      - log.tsx handleEditSave: same
      - Both re-sync paths: use bySetIdx map for precise matching; count-based fallback for legacy entries
      - Both full-rebuild sync paths: same setIndex-aware logic

agent_communication:
  - agent: "main"
    message: >
      FULL APP QA AUDIT — All terminology fixes applied pre-test.
      Fixed BEFORE testing:
      1. today.tsx coach notes: "supplemental" → "support" in user-facing text
      2. current-block.tsx: "Max effort rotation — work to 1RM weekly" → "Heavy rotation — build to a top set weekly"
      3. current-block.tsx: "Avg RPE" → "Avg Effort"
      4. tools/checkin.tsx: "RPE:" → "Effort:"
      5. log.tsx getSessionShortLabel: "DELOAD" → "RECOVERY"
      
      Already correct (no changes needed):
      - index.tsx: "AVG EFFORT" label ✅, "EST. MAXES" heading ✅, no FAB ✅
      - settings.tsx: "Recovery week alert" ✅, no Lose It section ✅
      - today.tsx: category badges (Primary/Speed/Support/Accessory/Injury Prevention) ✅
      
      Expo restarted. Run the full QA test now using test credentials:
      user_a@theprogram.app / StrongmanA123 (POST /api/seed first)
      
      WHAT CHANGED:
      1. _layout.tsx: "Log" tab → "Schedule" tab with calendar-month-outline icon
      2. log.tsx: Entirely rewritten as ScheduleScreen (read-only, no log writes)
      3. today.tsx: Removed 300ms artificial delay from re-sync path
      
      NEW SCHEDULE PAGE FEATURES:
      - Header: "Schedule" title + "Week X · Block · Phase" subtitle + "Swap days" button
      - Week navigation: left/right arrows + date range label + "THIS WEEK" gold badge
      - Weekly calendar grid: 7 day cards (Mon-Sun) with colors:
        RED = completed, GOLD = today, GREEN = upcoming, GRAY = rest
      - Legend: 4 color items below grid
      - Week summary stats: Sessions X/Y (red), Volume (white), Avg Effort (white)
      - Session history cards: today (gold border + GO TO SESSION), completed (expandable), upcoming (green)
      - Swap mode: tap "Swap days" → tap 2 training days → calls calendarApi.reschedule twice
      
      DATA SOURCES:
      - calendarApi.getEvents(startDate, endDate) → week's sessions
      - logApi.list() → history + stats (READ ONLY - never writes)
      
      Expo restarted. Test credentials: user_a@theprogram.app / StrongmanA123
      
      Please test:
      1. Tab bar shows "Schedule" with calendar icon (not "Log" with "+" icon)
      2. Schedule page loads with weekly calendar grid (7 day cards visible)
      3. Colors correct: today = GOLD, completed = RED, upcoming = GREEN, REST = gray
      4. "THIS WEEK" badge visible on current week
      5. Week navigation arrows work (← and →)
      6. Session history cards appear below stats
      7. Today's session card has gold border + "GO TO SESSION" button
      8. "GO TO SESSION" navigates to Today tab
      9. Completed sessions show stats row + expandable detail
      10. "Swap days" button activates swap mode with banner
      11. No crashes, no sync bugs
      1. today.tsx input/repsInput styles now have minWidth: 0 to prevent LOG button overflow on web.
      2. lastLoadDate.current ref added to useFocusEffect in both today.tsx and log.tsx to prevent
         same-day double rebuilds and handle midnight rollovers.
      3. setIndex-based precise sync: handleLog/handleEditSave in both tabs pass setIndex to API;
         re-sync paths use bySetIdx map for exact set matching (count-based fallback for legacy entries).
      
      PRIMARY TEST: Log 2 sets on Today page → switch to Log tab → BOTH sets must appear as logged.
      ALSO TEST: all 9 cross-tab sync scenarios below.
      
      Expo restarted. Please test now.

  - agent: "main"
    message: >
      REST PERIOD SELECTOR feature fully implemented in today.tsx. Changes made:
      1. Added REST_CONFIG with exact per-category options (primary/speed/supplemental/accessory/prehab)
      2. Added RestSelector component — horizontal chip row inside each ExerciseCard (between header and sets)
      3. Added CustomRestModal — animated bottom sheet with minute/second inputs
      4. Updated RestTimerBar — now shows exercise name + countdown (4:32 / 5:00) + progress bar
      5. Timer changed from COUNT-UP to COUNT-DOWN with auto-stop haptic when reaching 0
      6. handleLog now computes exercise-specific rest duration and starts the countdown
      7. Added timerTarget + timerExerciseName state
      8. CustomRestModal added to JSX for custom rest entry
      
      Test credentials: user_a@theprogram.app / StrongmanA123
      
      Navigate to Today tab and verify:
      - Each exercise card shows REST chip row when expanded (3:00, 5:00✓, 7:00, 10:00 for Primary)
      - Default chip is highlighted in category accent color (gold for Primary)
      - Tapping a chip changes the selection
      - Custom chip opens the bottom sheet modal with min/sec inputs
      - After logging a set, RestTimerBar shows exercise name + countdown from selected duration
      - Timer auto-stops + haptic when countdown reaches 0
      - Reset button resets back to full duration
      - DONE ✓ appears in green when timer completes
      - Progress bar fills from left to right as time elapses

  - agent: "main"
    message: >
      setIndex-based sync implemented. Please test all 9 cross-tab sync scenarios:
      1. Log 2 sets on Today → switch to Log → BOTH appear logged
      2. Log 1 more on Log → switch to Today → ALL 3 appear logged
      3. Expanded state preserved on Today after tab switches (no reset)
      4. Remove a logged set on Log → switch to Today → removed set NOT logged
      5. Log set on Today → immediately switch to Log → appears logged (within 1 sec)
      6. Log 5 sets across both tabs → exactly 5 logged on both tabs
      7. Effort rating set on Log → switch to Today → switch back → still shows
      8. Session timer running on Log → switch to Today → switch back → timer still running
      9. Fresh open → Today rebuilds once → Log rebuilds once → switch back → no double rebuild
      5. Thin 3px gold progress bar at very top of screen
      6. Compact session header: context line + title + objective
      7. Slim italic coach note (replaced full card) with gold left border
      8. Compact readiness strip: ⚡ GOOD TO GO/MODERATE/LOW + score%
      9. Exercise cards now collapsible: first exercise expanded by default
      10. SetRow: editable weight (TextInput) + reps (TextInput) + inline LOG button + check icon when logged
      11. Per-exercise effort selector (1-5 circles, gold when selected) at bottom of expanded card
      12. Three pill action buttons: Swap · Pain · Add Set
      13. RestTimerBar moved OUTSIDE ScrollView (sticky between content and bottom bar)
      14. FINISH SESSION button: disabled until loggedCount >= totalSets/2 (50% requirement)

      Test credentials: user_a@theprogram.app / StrongmanA123
      
      Navigate to Today tab and verify:
      - Page loads with session data (Heavy Lower / Heavy Upper / etc.)
      - First exercise card is expanded, rest are collapsed
      - Tap on collapsed card to expand it
      - Weight and reps inputs are editable
      - LOG button submits the set
      - Effort circles turn gold when tapped
      - Swap/Pain/Add Set pills work
      - Rest timer is sticky (visible while scrolling)
      - FINISH SESSION is grayed out initially, activates after 50% sets logged



backend:
  - task: "CRITICAL SYNC FIX — Fix 6: GET /api/bodyweight scoped by userId"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added userId: str = Depends(get_current_user) to get_bodyweight_history. Now filters db.log by userId AND bodyweight != null."

  - task: "CRITICAL SYNC FIX — Fix 7: Check-in endpoints scoped by userId"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "GET /api/checkin filters by userId. POST /api/checkin saves userId to document. GET /api/checkin/week/{week_num} filters by userId AND week."

  - task: "CRITICAL SYNC FIX — Fix 8: Substitution endpoints scoped by userId"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "POST /api/substitutions saves userId to document. GET /api/substitutions filters by userId (plus optional week filter)."

  - task: "CRITICAL SYNC FIX — DB Migration: Backfill orphan log/checkin/substitution entries"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added _migrate_log_entries_add_userid() async function. Called on startup. When multiple users exist, skips auto-migration. Manual migration script run_migration.py was executed: backfilled 128 log entries, 7 checkins, 234 substitutions to user_a@theprogram.app (userId=5e5f0dd7-1fe7-4df4-b813-4b02d5e9e902). Verified: 0 orphan entries remain. Startup now logs: [MIGRATION] No orphan log entries found."

metadata:
  created_by: "main_agent"
  version: "5.0"
  test_sequence: 27
  run_ui: false

test_plan:
  current_focus:
    - "CRITICAL SYNC FIX — Fix 6: GET /api/bodyweight scoped by userId"
    - "CRITICAL SYNC FIX — Fix 7: Check-in endpoints scoped by userId"
    - "CRITICAL SYNC FIX — Fix 8: Substitution endpoints scoped by userId"
    - "CRITICAL SYNC FIX — DB Migration: Backfill orphan log/checkin/substitution entries"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: >
      CRITICAL SYNC FIX — Fixes 6-8 + DB Migration complete.

      WHAT WAS DONE:
      1. Fix 6 (Bodyweight): GET /api/bodyweight now requires auth + filters by userId.
      2. Fix 7 (Check-ins): GET /api/checkin, POST /api/checkin, GET /api/checkin/week/{week_num}
         all scoped by userId. POST now saves userId to the document before inserting.
      3. Fix 8 (Substitutions): POST /api/substitutions saves userId. GET /api/substitutions
         filters by userId (+ optional week param).
      4. Migration: Added _migrate_log_entries_add_userid() to startup event.
         - Ran manual migration: backfilled 128 logs + 7 checkins + 234 substitutions
           to user_a@theprogram.app (userId=5e5f0dd7-1fe7-4df4-b813-4b02d5e9e902).
         - db.log.count({userId:{$exists:false}}) = 0 ✅
         - Backend startup now shows "[MIGRATION] No orphan log entries found." ✅

      HOW TO TEST:
      1. POST /api/auth/login {email: "user_a@theprogram.app", password: "StrongmanA123"} → get JWT
      2. GET /api/bodyweight with Authorization: Bearer <token> → should return list of {date, weight} entries
      3. GET /api/checkin with token → should return checkin list (scoped to user_a)
      4. POST /api/checkin with token + body {week, sessionType, setsLogged, totalSets, avgEffort, coachNote} → should save with userId
      5. GET /api/checkin/week/1 with token → should return week 1 checkin for user_a only
      6. POST /api/substitutions with token + body {date, week, day, sessionType, originalExercise, replacementExercise, reason} → should save with userId
      7. GET /api/substitutions with token → should return substitutions for user_a only
      8. Test data isolation: Login as user_b@theprogram.app (HypertrophyB123), call same endpoints → should return different (empty) results
      9. Log a set on Today page (as user_a) → verify Home Week Review, Home stats, PR board all show data for user_a

      Test credentials:
      - user_a@theprogram.app / StrongmanA123 (has 128 backfilled log entries)
      - user_b@theprogram.app / HypertrophyB123 (fresh, no log entries)

  - agent: "main"
    message: >
      SCHEDULE PAGE — SESSION COMPLETED MATCHING FIX.

      ROOT CAUSE: getDayStatus() used strict exact-date matching. If a user logged
      "Heavy Lower" on Wednesday but the calendar event was on Monday, the Monday event
      showed as "missed" even though the user DID train Heavy Lower that week.

      FIX: Added sessionType-based loose matching to getDayStatus() in log.tsx.
      Now builds completedSessionTypes = Set of all sessionTypes logged this week.
      If a planned event's sessionType is in that set, the event is marked "completed"
      even if the log date ≠ event date. Exact date match is still primary; sessionType
      match is fallback for off-day training.

      CHANGED: frontend/app/(tabs)/log.tsx:
        - getDayStatus(): Added sessionType and completedSessionTypes params (optional, backward-compat).
        - loadData(): Builds completedSessionTypes from allLogs.
        - Calendar grid getDayStatus() call: passes ev?.sessionType, completedSessionTypes.
        - Session cards getDayStatus() call: passes ev.sessionType, completedSessionTypes.

      RESULT: User has 41 logs for current week. All 4 session types (Heavy Lower,
      Heavy Upper, Speed Lower, Speed Upper) are trained. Now ALL 4 past events will
      show "completed" and sessionsCompleted counter = 4/4 (or the correct count).


      CATEGORY 1 — Home/Schedule session count mismatch:
      1. Added _calculate_current_week() helper to server.py (date math, not profile int).
      2. GET /api/log/stats/week/{week_num} now accepts optional start_date + end_date query
         params. When provided, queries by date range (same source as Schedule). Legacy
         week-number query retained as fallback.
      3. GET /api/plan/session/today now returns currentWeek int in response (computed from
         planStartDate via _calculate_current_week).
      4. TRAINING_CALENDAR in get_today_session_mongo updated to new terminology:
         Heavy Lower/Upper and Speed Lower/Upper. Old legacy names tried second as fallback.
      5. frontend/src/utils/api.ts logApi.weekStats now accepts optional startDate/endDate.
      6. frontend/app/(tabs)/index.tsx loadData computes Mon-Sun date range (local time)
         and passes weekStart/weekEnd to logApi.weekStats — matches Schedule page data source.

      CATEGORY 2 — _ensure_plan_loaded:
      7. Startup: Removed _ensure_plan_loaded() call from startup. Plans load on-demand per user.
      8. apply_recommendation: Changed db.profile.find_one({}) to find_one({"userId": userId}).
      9. apply_recommendation: Changed _ensure_plan_loaded() to _ensure_plan_loaded(userId).

      CATEGORY 3 — Legacy terminology:
      10. today.tsx fallback exercise name: 'Supplemental' → 'Support'.
      11. today.tsx getTodaySession(1) calls → getTodaySession(week || 1) in both useState inits.
      12. tools/calendar.tsx: Added Upper Push, Lower Body, Full Body, Repetition Upper, Repetition
          Lower to both SESSION_COLORS and SESSION_DOTS maps with distinct colors.

      CATEGORY 4 — Coach data leak:
      13. coach_chat: Removed fallback db.log.find({}) — now strictly scoped to userId only.
          New comment: "no cross-user fallback".

      CATEGORY 5 — Weekly review stale data:
      14. GET /api/weekly-review: Now computes Mon-Sun date range (local time). Log queries use
          date-range filter ({$gte: week_start, $lte: week_end}) instead of week number. prev_logs
          also uses date range for previous week. Cache key changed from {week: N} to {weekStart: date}.
      15. POST /api/log cache invalidation: Now deletes by {weekStart: week_start} instead of
          {week: current_week} so new reviews generate with fresh data.

      HOW TO TEST:
      1. GET /api/log/stats/week/1?start_date=2026-04-13&end_date=2026-04-19 → should return
         sessionsCompleted based on DATE RANGE (matching Schedule page). Without query params
         → falls back to week=1 query.
      2. GET /api/plan/session/today → response should include "currentWeek" integer field.
      3. GET /api/weekly-review (first call) → should cache with weekStart field not week int.
         Second call → cached: true. After POST /api/log → cache invalidated, third call regenerates.
      4. POST /api/coach/apply-recommendation with JWT → should use userId-scoped profile and plan.
      5. Coach chat for NEW user (no logs) → should NOT pull other users' log data.
      6. Home tab: sessionsCompleted should match Schedule tab Sessions count.
      7. All existing endpoints still return 200.

      Test credentials: user_a@theprogram.app / StrongmanA123
