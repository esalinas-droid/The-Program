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
 * Returns true if the token is valid, false if it's missing/expired/invalid.
 *
 * This prevents the user from briefly landing in the tabs (or any
 * authenticated screen) only to immediately get bounced to /auth when
 * the first API call fails with 401.
 *
 * Network errors are treated as "valid" (give the benefit of the doubt
 * when offline — the api() helper will handle 401s if/when they arrive).
 */
async function validateStoredToken(): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) return false;
  try {
    const res = await fetch(`${BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.status === 401) {
      await clearAuth();
      return false;
    }
    return res.ok;
  } catch {
    // Network error — assume valid; api() will handle later 401s if needed
    return true;
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

      const tokenValid = await validateStoredToken();
      if (!tokenValid) {
        setAuthed(false);
        setLoading(false);
        return;
      }
      setAuthed(true);

      // 2. Check onboarding — first from stored user, then from local storage, then from API
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

      // Fallback: check backend profile
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
