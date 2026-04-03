import {
  AthleteProfile,
  IntakeData, AnnualPlan, TodaySessionResponse, LogSetData,
  PostWorkoutReviewData, ExerciseAlternative, ProgramChangeEntry
} from '../types';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
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
};

// Log
export const logApi = {
  list: (params?: { week?: number; exercise?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([,v]) => v != null).map(([k,v]) => [k, String(v)])).toString() : '';
    return api(`/log${qs}`);
  },
  create: (entry: any) => api('/log', { method: 'POST', body: JSON.stringify(entry) }),
  update: (id: string, entry: any) => api(`/log/${id}`, { method: 'PUT', body: JSON.stringify(entry) }),
  delete: (id: string) => api(`/log/${id}`, { method: 'DELETE' }),
  weekStats: (week: number) => api(`/log/stats/week/${week}`),
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
  applyRecommendation: (conversationId: string, summary: string, details: string) =>
    api('/coach/apply-recommendation', {
      method: 'POST',
      body: JSON.stringify({ conversation_id: conversationId, summary, details }),
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
