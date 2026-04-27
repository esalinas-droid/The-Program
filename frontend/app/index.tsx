import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { isOnboardingComplete, saveProfile } from '../src/utils/storage';
import { profileApi } from '../src/utils/api';
import { COLORS } from '../src/constants/theme';
import { isAuthenticated, getStoredUser, getAuthToken, clearAuth } from '../src/utils/auth';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

/**
 * Validate the stored JWT against the backend before trusting it.
 * Returns:
 *   - { valid: false } if missing/invalid/expired
 *   - { valid: true, onboardingComplete } if valid (with the backend's view)
 *
 * `onboardingComplete` from the backend is the AUTHORITATIVE source of truth.
 * Returning `undefined` means we couldn't reach the backend (offline) and the
 * caller should fall back to local cache.
 *
 * Why this matters: a user can have local AsyncStorage saying onboardingComplete=true
 * (from a successful intake POST) while the backend has it as false (intake hit
 * the user_001 fallback bug, never updated their real user record). If we trust
 * local in that case, the user gets routed to tabs and sees an empty schedule
 * forever. Trusting backend self-heals: they'll be routed to onboarding-intake
 * and get a fresh, properly-attributed plan.
 */
async function validateStoredToken(): Promise<{
  valid: boolean;
  onboardingComplete?: boolean;
}> {
  const token = await getAuthToken();
  if (!token) return { valid: false };
  try {
    const res = await fetch(`${BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.status === 401) {
      await clearAuth();
      return { valid: false };
    }
    if (!res.ok) {
      // Server error — treat as valid; api() will surface real failures later
      return { valid: true };
    }
    const data = await res.json();
    return { valid: true, onboardingComplete: !!data?.onboardingComplete };
  } catch {
    // Network error — assume valid; api() will handle later 401s if needed.
    // onboardingComplete left undefined → caller falls back to local cache.
    return { valid: true };
  }
}

export default function Index() {
  const [loading,    setLoading]    = useState(true);
  const [authed,     setAuthed]     = useState(false);
  const [onboarded,  setOnboarded]  = useState(false);

  useEffect(() => {
    async function check() {
      // 1. Check for a stored JWT and validate it against the backend.
      //    This catches expired/invalid tokens at launch instead of letting
      //    the user briefly land in the tabs before getting kicked out.
      const hasToken = await isAuthenticated();
      if (!hasToken) {
        setAuthed(false);
        setLoading(false);
        return;
      }

      const { valid, onboardingComplete: backendOnboarded } = await validateStoredToken();
      if (!valid) {
        setAuthed(false);
        setLoading(false);
        return;
      }
      setAuthed(true);

      // 2. Onboarding source-of-truth priority:
      //    a) BACKEND (authoritative) if /api/auth/me succeeded — `backendOnboarded`
      //       will be a boolean. We trust it absolutely. If false, we route to
      //       onboarding regardless of what local cache says (this is what
      //       self-heals the user_001 fallback bug).
      //    b) Local cache only if the network call to /api/auth/me failed
      //       (backendOnboarded === undefined) — better to let an offline user
      //       see their app than to block them at launch.
      if (backendOnboarded !== undefined) {
        // Sync local cache to match backend so future offline launches also agree
        if (backendOnboarded) {
          await saveProfile({ onboardingComplete: true } as any);
        }
        setOnboarded(backendOnboarded);
        setLoading(false);
        return;
      }

      // ── Offline fallback path ──────────────────────────────────────────────
      const storedUser = await getStoredUser();
      if (storedUser?.onboardingComplete) {
        setOnboarded(true);
        setLoading(false);
        return;
      }

      const localResult = await isOnboardingComplete();
      if (localResult) {
        setOnboarded(true);
        setLoading(false);
        return;
      }

      // Last resort: try profile endpoint (may also be offline)
      try {
        const profile = await profileApi.get();
        if (profile?.onboardingComplete === true) {
          await saveProfile(profile);
          setOnboarded(true);
          setLoading(false);
          return;
        }
      } catch (_) { /* ignore */ }

      setOnboarded(false);
      setLoading(false);
    }
    check();
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  // Route: no token → auth screen, no onboarding → intake, else → tabs
  if (!authed) return <Redirect href="/auth" />;
  if (!onboarded) return <Redirect href="/onboarding-intake" />;
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
});
