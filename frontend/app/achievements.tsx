import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { streakApi, badgesApi, questApi } from '../src/utils/api';
import { COLORS, FONTS, RADIUS } from '../src/constants/theme';

const BG   = '#0A0A0C';
const CARD = '#111114';
const GOLD = '#C9A84C';
const RED  = '#E05252';
const AMBER= '#FF9500';
const BORDER = '#1E1E22';

// ── Helpers ──────────────────────────────────────────────────────────────────
function getWeekDates(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(mon);
    d.setDate(mon.getDate() - i * 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

function currentWeekMonday(): string {
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
  return `${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,'0')}-${String(mon.getDate()).padStart(2,'0')}`;
}

// ── Badge Card ────────────────────────────────────────────────────────────────
function BadgeCard({ badge, earned }: { badge: any; earned: boolean }) {
  return (
    <View style={[bStyle.card, earned ? bStyle.earnedCard : bStyle.lockedCard]}>
      <View style={[bStyle.iconCircle, earned ? bStyle.earnedCircle : bStyle.lockedCircle]}>
        <MaterialCommunityIcons
          name={badge.icon as any}
          size={20}
          color={earned ? GOLD : '#444'}
        />
      </View>
      <Text style={[bStyle.name, !earned && { color: '#555' }]}>{badge.name}</Text>
      <Text style={bStyle.desc}>{badge.desc}</Text>
    </View>
  );
}
const bStyle = StyleSheet.create({
  card:          { flex: 1, backgroundColor: CARD, borderRadius: RADIUS.lg, padding: 14, alignItems: 'center', gap: 6 },
  earnedCard:    { borderWidth: 1, borderColor: GOLD + '40' },
  lockedCard:    { borderWidth: 1, borderColor: BORDER, opacity: 0.6 },
  iconCircle:    { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  earnedCircle:  { backgroundColor: GOLD + '20', borderWidth: 1, borderColor: GOLD + '40' },
  lockedCircle:  { backgroundColor: '#1A1A1E' },
  name:          { fontSize: 12, fontWeight: FONTS.weights.bold, color: COLORS.text.primary, textAlign: 'center' },
  desc:          { fontSize: 10, color: COLORS.text.muted, textAlign: 'center', lineHeight: 14 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function AchievementsScreen() {
  const router = useRouter();
  const [loading, setLoading]   = useState(true);
  const [streak, setStreak]     = useState<any>(null);
  const [badges, setBadges]     = useState<any>(null);
  const [quest, setQuest]       = useState<any>(null);
  const glowAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    (async () => {
      try {
        const [s, b, q] = await Promise.all([
          streakApi.get().catch(() => null),
          badgesApi.get().catch(() => null),
          questApi.get().catch(() => null),
        ]);
        setStreak(s); setBadges(b); setQuest(q);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Streak glow on new record
  useEffect(() => {
    if (streak && streak.currentStreak >= streak.longestStreak && streak.currentStreak > 0) {
      Animated.loop(Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.6, duration: 900, useNativeDriver: true }),
      ]), { iterations: 2 }).start();
    }
  }, [streak]);

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <ActivityIndicator color={GOLD} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  const past12Weeks  = getWeekDates(12);
  const currMonday   = currentWeekMonday();
  const trainedWeeks = new Set<string>(streak?.trainedWeeks || []);
  const freezeWeeks  = new Set<string>(streak?.freezesUsed || []);

  const qCurrent = quest?.progress?.current ?? 0;
  const qTarget  = quest?.progress?.target  ?? 1;
  const qPct     = Math.min(100, (qCurrent / qTarget) * 100);

  const earnedBadges = badges?.earned || [];
  const lockedBadges = badges?.locked || [];

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.text.primary} />
        </TouchableOpacity>
        <Text style={s.title}>Achievements</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

        {/* ── Streak Hero ─────────────────────────────────────────────────── */}
        <Animated.View style={[s.streakHero, { opacity: glowAnim }]}>
          <View style={s.streakFlame}>
            <MaterialCommunityIcons name="fire" size={40} color={AMBER} />
          </View>
          <Text style={s.streakCount}>{streak?.currentStreak ?? 0}</Text>
          <Text style={s.streakLabel}>WEEK{streak?.currentStreak !== 1 ? 'S' : ''} STREAK</Text>
          {streak?.currentStreak > 0 && streak?.currentStreak >= (streak?.longestStreak ?? 0) && (
            <View style={s.newRecordBadge}>
              <Text style={s.newRecordText}>🏆 NEW RECORD</Text>
            </View>
          )}

          {/* Stats row */}
          <View style={s.streakStats}>
            {[
              { label: 'BEST', value: `${streak?.longestStreak ?? 0}wk` },
              { label: 'TOTAL', value: `${streak?.totalWeeksTrained ?? 0}wk` },
            ].map(({ label, value }) => (
              <View key={label} style={s.streakStat}>
                <Text style={s.streakStatVal}>{value}</Text>
                <Text style={s.streakStatLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ── Freeze Indicator ────────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.freezeRow}>
            <MaterialCommunityIcons name="snowflake" size={14} color="#5B9CF7" />
            <Text style={s.freezeLabel}>Streak Freezes</Text>
            <View style={s.freezeDots}>
              {[0, 1].map(i => (
                <View
                  key={i}
                  style={[s.freezeDot, i < (streak?.freezesAvailable ?? 0) ? s.freezeDotFull : s.freezeDotEmpty]}
                />
              ))}
            </View>
            <Text style={s.freezeDesc}>{streak?.freezesAvailable ?? 0} available</Text>
          </View>
        </View>

        {/* ── Streak Calendar ─────────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>TRAINING CALENDAR</Text>
          <View style={s.calGrid}>
            {past12Weeks.map((wk) => {
              const isTrained  = trainedWeeks.has(wk);
              const isFreeze   = freezeWeeks.has(wk);
              const isCurrent  = wk === currMonday;
              return (
                <View
                  key={wk}
                  style={[
                    s.calCell,
                    isTrained  ? s.calTrained :
                    isFreeze   ? s.calFreeze  :
                    isCurrent  ? s.calCurrent :
                    s.calEmpty,
                    isCurrent  && s.calCurrentBorder,
                  ]}
                />
              );
            })}
          </View>
          <View style={s.calLegend}>
            {[
              { color: AMBER + 'CC', label: 'Trained' },
              { color: '#5B9CF7CC', label: 'Freeze used' },
              { color: '#555',      label: 'Missed' },
            ].map(({ color, label }) => (
              <View key={label} style={s.calLegendItem}>
                <View style={[s.calLegendDot, { backgroundColor: color }]} />
                <Text style={s.calLegendText}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Weekly Quest ────────────────────────────────────────────────── */}
        {quest && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>WEEKLY QUEST</Text>
            <View style={s.questCard}>
              <View style={s.questHeader}>
                <MaterialCommunityIcons name="lightning-bolt" size={16} color={GOLD} />
                <Text style={s.questTitle}>{quest.title}</Text>
              </View>
              <View style={s.questProgressRow}>
                <View style={s.questBar}>
                  <View style={[s.questBarFill, { width: `${qPct}%` as any }]} />
                </View>
                <Text style={s.questCount}>{qCurrent}/{qTarget}</Text>
              </View>
              {quest.progress?.completed && (
                <Text style={s.questDone}>✓ Completed — {quest.xpReward} XP earned</Text>
              )}
            </View>
          </View>
        )}

        {/* ── Earned Badges ───────────────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>BADGES EARNED ({earnedBadges.length} of {badges?.totalPossible ?? 0})</Text>
          {earnedBadges.length === 0 ? (
            <Text style={s.emptyText}>Log your first session to earn badges!</Text>
          ) : (
            <View style={s.badgeGrid}>
              {earnedBadges.map((b: any, i: number) => (
                <BadgeCard key={b.id} badge={b} earned />
              ))}
              {earnedBadges.length % 2 !== 0 && <View style={{ flex: 1 }} />}
            </View>
          )}
        </View>

        {/* ── Locked Badges ───────────────────────────────────────────────── */}
        {lockedBadges.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>LOCKED</Text>
            <View style={s.badgeGrid}>
              {lockedBadges.map((b: any) => (
                <BadgeCard key={b.id} badge={b} earned={false} />
              ))}
              {lockedBadges.length % 2 !== 0 && <View style={{ flex: 1 }} />}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: BG },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title:   { fontSize: 18, fontWeight: FONTS.weights.bold, color: COLORS.text.primary },

  streakHero:      { marginHorizontal: 16, marginTop: 8, backgroundColor: CARD, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: AMBER + '30', padding: 24, alignItems: 'center', gap: 6 },
  streakFlame:     { width: 64, height: 64, borderRadius: 32, backgroundColor: AMBER + '15', alignItems: 'center', justifyContent: 'center' },
  streakCount:     { fontSize: 52, fontWeight: '800', color: AMBER, lineHeight: 60 },
  streakLabel:     { fontSize: 12, color: AMBER + 'CC', fontWeight: FONTS.weights.heavy, letterSpacing: 1.5 },
  newRecordBadge:  { backgroundColor: GOLD + '20', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  newRecordText:   { fontSize: 11, color: GOLD, fontWeight: FONTS.weights.bold },
  streakStats:     { flexDirection: 'row', gap: 32, marginTop: 8 },
  streakStat:      { alignItems: 'center' },
  streakStatVal:   { fontSize: 18, fontWeight: FONTS.weights.bold, color: COLORS.text.primary },
  streakStatLabel: { fontSize: 9, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy, letterSpacing: 0.8 },

  section:      { marginHorizontal: 16, marginTop: 20 },
  sectionLabel: { fontSize: 10, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },

  freezeRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: CARD, borderRadius: RADIUS.md, padding: 14, borderWidth: 1, borderColor: '#5B9CF720' },
  freezeLabel:  { fontSize: 13, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary, flex: 1 },
  freezeDots:   { flexDirection: 'row', gap: 6 },
  freezeDot:    { width: 12, height: 12, borderRadius: 6 },
  freezeDotFull:  { backgroundColor: '#5B9CF7' },
  freezeDotEmpty: { backgroundColor: '#1E1E22', borderWidth: 1, borderColor: '#333' },
  freezeDesc:   { fontSize: 11, color: '#5B9CF7' },

  calGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  calCell:       { width: 20, height: 20, borderRadius: 4 },
  calTrained:    { backgroundColor: AMBER + 'CC' },
  calFreeze:     { backgroundColor: '#5B9CF7CC' },
  calCurrent:    { backgroundColor: '#1E1E22' },
  calEmpty:      { backgroundColor: '#1A1A1E' },
  calCurrentBorder: { borderWidth: 1, borderColor: GOLD },
  calLegend:     { flexDirection: 'row', gap: 16, marginTop: 8 },
  calLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  calLegendDot:  { width: 8, height: 8, borderRadius: 4 },
  calLegendText: { fontSize: 10, color: COLORS.text.muted },

  questCard:       { backgroundColor: CARD, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: GOLD + '30', padding: 14 },
  questHeader:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  questTitle:      { fontSize: 13, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary, flex: 1 },
  questProgressRow:{ flexDirection: 'row', alignItems: 'center', gap: 8 },
  questBar:        { flex: 1, height: 6, backgroundColor: '#1E1E22', borderRadius: 3, overflow: 'hidden' },
  questBarFill:    { height: '100%', backgroundColor: GOLD, borderRadius: 3 },
  questCount:      { fontSize: 11, color: GOLD, fontWeight: FONTS.weights.semibold, minWidth: 36, textAlign: 'right' },
  questDone:       { fontSize: 11, color: '#4DCEA6', marginTop: 6 },

  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  emptyText: { fontSize: 13, color: COLORS.text.muted, textAlign: 'center', paddingVertical: 20 },
});
