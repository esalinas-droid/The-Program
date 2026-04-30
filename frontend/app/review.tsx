import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Animated, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, FONTS, RADIUS, getSessionStyle } from '../src/constants/theme';
import { sessionRatingApi } from '../src/utils/api';
import AskCoachButton from '../src/components/AskCoachButton';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s > 0 ? `${s}s` : ''}`.trim();
  return `${s}s`;
}

function buildWins(completionPct: number, setsLogged: number): string[] {
  const wins: string[] = [];
  if (completionPct >= 90) wins.push('Near-perfect session completion');
  else if (completionPct >= 75) wins.push('Solid work rate — majority of sets done');
  else if (completionPct >= 50) wins.push('Session logged and effort recorded');
  if (setsLogged >= 20) wins.push('High-volume session — max adaptation stimulus');
  else if (setsLogged >= 12) wins.push('Good set volume — consistent stimulus applied');
  if (wins.length === 0) wins.push('You showed up. That\'s the whole game.');
  wins.push('Recovery window open — eat protein, drink water, sleep 8+');
  return wins;
}

function buildCoachNote(completionPct: number, sessionType: string): string {
  const type = sessionType.toLowerCase();
  if (completionPct >= 90) {
    if (type.includes('me')) return 'Outstanding max-effort execution. Every heavy single you grind is a neural adaptation deposit. Eat big tonight — this is when you grow.';
    if (type.includes('de')) return 'Textbook dynamic-effort session. Bar speed was the goal, and you hit it. Repeat this pattern and the speed transfers to your max days.';
    return 'Outstanding execution. Every set you log is data that feeds the next cycle. Eat, sleep, and come back ready.';
  }
  if (completionPct >= 70) {
    return 'Solid work today. The sets you logged are in the bank. Recovery starts now — protein within 30 minutes, and prioritize sleep tonight.';
  }
  return 'Session logged. Consistency is the multiplier — showing up even when it\'s not your best day builds the base. Rest up and come back stronger.';
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    setsLogged:  string;
    totalSets:   string;
    sessionType: string;
    week:        string;
    duration:    string;
  }>();

  const setsLogged  = parseInt(params.setsLogged  || '0', 10);
  const totalSets   = parseInt(params.totalSets   || '0', 10);
  const sessionType = params.sessionType           || 'Session';
  const week        = parseInt(params.week         || '1', 10);
  const duration    = parseInt(params.duration     || '0', 10);

  const completionPct = totalSets > 0 ? Math.round((setsLogged / totalSets) * 100) : 0;
  const wins          = buildWins(completionPct, setsLogged);
  const coachNote     = buildCoachNote(completionPct, sessionType);
  const sessionColors = getSessionStyle(sessionType);

  // ── RPE / insight state ──────────────────────────────────────────────────────
  const [rpe, setRpe]           = useState(7);
  const [rpeSubmitted, setRpeSubmitted] = useState(false);
  const [rpeLoading, setRpeLoading]   = useState(false);
  const [aiInsight, setAiInsight]     = useState('');
  const rpeAnim = useRef(new Animated.Value(0)).current;

  // ── Completion ring color ─────────────────────────────────────────────────
  const ringColor = completionPct >= 80
    ? COLORS.status.success
    : completionPct >= 50
      ? COLORS.accent
      : COLORS.status.error;

  // ── RPE submit ───────────────────────────────────────────────────────────────
  const handleRpeSubmit = async () => {
    if (rpeSubmitted || rpeLoading) return;
    setRpeLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await sessionRatingApi.submit({
        sessionType, week, rpe,
        setsLogged, totalSets,
      });
      setAiInsight(result.aiInsight || '');
      setRpeSubmitted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.timing(rpeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    } catch (e) {
      console.warn('RPE submit failed:', e);
      setRpeSubmitted(true); // show fallback anyway
    } finally {
      setRpeLoading(false);
    }
  };

  // ── Animations ──────────────────────────────────────────────────────────────
  const scalePulse = useRef(new Animated.Value(0.7)).current;
  const heroAnim   = useRef(new Animated.Value(0)).current;
  const statsAnim  = useRef(new Animated.Value(0)).current;
  const winsAnim   = useRef(new Animated.Value(0)).current;
  const coachAnim  = useRef(new Animated.Value(0)).current;
  const ctaAnim    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.sequence([
      Animated.spring(scalePulse, { toValue: 1, tension: 55, friction: 7, useNativeDriver: true }),
      Animated.stagger(90, [
        Animated.timing(heroAnim,  { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(statsAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(winsAnim,  { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(coachAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(ctaAnim,   { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const fadeUp = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
  });

  // ── Stats grid data ─────────────────────────────────────────────────────────
  const stats = [
    {
      icon:  'check-all' as const,
      label: 'SETS LOGGED',
      value: `${setsLogged}/${totalSets}`,
      color: setsLogged >= totalSets ? COLORS.status.success : COLORS.accent,
    },
    {
      icon:  'percent' as const,
      label: 'COMPLETION',
      value: `${completionPct}%`,
      color: ringColor,
    },
    {
      icon:  'clock-fast' as const,
      label: 'DURATION',
      value: duration > 0 ? formatDuration(duration) : '—',
      color: COLORS.text.primary,
    },
    {
      icon:  'calendar-week' as const,
      label: 'WEEK',
      value: `WK ${week}`,
      color: sessionColors.text,
    },
  ];

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={Platform.OS === 'ios'}
      >
        {/* ── Hero ── */}
        <Animated.View style={[s.hero, fadeUp(heroAnim)]}>
          <Animated.View style={[s.heroIconWrap, { transform: [{ scale: scalePulse }] }]}>
            <MaterialCommunityIcons name="flag-checkered" size={38} color={COLORS.primary} />
          </Animated.View>

          <Text style={s.heroTitle}>SESSION COMPLETE</Text>

          {/* Session type badge */}
          <View style={[s.sessionBadge, { backgroundColor: sessionColors.bg, borderColor: sessionColors.borderColor }]}>
            <Text style={[s.sessionBadgeText, { color: sessionColors.text }]}>
              {sessionType.toUpperCase()}
            </Text>
          </View>
        </Animated.View>

        {/* ── Stats grid ── */}
        <Animated.View style={[s.statsGrid, fadeUp(statsAnim)]}>
          {stats.map((stat, i) => (
            <View key={i} style={s.statCard}>
              <MaterialCommunityIcons name={stat.icon} size={16} color={stat.color} style={s.statIcon} />
              <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </Animated.View>

        {/* ── RPE Rating Card ── */}
        <Animated.View style={[s.rpeCard, fadeUp(statsAnim)]}>
          <View style={s.cardHeader}>
            <View style={[s.cardIconBadge, { backgroundColor: COLORS.accent + '25' }]}>
              <MaterialCommunityIcons name="gauge" size={14} color={COLORS.accent} />
            </View>
            <View>
              <Text style={s.cardTitle}>RATE YOUR SESSION</Text>
              <Text style={s.cardSub}>How hard did it feel?</Text>
            </View>
          </View>

          {!rpeSubmitted ? (
            <>
              {/* RPE bubbles */}
              <View style={s.rpeRow}>
                {[1,2,3,4,5,6,7,8,9,10].map(v => {
                  const col = v >= 8 ? '#EF5350' : v >= 5 ? COLORS.accent : TEAL;
                  return (
                    <TouchableOpacity
                      key={v}
                      style={[s.rpeBubble, rpe === v && { backgroundColor: col, borderColor: col }]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setRpe(v); }}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.rpeNum, rpe === v && { color: COLORS.primary }]}>{v}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={s.rpeLabelRow}>
                <Text style={s.rpeLabelText}>Easy</Text>
                <Text style={[s.rpeLabelText, { color: COLORS.accent }]}>RPE {rpe}</Text>
                <Text style={s.rpeLabelText}>Max</Text>
              </View>
              <TouchableOpacity
                style={[s.rpeSubmitBtn, rpeLoading && { opacity: 0.6 }]}
                onPress={handleRpeSubmit}
                disabled={rpeLoading}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name={rpeLoading ? 'loading' : 'check'} size={16} color={COLORS.primary} />
                <Text style={s.rpeSubmitText}>{rpeLoading ? 'ANALYSING...' : 'LOG RPE'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={s.rpeSubmittedRow}>
              <MaterialCommunityIcons name="check-circle" size={18} color={TEAL} />
              <Text style={s.rpeSubmittedText}>RPE {rpe}/10 logged</Text>
            </View>
          )}
        </Animated.View>

        {/* ── AI Insight Card (shown after RPE submit) ── */}
        {rpeSubmitted && aiInsight ? (
          <Animated.View style={[s.insightCard, { opacity: rpeAnim, transform: [{ translateY: rpeAnim.interpolate({ inputRange: [0,1], outputRange: [20, 0] }) }] }]}>
            <View style={s.cardHeader}>
              <View style={[s.cardIconBadge, { backgroundColor: '#7C3AED25' }]}>
                <MaterialCommunityIcons name="creation" size={14} color='#7C3AED' />
              </View>
              <View>
                <Text style={[s.cardTitle, { color: '#7C3AED' }]}>COACH INSIGHT</Text>
                <Text style={s.cardSub}>AI-generated from your data</Text>
              </View>
            </View>
            <Text style={s.insightText}>{aiInsight}</Text>
          </Animated.View>
        ) : null}

        {/* ── Wins card ── */}
        <Animated.View style={[s.card, fadeUp(winsAnim)]}>
          <View style={s.cardHeader}>
            <View style={[s.cardIconBadge, { backgroundColor: COLORS.status.success + '25' }]}>
              <MaterialCommunityIcons name="trophy-outline" size={14} color={COLORS.status.success} />
            </View>
            <Text style={s.cardTitle}>TODAY'S WINS</Text>
          </View>
          {wins.map((win, i) => (
            <View key={i} style={s.winRow}>
              <View style={[s.winBullet, { backgroundColor: i === 0 ? COLORS.status.success : COLORS.accent }]} />
              <Text style={s.winText}>{win}</Text>
            </View>
          ))}
        </Animated.View>

        {/* ── Coach note ── */}
        <Animated.View style={[s.coachCard, fadeUp(coachAnim)]}>
          <View style={s.cardHeader}>
            <View style={[s.cardIconBadge, { backgroundColor: COLORS.accent + '25' }]}>
              <MaterialCommunityIcons name="brain" size={14} color={COLORS.accent} />
            </View>
            <View>
              <Text style={s.cardTitle}>COACH'S WRAP</Text>
              <Text style={s.cardSub}>Post-session note</Text>
            </View>
          </View>
          <Text style={s.coachText}>{coachNote}</Text>
        </Animated.View>

        {/* ── What's next ── */}
        <Animated.View style={[s.nextCard, fadeUp(coachAnim)]}>
          <View style={s.cardHeader}>
            <View style={[s.cardIconBadge, { backgroundColor: COLORS.accentBlue + '25' }]}>
              <MaterialCommunityIcons name="arrow-right-circle-outline" size={14} color={COLORS.accentBlue} />
            </View>
            <Text style={s.cardTitle}>NEXT STEPS</Text>
          </View>
          <View style={s.nextRow}>
            <MaterialCommunityIcons name="food-drumstick-outline" size={15} color={COLORS.text.muted} />
            <Text style={s.nextText}>Eat 40–60g protein within 30 min</Text>
          </View>
          <View style={s.nextRow}>
            <MaterialCommunityIcons name="water-outline" size={15} color={COLORS.text.muted} />
            <Text style={s.nextText}>Hydrate: 16–24 oz water</Text>
          </View>
          <View style={s.nextRow}>
            <MaterialCommunityIcons name="sleep" size={15} color={COLORS.text.muted} />
            <Text style={s.nextText}>Target 8+ hours sleep tonight</Text>
          </View>
          <View style={s.nextRow}>
            <MaterialCommunityIcons name="chart-line" size={15} color={COLORS.text.muted} />
            <Text style={s.nextText}>Check the Track tab for your updated PRs</Text>
          </View>

          {/* ── Ask Coach to review this session ── */}
          <AskCoachButton
            seedPrompt={`Review my ${params.sessionType || 'training'} session. What's the takeaway? What should I do differently next time?`}
            triggerName="session_review_inquiry"
            label="Review with Coach"
            size="sm"
            style={{ marginTop: 12, alignSelf: 'center' }}
          />
        </Animated.View>

        <View style={{ height: 130 }} />
      </ScrollView>

      {/* ── Fixed bottom CTA ── */}
      <Animated.View style={[s.ctaBar, fadeUp(ctaAnim)]}>
        <TouchableOpacity
          style={s.primaryBtn}
          onPress={() => router.replace('/(tabs)')}
          activeOpacity={0.87}
        >
          <Text style={s.primaryBtnText}>BACK TO DASHBOARD</Text>
          <MaterialCommunityIcons name="home-outline" size={17} color={COLORS.primary} />
        </TouchableOpacity>
        <View style={s.secondaryBtnRow}>
          <TouchableOpacity
            style={s.secondaryBtn}
            onPress={() => router.push('/(tabs)/log')}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="pencil-plus-outline" size={15} color={COLORS.text.muted} />
            <Text style={s.secondaryBtnText}>Log More</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.secondaryBtn, { borderLeftWidth: 1, borderLeftColor: COLORS.border, paddingLeft: SPACING.md }]}
            onPress={() => router.push({ pathname: '/(tabs)/today' } as any)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="alert-circle-outline" size={15} color='#EF5350' />
            <Text style={[s.secondaryBtnText, { color: '#EF5350' }]}>Report Pain</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const TEAL = '#4DCEA6';

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: COLORS.background },
  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: SPACING.xl },

  // Hero
  hero: {
    alignItems: 'center',
    paddingTop: SPACING.xxl + SPACING.lg,
    paddingBottom: SPACING.xl,
    paddingHorizontal: SPACING.lg,
  },
  heroIconWrap: {
    width: 86, height: 86, borderRadius: 43,
    backgroundColor: COLORS.accent,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: SPACING.lg,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  heroTitle: {
    fontSize: FONTS.sizes.xxxl,
    fontWeight: FONTS.weights.heavy,
    color: COLORS.text.primary,
    letterSpacing: 2.5,
    marginBottom: SPACING.md,
  },
  sessionBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    marginTop: SPACING.xs,
  },
  sessionBadgeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.heavy,
    letterSpacing: 1.5,
  },

  // Stats grid
  statsGrid:  {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statIcon:  { marginBottom: SPACING.sm },
  statValue: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: FONTS.weights.heavy,
    lineHeight: 28,
    marginBottom: 3,
  },
  statLabel: {
    fontSize: 9,
    color: COLORS.text.muted,
    fontWeight: FONTS.weights.heavy,
    letterSpacing: 1.2,
  },

  // Cards
  card: {
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  cardIconBadge: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  cardTitle: {
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.heavy,
    color: COLORS.text.primary,
    letterSpacing: 1,
  },
  cardSub: {
    fontSize: FONTS.sizes.xs - 1,
    color: COLORS.text.muted,
    marginTop: 1,
  },

  // Wins
  winRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: 5,
  },
  winBullet: {
    width: 6, height: 6, borderRadius: 3,
    marginTop: 6,
    flexShrink: 0,
  },
  winText: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    lineHeight: 20,
  },

  // Coach card
  coachCard: {
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },
  coachText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    lineHeight: 22,
  },

  // What's next card
  nextCard: {
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 6,
  },
  nextText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    lineHeight: 20,
    flex: 1,
  },

  // CTA bar
  ctaBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg + (Platform.OS === 'ios' ? 8 : 0),
    gap: SPACING.sm,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.lg,
    paddingVertical: 15,
    gap: SPACING.sm,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 7,
  },
  primaryBtnText: {
    color: COLORS.primary,
    fontSize: FONTS.sizes.base,
    fontWeight: FONTS.weights.heavy,
    letterSpacing: 1.2,
  },
  secondaryBtnRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  secondaryBtnText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    fontWeight: FONTS.weights.semibold,
  },

  // RPE Card
  rpeCard: {
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rpeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 3,
    marginBottom: SPACING.sm,
  },
  rpeBubble: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 1.5, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
  },
  rpeNum: {
    fontSize: 11, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted,
  },
  rpeLabelRow: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.md,
  },
  rpeLabelText: {
    fontSize: 10, color: COLORS.text.muted,
  },
  rpeSubmitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, backgroundColor: COLORS.accent, borderRadius: RADIUS.lg, paddingVertical: 12,
  },
  rpeSubmitText: {
    color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, letterSpacing: 1,
  },
  rpeSubmittedRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, justifyContent: 'center', paddingVertical: SPACING.sm,
  },
  rpeSubmittedText: {
    fontSize: FONTS.sizes.base, color: TEAL, fontWeight: FONTS.weights.semibold,
  },

  // AI Insight Card
  insightCard: {
    marginHorizontal: SPACING.lg,
    backgroundColor: '#7C3AED10',
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: '#7C3AED40',
  },
  insightText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    lineHeight: 22,
    fontStyle: 'italic',
  },
});
