/**
 * tracker-session.tsx — Tracker Mode Phase 1
 * Manual "New session" creation screen.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform,
  Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONTS, RADIUS } from '../src/constants/theme';
import { logApi } from '../src/utils/api';
import { getLocalDateString } from '../src/utils/dateHelpers';
import AddExerciseSheet, {
  PrescriptionType, AddedExercise, PRESCRIPTION_TYPES,
} from '../src/components/AddExerciseSheet';

// ── Constants ─────────────────────────────────────────────────────────────────
const HEADER_HEIGHT = 56;
const GOLD = COLORS.accent;
const GOLD_BG = `${GOLD}1A`;
const SIDE_OPTIONS = [
  { key: 'L', label: 'L' },
  { key: 'B', label: 'B' },
  { key: 'R', label: 'R' },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface SessionSet {
  id: string;
  // weighted / height / emom / amrap / for_time
  weight: string;
  reps: string;
  rpe: string;
  // timed
  duration: string;
  durationUnit: 'sec' | 'min';
  // distance
  distance: string;
  distanceUnit: 'ft' | 'm' | 'yd';
  load: string;           // load (lbs) for distance
  // height
  heightVal: string;
  heightUnit: 'in' | 'cm';
  // calories
  calories: string;
  elapsedTime: string;
  // per-side
  side: string;           // 'L' | 'B' | 'R' | ''
}

interface SessionExercise {
  id: string;
  name: string;
  category: string;
  prescriptionType: PrescriptionType;
  modifiers: string[];
  sets: SessionSet[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatSessionLabel(date: Date = new Date()): string {
  const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${DAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function parseLabelToISODate(label: string): string {
  const MONTHS: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4,  Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const parts = label.trim().split(/\s+/);
  if (parts.length === 3) {
    const monthIdx = MONTHS[parts[1]];
    const dayNum   = parseInt(parts[2], 10);
    if (monthIdx !== undefined && !isNaN(dayNum)) {
      return getLocalDateString(new Date(new Date().getFullYear(), monthIdx, dayNum));
    }
  }
  return getLocalDateString();
}

let _setCounter = 0;
function makeDefaultSet(): SessionSet {
  _setCounter++;
  return {
    id: `s-${Date.now()}-${_setCounter}`,
    weight: '', reps: '', rpe: '',
    duration: '', durationUnit: 'sec',
    distance: '', distanceUnit: 'ft', load: '',
    heightVal: '', heightUnit: 'in',
    calories: '', elapsedTime: '', side: '',
  };
}

function hasAnyValue(set: SessionSet, type: PrescriptionType): boolean {
  switch (type) {
    case 'weighted': case 'emom': case 'amrap': case 'for_time':
      return !!(set.weight || set.reps);
    case 'timed':     return !!set.duration;
    case 'distance':  return !!set.distance;
    case 'height':    return !!(set.heightVal || set.reps);
    case 'calories':  return !!set.calories;
    default:          return !!(set.weight || set.reps);
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Tiny numeric input cell */
function FieldInput({
  value, onChange, placeholder = '—', decimal = true, flex = 1,
}: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; decimal?: boolean; flex?: number;
}) {
  return (
    <TextInput
      style={[sc.setInput, { flex }]}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={COLORS.text.muted}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      returnKeyType="done"
      blurOnSubmit={false}
    />
  );
}

/** Tiny toggle pill group (e.g., sec | min) */
function UnitPills({
  options, value, onChange,
}: {
  options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <View style={sc.pillGroup}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt}
          style={[sc.unitPill, value === opt && sc.unitPillActive]}
          onPress={() => onChange(opt)}
        >
          <Text style={[sc.unitPillText, value === opt && sc.unitPillTextActive]}>
            {opt}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** Column header row */
function ColHeader({ labels }: { labels: string[] }) {
  return (
    <View style={sc.colHeaderRow}>
      <Text style={[sc.colHdr, { width: 24 }]}>#</Text>
      {labels.map((l, i) => (
        <Text key={i} style={[sc.colHdr, { flex: 1 }]}>{l}</Text>
      ))}
      <View style={{ width: 28 }} />
    </View>
  );
}

/** One set row — fields depend on prescriptionType */
function SetRow({
  setNum, set, prescriptionType, modifiers,
  onChange, onRemove, isRemovable,
}: {
  setNum: number;
  set: SessionSet;
  prescriptionType: PrescriptionType;
  modifiers: string[];
  onChange: (field: string, value: string) => void;
  onRemove: () => void;
  isRemovable: boolean;
}) {
  const showSide = modifiers.includes('Per side');

  const trashBtn = isRemovable ? (
    <TouchableOpacity onPress={onRemove} style={sc.trashBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <MaterialCommunityIcons name="trash-can-outline" size={15} color={COLORS.text.muted} />
    </TouchableOpacity>
  ) : (
    <View style={{ width: 28 }} />
  );

  const numCell = <Text style={sc.setNumText}>{setNum}</Text>;

  if (
    prescriptionType === 'weighted' || prescriptionType === 'emom' ||
    prescriptionType === 'amrap'    || prescriptionType === 'for_time'
  ) {
    return (
      <View style={sc.setRow}>
        {numCell}
        <FieldInput value={set.weight} onChange={v => onChange('weight', v)} placeholder="0" />
        <FieldInput value={set.reps}   onChange={v => onChange('reps', v)}   placeholder="0" decimal={false} />
        <FieldInput value={set.rpe}    onChange={v => onChange('rpe', v)}    placeholder="—" />
        {trashBtn}
      </View>
    );
  }

  if (prescriptionType === 'timed') {
    return (
      <View style={sc.setRow}>
        {numCell}
        <View style={{ flex: 2 }}>
          <FieldInput value={set.duration} onChange={v => onChange('duration', v)} placeholder="0" />
        </View>
        <UnitPills
          options={['sec', 'min']}
          value={set.durationUnit}
          onChange={v => onChange('durationUnit', v)}
        />
        {showSide && (
          <UnitPills
            options={['L', 'B', 'R']}
            value={set.side}
            onChange={v => onChange('side', set.side === v ? '' : v)}
          />
        )}
        {trashBtn}
      </View>
    );
  }

  if (prescriptionType === 'distance') {
    return (
      <View style={sc.setRow}>
        {numCell}
        <View style={{ flex: 2 }}>
          <FieldInput value={set.distance} onChange={v => onChange('distance', v)} placeholder="0" />
        </View>
        <UnitPills
          options={['ft', 'm', 'yd']}
          value={set.distanceUnit}
          onChange={v => onChange('distanceUnit', v)}
        />
        <FieldInput value={set.load} onChange={v => onChange('load', v)} placeholder="0" flex={1} />
        {showSide && (
          <UnitPills
            options={['L', 'B', 'R']}
            value={set.side}
            onChange={v => onChange('side', set.side === v ? '' : v)}
          />
        )}
        {trashBtn}
      </View>
    );
  }

  if (prescriptionType === 'height') {
    return (
      <View style={sc.setRow}>
        {numCell}
        <View style={{ flex: 2 }}>
          <FieldInput value={set.heightVal} onChange={v => onChange('heightVal', v)} placeholder="0" />
        </View>
        <UnitPills
          options={['in', 'cm']}
          value={set.heightUnit}
          onChange={v => onChange('heightUnit', v)}
        />
        <FieldInput value={set.reps} onChange={v => onChange('reps', v)} placeholder="0" decimal={false} flex={1} />
        <FieldInput value={set.rpe}  onChange={v => onChange('rpe', v)}  placeholder="—" flex={1} />
        {trashBtn}
      </View>
    );
  }

  if (prescriptionType === 'calories') {
    return (
      <View style={sc.setRow}>
        {numCell}
        <FieldInput value={set.calories}    onChange={v => onChange('calories', v)}    placeholder="0" decimal={false} />
        <FieldInput value={set.elapsedTime} onChange={v => onChange('elapsedTime', v)} placeholder="0:00" />
        {trashBtn}
      </View>
    );
  }

  return null;
}

/** Column headers for each prescription type */
function ExerciseColHeaders({
  prescriptionType, modifiers,
}: { prescriptionType: PrescriptionType; modifiers: string[] }) {
  const showSide = modifiers.includes('Per side');
  switch (prescriptionType) {
    case 'weighted': case 'emom': case 'amrap': case 'for_time':
      return <ColHeader labels={['LBS', 'REPS', 'RPE']} />;
    case 'timed':
      return <ColHeader labels={showSide ? ['DURATION', 'UNIT', 'SIDE'] : ['DURATION', 'UNIT']} />;
    case 'distance':
      return <ColHeader labels={showSide ? ['DIST', 'UNIT', 'LOAD', 'SIDE'] : ['DIST', 'UNIT', 'LOAD']} />;
    case 'height':
      return <ColHeader labels={['HEIGHT', 'UNIT', 'REPS', 'RPE']} />;
    case 'calories':
      return <ColHeader labels={['CALS', 'ELAPSED']} />;
    default:
      return <ColHeader labels={['LBS', 'REPS', 'RPE']} />;
  }
}

/** Full exercise card */
function ExerciseCard({
  exercise, onUpdateSet, onAddSet, onRemoveSet, onRemoveExercise,
}: {
  exercise: SessionExercise;
  onUpdateSet: (exId: string, setId: string, field: string, value: string) => void;
  onAddSet: (exId: string) => void;
  onRemoveSet: (exId: string, setId: string) => void;
  onRemoveExercise: (exId: string) => void;
}) {
  const typeInfo = PRESCRIPTION_TYPES.find(p => p.type === exercise.prescriptionType);
  const addLabel = exercise.prescriptionType === 'distance' ? '+ Add trip' : '+ Add set';

  return (
    <View style={sc.card}>
      {/* Card header */}
      <View style={sc.cardHeader}>
        <MaterialCommunityIcons
          name={typeInfo?.icon as any} size={14} color={GOLD}
          style={{ marginRight: SPACING.xs }}
        />
        <Text style={sc.cardTypeLabel}>{typeInfo?.label}</Text>
        <Text style={sc.cardName} numberOfLines={1}>{exercise.name}</Text>
        {exercise.modifiers.length > 0 && (
          <Text style={sc.cardMods}> · {exercise.modifiers.join(', ')}</Text>
        )}
        <TouchableOpacity
          onPress={() => onRemoveExercise(exercise.id)}
          style={sc.cardRemoveBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="close" size={16} color={COLORS.text.muted} />
        </TouchableOpacity>
      </View>

      {/* Column headers */}
      <ExerciseColHeaders
        prescriptionType={exercise.prescriptionType}
        modifiers={exercise.modifiers}
      />

      {/* Sets */}
      {exercise.sets.map((set, idx) => (
        <SetRow
          key={set.id}
          setNum={idx + 1}
          set={set}
          prescriptionType={exercise.prescriptionType}
          modifiers={exercise.modifiers}
          onChange={(field, value) => onUpdateSet(exercise.id, set.id, field, value)}
          onRemove={() => onRemoveSet(exercise.id, set.id)}
          isRemovable={exercise.sets.length > 1}
        />
      ))}

      {/* Add set */}
      <TouchableOpacity onPress={() => onAddSet(exercise.id)} style={sc.addSetBtn}>
        <MaterialCommunityIcons name="plus" size={13} color={GOLD} />
        <Text style={sc.addSetText}>{addLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function TrackerSessionScreen() {
  const router  = useRouter();
  const params  = useLocalSearchParams<{ date?: string }>();
  const insets  = useSafeAreaInsets();

  // Pre-fill session label from optional route param (e.g., tapping empty day on Schedule)
  const [sessionLabel, setSessionLabel] = useState(() => {
    if (params.date) {
      try {
        const parts = (params.date as string).split('-').map(Number);
        if (parts.length === 3) {
          const d = new Date(parts[0], parts[1] - 1, parts[2]);
          return formatSessionLabel(d);
        }
      } catch { /* ignore */ }
    }
    return formatSessionLabel();
  });
  const [isEditingLabel,  setIsEditingLabel]  = useState(false);
  const [sessionNotes,    setSessionNotes]    = useState('');
  const [exercises,       setExercises]       = useState<SessionExercise[]>([]);
  const [showAddSheet,    setShowAddSheet]    = useState(false);
  const [saving,          setSaving]          = useState(false);

  const labelInputRef = useRef<TextInput>(null);

  // ── Exercise management ────────────────────────────────────────────────────
  const handleAddExercise = useCallback((added: AddedExercise) => {
    let counter = 0;
    counter++;
    const newEx: SessionExercise = {
      id: `ex-${Date.now()}-${counter}`,
      name: added.name,
      category: added.category,
      prescriptionType: added.prescriptionType,
      modifiers: added.modifiers,
      sets: [makeDefaultSet()],
    };
    setExercises(prev => [...prev, newEx]);
  }, []);

  const removeExercise = useCallback((exId: string) =>
    setExercises(prev => prev.filter(e => e.id !== exId)), []);

  const addSet = useCallback((exId: string) =>
    setExercises(prev => prev.map(e =>
      e.id === exId ? { ...e, sets: [...e.sets, makeDefaultSet()] } : e
    )), []);

  const removeSet = useCallback((exId: string, setId: string) =>
    setExercises(prev => prev.map(e =>
      e.id === exId
        ? { ...e, sets: e.sets.filter(s => s.id !== setId) }
        : e
    )), []);

  const updateSet = useCallback((exId: string, setId: string, field: string, value: string) =>
    setExercises(prev => prev.map(e =>
      e.id === exId
        ? { ...e, sets: e.sets.map(s => s.id === setId ? { ...s, [field]: value } : s) }
        : e
    )), []);

  // ── Label edit ─────────────────────────────────────────────────────────────
  const handleLabelBlur = () => {
    if (!sessionLabel.trim()) setSessionLabel(formatSessionLabel());
    setIsEditingLabel(false);
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (exercises.length === 0) {
      Alert.alert('Nothing to save', 'Add at least one exercise before saving.');
      return;
    }
    const hasContent = exercises.some(ex =>
      ex.sets.some(s => hasAnyValue(s, ex.prescriptionType))
    );
    if (!hasContent) {
      Alert.alert('Empty sets', 'Fill in at least one set with data before saving.');
      return;
    }
    setSaving(true);
    try {
      const date    = parseLabelToISODate(sessionLabel);
      const entries: any[] = [];

      for (const ex of exercises) {
        ex.sets.forEach((set, idx) => {
          const entry: any = {
            date,
            week: 0,                  // sentinel: 0 = tracker / free mode
            day: 'Free Session',
            sessionType: sessionLabel,
            exercise: ex.name,
            sets: 1,
            weight: 0, reps: 0, rpe: 0,
            pain: 0,
            completed: 'yes',
            setIndex: idx,
            notes: sessionNotes.trim() || null,
            prescriptionType: ex.prescriptionType,
          };

          switch (ex.prescriptionType) {
            case 'weighted': case 'emom': case 'amrap': case 'for_time':
              entry.weight = parseFloat(set.weight) || 0;
              entry.reps   = parseInt(set.reps, 10)  || 0;
              entry.rpe    = parseFloat(set.rpe)     || 0;
              break;
            case 'timed':
              entry.duration = parseFloat(set.duration) || 0;
              if (set.durationUnit === 'min') entry.duration *= 60;
              entry.unit = set.durationUnit;
              if (set.side) entry.side = set.side;
              break;
            case 'distance':
              entry.weight   = parseFloat(set.load)     || 0;
              entry.distance = parseFloat(set.distance) || 0;
              entry.unit     = set.distanceUnit;
              if (set.side) entry.side = set.side;
              break;
            case 'height':
              entry.weight = parseFloat(set.heightVal) || 0;
              entry.reps   = parseInt(set.reps, 10)    || 0;
              entry.rpe    = parseFloat(set.rpe)       || 0;
              entry.unit   = set.heightUnit;
              break;
            case 'calories':
              entry.reps = parseInt(set.calories, 10) || 0;
              if (set.elapsedTime) entry.unit = `elapsed:${set.elapsedTime}`;
              break;
          }
          entries.push(entry);
        });
      }

      await logApi.createBulk(entries);
      router.back();
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={sc.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + HEADER_HEIGHT : 0}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={sc.header}>
          <TouchableOpacity onPress={() => router.back()} style={sc.headerBack}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.text.primary} />
          </TouchableOpacity>
          <Text style={sc.headerTitle}>New session</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* ── Scrollable body ─────────────────────────────────────────────── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[sc.scrollBody, { paddingBottom: 100 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Session label */}
          <View style={sc.labelRow}>
            {isEditingLabel ? (
              <TextInput
                ref={labelInputRef}
                style={sc.labelInput}
                value={sessionLabel}
                onChangeText={setSessionLabel}
                onBlur={handleLabelBlur}
                returnKeyType="done"
                onSubmitEditing={handleLabelBlur}
                autoFocus
              />
            ) : (
              <Text style={sc.labelText}>{sessionLabel}</Text>
            )}
            <TouchableOpacity
              onPress={() => {
                setIsEditingLabel(true);
                setTimeout(() => labelInputRef.current?.focus(), 50);
              }}
              style={sc.labelEditBtn}
            >
              <MaterialCommunityIcons
                name={isEditingLabel ? 'check' : 'pencil-outline'}
                size={16}
                color={COLORS.text.muted}
              />
            </TouchableOpacity>
          </View>

          {/* Session notes */}
          <TextInput
            style={sc.notesInput}
            value={sessionNotes}
            onChangeText={setSessionNotes}
            placeholder="Add session notes..."
            placeholderTextColor={COLORS.text.muted}
            multiline
            numberOfLines={2}
            textAlignVertical="top"
          />

          {/* Exercises section */}
          <Text style={sc.exercisesSectionLabel}>EXERCISES</Text>

          {exercises.length === 0 && (
            <View style={sc.emptyExercises}>
              <MaterialCommunityIcons name="dumbbell" size={32} color={COLORS.text.muted} />
              <Text style={sc.emptyText}>No exercises yet</Text>
              <Text style={sc.emptySubText}>Tap "+ Add exercise" below to get started</Text>
            </View>
          )}

          {exercises.map(ex => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              onUpdateSet={updateSet}
              onAddSet={addSet}
              onRemoveSet={removeSet}
              onRemoveExercise={removeExercise}
            />
          ))}

          {/* Add exercise button */}
          <TouchableOpacity
            style={sc.addExerciseBtn}
            onPress={() => setShowAddSheet(true)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="plus" size={18} color={GOLD} />
            <Text style={sc.addExerciseText}>Add exercise</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* ── Sticky Save Footer ──────────────────────────────────────────── */}
        <View style={[sc.footer, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
          <TouchableOpacity
            style={[sc.saveBtn, saving && sc.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color={COLORS.primary} />
              : <>
                  <MaterialCommunityIcons name="check-bold" size={18} color={COLORS.primary} />
                  <Text style={sc.saveBtnText}>Save session</Text>
                </>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── Add Exercise Sheet ──────────────────────────────────────────── */}
      <AddExerciseSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        onAdd={handleAddExercise}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const sc = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    height: HEADER_HEIGHT, paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  headerBack: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1, textAlign: 'center',
    color: COLORS.text.primary,
    fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.semibold,
  },

  // Body
  scrollBody: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },

  // Label row
  labelRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  labelText: {
    flex: 1,
    color: COLORS.text.primary, fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
  },
  labelInput: {
    flex: 1,
    color: COLORS.text.primary, fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    borderBottomWidth: 1, borderBottomColor: GOLD,
    paddingVertical: 4,
  },
  labelEditBtn: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
    marginLeft: SPACING.sm,
  },

  // Notes
  notesInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md,
    color: COLORS.text.primary, fontSize: FONTS.sizes.sm,
    minHeight: 52, textAlignVertical: 'top',
    marginBottom: SPACING.lg,
  },

  // Exercises section
  exercisesSectionLabel: {
    fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold,
    color: GOLD, letterSpacing: 1.2,
    marginBottom: SPACING.md,
  },
  emptyExercises: {
    alignItems: 'center', paddingVertical: SPACING.xxl,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg, borderWidth: 1,
    borderStyle: 'dashed', borderColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  emptyText: {
    color: COLORS.text.secondary, fontSize: FONTS.sizes.base,
    fontWeight: FONTS.weights.medium, marginTop: SPACING.sm,
  },
  emptySubText: {
    color: COLORS.text.muted, fontSize: FONTS.sizes.sm, marginTop: SPACING.xs,
  },

  // Exercise card
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border,
    marginBottom: SPACING.md, overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surfaceHighlight,
  },
  cardTypeLabel: {
    fontSize: 10, fontWeight: FONTS.weights.bold,
    color: COLORS.text.muted, letterSpacing: 0.8,
    marginRight: SPACING.sm,
  },
  cardName: {
    flex: 1, color: COLORS.text.primary,
    fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold,
  },
  cardMods: { color: COLORS.text.muted, fontSize: FONTS.sizes.xs },
  cardRemoveBtn: {
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
  },

  // Column headers
  colHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  colHdr: {
    fontSize: 9, fontWeight: FONTS.weights.bold,
    color: COLORS.text.muted, letterSpacing: 0.6,
    textAlign: 'center',
  },

  // Set rows
  setRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    gap: SPACING.xs,
  },
  setNumText: {
    width: 24, textAlign: 'center',
    color: COLORS.text.muted, fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.medium,
  },
  setInput: {
    backgroundColor: COLORS.surfaceHighlight,
    borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.xs, paddingVertical: SPACING.sm,
    color: COLORS.text.primary, fontSize: FONTS.sizes.sm,
    textAlign: 'center', minHeight: 36,
  },
  trashBtn: {
    width: 28, height: 36, alignItems: 'center', justifyContent: 'center',
  },

  // Unit pills
  pillGroup: { flexDirection: 'row', gap: 3 },
  unitPill: {
    paddingHorizontal: 6, paddingVertical: 4,
    borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceHighlight,
    minHeight: 36, alignItems: 'center', justifyContent: 'center',
  },
  unitPillActive: { borderColor: GOLD, backgroundColor: GOLD_BG },
  unitPillText: { color: COLORS.text.muted, fontSize: 10, fontWeight: FONTS.weights.bold },
  unitPillTextActive: { color: GOLD },

  // Add set
  addSetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
  },
  addSetText: { color: GOLD, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.medium },

  // Add exercise button
  addExerciseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm,
    borderRadius: RADIUS.lg, borderWidth: 1.5,
    borderStyle: 'dashed', borderColor: GOLD,
    paddingVertical: SPACING.lg,
    marginTop: SPACING.sm,
  },
  addExerciseText: {
    color: GOLD, fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold,
  },

  // Sticky footer
  footer: {
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md,
    backgroundColor: COLORS.background,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, backgroundColor: GOLD,
    borderRadius: RADIUS.lg, paddingVertical: SPACING.md + 2,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: {
    color: COLORS.primary, fontSize: FONTS.sizes.base,
    fontWeight: FONTS.weights.bold,
  },
});
