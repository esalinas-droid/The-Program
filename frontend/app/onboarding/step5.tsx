import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';

export default function OnboardingStep5() {
  const router = useRouter();
  const [week, setWeek] = useState('1');
  const [startDate, setStartDate] = useState('2026-03-16');

  async function handleNext() {
    await AsyncStorage.setItem('ob_step5', JSON.stringify({
      currentWeek: parseInt(week) || 1,
      programStartDate: startDate,
    }));
    router.push('/onboarding/step6');
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <ProgressDots step={5} />
        <Text style={s.title}>Program Start</Text>
        <Text style={s.subtitle}>52 weeks. 312 sessions. This is The Program.</Text>

        <View style={s.field}>
          <Text style={s.label}>CURRENT WEEK (1–52)</Text>
          <TextInput
            testID="ob-week-input"
            style={s.input}
            value={week}
            onChangeText={v => setWeek(v.replace(/[^0-9]/g, ''))}
            keyboardType="numeric"
            placeholder="1"
            placeholderTextColor={COLORS.text.muted}
          />
          <Text style={s.hint}>Start at Week 1 if you're just beginning the program</Text>
        </View>

        <View style={s.field}>
          <Text style={s.label}>PROGRAM START DATE</Text>
          <TextInput
            testID="ob-start-date-input"
            style={s.input}
            value={startDate}
            onChangeText={setStartDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={COLORS.text.muted}
          />
          <Text style={s.hint}>Format: YYYY-MM-DD (e.g. 2026-03-16)</Text>
        </View>

        <View style={s.infoCard}>
          <Text style={s.infoTitle}>52-Week Program Overview</Text>
          <View style={s.infoRow}><Text style={s.infoLabel}>Block 1 (1-4)</Text><Text style={s.infoVal}>Rebuild / Recomp</Text></View>
          <View style={s.infoRow}><Text style={s.infoLabel}>Block 2 (5-8)</Text><Text style={s.infoVal}>Build Strength</Text></View>
          <View style={s.infoRow}><Text style={s.infoLabel}>Block 3 (9-12)</Text><Text style={s.infoVal}>Intensify</Text></View>
          <View style={s.infoRow}><Text style={s.infoLabel}>Blocks 4-7</Text><Text style={s.infoVal}>Peak / Competition Prep</Text></View>
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
  subtitle: { fontSize: FONTS.sizes.base, color: COLORS.text.secondary, marginBottom: 40 },
  field: { marginBottom: 24 },
  label: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, color: COLORS.text.muted, letterSpacing: 1.5, marginBottom: 10 },
  input: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, height: 52, paddingHorizontal: SPACING.lg, color: COLORS.text.primary, fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.bold, borderWidth: 1, borderColor: COLORS.border },
  hint: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 6 },
  infoCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: 24, borderLeftWidth: 3, borderLeftColor: COLORS.accent },
  infoTitle: { color: COLORS.text.primary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.sm, marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  infoLabel: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm },
  infoVal: { color: COLORS.text.primary, fontWeight: FONTS.weights.semibold, fontSize: FONTS.sizes.sm },
  btn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 8, marginBottom: 12 },
  btnText: { color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold },
  back: { textAlign: 'center', color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, paddingVertical: 8 },
});
