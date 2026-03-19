import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { seedApi } from '../src/utils/api';
import { getProfile } from '../src/utils/storage';
import { setupAllNotifications } from '../src/utils/notifications';

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
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#1A1A2E' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="tools" />
        <Stack.Screen name="settings" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      </Stack>
    </>
  );
}
