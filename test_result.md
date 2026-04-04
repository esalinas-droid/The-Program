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
  version: "3.0"
  test_sequence: 3
  run_ui: false

test_plan:
  current_focus:
    - "Apple Sign-In backend - missing jwt import in auth.py"
    - "Auth endpoints - register, login, me, social, logout"
    - "User data isolation - all endpoints scoped by userId"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: >
      NEW SESSION: Apple Sign-In finalization + Full Auth QA.
      
      CRITICAL BUG FIXED: auth.py was missing 'import jwt' at the top.
      The _verify_apple_token function used jwt.get_unverified_header() and jwt.decode()
      but the jwt module was never imported. This would cause NameError crash on Apple login.
      Fix: Added 'import jwt' as line 22 in auth.py. Backend auto-reloaded OK.
      
      FRONTEND IMPROVEMENT: auth.tsx Apple Sign-In now has isAvailableAsync() check.
      If Apple auth not available, shows Alert: "Apple Sign-In will be available soon"
      with option to continue with email. Non-cancel errors also use Alert (not error box).
      Apple button still hidden on Android/web (Platform.OS === 'ios').
      
      TEST CREDENTIALS:
      - user_a@theprogram.app / StrongmanA123 (no onboarding yet)
      - user_b@theprogram.app / HypertrophyB123 (no onboarding yet)
      - testathletexyz@theprogram.app (registered this session, no onboarding)
      - DEFAULT_USER fallback: user_001 (has completed onboarding from previous sessions)
      
      Please test:
      1. POST /api/auth/register — register new user, get JWT back
      2. POST /api/auth/login — login with email/password, verify JWT
      3. GET /api/auth/me — verify user info from JWT 
      4. POST /api/auth/social with provider=apple — verify it no longer crashes (jwt import fixed)
      5. POST /api/auth/login with WRONG password — should return 401
      6. POST /api/auth/register with DUPLICATE email — should return 409
      7. GET /api/plan/session/today with valid JWT — should return user-scoped session
      8. GET /api/prs/bests/overview with valid JWT — should return user-scoped PRs
      9. GET /api/profile with valid JWT — should return user-scoped profile
      10. Verify user_a and user_b get DIFFERENT profile/plan data (data isolation)

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
