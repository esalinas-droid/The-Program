import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';

export default function OnboardingStep2() {
  const router = useRouter();
  const [currentBW, setCurrentBW] = useState('274');
  const [goal12, setGoal12] = useState('255');
  const [goalLong, setGoalLong] = useState('230');

  async function handleNext() {
    await AsyncStorage.setItem('ob_step2', JSON.stringify({
      currentBodyweight: parseFloat(currentBW) || 274,
      bw12WeekGoal: parseFloat(goal12) || 255,
      bwLongRunGoal: parseFloat(goalLong) || 230,
    }));
    router.push('/onboarding/step3');
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <ProgressDots step={2} />
        <Text style={s.title}>Bodyweight Goals</Text>
        <Text style={s.subtitle}>Track your composition alongside training</Text>

        <BWField label="CURRENT BODYWEIGHT (lbs)" value={currentBW} onChange={setCurrentBW} testID="bw-current" />
        <BWField label="12-WEEK BODYWEIGHT GOAL (lbs)" value={goal12} onChange={setGoal12} testID="bw-12week" />
        <BWField label="LONG-TERM BODYWEIGHT GOAL (lbs)" value={goalLong} onChange={setGoalLong} testID="bw-longrun" />

        <TouchableOpacity testID="ob-next-btn" style={s.btn} onPress={handleNext}>
          <Text style={s.btnText}>Continue →</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.back}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function BWField({ label, value, onChange, testID }: any) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        testID={testID}
        style={s.input}
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={COLORS.text.muted}
      />
    </View>
  );
}

function ProgressDots({ step }: { step: number }) {
  return (
    <View style={pd.wrapper}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={[pd.dot, i < step && pd.dotActive, i === step - 1 && pd.dotCurrent]} />
      ))}
    </View>
  );
}

const pd = StyleSheet.create({
  wrapper: { flexDirection: 'row', gap: 8, marginBottom: 32, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.surface },
  dotActive: { backgroundColor: COLORS.accent },
  dotCurrent: { width: 24, backgroundColor: COLORS.accent },
});

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: SPACING.xl, paddingTop: 60, flexGrow: 1 },
  title: { fontSize: FONTS.sizes.xxxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: 8 },
  subtitle: { fontSize: FONTS.sizes.base, color: COLORS.text.secondary, marginBottom: 40 },
  field: { marginBottom: 24 },
  label: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, color: COLORS.text.muted, letterSpacing: 1.5, marginBottom: 10 },
  input: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, height: 52, paddingHorizontal: SPACING.lg, color: COLORS.text.primary, fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.bold, borderWidth: 1, borderColor: COLORS.border },
  btn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 24, marginBottom: 12 },
  btnText: { color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold },
  back: { textAlign: 'center', color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, paddingVertical: 8 },
});
