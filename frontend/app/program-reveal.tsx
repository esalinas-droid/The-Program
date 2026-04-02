import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Animated, Easing, LayoutAnimation,
  Platform, UIManager,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../src/constants/theme';
import { getProfile } from '../src/utils/storage';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG       = '#0A0A0C';
const SURFACE  = '#14141A';
const BORDER   = '#2A2A30';
const GOLD     = '#C9A84C';
const GREEN    = '#4DCEA6';
const BLUE     = '#5B9CF5';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Exercise { name: string; sets: number; reps: string; notes?: string }
interface DayPlan  { label: string; type: string; typeColor: string; exercises: Exercise[] }
interface Program  { name: string; philosophy: string; frequency: number; blockLength: number; days: DayPlan[] }

// ── Build phases ──────────────────────────────────────────────────────────────
const BUILD_PHASES = [
  'Analyzing your training profile',
  'Selecting exercises for your goals',
  'Programming volume and intensity',
  'Accounting for injuries and recovery',
  'Building your weekly split',
  'Finalizing your program',
];

// ── Program templates ─────────────────────────────────────────────────────────
const STRENGTH: Program = {
  name: 'Conjugate Strength Block',
  philosophy:
    'Built on the Conjugate Method — alternating maximal effort and dynamic effort days to develop absolute strength and bar speed simultaneously. ME days drive you to a training max to recruit high-threshold motor units. DE days use sub-maximal loads with compensatory acceleration to build speed-strength and engrain technique under fatigue.',
  frequency: 4, blockLength: 4,
  days: [
    { label: 'Day 1', type: 'ME Upper', typeColor: GOLD, exercises: [
      { name: 'Max Effort Press Variation', sets: 5, reps: '1–3', notes: 'Floor press, board press, or comp bench — pick a variation' },
      { name: 'Close-Grip Bench Press',    sets: 4, reps: '6–8'  },
      { name: 'Weighted Pull-Ups',         sets: 4, reps: '5–8'  },
      { name: 'Seated Cable Row',          sets: 4, reps: '10–12'},
      { name: 'Face Pulls',                sets: 3, reps: '15–20', notes: 'External rotation emphasis — not a lat pull' },
      { name: 'Tricep Pushdowns',          sets: 3, reps: '12–15'},
    ]},
    { label: 'Day 2', type: 'ME Lower', typeColor: BLUE, exercises: [
      { name: 'Max Effort Squat Variation', sets: 5, reps: '1–3', notes: 'Safety bar, box squat, or comp squat' },
      { name: 'Romanian Deadlift',          sets: 4, reps: '6–8' },
      { name: 'Leg Press',                  sets: 3, reps: '10–12'},
      { name: 'Glute Ham Raise',            sets: 3, reps: '8–10'},
      { name: 'Ab Wheel Rollout',           sets: 3, reps: '10–15'},
    ]},
    { label: 'Day 3', type: 'DE Upper', typeColor: GOLD, exercises: [
      { name: 'Dynamic Effort Bench Press', sets: 8, reps: '3', notes: '50–60% 1RM — bar speed is everything' },
      { name: 'Overhead Press',             sets: 4, reps: '5–8' },
      { name: 'Dumbbell Row',               sets: 4, reps: '10–12'},
      { name: 'Cable Pull-Apart',           sets: 4, reps: '15–20'},
      { name: 'Hammer Curl',               sets: 3, reps: '12–15'},
      { name: 'Lateral Raise',             sets: 3, reps: '15–20'},
    ]},
    { label: 'Day 4', type: 'DE Lower', typeColor: BLUE, exercises: [
      { name: 'Dynamic Effort Deadlift', sets: 6, reps: '2', notes: '60% 1RM — reset each rep, max speed' },
      { name: 'Box Squat',               sets: 6, reps: '3', notes: 'Sit to box, reset, then drive through floor' },
      { name: 'Reverse Hyper',           sets: 4, reps: '15–20'},
      { name: 'Sled Drag',               sets: 4, reps: '30m',   notes: 'Low-load GPP — recovery tool' },
      { name: 'Plank',                   sets: 3, reps: '45–60s'},
    ]},
  ],
};

const POWERLIFTING: Program = {
  name: 'Powerlifting Peak Block',
  philosophy:
    'A 4-week competition preparation block focused on the three competition lifts. Volume tapers each week as intensity climbs toward meet-day maxes. Accessory work is kept minimal — competition specificity is the priority in a peaking block. Trust the numbers.',
  frequency: 4, blockLength: 4,
  days: [
    { label: 'Day 1', type: 'ME Upper', typeColor: GOLD, exercises: [
      { name: 'Competition Bench Press', sets: 5, reps: '1–3', notes: 'Paused reps — full competition commands' },
      { name: 'Spoto Press',             sets: 3, reps: '5',   notes: '2-inch pause — builds bottom-end strength' },
      { name: 'Lat Pulldown',            sets: 3, reps: '10'  },
      { name: 'Tricep Dips',             sets: 3, reps: '10'  },
    ]},
    { label: 'Day 2', type: 'ME Lower', typeColor: BLUE, exercises: [
      { name: 'Competition Squat',    sets: 5, reps: '1–3', notes: 'Competition depth — full commands' },
      { name: 'Competition Deadlift', sets: 4, reps: '2'   },
      { name: 'Belt Squat',           sets: 3, reps: '8',   notes: 'Quad/hip accessory without spinal load' },
      { name: 'Back Extension',       sets: 3, reps: '12'  },
    ]},
    { label: 'Day 3', type: 'DE Upper', typeColor: GOLD, exercises: [
      { name: 'Speed Bench Press',     sets: 9, reps: '3', notes: '50–55% — crisp lockout, compensatory acceleration' },
      { name: 'DB Overhead Press',     sets: 3, reps: '10'},
      { name: 'Face Pull',             sets: 4, reps: '20'},
      { name: 'Cable Row',             sets: 3, reps: '10'},
    ]},
    { label: 'Day 4', type: 'DE Lower', typeColor: BLUE, exercises: [
      { name: 'Speed Deadlift', sets: 8, reps: '1', notes: '60% — bar speed over weight, always' },
      { name: 'Pause Squat',    sets: 4, reps: '3', notes: '3-second pause at parallel' },
      { name: 'Reverse Hyper', sets: 3, reps: '20'},
      { name: 'Leg Curl',       sets: 3, reps: '12'},
    ]},
  ],
};

const HYPERTROPHY: Program = {
  name: 'Hypertrophy Accumulation Block',
  philosophy:
    'A volume-driven block targeting mechanical tension and metabolic stress — the two primary drivers of muscle growth. Built on an upper/lower split with progressive overload each week. Rep ranges sit in the 8–15 zone with moderate loads and controlled rest to maximize time under tension.',
  frequency: 4, blockLength: 4,
  days: [
    { label: 'Day 1', type: 'ME Upper', typeColor: GOLD, exercises: [
      { name: 'Incline Barbell Press', sets: 4, reps: '8–10'},
      { name: 'Cable Chest Fly',       sets: 3, reps: '12–15', notes: 'Full stretch at the bottom' },
      { name: 'Seated Cable Row',      sets: 4, reps: '10–12'},
      { name: 'Lat Pulldown',          sets: 3, reps: '12–15'},
      { name: 'Lateral Raise',         sets: 4, reps: '15–20'},
      { name: 'Skull Crusher',         sets: 3, reps: '12–15'},
    ]},
    { label: 'Day 2', type: 'ME Lower', typeColor: BLUE, exercises: [
      { name: 'Back Squat',         sets: 4, reps: '8–10' },
      { name: 'Romanian Deadlift',  sets: 4, reps: '10–12'},
      { name: 'Leg Press',          sets: 3, reps: '12–15'},
      { name: 'Leg Curl',           sets: 4, reps: '12–15'},
      { name: 'Walking Lunge',      sets: 3, reps: '12 each'},
      { name: 'Calf Raise',         sets: 4, reps: '15–20'},
    ]},
    { label: 'Day 3', type: 'DE Upper', typeColor: GOLD, exercises: [
      { name: 'Flat Dumbbell Press',     sets: 4, reps: '10–12'},
      { name: 'Pull-Ups',               sets: 4, reps: '8–12' },
      { name: 'Machine Press',          sets: 3, reps: '12–15'},
      { name: 'Chest-Supported Row',    sets: 4, reps: '10–12'},
      { name: 'Rear Delt Fly',          sets: 3, reps: '15–20'},
      { name: 'Incline Curl',           sets: 3, reps: '12–15'},
    ]},
    { label: 'Day 4', type: 'DE Lower', typeColor: BLUE, exercises: [
      { name: 'Hack Squat',            sets: 4, reps: '10–12'},
      { name: 'Stiff-Leg Deadlift',    sets: 4, reps: '10–12'},
      { name: 'Leg Extension',         sets: 3, reps: '15–20'},
      { name: 'Seated Leg Curl',       sets: 3, reps: '12–15'},
      { name: 'Bulgarian Split Squat', sets: 3, reps: '10 each'},
      { name: 'Calf Raise',            sets: 4, reps: '20'   },
    ]},
  ],
};

const STRONGMAN: Program = {
  name: 'Strongman Foundation Block',
  philosophy:
    'A competition-oriented block combining heavy compound lifting with event-specific training. Alternates strength days (squat/deadlift focus) with event and conditioning days. Grip, core, and posterior chain are prioritized throughout.',
  frequency: 4, blockLength: 4,
  days: [
    { label: 'Day 1', type: 'ME Upper', typeColor: GOLD, exercises: [
      { name: 'Log Press',          sets: 5, reps: '3–5', notes: 'Clean and press from floor — competition setup' },
      { name: 'Axle Bar Bench',     sets: 4, reps: '5–8'},
      { name: 'Dumbbell Row',       sets: 4, reps: '10' },
      { name: 'Band Pull-Apart',    sets: 3, reps: '20' },
    ]},
    { label: 'Day 2', type: 'ME Lower', typeColor: BLUE, exercises: [
      { name: 'Back Squat',       sets: 5, reps: '3–5'           },
      { name: 'Trap Bar Deadlift',sets: 4, reps: '4–6'           },
      { name: 'Yoke Walk',        sets: 4, reps: '20m', notes: 'Competition carry — focus on stability' },
      { name: 'Farmer Walk',      sets: 4, reps: '20m'           },
      { name: 'GHR',              sets: 3, reps: '10'            },
    ]},
    { label: 'Day 3', type: 'DE Upper', typeColor: GOLD, exercises: [
      { name: 'Dumbbell Viking Press', sets: 5, reps: '8–10'},
      { name: 'Keg Carry',             sets: 4, reps: '20m' },
      { name: 'Sandbag Load',          sets: 4, reps: '4 loads', notes: 'Loading medley — explosiveness off floor' },
      { name: 'Rope Pull',             sets: 3, reps: '15m' },
    ]},
    { label: 'Day 4', type: 'GPP', typeColor: GREEN, exercises: [
      { name: 'Atlas Stone Series',    sets: 3, reps: '3 loads', notes: 'Technique focus — lock position first' },
      { name: 'Tire Flip',             sets: 4, reps: '6'        },
      { name: 'Sled Push',             sets: 4, reps: '30m'      },
      { name: 'Back Extension',        sets: 3, reps: '15'       },
      { name: 'Core Circuit',          sets: 3, reps: '60s each', notes: 'Plank, GHR situp, ab wheel' },
    ]},
  ],
};

const ATHLETIC: Program = {
  name: 'Athletic Performance Block',
  philosophy:
    'A strength-speed block for multi-sport athletes. Prioritizes power development via compound strength work and explosive derivatives. Deceleration, coordination, and athletic carry-over are built into every session. Conditioning is integrated — not bolted on.',
  frequency: 4, blockLength: 4,
  days: [
    { label: 'Day 1', type: 'ME Upper', typeColor: GOLD, exercises: [
      { name: 'Push Press',       sets: 5, reps: '3–5', notes: 'Full-body power transfer — drive from hips' },
      { name: 'Bench Press',      sets: 4, reps: '5'  },
      { name: 'Weighted Pull-Ups',sets: 4, reps: '6–8'},
      { name: 'DB Row',           sets: 4, reps: '10' },
      { name: 'Band Pull-Apart',  sets: 3, reps: '20' },
    ]},
    { label: 'Day 2', type: 'ME Lower', typeColor: BLUE, exercises: [
      { name: 'Power Clean',           sets: 5, reps: '3', notes: 'Triple extension — hips, knees, ankles' },
      { name: 'Back Squat',            sets: 4, reps: '5'},
      { name: 'Romanian Deadlift',     sets: 3, reps: '8'},
      { name: 'Lateral Bound',         sets: 4, reps: '5 each'},
      { name: 'Core Anti-Rotation',    sets: 3, reps: '10 each'},
    ]},
    { label: 'Day 3', type: 'DE Upper', typeColor: GOLD, exercises: [
      { name: 'Med Ball Chest Pass', sets: 5, reps: '5', notes: 'Max-effort velocity — throw with intent' },
      { name: 'Dumbbell Press',      sets: 4, reps: '8–10'},
      { name: 'Cable Row',           sets: 4, reps: '10'},
      { name: 'Lateral Raise',       sets: 3, reps: '15'},
      { name: 'Bicep/Tricep Superset',sets: 3, reps: '12 each'},
    ]},
    { label: 'Day 4', type: 'GPP', typeColor: GREEN, exercises: [
      { name: 'Trap Bar Deadlift Jump',sets: 5, reps: '4', notes: 'Explosive — let it leave the ground' },
      { name: 'Box Squat',             sets: 4, reps: '5'},
      { name: 'Sled Sprint',           sets: 6, reps: '20m'},
      { name: 'Farmer Walk',           sets: 4, reps: '40m'},
      { name: 'GHR',                   sets: 3, reps: '10'},
    ]},
  ],
};

// ── Get program by goal ───────────────────────────────────────────────────────
function resolveProgram(goal: string, days: number): Program {
  const g = (goal || '').toLowerCase();
  const base =
    g.includes('powerlifting') ? POWERLIFTING :
    g.includes('strongman')    ? STRONGMAN    :
    g.includes('hypertrophy')  ? HYPERTROPHY  :
    g.includes('athletic') || g.includes('performance') ? ATHLETIC :
    g.includes('general')      ? ATHLETIC     :
    STRENGTH;
  const n = Math.min(Math.max(days || 4, 3), base.days.length);
  return { ...base, days: base.days.slice(0, n), frequency: n };
}

function buildCoachNote(profile: any): string {
  const goal     = profile?.goal        || 'Strength';
  const exp      = profile?.experience  || 'Intermediate';
  const days     = profile?.trainingDays || 4;
  const injuries = (profile?.injuryFlags || []).filter((i: string) => i && i !== 'None');
  let note = `Based on your ${exp.toLowerCase()} background and ${goal.toLowerCase()} goal, I've built a ${days}-day block with the right volume and intensity for where you are right now.`;
  if (injuries.length > 0) {
    const listed = injuries.slice(0, 2).join(' and ');
    note += ` I've flagged your ${listed} issue${injuries.length > 1 ? 's' : ''} — exercises that load those areas have been modified or substituted.`;
  }
  note += ' Run this for 4 weeks before we reassess. Stay consistent, trust the process.';
  return note;
}

// ── BuildPhaseRow ─────────────────────────────────────────────────────────────
function BuildPhaseRow({ label, isActive, isDone }: { label: string; isActive: boolean; isDone: boolean }) {
  const fadeIn  = useRef(new Animated.Value(0)).current;
  const slideIn = useRef(new Animated.Value(12)).current;
  const pulse   = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn,  { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(slideIn, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!isActive) { pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.25, duration: 520, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,    duration: 520, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [isActive]);

  return (
    <Animated.View style={[bp.row, { opacity: fadeIn, transform: [{ translateY: slideIn }] }]}>
      <View style={bp.iconWrap}>
        {isDone ? (
          <MaterialCommunityIcons name="check" size={14} color={GREEN} />
        ) : isActive ? (
          <Animated.View style={[bp.dotActive, { opacity: pulse }]} />
        ) : (
          <View style={bp.dotIdle} />
        )}
      </View>
      <Text style={[bp.label, isDone && bp.labelDone, isActive && bp.labelActive]}>
        {label}
      </Text>
    </Animated.View>
  );
}

const bp = StyleSheet.create({
  row:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: SPACING.md },
  iconWrap:    { width: 22, height: 22, justifyContent: 'center', alignItems: 'center' },
  dotActive:   { width: 8, height: 8, borderRadius: 4, backgroundColor: GOLD },
  dotIdle:     { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2A2A30' },
  label:       { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },
  labelActive: { color: COLORS.text.primary, fontWeight: FONTS.weights.semibold },
  labelDone:   { color: COLORS.text.muted },
});

// ── DayCard ───────────────────────────────────────────────────────────────────
function DayCard({
  day, anim, isExpanded, onToggle,
}: { day: DayPlan; anim: Animated.Value; isExpanded: boolean; onToggle: () => void }) {
  return (
    <Animated.View style={[dc.card, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0,1], outputRange: [20,0] }) }] }]}>
      <TouchableOpacity style={dc.header} onPress={onToggle} activeOpacity={0.8}>
        <View style={dc.headerLeft}>
          <Text style={dc.dayLabel}>{day.label}</Text>
          <View style={[dc.typeBadge, { backgroundColor: `${day.typeColor}18` }]}>
            <Text style={[dc.typeText, { color: day.typeColor }]}>{day.type}</Text>
          </View>
        </View>
        <View style={dc.headerRight}>
          <Text style={dc.exCount}>{day.exercises.length} exercises</Text>
          <MaterialCommunityIcons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={COLORS.text.muted}
          />
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={dc.exList}>
          {day.exercises.map((ex, i) => (
            <View key={i} style={[dc.exRow, i < day.exercises.length - 1 && dc.exRowBorder]}>
              <View style={dc.exLeft}>
                <Text style={dc.exName}>{ex.name}</Text>
                {ex.notes && <Text style={dc.exNotes}>{ex.notes}</Text>}
              </View>
              <Text style={dc.setsReps}>{ex.sets} × {ex.reps}</Text>
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

const dc = StyleSheet.create({
  card:        { backgroundColor: SURFACE, borderRadius: 18, borderWidth: 1, borderColor: BORDER, marginBottom: SPACING.sm, overflow: 'hidden' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.lg },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  dayLabel:    { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.primary },
  typeBadge:   { paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.full },
  typeText:    { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, letterSpacing: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  exCount:     { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  exList:      { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
  exRow:       { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 10, gap: SPACING.md },
  exRowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  exLeft:      { flex: 1 },
  exName:      { fontSize: FONTS.sizes.sm, color: COLORS.text.primary, fontWeight: FONTS.weights.medium, marginBottom: 2 },
  exNotes:     { fontSize: 11, color: COLORS.text.muted, fontStyle: 'italic', lineHeight: 16 },
  setsReps:    { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, color: GOLD, minWidth: 52, textAlign: 'right' },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ProgramRevealScreen() {
  const router = useRouter();

  // Profile & program
  const [profile,  setProfile]  = useState<any>(null);
  const [program,  setProgram]  = useState<Program | null>(null);
  const [coachNote,setCoachNote]= useState('');

  // Build phase state
  const [activePhase,     setActivePhase]     = useState(-1);
  const [completedPhases, setCompletedPhases] = useState<number[]>([]);

  // Reveal state
  const [showReveal, setShowReveal] = useState(false);
  const [expandedDays, setExpandedDays] = useState<number[]>([0]);

  // ── Animations ─────────────────────────────────────────────────────────────
  const spinAnim    = useRef(new Animated.Value(0)).current;
  const phase1Opacity = useRef(new Animated.Value(1)).current;
  const phase2Opacity = useRef(new Animated.Value(0)).current;
  const phase2Slide   = useRef(new Animated.Value(40)).current;
  const headerAnim    = useRef(new Animated.Value(0)).current;
  const dayAnims      = useRef(Array.from({ length: 6 }, () => new Animated.Value(0))).current;

  // Spinning ring
  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true })
    );
    spin.start();
    return () => spin.stop();
  }, []);

  const spinDeg = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // Load profile + run phases
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const p = await getProfile();
      if (cancelled) return;
      setProfile(p);
      const prog = resolveProgram(p?.goal, p?.trainingDays);
      setProgram(prog);
      setCoachNote(buildCoachNote(p));

      await sleep(600);
      for (let i = 0; i < BUILD_PHASES.length; i++) {
        if (cancelled) return;
        setActivePhase(i);
        await sleep(1400 + Math.random() * 600);
        if (cancelled) return;
        setCompletedPhases(prev => [...prev, i]);
      }
      await sleep(600);
      if (!cancelled) crossfadeToReveal(prog.days.length);
    };
    run();
    return () => { cancelled = true; };
  }, []);

  const crossfadeToReveal = (dayCount: number) => {
    setShowReveal(true);
    Animated.parallel([
      Animated.timing(phase1Opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(250),
        Animated.parallel([
          Animated.timing(phase2Opacity, { toValue: 1, duration: 550, useNativeDriver: true }),
          Animated.spring(phase2Slide,   { toValue: 0, tension: 50, friction: 12, useNativeDriver: true }),
          Animated.timing(headerAnim,    { toValue: 1, duration: 400, useNativeDriver: true }),
        ]),
      ]),
    ]).start(() => {
      Animated.stagger(90, dayAnims.slice(0, dayCount).map(a =>
        Animated.timing(a, { toValue: 1, duration: 320, useNativeDriver: true })
      )).start();
    });
  };

  // Day toggle
  const toggleDay = (idx: number) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedDays(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
  };

  // ── Phase 1 ───────────────────────────────────────────────────────────────
  const renderPhase1 = () => (
    <Animated.View style={[s.phase1Wrap, { opacity: phase1Opacity }]} pointerEvents={showReveal ? 'none' : 'auto'}>
      {/* Spinner */}
      <View style={s.spinnerWrap}>
        <View style={s.spinnerTrack} />
        <Animated.View style={[s.spinnerArc, { transform: [{ rotate: spinDeg }] }]} />
      </View>

      <Text style={s.buildTitle}>Building Your Program</Text>
      <Text style={s.buildSub}>Your AI coach is analyzing your profile{'\n'}and assembling a custom training block.</Text>

      {/* Build phases */}
      <View style={s.phaseList}>
        {BUILD_PHASES.map((phase, i) => {
          if (i > activePhase) return null;
          return (
            <BuildPhaseRow
              key={i}
              label={phase}
              isActive={i === activePhase && !completedPhases.includes(i)}
              isDone={completedPhases.includes(i)}
            />
          );
        })}
      </View>
    </Animated.View>
  );

  // ── Phase 2 ───────────────────────────────────────────────────────────────
  const renderPhase2 = () => {
    if (!program) return null;
    return (
      <Animated.View
        style={[s.phase2Wrap, { opacity: phase2Opacity, transform: [{ translateY: phase2Slide }] }]}
        pointerEvents={showReveal ? 'auto' : 'none'}
      >
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces
        >
          {/* ── Program header card ── */}
          <Animated.View style={[s.headerCard, { opacity: headerAnim }]}>
            {/* Ready badge */}
            <View style={s.readyBadge}>
              <MaterialCommunityIcons name="check-circle" size={14} color={GREEN} />
              <Text style={s.readyBadgeText}>Program Ready</Text>
            </View>

            <Text style={s.programName}>{program.name}</Text>

            {/* Meta chips */}
            <View style={s.metaRow}>
              {profile?.goal && (
                <View style={s.metaChip}>
                  <Text style={s.metaChipText}>{profile.goal}</Text>
                </View>
              )}
              <View style={s.metaChip}>
                <MaterialCommunityIcons name="calendar-week" size={11} color={GOLD} style={{ marginRight: 3 }} />
                <Text style={s.metaChipText}>{program.frequency} days/wk</Text>
              </View>
              <View style={s.metaChip}>
                <MaterialCommunityIcons name="clock-outline" size={11} color={GOLD} style={{ marginRight: 3 }} />
                <Text style={s.metaChipText}>{program.blockLength} weeks</Text>
              </View>
            </View>
          </Animated.View>

          {/* ── Training philosophy card ── */}
          <View style={s.philosophyCard}>
            <View style={s.cardHeader}>
              <View style={s.cardIconWrap}>
                <MaterialCommunityIcons name="lightbulb-outline" size={15} color={GOLD} />
              </View>
              <Text style={s.cardTitle}>Training Philosophy</Text>
            </View>
            <Text style={s.philosophyText}>{program.philosophy}</Text>
          </View>

          {/* ── Weekly split ── */}
          <View style={s.sectionWrap}>
            <Text style={s.sectionTitle}>Your Weekly Split</Text>
            <Text style={s.sectionSub}>Tap any day to see exercises</Text>
          </View>

          {program.days.map((day, i) => (
            <DayCard
              key={i}
              day={day}
              anim={dayAnims[i]}
              isExpanded={expandedDays.includes(i)}
              onToggle={() => toggleDay(i)}
            />
          ))}

          {/* ── Coach note ── */}
          <View style={s.coachCard}>
            <View style={s.coachHeader}>
              <View style={s.coachAvatar}>
                <MaterialCommunityIcons name="brain" size={15} color={GOLD} />
              </View>
              <View>
                <Text style={s.coachLabel}>Your Coach</Text>
                <Text style={s.coachSub}>Personalized note</Text>
              </View>
            </View>
            <Text style={s.coachText}>{coachNote}</Text>
          </View>

          <View style={{ height: 110 }} />
        </ScrollView>

        {/* ── Fixed bottom CTA ── */}
        <View style={s.ctaBar}>
          <TouchableOpacity
            style={s.startBtn}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.87}
          >
            <Text style={s.startBtnText}>Start Training</Text>
            <MaterialCommunityIcons name="arrow-right" size={20} color={COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={s.adjustLink}>
            <Text style={s.adjustText}>Adjust preferences</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      {/* Phase 1 — absolutely positioned so it can be faded out */}
      <View style={StyleSheet.absoluteFill} pointerEvents={showReveal ? 'none' : 'auto'}>
        {renderPhase1()}
      </View>

      {/* Phase 2 */}
      <View style={{ flex: 1 }} pointerEvents={showReveal ? 'auto' : 'none'}>
        {renderPhase2()}
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  // ── Phase 1 ──
  phase1Wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxl,
  },
  spinnerWrap:  { width: 64, height: 64, marginBottom: SPACING.xl },
  spinnerTrack: {
    position: 'absolute', top: 0, left: 0,
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 5, borderColor: '#252528',
  },
  spinnerArc: {
    position: 'absolute', top: 0, left: 0,
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 5,
    borderTopColor:    GOLD,
    borderRightColor:  GOLD,
    borderBottomColor: 'transparent',
    borderLeftColor:   'transparent',
  },
  buildTitle: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: FONTS.weights.heavy,
    color: COLORS.text.primary,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  buildSub: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: SPACING.xxl,
  },
  phaseList: { width: '100%', maxWidth: 320 },

  // ── Phase 2 ──
  phase2Wrap: { flex: 1 },
  scroll:     { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },

  // Program header card
  headerCard: {
    borderWidth: 1.5,
    borderColor: GOLD,
    borderRadius: 22,
    backgroundColor: SURFACE,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: `${GREEN}18`,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: `${GREEN}40`,
  },
  readyBadgeText: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: GREEN, letterSpacing: 0.5 },
  programName:    { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: GOLD, textAlign: 'center', marginBottom: SPACING.lg, lineHeight: 30 },
  metaRow:        { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap', justifyContent: 'center' },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${GOLD}14`,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: `${GOLD}30`,
  },
  metaChipText: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: GOLD },

  // Philosophy card
  philosophyCard: {
    backgroundColor: SURFACE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  cardIconWrap: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: `${GOLD}14`,
    borderWidth: 1, borderColor: `${GOLD}30`,
    justifyContent: 'center', alignItems: 'center',
  },
  cardTitle:       { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.primary },
  philosophyText:  { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 22 },

  // Section heading
  sectionWrap:  { marginBottom: SPACING.md, marginTop: SPACING.sm },
  sectionTitle: { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: 2 },
  sectionSub:   { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },

  // Coach note card
  coachCard: {
    backgroundColor: SURFACE,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: `${GOLD}40`,
    borderLeftWidth: 3,
    borderLeftColor: GOLD,
    padding: SPACING.lg,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  coachHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md },
  coachAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: `${GOLD}14`,
    borderWidth: 1.5, borderColor: `${GOLD}40`,
    justifyContent: 'center', alignItems: 'center',
  },
  coachLabel: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, color: GOLD, letterSpacing: 0.5 },
  coachSub:   { fontSize: 10, color: COLORS.text.muted, marginTop: 1 },
  coachText:  { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 22 },

  // CTA bar
  ctaBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GOLD,
    borderRadius: 16,
    paddingVertical: 17,
    gap: SPACING.sm,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  startBtnText: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: '#0A0A0C', letterSpacing: 0.5 },
  adjustLink:   { alignItems: 'center', paddingVertical: SPACING.sm },
  adjustText:   { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, textDecorationLine: 'underline' },
});
