import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, SafeAreaView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';
import { epleyE1RM, brzyckiE1RM, lbsToKg, PERCENT_TABLE } from '../../src/utils/calculations';

export default function CalculatorScreen() {
  const router = useRouter();
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');

  const w = parseFloat(weight) || 0;
  const r = parseInt(reps) || 0;
  const epley = epleyE1RM(w, r);
  const brzycki = brzyckiE1RM(w, r);

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView testID="calculator-scroll" keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={s.header}>
            <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={s.backBtn}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text.secondary} />
            </TouchableOpacity>
            <Text style={s.title}>MAX CALCULATOR</Text>
          </View>

          {/* Input Fields */}
          <View style={s.inputCard}>
            <View style={s.inputRow}>
              <View style={s.inputWrap}>
                <Text style={s.inputLabel}>WEIGHT (lbs)</Text>
                <TextInput testID="calc-weight" style={s.bigInput} value={weight} onChangeText={v => setWeight(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={COLORS.text.muted} />
              </View>
              <Text style={s.times}>×</Text>
              <View style={s.inputWrap}>
                <Text style={s.inputLabel}>REPS</Text>
                <TextInput testID="calc-reps" style={s.bigInput} value={reps} onChangeText={v => setReps(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="0" placeholderTextColor={COLORS.text.muted} />
              </View>
            </View>
          </View>

          {/* Results */}
          {epley > 0 && (
            <View style={s.resultsCard}>
              <Text style={s.resultsLabel}>EPLEY (PRIMARY)</Text>
              <Text testID="epley-result" style={s.bigResult}>{epley} lbs</Text>
              <Text style={s.kgResult}>{lbsToKg(epley).toFixed(1)} kg</Text>
              {brzycki > 0 && (
                <View style={s.brzyRow}>
                  <Text style={s.brzyLabel}>Brzycki: </Text>
                  <Text testID="brzycki-result" style={s.brzyVal}>{brzycki} lbs</Text>
                  <Text style={s.brzyKg}> ({lbsToKg(brzycki).toFixed(1)} kg)</Text>
                </View>
              )}
            </View>
          )}

          {/* Percentage Table */}
          {epley > 0 && (
            <View style={s.tableCard}>
              <Text style={s.tableTitle}>PERCENTAGE TABLE</Text>
              <View style={s.tableHeaderRow}>
                <Text style={[s.th, { flex: 1 }]}>%</Text>
                <Text style={[s.th, { flex: 1.5 }]}>LBS</Text>
                <Text style={[s.th, { flex: 1.5 }]}>KG</Text>
              </View>
              {PERCENT_TABLE.map(pct => {
                const lbsVal = Math.round(epley * pct / 100);
                const kgVal = lbsToKg(lbsVal);
                return (
                  <View key={pct} style={[s.tableRow, pct === 100 && s.tableRowHighlight]}>
                    <Text style={[s.td, { flex: 1 }, pct === 100 && s.tdHighlight]}>{pct}%</Text>
                    <Text style={[s.td, { flex: 1.5 }, pct === 100 && s.tdHighlight]}>{lbsVal} lbs</Text>
                    <Text style={[s.td, { flex: 1.5 }, pct === 100 && s.tdHighlight]}>{kgVal.toFixed(1)} kg</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Note */}
          <View style={s.noteCard}>
            <Text style={s.noteText}>Epley is most accurate between 2–10 reps. For a true max effort, the actual weight lifted is your estimated max. Accuracy decreases above 10 reps.</Text>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: SPACING.lg, paddingTop: SPACING.xl, gap: SPACING.md },
  backBtn: { padding: 4 },
  title: { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, letterSpacing: 2 },
  inputCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl, marginBottom: SPACING.sm },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.md },
  inputWrap: { flex: 1 },
  inputLabel: { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.5, marginBottom: SPACING.sm },
  bigInput: { backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.md, height: 72, textAlign: 'center', fontSize: FONTS.sizes.xxxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, borderWidth: 1, borderColor: COLORS.border },
  times: { fontSize: FONTS.sizes.xxl, color: COLORS.text.muted, paddingBottom: 20 },
  resultsCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center', marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.accentBlue },
  resultsLabel: { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.accentBlue, letterSpacing: 2, marginBottom: SPACING.sm },
  bigResult: { fontSize: FONTS.sizes.hero, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  kgResult: { fontSize: FONTS.sizes.lg, color: COLORS.text.secondary, marginBottom: SPACING.md },
  brzyRow: { flexDirection: 'row', alignItems: 'center' },
  brzyLabel: { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },
  brzyVal: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.bold, color: COLORS.text.secondary },
  brzyKg: { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },
  tableCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm },
  tableTitle: { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2, marginBottom: SPACING.sm },
  tableHeaderRow: { flexDirection: 'row', paddingVertical: SPACING.sm, borderBottomWidth: 2, borderBottomColor: COLORS.border },
  th: { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1 },
  tableRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tableRowHighlight: { backgroundColor: COLORS.accent + '20' },
  td: { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary },
  tdHighlight: { color: COLORS.accent, fontWeight: FONTS.weights.bold },
  noteCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.lg, borderLeftWidth: 3, borderLeftColor: COLORS.text.muted },
  noteText: { color: COLORS.text.muted, fontSize: FONTS.sizes.xs, lineHeight: 18, fontStyle: 'italic' },
});
