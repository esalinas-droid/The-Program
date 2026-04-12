import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  TextInput, Modal, Animated, Pressable, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, FONTS, RADIUS, getSessionStyle } from '../../src/constants/theme';
import { getProfile } from '../../src/utils/storage';
import { logApi, programApi, rehabApi } from '../../src/utils/api';
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
  actualWeight: string;
  actualReps: string;
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
  lastRef: string;
  sets: SetData[];
  notes: string;
  notesExpanded: boolean;
  expanded: boolean;
  history: HistoryEntry[];
  effortRating: number;    // 0 = unset, 6–10 RPE scale
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
    actualWeight: w > 0 ? String(w) : '',
    actualReps:   String(parseTargetReps(reps)),
    logged: false,
  };
}

// ── Build ExerciseLogs from API session exercises ──────────────────────────────
function buildFromApi(apiExercises: any[]): ExerciseLog[] {
  if (!apiExercises?.length) return [];
  return apiExercises
    .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
    .map((ex: any, idx: number) => {
      const sets: SetData[] = (ex.targetSets || []).map((s: any, si: number) => {
        const weight = parseFloat(s.targetLoad) || 0;
        return mkSet(
          `${ex.sessionExerciseId || idx}-s${si}`,
          s.setType === 'warmup' ? 'warmup' : 'work',
          weight,
          s.targetReps || '3'
        );
      });
      return {
        id: ex.sessionExerciseId || `api-ex-${idx}`,
        name: ex.name || 'Exercise',
        prescription: ex.prescription || '',
        lastRef: ex.lastPerformance || ex.recentBest || '—',
        expanded: idx === 0,
        notes: ex.notes || '',
        notesExpanded: false,
        sets,
        history: [],
        effortRating: 0,
      } as ExerciseLog;
    });
}

// ── Build ExerciseLogs from local programData session (offline fallback) ───────
function parseExStr(str: string): { name: string; prescription: string; setCount: number; reps: string } {
  const m = str.match(/^(.+?)\s+(\d+)[×x]([\d\-]+)/);
  if (m) return { name: m[1].trim(), prescription: `${m[2]}×${m[3]}`, setCount: parseInt(m[2]), reps: m[3] };
  return { name: str, prescription: str, setCount: 3, reps: '10' };
}

function buildFromLocal(session: import('../../src/types').ProgramSession): ExerciseLog[] {
  if (!session || session.sessionType === 'Off') return [];
  // For recovery/boxing days or sessions without a main barbell lift, skip the main-lift block
  const hasMainLift = !!session.mainLift && session.mainLift !== 'Rest Day';
  const exs: ExerciseLog[] = [];

  if (hasMainLift) {
    // Main lift — parse "9×3 @ 112lbs" or "Work to 1RM; ..." format
    const schemeMatch = session.topSetScheme.match(/^(\d+)[×x](\S+)/);
    const setCount = schemeMatch ? parseInt(schemeMatch[1]) : 4;
    const reps = schemeMatch ? schemeMatch[2].replace(/@.*$/, '').trim() : '3';
    const weightMatch = session.topSetScheme.match(/@\s*~?(\d+)/);
    const weight = weightMatch ? parseInt(weightMatch[1]) : 0;
    const liftName = session.mainLift.split('—')[0].split('(')[0].trim();

    exs.push({
      id: 'main-lift',
      name: liftName,
      prescription: session.topSetScheme,
      lastRef: '—',
      expanded: true,
      notes: session.coachingNotes || '',
      notesExpanded: false,
      sets: Array.from({ length: setCount }, (_, i) =>
        mkSet(`main-w-${i}`, 'work', weight, reps)
      ),
      history: [],
      effortRating: 0,
    });
  }

  // Supplemental
  (session.supplementalWork || []).forEach((sup, idx) => {
    const { name, prescription, setCount: sc, reps: r } = parseExStr(sup);
    exs.push({
      id: `sup-${idx}`,
      name, prescription,
      lastRef: '—', expanded: !hasMainLift && idx === 0, notes: '', notesExpanded: false,
      sets: Array.from({ length: Math.min(sc, 8) }, (_, i) => mkSet(`sup-${idx}-${i}`, 'work', 0, r)),
      history: [],
      effortRating: 0,
    });
  });

  // Accessories
  (session.accessories || []).forEach((acc, idx) => {
    const { name, prescription, setCount: sc, reps: r } = parseExStr(acc);
    exs.push({
      id: `acc-${idx}`,
      name, prescription,
      lastRef: '—', expanded: false, notes: '', notesExpanded: false,
      sets: Array.from({ length: Math.min(sc, 6) }, (_, i) => mkSet(`acc-${idx}-${i}`, 'work', 0, r)),
      history: [],
      effortRating: 0,
    });
  });

  return exs;
}

const REST_OPTIONS = [60, 90, 120, 180, 300];
const RPE_VALUES   = [6, 7, 8, 9, 10];

// ── SetRow ─────────────────────────────────────────────────────────────────────
function SetRow({ set, index, isActive, onUpdate, onLog }: {
  set: SetData;
  index: number;
  isActive: boolean;   // true for first unlogged set in this exercise
  onUpdate: (field: 'actualWeight' | 'actualReps', val: string) => void;
  onLog: () => void;
}) {
  const circleColor = set.logged ? TEAL : set.type === 'warmup' ? '#555' : COLORS.accent;

  // Logged state — teal + strikethrough
  if (set.logged) {
    return (
      <View style={sr.rowDone}>
        <View style={[sr.circle, { backgroundColor: TEAL + '22', borderColor: TEAL }]}>
          <MaterialCommunityIcons name="check" size={11} color={TEAL} />
        </View>
        <Text style={sr.targetDone}>{set.targetWeight} × {set.targetReps}</Text>
        <View style={sr.inputsDone}>
          <Text style={sr.doneVal}>{set.actualWeight}</Text>
          <Text style={sr.doneSep}>×</Text>
          <Text style={sr.doneVal}>{set.actualReps}</Text>
        </View>
        <View style={sr.checkWrap}>
          <MaterialCommunityIcons name="check-circle" size={20} color={TEAL} />
        </View>
      </View>
    );
  }

  const borderCol = isActive ? COLORS.accent + '70' : '#2A2A2E';
  const textCol   = isActive ? COLORS.accent : COLORS.text.primary;

  return (
    <View style={[sr.row, isActive && sr.rowActive]}>
      {/* Numbered circle */}
      <View style={[sr.circle, { backgroundColor: circleColor + '20', borderColor: circleColor }]}>
        <Text style={[sr.circleNum, { color: circleColor }]}>{index + 1}</Text>
      </View>

      {/* Target reference */}
      <Text style={sr.target}>{set.targetWeight > 0 ? `${set.targetWeight}×${set.targetReps}` : set.targetReps}</Text>

      {/* Weight input */}
      <TextInput
        style={[sr.input, { borderColor: borderCol, color: textCol }]}
        value={set.actualWeight}
        onChangeText={v => onUpdate('actualWeight', v.replace(/[^0-9.]/g, ''))}
        keyboardType="numeric"
        selectTextOnFocus
        returnKeyType="done"
        placeholder="lbs"
        placeholderTextColor={COLORS.text.muted}
      />

      <Text style={sr.timesSign}>×</Text>

      {/* Reps input */}
      <TextInput
        style={[sr.input, sr.repsInput, { borderColor: borderCol, color: textCol }]}
        value={set.actualReps}
        onChangeText={v => onUpdate('actualReps', v.replace(/[^0-9]/g, ''))}
        keyboardType="numeric"
        selectTextOnFocus
        returnKeyType="done"
        placeholder="reps"
        placeholderTextColor={COLORS.text.muted}
      />

      {/* LOG button */}
      <TouchableOpacity onPress={onLog} style={sr.logBtn} activeOpacity={0.8}>
        <Text style={sr.logBtnText}>LOG</Text>
      </TouchableOpacity>
    </View>
  );
}

const sr = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 6, flex: 1 },
  rowActive: { backgroundColor: COLORS.accent + '08', marginHorizontal: -SPACING.md, paddingHorizontal: SPACING.md, borderRadius: RADIUS.md },
  rowDone:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 6, opacity: 0.75, flex: 1 },
  circle:    { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  circleNum: { fontSize: 10, fontWeight: FONTS.weights.heavy },
  target:    { fontSize: 11, color: '#666', width: 58, flexShrink: 0 },
  targetDone:{ fontSize: 11, color: '#444', width: 58, flexShrink: 0 },
  input:     { width: 72, height: 38, backgroundColor: '#1A1A1E', borderRadius: 6, borderWidth: 1, textAlign: 'center', fontSize: 14, fontWeight: FONTS.weights.semibold },
  repsInput: { width: 60 },
  timesSign: { fontSize: 14, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy },
  logBtn:    { backgroundColor: COLORS.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, minWidth: 46, alignItems: 'center', height: 38, justifyContent: 'center' },
  logBtnText:{ color: COLORS.primary, fontSize: 11, fontWeight: FONTS.weights.heavy, letterSpacing: 1 },
  inputsDone:{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  doneVal:   { fontSize: 13, color: TEAL, fontWeight: FONTS.weights.semibold, textDecorationLine: 'line-through' },
  doneSep:   { fontSize: 13, color: '#444' },
  checkWrap: { width: 46, alignItems: 'center' },
});

// ── QuickStatsStrip ────────────────────────────────────────────────────────────
function QuickStatsStrip({ loggedSets, totalSets, totalVolume, avgEffort }: {
  loggedSets: number;
  totalSets: number;
  totalVolume: number;
  avgEffort: string;
}) {
  const setsColor = loggedSets > 0 ? TEAL : COLORS.text.muted;
  return (
    <View style={qs.strip}>
      <View style={qs.pill}>
        <Text style={[qs.value, { color: setsColor }]}>{loggedSets}<Text style={qs.denom}>/{totalSets}</Text></Text>
        <Text style={qs.label}>SETS</Text>
      </View>
      <View style={qs.divider} />
      <View style={qs.pill}>
        <Text style={qs.value}>{totalVolume > 0 ? totalVolume.toLocaleString() : '—'}</Text>
        <Text style={qs.label}>LB VOLUME</Text>
      </View>
      <View style={qs.divider} />
      <View style={qs.pill}>
        <Text style={[qs.value, avgEffort !== '—' && { color: COLORS.accent }]}>{avgEffort}</Text>
        <Text style={qs.label}>AVG RPE</Text>
      </View>
    </View>
  );
}
const qs = StyleSheet.create({
  strip:   { flexDirection: 'row', alignItems: 'center', marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: '#111114', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  pill:    { flex: 1, alignItems: 'center', paddingVertical: SPACING.md },
  value:   { fontSize: 18, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, fontVariant: ['tabular-nums'] as any },
  denom:   { fontSize: 13, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },
  label:   { fontSize: 8, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.5, marginTop: 2 },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: COLORS.border, marginVertical: 8 },
});
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

// ── ExerciseCard ───────────────────────────────────────────────────────────────
function ExerciseCard({ ex, onToggleExpand, onUpdateSet, onLogSet,
  onAddSet, onToggleNotes, onNoteChange, onOpenHistory, onEffortChange }: {
  ex: ExerciseLog;
  onToggleExpand: () => void;
  onUpdateSet: (setId: string, field: 'actualWeight' | 'actualReps', val: string) => void;
  onLogSet: (setId: string) => void;
  onAddSet: () => void;
  onToggleNotes: () => void;
  onNoteChange: (text: string) => void;
  onOpenHistory: () => void;
  onEffortChange: (rating: number) => void;
}) {
  const loggedCount  = ex.sets.filter(s => s.logged).length;
  const total        = ex.sets.length;
  const allDone      = loggedCount === total;
  const progColor    = allDone ? TEAL : loggedCount > 0 ? COLORS.accent : COLORS.text.muted;
  const activeSetIdx = ex.sets.findIndex(s => !s.logged);   // first unlogged

  return (
    <View style={[ec.card, loggedCount > 0 && !allDone && ec.cardActive]}>
      {/* ── Collapsed header ── */}
      <TouchableOpacity style={ec.header} onPress={onToggleExpand} activeOpacity={0.8}>
        <View style={ec.headerLeft}>
          <Text style={ec.name} numberOfLines={1}>{ex.name}</Text>
          <Text style={ec.subLine}>
            {ex.prescription}
            {ex.lastRef !== '—' ? `  ·  Last: ${ex.lastRef}` : ''}
          </Text>
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

      {/* ── Expanded body ── */}
      {ex.expanded && (
        <View style={ec.body}>
          {/* Column headers */}
          <View style={ec.colHeaders}>
            <View style={{ width: 34 }} />
            <Text style={[ec.colHdr, { width: 62 }]}>TARGET</Text>
            <Text style={[ec.colHdr, { flex: 1, textAlign: 'center' }]}>WEIGHT</Text>
            <View style={{ width: 18 }} />
            <Text style={[ec.colHdr, { flex: 0.9, textAlign: 'center' }]}>REPS</Text>
            <View style={{ width: 46 }} />
          </View>

          {/* Set rows */}
          {ex.sets.map((set, idx) => (
            <SetRow
              key={set.id}
              set={set}
              index={idx}
              isActive={idx === activeSetIdx}
              onUpdate={(field, val) => onUpdateSet(set.id, field, val)}
              onLog={() => onLogSet(set.id)}
            />
          ))}

          {/* ── Effort selector ── */}
          <View style={ec.effortRow}>
            <Text style={ec.effortLabel}>EFFORT</Text>
            <View style={ec.effortCircles}>
              {RPE_VALUES.map(v => {
                const sel = ex.effortRating === v;
                return (
                  <TouchableOpacity
                    key={v}
                    style={[ec.effortCircle, sel && ec.effortCircleOn]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onEffortChange(v); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[ec.effortNum, sel && ec.effortNumOn]}>{v}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── Action pills (own row below effort) ── */}
          <View style={ec.actionPills}>
            <TouchableOpacity style={ec.pill} onPress={onAddSet} activeOpacity={0.75}>
              <MaterialCommunityIcons name="plus" size={11} color={COLORS.accent} />
              <Text style={[ec.pillText, { color: COLORS.accent }]}>Set</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ec.pill} onPress={onToggleNotes} activeOpacity={0.75}>
              <MaterialCommunityIcons name="pencil-outline" size={11} color={COLORS.text.muted} />
              <Text style={ec.pillText}>Notes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ec.pill} onPress={onOpenHistory} activeOpacity={0.75}>
              <MaterialCommunityIcons name="chart-line" size={11} color={COLORS.text.muted} />
              <Text style={ec.pillText}>History</Text>
            </TouchableOpacity>
          </View>

          {/* Notes input */}
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
        </View>
      )}
    </View>
  );
}
const ec = StyleSheet.create({
  card:           { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: '#111114', borderRadius: 12, borderWidth: 1, borderColor: '#1E1E22', overflow: 'hidden' },
  cardActive:     { borderColor: '#C9A84C30' },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  headerLeft:     { flex: 1, gap: 3 },
  name:           { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  subLine:        { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  headerRight:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  progressPill:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  progressText:   { fontSize: 11, fontWeight: FONTS.weights.heavy },
  body:           { paddingHorizontal: SPACING.md, paddingBottom: SPACING.lg, borderTopWidth: 1, borderTopColor: '#1E1E22' },
  // Column headers
  colHeaders:     { flexDirection: 'row', alignItems: 'center', paddingTop: SPACING.sm, paddingBottom: 4, gap: 6 },
  colHdr:         { fontSize: 9, fontWeight: FONTS.weights.heavy, color: '#444', letterSpacing: 1 },
  // Effort + actions (two separate rows now)
  effortRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: '#1E1E22' },
  effortSection:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  effortLabel:    { fontSize: 9, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.2 },
  effortCircles:  { flexDirection: 'row', gap: 5 },
  effortCircle:   { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1A1A1E', borderWidth: 1.5, borderColor: '#2A2A2E', justifyContent: 'center', alignItems: 'center' },
  effortCircleOn: { backgroundColor: '#C9A84C', borderColor: '#C9A84C' },
  effortNum:      { fontSize: 12, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted },
  effortNumOn:    { color: '#0A0A0C' },
  // Action pills (separate row)
  actionPills:    { flexDirection: 'row', gap: 5, marginTop: SPACING.sm },
  pill:           { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#2A2A2E', backgroundColor: COLORS.primary },
  pillText:       { fontSize: 10, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },
  // Notes
  notesInput:     { backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.md, padding: SPACING.sm, color: COLORS.text.primary, fontSize: FONTS.sizes.sm, marginTop: SPACING.sm, minHeight: 64, textAlignVertical: 'top', borderWidth: 1, borderColor: COLORS.border },
});

// ── HistoryDrawer ─────────────────────────────────────────────────────────────
// ── RestTimerBar (always visible, sticky above session bar) ───────────────────
function RestTimerBar({ active, seconds, total, onToggle, onReset, onConfig }: {
  active: boolean; seconds: number; total: number;
  onToggle: () => void; onReset: () => void; onConfig: () => void;
}) {
  const pct      = total > 0 ? Math.max(0, seconds / total) : 1;
  const idle     = !active && seconds === total;
  const expired  = active && seconds === 0;
  const timeColor = expired ? TEAL : idle ? COLORS.text.muted : seconds <= 15 ? AMBER : COLORS.accent;

  return (
    <View style={rtb.bar}>
      <View style={rtb.left}>
        <MaterialCommunityIcons name={idle ? 'timer-sand-empty' : 'timer-sand'} size={16} color={timeColor} />
        <Text style={rtb.restLabel}>REST</Text>
        {expired
          ? <Text style={[rtb.time, { color: TEAL }]}>DONE ✓</Text>
          : <Text style={[rtb.time, { color: timeColor }]}>{formatDuration(seconds)}</Text>
        }
      </View>
      <View style={rtb.progressTrack}>
        <View style={[rtb.progressFill, { width: `${pct * 100}%` as any, backgroundColor: idle ? COLORS.border : timeColor }]} />
      </View>
      <View style={rtb.controls}>
        <TouchableOpacity onPress={onToggle} style={rtb.ctrlBtn} activeOpacity={0.75}>
          <MaterialCommunityIcons name={active ? 'pause' : 'play'} size={20} color={idle ? COLORS.text.muted : COLORS.accent} />
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
  const [exercises, setExercises] = useState<ExerciseLog[]>(() => {
    const s = getTodaySession(1);
    const local = buildFromLocal(s);
    return local.length > 0 ? local : [];
  });
  const [week, setWeek]               = useState(1);
  const [sessionType, setSessionType] = useState(() => getTodaySession(1).sessionType);
  const [loading, setLoading]         = useState(true);

  // Rest timer (countdown)
  const [timerActive, setTimerActive]     = useState(false);
  const [timerSeconds, setTimerSeconds]   = useState(90);
  const [timerTotal, setTimerTotal]       = useState(90);
  const [restDuration, setRestDuration]   = useState(90);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Session elapsed timer
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [sessionDuration, setSessionDuration]   = useState(0);
  const durationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Modals
  const [historyEx, setHistoryEx]           = useState<ExerciseLog | null>(null);
  const [timerConfigVis, setTimerConfigVis] = useState(false);
  const [finishVisible, setFinishVisible]   = useState(false);

  // Rehab section
  const [rehabData, setRehabData]               = useState<any | null>(null);
  const [rehabExpanded, setRehabExpanded]       = useState(true);
  const [loggingRehabEx, setLoggingRehabEx]     = useState<string | null>(null);
  const [rehabSetsCompleted, setRehabSetsCompleted] = useState('3');
  const [rehabPainLevel, setRehabPainLevel]     = useState(0);
  const [rehabLogSuccess, setRehabLogSuccess]   = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      const prof = await getProfile();
      const w    = prof?.currentWeek || 1;
      setWeek(w);

      const localSession = getTodaySession(w);
      setSessionType(localSession.sessionType);
      const localExs = buildFromLocal(localSession);
      if (localExs.length > 0) setExercises(localExs);

      try {
        const todayData = await programApi.getTodaySession();
        if (todayData?.session?.sessionType) setSessionType(todayData.session.sessionType);
        const apiExs = buildFromApi(todayData?.session?.exercises);
        if (apiExs.length > 0) {
          try {
            const todayStr   = new Date().toISOString().split('T')[0];
            const logsResp   = await logApi.list();
            const allLogs    = Array.isArray(logsResp) ? logsResp : (logsResp?.logs || []);
            const todayLogs  = allLogs.filter((l: any) => l.date === todayStr);
            const logCountMap = new Map<string, number>();
            for (const lg of todayLogs) {
              const key = (lg.exercise || '').toLowerCase();
              logCountMap.set(key, (logCountMap.get(key) || 0) + 1);
            }
            const synced = apiExs.map(ex => {
              const count = logCountMap.get(ex.name.toLowerCase()) || 0;
              return { ...ex, sets: ex.sets.map((s: any, i: number) => ({ ...s, logged: i < count })) };
            });
            setExercises(synced);
          } catch { setExercises(apiExs); }
        }
      } catch { /* keep local */ }

      try {
        const rData = await rehabApi.getExercises();
        setRehabData(rData?.hasActiveRehab ? rData : null);
      } catch { /* not critical */ }

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
          if (s <= 1) { setTimerActive(false); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); return 0; }
          return s - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerActive]);

  // Session elapsed counter
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

  const totalVolume = exercises.reduce((sum, ex) =>
    sum + ex.sets.filter(s => s.logged).reduce((ss, s) =>
      ss + (parseFloat(s.actualWeight) || 0) * (parseInt(s.actualReps) || 0), 0), 0);

  const effortRatings = exercises.filter(ex => ex.effortRating > 0).map(ex => ex.effortRating);
  const avgEffort = effortRatings.length > 0
    ? (effortRatings.reduce((a, b) => a + b, 0) / effortRatings.length).toFixed(1)
    : '—';

  const canFinish = loggedSets >= totalSets / 2 && totalSets > 0;

  // ── Mutation helpers ──────────────────────────────────────────────────────────
  const mutateSet = (exId: string, setId: string, update: Partial<SetData>) =>
    setExercises(prev => prev.map(ex =>
      ex.id !== exId ? ex : { ...ex, sets: ex.sets.map(s => s.id === setId ? { ...s, ...update } : s) }
    ));

  const handleUpdateSet = (exId: string, setId: string, field: 'actualWeight' | 'actualReps', val: string) =>
    mutateSet(exId, setId, { [field]: val });

  const handleLogSet = async (exId: string, setId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ex  = exercises.find(e => e.id === exId);
    const set = ex?.sets.find(s => s.id === setId);
    if (!ex || !set) return;

    mutateSet(exId, setId, { logged: true });
    if (!sessionStartTime) setSessionStartTime(Date.now());

    setTimerTotal(restDuration);
    setTimerSeconds(restDuration);
    setTimerActive(true);

    try {
      const today = getTodayDayName();
      await logApi.create({
        date: new Date().toISOString().slice(0, 10),
        week, day: today === 'Sunday' ? 'Monday' : today,
        sessionType,
        exercise: ex.name,
        sets: 1,
        weight: parseFloat(set.actualWeight) || set.targetWeight,
        reps:   parseInt(set.actualReps) || parseTargetReps(set.targetReps),
        rpe:    ex.effortRating || 7,
        pain:   0,
        completed: 'Completed',
      });
    } catch (e) { console.warn('Log save failed:', e); }
  };

  const handleEffortChange = (exId: string, rating: number) =>
    setExercises(prev => prev.map(ex => ex.id === exId ? { ...ex, effortRating: rating } : ex));

  const handleAddSet = (exId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExercises(prev => prev.map(ex => {
      if (ex.id !== exId) return ex;
      const last = ex.sets[ex.sets.length - 1];
      const newSet: SetData = {
        id: `${exId}-add-${Date.now()}`,
        type: 'work',
        targetWeight: last?.targetWeight || 0,
        targetReps:   last?.targetReps || '5',
        actualWeight: last?.actualWeight || '',
        actualReps:   last?.actualReps || '',
        logged: false,
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

      {/* ── Scrollable content ── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── SESSION HEADER ── */}
        <View style={s.sessionHeader}>
          <View style={s.headerLeft}>
            <View style={[s.sessionBadge, { backgroundColor: currentSession.bg, borderColor: currentSession.borderColor }]}>
              <Text style={[s.sessionBadgeText, { color: currentSession.text }]}>{sessionType.toUpperCase()}</Text>
            </View>
            <Text style={s.headerTitle}>Workout Log</Text>
            <Text style={s.headerSub}>
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              {'  ·  Week '}{week}
            </Text>
          </View>
          {sessionStartTime !== null && (
            <View style={s.sessionTimerWrap}>
              <Text style={s.sessionTimerValue}>{formatDuration(sessionDuration)}</Text>
              <Text style={s.sessionTimerLabel}>SESSION</Text>
            </View>
          )}
        </View>

        {/* ── QUICK STATS STRIP ── */}
        <QuickStatsStrip
          loggedSets={loggedSets}
          totalSets={totalSets}
          totalVolume={totalVolume}
          avgEffort={avgEffort}
        />

        {/* ── EXERCISES SECTION LABEL ── */}
        <Text style={s.sectionLabel}>EXERCISES  ·  {exercises.length}</Text>

        {/* ── EXERCISE CARDS ── */}
        {exercises.map(ex => (
          <ExerciseCard
            key={ex.id}
            ex={ex}
            onToggleExpand={() => setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, expanded: !e.expanded } : e))}
            onUpdateSet={(setId, field, val) => handleUpdateSet(ex.id, setId, field, val)}
            onLogSet={(setId) => handleLogSet(ex.id, setId)}
            onAddSet={() => handleAddSet(ex.id)}
            onToggleNotes={() => setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, notesExpanded: !e.notesExpanded } : e))}
            onNoteChange={(text) => setExercises(prev => prev.map(e => e.id === ex.id ? { ...e, notes: text } : e))}
            onOpenHistory={() => setHistoryEx(ex)}
            onEffortChange={(rating) => handleEffortChange(ex.id, rating)}
          />
        ))}

        {/* ── REHAB EXERCISES SECTION ── */}
        {rehabData?.hasActiveRehab && (
          <View style={s.rehabSection}>
            <TouchableOpacity
              style={s.rehabHeader}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setRehabExpanded(e => !e); }}
              activeOpacity={0.8}
            >
              <View style={s.rehabHeaderLeft}>
                <View style={s.rehabBadge}>
                  <MaterialCommunityIcons name="medical-bag" size={11} color={TEAL} />
                </View>
                <View>
                  <Text style={s.rehabTitle}>INJURY PREVENTION</Text>
                  <Text style={s.rehabSubtitle}>
                    {rehabData.injuryInput} · Phase {rehabData.currentPhase} — {rehabData.phaseName}
                  </Text>
                </View>
              </View>
              <View style={s.rehabHeaderRight}>
                <Text style={s.rehabCount}>{(rehabData.exercises || []).length} exercises</Text>
                <MaterialCommunityIcons name={rehabExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.text.muted} />
              </View>
            </TouchableOpacity>

            {rehabExpanded && (
              <View style={s.rehabContent}>
                {(rehabData.exercises || []).map((ex: any, i: number) => (
                  <View key={i} style={s.rehabExCard}>
                    <TouchableOpacity
                      style={s.rehabExHeader}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setLoggingRehabEx(loggingRehabEx === ex.name ? null : ex.name);
                        setRehabSetsCompleted('3');
                        setRehabPainLevel(0);
                        setRehabLogSuccess(null);
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={s.rehabExLeft}>
                        <View style={[s.rehabLevelDot, {
                          backgroundColor: ex.level === 'gentle' ? '#4DCEA650' : ex.level === 'light' ? '#5B9CF550' : ex.is_rag ? '#F5A62350' : '#EF535050',
                        }]} />
                        <View>
                          <Text style={s.rehabExName}>{ex.name}</Text>
                          <Text style={s.rehabExPrescription}>{ex.prescription}</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {ex.is_rag && (
                          <View style={s.rehabRagBadge}>
                            <MaterialCommunityIcons name="dna" size={8} color={AMBER} />
                          </View>
                        )}
                        <MaterialCommunityIcons
                          name={loggingRehabEx === ex.name ? 'check-circle-outline' : 'plus-circle-outline'}
                          size={20}
                          color={loggingRehabEx === ex.name ? TEAL : COLORS.text.muted}
                        />
                      </View>
                    </TouchableOpacity>

                    {loggingRehabEx === ex.name && (
                      <View style={s.rehabLogForm}>
                        {ex.notes ? <Text style={s.rehabExNote}>{ex.notes}</Text> : null}
                        <View style={s.rehabFormRow}>
                          <Text style={s.rehabFormLabel}>Sets completed</Text>
                          <View style={s.rehabSetsPicker}>
                            {['1','2','3','4','5'].map(n => (
                              <TouchableOpacity
                                key={n}
                                style={[s.rehabSetBtn, rehabSetsCompleted === n && s.rehabSetBtnActive]}
                                onPress={() => setRehabSetsCompleted(n)}
                              >
                                <Text style={[s.rehabSetBtnText, rehabSetsCompleted === n && s.rehabSetBtnTextActive]}>{n}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                        <View style={s.rehabFormRow}>
                          <Text style={s.rehabFormLabel}>Pain (0 = none, 4 = severe)</Text>
                          <View style={s.rehabSetsPicker}>
                            {[0,1,2,3,4].map(n => (
                              <TouchableOpacity
                                key={n}
                                style={[s.rehabSetBtn, rehabPainLevel === n && { ...s.rehabSetBtnActive, backgroundColor: n >= 3 ? '#EF535030' : TEAL + '25', borderColor: n >= 3 ? '#EF5350' : TEAL }]}
                                onPress={() => setRehabPainLevel(n)}
                              >
                                <Text style={[s.rehabSetBtnText, rehabPainLevel === n && s.rehabSetBtnTextActive]}>{n}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                        <TouchableOpacity
                          style={s.rehabLogBtn}
                          onPress={async () => {
                            try {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              const result = await rehabApi.log({
                                exerciseName: ex.name,
                                setsCompleted: parseInt(rehabSetsCompleted),
                                painLevel: rehabPainLevel,
                              });
                              setRehabLogSuccess(result.message || 'Logged!');
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                              const updated = await rehabApi.getExercises();
                              if (updated?.hasActiveRehab) setRehabData(updated);
                              setTimeout(() => { setLoggingRehabEx(null); setRehabLogSuccess(null); }, 1800);
                            } catch { setRehabLogSuccess('Error logging — try again'); }
                          }}
                        >
                          <MaterialCommunityIcons name="check" size={14} color={COLORS.primary} />
                          <Text style={s.rehabLogBtnText}>LOG SET</Text>
                        </TouchableOpacity>
                        {rehabLogSuccess && <Text style={s.rehabSuccessText}>{rehabLogSuccess}</Text>}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>

      {/* ── REST TIMER (always sticky, visible from page open) ── */}
      <RestTimerBar
        active={timerActive}
        seconds={timerSeconds}
        total={timerTotal}
        onToggle={() => setTimerActive(a => !a)}
        onReset={() => { setTimerActive(false); setTimerSeconds(restDuration); setTimerTotal(restDuration); }}
        onConfig={() => setTimerConfigVis(true)}
      />

      {/* ── SESSION BAR ── */}
      <SessionBar
        loggedSets={loggedSets}
        totalSets={totalSets}
        durationSecs={sessionDuration}
        onFinish={handleFinish}
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
        onSelect={(sec) => { setRestDuration(sec); setTimerSeconds(sec); setTimerTotal(sec); }}
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
                ['Sets Logged',   `${loggedSets} / ${totalSets}`],
                ['Total Volume',  totalVolume > 0 ? `${totalVolume.toLocaleString()} lb` : '—'],
                ['Duration',      formatDuration(sessionDuration)],
                ['Exercises',     String(exercises.length)],
              ].map(([label, val]) => (
                <View key={label} style={s.finishStatRow}>
                  <Text style={s.finishStatLabel}>{label}</Text>
                  <Text style={s.finishStatValue}>{val}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={s.finishDoneBtn} onPress={() => setFinishVisible(false)} activeOpacity={0.85}>
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
  sectionLabel:   { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2, paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },

  // ── Session header (two-column: left meta + right timer)
  sessionHeader:    { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md },
  headerLeft:       { flex: 1, gap: 4 },
  sessionBadge:     { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.full, borderWidth: 1, marginBottom: 2 },
  sessionBadgeText: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5 },
  headerTitle:      { fontSize: 26, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 31 },
  headerSub:        { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },
  sessionTimerWrap: { alignItems: 'flex-end', paddingTop: 4 },
  sessionTimerValue:{ fontSize: 22, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, fontVariant: ['tabular-nums'] as any },
  sessionTimerLabel:{ fontSize: 9, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.5, marginTop: 2 },

  // ── Finish modal
  finishOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  finishCard:       { width: '100%', backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.xl, borderWidth: 1, borderColor: COLORS.accent },
  finishHeader:     { alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.lg },
  finishTitle:      { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  finishStats:      { gap: SPACING.sm, marginBottom: SPACING.lg },
  finishStatRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  finishStatLabel:  { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },
  finishStatValue:  { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, color: COLORS.accent },
  finishDoneBtn:    { backgroundColor: COLORS.accent, borderRadius: RADIUS.lg, paddingVertical: 14, alignItems: 'center' },
  finishDoneBtnText:{ color: COLORS.primary, fontWeight: FONTS.weights.heavy, fontSize: FONTS.sizes.base, letterSpacing: 0.5 },

  // ── Rehab Section
  rehabSection:    { marginHorizontal: SPACING.lg, marginTop: SPACING.md, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, borderWidth: 1.5, borderColor: TEAL + '40', overflow: 'hidden' },
  rehabHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: TEAL + '20' },
  rehabHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  rehabHeaderRight:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  rehabBadge:      { width: 22, height: 22, borderRadius: 11, backgroundColor: TEAL + '25', justifyContent: 'center', alignItems: 'center' },
  rehabTitle:      { fontSize: 10, fontWeight: '800' as any, color: TEAL, letterSpacing: 1.5 },
  rehabSubtitle:   { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 1 },
  rehabCount:      { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  rehabContent:    { padding: SPACING.sm },
  rehabExCard:     { backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.md, marginBottom: 6, overflow: 'hidden' },
  rehabExHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.md },
  rehabExLeft:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 },
  rehabLevelDot:   { width: 8, height: 8, borderRadius: 4 },
  rehabExName:     { fontSize: FONTS.sizes.sm, fontWeight: '600' as any, color: COLORS.text.primary },
  rehabExPrescription: { fontSize: FONTS.sizes.xs, color: TEAL, marginTop: 1, fontWeight: '600' as any },
  rehabRagBadge:   { width: 14, height: 14, borderRadius: 7, backgroundColor: AMBER + '20', justifyContent: 'center', alignItems: 'center' },
  rehabLogForm:    { padding: SPACING.md, paddingTop: 0, borderTopWidth: 1, borderTopColor: COLORS.border },
  rehabExNote:     { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, lineHeight: 16, marginBottom: SPACING.sm, fontStyle: 'italic' },
  rehabFormRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  rehabFormLabel:  { fontSize: FONTS.sizes.xs, color: COLORS.text.secondary, flex: 1 },
  rehabSetsPicker: { flexDirection: 'row', gap: 4 },
  rehabSetBtn:     { width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.border, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  rehabSetBtnActive:   { backgroundColor: TEAL + '25', borderColor: TEAL },
  rehabSetBtnText:     { fontSize: 13, color: COLORS.text.muted, fontWeight: '600' as any },
  rehabSetBtnTextActive: { color: TEAL },
  rehabLogBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: TEAL, borderRadius: RADIUS.md, paddingVertical: 10, marginTop: SPACING.sm },
  rehabLogBtnText: { color: '#000', fontWeight: '700' as any, fontSize: FONTS.sizes.sm, letterSpacing: 0.5 },
  rehabSuccessText:{ fontSize: FONTS.sizes.xs, color: TEAL, textAlign: 'center', marginTop: 4 },
});
