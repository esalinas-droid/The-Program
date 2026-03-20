import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';

const BASELINE_FIELDS = [
  { key: 'backSquat',        label: 'Back Squat e1RM (lbs)',         default: '500' },
  { key: 'benchPress',       label: 'Bench Press e1RM (lbs)',        default: '400' },
  { key: 'axleDeadlift',     label: 'Axle Deadlift (lbs)',           default: '600' },
  { key: 'axleOverhead',     label: 'Axle Overhead (lbs × reps)',    default: '225' },
  { key: 'logPress',         label: 'Log Press 1RM (lbs)',           default: '285' },
  { key: 'yokeLoad',         label: 'Yoke Load (lbs)',               default: '740' },
  { key: 'farmersPerHand',   label: 'Farmers Per Hand (lbs)',        default: '220' },
  { key: 'ssbBoxSquat',      label: 'SSB Box Squat (lbs)',           default: '405' },
];

export default function OnboardingStep3() {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(BASELINE_FIELDS.map(f => [f.key, f.default]))
  );

  async function handleNext() {
    const prs = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, parseFloat(v) || 0])
    );
    await AsyncStorage.setItem('ob_step3', JSON.stringify({ basePRs: prs }));
    router.push('/onboarding/step4');
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <ProgressDots step={3} />
        <Text style={s.title}>Baseline PRs</Text>
        <Text style={s.subtitle}>Your starting point — these won't change unless you update them</Text>

        {BASELINE_FIELDS.map(field => (
          <View key={field.key} style={s.field}>
            <Text style={s.label}>{field.label}</Text>
            <TextInput
              testID={`pr-${field.key}`}
              style={s.input}
              value={values[field.key]}
              onChangeText={v => setValues(prev => ({ ...prev, [field.key]: v }))}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={COLORS.text.muted}
            />
          </View>
        ))}

        <TouchableOpacity testID="ob-step3-next" style={s.btn} onPress={handleNext}>
          <Text style={s.btnText}>Continue →</Text>
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
    <View style={pd.row}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={[pd.dot, i < step && pd.active, i === step - 1 && pd.current]} />
      ))}
    </View>
  );
}
const pd = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginBottom: 32, justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.surface },
  active: { backgroundColor: COLORS.accent },
  current: { width: 24 },
});
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: SPACING.xl, paddingTop: 60, flexGrow: 1, paddingBottom: 40 },
  title: { fontSize: FONTS.sizes.xxxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: 8 },
  subtitle: { fontSize: FONTS.sizes.base, color: COLORS.text.secondary, marginBottom: 32 },
  field: { marginBottom: 18 },
  label: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, color: COLORS.text.muted, letterSpacing: 1.2, marginBottom: 8 },
  input: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, height: 48, paddingHorizontal: SPACING.lg, color: COLORS.text.primary, fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold, borderWidth: 1, borderColor: COLORS.border },
  btn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 24, marginBottom: 12 },
  btnText: { color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold },
  back: { textAlign: 'center', color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, paddingVertical: 8 },
});
