import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, RefreshControl, ActivityIndicator, Animated,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING, FONTS, RADIUS, getSessionStyle } from '../../src/constants/theme';
import { getProfile, saveProfile } from '../../src/utils/storage';
import { getStoredUser } from '../../src/utils/auth';
import { toLocalDateString, getLocalDateString } from '../../src/utils/dateHelpers';
import { logApi, prApi, programApi, painReportApi, readinessApi, weeklyReviewApi, deloadApi, competitionApi, rotationApi, liftsApi, streakApi, badgesApi, questApi, calendarApi, api, profileApi } from '../../src/utils/api';
import { getTodaySession, getTodayDayName } from '../../src/data/programData';
import { getBlock, getBlockName, getPhase, isDeloadWeek } from '../../src/utils/calculations';
import { AthleteProfile, ProgramSession, WeekStats, TodaySessionResponse } from '../../src/types';
import CoachRebalanceCard from '../../src/components/CoachRebalanceCard';
import TourOverlay, { TourRefs, TOUR_VERSION_CONSTANT } from '../../src/components/TourOverlay';

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

  // ── Tour refs & state ────────────────────────────────────────────────────────
  const sessionCardRef  = useRef<View>(null);
  const coachCardRef    = useRef<View>(null);
  const settingsGearRef = useRef<View>(null);
  const homeScrollRef   = useRef<ScrollView>(null);   // for scroll-into-view
  const [showTour, setShowTour] = useState(false);
  // Use ref (not state) for the tour-triggered guard — avoids useCallback dep loop
  const tourTriggeredRef = useRef(false);

  const tourRefs: TourRefs = {
    sessionCard:  sessionCardRef,
    coachCard:    coachCardRef,
    settingsGear: settingsGearRef,
  };

  // ── Priority card state ──────────────────────────────────────────────────────
  const [flaggedRegions, setFlaggedRegions] = useState<string[]>([]);
  const [hasReadinessToday, setHasReadinessToday] = useState<boolean | null>(null);
  const [weeklyReview, setWeeklyReview] = useState<any | null>(null);
  const [deloadStatus, setDeloadStatus] = useState<any | null>(null);
  const [competitionStatus, setCompetitionStatus] = useState<any | null>(null);
  const [rotationStatus, setRotationStatus] = useState<any | null>(null);

  // ── Gamification state ───────────────────────────────────────────────────────
  const [streak,          setStreak]          = useState<any>(null);
  const [badges,          setBadges]          = useState<any>(null);
  const [quest,           setQuest]           = useState<any>(null);
  const [userRank,        setUserRank]        = useState<number>(0);
  const [showGroupPrompt, setShowGroupPrompt] = useState(false);
  const [questIsNew,      setQuestIsNew]      = useState(false);
  const streakGlowAnim = useRef(new Animated.Value(0.7)).current;

  // ── Week overview state ───────────────────────────────────────────────────────
  const [weekEvents, setWeekEvents] = useState<any[]>([]);

  // ── Today's session state ───────────────────────────────────────────────────
  // Derived in render from weekEvents + AsyncStorage finish flag — no extra state needed
  const [todaySessionFinished, setTodaySessionFinished] = useState(false);

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
    } catch {
      // 404 = session completed, or no AI plan exists — clear stale value
      setProgramSession(null);
    }

    // ── Check AsyncStorage for "session finished today" flag ──────────────────
    // today.tsx writes AsyncStorage.setItem('today_finished_date', localDate) when
    // the user presses FINISH SESSION. This is the authoritative completion signal.
    // (The backend's finishSession API is intentionally skipped in today.tsx to
    //  prevent re-sync bugs, so session.status stays 'planned' — never use that.)
    try {
      const finishedDate = await AsyncStorage.getItem('today_finished_date');
      setTodaySessionFinished(finishedDate === getLocalDateString());
    } catch {
      setTodaySessionFinished(false);
    }

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

    // ── Fetch gamification data ────────────────────────────────────────────
    try {
      const [strk, bdgs, qst, lbrd] = await Promise.all([
        streakApi.get().catch(() => null),
        badgesApi.get().catch(() => null),
        questApi.get().catch(() => null),
        api('/leaderboard?tab=consistency').catch(() => null),
      ]);
      setStreak(strk);
      setBadges(bdgs);
      setQuest(qst);
      setUserRank(lbrd?.userRank ?? 0);

      // Part 11B: streak glow on first-time streak
      if (strk?.currentStreak === 1) {
        const seen = await AsyncStorage.getItem('streakIntroSeen');
        if (!seen) {
          await AsyncStorage.setItem('streakIntroSeen', 'true');
          Animated.loop(Animated.sequence([
            Animated.timing(streakGlowAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
            Animated.timing(streakGlowAnim, { toValue: 0.6, duration: 700, useNativeDriver: true }),
          ]), { iterations: 3 }).start();
        }
      }

      // Part 11D: quest "NEW" badge on first time
      const questSeen = await AsyncStorage.getItem('questIntroSeen');
      if (!questSeen && qst) {
        setQuestIsNew(true);
        await AsyncStorage.setItem('questIntroSeen', 'true');
      }

      // Part 10C: group prompt for 2+ week athletes
      if (strk?.totalWeeksTrained >= 2) {
        const dismissed = await AsyncStorage.getItem('groupPromptDismissed');
        if (!dismissed) setShowGroupPrompt(true);
      }
    } catch { /* Gamification non-critical */ }

    // ── Fetch this week's training events for the "THIS WEEK" section ─────────
    try {
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - daysFromMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const startStr = monday.toISOString().slice(0, 10);
      const endStr   = sunday.toISOString().slice(0, 10);
      const result   = await calendarApi.getEvents(startStr, endStr);
      const events   = result?.events || [];
      // Sort by date ascending so the week displays chronologically
      events.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
      setWeekEvents(events);
    } catch { /* Non-critical */ }

    setLoading(false);

    // ── Tour trigger — after page has fully loaded ─────────────────────────
    // Uses a ref (not state) to avoid re-render dependency loops.
    if (
      prof.onboardingComplete &&
      !prof.has_completed_tour &&
      (prof.tour_version ?? 0) < TOUR_VERSION_CONSTANT &&
      !tourTriggeredRef.current
    ) {
      tourTriggeredRef.current = true;
      setTimeout(() => setShowTour(true), 600);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    // Reset tour guard on focus so Replay Tour (from Settings) can re-trigger
    tourTriggeredRef.current = false;
    loadData();
  }, [loadData]));

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  // ── Tour complete handler ──────────────────────────────────────────────────
  const handleTourComplete = useCallback(async () => {
    // Update local cache FIRST so useFocusEffect can't re-trigger the tour
    // if it fires when the modal closes (React Navigation focus event).
    try {
      const p = await getProfile();
      if (p) await saveProfile({ ...p, has_completed_tour: true, tour_version: TOUR_VERSION_CONSTANT });
    } catch {}
    setShowTour(false);
    // Fire-and-forget backend sync (local cache already authoritative)
    profileApi.completeTour().catch(e => console.warn('[Tour] completeTour failed:', e));
  }, []);

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
  const todayDateStr  = getLocalDateString();   // local time — safe for any timezone

  // ── 4-state session card logic ──────────────────────────────────────────────
  // COMPLETE    : user hit FINISH SESSION today (AsyncStorage 'today_finished_date' == today)
  //               This is the authoritative signal. today.tsx intentionally skips
  //               the finishSession API so session.status stays 'planned' — never
  //               rely on !programSession to detect completion.
  // IN_PROGRESS : calendar has logs for today but FINISH hasn't been pressed yet
  // PENDING     : no logs yet, session waiting to start
  // REST_DAY    : today is Off (or no session data at all)
  const todayCalEvent = weekEvents.find(ev => ev.date === todayDateStr);
  const todayCalDone  = todayCalEvent?.isCompleted === true;
  const nextEvent     = weekEvents.find(
    ev => ev.date > todayDateStr && ev.sessionType && ev.sessionType !== 'Off',
  );

  // sessionState derivation (priority: rest_day > complete > in_progress > pending)
  type SessionCardState = 'pending' | 'in_progress' | 'complete' | 'rest_day';
  const sessionCardState: SessionCardState =
    (isRestDay || !displaySession) ? 'rest_day'
    : todaySessionFinished         ? 'complete'
    : todayCalDone                 ? 'in_progress'
    :                                'pending';
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
        ref={homeScrollRef}
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
          <TouchableOpacity
            ref={settingsGearRef as any}
            collapsable={false}
            testID="settings-btn"
            onPress={() => router.push('/settings')}
            style={s.settingsBtn}
          >
            <MaterialCommunityIcons name="cog-outline" size={26} color={COLORS.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* ── TODAY'S SESSION CARD — program mode or free training ── */}
        {profile?.training_mode === 'free' ? (
          /* ── FREE TRAINING CARD ── */
          <View
            ref={sessionCardRef}
            collapsable={false}
            style={[s.restDayCard, { borderColor: '#2A9D8F30', backgroundColor: '#0E1614' }]}
          >
            <View style={[s.restDayIcon, { backgroundColor: '#2A9D8F15' }]}>
              <MaterialCommunityIcons name="notebook-outline" size={26} color="#2A9D8F" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.restDayTitle, { color: '#2A9D8F' }]}>Free Training Mode</Text>
              <Text style={s.restDayText}>
                You're doing your own programming. Log when you train — the coach has full context of your training history.
              </Text>
            </View>
          </View>
        ) : sessionCardState === 'rest_day' ? (
          /* ── REST DAY ── */
          <View ref={sessionCardRef} collapsable={false} testID="today-session-card" style={s.restDayCard}>
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

        ) : sessionCardState === 'complete' ? (
          /* ── COMPLETE ── */
          <View ref={sessionCardRef} collapsable={false} testID="today-session-card" style={[s.sessionCard, s.sessionCardComplete]}>
            <View style={s.sessionCardTop}>
              {(() => {
                const sc = getSessionStyle(displaySession?.sessionType ?? '');
                return (
                  <View style={[s.sessionTypeBadge, { backgroundColor: sc.bg, borderColor: sc.borderColor }]}>
                    <Text style={[s.sessionTypeBadgeText, { color: sc.text }]}>
                      {displaySession?.sessionType ?? todayCalEvent?.sessionType ?? 'Training'}
                    </Text>
                  </View>
                );
              })()}
              {/* Completion indicator — upper-right (Issue 3C) */}
              <View style={s.completedBadge}>
                <MaterialCommunityIcons name="check-circle" size={13} color={COLORS.accent} />
                <Text style={s.completedBadgeText}>DONE</Text>
              </View>
            </View>
            {/* Issue 3C: plain white headline, no inline checkmark */}
            <Text style={s.sessionCompleteTitle}>Today's session — done</Text>
            <Text style={s.sessionScheme}>
              {programSession?.session?.exercises?.[0]?.name ?? displaySession?.mainLift ?? "Good work today"}
            </Text>
            {/* Issue 2: two side-by-side outline buttons */}
            <View style={s.sessionCompleteBtns}>
              <TouchableOpacity
                style={s.viewRecapBtn}
                onPress={() => router.push('/(tabs)/today')}
                activeOpacity={0.85}
              >
                <Text style={s.viewRecapBtnText}>View recap</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.tomorrowBtn}
                onPress={() => router.push('/(tabs)/log')}
                activeOpacity={0.85}
              >
                <Text style={s.tomorrowBtnText}>Tomorrow →</Text>
              </TouchableOpacity>
            </View>
          </View>

        ) : sessionCardState === 'in_progress' ? (
          /* ── IN PROGRESS ── */
          <View ref={sessionCardRef} collapsable={false} testID="today-session-card" style={s.sessionCard}>
            <View style={s.sessionCardTop}>
              {(() => {
                const sc = getSessionStyle(displaySession?.sessionType ?? '');
                return (
                  <View style={[s.sessionTypeBadge, { backgroundColor: sc.bg, borderColor: sc.borderColor }]}>
                    <Text style={[s.sessionTypeBadgeText, { color: sc.text }]}>
                      {displaySession?.sessionType ?? todayCalEvent?.sessionType ?? 'Training'}
                    </Text>
                  </View>
                );
              })()}
              <Text style={s.sessionCardDay}>{todayName}</Text>
            </View>
            <Text style={s.sessionLift}>
              {programSession?.session?.exercises?.[0]?.name ?? displaySession?.mainLift ?? "Today's Session"}
            </Text>
            <Text style={s.sessionScheme}>
              {programSession?.session?.exercises?.[0]?.prescription ?? displaySession?.topSetScheme ?? ''}
            </Text>
            {programSession?.session?.coachNote ? (
              <Text style={s.sessionCoachNote}>"{programSession.session.coachNote}"</Text>
            ) : null}
            <TouchableOpacity
              style={s.startBtn}
              onPress={() => router.push('/(tabs)/today')}
              activeOpacity={0.85}
            >
              <Text style={s.startBtnText}>RESUME SESSION →</Text>
            </TouchableOpacity>
          </View>

        ) : (
          /* ── PENDING (default) — show when training day, not started ── */
          (!displaySession ? null : (
            <View ref={sessionCardRef} collapsable={false} style={s.sessionCard}>
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
          ))
        )}

        {/* ── GAMIFICATION CARDS ── */}

        {/* Part 5C: Streak card */}
        {streak && streak.currentStreak > 0 && (
          <Animated.View style={{ opacity: streakGlowAnim }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#111114', borderRadius: 14, borderWidth: 1, borderColor: '#FF6B3530', padding: 14, marginHorizontal: 16, marginBottom: 8 }}
              onPress={() => router.push('/achievements')}
              activeOpacity={0.7}>
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#FF6B3515', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="fire" size={22} color="#FF6B35" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#FF6B35' }}>{streak.currentStreak}-week streak</Text>
                <Text style={{ fontSize: 11, color: '#666' }}>
                  {streak.currentStreak >= streak.longestStreak ? 'New record!' : `Best: ${streak.longestStreak} weeks`}
                </Text>
              </View>
              <View style={{ backgroundColor: '#FF6B3515', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#FF6B35' }}>{streak.freezesAvailable} freeze{streak.freezesAvailable !== 1 ? 's' : ''}</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Part 6B: Badges row */}
        {badges?.earned?.length > 0 && (
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#111114', borderRadius: 14, borderWidth: 1, borderColor: '#1E1E22', paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 16, marginBottom: 8 }}
            onPress={() => router.push('/achievements')}
            activeOpacity={0.7}>
            <Text style={{ fontSize: 9, color: '#555', fontWeight: '700', letterSpacing: 0.8 }}>BADGES</Text>
            <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
              {badges.earned.slice(-4).map((b: any) => (
                <View key={b.id} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#C9A84C15', borderWidth: 1, borderColor: '#C9A84C40', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name={b.icon as any} size={14} color="#C9A84C" />
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 10, color: '#555' }}>{badges.totalEarned}/{badges.totalPossible}</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color="#444" />
          </TouchableOpacity>
        )}

        {/* Part 7B: Weekly Quest */}
        {quest && (
          <TouchableOpacity
            style={{ backgroundColor: '#111114', borderRadius: 14, borderWidth: 1, borderColor: '#C9A84C30', paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 16, marginBottom: 8 }}
            onPress={() => router.push('/achievements')}
            activeOpacity={0.7}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 9, color: '#C9A84C', fontWeight: '700', letterSpacing: 0.8 }}>WEEKLY QUEST</Text>
                {questIsNew && (
                  <View style={{ backgroundColor: '#C9A84C', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                    <Text style={{ fontSize: 8, fontWeight: '700', color: '#0A0A0C' }}>NEW</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 10, color: '#555' }}>Resets Mon</Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#E8E8E6', marginBottom: 6 }}>{quest.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, height: 6, backgroundColor: '#1E1E22', borderRadius: 3 }}>
                <View style={{ width: `${Math.min(100, ((quest.progress?.current ?? 0) / Math.max(quest.progress?.target ?? 1, 1)) * 100)}%` as any, height: '100%', backgroundColor: '#C9A84C', borderRadius: 3 }} />
              </View>
              <Text style={{ fontSize: 11, color: '#C9A84C', fontWeight: '600' }}>
                {quest.progress?.current ?? 0}/{quest.progress?.target ?? 1}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Part 10D: Leaderboard preview card */}
        <TouchableOpacity
          style={{ backgroundColor: '#111114', borderRadius: 14, borderWidth: 1, borderColor: '#1E1E22', paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}
          onPress={() => router.push('/leaderboard')}
          activeOpacity={0.7}>
          <MaterialCommunityIcons name="podium-gold" size={18} color="#C9A84C" />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#E8E8E6', marginLeft: 8, flex: 1 }}>Leaderboard</Text>
          <Text style={{ fontSize: 12, color: '#C9A84C', fontWeight: '600' }}>#{userRank || '—'}</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color="#444" style={{ marginLeft: 4 }} />
        </TouchableOpacity>

        {/* Part 10C: One-time group invite prompt */}
        {showGroupPrompt && (
          <View style={{ backgroundColor: '#111114', borderRadius: 14, borderWidth: 1, borderColor: '#C9A84C30', padding: 14, marginHorizontal: 16, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#E8E8E6', flex: 1 }}>Training is better with accountability</Text>
              <TouchableOpacity onPress={async () => { await AsyncStorage.setItem('groupPromptDismissed', 'true'); setShowGroupPrompt(false); }}>
                <MaterialCommunityIcons name="close" size={16} color="#555" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={{ backgroundColor: '#C9A84C', borderRadius: 8, paddingVertical: 8, marginTop: 8, alignItems: 'center' }}
              onPress={() => router.push('/leaderboard')}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#0A0A0C' }}>CREATE A GROUP</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── COACH REBALANCE CARD (between Quest and Directive) ── */}
        <CoachRebalanceCard />

        {/* ── COACH'S DIRECTIVE (program mode only) ── */}
        {profile?.training_mode !== 'free' && (
        <View ref={coachCardRef} collapsable={false} style={s.coachCard}>
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
        )} {/* end program-only coach directive */}

        {/* ── THIS WEEK OVERVIEW (program mode only) ── */}
        {profile?.training_mode !== 'free' && weekEvents.length > 0 && (
          <View style={{ marginHorizontal: 16, marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 10, color: '#666', fontWeight: '700', letterSpacing: 1.2 }}>THIS WEEK</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/log' as any)}>
                <Text style={{ fontSize: 11, color: COLORS.accent, fontWeight: '600' }}>View all →</Text>
              </TouchableOpacity>
            </View>
            <View style={{ gap: 6 }}>
              {weekEvents.map((ev: any, idx: number) => {
                const dateObj   = new Date(ev.date + 'T00:00:00');
                const todayISO  = new Date().toISOString().slice(0, 10);
                const isToday   = ev.date === todayISO;
                const isPast    = ev.date < todayISO;
                const isDone    = ev.isCompleted;

                const dayAbbr   = ['SUN','MON','TUE','WED','THU','FRI','SAT'][dateObj.getDay()];
                const dayNum    = dateObj.getDate();

                const statusColor =
                  isDone    ? '#EF5350' :
                  isToday   ? COLORS.accent :
                  isPast    ? '#555' :
                  '#4DCEA6';

                return (
                  <TouchableOpacity
                    key={`${ev.date}-${idx}`}
                    onPress={() => {
                      if (isToday)      router.push('/(tabs)/today' as any);
                      else if (isDone)  router.push(`/session-detail?date=${ev.date}&sessionType=${encodeURIComponent(ev.sessionType)}` as any);
                      else              router.push('/(tabs)/log' as any);
                    }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      backgroundColor: isToday ? COLORS.accent + '15'
                        : isDone  ? '#EF535012'
                        : isPast  ? '#0E0E10'
                        : '#4DCEA608',
                      borderRadius: 12,
                      borderLeftWidth: 5,
                      borderLeftColor: statusColor,
                      borderWidth: 1,
                      borderColor: isToday ? COLORS.accent + '60'
                        : isDone  ? '#EF535030'
                        : isPast  ? '#1E1E22'
                        : '#4DCEA625',
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                    }}
                    activeOpacity={0.7}
                  >
                    {/* Day + date badge */}
                    <View style={{
                      width: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: statusColor + '20',
                      borderRadius: 8,
                      paddingVertical: 6,
                    }}>
                      <Text style={{ fontSize: 9, color: statusColor, fontWeight: '700', letterSpacing: 0.5 }}>{dayAbbr}</Text>
                      <Text style={{ fontSize: 18, fontWeight: '800', color: isPast && !isDone ? '#555' : '#E8E8E6' }}>{dayNum}</Text>
                    </View>

                    {/* Session type + status pill */}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: isPast && !isDone ? '#666' : '#E8E8E6' }}>
                        {ev.sessionType || 'Training'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, backgroundColor: statusColor + '25' }}>
                          <Text style={{ fontSize: 10, color: statusColor, fontWeight: '700', letterSpacing: 0.3 }}>
                            {isDone ? 'COMPLETED' : isToday ? 'TODAY' : isPast ? 'MISSED' : 'UPCOMING'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Right icon */}
                    {isDone    && <MaterialCommunityIcons name="check-circle"        size={22} color="#EF5350"      />}
                    {isToday && !isDone && <MaterialCommunityIcons name="arrow-right-circle" size={22} color={COLORS.accent} />}
                    {!isToday && !isDone && !isPast && <MaterialCommunityIcons name="chevron-right"  size={20} color="#4DCEA6" />}
                    {isPast  && !isDone && <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#666" />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

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

        {/* ── CURRENT BLOCK (program mode only, compact) ── */}
        {profile?.training_mode !== 'free' && (
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
        )} {/* end program-only current block */}

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

      {/* ── GUIDED TOUR OVERLAY ── */}
      <TourOverlay
        isVisible={showTour}
        trainingMode={profile?.training_mode === 'free' ? 'free' : 'program'}
        targetRefs={tourRefs}
        onComplete={handleTourComplete}
        scrollRef={homeScrollRef}
      />
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
  sessionCardComplete: { borderColor: COLORS.accent + '60', shadowColor: COLORS.accent, shadowOpacity: 0.12 },
  sessionCardTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  sessionTypeBadge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, borderWidth: 1 },
  sessionTypeBadgeText:{ fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5 },
  sessionCardDay:      { color: COLORS.text.muted, fontSize: FONTS.sizes.sm },
  sessionLift:         { fontSize: FONTS.sizes.xxxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 38, marginBottom: 4 },
  sessionScheme:       { fontSize: FONTS.sizes.base, color: COLORS.text.secondary, marginBottom: SPACING.sm, lineHeight: 22 },
  sessionCoachNote:    { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, fontStyle: 'italic', marginBottom: SPACING.lg, lineHeight: 20 },
  // COMPLETE state: "✓ DONE" badge (upper-right, next to session type pill)
  completedBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  completedBadgeText:  { fontSize: 11, fontWeight: FONTS.weights.heavy, color: COLORS.accent, letterSpacing: 0.5 },
  // COMPLETE state: headline — plain white, no checkmark (Issue 3C)
  sessionCompleteTitle:{ fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 30, marginBottom: 2 },
  // COMPLETE state: two-button action row (Issue 2)
  sessionCompleteBtns: { flexDirection: 'row', gap: 8, marginTop: SPACING.sm },
  // START / RESUME SESSION button — gold, full-width (PENDING + IN_PROGRESS)
  startBtn:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accent, borderRadius: RADIUS.lg, paddingVertical: 15, gap: SPACING.sm, marginTop: SPACING.sm },
  startBtnText:        { color: COLORS.primary, fontWeight: FONTS.weights.heavy, fontSize: FONTS.sizes.base, letterSpacing: 1 },
  // VIEW RECAP button — gold outline, flex:1 (COMPLETE state left button)
  viewRecapBtn:        { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.accent, borderRadius: 8, paddingVertical: 11 },
  viewRecapBtnText:    { color: COLORS.accent, fontWeight: '500', fontSize: 12, letterSpacing: 0.5, textAlign: 'center' },
  // TOMORROW → button — muted outline, flex:1 (COMPLETE state right button)
  tomorrowBtn:         { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', borderWidth: 0.5, borderColor: '#333', borderRadius: 8, paddingVertical: 11 },
  tomorrowBtnText:     { color: COLORS.text.muted, fontWeight: '500', fontSize: 12, letterSpacing: 0.5, textAlign: 'center' },

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
