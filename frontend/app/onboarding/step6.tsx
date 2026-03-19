import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';
import { profileApi } from '../../src/utils/api';
import { saveProfile } from '../../src/utils/storage';
import { AthleteProfile } from '../../src/types';

export default function OnboardingStep6() {
  const router = useRouter();

  async function handleFinish(connectLoseIt: boolean) {
    try {
      // Gather all step data
      const s1 = JSON.parse(await AsyncStorage.getItem('ob_step1') || '{}');
      const s2 = JSON.parse(await AsyncStorage.getItem('ob_step2') || '{}');
      const s3 = JSON.parse(await AsyncStorage.getItem('ob_step3') || '{}');
      const s4 = JSON.parse(await AsyncStorage.getItem('ob_step4') || '{}');
      const s5 = JSON.parse(await AsyncStorage.getItem('ob_step5') || '{}');

      const profile: Partial<AthleteProfile> = {
        name: s1.name || 'Eric',
        experience: s1.experience || 'Advanced',
        currentBodyweight: s2.currentBodyweight || 274,
        bw12WeekGoal: s2.bw12WeekGoal || 255,
        bwLongRunGoal: s2.bwLongRunGoal || 230,
        basePRs: s3.basePRs || {},
        injuryFlags: s4.injuryFlags || [],
        avoidMovements: s4.avoidMovements || [],
        weaknesses: s4.weaknesses || [],
        currentWeek: s5.currentWeek || 1,
        programStartDate: s5.programStartDate || '2026-03-16',
        units: 'lbs',
        onboardingComplete: true,
        loseitConnected: connectLoseIt,
        notifications: {
          dailyReminder: true, dailyReminderTime: '07:00',
          deloadAlert: true, prAlert: true, weeklyCheckin: true
        },
      };

      // Save locally
      await saveProfile(profile);

      // Sync to backend
      try { await profileApi.create(profile); } catch { /* offline ok */ }

      // Clean up step data
      await AsyncStorage.multiRemove(['ob_step1','ob_step2','ob_step3','ob_step4','ob_step5']);

      if (Platform.OS === 'web') {
        window.location.href = '/';
      } else {
        router.replace('/(tabs)');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not save profile. Please try again.');
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.container}>
        <ProgressDots step={6} />
        <Text style={s.title}>Nutrition Connect</Text>
        <Text style={s.subtitle}>Optional: Connect Lose It to pull your daily calories, macros, and bodyweight into The Program.</Text>

        <View style={s.card}>
          <Text style={s.cardTitle}>What Lose It gives you:</Text>
          <Text style={s.bullet}>• Daily calories consumed vs. your target</Text>
          <Text style={s.bullet}>• Macro breakdown: Protein / Carbs / Fat</Text>
          <Text style={s.bullet}>• Bodyweight trend alongside training data</Text>
          <Text style={s.bullet}>• Weekly nutrition averages in your Check-In</Text>
          <View style={s.divider} />
          <Text style={s.note}>The Program only reads data — no food logging happens here. Lose It handles all of that.</Text>
        </View>

        <TouchableOpacity testID="ob-connect-loseit" style={s.primaryBtn} onPress={() => handleFinish(false)}>
          <Text style={s.primaryBtnText}>Skip for Now — Start Training</Text>
        </TouchableOpacity>

        <TouchableOpacity testID="ob-skip-loseit" style={s.outlineBtn} onPress={() => handleFinish(false)}>
          <Text style={s.outlineBtnText}>Connect Lose It Later in Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProgressDots({ step }: { step: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 32, justifyContent: 'center' }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={{ width: i === step - 1 ? 24 : 8, height: 8, borderRadius: 4, backgroundColor: i < step ? COLORS.accent : COLORS.surface }} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: SPACING.xl, paddingTop: 60, flexGrow: 1 },
  title: { fontSize: FONTS.sizes.xxxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: 8 },
  subtitle: { fontSize: FONTS.sizes.base, color: COLORS.text.secondary, marginBottom: 28, lineHeight: 22 },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: 28, borderLeftWidth: 3, borderLeftColor: COLORS.accentBlue },
  cardTitle: { color: COLORS.text.primary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.sm, marginBottom: 12 },
  bullet: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, marginBottom: 6, lineHeight: 20 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 12 },
  note: { color: COLORS.text.muted, fontSize: FONTS.sizes.xs, fontStyle: 'italic', lineHeight: 16 },
  primaryBtn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, height: 52, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold },
  outlineBtn: { backgroundColor: 'transparent', borderRadius: RADIUS.md, height: 52, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  outlineBtnText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm },
  back: { textAlign: 'center', color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, paddingVertical: 8 },
});
