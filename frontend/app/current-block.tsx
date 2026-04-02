import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, ActivityIndicator, Animated,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../src/constants/theme';
import { getProfile } from '../src/utils/storage';
import { getTodayDayName } from '../src/data/programData';

// ── Palette ───────────────────────────────────────────────────────────────────
const TEAL    = '#4DCEA6';
const BLUE    = '#5B9CF5';
const AMBER   = '#F5A623';
const SUCCESS = '#4CAF50';

// ── Types ─────────────────────────────────────────────────────────────────────
type WeekStatus = 'completed' | 'current' | 'upcoming';
type TrendDir   = 'up' | 'down' | 'stable';

interface BlockWeek {
  weekNum: number;
  sessions: { label: string; type: 'me_upper' | 'me_lower' | 'de_upper' | 'de_lower' }[];
  completedStats?: { sessions: number; total: number; avgRPE: string };
}

interface KeyExercise {
  name: string;
  role: string;
  roleColor: string;
  roleBg: string;
  detail: string;
  trend: TrendDir;
  trendNote: string;
}

// ── Mock Data ─────────────────────────────────────────────────────────────────
const BLOCK_WEEK_START = 1;
const BLOCK_WEEK_END   = 4;
const BLOCK_NAME       = 'Intro Phase — Base Strength';
const BLOCK_NUM        = 1;
const BLOCK_TOTAL      = 7;

const SESSIONS = [
  { label: 'ME Upper', type: 'me_upper' as const },
  { label: 'ME Lower', type: 'me_lower' as const },
  { label: 'DE Upper', type: 'de_upper' as const },
  { label: 'DE Lower', type: 'de_lower' as const },
];

const BLOCK_WEEKS: BlockWeek[] = [
  { weekNum: 1, sessions: SESSIONS, completedStats: { sessions: 4, total: 4, avgRPE: '6.8' } },
  { weekNum: 2, sessions: SESSIONS },
  { weekNum: 3, sessions: SESSIONS },
  { weekNum: 4, sessions: SESSIONS },
];

const DAY_SESSION_INDEX: Record<string, number> = {
  Monday: 0, Wednesday: 1, Friday: 2, Saturday: 3,
};

const SESSION_COLORS: Record<string, { text: string; bg: string }> = {
  me_upper: { text: COLORS.sessions.me_upper.text, bg: COLORS.sessions.me_upper.bg },
  me_lower: { text: COLORS.sessions.me_lower.text, bg: COLORS.sessions.me_lower.bg },
  de_upper: { text: COLORS.sessions.de_upper.text, bg: COLORS.sessions.de_upper.bg },
  de_lower: { text: COLORS.sessions.de_lower.text, bg: COLORS.sessions.de_lower.bg },
};

const KEY_EXERCISES: KeyExercise[] = [
  {
    name: 'Floor Press',
    role: 'ME Upper',
    roleColor: COLORS.sessions.me_upper.text,
    roleBg: COLORS.sessions.me_upper.bg,
    detail: 'Max effort rotation — work to 1RM weekly',
    trend: 'up',
    trendNote: '+12 lbs from baseline',
  },
  {
    name: 'SSB Squat',
    role: 'ME Lower',
    roleColor: COLORS.sessions.me_lower.text,
    roleBg: COLORS.sessions.me_lower.bg,
    detail: 'Max effort rotation — work to 1RM weekly',
    trend: 'up',
    trendNote: '+20 lbs from baseline',
  },
  {
    name: 'Speed Bench',
    role: 'DE Upper',
    roleColor: COLORS.sessions.de_upper.text,
    roleBg: COLORS.sessions.de_upper.bg,
    detail: '9×3 @ 50% + bands — focus on bar speed',
    trend: 'stable',
    trendNote: 'Consistent velocity',
  },
  {
    name: 'Speed Squat',
    role: 'DE Lower',
    roleColor: COLORS.sessions.de_lower.text,
    roleBg: COLORS.sessions.de_lower.bg,
    detail: '10×2 @ 55% + chains — explosive hip drive',
    trend: 'up',
    trendNote: 'Speed improving',
  },
];

const RISK_ITEMS = [
  'Shoulder mobility on overhead pressing',
  'Lower back fatigue from deadlift volume',
  'Sleep and recovery consistency',
];

// ── Helper ─────────────────────────────────────────────────────────────────────
function getWeekStatus(blockWeekNum: number, currentBlockWeek: number): WeekStatus {
  if (blockWeekNum < currentBlockWeek) return 'completed';
  if (blockWeekNum === currentBlockWeek) return 'current';
  return 'upcoming';
}

// ── WeekRow ────────────────────────────────────────────────────────────────────
function WeekRow({ week, status, todayIndex, isLast }: {
  week: BlockWeek; status: WeekStatus; todayIndex: number; isLast: boolean;
}) {
  return (
    <View style={[wr.row, !isLast && wr.rowHasLine]}>
      {/* Left column — circle + vertical line */}
      <View style={wr.leftCol}>
        <View style={[
          wr.circle,
          status === 'completed' && wr.circleCompleted,
          status === 'current'   && wr.circleCurrent,
          status === 'upcoming'  && wr.circleUpcoming,
        ]}>
          {status === 'completed'
            ? <MaterialCommunityIcons name="check" size={13} color="#FFF" />
            : <Text style={[wr.circleNum, status === 'upcoming' && { color: COLORS.text.muted }]}>
                {week.weekNum}
              </Text>
          }
        </View>
        {!isLast && <View style={[wr.connLine, status === 'completed' && wr.connLineDone]} />}
      </View>

      {/* Right column — content */}
      <View style={wr.rightCol}>
        {/* Week label + status badge */}
        <View style={wr.weekTop}>
          <Text style={[wr.weekLabel, status === 'upcoming' && { color: COLORS.text.muted }]}>
            WEEK {week.weekNum}
          </Text>
          {status === 'current' && (
            <View style={wr.currBadge}>
              <View style={wr.currDot} />
              <Text style={wr.currBadgeText}>CURRENT</Text>
            </View>
          )}
          {status === 'completed' && (
            <Text style={wr.doneLabel}>Done</Text>
          )}
        </View>

        {/* Session pills */}
        <View style={wr.pillsRow}>
          {week.sessions.map((s, i) => {
            const isToday  = status === 'current' && i === todayIndex;
            const sc       = SESSION_COLORS[s.type];
            return (
              <View key={i} style={[
                wr.pill,
                { backgroundColor: sc.bg, borderColor: isToday ? sc.text : sc.text + '40' },
                status === 'upcoming' && wr.pillMuted,
                isToday && wr.pillToday,
              ]}>
                {isToday && <View style={[wr.pillDot, { backgroundColor: sc.text }]} />}
                <Text style={[wr.pillText, { color: sc.text }, status === 'upcoming' && { opacity: 0.5 }]}>
                  {s.label}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Completed summary */}
        {status === 'completed' && week.completedStats && (
          <View style={wr.statsRow}>
            <MaterialCommunityIcons name="check-circle-outline" size={12} color={TEAL} />
            <Text style={wr.statsText}>
              {week.completedStats.sessions}/{week.completedStats.total} sessions · Avg RPE {week.completedStats.avgRPE}
            </Text>
          </View>
        )}

        {status === 'upcoming' && (
          <Text style={wr.upcomingNote}>Not started</Text>
        )}
      </View>
    </View>
  );
}
const wr = StyleSheet.create({
  row:           { flexDirection: 'row', marginBottom: 0 },
  rowHasLine:    {},
  leftCol:       { width: 38, alignItems: 'center' },
  circle:        { width: 30, height: 30, borderRadius: 15, borderWidth: 2, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  circleCompleted: { backgroundColor: SUCCESS, borderColor: SUCCESS },
  circleCurrent:   { backgroundColor: COLORS.accent + '22', borderColor: COLORS.accent },
  circleUpcoming:  { backgroundColor: COLORS.surfaceHighlight, borderColor: COLORS.border },
  circleNum:     { fontSize: 12, fontWeight: FONTS.weights.heavy, color: COLORS.accent },
  connLine:      { width: 2, flex: 1, minHeight: 20, backgroundColor: COLORS.border + '70', marginTop: 2 },
  connLineDone:  { backgroundColor: SUCCESS + '60' },
  rightCol:      { flex: 1, paddingLeft: SPACING.sm, paddingBottom: SPACING.lg },
  weekTop:       { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  weekLabel:     { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, letterSpacing: 1.2 },
  currBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.accent + '22', paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.full },
  currDot:       { width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.accent },
  currBadgeText: { fontSize: 9, color: COLORS.accent, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5 },
  doneLabel:     { fontSize: 10, color: TEAL, fontWeight: FONTS.weights.semibold },
  pillsRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 6 },
  pill:          { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.md, borderWidth: 1 },
  pillMuted:     { opacity: 0.4 },
  pillToday:     { borderWidth: 1.5 },
  pillDot:       { width: 5, height: 5, borderRadius: 2.5 },
  pillText:      { fontSize: 10, fontWeight: FONTS.weights.heavy },
  statsRow:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statsText:     { fontSize: FONTS.sizes.xs, color: TEAL, fontWeight: FONTS.weights.semibold },
  upcomingNote:  { fontSize: 10, color: COLORS.text.muted, fontStyle: 'italic' },
});

// ── KeyExerciseRow ─────────────────────────────────────────────────────────────
function KeyExerciseRow({ ex, isLast }: { ex: KeyExercise; isLast: boolean }) {
  const trend = {
    up:     { icon: 'trending-up',      color: TEAL   },
    down:   { icon: 'trending-down',    color: '#EF5350' },
    stable: { icon: 'trending-neutral', color: BLUE   },
  }[ex.trend];

  return (
    <View style={[kx.row, !isLast && kx.rowBorder]}>
      <View style={kx.info}>
        <Text style={kx.name}>{ex.name}</Text>
        <Text style={kx.detail}>{ex.detail}</Text>
        <View style={[kx.roleBadge, { backgroundColor: ex.roleBg }]}>
          <Text style={[kx.roleText, { color: ex.roleColor }]}>{ex.role}</Text>
        </View>
      </View>
      <View style={kx.trendCol}>
        <MaterialCommunityIcons name={trend.icon as any} size={22} color={trend.color} />
        <Text style={[kx.trendNote, { color: trend.color }]}>{ex.trendNote}</Text>
      </View>
    </View>
  );
}
const kx = StyleSheet.create({
  row:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: SPACING.md, gap: SPACING.sm },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  info:      { flex: 1 },
  name:      { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: 3 },
  detail:    { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, lineHeight: 15, marginBottom: 6 },
  roleBadge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: RADIUS.full },
  roleText:  { fontSize: 9, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5 },
  trendCol:  { alignItems: 'flex-end', gap: 3, paddingTop: 2, minWidth: 80 },
  trendNote: { fontSize: 9, fontWeight: FONTS.weights.semibold, textAlign: 'right', lineHeight: 13 },
});

// ── Animated Section wrapper ───────────────────────────────────────────────────
function AnimSection({ anim, children, style }: {
  anim: { opacity: Animated.Value; y: Animated.Value };
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <Animated.View style={[style, { opacity: anim.opacity, transform: [{ translateY: anim.y }] }]}>
      {children}
    </Animated.View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────
const NUM_SECTIONS = 6;

export default function CurrentBlockScreen() {
  const router = useRouter();
  const [currentWeek, setCurrentWeek] = useState(2); // default week 2 for richer demo
  const [loading, setLoading]         = useState(true);

  // Animations — one per section
  const anims = useRef(
    Array.from({ length: NUM_SECTIONS }, () => ({
      opacity: new Animated.Value(0),
      y:       new Animated.Value(20),
    }))
  ).current;

  useFocusEffect(useCallback(() => {
    // Reset
    anims.forEach(a => { a.opacity.setValue(0); a.y.setValue(20); });

    (async () => {
      const prof = await getProfile();
      const w    = prof?.currentWeek ?? 2;
      setCurrentWeek(w);
      setLoading(false);

      // Stagger sections in
      Animated.stagger(
        90,
        anims.map(a =>
          Animated.parallel([
            Animated.timing(a.opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(a.y,       { toValue: 0, duration: 350, useNativeDriver: true }),
          ])
        )
      ).start();
    })();
  }, []));

  if (loading) {
    return <View style={s.loading}><ActivityIndicator color={COLORS.accent} size="large" /></View>;
  }

  // Derived
  const currentBlockWeek = Math.max(1, currentWeek - BLOCK_WEEK_START + 1);
  const totalWeeks       = BLOCK_WEEK_END - BLOCK_WEEK_START + 1;
  const progressPct      = Math.min(100, Math.round((currentBlockWeek / totalWeeks) * 100));
  const todayName        = getTodayDayName();
  const todayIndex       = DAY_SESSION_INDEX[todayName] ?? -1;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ── SECTION 0: Header ── */}
        <AnimSection anim={anims[0]}>
          {/* Back button row */}
          <View style={s.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.75}>
              <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.text.secondary} />
            </TouchableOpacity>
            <Text style={s.headerLabel}>CURRENT BLOCK</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Block title */}
          <View style={s.titleArea}>
            <Text style={s.blockTitle}>{BLOCK_NAME}</Text>

            {/* Meta chips */}
            <View style={s.chipsRow}>
              <View style={s.chip}>
                <Text style={s.chipText}>Block {BLOCK_NUM} of {BLOCK_TOTAL}</Text>
              </View>
              <View style={s.chip}>
                <Text style={s.chipText}>Weeks {BLOCK_WEEK_START}–{BLOCK_WEEK_END}</Text>
              </View>
              <View style={[s.chip, s.chipActive]}>
                <View style={s.chipActiveDot} />
                <Text style={[s.chipText, s.chipActiveText]}>Week {currentBlockWeek} Active</Text>
              </View>
            </View>

            {/* Block progress bar */}
            <View style={s.progressLabelRow}>
              <Text style={s.progressLabel}>Block progress</Text>
              <Text style={s.progressPct}>{progressPct}%</Text>
            </View>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${progressPct}%` as any }]} />
            </View>
          </View>
        </AnimSection>

        {/* ── SECTION 1: Block Goal Card ── */}
        <AnimSection anim={anims[1]} style={s.card}>
          <View style={s.cardHeaderRow}>
            <View style={s.cardIconWrap}>
              <MaterialCommunityIcons name="target" size={18} color={COLORS.accent} />
            </View>
            <Text style={s.cardTitle}>Block Goal</Text>
          </View>
          <Text style={s.cardBody}>
            Build a foundation of movement quality, work capacity, and general strength. Establish baseline loading for all primary movements.
          </Text>
          <View style={s.adaptRow}>
            <Text style={s.adaptLabel}>EXPECTED ADAPTATION</Text>
            <Text style={s.adaptBody}>
              Motor pattern refinement, strength endurance, connective tissue preparation
            </Text>
          </View>
        </AnimSection>

        {/* ── SECTION 2: Weekly Structure ── */}
        <AnimSection anim={anims[2]}>
          <View style={s.sectionHeaderRow}>
            <MaterialCommunityIcons name="calendar-week" size={16} color={COLORS.text.muted} />
            <Text style={s.sectionTitle}>Weekly Structure</Text>
          </View>

          <View style={s.card}>
            {BLOCK_WEEKS.map((week, i) => {
              const status = getWeekStatus(week.weekNum, currentBlockWeek);
              return (
                <WeekRow
                  key={week.weekNum}
                  week={week}
                  status={status}
                  todayIndex={todayIndex}
                  isLast={i === BLOCK_WEEKS.length - 1}
                />
              );
            })}
          </View>
        </AnimSection>

        {/* ── SECTION 3: Key Exercises ── */}
        <AnimSection anim={anims[3]}>
          <View style={s.sectionHeaderRow}>
            <MaterialCommunityIcons name="dumbbell" size={16} color={COLORS.text.muted} />
            <Text style={s.sectionTitle}>Key Exercises This Block</Text>
          </View>

          <View style={s.card}>
            {KEY_EXERCISES.map((ex, i) => (
              <KeyExerciseRow
                key={ex.name}
                ex={ex}
                isLast={i === KEY_EXERCISES.length - 1}
              />
            ))}
          </View>
        </AnimSection>

        {/* ── SECTION 4: Progression Logic ── */}
        <AnimSection anim={anims[4]} style={s.card}>
          <View style={s.cardHeaderRow}>
            <View style={[s.cardIconWrap, { backgroundColor: BLUE + '22' }]}>
              <MaterialCommunityIcons name="chart-timeline-variant" size={18} color={BLUE} />
            </View>
            <Text style={s.cardTitle}>How This Block Progresses</Text>
          </View>
          <Text style={s.cardBody}>
            Max effort variations rotate weekly to prevent accommodation. Dynamic effort loads increase 5% each week with accommodating resistance (bands or chains). Accessory volume holds steady while your general work capacity and connective tissue strength build through consistent exposure.
          </Text>
        </AnimSection>

        {/* ── SECTION 5: Risk Areas ── */}
        <AnimSection anim={anims[5]} style={s.card}>
          <View style={s.cardHeaderRow}>
            <View style={[s.cardIconWrap, { backgroundColor: AMBER + '22' }]}>
              <MaterialCommunityIcons name="eye-outline" size={18} color={AMBER} />
            </View>
            <Text style={s.cardTitle}>What I'm Watching</Text>
          </View>

          {RISK_ITEMS.map((item, i) => (
            <View key={i} style={[s.riskRow, i < RISK_ITEMS.length - 1 && s.riskRowBorder]}>
              <View style={s.riskDot} />
              <Text style={s.riskText}>{item}</Text>
            </View>
          ))}
        </AnimSection>

        {/* ── CTA SECTION ── */}
        <View style={s.ctaSection}>
          <TouchableOpacity
            style={s.ctaBtn}
            onPress={() => router.push('/(tabs)/today')}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="play-circle" size={20} color={COLORS.primary} />
            <Text style={s.ctaBtnText}>Start Today's Session</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.roadmapLink}
            onPress={() => router.push('/roadmap')}
            activeOpacity={0.7}
          >
            <Text style={s.roadmapLinkText}>View Full Roadmap</Text>
            <MaterialCommunityIcons name="arrow-right" size={14} color={COLORS.accent} />
          </TouchableOpacity>
        </View>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: COLORS.background },
  loading:      { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  scroll:       { flex: 1 },
  scrollContent:{ paddingBottom: SPACING.xl },

  // Header
  headerRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl, marginBottom: SPACING.md },
  backBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center' },
  headerLabel:  { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.accent, letterSpacing: 2 },

  // Title area
  titleArea:    { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },
  blockTitle:   { fontSize: 24, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 31, marginBottom: SPACING.md },

  // Chips
  chipsRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  chip:            { paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  chipActive:      { backgroundColor: COLORS.accent + '20', borderColor: COLORS.accent },
  chipActiveDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accent, marginRight: 4 },
  chipText:        { fontSize: FONTS.sizes.xs, color: COLORS.text.secondary, fontWeight: FONTS.weights.semibold },
  chipActiveText:  { color: COLORS.accent },

  // Progress bar
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel:    { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  progressPct:      { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.accent },
  progressTrack:    { height: 5, backgroundColor: COLORS.surfaceHighlight, borderRadius: 2.5, overflow: 'hidden' },
  progressFill:     { height: 5, backgroundColor: COLORS.accent, borderRadius: 2.5 },

  // Card (generic dark card)
  card: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  // Card header row
  cardHeaderRow:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  cardIconWrap:   { width: 34, height: 34, borderRadius: RADIUS.md, backgroundColor: COLORS.accent + '22', justifyContent: 'center', alignItems: 'center' },
  cardTitle:      { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  cardBody:       { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 21 },

  // Adaptation row inside goal card
  adaptRow:   { marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  adaptLabel: { fontSize: 9, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.5, marginBottom: SPACING.sm },
  adaptBody:  { fontSize: FONTS.sizes.sm, color: TEAL, lineHeight: 19, fontStyle: 'italic' },

  // Section header
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm, marginTop: SPACING.sm },
  sectionTitle:     { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, color: COLORS.text.secondary, letterSpacing: 0.5 },

  // Risk rows
  riskRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, paddingVertical: SPACING.sm },
  riskRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  riskDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: AMBER, marginTop: 5, flexShrink: 0 },
  riskText:      { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 20 },

  // CTA section
  ctaSection:    { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  ctaBtn:        {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.accent, borderRadius: RADIUS.lg,
    paddingVertical: 15, gap: SPACING.sm, marginBottom: SPACING.md,
    shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  ctaBtnText:    { color: COLORS.primary, fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5 },
  roadmapLink:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: SPACING.sm },
  roadmapLinkText:{ fontSize: FONTS.sizes.sm, color: COLORS.accent, fontWeight: FONTS.weights.semibold },
});
