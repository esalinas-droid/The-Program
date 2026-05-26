import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  ActivityIndicator, Animated, Pressable, Modal, TextInput, KeyboardAvoidingView, Platform,
  RefreshControl, Alert, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { getAuthToken } from '../../src/utils/auth';
import { setParsedSession } from '../../src/utils/parsedSessionStore';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';
import { getProfile } from '../../src/utils/storage';
import { substitutionApi, programApi, readinessApi, painReportApi, logApi, streakApi, badgesApi, prApi, exerciseApi } from '../../src/utils/api';
import { getProgramSession, getTodayDayName, getTodaySession } from '../../src/data/programData';
import { getLocalDateString } from '../../src/utils/dateHelpers';
import { getBlock } from '../../src/utils/calculations';
import {
  ADJUST_REASONS, REASON_ICONS, AdjustReason, Alternative,
  getAlternatives, extractExerciseName,
} from '../../src/data/substitutions';
import { ProgramSession, TodaySessionResponse } from '../../src/types';
import ExercisePicker, { PickedExercise } from '../../src/components/ExercisePicker';
import AskCoachButton from '../../src/components/AskCoachButton';

// ── Additional palette ────────────────────────────────────────────────────────
const TEAL = '#4DCEA6';
const BLUE = '#5B9CF5';
const RED  = '#EF5350';

// ── Types ─────────────────────────────────────────────────────────────────────
type SetType     = 'warmup' | 'ramp' | 'work';
type ExCategory  = 'primary' | 'speed' | 'supplemental' | 'accessory' | 'prehab' | 'warmup' | 'cooldown';

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

// ── Offline Fallback Exercise Data (generic — no user-specific numbers) ────────
const EXERCISES: Exercise[] = [
  {
    id: 'fallback-main',
    name: 'Main Lift',
    category: 'primary',
    prescription: 'Build to top set',
    lastSession: '—',
    cues: [],
    notes: '',
    sets: [
      { id: 'fb-w-1', type: 'warmup', weight: 0, reps: '5', label: 'Warm-Up' },
      { id: 'fb-w-2', type: 'warmup', weight: 0, reps: '3', label: 'Warm-Up' },
      { id: 'fb-w-3', type: 'ramp',   weight: 0, reps: '2', label: 'Ramp'    },
      { id: 'fb-w-4', type: 'work',   weight: 0, reps: '1', label: 'Work'    },
    ],
  },
  {
    id: 'fallback-sup',
    name: 'Support',
    category: 'supplemental',
    prescription: '4 × 6-8',
    lastSession: '—',
    cues: [],
    notes: '',
    sets: [
      { id: 'fbs-w-1', type: 'work', weight: 0, reps: '6-8', label: 'Work' },
      { id: 'fbs-w-2', type: 'work', weight: 0, reps: '6-8', label: 'Work' },
      { id: 'fbs-w-3', type: 'work', weight: 0, reps: '6-8', label: 'Work' },
      { id: 'fbs-w-4', type: 'work', weight: 0, reps: '6-8', label: 'Work' },
    ],
  },
  {
    id: 'fallback-acc',
    name: 'Accessory',
    category: 'accessory',
    prescription: '3 × 10-12',
    lastSession: '—',
    cues: [],
    notes: '',
    sets: [
      { id: 'fba-w-1', type: 'work', weight: 0, reps: '10-12', label: 'Work' },
      { id: 'fba-w-2', type: 'work', weight: 0, reps: '10-12', label: 'Work' },
      { id: 'fba-w-3', type: 'work', weight: 0, reps: '10-12', label: 'Work' },
    ],
  },
];

// ── Build Exercise list from local programData (offline fallback) ──────────────
function buildTodayExercisesFromLocal(session: ProgramSession | null): Exercise[] {
  if (!session || session.sessionType === 'Off') return EXERCISES;
  const hasMainLift = !!session.mainLift && session.mainLift !== 'Rest Day';
  const exs: Exercise[] = [];

  if (hasMainLift) {
    const schemeMatch = session.topSetScheme.match(/^(\d+)[×x](\S+)/);
    const setCount = schemeMatch ? parseInt(schemeMatch[1]) : 4;
    const reps = schemeMatch ? schemeMatch[2].replace(/@.*$/, '').trim() : '3';
    const weightMatch = session.topSetScheme.match(/@\s*~?(\d+)/);
    const weight = weightMatch ? parseInt(weightMatch[1]) : 0;
    const liftName = session.mainLift.split('—')[0].split('(')[0].trim();
    // Determine badge: Speed days get 'speed', Heavy days get 'primary'
    const isDynamic = session.sessionType.toLowerCase().includes('de') ||
                      session.sessionType.toLowerCase().includes('dynamic') ||
                      session.sessionType.toLowerCase().includes('speed');
    exs.push({
      id: 'local-main',
      name: liftName,
    category: (isDynamic ? 'speed' : 'primary') as ExCategory,
      prescription: session.topSetScheme,
      lastSession: '—',
      cues: [],
      notes: session.coachingNotes || '',
      sets: Array.from({ length: setCount }, (_, i) => ({
        id: `local-main-s${i}`,
        type: 'work' as SetType,
        weight,
        reps,
        label: 'Work',
      })),
    });
  }

  (session.supplementalWork || []).forEach((sup, idx) => {
    const m = sup.match(/^(.+?)\s+(\d+)[×x]([\d\-]+)/);
    if (!m) return;
    exs.push({
      id: `local-sup-${idx}`,
      name: m[1].trim(),
      category: 'supplemental' as ExCategory,
      prescription: `${m[2]}×${m[3]}`,
      lastSession: '—', cues: [], notes: '',
      sets: Array.from({ length: parseInt(m[2]) }, (_, i) => ({
        id: `local-sup-${idx}-s${i}`, type: 'work' as SetType, weight: 0, reps: m[3], label: 'Work',
      })),
    });
  });

  (session.accessories || []).forEach((acc, idx) => {
    const m = acc.match(/^(.+?)\s+(\d+)[×x]([\d\-]+)/);
    if (!m) return;
    exs.push({
      id: `local-acc-${idx}`,
      name: m[1].trim(),
      category: 'accessory' as ExCategory,
      prescription: `${m[2]}×${m[3]}`,
      lastSession: '—', cues: [], notes: '',
      sets: Array.from({ length: parseInt(m[2]) }, (_, i) => ({
        id: `local-acc-${idx}-s${i}`, type: 'work' as SetType, weight: 0, reps: m[3], label: 'Work',
      })),
    });
  });

  return exs.length > 0 ? exs : EXERCISES;
}

// ── Build Exercise list from API session data ──────────────────────────────────
function buildTodayExercisesFromApi(apiExercises: any[], sessionType?: string): Exercise[] {
  if (!apiExercises?.length) return EXERCISES;
  // Determine if this is a Speed session so main lift gets the right badge
  const isDynamic = sessionType
    ? sessionType.toLowerCase().includes('dynamic') || sessionType.toLowerCase().includes('speed')
    : false;

  return apiExercises
    .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
    .map((ex: any, idx: number) => ({
      id: ex.sessionExerciseId || `api-ex-${idx}`,
      name: (() => {
        const n = ex.name;
        const valid = n && typeof n === 'string' && n.trim().length >= 2 && /[a-zA-Z]/.test(n);
        if (!valid) console.log('[Today] Invalid exercise name from API:', JSON.stringify(n), 'category:', ex.category);
        return valid ? n.trim() : 'Exercise';
      })(),
      category: (ex.category === 'main'
        ? (isDynamic ? 'speed' : 'primary')
        : ex.category === 'supplemental' ? 'supplemental'
        : ex.category === 'prehab' ? 'prehab'
        : ex.category === 'warmup' ? 'warmup'
        : ex.category === 'cooldown' ? 'cooldown'
        : 'accessory') as ExCategory,
      prescription: ex.prescription || '',
      lastSession: ex.lastPerformance || ex.recentBest || '—',
      cues: ex.cues || [],
      notes: ex.notes || '',
      sets: (ex.targetSets || []).map((s: any, si: number) => ({
        id: `${ex.sessionExerciseId || idx}-s${si}`,
        type: (s.setType === 'warmup' ? 'warmup' : 'work') as SetType,
        weight: parseFloat(s.targetLoad) || 0,
        reps: s.targetReps || '3',
        label: s.setType === 'warmup' ? 'Warm-Up' : 'Work',
      })),
    }));
}

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
  // ── New terminology (forward-compatible) ───────────────────────────────────
  'Heavy Upper':            'Build to a top set on a pressing variation. Add supplemental and accessory volume.',
  'Heavy Lower':            'Build to a top set on a lower body pattern. Build posterior chain supplemental volume.',
  'Speed Upper':            'Speed work at 50–60% of max. 8–10 sets of 3. Focus on bar speed and lockout.',
  'Speed Lower':            'Speed squats and pulls at 55–60%. 10–12 sets of 2. Explosive hip drive.',
  'Recovery / Conditioning':'Light aerobic conditioning. Maintain movement quality. Keep intensity low.',
  // ── Legacy (backward-compatible for existing saved plans) ─────────────────
  'Max Effort Upper':       'Build to a top set on a pressing variation. Add support and accessory volume.',
  'Max Effort Lower':       'Build to a top set on a lower body pattern. Build posterior chain support volume.',
  'Dynamic Effort Upper':   'Speed work at 50–60% of max. 8–10 sets of 3. Focus on bar speed and lockout.',
  'Dynamic Effort Lower':   'Speed squats and pulls at 55–60%. 10–12 sets of 2. Explosive hip drive.',
  'Event Day':              'Strongman event training. Prioritize technique and confidence across all implements.',
  'Boxing / Recovery':      'Light aerobic conditioning. Maintain movement quality. Keep intensity low.',
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

// ── Tracker mode helpers ────────────────────────────────────────────────────
const TRACKER_TYPE_ICONS: Record<string, string> = {
  weighted: 'weight-lifter',   timed: 'timer-outline',
  distance: 'run-fast',        height: 'arrow-up-bold-circle-outline',
  calories: 'fire',            emom: 'clock-outline',
  amrap: 'repeat-variant',     for_time: 'timer-sand',
};

function formatTrackerSummary(sets: any[], prescriptionType: string): string {
  const n  = sets.length;
  const pt = prescriptionType || 'weighted';
  if (n === 0) return '0 sets';
  switch (pt) {
    case 'weighted': case 'emom': case 'amrap': case 'for_time': {
      const ws  = sets.map((s: any) => s.weight).filter((w: number) => w > 0);
      const rs  = sets.map((s: any) => s.rpe).filter((r: number) => r > 0);
      const wStr = ws.length === 0 ? '' : ws.length === 1 || Math.min(...ws) === Math.max(...ws)
        ? `${Math.max(...ws)} lbs` : `${Math.min(...ws)}–${Math.max(...ws)} lbs`;
      const rStr = rs.length > 0 ? ` · top RPE ${Math.max(...rs)}` : '';
      return `${n} set${n !== 1 ? 's' : ''}${wStr ? ' · ' + wStr : ''}${rStr}`;
    }
    case 'timed': {
      const ds = sets.map((s: any) => s.duration || 0).filter((d: number) => d > 0);
      const fmt = (d: number) => d >= 60 ? `${Math.round(d / 60)}min` : `${d}sec`;
      if (ds.length === 0) return `${n} set${n !== 1 ? 's' : ''}`;
      const lo = Math.min(...ds); const hi = Math.max(...ds);
      return `${n} set${n !== 1 ? 's' : ''} · ${lo === hi ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`}`;
    }
    case 'distance': {
      const ds = sets.map((s: any) => s.distance || 0).filter((d: number) => d > 0);
      if (ds.length === 0) return `${n} set${n !== 1 ? 's' : ''}`;
      const unit = sets[0]?.unit || 'ft';
      const lo = Math.min(...ds); const hi = Math.max(...ds);
      return `${n} set${n !== 1 ? 's' : ''} · ${lo === hi ? `${lo} ${unit}` : `${lo}–${hi} ${unit}`}`;
    }
    case 'height': {
      const hs = sets.map((s: any) => s.weight || 0).filter((h: number) => h > 0);
      if (hs.length === 0) return `${n} set${n !== 1 ? 's' : ''}`;
      const unit = sets[0]?.unit || 'in';
      const lo = Math.min(...hs); const hi = Math.max(...hs);
      return `${n} set${n !== 1 ? 's' : ''} · ${lo === hi ? `${lo} ${unit}` : `${lo}–${hi} ${unit}`}`;
    }
    case 'calories': {
      const total = sets.reduce((a: number, s: any) => a + (s.reps || 0), 0);
      return `${n} set${n !== 1 ? 's' : ''}${total > 0 ? ` · ${total} cal` : ''}`;
    }
    default: return `${n} set${n !== 1 ? 's' : ''}`;
  }
}

function getCategoryStyle(cat: ExCategory): { bg: string; text: string; label: string } {
  return ({
    primary:      { bg: COLORS.accent + '25',      text: COLORS.accent,         label: 'Primary' },
    speed:        { bg: BLUE + '25',               text: BLUE,                  label: 'Speed' },
    supplemental: { bg: COLORS.text.muted + '25',  text: COLORS.text.secondary, label: 'Support' },
    accessory:    { bg: COLORS.surfaceHighlight,   text: COLORS.text.secondary, label: 'Accessory' },
    prehab:       { bg: TEAL + '25',              text: TEAL,                  label: 'Injury Prevention' },
    warmup:       { bg: '#4DCEA620',              text: '#4DCEA6',             label: 'Warm Up' },
    cooldown:     { bg: '#5B9CF520',              text: '#5B9CF5',             label: 'Cooldown' },
  } as Record<ExCategory, { bg: string; text: string; label: string }>)[cat] || { bg: COLORS.surfaceHighlight, text: COLORS.text.secondary, label: cat };
}

// ── REST Period Configuration ─────────────────────────────────────────────────
const REST_CONFIG: Record<ExCategory, { options: number[]; default: number; color: string }> = {
  primary:      { options: [180, 300, 420, 600], default: 300, color: '#C9A84C' },
  speed:        { options: [30, 45, 60, 90],     default: 45,  color: '#5B9CF5' },
  supplemental: { options: [60, 120, 180, 300],  default: 120, color: '#888888' },
  accessory:    { options: [45, 60, 75, 90],     default: 60,  color: '#888888' },
  prehab:       { options: [30, 45, 60],         default: 45,  color: '#4DCEA6' },
  warmup:       { options: [30, 45, 60],         default: 30,  color: '#4DCEA6' },
  cooldown:     { options: [30, 45, 60],         default: 45,  color: '#5B9CF5' },
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── ReadinessModal ────────────────────────────────────────────────────────────
interface ReadinessModalProps {
  visible: boolean;
  onSubmit: (data: { sleepQuality: number; soreness: number; moodEnergy: number }) => void;
  onSkip: () => void;
}
function ReadinessModal({ visible, onSubmit, onSkip }: ReadinessModalProps) {
  const [sleep, setSleep]   = useState(3);
  const [sore, setSore]     = useState(3);
  const [mood, setMood]     = useState(3);
  const slideAnim = useRef(new Animated.Value(800)).current;

  const handleShow = () => {
    setSleep(3); setSore(3); setMood(3);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }).start();
  };
  const handleHide = (cb?: () => void) =>
    Animated.timing(slideAnim, { toValue: 800, duration: 220, useNativeDriver: true }).start(() => cb?.());

  const handleSubmit = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    handleHide(() => onSubmit({ sleepQuality: sleep, soreness: sore, moodEnergy: mood }));
  };
  const handleSkip = () => handleHide(onSkip);

  const SCORE_LABELS = ['', 'Poor', 'Below avg', 'Average', 'Good', 'Great'];

  const SliderRow = ({
    label, emoji, value, setValue, leftLabel, rightLabel,
  }: { label: string; emoji: string; value: number; setValue: (v: number) => void; leftLabel: string; rightLabel: string }) => (
    <View style={rm.sliderBlock}>
      <View style={rm.sliderHeader}>
        <Text style={rm.sliderEmoji}>{emoji}</Text>
        <Text style={rm.sliderLabel}>{label}</Text>
        <View style={[rm.scorePill, { backgroundColor: value >= 4 ? TEAL + '30' : value <= 2 ? '#EF535025' : COLORS.accent + '25' }]}>
          <Text style={[rm.scoreText, { color: value >= 4 ? TEAL : value <= 2 ? '#EF5350' : COLORS.accent }]}>
            {SCORE_LABELS[value]}
          </Text>
        </View>
      </View>
      <View style={rm.dotRow}>
        {[1, 2, 3, 4, 5].map(v => (
          <TouchableOpacity
            key={v}
            style={[rm.dot, value === v && rm.dotActive, { backgroundColor: value >= v ? (v >= 4 ? TEAL : v <= 2 ? '#EF5350' : COLORS.accent) : COLORS.border }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setValue(v); }}
            activeOpacity={0.7}
          >
            <Text style={[rm.dotNum, { color: value >= v ? COLORS.primary : COLORS.text.muted }]}>{v}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={rm.dotLabels}>
        <Text style={rm.dotLabelText}>{leftLabel}</Text>
        <Text style={rm.dotLabelText}>{rightLabel}</Text>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onShow={handleShow}>
      <View style={rm.overlay}>
        <Animated.View style={[rm.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={rm.handleWrap}><View style={rm.handle} /></View>

          <View style={rm.header}>
            <View style={rm.headerIcon}>
              <MaterialCommunityIcons name="lightning-bolt" size={18} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={rm.headerTitle}>Pre-Session Check-In</Text>
              <Text style={rm.headerSub}>How are you feeling today?</Text>
            </View>
            <TouchableOpacity onPress={handleSkip} style={rm.skipBtn}>
              <Text style={rm.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={rm.body} showsVerticalScrollIndicator={false}>
            <SliderRow
              label="Sleep Quality"  emoji="😴"
              value={sleep}  setValue={setSleep}
              leftLabel="Poor"  rightLabel="Great"
            />
            <SliderRow
              label="Muscle Soreness"  emoji="💪"
              value={sore}  setValue={setSore}
              leftLabel="Very sore"  rightLabel="Fully fresh"
            />
            <SliderRow
              label="Mood & Energy"  emoji="⚡"
              value={mood}  setValue={setMood}
              leftLabel="Low"  rightLabel="Fired up"
            />
            <TouchableOpacity style={rm.submitBtn} onPress={handleSubmit} activeOpacity={0.85}>
              <MaterialCommunityIcons name="flag-checkered" size={18} color={COLORS.primary} />
              <Text style={rm.submitText}>READY — START SESSION</Text>
            </TouchableOpacity>
            <View style={{ height: 24 }} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const rm = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: COLORS.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%' },
  handleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg, gap: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.accent + '20', justifyContent: 'center', alignItems: 'center' },
  headerTitle:{ fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  headerSub:  { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 2 },
  skipBtn:    { padding: 8 },
  skipText:   { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },
  body:       { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  sliderBlock:{ marginBottom: SPACING.xl },
  sliderHeader:{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  sliderEmoji:{ fontSize: 20 },
  sliderLabel:{ fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, flex: 1 },
  scorePill:  { paddingHorizontal: 10, paddingVertical: 3, borderRadius: RADIUS.full },
  scoreText:  { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5 },
  dotRow:     { flexDirection: 'row', gap: SPACING.sm, justifyContent: 'space-between' },
  dot:        { flex: 1, height: 44, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  dotActive:  { borderWidth: 2 },
  dotNum:     { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy },
  dotLabels:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  dotLabelText:{ fontSize: 10, color: COLORS.text.muted },
  submitBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accent, borderRadius: RADIUS.lg, paddingVertical: 16, gap: SPACING.sm, marginTop: SPACING.md },
  submitText: { color: COLORS.primary, fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, letterSpacing: 1 },
});

// ── PainReportModal ───────────────────────────────────────────────────────────
const BODY_REGIONS = [
  'Lower Back', 'Upper Back', 'Knee', 'Hip / Glute', 'Shoulder',
  'Elbow', 'Wrist', 'Hamstring', 'Quad', 'Calf / Achilles',
  'Neck / Traps', 'Pec / Chest', 'SI Joint / Pelvis',
];
const PAIN_TYPES = [
  { label: 'Sharp',   color: '#EF5350', desc: 'Stabbing or acute' },
  { label: 'Dull',    color: '#FF9800', desc: 'Deep persistent ache' },
  { label: 'Aching',  color: '#FFC107', desc: 'Broad soreness' },
  { label: 'Burning', color: '#FF7043', desc: 'Heat / nerve-like' },
];
const PAIN_TIMINGS = [
  { value: 'during', label: 'During', icon: 'timer-outline' },
  { value: 'after',  label: 'After',  icon: 'clock-outline' },
  { value: 'both',   label: 'Both',   icon: 'clock-alert-outline' },
];

interface PainModalProps {
  visible: boolean;
  exerciseName: string;
  sessionType: string;
  onClose: () => void;
  onSubmit: (data: { bodyRegion: string; painType: string; intensity: number; timing: string }) => void;
}
function PainReportModal({ visible, exerciseName, sessionType, onClose, onSubmit }: PainModalProps) {
  const [step, setStep]         = useState<1 | 2 | 3>(1);
  const [region, setRegion]     = useState('');
  const [painType, setPainType] = useState('');
  const [intensity, setIntensity] = useState(5);
  const [timing, setTiming]     = useState('during');
  const [submitting, setSubmitting] = useState(false);
  const slideAnim = useRef(new Animated.Value(800)).current;

  const handleShow = () => {
    setStep(1); setRegion(''); setPainType(''); setIntensity(5); setTiming('during');
    setSubmitting(false);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }).start();
  };
  const handleHide = (cb?: () => void) =>
    Animated.timing(slideAnim, { toValue: 800, duration: 220, useNativeDriver: true }).start(() => cb?.());

  const handleClose = () => handleHide(onClose);

  const handleRegionSelect = (r: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRegion(r); setStep(2);
  };
  const handleTypeSelect = (t: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPainType(t); setStep(3);
  };
  const handleSubmit = () => {
    if (submitting) return;
    setSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    handleHide(() => onSubmit({ bodyRegion: region, painType, intensity, timing }));
  };

  const INTENSITY_COLOR = intensity >= 7 ? '#EF5350' : intensity >= 4 ? '#FF9800' : TEAL;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onShow={handleShow}>
      <Pressable style={pm.overlay} onPress={step === 1 ? handleClose : undefined}>
        <Animated.View style={[pm.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <Pressable onPress={e => e.stopPropagation()}>
            <View style={pm.handleWrap}><View style={pm.handle} /></View>
            <View style={pm.header}>
              {step > 1 ? (
                <TouchableOpacity onPress={() => setStep(s => Math.max(1, s - 1) as 1 | 2 | 3)} style={pm.backBtn}>
                  <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text.secondary} />
                </TouchableOpacity>
              ) : <View style={pm.backBtn} />}
              <View style={pm.headerCenter}>
                <Text style={pm.headerTitle}>Report Pain</Text>
                <Text style={pm.headerSub} numberOfLines={1}>{exerciseName}</Text>
              </View>
              <TouchableOpacity onPress={handleClose} style={pm.backBtn}>
                <MaterialCommunityIcons name="close" size={20} color={COLORS.text.muted} />
              </TouchableOpacity>
            </View>

            {/* Step indicator */}
            <View style={pm.stepRow}>
              {[1, 2, 3].map(s => (
                <View key={s} style={[pm.stepDot, step >= s && pm.stepDotActive]} />
              ))}
            </View>

            <ScrollView style={pm.body} showsVerticalScrollIndicator={false}>
              {step === 1 && (
                <View>
                  <Text style={pm.prompt}>Where does it hurt?</Text>
                  <View style={pm.chipGrid}>
                    {BODY_REGIONS.map(r => (
                      <TouchableOpacity
                        key={r}
                        style={[pm.chip, region === r && pm.chipActive]}
                        onPress={() => handleRegionSelect(r)}
                        activeOpacity={0.8}
                      >
                        <Text style={[pm.chipText, region === r && pm.chipTextActive]}>{r}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {step === 2 && (
                <View>
                  <Text style={pm.prompt}>What kind of pain?</Text>
                  <View style={pm.typeGrid}>
                    {PAIN_TYPES.map(t => (
                      <TouchableOpacity
                        key={t.label}
                        style={[pm.typeCard, painType === t.label && { borderColor: t.color, backgroundColor: t.color + '15' }]}
                        onPress={() => handleTypeSelect(t.label)}
                        activeOpacity={0.8}
                      >
                        <Text style={[pm.typeLabel, { color: t.color }]}>{t.label}</Text>
                        <Text style={pm.typeDesc}>{t.desc}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {step === 3 && (
                <View>
                  <Text style={pm.prompt}>Intensity & timing</Text>

                  {/* Intensity bubbles */}
                  <Text style={pm.subLabel}>How bad is it? ({intensity}/10)</Text>
                  <View style={pm.intensityRow}>
                    {[1,2,3,4,5,6,7,8,9,10].map(v => (
                      <TouchableOpacity
                        key={v}
                        style={[
                          pm.intBubble,
                          intensity === v && { backgroundColor: INTENSITY_COLOR, borderColor: INTENSITY_COLOR },
                          intensity > v && { backgroundColor: INTENSITY_COLOR + '40', borderColor: INTENSITY_COLOR + '80' },
                        ]}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIntensity(v); }}
                        activeOpacity={0.7}
                      >
                        <Text style={[pm.intNum, intensity >= v && { color: intensity === v ? COLORS.primary : INTENSITY_COLOR }]}>{v}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={pm.intensityLabels}>
                    <Text style={pm.intLabel}>Mild</Text>
                    <Text style={pm.intLabel}>Severe</Text>
                  </View>

                  {/* Timing */}
                  <Text style={pm.subLabel}>When did it occur?</Text>
                  <View style={pm.timingRow}>
                    {PAIN_TIMINGS.map(t => (
                      <TouchableOpacity
                        key={t.value}
                        style={[pm.timingChip, timing === t.value && pm.timingChipActive]}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTiming(t.value); }}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name={t.icon as any} size={15} color={timing === t.value ? COLORS.primary : COLORS.text.secondary} />
                        <Text style={[pm.timingText, timing === t.value && pm.timingTextActive]}>{t.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity style={pm.submitBtn} onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}>
                    <MaterialCommunityIcons name="alert-circle" size={17} color={COLORS.primary} />
                    <Text style={pm.submitText}>LOG PAIN REPORT</Text>
                  </TouchableOpacity>
                </View>
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const pm = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'flex-end' },
  sheet:     { backgroundColor: COLORS.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%' },
  handleWrap:{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle:    { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn:   { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerCenter:{ flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  headerSub:   { fontSize: FONTS.sizes.xs, color: '#EF5350', fontWeight: FONTS.weights.semibold, marginTop: 2 },
  stepRow:   { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  stepDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.border },
  stepDotActive:{ backgroundColor: '#EF5350' },
  body:      { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  prompt:    { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: SPACING.md },
  subLabel:  { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.text.secondary, marginBottom: SPACING.sm, marginTop: SPACING.md },
  chipGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip:      { paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.primary },
  chipActive:{ borderColor: '#EF5350', backgroundColor: '#EF535020' },
  chipText:  { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, fontWeight: FONTS.weights.semibold },
  chipTextActive:{ color: '#EF5350' },
  typeGrid:  { gap: SPACING.sm },
  typeCard:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.primary },
  typeLabel: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, width: 70 },
  typeDesc:  { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },
  intensityRow:  { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  intBubble:     { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  intNum:        { fontSize: 12, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted },
  intensityLabels:{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  intLabel:  { fontSize: 10, color: COLORS.text.muted },
  timingRow: { flexDirection: 'row', gap: SPACING.sm },
  timingChip:{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.primary },
  timingChipActive: { borderColor: '#EF5350', backgroundColor: '#EF535020' },
  timingText:{ fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.text.secondary },
  timingTextActive: { color: '#EF5350' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: '#EF5350', borderRadius: RADIUS.lg, paddingVertical: 15, marginTop: SPACING.lg },
  submitText:{ color: COLORS.primary, fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, letterSpacing: 1 },
});

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

// ── RestSelector ──────────────────────────────────────────────────────────────
function RestSelector({
  category, selectedSeconds, onSelect, onCustom,
}: {
  category: ExCategory;
  selectedSeconds: number | undefined;
  onSelect: (seconds: number) => void;
  onCustom: () => void;
}) {
  const cfg = REST_CONFIG[category];
  const activeSecs = selectedSeconds !== undefined ? selectedSeconds : cfg.default;
  return (
    <View style={rs.row}>
      <MaterialCommunityIcons name="timer-sand" size={12} color={COLORS.text.muted} />
      <Text style={rs.label}>REST</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={rs.optionsContainer}>
        {cfg.options.map(secs => {
          const isActive = activeSecs === secs;
          return (
            <TouchableOpacity
              key={secs}
              style={[rs.chip, isActive && { backgroundColor: cfg.color + '20', borderColor: cfg.color }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSelect(secs); }}
              activeOpacity={0.75}
            >
              <Text style={[rs.chipText, isActive && { color: cfg.color }]}>{formatTime(secs)}</Text>
              {secs === cfg.default && selectedSeconds === undefined && (
                <View style={[rs.defaultDot, { backgroundColor: cfg.color }]} />
              )}
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={[rs.chip, rs.customChip]} onPress={onCustom} activeOpacity={0.75}>
          <MaterialCommunityIcons name="pencil-outline" size={11} color={COLORS.text.muted} />
          <Text style={rs.customText}>Custom</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
const rs = StyleSheet.create({
  row:              { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.border + '60', gap: SPACING.sm },
  label:            { fontSize: 9, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.5 },
  optionsContainer: { flexDirection: 'row', gap: SPACING.xs, alignItems: 'center', paddingRight: 4 },
  chip:             { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.primary },
  chipText:         { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, fontVariant: ['tabular-nums'] as any },
  defaultDot:       { width: 5, height: 5, borderRadius: 2.5, marginLeft: 1 },
  customChip:       { borderStyle: 'dashed' as any },
  customText:       { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },
});

// ── CustomRestModal ───────────────────────────────────────────────────────────
function CustomRestModal({
  visible, currentSeconds, onConfirm, onClose,
}: {
  visible: boolean;
  currentSeconds: number;
  onConfirm: (seconds: number) => void;
  onClose: () => void;
}) {
  const [mins, setMins]       = useState('');
  const [secs, setSecsVal]    = useState('');
  const slideAnim = useRef(new Animated.Value(600)).current;

  const handleShow = () => {
    const m = Math.floor(currentSeconds / 60);
    const sc = currentSeconds % 60;
    setMins(String(m));
    setSecsVal(String(sc).padStart(2, '0'));
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }).start();
  };
  const handleHide = (cb?: () => void) =>
    Animated.timing(slideAnim, { toValue: 600, duration: 220, useNativeDriver: true }).start(() => cb?.());

  const handleConfirm = () => {
    const total = (parseInt(mins) || 0) * 60 + (parseInt(secs) || 0);
    if (total > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      handleHide(() => onConfirm(total));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onShow={handleShow} onRequestClose={() => handleHide(onClose)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={crm.overlay} onPress={() => handleHide(onClose)}>
          <Animated.View style={[crm.sheet, { transform: [{ translateY: slideAnim }] }]}>
            <Pressable onPress={e => e.stopPropagation()}>
              <View style={crm.handleWrap}><View style={crm.handle} /></View>
              <View style={crm.header}>
                <MaterialCommunityIcons name="timer-cog-outline" size={20} color={COLORS.accent} />
                <Text style={crm.title}>Custom Rest Period</Text>
              </View>
              <View style={crm.body}>
                <View style={crm.inputRow}>
                  <View style={crm.inputGroup}>
                    <TextInput
                      style={crm.input}
                      value={mins}
                      onChangeText={setMins}
                      keyboardType="number-pad"
                      maxLength={2}
                      selectTextOnFocus
                      placeholder="0"
                      placeholderTextColor={COLORS.text.muted}
                    />
                    <Text style={crm.inputLabel}>min</Text>
                  </View>
                  <Text style={crm.colon}>:</Text>
                  <View style={crm.inputGroup}>
                    <TextInput
                      style={crm.input}
                      value={secs}
                      onChangeText={v => setSecsVal(v.replace(/[^0-9]/g, '').slice(0, 2))}
                      keyboardType="number-pad"
                      maxLength={2}
                      selectTextOnFocus
                      placeholder="00"
                      placeholderTextColor={COLORS.text.muted}
                    />
                    <Text style={crm.inputLabel}>sec</Text>
                  </View>
                </View>
                <TouchableOpacity style={crm.confirmBtn} onPress={handleConfirm} activeOpacity={0.85}>
                  <Text style={crm.confirmBtnText}>SET REST PERIOD</Text>
                </TouchableOpacity>
                <TouchableOpacity style={crm.cancelBtn} onPress={() => handleHide(onClose)} activeOpacity={0.85}>
                  <Text style={crm.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const crm = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'flex-end' },
  sheet:         { backgroundColor: COLORS.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  handleWrap:    { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle:        { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  header:        { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title:         { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  body:          { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xl, paddingBottom: 40 },
  inputRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md, marginBottom: SPACING.xl },
  inputGroup:    { alignItems: 'center', gap: SPACING.xs },
  input:         { width: 80, height: 64, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.border, textAlign: 'center', color: COLORS.text.primary, fontSize: 28, fontWeight: FONTS.weights.heavy },
  inputLabel:    { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold, letterSpacing: 0.5 },
  colon:         { fontSize: 32, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, marginBottom: 16 },
  confirmBtn:    { backgroundColor: COLORS.accent, borderRadius: RADIUS.lg, paddingVertical: 15, alignItems: 'center', marginBottom: SPACING.sm },
  confirmBtnText:{ color: COLORS.primary, fontWeight: FONTS.weights.heavy, fontSize: FONTS.sizes.base, letterSpacing: 1 },
  cancelBtn:     { alignItems: 'center', paddingVertical: SPACING.md },
  cancelBtnText: { color: COLORS.text.muted, fontSize: FONTS.sizes.sm },
});

// ── RestTimerBar ──────────────────────────────────────────────────────────────
function RestTimerBar({
  running, seconds, targetSeconds, exerciseName, onToggle, onReset,
}: {
  running: boolean;
  seconds: number;
  targetSeconds: number;
  exerciseName: string;
  onToggle: () => void;
  onReset: () => void;
}) {
  const isIdle   = targetSeconds === 0;
  const isDone   = !running && !isIdle && seconds === 0;
  const progress = targetSeconds > 0 ? Math.max(0, (targetSeconds - seconds) / targetSeconds) : 0;

  const timeColor = isDone            ? TEAL
    : (running && seconds <= 10)      ? RED
    : running                         ? COLORS.accent
    : COLORS.text.muted;

  const totalTime = targetSeconds > 0 ? formatTime(targetSeconds) : '';

  return (
    <View style={rt.bar}>
      {/* Progress track */}
      {!isIdle && (
        <View style={rt.progressTrack}>
          <View style={[rt.progressFill, {
            width: `${Math.round(progress * 100)}%` as any,
            backgroundColor: isDone ? TEAL : (running && seconds <= 10) ? RED : COLORS.accent,
          }]} />
        </View>
      )}
      <View style={rt.content}>
        <View style={rt.left}>
          <MaterialCommunityIcons
            name={isDone ? 'check-circle' : 'timer-outline'}
            size={18}
            color={timeColor}
          />
          <View style={rt.textStack}>
            {exerciseName && !isIdle ? (
              <Text style={rt.exerciseName} numberOfLines={1}>{exerciseName}</Text>
            ) : null}
            <View style={rt.timeRow}>
              <Text style={rt.label}>REST</Text>
              <Text style={[rt.time, { color: timeColor }]}>
                {isIdle ? '—  —' : formatTime(seconds)}
              </Text>
              {totalTime ? <Text style={rt.totalTime}> / {totalTime}</Text> : null}
              {isDone ? <Text style={rt.doneText}>DONE ✓</Text> : null}
              {running ? <View style={rt.activeDot} /> : null}
            </View>
          </View>
        </View>
        <View style={rt.controls}>
          <TouchableOpacity onPress={onToggle} style={rt.controlBtn} activeOpacity={0.75} disabled={isIdle}>
            <MaterialCommunityIcons
              name={running ? 'pause-circle' : 'play-circle'}
              size={28}
              color={isIdle ? COLORS.border : COLORS.accent}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={onReset} style={rt.controlBtn} activeOpacity={0.75} disabled={isIdle}>
            <MaterialCommunityIcons name="refresh" size={22} color={isIdle ? COLORS.border : COLORS.text.muted} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
const rt = StyleSheet.create({
  bar:          { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  progressTrack:{ height: 2, backgroundColor: COLORS.border },
  progressFill: { height: 2 },
  content:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  left:         { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 },
  textStack:    { flex: 1 },
  exerciseName: { fontSize: FONTS.sizes.xs, color: COLORS.text.secondary, fontWeight: FONTS.weights.semibold, marginBottom: 1 },
  timeRow:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  label:        { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2 },
  time:         { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, fontVariant: ['tabular-nums'] as any, letterSpacing: -0.5 },
  totalTime:    { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold, fontVariant: ['tabular-nums'] as any },
  doneText:     { fontSize: FONTS.sizes.xs, color: TEAL, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5 },
  activeDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: TEAL, marginLeft: 2 },
  controls:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  controlBtn:   { padding: 4 },
});

// ── SetRow ────────────────────────────────────────────────────────────────────
function SetRow({ set, setNum, logged, weight, reps, onWeightChange, onRepsChange, onLog, isLast,
  removeMode, editMode, onRemove, onEditSave, adjustActive, isActive, isTimed }: {
  set: ExSet;
  setNum: number;
  logged: boolean;
  weight: string;
  reps: string;
  onWeightChange: (v: string) => void;
  onRepsChange: (v: string) => void;
  onLog: () => void;
  isLast?: boolean;
  removeMode?: boolean;
  editMode?: boolean;
  onRemove?: () => void;
  onEditSave?: () => void;
  adjustActive?: boolean;
  isActive?: boolean;
  isTimed?: boolean;
}) {
  const circleColor = getSetCircleColor(set.type, logged);
  const typeTag = set.type === 'warmup' ? 'WU' : set.type === 'ramp' ? 'RM' : 'W';

  // ── REMOVE MODE ──
  if (removeMode) {
    return (
      <TouchableOpacity
        style={[sr.row, !isLast && sr.rowBorder, { backgroundColor: RED + '08' }]}
        onPress={onRemove}
        activeOpacity={0.7}
      >
        <View style={[sr.circle, { borderColor: RED, backgroundColor: RED + '20' }]}>
          <MaterialCommunityIcons name="close" size={11} color={RED} />
        </View>
        <Text style={[sr.typeTag, { color: RED + '70' }]}>{typeTag}</Text>
        <View style={[sr.input, { borderColor: RED + '30', justifyContent: 'center' }]}>
          <Text style={{ color: RED, textAlign: 'center', fontSize: 13, fontWeight: '600' }}>{weight || '—'}</Text>
        </View>
        <Text style={[sr.sep, { color: RED }]}>×</Text>
        <View style={[sr.input, sr.repsInput, { borderColor: RED + '30', justifyContent: 'center' }]}>
          <Text style={{ color: RED, textAlign: 'center', fontSize: 13, fontWeight: '600' }}>{reps || '—'}</Text>
        </View>
        <View style={sr.doneWrap}>
          <Text style={{ color: RED, fontSize: 9, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' }}>{'TAP TO\nDELETE'}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // ── EDIT MODE (logged set becomes editable) ──
  if (editMode && logged) {
    return (
      <View style={[sr.row, !isLast && sr.rowBorder]}>
        <View style={[sr.circle, { borderColor: BLUE, backgroundColor: BLUE + '20' }]}>
          <MaterialCommunityIcons name="pencil" size={11} color={BLUE} />
        </View>
        <Text style={sr.typeTag}>{typeTag}</Text>
        <TextInput
          style={[sr.input, { borderColor: BLUE + '40', color: BLUE }]}
          value={weight}
          onChangeText={onWeightChange}
          keyboardType="numeric"
          editable
          selectTextOnFocus
          returnKeyType="done"
          placeholder="lbs"
          placeholderTextColor={COLORS.text.muted}
        />
        <Text style={sr.sep}>×</Text>
        <TextInput
          style={[sr.input, sr.repsInput, { borderColor: BLUE + '40', color: BLUE }]}
          value={reps}
          onChangeText={onRepsChange}
          editable
          selectTextOnFocus
          returnKeyType="done"
          placeholder="reps"
          placeholderTextColor={COLORS.text.muted}
        />
        <TouchableOpacity onPress={onEditSave} style={[sr.logBtn, { backgroundColor: BLUE }]} activeOpacity={0.8}>
          <Text style={sr.logBtnText}>SAVE</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── TIMED SET (duration field only) ──
  if (isTimed) {
    return (
      <View style={[sr.row, !isLast && sr.rowBorder, logged && sr.rowLogged, isActive && !logged && sr.rowActive]}>
        <View style={[sr.circle, { borderColor: circleColor, backgroundColor: circleColor + '20' }]}>
          {logged
            ? <MaterialCommunityIcons name="check" size={11} color={circleColor} />
            : <Text style={[sr.circleNum, { color: circleColor }]}>{setNum}</Text>
          }
        </View>
        <Text style={sr.typeTag}>{typeTag}</Text>
        <TextInput
          style={[sr.input, sr.timedInput, logged && sr.inputLogged]}
          value={weight}
          onChangeText={onWeightChange}
          editable={!logged}
          placeholder="e.g. 45 sec"
          placeholderTextColor={COLORS.text.muted}
          selectTextOnFocus
          returnKeyType="done"
        />
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

  return (
    <View style={[sr.row, !isLast && sr.rowBorder, logged && sr.rowLogged, isActive && !logged && sr.rowActive]}>
      {/* Set circle */}
      <View style={[sr.circle, { borderColor: circleColor, backgroundColor: circleColor + '20' }]}>
        {logged
          ? <MaterialCommunityIcons name="check" size={11} color={circleColor} />
          : <Text style={[sr.circleNum, { color: circleColor }]}>{setNum}</Text>
        }
      </View>

      {/* Set type tag */}
      <Text style={sr.typeTag}>{typeTag}</Text>

      {/* Weight input with optional strikethrough when load is adjusted */}
      {adjustActive && set.type === 'work' && set.weight > 0 && !logged ? (
        <View style={sr.weightCol}>
          <Text style={sr.strikeWeight}>{set.weight}</Text>
          <TextInput
            style={[sr.input, sr.inputFull, logged && sr.inputLogged]}
            value={weight}
            onChangeText={onWeightChange}
            keyboardType="numeric"
            editable={!logged}
            placeholder="lbs"
            placeholderTextColor={COLORS.text.muted}
            selectTextOnFocus
            returnKeyType="done"
          />
        </View>
      ) : (
        <TextInput
          style={[sr.input, logged && sr.inputLogged]}
          value={weight}
          onChangeText={onWeightChange}
          keyboardType="numeric"
          editable={!logged}
          placeholder="lbs"
          placeholderTextColor={COLORS.text.muted}
          selectTextOnFocus
          returnKeyType="done"
        />
      )}

      <Text style={sr.sep}>×</Text>

      {/* Reps input */}
      <TextInput
        style={[sr.input, sr.repsInput, logged && sr.inputLogged]}
        value={reps}
        onChangeText={onRepsChange}
        editable={!logged}
        placeholder="reps"
        placeholderTextColor={COLORS.text.muted}
        selectTextOnFocus
        returnKeyType="done"
      />

      {/* LOG / Done */}
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
  row:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 6, paddingHorizontal: 4, borderRadius: RADIUS.md },
  rowBorder:  { borderBottomWidth: 1, borderBottomColor: COLORS.border + '60' },
  // Logged: success-green tint strip
  rowLogged:  { backgroundColor: TEAL + '14', borderBottomColor: 'transparent' },
  // Active (first unlogged): gold border + tint
  rowActive:  { borderWidth: 1, borderColor: COLORS.accent + '55', backgroundColor: COLORS.accent + '08', borderRadius: RADIUS.md },
  circle:    { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  circleNum: { fontSize: 10, fontWeight: FONTS.weights.heavy },
  typeTag:   { fontSize: 9, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, width: 20, letterSpacing: 0.3 },
  input:     { flex: 1, minWidth: 0, height: 36, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, textAlign: 'center', color: COLORS.text.primary, fontSize: 13, fontWeight: FONTS.weights.semibold },
  repsInput: { flex: 1.3, minWidth: 0 },
  // Logged input: green tint, no strikethrough
  inputLogged: { color: TEAL, borderColor: TEAL + '35', backgroundColor: TEAL + '08' },
  // Timed input: single wider field
  timedInput:  { flex: 2.5, minWidth: 0 },
  sep:       { fontSize: 14, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy },
  logBtn:    { backgroundColor: COLORS.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.md, minWidth: 52, alignItems: 'center' },
  logBtnText:{ color: COLORS.primary, fontSize: 11, fontWeight: FONTS.weights.heavy, letterSpacing: 1 },
  doneWrap:  { width: 52, alignItems: 'center' },
  // Adjustment styles
  weightCol:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  inputFull:    { alignSelf: 'stretch', flex: 0 },
  strikeWeight: { fontSize: 9, color: '#EF5350', textDecorationLine: 'line-through', fontWeight: '600', marginBottom: 2, textAlign: 'center' },
});

// ── Detect timed prescription (e.g. "45 sec", "2 min hold") ─────────────────
function isTimedPrescription(prescription: string): boolean {
  if (!prescription) return false;
  const lower = prescription.toLowerCase().trim();
  // Has a time unit and no set×rep pattern
  return (lower.includes('sec') || lower.includes('min')) && !lower.includes('×') && !/ x /i.test(lower);
}

// ── ExerciseCard ──────────────────────────────────────────────────────────────
function ExerciseCard({
  exercise, expanded, loggedSets, onToggle, onLog, onAdjust,
  onReportPain, onAddSet, swap, setValues, onSetValueChange, effort, onEffortChange,
  inRemoveMode, inEditMode, onRemoveSet, onEditSave, onEnterRemoveMode, onEnterEditMode, onExitMode,
  restConfig, adjustActive, previousData, prExercises, onKebab,
  onMoveUp, onMoveDown, canMoveUp, canMoveDown,
}: {
  exercise: Exercise;
  expanded: boolean;
  loggedSets: Set<string>;
  onToggle: () => void;
  onLog: (setId: string, exerciseName: string, set: ExSet) => void;
  onAdjust: (id: string, name: string) => void;
  onReportPain: (exerciseName: string) => void;
  onAddSet: (exerciseId: string) => void;
  swap?: SwapInfo;
  setValues: Record<string, { weight: string; reps: string }>;
  onSetValueChange: (setId: string, field: 'weight' | 'reps', value: string) => void;
  effort: number | undefined;
  onEffortChange: (v: number) => void;
  inRemoveMode: boolean;
  inEditMode: boolean;
  onRemoveSet: (setId: string) => void;
  onEditSave: (setId: string) => void;
  onEnterRemoveMode: () => void;
  onEnterEditMode: () => void;
  onExitMode: () => void;
  restConfig?: {
    selectedSeconds: number | undefined;
    onSelect: (seconds: number) => void;
    onCustom: () => void;
  };
  adjustActive?: boolean;
  previousData?: Record<string, {weight: number; reps: number; date: string}[]>;
  prExercises?: Set<string>;
  onKebab?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  const catStyle    = getCategoryStyle(exercise.category);
  const loggedCount = exercise.sets.filter(s => loggedSets.has(s.id)).length;
  const total       = exercise.sets.length;
  const allDone     = loggedCount === total;
  const rawName = swap?.replacement ?? exercise.name;
  const nameIsValid = rawName && typeof rawName === 'string' && rawName.trim().length >= 2 && /[a-zA-Z]/.test(rawName);
  if (!nameIsValid && exercise.name) console.log('[Today] ExerciseCard invalid name:', JSON.stringify(exercise.name), 'category:', exercise.category);
  const displayName = nameIsValid ? rawName : getCategoryStyle(exercise.category).label;
  const progColor   = allDone ? TEAL : loggedCount > 0 ? COLORS.accent : COLORS.text.muted;
  const cardBorderColor = inRemoveMode ? RED + '40' : inEditMode ? BLUE + '40' : COLORS.border;

  // ── Phase 1: Hero mode for Primary/Speed cards ────────────────────────────
  const heroMode      = (exercise.category === 'primary' || exercise.category === 'speed') && !inRemoveMode && !inEditMode;
  const isTimedEx     = isTimedPrescription(exercise.prescription);
  const activeSetIdx  = exercise.sets.findIndex(s => !loggedSets.has(s.id));
  const activeSetId   = activeSetIdx >= 0 ? exercise.sets[activeSetIdx].id : null;

  return (
    <View style={[ec.card, { borderColor: cardBorderColor }]}>
      {/* ── Collapsible header: [badge | SWAPPED | ...] left — [PR | progress | ↑ | ↓ | ⋮ | chevron] right ── */}
      <TouchableOpacity onPress={onToggle} style={ec.header} activeOpacity={0.8}>
        <View style={ec.headerLeft}>
          <View style={[ec.catBadge, { backgroundColor: catStyle.bg }]}>
            <Text style={[ec.catBadgeText, { color: catStyle.text }]}>{catStyle.label.toUpperCase()}</Text>
          </View>
          {inRemoveMode && (
            <View style={ec.modeBadge}>
              <Text style={ec.modeBadgeRemoveText}>REMOVING</Text>
            </View>
          )}
          {inEditMode && (
            <View style={[ec.modeBadge, ec.modeBadgeEdit]}>
              <Text style={ec.modeBadgeEditText}>EDITING</Text>
            </View>
          )}
          {swap && !inRemoveMode && !inEditMode && (
            <View style={ec.swapPill}>
              <MaterialCommunityIcons name="swap-horizontal" size={10} color={COLORS.accent} />
              <Text style={ec.swapPillText}>SWAPPED</Text>
            </View>
          )}
        </View>
        <View style={ec.headerRight}>
          {/* PR badge */}
          {prExercises.has(exercise.name) && (
            <View style={{ backgroundColor: '#C9A84C20', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: '#C9A84C' }}>PR</Text>
            </View>
          )}
          <View style={[ec.progressPill, { backgroundColor: progColor + '20' }]}>
            <Text style={[ec.progressText, { color: progColor }]}>{loggedCount}/{total}</Text>
          </View>
          {/* ↑ reorder arrow */}
          {onMoveUp && canMoveUp && (
            <TouchableOpacity
              onPress={onMoveUp}
              style={ec.arrowBtn}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              activeOpacity={0.6}
            >
              <MaterialCommunityIcons name="arrow-up" size={16} color={COLORS.text.secondary} />
            </TouchableOpacity>
          )}
          {/* ↓ reorder arrow */}
          {onMoveDown && canMoveDown && (
            <TouchableOpacity
              onPress={onMoveDown}
              style={ec.arrowBtn}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              activeOpacity={0.6}
            >
              <MaterialCommunityIcons name="arrow-down" size={16} color={COLORS.text.secondary} />
            </TouchableOpacity>
          )}
          {/* ⋮ kebab */}
          {onKebab && (
            <TouchableOpacity
              onPress={onKebab}
              style={ec.arrowBtn}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              activeOpacity={0.6}
            >
              <MaterialCommunityIcons name="dots-vertical" size={19} color={COLORS.text.secondary} />
            </TouchableOpacity>
          )}
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
        <>
          {/* ── FORM chip (silent — Phase 1 placeholder) ── */}
          <TouchableOpacity
            onPress={() => {/* silent – Phase 5 will open how-to modal */}}
            style={ec.formChip}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="dumbbell" size={13} color={COLORS.accent} />
            <Text style={ec.formChipText}>FORM</Text>
          </TouchableOpacity>

          {/* ── Rest Period Selector ── */}
          {restConfig && (
            <RestSelector
              category={exercise.category}
              selectedSeconds={restConfig.selectedSeconds}
              onSelect={restConfig.onSelect}
              onCustom={restConfig.onCustom}
            />
          )}

          {/* ══════════════════════════════════════════════════════════════════
              HERO MODE — Primary / Speed: one focused set at a time
          ══════════════════════════════════════════════════════════════════ */}
          {heroMode ? (
            <View style={ec.heroBody}>
              {/* Previous-session reference */}
              {previousData[exercise.name]?.length > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1A1A1E', marginBottom: 8 }}>
                  <MaterialCommunityIcons name="history" size={12} color="#555" />
                  <Text style={{ fontSize: 11, color: '#555' }}>
                    Last ({previousData[exercise.name][0].date.slice(5).replace('-', '/')}):
                  </Text>
                  <Text style={{ fontSize: 11, color: '#888', fontWeight: '600' }}>
                    {previousData[exercise.name].map(s => `${s.weight}×${s.reps}`).join(' · ')}
                  </Text>
                </View>
              ) : exercise.lastSession !== '—' ? (
                <View style={[ec.lastRow, { marginBottom: 8 }]}>
                  <MaterialCommunityIcons name="history" size={12} color={COLORS.text.muted} />
                  <Text style={ec.lastText}>Last: {exercise.lastSession}</Text>
                </View>
              ) : null}

              {/* Coaching cues */}
              {exercise.cues.length > 0 && (
                <View style={[ec.cuesRow, { marginBottom: 12 }]}>
                  <MaterialCommunityIcons name="lightbulb-on-outline" size={12} color={COLORS.accent} style={{ marginTop: 1 }} />
                  <Text style={ec.cuesText}>{exercise.cues.join('  ·  ')}</Text>
                </View>
              )}

              {/* Active set or All Done state */}
              {activeSetIdx >= 0 ? (
                <>
                  {/* Set counter */}
                  <View style={ec.heroSetCounter}>
                    <Text style={ec.heroSetLabel}>SET {activeSetIdx + 1}</Text>
                    <Text style={ec.heroSetTotal}> of {total}</Text>
                  </View>

                  {/* Inputs: timed → single duration field; standard → weight × reps */}
                  {isTimedEx ? (
                    <View style={ec.heroTimedRow}>
                      <TextInput
                        style={ec.heroTimedInput}
                        value={setValues[exercise.sets[activeSetIdx].id]?.weight ?? ''}
                        onChangeText={(v) => onSetValueChange(exercise.sets[activeSetIdx].id, 'weight', v)}
                        placeholder="e.g. 45 sec"
                        placeholderTextColor={COLORS.text.muted}
                        editable={true}
                        selectTextOnFocus
                        returnKeyType="done"
                      />
                    </View>
                  ) : (
                    <View style={ec.heroInputRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <TextInput
                          style={ec.heroInput}
                          value={setValues[exercise.sets[activeSetIdx].id]?.weight ?? ''}
                          onChangeText={(v) => onSetValueChange(exercise.sets[activeSetIdx].id, 'weight', v)}
                          keyboardType="numeric"
                          placeholder="lbs"
                          placeholderTextColor={COLORS.text.muted}
                          selectTextOnFocus
                          returnKeyType="next"
                        />
                      </View>
                      <Text style={ec.heroSep}>×</Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <TextInput
                          style={ec.heroInput}
                          value={setValues[exercise.sets[activeSetIdx].id]?.reps ?? ''}
                          onChangeText={(v) => onSetValueChange(exercise.sets[activeSetIdx].id, 'reps', v)}
                          placeholder="reps"
                          placeholderTextColor={COLORS.text.muted}
                          selectTextOnFocus
                          returnKeyType="done"
                        />
                      </View>
                    </View>
                  )}

                  {/* LOG SET button */}
                  <TouchableOpacity
                    style={ec.heroLogBtn}
                    onPress={() => onLog(exercise.sets[activeSetIdx].id, displayName, exercise.sets[activeSetIdx])}
                    activeOpacity={0.85}
                  >
                    <Text style={ec.heroLogBtnText}>LOG SET {activeSetIdx + 1}</Text>
                    <MaterialCommunityIcons name="check" size={16} color={COLORS.primary} />
                  </TouchableOpacity>
                </>
              ) : (
                /* All sets done */
                <View style={ec.heroDoneWrap}>
                  <MaterialCommunityIcons name="check-decagram" size={34} color={TEAL} />
                  <Text style={ec.heroDoneText}>ALL SETS COMPLETE</Text>
                </View>
              )}

              {/* Set progress dots */}
              <View style={ec.heroDotsRow}>
                {exercise.sets.map((s, i) => {
                  const isDotLogged  = loggedSets.has(s.id);
                  const isDotActive  = i === activeSetIdx && !isDotLogged;
                  return (
                    <View
                      key={s.id}
                      style={[ec.heroDot, isDotLogged && ec.heroDotLogged, isDotActive && ec.heroDotActive]}
                    />
                  );
                })}
              </View>

              {/* Effort + Actions (show once at least 1 set logged) */}
              {loggedCount > 0 && (
                <>
                  <View style={ec.effortRow}>
                    <Text style={ec.effortLabel}>OVERALL EFFORT</Text>
                    <View style={ec.effortCircles}>
                      {[1, 2, 3, 4, 5].map(v => {
                        const selected = effort === v;
                        return (
                          <TouchableOpacity
                            key={v}
                            style={[ec.effortCircle, selected && ec.effortCircleSelected]}
                            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onEffortChange(v); }}
                            activeOpacity={0.7}
                          >
                            <Text style={[ec.effortNum, selected && ec.effortNumSelected]}>{v}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                  <View style={ec.actionRow}>
                    <TouchableOpacity style={ec.actionPill} onPress={() => onAdjust(exercise.id, displayName)} activeOpacity={0.75}>
                      <MaterialCommunityIcons name="swap-horizontal" size={13} color={COLORS.text.muted} />
                      <Text style={ec.actionPillText}>Swap</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[ec.actionPill, ec.actionPillPain]} onPress={() => onReportPain(displayName)} activeOpacity={0.75}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={13} color={RED} />
                      <Text style={[ec.actionPillText, { color: RED }]}>Pain</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[ec.actionPill, ec.actionPillAdd]} onPress={() => onAddSet(exercise.id)} activeOpacity={0.75}>
                      <MaterialCommunityIcons name="plus" size={13} color={COLORS.accent} />
                      <Text style={[ec.actionPillText, { color: COLORS.accent }]}>Add Set</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Coach notes */}
              {exercise.notes ? <Text style={ec.notes}>{exercise.notes}</Text> : null}
            </View>

          ) : (
          /* ══════════════════════════════════════════════════════════════════
              NORMAL MODE — Support / Accessory / Prehab / Warm-up / Cooldown
          ══════════════════════════════════════════════════════════════════ */
          <View style={ec.body}>
          {/* Previous workout reference */}
          {previousData[exercise.name]?.length > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1A1A1E', marginBottom: 4 }}>
              <MaterialCommunityIcons name="history" size={12} color="#555" />
              <Text style={{ fontSize: 11, color: '#555' }}>
                Last ({previousData[exercise.name][0].date.slice(5).replace('-', '/')}):
              </Text>
              <Text style={{ fontSize: 11, color: '#888', fontWeight: '600' }}>
                {previousData[exercise.name].map(s => `${s.weight}×${s.reps}`).join(' · ')}
              </Text>
            </View>
          ) : exercise.lastSession !== '—' ? (
            <View style={ec.lastRow}>
              <MaterialCommunityIcons name="history" size={12} color={COLORS.text.muted} />
              <Text style={ec.lastText}>Last: {exercise.lastSession}</Text>
            </View>
          ) : null}

          {/* Coaching cues */}
          {exercise.cues.length > 0 && (
            <View style={ec.cuesRow}>
              <MaterialCommunityIcons name="lightbulb-on-outline" size={12} color={COLORS.accent} style={{ marginTop: 1 }} />
              <Text style={ec.cuesText}>{exercise.cues.join('  ·  ')}</Text>
            </View>
          )}

          {/* Sets label + divider */}
          <View style={ec.setsHeader}>
            <Text style={ec.setsLabel}>SETS</Text>
          </View>

          {/* Set rows — active set (first unlogged) gets gold border */}
          <View>
            {exercise.sets.map((set, idx) => {
              const isActive = set.id === activeSetId;
              const isTimed  = isTimedEx;
              return (
                <SetRow
                  key={set.id}
                  set={set}
                  setNum={idx + 1}
                  logged={loggedSets.has(set.id)}
                  weight={setValues[set.id]?.weight ?? ''}
                  reps={setValues[set.id]?.reps ?? ''}
                  onWeightChange={(v) => onSetValueChange(set.id, 'weight', v)}
                  onRepsChange={(v) => onSetValueChange(set.id, 'reps', v)}
                  onLog={() => onLog(set.id, displayName, set)}
                  isLast={idx === exercise.sets.length - 1}
                  removeMode={inRemoveMode}
                  editMode={inEditMode}
                  onRemove={() => onRemoveSet(set.id)}
                  onEditSave={() => onEditSave(set.id)}
                  adjustActive={adjustActive}
                  isActive={isActive}
                  isTimed={isTimed}
                />
              );
            })}
          </View>

          {/* ── Overall Effort selector ── */}
          <View style={ec.effortRow}>
            <Text style={ec.effortLabel}>OVERALL EFFORT</Text>
            <View style={ec.effortCircles}>
              {[1, 2, 3, 4, 5].map(v => {
                const selected = effort === v;
                return (
                  <TouchableOpacity
                    key={v}
                    style={[ec.effortCircle, selected && ec.effortCircleSelected]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      onEffortChange(v);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[ec.effortNum, selected && ec.effortNumSelected]}>{v}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── Pill action buttons ── */}
          <View style={ec.actionRow}>
            <TouchableOpacity
              style={ec.actionPill}
              onPress={() => onAdjust(exercise.id, displayName)}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons name="swap-horizontal" size={13} color={COLORS.text.muted} />
              <Text style={ec.actionPillText}>Swap</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[ec.actionPill, ec.actionPillPain]}
              onPress={() => onReportPain(displayName)}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons name="alert-circle-outline" size={13} color={RED} />
              <Text style={[ec.actionPillText, { color: RED }]}>Pain</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[ec.actionPill, ec.actionPillAdd]}
              onPress={() => onAddSet(exercise.id)}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons name="plus" size={13} color={COLORS.accent} />
              <Text style={[ec.actionPillText, { color: COLORS.accent }]}>Add Set</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[ec.actionPill, ec.actionPillRemove, inRemoveMode && ec.actionPillRemoveActive]}
              onPress={inRemoveMode ? onExitMode : onEnterRemoveMode}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons name="minus-circle-outline" size={13} color={RED} />
              <Text style={[ec.actionPillText, { color: RED }]}>Remove set</Text>
            </TouchableOpacity>

            {loggedCount > 0 && (
              <TouchableOpacity
                style={[ec.actionPill, ec.actionPillEdit, inEditMode && ec.actionPillEditActive]}
                onPress={inEditMode ? onExitMode : onEnterEditMode}
                activeOpacity={0.75}
              >
                <MaterialCommunityIcons name="pencil-outline" size={13} color={BLUE} />
                <Text style={[ec.actionPillText, { color: BLUE }]}>Edit logged</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── DONE REMOVING button ── */}
          {inRemoveMode && (
            <TouchableOpacity style={ec.doneRemoveBtn} onPress={onExitMode} activeOpacity={0.85}>
              <Text style={ec.doneRemoveBtnText}>DONE REMOVING</Text>
            </TouchableOpacity>
          )}

          {/* ── DONE EDITING button ── */}
          {inEditMode && (
            <TouchableOpacity style={ec.doneEditBtn} onPress={onExitMode} activeOpacity={0.85}>
              <Text style={ec.doneEditBtnText}>DONE EDITING</Text>
            </TouchableOpacity>
          )}

          {/* Coach notes */}
          {exercise.notes ? (
            <Text style={ec.notes}>{exercise.notes}</Text>
          ) : null}
        </View>
          )}
        </>
      )}
    </View>
  );
}
const ec = StyleSheet.create({
  card:          { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  headerLeft:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 },
  headerRight:   { flexDirection: 'row', alignItems: 'center', gap: 2 },
  catBadge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  catBadgeText:  { fontSize: 10, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5 },
  swapPill:      { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.accent + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.full },
  swapPillText:  { fontSize: 9, color: COLORS.accent, fontWeight: FONTS.weights.heavy },
  progressPill:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  progressText:  { fontSize: 11, fontWeight: FONTS.weights.heavy },
  // Arrow / kebab buttons in header
  arrowBtn:      { padding: 5 },
  nameRow:       { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
  name:          { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 23, marginBottom: 2 },
  prescription:  { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },
  body:          { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },
  lastRow:       { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: SPACING.sm },
  lastText:      { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontStyle: 'italic' },
  cuesRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginBottom: SPACING.md, backgroundColor: COLORS.accent + '10', borderRadius: RADIUS.md, padding: SPACING.sm },
  cuesText:      { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontWeight: FONTS.weights.semibold, flex: 1, lineHeight: 17 },
  setsHeader:    { paddingBottom: SPACING.xs, marginBottom: SPACING.xs, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  setsLabel:     { fontSize: 9, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.5 },
  notes:         { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontStyle: 'italic', marginTop: SPACING.sm, lineHeight: 17 },
  // ── Form chip (gold, silent)
  formChip:      { flexDirection: 'row', alignItems: 'center', gap: 5, marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.accent + '15', borderWidth: 1, borderColor: COLORS.accent + '45', borderRadius: RADIUS.full, paddingVertical: 6, paddingHorizontal: 14, alignSelf: 'flex-start' },
  formChipText:  { fontSize: 11, color: COLORS.accent, fontWeight: FONTS.weights.heavy, letterSpacing: 0.8 },
  // ── Effort selector
  effortRow:         { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  effortLabel:       { fontSize: 9, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.5, flex: 1 },
  effortCircles:     { flexDirection: 'row', gap: 7 },
  effortCircle:      { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1A1A1E', borderWidth: 1.5, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  effortCircleSelected: { backgroundColor: '#C9A84C', borderColor: '#C9A84C' },
  effortNum:         { fontSize: 13, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted },
  effortNumSelected: { color: '#0A0A0C' },
  // ── Action pills
  actionRow:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md, flexWrap: 'wrap' },
  actionPill:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.primary },
  actionPillText:{ fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },
  actionPillPain:{ borderColor: '#EF535035' },
  actionPillAdd: { borderColor: COLORS.accent + '45' },
  actionPillRemove:       { borderColor: '#EF535035' },
  actionPillRemoveActive: { backgroundColor: '#EF535020' },
  actionPillEdit:         { borderColor: '#5B9CF535' },
  actionPillEditActive:   { backgroundColor: '#5B9CF520' },
  // Mode badges
  modeBadge:          { paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.full, backgroundColor: '#EF535020' },
  modeBadgeEdit:      { backgroundColor: '#5B9CF520' },
  modeBadgeRemoveText:{ fontSize: 9, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5, color: '#EF5350' },
  modeBadgeEditText:  { fontSize: 9, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5, color: '#5B9CF5' },
  // Done mode buttons
  doneRemoveBtn:     { marginTop: SPACING.sm, paddingVertical: 10, borderRadius: 8, backgroundColor: '#EF535020', borderWidth: 1, borderColor: '#EF535040', alignItems: 'center' },
  doneRemoveBtnText: { color: '#EF5350', fontWeight: FONTS.weights.heavy, fontSize: FONTS.sizes.sm, letterSpacing: 0.5 },
  doneEditBtn:       { marginTop: SPACING.sm, paddingVertical: 10, borderRadius: 8, backgroundColor: '#5B9CF520', borderWidth: 1, borderColor: '#5B9CF540', alignItems: 'center' },
  doneEditBtnText:   { color: '#5B9CF5', fontWeight: FONTS.weights.heavy, fontSize: FONTS.sizes.sm, letterSpacing: 0.5 },
  // ── Hero mode styles (Primary / Speed)
  heroBody:       { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },
  heroSetCounter: { flexDirection: 'row', alignItems: 'baseline', marginBottom: SPACING.md },
  heroSetLabel:   { fontSize: 22, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, letterSpacing: 0.5 },
  heroSetTotal:   { fontSize: FONTS.sizes.base, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },
  heroInputRow:   { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.lg },
  heroInput:      { alignSelf: 'stretch', height: 64, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.accent + '50', textAlign: 'center', color: COLORS.text.primary, fontSize: 26, fontWeight: FONTS.weights.heavy },
  heroSep:        { fontSize: 22, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy, flexShrink: 0 },
  heroTimedRow:   { marginBottom: SPACING.lg },
  heroTimedInput: { height: 64, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.accent + '50', textAlign: 'center', color: COLORS.text.primary, fontSize: 22, fontWeight: FONTS.weights.heavy },
  heroLogBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.accent, borderRadius: RADIUS.lg, paddingVertical: 15, marginBottom: SPACING.lg },
  heroLogBtnText: { color: COLORS.primary, fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, letterSpacing: 1.2 },
  heroDoneWrap:   { alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.sm },
  heroDoneText:   { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: TEAL, letterSpacing: 1 },
  heroDotsRow:    { flexDirection: 'row', gap: 8, marginBottom: SPACING.md, justifyContent: 'center' },
  heroDot:        { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.border },
  heroDotLogged:  { backgroundColor: TEAL },
  heroDotActive:  { backgroundColor: COLORS.accent, transform: [{ scale: 1.3 }] },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function TodayScreen() {
  const router = useRouter();

  // Session data
  const [week, setWeek]               = useState(1);
  const [todaySession, setTodaySession] = useState<ProgramSession | null>(null);
  const [apiSession, setApiSession]   = useState<TodaySessionResponse | null>(null);
  const [injuryFlags, setInjuryFlags] = useState<string[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [sessionFinished, setSessionFinished] = useState(false);
  // B1 fix: initialize as null; never default to 'program' to prevent UI flash
  const [trainingMode, setTrainingMode] = useState<'program' | 'free' | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Tracker mode: today's logged exercises
  const [trackerLogs, setTrackerLogs] = useState<any[]>([]);
  const [trackerLogsLoading, setTrackerLogsLoading] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Dynamic exercise list — initialized from local programData (correct day, instant)
  // then overridden by API exercises when the plan loads
  const [exercises, setExercises] = useState<Exercise[]>(() => {
    const s = getTodaySession(week || 1);
    return buildTodayExercisesFromLocal(s);
  });

  // Exercise interaction
  const [loggedSets, setLoggedSets]   = useState<Set<string>>(new Set());
  const [setValues, setSetValues]     = useState<Record<string, { weight: string; reps: string }>>({});
  const [efforts, setEfforts]         = useState<Record<string, number>>({});
  const [expanded, setExpanded]       = useState<Set<string>>(() => {
    // Default expand the first exercise based on local data
    const s = getTodaySession(week || 1);
    const exs = buildTodayExercisesFromLocal(s);
    return new Set([exs[0]?.id || 'local-main']);
  });
  const [swaps, setSwaps]             = useState<SwapMap>({});
  const [removeModeExId, setRemoveModeExId] = useState<string | null>(null);
  const [editModeExId, setEditModeExId]     = useState<string | null>(null);
  const [logEntryIds, setLogEntryIds]       = useState<Record<string, string>>({});

  // ── Kebab menu state (Phase 1C) ───────────────────────────────────────────────
  const [kebabMenuExId, setKebabMenuExId] = useState<string | null>(null);
  const [kebabSaving, setKebabSaving]     = useState(false);
  // Bug 3: two-level category picker
  const [showSubCatSheet, setShowSubCatSheet] = useState(false);
  // Phase 2: kebab action sub-sheets
  const [showAdjustSheet, setShowAdjustSheet] = useState(false);
  const [adjustDraftWeights, setAdjustDraftWeights] = useState<Record<string, string>>({});
  const [adjustFillAll, setAdjustFillAll]     = useState('');
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  // Reset sub-sheets whenever the kebab closes
  React.useEffect(() => {
    if (!kebabMenuExId) {
      setShowSubCatSheet(false);
      setShowAdjustSheet(false);
      setShowRemoveConfirm(false);
      setAdjustDraftWeights({});
      setAdjustFillAll('');
    }
  }, [kebabMenuExId]);

  // Rest timer
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerTarget, setTimerTarget]   = useState(0);     // total rest duration (for progress bar)
  const [timerExerciseName, setTimerExerciseName] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Rest period selector state
  const [exerciseRestDurations, setExerciseRestDurations] = useState<Record<string, number>>({});
  const [customRestExerciseId, setCustomRestExerciseId]   = useState('');
  const [customRestVisible, setCustomRestVisible]         = useState(false);
  const initialLoadDone   = useRef(false);
  const exercisesRef      = useRef<Exercise[]>([]);
  const lastLoadDate      = useRef('');
  const mountRestoreDone  = useRef(false); // Fix 5: prevent mount/focus race
  const userEditedSets    = useRef<Set<string>>(new Set()); // Fix: track user-edited set IDs
  // Ref mirror for trainingMode — lets the memoised useFocusEffect callback
  // read the CURRENT mode without a stale closure (loadKey deps never change).
  const trainingModeRef   = useRef<'program' | 'free' | null>(null);
  // Increment to force full reload even while screen is already focused (pull-to-refresh)
  const [loadKey, setLoadKey] = useState(0);

  // ── AsyncStorage keys for persisting today's set values & logged state ───────
  const SET_VALUES_KEY    = 'today_set_values';
  const LOGGED_SETS_KEY   = 'today_logged_sets';
  const ADDED_SETS_KEY    = 'today_added_sets';   // Added sets survive tab switches
  const FINISHED_DATE_KEY = 'today_finished_date'; // Persists SESSION COMPLETE button state

  const saveSetValuesToStorage = useCallback(async (
    values: Record<string, { weight: string; reps: string }>
  ) => {
    try { await AsyncStorage.setItem(SET_VALUES_KEY, JSON.stringify(values)); } catch {}
  }, []);

  const saveLoggedSetsToStorage = useCallback(async (
    logged: Set<string>, ids: Record<string, string>
  ) => {
    try {
      await AsyncStorage.setItem(LOGGED_SETS_KEY, JSON.stringify({
        loggedSetIds: Array.from(logged),
        entryIds:     ids,
        date:         getLocalDateString(),
      }));
    } catch {}
  }, []);

  // ── Persist added sets (keyed by exercise NAME — IDs can change between loads) ─
  const saveAddedSetsToStorage = useCallback(async (addedByName: Record<string, any[]>) => {
    try {
      const payload = { date: getLocalDateString(), addedByName };
      await AsyncStorage.setItem(ADDED_SETS_KEY, JSON.stringify(payload));
      console.log('[Today] Saved added sets for:', Object.keys(addedByName).join(', '));
    } catch (err) {
      console.warn('[Today] FAILED to save added sets:', err);
    }
  }, []);

  // Adjust modal
  const [modalVisible, setModal]   = useState(false);
  const [adjustKey, setAdjustKey]  = useState('');
  const [adjustName, setAdjustName] = useState('');

  // ── Readiness check state ────────────────────────────────────────────────────
  const [showReadiness, setShowReadiness]       = useState(false);
  const [readinessAdjustment, setReadinessAdjustment] = useState<string | null>(null);
  const [readinessScore, setReadinessScore]     = useState<number | null>(null);
  const [loadMultiplier, setLoadMultiplier]     = useState(1.0);
  const [adjustmentPercent, setAdjustmentPercent] = useState(0);
  const [autoAdjustOverride, setAutoAdjustOverride] = useState(false);

  // ── Pain report state ────────────────────────────────────────────────────────
  const [showPainModal, setShowPainModal]   = useState(false);
  const [painExerciseName, setPainExerciseName] = useState('');
  const [painAlert, setPainAlert]           = useState<string | null>(null);

  // ── Gamification state ───────────────────────────────────────────────────────
  const [previousData, setPreviousData] = useState<Record<string, {weight: number; reps: number; date: string}[]>>({});
  const [prCelebration, setPrCelebration] = useState<any>(null);
  const [prExercises, setPrExercises]     = useState<Set<string>>(new Set());
  const [showSessionComplete, setShowSessionComplete] = useState(false);
  const [sessionStats, setSessionStats]   = useState<any>(null);
  const prCardRef = useRef<View>(null);
  const sessionCardRef = useRef<View>(null);

  // ── PR particle animation ─────────────────────────────────────────────────────
  const prParticles = useRef(
    Array.from({ length: 15 }, () => ({
      x: Math.random() * 300,
      animY: new Animated.Value(-20),
      animOpacity: new Animated.Value(1),
      size: 4 + Math.random() * 8,
      delay: Math.random() * 1500,
    }))
  ).current;

  // ── Previous workout data fetch ──────────────────────────────────────────────
  const fetchPreviousData = useCallback(async (exerciseNames: string[]) => {
    const prevMap: Record<string, {weight: number; reps: number; date: string}[]> = {};
    const todayStr = getLocalDateString();
    for (const name of exerciseNames) {
      try {
        const logs = await logApi.list({ exercise: name });
        const entries = (Array.isArray(logs) ? logs : (logs?.logs || []))
          .filter((e: any) => e.date < todayStr);
        if (entries.length > 0) {
          const lastDate = entries[0].date;
          const lastSession = entries.filter((e: any) => e.date === lastDate);
          prevMap[name] = lastSession.map((e: any) => ({
            weight: parseFloat(e.weight) || 0,
            reps:   parseInt(String(e.reps)) || 0,
            date:   e.date,
          }));
        }
      } catch { /* Non-critical */ }
    }
    setPreviousData(prevMap);
  }, []);

  // ── PR detection helper (async — fetches backend history as fallback) ─────────
  const checkForPR = useCallback(async (exerciseName: string, weight: number, reps: number) => {
    const e1rm = weight * (1 + reps / 30);
    if (e1rm <= 0 || weight <= 0) return null;

    let historicalBest = 0;

    // 1. Check previousData (prior days, from local state)
    const prevEntries = previousData[exerciseName] || [];
    const prevBestE1rm = prevEntries.reduce((mx, s) => {
      const prev = s.weight * (1 + s.reps / 30);
      return prev > mx ? prev : mx;
    }, 0);
    historicalBest = Math.max(historicalBest, prevBestE1rm);

    // 2. Check earlier sets logged TODAY for this exercise
    const ex = exercises.find(e => e.name === exerciseName);
    if (ex) {
      for (const s of ex.sets) {
        if (loggedSets.has(s.id)) {
          const sv = setValues[s.id];
          if (sv) {
            const w = parseFloat(sv.weight) || 0;
            const r = parseInt(sv.reps) || 0;
            const se1rm = w * (1 + r / 30);
            if (se1rm > historicalBest) historicalBest = se1rm;
          }
        }
      }
    }

    // 3. If still no comparison data, fetch from backend PR history
    if (historicalBest === 0) {
      try {
        const history = await prApi.getHistory(exerciseName);
        const entries = Array.isArray(history) ? history : (history?.history || []);
        for (const h of entries) {
          const he1rm = h.e1rm || (h.weight && h.reps ? h.weight * (1 + h.reps / 30) : 0);
          if (he1rm > historicalBest) historicalBest = he1rm;
        }
      } catch {} // Non-critical — skip if no history
    }

    // Fire PR only if we beat a previous record AND there IS a record to beat
    if (historicalBest > 0 && e1rm > historicalBest) {
      return {
        exercise: exerciseName,
        weight,
        reps,
        e1rm: Math.round(e1rm),
        previousBest: Math.round(historicalBest),
      };
    }
    return null;
  }, [previousData, exercises, loggedSets, setValues]);

  // ── Share PR card ─────────────────────────────────────────────────────────────
  const sharePRCard = useCallback(async (data: any) => {
    try {
      const uri = await captureRef(prCardRef, { format: 'png', quality: 1 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png' });
    } catch (err) {
      console.warn('Share failed:', err);
    }
  }, []);

  // ── Share Session card (BUG 3) ────────────────────────────────────────────────
  const shareSessionCard = useCallback(async () => {
    try {
      const uri = await captureRef(sessionCardRef, { format: 'png', quality: 1 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png' });
    } catch (err) {
      console.warn('Session share failed:', err);
    }
  }, []);

  // ── Defensive: clear invalid PR celebration state ──────────────────────────
  useEffect(() => {
    if (prCelebration && (prCelebration.weight <= 0 || prCelebration.reps <= 0)) {
      console.warn('[Today] Invalid PR celebration detected — clearing', prCelebration);
      setPrCelebration(null);
    }
  }, [prCelebration]);

  // ── PR particle animation trigger (BUG 1) ─────────────────────────────────────
  useEffect(() => {
    if (prCelebration) {
      prParticles.forEach(p => {
        p.animY.setValue(-20);
        p.animOpacity.setValue(1);
        Animated.sequence([
          Animated.delay(p.delay),
          Animated.parallel([
            Animated.timing(p.animY, { toValue: 700, duration: 2500, useNativeDriver: true }),
            Animated.timing(p.animOpacity, { toValue: 0, duration: 2500, useNativeDriver: true }),
          ]),
        ]).start();
      });
      // Auto-dismiss after 8 seconds
      const timer = setTimeout(() => setPrCelebration(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [prCelebration, prParticles]);

  const todayName = getTodayDayName();

  // Pull-to-refresh handler — force a full session reload
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    initialLoadDone.current = false;
    lastLoadDate.current = '';
    setLoadKey(k => k + 1);          // Triggers useFocusEffect to re-run (while screen is focused)
    // setRefreshing(false) is handled by the load effect after data arrives
  }, []);

  // ── Restore edited values from AsyncStorage on component mount ──────────────
  useEffect(() => {
    (async () => {
      try {
        const todayStr    = getLocalDateString();

        // Audit Bug #9 fix: previously, stale setValues from a prior day
        // would only get cleared if LOGGED_SETS_KEY existed AND its date was
        // stale. If LOGGED_SETS_KEY was missing entirely (e.g., user closed
        // the app before logging anything), the prior-day weights/reps would
        // get restored into today's session. Now we check loggedSets date
        // first and use it to decide whether to keep ANY stored state.
        const savedLogged = await AsyncStorage.getItem(LOGGED_SETS_KEY);
        let dateValid = false;
        let parsedLogged: any = null;
        if (savedLogged) {
          parsedLogged = JSON.parse(savedLogged);
          dateValid = parsedLogged?.date === todayStr;
        }

        if (!dateValid) {
          // No valid same-day session data — wipe all related keys to avoid
          // leaking yesterday's weights/reps into today's UI.
          await AsyncStorage.multiRemove([SET_VALUES_KEY, LOGGED_SETS_KEY, ADDED_SETS_KEY, FINISHED_DATE_KEY]);
          setSetValues({});
        } else {
          // Same-day data — restore both setValues and loggedSets.
          const savedVals = await AsyncStorage.getItem(SET_VALUES_KEY);
          if (savedVals) {
            const parsed = JSON.parse(savedVals);
            if (parsed && typeof parsed === 'object') {
              setSetValues(prev => ({ ...prev, ...parsed }));
            }
          }
          setLoggedSets(new Set(parsedLogged.loggedSetIds  || []));
          setLogEntryIds(parsedLogged.entryIds            || {});
        }

        // Restore sessionFinished state (SESSION COMPLETE ✓ button persists across remounts)
        const savedFinishedDate = await AsyncStorage.getItem(FINISHED_DATE_KEY);
        if (savedFinishedDate === todayStr) {
          setSessionFinished(true);
        }
        // (Added sets are now restored inline in useFocusEffect — no race condition)
        mountRestoreDone.current = true;
        console.log('[Today] Mount restore complete');
      } catch (err) {
        mountRestoreDone.current = true; // unblock focusEffect even on error
        console.warn('[Today] Mount restore failed:', err);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist setValues to AsyncStorage on every change ─────────────────────
  useEffect(() => {
    if (Object.keys(setValues).length > 0) {
      saveSetValuesToStorage(setValues);
    }
  }, [setValues, saveSetValuesToStorage]);

  // ── Persist loggedSets + logEntryIds to AsyncStorage on every change ───────
  // This replaces the manual save inside handleLog (closure-value bug removed)
  useEffect(() => {
    if (loggedSets.size > 0 || Object.keys(logEntryIds).length > 0) {
      saveLoggedSetsToStorage(loggedSets, logEntryIds);
    }
  }, [loggedSets, logEntryIds, saveLoggedSetsToStorage]);

  // ── Auto-persist added sets whenever exercises change (Fix 2+3) ──────────────
  // Same pattern as setValues/loggedSets persistence — runs after every state commit.
  // Eliminates: async saves inside state updaters, setSetValues nested inside setExercises.
  useEffect(() => {
    if (!initialLoadDone.current) return; // skip during initial build
    const addedByName: Record<string, any[]> = {};
    exercises.forEach(ex => {
      const added = ex.sets.filter((s: any) => s.id.includes('-added-'));
      if (added.length > 0) addedByName[ex.name] = added;
    });
    if (Object.keys(addedByName).length > 0) {
      saveAddedSetsToStorage(addedByName);
    } else {
      // No added sets — clear stale data so it doesn't resurrect on reload
      AsyncStorage.removeItem(ADDED_SETS_KEY).catch(() => {});
    }
  }, [exercises, saveAddedSetsToStorage]);

  // ── Load session ────────────────────────────────────────────────────────────
  useFocusEffect(useCallback(() => {
    (async () => {
      // Fix 5: Wait for mount useEffect to finish AsyncStorage restore before running.
      // On real Expo Go devices, 3 sequential AsyncStorage reads can take 60-300ms.
      // Without this wait, useFocusEffect (which starts network calls concurrently)
      // can complete before mountRestoreDone is true, causing a state race.
      if (!mountRestoreDone.current) {
        let waited = 0;
        while (!mountRestoreDone.current && waited < 500) {
          await new Promise(r => setTimeout(r, 25));
          waited += 25;
        }
        if (waited > 0) console.log('[Today] Waited', waited, 'ms for mount restore');
      }

      const todayStr = getLocalDateString();
      if (initialLoadDone.current && lastLoadDate.current === todayStr) {
        // Safety net: re-verify added sets are present in exercises state
        // (On Expo Go, a background/foreground cycle can reset state while
        //  AsyncStorage still has the persisted data)
        try {
          const savedAdded = await AsyncStorage.getItem(ADDED_SETS_KEY);
          if (savedAdded) {
            const parsed = JSON.parse(savedAdded);
            // Support both old format (addedByEx keyed by ID) and new (addedByName keyed by name)
            const addedMap = parsed?.addedByName || parsed?.addedByEx || {};
            const useNameKey = !!parsed?.addedByName;
            if (parsed?.date === todayStr && Object.keys(addedMap).length > 0) {
              console.log('[Today] Re-sync: found added sets, keys:', Object.keys(addedMap), 'byName:', useNameKey);
              setExercises(prev => {
                let changed = false;
                const next = prev.map((ex: any) => {
                  const added = useNameKey ? addedMap[ex.name] : addedMap[ex.id];
                  if (!added || added.length === 0) return ex;
                  // Only add sets that are not already present
                  const existingIds = new Set(ex.sets.map((s: any) => s.id));
                  const missing = added.filter((s: any) => !existingIds.has(s.id));
                  if (missing.length === 0) return ex;
                  changed = true;
                  return { ...ex, sets: [...ex.sets, ...missing] };
                });
                return changed ? next : prev;
              });
            }
          }
        } catch (err) { console.warn('[Today] Re-sync added sets failed:', err); }

        try {
          const logsResp = await logApi.list({ startDate: todayStr, endDate: todayStr });
          const allLogs = Array.isArray(logsResp) ? logsResp : (logsResp?.logs || []);
          const todayLogs = allLogs;

          // Build per-exercise lookup: name -> list of entries; name -> setIndex->backendId
          const logsByEx = new Map<string, any[]>();
          const bySetIdx = new Map<string, Map<number, string>>();
          for (const lg of todayLogs) {
            const exName = (lg.exercise || '').toLowerCase();
            if (!logsByEx.has(exName)) logsByEx.set(exName, []);
            logsByEx.get(exName)!.push(lg);
            if (lg.setIndex !== undefined && lg.setIndex !== null) {
              if (!bySetIdx.has(exName)) bySetIdx.set(exName, new Map());
              bySetIdx.get(exName)!.set(lg.setIndex as number, lg.id || lg._id);
            }
          }

          // Fix 4: Build exercise list with added sets for accurate log matching.
          // exercisesRef.current may be stale if setExercises above hasn't committed yet.
          let currentExs = [...exercisesRef.current];
          try {
            const savedAddedForSync = await AsyncStorage.getItem(ADDED_SETS_KEY);
            if (savedAddedForSync) {
              const parsedSync = JSON.parse(savedAddedForSync);
              const addedMapSync = parsedSync?.addedByName || parsedSync?.addedByEx || {};
              const useNameSync = !!parsedSync?.addedByName;
              if (parsedSync?.date === todayStr && Object.keys(addedMapSync).length > 0) {
                currentExs = currentExs.map(ex => {
                  const added = useNameSync ? addedMapSync[ex.name] : addedMapSync[ex.id];
                  if (!added || added.length === 0) return ex;
                  const existingIds = new Set(ex.sets.map(s => s.id));
                  const missing = added.filter((s: any) => !existingIds.has(s.id));
                  return missing.length > 0 ? { ...ex, sets: [...ex.sets, ...missing] } : ex;
                });
              }
            }
          } catch {}
          const recovered = new Set<string>();
          const recoveredIds: Record<string, string> = {};
          const recoveredValues: Record<string, { weight: string; reps: string }> = {};
          for (const ex of currentExs) {
            const exName = ex.name.toLowerCase();
            const idxMap = bySetIdx.get(exName);
            const exEntries = logsByEx.get(exName) || [];
            if (idxMap && idxMap.size > 0) {
              // ── Precise: exact per-set matching via stored setIndex ──
              ex.sets.forEach((s, i) => {
                if (idxMap!.has(i)) {
                  recovered.add(s.id);
                  const entryId = idxMap!.get(i)!;
                  recoveredIds[s.id] = entryId;
                  // ── Restore actual logged weight/reps into input fields ──
                  const logEntry = allLogs.find((l: any) => (l.id || l._id) === entryId);
                  if (logEntry) {
                    recoveredValues[s.id] = {
                      weight: String(logEntry.weight ?? 0),
                      reps:   String(logEntry.reps   ?? 1),
                    };
                  }
                }
              });
            } else {
              // ── Fallback: count-based for legacy entries without setIndex ──
              const sorted = exEntries
                .sort((a: any, b: any) => String(a.id || '').localeCompare(String(b.id || '')));
              for (let i = 0; i < Math.min(sorted.length, ex.sets.length); i++) {
                recovered.add(ex.sets[i].id);
                if (sorted[i]?.id || sorted[i]?._id) {
                  recoveredIds[ex.sets[i].id] = sorted[i].id || sorted[i]._id;
                }
                if (sorted[i]) {
                  recoveredValues[ex.sets[i].id] = {
                    weight: String(sorted[i].weight ?? 0),
                    reps:   String(sorted[i].reps   ?? 1),
                  };
                }
              }
            }
          }
          // Fix 2C: MERGE with existing state — don't clobber sets just logged locally
          setLoggedSets(prev => {
            const merged = new Set(prev);
            recovered.forEach(id => merged.add(id));
            return merged;
          });
          setLogEntryIds(prev => ({ ...prev, ...recoveredIds }));
          // ── Restore actual logged values so inputs show what was logged ──
          if (Object.keys(recoveredValues).length > 0) {
            setSetValues(prev => ({ ...prev, ...recoveredValues }));
          }
        } catch (err) { console.warn('[Today] Re-sync log fetch failed:', err); }

        // ── Tracker mode: always refresh today's logs on re-focus ────────────
        // (This block is reached on every navigation-back within the same day.
        //  The tracker log fetch below the outer `if` is only reached on the
        //  very first load. We must also refresh here so cards appear after save.
        //  IMPORTANT: read trainingModeRef.current — not the trainingMode state
        //  variable — because the useCallback is memoised on [loadKey] and
        //  trainingMode would always be null (stale closure) here otherwise.)
        if (trainingModeRef.current === 'free') {
          setTrackerLogsLoading(true);
          try {
            const tLogs = await logApi.list({ startDate: todayStr, endDate: todayStr });
            const rawLogs = Array.isArray(tLogs) ? tLogs : [];
            const newLogs = rawLogs.filter((l: any) => Number(l.week) === 0);
            setTrackerLogs(newLogs);
          } catch { setTrackerLogs([]); }
          finally { setTrackerLogsLoading(false); }
          return;
        }
        return; // skip full rebuild — program mode
      }

      // ── Step F: Clear stale AsyncStorage data when a new workout day starts ──
      if (lastLoadDate.current && lastLoadDate.current !== todayStr) {
        await AsyncStorage.multiRemove([SET_VALUES_KEY, LOGGED_SETS_KEY, ADDED_SETS_KEY, FINISHED_DATE_KEY]).catch(() => {});
        setSetValues({});
        setLoggedSets(new Set());
        setLogEntryIds({});
        setSessionFinished(false);
        userEditedSets.current.clear(); // Fix 4: reset edit tracking for new day
      }

      const prof = await getProfile();
      const w    = prof?.currentWeek || 1;
      setWeek(w);
      setInjuryFlags(prof?.injuryFlags || []);

      // B1 fix: never fall back to 'program' while profile is loading.
      // Set the ACTUAL mode from profile, then mark profileLoaded.
      const mode = (prof?.training_mode as 'program' | 'free') ?? 'program';
      setTrainingMode(mode);
      setProfileLoaded(true);

      const day  = todayName === 'Sunday' ? 'Monday' : todayName;
      const sess = getProgramSession(w, day);
      setTodaySession(sess);

      // B2 fix: tracker mode users skip all program-specific API calls.
      // The if (trainingMode === 'free') empty-state renders once loading=false.
      if (mode === 'free') {
        // Load today's tracker logs on every focus (covers save → return to Today)
        setTrackerLogsLoading(true);
        try {
          const logs = await logApi.list({ startDate: todayStr, endDate: todayStr });
          const newLogs2 = Array.isArray(logs) ? logs.filter((l: any) => Number(l.week) === 0) : [];
          setTrackerLogs(newLogs2);
        } catch {
          setTrackerLogs([]);
        } finally {
          setTrackerLogsLoading(false);
        }
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Load exercises from API — override hardcoded EXERCISES with plan-generated ones
      try {
        const session = await programApi.getTodaySession();
        setApiSession(session);
        const apiExs = buildTodayExercisesFromApi(
          session?.session?.exercises,
          session?.session?.sessionType  // pass session type so DE days get 'Dynamic Effort' badge
        );
        if (apiExs.length > 0) {
          // Fix: Read ADDED_SETS_KEY inline to avoid race with mount useEffect
          // (On real Expo Go devices, AsyncStorage reads can take 20-100ms each,
          //  causing pendingAddedSets to still be null when this merge runs)
          let exsWithAdded = apiExs;
          try {
            const todayStr2 = getLocalDateString();
            const savedAdded = await AsyncStorage.getItem(ADDED_SETS_KEY);
            if (savedAdded) {
              const parsed = JSON.parse(savedAdded);
              // Support both old (addedByEx keyed by ID) and new (addedByName keyed by name) format
              const addedMap2 = parsed?.addedByName || parsed?.addedByEx || {};
              const useNameKey2 = !!parsed?.addedByName;
              if (parsed?.date === todayStr2 && Object.keys(addedMap2).length > 0) {
                console.log('[Today] Full-rebuild: found added sets, keys:', Object.keys(addedMap2), 'byName:', useNameKey2);
                console.log('[Today] Full-rebuild: exercise names:', apiExs.map((e: any) => e.name));
                const merged = apiExs.map((ex: any) => {
                  const added = useNameKey2 ? addedMap2[ex.name] : addedMap2[ex.id];
                  if (added?.length > 0) console.log('[Today] Full-rebuild: merging', added.length, 'sets into', ex.name);
                  return added?.length > 0 ? { ...ex, sets: [...ex.sets, ...added] } : ex;
                });
                // Only use merge if we actually found added sets
                if (merged.some((ex: any, i: number) => ex.sets.length > apiExs[i].sets.length)) {
                  exsWithAdded = merged;
                }
              }
            }
          } catch (err) {
            console.warn('[Today] Failed to restore added sets:', err);
          }
          setExercises(exsWithAdded);
          // Expand only the first exercise by default
          setExpanded(new Set([exsWithAdded[0].id]));

          // Part 2B: Fetch previous workout data for all exercises
          const exNames = apiExs.map((e: any) => e.name).filter(Boolean);
          fetchPreviousData(exNames);

          // Reload logged state + entry IDs from backend
          try {
            const todayStr  = getLocalDateString();
            const logsResp  = await logApi.list({ startDate: todayStr, endDate: todayStr });
            const allLogs   = Array.isArray(logsResp) ? logsResp : (logsResp?.logs || []);
            const todayLogs = allLogs;

            // Build per-exercise lookup: setIndex-based first, count-based fallback
            const logsByEx = new Map<string, any[]>();
            const bySetIdx = new Map<string, Map<number, string>>();
            for (const lg of todayLogs) {
              const exName = (lg.exercise || '').toLowerCase();
              if (!logsByEx.has(exName)) logsByEx.set(exName, []);
              logsByEx.get(exName)!.push(lg);
              if (lg.setIndex !== undefined && lg.setIndex !== null) {
                if (!bySetIdx.has(exName)) bySetIdx.set(exName, new Map());
                bySetIdx.get(exName)!.set(lg.setIndex as number, lg.id || lg._id);
              }
            }

            const recovered = new Set<string>();
            const recoveredIds: Record<string, string> = {};
            const recoveredValues: Record<string, { weight: string; reps: string }> = {};
            for (const ex of exsWithAdded) {
              const exName = ex.name.toLowerCase();
              const idxMap = bySetIdx.get(exName);
              const exEntries = logsByEx.get(exName) || [];
              if (idxMap && idxMap.size > 0) {
                ex.sets.forEach((s: any, i: number) => {
                  if (idxMap!.has(i)) {
                    recovered.add(s.id);
                    const entryId = idxMap!.get(i)!;
                    recoveredIds[s.id] = entryId;
                    // ── Restore actual logged weight/reps into inputs ──
                    const logEntry = allLogs.find((l: any) => (l.id || l._id) === entryId);
                    if (logEntry) {
                      recoveredValues[s.id] = {
                        weight: String(logEntry.weight ?? 0),
                        reps:   String(logEntry.reps   ?? 1),
                      };
                    }
                  }
                });
              } else {
                const sorted = exEntries
                  .sort((a: any, b: any) => String(a.id || '').localeCompare(String(b.id || '')));
                for (let i = 0; i < Math.min(sorted.length, ex.sets.length); i++) {
                  recovered.add(ex.sets[i].id);
                  if (sorted[i]?.id || sorted[i]?._id) {
                    recoveredIds[ex.sets[i].id] = sorted[i].id || sorted[i]._id;
                  }
                  if (sorted[i]) {
                    recoveredValues[ex.sets[i].id] = {
                      weight: String(sorted[i].weight ?? 0),
                      reps:   String(sorted[i].reps   ?? 1),
                    };
                  }
                }
              }
            }
            // Fix 2C: MERGE with existing state — don't clobber sets just logged locally
            setLoggedSets(prev => {
              const merged = new Set(prev);
              recovered.forEach(id => merged.add(id));
              return merged;
            });
            setLogEntryIds(prev => ({ ...prev, ...recoveredIds }));
            // ── Restore actual logged values so inputs show what was logged ──
            if (Object.keys(recoveredValues).length > 0) {
              setSetValues(prev => ({ ...prev, ...recoveredValues }));
            }
          } catch (err) { console.warn('[Today] Full-rebuild log fetch failed:', err); }
        }
      } catch (err) { console.warn('[Today] API session fetch failed:', err); }

      // ── Check today's readiness ──────────────────────────────────────────
      try {
        const rResult = await readinessApi.getToday();
        if (!rResult.hasCheckedIn) {
          // Slight delay so screen renders first
          setTimeout(() => setShowReadiness(true), 600);
        } else if (rResult.readiness) {
          setReadinessScore(rResult.readiness.totalScore);
          const lm = rResult.readiness.loadMultiplier ?? 1.0;
          const ap = rResult.readiness.adjustmentPercent ?? 0;
          setLoadMultiplier(lm);
          setAdjustmentPercent(ap);
          if (rResult.readiness.adjustmentApplied) {
            setReadinessAdjustment(rResult.readiness.adjustmentNote);
          }
        }
      } catch { /* Readiness check not critical */ }

      initialLoadDone.current = true;
      lastLoadDate.current = todayStr;
      setLoading(false);
      setRefreshing(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey])); 
  // ── Initialize setValues when exercises load/change ─────────────────────────
  useEffect(() => {
    setSetValues(prev => {
      const init: Record<string, { weight: string; reps: string }> = {};
      exercises.forEach(ex => {
        ex.sets.forEach(s => {
          if (!prev[s.id]) {
            // Phase 1: inputs start empty — no pre-fill from target loads or prescription
            init[s.id] = { weight: '', reps: '' };
          }
        });
      });
      return { ...init, ...prev };
    });
  }, [exercises]);

  // ── Apply load multiplier ONLY when loadMultiplier value actually changes ────
  // CRITICAL: Do NOT include `exercises` in deps — that causes it to fire on
  // every add-set, remove-set, and tab-switch, overwriting user-entered values.
  // Use exercisesRef to read current exercises without creating a dependency.
  useEffect(() => {
    if (loadMultiplier >= 1.0 || autoAdjustOverride) return;
    const currentExs = exercisesRef.current;
    if (currentExs.length === 0) return;
    setSetValues(prev => {
      const updated = { ...prev };
      let changed = false;
      currentExs.forEach(ex => {
        ex.sets.forEach(s => {
          // Skip sets the user has manually edited or already logged
          if (userEditedSets.current.has(s.id) || loggedSets.has(s.id)) return;
          if (s.type === 'work' && s.weight > 0) {
            const adjusted = Math.round((s.weight * loadMultiplier) / 5) * 5;
            if (adjusted > 0) {
              updated[s.id] = { ...(prev[s.id] || { reps: s.reps || '' }), weight: String(adjusted) };
              changed = true;
            }
          }
        });
      });
      return changed ? updated : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMultiplier, autoAdjustOverride]);

  // ── Restore original weights when override is activated ──────────────────────
  useEffect(() => {
    if (!autoAdjustOverride) return;
    const currentExs = exercisesRef.current;
    if (currentExs.length === 0) return;
    setSetValues(prev => {
      const restored = { ...prev };
      currentExs.forEach(ex => {
        ex.sets.forEach(s => {
          // Skip logged sets — don't overwrite values the user already committed
          if (loggedSets.has(s.id)) return;
          if (s.type === 'work' && s.weight > 0) {
            restored[s.id] = { ...(prev[s.id] || { reps: s.reps || '' }), weight: String(s.weight) };
          }
        });
      });
      // Clear user-edited tracking since we're explicitly resetting to plan weights
      userEditedSets.current.clear();
      return restored;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAdjustOverride]);

  // ── Keep exercisesRef in sync with latest exercises state ────────────────────
  useEffect(() => { exercisesRef.current = exercises; }, [exercises]);
  // ── Keep trainingModeRef in sync — needed because useFocusEffect callback
  //    is memoised on [loadKey] and would see a stale null if we read the
  //    trainingMode state variable directly inside the callback. ───────────────
  useEffect(() => { trainingModeRef.current = trainingMode; }, [trainingMode]);

  // ── Readiness submit handler ─────────────────────────────────────────────────
  const handleReadinessSubmit = async (data: { sleepQuality: number; soreness: number; moodEnergy: number }) => {
    setShowReadiness(false);
    try {
      const result = await readinessApi.submit(data);
      setReadinessScore(result.readinessScore);
      const lm = result.loadMultiplier ?? 1.0;
      const ap = result.adjustmentPercent ?? 0;
      setLoadMultiplier(lm);
      setAdjustmentPercent(ap);
      setAutoAdjustOverride(false); // reset override on new readiness check
      if (result.adjustmentApplied) {
        setReadinessAdjustment(result.adjustmentNote);
      }
    } catch (e) { console.warn('Readiness submit failed:', e); }
  };

  // ── Pain report submit handler ───────────────────────────────────────────────
  const handlePainSubmit = async (data: { bodyRegion: string; painType: string; intensity: number; timing: string }) => {
    setShowPainModal(false);
    try {
      const result = await painReportApi.create({
        exerciseName: painExerciseName,
        bodyRegion: data.bodyRegion,
        painType: data.painType,
        intensity: data.intensity,
        timing: data.timing,
        sessionType,
      });
      if (result.flagged && result.alertMessage) {
        setPainAlert(result.alertMessage);
      }
    } catch (e) { console.warn('Pain report failed:', e); }
  };

  const openPainModal = (exerciseName: string) => {
    setPainExerciseName(exerciseName);
    setShowPainModal(true);
  };

  // ── Rest timer effect (COUNT-DOWN) ──────────────────────────────────────────
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTimerSeconds(s => Math.max(0, s - 1)), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  // ── Auto-stop and haptic when countdown reaches 0 ───────────────────────────
  useEffect(() => {
    if (timerSeconds === 0 && timerRunning) {
      setTimerRunning(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [timerSeconds]);

  // ── Computed values ──────────────────────────────────────────────────────────
  const totalSets   = exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  const loggedCount = loggedSets.size;
  const progressPct = totalSets > 0 ? (loggedCount / totalSets) * 100 : 0;
  // Allow finish if user has logged at least 1 set (not percentage-based)
  // This ensures added sets don't push the threshold out of reach
  const canFinish   = progressPct >= 50;

  // Session header values
  const block        = getBlock(week);
  const blockLabel   = BLOCK_LABELS[block] || `BLOCK ${block}`;
  const dayNum       = DAY_NUM[todayName] || 1;
  const sessionType  = apiSession?.session?.sessionType || todaySession?.sessionType || 'Heavy Upper';
  const sessionObj   = SESSION_OBJECTIVES[sessionType] || todaySession?.intentRPETarget || '';
  const coachNote    = todaySession?.coachingNotes
    || "Drive through today's session with full intent. Build deliberately to your peak and leave no doubt in those supplemental sets.";

  // ── Handlers ─────────────────────────────────────────────────────────────────
  // Audit Bug #8 fix: exerciseName and set were typed as optional, but the
  // optimistic UI update on line below this happens BEFORE the if-guard that
  // checks for exerciseName. If a future caller is added without those args,
  // the set would appear logged on screen but never persist to the server.
  // Tightening the types so TypeScript catches that mistake at compile time.
  const handleLog = async (setId: string, exerciseName: string, set: ExSet) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoggedSets(prev => new Set([...prev, setId]));

    // If user logs more sets after finishing, allow them to re-finish
    if (sessionFinished) {
      setSessionFinished(false);
      AsyncStorage.removeItem(FINISHED_DATE_KEY).catch(() => {});
    }

    // Determine rest duration: user selection > category default
    const exForSet = exercises.find(e => e.sets.some(s => s.id === setId));
    const restDuration = exForSet
      ? (exerciseRestDurations[exForSet.id] ?? REST_CONFIG[exForSet.category].default)
      : 120;
    const logName = exForSet?.name ?? exerciseName ?? '';

    // Start count-DOWN timer from rest duration
    setTimerSeconds(restDuration);
    setTimerTarget(restDuration);
    setTimerExerciseName(logName);
    setTimerRunning(true);

    // ── Auto-advance: collapse current exercise + expand next when all sets done ──
    const currentEx = exForSet;
    if (currentEx) {
      const updatedLoggedSets = new Set([...loggedSets, setId]);
      const allDone = currentEx.sets.every(s => updatedLoggedSets.has(s.id));
      if (allDone) {
        const currentIdx = exercises.findIndex(e => e.id === currentEx.id);
        const nextEx = exercises.slice(currentIdx + 1).find(ex =>
          ex.sets.some(s => !updatedLoggedSets.has(s.id))
        );
        if (nextEx) {
          const nextRestDur = exerciseRestDurations[nextEx.id] ?? REST_CONFIG[nextEx.category].default;
          // Short delay so user can see the "logged" check before card collapses
          setTimeout(() => {
            setExpanded(prev => {
              const next = new Set(prev);
              next.delete(currentEx.id);
              next.add(nextEx.id);
              return next;
            });
            setTimerSeconds(nextRestDur);
            setTimerTarget(nextRestDur);
            setTimerExerciseName(nextEx.name);
            setTimerRunning(true);
          }, 600);
        }
      }
    }

    // Use edited input values if available, fall back to set defaults
    const currentVals = setValues[setId];
    const weight = currentVals ? (parseFloat(currentVals.weight) || 0) : (set?.weight || 0);
    const reps   = currentVals ? currentVals.reps : (set?.reps || '');

    if (exerciseName) {
      let postSucceeded = false;
      let logName = exerciseName;
      try {
        const todayStr  = getLocalDateString();
        const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        const exForSet  = exercises.find(e => e.sets.some(s => s.id === setId));
        const setIdx    = exForSet ? exForSet.sets.findIndex(s => s.id === setId) : -1;
        logName = exForSet?.name ?? exerciseName;
        const result = await logApi.create({
          date: todayStr,
          week: week || 1,
          day: dayOfWeek,
          sessionType: sessionType || 'Training',
          exercise: logName,
          sets: 1,
          weight,
          reps: parseInt(reps) || 1,
          rpe: 7,
          pain: 0,
          completed: 'yes',
          setIndex: setIdx >= 0 ? setIdx : undefined,
        });
        if (result?._id || result?.id) {
          const entryId = result._id || result.id;
          setLogEntryIds(prev => ({ ...prev, [setId]: entryId }));
          // Persistence is handled by the dedicated loggedSets useEffect above
        }
        postSucceeded = true;
      } catch (err: any) {
        console.warn('[Today] Backend log failed:', err);
        // Rollback the optimistic local state so the UI reflects reality
        setLoggedSets(prev => { const next = new Set(prev); next.delete(setId); return next; });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          'Log Failed',
          `Could not save your set. Check your connection and try again.\n\n${err?.message || ''}`,
          [{ text: 'OK' }]
        );
      }

      // ── PR detection (runs only if POST succeeded; errors here are non-fatal) ──
      if (postSucceeded) {
        try {
          const prData = await checkForPR(logName, weight, parseInt(reps) || 1);
          if (prData) {
            setPrCelebration(prData);
            setPrExercises(prev => new Set([...prev, logName]));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        } catch (prErr) {
          console.warn('[Today] PR detection failed (non-fatal):', prErr);
        }
      }
    }
  };

  const handleSetValueChange = (setId: string, field: 'weight' | 'reps', value: string) => {
    userEditedSets.current.add(setId); // Fix: track user-edited sets to protect from auto-adjust
    setSetValues(prev => ({
      ...prev,
      [setId]: { ...(prev[setId] || { weight: '', reps: '' }), [field]: value },
    }));
  };

  const handleEffortChange = (exerciseId: string, v: number) => {
    setEfforts(prev => ({ ...prev, [exerciseId]: v }));
  };

  const handleAddSet = (exerciseId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // If user adds sets after finishing, re-enable the FINISH button
    if (sessionFinished) {
      setSessionFinished(false);
      AsyncStorage.removeItem(FINISHED_DATE_KEY).catch(() => {});
    }

    const ex = exercises.find(e => e.id === exerciseId);
    if (!ex) return;
    const lastSet  = ex.sets[ex.sets.length - 1];
    const newSetId = `${exerciseId}-added-${Date.now()}`;
    const newSet: ExSet = {
      id:     newSetId,
      type:   'work',
      weight: lastSet?.weight || 0,
      reps:   lastSet?.reps || '5',
      label:  'Work',
    };
    // Pure state update — no side effects inside updater.
    // Persistence is handled by the dedicated useEffect above (exercises dependency).
    setExercises(prev => prev.map(e =>
      e.id !== exerciseId ? e : { ...e, sets: [...e.sets, newSet] }
    ));
    // Initialize setValues for the new set (separate call, outside updater — Fix 3)
    setSetValues(prev => ({
      ...prev,
      [newSetId]: {
        weight: lastSet?.weight > 0 ? String(lastSet.weight) : '',
        reps:   lastSet?.reps || '',
      },
    }));
  };

  const handlePain = (setId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    // Pain per-set tracking removed — use card-level Pain button instead
  };

  const handleRemoveSet = (exId: string, setId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const wasLogged = loggedSets.has(setId);
    setLoggedSets(prev => { const next = new Set(prev); next.delete(setId); return next; });
    // Pure state update — persistence handled by the exercises useEffect (Fix 2+3)
    setExercises(prev => prev.map(e =>
      e.id !== exId ? e : { ...e, sets: e.sets.filter(s => s.id !== setId) }
    ));
    if (wasLogged && logEntryIds[setId]) {
      logApi.delete(logEntryIds[setId]).catch(() => {});
      setLogEntryIds(prev => { const n = { ...prev }; delete n[setId]; return n; });
    }
  };

  const handleEditSave = async (exId: string, setId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const ex = exercises.find(e => e.id === exId);
    if (!ex) return;
    const vals    = setValues[setId];
    const weight  = parseFloat(vals?.weight || '0') || 0;
    const reps    = parseInt(vals?.reps || '1') || 1;
    const setIdx  = ex.sets.findIndex(s => s.id === setId);
    // Audit Bug #6 fix: capture old entry id BEFORE deleting, so we can roll
    // back logEntryIds if the new entry create fails. Previously, if delete
    // succeeded but create failed (network blip, validation error), the old
    // id was forgotten and the set looked logged on screen but the server
    // had no record.
    const oldEntryId = logEntryIds[setId];
    try {
      // BUG 3 fix: delete old entry first to prevent duplicates
      if (oldEntryId) {
        await logApi.delete(oldEntryId).catch(() => {});
      }
      const todayStr  = getLocalDateString();
      const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });
      const result = await logApi.create({
        date: todayStr, week: week || 1, day: dayOfWeek,
        sessionType: sessionType || 'Training',
        exercise: ex.name, sets: 1, weight, reps, rpe: 7, pain: 0, completed: 'yes',
        setIndex: setIdx >= 0 ? setIdx : undefined,
      });
      if (result?._id || result?.id) {
        setLogEntryIds(prev => ({ ...prev, [setId]: result._id || result.id }));
      } else {
        // No id back from server — treat as failure, drop stale id from state
        setLogEntryIds(prev => { const n = { ...prev }; delete n[setId]; return n; });
      }
    } catch (e) {
      console.warn('[Today] Edit save failed:', e);
      // Roll back: drop the stale id (the old entry was deleted, the new one
      // didn't land). User will see the set as un-logged on next refresh and
      // can retry. Better than showing it as logged when it isn't.
      setLogEntryIds(prev => { const n = { ...prev }; delete n[setId]; return n; });
    }
  };

  const handleToggleExpand = (exId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Exit remove/edit mode when switching to a different card
    if (removeModeExId && removeModeExId !== exId) setRemoveModeExId(null);
    if (editModeExId && editModeExId !== exId) setEditModeExId(null);
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(exId)) next.delete(exId); else next.add(exId);
      return next;
    });
  };

  const openAdjust = (id: string, name: string) => {
    setAdjustKey(id); setAdjustName(name); setModal(true);
  };

  // ── Kebab menu handlers (Phase 1C) ──────────────────────────────────────────
  const planId    = apiSession?.planId ?? '';
  const sessionId = (apiSession?.session as any)?.sessionId ?? '';
  const isDynamicSession = ((apiSession?.session?.sessionType as string) || '')
    .toLowerCase().includes('speed');

  const handleKebabCategory = async (backendCategory: string) => {
    if (!kebabMenuExId || !planId || !sessionId) return;
    setKebabSaving(true);
    try {
      await exerciseApi.updateCategory(planId, sessionId, kebabMenuExId, backendCategory);
      // Map backend category → frontend display category
      const frontendCat =
        backendCategory === 'warmup'       ? 'warmup' :
        backendCategory === 'cooldown'     ? 'cooldown' :
        backendCategory === 'main'         ? (isDynamicSession ? 'speed' : 'primary') :
        backendCategory === 'supplemental' ? 'supplemental' :
        backendCategory === 'prehab'       ? 'prehab' : 'accessory';
      setExercises(prev => prev.map(ex =>
        ex.id === kebabMenuExId ? { ...ex, category: frontendCat as any } : ex
      ));
    } catch (e) { console.warn('[Kebab] Category update failed:', e); }
    setKebabSaving(false);
    setKebabMenuExId(null);
  };

  const handleKebabOrder = async (direction: 'up' | 'down') => {
    if (!kebabMenuExId || !planId || !sessionId) return;
    setKebabSaving(true);
    try {
      await exerciseApi.reorderExercise(planId, sessionId, kebabMenuExId, direction);
      setExercises(prev => {
        const idx = prev.findIndex(e => e.id === kebabMenuExId);
        if (direction === 'up' && idx > 0) {
          const next = [...prev]; [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]]; return next;
        } else if (direction === 'down' && idx >= 0 && idx < prev.length - 1) {
          const next = [...prev]; [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]; return next;
        }
        return prev;
      });
    } catch (e) { console.warn('[Kebab] Reorder failed:', e); }
    setKebabSaving(false);
    setKebabMenuExId(null);
  };

  // ── Direct inline reorder (↑↓ arrows on card header) ────────────────────────
  const handleDirectOrder = useCallback(async (exerciseId: string, direction: 'up' | 'down') => {
    if (!planId || !sessionId) return;
    try {
      await exerciseApi.reorderExercise(planId, sessionId, exerciseId, direction);
      setExercises(prev => {
        const idx = prev.findIndex(e => e.id === exerciseId);
        if (direction === 'up' && idx > 0) {
          const next = [...prev]; [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]]; return next;
        } else if (direction === 'down' && idx >= 0 && idx < prev.length - 1) {
          const next = [...prev]; [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]; return next;
        }
        return prev;
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) { console.warn('[Reorder] Failed:', e); }
  }, [planId, sessionId]);

  // ── Phase 2: Kebab action handlers ────────────────────────────────────────────

  // SWAP — close kebab, open ExercisePicker with this exercise
  const handleKebabSwap = useCallback(() => {
    const ex = exercises.find(e => e.id === kebabMenuExId);
    if (!ex) return;
    const name = swaps[ex.id]?.replacement ?? ex.name;
    setKebabMenuExId(null);
    openAdjust(ex.id, name);
  }, [exercises, kebabMenuExId, swaps]);

  // REPORT PAIN — close kebab, open PainReportModal
  const handleKebabPain = useCallback(() => {
    const ex = exercises.find(e => e.id === kebabMenuExId);
    if (!ex) return;
    const name = swaps[ex.id]?.replacement ?? ex.name;
    setKebabMenuExId(null);
    openPainModal(name);
  }, [exercises, kebabMenuExId, swaps]);

  // ADJUST WEIGHT — open adjust-weight sub-sheet with current weights as draft
  const handleKebabAdjustOpen = useCallback(() => {
    const ex = exercises.find(e => e.id === kebabMenuExId);
    if (!ex) return;
    const draft: Record<string, string> = {};
    ex.sets.forEach(s => { draft[s.id] = setValues[s.id]?.weight ?? ''; });
    setAdjustDraftWeights(draft);
    setAdjustFillAll('');
    setShowSubCatSheet(false);
    setShowAdjustSheet(true);
  }, [exercises, kebabMenuExId, setValues]);

  // ADJUST WEIGHT APPLY — write draft weights to setValues
  const handleKebabAdjustApply = useCallback(() => {
    setSetValues(prev => {
      const next = { ...prev };
      Object.entries(adjustDraftWeights).forEach(([setId, weight]) => {
        next[setId] = { ...(next[setId] ?? { weight: '', reps: '' }), weight };
      });
      return next;
    });
    setShowAdjustSheet(false);
    setKebabMenuExId(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [adjustDraftWeights]);

  // REMOVE — show in-modal confirmation sheet (works on web + native)
  const handleKebabRemove = useCallback(() => {
    setShowRemoveConfirm(true);
  }, []);

  // REMOVE CONFIRMED — delete from state + API
  const handleKebabRemoveConfirmed = useCallback(async () => {
    if (!kebabMenuExId) return;
    setShowRemoveConfirm(false);
    setKebabSaving(true);
    try {
      if (planId && sessionId && kebabMenuExId) {
        await exerciseApi.removeExercise(planId, sessionId, kebabMenuExId);
      }
      setExercises(prev => prev.filter(e => e.id !== kebabMenuExId));
      setKebabMenuExId(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (e) {
      console.warn('[Kebab] Remove failed:', e);
      // Still remove locally even if API fails
      setExercises(prev => prev.filter(e => e.id !== kebabMenuExId));
      setKebabMenuExId(null);
    }
    setKebabSaving(false);
  }, [exercises, kebabMenuExId, swaps, planId, sessionId]);

  const handleConfirmSwap = async (picked: PickedExercise) => {
    setModal(false);
    const key = adjustKey;
    const original = adjustName;
    const replacement = picked.name;
    const reason: AdjustReason = (picked.reason as AdjustReason) || 'Preference';
    setSwaps(prev => ({ ...prev, [key]: { original, replacement, reason } }));
    try {
      const day = todayName === 'Sunday' ? 'Monday' : todayName;
      await substitutionApi.log({
        date: getLocalDateString(),
        week, day, sessionType,
        originalExercise: extractExerciseName(original),
        replacementExercise: replacement,
        reason,
      });
    } catch (e) { console.warn('Substitution log failed:', e); }
  };

  const handleFinish = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // ── Step 1: Capture stats BEFORE clearing state ──────────────────────────
    const allSetValues = Object.values(setValues);
    const totalVolume = allSetValues.reduce((sum, sv) => {
      return sum + (parseFloat(sv.weight) || 0) * (parseInt(sv.reps) || 0);
    }, 0);
    const avgRPE = Object.values(efforts).length > 0
      ? Object.values(efforts).reduce((a, b) => a + b, 0) / Object.values(efforts).length
      : 0;
    const finalLoggedCount = loggedSets.size;
    const finalSessionType = sessionType;

    // ── Step 2: Keep visual state intact ─────────────────────────────────────
    // DO NOT clear loggedSets, logEntryIds, or setValues here.
    // The green checks and user-entered values should remain visible behind
    // the celebration modal — user can see their completed workout on dismiss.
    // Mark session as finished to prevent persistence useEffects from re-writing.
    userEditedSets.current.clear();

    // ── Step 3: Clear AsyncStorage for the NEXT session ──────────────────────

    // ── Step 4: Skip finishSession API call ─────────────────────────────────
    // The calendar events endpoint determines completion by checking db.log,
    // NOT session.status. Calling finishSession marks session.status = "completed"
    // in the backend's plan memory, causing GET /api/plan/session/today to SKIP
    // this session and return a DIFFERENT one — which breaks the re-sync and makes
    // it look like all data was lost (exercises don't match the log entries).
    // Log entries are already saved via individual handleLog POST calls.
    console.log('[Today] Finish: skipping finishSession API (db.log is the source of truth)');

    // ── Step 5: Fetch streak + badges for celebration ─────────────────────────
    let streakData = null;
    try { streakData = await streakApi.get(); } catch {}
    let badgeData = null;
    try { badgeData = await badgesApi.get(); } catch {}

    setSessionStats({
      sessionType: finalSessionType,
      sets: finalLoggedCount,
      volume: totalVolume,
      rpe: avgRPE,
      streak: streakData,
      badges: badgeData,
    });
    setShowSessionComplete(true);
    setSessionFinished(true); // hide FINISH SESSION button after completion
    // Persist finish state so button stays "SESSION COMPLETE ✓" even if component remounts today
    AsyncStorage.setItem(FINISHED_DATE_KEY, getLocalDateString()).catch(() => {});

    // ── Step 6: Do NOT reset load flags ─────────────────────────────────────────
    // CRITICAL: Resetting initialLoadDone = false here causes any subsequent
    // re-render or focus event to trigger a full-rebuild, which calls
    // GET /api/plan/session/today. That endpoint SKIPS completed sessions →
    // returns a DIFFERENT session → re-sync can't match log entries to the new
    // exercises → data appears lost to the user.
    //
    // Keep initialLoadDone = true so tab switches use the RE-SYNC path instead:
    // it keeps the current exercises and refreshes logged state from db.log.
    // The stale-date cleanup (Step F) handles loading a new session the next day.
    // Pull-to-refresh is the explicit way to load the next session immediately.
    console.log('[Today] Finish: keeping initialLoadDone=true to prevent wrong-session rebuild');
  };

  // ── Injury warnings ──────────────────────────────────────────────────────────
  const warnings = todaySession ? getInjuryWarnings(todaySession, injuryFlags) : [];

  // ── Tracker Mode: Image upload handler ───────────────────────────────────────
  const handleImageUpload = useCallback(async () => {
    // 1. Request media library permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library to scan workout logs.');
      return;
    }

    // 2. Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];

    setIsUploadingImage(true);
    try {
      // 3. Build FormData
      const formData = new FormData();
      formData.append('image', {
        uri: asset.uri,
        type: asset.mimeType || 'image/jpeg',
        name: 'workout.jpg',
      } as any);

      // 4. Upload to backend (multipart — do NOT set Content-Type header)
      const token   = await getAuthToken();
      const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const res = await fetch(`${baseUrl}/api/tracker/parse-session-image`, {
        method: 'POST',
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        if (res.status === 402) {
          Alert.alert('No credits', 'You\'ve used all 3 free image scans. More credits coming in a future update.');
        } else {
          const txt = await res.text();
          throw new Error(txt || 'Upload failed');
        }
        return;
      }

      const data = await res.json();

      // 5. Store parsed data and navigate to review
      setParsedSession({
        session_title: data.session_title || null,
        session_date:  data.session_date  || null,
        confidence:    data.confidence    || 'low',
        exercises:     data.exercises     || [],
        image_id:      data.image_id,
      });

      router.push({
        pathname: '/tracker-review',
        params: {
          source: 'tracker_upload',
          imageId: data.image_id || '',
          userHasActiveProgram: 'false',
        },
      } as any);

    } catch (e: any) {
      Alert.alert('Scan failed', e?.message || 'Could not parse the image. Please try again.');
    } finally {
      setIsUploadingImage(false);
    }
  }, [router]);

  // ── Loading guard (B1/B2 fix) ────────────────────────────────────────────────
  // Block render until profile is loaded: prevents mode flicker and keeps
  // the loading state while tracker-mode users skip program API calls.
  if (loading || !profileLoaded) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  // ── Tracker Mode: smart Today view (shows logged exercises or empty state) ───
  if (trainingMode === 'free') {
    const GOLD = COLORS.accent;
    const todayFormatted = (() => {
      const d = new Date();
      const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
    })();
    const todayStr = getLocalDateString();

    // Group tracker logs by exercise
    type TGroup = { name: string; sessionType: string; prescriptionType: string; sets: any[] };
    const groupMap: Record<string, TGroup> = {};
    const groups: TGroup[] = [];
    for (const log of trackerLogs) {
      const key = `${log.sessionType}___${log.exercise}`;
      if (!groupMap[key]) {
        groupMap[key] = { name: log.exercise, sessionType: log.sessionType, prescriptionType: log.prescriptionType || 'weighted', sets: [] };
        groups.push(groupMap[key]);
      }
      groupMap[key].sets.push(log);
    }

    return (
      <SafeAreaView style={s.safe}>
        {/* Header */}
        <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
          <Text style={{ color: COLORS.text.muted, fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, letterSpacing: 1.2 }}>TRACKER MODE</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2, gap: SPACING.md }}>
            <Text style={{ color: COLORS.text.primary, fontSize: FONTS.sizes.xxxl, fontWeight: FONTS.weights.heavy }}>Today</Text>
            <Text style={{ color: COLORS.text.muted, fontSize: FONTS.sizes.base }}>{todayFormatted}</Text>
          </View>
        </View>

        {/* Loading */}
        {trackerLogsLoading && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={GOLD} size="large" />
          </View>
        )}

        {/* Logged exercises list */}
        {!trackerLogsLoading && groups.length > 0 && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.sm }} showsVerticalScrollIndicator={false}>
            {groups.map((group, idx) => {
              const icon = (TRACKER_TYPE_ICONS[group.prescriptionType] || 'dumbbell') as any;
              const summary = formatTrackerSummary(group.sets, group.prescriptionType);
              return (
                <TouchableOpacity
                  key={idx}
                  style={{ backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.lg, flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}
                  onPress={() => {
                    // Open the FULL day's session in edit mode (not just this exercise)
                    const allLogIds = trackerLogs.map((l: any) => l.id).filter(Boolean);
                    router.push({
                      pathname: '/tracker-review',
                      params: { editingLogIds: JSON.stringify(allLogIds) },
                    } as any);
                  }}
                  activeOpacity={0.75}
                >
                  <View style={{ width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: GOLD + '1A', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialCommunityIcons name={icon} size={20} color={GOLD} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.text.primary, fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold }} numberOfLines={1}>{group.name}</Text>
                    <Text style={{ color: COLORS.text.muted, fontSize: FONTS.sizes.sm, marginTop: 2 }}>{summary}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text.muted} />
                </TouchableOpacity>
              );
            })}

            {/* Add another exercise */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: GOLD, marginTop: SPACING.sm }}
              onPress={() => router.push('/tracker-session')}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons name="plus" size={18} color={GOLD} />
              <Text style={{ color: GOLD, fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold }}>Add another exercise</Text>
            </TouchableOpacity>

            {/* Scan a workout photo */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: GOLD + '50', backgroundColor: GOLD + '10', marginTop: 2 }}
              onPress={handleImageUpload}
              disabled={isUploadingImage}
              activeOpacity={0.75}
            >
              {isUploadingImage
                ? <ActivityIndicator size="small" color={GOLD} />
                : <MaterialCommunityIcons name="camera-outline" size={18} color={GOLD} />}
              <Text style={{ color: GOLD, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold }}>
                {isUploadingImage ? 'Scanning image…' : 'Scan workout photo'}
              </Text>
            </TouchableOpacity>

            {/* Log different session */}
            <TouchableOpacity
              style={{ alignItems: 'center', paddingVertical: SPACING.md }}
              onPress={() => router.push('/tracker-session')}
              activeOpacity={0.75}
            >
              <Text style={{ color: COLORS.text.muted, fontSize: FONTS.sizes.sm }}>Log a different session</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* Empty state */}
        {!trackerLogsLoading && groups.length === 0 && (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, gap: 16 }}>
            <MaterialCommunityIcons name="notebook-outline" size={48} color="#2A9D8F" />
            <Text style={{ fontSize: 20, fontWeight: '700', color: COLORS.text.primary, textAlign: 'center' }}>
              Tracker Mode
            </Text>
            <Text style={{ fontSize: 15, color: COLORS.text.muted, textAlign: 'center', lineHeight: 22 }}>
              No session logged today.{'\n'}Tap below to record a workout.
            </Text>
            <TouchableOpacity
              style={{ marginTop: 8, backgroundColor: '#2A9D8F', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14 }}
              onPress={() => router.push('/tracker-session')}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Log Session</Text>
            </TouchableOpacity>
            {/* Scan workout photo */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: GOLD + '50', backgroundColor: GOLD + '12', paddingHorizontal: 20, paddingVertical: 12 }}
              onPress={handleImageUpload}
              disabled={isUploadingImage}
              activeOpacity={0.8}
            >
              {isUploadingImage
                ? <ActivityIndicator size="small" color={GOLD} />
                : <MaterialCommunityIcons name="camera-outline" size={18} color={GOLD} />}
              <Text style={{ color: GOLD, fontSize: 14, fontWeight: '600' }}>
                {isUploadingImage ? 'Scanning image…' : 'Scan workout photo'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
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
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
          />
        }
      >

        {/* ── SESSION HEADER ── */}
        <View style={s.sessionHeader}>
          <Text style={s.contextLine}>
            {blockLabel}  ·  WEEK {week}  ·  DAY {dayNum}
          </Text>
          <Text style={s.sessionTitle}>{sessionType}</Text>
          {sessionObj ? <Text style={s.sessionObj}>{sessionObj}</Text> : null}
          {/* ── Ask Coach about today's session ── */}
          <AskCoachButton
            seedPrompt={`I'm about to start my ${sessionType} session. Anything I should focus on or watch out for?`}
            triggerName="today_session_inquiry"
            label="Ask Coach"
            style={{ marginTop: 8 }}
          />
        </View>

        {/* ── Part 2F: SESSION PROGRESS BAR ── */}
        {totalSets > 0 && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, height: 4, backgroundColor: '#1E1E22', borderRadius: 2 }}>
              <View style={{ width: `${progressPct}%` as any, height: '100%', backgroundColor: COLORS.accent, borderRadius: 2 }} />
            </View>
            <Text style={{ fontSize: 11, color: COLORS.accent, fontWeight: '600' }}>
              {loggedCount}/{totalSets}
            </Text>
          </View>
        )}

        {/* ── COMPACT READINESS STRIP ── */}
        {readinessScore !== null && (
          <View style={s.readinessStrip}>
            <MaterialCommunityIcons
              name="lightning-bolt"
              size={12}
              color={readinessScore >= 4.0 ? TEAL : readinessScore >= 3.0 ? COLORS.accent : '#EF5350'}
            />
            <Text style={[s.readinessStripStatus, {
              color: readinessScore >= 4.0 ? TEAL : readinessScore >= 3.0 ? COLORS.accent : '#EF5350',
            }]}>
              {readinessScore >= 4.0 ? 'GOOD TO GO' : readinessScore >= 3.0 ? 'MODERATE' : 'LOW READINESS'}
            </Text>
            <Text style={s.readinessStripScore}>{readinessScore.toFixed(1)}/5</Text>
          </View>
        )}

        {/* ── INJURY WARNING BANNERS ── */}
        {warnings.map((w, i) => (
          <View key={i} style={s.injuryBanner}>
            <MaterialCommunityIcons name="alert" size={15} color="#FFF" />
            <Text style={s.injuryBannerText}>{w}</Text>
          </View>
        ))}

        {/* ── READINESS ADJUSTMENT BANNER ── */}
        {readinessScore !== null && loadMultiplier < 1.0 && !autoAdjustOverride && (
          <View style={[
            s.readinessBanner,
            {
              backgroundColor: readinessScore >= 3.0 ? '#F5A62312' : '#EF535012',
              borderLeftColor: readinessScore >= 3.0 ? '#F5A623' : '#EF5350',
              borderColor: readinessScore >= 3.0 ? '#F5A62340' : '#EF535040',
            }
          ]}>
            <MaterialCommunityIcons
              name={readinessScore >= 3.0 ? 'lightning-bolt' : 'alert-circle-outline'}
              size={15}
              color={readinessScore >= 3.0 ? '#F5A623' : '#EF5350'}
            />
            <Text style={[s.readinessBannerText, {
              color: readinessScore >= 3.0 ? '#F5A623' : '#EF5350',
              flex: 1,
            }]}>
              {readinessScore >= 3.0 ? 'MODERATE READINESS' : 'LOW READINESS'} — Loads auto-adjusted -{adjustmentPercent}%
            </Text>
            <TouchableOpacity
              onPress={() => setAutoAdjustOverride(true)}
              style={s.overrideBtnWrap}
              activeOpacity={0.7}
            >
              <Text style={s.overrideBtnText}>OVERRIDE</Text>
            </TouchableOpacity>
          </View>
        )}
        {readinessScore !== null && loadMultiplier < 1.0 && autoAdjustOverride && (
          <View style={[s.readinessBanner, { backgroundColor: '#4DCEA612', borderLeftColor: TEAL, borderColor: '#4DCEA640' }]}>
            <MaterialCommunityIcons name="check-circle-outline" size={15} color={TEAL} />
            <Text style={[s.readinessBannerText, { color: TEAL, flex: 1 }]}>OVERRIDE ACTIVE — Using original prescribed loads</Text>
            <TouchableOpacity onPress={() => setAutoAdjustOverride(false)} style={{ padding: 4 }}>
              <MaterialCommunityIcons name="close" size={14} color={COLORS.text.muted} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── PAIN ALERT BANNER ── */}
        {painAlert && (
          <View style={s.painAlertBanner}>
            <MaterialCommunityIcons name="alert-circle" size={15} color="#FFF" />
            <Text style={s.painAlertText}>{painAlert}</Text>
            <TouchableOpacity onPress={() => setPainAlert(null)} style={{ padding: 4 }}>
              <MaterialCommunityIcons name="close" size={14} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── SLIM ITALIC COACH NOTE ── */}
        {coachNote ? (
          <View style={s.coachNote}>
            <Text style={s.coachNoteText}>✦  {coachNote}</Text>
          </View>
        ) : null}

        {/* ── WARM UP SECTION (C4: unified exercises array, category=warmup) ── */}
        {exercises.filter(ex => ex.category === 'warmup').length > 0 && (
          <>
            <Text style={s.sectionLabel}>WARM UP</Text>
            {exercises.filter(ex => ex.category === 'warmup').map(ex => {
              const fullIdx = exercises.findIndex(e => e.id === ex.id);
              return (
              <ExerciseCard
                key={ex.id}
                exercise={ex}
                expanded={expanded.has(ex.id)}
                loggedSets={loggedSets}
                onToggle={() => handleToggleExpand(ex.id)}
                onLog={handleLog}
                onAdjust={openAdjust}
                onReportPain={openPainModal}
                onAddSet={handleAddSet}
                swap={swaps[ex.id]}
                setValues={setValues}
                onSetValueChange={handleSetValueChange}
                effort={efforts[ex.id]}
                onEffortChange={(v) => handleEffortChange(ex.id, v)}
                inRemoveMode={removeModeExId === ex.id}
                inEditMode={editModeExId === ex.id}
                onRemoveSet={(setId) => handleRemoveSet(ex.id, setId)}
                onEditSave={(setId) => handleEditSave(ex.id, setId)}
                onEnterRemoveMode={() => { setRemoveModeExId(ex.id); setEditModeExId(null); }}
                onEnterEditMode={() => { setEditModeExId(ex.id); setRemoveModeExId(null); }}
                onExitMode={() => { setRemoveModeExId(null); setEditModeExId(null); }}
                adjustActive={false}
                previousData={previousData}
                prExercises={prExercises}
                restConfig={{
                  selectedSeconds: exerciseRestDurations[ex.id] ?? REST_CONFIG['warmup'].default,
                  onSelect: (secs) => setExerciseRestDurations(prev => ({ ...prev, [ex.id]: secs })),
                  onCustom: () => { setCustomRestExerciseId(ex.id); setCustomRestVisible(true); },
                }}
                onKebab={() => setKebabMenuExId(ex.id)}
                onMoveUp={() => handleDirectOrder(ex.id, 'up')}
                onMoveDown={() => handleDirectOrder(ex.id, 'down')}
                canMoveUp={fullIdx > 0}
                canMoveDown={fullIdx < exercises.length - 1}
              />
              );
            })}
          </>
        )}

        {/* ── EXERCISES LABEL ── */}
        <Text style={s.sectionLabel}>EXERCISES</Text>

        {/* ── MAIN/SUPPLEMENTAL/ACCESSORY/PREHAB EXERCISE CARDS ── */}
        {exercises.filter(ex => ex.category !== 'warmup' && ex.category !== 'cooldown').map(ex => {
          const fullIdx = exercises.findIndex(e => e.id === ex.id);
          return (
          <ExerciseCard
            key={ex.id}
            exercise={ex}
            expanded={expanded.has(ex.id)}
            loggedSets={loggedSets}
            onToggle={() => handleToggleExpand(ex.id)}
            onLog={handleLog}
            onAdjust={openAdjust}
            onReportPain={openPainModal}
            onAddSet={handleAddSet}
            swap={swaps[ex.id]}
            setValues={setValues}
            onSetValueChange={handleSetValueChange}
            effort={efforts[ex.id]}
            onEffortChange={(v) => handleEffortChange(ex.id, v)}
            inRemoveMode={removeModeExId === ex.id}
            inEditMode={editModeExId === ex.id}
            onRemoveSet={(setId) => handleRemoveSet(ex.id, setId)}
            onEditSave={(setId) => handleEditSave(ex.id, setId)}
            onEnterRemoveMode={() => { setRemoveModeExId(ex.id); setEditModeExId(null); }}
            onEnterEditMode={() => { setEditModeExId(ex.id); setRemoveModeExId(null); }}
            onExitMode={() => { setRemoveModeExId(null); setEditModeExId(null); }}
            adjustActive={loadMultiplier < 1.0 && !autoAdjustOverride}
            previousData={previousData}
            prExercises={prExercises}
            restConfig={{
              selectedSeconds: exerciseRestDurations[ex.id],
              onSelect: (secs) => {
                setExerciseRestDurations(prev => ({ ...prev, [ex.id]: secs }));
              },
              onCustom: () => {
                setCustomRestExerciseId(ex.id);
                setCustomRestVisible(true);
              },
            }}
            onKebab={() => setKebabMenuExId(ex.id)}
            onMoveUp={() => handleDirectOrder(ex.id, 'up')}
            onMoveDown={() => handleDirectOrder(ex.id, 'down')}
            canMoveUp={fullIdx > 0}
            canMoveDown={fullIdx < exercises.length - 1}
          />
          );
        })}

        {/* ── COOLDOWN SECTION (C4: unified exercises array, category=cooldown) ── */}
        {exercises.filter(ex => ex.category === 'cooldown').length > 0 && (
          <>
            <Text style={s.sectionLabel}>COOLDOWN</Text>
            {exercises.filter(ex => ex.category === 'cooldown').map(ex => {
              const fullIdx = exercises.findIndex(e => e.id === ex.id);
              return (
              <ExerciseCard
                key={ex.id}
                exercise={ex}
                expanded={expanded.has(ex.id)}
                loggedSets={loggedSets}
                onToggle={() => handleToggleExpand(ex.id)}
                onLog={handleLog}
                onAdjust={openAdjust}
                onReportPain={openPainModal}
                onAddSet={handleAddSet}
                swap={swaps[ex.id]}
                setValues={setValues}
                onSetValueChange={handleSetValueChange}
                effort={efforts[ex.id]}
                onEffortChange={(v) => handleEffortChange(ex.id, v)}
                inRemoveMode={removeModeExId === ex.id}
                inEditMode={editModeExId === ex.id}
                onRemoveSet={(setId) => handleRemoveSet(ex.id, setId)}
                onEditSave={(setId) => handleEditSave(ex.id, setId)}
                onEnterRemoveMode={() => { setRemoveModeExId(ex.id); setEditModeExId(null); }}
                onEnterEditMode={() => { setEditModeExId(ex.id); setRemoveModeExId(null); }}
                onExitMode={() => { setRemoveModeExId(null); setEditModeExId(null); }}
                adjustActive={false}
                previousData={previousData}
                prExercises={prExercises}
                restConfig={{
                  selectedSeconds: exerciseRestDurations[ex.id] ?? REST_CONFIG['cooldown'].default,
                  onSelect: (secs) => setExerciseRestDurations(prev => ({ ...prev, [ex.id]: secs })),
                  onCustom: () => { setCustomRestExerciseId(ex.id); setCustomRestVisible(true); },
                }}
                onKebab={() => setKebabMenuExId(ex.id)}
                onMoveUp={() => handleDirectOrder(ex.id, 'up')}
                onMoveDown={() => handleDirectOrder(ex.id, 'down')}
                canMoveUp={fullIdx > 0}
                canMoveDown={fullIdx < exercises.length - 1}
              />
              );
            })}
          </>
        )}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      {/* ── STICKY REST TIMER (between scroll and bottom bar) ── */}
      <RestTimerBar
        running={timerRunning}
        seconds={timerSeconds}
        targetSeconds={timerTarget}
        exerciseName={timerExerciseName}
        onToggle={() => setTimerRunning(r => !r)}
        onReset={() => { setTimerRunning(false); setTimerSeconds(timerTarget); }}
      />

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
          style={[s.finishBtn, (!canFinish || sessionFinished) && s.finishBtnDisabled]}
          onPress={canFinish && !sessionFinished ? handleFinish : undefined}
          activeOpacity={canFinish && !sessionFinished ? 0.85 : 1}
        >
          <Text style={[s.finishBtnText, (!canFinish || sessionFinished) && s.finishBtnTextDisabled]}>
            {sessionFinished ? 'SESSION COMPLETE ✓' : 'FINISH SESSION'}
          </Text>
          <MaterialCommunityIcons
            name="flag-checkered"
            size={16}
            color={canFinish ? COLORS.primary : COLORS.text.muted}
          />
        </TouchableOpacity>
      </View>

      {/* ── ADJUST EXERCISE MODAL (consolidated to ExercisePicker) ── */}
      <ExercisePicker
        visible={modalVisible}
        onClose={() => setModal(false)}
        onSelect={handleConfirmSwap}
        originalExerciseName={adjustName ? extractExerciseName(adjustName) : undefined}
        title="Swap Exercise"
      />

      {/* ── READINESS CHECK MODAL — suppressed while celebration is visible ── */}
      <ReadinessModal
        visible={showReadiness && !showSessionComplete}
        onSubmit={handleReadinessSubmit}
        onSkip={() => setShowReadiness(false)}
      />

      {/* ── PAIN REPORT MODAL ── */}
      <PainReportModal
        visible={showPainModal}
        exerciseName={painExerciseName}
        sessionType={sessionType}
        onClose={() => setShowPainModal(false)}
        onSubmit={handlePainSubmit}
      />

      {/* ── KEBAB MENU MODAL — Phase 2: 3-level sheet (main → subcat / adjust weight) ── */}
      {(() => {
        const kebabEx  = kebabMenuExId ? exercises.find(e => e.id === kebabMenuExId) : null;
        const kebabIdx = kebabMenuExId ? exercises.findIndex(e => e.id === kebabMenuExId) : -1;
        const canMoveUp   = kebabIdx > 0;
        const canMoveDown = kebabIdx >= 0 && kebabIdx < exercises.length - 1;

        const TOP_CATS = [
          { key: 'warmup',   label: 'Warm-up',   icon: 'run' },
          { key: 'main',     label: 'Exercises', icon: 'weight-lifter' },
          { key: 'cooldown', label: 'Cooldown',  icon: 'meditation' },
        ] as const;
        const SUB_CATS = [
          { key: 'main',         label: 'Main Lift',         icon: 'weight-lifter' },
          { key: 'supplemental', label: 'Supplemental',      icon: 'dumbbell' },
          { key: 'accessory',    label: 'Accessory',         icon: 'arm-flex-outline' },
          { key: 'prehab',       label: 'Injury Prevention', icon: 'shield-check-outline' },
        ] as const;

        const getTopLevel = (cat: string) =>
          cat === 'warmup' ? 'warmup' : cat === 'cooldown' ? 'cooldown' : 'main';
        const getSubCat = (cat: string) =>
          (cat === 'primary' || cat === 'speed') ? 'main' : cat;

        const currentTop = kebabEx ? getTopLevel(kebabEx.category) : 'main';
        const currentSub = kebabEx ? getSubCat(kebabEx.category) : 'main';
        const displayName = kebabEx ? (swaps[kebabEx.id]?.replacement ?? kebabEx.name) : '';

        // Shared back arrow for sub-sheets
        const BackRow = ({ onBack, title }: { onBack: () => void; title: string }) => (
          <View style={{ paddingHorizontal: 22, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text.secondary} />
            </TouchableOpacity>
            <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text.primary, flex: 1 }}>{title}</Text>
          </View>
        );

        const sheetContent = () => {
          // ── Level 3B: REMOVE CONFIRMATION ─────────────────────────────────────────
          if (showRemoveConfirm && kebabEx) {
            const name = swaps[kebabEx.id]?.replacement ?? kebabEx.name;
            return (
              <>
                <BackRow onBack={() => setShowRemoveConfirm(false)} title="Remove Exercise?" />
                <View style={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 8 }}>
                  <MaterialCommunityIcons name="delete-alert-outline" size={36} color={RED} style={{ alignSelf: 'center', marginBottom: 12 }} />
                  <Text style={{ fontSize: 15, color: COLORS.text.primary, textAlign: 'center', marginBottom: 6, fontWeight: '600' }}>
                    {name}
                  </Text>
                  <Text style={{ fontSize: 13, color: COLORS.text.secondary, textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
                    This will remove the exercise from today's session and all future sessions of this type.
                  </Text>
                  <TouchableOpacity
                    style={{ paddingVertical: 14, backgroundColor: RED, borderRadius: 12, alignItems: 'center', marginBottom: 10 }}
                    onPress={handleKebabRemoveConfirmed}
                    disabled={kebabSaving}
                    activeOpacity={0.85}
                  >
                    {kebabSaving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Remove Exercise</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ paddingVertical: 14, backgroundColor: '#141416', borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}
                    onPress={() => setShowRemoveConfirm(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.text.muted }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            );
          }

          // ── Level 3A: ADJUST WEIGHT ──────────────────────────────────────────────
          if (showAdjustSheet && kebabEx) {
            return (
              <>
                <BackRow onBack={() => setShowAdjustSheet(false)} title="Adjust Weights" />
                <View style={{ paddingHorizontal: 22, paddingTop: 14 }}>
                  {/* Quick fill-all */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18, backgroundColor: '#141416', borderRadius: 12, padding: 12 }}>
                    <Text style={{ fontSize: 13, color: COLORS.text.secondary, flex: 1 }}>Fill all sets:</Text>
                    <TextInput
                      style={{ width: 90, height: 38, backgroundColor: COLORS.primary, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, textAlign: 'center', color: COLORS.text.primary, fontSize: 15, fontWeight: '700' }}
                      value={adjustFillAll}
                      onChangeText={(v) => {
                        setAdjustFillAll(v);
                        if (v) {
                          const updated: Record<string, string> = {};
                          kebabEx.sets.forEach(s => { updated[s.id] = v; });
                          setAdjustDraftWeights(updated);
                        }
                      }}
                      keyboardType="numeric"
                      placeholder="lbs"
                      placeholderTextColor={COLORS.text.muted}
                      returnKeyType="done"
                    />
                  </View>
                  {/* Per-set rows */}
                  {kebabEx.sets.map((s, i) => {
                    const tag = s.type === 'warmup' ? 'WU' : s.type === 'ramp' ? 'RM' : `Set ${i + 1}`;
                    const isLogged = loggedSets.has(s.id);
                    return (
                      <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i < kebabEx.sets.length - 1 ? 1 : 0, borderBottomColor: COLORS.border + '40' }}>
                        <Text style={{ fontSize: 13, color: isLogged ? TEAL : COLORS.text.muted, width: 52, fontWeight: '600' }}>{tag}{isLogged ? ' ✓' : ''}</Text>
                        <View style={{ flex: 1 }}>
                          <TextInput
                            style={[{ height: 40, backgroundColor: COLORS.primary, borderRadius: 8, borderWidth: 1, borderColor: isLogged ? TEAL + '40' : COLORS.border, textAlign: 'center', color: isLogged ? TEAL : COLORS.text.primary, fontSize: 15, fontWeight: '600' }]}
                            value={adjustDraftWeights[s.id] ?? ''}
                            onChangeText={(v) => setAdjustDraftWeights(prev => ({ ...prev, [s.id]: v }))}
                            keyboardType="numeric"
                            placeholder="lbs"
                            placeholderTextColor={COLORS.text.muted}
                            editable={!isLogged}
                            returnKeyType="done"
                          />
                        </View>
                      </View>
                    );
                  })}
                  {/* Apply button */}
                  <TouchableOpacity
                    style={{ marginTop: 18, paddingVertical: 14, backgroundColor: COLORS.accent, borderRadius: 12, alignItems: 'center' }}
                    onPress={handleKebabAdjustApply}
                    activeOpacity={0.85}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.primary, letterSpacing: 0.5 }}>Apply Weights</Text>
                  </TouchableOpacity>
                </View>
              </>
            );
          }

          // ── Level 2: SUB-CATEGORY (exercises) ───────────────────────────────────
          if (showSubCatSheet) {
            return (
              <>
                <BackRow onBack={() => setShowSubCatSheet(false)} title="Exercise Category" />
                <View style={{ paddingHorizontal: 22, paddingTop: 12 }}>
                  {SUB_CATS.map((cat, idx) => {
                    const isCurr = cat.key === currentSub;
                    return (
                      <TouchableOpacity
                        key={cat.key}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: idx < SUB_CATS.length - 1 ? 1 : 0, borderBottomColor: COLORS.border + '50' }}
                        onPress={() => { handleKebabCategory(cat.key); setShowSubCatSheet(false); }}
                        disabled={kebabSaving}
                        activeOpacity={0.7}
                      >
                        <MaterialCommunityIcons name={cat.icon as any} size={18} color={isCurr ? COLORS.accent : COLORS.text.secondary} />
                        <Text style={{ fontSize: 15, color: isCurr ? COLORS.accent : COLORS.text.primary, flex: 1, fontWeight: isCurr ? '700' : '400' as any }}>{cat.label}</Text>
                        {isCurr && <MaterialCommunityIcons name="check" size={16} color={COLORS.accent} />}
                        {kebabSaving && <ActivityIndicator size="small" color={COLORS.accent} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity style={{ marginHorizontal: 22, marginTop: 16, paddingVertical: 14, alignItems: 'center', backgroundColor: '#141416', borderRadius: 12, borderWidth: 1, borderColor: COLORS.border }} onPress={() => { setShowSubCatSheet(false); setKebabMenuExId(null); }} activeOpacity={0.7}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.text.muted }}>Cancel</Text>
                </TouchableOpacity>
              </>
            );
          }

          // ── Level 1: MAIN SHEET ──────────────────────────────────────────────────
          return (
            <>
              {/* Exercise title */}
              {kebabEx && (
                <View style={{ paddingHorizontal: 22, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                  <Text style={{ fontSize: 10, color: COLORS.text.muted, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 }}>EDITING</Text>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: COLORS.text.primary }} numberOfLines={1}>{displayName}</Text>
                </View>
              )}

              {/* REORDER */}
              <View style={{ paddingHorizontal: 22, paddingTop: 18 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.text.muted, letterSpacing: 1.5, marginBottom: 10 }}>REORDER</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {(['up', 'down'] as const).map(dir => {
                    const enabled = dir === 'up' ? canMoveUp : canMoveDown;
                    return (
                      <TouchableOpacity
                        key={dir}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, backgroundColor: enabled ? '#1E1E22' : '#141416', borderRadius: 12, borderWidth: 1, borderColor: enabled ? COLORS.border : COLORS.border + '40', opacity: enabled ? 1 : 0.4 }}
                        onPress={() => enabled && handleKebabOrder(dir)}
                        disabled={!enabled || kebabSaving}
                        activeOpacity={0.7}
                      >
                        <MaterialCommunityIcons name={dir === 'up' ? 'arrow-up' : 'arrow-down'} size={16} color={enabled ? COLORS.text.primary : COLORS.text.muted} />
                        <Text style={{ fontSize: 13, fontWeight: '600', color: enabled ? COLORS.text.primary : COLORS.text.muted }}>{dir === 'up' ? 'Move Up' : 'Move Down'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* CHANGE CATEGORY */}
              <View style={{ paddingHorizontal: 22, paddingTop: 18 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.text.muted, letterSpacing: 1.5, marginBottom: 6 }}>CHANGE CATEGORY</Text>
                {TOP_CATS.map((cat, catIdx) => {
                  const isCurr = cat.key === currentTop;
                  const showChevron = cat.key === 'main';
                  const subLabel = isCurr && cat.key === 'main' ? ` — ${SUB_CATS.find(s => s.key === currentSub)?.label ?? ''}` : '';
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: catIdx < TOP_CATS.length - 1 ? 1 : 0, borderBottomColor: COLORS.border + '50' }}
                      onPress={() => cat.key === 'main' ? setShowSubCatSheet(true) : handleKebabCategory(cat.key)}
                      disabled={kebabSaving}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name={cat.icon as any} size={18} color={isCurr ? COLORS.accent : COLORS.text.secondary} />
                      <Text style={{ fontSize: 15, color: isCurr ? COLORS.accent : COLORS.text.primary, flex: 1, fontWeight: isCurr ? '700' : '400' as any }}>{cat.label}{subLabel}</Text>
                      {isCurr && !showChevron && <MaterialCommunityIcons name="check" size={16} color={COLORS.accent} />}
                      {showChevron && <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text.muted} />}
                      {kebabSaving && <ActivityIndicator size="small" color={COLORS.accent} />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* ACTIONS — Phase 2 */}
              <View style={{ paddingHorizontal: 22, paddingTop: 18 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.text.muted, letterSpacing: 1.5, marginBottom: 6 }}>ACTIONS</Text>

                {/* Swap */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border + '50' }}
                  onPress={handleKebabSwap}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="swap-horizontal" size={18} color={COLORS.text.secondary} />
                  <Text style={{ fontSize: 15, color: COLORS.text.primary, flex: 1 }}>Swap Exercise</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text.muted} />
                </TouchableOpacity>

                {/* Adjust Weight */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border + '50' }}
                  onPress={handleKebabAdjustOpen}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="tune-vertical" size={18} color={COLORS.text.secondary} />
                  <Text style={{ fontSize: 15, color: COLORS.text.primary, flex: 1 }}>Adjust Weights</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text.muted} />
                </TouchableOpacity>

                {/* Report Pain */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border + '50' }}
                  onPress={handleKebabPain}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="alert-circle-outline" size={18} color={RED} />
                  <Text style={{ fontSize: 15, color: RED, flex: 1 }}>Report Pain</Text>
                </TouchableOpacity>

                {/* Remove Exercise */}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 }}
                  onPress={handleKebabRemove}
                  disabled={kebabSaving}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="delete-outline" size={18} color={RED} />
                  <Text style={{ fontSize: 15, color: RED, flex: 1 }}>Remove Exercise</Text>
                  {kebabSaving && <ActivityIndicator size="small" color={RED} />}
                </TouchableOpacity>
              </View>

              {/* Cancel */}
              <TouchableOpacity
                style={{ marginHorizontal: 22, marginTop: 16, paddingVertical: 14, alignItems: 'center', backgroundColor: '#141416', borderRadius: 12, borderWidth: 1, borderColor: COLORS.border }}
                onPress={() => setKebabMenuExId(null)}
                disabled={kebabSaving}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.text.muted }}>Cancel</Text>
              </TouchableOpacity>
            </>
          );
        };

        return (
          <Modal
            visible={kebabMenuExId !== null}
            transparent
            animationType="slide"
            onRequestClose={() => setKebabMenuExId(null)}
          >
            <Pressable
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' }}
              onPress={() => {
                if (!kebabSaving) {
                  if (showAdjustSheet) { setShowAdjustSheet(false); return; }
                  if (showSubCatSheet) { setShowSubCatSheet(false); return; }
                  if (showRemoveConfirm) { setShowRemoveConfirm(false); return; }
                  setKebabMenuExId(null);
                }
              }}
            >
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => {}} style={{ backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 34, maxHeight: '92%' }}>
                {/* Handle */}
                <View style={{ alignItems: 'center', paddingTop: 14, paddingBottom: 10 }}>
                  <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border }} />
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {sheetContent()}
                  <View style={{ height: 8 }} />
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        );
      })()}

      {/* ── CUSTOM REST MODAL ── */}
      <CustomRestModal
        visible={customRestVisible}
        currentSeconds={(() => {
          const ex = exercises.find(e => e.id === customRestExerciseId);
          if (!ex) return 120;
          return exerciseRestDurations[customRestExerciseId] ?? REST_CONFIG[ex.category].default;
        })()}
        onConfirm={(secs) => {
          setExerciseRestDurations(prev => ({ ...prev, [customRestExerciseId]: secs }));
          setCustomRestVisible(false);
        }}
        onClose={() => setCustomRestVisible(false)}
      />

      {/* ── Part 3B: PR CELEBRATION OVERLAY ── */}
      {prCelebration && prCelebration.weight > 0 && prCelebration.reps > 0 && (
        <Modal transparent visible animationType="fade" onRequestClose={() => setPrCelebration(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            {/* Gold particle confetti */}
            {prParticles.map((p, i) => (
              <Animated.View
                key={i}
                style={{
                  position: 'absolute',
                  left: p.x,
                  top: 0,
                  width: p.size,
                  height: p.size,
                  borderRadius: p.size / 2,
                  backgroundColor: i % 3 === 0 ? '#C9A84C' : i % 3 === 1 ? '#E8C868' : '#FFD700',
                  opacity: p.animOpacity,
                  transform: [{ translateY: p.animY }],
                }}
              />
            ))}
            <Text style={{ fontSize: 12, color: COLORS.accent, letterSpacing: 3, marginBottom: 8, fontWeight: '700' }}>NEW PERSONAL RECORD</Text>
            <Text style={{ fontSize: 32, fontWeight: '800', color: '#E8E8E6', marginBottom: 4, textAlign: 'center' }}>{prCelebration.exercise}</Text>
            <Text style={{ fontSize: 52, fontWeight: '800', color: COLORS.accent, lineHeight: 60 }}>{prCelebration.weight}</Text>
            <Text style={{ fontSize: 16, color: '#888', marginBottom: 20 }}>lbs × {prCelebration.reps} reps</Text>
            <View style={{ width: '100%', backgroundColor: '#111114', borderRadius: 16, padding: 20, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, color: '#E8E8E6' }}>Est. Max</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.accent }}>{prCelebration.e1rm} lbs</Text>
              </View>
              <View style={{ height: 1, backgroundColor: '#1E1E22' }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, color: '#E8E8E6' }}>Improvement</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#4DCEA6' }}>+{prCelebration.e1rm - prCelebration.previousBest} lbs</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20, width: '100%' }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
                onPress={() => sharePRCard(prCelebration)}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#0A0A0C' }}>SHARE</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, borderWidth: 1, borderColor: '#444', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
                onPress={() => setPrCelebration(null)}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#E8E8E6' }}>DISMISS</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={{ marginTop: 12 }} onPress={() => { setPrCelebration(null); (router as any).push('/leaderboard'); }}>
              <Text style={{ fontSize: 12, color: '#888', textAlign: 'center' }}>Challenge a friend — <Text style={{ color: COLORS.accent }}>invite them to your group</Text></Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}

      {/* ── Part 4B: SESSION COMPLETE OVERLAY ── */}
      {showSessionComplete && sessionStats && (
        <Modal transparent visible animationType="slide" onRequestClose={() => setShowSessionComplete(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#C9A84C20', borderWidth: 2, borderColor: '#C9A84C', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <MaterialCommunityIcons name="check" size={32} color="#C9A84C" />
            </View>
            <Text style={{ fontSize: 11, color: '#C9A84C', letterSpacing: 2, fontWeight: '700', marginBottom: 6 }}>SESSION COMPLETE</Text>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#E8E8E6', marginBottom: 20 }}>{sessionStats.sessionType}</Text>
            {/* Stats row */}
            <View style={{ flexDirection: 'row', gap: 24, marginBottom: 20 }}>
              {[
                { label: 'SETS',   value: String(sessionStats.sets) },
                { label: 'VOLUME', value: sessionStats.volume > 0 ? `${(sessionStats.volume/1000).toFixed(1)}k` : '0' },
                { label: 'RPE',    value: sessionStats.rpe > 0 ? sessionStats.rpe.toFixed(1) : '—' },
              ].map(({ label, value }) => (
                <View key={label} style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 22, fontWeight: '700', color: '#E8E8E6' }}>{value}</Text>
                  <Text style={{ fontSize: 9, color: '#555', fontWeight: '700', letterSpacing: 0.8 }}>{label}</Text>
                </View>
              ))}
            </View>
            {/* Streak info */}
            {sessionStats.streak?.currentStreak > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FF6B3515', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 12, borderWidth: 1, borderColor: '#FF6B3530' }}>
                <MaterialCommunityIcons name="fire" size={18} color="#FF6B35" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FF6B35' }}>{sessionStats.streak.currentStreak}-week streak!</Text>
                <Text style={{ fontSize: 11, color: '#888' }}>Keep it going</Text>
              </View>
            )}
            {/* Badge info (BUG 1B) */}
            {sessionStats.badges?.earned?.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#C9A84C15', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 12, borderWidth: 1, borderColor: '#C9A84C30' }}>
                <MaterialCommunityIcons name="trophy" size={18} color="#C9A84C" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#C9A84C' }}>{sessionStats.badges.totalEarned} badge{sessionStats.badges.totalEarned !== 1 ? 's' : ''} earned</Text>
              </View>
            )}
            {/* Buttons (BUG 3) */}
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
                onPress={() => shareSessionCard()}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#0A0A0C' }}>SHARE SESSION</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, borderWidth: 1, borderColor: '#444', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
                onPress={() => {
                  setShowSessionComplete(false);
                  router.push({ pathname: '/review', params: { setsLogged: String(sessionStats.sets), totalSets: String(totalSets), sessionType: sessionStats.sessionType, week: String(week) } } as any);
                }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#E8E8E6' }}>DONE</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={{ marginTop: 12 }} onPress={() => { setShowSessionComplete(false); (router as any).push('/leaderboard'); }}>
              <Text style={{ fontSize: 12, color: '#888', textAlign: 'center' }}>Train with friends? <Text style={{ color: COLORS.accent }}>Create a group</Text></Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}

      {/* ── Part 3C: Hidden PR share card ── */}
      <View style={{ height: 0, overflow: 'hidden' }}>
        <View ref={prCardRef} collapsable={false} style={{ width: 360, height: 640, backgroundColor: '#0A0A0C', padding: 40, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: COLORS.accent, letterSpacing: 3, marginBottom: 20, fontWeight: '700' }}>THE PROGRAM</Text>
          <Text style={{ fontSize: 14, color: COLORS.accent, letterSpacing: 2, marginBottom: 8, fontWeight: '700' }}>NEW PERSONAL RECORD</Text>
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#E8E8E6', marginBottom: 4 }}>{prCelebration?.exercise || '—'}</Text>
          <Text style={{ fontSize: 56, fontWeight: '800', color: COLORS.accent }}>{prCelebration?.weight || 0}</Text>
          <Text style={{ fontSize: 16, color: '#888' }}>lbs × {prCelebration?.reps || 0} reps</Text>
          <View style={{ height: 1, backgroundColor: '#1E1E22', width: '100%', marginVertical: 20 }} />
          <Text style={{ fontSize: 16, color: '#E8E8E6' }}>Est. Max: {prCelebration?.e1rm || 0} lbs</Text>
          {prCelebration && <Text style={{ fontSize: 14, color: '#4DCEA6', marginTop: 4 }}>+{prCelebration.e1rm - prCelebration.previousBest} lbs improvement</Text>}
          <Text style={{ fontSize: 11, color: '#444', marginTop: 40 }}>Coached by The Program · theprogram.app</Text>
        </View>
      </View>

      {/* ── Part 3D: Hidden Session share card (BUG 3) ── */}
      <View style={{ height: 0, overflow: 'hidden' }}>
        <View ref={sessionCardRef} collapsable={false} style={{ width: 360, height: 640, backgroundColor: '#0A0A0C', padding: 40, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: COLORS.accent, letterSpacing: 3, marginBottom: 20, fontWeight: '700' }}>THE PROGRAM</Text>
          <Text style={{ fontSize: 14, color: COLORS.accent, letterSpacing: 2, marginBottom: 8, fontWeight: '700' }}>SESSION COMPLETE</Text>
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#E8E8E6', marginBottom: 4 }}>{sessionStats?.sessionType || 'Training'}</Text>
          <View style={{ flexDirection: 'row', gap: 24, marginTop: 20 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 32, fontWeight: '800', color: '#E8E8E6' }}>{sessionStats?.sets || 0}</Text>
              <Text style={{ fontSize: 11, color: '#555' }}>SETS</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 32, fontWeight: '800', color: '#E8E8E6' }}>{sessionStats?.volume > 0 ? `${(sessionStats.volume / 1000).toFixed(1)}k` : '0'}</Text>
              <Text style={{ fontSize: 11, color: '#555' }}>VOLUME</Text>
            </View>
          </View>
          <Text style={{ fontSize: 11, color: '#444', marginTop: 40 }}>Coached by The Program · theprogram.app</Text>
        </View>
      </View>

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
  sessionHeader:{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.sm },
  contextLine:  { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.accent, letterSpacing: 2, marginBottom: SPACING.xs },
  sessionTitle: { fontSize: 26, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 32, marginBottom: SPACING.xs },
  sessionObj:   { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, lineHeight: 20 },

  // Compact readiness strip
  readinessStrip:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginHorizontal: SPACING.lg, marginTop: SPACING.sm, marginBottom: SPACING.xs },
  readinessStripStatus:{ fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, letterSpacing: 1 },
  readinessStripScore: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },

  // Injury banners
  injuryBanner:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#8B2222', borderRadius: RADIUS.md, padding: SPACING.md, marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, gap: SPACING.sm },
  injuryBannerText: { color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, flex: 1, lineHeight: 18 },

  // Readiness & pain banners
  readinessBanner:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.accent + '18', borderRadius: RADIUS.md, padding: SPACING.md, borderLeftWidth: 3, borderLeftColor: COLORS.accent, borderWidth: 1, borderColor: COLORS.accent + '30' },
  readinessBannerText:{ fontSize: FONTS.sizes.xs, color: COLORS.accent, fontWeight: FONTS.weights.semibold, lineHeight: 17 },
  overrideBtnWrap:    { backgroundColor: COLORS.primary, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 4 },
  overrideBtnText:    { fontSize: 9, fontWeight: FONTS.weights.heavy, color: COLORS.text.secondary, letterSpacing: 0.5 },
  painAlertBanner:    { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: '#EF535022', borderRadius: RADIUS.md, padding: SPACING.md, borderLeftWidth: 3, borderLeftColor: '#EF5350' },
  painAlertText:      { flex: 1, fontSize: FONTS.sizes.sm, color: '#EF5350', fontWeight: FONTS.weights.semibold, lineHeight: 18 },

  // Slim italic coach note (replaced old coachCard)
  coachNote:     { marginHorizontal: SPACING.lg, marginTop: SPACING.sm, marginBottom: SPACING.md, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderLeftWidth: 2, borderLeftColor: COLORS.accent + '70' },
  coachNoteText: { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, fontStyle: 'italic', lineHeight: 20 },

  // AI Program panel (visible when annual plan exists)
  aiPanel:        { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.accentBlue + '50', borderLeftWidth: 3, borderLeftColor: COLORS.accentBlue, overflow: 'hidden' },
  aiPanelHeader:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  aiPanelTitle:   { flex: 1, fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.accentBlue, letterSpacing: 1 },
  aiPanelBadge:   { backgroundColor: COLORS.accentBlue + '25', paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.sm },
  aiPanelBadgeText: { fontSize: 9, fontWeight: FONTS.weights.heavy, color: COLORS.accentBlue, letterSpacing: 0.8 },
  aiCoachNote:    { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontStyle: 'italic', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  aiExRow:        { padding: SPACING.md },
  aiExRowBorder:  { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  aiExTop:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  aiExName:       { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.bold, color: COLORS.text.primary },
  aiExPrescription: { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontWeight: FONTS.weights.semibold },
  aiExCategory:   { fontSize: 9, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy, letterSpacing: 1, marginBottom: SPACING.sm },
  aiSetBadges:    { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginBottom: SPACING.xs },
  aiSetBadge:     { backgroundColor: COLORS.background, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.border },
  aiSetBadgeWork: { backgroundColor: COLORS.accent + '15', borderColor: COLORS.accent + '50' },
  aiSetBadgeText: { fontSize: 10, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },
  aiSetBadgeWorkText: { color: COLORS.accent },
  aiExCues:       { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontStyle: 'italic' },

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
  warmupInjuryBadge: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#4DCEA620', justifyContent: 'center', alignItems: 'center', marginLeft: 4 },
  warmupReadinessNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, backgroundColor: '#FF980015', borderRadius: RADIUS.md, marginBottom: SPACING.sm },
  warmupReadinessNoteText: { flex: 1, fontSize: FONTS.sizes.xs, color: '#FF9800', lineHeight: 16 },

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
