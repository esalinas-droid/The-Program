import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { seedApi } from '../src/utils/api';
import { getProfile } from '../src/utils/storage';
import { setupAllNotifications } from '../src/utils/notifications';
import { COLORS } from '../src/constants/theme';

export default function RootLayout() {
  useEffect(() => {
    seedApi.seed().catch(() => {});
    getProfile().then(profile => {
      if (profile) setupAllNotifications(profile).catch(() => {});
    });
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="onboarding-intake" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="tools" />
        <Stack.Screen name="settings" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="upload" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="roadmap" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="current-block" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </>
  );
}
