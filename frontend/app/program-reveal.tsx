import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Animated, Easing, Platform, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../src/constants/theme';
import { programApi } from '../src/utils/api';
import { getProfile } from '../src/utils/storage';
import { AnnualPlan, ProgramPhase } from '../src/types';

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG      = '#0A0A0C';
const SURFACE = '#111114';
const BORDER  = '#2A2A30';
const GOLD    = '#C9A84C';
const GREEN   = '#4DCEA6';
const BLUE    = '#5B9CF5';
const RED     = '#E54D4D';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ── Build phase labels ─────────────────────────────────────────────────────────
const BUILD_PHASES = [
  'Analyzing your training profile',
  'Selecting exercises for your goals',
  'Programming volume and intensity',
  'Accounting for injuries and recovery',
  'Building your 52-week timeline',
  'Calibrating recovery and test weeks',
  'Finalizing your program',
];

// ── Phase color by phase number ───────────────────────────────────────────────
function phaseAccent(n: number): string {
  const map: Record<number, string> = {
    1: GREEN, 2: BLUE, 3: BLUE, 4: GOLD, 5: RED, 6: RED, 7: GREEN,
  };
  return map[n] ?? GOLD;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

// ── Goal-specific training split descriptions ────────────────────────────────
function getSplitDays(goal: string) {
  const g = (goal ?? '').toLowerCase();
  if (g.includes('hypertrophy') || g.includes('bodybuilding')) {
    return [
      { type: 'UPPER VOLUME', color: GOLD, icon: 'arm-flex-outline' as const, focus: 'Press + Row: 4-6 sets × 10-12 reps — controlled eccentric, feel the target muscle' },
      { type: 'LOWER VOLUME', color: BLUE, icon: 'weight-lifter' as const, focus: 'RDL/Squat variation: 4-6 sets × 10-12 reps — posterior chain + quad development' },
      { type: 'UPPER ACCESSORY', color: GOLD, icon: 'dumbbell' as const, focus: 'Lateral raises, curls, triceps: 3-4 × 15-20 — complete upper body development' },
      { type: 'ACTIVE RECOVERY', color: GREEN, icon: 'battery-charging-outline' as const, focus: 'Low-intensity movement, mobility work — blood flow and recovery, not optional' },
    ];
  }
  if (g.includes('athletic') || g.includes('performance')) {
    return [
      { type: 'FULL BODY A', color: GOLD, icon: 'arm-flex-outline' as const, focus: 'Compound push + pull + hinge — 4×8 each, total body power with loaded carries' },
      { type: 'FULL BODY B', color: BLUE, icon: 'run-fast' as const, focus: 'Power variations + carries — rate of force development and work capacity' },
      { type: 'CONDITIONING', color: GREEN, icon: 'lightning-bolt' as const, focus: 'Sled, metabolic work — builds work capacity that transfers directly to sport' },
      { type: 'RECOVERY', color: RED, icon: 'battery-charging-outline' as const, focus: 'Mobility + prehab — keeps joints healthy under demanding athletic training' },
    ];
  }
  if (g.includes('general') || g.includes('fitness')) {
    return [
      { type: 'LOWER BODY', color: BLUE, icon: 'weight-lifter' as const, focus: 'Deadlift/squat variation 4×8-10 — building the posterior chain foundation' },
      { type: 'UPPER BODY', color: GOLD, icon: 'arm-flex-outline' as const, focus: 'Press + row 4×8-10 — balanced upper body strength development' },
      { type: 'FULL BODY', color: GREEN, icon: 'dumbbell' as const, focus: 'Compound movements + carries — efficient full body training stimulus' },
      { type: 'RECOVERY', color: RED, icon: 'battery-charging-outline' as const, focus: 'Easy movement, flexibility work — active rest to come back stronger' },
    ];
  }
  // Default: Strength / Powerlifting / Strongman — Conjugate model
  return [
    { type: 'HEAVY UPPER', color: GOLD, icon: 'arm-flex-outline' as const, focus: 'Build to a top set on a pressing variation — floor press, board press, or comp bench' },
    { type: 'HEAVY LOWER', color: BLUE, icon: 'weight-lifter' as const, focus: 'Heavy squat or pull variation — top set, then supplemental volume' },
    { type: 'SPEED UPPER', color: GOLD, icon: 'flash' as const, focus: 'Speed bench 8×3 @ 50–60% + accommodating resistance — bar speed wins' },
    { type: 'SPEED LOWER', color: BLUE, icon: 'run-fast' as const, focus: 'Speed squat 10×2 + speed pull 8×1 — reset each rep, explosive intent' },
  ];
}

// ── Goal-specific program explanation content ────────────────────────────────
const GOAL_PROGRAM_CONTENT: Record<string, {
  title: string; subtitle: string; description: string;
  timeline: Array<{ period: string; note: string }>;
}> = {
  default: {
    title: 'The Method: Heavy + Speed',
    subtitle: 'Why Conjugate works for advanced athletes',
    description: 'The Program avoids accommodation by rotating exercises every session. Heavy days drive absolute strength by building to a top set. Speed days build speed-strength through compensatory acceleration at sub-maximal loads. Running both simultaneously creates a strength athlete who is both strong and explosive — the combination that separates competitive lifters from everyone else.',
    timeline: [
      { period: 'Weeks 1–4',   note: 'Tendons adapt. Top sets may feel awkward — that\'s normal neurological adaptation.' },
      { period: 'Weeks 5–12',  note: 'Consistent PRs on variation lifts. Volume tolerance builds fast.' },
      { period: 'Weeks 13–26', note: 'Real strength gains compound. Competition lifts benefit from variation strength.' },
      { period: 'Weeks 27–52', note: 'Elite territory. Small gains, big numbers. Annual planning becomes essential.' },
    ],
  },
  hypertrophy: {
    title: 'Progressive Volume Overload',
    subtitle: 'The science behind building muscle year-round',
    description: 'Your program drives muscle growth through controlled progressive tension over weeks and months. Each session targets specific muscle groups with 4-6 working sets at 60-75% intensity. The key metric is total weekly volume per muscle group — we build it systematically. Progression is reps before weight: hit the top rep range first, then increase load.',
    timeline: [
      { period: 'Weeks 1–4',   note: 'Muscle memory re-establishes. You\'ll see pump and tightness before visible size.' },
      { period: 'Weeks 5–12',  note: 'Visible muscle fullness starts. Progressive overload kicks in. Nutrition is the multiplier.' },
      { period: 'Weeks 13–26', note: 'Clear body composition changes. Strength numbers climbing steadily.' },
      { period: 'Weeks 27–52', note: 'Muscle maturity and density develop. Stage-ready physique changes possible.' },
    ],
  },
  athletic: {
    title: 'Integrated Performance Training',
    subtitle: 'Building the complete athlete from the ground up',
    description: 'Your program develops the athletic qualities needed for sport: power, strength, and work capacity simultaneously. Full body sessions maximize hormonal response and train the body as a unit. Carries and conditioning build the base that transfers to any sport. Nothing is isolated — every session trains the complete athlete.',
    timeline: [
      { period: 'Weeks 1–4',   note: 'Work capacity adaptation. May feel demanding at first — stick with it.' },
      { period: 'Weeks 5–12',  note: 'Power output increases noticeably. Sport performance improvements start.' },
      { period: 'Weeks 13–26', note: 'Athletic transfer becomes clear. Speed, power, and strength all elevated.' },
      { period: 'Weeks 27–52', note: 'Peak athletic performance. Every session builds on a massive foundation.' },
    ],
  },
  general: {
    title: 'Sustainable Strength Building',
    subtitle: 'The most effective long-term approach for fitness',
    description: 'Your program builds real, lasting strength and fitness through the most sustainable approach available. Repetition effort work at 65-75% is safe on joints and connective tissue, builds muscle and strength, and doesn\'t require a competition deadline. Every few weeks the loads will start feeling lighter — that\'s the strength responding.',
    timeline: [
      { period: 'Weeks 1–4',   note: 'Initial adaptation. Movement quality improves rapidly with each session.' },
      { period: 'Weeks 5–12',  note: 'Consistent strength gains. Energy levels improve. Body composition shifting.' },
      { period: 'Weeks 13–26', note: 'Significant lifestyle impact. Strong foundation for any future specialization.' },
      { period: 'Weeks 27–52', note: 'Long-term habits built. Strength and fitness that last a lifetime.' },
    ],
  },
};

function getProgramContent(goal: string) {
  const g = (goal ?? '').toLowerCase();
  if (g.includes('hypertrophy') || g.includes('bodybuilding')) return GOAL_PROGRAM_CONTENT.hypertrophy;
  if (g.includes('athletic') || g.includes('performance')) return GOAL_PROGRAM_CONTENT.athletic;
  if (g.includes('general') || g.includes('fitness')) return GOAL_PROGRAM_CONTENT.general;
  return GOAL_PROGRAM_CONTENT.default;
}

// ── BuildPhaseRow ─────────────────────────────────────────────────────────────
function BuildPhaseRow({ label, isActive, isDone }: {
  label: string; isActive: boolean; isDone: boolean;
}) {
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

// ── PhaseCard ─────────────────────────────────────────────────────────────────
function PhaseCard({ phase, anim, testWeeks, deloadWeeks }: {
  phase: ProgramPhase; anim: Animated.Value;
  testWeeks: number[]; deloadWeeks: number[];
}) {
  const color      = phaseAccent(phase.phaseNumber);
  const weekCount  = phase.endWeek - phase.startWeek + 1;
  const allWeeks   = Array.from({ length: weekCount }, (_, i) => phase.startWeek + i);
  const hasTest    = testWeeks.some(w => allWeeks.includes(w));
  const hasDeload  = deloadWeeks.some(w => allWeeks.includes(w));
  const testInPhase   = testWeeks.filter(w => allWeeks.includes(w));
  const deloadInPhase = deloadWeeks.filter(w => allWeeks.includes(w));

  return (
    <Animated.View style={[
      pc.card,
      { opacity: anim, transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }], borderLeftColor: color },
    ]}>
      <View style={pc.header}>
        <View style={[pc.numBadge, { backgroundColor: color + '22' }]}>
          <Text style={[pc.numText, { color }]}>{phase.phaseNumber}</Text>
        </View>
        <View style={pc.info}>
          <Text style={pc.name}>{phase.phaseName}</Text>
          <Text style={pc.weeks}>Wk {phase.startWeek}–{phase.endWeek} · {weekCount} wks</Text>
        </View>
        <View style={pc.badges}>
          {hasTest && (
            <View style={pc.testBadge}>
              <Text style={pc.testBadgeText}>TEST</Text>
            </View>
          )}
          {hasDeload && (
            <View style={pc.deloadBadge}>
              <Text style={pc.deloadBadgeText}>RECOVERY</Text>
            </View>
          )}
        </View>
      </View>

      <Text style={pc.goal} numberOfLines={2}>{phase.goal}</Text>

      {phase.expectedAdaptation ? (
        <Text style={pc.adaptation} numberOfLines={2}>{phase.expectedAdaptation}</Text>
      ) : null}

      {(testInPhase.length > 0 || deloadInPhase.length > 0) && (
        <View style={pc.weekRow}>
          {testInPhase.map(w => (
            <View key={`t${w}`} style={pc.weekChip}>
              <MaterialCommunityIcons name="flag-checkered" size={9} color={GOLD} />
              <Text style={pc.weekChipGold}> Wk {w}</Text>
            </View>
          ))}
          {deloadInPhase.map(w => (
            <View key={`d${w}`} style={pc.weekChip}>
              <MaterialCommunityIcons name="battery-charging" size={9} color={GREEN} />
              <Text style={pc.weekChipGreen}> Wk {w}</Text>
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}
const pc = StyleSheet.create({
  card:           { backgroundColor: SURFACE, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: BORDER, borderLeftWidth: 3, borderLeftColor: GOLD, padding: SPACING.md, marginBottom: SPACING.sm },
  header:         { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  numBadge:       { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  numText:        { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy },
  info:           { flex: 1 },
  name:           { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  weeks:          { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 1 },
  badges:         { flexDirection: 'row', gap: 4, flexShrink: 0 },
  testBadge:      { backgroundColor: GOLD + '22', borderRadius: RADIUS.sm, paddingHorizontal: 5, paddingVertical: 2 },
  testBadgeText:  { fontSize: 8, fontWeight: FONTS.weights.heavy, color: GOLD, letterSpacing: 0.8 },
  deloadBadge:    { backgroundColor: GREEN + '22', borderRadius: RADIUS.sm, paddingHorizontal: 5, paddingVertical: 2 },
  deloadBadgeText:{ fontSize: 8, fontWeight: FONTS.weights.heavy, color: GREEN, letterSpacing: 0.8 },
  goal:           { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 19, marginBottom: 4 },
  adaptation:     { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontStyle: 'italic', lineHeight: 17 },
  weekRow:        { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm, flexWrap: 'wrap' },
  weekChip:       { flexDirection: 'row', alignItems: 'center' },
  weekChipGold:   { fontSize: 10, color: GOLD, fontWeight: FONTS.weights.semibold },
  weekChipGreen:  { fontSize: 10, color: GREEN, fontWeight: FONTS.weights.semibold },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ProgramRevealScreen() {
  const router = useRouter();

  const [plan,             setPlan]             = useState<AnnualPlan | null>(null);
  const [activePhase,      setActivePhase]      = useState(-1);
  const [completedPhases,  setCompletedPhases]  = useState<number[]>([]);
  const [showReveal,       setShowReveal]       = useState(false);
  const [userGoal,         setUserGoal]         = useState('');

  // ── Animations ──────────────────────────────────────────────────────────────
  const spinAnim      = useRef(new Animated.Value(0)).current;
  const phase1Opacity = useRef(new Animated.Value(1)).current;
  const phase2Opacity = useRef(new Animated.Value(0)).current;
  const phase2Slide   = useRef(new Animated.Value(40)).current;
  const headerAnim    = useRef(new Animated.Value(0)).current;
  // 15-slot pool — handles any AI-generated plan up to 14 phases + milestones card
  const cardAnims     = useRef(Array.from({ length: 15 }, () => new Animated.Value(0))).current;

  // Spinning ring
  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true })
    );
    spin.start();
    return () => spin.stop();
  }, []);

  const spinDeg = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // Build phases + fetch plan + fetch goal in parallel
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}

      // Fetch goal from local storage and plan from API concurrently
      const goalPromise = getProfile().then(p => (p as any)?.goal ?? '').catch(() => '');
      const planPromise = programApi.getYearPlan().catch(() => null);

      await sleep(600);
      for (let i = 0; i < BUILD_PHASES.length; i++) {
        if (cancelled) return;
        setActivePhase(i);
        await sleep(1100 + Math.random() * 400);
        if (cancelled) return;
        setCompletedPhases(prev => [...prev, i]);
      }
      await sleep(500);

      // Await plan with retry (handles post-reset where plan may not be ready yet)
      let planData = await planPromise;
      if (!planData && !cancelled) {
        for (let retry = 0; retry < 3 && !planData && !cancelled; retry++) {
          await sleep(2000);
          planData = await programApi.getYearPlan().catch(() => null);
        }
      }

      const goalData = await goalPromise;
      if (cancelled) return;
      setPlan(planData);
      setUserGoal(goalData ?? '');
      crossfadeToReveal(planData?.phases?.length ?? 7);
    };
    run();
    return () => { cancelled = true; };
  }, []);

  const crossfadeToReveal = (phaseCount: number) => {
    setShowReveal(true);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    Animated.parallel([
      Animated.timing(phase1Opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(280),
        Animated.parallel([
          Animated.timing(phase2Opacity, { toValue: 1, duration: 550, useNativeDriver: true }),
          Animated.spring(phase2Slide,   { toValue: 0, tension: 50, friction: 12, useNativeDriver: true }),
          Animated.timing(headerAnim,    { toValue: 1, duration: 420, useNativeDriver: true }),
        ]),
      ]),
    ]).start(() => {
      // Stagger phase cards + milestones card
      Animated.stagger(65, cardAnims.slice(0, phaseCount + 1).map(a =>
        Animated.timing(a, { toValue: 1, duration: 320, useNativeDriver: true })
      )).start();
    });
  };

  // ── Phase 1 — Animated build loader ─────────────────────────────────────────
  const renderPhase1 = () => (
    <Animated.View
      style={[s.phase1Wrap, { opacity: phase1Opacity }]}
      pointerEvents={showReveal ? 'none' : 'auto'}
    >
      {/* Logo */}
      <Image
        source={require('../assets/logo-icon-tight.png')}
        resizeMode="contain"
        style={{ width: 80, height: 80, alignSelf: 'center', marginBottom: SPACING.xl }}
      />

      <Text style={s.buildTitle}>Building Your Program</Text>
      <Text style={s.buildSub}>
        Your AI coach is analyzing your profile{'\n'}and assembling a personalized 52-week training plan.
      </Text>

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

  // ── Phase 2 — Plan reveal ─────────────────────────────────────────────────
  const renderPhase2 = () => {
    const phases      = plan?.phases      ?? [];
    const milestones  = plan?.milestones  ?? [];
    const deloadWeeks = plan?.deloadWeeks ?? [];
    const testWeeks   = plan?.testingWeeks ?? [];
    const prMilestones = milestones.filter((m: any) => m.targetValue);

    return (
      <Animated.View
        style={[s.phase2Wrap, { opacity: phase2Opacity, transform: [{ translateY: phase2Slide }] }]}
        pointerEvents={showReveal ? 'auto' : 'none'}
      >
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={Platform.OS === 'ios'}
        >
          {/* ── Program header ── */}
          <Animated.View style={[s.headerCard, { opacity: headerAnim }]}>
            <View style={s.readyBadge}>
              <MaterialCommunityIcons name="check-circle" size={14} color={GREEN} />
              <Text style={s.readyBadgeText}>52-Week Plan Ready</Text>
            </View>
            <Text style={s.programName}>{plan?.planName ?? 'The Program — Strength'}</Text>
            <View style={s.metaRow}>
              <View style={s.metaChip}>
                <MaterialCommunityIcons name="calendar-range" size={10} color={GOLD} style={{ marginRight: 3 }} />
                <Text style={s.metaChipText}>{plan?.totalWeeks ?? 52} Weeks</Text>
              </View>
              <View style={s.metaChip}>
                <MaterialCommunityIcons name="layers-outline" size={10} color={GOLD} style={{ marginRight: 3 }} />
                <Text style={s.metaChipText}>{phases.length} Phases</Text>
              </View>
              <View style={s.metaChip}>
                <MaterialCommunityIcons name="calendar-week" size={10} color={GOLD} style={{ marginRight: 3 }} />
                <Text style={s.metaChipText}>{plan?.trainingDays ?? 4} Days / Wk</Text>
              </View>
              <View style={s.metaChip}>
                <MaterialCommunityIcons name="flag-checkered" size={10} color={GOLD} style={{ marginRight: 3 }} />
                <Text style={s.metaChipText}>{testWeeks.length} Test Wks</Text>
              </View>
            </View>
          </Animated.View>

          {/* ── Phase timeline ── */}
          <View style={s.sectionWrap}>
            <Text style={s.sectionTitle}>52-Week Phase Timeline</Text>
            <Text style={s.sectionSub}>
              {phases.length} phases · {testWeeks.length} testing weeks · {deloadWeeks.length} recovery week{deloadWeeks.length !== 1 ? 's' : ''}
            </Text>
          </View>

          {phases.map((phase, i) => (
            <PhaseCard
              key={phase.phaseId ?? i}
              phase={phase}
              anim={cardAnims[i]}
              testWeeks={testWeeks}
              deloadWeeks={deloadWeeks}
            />
          ))}

          {/* ── Target PRs (milestones) ── */}
          {prMilestones.length > 0 && (
            <>
              <View style={s.sectionWrap}>
                <Text style={s.sectionTitle}>Target PRs</Text>
                <Text style={s.sectionSub}>Projected from your current maxes</Text>
              </View>
              <Animated.View style={[s.milestonesCard, { opacity: cardAnims[phases.length] }]}>
                {prMilestones.map((m: any, i: number) => (
                  <View
                    key={i}
                    style={[s.milestoneRow, i < prMilestones.length - 1 && s.milestoneRowBorder]}
                  >
                    <View style={s.milestoneIcon}>
                      <MaterialCommunityIcons name="trophy-outline" size={14} color={GOLD} />
                    </View>
                    <Text style={s.milestoneName}>{m.name}</Text>
                    <Text style={s.milestoneDate}>{formatDate(m.targetDate)}</Text>
                  </View>
                ))}
              </Animated.View>
            </>
          )}

          {/* ── Key weeks row ── */}
          {(testWeeks.length > 0 || deloadWeeks.length > 0) && (
            <>
              <View style={s.sectionWrap}>
                <Text style={s.sectionTitle}>Key Weeks</Text>
                <Text style={s.sectionSub}>Testing and recovery markers in your plan</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.keyWeeksScroll}
              >
                {testWeeks.map(w => (
                  <View key={`t${w}`} style={s.keyChipGold}>
                    <MaterialCommunityIcons name="flag-checkered" size={10} color={GOLD} />
                    <Text style={s.keyChipGoldText}>Test  Wk {w}</Text>
                  </View>
                ))}
                {deloadWeeks.map(w => (
                  <View key={`d${w}`} style={s.keyChipGreen}>
                    <MaterialCommunityIcons name="battery-charging-outline" size={10} color={GREEN} />
                    <Text style={s.keyChipGreenText}>Recovery  Wk {w}</Text>
                  </View>
                ))}
              </ScrollView>
            </>
          )}

          {/* ── Training split summary ── */}
          <View style={s.sectionWrap}>
            <Text style={s.sectionTitle}>Weekly Training Split</Text>
            <Text style={s.sectionSub}>
              {plan?.trainingDays ?? 4} sessions / week — {getSplitDays(userGoal).length} session types
            </Text>
          </View>
          <View style={s.splitGrid}>
            {getSplitDays(userGoal).map((d, i) => (
              <View key={i} style={[s.splitCard, { borderLeftColor: d.color }]}>
                <MaterialCommunityIcons name={d.icon} size={16} color={d.color} style={{ marginBottom: 6 }} />
                <Text style={[s.splitType, { color: d.color }]}>{d.type}</Text>
                <Text style={s.splitFocus}>{d.focus}</Text>
              </View>
            ))}
          </View>

          {/* ── Your Program Explained ── */}
          {(() => {
            const content = getProgramContent(userGoal);
            return (
              <View style={s.coachCard}>
                <View style={s.coachHeader}>
                  <View style={s.coachAvatarWrap}>
                    <MaterialCommunityIcons name="brain" size={15} color={GOLD} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.coachLabel}>Your Program Explained</Text>
                    <Text style={s.coachSub}>{content.subtitle}</Text>
                  </View>
                </View>
                <Text style={s.coachText}>{content.description}</Text>
                <View style={s.timelineWrap}>
                  {content.timeline.map((item, i) => (
                    <View key={i} style={s.timelineRow}>
                      <Text style={s.timelinePeriod}>{item.period}</Text>
                      <Text style={s.timelineNote}>{item.note}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })()}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* ── Fixed bottom CTA ── */}
        <View style={s.ctaBar}>
          <TouchableOpacity
            style={s.startBtn}
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
              router.replace('/(tabs)');
            }}
            activeOpacity={0.87}
          >
            <Text style={s.startBtnText}>Start Training</Text>
            <MaterialCommunityIcons name="arrow-right" size={20} color={BG} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
              // Replace current screen with onboarding so user can redo their preferences
              router.replace('/onboarding-intake' as any);
            }}
            style={s.adjustLink}
          >
            <Text style={s.adjustText}>Adjust preferences</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  };

  // ── Root render ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <View style={StyleSheet.absoluteFill} pointerEvents={showReveal ? 'none' : 'auto'}>
        {renderPhase1()}
      </View>
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
  spinnerWrap: {
    width: 72, height: 72,
    marginBottom: SPACING.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinnerTrack: {
    position: 'absolute',
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 5, borderColor: '#252528',
  },
  spinnerArc: {
    position: 'absolute',
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 5,
    borderTopColor:    GOLD,
    borderRightColor:  GOLD,
    borderBottomColor: 'transparent',
    borderLeftColor:   'transparent',
  },
  spinnerCenter: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: GOLD + '15',
    justifyContent: 'center', alignItems: 'center',
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
  phaseList: { width: '100%', maxWidth: 330 },

  // ── Phase 2 ──
  phase2Wrap:    { flex: 1 },
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },

  // Header card
  headerCard: {
    borderWidth: 1.5,
    borderColor: GOLD,
    borderRadius: 22,
    backgroundColor: SURFACE,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 5,
  },
  readyBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: GREEN + '18',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: 5,
    marginBottom: SPACING.md,
    borderWidth: 1, borderColor: GREEN + '40',
  },
  readyBadgeText: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: GREEN, letterSpacing: 0.5 },
  programName:    {
    fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy,
    color: GOLD, textAlign: 'center', marginBottom: SPACING.lg, lineHeight: 30,
  },
  metaRow:    { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap', justifyContent: 'center' },
  metaChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: GOLD + '14',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: 5,
    borderWidth: 1, borderColor: GOLD + '30',
  },
  metaChipText: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: GOLD },

  // Section headings
  sectionWrap:  { marginBottom: SPACING.sm, marginTop: SPACING.md },
  sectionTitle: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: 2 },
  sectionSub:   { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },

  // Milestones card
  milestonesCard: {
    backgroundColor: SURFACE, borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: BORDER,
    borderLeftWidth: 3, borderLeftColor: GOLD,
    overflow: 'hidden', marginBottom: SPACING.sm,
  },
  milestoneRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  milestoneRowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  milestoneIcon:  {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: GOLD + '18',
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  milestoneName: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text.primary, fontWeight: FONTS.weights.semibold },
  milestoneDate: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },

  // Key weeks
  keyWeeksScroll:  { gap: SPACING.sm, paddingBottom: SPACING.sm },
  keyChipGold: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: GOLD + '18',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: 6,
    borderWidth: 1, borderColor: GOLD + '40',
  },
  keyChipGoldText:  { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: GOLD },
  keyChipGreen: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: GREEN + '18',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: 6,
    borderWidth: 1, borderColor: GREEN + '40',
  },
  keyChipGreenText: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: GREEN },

  // Training split
  splitGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: SPACING.sm, marginBottom: SPACING.sm,
  },
  splitCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: SURFACE,
    borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: BORDER,
    borderLeftWidth: 3,
    padding: SPACING.md,
  },
  splitType:  { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, letterSpacing: 1, marginBottom: 4 },
  splitFocus: { fontSize: 11, color: COLORS.text.muted, lineHeight: 16 },

  // Coach card
  coachCard: {
    backgroundColor: SURFACE,
    borderRadius: RADIUS.xl,
    borderWidth: 1.5, borderColor: GOLD + '40',
    borderLeftWidth: 3, borderLeftColor: GOLD,
    padding: SPACING.lg,
    marginTop: SPACING.sm, marginBottom: SPACING.sm,
  },
  coachHeader:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md },
  coachAvatarWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: GOLD + '14',
    borderWidth: 1.5, borderColor: GOLD + '40',
    justifyContent: 'center', alignItems: 'center',
  },
  coachLabel: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, color: GOLD, letterSpacing: 0.5 },
  coachSub:   { fontSize: 10, color: COLORS.text.muted, marginTop: 1 },
  coachText:  { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 22 },

  // Timeline rows inside coach card
  timelineWrap: { marginTop: SPACING.md, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: SPACING.md, gap: SPACING.sm },
  timelineRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  timelinePeriod: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: GOLD, width: 88, flexShrink: 0 },
  timelineNote:   { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.text.muted, lineHeight: 17 },

  // CTA
  ctaBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: BG,
    borderTopWidth: 1, borderTopColor: BORDER,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg + (Platform.OS === 'ios' ? 4 : 0),
    gap: SPACING.sm,
  },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: GOLD,
    borderRadius: 16, paddingVertical: 17,
    gap: SPACING.sm,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12,
    elevation: 6,
  },
  startBtnText: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: BG, letterSpacing: 0.5 },
  adjustLink:   { alignItems: 'center', paddingVertical: SPACING.sm },
  adjustText:   { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, textDecorationLine: 'underline' },
});
