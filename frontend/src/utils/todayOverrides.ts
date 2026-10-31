import AsyncStorage from '@react-native-async-storage/async-storage';
import { programApi } from './api';

// Keys owned by the Today screen (frontend/app/(tabs)/today.tsx). This module
// is STRICTLY READ-ONLY: it never writes, caches back or clears these keys.
// Today's own persist/restore effects are the single writer — a second writer
// here could race Today's restore guard and wipe an override it was about to
// restore, or resurrect yesterday's data after Today's day-roll cleanup.
const ADDED_EXERCISES_KEY   = 'today_added_exercises';
const SKIPPED_EXERCISES_KEY = 'today_skipped_exercises';

export interface TodayOverrides {
  /** Exercise rows (id 'added-ex-*') added on the Today screen — "+ Add Exercise" or a scanned/uploaded workout. */
  added: any[];
  /** Ids of prescribed exercises removed for today (coach remove, or "replace with my own workout"). */
  skippedIds: Set<string>;
}

/**
 * Read today's session overrides — the exercises the athlete added and the
 * prescribed exercises they removed for today — without touching them.
 *
 * Envelope semantics mirror the Today screen: both keys store a date-stamped
 * object ({ date, exercises } / { date, skipped }) and anything from another
 * day is ignored, so yesterday's upload can never leak into today. Added
 * exercises fall back to the server mirror when there is nothing local
 * (reinstall / second device); the skip list is device-local only, so it has
 * no server fallback.
 */
export async function getTodayOverrides(todayStr: string): Promise<TodayOverrides> {
  let added: any[] = [];
  const skippedIds = new Set<string>();

  try {
    const raw = await AsyncStorage.getItem(ADDED_EXERCISES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.date === todayStr && Array.isArray(parsed?.exercises) && parsed.exercises.length > 0) {
        added = parsed.exercises;
      }
    }
  } catch { /* fall through to the server */ }

  if (added.length === 0) {
    try {
      const remote = await programApi.getAddedExercises(todayStr);
      if (Array.isArray(remote?.exercises)) added = remote.exercises;
      // Deliberately NOT cached back to AsyncStorage — Today owns that key.
    } catch { /* offline — the empty local answer stands */ }
  }

  try {
    const rawSkipped = await AsyncStorage.getItem(SKIPPED_EXERCISES_KEY);
    if (rawSkipped) {
      const parsed = JSON.parse(rawSkipped);
      if (parsed?.date === todayStr && Array.isArray(parsed?.skipped)) {
        for (const s of parsed.skipped) {
          if (s?.sessionExerciseId) skippedIds.add(String(s.sessionExerciseId));
        }
      }
    }
  } catch { /* unreadable skip list — treat as empty */ }

  return { added, skippedIds };
}

/**
 * Apply today's overrides to a prescribed exercise list: drop the skipped
 * exercises, then append the added ones. Ids are matched the way Today builds
 * its rows — sessionExerciseId when the API provides one, 'api-ex-<index>'
 * otherwise, with the list sorted by `order` first so the fallback indices
 * line up (today.tsx buildTodayExercisesFromApi). The input array is never
 * mutated.
 */
export function applyOverridesToSession(exercises: any[], overrides: TodayOverrides): any[] {
  const prescribed = Array.isArray(exercises)
    ? [...exercises].sort((a: any, b: any) => (a?.order ?? 0) - (b?.order ?? 0))
    : [];
  const kept = overrides.skippedIds.size > 0
    ? prescribed.filter((ex: any, idx: number) =>
        !overrides.skippedIds.has(String(ex?.sessionExerciseId || `api-ex-${idx}`)))
    : prescribed;
  return overrides.added.length > 0 ? [...kept, ...overrides.added] : kept;
}
