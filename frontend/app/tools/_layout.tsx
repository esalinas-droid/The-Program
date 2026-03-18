import { Stack } from 'expo-router';

export default function ToolsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#1A1A2E' } }}>
      <Stack.Screen name="calculator" />
      <Stack.Screen name="converter" />
      <Stack.Screen name="barguide" />
      <Stack.Screen name="checkin" />
      <Stack.Screen name="library" />
    </Stack>
  );
}
