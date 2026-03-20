import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';
import { EXPERIENCE_LEVELS } from '../../src/data/exerciseList';

const STEPS = 6;

export default function OnboardingStep1() {
  const router = useRouter();
  const [name, setName] = useState('Eric');
  const [experience, setExperience] = useState('Advanced');

  async function handleNext() {
    await AsyncStorage.setItem('ob_step1', JSON.stringify({ name, experience }));
    router.push('/onboarding/step2');
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <ProgressBar step={1} total={STEPS} />
        <Text style={s.title}>Athlete Info</Text>
        <Text style={s.subtitle}>Let's start with the basics</Text>

        <View style={s.field}>
          <Text style={s.label}>NAME</Text>
          <TextInput
            testID="ob-name-input"
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={COLORS.text.muted}
            autoCapitalize="words"
          />
        </View>

        <View style={s.field}>
          <Text style={s.label}>EXPERIENCE LEVEL</Text>
          <View style={s.optionRow}>
            {EXPERIENCE_LEVELS.map(lvl => (
              <TouchableOpacity
                testID={`exp-${lvl}`}
                key={lvl}
                style={[s.option, experience === lvl && s.optionActive]}
                onPress={() => setExperience(lvl)}
              >
                <Text style={[s.optionText, experience === lvl && s.optionTextActive]}>{lvl}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity testID="ob-step1-next" style={s.btn} onPress={handleNext} disabled={!name.trim()}>
          <Text style={s.btnText}>Continue →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <View style={ps.wrapper}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[ps.dot, i < step && ps.dotActive, i === step - 1 && ps.dotCurrent]} />
      ))}
    </View>
  );
}

const ps = StyleSheet.create({
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
  field: { marginBottom: 28 },
  label: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, color: COLORS.text.muted, letterSpacing: 1.5, marginBottom: 10 },
  input: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, height: 52, paddingHorizontal: SPACING.lg, color: COLORS.text.primary, fontSize: FONTS.sizes.base, borderWidth: 1, borderColor: COLORS.border },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  option: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  optionActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  optionText: { color: COLORS.text.secondary, fontWeight: FONTS.weights.medium, fontSize: FONTS.sizes.sm },
  optionTextActive: { color: '#FFF', fontWeight: FONTS.weights.bold },
  btn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 'auto', marginBottom: 16 },
  btnText: { color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold },
});
