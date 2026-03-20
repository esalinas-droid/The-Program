import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';
import { INJURY_FLAGS, WEAKNESS_OPTIONS } from '../../src/data/exerciseList';

export default function OnboardingStep4() {
  const router = useRouter();
  const [injuries, setInjuries] = useState<string[]>([
    'Right hamstring / nerve compression', 'Low back', 'Left knee'
  ]);
  const [weaknesses, setWeaknesses] = useState<string[]>([
    'Hip drive', 'Core stability', 'Conditioning / between-set recovery'
  ]);

  function toggle(arr: string[], setArr: (v: string[]) => void, item: string, max: number) {
    if (arr.includes(item)) setArr(arr.filter(x => x !== item));
    else if (arr.length < max) setArr([...arr, item]);
  }

  async function handleNext() {
    await AsyncStorage.setItem('ob_step4', JSON.stringify({
      injuryFlags: injuries,
      avoidMovements: ['Stone to shoulder', 'Very low box squats', 'Aggressive from-floor max deadlift'],
      weaknesses,
    }));
    router.push('/onboarding/step5');
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <ProgressDots step={4} />
        <Text style={s.title}>Injury & Weakness Profile</Text>
        <Text style={s.subtitle}>This drives your daily rehab drills and exercise recommendations</Text>

        <Text style={s.sectionLabel}>INJURY FLAGS (up to 3)</Text>
        <View style={s.grid}>
          {INJURY_FLAGS.map(flag => (
            <TouchableOpacity
              testID={`injury-${flag}`}
              key={flag}
              style={[s.chip, injuries.includes(flag) && s.chipActive]}
              onPress={() => toggle(injuries, setInjuries, flag, 3)}
            >
              <Text style={[s.chipText, injuries.includes(flag) && s.chipTextActive]}>{flag}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[s.sectionLabel, { marginTop: 28 }]}>MAIN WEAKNESSES (up to 3)</Text>
        <View style={s.grid}>
          {WEAKNESS_OPTIONS.map(w => (
            <TouchableOpacity
              testID={`weak-${w}`}
              key={w}
              style={[s.chip, weaknesses.includes(w) && s.chipWeak]}
              onPress={() => toggle(weaknesses, setWeaknesses, w, 3)}
            >
              <Text style={[s.chipText, weaknesses.includes(w) && s.chipTextActive]}>{w}</Text>
            </TouchableOpacity>
          ))}
        </View>

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
  container: { padding: SPACING.xl, paddingTop: 60, flexGrow: 1, paddingBottom: 40 },
  title: { fontSize: FONTS.sizes.xxxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: 8 },
  subtitle: { fontSize: FONTS.sizes.base, color: COLORS.text.secondary, marginBottom: 32 },
  sectionLabel: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, color: COLORS.text.muted, letterSpacing: 1.5, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.sessions.me_lower.bg, borderColor: COLORS.accent },
  chipWeak: { backgroundColor: COLORS.surfaceHighlight, borderColor: COLORS.accentBlue },
  chipText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.medium },
  chipTextActive: { color: COLORS.text.primary, fontWeight: FONTS.weights.semibold },
  btn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 32, marginBottom: 12 },
  btnText: { color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold },
  back: { textAlign: 'center', color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, paddingVertical: 8 },
});
