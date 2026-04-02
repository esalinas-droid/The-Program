import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, ActivityIndicator, Animated,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../src/constants/theme';
import { getProfile } from '../src/utils/storage';

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

// ── Mock Phase Data ───────────────────────────────────────────────────────────
const PHASE_BLOCKS: PhaseBlock[] = [
  {
    id: 'intro',
    name: 'Intro Phase',
    blockNum: 1,
    weekStart: 1,
    weekEnd: 4,
    focus: 'Foundation',
    description: 'Reset movement quality, establish baseline numbers, and re-groove every pattern. Stay under RPE 8 across all sessions.',
    keyLifts: ['Floor Press', 'Box Squat', 'Trap Bar Deadlift'],
    adaptation: 'Movement quality, joint health, motor pattern refinement',
    milestones: [
      { type: 'deload', week: 4, label: 'Deload Week' },
    ],
  },
  {
    id: 'base-strength',
    name: 'Base Strength',
    blockNum: 2,
    weekStart: 5,
    weekEnd: 12,
    focus: 'Volume',
    description: 'Build foundational strength with conjugate periodization. Max Effort days push toward 90%+. Dynamic Effort builds speed and volume.',
    keyLifts: ['Squat', 'Bench Press', 'Deadlift', 'Log Press'],
    adaptation: 'Strength endurance, CNS efficiency, GPP base',
    milestones: [
      { type: 'deload',  week: 8,  label: 'Deload Week' },
      { type: 'testing', week: 12, label: 'E1RM Testing Week' },
    ],
  },
  {
    id: 'accumulation',
    name: 'Accumulation',
    blockNum: 3,
    weekStart: 13,
    weekEnd: 20,
    focus: 'Volume-Intensity',
    description: 'Increase loading and volume simultaneously. Both ME and DE sessions climb in intensity. Accessory volume peaks here.',
    keyLifts: ['Yoke', 'Atlas Stone', 'Axle Press', 'Deadlift Variations'],
    adaptation: 'Work capacity, hypertrophy, strength carry-over',
    milestones: [
      { type: 'deload', week: 20, label: 'Deload Week' },
    ],
  },
  {
    id: 'intensification',
    name: 'Intensification',
    blockNum: 4,
    weekStart: 21,
    weekEnd: 28,
    focus: 'Intensity',
    description: 'Volume drops, intensity climbs. Main lifts approach true maximal loads. Every ME session is a statement of intent.',
    keyLifts: ['Competition Squat', 'Floor Press', 'Sumo Deadlift'],
    adaptation: 'Maximal strength expression, peak force output',
    milestones: [
      { type: 'testing', week: 28, label: 'Strength Testing Week' },
    ],
  },
  {
    id: 'peaking',
    name: 'Peaking',
    blockNum: 5,
    weekStart: 29,
    weekEnd: 34,
    focus: 'Peak Strength',
    description: 'Lift at or near competition specificity. Reduce fatigue while maintaining intensity. Everything narrows to the big movements.',
    keyLifts: ['Competition Events', 'Axle', 'Yoke', 'Stones'],
    adaptation: 'Sharpness, competition-specific motor patterns',
    milestones: [
      { type: 'deload', week: 32, label: 'Deload Week' },
    ],
  },
  {
    id: 'comp-prep',
    name: 'Competition Prep',
    blockNum: 6,
    weekStart: 35,
    weekEnd: 38,
    focus: 'Sharpening',
    description: 'Final taper into competition. Loads drop to 60–70%, speed and sharpness take priority. Trust the work you have put in.',
    keyLifts: ['All Competition Events'],
    adaptation: 'Recovery, sharpness, peak competition readiness',
    milestones: [
      { type: 'competition', week: 38, label: 'Strongman Competition' },
    ],
  },
  {
    id: 'off-season',
    name: 'Off-Season',
    blockNum: 7,
    weekStart: 39,
    weekEnd: 52,
    focus: 'Recovery & Reset',
    description: 'Active recovery and movement variety. Address weaknesses identified during the season. Rebuild the base for the next training cycle.',
    keyLifts: ['Varies by weakness', 'GPP Work', 'Bodybuilding Assistance'],
    adaptation: 'Structural balance, injury prevention, mental reset',
    milestones: [],
  },
];

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
function TimelineCard({ block, status, dateRange, currentWeek }: {
  block: PhaseBlock; status: PhaseStatus; dateRange: string; currentWeek: number;
}) {
  const focusColor  = FOCUS_COLORS[block.focus] ?? COLORS.text.secondary;
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
        <Text style={tc.blockLabel}>BLOCK {block.blockNum} OF 7</Text>

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
  const [currentWeek, setCurrentWeek]   = useState(1);
  const [programStart, setProgramStart] = useState<Date>(new Date('2025-01-01'));
  const [loading, setLoading]           = useState(true);

  // Animated values
  const headerAnim      = useRef({ opacity: new Animated.Value(0), y: new Animated.Value(-12) }).current;
  const currentCardAnim = useRef({ opacity: new Animated.Value(0), scale: new Animated.Value(0.96) }).current;
  const cardAnims       = useRef(PHASE_BLOCKS.map(() => ({
    opacity:    new Animated.Value(0),
    translateY: new Animated.Value(20),
  }))).current;

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

  // ── Computed ─────────────────────────────────────────────────────────────────
  const currentBlock = PHASE_BLOCKS.find(
    b => currentWeek >= b.weekStart && currentWeek <= b.weekEnd
  ) ?? PHASE_BLOCKS[0];

  const weekInBlock       = Math.max(currentWeek - currentBlock.weekStart + 1, 1);
  const totalBlockWeeks   = currentBlock.weekEnd - currentBlock.weekStart + 1;
  const blockProgressPct  = Math.round((weekInBlock / totalBlockWeeks) * 100);
  const phasesRemaining   = PHASE_BLOCKS.filter(b => currentWeek < b.weekStart).length;
  const allMilestones     = PHASE_BLOCKS.flatMap(b => b.milestones);
  const deloadCount       = allMilestones.filter(m => m.type === 'deload').length;
  const endDate           = new Date(programStart.getTime() + 52 * 7 * 86400000);
  const endMonthYear      = endDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const focusColor        = FOCUS_COLORS[currentBlock.focus] ?? COLORS.text.secondary;

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
            <Text style={s.subtitle}>12-month strategic plan built around your goals</Text>
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
                  BLOCK {currentBlock.blockNum} OF 7  ·  WEEKS {currentBlock.weekStart}–{currentBlock.weekEnd}
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
            <View style={s.adaptRow}>
              <MaterialCommunityIcons name="arrow-up-circle-outline" size={14} color={TEAL} />
              <Text style={s.adaptText}>{currentBlock.adaptation}</Text>
            </View>

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
          <Text style={s.sectionSub}>52 weeks · 7 phases</Text>
        </View>

        {/* ── VERTICAL TIMELINE ── */}
        <View style={s.timeline}>
          {/* Vertical rail line */}
          <View style={s.timelineRail} />

          {PHASE_BLOCKS.map((block, i) => {
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
            <GlanceStat icon="calendar-range"    value="52"            label="TOTAL WEEKS"   />
            <GlanceStat icon="weather-night"     value={String(deloadCount)} label="DELOADS"  color={BLUE}    />
            <GlanceStat icon="map-marker-path"   value={String(phasesRemaining)} label="PHASES LEFT" />
            <GlanceStat icon="flag-checkered"    value={endMonthYear}  label="EST. END"      color={TEAL}    />
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
