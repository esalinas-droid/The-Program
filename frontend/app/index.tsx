import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { isOnboardingComplete, saveProfile } from '../src/utils/storage';
import { profileApi } from '../src/utils/api';
import { COLORS } from '../src/constants/theme';

export default function Index() {
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    async function check() {
      // First check local AsyncStorage
      const localResult = await isOnboardingComplete();
      if (localResult) {
        setOnboarded(true);
        setLoading(false);
        return;
      }
      // Fallback: check backend profile (handles web fresh sessions & cleared storage)
      try {
        const profile = await profileApi.get();
        if (profile?.onboardingComplete === true) {
          // Sync to local storage so future checks are faster
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

  if (!onboarded) return <Redirect href="/onboarding-intake" />;
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
});
