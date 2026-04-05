import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, ActivityIndicator, Animated,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../src/constants/theme';
import { getProfile } from '../src/utils/storage';
import { programApi } from '../src/utils/api';

// ── Extra palette ─────────────────────────────────────────────────────────────
const TEAL    = '#4DCEA6';
const BLUE    = '#5B9CF5';
const PURPLE  = '#9B6FDE';
const SUCCESS = '#4CAF50';

// ── Types ─────────────────────────────────────────────────────────────────────
type PhaseStatus  = 'completed' | 'current' | 'upcoming';
type MilestoneType = 'deload' | 'testing' | 'competition';

interface Milestone {
  type: MilestoneType;
  week: number;
  label: string;
}

interface PhaseBlock {
  id: string;
  name: string;
  blockNum: number;
  weekStart: number;
  weekEnd: number;
  focus: string;
  description: string;
  keyLifts: string[];
  adaptation: string;
  milestones: Milestone[];
}

// ── Dynamic phase-to-block mapping helpers ─────────────────────────────────────
const MAX_PHASES = 15; // Pool size — enough for any AI-generated plan

function getFocusTag(goal: string): string {
  const g = (goal || '').toLowerCase();
  if (g.includes('foundation') || g.includes('intro') || g.includes('base movement')) return 'Foundation';
  if (g.includes('peak') || g.includes('peaking')) return 'Peak Strength';
  if (g.includes('deload') || g.includes('recovery') || g.includes('off-season')) return 'Recovery & Reset';
  if (g.includes('competition') || g.includes('comp prep') || g.includes('taper')) return 'Sharpening';
  if ((g.includes('volume') && g.includes('intensity')) || g.includes('accumulation')) return 'Volume-Intensity';
  if (g.includes('intensity') || g.includes('intensif')) return 'Intensity';
  if (g.includes('volume') || g.includes('hypertrophy')) return 'Volume';
  return goal ? goal.split(/[—\-,]/)[0].trim().slice(0, 18) : 'Training';
}

function mapApiPhaseToBlock(phase: any, idx: number): PhaseBlock {
  // Gather key exercises from all blocks in this phase
  const keyLifts: string[] = [];
  const milestones: Milestone[] = [];

  for (const block of (phase.blocks || [])) {
    // Collect key exercises
    for (const ex of (block.keyExercises || [])) {
      if (!keyLifts.includes(ex) && keyLifts.length < 4) keyLifts.push(ex);
    }
    // Collect deload / testing weeks
    for (const week of (block.weeks || [])) {
      if (week.isDeload) {
        milestones.push({ type: 'deload', week: week.weekNumber, label: 'Deload Week' });
      } else if (week.isTest) {
        milestones.push({ type: 'testing', week: week.weekNumber, label: 'Testing Week' });
      }
    }
  }

  const focus = getFocusTag(phase.goal || phase.phaseName || '');

  return {
    id:          phase.phaseId || `phase-${idx}`,
    name:        phase.phaseName || `Phase ${idx + 1}`,
    blockNum:    phase.phaseNumber || idx + 1,
    weekStart:   phase.startWeek || 1,
    weekEnd:     phase.endWeek   || 4,
    focus,
    description: phase.expectedAdaptation || phase.goal || '',
    keyLifts:    keyLifts.length > 0 ? keyLifts : ['Main Lifts'],
    adaptation:  phase.expectedAdaptation || '',
    milestones,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const FOCUS_COLORS: Record<string, string> = {
  'Foundation':       '#888888',
  'Volume':           BLUE,
  'Volume-Intensity': PURPLE,
  'Intensity':        '#E8C96A',
  'Peak Strength':    COLORS.accent,
  'Sharpening':       TEAL,
  'Recovery & Reset': '#666666',
};

const MILESTONE_CONFIG: Record<MilestoneType, { icon: string; color: string }> = {
  deload:      { icon: 'weather-night',   color: BLUE    },
  testing:     { icon: 'target',          color: COLORS.accent },
  competition: { icon: 'trophy-variant',  color: PURPLE  },
};

function getStatus(block: PhaseBlock, currentWeek: number): PhaseStatus {
  if (currentWeek > block.weekEnd) return 'completed';
  if (currentWeek >= block.weekStart && currentWeek <= block.weekEnd) return 'current';
  return 'upcoming';
}

function weekToDateRange(weekStart: number, weekEnd: number, programStart: Date): string {
  const startDate = new Date(programStart.getTime() + (weekStart - 1) * 7 * 86400000);
  const endDate   = new Date(programStart.getTime() + weekEnd * 7 * 86400000);
  const startStr  = startDate.toLocaleDateString('en-US', { month: 'short' });
  const endOpts: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' };
  if (startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear()) {
    return endDate.toLocaleDateString('en-US', endOpts);
  }
  return `${startStr} – ${endDate.toLocaleDateString('en-US', endOpts)}`;
}

// ── MilestoneRow ──────────────────────────────────────────────────────────────
function MilestoneRow({ milestone }: { milestone: Milestone }) {
  const cfg = MILESTONE_CONFIG[milestone.type];
  return (
    <View style={ml.row}>
      <View style={ml.leftStrip}>
        <View style={[ml.dot, { backgroundColor: cfg.color }]} />
      </View>
      <View style={[ml.iconWrap, { backgroundColor: cfg.color + '20' }]}>
        <MaterialCommunityIcons name={cfg.icon as any} size={13} color={cfg.color} />
      </View>
      <Text style={[ml.label, { color: cfg.color }]}>{milestone.label}</Text>
      <Text style={ml.week}>WK {milestone.week}</Text>
    </View>
  );
}
const ml = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: SPACING.lg, gap: 8 },
  leftStrip: { width: 28, alignItems: 'center' },
  dot:       { width: 6, height: 6, borderRadius: 3 },
  iconWrap:  { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  label:     { flex: 1, fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.semibold },
  week:      { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy },
});

// ── TimelineCard ──────────────────────────────────────────────────────────────
function TimelineCard({ block, status, dateRange, currentWeek, totalBlocks }: {
  block: PhaseBlock; status: PhaseStatus; dateRange: string; currentWeek: number; totalBlocks: number;
}) {
  const focusColor  = FOCUS_COLORS[block.focus] ?? BLUE;
  const borderColor = status === 'completed' ? SUCCESS : status === 'current' ? COLORS.accent : COLORS.border;
  const nodeColor   = status === 'completed' ? SUCCESS : status === 'current' ? COLORS.accent : COLORS.surfaceHighlight;
  const weekInBlock = Math.max(currentWeek - block.weekStart + 1, 0);
  const totalWeeks  = block.weekEnd - block.weekStart + 1;

  return (
    <View style={tc.row}>
      {/* ── Left rail node ── */}
      <View style={tc.leftCol}>
        <View style={[tc.node, { backgroundColor: nodeColor, borderColor }]}>
          {status === 'completed' && (
            <MaterialCommunityIcons name="check" size={8} color="#FFF" />
          )}
        </View>
      </View>

      {/* ── Card ── */}
      <View style={[
        tc.card,
        { borderLeftColor: borderColor },
        status === 'current'    && tc.cardCurrent,
        status === 'completed'  && tc.cardCompleted,
        status === 'upcoming'   && tc.cardUpcoming,
      ]}>
        {/* Current badge */}
        {status === 'current' && (
          <View style={tc.currentBadge}>
            <View style={tc.currentPulse} />
            <Text style={tc.currentBadgeText}>CURRENT</Text>
          </View>
        )}

        {/* Block label */}
        <Text style={tc.blockLabel}>PHASE {block.blockNum} OF {totalBlocks}</Text>

        {/* Phase name */}
        <Text style={[tc.phaseName, status === 'upcoming' && tc.phaseNameMuted]}>
          {block.name}
        </Text>

        {/* Meta row */}
        <View style={tc.metaRow}>
          <Text style={tc.meta}>Weeks {block.weekStart}–{block.weekEnd}</Text>
          <View style={tc.metaDot} />
          <Text style={tc.meta}>{dateRange}</Text>
        </View>

        {/* Focus tag */}
        <View style={[tc.focusTag, { backgroundColor: focusColor + '18' }]}>
          <View style={[tc.focusDot, { backgroundColor: focusColor }]} />
          <Text style={[tc.focusText, { color: focusColor }]}>{block.focus}</Text>
        </View>

        {/* Week progress (current only) */}
        {status === 'current' && (
          <View style={tc.progressContainer}>
            <View style={tc.progressLabelRow}>
              <Text style={tc.progressLabel}>Week {weekInBlock} of {totalWeeks}</Text>
              <Text style={tc.progressPct}>{Math.round((weekInBlock / totalWeeks) * 100)}%</Text>
            </View>
            <View style={tc.progressTrack}>
              <View style={[tc.progressFill, { width: `${(weekInBlock / totalWeeks) * 100}%` as any }]} />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
const tc = StyleSheet.create({
  row:            { flexDirection: 'row', paddingHorizontal: SPACING.lg, marginBottom: 2 },
  leftCol:        { width: 28, alignItems: 'center', paddingTop: 14 },
  node:           { width: 14, height: 14, borderRadius: 7, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },

  card:           { flex: 1, borderLeftWidth: 3, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface, padding: SPACING.md, marginLeft: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
  cardCurrent:    { backgroundColor: COLORS.surface, borderColor: COLORS.accent, shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 4 },
  cardCompleted:  { opacity: 0.75 },
  cardUpcoming:   { backgroundColor: COLORS.primary },

  currentBadge:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.accent + '20', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full, marginBottom: SPACING.sm },
  currentPulse:     { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent },
  currentBadgeText: { fontSize: 9, color: COLORS.accent, fontWeight: FONTS.weights.heavy, letterSpacing: 1 },

  blockLabel:   { fontSize: 9, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.5, marginBottom: 3 },
  phaseName:    { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: SPACING.sm },
  phaseNameMuted: { color: COLORS.text.muted },

  metaRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.sm },
  meta:      { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  metaDot:   { width: 3, height: 3, borderRadius: 1.5, backgroundColor: COLORS.border },

  focusTag:  { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: RADIUS.full },
  focusDot:  { width: 6, height: 6, borderRadius: 3 },
  focusText: { fontSize: 10, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5 },

  progressContainer:  { marginTop: SPACING.sm },
  progressLabelRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  progressLabel:      { fontSize: FONTS.sizes.xs, color: COLORS.text.secondary },
  progressPct:        { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontWeight: FONTS.weights.heavy },
  progressTrack:      { height: 4, backgroundColor: COLORS.surfaceHighlight, borderRadius: 2 },
  progressFill:       { height: 4, backgroundColor: COLORS.accent, borderRadius: 2 },
});

// ── GlanceStat ────────────────────────────────────────────────────────────────
function GlanceStat({ icon, value, label, color }: { icon: string; value: string; label: string; color?: string }) {
  return (
    <View style={gs.card}>
      <MaterialCommunityIcons name={icon as any} size={20} color={color ?? COLORS.accent} style={{ marginBottom: 6 }} />
      <Text style={[gs.value, color ? { color } : {}]}>{value}</Text>
      <Text style={gs.label}>{label}</Text>
    </View>
  );
}
const gs = StyleSheet.create({
  card:  { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  value: { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.accent, lineHeight: 26 },
  label: { fontSize: 9, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy, letterSpacing: 0.8, textAlign: 'center', marginTop: 2 },
});

// ── Main RoadmapScreen ────────────────────────────────────────────────────────
export default function RoadmapScreen() {
  const router = useRouter();
  const [currentWeek,   setCurrentWeek]   = useState(1);
  const [programStart,  setProgramStart]  = useState<Date>(new Date());
  const [loading,       setLoading]       = useState(true);
  const [dynamicBlocks, setDynamicBlocks] = useState<PhaseBlock[]>([]);
  const [planName,      setPlanName]      = useState('Your 52-Week Plan');
  const [noPlan,        setNoPlan]        = useState(false);

  // Fixed pool of animation values — enough for any AI-generated plan
  const headerAnim      = useRef({ opacity: new Animated.Value(0), y: new Animated.Value(-12) }).current;
  const currentCardAnim = useRef({ opacity: new Animated.Value(0), scale: new Animated.Value(0.96) }).current;
  const cardAnims       = useRef(
    Array.from({ length: MAX_PHASES }, () => ({
      opacity:    new Animated.Value(0),
      translateY: new Animated.Value(20),
    }))
  ).current;

  useFocusEffect(useCallback(() => {
    // Reset animations on every focus
    headerAnim.opacity.setValue(0);
    headerAnim.y.setValue(-12);
    currentCardAnim.opacity.setValue(0);
    currentCardAnim.scale.setValue(0.96);
    cardAnims.forEach(a => { a.opacity.setValue(0); a.translateY.setValue(20); });

    (async () => {
      const prof = await getProfile();
      setCurrentWeek(prof?.currentWeek || 1);
      if (prof?.programStartDate) setProgramStart(new Date(prof.programStartDate));

      // ── Fetch real AI-generated plan from backend ───────────────────────
      try {
        const yearPlan = await programApi.getYearPlan();
        if (yearPlan?.phases && yearPlan.phases.length > 0) {
          const mapped = yearPlan.phases.map(mapApiPhaseToBlock);
          setDynamicBlocks(mapped);
          setPlanName(yearPlan.planName || 'Your 52-Week Plan');
          setNoPlan(false);
        } else {
          setNoPlan(true);
        }
      } catch {
        // No plan generated yet — show empty state
        setNoPlan(true);
      }

      setLoading(false);

      // Sequence: header → current card → staggered timeline
      Animated.sequence([
        Animated.parallel([
          Animated.timing(headerAnim.opacity, { toValue: 1, duration: 450, useNativeDriver: true }),
          Animated.timing(headerAnim.y,       { toValue: 0, duration: 380, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(currentCardAnim.opacity, { toValue: 1, duration: 450, useNativeDriver: true }),
          Animated.spring(currentCardAnim.scale,   { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 260 }),
        ]),
        Animated.stagger(
          65,
          cardAnims.map(a =>
            Animated.parallel([
              Animated.timing(a.opacity,    { toValue: 1, duration: 350, useNativeDriver: true }),
              Animated.timing(a.translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
            ])
          )
        ),
      ]).start();
    })();
  }, []));

  if (loading) {
    return <View style={s.loading}><ActivityIndicator color={COLORS.accent} size="large" /></View>;
  }

  // ── No plan state ──────────────────────────────────────────────────────────
  if (noPlan) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.text.secondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Your Roadmap</Text>
            <Text style={s.subtitle}>12-month strategic plan</Text>
          </View>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.xl }}>
          <MaterialCommunityIcons name="map-marker-path" size={52} color={COLORS.text.muted} />
          <Text style={{ color: COLORS.text.primary, fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, marginTop: SPACING.lg, textAlign: 'center' }}>
            No Program Yet
          </Text>
          <Text style={{ color: COLORS.text.muted, fontSize: FONTS.sizes.sm, marginTop: SPACING.sm, textAlign: 'center', lineHeight: 22 }}>
            Complete onboarding to generate your personalized 52-week training roadmap.
          </Text>
          <TouchableOpacity
            style={{ marginTop: SPACING.xl, backgroundColor: COLORS.accent, paddingVertical: 13, paddingHorizontal: SPACING.xxl, borderRadius: RADIUS.lg }}
            onPress={() => router.push('/onboarding-intake')}
          >
            <Text style={{ color: COLORS.primary, fontWeight: FONTS.weights.heavy, fontSize: FONTS.sizes.base }}>
              Start Onboarding
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Computed ─────────────────────────────────────────────────────────────────
  const currentBlock = dynamicBlocks.find(
    b => currentWeek >= b.weekStart && currentWeek <= b.weekEnd
  ) ?? dynamicBlocks[0];

  if (!currentBlock) {
    return <View style={s.loading}><ActivityIndicator color={COLORS.accent} size="large" /></View>;
  }

  const weekInBlock       = Math.max(currentWeek - currentBlock.weekStart + 1, 1);
  const totalBlockWeeks   = currentBlock.weekEnd - currentBlock.weekStart + 1;
  const blockProgressPct  = Math.round((weekInBlock / totalBlockWeeks) * 100);
  const phasesRemaining   = dynamicBlocks.filter(b => currentWeek < b.weekStart).length;
  const allMilestones     = dynamicBlocks.flatMap(b => b.milestones);
  const deloadCount       = allMilestones.filter(m => m.type === 'deload').length;
  const totalWeeks        = dynamicBlocks.length > 0
    ? dynamicBlocks[dynamicBlocks.length - 1].weekEnd
    : 52;
  const endDate           = new Date(programStart.getTime() + totalWeeks * 7 * 86400000);
  const endMonthYear      = endDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const focusColor        = FOCUS_COLORS[currentBlock.focus] ?? BLUE;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ── HEADER ── */}
        <Animated.View style={[s.header, {
          opacity: headerAnim.opacity,
          transform: [{ translateY: headerAnim.y }],
        }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.text.secondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Your Roadmap</Text>
            <Text style={s.subtitle} numberOfLines={1}>{planName}</Text>
          </View>
          <View style={s.dateBadge}>
            <Text style={s.dateBadgeText}>
              {new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()}
            </Text>
          </View>
        </Animated.View>

        {/* ── CURRENT PHASE CARD (expanded) ── */}
        <Animated.View style={{
          opacity: currentCardAnim.opacity,
          transform: [{ scale: currentCardAnim.scale }],
        }}>
          <View style={s.currentCard}>
            {/* Gold glow border */}
            <View style={s.currentCardGlow} />

            {/* Top row */}
            <View style={s.currentCardTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.currentBlockLabel}>
                  PHASE {currentBlock.blockNum} OF {dynamicBlocks.length}  ·  WEEKS {currentBlock.weekStart}–{currentBlock.weekEnd}
                </Text>
                <Text style={s.currentPhaseName}>{currentBlock.name}</Text>
              </View>
              <View style={s.currentActiveBadge}>
                <View style={s.activePulse} />
                <Text style={s.activeBadgeText}>ACTIVE</Text>
              </View>
            </View>

            {/* Description */}
            <Text style={s.currentDesc}>{currentBlock.description}</Text>

            {/* Week progress bar */}
            <View style={s.progressRow}>
              <Text style={s.progressWeekText}>
                Week {weekInBlock} of {totalBlockWeeks}
              </Text>
              <Text style={s.progressPctText}>{blockProgressPct}%</Text>
            </View>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${blockProgressPct}%` as any }]} />
            </View>

            {/* Key lifts */}
            <Text style={s.subLabel}>KEY LIFTS</Text>
            <View style={s.liftTagsRow}>
              {currentBlock.keyLifts.map(lift => (
                <View key={lift} style={s.liftTag}>
                  <Text style={s.liftTagText}>{lift}</Text>
                </View>
              ))}
            </View>

            {/* Expected adaptation */}
            {currentBlock.adaptation ? (
              <View style={s.adaptRow}>
                <MaterialCommunityIcons name="arrow-up-circle-outline" size={14} color={TEAL} />
                <Text style={s.adaptText}>{currentBlock.adaptation}</Text>
              </View>
            ) : null}

            {/* CTA */}
            <TouchableOpacity
              style={s.viewSessionBtn}
              onPress={() => router.push('/current-block' as any)}
              activeOpacity={0.85}
            >
              <Text style={s.viewSessionBtnText}>View Current Block</Text>
              <MaterialCommunityIcons name="arrow-right" size={16} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ── YEAR OVERVIEW LABEL ── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionLabel}>YEAR OVERVIEW</Text>
          <Text style={s.sectionSub}>{totalWeeks} weeks · {dynamicBlocks.length} phases</Text>
        </View>

        {/* ── VERTICAL TIMELINE ── */}
        <View style={s.timeline}>
          {/* Vertical rail line */}
          <View style={s.timelineRail} />

          {dynamicBlocks.map((block, i) => {
            const status    = getStatus(block, currentWeek);
            const dateRange = weekToDateRange(block.weekStart, block.weekEnd, programStart);

            return (
              <Animated.View
                key={block.id}
                style={{
                  opacity:   cardAnims[i].opacity,
                  transform: [{ translateY: cardAnims[i].translateY }],
                }}
              >
                <TimelineCard
                  block={block}
                  status={status}
                  dateRange={dateRange}
                  currentWeek={currentWeek}
                  totalBlocks={dynamicBlocks.length}
                />
                {block.milestones.map((m, mi) => (
                  <MilestoneRow key={mi} milestone={m} />
                ))}
              </Animated.View>
            );
          })}
        </View>

        {/* ── YEAR AT A GLANCE ── */}
        <View style={s.glanceSection}>
          <Text style={s.sectionLabel}>YOUR YEAR AT A GLANCE</Text>
          <View style={s.glanceGrid}>
            <GlanceStat icon="calendar-range"    value={String(totalWeeks)}    label="TOTAL WEEKS"   />
            <GlanceStat icon="weather-night"     value={String(deloadCount)}   label="DELOADS"       color={BLUE}    />
            <GlanceStat icon="map-marker-path"   value={String(phasesRemaining)} label="PHASES LEFT" />
            <GlanceStat icon="flag-checkered"    value={endMonthYear}          label="EST. END"      color={TEAL}    />
          </View>
        </View>

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: COLORS.background },
  loading:      { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  scroll:       { flex: 1 },
  scrollContent:{ paddingBottom: SPACING.xl },

  // Header
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl, paddingBottom: SPACING.lg, gap: SPACING.md },
  backBtn:    { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 20, backgroundColor: COLORS.surface },
  title:      { fontSize: 24, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 30 },
  subtitle:   { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 2, lineHeight: 16 },
  dateBadge:  { backgroundColor: COLORS.accent + '20', paddingHorizontal: 9, paddingVertical: 5, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.accent + '40' },
  dateBadgeText: { fontSize: 10, color: COLORS.accent, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5 },

  // Current phase card
  currentCard:      { marginHorizontal: SPACING.lg, marginBottom: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1.5, borderColor: COLORS.accent, shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 8 },
  currentCardGlow:  { position: 'absolute', top: -1, left: -1, right: -1, bottom: -1, borderRadius: RADIUS.xl + 1, borderWidth: 1, borderColor: COLORS.accent + '30' },
  currentCardTop:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm, gap: SPACING.sm },
  currentBlockLabel:{ fontSize: 9, fontWeight: FONTS.weights.heavy, color: COLORS.accent, letterSpacing: 1.5, marginBottom: 4 },
  currentPhaseName: { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 30 },
  currentActiveBadge:{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.accent + '20', paddingHorizontal: 9, paddingVertical: 4, borderRadius: RADIUS.full, marginTop: 6 },
  activePulse:      { width: 7, height: 7, borderRadius: 3.5, backgroundColor: COLORS.accent },
  activeBadgeText:  { fontSize: 9, color: COLORS.accent, fontWeight: FONTS.weights.heavy, letterSpacing: 1 },
  currentDesc:      { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 21, marginBottom: SPACING.md },

  progressRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressWeekText: { fontSize: FONTS.sizes.xs, color: COLORS.text.secondary },
  progressPctText:  { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontWeight: FONTS.weights.heavy },
  progressTrack: { height: 6, backgroundColor: COLORS.surfaceHighlight, borderRadius: 3, marginBottom: SPACING.lg, overflow: 'hidden' },
  progressFill:  { height: 6, backgroundColor: COLORS.accent, borderRadius: 3 },

  subLabel:    { fontSize: 9, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.5, marginBottom: SPACING.sm },
  liftTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: SPACING.md },
  liftTag:     { backgroundColor: COLORS.surfaceHighlight, paddingHorizontal: 9, paddingVertical: 4, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border },
  liftTagText: { fontSize: FONTS.sizes.xs, color: COLORS.text.secondary, fontWeight: FONTS.weights.semibold },

  adaptRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: SPACING.lg, backgroundColor: TEAL + '10', borderRadius: RADIUS.md, padding: SPACING.sm },
  adaptText: { fontSize: FONTS.sizes.xs, color: TEAL, flex: 1, lineHeight: 17, fontWeight: FONTS.weights.semibold },

  viewSessionBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accent, borderRadius: RADIUS.lg, paddingVertical: 13, gap: SPACING.sm, shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 5 },
  viewSessionBtnText: { color: COLORS.primary, fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5 },

  // Section label
  sectionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  sectionLabel: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2 },
  sectionSub:   { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },

  // Timeline
  timeline:     { paddingLeft: SPACING.xs, position: 'relative' },
  timelineRail: { position: 'absolute', left: SPACING.lg + 14 + SPACING.sm / 2, top: 16, bottom: 0, width: 1.5, backgroundColor: COLORS.border + '80' },

  // Year at a glance
  glanceSection: { paddingHorizontal: SPACING.lg, marginTop: SPACING.xl },
  glanceGrid:    { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
});
