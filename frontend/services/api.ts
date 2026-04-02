import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================
// BASE URL
// ============================================================
export const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL
  ? `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`
  : '/api';

const USER_ID_KEY = '@theprogram_userId';

// ============================================================
// TYPESCRIPT TYPES
// ============================================================

export interface SetPrescription {
  setNumber: number;
  targetReps?: number;
  targetLoad?: number;
  targetRPE?: number;
  isWarmup?: boolean;
  notes?: string;
}

export interface SessionExercise {
  sessionExerciseId: string;
  sessionId: string;
  exerciseId: string;
  name: string;
  category: string;
  prescription: string;
  targetSets: SetPrescription[];
  notes?: string;
  order: number;
  loggedSets: LoggedSetEntry[];
  completed: boolean;
}

export interface LoggedSetEntry {
  sessionExerciseId: string;
  setNumber: number;
  actualLoad?: number;
  actualReps?: number;
  actualRPE?: number;
  painScore?: number;
  timestamp: string;
}

export interface TrainingSession {
  sessionId: string;
  blockId: string;
  weekNumber: number;
  dayNumber: number;
  dayOfWeek?: string;
  sessionType: string;
  objective: string;
  coachNote: string;
  exercises: SessionExercise[];
  status: string;
  completedAt?: string;
  isDeload?: boolean;
  currentWeek?: number;
  planGoal?: string;
  restDay?: boolean;
  message?: string;
  trainingDays?: string[];
}

export interface Block {
  blockId: string;
  phaseId: string;
  blockName: string;
  blockNumber: number;
  blockGoal: string;
  weekCount: number;
  progressionLogic: string;
  keyExercises: string[];
  status: string;
  sessions: TrainingSession[];
  currentWeek?: number;
}

export interface Phase {
  phaseId: string;
  planId: string;
  phaseName: string;
  phaseNumber: number;
  goal: string;
  expectedAdaptation: string;
  startWeek: number;
  endWeek: number;
  status: string;
  blocks: Block[];
}

export interface AnnualPlan {
  planId: string;
  userId: string;
  planName: string;
  startDate: string;
  totalWeeks: number;
  phases: Phase[];
  milestones: Array<{ week: number; label: string }>;
  status: string;
  generatedAt: string;
}

export interface UserProfile {
  userId: string;
  name: string;
  email?: string;
  goal: string;
  experience: string;
  currentLifts: Record<string, number>;
  liftUnit: string;
  bodyweight?: number;
  trainingDays: string[];
  injuries: string[];
  gymTypes: string[];
  onboardingComplete: boolean;
  currentWeek?: number;
  createdAt: string;
}

export interface IntakeData {
  name: string;
  email?: string;
  goal: string;
  experience: string;
  currentLifts: Record<string, number>;
  liftUnit?: string;
  bodyweight?: number;
  trainingDays: string[];
  injuries?: string[];
  gymTypes?: string[];
}

export interface IntakeResponse {
  userId: string;
  profile: UserProfile;
  plan: AnnualPlan;
  message: string;
}

export interface LogSetData {
  sessionId: string;
  sessionExerciseId: string;
  setNumber: number;
  actualLoad?: number;
  actualReps?: number;
  actualRPE?: number;
  painScore?: number;
  notes?: string;
}

export interface FinishSessionData {
  sessionId: string;
  duration?: number;
  notes?: string;
}

export interface SessionSummary {
  success: boolean;
  logId: string;
  summary: {
    setsCompleted: number;
    totalVolume: number;
    newPRs: number;
    prExercises: string[];
    painFlags: number;
    duration?: number;
  };
  wins: string[];
  flags: string[];
  message: string;
}

export interface PREntry {
  exerciseId: string;
  estimated1RM: number;
  actualWeight: number;
  actualReps: number;
  date: string;
  notes?: string;
}

// ============================================================
// USER ID MANAGEMENT
// ============================================================

export async function getUserId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(USER_ID_KEY);
  } catch {
    return null;
  }
}

export async function setUserId(id: string): Promise<void> {
  await AsyncStorage.setItem(USER_ID_KEY, id);
}

export async function clearUserId(): Promise<void> {
  await AsyncStorage.removeItem(USER_ID_KEY);
}

// ============================================================
// CORE FETCH WRAPPER
// ============================================================

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  params: Record<string, string> = {}
): Promise<T> {
  let url = `${BASE_URL}${path}`;
  const qs = new URLSearchParams(params).toString();
  if (qs) url += `?${qs}`;

  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      message = body.detail || body.message || message;
    } catch {}
    throw new Error(`API Error: ${message}`);
  }

  return response.json();
}

// ============================================================
// PROFILE
// ============================================================

export async function submitIntake(data: IntakeData): Promise<IntakeResponse> {
  const result = await apiFetch<IntakeResponse>('/profile/intake', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (result.userId) {
    await setUserId(result.userId);
  }
  return result;
}

export async function getProfile(): Promise<UserProfile> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user session. Please complete onboarding.');
  return apiFetch<UserProfile>('/profile', {}, { userId });
}

export async function updateProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user session.');
  return apiFetch<UserProfile>('/profile', {
    method: 'PUT',
    body: JSON.stringify(updates),
  }, { userId });
}

// ============================================================
// PLAN
// ============================================================

export async function getYearPlan(): Promise<AnnualPlan> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user session.');
  return apiFetch<AnnualPlan>('/plan/year', {}, { userId });
}

export async function getCurrentBlock(): Promise<Block> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user session.');
  return apiFetch<Block>('/plan/block/current', {}, { userId });
}

export async function getTodaySession(
  weekOverride?: number,
  dayOverride?: string
): Promise<TrainingSession> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user session.');
  const params: Record<string, string> = { userId };
  if (weekOverride) params.weekOverride = String(weekOverride);
  if (dayOverride)  params.dayOverride  = dayOverride;
  return apiFetch<TrainingSession>('/plan/session/today', {}, params);
}

export async function getWeekSessions(weekNumber: number) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user session.');
  return apiFetch<{ weekNumber: number; sessions: TrainingSession[] }>(
    `/plan/week/${weekNumber}`, {}, { userId }
  );
}

export async function advanceWeek(): Promise<{ currentWeek: number }> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user session.');
  return apiFetch('/plan/advance-week', { method: 'POST' }, { userId });
}

// ============================================================
// SESSION LOGGING
// ============================================================

export async function logSet(data: LogSetData): Promise<{ success: boolean; isPR: boolean; message: string }> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user session.');
  return apiFetch('/session/log-set', {
    method: 'POST',
    body: JSON.stringify(data),
  }, { userId });
}

export async function finishSession(data: FinishSessionData): Promise<SessionSummary> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user session.');
  return apiFetch<SessionSummary>('/session/finish', {
    method: 'POST',
    body: JSON.stringify(data),
  }, { userId });
}

export async function adjustExercise(
  sessionId: string,
  sessionExerciseId: string,
  reason: string
): Promise<{ alternatives: Array<{ exerciseId: string; name: string }> }> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user session.');
  return apiFetch('/session/adjust-exercise', {
    method: 'POST',
    body: JSON.stringify({ sessionId, sessionExerciseId, reason }),
  }, { userId });
}

// ============================================================
// COACH
// ============================================================

export async function getChangeLog(
  limit = 20
): Promise<{ changes: any[]; total: number }> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user session.');
  return apiFetch('/coach/change-log', {}, { userId, limit: String(limit) });
}

export async function getWorkoutHistory(limit = 10) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user session.');
  return apiFetch('/coach/workout-history', {}, { userId, limit: String(limit) });
}

// ============================================================
// PROGRESS
// ============================================================

export async function getPRs(): Promise<{ prs: PREntry[]; total: number }> {
  const userId = await getUserId();
  if (!userId) throw new Error('No user session.');
  return apiFetch<{ prs: PREntry[]; total: number }>('/progress/prs', {}, { userId });
}

export async function recordPR(exerciseId: string, value: number, notes?: string) {
  const userId = await getUserId();
  if (!userId) throw new Error('No user session.');
  return apiFetch('/progress/record-pr', {
    method: 'POST',
    body: JSON.stringify({ exerciseId, value, notes }),
  }, { userId });
}

export async function getPainLog() {
  const userId = await getUserId();
  if (!userId) throw new Error('No user session.');
  return apiFetch('/progress/pain-log', {}, { userId });
}
