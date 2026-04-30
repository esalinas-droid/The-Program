import { router } from 'expo-router';
import {
  AthleteProfile,
  IntakeData, AnnualPlan, TodaySessionResponse, LogSetData,
  PostWorkoutReviewData, ExerciseAlternative, ProgramChangeEntry
} from '../types';
import { getAuthToken, clearAuth } from './auth';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// ── 401 handling ─────────────────────────────────────────────────────────────
// On any 401 from the backend (token missing/invalid/expired), we clear stored
// auth and redirect to the login screen. We guard against multiple concurrent
// 401s firing the redirect more than once with a module-level flag.
let _redirectingToAuth = false;
async function handleUnauthorized(): Promise<void> {
  if (_redirectingToAuth) return;
  _redirectingToAuth = true;
  try {
    await clearAuth();
  } catch {/* ignore */}
  try {
    router.replace('/auth');
  } catch {/* ignore — router may not be mounted yet */}
  // Reset the guard after a tick so subsequent fresh sessions can redirect again
  setTimeout(() => { _redirectingToAuth = false; }, 1500);
}

// ── Retry config ─────────────────────────────────────────────────────────────
// The hosting proxy occasionally returns 404 "404 page not found" (Go default)
// or 502/503/504 when the backend container is cold-starting. These are
// distinguishable from real app errors because:
//   • Real FastAPI 404s return JSON like {"detail":"Not Found"}
//   • Real app 404s have content-type: application/json
//   • Proxy 404s are plain text and originate from outside the app
// We retry transient gateway errors and proxy-style 404s, but never real app 4xx.
type ApiOptions = RequestInit & { retry?: { attempts?: number; baseDelayMs?: number } };

const TRANSIENT_GATEWAY_STATUSES = new Set([502, 503, 504]);
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function isProxy404(status: number, contentType: string | null, body: string): boolean {
  // Proxy returns plain text "404 page not found" rather than JSON.
  if (status !== 404) return false;
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('application/json')) return false; // real FastAPI 404
  return /404\s*page\s*not\s*found/i.test(body);
}

async function api(path: string, options?: ApiOptions) {
  const attempts     = options?.retry?.attempts     ?? 1;   // 1 = no retry by default
  const baseDelayMs  = options?.retry?.baseDelayMs  ?? 1500;

  // Strip our custom field so it isn't passed to fetch()
  const { retry: _retry, ...fetchOptions } = options || {};

  const token = await getAuthToken();
  const authHeader = token ? { 'Authorization': `Bearer ${token}` } : {};

  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(`${BASE}/api${path}`, {
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        ...fetchOptions,
      });

      if (res.ok) {
        return res.json();
      }

      // 401 = expired/invalid token. Clear auth, redirect to login, and stop.
      // Never retry a 401 — retrying with the same dead token is pointless.
      if (res.status === 401) {
        await handleUnauthorized();
        const text = await res.text().catch(() => '');
        throw new Error(`API ${path} error 401: ${text || 'unauthorized'}`);
      }

      const text = await res.text();
      const ct   = res.headers.get('content-type');
      const transient =
        TRANSIENT_GATEWAY_STATUSES.has(res.status) ||
        isProxy404(res.status, ct, text);

      if (transient && attempt < attempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1); // 1.5s, 3s, 6s...
        console.log(`[API] Transient ${res.status} on ${path} — retry ${attempt}/${attempts - 1} in ${delay}ms`);
        await sleep(delay);
        continue;
      }

      throw new Error(`API ${path} error ${res.status}: ${text}`);
    } catch (err: any) {
      // fetch() throws TypeError on network failure — retry those too
      const isNetworkErr = err instanceof TypeError;
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (isNetworkErr && attempt < attempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.log(`[API] Network error on ${path} — retry ${attempt}/${attempts - 1} in ${delay}ms`);
        await sleep(delay);
        continue;
      }
      throw lastErr;
    }
  }
  // Unreachable, but TS wants it
  throw lastErr ?? new Error(`API ${path} failed after ${attempts} attempts`);
}

// Profile
export const profileApi = {
  get: () => api('/profile'),
  create: (data: Partial<AthleteProfile>) => api('/profile', { method: 'POST', body: JSON.stringify(data) }),
  update: (data: Partial<AthleteProfile>) => api('/profile', { method: 'PUT', body: JSON.stringify(data) }),
  reset: () => api('/profile/reset', { method: 'POST' }),
  switchMode: (mode: 'program' | 'free'): Promise<{ success: boolean; mode: string; needsPathChoice: boolean; profile: any }> =>
    api('/profile/switch-mode', { method: 'POST', body: JSON.stringify({ mode }) }),
};

// Auth — endpoints under /api/auth that aren't login/register (those are
// handled separately because they need to return the JWT for caller storage).
export const authApi = {
  /**
   * Update user preferences (marketing opt-in, etc.). Goes through the api()
   * helper so it picks up retry, 401 handling, and auth headers automatically.
   * Audit Bug #7 fix: settings.tsx previously used raw fetch() which bypassed
   * all of that — errors were silently swallowed and a 401 wouldn't redirect.
   */
  updatePreferences: (data: { marketingOptIn?: boolean }) =>
    api('/auth/preferences', { method: 'PUT', body: JSON.stringify(data) }),
};

// Log
export const logApi = {
  list: (params?: { week?: number; exercise?: string; startDate?: string; endDate?: string }) => {
    if (!params) return api('/log');
    const entries = Object.entries(params)
      .filter(([, v]) => v != null)
      .map(([k, v]) => {
        const key = k === 'startDate' ? 'start_date' : k === 'endDate' ? 'end_date' : k;
        return [key, String(v)] as [string, string];
      });
    const qs = entries.length > 0 ? '?' + new URLSearchParams(entries).toString() : '';
    return api(`/log${qs}`);
  },
  create: (entry: any) => api('/log', { method: 'POST', body: JSON.stringify(entry) }),
  update: (id: string, entry: any) => api(`/log/${id}`, { method: 'PUT', body: JSON.stringify(entry) }),
  delete: (id: string) => api(`/log/${id}`, { method: 'DELETE' }),
  weekStats: (week: number, startDate?: string, endDate?: string) => {
    let qs = `/log/stats/week/${week}`;
    if (startDate && endDate) {
      qs += `?start_date=${startDate}&end_date=${endDate}`;
    }
    return api(qs);
  },
};

// PRs
export const prApi = {
  getAll: () => api('/prs'),
  getHistory: (exercise: string) => api(`/prs/${encodeURIComponent(exercise)}`),
  getBests: () => api('/prs/bests/overview'),
};

// Bodyweight
export const bwApi = {
  getHistory: () => api('/bodyweight'),
};

// Check-in
export const checkinApi = {
  list: () => api('/checkin'),
  create: (data: any) => api('/checkin', { method: 'POST', body: JSON.stringify(data) }),
  getByWeek: (week: number) => api(`/checkin/week/${week}`),
};

// Seed
export const seedApi = {
  seed: () => api('/seed', { method: 'POST' }),
};

// Coach
export const coachApi = {
  chat: (message: string, history: { role: string; content: string }[], conversationId?: string | null, source: string = 'user_typed') =>
    api('/coach/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        conversation_history: history,
        conversation_id: conversationId ?? null,
        source,
      }),
    }),
  activeTrigger: () => api('/coach/active-trigger'),
  getConversations: () => api('/coach/conversations'),
  getConversation: (id: string) => api(`/coach/conversations/${id}`),
  deleteConversation: (id: string) => api(`/coach/conversations/${id}`, { method: 'DELETE' }),
  applyRecommendation: (conversationId: string, summary: string, details: string, exercises?: any[]) =>
    api('/coach/apply-recommendation', {
      method: 'POST',
      body: JSON.stringify({ conversation_id: conversationId, summary, details, exercises: exercises || [] }),
    }),
};

// ─── Stage 1: Program API ───────────────────────────────────────────────────

export const programApi = {
  // Intake → generates 12-month plan
  // Uses retry-with-backoff because this is a heavy first-touch call that often
  // hits a cold-starting backend; transient proxy 404s/502s are common here.
  submitIntake: (data: IntakeData): Promise<{ success: boolean; profile: any; plan: AnnualPlan }> =>
    api('/profile/intake', {
      method: 'POST',
      body: JSON.stringify(data),
      retry: { attempts: 4, baseDelayMs: 2000 }, // ~2s, 4s, 8s = up to ~14s of recovery time
    }),

  // Planning
  getYearPlan: (): Promise<AnnualPlan> => api('/plan/year'),
  getCurrentBlock: (): Promise<{ phase: any; block: any }> => api('/plan/block/current'),
  getTodaySession: (): Promise<TodaySessionResponse> => api('/plan/session/today'),

  // Session execution
  startSession: (sessionId: string) =>
    api('/session/start', { method: 'POST', body: JSON.stringify({ sessionId }) }),
  logSet: (data: LogSetData) =>
    api('/session/log-set', { method: 'POST', body: JSON.stringify(data) }),
  adjustExercise: (exerciseId: string, exerciseName: string, reason: string): Promise<{ exercise: string; reason: string; alternatives: ExerciseAlternative[] }> =>
    api('/session/adjust-exercise', { method: 'POST', body: JSON.stringify({ exerciseId, exerciseName, reason }) }),
  applyAdjustment: (sessionId: string, oldExercise: string, newExercise: string, reason: string) =>
    api('/session/apply-adjustment', { method: 'POST', body: JSON.stringify({ sessionId, oldExercise, newExercise, reason }) }),
  finishSession: (sessionId: string): Promise<PostWorkoutReviewData> =>
    api('/session/finish', { method: 'POST', body: JSON.stringify({ sessionId }) }),

  // Pain
  logPain: (data: { exerciseId?: string; sessionId?: string; location: string; score: number; note?: string }) =>
    api('/pain', { method: 'POST', body: JSON.stringify(data) }),
  getPainTrends: () => api('/pain/trends'),

  // Coach intelligence
  getChangeLog: (): Promise<{ changes: ProgramChangeEntry[] }> => api('/coach/change-log'),
  getCoachMemory: () => api('/coach/memory'),

  // Progress
  getPRs: () => api('/progress/prs'),
  getE1RM: (exercise: string) => api(`/progress/e1rm/${encodeURIComponent(exercise)}`),
  getVolumeTrends: () => api('/progress/volume'),
  getCompliance: () => api('/progress/compliance'),
  getBodyweight: () => api('/progress/bodyweight'),

  // Uploads
  confirmFacts: (facts: Array<{ type: string; value: string }>) =>
    api('/uploads/confirm', { method: 'POST', body: JSON.stringify({ facts }) }),
};

// Analytics
export const analyticsApi = {
  overview: () => api('/analytics/overview'),
  volume:   () => api('/analytics/volume'),
  pain:     () => api('/analytics/pain'),
  compliance: () => api('/analytics/compliance'),
};

// Upload Processing
export const uploadApi = {
  analyzeProgram: (files: Array<{data: string; name: string; mimeType: string}>, context?: string) =>
    api('/profile/upload-program', { method: 'POST', body: JSON.stringify({ files, context }) }),
  analyzeMedical: (files: Array<{data: string; name: string; mimeType: string}>, context?: string) =>
    api('/profile/upload-medical', { method: 'POST', body: JSON.stringify({ files, context }) }),
};

// Substitutions
export const substitutionApi = {
  log: (data: {
    date: string; week: number; day: string; sessionType: string;
    originalExercise: string; replacementExercise: string; reason: string;
  }) => api('/substitutions', { method: 'POST', body: JSON.stringify(data) }),
  list: (week?: number) => {
    const qs = week != null ? `?week=${week}` : '';
    return api(`/substitutions${qs}`);
  },
};

// Injury sync / plan intelligence
export interface InjuryPreviewResult {
  addedInjuries: string[];
  removedInjuries: string[];
  exercisesRestricted: { name: string; category: string; reason: string }[];
  exercisesRestored: { name: string; category: string; reason: string }[];
  hasChanges: boolean;
  summary: string;
}

export const planApi = {
  injuryPreview: (newInjuryFlags: string[]): Promise<InjuryPreviewResult> =>
    api('/plan/injury-preview', { method: 'POST', body: JSON.stringify({ newInjuryFlags }) }),
  applyInjuryUpdate: (newInjuryFlags: string[]): Promise<{ success: boolean; message: string; added: string[]; removed: string[] }> =>
    api('/plan/apply-injury-update', { method: 'POST', body: JSON.stringify({ newInjuryFlags }) }),
  rebuild: (data: any): Promise<{ success: boolean; message: string; plan: any; rag_enhanced: boolean }> =>
    api('/plans/rebuild', {
      method: 'POST',
      body: JSON.stringify(data),
      retry: { attempts: 4, baseDelayMs: 2000 },
    }),
};

// Pain Reports
export const painReportApi = {
  create: (data: {
    exerciseName: string;
    bodyRegion: string;
    painType: string;
    intensity: number;
    timing: string;
    sessionType?: string;
    notes?: string;
  }) => api('/pain-report', { method: 'POST', body: JSON.stringify(data) }),
  getRecent: (days?: number) => api(`/pain-report${days ? `?days=${days}` : ''}`),
};

// Readiness Checks
export const readinessApi = {
  submit: (data: { sleepQuality: number; soreness: number; moodEnergy: number }) =>
    api('/readiness', { method: 'POST', body: JSON.stringify(data) }),
  getToday: (): Promise<{
    hasCheckedIn: boolean;
    readiness: {
      sleepQuality: number; soreness: number; moodEnergy: number;
      totalScore: number; adjustmentApplied: boolean; adjustmentNote: string;
    } | null;
  }> => api('/readiness/today'),
};

// Session Ratings
export const sessionRatingApi = {
  submit: (data: {
    sessionType: string;
    week: number;
    rpe: number;
    notes?: string;
    setsLogged?: number;
    totalSets?: number;
  }): Promise<{ id: string; aiInsight: string; rpe: number; completionPct: number }> =>
    api('/session-rating', { method: 'POST', body: JSON.stringify(data) }),
  getLatest: () => api('/session-rating/latest'),
};

// ─── Phase 2 Batch 2 APIs ──────────────────────────────────────────────────────

// Task 5: Weekly Auto-Review
export const weeklyReviewApi = {
  get: (): Promise<{
    hasReview: boolean;
    cached: boolean;
    week: number;
    generatedAt: string;
    summary: string;
    highlights: string[];
    concerns: string[];
    nextWeekFocus: string;
    stats: {
      sessionsCompleted: number;
      sessionsPlanned: number;
      avgRPE: number;
      prsHit: number;
      painReports: number;
    };
  }> => api('/weekly-review'),
};

// Task 6: Auto Load/Volume Adjustment
export const autoAdjustApi = {
  adjust: (): Promise<{
    adjusted: boolean;
    direction: string;
    setsAdjusted: number;
    avgRPE: number;
    note: string;
    changes: Array<{ exercise: string; session: string; week: number; direction: string }>;
  }> => api('/plan/auto-adjust', { method: 'POST' }),

  autoregulate: (data: {
    currentRPE: number;
    targetRPE: number;
    exercise?: string;
    setNumber?: number;
    currentLoad?: number;
  }): Promise<{
    suggestion: 'reduce' | 'increase' | 'maintain';
    message: string;
    currentRPE: number;
    targetRPE: number;
    suggestedLoad: number | null;
  }> => api('/plan/autoregulate', { method: 'POST', body: JSON.stringify(data) }),
};

// Task 7: Deload Detection
export const deloadApi = {
  check: (): Promise<{
    deloadRecommended: boolean;
    urgency: 'immediate' | 'soon' | 'none';
    deloadScore: number;
    signals: string[];
    message: string;
    stats: {
      avgRPE: number;
      painReports: number;
      completionRate: number;
      currentWeek: number;
    };
  }> => api('/deload/check'),
};

// Task 11: Personalized Warm-Up
export const warmupApi = {
  getToday: (): Promise<{
    title: string;
    sessionFocus: 'upper' | 'lower';
    duration: string;
    steps: string[];
    stepCount: number;
    readinessScore: number;
    readinessNote: string;
    hasInjuryModifications: boolean;
    extended: boolean;
  }> => api('/warmup/today'),
};

// ─── Phase 2 Batch 3 APIs ──────────────────────────────────────────────────────

// Task 8: Rehab Progression Tracking
export const rehabApi = {
  start: (injuryType: string) =>
    api('/rehab/start', { method: 'POST', body: JSON.stringify({ injuryType }) }),
  getStatus: (): Promise<{
    hasActiveRehab: boolean;
    protocolId?: string;
    injuryKey?: string;
    injuryInput?: string;
    currentPhase?: number;
    phaseName?: string;
    durationLabel?: string;
    goal?: string;
    criteriaToAdvance?: string;
    exercises?: Array<{ name: string; prescription: string; level: string; notes: string; is_rag: boolean }>;
    cleanSessions?: number;
    sessionsRequired?: number;
    readyToAdvance?: boolean;
    isFinalPhase?: boolean;
  }> => api('/rehab/status'),
  getExercises: (): Promise<{
    hasActiveRehab: boolean;
    injuryKey?: string;
    injuryInput?: string;
    currentPhase?: number;
    phaseName?: string;
    exercises?: Array<{ name: string; prescription: string; level: string; notes: string; is_rag: boolean }>;
  }> => api('/rehab/exercises'),
  log: (data: {
    exerciseName: string;
    setsCompleted: number;
    repsCompleted?: string;
    painLevel: number;
    notes?: string;
  }) => api('/rehab/log', { method: 'POST', body: JSON.stringify(data) }),
  graduate: () => api('/rehab/graduate', { method: 'POST' }),
};

// Task 9: Competition Peaking
export const competitionApi = {
  set: (competitionDate: string, eventName?: string) =>
    api('/competition/set', {
      method: 'POST',
      body: JSON.stringify({ competitionDate, eventName: eventName || 'Competition' }),
    }),
  getStatus: (): Promise<{
    hasCompetition: boolean;
    competitionDate?: string;
    eventName?: string;
    daysOut?: number;
    weeksOut?: number;
    phase?: string;
    phaseLabel?: string;
    color?: string;
    bannerUrgency?: 'low' | 'medium' | 'high' | 'urgent';
    adjustments?: string[];
    ragTip?: string | null;
  }> => api('/competition/status'),
};

// Task 10: Exercise Rotation Detection
export const calendarApi = {
  getEvents:   (start?: string, end?: string) =>
    api(`/calendar/events${start && end ? `?start_date=${start}&end_date=${end}` : ''}`),
  reschedule:  (body: { originalDate: string; newDate: string; sessionType?: string; reason?: string }) =>
    api('/calendar/reschedule', { method: 'POST', body: JSON.stringify(body) }),
  undoReschedule: (originalDate: string) =>
    api(`/calendar/reschedule/${originalDate}`, { method: 'DELETE' }),
  updatePreferredDays: (body: { preferredDays: string[]; notificationHour?: number; notificationMinute?: number }) =>
    api('/profile/preferred-days', { method: 'PUT', body: JSON.stringify(body) }),
};

// Task 10: Exercise Rotation Detection
export const rotationApi = {
  check: (): Promise<{
    flagged: Array<{
      exercise: string;
      category: string;
      weeksUsed: number;
      windowWeeks: number;
      overduByWeeks: number;
      suggestion: { replacement: string; reason: string } | null;
    }>;
    count: number;
    message: string;
  }> => api('/rotation/check'),
  apply: (swaps: Array<{ original: string; replacement: string; reason?: string }>) =>
    api('/rotation/apply', { method: 'POST', body: JSON.stringify({ swaps }) }),
};

// Task 13: Changelog with Undo
export const changeLogApi = {
  get: (): Promise<{
    changes: Array<{
      changeId: string;
      date: string;
      week: number;
      sessionType: string;
      original: string;
      replacement: string;
      reason: string;
      changeType: string;
      undone: boolean;
      undoable: boolean;
      timestamp: string;
    }>;
    count: number;
  }> => api('/coach/change-log'),
  undo: (changeId: string) =>
    api(`/coach/undo/${changeId}`, { method: 'POST' }),
};

// Tracked Lifts
export const liftsApi = {
  list:        ()                                             => api('/lifts'),
  add:         (data: { exercise: string; category: string; bestWeight?: number; bestReps?: number; lastDate?: string }) =>
                 api('/lifts', { method: 'POST', body: JSON.stringify(data) }),
  update:      (id: string, data: any)                       => api(`/lifts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete:      (id: string)                                  => api(`/lifts/${id}`, { method: 'DELETE' }),
  setFeatured: (featuredIds: string[])                       => api('/lifts/featured', { method: 'PUT', body: JSON.stringify({ featuredIds }) }),
  catalog:     ()                                            => api('/lifts/catalog'),
};

// Streak
export const streakApi = {
  get: () => api('/streaks'),
};

// Badges
export const badgesApi = {
  get: () => api('/badges'),
};

// Quest
export const questApi = {
  get: () => api('/quest'),
};

// Leaderboard
export const leaderboardApi = {
  get: (tab = 'consistency', groupCode?: string) => {
    const qs = groupCode ? `?tab=${tab}&group_code=${groupCode}` : `?tab=${tab}`;
    return api(`/leaderboard${qs}`);
  },
};

// Groups
export const groupsApi = {
  create: (name: string) => api('/groups/create', { method: 'POST', body: JSON.stringify({ name }) }),
  join:   (code: string) => api('/groups/join',   { method: 'POST', body: JSON.stringify({ code }) }),
  list:   ()             => api('/groups'),
};

// Custom Exercises (user_exercises collection)
export interface UserExercise {
  id: string;
  name: string;
  category: string;
  defaultPrescription: string;
  notes: string;
  createdAt: string;
  isArchived?: boolean;
}

export const userExercisesApi = {
  list: (): Promise<{ exercises: UserExercise[] }> =>
    api('/user-exercises'),
  create: (data: { name: string; category?: string; defaultPrescription?: string; notes?: string }): Promise<UserExercise> =>
    api('/user-exercises', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { name?: string; category?: string; defaultPrescription?: string; notes?: string }) =>
    api(`/user-exercises/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    api(`/user-exercises/${id}`, { method: 'DELETE' }),
};

// Generic api export for one-off calls
export { api };
