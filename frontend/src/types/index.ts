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
