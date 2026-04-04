import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { isOnboardingComplete, saveProfile } from '../src/utils/storage';
import { profileApi } from '../src/utils/api';
import { COLORS } from '../src/constants/theme';
import { isAuthenticated, getStoredUser } from '../src/utils/auth';

export default function Index() {
  const [loading,    setLoading]    = useState(true);
  const [authed,     setAuthed]     = useState(false);
  const [onboarded,  setOnboarded]  = useState(false);

  useEffect(() => {
    async function check() {
      // 1. Check for a valid JWT token
      const hasToken = await isAuthenticated();
      if (!hasToken) {
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
