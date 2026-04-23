import {
  AthleteProfile,
  IntakeData, AnnualPlan, TodaySessionResponse, LogSetData,
  PostWorkoutReviewData, ExerciseAlternative, ProgramChangeEntry
} from '../types';
import { getAuthToken } from './auth';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

async function api(path: string, options?: RequestInit) {
  const token = await getAuthToken();
  const authHeader = token ? { 'Authorization': `Bearer ${token}` } : {};
  const res = await fetch(`${BASE}/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeader,
    },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} error ${res.status}: ${text}`);
  }
  return res.json();
}

// Profile
export const profileApi = {
  get: () => api('/profile'),
  create: (data: Partial<AthleteProfile>) => api('/profile', { method: 'POST', body: JSON.stringify(data) }),
  update: (data: Partial<AthleteProfile>) => api('/profile', { method: 'PUT', body: JSON.stringify(data) }),
  reset: () => api('/profile/reset', { method: 'POST' }),
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
  chat: (message: string, history: { role: string; content: string }[], conversationId?: string | null) =>
    api('/coach/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        conversation_history: history,
        conversation_id: conversationId ?? null,
      }),
    }),
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
  submitIntake: (data: IntakeData): Promise<{ success: boolean; profile: any; plan: AnnualPlan }> =>
    api('/profile/intake', { method: 'POST', body: JSON.stringify(data) }),

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

// Generic api export for one-off calls
export { api };
