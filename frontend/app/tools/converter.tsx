import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, SafeAreaView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';
import { lbsToKg, kgToLbs, calculatePlateMath } from '../../src/utils/calculations';

const LBS_EQUIVALENTS = [
  [45, 20.4], [135, 61.2], [225, 102.1], [315, 142.9],
  [405, 183.7], [495, 224.5], [545, 247.2], [600, 272.2], [700, 317.5],
];

const PLATE_COLORS: Record<string, string> = {
  '45': '#E53935', '25': '#1E88E5', '10': '#FFFFFF', '5': '#388E3C', '2.5': '#FDD835',
  '20': '#E53935', '15': '#F57C00', '1.25': '#FAFAFA',
};

export default function ConverterScreen() {
  const router = useRouter();
  const [lbs, setLbs] = useState('');
  const [kg, setKg] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [barWeight, setBarWeight] = useState('45');
  const [unit, setUnit] = useState<'lbs' | 'kg'>('lbs');
  const [showPlate, setShowPlate] = useState(false);

  function onLbsChange(v: string) {
    const n = v.replace(/[^0-9.]/g, '');
    setLbs(n);
    if (n) setKg(lbsToKg(parseFloat(n)).toFixed(2));
    else setKg('');
  }
  function onKgChange(v: string) {
    const n = v.replace(/[^0-9.]/g, '');
    setKg(n);
    if (n) setLbs(kgToLbs(parseFloat(n)).toFixed(2));
    else setLbs('');
  }
  function swap() {
    const tmp = lbs;
    setLbs(kg);
    setKg(tmp);
  }

  const plateMath = (targetWeight && barWeight) ? calculatePlateMath(
    parseFloat(targetWeight), parseFloat(barWeight), unit
  ) : null;

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView testID="converter-scroll" keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={s.backBtn}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text.secondary} />
            </TouchableOpacity>
            <Text style={s.title}>lbs ↔ kg CONVERTER</Text>
          </View>

          {/* Converter */}
          <View style={s.converterCard}>
            <View style={s.convertRow}>
              <View style={s.convertWrap}>
                <Text style={s.convertLabel}>LBS</Text>
                <TextInput testID="lbs-input" style={s.bigInput} value={lbs} onChangeText={onLbsChange} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={COLORS.text.muted} />
              </View>
              <TouchableOpacity testID="swap-btn" onPress={swap} style={s.swapBtn}>
                <Text style={s.swapIcon}>⇄</Text>
              </TouchableOpacity>
              <View style={s.convertWrap}>
                <Text style={s.convertLabel}>KG</Text>
                <TextInput testID="kg-input" style={s.bigInput} value={kg} onChangeText={onKgChange} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={COLORS.text.muted} />
              </View>
            </View>
          </View>

          {/* Common Equivalents */}
          <Text style={s.sectionTitle}>BARBELL EQUIVALENTS</Text>
          <View style={s.equivCard}>
            <View style={s.equivHeader}>
              <Text style={s.equivHead}>LBS</Text>
              <Text style={s.equivHead}>KG</Text>
            </View>
            {LBS_EQUIVALENTS.map(([l, k]) => (
              <View key={l} style={s.equivRow}>
                <Text style={s.equivLbs}>{l} lbs</Text>
                <Text style={s.equivKg}>{k} kg</Text>
              </View>
            ))}
          </View>

          {/* Plate Math */}
          <TouchableOpacity testID="plate-math-toggle" style={s.plateMathHeader} onPress={() => setShowPlate(!showPlate)}>
            <Text style={s.sectionTitle}>PLATE MATH CALCULATOR</Text>
            <MaterialCommunityIcons name={showPlate ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.text.muted} />
          </TouchableOpacity>

          {showPlate && (
            <View style={s.plateMathCard}>
              {/* Unit Toggle */}
              <View style={s.unitRow}>
                {(['lbs', 'kg'] as const).map(u => (
                  <TouchableOpacity testID={`unit-${u}`} key={u} style={[s.unitBtn, unit === u && s.unitActive]} onPress={() => setUnit(u)}>
                    <Text style={[s.unitText, unit === u && s.unitTextActive]}>{u.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={s.plateInputRow}>
                <View style={s.plateInputWrap}>
                  <Text style={s.plateInputLabel}>TARGET WEIGHT ({unit})</Text>
                  <TextInput testID="target-weight" style={s.plateInput} value={targetWeight} onChangeText={setTargetWeight} keyboardType="decimal-pad" placeholder="315" placeholderTextColor={COLORS.text.muted} />
                </View>
                <View style={s.plateInputWrap}>
                  <Text style={s.plateInputLabel}>BAR WEIGHT ({unit})</Text>
                  <TextInput testID="bar-weight" style={s.plateInput} value={barWeight} onChangeText={setBarWeight} keyboardType="decimal-pad" placeholder={unit === 'kg' ? '20' : '45'} placeholderTextColor={COLORS.text.muted} />
                </View>
              </View>

              {plateMath && (
                <View style={s.plateResult}>
                  {!plateMath.possible ? (
                    <Text style={s.plateError}>⚠ Cannot make exact weight with standard plates. Remainder: {plateMath.remainder} {unit}</Text>
                  ) : (
                    <>
                      <Text style={s.plateResultTitle}>PLATES PER SIDE</Text>
                      <View style={s.plateVisual}>
                        {[...plateMath.platesPerSide].reverse().map((p, i) => (
                          Array.from({ length: p.count }).map((_, j) => (
                            <View key={`${i}-${j}`} style={[s.plate, { backgroundColor: PLATE_COLORS[String(p.weight)] || '#888', width: 20 + p.weight / 3 }]}>
                              <Text style={s.plateText}>{p.weight}</Text>
                            </View>
                          ))
                        ))}
                        <View style={s.barEnd} />
                      </View>
                      <View style={s.plateList}>
                        {plateMath.platesPerSide.map(p => (
                          <View key={p.weight} style={s.plateListRow}>
                            <View style={[s.plateDot, { backgroundColor: PLATE_COLORS[String(p.weight)] || '#888' }]} />
                            <Text style={s.plateListText}>{p.count}× {p.weight} {unit}</Text>
                          </View>
                        ))}
                      </View>
                      <Text style={s.plateTotalText}>Total: {plateMath.totalWeight} {unit}</Text>
                    </>
                  )}
                </View>
              )}
            </View>
          )}
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
  title: { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, letterSpacing: 1 },
  converterCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl, marginBottom: SPACING.sm },
  convertRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.md },
  convertWrap: { flex: 1 },
  convertLabel: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2, marginBottom: SPACING.sm, textAlign: 'center' },
  bigInput: { backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.md, height: 64, textAlign: 'center', fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, borderWidth: 1, borderColor: COLORS.border },
  swapBtn: { paddingBottom: 16 },
  swapIcon: { fontSize: 28, color: COLORS.accentBlue },
  sectionTitle: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  equivCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm },
  equivHeader: { flexDirection: 'row', marginBottom: SPACING.sm, paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  equivHead: { flex: 1, fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1 },
  equivRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  equivLbs: { flex: 1, color: COLORS.text.secondary, fontWeight: FONTS.weights.semibold },
  equivKg: { flex: 1, color: COLORS.accentBlue, fontWeight: FONTS.weights.semibold },
  plateMathHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: SPACING.lg },
  plateMathCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm },
  unitRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  unitBtn: { flex: 1, height: 40, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceHighlight, justifyContent: 'center', alignItems: 'center' },
  unitActive: { backgroundColor: COLORS.accent },
  unitText: { color: COLORS.text.secondary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.sm },
  unitTextActive: { color: '#FFF' },
  plateInputRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  plateInputWrap: { flex: 1 },
  plateInputLabel: { fontSize: 10, fontWeight: FONTS.weights.bold, color: COLORS.text.muted, letterSpacing: 1, marginBottom: 6 },
  plateInput: { backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.md, height: 48, paddingHorizontal: SPACING.md, color: COLORS.text.primary, fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.bold, textAlign: 'center', borderWidth: 1, borderColor: COLORS.border },
  plateResult: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.lg },
  plateResultTitle: { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2, marginBottom: SPACING.md },
  plateVisual: { flexDirection: 'row', alignItems: 'center', height: 60, marginBottom: SPACING.md },
  plate: { height: 48, borderRadius: 3, justifyContent: 'center', alignItems: 'center', marginRight: 2 },
  plateText: { fontSize: 8, fontWeight: FONTS.weights.heavy, color: '#000', transform: [{ rotate: '-90deg' }] },
  barEnd: { width: 40, height: 12, backgroundColor: '#888', borderRadius: 2 },
  plateList: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginBottom: SPACING.sm },
  plateListRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  plateDot: { width: 12, height: 12, borderRadius: 6 },
  plateListText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm },
  plateTotalText: { color: COLORS.accent, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.base },
  plateError: { color: '#CF6679', fontSize: FONTS.sizes.sm },
});
