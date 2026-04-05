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
  Build a mobile-first strength training app "The Program" for advanced athletes using the conjugate method.
  React Native/Expo frontend, FastAPI+MongoDB backend.
  Current session focus: (1) Overhaul onboarding-intake.tsx with 11 comprehensive steps including
  Bodyweight, Primary Weaknesses, Specialty Equipment, Recovery Profile, and Gym+Competition steps.
  (2) Make settings.tsx editable (Athlete profile, injury flags, weaknesses).
  (3) Implement injury sync confirmation flow: edit injuries → preview exercise impact → Accept/Cancel modal.
  New backend endpoints: POST /api/plan/injury-preview and POST /api/plan/apply-injury-update.
  New profile fields in AthleteProfile: goal, primaryWeaknesses, specialtyEquipment, sleepHours,
  stressLevel, occupationType, hasCompetition, competitionDate, competitionType, gymTypes, trainingDaysCount.

backend:
  - task: "Clean server.py — remove duplicate program_router import and include_router calls"
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
    - "Add analyticsApi and substitutionApi to api.ts"
    - "StatBox component and statsGrid style in index.tsx"
    - "Post-Workout Review screen (review.tsx)"
    - "today.tsx FINISH SESSION navigates to review screen"
    - "Fix track.tsx double loadAll + safety timer"
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



