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
  Current session: Fix 5 identified issues (server.py duplicates, missing api.ts exports, 
  missing StatBox in index.tsx, double loadAll in track.tsx, today.tsx finish navigation) 
  and build Post-Workout Review screen (review.tsx).

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
      CRITICAL FIX: Session type synchronization bug across Home, Today, and Log tabs.
      
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
