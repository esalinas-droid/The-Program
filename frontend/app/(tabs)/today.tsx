import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  ActivityIndicator, Animated, Pressable, Modal,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';
import { getProfile } from '../../src/utils/storage';
import { substitutionApi } from '../../src/utils/api';
import { getProgramSession, getTodayDayName } from '../../src/data/programData';
import { getBlock } from '../../src/utils/calculations';
import {
  ADJUST_REASONS, REASON_ICONS, AdjustReason, Alternative,
  getAlternatives, extractExerciseName,
} from '../../src/data/substitutions';
import { ProgramSession } from '../../src/types';

// ── Additional palette ────────────────────────────────────────────────────────
const TEAL = '#4DCEA6';
const BLUE = '#5B9CF5';

// ── Types ─────────────────────────────────────────────────────────────────────
type SetType     = 'warmup' | 'ramp' | 'work';
type ExCategory  = 'maxeffort' | 'supplemental' | 'accessory' | 'prehab';

interface ExSet {
  id: string;
  type: SetType;
  weight: number;
  reps: string;
  label: string;
}
interface Exercise {
  id: string;
  name: string;
  category: ExCategory;
  prescription: string;
  lastSession: string;
  cues: string[];
  notes: string;
  sets: ExSet[];
}
type SwapInfo = { original: string; replacement: string; reason: string };
type SwapMap  = Record<string, SwapInfo>;

// ── Mock Exercise Data ────────────────────────────────────────────────────────
const EXERCISES: Exercise[] = [
  {
    id: 'floor-press',
    name: 'Floor Press',
    category: 'maxeffort',
    prescription: 'Work to 1RM',
    lastSession: '315 × 1  @  RPE 8.5',
    cues: ['Pin shoulders back', 'Pause on floor 1-count', 'Drive through triceps'],
    notes: 'If 375 moves clean, take 390. No grinding attempts.',
    sets: [
      { id: 'fp-wu-1', type: 'warmup', weight: 45,  reps: '5', label: 'Warm-Up' },
      { id: 'fp-wu-2', type: 'warmup', weight: 95,  reps: '5', label: 'Warm-Up' },
      { id: 'fp-wu-3', type: 'warmup', weight: 135, reps: '3', label: 'Warm-Up' },
      { id: 'fp-wu-4', type: 'warmup', weight: 185, reps: '3', label: 'Warm-Up' },
      { id: 'fp-wu-5', type: 'warmup', weight: 225, reps: '2', label: 'Warm-Up' },
      { id: 'fp-r-1',  type: 'ramp',   weight: 275, reps: '1', label: 'Ramp'    },
      { id: 'fp-r-2',  type: 'ramp',   weight: 315, reps: '1', label: 'Ramp'    },
      { id: 'fp-r-3',  type: 'ramp',   weight: 355, reps: '1', label: 'Ramp'    },
      { id: 'fp-w-1',  type: 'work',   weight: 375, reps: '1', label: 'Work'    },
    ],
  },
  {
    id: 'pendlay-row',
    name: 'Pendlay Row',
    category: 'supplemental',
    prescription: '4 × 6-8',
    lastSession: '225 × 6  @  RPE 7',
    cues: ['Dead stop on floor', 'Elbows tight', 'Control the descent'],
    notes: 'Use straps from set 3 onwards.',
    sets: [
      { id: 'pr-w-1', type: 'work', weight: 225, reps: '6-8', label: 'Work' },
      { id: 'pr-w-2', type: 'work', weight: 225, reps: '6-8', label: 'Work' },
      { id: 'pr-w-3', type: 'work', weight: 225, reps: '6-8', label: 'Work' },
      { id: 'pr-w-4', type: 'work', weight: 225, reps: '6-8', label: 'Work' },
    ],
  },
  {
    id: 'incline-db-press',
    name: 'Incline DB Press',
    category: 'accessory',
    prescription: '3 × 10-12',
    lastSession: '85 × 12  @  RPE 7',
    cues: ['Slight arch', 'Elbows 45°', 'Full range of motion'],
    notes: '',
    sets: [
      { id: 'idp-w-1', type: 'work', weight: 85, reps: '10-12', label: 'Work' },
      { id: 'idp-w-2', type: 'work', weight: 85, reps: '10-12', label: 'Work' },
      { id: 'idp-w-3', type: 'work', weight: 85, reps: '10-12', label: 'Work' },
    ],
  },
  {
    id: 'tricep-pushdown',
    name: 'Tricep Pushdown',
    category: 'accessory',
    prescription: '3 × 15-20',
    lastSession: '120 × 15  @  RPE 6',
    cues: ['Lock elbows at sides', 'Full extension', 'Controlled negative'],
    notes: 'Cable or bands — both acceptable.',
    sets: [
      { id: 'tp-w-1', type: 'work', weight: 120, reps: '15-20', label: 'Work' },
      { id: 'tp-w-2', type: 'work', weight: 120, reps: '15-20', label: 'Work' },
      { id: 'tp-w-3', type: 'work', weight: 120, reps: '15-20', label: 'Work' },
    ],
  },
  {
    id: 'face-pull',
    name: 'Face Pull',
    category: 'prehab',
    prescription: '3 × 15-20',
    lastSession: '50 × 20  @  RPE 5',
    cues: ['Pull to nose height', 'External rotation at peak', 'Slow and controlled'],
    notes: 'Mandatory — protect the shoulder.',
    sets: [
      { id: 'fp2-w-1', type: 'work', weight: 50, reps: '15-20', label: 'Work' },
      { id: 'fp2-w-2', type: 'work', weight: 50, reps: '15-20', label: 'Work' },
      { id: 'fp2-w-3', type: 'work', weight: 50, reps: '15-20', label: 'Work' },
    ],
  },
];

const WARMUP_STEPS = [
  { name: 'Band Pull-Aparts',      sets: '3 × 20',       note: 'Light band, scapular retraction focus' },
  { name: 'Shoulder Dislocates',   sets: '3 × 10',       note: 'Dowel or light band, full ROM' },
  { name: 'Scapular Wall Slides',  sets: '2 × 15',       note: 'Press low back firmly into wall' },
  { name: 'Face Pulls (warm-up)',  sets: '2 × 20',       note: 'High cable, external rotation at peak' },
  { name: 'Rotator Cuff ER / IR', sets: '2 × 15 each',  note: '3–5 lbs only, controlled tempo' },
];

const BLOCK_LABELS: Record<number, string> = {
  1: 'FOUNDATION', 2: 'STRENGTH', 3: 'INTENSITY',
  4: 'VOLUME',     5: 'STRENGTH EMPHASIS', 6: 'PEAK PREP', 7: 'PIVOT',
};

const DAY_NUM: Record<string, number> = {
  Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7,
};

const SESSION_OBJECTIVES: Record<string, string> = {
  'Max Effort Upper':    'Work to a 1RM on a pressing variation. Build supplemental and accessory volume.',
  'Max Effort Lower':    'Work to a 1RM on a lower body pattern. Build posterior chain supplemental volume.',
  'Dynamic Effort Upper':'Speed work at 50–60% of max. 8–10 sets of 3. Focus on bar speed and lockout.',
  'Dynamic Effort Lower':'Speed squats and pulls at 55–60%. 10–12 sets of 2. Explosive hip drive.',
  'Event Day':           'Strongman event training. Prioritize technique and confidence across all implements.',
  'Boxing / Recovery':   'Light aerobic conditioning. Maintain movement quality. Keep intensity low.',
};

const INJURY_MAP: Record<string, string[]> = {
  'Right hamstring / nerve compression': ['conventional deadlift', 'romanian deadlift', 'rdl', 'stiff-leg'],
  'Low back':          ['jefferson curl', 'spinal flexion', 'good morning'],
  'Left knee':         ['split squat', 'lunge', 'step-up', 'single-leg press'],
  'Left bicep strain': ['stone to shoulder', 'stone lap', 'axle clean'],
  'Shoulder history':  ['behind-neck', 'behind neck', 'snatch grip'],
};

// ── Helper Functions ──────────────────────────────────────────────────────────
function getInjuryWarnings(session: ProgramSession, injuryFlags: string[]): string[] {
  const warnings: string[] = [];
  const allWork = [session.mainLift, ...session.supplementalWork, ...session.accessories].join(' ').toLowerCase();
  for (const flag of injuryFlags) {
    const triggers = INJURY_MAP[flag];
    if (triggers?.some(t => allWork.includes(t))) {
      warnings.push(`⚠ ${flag.split('/')[0].trim()} — Review flagged movements in this session`);
    }
  }
  return warnings;
}

function getSetCircleColor(type: SetType, logged: boolean): string {
  if (logged) return TEAL;
  if (type === 'warmup') return '#666666';
  if (type === 'ramp') return BLUE;
  return COLORS.accent;
}

function getCategoryStyle(cat: ExCategory): { bg: string; text: string; label: string } {
  return {
    maxeffort:    { bg: COLORS.accent + '25', text: COLORS.accent, label: 'Max Effort' },
    supplemental: { bg: BLUE + '25',           text: BLUE,          label: 'Supplemental' },
    accessory:    { bg: COLORS.surfaceHighlight, text: COLORS.text.secondary, label: 'Accessory' },
    prehab:       { bg: TEAL + '25',            text: TEAL,          label: 'Prehab' },
  }[cat];
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── AdjustModal ───────────────────────────────────────────────────────────────
interface AdjustModalProps {
  visible: boolean;
  exerciseKey: string;
  exerciseName: string;
  onClose: () => void;
  onConfirm: (key: string, original: string, replacement: string, reason: AdjustReason) => void;
}
function AdjustModal({ visible, exerciseKey, exerciseName, onClose, onConfirm }: AdjustModalProps) {
  const [step, setStep]                 = useState<1 | 2>(1);
  const [selectedReason, setReason]     = useState<AdjustReason | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [selectedAlt, setSelectedAlt]   = useState<Alternative | null>(null);
  const slideAnim = useRef(new Animated.Value(700)).current;

  const handleShow = () => {
    setStep(1); setReason(null); setAlternatives([]); setSelectedAlt(null);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }).start();
  };
  const handleHide = (cb?: () => void) => {
    Animated.timing(slideAnim, { toValue: 700, duration: 220, useNativeDriver: true }).start(() => cb?.());
  };
  const handleClose = () => handleHide(onClose);

  const handleReasonSelect = (r: AdjustReason) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReason(r);
    setAlternatives(getAlternatives(extractExerciseName(exerciseName), r));
    setSelectedAlt(null);
    setStep(2);
  };
  const handleAltSelect = (alt: Alternative) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAlt(alt);
  };
  const handleConfirm = () => {
    if (!selectedAlt || !selectedReason) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    handleHide(() => onConfirm(exerciseKey, exerciseName, selectedAlt.name, selectedReason));
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onShow={handleShow} onRequestClose={handleClose}>
      <Pressable style={m.overlay} onPress={step === 1 ? handleClose : undefined}>
        <Animated.View style={[m.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <Pressable onPress={e => e.stopPropagation()}>
            <View style={m.handleWrap}><View style={m.handle} /></View>
            <View style={m.header}>
              {step === 2 ? (
                <TouchableOpacity onPress={() => { setStep(1); setSelectedAlt(null); }} style={m.backBtn}>
                  <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text.secondary} />
                </TouchableOpacity>
              ) : <View style={m.backBtn} />}
              <View style={m.headerCenter}>
                <Text style={m.headerTitle}>Adjust Exercise</Text>
                <Text style={m.headerSub} numberOfLines={1}>{extractExerciseName(exerciseName)}</Text>
              </View>
              <TouchableOpacity onPress={handleClose} style={m.closeBtn}>
                <MaterialCommunityIcons name="close" size={20} color={COLORS.text.muted} />
              </TouchableOpacity>
            </View>

            {step === 1 && (
              <View style={m.body}>
                <Text style={m.prompt}>Why are you swapping this one?</Text>
                <View style={m.pillGrid}>
                  {ADJUST_REASONS.map(r => (
                    <TouchableOpacity key={r} style={[m.reasonPill, selectedReason === r && m.reasonPillActive]} onPress={() => handleReasonSelect(r)}>
                      <MaterialCommunityIcons name={REASON_ICONS[r] as any} size={16} color={selectedReason === r ? COLORS.primary : COLORS.accent} style={{ marginRight: 6 }} />
                      <Text style={[m.reasonPillText, selectedReason === r && m.reasonPillTextActive]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {step === 2 && selectedReason && (
              <View style={m.body}>
                <View style={m.reasonChip}>
                  <MaterialCommunityIcons name={REASON_ICONS[selectedReason] as any} size={13} color={COLORS.accent} />
                  <Text style={m.reasonChipText}>{selectedReason}</Text>
                </View>
                <Text style={m.prompt}>Your coach's picks:</Text>
                <View style={m.altList}>
                  {alternatives.map((alt, i) => {
                    const isSel = selectedAlt?.name === alt.name;
                    return (
                      <TouchableOpacity key={alt.name} style={[m.altCard, isSel && m.altCardSelected]} onPress={() => handleAltSelect(alt)} activeOpacity={0.8}>
                        <View style={m.altRankBadge}><Text style={m.altRankText}>{i + 1}</Text></View>
                        <View style={m.altInfo}>
                          <Text style={[m.altName, isSel && m.altNameSelected]}>{alt.name}</Text>
                          <View style={m.altEquipRow}>
                            <MaterialCommunityIcons name="dumbbell" size={11} color={COLORS.text.muted} />
                            <Text style={m.altEquip}> {alt.equipment}</Text>
                          </View>
                          <Text style={m.altIntentNote}>{alt.intentNote}</Text>
                        </View>
                        <View style={[m.altRadio, isSel && m.altRadioSelected]}>
                          {isSel && <View style={m.altRadioInner} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity style={[m.confirmBtn, !selectedAlt && m.confirmBtnDisabled]} onPress={handleConfirm} disabled={!selectedAlt} activeOpacity={0.85}>
                  <MaterialCommunityIcons name="swap-horizontal" size={18} color={selectedAlt ? COLORS.primary : COLORS.text.muted} />
                  <Text style={[m.confirmBtnText, !selectedAlt && m.confirmBtnTextDisabled]}>CONFIRM SWAP</Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ── RestTimerBar ──────────────────────────────────────────────────────────────
function RestTimerBar({ running, seconds, onToggle, onReset }: {
  running: boolean; seconds: number; onToggle: () => void; onReset: () => void;
}) {
  const restWarning = seconds > 180; // over 3 mins = too long
  const timeColor   = restWarning ? '#EF5350' : running ? COLORS.accent : COLORS.text.muted;

  return (
    <View style={rt.bar}>
      <View style={rt.left}>
        <MaterialCommunityIcons name="timer-outline" size={18} color={timeColor} />
        <Text style={rt.label}>REST</Text>
        <Text style={[rt.time, { color: timeColor }]}>{formatTime(seconds)}</Text>
        {running && (
          <View style={rt.activeDot} />
        )}
      </View>
      <View style={rt.controls}>
        <TouchableOpacity onPress={onToggle} style={rt.controlBtn} activeOpacity={0.75}>
          <MaterialCommunityIcons name={running ? 'pause-circle' : 'play-circle'} size={28} color={COLORS.accent} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onReset} style={rt.controlBtn} activeOpacity={0.75}>
          <MaterialCommunityIcons name="refresh" size={22} color={COLORS.text.muted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
const rt = StyleSheet.create({
  bar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  left:       { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  label:      { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2 },
  time:       { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, fontVariant: ['tabular-nums'] as any, letterSpacing: -0.5 },
  activeDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: TEAL, marginLeft: 4 },
  controls:   { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  controlBtn: { padding: 4 },
});

// ── SetRow ────────────────────────────────────────────────────────────────────
function SetRow({ set, logged, painFlagged, onLog, onPain, index }: {
  set: ExSet; logged: boolean; painFlagged: boolean;
  onLog: () => void; onPain: () => void; index: number;
}) {
  const circleColor = getSetCircleColor(set.type, logged);
  return (
    <View style={sr.row}>
      {/* Numbered circle */}
      <View style={[sr.circle, { backgroundColor: circleColor + '20', borderColor: circleColor }]}>
        {logged
          ? <MaterialCommunityIcons name="check" size={11} color={circleColor} />
          : <Text style={[sr.circleNum, { color: circleColor }]}>{index + 1}</Text>
        }
      </View>

      {/* Weight × Reps */}
      <Text style={[sr.weight, logged && sr.weightDone]}>
        {set.weight} × {set.reps}
      </Text>

      {/* Type label */}
      <Text style={[sr.typeLabel, logged && sr.typeLabelDone]}>
        {logged ? 'Done' : set.label.toUpperCase()}
      </Text>

      {/* Pain flag button */}
      <TouchableOpacity onPress={onPain} style={sr.painBtn} activeOpacity={0.7}>
        <MaterialCommunityIcons
          name="alert-circle-outline"
          size={18}
          color={painFlagged ? '#EF5350' : COLORS.border}
        />
      </TouchableOpacity>

      {/* Log / Done */}
      {!logged ? (
        <TouchableOpacity onPress={onLog} style={sr.logBtn} activeOpacity={0.8}>
          <Text style={sr.logBtnText}>LOG</Text>
        </TouchableOpacity>
      ) : (
        <View style={sr.doneWrap}>
          <MaterialCommunityIcons name="check-circle" size={22} color={TEAL} />
        </View>
      )}
    </View>
  );
}
const sr = StyleSheet.create({
  row:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border + '55' },
  circle:       { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  circleNum:    { fontSize: 11, fontWeight: FONTS.weights.heavy },
  weight:       { flex: 1, fontSize: 14, color: COLORS.text.primary, fontWeight: FONTS.weights.semibold },
  weightDone:   { textDecorationLine: 'line-through', color: COLORS.text.muted },
  typeLabel:    { fontSize: 10, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5, width: 72, textAlign: 'right' },
  typeLabelDone:{ color: TEAL },
  painBtn:      { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  logBtn:       { backgroundColor: COLORS.accent, paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.md, minWidth: 52, alignItems: 'center' },
  logBtnText:   { color: COLORS.primary, fontSize: 11, fontWeight: FONTS.weights.heavy, letterSpacing: 1 },
  doneWrap:     { width: 52, alignItems: 'center' },
});

// ── ExerciseCard ──────────────────────────────────────────────────────────────
function ExerciseCard({ exercise, expanded, loggedSets, painSets, onToggle, onLog, onPain, onAdjust, swap }: {
  exercise: Exercise;
  expanded: boolean;
  loggedSets: Set<string>;
  painSets: Set<string>;
  onToggle: () => void;
  onLog: (setId: string) => void;
  onPain: (setId: string) => void;
  onAdjust: (id: string, name: string) => void;
  swap?: SwapInfo;
}) {
  const catStyle   = getCategoryStyle(exercise.category);
  const loggedCount = exercise.sets.filter(s => loggedSets.has(s.id)).length;
  const total       = exercise.sets.length;
  const allDone     = loggedCount === total;
  const displayName = swap?.replacement ?? exercise.name;
  const progColor   = allDone ? TEAL : loggedCount > 0 ? COLORS.accent : COLORS.text.muted;

  return (
    <View style={ec.card}>
      {/* ── Collapsible header ── */}
      <TouchableOpacity onPress={onToggle} style={ec.header} activeOpacity={0.8}>
        <View style={ec.headerLeft}>
          <View style={[ec.catBadge, { backgroundColor: catStyle.bg }]}>
            <Text style={[ec.catBadgeText, { color: catStyle.text }]}>{catStyle.label}</Text>
          </View>
          {swap && (
            <View style={ec.swapPill}>
              <MaterialCommunityIcons name="swap-horizontal" size={10} color={COLORS.accent} />
              <Text style={ec.swapPillText}>SWAPPED</Text>
            </View>
          )}
        </View>
        <View style={ec.headerRight}>
          <View style={[ec.progressPill, { backgroundColor: progColor + '20' }]}>
            <Text style={[ec.progressText, { color: progColor }]}>{loggedCount}/{total}</Text>
          </View>
          <MaterialCommunityIcons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={COLORS.text.muted}
          />
        </View>
      </TouchableOpacity>

      {/* ── Name + Prescription (always visible) ── */}
      <TouchableOpacity onPress={onToggle} style={ec.nameRow} activeOpacity={0.8}>
        <Text style={ec.name} numberOfLines={2}>{displayName}</Text>
        <Text style={ec.prescription}>{exercise.prescription}</Text>
      </TouchableOpacity>

      {/* ── Expanded body ── */}
      {expanded && (
        <View style={ec.body}>
          {/* Last session ref */}
          <View style={ec.lastRow}>
            <MaterialCommunityIcons name="history" size={13} color={COLORS.text.muted} />
            <Text style={ec.lastText}>Last: {exercise.lastSession}</Text>
          </View>

          {/* Coaching cues */}
          {exercise.cues.length > 0 && (
            <View style={ec.cuesRow}>
              <MaterialCommunityIcons name="lightbulb-on-outline" size={13} color={COLORS.accent} style={{ marginTop: 1 }} />
              <Text style={ec.cuesText}>{exercise.cues.join('  ·  ')}</Text>
            </View>
          )}

          {/* Divider */}
          <View style={ec.divider} />

          {/* Set rows */}
          <View>
            {exercise.sets.map((set, idx) => (
              <SetRow
                key={set.id}
                set={set}
                index={idx}
                logged={loggedSets.has(set.id)}
                painFlagged={painSets.has(set.id)}
                onLog={() => onLog(set.id)}
                onPain={() => onPain(set.id)}
              />
            ))}
          </View>

          {/* Notes */}
          {exercise.notes ? (
            <Text style={ec.notes}>{exercise.notes}</Text>
          ) : null}

          {/* Adjust Exercise button */}
          <TouchableOpacity style={ec.adjustBtn} onPress={() => onAdjust(exercise.id, displayName)} activeOpacity={0.75}>
            <MaterialCommunityIcons name="swap-horizontal" size={14} color={COLORS.text.muted} />
            <Text style={ec.adjustBtnText}>Adjust Exercise</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
const ec = StyleSheet.create({
  card:          { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  headerLeft:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 },
  headerRight:   { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  catBadge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  catBadgeText:  { fontSize: 10, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5 },
  swapPill:      { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.accent + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.full },
  swapPillText:  { fontSize: 9, color: COLORS.accent, fontWeight: FONTS.weights.heavy },
  progressPill:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  progressText:  { fontSize: 11, fontWeight: FONTS.weights.heavy },
  nameRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, gap: SPACING.sm },
  name:          { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, flex: 1, lineHeight: 23 },
  prescription:  { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },
  body:          { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },
  lastRow:       { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: SPACING.sm },
  lastText:      { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontStyle: 'italic' },
  cuesRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginBottom: SPACING.md, backgroundColor: COLORS.accent + '10', borderRadius: RADIUS.md, padding: SPACING.sm },
  cuesText:      { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontWeight: FONTS.weights.semibold, flex: 1, lineHeight: 17 },
  divider:       { height: 1, backgroundColor: COLORS.border, marginBottom: SPACING.sm },
  notes:         { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontStyle: 'italic', marginTop: SPACING.md, lineHeight: 17 },
  adjustBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  adjustBtnText: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function TodayScreen() {
  const router = useRouter();

  // Session data
  const [week, setWeek]               = useState(1);
  const [todaySession, setTodaySession] = useState<ProgramSession | null>(null);
  const [injuryFlags, setInjuryFlags] = useState<string[]>([]);
  const [loading, setLoading]         = useState(true);

  // Exercise interaction
  const [loggedSets, setLoggedSets]   = useState<Set<string>>(new Set());
  const [painSets, setPainSets]       = useState<Set<string>>(new Set());
  const [expanded, setExpanded]       = useState<Set<string>>(new Set(['floor-press']));
  const [swaps, setSwaps]             = useState<SwapMap>({});
  const [warmupExpanded, setWarmupExpanded] = useState(false);

  // Rest timer
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Adjust modal
  const [modalVisible, setModal]   = useState(false);
  const [adjustKey, setAdjustKey]  = useState('');
  const [adjustName, setAdjustName] = useState('');

  const todayName = getTodayDayName();

  // ── Load session ────────────────────────────────────────────────────────────
  useFocusEffect(useCallback(() => {
    (async () => {
      const prof = await getProfile();
      const w    = prof?.currentWeek || 1;
      setWeek(w);
      setInjuryFlags(prof?.injuryFlags || []);
      const day  = todayName === 'Sunday' ? 'Monday' : todayName;
      const sess = getProgramSession(w, day);
      setTodaySession(sess);
      setLoading(false);
    })();
  }, []));

  // ── Rest timer effect ────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  // ── Computed values ──────────────────────────────────────────────────────────
  const totalSets   = EXERCISES.reduce((sum, ex) => sum + ex.sets.length, 0);
  const loggedCount = loggedSets.size;
  const progressPct = totalSets > 0 ? (loggedCount / totalSets) * 100 : 0;
  const canFinish   = progressPct >= 50;

  // Session header values
  const block        = getBlock(week);
  const blockLabel   = BLOCK_LABELS[block] || `BLOCK ${block}`;
  const dayNum       = DAY_NUM[todayName] || 1;
  const sessionType  = todaySession?.sessionType || 'Max Effort Upper';
  const sessionObj   = SESSION_OBJECTIVES[sessionType] || todaySession?.intentRPETarget || '';
  const coachNote    = todaySession?.coachingNotes
    || "Drive through today's session with full intent. Build deliberately to your peak and leave no doubt in those supplemental sets.";

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleLog = (setId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoggedSets(prev => new Set([...prev, setId]));
    setTimerSeconds(0);
    setTimerRunning(true);
  };

  const handlePain = (setId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setPainSets(prev => {
      const next = new Set(prev);
      if (next.has(setId)) next.delete(setId); else next.add(setId);
      return next;
    });
  };

  const handleToggleExpand = (exId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(exId)) next.delete(exId); else next.add(exId);
      return next;
    });
  };

  const openAdjust = (id: string, name: string) => {
    setAdjustKey(id); setAdjustName(name); setModal(true);
  };

  const handleConfirmSwap = async (key: string, original: string, replacement: string, reason: AdjustReason) => {
    setModal(false);
    setSwaps(prev => ({ ...prev, [key]: { original, replacement, reason } }));
    try {
      const day = todayName === 'Sunday' ? 'Monday' : todayName;
      await substitutionApi.log({
        date: new Date().toISOString().slice(0, 10),
        week, day, sessionType,
        originalExercise: extractExerciseName(original),
        replacementExercise: replacement,
        reason,
      });
    } catch (e) { console.warn('Substitution log failed:', e); }
  };

  const handleFinish = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.push({
      pathname: '/review',
      params: {
        setsLogged:  String(loggedCount),
        totalSets:   String(totalSets),
        sessionType: sessionType,
        week:        String(week),
      },
    } as any);
  };

  // ── Injury warnings ──────────────────────────────────────────────────────────
  const warnings = todaySession ? getInjuryWarnings(todaySession, injuryFlags) : [];

  // ── Loading guard ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.safe}>

      {/* ── Thin progress bar at very top ── */}
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${progressPct}%` as any }]} />
      </View>

      {/* ── Scrollable content ── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ── SESSION HEADER ── */}
        <View style={s.sessionHeader}>
          <Text style={s.contextLine}>
            {blockLabel} BLOCK {block}  ·  WEEK {week}  ·  DAY {dayNum}
          </Text>
          <Text style={s.sessionTitle}>{sessionType}</Text>
          {sessionObj ? <Text style={s.sessionObj}>{sessionObj}</Text> : null}
        </View>

        {/* ── INJURY WARNING BANNERS ── */}
        {warnings.map((w, i) => (
          <View key={i} style={s.injuryBanner}>
            <MaterialCommunityIcons name="alert" size={15} color="#FFF" />
            <Text style={s.injuryBannerText}>{w}</Text>
          </View>
        ))}

        {/* ── COACH NOTE CARD ── */}
        <View style={s.coachCard}>
          <View style={s.coachHeader}>
            <View style={s.coachAvatar}>
              <Text style={s.coachAvatarIcon}>✦</Text>
            </View>
            <Text style={s.coachLabel}>COACH NOTE</Text>
          </View>
          <Text style={s.coachText}>{coachNote}</Text>
        </View>

        {/* ── WARM-UP SECTION ── */}
        <TouchableOpacity
          style={s.warmupBar}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setWarmupExpanded(e => !e);
          }}
          activeOpacity={0.8}
        >
          <View style={s.warmupBarLeft}>
            <MaterialCommunityIcons name="run-fast" size={17} color={COLORS.text.secondary} />
            <Text style={s.warmupBarTitle}>Upper Body Warm-Up Protocol</Text>
          </View>
          <View style={s.warmupBarRight}>
            <View style={s.warmupDurationBadge}>
              <Text style={s.warmupDurationText}>8–10 min</Text>
            </View>
            <MaterialCommunityIcons
              name={warmupExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={COLORS.text.muted}
            />
          </View>
        </TouchableOpacity>

        {warmupExpanded && (
          <View style={s.warmupContent}>
            {WARMUP_STEPS.map((step, i) => (
              <View key={i} style={s.warmupStep}>
                <View style={s.warmupStepNum}>
                  <Text style={s.warmupStepNumText}>{i + 1}</Text>
                </View>
                <View style={s.warmupStepInfo}>
                  <View style={s.warmupStepTop}>
                    <Text style={s.warmupStepName}>{step.name}</Text>
                    <Text style={s.warmupStepSets}>{step.sets}</Text>
                  </View>
                  <Text style={s.warmupStepNote}>{step.note}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── REST TIMER ── */}
        <RestTimerBar
          running={timerRunning}
          seconds={timerSeconds}
          onToggle={() => setTimerRunning(r => !r)}
          onReset={() => { setTimerRunning(false); setTimerSeconds(0); }}
        />

        {/* ── EXERCISES LABEL ── */}
        <Text style={s.sectionLabel}>EXERCISES</Text>

        {/* ── EXERCISE CARDS ── */}
        {EXERCISES.map(ex => (
          <ExerciseCard
            key={ex.id}
            exercise={ex}
            expanded={expanded.has(ex.id)}
            loggedSets={loggedSets}
            painSets={painSets}
            onToggle={() => handleToggleExpand(ex.id)}
            onLog={handleLog}
            onPain={handlePain}
            onAdjust={openAdjust}
            swap={swaps[ex.id]}
          />
        ))}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      {/* ── FIXED BOTTOM BAR ── */}
      <View style={s.bottomBar}>
        <View style={s.bottomLeft}>
          <Text style={s.setsCount}>{loggedCount}/{totalSets}</Text>
          <Text style={s.setsLabel}>sets logged</Text>
          <View style={s.pctPill}>
            <Text style={s.pctText}>{Math.round(progressPct)}%</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.finishBtn, !canFinish && s.finishBtnDisabled]}
          onPress={canFinish ? handleFinish : undefined}
          activeOpacity={canFinish ? 0.85 : 1}
        >
          <Text style={[s.finishBtnText, !canFinish && s.finishBtnTextDisabled]}>
            FINISH SESSION
          </Text>
          <MaterialCommunityIcons
            name="flag-checkered"
            size={16}
            color={canFinish ? COLORS.primary : COLORS.text.muted}
          />
        </TouchableOpacity>
      </View>

      {/* ── ADJUST EXERCISE MODAL ── */}
      <AdjustModal
        visible={modalVisible}
        exerciseKey={adjustKey}
        exerciseName={adjustName}
        onClose={() => setModal(false)}
        onConfirm={handleConfirmSwap}
      />
    </SafeAreaView>
  );
}

// ── Main Styles ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: COLORS.background },
  loading:      { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  scroll:       { flex: 1 },
  scrollContent:{ paddingBottom: SPACING.xl },

  // Progress bar
  progressTrack:{ height: 3, backgroundColor: COLORS.surfaceHighlight, width: '100%' },
  progressFill: { height: 3, backgroundColor: COLORS.accent },

  // Session header
  sessionHeader:{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl, paddingBottom: SPACING.lg },
  contextLine:  { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.accent, letterSpacing: 2, marginBottom: SPACING.sm },
  sessionTitle: { fontSize: 26, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 32, marginBottom: SPACING.sm },
  sessionObj:   { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, lineHeight: 20 },

  // Injury banners
  injuryBanner:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#8B2222', borderRadius: RADIUS.md, padding: SPACING.md, marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, gap: SPACING.sm },
  injuryBannerText: { color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, flex: 1, lineHeight: 18 },

  // Coach note card — gold left border
  coachCard:    { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderLeftWidth: 3, borderLeftColor: COLORS.accent, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg },
  coachHeader:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  coachAvatar:  { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.accent + '25', justifyContent: 'center', alignItems: 'center' },
  coachAvatarIcon:{ fontSize: 13, color: COLORS.accent },
  coachLabel:   { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.accent, letterSpacing: 1.5 },
  coachText:    { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 22 },

  // Warm-up section
  warmupBar:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: SPACING.lg, marginBottom: 0, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  warmupBarLeft:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 },
  warmupBarRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  warmupBarTitle: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.text.secondary },
  warmupDurationBadge: { backgroundColor: COLORS.surfaceHighlight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  warmupDurationText:  { fontSize: 10, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy },
  warmupContent:  { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderBottomLeftRadius: RADIUS.lg, borderBottomRightRadius: RADIUS.lg, borderWidth: 1, borderTopWidth: 0, borderColor: COLORS.border, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, marginBottom: SPACING.sm },
  warmupStep:     { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, paddingTop: SPACING.md },
  warmupStepNum:  { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.surfaceHighlight, justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  warmupStepNumText: { fontSize: 11, fontWeight: FONTS.weights.heavy, color: COLORS.accent },
  warmupStepInfo: { flex: 1 },
  warmupStepTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  warmupStepName: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary, flex: 1 },
  warmupStepSets: { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontWeight: FONTS.weights.heavy },
  warmupStepNote: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, lineHeight: 16 },

  // Exercises section label
  sectionLabel:  { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2, paddingHorizontal: SPACING.lg, marginTop: SPACING.md, marginBottom: SPACING.sm },

  // Bottom bar
  bottomBar:     { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: SPACING.md },
  bottomLeft:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 },
  setsCount:     { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  setsLabel:     { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },
  pctPill:       { backgroundColor: COLORS.surfaceHighlight, paddingHorizontal: 7, paddingVertical: 3, borderRadius: RADIUS.full },
  pctText:       { fontSize: 10, color: COLORS.accent, fontWeight: FONTS.weights.heavy },
  finishBtn:     {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.accent, borderRadius: RADIUS.lg, paddingVertical: 13,
    paddingHorizontal: SPACING.lg, gap: SPACING.sm,
    shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  finishBtnDisabled: { backgroundColor: COLORS.surfaceHighlight, shadowOpacity: 0 },
  finishBtnText:     { color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, letterSpacing: 1 },
  finishBtnTextDisabled: { color: COLORS.text.muted },
});

// ── AdjustModal Styles ────────────────────────────────────────────────────────
const m = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: '85%' },
  handleWrap:     { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn:        { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  headerCenter:   { flex: 1, alignItems: 'center' },
  headerTitle:    { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  headerSub:      { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontWeight: FONTS.weights.semibold, marginTop: 2 },
  closeBtn:       { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  body:           { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  prompt:         { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: SPACING.md },
  pillGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  reasonPill:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.primary },
  reasonPillActive:   { borderColor: COLORS.accent, backgroundColor: COLORS.accent },
  reasonPillText:     { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.text.secondary },
  reasonPillTextActive: { color: COLORS.primary },
  reasonChip:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceHighlight, alignSelf: 'flex-start', marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.accent + '55' },
  reasonChipText: { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontWeight: FONTS.weights.semibold },
  altList:        { gap: SPACING.sm, marginBottom: SPACING.lg },
  altCard:        { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1.5, borderColor: COLORS.border, gap: SPACING.sm },
  altCardSelected:{ borderColor: COLORS.accent, backgroundColor: COLORS.surface },
  altRankBadge:   { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.surfaceHighlight, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  altRankText:    { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.accent },
  altInfo:        { flex: 1 },
  altName:        { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.primary, marginBottom: 3 },
  altNameSelected:{ color: COLORS.accent },
  altEquipRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  altEquip:       { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  altIntentNote:  { fontSize: FONTS.sizes.xs, color: COLORS.text.secondary, lineHeight: 16, fontStyle: 'italic' },
  altRadio:       { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  altRadioSelected:{ borderColor: COLORS.accent },
  altRadioInner:  { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.accent },
  confirmBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accent, borderRadius: RADIUS.lg, paddingVertical: 15, gap: SPACING.sm },
  confirmBtnDisabled: { backgroundColor: COLORS.surfaceHighlight },
  confirmBtnText:     { color: COLORS.primary, fontWeight: FONTS.weights.heavy, fontSize: FONTS.sizes.base, letterSpacing: 1 },
  confirmBtnTextDisabled: { color: COLORS.text.muted },
});
