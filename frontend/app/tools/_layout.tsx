import { Stack } from 'expo-router';
import { COLORS } from '../../src/constants/theme';

export default function ToolsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.background } }}>
      <Stack.Screen name="calculator" />
      <Stack.Screen name="converter" />
      <Stack.Screen name="barguide" />
      <Stack.Screen name="checkin" />
      <Stack.Screen name="library" />
      <Stack.Screen name="coach" />
    </Stack>
  );
}
