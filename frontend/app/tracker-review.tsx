/**
 * tracker-review.tsx — Phase 2 + Edit Mode
 * Review, edit, and save an AI-parsed or existing workout session.
 *
 * Entry points:
 *   source='tracker_upload'  → came from Today tab image upload
 *   source='plan_preview'    → came from build-plan.tsx single-session detection
 *   editingLogIds present    → edit mode: re-opens a saved tracker session
 *
 * Route params:
 *   source:               'tracker_upload' | 'plan_preview'
 *   imageId:              string (Supabase UUID, tracker_upload only)
 *   userHasActiveProgram: 'true' | 'false'
 *   editingLogIds:        JSON-stringified string[] of existing log entry IDs
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform,
  Alert, ActivityIndicator, Modal, Pressable,
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
import EditExerciseSheet from '../src/components/EditExerciseSheet';
import { getParsedSession, clearParsedSession } from '../src/utils/parsedSessionStore';
import { getProfile } from '../src/utils/storage';

// ── Constants ─────────────────────────────────────────────────────────────────
const HEADER_HEIGHT = 56;
const GOLD = COLORS.accent;
const GOLD_BG = `${GOLD}1A`;
const GOLD_SOFT_BG = 'rgba(201,168,76,0.08)';
const GOLD_SOFT_BORDER = 'rgba(201,168,76,0.3)';

// ── Types (mirrored from tracker-session.tsx to avoid coupling) ──────────────
interface SessionSet {
  id: string;
  weight: string;
  reps: string;
  rpe: string;
  duration: string;
  durationUnit: 'sec' | 'min';
  distance: string;
  distanceUnit: 'ft' | 'm' | 'yd';
  load: string;
  heightVal: string;
  heightUnit: 'in' | 'cm';
  calories: string;
  elapsedTime: string;
  side: string;
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

function makeSetFromParsed(parsed: any): SessionSet {
  _setCounter++;
  const unit = parsed.unit || '';
  return {
    id: `s-${Date.now()}-${_setCounter}`,
    weight:       parsed.weight   != null ? String(parsed.weight)   : '',
    reps:         parsed.reps     != null ? String(parsed.reps)     : '',
    rpe:          parsed.rpe      != null ? String(parsed.rpe)      : '',
    duration:     parsed.duration != null ? String(parsed.duration) : '',
    durationUnit: unit === 'min' ? 'min' : 'sec',
    distance:     parsed.distance != null ? String(parsed.distance) : '',
    distanceUnit: (['ft', 'm', 'yd'] as const).includes(unit as any) ? (unit as 'ft' | 'm' | 'yd') : 'ft',
    load:         parsed.load     != null ? String(parsed.load)     : '',
    heightVal:    parsed.heightVal != null ? String(parsed.heightVal) : '',
    heightUnit:   unit === 'cm' ? 'cm' : 'in',
    calories:     parsed.calories != null ? String(parsed.calories) : '',
    elapsedTime:  parsed.elapsedTime != null ? String(parsed.elapsedTime) : '',
    side: '',
  };
}

let _exCounter = 0;
function convertParsedExercise(parsed: any): SessionExercise {
  _exCounter++;
  const pt = (parsed.prescriptionType || 'weighted') as PrescriptionType;
  const sets = Array.isArray(parsed.sets) && parsed.sets.length > 0
    ? parsed.sets.map((s: any) => makeSetFromParsed(s))
    : [makeDefaultSet()];
  return {
    id: `ex-${Date.now()}-${_exCounter}`,
    name: (parsed.name || 'Exercise').trim(),
    category: 'main',
    prescriptionType: pt,
    modifiers: [],
    sets,
  };
}

// ── Type-group helper: weighted/emom/amrap/for_time all share the same field set ──
function getTypeGroup(pt: PrescriptionType): string {
  if (['weighted', 'emom', 'amrap', 'for_time'].includes(pt)) return 'weighted';
  return pt;
}

// ── Applies field-clearing rules when prescription type changes between groups ──
function applyTypeTransition(
  set: SessionSet,
  from: PrescriptionType,
  to: PrescriptionType,
): SessionSet {
  const fromGroup = getTypeGroup(from);
  const toGroup   = getTypeGroup(to);
  if (fromGroup === toGroup) return set; // same group — fields are compatible

  _setCounter++;
  const fresh = makeDefaultSet();
  fresh.id = set.id; // preserve stable ID

  // Special case: weight↔height fields map to each other; reps/rpe carry over
  if (fromGroup === 'weighted' && toGroup === 'height') {
    fresh.heightVal  = set.weight;
    fresh.heightUnit = 'in';
    fresh.reps       = set.reps;
    fresh.rpe        = set.rpe;
  } else if (fromGroup === 'height' && toGroup === 'weighted') {
    fresh.weight = set.heightVal;
    fresh.reps   = set.reps;
    fresh.rpe    = set.rpe;
  }
  // All other cross-group transitions: return freshly cleared set
  return fresh;
}

function toISODate(date: Date): string {
  return getLocalDateString(date);
}

function isToday(date: Date): boolean {
  return toISODate(date) === toISODate(new Date());
}

function isYesterday(date: Date): boolean {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return toISODate(date) === toISODate(y);
}

function formatDateLabel(date: Date): string {
  const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${DAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function formatDatePillLabel(date: Date): string {
  if (isToday(date))     return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return formatDateLabel(date);
}

// Human-readable date label for CTA strings (e.g. "today" or "Sun May 12")
function ctaDateLabel(date: Date): string {
  if (isToday(date)) return 'today';
  return formatDateLabel(date);
}

function hasAnyValue(set: SessionSet, type: PrescriptionType): boolean {
  switch (type) {
    case 'weighted': case 'emom': case 'amrap': case 'for_time':
      return !!(set.weight || set.reps);
    case 'timed':    return !!set.duration;
    case 'distance': return !!set.distance;
    case 'height':   return !!(set.heightVal || set.reps);
    case 'calories': return !!set.calories;
    default:         return !!(set.weight || set.reps);
  }
}

function buildEntries(
  exercises: SessionExercise[],
  date: string,
  week: number,
  sessionTitle: string | null,
  imageId: string | undefined,
  sessionId: string | null,
): any[] {
  const entries: any[] = [];
  for (let exIdx = 0; exIdx < exercises.length; exIdx++) {
    const ex = exercises[exIdx];
    ex.sets.forEach((set, idx) => {
      const entry: any = {
        date,
        week,
        day: week === 0 ? 'Free Session' : 'Program Session',
        sessionType: sessionTitle || 'Workout',
        exercise: ex.name,
        sets: 1,
        weight: 0, reps: 0, rpe: 0,
        pain: 0,
        completed: 'no',    // tracker: scanned/parsed exercises start as prescriptions (not done)
        setIndex: idx,
        prescriptionType: ex.prescriptionType,
        // exerciseOrder: sequential index so scanned sessions have a stable initial order
        ...(week === 0 && sessionId ? { exerciseOrder: exIdx } : {}),
        ...(imageId      ? { imageId }      : {}),
        ...(sessionTitle ? { sessionTitle } : {}),
        ...(sessionId    ? { sessionId }    : {}),   // stable stamp — all entries from this scan share one id
      };

      switch (ex.prescriptionType) {
        case 'weighted': case 'emom': case 'amrap': case 'for_time':
          entry.weight = parseFloat(set.weight) || 0;
          entry.reps   = parseInt(set.reps, 10) || 0;
          entry.rpe    = parseFloat(set.rpe)    || 0;
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
  return entries;
}

// ── Edit-mode: reverse-convert saved log entries → SessionExercise[] ─────────
function logsToExercises(logs: any[]): SessionExercise[] {
  // Preserve original order (setIndex within each exercise group)
  const sorted = [...logs].sort((a, b) => (a.setIndex ?? 0) - (b.setIndex ?? 0));
  const orderKeys: string[] = [];
  const groups = new Map<string, SessionExercise>();

  for (const log of sorted) {
    const pt  = (log.prescriptionType || 'weighted') as PrescriptionType;
    const key = `${log.exercise}||${pt}`;

    if (!groups.has(key)) {
      _exCounter++;
      orderKeys.push(key);
      groups.set(key, {
        id: `ex-edit-${Date.now()}-${_exCounter}`,
        name: log.exercise,
        category: 'main',
        prescriptionType: pt,
        modifiers: [],
        sets: [],
      });
    }

    const ex = groups.get(key)!;
    _setCounter++;
    const set = makeDefaultSet();

    switch (pt) {
      case 'weighted': case 'emom': case 'amrap': case 'for_time':
        set.weight = log.weight != null && log.weight !== 0 ? String(log.weight) : '';
        set.reps   = log.reps   != null && log.reps   !== 0 ? String(log.reps)   : '';
        set.rpe    = log.rpe    != null && log.rpe    !== 0 ? String(log.rpe)    : '';
        break;
      case 'timed':
        if (log.unit === 'min' && log.duration != null) {
          // Convention: stored as seconds with display unit 'min'.
          // Convert back to minutes for the edit form.
          set.duration     = String(Math.round(log.duration / 60));
          set.durationUnit = 'min';
        } else {
          // Seconds entry — no conversion needed.
          set.duration     = log.duration != null ? String(log.duration) : '';
          set.durationUnit = 'sec';
        }
        set.side = log.side || '';
        break;
      case 'distance':
        set.distance     = log.distance != null ? String(log.distance) : '';
        set.distanceUnit = (['ft','m','yd'] as const).includes(log.unit) ? log.unit : 'ft';
        set.load         = log.weight != null && log.weight !== 0 ? String(log.weight) : '';
        set.side         = log.side || '';
        break;
      case 'height':
        set.heightVal  = log.weight != null && log.weight !== 0 ? String(log.weight) : '';
        set.heightUnit = (log.unit === 'cm' ? 'cm' : 'in') as 'in' | 'cm';
        set.reps       = log.reps != null && log.reps !== 0 ? String(log.reps) : '';
        set.rpe        = log.rpe  != null && log.rpe  !== 0 ? String(log.rpe)  : '';
        break;
      case 'calories':
        set.calories    = log.reps != null && log.reps !== 0 ? String(log.reps) : '';
        if (log.unit?.startsWith('elapsed:')) {
          set.elapsedTime = log.unit.split(':')[1] || '';
        }
        break;
    }
    ex.sets.push(set);
  }

  return orderKeys.map(k => groups.get(k)!);
}

// ── Sub-components (mirrors tracker-session.tsx) ──────────────────────────────

function FieldInput({
  value, onChange, placeholder = '—', decimal = true, flex = 1,
}: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; decimal?: boolean; flex?: number;
}) {
  return (
    <TextInput
      style={[rc.setInput, { flex }]}
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

function UnitPills({
  options, value, onChange,
}: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={rc.pillGroup}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt}
          style={[rc.unitPill, value === opt && rc.unitPillActive]}
          onPress={() => onChange(opt)}
        >
          <Text style={[rc.unitPillText, value === opt && rc.unitPillTextActive]}>{opt}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ColHeader({ labels }: { labels: string[] }) {
  return (
    <View style={rc.colHeaderRow}>
      <Text style={[rc.colHdr, { width: 24 }]}>#</Text>
      {labels.map((l, i) => (
        <Text key={i} style={[rc.colHdr, { flex: 1 }]}>{l}</Text>
      ))}
      <View style={{ width: 28 }} />
    </View>
  );
}

function SetRow({
  setNum, set, prescriptionType, modifiers, onChange, onRemove, isRemovable,
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
    <TouchableOpacity onPress={onRemove} style={rc.trashBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <MaterialCommunityIcons name="trash-can-outline" size={15} color={COLORS.text.muted} />
    </TouchableOpacity>
  ) : <View style={{ width: 28 }} />;

  const numCell = <Text style={rc.setNumText}>{setNum}</Text>;

  if (['weighted','emom','amrap','for_time'].includes(prescriptionType)) {
    return (
      <View style={rc.setRow}>
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
      <View style={rc.setRow}>
        {numCell}
        <View style={{ flex: 2 }}>
          <FieldInput value={set.duration} onChange={v => onChange('duration', v)} placeholder="0" />
        </View>
        <UnitPills options={['sec','min']} value={set.durationUnit} onChange={v => onChange('durationUnit', v)} />
        {showSide && <UnitPills options={['L','B','R']} value={set.side} onChange={v => onChange('side', set.side === v ? '' : v)} />}
        {trashBtn}
      </View>
    );
  }
  if (prescriptionType === 'distance') {
    return (
      <View style={rc.setRow}>
        {numCell}
        <View style={{ flex: 2 }}>
          <FieldInput value={set.distance} onChange={v => onChange('distance', v)} placeholder="0" />
        </View>
        <UnitPills options={['ft','m','yd']} value={set.distanceUnit} onChange={v => onChange('distanceUnit', v)} />
        <FieldInput value={set.load} onChange={v => onChange('load', v)} placeholder="0" flex={1} />
        {showSide && <UnitPills options={['L','B','R']} value={set.side} onChange={v => onChange('side', set.side === v ? '' : v)} />}
        {trashBtn}
      </View>
    );
  }
  if (prescriptionType === 'height') {
    return (
      <View style={rc.setRow}>
        {numCell}
        <View style={{ flex: 2 }}>
          <FieldInput value={set.heightVal} onChange={v => onChange('heightVal', v)} placeholder="0" />
        </View>
        <UnitPills options={['in','cm']} value={set.heightUnit} onChange={v => onChange('heightUnit', v)} />
        <FieldInput value={set.reps} onChange={v => onChange('reps', v)} placeholder="0" decimal={false} flex={1} />
        <FieldInput value={set.rpe}  onChange={v => onChange('rpe', v)}  placeholder="—" flex={1} />
        {trashBtn}
      </View>
    );
  }
  if (prescriptionType === 'calories') {
    return (
      <View style={rc.setRow}>
        {numCell}
        <FieldInput value={set.calories}    onChange={v => onChange('calories', v)}    placeholder="0" decimal={false} />
        <FieldInput value={set.elapsedTime} onChange={v => onChange('elapsedTime', v)} placeholder="0:00" />
        {trashBtn}
      </View>
    );
  }
  return null;
}

function ExerciseColHeaders({ prescriptionType, modifiers }: { prescriptionType: PrescriptionType; modifiers: string[] }) {
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

// ExerciseCard — kebab (⋮) replaces up/down reorder arrows; X stays as direct remove
function ExerciseCard({
  exercise, index, total,
  onUpdateSet, onAddSet, onRemoveSet, onRemoveExercise,
  onKebabPress,
}: {
  exercise: SessionExercise;
  index: number;
  total: number;
  onUpdateSet: (exId: string, setId: string, field: string, value: string) => void;
  onAddSet: (exId: string) => void;
  onRemoveSet: (exId: string, setId: string) => void;
  onRemoveExercise: (exId: string) => void;
  onKebabPress: (exId: string) => void;
}) {
  const typeInfo = PRESCRIPTION_TYPES.find(p => p.type === exercise.prescriptionType);
  const addLabel = exercise.prescriptionType === 'distance' ? 'Add trip' : 'Add set';

  return (
    <View style={rc.card}>
      {/* Card header */}
      <View style={rc.cardHeader}>
        <MaterialCommunityIcons
          name={typeInfo?.icon as any} size={14} color={GOLD}
          style={{ marginRight: SPACING.xs }}
        />
        <Text style={rc.cardTypeLabel}>{typeInfo?.label}</Text>
        <Text style={rc.cardName} numberOfLines={1}>{exercise.name}</Text>
        {exercise.modifiers.length > 0 && (
          <Text style={rc.cardMods}> · {exercise.modifiers.join(', ')}</Text>
        )}

        {/* Kebab — opens action sheet with move/swap/duplicate/rename/remove */}
        <TouchableOpacity
          onPress={() => onKebabPress(exercise.id)}
          style={rc.kebabBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="dots-vertical" size={18} color={GOLD} />
        </TouchableOpacity>

        {/* X — one-tap direct remove */}
        <TouchableOpacity
          onPress={() => onRemoveExercise(exercise.id)}
          style={rc.cardRemoveBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="close" size={16} color={COLORS.text.muted} />
        </TouchableOpacity>
      </View>

      {/* Column headers */}
      <ExerciseColHeaders prescriptionType={exercise.prescriptionType} modifiers={exercise.modifiers} />

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
      <TouchableOpacity onPress={() => onAddSet(exercise.id)} style={rc.addSetBtn}>
        <MaterialCommunityIcons name="plus" size={13} color={GOLD} />
        <Text style={rc.addSetText}>{addLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Exercise Action Sheet ─────────────────────────────────────────────────────
function ExerciseActionSheet({
  visible, exercise, index, total,
  onClose, onMoveUp, onMoveDown, onSwap, onDuplicate, onEdit, onRemove,
}: {
  visible: boolean;
  exercise: SessionExercise | null;
  index: number;
  total: number;
  onClose: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSwap: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  if (!exercise) return null;
  const canUp   = index > 0;
  const canDown = index < total - 1;

  type ActionRow = {
    icon: string; label: string; onPress: () => void;
    disabled?: boolean; danger?: boolean;
  };
  const rows: ActionRow[] = [
    { icon: 'chevron-up',        label: 'Move up',              onPress: onMoveUp,    disabled: !canUp },
    { icon: 'chevron-down',      label: 'Move down',            onPress: onMoveDown,  disabled: !canDown },
    { icon: 'swap-horizontal',   label: 'Swap exercise',        onPress: onSwap },
    { icon: 'content-copy',      label: 'Duplicate',            onPress: onDuplicate },
    { icon: 'pencil-outline',    label: 'Rename / Change type', onPress: onEdit },
    { icon: 'trash-can-outline', label: 'Remove exercise',      onPress: onRemove,    danger: true },
  ];

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={rc.asOverlay} onPress={onClose} />
      <View style={rc.asSheet}>
        <View style={rc.asHandle} />
        <Text style={rc.asTitle} numberOfLines={1}>{exercise.name}</Text>
        {rows.map((row, i) => (
          <TouchableOpacity
            key={i}
            style={[rc.asRow, row.disabled && rc.asRowDisabled]}
            onPress={() => { if (!row.disabled) row.onPress(); }}
            activeOpacity={row.disabled ? 1 : 0.65}
          >
            <MaterialCommunityIcons
              name={row.icon as any}
              size={20}
              color={
                row.danger   ? COLORS.status.error :
                row.disabled ? COLORS.border :
                COLORS.text.secondary
              }
              style={{ marginRight: SPACING.md }}
            />
            <Text style={[
              rc.asRowLabel,
              row.danger   && rc.asRowDanger,
              row.disabled && rc.asRowLabelMuted,
            ]}>
              {row.label}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={{ height: SPACING.xl }} />
      </View>
    </Modal>
  );
}

// ── Date Picker Modal ─────────────────────────────────────────────────────────
function DatePickerModal({
  visible,
  selectedDate,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedDate: Date;
  onSelect: (d: Date) => void;
  onClose: () => void;
}) {
  const selectedISO = toISODate(selectedDate);
  const options = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d;
  });

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableOpacity
        style={rc.dpOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={rc.dpSheet}>
          <Text style={rc.dpTitle}>SELECT DATE</Text>
          {options.map((d, i) => {
            const iso = toISODate(d);
            const active = iso === selectedISO;
            const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : formatDateLabel(d);
            return (
              <TouchableOpacity
                key={iso}
                style={[rc.dpOption, active && rc.dpOptionActive]}
                onPress={() => { onSelect(d); onClose(); }}
              >
                <Text style={[rc.dpOptionText, active && rc.dpOptionTextActive]}>{label}</Text>
                {active && (
                  <MaterialCommunityIcons name="check" size={16} color={GOLD} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function TrackerReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Route params
  const params = useLocalSearchParams<{
    source: string;
    imageId: string;
    userHasActiveProgram: string;
    editingLogIds: string;
  }>();
  const source               = (params.source || 'tracker_upload') as 'tracker_upload' | 'plan_preview';
  const imageId              = params.imageId || undefined;
  const userHasActiveProgram = params.userHasActiveProgram === 'true';

  // Edit mode: JSON-stringified array of existing log IDs
  const editingLogIds: string[] = (() => {
    try { return params.editingLogIds ? JSON.parse(params.editingLogIds) as string[] : []; }
    catch { return []; }
  })();
  const isEditMode = editingLogIds.length > 0;

  // Read parsed session from module store (new-parse path only)
  const parsed = isEditMode ? null : getParsedSession();

  // ── State ─────────────────────────────────────────────────────────────────
  const [exercises,      setExercises]      = useState<SessionExercise[]>(() =>
    isEditMode ? [] : (parsed?.exercises ?? []).map(convertParsedExercise)
  );
  const [sessionTitle,   setSessionTitle]   = useState<string>(
    parsed?.session_title || ''
  );
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [selectedDate,   setSelectedDate]   = useState<Date>(() => {
    if (parsed?.session_date) {
      const d = new Date(parsed.session_date + 'T12:00:00');
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAddSheet,   setShowAddSheet]   = useState(false);
  const [saving,         setSaving]         = useState(false);
  // Edit mode: true while fetching existing entries on first mount
  const [isLoadingEdit,  setIsLoadingEdit]  = useState(isEditMode);
  // Sheet states: which exercise has its action/edit/swap sheet open
  const [actionSheetExerciseId, setActionSheetExerciseId] = useState<string | null>(null);
  const [editSheetExerciseId,   setEditSheetExerciseId]   = useState<string | null>(null);
  const [swapSheetExerciseId,   setSwapSheetExerciseId]   = useState<string | null>(null);

  const confidence = parsed?.confidence || 'high';

  const titleInputRef = useRef<TextInput>(null);

  // ── Edit mode: load existing log entries on mount ──────────────────────────
  useEffect(() => {
    if (!isEditMode) return;
    let cancelled = false;

    (async () => {
      try {
        const fetchedEntries: any[] = await logApi.byIds(editingLogIds);
        if (cancelled) return;

        const exs = logsToExercises(fetchedEntries);
        setExercises(exs);

        // Pre-populate title + date from the first entry
        if (fetchedEntries.length > 0) {
          const first = fetchedEntries[0];
          if (first.sessionTitle) setSessionTitle(first.sessionTitle);
          if (first.date) {
            const d = new Date(first.date + 'T12:00:00');
            if (!isNaN(d.getTime())) setSelectedDate(d);
          }
        }
      } catch {
        if (!cancelled) Alert.alert('Error', 'Could not load session for editing.');
      } finally {
        if (!cancelled) setIsLoadingEdit(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Exercise management ────────────────────────────────────────────────────
  const handleAddExercise = useCallback((added: AddedExercise) => {
    _exCounter++;
    const newEx: SessionExercise = {
      id: `ex-${Date.now()}-${_exCounter}`,
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

  const moveUp = useCallback((exId: string) =>
    setExercises(prev => {
      const idx = prev.findIndex(e => e.id === exId);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    }), []);

  const moveDown = useCallback((exId: string) =>
    setExercises(prev => {
      const idx = prev.findIndex(e => e.id === exId);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    }), []);

  /** Duplicate: inserts a deep copy with fresh IDs right after the original. */
  const handleDuplicateExercise = useCallback((exId: string) => {
    setExercises(prev => {
      const idx = prev.findIndex(e => e.id === exId);
      if (idx < 0) return prev;
      const original = prev[idx];
      _exCounter++;
      const copy: SessionExercise = {
        ...original,
        id: `ex-dup-${Date.now()}-${_exCounter}`,
        sets: original.sets.map(s => {
          _setCounter++;
          return { ...s, id: `s-dup-${Date.now()}-${_setCounter}` };
        }),
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    setActionSheetExerciseId(null);
  }, []);

  /** Replace: swaps out an exercise from the AddExerciseSheet (swap mode). */
  const handleReplaceExercise = useCallback((replaceId: string, added: AddedExercise) => {
    setExercises(prev => prev.map(ex => {
      if (ex.id !== replaceId) return ex;
      const newSets = ex.prescriptionType === added.prescriptionType
        ? ex.sets
        : ex.sets.map(s => applyTypeTransition(s, ex.prescriptionType, added.prescriptionType));
      return {
        ...ex,
        name:             added.name,
        category:         added.category,
        prescriptionType: added.prescriptionType,
        modifiers:        added.modifiers,
        sets:             newSets,
      };
    }));
    setSwapSheetExerciseId(null);
  }, []);

  /** SaveEdit: applies name + type change from EditExerciseSheet, clearing incompatible fields. */
  const handleSaveEdit = useCallback((exId: string, newName: string, newType: PrescriptionType) => {
    setExercises(prev => prev.map(ex => {
      if (ex.id !== exId) return ex;
      const newSets = ex.prescriptionType === newType
        ? ex.sets
        : ex.sets.map(s => applyTypeTransition(s, ex.prescriptionType, newType));
      return { ...ex, name: newName, prescriptionType: newType, sets: newSets };
    }));
    setEditSheetExerciseId(null);
  }, []);

  // ── Save helpers ───────────────────────────────────────────────────────────
  const validateBeforeSave = (): boolean => {
    if (exercises.length === 0) {
      Alert.alert('Nothing to save', 'Add at least one exercise before saving.');
      return false;
    }
    const hasContent = exercises.some(ex =>
      ex.sets.some(s => hasAnyValue(s, ex.prescriptionType))
    );
    if (!hasContent) {
      Alert.alert('Empty sets', 'Fill in at least one set with data before saving.');
      return false;
    }
    return true;
  };

  const doSave = async (
    week: number,
    sessionId: string,
    options?: { replace?: boolean; existingLogIds?: string[] },
  ) => {
    setSaving(true);
    try {
      const date    = toISODate(selectedDate);
      const title   = sessionTitle.trim() || null;
      const entries = buildEntries(exercises, date, week, title, imageId, sessionId);

      if (options?.replace && options?.existingLogIds?.length) {
        // Replace: atomically delete today's existing week-0 logs, insert new session
        await logApi.updateSession(options.existingLogIds, entries);
      } else {
        // Add (first scan, or separate session)
        await logApi.createBulk(entries, imageId, title || undefined, sessionId);
      }
      clearParsedSession();
      router.back();
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTrackerMode = async () => {
    if (!validateBeforeSave()) return;

    // Generate a stable sessionId that groups every entry in this scan
    const sessionId = `${toISODate(selectedDate)}-${Date.now()}`;

    // Check whether today already has tracker content (week-0 logs, excluding text-notes)
    let existingLogs: any[] = [];
    try {
      const todayStr = toISODate(new Date());
      const fetched  = await logApi.list({ startDate: todayStr, endDate: todayStr });
      existingLogs = Array.isArray(fetched)
        ? fetched.filter((l: any) => Number(l.week) === 0 && l.prescriptionType !== 'text_note')
        : [];
    } catch {
      /* if the check fails, fall through to a normal save */
    }

    if (existingLogs.length > 0) {
      Alert.alert(
        'Add this workout?',
        'You already have a workout logged today.',
        [
          {
            text: 'Replace current',
            style: 'destructive',
            onPress: () => doSave(0, sessionId, {
              replace: true,
              existingLogIds: existingLogs.map((l: any) => String(l.id || l._id)),
            }),
          },
          {
            text: 'Add as separate session',
            onPress: () => doSave(0, sessionId),
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    } else {
      doSave(0, sessionId);
    }
  };

  const handleSaveProgramMode = async () => {
    if (!validateBeforeSave()) return;
    setSaving(true);
    try {
      const profile = await getProfile() as any;
      const week    = profile?.currentWeek || 1;
      const date    = toISODate(selectedDate);
      const title   = sessionTitle.trim() || null;
      const entries = buildEntries(exercises, date, week, title, imageId, null);
      await logApi.createBulk(entries, imageId, title || undefined);
      clearParsedSession();
      router.back();
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Edit mode save: replace old entries with new ones atomically
  const handleSaveEditMode = async () => {
    if (!validateBeforeSave()) return;
    setSaving(true);
    try {
      const date    = toISODate(selectedDate);
      const title   = sessionTitle.trim() || null;
      // Preserve the original week (0 = tracker) from the session
      const entries = buildEntries(exercises, date, 0, title, undefined, null);   // null sessionId for edit-mode re-saves

      await logApi.updateSession(editingLogIds, entries);
      router.back();
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    clearParsedSession();
    router.back();
  };

  // ── CTA copy ───────────────────────────────────────────────────────────────
  const dateToken   = ctaDateLabel(selectedDate);
  const isDateToday = dateToken === 'today';

  // Edit mode: always "Save changes", no secondary, no Case A/B/C
  const showSecondary = !isEditMode && source === 'plan_preview' && userHasActiveProgram;

  const primaryLabel = (() => {
    if (isEditMode) return 'Save changes';
    if (source === 'tracker_upload') return `Save to ${dateToken}`;
    if (userHasActiveProgram) {
      return isDateToday ? "Save to today's program" : `Save to ${dateToken}'s program`;
    }
    return 'Save in Tracker Mode';
  })();

  const primaryOnPress = isEditMode
    ? handleSaveEditMode
    : (source === 'plan_preview' && userHasActiveProgram ? handleSaveProgramMode : handleSaveTrackerMode);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={rc.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + HEADER_HEIGHT : 0}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={rc.header}>
          <TouchableOpacity onPress={handleCancel} style={rc.headerBack}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.text.primary} />
          </TouchableOpacity>
          <Text style={rc.headerTitle}>
            {isEditMode ? 'Edit Session' : 'Review Session'}
          </Text>
          <View style={{ width: 44 }} />
        </View>

        {/* ── Edit-mode loading skeleton ──────────────────────────────────── */}
        {isLoadingEdit ? (
          <View style={rc.loadingContainer}>
            <ActivityIndicator size="large" color={GOLD} />
            <Text style={rc.loadingText}>Loading session…</Text>
          </View>
        ) : (
        <>
        {/* ── Scrollable body ─────────────────────────────────────────────── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[rc.scrollBody, { paddingBottom: 130 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Confidence banner — only for medium/low, never in edit mode */}
          {!isEditMode && (confidence === 'medium' || confidence === 'low') && (
            <View style={rc.confidenceBanner}>
              <MaterialCommunityIcons
                name={confidence === 'low' ? 'alert-outline' : 'information-outline'}
                size={16}
                color={GOLD}
              />
              <Text style={rc.confidenceBannerText}>
                {confidence === 'low'
                  ? 'Parser confidence: low · please verify everything below'
                  : 'Parser confidence: medium · review carefully before saving'}
              </Text>
            </View>
          )}

          {/* Session title row */}
          <View style={rc.titleRow}>
            {isEditingTitle ? (
              <TextInput
                ref={titleInputRef}
                style={rc.titleInput}
                value={sessionTitle}
                onChangeText={setSessionTitle}
                onBlur={() => setIsEditingTitle(false)}
                returnKeyType="done"
                onSubmitEditing={() => setIsEditingTitle(false)}
                placeholder="Session title..."
                placeholderTextColor={COLORS.text.muted}
                autoFocus
              />
            ) : (
              <Text style={rc.titleText} numberOfLines={2}>
                {sessionTitle || 'Tap to add a title'}
              </Text>
            )}
            <TouchableOpacity
              onPress={() => {
                setIsEditingTitle(true);
                setTimeout(() => titleInputRef.current?.focus(), 50);
              }}
              style={rc.titleEditBtn}
            >
              <MaterialCommunityIcons
                name={isEditingTitle ? 'check' : 'pencil-outline'}
                size={16}
                color={COLORS.text.muted}
              />
            </TouchableOpacity>
          </View>

          {/* Date picker pill */}
          <TouchableOpacity
            style={rc.datePill}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.75}
          >
            <MaterialCommunityIcons name="calendar-outline" size={13} color={GOLD} />
            <Text style={rc.datePillText}>{formatDatePillLabel(selectedDate)}</Text>
            <MaterialCommunityIcons name="chevron-down" size={14} color={GOLD} />
          </TouchableOpacity>

          {/* Exercises section */}
          <Text style={rc.sectionLabel}>EXERCISES</Text>

          {exercises.length === 0 && (
            <View style={rc.emptyState}>
              <MaterialCommunityIcons name="dumbbell" size={32} color={COLORS.text.muted} />
              <Text style={rc.emptyTitle}>No exercises yet</Text>
              <Text style={rc.emptySub}>
                {source === 'plan_preview'
                  ? 'AI detected a single session · add exercises below'
                  : 'Tap "+ Add exercise" below to get started'}
              </Text>
            </View>
          )}

          {exercises.map((ex, idx) => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              index={idx}
              total={exercises.length}
              onUpdateSet={updateSet}
              onAddSet={addSet}
              onRemoveSet={removeSet}
              onRemoveExercise={removeExercise}
              onKebabPress={setActionSheetExerciseId}
            />
          ))}

          {/* Add exercise */}
          <TouchableOpacity
            style={rc.addExerciseBtn}
            onPress={() => setShowAddSheet(true)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="plus" size={18} color={GOLD} />
            <Text style={rc.addExerciseText}>Add exercise</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* ── Sticky Footer ───────────────────────────────────────────────── */}
        <View style={[rc.footer, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
          {/* Primary CTA */}
          <TouchableOpacity
            style={[rc.primaryBtn, saving && rc.btnDisabled]}
            onPress={primaryOnPress}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : (
              <View style={rc.primaryBtnInner}>
                <Text style={rc.primaryBtnText}>{primaryLabel}</Text>
                {/* Pro badge for plan_preview + active program */}
                {!isEditMode && source === 'plan_preview' && userHasActiveProgram && (
                  <View style={rc.proBadge}>
                    <Text style={rc.proBadgeText}>PRO</Text>
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>

          {/* Secondary CTA — CASE A only */}
          {showSecondary && !saving && (
            <TouchableOpacity
              style={rc.secondaryBtn}
              onPress={handleSaveTrackerMode}
              activeOpacity={0.8}
            >
              <Text style={rc.secondaryBtnText}>Save in Tracker Mode instead</Text>
            </TouchableOpacity>
          )}

          {/* Tertiary — Cancel */}
          {!saving && (
            <TouchableOpacity
              style={rc.cancelBtn}
              onPress={handleCancel}
              activeOpacity={0.7}
            >
              <Text style={rc.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
        </>
        )}
      </KeyboardAvoidingView>

      {/* ── Add Exercise Sheet (standard + swap mode) ──────────────────── */}
      <AddExerciseSheet
        visible={showAddSheet || swapSheetExerciseId !== null}
        onClose={() => { setShowAddSheet(false); setSwapSheetExerciseId(null); }}
        onAdd={handleAddExercise}
        replaceExerciseId={swapSheetExerciseId ?? undefined}
        onReplace={handleReplaceExercise}
      />

      {/* ── Exercise Action Sheet ───────────────────────────────────────── */}
      <ExerciseActionSheet
        visible={actionSheetExerciseId !== null}
        exercise={actionSheetExerciseId ? (exercises.find(e => e.id === actionSheetExerciseId) ?? null) : null}
        index={actionSheetExerciseId ? exercises.findIndex(e => e.id === actionSheetExerciseId) : -1}
        total={exercises.length}
        onClose={() => setActionSheetExerciseId(null)}
        onMoveUp={() => { moveUp(actionSheetExerciseId!); setActionSheetExerciseId(null); }}
        onMoveDown={() => { moveDown(actionSheetExerciseId!); setActionSheetExerciseId(null); }}
        onSwap={() => { setSwapSheetExerciseId(actionSheetExerciseId); setActionSheetExerciseId(null); }}
        onDuplicate={() => handleDuplicateExercise(actionSheetExerciseId!)}
        onEdit={() => { setEditSheetExerciseId(actionSheetExerciseId); setActionSheetExerciseId(null); }}
        onRemove={() => { removeExercise(actionSheetExerciseId!); setActionSheetExerciseId(null); }}
      />

      {/* ── Edit Exercise Sheet ─────────────────────────────────────────── */}
      <EditExerciseSheet
        visible={editSheetExerciseId !== null}
        exercise={editSheetExerciseId ? (exercises.find(e => e.id === editSheetExerciseId) ?? null) : null}
        onClose={() => setEditSheetExerciseId(null)}
        onSave={handleSaveEdit}
      />

      {/* ── Date Picker Modal ───────────────────────────────────────────── */}
      <DatePickerModal
        visible={showDatePicker}
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        onClose={() => setShowDatePicker(false)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const rc = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // Loading (edit mode initial fetch)
  loadingContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md,
  },
  loadingText: {
    color: COLORS.text.muted, fontSize: FONTS.sizes.sm,
  },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    height: HEADER_HEIGHT, paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  headerBack:  { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1, textAlign: 'center',
    color: COLORS.text.primary,
    fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.semibold,
  },

  // Body
  scrollBody: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },

  // Confidence banner
  confidenceBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    backgroundColor: GOLD_SOFT_BG,
    borderRadius: RADIUS.md,
    borderWidth: 0.5, borderColor: GOLD_SOFT_BORDER,
    padding: SPACING.md, marginBottom: SPACING.md,
  },
  confidenceBannerText: {
    flex: 1, fontSize: FONTS.sizes.sm,
    color: GOLD, lineHeight: 18,
  },

  // Title row
  titleRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  titleText: {
    flex: 1, color: COLORS.text.primary,
    fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.bold,
  },
  titleInput: {
    flex: 1, color: COLORS.text.primary,
    fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.bold,
    borderBottomWidth: 1, borderBottomColor: GOLD,
    paddingVertical: 4,
  },
  titleEditBtn: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
    marginLeft: SPACING.sm,
  },

  // Date pill
  datePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: GOLD_SOFT_BG,
    borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: GOLD_SOFT_BORDER,
    paddingHorizontal: SPACING.md, paddingVertical: 7,
    marginBottom: SPACING.lg,
  },
  datePillText: {
    color: GOLD, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold,
  },

  // Section label
  sectionLabel: {
    fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold,
    color: GOLD, letterSpacing: 1.2, marginBottom: SPACING.md,
  },

  // Empty state
  emptyState: {
    alignItems: 'center', paddingVertical: SPACING.xxl,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg, borderWidth: 1,
    borderStyle: 'dashed', borderColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  emptyTitle: {
    color: COLORS.text.secondary, fontSize: FONTS.sizes.base,
    fontWeight: FONTS.weights.medium, marginTop: SPACING.sm,
  },
  emptySub: {
    color: COLORS.text.muted, fontSize: FONTS.sizes.sm,
    marginTop: SPACING.xs, textAlign: 'center', paddingHorizontal: SPACING.xl,
    lineHeight: 18,
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
  cardMods:      { color: COLORS.text.muted, fontSize: FONTS.sizes.xs },
  kebabBtn:      { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  cardRemoveBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

  // Exercise Action Sheet
  asOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  asSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    paddingTop: SPACING.sm, paddingBottom: SPACING.xxl,
  },
  asHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center', marginBottom: SPACING.sm,
  },
  asTitle: {
    fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold,
    color: COLORS.text.muted, letterSpacing: 0.3,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  asRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md + 2,
  },
  asRowDisabled: { opacity: 0.32 },
  asRowLabel:    { fontSize: FONTS.sizes.base, color: COLORS.text.primary },
  asRowDanger:   { color: COLORS.status.error },
  asRowLabelMuted: { color: COLORS.text.muted },

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
  trashBtn: { width: 28, height: 36, alignItems: 'center', justifyContent: 'center' },

  // Unit pills
  pillGroup:         { flexDirection: 'row', gap: 3 },
  unitPill: {
    paddingHorizontal: 6, paddingVertical: 4,
    borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceHighlight,
    minHeight: 36, alignItems: 'center', justifyContent: 'center',
  },
  unitPillActive:     { borderColor: GOLD, backgroundColor: GOLD_BG },
  unitPillText:       { color: COLORS.text.muted, fontSize: 10, fontWeight: FONTS.weights.bold },
  unitPillTextActive: { color: GOLD },

  // Add set
  addSetBtn:  {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
  },
  addSetText: { color: GOLD, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.medium },

  // Add exercise
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

  // Footer
  footer: {
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md,
    backgroundColor: COLORS.background,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    gap: SPACING.sm,
  },

  // Primary CTA
  primaryBtn: {
    backgroundColor: GOLD,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md + 2,
    alignItems: 'center', justifyContent: 'center',
    minHeight: 48,
  },
  btnDisabled:     { opacity: 0.5 },
  primaryBtnInner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  primaryBtnText: {
    color: COLORS.primary, fontSize: FONTS.sizes.base,
    fontWeight: FONTS.weights.bold,
  },

  // Pro badge
  proBadge: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  proBadgeText: {
    color: COLORS.primary, fontSize: 9,
    fontWeight: FONTS.weights.heavy, letterSpacing: 0.8,
  },

  // Secondary CTA
  secondaryBtn: {
    borderRadius: RADIUS.lg, borderWidth: 1, borderColor: GOLD,
    paddingVertical: SPACING.md,
    alignItems: 'center', justifyContent: 'center', minHeight: 44,
  },
  secondaryBtnText: {
    color: GOLD, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold,
  },

  // Cancel
  cancelBtn:  { alignItems: 'center', paddingVertical: SPACING.sm },
  cancelBtnText: { color: COLORS.text.muted, fontSize: FONTS.sizes.sm },

  // Date picker modal
  dpOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  dpSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  dpTitle: {
    fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy,
    color: COLORS.text.muted, letterSpacing: 1.4,
    marginBottom: SPACING.md,
  },
  dpOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  dpOptionActive: { /* highlight via text color change */ },
  dpOptionText: {
    fontSize: FONTS.sizes.base, color: COLORS.text.secondary,
  },
  dpOptionTextActive: {
    color: GOLD, fontWeight: FONTS.weights.semibold,
  },
});
