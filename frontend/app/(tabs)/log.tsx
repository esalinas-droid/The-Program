import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  TextInput, KeyboardAvoidingView, Platform, Modal, Animated,
  Pressable, FlatList, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, FONTS, RADIUS, getSessionStyle } from '../../src/constants/theme';
import { getProfile } from '../../src/utils/storage';
import { logApi, programApi } from '../../src/utils/api';
import { getTodayDayName, getTodaySession } from '../../src/data/programData';

// ── Palette ───────────────────────────────────────────────────────────────────
const TEAL  = '#4DCEA6';
const BLUE  = '#5B9CF5';
const AMBER = '#F5A623';

// ── Types ─────────────────────────────────────────────────────────────────────
type SetType = 'warmup' | 'work';

interface SetData {
  id: string;
  type: SetType;
  targetWeight: number;
  targetReps: string;
  actualWeight: string;   // TextInput value
  actualReps: string;
  rpe: number;
  pain: number;           // 0-4
  logged: boolean;
}

interface HistoryEntry {
  date: string;
  sets: string;
  avgRPE: string;
  volume: number;
}

interface ExerciseLog {
  id: string;
  name: string;
  prescription: string;
  lastRef: string;        // "225×8, 225×7, 225×6"
  sets: SetData[];
  notes: string;
  notesExpanded: boolean;
  expanded: boolean;
  history: HistoryEntry[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseTargetReps(reps: string): number {
  if (reps.includes('-')) {
    const [lo, hi] = reps.split('-').map(Number);
    return Math.round((lo + hi) / 2);
  }
  return parseInt(reps) || 8;
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function mkSet(id: string, type: SetType, w: number, reps: string): SetData {
  return {
    id, type,
    targetWeight: w, targetReps: reps,
    actualWeight: String(w),
    actualReps:   String(parseTargetReps(reps)),
    rpe: 7, pain: 0, logged: false,
  };
}

// ── Mock Session Exercises ────────────────────────────────────────────────────
const INITIAL_EXERCISES: ExerciseLog[] = [
  {
    id: 'floor-press', name: 'Floor Press', prescription: '4×6-8',
    lastRef: '225×8,  225×8,  225×7,  225×6',
    expanded: true, notes: '', notesExpanded: false,
    sets: [
      mkSet('fp-1', 'warmup', 95,  '8'),
      mkSet('fp-2', 'warmup', 135, '5'),
      mkSet('fp-3', 'warmup', 185, '3'),
      mkSet('fp-4', 'work',   225, '6-8'),
      mkSet('fp-5', 'work',   225, '6-8'),
      mkSet('fp-6', 'work',   225, '6-8'),
      mkSet('fp-7', 'work',   225, '6-8'),
    ],
    history: [
      { date: 'Week 1 · Mon', sets: '4×6-8 @ 215 lbs', avgRPE: '7.0', volume: 5160 },
      { date: 'Week 2 · Mon', sets: '4×6-8 @ 220 lbs', avgRPE: '7.5', volume: 5280 },
      { date: 'Week 3 · Mon', sets: '4×8 @ 225 lbs',   avgRPE: '7.8', volume: 7200 },
      { date: 'Week 4 · Mon', sets: '4×7 @ 225 lbs',   avgRPE: '8.0', volume: 6300 },
    ],
  },
  {
    id: 'pendlay-row', name: 'Pendlay Row', prescription: '4×6-8',
    lastRef: '185×8,  185×8,  185×7,  185×6',
    expanded: false, notes: '', notesExpanded: false,
    sets: [
      mkSet('pr-1', 'work', 185, '6-8'),
      mkSet('pr-2', 'work', 185, '6-8'),
      mkSet('pr-3', 'work', 185, '6-8'),
      mkSet('pr-4', 'work', 185, '6-8'),
    ],
    history: [
      { date: 'Week 1 · Mon', sets: '4×6 @ 175 lbs', avgRPE: '7.0', volume: 4200 },
      { date: 'Week 2 · Mon', sets: '4×7 @ 180 lbs', avgRPE: '7.5', volume: 5040 },
      { date: 'Week 3 · Mon', sets: '4×8 @ 185 lbs', avgRPE: '7.8', volume: 5920 },
      { date: 'Week 4 · Mon', sets: '4×7 @ 185 lbs', avgRPE: '8.0', volume: 5180 },
    ],
  },
  {
    id: 'incline-db', name: 'Incline DB Press', prescription: '3×10-12',
    lastRef: '70×12,  70×11,  70×10',
    expanded: false, notes: '', notesExpanded: false,
    sets: [
      mkSet('idp-1', 'work', 70, '10-12'),
      mkSet('idp-2', 'work', 70, '10-12'),
      mkSet('idp-3', 'work', 70, '10-12'),
    ],
    history: [
      { date: 'Week 1 · Mon', sets: '3×10 @ 65 lbs', avgRPE: '7.5', volume: 1950 },
      { date: 'Week 2 · Mon', sets: '3×11 @ 67.5 lbs', avgRPE: '7.8', volume: 2228 },
      { date: 'Week 3 · Mon', sets: '3×12 @ 70 lbs',   avgRPE: '8.0', volume: 2520 },
      { date: 'Week 4 · Mon', sets: '3×11 @ 70 lbs',   avgRPE: '8.2', volume: 2310 },
    ],
  },
  {
    id: 'tricep-pushdown', name: 'Tricep Pushdown', prescription: '3×15-20',
    lastRef: '100×18,  100×17,  100×15',
    expanded: false, notes: '', notesExpanded: false,
    sets: [
      mkSet('tp-1', 'work', 100, '15-20'),
      mkSet('tp-2', 'work', 100, '15-20'),
      mkSet('tp-3', 'work', 100, '15-20'),
    ],
    history: [
      { date: 'Week 1', sets: '3×15 @ 90 lbs', avgRPE: '6.5', volume: 4050 },
      { date: 'Week 2', sets: '3×17 @ 95 lbs', avgRPE: '7.0', volume: 4845 },
      { date: 'Week 3', sets: '3×18 @ 100 lbs', avgRPE: '7.2', volume: 5400 },
      { date: 'Week 4', sets: '3×17 @ 100 lbs', avgRPE: '7.5', volume: 5100 },
    ],
  },
  {
    id: 'face-pull', name: 'Face Pull', prescription: '3×15-20',
    lastRef: '45×20,  45×20,  45×18',
    expanded: false, notes: '', notesExpanded: false,
    sets: [
      mkSet('fp2-1', 'work', 45, '15-20'),
      mkSet('fp2-2', 'work', 45, '15-20'),
      mkSet('fp2-3', 'work', 45, '15-20'),
    ],
    history: [
      { date: 'Week 1', sets: '3×20 @ 40 lbs', avgRPE: '5.5', volume: 2400 },
      { date: 'Week 2', sets: '3×20 @ 45 lbs', avgRPE: '6.0', volume: 2700 },
      { date: 'Week 3', sets: '3×20 @ 45 lbs', avgRPE: '5.8', volume: 2700 },
      { date: 'Week 4', sets: '3×20 @ 45 lbs', avgRPE: '6.0', volume: 2700 },
    ],
  },
];

const REST_OPTIONS = [60, 90, 120, 180, 300];
const PAIN_LABELS  = ['None', 'Aware', 'Mild', 'Modify', 'Stop'];
const PAIN_COLORS  = [TEAL, '#AED6F1', AMBER, '#E67E22', '#EF5350'];
const RPE_VALUES   = [6, 7, 8, 9, 10];

// ── PainModal ─────────────────────────────────────────────────────────────────
function PainModal({ visible, currentPain, onSelect, onClose }: {
  visible: boolean; currentPain: number;
  onSelect: (p: number) => void; onClose: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(300)).current;
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : 300,
      useNativeDriver: true, damping: 20, stiffness: 300,
    }).start();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={pm.overlay} onPress={onClose}>
        <Animated.View style={[pm.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <Pressable onPress={e => e.stopPropagation()}>
            <View style={pm.handle}><View style={pm.handleBar} /></View>
            <Text style={pm.title}>PAIN LEVEL</Text>
            {PAIN_LABELS.map((label, i) => (
              <TouchableOpacity
                key={i} style={[pm.option, currentPain === i && { borderColor: PAIN_COLORS[i], backgroundColor: PAIN_COLORS[i] + '20' }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSelect(i); onClose(); }}
                activeOpacity={0.8}
              >
                <View style={[pm.dot, { backgroundColor: PAIN_COLORS[i] }]} />
                <View style={pm.optLabel}>
                  <Text style={[pm.optNum, { color: PAIN_COLORS[i] }]}>{i}</Text>
                  <Text style={[pm.optText, currentPain === i && { color: PAIN_COLORS[i] }]}>{label}</Text>
                </View>
                {currentPain === i && <MaterialCommunityIcons name="check" size={18} color={PAIN_COLORS[i]} />}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
const pm = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet:    { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 },
  handle:   { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handleBar:{ width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  title:    { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2, paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  option:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.md, borderWidth: 0 },
  dot:      { width: 10, height: 10, borderRadius: 5 },
  optLabel: { flex: 1, flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  optNum:   { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, width: 32 },
  optText:  { fontSize: FONTS.sizes.base, color: COLORS.text.secondary, fontWeight: FONTS.weights.semibold },
});

// ── HistoryDrawer ─────────────────────────────────────────────────────────────
function HistoryDrawer({ exercise, visible, onClose }: {
  exercise: ExerciseLog | null; visible: boolean; onClose: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(400)).current;
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : 400,
      useNativeDriver: true, damping: 20, stiffness: 260,
    }).start();
  }, [visible]);

  if (!exercise) return null;
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={hd.overlay} onPress={onClose}>
        <Animated.View style={[hd.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <Pressable onPress={e => e.stopPropagation()}>
            <View style={hd.handleRow}><View style={hd.handleBar} /></View>
            <View style={hd.header}>
              <View>
                <Text style={hd.exerciseName}>{exercise.name}</Text>
                <Text style={hd.subLabel}>Last 4 sessions</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={hd.closeBtn}>
                <MaterialCommunityIcons name="close" size={20} color={COLORS.text.muted} />
              </TouchableOpacity>
            </View>
            {exercise.history.map((entry, i) => (
              <View key={i} style={[hd.entryRow, i < exercise.history.length - 1 && hd.entryBorder]}>
                <Text style={hd.entryDate}>{entry.date}</Text>
                <View style={hd.entryRight}>
                  <Text style={hd.entrySets}>{entry.sets}</Text>
                  <View style={hd.entryMeta}>
                    <Text style={hd.entryRPE}>RPE {entry.avgRPE}</Text>
                    <Text style={hd.entryVol}>{(entry.volume / 1000).toFixed(1)}k vol</Text>
                  </View>
                </View>
              </View>
            ))}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
const hd = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 },
  handleRow:   { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handleBar:   { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  exerciseName:{ fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  subLabel:    { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 2 },
  closeBtn:    { padding: SPACING.sm },
  entryRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: SPACING.md },
  entryBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  entryDate:   { width: 100, fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },
  entryRight:  { flex: 1 },
  entrySets:   { fontSize: FONTS.sizes.sm, color: COLORS.text.primary, fontWeight: FONTS.weights.semibold, marginBottom: 3 },
  entryMeta:   { flexDirection: 'row', gap: SPACING.md },
  entryRPE:    { fontSize: FONTS.sizes.xs, color: COLORS.accent },
  entryVol:    { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
});

// ── TimerConfigModal ──────────────────────────────────────────────────────────
function TimerConfigModal({ visible, current, onSelect, onClose }: {
  visible: boolean; current: number; onSelect: (s: number) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={tc.overlay} onPress={onClose}>
        <View style={tc.card}>
          <Text style={tc.title}>REST DURATION</Text>
          <View style={tc.optRow}>
            {REST_OPTIONS.map(s => (
              <TouchableOpacity
                key={s}
                style={[tc.opt, current === s && tc.optActive]}
                onPress={() => { onSelect(s); onClose(); }}
                activeOpacity={0.8}
              >
                <Text style={[tc.optText, current === s && tc.optTextActive]}>
                  {s < 60 ? `${s}s` : `${s / 60}m`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}
const tc = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  card:         { width: '100%', backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.xl, borderWidth: 1, borderColor: COLORS.border },
  title:        { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2, marginBottom: SPACING.lg, textAlign: 'center' },
  optRow:       { flexDirection: 'row', gap: SPACING.sm, justifyContent: 'center' },
  opt:          { flex: 1, paddingVertical: 12, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceHighlight, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  optActive:    { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  optText:      { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, color: COLORS.text.secondary },
  optTextActive:{ color: COLORS.primary },
});

// ── SetRow ─────────────────────────────────────────────────────────────────────
function SetRow({ set, index, onUpdate, onLog, onPain }: {
  set: SetData; index: number;
  onUpdate: (field: 'actualWeight' | 'actualReps' | 'rpe', val: string | number) => void;
  onLog: () => void;
  onPain: () => void;
}) {
  const circleColor = set.logged
    ? TEAL
    : set.type === 'warmup' ? '#666666' : COLORS.accent;

  if (set.logged) {
    return (
      <View style={sr.rowDone}>
        <View style={[sr.circle, { backgroundColor: TEAL + '22', borderColor: TEAL }]}>
          <MaterialCommunityIcons name="check" size={11} color={TEAL} />
        </View>
        <Text style={sr.doneSummary}>
          {set.actualWeight} × {set.actualReps}  @  RPE {set.rpe}
          {set.pain > 0 && <Text style={sr.painBadge}>  🔴 Pain {set.pain}</Text>}
        </Text>
        <MaterialCommunityIcons name="check-circle" size={20} color={TEAL} />
      </View>
    );
  }

  return (
    <View style={sr.row}>
      {/* Set number circle */}
      <View style={[sr.circle, { backgroundColor: circleColor + '20', borderColor: circleColor }]}>
        <Text style={[sr.circleNum, { color: circleColor }]}>{index + 1}</Text>
      </View>

      {/* Target reference */}
      <Text style={sr.target}>
        {set.targetWeight} × {set.targetReps}
      </Text>

      {/* Weight input */}
      <View style={sr.inputWrap}>
        <TextInput
          style={sr.input}
          value={set.actualWeight}
          onChangeText={v => onUpdate('actualWeight', v.replace(/[^0-9.]/g, ''))}
          keyboardType="numeric"
          selectTextOnFocus
        />
        <Text style={sr.inputUnit}>lb</Text>
      </View>

      <Text style={sr.timesSign}>×</Text>

      {/* Reps input */}
      <View style={sr.repsWrap}>
        <TextInput
          style={sr.repsInput}
          value={set.actualReps}
          onChangeText={v => onUpdate('actualReps', v.replace(/[^0-9]/g, ''))}
          keyboardType="numeric"
          selectTextOnFocus
        />
      </View>

      {/* Pain button */}
      <TouchableOpacity onPress={onPain} style={sr.painBtn} activeOpacity={0.7}>
        <MaterialCommunityIcons
          name="alert-circle-outline"
          size={18}
          color={set.pain > 0 ? PAIN_COLORS[set.pain] : COLORS.border}
        />
      </TouchableOpacity>

      {/* Log button */}
      <TouchableOpacity onPress={onLog} style={sr.logBtn} activeOpacity={0.8}>
        <Text style={sr.logBtnText}>LOG</Text>
      </TouchableOpacity>
    </View>
  );
}

// RPE pills row shown below each unlogged set group
function RPERow({ setId, rpe, onRPEChange }: {
  setId: string; rpe: number; onRPEChange: (v: number) => void;
}) {
  return (
    <View style={sr.rpeRow}>
      <Text style={sr.rpeLabel}>RPE</Text>
      {RPE_VALUES.map(v => (
        <TouchableOpacity
          key={v}
          style={[sr.rpePill, rpe === v && sr.rpePillActive]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onRPEChange(v); }}
          activeOpacity={0.7}
        >
          <Text style={[sr.rpePillText, rpe === v && sr.rpePillTextActive]}>{v}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const sr = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, gap: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border + '55' },
  rowDone:    { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, gap: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border + '55', opacity: 0.7 },
  circle:     { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  circleNum:  { fontSize: 11, fontWeight: FONTS.weights.heavy },
  target:     { fontSize: 11, color: COLORS.text.muted, width: 60, flexShrink: 0 },
  inputWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.accent + '60', paddingHorizontal: 6, height: 40, minWidth: 62 },
  input:      { color: COLORS.accent, fontWeight: FONTS.weights.heavy, fontSize: FONTS.sizes.base, minWidth: 38, textAlign: 'center' },
  inputUnit:  { fontSize: 9, color: COLORS.text.muted, marginLeft: 2 },
  timesSign:  { fontSize: FONTS.sizes.base, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy },
  repsWrap:   { backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.accent + '60', paddingHorizontal: 8, height: 40, justifyContent: 'center', minWidth: 46 },
  repsInput:  { color: COLORS.accent, fontWeight: FONTS.weights.heavy, fontSize: FONTS.sizes.base, textAlign: 'center' },
  painBtn:    { width: 36, height: 40, justifyContent: 'center', alignItems: 'center' },
  logBtn:     { backgroundColor: COLORS.accent, paddingHorizontal: 10, paddingVertical: 8, borderRadius: RADIUS.md, minWidth: 46, alignItems: 'center', height: 40, justifyContent: 'center' },
  logBtnText: { color: COLORS.primary, fontSize: 11, fontWeight: FONTS.weights.heavy, letterSpacing: 1 },
  doneSummary:{ flex: 1, fontSize: FONTS.sizes.sm, color: TEAL, fontWeight: FONTS.weights.semibold },
  painBadge:  { color: '#EF5350', fontSize: FONTS.sizes.xs },
  // RPE row
  rpeRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 5, paddingLeft: 32 },
  rpeLabel:   { fontSize: 10, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy, letterSpacing: 1, marginRight: 2, width: 28 },
  rpePill:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceHighlight, borderWidth: 1, borderColor: COLORS.border },
  rpePillActive:    { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  rpePillText:      { fontSize: 11, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted },
  rpePillTextActive:{ color: COLORS.primary },
});

// ── ExerciseCard ───────────────────────────────────────────────────────────────
function ExerciseCard({ ex, onToggleExpand, onUpdateSet, onLogSet, onOpenPain,
  onAddSet, onToggleNotes, onNoteChange, onOpenHistory, onUpdateRPE }: {
  ex: ExerciseLog;
  onToggleExpand: () => void;
  onUpdateSet: (setId: string, field: 'actualWeight' | 'actualReps', val: string) => void;
  onLogSet: (setId: string) => void;
  onOpenPain: (setId: string) => void;
  onAddSet: () => void;
  onToggleNotes: () => void;
  onNoteChange: (text: string) => void;
  onOpenHistory: () => void;
  onUpdateRPE: (setId: string, rpe: number) => void;
}) {
  const loggedCount = ex.sets.filter(s => s.logged).length;
  const total       = ex.sets.length;
  const allDone     = loggedCount === total;
  const progColor   = allDone ? TEAL : loggedCount > 0 ? COLORS.accent : COLORS.text.muted;

  return (
    <View style={ec.card}>
      {/* ── Header (always visible) ── */}
      <TouchableOpacity style={ec.header} onPress={onToggleExpand} activeOpacity={0.8}>
        <View style={ec.headerLeft}>
          <Text style={ec.name} numberOfLines={1}>{ex.name}</Text>
          <Text style={ec.prescription}>{ex.prescription}</Text>
        </View>
        <View style={ec.headerRight}>
          <View style={[ec.progressPill, { backgroundColor: progColor + '22' }]}>
            <Text style={[ec.progressText, { color: progColor }]}>{loggedCount}/{total}</Text>
          </View>
          <MaterialCommunityIcons
            name={ex.expanded ? 'chevron-up' : 'chevron-down'}
            size={20} color={COLORS.text.muted}
          />
        </View>
      </TouchableOpacity>

      {/* Last session reference (tappable → history drawer) */}
      <TouchableOpacity style={ec.lastRow} onPress={onOpenHistory} activeOpacity={0.75}>
        <MaterialCommunityIcons name="history" size={13} color={COLORS.text.muted} />
        <Text style={ec.lastText}>Last: {ex.lastRef}</Text>
        <MaterialCommunityIcons name="chevron-right" size={13} color={COLORS.text.muted} />
      </TouchableOpacity>

      {/* ── Expanded body ── */}
      {ex.expanded && (
        <View style={ec.body}>
          {ex.sets.map((set, idx) => (
            <React.Fragment key={set.id}>
              <SetRow
                set={set}
                index={idx}
                onUpdate={(field, val) => onUpdateSet(set.id, field as any, String(val))}
                onLog={() => onLogSet(set.id)}
                onPain={() => onOpenPain(set.id)}
              />
              {/* RPE row shown for unlogged sets only */}
              {!set.logged && (
                <RPERow
                  setId={set.id}
                  rpe={set.rpe}
                  onRPEChange={v => onUpdateRPE(set.id, v)}
                />
              )}
            </React.Fragment>
          ))}

          {/* Exercise controls */}
          <View style={ec.controlsRow}>
            <TouchableOpacity style={ec.ctrlBtn} onPress={onAddSet} activeOpacity={0.8}>
              <MaterialCommunityIcons name="plus" size={14} color={COLORS.accent} />
              <Text style={ec.ctrlBtnText}>Add Set</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ec.ctrlBtn} onPress={onToggleNotes} activeOpacity={0.8}>
              <MaterialCommunityIcons name="pencil-outline" size={14} color={COLORS.text.muted} />
              <Text style={[ec.ctrlBtnText, { color: COLORS.text.muted }]}>
                {ex.notesExpanded ? 'Hide Notes' : 'Notes'}
              </Text>
            </TouchableOpacity>
          </View>

          {ex.notesExpanded && (
            <TextInput
              style={ec.notesInput}
              value={ex.notes}
              onChangeText={onNoteChange}
              placeholder="Exercise notes..."
              placeholderTextColor={COLORS.text.muted}
              multiline
            />
          )}

          {/* Pain summary if any sets flagged */}
          {ex.sets.some(s => s.pain > 0) && (
            <View style={ec.painSummary}>
              <MaterialCommunityIcons name="alert-circle" size={13} color={AMBER} />
              <Text style={ec.painSummaryText}>
                Pain flagged on {ex.sets.filter(s => s.pain > 0).length} set(s) — review before next session
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
const ec = StyleSheet.create({
  card:         { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  headerLeft:   { flex: 1, gap: 2 },
  name:         { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  prescription: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },
  headerRight:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  progressPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  progressText: { fontSize: 11, fontWeight: FONTS.weights.heavy },
  lastRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  lastText:     { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontStyle: 'italic', flex: 1 },
  body:         { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md },
  controlsRow:  { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  ctrlBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: SPACING.md, backgroundColor: COLORS.accent + '15', borderRadius: RADIUS.md },
  ctrlBtnText:  { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontWeight: FONTS.weights.heavy },
  notesInput:   { backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.md, padding: SPACING.sm, color: COLORS.text.primary, fontSize: FONTS.sizes.sm, marginTop: SPACING.sm, minHeight: 64, textAlignVertical: 'top', borderWidth: 1, borderColor: COLORS.border },
  painSummary:  { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: SPACING.sm, backgroundColor: AMBER + '15', borderRadius: RADIUS.md, padding: SPACING.sm },
  painSummaryText: { fontSize: FONTS.sizes.xs, color: AMBER, flex: 1, lineHeight: 16 },
});

// ── RestTimerBar (fixed above session bar) ────────────────────────────────────
function RestTimerBar({ active, seconds, total, onToggle, onReset, onConfig }: {
  active: boolean; seconds: number; total: number;
  onToggle: () => void; onReset: () => void; onConfig: () => void;
}) {
  const pct      = total > 0 ? Math.max(0, seconds / total) : 0;
  const expired  = active && seconds === 0;
  const timeColor = expired ? TEAL : seconds <= 15 ? AMBER : COLORS.accent;

  if (!active && seconds === total) return null; // not started yet

  return (
    <View style={rtb.bar}>
      {/* Timer display */}
      <View style={rtb.left}>
        <MaterialCommunityIcons name="timer-sand" size={16} color={timeColor} />
        <Text style={rtb.restLabel}>REST</Text>
        {expired
          ? <Text style={[rtb.time, { color: TEAL }]}>DONE ✓</Text>
          : <Text style={[rtb.time, { color: timeColor }]}>{formatDuration(seconds)}</Text>
        }
      </View>

      {/* Progress track */}
      <View style={rtb.progressTrack}>
        <View style={[rtb.progressFill, { width: `${pct * 100}%` as any, backgroundColor: timeColor }]} />
      </View>

      {/* Controls */}
      <View style={rtb.controls}>
        <TouchableOpacity onPress={onToggle} style={rtb.ctrlBtn} activeOpacity={0.75}>
          <MaterialCommunityIcons name={active ? 'pause' : 'play'} size={20} color={COLORS.accent} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onReset} style={rtb.ctrlBtn} activeOpacity={0.75}>
          <MaterialCommunityIcons name="refresh" size={18} color={COLORS.text.muted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onConfig} style={rtb.ctrlBtn} activeOpacity={0.75}>
          <MaterialCommunityIcons name="cog-outline" size={16} color={COLORS.text.muted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
const rtb = StyleSheet.create({
  bar:          { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: SPACING.sm },
  left:         { flexDirection: 'row', alignItems: 'center', gap: 5, width: 110 },
  restLabel:    { fontSize: 9, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.5 },
  time:         { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, fontVariant: ['tabular-nums'] as any },
  progressTrack:{ flex: 1, height: 4, backgroundColor: COLORS.surfaceHighlight, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  controls:     { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ctrlBtn:      { padding: 6 },
});

// ── SessionBar (fixed bottom) ─────────────────────────────────────────────────
function SessionBar({ loggedSets, totalSets, durationSecs, onFinish }: {
  loggedSets: number; totalSets: number;
  durationSecs: number; onFinish: () => void;
}) {
  const pct      = totalSets > 0 ? (loggedSets / totalSets) * 100 : 0;
  const canFinish = pct >= 50;

  return (
    <View style={sb.bar}>
      {/* Sets + duration */}
      <View style={sb.left}>
        <Text style={sb.sets}>{loggedSets}<Text style={sb.setsDenom}>/{totalSets}</Text></Text>
        <Text style={sb.setsLabel}>sets</Text>
        {durationSecs > 0 && (
          <View style={sb.durationPill}>
            <MaterialCommunityIcons name="clock-outline" size={11} color={COLORS.text.muted} />
            <Text style={sb.durationText}>{formatDuration(durationSecs)}</Text>
          </View>
        )}
      </View>

      {/* Finish button */}
      <TouchableOpacity
        style={[sb.finishBtn, !canFinish && sb.finishBtnOff]}
        onPress={canFinish ? onFinish : undefined}
        activeOpacity={canFinish ? 0.85 : 1}
      >
        <MaterialCommunityIcons name="flag-checkered" size={16} color={canFinish ? COLORS.primary : COLORS.text.muted} />
        <Text style={[sb.finishText, !canFinish && sb.finishTextOff]}>FINISH SESSION</Text>
      </TouchableOpacity>
    </View>
  );
}
const sb = StyleSheet.create({
  bar:          { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: SPACING.md },
  left:         { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 },
  sets:         { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  setsDenom:    { fontSize: FONTS.sizes.base, color: COLORS.text.muted },
  setsLabel:    { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },
  durationPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.surfaceHighlight, paddingHorizontal: 7, paddingVertical: 3, borderRadius: RADIUS.full },
  durationText: { fontSize: 10, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },
  finishBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accent, borderRadius: RADIUS.lg, paddingVertical: 12, paddingHorizontal: SPACING.lg, gap: SPACING.sm, shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 5 },
  finishBtnOff: { backgroundColor: COLORS.surfaceHighlight, shadowOpacity: 0 },
  finishText:   { color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5 },
  finishTextOff:{ color: COLORS.text.muted },
});

// ── Main LogScreen ─────────────────────────────────────────────────────────────
export default function LogScreen() {
  const [exercises, setExercises] = useState<ExerciseLog[]>(INITIAL_EXERCISES);
  const [week, setWeek]           = useState(1);
  const [sessionType, setSessionType] = useState('ME Upper');
  const [loading, setLoading]     = useState(true);

  // Rest timer
  const [timerActive, setTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerTotal, setTimerTotal]     = useState(90);
  const [restDuration, setRestDuration] = useState(90);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Session duration
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [sessionDuration, setSessionDuration]   = useState(0);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Modals
  const [painTarget, setPainTarget]     = useState<{ exId: string; setId: string } | null>(null);
  const [historyEx, setHistoryEx]       = useState<ExerciseLog | null>(null);
  const [timerConfigVis, setTimerConfigVis] = useState(false);

  // Finish modal
  const [finishVisible, setFinishVisible] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      const prof = await getProfile();
      const week = prof?.currentWeek || 1;
      setWeek(week);

      // Set initial session type from local conjugate schedule (instant, no network needed)
      const localSession = getTodaySession(week);
      setSessionType(localSession.sessionType);

      // Sync session type to today's program plan (overrides local if plan exists)
      try {
        const todayData = await programApi.getTodaySession();
        if (todayData?.session?.sessionType) {
          setSessionType(todayData.session.sessionType);
        }
      } catch { /* Keep local data */ }

      setLoading(false);
    })();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (durationRef.current) clearInterval(durationRef.current);
    };
  }, []));

  // Rest timer countdown
  useEffect(() => {
    if (timerActive && timerSeconds > 0) {
      timerRef.current = setInterval(() => {
        setTimerSeconds(s => {
          if (s <= 1) {
            setTimerActive(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerActive]);

  // Session duration counter
  useEffect(() => {
    if (sessionStartTime) {
      durationRef.current = setInterval(() => {
        setSessionDuration(Math.floor((Date.now() - sessionStartTime) / 1000));
      }, 1000);
    }
    return () => { if (durationRef.current) clearInterval(durationRef.current); };
  }, [sessionStartTime]);

  // ── Computed ─────────────────────────────────────────────────────────────────
  const totalSets  = exercises.reduce((s, ex) => s + ex.sets.length, 0);
  const loggedSets = exercises.reduce((s, ex) => s + ex.sets.filter(set => set.logged).length, 0);

  // ── Exercise mutation helpers ─────────────────────────────────────────────────
  const mutateSet = (exId: string, setId: string, update: Partial<SetData>) =>
    setExercises(prev => prev.map(ex =>
      ex.id !== exId ? ex : { ...ex, sets: ex.sets.map(s => s.id === setId ? { ...s, ...update } : s) }
    ));

  const handleUpdateSet = (exId: string, setId: string, field: 'actualWeight' | 'actualReps', val: string) =>
    mutateSet(exId, setId, { [field]: val });

  const handleUpdateRPE = (exId: string, setId: string, rpe: number) =>
    mutateSet(exId, setId, { rpe });

  const handleLogSet = async (exId: string, setId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ex  = exercises.find(e => e.id === exId);
    const set = ex?.sets.find(s => s.id === setId);
    if (!ex || !set) return;

    mutateSet(exId, setId, { logged: true });

    // Start session timer on first log
    if (!sessionStartTime) setSessionStartTime(Date.now());

    // Start rest timer
    setTimerTotal(restDuration);
    setTimerSeconds(restDuration);
    setTimerActive(true);

    // Save to backend
    try {
      const today = getTodayDayName();
      await logApi.create({
        date: new Date().toISOString().slice(0, 10),
        week, day: today === 'Sunday' ? 'Monday' : today,
        sessionType,
        exercise: ex.name,
        sets: 1,
        weight: parseFloat(set.actualWeight) || set.targetWeight,
        reps: parseInt(set.actualReps) || parseTargetReps(set.targetReps),
        rpe: set.rpe,
        pain: set.pain,
        completed: 'Completed',
      });
    } catch (e) {
      console.warn('Log save failed:', e);
    }
  };

  const handlePainSelect = (pain: number) => {
    if (painTarget) mutateSet(painTarget.exId, painTarget.setId, { pain });
  };

  const handleAddSet = (exId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExercises(prev => prev.map(ex => {
      if (ex.id !== exId) return ex;
      const last = ex.sets[ex.sets.length - 1];
      const newSet: SetData = {
        id: `${exId}-add-${Date.now()}`,
        type: 'work',
        targetWeight: last.targetWeight,
        targetReps: last.targetReps,
        actualWeight: last.actualWeight,
        actualReps: last.actualReps,
        rpe: 7, pain: 0, logged: false,
      };
      return { ...ex, sets: [...ex.sets, newSet] };
    }));
  };

  const handleFinish = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setFinishVisible(true);
  };

  if (loading) return <View style={s.loading}><ActivityIndicator color={COLORS.accent} size="large" /></View>;

  const currentSession = getSessionStyle(sessionType);

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

        {/* ── Scrollable content ── */}
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Session header ── */}
          <View style={s.sessionHeader}>
            <View style={[s.sessionTypeBadge, { backgroundColor: currentSession.bg, borderColor: currentSession.borderColor }]}>
              <Text style={[s.sessionTypeBadgeText, { color: currentSession.text }]}>{sessionType}</Text>
            </View>
            <View style={s.headerText}>
              <Text style={s.headerTitle}>WORKOUT LOG</Text>
              <Text style={s.headerSub}>
                {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                {'  ·  '}Week {week}
              </Text>
            </View>
          </View>

          {/* ── Section label ── */}
          <Text style={s.sectionLabel}>EXERCISES  ·  {exercises.length}</Text>

          {/* ── Exercise Cards ── */}
          {exercises.map(ex => (
            <ExerciseCard
              key={ex.id}
              ex={ex}
              onToggleExpand={() => setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, expanded: !e.expanded } : e))}
              onUpdateSet={(setId, field, val) => handleUpdateSet(ex.id, setId, field, val)}
              onLogSet={(setId) => handleLogSet(ex.id, setId)}
              onOpenPain={(setId) => setPainTarget({ exId: ex.id, setId })}
              onAddSet={() => handleAddSet(ex.id)}
              onToggleNotes={() => setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, notesExpanded: !e.notesExpanded } : e))}
              onNoteChange={(text) => setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, notes: text } : e))}
              onOpenHistory={() => setHistoryEx(ex)}
              onUpdateRPE={(setId, rpe) => handleUpdateRPE(ex.id, setId, rpe)}
            />
          ))}

          <View style={{ height: SPACING.xxl }} />
        </ScrollView>

        {/* ── Rest Timer Bar (shows after first set logged) ── */}
        {sessionStartTime && (
          <RestTimerBar
            active={timerActive}
            seconds={timerSeconds}
            total={timerTotal}
            onToggle={() => setTimerActive(a => !a)}
            onReset={() => { setTimerActive(false); setTimerSeconds(restDuration); setTimerTotal(restDuration); }}
            onConfig={() => setTimerConfigVis(true)}
          />
        )}

        {/* ── Session Bar ── */}
        <SessionBar
          loggedSets={loggedSets}
          totalSets={totalSets}
          durationSecs={sessionDuration}
          onFinish={handleFinish}
        />
      </KeyboardAvoidingView>

      {/* ── Pain Modal ── */}
      <PainModal
        visible={!!painTarget}
        currentPain={
          exercises.find(e => e.id === painTarget?.exId)
            ?.sets.find(s => s.id === painTarget?.setId)?.pain ?? 0
        }
        onSelect={handlePainSelect}
        onClose={() => setPainTarget(null)}
      />

      {/* ── History Drawer ── */}
      <HistoryDrawer
        exercise={historyEx}
        visible={!!historyEx}
        onClose={() => setHistoryEx(null)}
      />

      {/* ── Timer Config Modal ── */}
      <TimerConfigModal
        visible={timerConfigVis}
        current={restDuration}
        onSelect={(s) => { setRestDuration(s); setTimerSeconds(s); setTimerTotal(s); }}
        onClose={() => setTimerConfigVis(false)}
      />

      {/* ── Finish Session Modal ── */}
      <Modal visible={finishVisible} transparent animationType="slide" onRequestClose={() => setFinishVisible(false)}>
        <View style={s.finishOverlay}>
          <View style={s.finishCard}>
            <View style={s.finishHeader}>
              <MaterialCommunityIcons name="flag-checkered" size={28} color={COLORS.accent} />
              <Text style={s.finishTitle}>Session Complete</Text>
            </View>
            <View style={s.finishStats}>
              {[
                ['Sets Logged', `${loggedSets} / ${totalSets}`],
                ['Duration',    formatDuration(sessionDuration)],
                ['Exercises',   String(exercises.length)],
                ['Pain Flags',  String(exercises.reduce((s, ex) => s + ex.sets.filter(set => set.pain > 0).length, 0))],
              ].map(([label, val]) => (
                <View key={label} style={s.finishStatRow}>
                  <Text style={s.finishStatLabel}>{label}</Text>
                  <Text style={s.finishStatValue}>{val}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity
              style={s.finishDoneBtn}
              onPress={() => setFinishVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={s.finishDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Main Styles ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:           { flex: 1, backgroundColor: COLORS.background },
  loading:        { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  scroll:         { flex: 1 },
  scrollContent:  { paddingBottom: SPACING.xl },
  sessionHeader:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md },
  sessionTypeBadge:     { paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1 },
  sessionTypeBadgeText: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5 },
  headerText:     { flex: 1 },
  headerTitle:    { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, letterSpacing: 1 },
  headerSub:      { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 2 },
  sectionLabel:   { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2, paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  // Finish modal
  finishOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  finishCard:     { width: '100%', backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.xl, borderWidth: 1, borderColor: COLORS.accent },
  finishHeader:   { alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.lg },
  finishTitle:    { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  finishStats:    { gap: SPACING.sm, marginBottom: SPACING.lg },
  finishStatRow:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  finishStatLabel:{ fontSize: FONTS.sizes.sm, color: COLORS.text.muted },
  finishStatValue:{ fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, color: COLORS.accent },
  finishDoneBtn:  { backgroundColor: COLORS.accent, borderRadius: RADIUS.lg, paddingVertical: 14, alignItems: 'center' },
  finishDoneBtnText:{ color: COLORS.primary, fontWeight: FONTS.weights.heavy, fontSize: FONTS.sizes.base, letterSpacing: 0.5 },
});
