/**
 * training-maxes.tsx — edit the numbers every prescribed load is derived from.
 *
 * Saving rescales the athlete's live program: loads for the changed lift move by
 * the same proportion, from the current week forward. Completed weeks are left
 * alone so training history stays an accurate record. This happens quietly —
 * the athlete asked to change a number, not to be interrogated about it.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  ActivityIndicator, TextInput, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONTS, RADIUS } from '../src/constants/theme';
import { maxesApi, PrSuggestion } from '../src/utils/api';

const GOLD = '#C9A84C';

// The eight lifts the generator actually calculates loads from. Labels state the
// unit of measure — "Farmer's Walk" is ambiguous otherwise, and entering a
// combined total instead of per-hand would double every farmer's prescription.
const BARBELL_LIFTS = [
  { key: 'squat',    label: 'Back Squat'      },
  { key: 'bench',    label: 'Bench Press'     },
  { key: 'deadlift', label: 'Deadlift'        },
  { key: 'ohp',      label: 'Overhead Press'  },
] as const;

const EVENT_LIFTS = [
  { key: 'log_press',   label: 'Log Press',    hint: 'max'                 },
  { key: 'yoke_walk',   label: 'Yoke Walk',    hint: 'total weight, 40 ft' },
  { key: 'atlas_stone', label: 'Atlas Stone',  hint: 'stone weight, to 48"'},
  { key: 'farmer_walk', label: "Farmer's Walk", hint: 'per hand, 50 ft'    },
] as const;

const PROGRAMMING_KEYS = new Set<string>([
  ...BARBELL_LIFTS.map(l => l.key), ...EVENT_LIFTS.map(l => l.key),
]);

export default function TrainingMaxesScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [units, setUnits]       = useState<'lbs' | 'kg'>('lbs');
  const [values, setValues]     = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [customKeys, setCustomKeys] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<PrSuggestion[]>([]);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await maxesApi.get();
      const strs: Record<string, string> = {};
      Object.entries(res.maxes || {}).forEach(([k, v]) => {
        if (v) strs[k] = String(v);
      });
      setValues(strs);
      setOriginal(strs);
      setCustomKeys(Object.keys(res.maxes || {}).filter(k => !PROGRAMMING_KEYS.has(k)));
      setUnits(res.units || 'lbs');
      setSuggestions(res.prSuggestions || []);
    } catch (e) {
      console.warn('[TrainingMaxes] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const dirty = useMemo(
    () => Object.keys({ ...values, ...original }).some(k => (values[k] || '') !== (original[k] || '')),
    [values, original],
  );

  const setVal = (key: string, raw: string) =>
    setValues(prev => ({ ...prev, [key]: raw.replace(/[^0-9.]/g, '') }));

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const payload: Record<string, number> = {};
      Object.keys({ ...values, ...original }).forEach(k => {
        const v = parseFloat(values[k] || '');
        payload[k] = isNaN(v) ? 0 : v;   // 0 clears the value server-side
      });
      await maxesApi.update(payload, true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOriginal({ ...values });
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const applySuggestion = (s: PrSuggestion) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVal(s.maxKey, String(s.loggedWeight));
    setSuggestions(prev => prev.filter(x => x.maxKey !== s.maxKey));
  };

  const addCustom = () => {
    const name = newName.trim();
    if (!name || values[name] !== undefined) return;
    setCustomKeys(prev => [...prev, name]);
    setValues(prev => ({ ...prev, [name]: '' }));
    setNewName('');
  };

  const renderRow = (key: string, label: string, hint?: string) => (
    <View key={key} style={s.row}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {!!hint && <Text style={s.rowHint}>{hint}</Text>}
      </View>
      <TextInput
        style={s.input}
        value={values[key] ?? ''}
        onChangeText={t => setVal(key, t)}
        placeholder="—"
        placeholderTextColor={COLORS.text.muted}
        keyboardType="numeric"
        returnKeyType="done"
      />
      <Text style={s.unit}>{units}</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={GOLD} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[s.header, { paddingTop: insets.top > 0 ? 0 : SPACING.md }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
            <MaterialCommunityIcons name="chevron-left" size={26} color={COLORS.text.primary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Training Maxes</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={!dirty || saving}
            hitSlop={12}
            style={s.saveBtn}
          >
            {saving
              ? <ActivityIndicator size="small" color={GOLD} />
              : <Text style={[s.saveTxt, { opacity: dirty ? 1 : 0.35 }]}>Save</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + 48 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.intro}>
            Every weight in your program is calculated from these numbers. Changing one
            updates the rest of your current program to match.
          </Text>

          {/* PR suggestions from logged training */}
          {suggestions.length > 0 && (
            <View style={s.sugWrap}>
              {suggestions.map(sg => (
                <View key={sg.maxKey} style={s.sug}>
                  <MaterialCommunityIcons name="trophy-outline" size={18} color={GOLD} />
                  <Text style={s.sugTxt}>{sg.reason}</Text>
                  <TouchableOpacity onPress={() => applySuggestion(sg)} style={s.sugBtn} activeOpacity={0.8}>
                    <Text style={s.sugBtnTxt}>Use it</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <Text style={s.section}>BARBELL</Text>
          <View style={s.card}>{BARBELL_LIFTS.map(l => renderRow(l.key, l.label))}</View>

          <Text style={s.section}>STRONGMAN EVENTS</Text>
          <View style={s.card}>{EVENT_LIFTS.map(l => renderRow(l.key, l.label, l.hint))}</View>

          <Text style={s.section}>OTHER LIFTS</Text>
          <View style={s.card}>
            {customKeys.length === 0 && (
              <Text style={s.empty}>
                Add any other lift you want to track. These are kept as a record — they
                don't change your program.
              </Text>
            )}
            {customKeys.map(k => renderRow(k, k))}
            <View style={[s.row, { borderBottomWidth: 0 }]}>
              <TextInput
                style={[s.input, s.newInput]}
                value={newName}
                onChangeText={setNewName}
                placeholder="Add a lift (e.g. Circus Dumbbell)"
                placeholderTextColor={COLORS.text.muted}
                returnKeyType="done"
                onSubmitEditing={addCustom}
              />
              <TouchableOpacity onPress={addCustom} hitSlop={10} disabled={!newName.trim()}>
                <MaterialCommunityIcons
                  name="plus-circle"
                  size={24}
                  color={newName.trim() ? GOLD : COLORS.text.muted}
                />
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 40 },
  saveBtn: { width: 52, alignItems: 'flex-end' },
  saveTxt: { color: GOLD, fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold },
  headerTitle: {
    color: COLORS.text.primary, fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold, letterSpacing: -0.3,
  },
  intro: {
    color: COLORS.text.muted, fontSize: FONTS.sizes.sm,
    lineHeight: 20, marginBottom: SPACING.lg,
  },
  section: {
    color: COLORS.text.muted, fontSize: 11, letterSpacing: 1.2,
    fontWeight: FONTS.weights.bold, marginBottom: SPACING.sm, marginTop: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  rowLabel: { color: COLORS.text.primary, fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold },
  rowHint:  { color: COLORS.text.muted, fontSize: 12, marginTop: 2 },
  input: {
    minWidth: 78, textAlign: 'right', color: COLORS.text.primary,
    fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold,
    paddingVertical: 6, paddingHorizontal: 8,
    backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.md,
  },
  newInput: { flex: 1, textAlign: 'left', minWidth: 0, marginRight: SPACING.sm, fontWeight: FONTS.weights.regular },
  unit: { color: COLORS.text.muted, fontSize: FONTS.sizes.sm, width: 30, textAlign: 'right' },
  empty: { color: COLORS.text.muted, fontSize: FONTS.sizes.sm, lineHeight: 19, paddingVertical: SPACING.md },
  sugWrap: { marginBottom: SPACING.md, gap: SPACING.sm },
  sug: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: 'rgba(201,168,76,0.10)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.35)',
    borderRadius: RADIUS.lg, padding: SPACING.md,
  },
  sugTxt: { flex: 1, color: COLORS.text.primary, fontSize: FONTS.sizes.sm, lineHeight: 19 },
  sugBtn: {
    backgroundColor: GOLD, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 7,
  },
  sugBtnTxt: { color: COLORS.surface, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.bold },
});
