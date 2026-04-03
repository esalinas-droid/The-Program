export interface AthleteProfile {
  name: string;
  experience: string;
  currentBodyweight: number;
  bw12WeekGoal: number;
  bwLongRunGoal: number;
  basePRs: Record<string, number>;
  injuryFlags: string[];
  avoidMovements: string[];
  weaknesses: string[];
  currentWeek: number;
  programStartDate: string;
  units: 'lbs' | 'kg';
  onboardingComplete: boolean;
  notifications: NotificationSettings;
  loseitConnected: boolean;
  // Extended onboarding / coaching intelligence fields
  goal?: string;
  primaryWeaknesses?: string[];
  specialtyEquipment?: string[];
  sleepHours?: number;
  stressLevel?: string;
  occupationType?: string;
  hasCompetition?: boolean;
  competitionDate?: string;
  competitionType?: string;
  gymTypes?: string[];
  trainingDaysCount?: number;
}

export interface NotificationSettings {
  dailyReminder: boolean;
  dailyReminderTime: string;
  deloadAlert: boolean;
  prAlert: boolean;
  weeklyCheckin: boolean;
}

export interface ProgramSession {
  week: number;
  day: string;
  sessionType: string;
  mainLift: string;
  warmUpProtocol: string;
  activationRehab: string;
  rampUpSets: string;
  topSetScheme: string;
  supplementalWork: string[];
  accessories: string[];
  eventGPP: string;
  intentRPETarget: string;
  coachingNotes: string;
  key: string;
  block: number;
  blockName: string;
  phase: string;
  isDeload: boolean;
}

export interface WorkoutLogEntry {
  id?: string;
  date: string;
  week: number;
  day: string;
  sessionType: string;
  exercise: string;
  sets: number;
  weight: number;
  reps: number;
  rpe: number;
  pain: number;
  completed: string;
  bodyweight?: number;
  notes?: string;
  flag?: string;
  e1rm: number;
  createdAt?: string;
}

export interface PRRecord {
  exercise: string;
  lastDate: string | null;
  bestWeight: number;
  bestReps: number;
  bestE1rm: number;
  latestNote: string;
}

export interface CheckInData {
  id?: string;
  week: number;
  date: string;
  avgPain: number;
  avgRPE: number;
  completionRate: number;
  avgBodyweight: number;
  avgCalories?: number;
  avgProtein?: number;
  avgCarbs?: number;
  avgFat?: number;
  personalNotes: string;
  recommendations: string[];
}

export interface WeekStats {
  avgPain: number;
  avgRPE: number;
  completionRate: number;
  entries: number;
}

// ─── Stage 1: AI Program Types ──────────────────────────────────────────────

export interface IntakeData {
  goal: string;
  experience: string;
  lifts: { squat?: number; bench?: number; deadlift?: number; ohp?: number };
  liftUnit: string;
  frequency: number;
  injuries: string[];
  gym: string[];
  bodyweight?: number;
}

export interface TargetSet {
  setNumber: number;
  targetLoad?: string;
  targetReps: string;
  setType: string;
  targetRPE?: number;
}

export interface ProgramSessionExercise {
  sessionExerciseId: string;
  name: string;
  category: string;
  prescription: string;
  targetSets: TargetSet[];
  notes: string;
  cues: string[];
  lastPerformance: string;
  recentBest: string;
  adjustedFrom?: string;
  adjustmentReason?: string;
}

export interface ProgramSessionDetail {
  sessionId: string;
  sessionType: string;
  objective: string;
  coachNote: string;
  exercises: ProgramSessionExercise[];
  warmup: { label: string; duration: string; steps: string[] };
  status: string;
  weekNumber: number;
  dayNumber: number;
}

export interface TodaySessionResponse {
  phase: string;
  block: string;
  week: string;
  session: ProgramSessionDetail;
}

export interface ProgramBlock {
  blockId: string;
  blockName: string;
  blockNumber: number;
  blockGoal: string;
  weekCount: number;
  progressionLogic: string;
  riskAreas: string[];
  keyExercises: string[];
  weeks: any[];
  status: string;
}

export interface ProgramPhase {
  phaseId: string;
  phaseName: string;
  phaseNumber: number;
  goal: string;
  expectedAdaptation: string;
  startWeek: number;
  endWeek: number;
  blocks: ProgramBlock[];
  status: string;
}

export interface AnnualPlan {
  planId: string;
  planName: string;
  startDate: string;
  totalWeeks: number;
  phases: ProgramPhase[];
  milestones: any[];
  deloadWeeks: number[];
  testingWeeks: number[];
  status: string;
}

export interface LogSetData {
  sessionExerciseId: string;
  setNumber: number;
  actualLoad?: number;
  actualReps?: number;
  actualRPE?: number;
  painScore?: number;
  painLocation?: string;
  painNote?: string;
}

export interface PostWorkoutReviewData {
  sessionId: string;
  completedSets: number;
  totalSets: number;
  duration: number;
  wins: string[];
  flags: string[];
  coachNote: string;
  whatsNext: string;
}

export interface ExerciseAlternative {
  name: string;
  reason: string;
  explanation: string;
}

export interface ProgramChangeEntry {
  changeId: string;
  timestamp: string;
  triggerType: string;
  scope: string;
  oldValue: string;
  newValue: string;
  explanation: string;
}
