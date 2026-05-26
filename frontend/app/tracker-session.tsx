/**
 * tracker-session.tsx — Tracker Mode Phase 1
 * Manual "New session" creation screen.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform,
  Alert, ActivityIndicator, Animated, Modal, Pressable,
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
import HowToModal from '../src/components/HowToModal';

// ── Constants ─────────────────────────────────────────────────────────────────
const HEADER_HEIGHT = 56;
const GOLD = COLORS.accent;
const GOLD_BG = `${GOLD}1A`;
const SIDE_OPTIONS = [
  { key: 'L', label: 'L' },
  { key: 'B', label: 'B' },
  { key: 'R', label: 'R' },
];

// Badge labels for the card header gold pill
const TYPE_BADGE: Record<string, string> = {
  weighted: 'WEIGHTED', timed: 'TIMED', distance: 'DISTANCE',
  height: 'HEIGHT', calories: 'CALORIES', emom: 'EMOM',
  amrap: 'AMRAP', for_time: 'FOR TIME',
};

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
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      style={[sc.setInput, { flex }, focused && sc.setInputFocused]}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={COLORS.text.muted}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      returnKeyType="done"
      blurOnSubmit={false}
      selectTextOnFocus
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
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

// ── Phase 2: Kebab Sheet ──────────────────────────────────────────────────────

const TRACKER_MODIFIERS = ['Per side', 'Tempo', 'Drop set', 'Superset'];

// Field-family map for data-loss detection
const TYPE_FAMILIES: Record<string, string> = {
  weighted: 'A', emom: 'A', amrap: 'A', for_time: 'A',
  timed: 'B', distance: 'C', height: 'D', calories: 'E',
};

/** Single row inside the kebab menu */
function KebabRow({
  icon, label, note, onPress, disabled = false, destructive = false,
}: {
  icon: string; label: string; note?: string;
  onPress: () => void; disabled?: boolean; destructive?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[kb.row, disabled && kb.rowDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.65}
    >
      <MaterialCommunityIcons
        name={icon as any} size={20}
        color={disabled ? COLORS.text.muted : destructive ? COLORS.status?.error ?? '#FF4D4D' : COLORS.text.secondary}
      />
      <View style={{ flex: 1, marginLeft: SPACING.md }}>
        <Text style={[kb.rowLabel, disabled && kb.rowLabelDisabled, destructive && kb.rowLabelDestructive]}>
          {label}
        </Text>
        {note ? <Text style={kb.rowNote}>{note}</Text> : null}
      </View>
      {!disabled && !destructive && (
        <MaterialCommunityIcons name="chevron-right" size={16} color={COLORS.text.muted} />
      )}
    </TouchableOpacity>
  );
}

type KebabView = 'menu' | 'change-type' | 'modifiers' | 'confirm-remove';

interface KebabSheetProps {
  exercise: SessionExercise;
  isFirst: boolean;
  isLast: boolean;
  visible: boolean;
  onClose: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSwapRename: () => void;
  onChangeType: (newType: PrescriptionType) => void;
  onToggleModifier: (mod: string) => void;
  onRemove: () => void;
}

function ExerciseKebabSheet({
  exercise, isFirst, isLast, visible, onClose,
  onMoveUp, onMoveDown, onSwapRename,
  onChangeType, onToggleModifier, onRemove,
}: KebabSheetProps) {
  const [view, setView] = useState<KebabView>('menu');
  const [pendingType, setPendingType] = useState<PrescriptionType | null>(null);
  const slideAnim = useRef(new Animated.Value(700)).current;

  useEffect(() => {
    if (visible) {
      setView('menu');
      setPendingType(null);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 700, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible]);

  if (!visible) return null;

  /** True when switching to newType would erase existing set values */
  const willLoseData = (newType: PrescriptionType) =>
    TYPE_FAMILIES[exercise.prescriptionType] !== TYPE_FAMILIES[newType] &&
    exercise.sets.some(s => hasAnyValue(s, exercise.prescriptionType));

  const handleTypeSelect = (type: PrescriptionType) => {
    if (type === exercise.prescriptionType) { onClose(); return; }
    if (willLoseData(type)) {
      setPendingType(type);
    } else {
      onChangeType(type);
    }
  };

  const subTitleMap: Record<KebabView, string> = {
    'menu': '',
    'change-type': 'Change Type',
    'modifiers': 'Modifiers',
    'confirm-remove': 'Remove Exercise?',
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={kb.overlay} onPress={onClose} />
      <Animated.View style={[kb.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Drag handle */}
        <View style={kb.handle} />

        {/* Sub-view header row (Back + title) — hidden on main menu */}
        {view !== 'menu' && (
          <View style={kb.subHeader}>
            <TouchableOpacity
              onPress={() => { setView('menu'); setPendingType(null); }}
              style={kb.backBtn}
            >
              <MaterialCommunityIcons name="arrow-left" size={18} color={COLORS.accent} />
              <Text style={kb.backLabel}>Back</Text>
            </TouchableOpacity>
            <Text style={kb.subTitle}>{subTitleMap[view]}</Text>
            <View style={{ width: 60 }} />
          </View>
        )}

        {/* ─── MAIN MENU ─── */}
        {view === 'menu' && (
          <>
            <View style={kb.exHeader}>
              <Text style={kb.exName} numberOfLines={2}>{exercise.name}</Text>
            </View>
            {/* Reorder */}
            <View style={kb.group}>
              <KebabRow
                icon="chevron-up" label="Move Up"
                disabled={isFirst}
                onPress={() => { onMoveUp(); onClose(); }}
              />
              <KebabRow
                icon="chevron-down" label="Move Down"
                disabled={isLast}
                onPress={() => { onMoveDown(); onClose(); }}
              />
            </View>
            <View style={kb.divider} />
            {/* Edit */}
            <View style={kb.group}>
              <KebabRow
                icon="swap-horizontal" label="Swap / Rename"
                onPress={() => { onClose(); setTimeout(onSwapRename, 280); }}
              />
              <KebabRow
                icon="lightning-bolt" label="Change Type"
                note={TYPE_BADGE[exercise.prescriptionType]}
                onPress={() => setView('change-type')}
              />
              <KebabRow
                icon="dots-horizontal-circle-outline" label="Modifiers"
                note={exercise.modifiers.length > 0 ? exercise.modifiers.join(', ') : undefined}
                onPress={() => setView('modifiers')}
              />
            </View>
            <View style={kb.divider} />
            {/* Danger */}
            <View style={kb.group}>
              <KebabRow
                icon="trash-can-outline" label="Remove Exercise"
                destructive
                onPress={() => setView('confirm-remove')}
              />
            </View>
            <View style={{ height: SPACING.lg }} />
          </>
        )}

        {/* ─── CHANGE TYPE ─── */}
        {view === 'change-type' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
            {PRESCRIPTION_TYPES.map(pt => {
              const isCurrent = pt.type === exercise.prescriptionType;
              const isPending = pendingType === pt.type;
              return (
                <TouchableOpacity
                  key={pt.type}
                  style={[kb.typeRow, isCurrent && kb.typeRowActive, isPending && kb.typeRowPending]}
                  onPress={() => handleTypeSelect(pt.type as PrescriptionType)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name={pt.icon as any} size={18}
                    color={isCurrent ? GOLD : COLORS.text.secondary}
                  />
                  <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                    <Text style={[kb.typeLabel, isCurrent && kb.typeLabelActive]}>{pt.label}</Text>
                    {isCurrent && <Text style={kb.typeCurrent}>Current</Text>}
                  </View>
                  {isCurrent && <MaterialCommunityIcons name="check" size={16} color={GOLD} />}
                </TouchableOpacity>
              );
            })}

            {/* Data-loss warning banner */}
            {pendingType && (
              <View style={kb.dataLossBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#F5A623" />
                <Text style={kb.dataLossText}>
                  Switching to {TYPE_BADGE[pendingType] ?? pendingType.toUpperCase()} will clear the
                  field values in {exercise.sets.length} set{exercise.sets.length !== 1 ? 's' : ''}.
                  {' '}This cannot be undone.
                </Text>
                <View style={kb.dataLossActions}>
                  <TouchableOpacity style={kb.keepBtn} onPress={() => setPendingType(null)}>
                    <Text style={kb.keepBtnText}>Keep values</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={kb.switchBtn} onPress={() => onChangeType(pendingType)}>
                    <Text style={kb.switchBtnText}>Switch anyway</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {/* ─── MODIFIERS ─── */}
        {view === 'modifiers' && (
          <View style={kb.modContainer}>
            {TRACKER_MODIFIERS.map(mod => {
              const active = exercise.modifiers.includes(mod);
              return (
                <TouchableOpacity
                  key={mod}
                  style={kb.modRow}
                  onPress={() => onToggleModifier(mod)}
                  activeOpacity={0.7}
                >
                  <Text style={[kb.modLabel, active && kb.modLabelActive]}>{mod}</Text>
                  <View style={[kb.modToggle, active && kb.modToggleActive]}>
                    {active && <MaterialCommunityIcons name="check" size={14} color={COLORS.background} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ─── CONFIRM REMOVE ─── */}
        {view === 'confirm-remove' && (
          <View style={kb.confirmWrap}>
            <MaterialCommunityIcons name="trash-can-outline" size={44} color="#FF4D4D" />
            <Text style={kb.confirmTitle}>Remove "{exercise.name}"?</Text>
            <Text style={kb.confirmSub}>
              Deletes all {exercise.sets.length} set{exercise.sets.length !== 1 ? 's' : ''} and cannot be undone.
            </Text>
            <TouchableOpacity style={kb.removeBtn} onPress={onRemove} activeOpacity={0.85}>
              <MaterialCommunityIcons name="trash-can-outline" size={16} color="#fff" />
              <Text style={kb.removeBtnText}>Remove exercise</Text>
            </TouchableOpacity>
            <TouchableOpacity style={kb.cancelBtn} onPress={() => setView('menu')} activeOpacity={0.7}>
              <Text style={kb.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/** Full exercise card */
function ExerciseCard({  exercise, isFirst, isLast,
  onUpdateSet, onAddSet, onRemoveSet,
  onMoveUp, onMoveDown, onHowTo, onKebab,
}: {
  exercise: SessionExercise;
  isFirst: boolean;
  isLast: boolean;
  onUpdateSet: (exId: string, setId: string, field: string, value: string) => void;
  onAddSet: (exId: string) => void;
  onRemoveSet: (exId: string, setId: string) => void;
  onMoveUp: (exId: string) => void;
  onMoveDown: (exId: string) => void;
  onHowTo: (name: string) => void;
  onKebab: (exId: string) => void;
}) {
  const addLabel = exercise.prescriptionType === 'distance' ? '+ Add trip' : '+ Add set';
  const badgeLabel = TYPE_BADGE[exercise.prescriptionType] ?? exercise.prescriptionType.toUpperCase();

  return (
    <View style={sc.card}>
      {/* ── Card header ── */}
      <View style={sc.cardHeader}>
        {/* Left: type badge + name */}
        <View style={sc.cardHeaderLeft}>
          <View style={sc.typeBadge}>
            <Text style={sc.typeBadgeText}>{badgeLabel}</Text>
          </View>
          <Text style={sc.cardName} numberOfLines={1}>{exercise.name}</Text>
          {exercise.modifiers.length > 0 && (
            <Text style={sc.cardMods}> · {exercise.modifiers.join(', ')}</Text>
          )}
        </View>

        {/* Right: reorder arrows + kebab (kebab inert — actions in Phase 2) */}
        <View style={sc.cardHeaderRight}>
          <TouchableOpacity
            style={[sc.headerIconBtn, isFirst && sc.headerIconBtnDisabled]}
            onPress={() => !isFirst && onMoveUp(exercise.id)}
            disabled={isFirst}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialCommunityIcons
              name="chevron-up" size={18}
              color={isFirst ? COLORS.text.muted : COLORS.text.secondary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[sc.headerIconBtn, isLast && sc.headerIconBtnDisabled]}
            onPress={() => !isLast && onMoveDown(exercise.id)}
            disabled={isLast}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialCommunityIcons
              name="chevron-down" size={18}
              color={isLast ? COLORS.text.muted : COLORS.text.secondary}
            />
          </TouchableOpacity>
          {/* ⋮ kebab — opens ExerciseKebabSheet */}
          <TouchableOpacity
            style={sc.headerIconBtn}
            onPress={() => onKebab(exercise.id)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialCommunityIcons name="dots-vertical" size={18} color={COLORS.text.secondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── FORM chip ── */}
      <TouchableOpacity
        onPress={() => onHowTo(exercise.name)}
        style={sc.formChip}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name="dumbbell" size={12} color={GOLD} />
        <Text style={sc.formChipText}>FORM</Text>
      </TouchableOpacity>

      {/* ── Column headers ── */}
      <ExerciseColHeaders
        prescriptionType={exercise.prescriptionType}
        modifiers={exercise.modifiers}
      />

      {/* ── Sets ── */}
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

      {/* ── Add set ── */}
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
  const [howToVisible,    setHowToVisible]    = useState(false);
  const [howToExercise,   setHowToExercise]   = useState('');
  // Kebab state — use id-based derivation so exercise is always fresh from state
  const [kebabTargetId,   setKebabTargetId]   = useState<string | null>(null);
  const [swapTargetId,    setSwapTargetId]    = useState<string | null>(null);
  const kebabExercise = exercises.find(e => e.id === kebabTargetId) ?? null;

  const labelInputRef = useRef<TextInput>(null);

  // ── Exercise management ────────────────────────────────────────────────────
  const handleAddExercise = useCallback((added: AddedExercise) => {
    if (swapTargetId) {
      // SWAP mode: replace the target exercise's name/type/modifiers; reset sets
      setExercises(prev => prev.map(e => {
        if (e.id !== swapTargetId) return e;
        return {
          ...e,
          name: added.name,
          category: added.category,
          prescriptionType: added.prescriptionType,
          modifiers: added.modifiers,
          sets: [makeDefaultSet()],
        };
      }));
      setSwapTargetId(null);
    } else {
      // Normal add
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
    }
  }, [swapTargetId]);

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

  const moveExercise = useCallback((exId: string, dir: 'up' | 'down') => {
    setExercises(prev => {
      const idx = prev.findIndex(e => e.id === exId);
      if (idx < 0) return prev;
      const next = dir === 'up' ? idx - 1 : idx + 1;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }, []);

  // ── Kebab actions ──────────────────────────────────────────────────────────
  const handleChangeType = useCallback((exId: string, newType: PrescriptionType) => {
    setExercises(prev => prev.map(e => {
      if (e.id !== exId) return e;
      return {
        ...e,
        prescriptionType: newType,
        sets: e.sets.map(() => makeDefaultSet()),
      };
    }));
    setKebabTargetId(null);
  }, []);

  const handleToggleModifier = useCallback((exId: string, mod: string) => {
    setExercises(prev => prev.map(e => {
      if (e.id !== exId) return e;
      const has = e.modifiers.includes(mod);
      return { ...e, modifiers: has ? e.modifiers.filter(m => m !== mod) : [...e.modifiers, mod] };
    }));
  }, []);

  const handleKebabRemove = useCallback((exId: string) => {
    setExercises(prev => prev.filter(e => e.id !== exId));
    setKebabTargetId(null);
  }, []);

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

          {exercises.map((ex, idx) => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              isFirst={idx === 0}
              isLast={idx === exercises.length - 1}
              onUpdateSet={updateSet}
              onAddSet={addSet}
              onRemoveSet={removeSet}
              onMoveUp={() => moveExercise(ex.id, 'up')}
              onMoveDown={() => moveExercise(ex.id, 'down')}
              onHowTo={(name) => { setHowToExercise(name); setHowToVisible(true); }}
              onKebab={(exId) => setKebabTargetId(exId)}
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

      {/* ── How-To Modal (shared with Program mode) ─────────────────────── */}
      <HowToModal
        visible={howToVisible}
        exercise={howToExercise}
        onClose={() => setHowToVisible(false)}
      />

      {/* ── Exercise Kebab Sheet ─────────────────────────────────────────── */}
      {kebabExercise && (
        <ExerciseKebabSheet
          exercise={kebabExercise}
          isFirst={exercises.findIndex(e => e.id === kebabTargetId) === 0}
          isLast={exercises.findIndex(e => e.id === kebabTargetId) === exercises.length - 1}
          visible={!!kebabTargetId}
          onClose={() => setKebabTargetId(null)}
          onMoveUp={() => moveExercise(kebabTargetId!, 'up')}
          onMoveDown={() => moveExercise(kebabTargetId!, 'down')}
          onSwapRename={() => {
            setSwapTargetId(kebabTargetId!);
            setShowAddSheet(true);
          }}
          onChangeType={(type) => handleChangeType(kebabTargetId!, type)}
          onToggleModifier={(mod) => handleToggleModifier(kebabTargetId!, mod)}
          onRemove={() => handleKebabRemove(kebabTargetId!)}
        />
      )}
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
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surfaceHighlight,
    gap: SPACING.xs,
  },
  cardHeaderLeft: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minWidth: 0,
  },
  cardHeaderRight: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
  },
  typeBadge: {
    backgroundColor: `${GOLD}20`,
    borderWidth: 1, borderColor: `${GOLD}55`,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  typeBadgeText: {
    fontSize: 9, fontWeight: FONTS.weights.bold,
    color: GOLD, letterSpacing: 0.7,
  },
  cardName: {
    flex: 1, color: COLORS.text.primary,
    fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold,
  },
  cardMods: { color: COLORS.text.muted, fontSize: FONTS.sizes.xs },
  headerIconBtn: {
    width: 30, height: 30, alignItems: 'center', justifyContent: 'center',
  },
  headerIconBtnDisabled: { opacity: 0.3 },

  // Form chip
  formChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginHorizontal: SPACING.md, marginTop: SPACING.sm, marginBottom: 2,
    backgroundColor: `${GOLD}18`, borderWidth: 1, borderColor: `${GOLD}40`,
    borderRadius: RADIUS.full, paddingVertical: 5, paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  formChipText: {
    fontSize: 10, color: GOLD, fontWeight: FONTS.weights.heavy, letterSpacing: 0.8,
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
  setInputFocused: {
    borderColor: GOLD,
    backgroundColor: `${GOLD}08`,
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

// ── Kebab Sheet Styles ────────────────────────────────────────────────────────
const kb = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    overflow: 'hidden',
    maxHeight: '85%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center', marginTop: SPACING.sm, marginBottom: SPACING.xs,
  },

  // Exercise name header
  exHeader: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  exName: {
    fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold,
    color: COLORS.text.primary,
  },

  // Sub-view header (Back + title)
  subHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 60 },
  backLabel: { fontSize: FONTS.sizes.sm, color: COLORS.accent, fontWeight: FONTS.weights.semibold },
  subTitle: {
    flex: 1, textAlign: 'center',
    fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.primary,
  },

  // Menu items
  group: {},
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.xs },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: 13,
    minHeight: 48,
  },
  rowDisabled: { opacity: 0.35 },
  rowLabel: {
    fontSize: FONTS.sizes.base, color: COLORS.text.primary, fontWeight: FONTS.weights.medium,
  },
  rowLabelDisabled: { color: COLORS.text.muted },
  rowLabelDestructive: { color: '#FF4D4D' },
  rowNote: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 1 },

  // Type picker
  typeRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  typeRowActive: { backgroundColor: `${GOLD}12` },
  typeRowPending: { backgroundColor: '#F5A62315' },
  typeLabel: {
    fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, fontWeight: FONTS.weights.medium,
  },
  typeLabelActive: { color: GOLD, fontWeight: FONTS.weights.bold },
  typeCurrent: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 1 },

  // Data-loss warning
  dataLossBox: {
    margin: SPACING.md, padding: SPACING.md,
    backgroundColor: '#F5A62320',
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#F5A62345',
    gap: SPACING.sm,
  },
  dataLossText: {
    fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 18,
  },
  dataLossActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  keepBtn: {
    flex: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center',
  },
  keepBtnText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold },
  switchBtn: {
    flex: 1, paddingVertical: SPACING.sm, borderRadius: RADIUS.md,
    backgroundColor: '#F5A623',
    alignItems: 'center',
  },
  switchBtnText: { color: COLORS.background, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.bold },

  // Modifiers
  modContainer: { padding: SPACING.md, gap: SPACING.sm },
  modRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: SPACING.sm, minHeight: 48,
  },
  modLabel: {
    fontSize: FONTS.sizes.base, color: COLORS.text.secondary, fontWeight: FONTS.weights.medium,
  },
  modLabelActive: { color: COLORS.text.primary },
  modToggle: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  modToggleActive: { backgroundColor: GOLD, borderColor: GOLD },

  // Confirm remove
  confirmWrap: {
    alignItems: 'center', padding: SPACING.xl, gap: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  confirmTitle: {
    fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.bold,
    color: COLORS.text.primary, textAlign: 'center',
  },
  confirmSub: {
    fontSize: FONTS.sizes.sm, color: COLORS.text.muted,
    textAlign: 'center', lineHeight: 20,
  },
  removeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: '#FF4D4D', borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
    width: '100%', justifyContent: 'center',
  },
  removeBtnText: { color: '#fff', fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.base },
  cancelBtn: {
    paddingVertical: SPACING.sm, width: '100%', alignItems: 'center',
  },
  cancelBtnText: { color: COLORS.text.muted, fontSize: FONTS.sizes.base },
});
