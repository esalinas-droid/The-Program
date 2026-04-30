/**
 * coachSeedStore — lightweight module-level ephemeral store.
 *
 * Usage:
 *   setCoachSeed({ seedPrompt: '...', triggerName: 'missed_two_sessions' })
 *   // then navigate to coach screen
 *
 *   const seed = consumeCoachSeed();  // read + auto-clear atomically
 *
 * The store is intentionally NOT persisted (memory only), so a stale seed
 * never survives an app restart or a manual coach-tab tap after the seed
 * is consumed.
 */

export interface CoachSeed {
  seedPrompt: string;
  triggerName?: string;
}

let _pending: CoachSeed | null = null;

/** Set a seed that the coach screen will auto-send on next mount. */
export function setCoachSeed(seed: CoachSeed): void {
  _pending = seed;
}

/**
 * Read and atomically clear the pending seed.
 * Call this once on coach screen mount — returns null if nothing pending.
 */
export function consumeCoachSeed(): CoachSeed | null {
  const s = _pending;
  _pending = null;
  return s;
}

/** Peek without clearing (for debugging). */
export function peekCoachSeed(): CoachSeed | null {
  return _pending;
}
