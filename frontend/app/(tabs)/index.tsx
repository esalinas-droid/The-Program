import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS, getSessionStyle } from '../../src/constants/theme';
import { getProfile } from '../../src/utils/storage';
import { logApi, prApi } from '../../src/utils/api';
import { getTodaySession, getTodayDayName } from '../../src/data/programData';
import { getBlock, getBlockName, getPhase, isDeloadWeek } from '../../src/utils/calculations';
import { AthleteProfile, ProgramSession, WeekStats } from '../../src/types';

// ── Greeting & date helpers ───────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getFormattedDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

// ── Block week ranges ─────────────────────────────────────────────────────────
function getBlockWeekRange(block: number): { start: number; end: number } {
  const ranges: Record<number, { start: number; end: number }> = {
    1: { start: 1,  end: 4  },
    2: { start: 5,  end: 8  },
    3: { start: 9,  end: 12 },
    4: { start: 13, end: 20 },
    5: { start: 21, end: 32 },
    6: { start: 33, end: 44 },
    7: { start: 45, end: 52 },
  };
  return ranges[block] || { start: 1, end: 4 };
}

// ── Coaching directive (contextual, coach-voice) ──────────────────────────────
function getCoachingDirective(week: number, block: number, phase: string): string {
  if (phase === 'Deload') {
    return `Week ${week} is a mandatory deload. Adaptation happens here — not in the gym. Drop loads to 40–50%, move through full range, and prioritise sleep and food. Every deload you take seriously is a PR you will hit next block.`;
  }

  const directives: Record<number, Record<string, string>> = {
    1: {
      Intro: `Block 1, Week ${week}. This is the reset — and that is not a bad thing. Strip back the complexity. Movement quality is the only metric that matters right now. Stay under RPE 8, re-groove every pattern, and build the foundation everything else will stand on.`,
      Build: `Week ${week} — the foundation is holding. Now we load it deliberately. Push your main sets toward RPE 8. If form breaks before you get there, that is your ceiling for today — and that is okay. Every rep should look like teaching film.`,
      Peak:  `Final loading week of Block 1. Week ${week} — put baseline numbers on the board. These sets define the trajectory for the rest of the programme. Lift with intention, not desperation. Collect clean data and move on.`,
    },
    2: {
      Intro: `Block 2, Week ${week}. Symptom-aware strength begins. Your injury flags are part of the conversation every session — not an excuse to go easy, but a filter for smart loading. Pain above 3/10 means you modify, not push through. Strength built around limitation beats strength lost to it.`,
      Build: `Week ${week} — you are building real load now. Drive your top sets hard but keep your pain log honest. Accessory work is not optional. The athletes who dominate competition built their margin in the work nobody watched.`,
      Peak:  `Block 2 peak. Week ${week} — your prep justifies aggression. Approach the bar expecting new training maxes. The data over the past weeks says you are ready.`,
    },
    3: {
      Intro: `Block 3, Week ${week}. We are intensifying. Event confidence gets built one session at a time. Every movement should look like you own it. If it does not look strong, slow down and make it look strong. Intensity without technique is just damage.`,
      Build: `Week ${week} — you are entering competition-level territory on the main lifts. RPE 8–9 is the target. Keep accessories disciplined. You are not accumulating fatigue, you are building a platform to perform from.`,
      Peak:  `Block 3 peak. Week ${week} — trust the preparation and go get it. Lift like you have already decided how it ends.`,
    },
    4: {
      Intro: `Block 4, Week ${week}. Volume-Strength — the workload climbs from here. Manage your recovery like a professional: eat around your sessions, sleep more than feels necessary, and keep pain scores low. Volume is the investment. Strength is the return.`,
      Build: `Week ${week} — both volume and intensity are elevated. This is the hardest block on paper. Do not skip accessories. Do not shortcut warm-ups. Everything that feels optional right now is compulsory.`,
      Peak:  `Volume-Strength peak. Week ${week} — push through it. The sessions that feel hardest are the ones that pay off the most. Earn the deload.`,
    },
    5: {
      Intro: `Block 5, Week ${week}. Everything narrows to the main lifts now. Volume drops, intensity climbs. Treat every set on a primary movement as a statement of intent. This is Strength Emphasis — live up to the name.`,
      Build: `Week ${week} — load the bar, trust the technique, and produce maximal force. Movement patterns should be automatic by now. The only variable left is your willingness to commit.`,
      Peak:  `Strength peak. Week ${week} — leave nothing on the platform. You have done the work. Now show it.`,
    },
    6: {
      Intro: `Block 6, Week ${week}. Event and Peak Prep — everything narrows to specificity. Train the events you will compete in. Protect recovery like it is your most valuable asset, because it is. Sharpness over fatigue.`,
      Build: `Week ${week} — event-specific loading. Top sets should feel powerful and controlled, not grinding. Walk out of every session feeling fast, not destroyed. Competition sharpness is the target.`,
      Peak:  `Final peak. Week ${week} — taper into competition sharp. Trust the volume you have banked over 40+ weeks. You have already done the hard part.`,
    },
    7: {
      Intro: `Block 7, Week ${week}. Flexible Pivot — assess honestly before you load. Where are you right now, physically and mentally? Train to your current capacity with a clear-eyed view of where the gaps are.`,
      Build: `Week ${week} — maintain your gains and address your weaknesses. This block is yours to shape. Execute with the same intention you brought to every other week.`,
      Peak:  `Week ${week} — finish the cycle strong. Take stock of what you have built and lift with pride in the work you have put in.`,
    },
  };

  return (
    directives[block]?.[phase] ??
    `Week ${week}, Block ${block} — ${phase} phase. Stay focused. Trust the programme and execute every session with full intent.`
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [todaySession, setTodaySession] = useState<ProgramSession | null>(null);
  const [weekStats, setWeekStats] = useState<WeekStats | null>(null);
  const [bests, setBests] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const prof = await getProfile();
    if (!prof) { setLoading(false); return; }
    setProfile(prof);
    const week = prof.currentWeek || 1;
    setTodaySession(getTodaySession(week));
    try {
      const [stats, bestsData] = await Promise.all([
        logApi.weekStats(week),
        prApi.getBests(),
      ]);
      setWeekStats(stats);
      setBests(bestsData);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  if (loading) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={s.loading}>
        <Text style={s.noData}>No profile found</Text>
        <TouchableOpacity onPress={() => router.replace('/onboarding')} style={s.primaryBtn}>
          <Text style={s.primaryBtnText}>Set Up Profile</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const week          = profile.currentWeek || 1;
  const block         = getBlock(week);
  const blockName     = getBlockName(block);
  const phase         = getPhase(week);
  const deload        = isDeloadWeek(week);
  const todayName     = getTodayDayName();
  const isRestDay     = todaySession?.sessionType === 'Off';
  const units         = profile.units || 'lbs';
  const { start: blockStart, end: blockEnd } = getBlockWeekRange(block);
  const blockProgress = Math.min((week - blockStart) / (blockEnd - blockStart + 1), 1);
  const coachingNote  = getCoachingDirective(week, block, phase);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        testID="dashboard-scroll"
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
        showsVerticalScrollIndicator={false}
      >

        {/* ── HEADER ── */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.greeting}>{getGreeting()}, {profile.name}</Text>
            <Text style={s.date}>{getFormattedDate()}</Text>
          </View>
          <TouchableOpacity testID="settings-btn" onPress={() => router.push('/settings')} style={s.settingsBtn}>
            <MaterialCommunityIcons name="cog-outline" size={26} color={COLORS.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* ── COACH'S DIRECTIVE (gold border card) ── */}
        <View style={s.coachCard}>
          <View style={s.coachCardHeader}>
            <View style={s.coachIconBadge}>
              <MaterialCommunityIcons name="brain" size={14} color={COLORS.accent} />
            </View>
            <Text style={s.coachCardLabel}>COACH'S DIRECTIVE — WEEK {week}</Text>
            {deload && (
              <View testID="deload-badge" style={s.deloadPill}>
                <Text style={s.deloadPillText}>DELOAD</Text>
              </View>
            )}
          </View>
          <Text style={s.coachCardText}>{coachingNote}</Text>
          <View style={s.coachCardFooter}>
            <MaterialCommunityIcons name="circle-small" size={16} color={COLORS.accent} />
            <Text style={s.coachCardTag}>Block {block} of 7</Text>
            <MaterialCommunityIcons name="circle-small" size={16} color={COLORS.text.muted} />
            <Text style={s.coachCardTag}>{phase} Phase</Text>
          </View>
        </View>

        {/* ── TODAY'S SESSION CTA ── */}
        {!isRestDay && todaySession ? (
          <View style={s.sessionCtaCard}>
            <View style={s.sessionCtaTop}>
              {(() => {
                const sc = getSessionStyle(todaySession.sessionType);
                return (
                  <View style={[s.sessionTypeBadge, { backgroundColor: sc.bg, borderColor: sc.borderColor }]}>
                    <Text style={[s.sessionTypeBadgeText, { color: sc.text }]}>{todaySession.sessionType}</Text>
                  </View>
                );
              })()}
              <Text style={s.sessionCtaDayLabel}>{todayName}</Text>
            </View>
            <Text style={s.sessionCtaLift}>{todaySession.mainLift}</Text>
            <Text style={s.sessionCtaScheme}>{todaySession.topSetScheme}</Text>
            <TouchableOpacity
              testID="today-session-card"
              style={s.startBtn}
              onPress={() => router.push('/(tabs)/today')}
              activeOpacity={0.85}
            >
              <Text style={s.startBtnText}>START TODAY'S SESSION</Text>
              <MaterialCommunityIcons name="arrow-right" size={18} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        ) : (
          <View testID="today-session-card" style={s.restDayCard}>
            <View style={s.restDayIcon}>
              <MaterialCommunityIcons name="weather-sunny" size={26} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.restDayTitle}>Recovery Day</Text>
              <Text style={s.restDayText}>
                The work you put in this week is consolidating right now. Eat well, sleep more, and come back ready.
              </Text>
            </View>
          </View>
        )}

        {/* ── WEEK STATS ── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>THIS WEEK</Text>
          <Text style={s.sectionSub}>Week {week} data</Text>
        </View>
        <View style={s.statsRow}>
          <StatPill
            label="PAIN"
            value={weekStats?.avgPain?.toFixed(1) ?? '—'}
            color={weekStats && weekStats.avgPain >= 3 ? COLORS.status.error : COLORS.status.success}
            icon="alert-circle-outline"
            testID="stat-pain"
          />
          <StatPill
            label="AVG RPE"
            value={weekStats?.avgRPE?.toFixed(1) ?? '—'}
            color={COLORS.accent}
            icon="speedometer"
            testID="stat-rpe"
          />
          <StatPill
            label="DONE"
            value={weekStats ? `${weekStats.completionRate}%` : '—'}
            color={COLORS.status.success}
            icon="check-circle-outline"
            testID="stat-completion"
          />
          <StatPill
            label="BW"
            value={profile.currentBodyweight ? `${profile.currentBodyweight}` : '—'}
            sublabel={units}
            color={COLORS.text.primary}
            icon="scale-bathroom"
            testID="stat-bw"
          />
        </View>

        {/* ── CURRENT BLOCK CARD ── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>CURRENT BLOCK</Text>
        </View>
        <View style={s.blockCard}>
          <View style={s.blockCardTop}>
            <View style={{ flex: 1, marginRight: SPACING.md }}>
              <Text style={s.blockNum}>
                BLOCK {block} <Text style={s.blockNumOf}>of 7</Text>
              </Text>
              <Text style={s.blockName}>{blockName}</Text>
            </View>
            <View style={[s.phasePill, deload && s.phasePillDeload]}>
              <Text style={[s.phasePillText, deload && s.phasePillTextDeload]}>
                {phase.toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${Math.round(blockProgress * 100)}%` as any }]} />
          </View>
          <Text style={s.progressLabel}>Week {week} · Programme weeks {blockStart}–{blockEnd}</Text>
        </View>

        {/* ── BEST E1RMs ── */}
        {bests && (
          <>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>BEST E1RMs</Text>
              <Text style={s.sectionSub}>From training logs</Text>
            </View>
            <View style={s.e1rmRow}>
              <E1RMCard label="SQUAT" data={bests.squat} units={units} />
              <E1RMCard label="PRESS" data={bests.press} units={units} />
              <E1RMCard label="PULL"  data={bests.pull}  units={units} />
            </View>
          </>
        )}

        {/* ── QUICK ACTIONS ── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>QUICK ACTIONS</Text>
        </View>
        <View style={s.actionsGrid}>
          <QuickAction
            icon="pencil-outline"
            label="Log Session"
            onPress={() => router.push('/(tabs)/log')}
          />
          <QuickAction
            icon="brain"
            label="Pocket Coach"
            onPress={() => router.push('/tools/coach')}
            accent
          />
          <QuickAction
            icon="clipboard-check-outline"
            label="Weekly Check-In"
            onPress={() => router.push('/tools/checkin')}
          />
          <QuickAction
            icon="history"
            label="Changes"
            onPress={() => router.push('/(tabs)/changes')}
          />
        </View>

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>

      {/* ── Upload FAB ── */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => router.push('/upload')}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="plus" size={28} color={COLORS.primary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatPill({ label, value, sublabel, color, icon, testID }: {
  label: string; value: string; sublabel?: string;
  color: string; icon: string; testID?: string;
}) {
  return (
    <View testID={testID} style={s.statPill}>
      <MaterialCommunityIcons name={icon as any} size={18} color={color} style={{ marginBottom: 4 }} />
      <Text style={[s.statPillValue, { color }]}>{value}</Text>
      {sublabel ? <Text style={s.statPillSublabel}>{sublabel}</Text> : null}
      <Text style={s.statPillLabel}>{label}</Text>
    </View>
  );
}

function E1RMCard({ label, data, units }: { label: string; data: any; units: string }) {
  return (
    <View style={s.e1rmCard}>
      <Text style={s.e1rmLabel}>{label}</Text>
      <Text style={s.e1rmValue}>{data?.e1rm ? `${data.e1rm}` : '—'}</Text>
      {data?.e1rm ? <Text style={s.e1rmUnit}>{units}</Text> : null}
      <Text style={s.e1rmExercise} numberOfLines={2}>{data?.exercise ?? 'No data yet'}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress, accent }: {
  icon: string; label: string; onPress: () => void; accent?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.quickAction, accent && s.quickActionAccent]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <MaterialCommunityIcons
        name={icon as any}
        size={26}
        color={accent ? COLORS.primary : COLORS.accent}
      />
      <Text style={[s.quickActionLabel, accent && s.quickActionLabelAccent]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Base
  safe:            { flex: 1, backgroundColor: COLORS.background },
  scroll:          { flex: 1 },
  scrollContent:   { paddingBottom: SPACING.xxl },
  loading:         { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  noData:          { color: COLORS.text.secondary, marginBottom: SPACING.lg, fontSize: FONTS.sizes.base },
  primaryBtn:      { backgroundColor: COLORS.accent, paddingVertical: 12, paddingHorizontal: SPACING.xl, borderRadius: RADIUS.md },
  primaryBtnText:  { color: COLORS.primary, fontWeight: FONTS.weights.bold },

  // Header
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl, paddingBottom: SPACING.md },
  greeting:     { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 30 },
  date:         { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, marginTop: 3 },
  settingsBtn:  { padding: 4, marginTop: 2 },

  // Coach card — gold border
  coachCard:       { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1.5, borderColor: COLORS.accent },
  coachCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md, gap: SPACING.sm, flexWrap: 'wrap' },
  coachIconBadge:  { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.surfaceHighlight, justifyContent: 'center', alignItems: 'center' },
  coachCardLabel:  { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.accent, letterSpacing: 1.5, flex: 1 },
  deloadPill:      { backgroundColor: COLORS.surfaceHighlight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border },
  deloadPillText:  { fontSize: 9, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy, letterSpacing: 1 },
  coachCardText:   { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 22, marginBottom: SPACING.md },
  coachCardFooter: { flexDirection: 'row', alignItems: 'center' },
  coachCardTag:    { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },

  // Session CTA card
  sessionCtaCard:      { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  sessionCtaTop:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  sessionTypeBadge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, borderWidth: 1 },
  sessionTypeBadgeText:{ fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5 },
  sessionCtaDayLabel:  { color: COLORS.text.muted, fontSize: FONTS.sizes.sm },
  sessionCtaLift:      { fontSize: FONTS.sizes.xxxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 38, marginBottom: 4 },
  sessionCtaScheme:    { fontSize: FONTS.sizes.base, color: COLORS.text.secondary, marginBottom: SPACING.lg, lineHeight: 22 },
  startBtn:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accent, borderRadius: RADIUS.lg, paddingVertical: 15, gap: SPACING.sm },
  startBtnText:        { color: COLORS.primary, fontWeight: FONTS.weights.heavy, fontSize: FONTS.sizes.base, letterSpacing: 1 },

  // Rest day
  restDayCard:  { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  restDayIcon:  { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.surfaceHighlight, justifyContent: 'center', alignItems: 'center' },
  restDayTitle: { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: 4 },
  restDayText:  { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 20 },

  // Section labels
  sectionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, marginTop: SPACING.md, marginBottom: SPACING.sm },
  sectionTitle: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2 },
  sectionSub:   { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },

  // Stats pills
  statsRow:         { flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.sm },
  statPill:         { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  statPillValue:    { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, lineHeight: 22 },
  statPillSublabel: { fontSize: 9, color: COLORS.text.muted, lineHeight: 12 },
  statPillLabel:    { fontSize: 9, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy, letterSpacing: 1, marginTop: 2 },

  // Block card
  blockCard:          { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  blockCardTop:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.md },
  blockNum:           { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.accent, letterSpacing: 1.5, marginBottom: 4 },
  blockNumOf:         { color: COLORS.text.muted, fontWeight: FONTS.weights.regular },
  blockName:          { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.primary, lineHeight: 22 },
  phasePill:          { backgroundColor: COLORS.accent, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full },
  phasePillDeload:    { backgroundColor: COLORS.surfaceHighlight, borderWidth: 1, borderColor: COLORS.border },
  phasePillText:      { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.primary, letterSpacing: 1 },
  phasePillTextDeload:{ color: COLORS.text.muted },
  progressTrack:      { height: 6, backgroundColor: COLORS.surfaceHighlight, borderRadius: 3, marginBottom: SPACING.sm, overflow: 'hidden' },
  progressFill:       { height: 6, backgroundColor: COLORS.accent, borderRadius: 3 },
  progressLabel:      { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },

  // E1RM cards
  e1rmRow:      { flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.sm },
  e1rmCard:     { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  e1rmLabel:    { fontSize: 9, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy, letterSpacing: 1.5, marginBottom: 4 },
  e1rmValue:    { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.accent },
  e1rmUnit:     { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginBottom: 2 },
  e1rmExercise: { fontSize: 9, color: COLORS.text.muted, lineHeight: 13, marginTop: 2 },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    zIndex: 100,
  },

  // Quick actions 2x2 grid
  actionsGrid:           { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.lg, gap: SPACING.sm },
  quickAction:           { flex: 1, minWidth: '45%', backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, paddingVertical: SPACING.lg, paddingHorizontal: SPACING.md, alignItems: 'center', gap: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  quickActionAccent:     { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  quickActionLabel:      { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.text.secondary, textAlign: 'center' },
  quickActionLabelAccent:{ color: COLORS.primary },
});
