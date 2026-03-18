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

export { KEYS };
