import AsyncStorage from '@react-native-async-storage/async-storage';
import { AthleteProfile } from '../types';

const KEYS = {
  PROFILE: 'profile',
  SETTINGS: 'settings',
  ONBOARDING_COMPLETE: 'onboardingComplete',
  LOG_CACHE: 'logCache',
  UNIT: 'unit',
};

export async function getProfile(): Promise<AthleteProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.PROFILE);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function saveProfile(profile: Partial<AthleteProfile>): Promise<void> {
  try {
    const existing = await getProfile();
    const merged = { ...existing, ...profile };
    await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(merged));
  } catch (e) { console.error('saveProfile error', e); }
}

export async function isOnboardingComplete(): Promise<boolean> {
  try {
    const profile = await getProfile();
    return profile?.onboardingComplete === true;
  } catch { return false; }
}

export async function getUnit(): Promise<'lbs' | 'kg'> {
  try {
    const profile = await getProfile();
    return (profile?.units as 'lbs' | 'kg') || 'lbs';
  } catch { return 'lbs'; }
}

export async function setUnit(unit: 'lbs' | 'kg'): Promise<void> {
  await saveProfile({ units: unit });
}

export async function clearAll(): Promise<void> {
  await AsyncStorage.clear();
}

/**
 * Wipe athlete-scoped local state (profile + the Today screen's per-day keys)
 * on sign-out, account deletion, or beta reset, so the next account on this
 * device doesn't inherit the previous user's profile, units, mode, or
 * today-screen state. Deliberately does NOT touch notification-ID or
 * push-token keys.
 */
export async function clearAthleteLocalState(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      KEYS.PROFILE,
      'today_set_values',
      'today_logged_sets',
      'today_added_sets',
      'today_finished_date',
      'today_field_overrides',
      'today_added_exercises',
      'today_skipped_exercises',
      'today_swaps',
      'today_pending_invalidation',
    ]);
  } catch (e) { console.error('clearAthleteLocalState error', e); }
}

export { KEYS };
