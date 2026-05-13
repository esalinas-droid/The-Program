/**
 * parsedSessionStore.ts — Module-level store for passing complex
 * parsed-session data between routes without URL serialization.
 *
 * Usage:
 *   setParsedSession(data)   → before router.push('/tracker-review')
 *   getParsedSession()       → inside TrackerReviewScreen on mount
 *   clearParsedSession()     → after save or cancel
 */

export interface ParsedSet {
  weight?: number | null;
  reps?: number | null;
  rpe?: number | null;
  duration?: number | null;
  unit?: string | null;
  distance?: number | null;
  load?: number | null;
  heightVal?: number | null;
  calories?: number | null;
  elapsedTime?: string | null;
  side?: string | null;
}

export interface ParsedExercise {
  name: string;
  prescriptionType: string;
  sets: ParsedSet[];
}

export interface ParsedSessionData {
  session_title: string | null;
  session_date: string | null;
  confidence: 'high' | 'medium' | 'low';
  exercises: ParsedExercise[];
  image_id?: string;
}

let _session: ParsedSessionData | null = null;

export function setParsedSession(data: ParsedSessionData): void {
  _session = data;
}

export function getParsedSession(): ParsedSessionData | null {
  return _session;
}

export function clearParsedSession(): void {
  _session = null;
}
