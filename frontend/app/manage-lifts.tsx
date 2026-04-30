import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  ActivityIndicator, Modal, TextInput, Alert, Pressable, Animated,
  Platform, KeyboardAvoidingView, Switch,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, FONTS, RADIUS } from '../src/constants/theme';
import { getLocalDateString } from '../src/utils/dateHelpers';
import { liftsApi } from '../src/utils/api';
import AskCoachButton from '../src/components/AskCoachButton';

// ── Constants ─────────────────────────────────────────────────────────────────
const GOLD  = '#C9A84C';
const BLUE  = '#5B9CF5';
const RED   = '#EF5350';

const CATALOG = [
  { name: 'Powerlifting',     color: RED,    exercises: ['Back Squat', 'Bench Press', 'Conventional Deadlift', 'Overhead Press'] },
  { name: 'Strongman',        color: GOLD,   exercises: ['Yoke', 'Axle Deadlift', 'Axle Clean & Press', 'Log Press', 'Farmers Walk', 'Atlas Stone', 'Circus Dumbbell', 'Car Deadlift', 'Husafell Stone'] },
  { name: 'Olympic',          color: BLUE,   exercises: ['Clean & Jerk', 'Snatch', 'Clean', 'Power Clean', 'Push Press', 'Push Jerk'] },
  { name: 'Squat Variations', color: '#888', exercises: ['SSB Squat', 'Front Squat', 'Box Squat', 'Zercher Squat', 'Goblet Squat'] },
  { name: 'Press Variations', color: '#888', exercises: ['Floor Press', 'Incline Bench', 'Close Grip Bench', 'Z-Press', 'Dumbbell Bench'] },
  { name: 'Pull Variations',  color: '#888', exercises: ['Block Pull', 'Deficit Deadlift', 'Romanian Deadlift', 'Sumo Deadlift', 'Rack Pull', 'Trap Bar Deadlift'] },
];

interface TrackedLift {
  id: string;
  exercise: string;
  category: string;
  bestWeight: number;
  bestReps: number;
  bestE1rm: number;
  lastDate: string | null;
  isFeatured: boolean;
}

function fmtDate(d: string | null) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return d ?? ''; }
}

function epley(w: number, r: number): number {
  if (w <= 0 || r <= 0) return 0;
  if (r === 1) return Math.round(w);
  return Math.round(w * (1 + r / 30));
}

// ── FeaturedCard ──────────────────────────────────────────────────────────────
function FeaturedCard({ lift, onUnfeature }: { lift: TrackedLift | null; onUnfeature?: () => void }) {
  if (!lift) {
    return (
      <View style={fc.placeholder}>
        <MaterialCommunityIcons name="star-outline" size={22} color={COLORS.border} />
        <Text style={fc.emptyText}>Tap ⭐ to feature</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity style={fc.card} onPress={onUnfeature} activeOpacity={0.8}>
      <MaterialCommunityIcons name="star" size={13} color={GOLD} />
      <Text style={fc.name} numberOfLines={2}>{lift.exercise}</Text>
      <Text style={fc.val}>{lift.bestE1rm > 0 ? lift.bestE1rm : '—'}</Text>
      <Text style={fc.unit}>est. max</Text>
    </TouchableOpacity>
  );
}
const fc = StyleSheet.create({
  placeholder: { flex: 1, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed' as any, alignItems: 'center', justifyContent: 'center', padding: SPACING.md, minHeight: 90 },
  emptyText:   { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 5, textAlign: 'center' },
  card:        { flex: 1, backgroundColor: GOLD + '12', borderRadius: RADIUS.lg, borderWidth: 1, borderColor: GOLD + '40', padding: SPACING.md, minHeight: 90, gap: 3 },
  name:        { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 18 },
  val:         { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: GOLD },
  unit:        { fontSize: 9, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold, letterSpacing: 0.8 },
});

// ── LiftRow ───────────────────────────────────────────────────────────────────
function LiftRow({
  lift, canFeature, onToggleFeatured, onEdit, onDelete,
}: {
  lift: TrackedLift; canFeature: boolean;
  onToggleFeatured: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const showStar = lift.isFeatured || canFeature;
  return (
    <View>
      <View style={lr.row}>
        <View style={[lr.dot, { backgroundColor: lift.isFeatured ? GOLD : COLORS.border }]} />
        <View style={lr.info}>
          <Text style={lr.name}>{lift.exercise}</Text>
          <Text style={lr.details} numberOfLines={1}>
            {lift.bestWeight > 0 ? `${lift.bestWeight} × ${lift.bestReps}` : 'No PR recorded'}
            {lift.lastDate ? ` · ${fmtDate(lift.lastDate)}` : ''}
            {lift.bestE1rm > 0 ? ` · Est. max ${lift.bestE1rm}` : ''}
          </Text>
        </View>
        <View style={lr.actions}>
          {showStar && (
            <TouchableOpacity onPress={onToggleFeatured} style={lr.btn} activeOpacity={0.75}>
              <MaterialCommunityIcons name={lift.isFeatured ? 'star' : 'star-outline'} size={20} color={GOLD} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onEdit} style={lr.btn} activeOpacity={0.75}>
            <MaterialCommunityIcons name="pencil" size={20} color={BLUE} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={lr.btn} activeOpacity={0.75}>
            <MaterialCommunityIcons name="trash-can-outline" size={20} color={RED} />
          </TouchableOpacity>
        </View>
      </View>
      {/* ── Ask Coach about this lift ── */}
      <AskCoachButton
        seedPrompt={`Look at my ${lift.exercise} progress. What's the next phase of work for this lift?`}
        triggerName="lift_progress_inquiry"
        label={`Coach on ${lift.exercise.split(' ')[0]}`}
        size="sm"
        style={{ marginLeft: 26, marginBottom: 8, marginTop: -4 }}
      />
    </View>
  );
}
const lr = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.sm },
  dot:     { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  info:    { flex: 1, gap: 2 },
  name:    { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  details: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  btn:     { padding: 6, borderRadius: RADIUS.sm },
});

// ── AddLiftModal ──────────────────────────────────────────────────────────────
function AddLiftModal({
  visible, trackedExercises, onAdd, onClose,
}: {
  visible: boolean; trackedExercises: string[];
  onAdd: (exercise: string, category: string) => void; onClose: () => void;
}) {
  const [search, setSearch]       = useState('');
  const [customName, setCustomName] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const slideAnim = useRef(new Animated.Value(800)).current;

  useEffect(() => {
    if (visible) {
      setSearch(''); setCustomName(''); setShowCustom(false);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }).start();
    } else {
      slideAnim.setValue(800);
    }
  }, [visible]);

  const hide = (cb?: () => void) =>
    Animated.timing(slideAnim, { toValue: 800, duration: 220, useNativeDriver: true }).start(() => cb?.());

  const filtered = CATALOG.map(cat => ({
    ...cat,
    exercises: search.trim()
      ? cat.exercises.filter(e => e.toLowerCase().includes(search.toLowerCase()))
      : cat.exercises,
  })).filter(c => c.exercises.length > 0);

  const handleAdd = (exercise: string, category: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAdd(exercise, category);
  };

  const handleCustomAdd = () => {
    const name = customName.trim();
    if (!name) return;
    handleAdd(name, 'Custom');
    setCustomName('');
    setShowCustom(false);
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={() => hide(onClose)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={am.overlay} onPress={() => hide(onClose)}>
          <Animated.View style={[am.sheet, { transform: [{ translateY: slideAnim }] }]}>
            <Pressable onPress={e => e.stopPropagation()}>
              <View style={am.handleWrap}><View style={am.handle} /></View>
              <View style={am.header}>
                <Text style={am.title}>Add lift</Text>
                <TouchableOpacity onPress={() => hide(onClose)} style={am.closeBtn}>
                  <MaterialCommunityIcons name="close" size={20} color={COLORS.text.muted} />
                </TouchableOpacity>
              </View>
              <View style={am.searchRow}>
                <MaterialCommunityIcons name="magnify" size={18} color={COLORS.text.muted} />
                <TextInput
                  style={am.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search exercises..."
                  placeholderTextColor={COLORS.text.muted}
                  autoCapitalize="none"
                  clearButtonMode="while-editing"
                />
              </View>
              <ScrollView style={am.scroll} contentContainerStyle={am.scrollContent} showsVerticalScrollIndicator={false}>
                {!search.trim() && (
                  <View style={am.customSection}>
                    {showCustom ? (
                      <View style={am.customRow}>
                        <TextInput
                          style={am.customInput}
                          value={customName}
                          onChangeText={setCustomName}
                          placeholder="Enter lift name..."
                          placeholderTextColor={COLORS.text.muted}
                          autoFocus
                          onSubmitEditing={handleCustomAdd}
                        />
                        <TouchableOpacity style={am.customAddBtn} onPress={handleCustomAdd} activeOpacity={0.8}>
                          <Text style={am.customAddBtnText}>Add</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity style={am.customTrigger} onPress={() => setShowCustom(true)} activeOpacity={0.75}>
                        <MaterialCommunityIcons name="plus" size={14} color={GOLD} />
                        <Text style={am.customTriggerText}>Add custom lift name</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                {filtered.map(cat => (
                  <View key={cat.name} style={am.catSection}>
                    <View style={am.catHeader}>
                      <View style={[am.catDot, { backgroundColor: cat.color }]} />
                      <Text style={[am.catName, { color: cat.color }]}>{cat.name.toUpperCase()}</Text>
                    </View>
                    <View style={am.chipsWrap}>
                      {cat.exercises.map(ex => {
                        const tracked = trackedExercises.includes(ex);
                        return (
                          <TouchableOpacity
                            key={ex}
                            style={[am.chip, tracked && am.chipDone]}
                            onPress={() => { if (!tracked) handleAdd(ex, cat.name); }}
                            activeOpacity={tracked ? 1 : 0.75}
                            disabled={tracked}
                          >
                            {tracked && <MaterialCommunityIcons name="check" size={11} color={COLORS.text.muted} />}
                            <Text style={[am.chipText, tracked && am.chipTextDone]}>{ex}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
                {filtered.length === 0 && search.trim() && (
                  <View style={am.noResults}>
                    <Text style={am.noResultsText}>No match for "{search}"</Text>
                    <TouchableOpacity style={am.customTrigger} onPress={() => { handleAdd(search.trim(), 'Custom'); }} activeOpacity={0.75}>
                      <MaterialCommunityIcons name="plus" size={14} color={GOLD} />
                      <Text style={am.customTriggerText}>Add "{search}" as custom</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </Pressable>
          </Animated.View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const am = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: COLORS.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%' },
  handleWrap:   { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm },
  title:        { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  closeBtn:     { padding: 4 },
  searchRow:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginHorizontal: SPACING.xl, marginBottom: SPACING.md, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border },
  searchInput:  { flex: 1, color: COLORS.text.primary, fontSize: FONTS.sizes.base },
  scroll:       { flexGrow: 0 },
  scrollContent:{ paddingHorizontal: SPACING.xl, paddingBottom: 40 },
  customSection:{ marginBottom: SPACING.md },
  customTrigger:{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: GOLD + '40', borderStyle: 'dashed' as any, alignSelf: 'flex-start' },
  customTriggerText: { fontSize: FONTS.sizes.sm, color: GOLD, fontWeight: FONTS.weights.semibold },
  customRow:    { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  customInput:  { flex: 1, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, paddingVertical: 10, color: COLORS.text.primary, fontSize: FONTS.sizes.base },
  customAddBtn: { backgroundColor: GOLD, borderRadius: RADIUS.lg, paddingVertical: 10, paddingHorizontal: SPACING.md },
  customAddBtnText: { color: COLORS.primary, fontWeight: FONTS.weights.heavy, fontSize: FONTS.sizes.sm },
  catSection:   { marginBottom: SPACING.lg },
  catHeader:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  catDot:       { width: 6, height: 6, borderRadius: 3 },
  catName:      { fontSize: 10, fontWeight: FONTS.weights.heavy, letterSpacing: 1.5 },
  chipsWrap:    { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.primary },
  chipText:     { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, fontWeight: FONTS.weights.semibold },
  chipDone:     { opacity: 0.45 },
  chipTextDone: { color: COLORS.text.muted },
  noResults:    { alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.xl },
  noResultsText:{ color: COLORS.text.muted, fontSize: FONTS.sizes.sm },
});

// ── EditPRModal ───────────────────────────────────────────────────────────────
function EditPRModal({
  lift, visible, onSave, onClose,
}: {
  lift: TrackedLift | null; visible: boolean;
  onSave: (liftId: string, data: any) => Promise<void>;
  onClose: () => void;
}) {
  const [weight, setWeight]     = useState('');
  const [reps, setReps]         = useState(1);
  const [otherReps, setOtherReps] = useState('');
  const [showOther, setShowOther] = useState(false);
  const [date, setDate]         = useState('');
  const [isFeatured, setIsFeatured] = useState(false);
  const [saving, setSaving]     = useState(false);
  const slideAnim = useRef(new Animated.Value(800)).current;

  useEffect(() => {
    if (visible && lift) {
      setWeight(lift.bestWeight > 0 ? String(lift.bestWeight) : '');
      setReps(lift.bestReps || 1);
      setOtherReps('');
      setShowOther(false);
      setDate(lift.lastDate || getLocalDateString());
      setIsFeatured(lift.isFeatured);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }).start();
    } else {
      slideAnim.setValue(800);
    }
  }, [visible, lift]);

  const hide = (cb?: () => void) =>
    Animated.timing(slideAnim, { toValue: 800, duration: 220, useNativeDriver: true }).start(() => cb?.());

  const actualReps = showOther ? (parseInt(otherReps) || 1) : reps;
  const estMax = epley(parseFloat(weight) || 0, actualReps);

  const handleSave = async () => {
    if (!lift) return;
    setSaving(true);
    try {
      await onSave(lift.id, { bestWeight: parseFloat(weight) || 0, bestReps: actualReps, lastDate: date, isFeatured });
      hide(onClose);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!lift) return null;
  const QUICK = [1, 2, 3, 5];

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={() => hide(onClose)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={ep.overlay} onPress={() => hide(onClose)}>
          <Animated.View style={[ep.sheet, { transform: [{ translateY: slideAnim }] }]}>
            <Pressable onPress={e => e.stopPropagation()}>
              <View style={ep.handleWrap}><View style={ep.handle} /></View>
              <View style={ep.header}>
                <View style={ep.headerIcon}>
                  <MaterialCommunityIcons name="pencil" size={16} color={BLUE} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ep.title}>Edit PR</Text>
                  <Text style={ep.subtitle} numberOfLines={1}>{lift.exercise}</Text>
                </View>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={ep.body}>
                {/* Weight */}
                <View style={ep.field}>
                  <Text style={ep.fieldLabel}>BEST WEIGHT</Text>
                  <View style={ep.weightRow}>
                    <TextInput
                      style={ep.weightInput}
                      value={weight}
                      onChangeText={setWeight}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={COLORS.text.muted}
                      selectTextOnFocus
                    />
                    <Text style={ep.weightUnit}>lbs</Text>
                  </View>
                </View>
                {/* Reps */}
                <View style={ep.field}>
                  <Text style={ep.fieldLabel}>REPS</Text>
                  <View style={ep.repsRow}>
                    {QUICK.map(r => (
                      <TouchableOpacity
                        key={r}
                        style={[ep.repChip, !showOther && reps === r && ep.repChipOn]}
                        onPress={() => { setReps(r); setShowOther(false); }}
                        activeOpacity={0.75}
                      >
                        <Text style={[ep.repTxt, !showOther && reps === r && ep.repTxtOn]}>{r}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[ep.repChip, showOther && ep.repChipOn]}
                      onPress={() => setShowOther(true)}
                      activeOpacity={0.75}
                    >
                      <Text style={[ep.repTxt, showOther && ep.repTxtOn]}>Other</Text>
                    </TouchableOpacity>
                  </View>
                  {showOther && (
                    <TextInput
                      style={ep.otherInput}
                      value={otherReps}
                      onChangeText={setOtherReps}
                      keyboardType="number-pad"
                      placeholder="Enter reps..."
                      placeholderTextColor={COLORS.text.muted}
                      autoFocus
                    />
                  )}
                </View>
                {/* Date */}
                <View style={ep.field}>
                  <Text style={ep.fieldLabel}>DATE (YYYY-MM-DD)</Text>
                  <TextInput
                    style={ep.dateInput}
                    value={date}
                    onChangeText={setDate}
                    placeholder="2025-06-01"
                    placeholderTextColor={COLORS.text.muted}
                  />
                </View>
                {/* Est. Max preview */}
                <View style={ep.estRow}>
                  <Text style={ep.estLabel}>CALCULATED EST. MAX</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: SPACING.xs }}>
                    <Text style={ep.estVal}>{estMax > 0 ? estMax : '—'}</Text>
                    {estMax > 0 && <Text style={ep.estUnit}>lbs</Text>}
                  </View>
                  <Text style={ep.estFormula}>{weight || '0'} × (1 + {actualReps} / 30)</Text>
                </View>
                {/* Feature toggle */}
                <View style={ep.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={ep.toggleLabel}>Feature on Home page</Text>
                    <Text style={ep.toggleSub}>Shows in Est. Maxes section</Text>
                  </View>
                  <Switch
                    value={isFeatured}
                    onValueChange={setIsFeatured}
                    thumbColor={isFeatured ? GOLD : '#555'}
                    trackColor={{ false: COLORS.border, true: GOLD + '60' }}
                  />
                </View>
                <TouchableOpacity style={ep.saveBtn} onPress={handleSave} activeOpacity={0.85} disabled={saving}>
                  {saving
                    ? <ActivityIndicator color={COLORS.primary} size="small" />
                    : <Text style={ep.saveBtnText}>SAVE PR</Text>
                  }
                </TouchableOpacity>
              </ScrollView>
            </Pressable>
          </Animated.View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const ep = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: COLORS.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '82%' },
  handleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  header:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: BLUE + '20', justifyContent: 'center', alignItems: 'center' },
  title:      { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  subtitle:   { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary },
  body:       { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: 40, gap: SPACING.lg },
  field:      { gap: SPACING.sm },
  fieldLabel: { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.5 },
  weightRow:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  weightInput:{ flex: 1, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: SPACING.lg, paddingVertical: 14, color: COLORS.text.primary, fontSize: 30, fontWeight: FONTS.weights.heavy, textAlign: 'center' },
  weightUnit: { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold, width: 28 },
  repsRow:    { flexDirection: 'row', gap: SPACING.sm },
  repChip:    { flex: 1, paddingVertical: 10, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', backgroundColor: COLORS.primary },
  repChipOn:  { backgroundColor: GOLD + '20', borderColor: GOLD },
  repTxt:     { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted },
  repTxtOn:   { color: GOLD },
  otherInput: { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, paddingVertical: 10, color: COLORS.text.primary, fontSize: FONTS.sizes.base, marginTop: SPACING.sm },
  dateInput:  { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, paddingVertical: 12, color: COLORS.text.primary, fontSize: FONTS.sizes.base },
  estRow:     { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, padding: SPACING.md, gap: 4, borderWidth: 1, borderColor: GOLD + '30' },
  estLabel:   { fontSize: 9, fontWeight: FONTS.weights.heavy, color: GOLD, letterSpacing: 1.5 },
  estVal:     { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: GOLD },
  estUnit:    { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },
  estFormula: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontStyle: 'italic' },
  toggleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  toggleLabel:{ fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  toggleSub:  { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 2 },
  saveBtn:    { backgroundColor: GOLD, borderRadius: RADIUS.lg, paddingVertical: 15, alignItems: 'center' },
  saveBtnText:{ color: COLORS.primary, fontWeight: FONTS.weights.heavy, fontSize: FONTS.sizes.base, letterSpacing: 1 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ManageLiftsScreen() {
  const router = useRouter();
  const [lifts, setLifts]             = useState<TrackedLift[]>([]);
  const [loading, setLoading]         = useState(true);
  const [addVisible, setAddVisible]   = useState(false);
  const [editLift, setEditLift]       = useState<TrackedLift | null>(null);
  const [editVisible, setEditVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await liftsApi.list();
      setLifts(data.lifts || []);
    } catch (e) {
      console.warn('[ManageLifts] load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const featuredLifts  = lifts.filter(l => l.isFeatured).slice(0, 3);
  const featuredCount  = featuredLifts.length;
  const trackedNames   = lifts.map(l => l.exercise);

  const toggleFeatured = async (lift: TrackedLift) => {
    if (!lift.isFeatured && featuredCount >= 3) {
      Alert.alert('Limit reached', 'You already have 3 featured lifts. Tap a featured card to remove it first.');
      return;
    }
    const newVal = !lift.isFeatured;
    setLifts(prev => prev.map(l => l.id === lift.id ? { ...l, isFeatured: newVal } : l));
    try {
      await liftsApi.update(lift.id, { isFeatured: newVal });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update');
      setLifts(prev => prev.map(l => l.id === lift.id ? { ...l, isFeatured: lift.isFeatured } : l));
    }
  };

  const handleDelete = (lift: TrackedLift) => {
    Alert.alert('Remove lift', `Remove ${lift.exercise} from your tracked lifts?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await liftsApi.delete(lift.id);
          setLifts(prev => prev.filter(l => l.id !== lift.id));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          Alert.alert('Error', 'Failed to remove lift');
        }
      }},
    ]);
  };

  const handleAdd = async (exercise: string, category: string) => {
    try {
      await liftsApi.add({ exercise, category });
      await load();
    } catch (e: any) {
      const msg = e.message || '';
      if (msg.toLowerCase().includes('already tracked')) {
        Alert.alert('Already tracked', `${exercise} is already in your list.`);
      } else {
        Alert.alert('Error', msg || 'Failed to add lift');
      }
    }
  };

  const handleEditSave = async (liftId: string, data: any) => {
    await liftsApi.update(liftId, data);
    await load();
  };

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.75}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.text.primary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Manage lifts</Text>
        <TouchableOpacity onPress={() => setAddVisible(true)} style={s.addBtn} activeOpacity={0.85}>
          <MaterialCommunityIcons name="plus" size={16} color={COLORS.primary} />
          <Text style={s.addBtnText}>Add lift</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.loadWrap}>
          <ActivityIndicator color={GOLD} size="large" />
        </View>
      ) : (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Featured Section */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <MaterialCommunityIcons name="star" size={13} color={GOLD} />
              <Text style={[s.sectionTitle, { color: GOLD }]}>FEATURED ON HOME ({featuredCount}/3)</Text>
            </View>
            <View style={s.featuredRow}>
              {[0, 1, 2].map(i => (
                <FeaturedCard
                  key={i}
                  lift={featuredLifts[i] ?? null}
                  onUnfeature={featuredLifts[i] ? () => toggleFeatured(featuredLifts[i]) : undefined}
                />
              ))}
            </View>
            <Text style={s.featuredHint}>Tap a featured card to unfeature it</Text>
          </View>

          {/* Tracked Lifts */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>YOUR TRACKED LIFTS ({lifts.length})</Text>
            {lifts.length === 0 ? (
              <View style={s.empty}>
                <MaterialCommunityIcons name="dumbbell" size={40} color={COLORS.text.muted} />
                <Text style={s.emptyTitle}>No lifts tracked yet</Text>
                <Text style={s.emptyText}>Tap "+ Add lift" to start tracking your personal records.</Text>
              </View>
            ) : (
              <View style={s.liftList}>
                {lifts.map(lift => (
                  <LiftRow
                    key={lift.id}
                    lift={lift}
                    canFeature={featuredCount < 3}
                    onToggleFeatured={() => toggleFeatured(lift)}
                    onEdit={() => { setEditLift(lift); setEditVisible(true); }}
                    onDelete={() => handleDelete(lift)}
                  />
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      <AddLiftModal
        visible={addVisible}
        trackedExercises={trackedNames}
        onAdd={handleAdd}
        onClose={() => setAddVisible(false)}
      />
      <EditPRModal
        visible={editVisible}
        lift={editLift}
        onSave={handleEditSave}
        onClose={() => { setEditVisible(false); setEditLift(null); }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: COLORS.background },
  loadWrap:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn:      { padding: 4, marginRight: SPACING.sm },
  headerTitle:  { flex: 1, fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  addBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: GOLD, borderRadius: RADIUS.lg, paddingVertical: 8, paddingHorizontal: 12 },
  addBtnText:   { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, color: COLORS.primary, letterSpacing: 0.5 },
  scroll:       { flex: 1 },
  scrollContent:{ paddingBottom: 48 },
  section:      { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl },
  sectionHeader:{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  sectionTitle: { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.5 },
  featuredRow:  { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  featuredHint: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, textAlign: 'center', marginTop: 2, marginBottom: SPACING.sm },
  liftList:     { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', marginTop: SPACING.sm },
  empty:        { alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xl * 2, paddingHorizontal: SPACING.xl },
  emptyTitle:   { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.secondary },
  emptyText:    { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, textAlign: 'center', lineHeight: 20 },
});
