import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../../src/constants/theme';

// Ensure navigation state initializes for all tabs when accessed directly via URL
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.secondary,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.text.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{
        title: 'Home',
        tabBarIcon: ({ color }) => <MaterialCommunityIcons name="home-variant" size={24} color={color} />,
        tabBarTestID: 'tab-home',
      }} />
      <Tabs.Screen name="today" options={{
        title: 'Today',
        tabBarIcon: ({ color }) => <MaterialCommunityIcons name="clipboard-list" size={24} color={color} />,
        tabBarTestID: 'tab-today',
      }} />
      <Tabs.Screen name="log" options={{
        title: 'Schedule',
        tabBarIcon: ({ color }) => <MaterialCommunityIcons name="calendar-month-outline" size={24} color={color} />,
        tabBarTestID: 'tab-schedule',
      }} />
      <Tabs.Screen name="track" options={{
        title: 'Track',
        tabBarIcon: ({ color }) => <MaterialCommunityIcons name="chart-line" size={24} color={color} />,
        tabBarTestID: 'tab-track',
      }} />
      <Tabs.Screen name="tools" options={{
        title: 'Tools',
        tabBarIcon: ({ color }) => <MaterialCommunityIcons name="toolbox-outline" size={24} color={color} />,
        tabBarTestID: 'tab-tools',
      }} />
      
    </Tabs>
  );
}
