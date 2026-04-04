import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS, getSessionStyle } from '../../src/constants/theme';
import { getProfile } from '../../src/utils/storage';
import { logApi, prApi, programApi, painReportApi, readinessApi, weeklyReviewApi, deloadApi, competitionApi, rotationApi } from '../../src/utils/api';
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
const TEAL_COLOR = '#4DCEA6';
export default function Dashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [todaySession, setTodaySession] = useState<ProgramSession | null>(null);
  const [programSession, setProgramSession] = useState<TodaySessionResponse | null>(null);
  const [weekStats, setWeekStats] = useState<WeekStats | null>(null);
  const [bests, setBests] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

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
    const week = prof.currentWeek || 1;
    setTodaySession(getTodaySession(week));

    // Try loading AI-generated session from program API
    try {
      const apiSession = await programApi.getTodaySession();
      setProgramSession(apiSession);
    } catch { /* No AI plan yet — use local data */ }

    try {
      const [stats, bestsData] = await Promise.all([
        logApi.weekStats(week),
        prApi.getBests(),
      ]);
      setWeekStats(stats);
      setBests(bestsData);
    } catch {}

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

        {/* ── PRIORITY CARD STACK ── */}

        {/* P0: Competition Countdown Banner (Task 9) */}
        {competitionStatus?.hasCompetition && (competitionStatus.weeksOut ?? 0) >= 0 && (
          <View style={[s.competitionBanner, { borderLeftColor: competitionStatus.color || TEAL_COLOR }]} testID="competition-banner">
            <View style={s.competitionBannerRow}>
              <MaterialCommunityIcons name="trophy-outline" size={18} color={competitionStatus.color || TEAL_COLOR} />
              <View style={{ flex: 1 }}>
                <Text style={[s.competitionBannerTitle, { color: competitionStatus.color || TEAL_COLOR }]}>
                  {(competitionStatus.weeksOut ?? 0) <= 0 ? '🏆 COMPETITION DAY' : `${competitionStatus.weeksOut} WEEKS OUT`}
                </Text>
                <Text style={s.competitionBannerEvent}>
                  {competitionStatus.eventName || 'Competition'} · {competitionStatus.phaseLabel}
                </Text>
              </View>
            </View>
            {competitionStatus.adjustments?.[0] && (
              <Text style={s.competitionAdjNote}>{competitionStatus.adjustments[0]}</Text>
            )}
            {competitionStatus.ragTip && (
              <Text style={[s.competitionAdjNote, { color: TEAL_COLOR, fontStyle: 'italic' }]}>
                Research: {competitionStatus.ragTip}
              </Text>
            )}
          </View>
        )}

        {/* P1: Pain Alert (shown when flagged regions detected) */}
        {flaggedRegions.length > 0 && (
          <View style={s.priorityCard} testID="pain-alert-card">
            <View style={s.priorityCardHeader}>
              <View style={[s.priorityIconBadge, { backgroundColor: '#EF535025' }]}>
                <MaterialCommunityIcons name="alert-circle" size={14} color='#EF5350' />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.priorityCardTitle, { color: '#EF5350' }]}>PAIN PATTERN DETECTED</Text>
                <Text style={s.priorityCardSub}>Flagged area: {flaggedRegions.join(', ')}</Text>
              </View>
            </View>
            <Text style={s.priorityCardBody}>
              {flaggedRegions[0]} has been reported 3+ times in the last 7 days.
              This needs coach attention before your next heavy session.
            </Text>
            <TouchableOpacity
              style={[s.priorityBtn, { backgroundColor: '#EF535015', borderColor: '#EF535040', borderWidth: 1 }]}
              onPress={() => router.push('/(tabs)/today')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="arrow-right" size={13} color='#EF5350' />
              <Text style={[s.priorityBtnText, { color: '#EF5350' }]}>Go to Today's Session</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* P2: Readiness Check nudge (if not done today & not rest day) */}
        {!hasReadinessToday && hasReadinessToday !== null && !isRestDay && (
          <View style={s.priorityCard} testID="readiness-nudge-card">
            <View style={s.priorityCardHeader}>
              <View style={[s.priorityIconBadge, { backgroundColor: COLORS.accent + '25' }]}>
                <MaterialCommunityIcons name="lightning-bolt" size={14} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.priorityCardTitle, { color: COLORS.accent }]}>PRE-SESSION CHECK-IN</Text>
                <Text style={s.priorityCardSub}>How are you feeling today?</Text>
              </View>
            </View>
            <Text style={s.priorityCardBody}>
              Your daily readiness check helps your coach adjust today's loads. Takes 20 seconds.
            </Text>
            <TouchableOpacity
              style={[s.priorityBtn, { backgroundColor: COLORS.accent + '15', borderColor: COLORS.accent + '40', borderWidth: 1 }]}
              onPress={() => router.push('/(tabs)/today')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="flag-checkered" size={13} color={COLORS.accent} />
              <Text style={[s.priorityBtnText, { color: COLORS.accent }]}>Start Today's Session</Text>
            </TouchableOpacity>
          </View>
        )}

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

        {/* P3: TODAY'S SESSION CTA ── */}
        {!isRestDay && displaySession ? (
          <View style={s.sessionCtaCard}>
            <View style={s.sessionCtaTop}>
              {(() => {
                const sc = getSessionStyle(displaySession.sessionType);
                return (
                  <View style={[s.sessionTypeBadge, { backgroundColor: sc.bg, borderColor: sc.borderColor }]}>
                    <Text style={[s.sessionTypeBadgeText, { color: sc.text }]}>{displaySession.sessionType}</Text>
                  </View>
                );
              })()}
              <Text style={s.sessionCtaDayLabel}>{todayName}</Text>
            </View>
            <Text style={s.sessionCtaLift}>{displaySession.mainLift}</Text>
            <Text style={s.sessionCtaScheme}>{displaySession.topSetScheme}</Text>
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

        {/* ── AI Coach Note (from generated plan) ── */}
        {programSession?.session?.coachNote && (
          <View style={s.coachNoteCard}>
            <View style={s.coachNoteHeader}>
              <MaterialCommunityIcons name="robot-outline" size={14} color={COLORS.accentBlue} />
              <Text style={s.coachNoteLabel}>AI COACH · {programSession.session.sessionType?.toUpperCase()}</Text>
            </View>
            <Text style={s.coachNoteText}>{programSession.session.coachNote}</Text>
          </View>
        )}

        {/* P3: Rotation Flag Card (Task 10) */}
        {rotationStatus?.count > 0 && (
          <View style={s.rotationCard} testID="rotation-card">
            <View style={s.priorityCardHeader}>
              <View style={[s.priorityIconBadge, { backgroundColor: COLORS.accentBlue + '25' }]}>
                <MaterialCommunityIcons name="rotate-3d-variant" size={14} color={COLORS.accentBlue} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.priorityCardTitle, { color: COLORS.accentBlue }]}>EXERCISE ROTATION DUE</Text>
                <Text style={s.priorityCardSub}>
                  {rotationStatus.count} exercise{rotationStatus.count > 1 ? 's' : ''} overdue for variation
                </Text>
              </View>
            </View>
            {rotationStatus.flagged?.slice(0, 2).map((item: any, i: number) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 }}>
                <MaterialCommunityIcons name="swap-horizontal" size={13} color={COLORS.accentBlue} style={{ marginTop: 1 }} />
                <Text style={[s.priorityCardSub, { flex: 1 }]}>
                  <Text style={{ color: COLORS.text.primary }}>{item.exercise}</Text>
                  {item.suggestion ? ` → ${item.suggestion.replacement}` : ''}
                  {` (${item.weeksUsed}wk/${item.windowWeeks}wk window)`}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* P4: Deload Warning Card (Task 7) */}
        {deloadStatus?.deloadRecommended && (
          <View style={s.deloadWarningCard} testID="deload-warning-card">
            <View style={s.priorityCardHeader}>
              <View style={[s.priorityIconBadge, { backgroundColor: '#FF980025' }]}>
                <MaterialCommunityIcons name="sleep" size={14} color='#FF9800' />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.priorityCardTitle, { color: '#FF9800' }]}>DELOAD RECOMMENDED</Text>
                <Text style={s.priorityCardSub}>Score {deloadStatus.deloadScore}/12 — recovery needed</Text>
              </View>
              <View style={[s.comingSoonPill, { backgroundColor: '#FF980020', borderColor: '#FF980040', borderWidth: 1 }]}>
                <Text style={[s.comingSoonText, { color: '#FF9800' }]}>
                  {deloadStatus.urgency === 'immediate' ? 'URGENT' : 'SOON'}
                </Text>
              </View>
            </View>
            <Text style={s.priorityCardBody}>{deloadStatus.message}</Text>
            {deloadStatus.signals?.length > 0 && (
              <View style={{ marginTop: SPACING.sm, gap: 4 }}>
                {deloadStatus.signals.slice(0, 2).map((sig: string, i: number) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                    <MaterialCommunityIcons name="circle-small" size={16} color='#FF9800' style={{ marginTop: -2 }} />
                    <Text style={[s.priorityCardSub, { flex: 1, color: COLORS.text.secondary }]}>{sig}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* P4: Weekly Review Card (Task 5) */}
        {weeklyReview?.hasReview ? (
          <View style={s.weeklyReviewCard} testID="weekly-review-card">
            <View style={s.priorityCardHeader}>
              <View style={[s.priorityIconBadge, { backgroundColor: COLORS.accentBlue + '25' }]}>
                <MaterialCommunityIcons name="calendar-check-outline" size={14} color={COLORS.accentBlue} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.priorityCardTitle, { color: COLORS.accentBlue }]}>WEEK {weeklyReview.week} REVIEW</Text>
                <Text style={s.priorityCardSub}>
                  {weeklyReview.stats?.sessionsCompleted ?? 0}/{weeklyReview.stats?.sessionsPlanned ?? 4} sessions
                  {weeklyReview.stats?.avgRPE > 0 ? `  ·  RPE ${weeklyReview.stats.avgRPE}/10` : ''}
                  {weeklyReview.stats?.prsHit > 0 ? `  ·  ${weeklyReview.stats.prsHit} PR${weeklyReview.stats.prsHit > 1 ? 's' : ''}` : ''}
                </Text>
              </View>
              {weeklyReview.cached && (
                <View style={s.comingSoonPill}>
                  <Text style={s.comingSoonText}>CACHED</Text>
                </View>
              )}
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
        ) : (
          <View style={s.weeklyReviewCard} testID="weekly-review-card">
            <View style={s.priorityCardHeader}>
              <View style={[s.priorityIconBadge, { backgroundColor: COLORS.accentBlue + '25' }]}>
                <MaterialCommunityIcons name="calendar-check-outline" size={14} color={COLORS.accentBlue} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.priorityCardTitle, { color: COLORS.accentBlue }]}>WEEKLY REVIEW</Text>
                <Text style={s.priorityCardSub}>AI-powered weekly analysis</Text>
              </View>
              <View style={s.comingSoonPill}>
                <Text style={s.comingSoonText}>LOADING</Text>
              </View>
            </View>
            <Text style={s.priorityCardBody}>
              Complete your first session this week to unlock your personalised AI training review.
            </Text>
          </View>
        )}

        {/* Week Stats */}
        <Text style={s.sectionTitle}>THIS WEEK</Text>
        <View style={s.statsGrid}>
          <StatBox label="AVG PAIN" value={weekStats?.avgPain?.toFixed(1) ?? '—'} color={weekStats && weekStats.avgPain >= 3 ? COLORS.status.error : COLORS.text.primary} testID="stat-pain" />
          <StatBox label="AVG RPE" value={weekStats?.avgRPE?.toFixed(1) ?? '—'} testID="stat-rpe" />
          <StatBox label="COMPLETION" value={weekStats ? `${weekStats.completionRate}%` : '—'} testID="stat-completion" />
          <StatBox label="BODYWEIGHT" value={profile.currentBodyweight ? `${profile.currentBodyweight} lbs` : '—'} testID="stat-bw" />
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

function StatBox({ label, value, color, testID }: {
  label: string; value: string; color?: string; testID?: string;
}) {
  return (
    <View testID={testID} style={s.statBox}>
      <Text style={[s.statBoxValue, color ? { color } : {}]}>{value}</Text>
      <Text style={s.statBoxLabel}>{label}</Text>
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

  // AI Coach note (from generated plan)
  coachNoteCard: {
    marginHorizontal: SPACING.lg, marginBottom: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.accentBlue,
    borderLeftWidth: 3,
  },
  coachNoteHeader: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  coachNoteLabel: {
    fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy,
    color: COLORS.accentBlue, letterSpacing: 1.5,
  },
  coachNoteText: {
    fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 22,
  },

  // Rest day
  restDayCard:  { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, flexDirection: 'row', alignItems: 'center', gap: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  restDayIcon:  { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.surfaceHighlight, justifyContent: 'center', alignItems: 'center' },
  restDayTitle: { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: 4 },
  restDayText:  { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 20 },

  // Section labels
  sectionRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, marginTop: SPACING.md, marginBottom: SPACING.sm },
  sectionTitle: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2 },
  sectionSub:   { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },

  // Stats grid (2×2 boxes)
  statsGrid:      { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.sm },
  statBox:        { flex: 1, minWidth: '45%', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  statBoxValue:   { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 26, marginBottom: 2 },
  statBoxLabel:   { fontSize: 9, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy, letterSpacing: 1 },

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

  // Priority cards
  priorityCard:       { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  priorityCardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  priorityIconBadge:  { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  priorityCardTitle:  { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, letterSpacing: 1.5 },
  priorityCardSub:    { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 1 },
  priorityCardBody:   { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 20, marginBottom: SPACING.md },
  priorityBtn:        { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 9, paddingHorizontal: SPACING.md, borderRadius: RADIUS.md, alignSelf: 'flex-start' },
  priorityBtnText:    { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy },

  // Weekly Review + Deload cards
  weeklyReviewCard:   { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, opacity: 0.95 },
  deloadWarningCard:  { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1.5, borderColor: '#FF980040' },
  rotationCard:       { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.accentBlue + '30' },
  comingSoonPill:     { backgroundColor: COLORS.surfaceHighlight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border },
  comingSoonText:     { fontSize: 9, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy, letterSpacing: 1 },
  nextWeekBox:        { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  nextWeekText:       { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.accentBlue, lineHeight: 17, fontStyle: 'italic' },

  // Competition Banner (Task 9)
  competitionBanner:      { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 4 },
  competitionBannerRow:   { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 4 },
  competitionBannerTitle: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, letterSpacing: 1 },
  competitionBannerEvent: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 1 },
  competitionPhasePill:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  competitionPillText:    { fontSize: 12 },
  competitionAdjNote:     { fontSize: FONTS.sizes.xs, color: COLORS.text.secondary, lineHeight: 17, marginTop: 4, paddingLeft: 24 },
});
