import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS, getSessionStyle } from '../../src/constants/theme';
import { getProfile } from '../../src/utils/storage';
import { getStoredUser } from '../../src/utils/auth';
import { toLocalDateString } from '../../src/utils/dateHelpers';
import { logApi, prApi, programApi, painReportApi, readinessApi, weeklyReviewApi, deloadApi, competitionApi, rotationApi, liftsApi } from '../../src/utils/api';
import { getTodaySession, getTodayDayName } from '../../src/data/programData';
import { getBlock, getBlockName, getPhase, isDeloadWeek } from '../../src/utils/calculations';
import { AthleteProfile, ProgramSession, WeekStats, TodaySessionResponse } from '../../src/types';

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
    return `Week ${week} is a mandatory recovery week. Adaptation happens here — not in the gym. Drop loads to 40–50%, move through full range, and prioritise sleep and food. Every recovery week you take seriously is a PR you will hit next block.`;
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
      Peak:  `Volume-Strength peak. Week ${week} — push through it. The sessions that feel hardest are the ones that pay off the most. Earn the recovery week.`,
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

// ── Shorten coaching directive to first 2 sentences ──────────────────────────
function getShortDirective(text: string): string {
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  return sentences.slice(0, 2).join('').trim();
}

// ── Alert data type ───────────────────────────────────────────────────────────
type AlertData = {
  type: string;
  color: string;
  icon: string;
  title: string;
  sub: string;
  actionRoute?: string;
};

// ── Main component ────────────────────────────────────────────────────────────
const TEAL_COLOR = '#4DCEA6';
export default function Dashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [authUserName, setAuthUserName] = useState<string>('');
  const [todaySession, setTodaySession] = useState<ProgramSession | null>(null);
  const [programSession, setProgramSession] = useState<TodaySessionResponse | null>(null);
  const [weekStats, setWeekStats] = useState<WeekStats | null>(null);
  const [bests, setBests]               = useState<any>(null);
  const [featuredLifts, setFeaturedLifts] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedCoach, setExpandedCoach] = useState(false);
  const [expandedAlerts, setExpandedAlerts] = useState(false);

  // ── Priority card state ──────────────────────────────────────────────────────
  const [flaggedRegions, setFlaggedRegions] = useState<string[]>([]);
  const [hasReadinessToday, setHasReadinessToday] = useState<boolean | null>(null);
  const [weeklyReview, setWeeklyReview] = useState<any | null>(null);
  const [deloadStatus, setDeloadStatus] = useState<any | null>(null);
  const [competitionStatus, setCompetitionStatus] = useState<any | null>(null);
  const [rotationStatus, setRotationStatus] = useState<any | null>(null);

  const loadData = useCallback(async () => {
    const prof = await getProfile();
    if (!prof) { setLoading(false); return; }
    setProfile(prof);
    // BUG 3C: Load auth user name as fallback for greeting
    const authUser = await getStoredUser();
    if (authUser?.name) setAuthUserName(authUser.name);
    const week = prof.currentWeek || 1;
    setTodaySession(getTodaySession(week));

    // Try loading AI-generated session from program API
    try {
      const apiSession = await programApi.getTodaySession();
      setProgramSession(apiSession);
    } catch { /* No AI plan yet — use local data */ }

    // Compute this week's Mon-Sun date range (local time, matches Schedule page)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon…6=Sat
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const weekStart = toLocalDateString(monday);
    const weekEnd   = toLocalDateString(sunday);

    try {
      const [stats, bestsData] = await Promise.all([
        logApi.weekStats(week, weekStart, weekEnd),
        prApi.getBests(),
      ]);
      setWeekStats(stats);
      setBests(bestsData);
    } catch {}

    // Fetch featured lifts (non-critical)
    try {
      const liftsData = await liftsApi.list();
      const featured = (liftsData.lifts || []).filter((l: any) => l.isFeatured);
      setFeaturedLifts(featured);
    } catch { /* Not critical — falls back to bests.squat/press/pull */ }

    // ── Fetch priority card data ─────────────────────────────────────────────
    try {
      const [painData, readinessData] = await Promise.all([
        painReportApi.getRecent(7),
        readinessApi.getToday(),
      ]);
      setFlaggedRegions((painData as any)?.flaggedRegions || []);
      setHasReadinessToday((readinessData as any)?.hasCheckedIn ?? false);
    } catch { /* Priority data not critical */ }

    // ── Fetch weekly review (Task 5) ────────────────────────────────────────
    try {
      const reviewData = await weeklyReviewApi.get();
      setWeeklyReview(reviewData);
    } catch { /* Weekly review not critical */ }

    // ── Fetch deload status (Task 7) ───────────────────────────────────────
    try {
      const deload = await deloadApi.check();
      setDeloadStatus(deload);
    } catch { /* Deload check not critical */ }

    // ── Fetch competition status (Task 9) ──────────────────────────────────
    try {
      const comp = await competitionApi.getStatus();
      setCompetitionStatus(comp);
    } catch { /* Competition check not critical */ }

    // ── Fetch rotation status (Task 10) ───────────────────────────────────
    try {
      const rot = await rotationApi.check();
      setRotationStatus(rot?.count > 0 ? rot : null);
    } catch { /* Rotation check not critical */ }

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
        <TouchableOpacity onPress={() => router.replace('/onboarding-intake')} style={s.primaryBtn}>
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

  // Use API session type as primary source of truth (matches Today & Log tabs)
  // Fall back to local programData.ts session if no API plan exists
  // Only override when BOTH apiSessionType and todaySession exist (null-safe)
  const apiSessionType = programSession?.session?.sessionType;
  const displaySession = (apiSessionType && todaySession)
    ? { ...todaySession, sessionType: apiSessionType }
    : todaySession;

  const isRestDay     = displaySession?.sessionType === 'Off';
  const units         = profile.units || 'lbs';
  const { start: blockStart, end: blockEnd } = getBlockWeekRange(block);
  const blockProgress = Math.min((week - blockStart) / (blockEnd - blockStart + 1), 1);
  const coachingNote  = getCoachingDirective(week, block, phase);
  const shortNote     = getShortDirective(coachingNote);
  const hasMoreText   = shortNote.length < coachingNote.length;

  // ── Build prioritised alerts list ──────────────────────────────────────────
  const alerts: AlertData[] = [];
  if (flaggedRegions.length > 0)
    alerts.push({ type: 'pain', color: '#EF5350', icon: 'alert-circle', title: 'PAIN PATTERN DETECTED', sub: `${flaggedRegions[0]} flagged 3+ times this week`, actionRoute: '/(tabs)/today' });
  if (!hasReadinessToday && hasReadinessToday !== null && !isRestDay)
    alerts.push({ type: 'readiness', color: COLORS.accent, icon: 'lightning-bolt', title: 'PRE-SESSION CHECK-IN', sub: "Rate today's readiness — takes 20 seconds", actionRoute: '/(tabs)/today' });
  if (rotationStatus?.count > 0)
    alerts.push({ type: 'rotation', color: COLORS.accentBlue, icon: 'rotate-3d-variant', title: 'EXERCISE ROTATION DUE', sub: `${rotationStatus.count} exercise${rotationStatus.count > 1 ? 's' : ''} overdue for variation` });
  if (deloadStatus?.deloadRecommended)
    alerts.push({ type: 'recovery', color: '#FF9800', icon: 'sleep', title: 'RECOVERY WEEK RECOMMENDED', sub: (deloadStatus.message || `Score ${deloadStatus.deloadScore}/12 — recovery needed`).slice(0, 90) });

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        testID="dashboard-scroll"
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
        showsVerticalScrollIndicator={false}
      >

        {/* ── COMPETITION SLIM BANNER (above header when active) ── */}
        {competitionStatus?.hasCompetition && (competitionStatus.weeksOut ?? 0) >= 0 && (
          <View style={s.compSlimBanner} testID="competition-banner">
            <MaterialCommunityIcons name="trophy-outline" size={12} color={competitionStatus.color || TEAL_COLOR} />
            <Text style={[s.compSlimText, { color: competitionStatus.color || TEAL_COLOR }]}>
              {(competitionStatus.weeksOut ?? 0) <= 0 ? '🏆 COMPETITION DAY' : `🏆 ${competitionStatus.weeksOut} WEEKS OUT`}
            </Text>
            <MaterialCommunityIcons name="circle-small" size={12} color={COLORS.text.muted} />
            <Text style={s.compSlimPhase}>{competitionStatus.phaseLabel || `${phase} Phase`}</Text>
          </View>
        )}

        {/* ── HEADER ── */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.greeting}>{getGreeting()}, {profile.name || authUserName || 'Athlete'}</Text>
            <Text style={s.date}>{getFormattedDate()}</Text>
          </View>
          <TouchableOpacity testID="settings-btn" onPress={() => router.push('/settings')} style={s.settingsBtn}>
            <MaterialCommunityIcons name="cog-outline" size={26} color={COLORS.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* ── TODAY'S SESSION CARD (prominently first) ── */}
        {!isRestDay && displaySession ? (
          <View style={s.sessionCard}>
            <View style={s.sessionCardTop}>
              {(() => {
                const sc = getSessionStyle(displaySession.sessionType);
                return (
                  <View style={[s.sessionTypeBadge, { backgroundColor: sc.bg, borderColor: sc.borderColor }]}>
                    <Text style={[s.sessionTypeBadgeText, { color: sc.text }]}>{displaySession.sessionType}</Text>
                  </View>
                );
              })()}
              <Text style={s.sessionCardDay}>{todayName}</Text>
            </View>
            <Text style={s.sessionLift}>
              {programSession?.session?.exercises?.[0]?.name ?? displaySession.mainLift ?? "Today's Session"}
            </Text>
            <Text style={s.sessionScheme}>
              {programSession?.session?.exercises?.[0]?.prescription ?? displaySession.topSetScheme ?? ''}
            </Text>
            {programSession?.session?.coachNote ? (
              <Text style={s.sessionCoachNote}>"{programSession.session.coachNote}"</Text>
            ) : null}
            <TouchableOpacity
              testID="today-session-card"
              style={s.startBtn}
              onPress={() => router.push('/(tabs)/today')}
              activeOpacity={0.85}
            >
              <Text style={s.startBtnText}>START SESSION</Text>
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

        {/* ── COACH'S DIRECTIVE (condensed + expandable) ── */}
        <View style={s.coachCard}>
          <View style={s.coachCardHeader}>
            <View style={s.coachIconBadge}>
              <MaterialCommunityIcons name="brain" size={14} color={COLORS.accent} />
            </View>
            <Text style={s.coachCardLabel}>COACH'S DIRECTIVE — WEEK {week}</Text>
            {deload && (
              <View style={s.deloadPill}>
                <Text style={s.deloadPillText}>RECOVERY</Text>
              </View>
            )}
          </View>
          <Text style={s.coachCardText}>
            {expandedCoach ? coachingNote : shortNote}
          </Text>
          {hasMoreText && (
            <TouchableOpacity onPress={() => setExpandedCoach(v => !v)} style={s.readMoreBtn} activeOpacity={0.7}>
              <Text style={s.readMoreText}>{expandedCoach ? '↑ Less' : 'Read more →'}</Text>
            </TouchableOpacity>
          )}
          <View style={s.coachCardFooter}>
            <MaterialCommunityIcons name="circle-small" size={16} color={COLORS.accent} />
            <Text style={s.coachCardTag}>Block {block} of 7</Text>
            <MaterialCommunityIcons name="circle-small" size={16} color={COLORS.text.muted} />
            <Text style={s.coachCardTag}>{phase} Phase</Text>
          </View>
        </View>

        {/* ── WEEKLY STATS STRIP (compact horizontal) ── */}
        <View style={s.statsStrip}>
          <StripStat
            label="SESSIONS"
            value={`${weekStats?.sessionsCompleted ?? 0}/${weekStats?.sessionsPlanned ?? 4}`}
            accent={(weekStats?.sessionsCompleted ?? 0) >= (weekStats?.sessionsPlanned ?? 4)}
          />
          <View style={s.statsDivider} />
          <StripStat
            label="AVG EFFORT"
            value={weekStats?.avgRPE ? weekStats.avgRPE.toFixed(1) : '—'}
            accent={(weekStats?.avgRPE ?? 0) > 0}
          />
          <View style={s.statsDivider} />
          <StripStat
            label="COMPLETION"
            value={weekStats?.completionRate != null ? `${weekStats.completionRate}%` : '—'}
            accent={(weekStats?.completionRate ?? 0) >= 75}
          />
        </View>

        {/* ── PRIORITY ALERTS (only shown when active, MAX 2 visible) ── */}
        {alerts.length > 0 && (
          <View style={s.alertsSection} testID="alerts-section">
            {(expandedAlerts ? alerts : alerts.slice(0, 2)).map((alert) => (
              <AlertCard key={alert.type} alert={alert} onAction={alert.actionRoute ? () => router.push(alert.actionRoute as any) : undefined} />
            ))}
            {alerts.length > 2 && (
              <TouchableOpacity style={s.viewAllBtn} onPress={() => setExpandedAlerts(v => !v)} activeOpacity={0.7}>
                <Text style={s.viewAllText}>
                  {expandedAlerts ? '↑ Show less' : `View all alerts (${alerts.length})`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── CURRENT BLOCK (compact) ── */}
        <View style={s.compactBlockCard}>
          <View style={s.compactBlockRow}>
            <Text style={s.compactBlockLine}>
              <Text style={s.compactBlockAccent}>Block {block}</Text>
              <Text style={s.compactBlockMuted}> of 7  ·  </Text>
              <Text style={s.compactBlockBold}>{blockName}</Text>
              <Text style={s.compactBlockMuted}>  ·  </Text>
              <Text style={s.compactBlockBold}>{phase} Phase</Text>
            </Text>
            {deload && (
              <View style={s.deloadPill}>
                <Text style={s.deloadPillText}>RECOVERY</Text>
              </View>
            )}
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${Math.round(blockProgress * 100)}%` as any }]} />
          </View>
          <Text style={s.progressLabel}>Week {week} · Programme weeks {blockStart}–{blockEnd}</Text>
        </View>

        {/* ── EST. MAXES ── */}
        {bests && (
          <>
            <View style={s.sectionRow}>
              <Text style={s.sectionTitle}>EST. MAXES</Text>
              <Text style={s.sectionSub}>From training logs</Text>
            </View>
            <View style={s.e1rmRow}>
              {featuredLifts.length >= 3 ? (
                featuredLifts.slice(0, 3).map(lift => (
                  <E1RMCard
                    key={lift.id}
                    label={lift.exercise.split(' ').slice(0, 2).join(' ').toUpperCase()}
                    data={{ e1rm: lift.bestE1rm, exercise: lift.exercise }}
                    units={units}
                  />
                ))
              ) : (
                <>
                  <E1RMCard label="SQUAT" data={bests.squat} units={units} />
                  <E1RMCard label="PRESS" data={bests.press} units={units} />
                  <E1RMCard label="PULL"  data={bests.pull}  units={units} />
                </>
              )}
            </View>
          </>
        )}

        {/* ── QUICK ACTIONS (4 in a single row) ── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>QUICK ACTIONS</Text>
        </View>
        <View style={s.actionsRow}>
          <QuickAction icon="pencil-outline"          label="Log Session"  onPress={() => router.push('/(tabs)/log')} />
          <QuickAction icon="brain"                   label="Coach"        onPress={() => router.push('/tools/coach')} accent />
          <QuickAction icon="clipboard-check-outline" label="Check-In"     onPress={() => router.push('/tools/checkin')} />
          <QuickAction icon="history"                 label="Change Log"   onPress={() => router.push('/tools/changelog')} />
        </View>

        {/* ── WEEKLY REVIEW (only if data exists) ── */}
        {weeklyReview?.hasReview && (
          <View style={s.weeklyReviewCard} testID="weekly-review-card">
            <View style={s.priorityCardHeader}>
              <View style={[s.priorityIconBadge, { backgroundColor: COLORS.accentBlue + '25' }]}>
                <MaterialCommunityIcons name="calendar-check-outline" size={14} color={COLORS.accentBlue} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.priorityCardTitle, { color: COLORS.accentBlue }]}>WEEK {weeklyReview.week} REVIEW</Text>
                <Text style={s.priorityCardSub}>
                  {weeklyReview.stats?.sessionsCompleted ?? 0}/{weeklyReview.stats?.sessionsPlanned ?? 4} sessions
                  {weeklyReview.stats?.avgRPE > 0 ? `  ·  Effort ${weeklyReview.stats.avgRPE}/10` : ''}
                  {weeklyReview.stats?.prsHit > 0 ? `  ·  ${weeklyReview.stats.prsHit} PR${weeklyReview.stats.prsHit > 1 ? 's' : ''}` : ''}
                </Text>
              </View>
            </View>
            <Text style={s.priorityCardBody}>{weeklyReview.summary}</Text>
            {weeklyReview.highlights?.length > 0 && (
              <View style={{ marginTop: SPACING.sm, gap: 4 }}>
                {weeklyReview.highlights.slice(0, 2).map((h: string, i: number) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                    <MaterialCommunityIcons name="check-circle-outline" size={14} color={TEAL_COLOR} style={{ marginTop: 1 }} />
                    <Text style={[s.priorityCardSub, { flex: 1, color: COLORS.text.secondary }]}>{h}</Text>
                  </View>
                ))}
              </View>
            )}
            {weeklyReview.nextWeekFocus && (
              <View style={s.nextWeekBox}>
                <MaterialCommunityIcons name="arrow-right-circle-outline" size={13} color={COLORS.accentBlue} />
                <Text style={s.nextWeekText}>{weeklyReview.nextWeekFocus}</Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StripStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={s.stripStat}>
      <Text style={[s.stripStatValue, accent ? { color: COLORS.accent } : {}]}>{value}</Text>
      <Text style={s.stripStatLabel}>{label}</Text>
    </View>
  );
}

function AlertCard({ alert, onAction }: { alert: AlertData; onAction?: () => void }) {
  return (
    <View style={[s.alertCard, { borderLeftColor: alert.color }]}>
      <View style={s.alertRow}>
        <View style={[s.alertIconBadge, { backgroundColor: alert.color + '20' }]}>
          <MaterialCommunityIcons name={alert.icon as any} size={13} color={alert.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.alertTitle, { color: alert.color }]}>{alert.title}</Text>
          <Text style={s.alertSub} numberOfLines={2}>{alert.sub}</Text>
        </View>
        {onAction && (
          <TouchableOpacity onPress={onAction} style={[s.alertBtn, { backgroundColor: alert.color + '15' }]} activeOpacity={0.8}>
            <MaterialCommunityIcons name="arrow-right" size={14} color={alert.color} />
          </TouchableOpacity>
        )}
      </View>
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
        size={24}
        color={accent ? COLORS.primary : COLORS.accent}
      />
      <Text style={[s.quickActionLabel, accent && s.quickActionLabelAccent]} numberOfLines={2}>
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
  greeting:     { fontSize: FONTS.sizes.xxl + 2, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 32 },
  date:         { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, marginTop: 3 },
  settingsBtn:  { padding: 4, marginTop: 2 },

  // Competition slim banner (above header)
  compSlimBanner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: 8, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.xs },
  compSlimText:   { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, letterSpacing: 1 },
  compSlimPhase:  { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },

  // Today's session card (prominent)
  sessionCard:         { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  sessionCardTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  sessionTypeBadge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, borderWidth: 1 },
  sessionTypeBadgeText:{ fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5 },
  sessionCardDay:      { color: COLORS.text.muted, fontSize: FONTS.sizes.sm },
  sessionLift:         { fontSize: FONTS.sizes.xxxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 38, marginBottom: 4 },
  sessionScheme:       { fontSize: FONTS.sizes.base, color: COLORS.text.secondary, marginBottom: SPACING.sm, lineHeight: 22 },
  sessionCoachNote:    { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, fontStyle: 'italic', marginBottom: SPACING.lg, lineHeight: 20 },
  startBtn:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accent, borderRadius: RADIUS.lg, paddingVertical: 15, gap: SPACING.sm, marginTop: SPACING.sm },
  startBtnText:        { color: COLORS.primary, fontWeight: FONTS.weights.heavy, fontSize: FONTS.sizes.base, letterSpacing: 1 },

  // Rest day card
  restDayCard:  { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  restDayIcon:  { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.surfaceHighlight, justifyContent: 'center', alignItems: 'center' },
  restDayTitle: { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: 4 },
  restDayText:  { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 20 },

  // Coach card — gold border + expandable
  coachCard:       { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1.5, borderColor: COLORS.accent },
  coachCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm, gap: SPACING.sm, flexWrap: 'wrap' },
  coachIconBadge:  { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.surfaceHighlight, justifyContent: 'center', alignItems: 'center' },
  coachCardLabel:  { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.accent, letterSpacing: 1.5, flex: 1 },
  deloadPill:      { backgroundColor: COLORS.surfaceHighlight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border },
  deloadPillText:  { fontSize: 9, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy, letterSpacing: 1 },
  coachCardText:   { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 22, marginBottom: SPACING.sm },
  readMoreBtn:     { alignSelf: 'flex-start', paddingVertical: 2, marginBottom: SPACING.sm },
  readMoreText:    { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontWeight: FONTS.weights.semibold },
  coachCardFooter: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.xs },
  coachCardTag:    { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },

  // Weekly stats strip (horizontal compact)
  statsStrip:     { flexDirection: 'row', marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, paddingVertical: SPACING.md + 2, paddingHorizontal: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  stripStat:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stripStatValue: { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 24 },
  stripStatLabel: { fontSize: 9, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy, letterSpacing: 1, marginTop: 3 },
  statsDivider:   { width: 1, backgroundColor: COLORS.border, marginVertical: 4 },

  // Priority alerts section (compact, left-border cards)
  alertsSection: { paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.md },
  alertCard:     { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 4 },
  alertRow:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  alertIconBadge:{ width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  alertTitle:    { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, letterSpacing: 1 },
  alertSub:      { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 1, lineHeight: 17 },
  alertBtn:      { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  viewAllBtn:    { alignSelf: 'center', paddingVertical: SPACING.xs, paddingHorizontal: SPACING.md },
  viewAllText:   { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontWeight: FONTS.weights.semibold },

  // Compact block card (single-line header)
  compactBlockCard:  { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  compactBlockRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  compactBlockLine:  { fontSize: FONTS.sizes.sm, flex: 1 },
  compactBlockAccent:{ fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, color: COLORS.accent },
  compactBlockMuted: { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },
  compactBlockBold:  { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary },
  progressTrack:     { height: 6, backgroundColor: COLORS.surfaceHighlight, borderRadius: 3, marginBottom: SPACING.sm, overflow: 'hidden' },
  progressFill:      { height: 6, backgroundColor: COLORS.accent, borderRadius: 3 },
  progressLabel:     { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },

  // Section labels
  sectionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, marginTop: SPACING.md, marginBottom: SPACING.sm },
  sectionTitle: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2 },
  sectionSub:   { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },

  // Est. Maxes cards
  e1rmRow:      { flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.sm },
  e1rmCard:     { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  e1rmLabel:    { fontSize: 9, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy, letterSpacing: 1.5, marginBottom: 4 },
  e1rmValue:    { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.accent },
  e1rmUnit:     { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginBottom: 2 },
  e1rmExercise: { fontSize: 9, color: COLORS.text.muted, lineHeight: 13, marginTop: 2 },

  // Quick actions (4 in a single row)
  actionsRow:            { flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.sm },
  quickAction:           { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, paddingVertical: SPACING.md, paddingHorizontal: 4, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: COLORS.border },
  quickActionAccent:     { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  quickActionLabel:      { fontSize: 10, fontWeight: FONTS.weights.semibold, color: COLORS.text.secondary, textAlign: 'center' },
  quickActionLabelAccent:{ color: COLORS.primary },

  // Weekly Review card + priority card shared
  weeklyReviewCard:   { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  priorityCardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  priorityIconBadge:  { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  priorityCardTitle:  { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, letterSpacing: 1.5 },
  priorityCardSub:    { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 1 },
  priorityCardBody:   { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 20, marginBottom: SPACING.md },
  nextWeekBox:        { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  nextWeekText:       { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.accentBlue, lineHeight: 17, fontStyle: 'italic' },
});
