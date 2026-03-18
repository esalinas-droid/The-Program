import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS, getSessionStyle } from '../../src/constants/theme';
import { getProfile } from '../../src/utils/storage';
import { logApi, prApi } from '../../src/utils/api';
import { getTodaySession, getTodayDayName } from '../../src/data/programData';
import { getBlock, getBlockName, getPhase, isDeloadWeek } from '../../src/utils/calculations';
import { AthleteProfile, ProgramSession, WeekStats } from '../../src/types';

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

  if (loading) return <View style={s.loading}><ActivityIndicator color={COLORS.accent} size="large" /></View>;
  if (!profile) return (
    <View style={s.loading}>
      <Text style={s.noData}>No profile found</Text>
      <TouchableOpacity onPress={() => router.replace('/onboarding')} style={s.btn}>
        <Text style={s.btnText}>Set Up Profile</Text>
      </TouchableOpacity>
    </View>
  );

  const week = profile.currentWeek || 1;
  const block = getBlock(week);
  const blockName = getBlockName(block);
  const phase = getPhase(week);
  const deload = isDeloadWeek(week);
  const todayName = getTodayDayName();

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        testID="dashboard-scroll"
        style={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
      >
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.appName}>THE PROGRAM</Text>
            <Text style={s.athleteName}>{profile.name}</Text>
          </View>
          <TouchableOpacity testID="settings-btn" onPress={() => router.push('/settings')}>
            <MaterialCommunityIcons name="cog" size={24} color={COLORS.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* Program Status */}
        <View style={s.statusRow}>
          <View style={s.statusCard}>
            <Text style={s.statusNum}>{week}</Text>
            <Text style={s.statusLabel}>WEEK</Text>
          </View>
          <View style={s.statusCard}>
            <Text style={s.statusNum}>{block}</Text>
            <Text style={s.statusLabel}>BLOCK</Text>
          </View>
          <View style={[s.statusCard, s.phaseCard]}>
            <Text style={[s.statusNum, { color: COLORS.accent }]}>{phase}</Text>
            <Text style={s.statusLabel}>PHASE</Text>
          </View>
        </View>

        {deload && (
          <View testID="deload-badge" style={s.deloadBanner}>
            <MaterialCommunityIcons name="refresh" size={16} color="#808080" />
            <Text style={s.deloadText}> DELOAD WEEK — Keep intensity low. Move well.</Text>
          </View>
        )}

        <Text style={s.sectionTitle}>BLOCK {block}: {blockName}</Text>

        {/* Today's Session Card */}
        {todaySession && todaySession.sessionType !== 'Off' && (
          <TouchableOpacity testID="today-session-card" style={s.sessionCard} onPress={() => router.push('/(tabs)/today')}>
            {(() => {
              const sc = getSessionStyle(todaySession.sessionType);
              return (
                <>
                  <View style={[s.sessionBadge, { backgroundColor: sc.bg }]}>
                    <Text style={[s.sessionBadgeText, { color: sc.text }]}>{todaySession.sessionType}</Text>
                  </View>
                  <Text style={s.sessionLift}>{todaySession.mainLift}</Text>
                  <Text style={s.sessionScheme}>{todaySession.topSetScheme}</Text>
                  <View style={s.sessionFooter}>
                    <Text style={s.sessionDay}>{todayName}</Text>
                    <Text style={s.sessionArrow}>View Full Session →</Text>
                  </View>
                </>
              );
            })()}
          </TouchableOpacity>
        )}
        {todaySession?.sessionType === 'Off' && (
          <View style={s.offCard}>
            <Text style={s.offText}>☀️ Rest Day — Sunday is off. Let the adaptation happen.</Text>
          </View>
        )}

        {/* Week Stats */}
        <Text style={s.sectionTitle}>THIS WEEK</Text>
        <View style={s.statsGrid}>
          <StatBox label="AVG PAIN" value={weekStats?.avgPain?.toFixed(1) ?? '—'} color={weekStats && weekStats.avgPain >= 3 ? '#CF6679' : COLORS.text.primary} testID="stat-pain" />
          <StatBox label="AVG RPE" value={weekStats?.avgRPE?.toFixed(1) ?? '—'} testID="stat-rpe" />
          <StatBox label="COMPLETION" value={weekStats ? `${weekStats.completionRate}%` : '—'} testID="stat-completion" />
          <StatBox label="BODYWEIGHT" value={profile.currentBodyweight ? `${profile.currentBodyweight} lbs` : '—'} testID="stat-bw" />
        </View>

        {/* E1RM Bests */}
        {bests && (
          <>
            <Text style={s.sectionTitle}>BEST E1RMS (LOG)</Text>
            <View style={s.bestsGrid}>
              <BestBox label="SQUAT" data={bests.squat} />
              <BestBox label="PRESS" data={bests.press} />
              <BestBox label="PULL" data={bests.pull} />
            </View>
          </>
        )}

        {/* Baseline PRs */}
        <Text style={s.sectionTitle}>BASELINE PRs (PROGRAM START)</Text>
        <View style={s.prCard}>
          {profile.basePRs && Object.entries(profile.basePRs).slice(0, 6).map(([key, val]) => (
            <View key={key} style={s.prRow}>
              <Text style={s.prKey}>{formatPRKey(key)}</Text>
              <Text style={s.prVal}>{val} lbs</Text>
            </View>
          ))}
        </View>

        {/* Injury Watch */}
        {profile.injuryFlags && profile.injuryFlags.length > 0 && (
          <>
            <Text style={s.sectionTitle}>INJURY WATCH</Text>
            <View style={s.injuryCard}>
              {profile.injuryFlags.map(flag => (
                <View key={flag} style={s.injuryRow}>
                  <Text style={s.injuryDot}>⚠</Text>
                  <Text style={s.injuryText}>{flag}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Nutrition Panel (Mock) */}
        <Text style={s.sectionTitle}>NUTRITION</Text>
        <View style={s.nutritionCard}>
          <View style={s.nutritionHeader}>
            <Text style={s.nutritionTitle}>Today's Intake</Text>
            <View style={s.mockBadge}><Text style={s.mockBadgeText}>SAMPLE DATA</Text></View>
          </View>
          <View style={s.calorieRow}>
            <Text style={s.calorieNum}>2,840</Text>
            <Text style={s.calorieLabel}>/ 3,200 kcal target</Text>
          </View>
          <View style={s.progressBar}><View style={[s.progressFill, { width: '89%' }]} /></View>
          <View style={s.macroRow}>
            <MacroBox label="PROTEIN" value="218g" color="#4CAF50" />
            <MacroBox label="CARBS" value="312g" color={COLORS.accentBlue} />
            <MacroBox label="FAT" value="82g" color={COLORS.accent} />
          </View>
          <TouchableOpacity testID="connect-loseit-btn" style={s.connectBtn}>
            <Text style={s.connectBtnText}>Connect Lose It for Live Data →</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({ label, value, color, testID }: any) {
  return (
    <View testID={testID} style={s.statBox}>
      <Text style={[s.statValue, color && { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}
function BestBox({ label, data }: any) {
  return (
    <View style={s.bestBox}>
      <Text style={s.bestLabel}>{label}</Text>
      <Text style={s.bestValue}>{data?.e1rm ? `${data.e1rm} lbs` : '—'}</Text>
      <Text style={s.bestExercise}>{data?.exercise ?? 'No data yet'}</Text>
    </View>
  );
}
function MacroBox({ label, value, color }: any) {
  return (
    <View style={s.macroBox}>
      <Text style={[s.macroValue, { color }]}>{value}</Text>
      <Text style={s.macroLabel}>{label}</Text>
    </View>
  );
}
function formatPRKey(key: string): string {
  const map: Record<string, string> = {
    backSquat: 'Back Squat', benchPress: 'Bench Press', axleDeadlift: 'Axle Deadlift',
    axleOverhead: 'Axle OH', logPress: 'Log Press', yokeLoad: 'Yoke Load',
    farmersPerHand: 'Farmers / hand', ssbBoxSquat: 'SSB Box Squat',
  };
  return map[key] || key;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  loading: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  noData: { color: COLORS.text.secondary, marginBottom: 16, fontSize: FONTS.sizes.base },
  btn: { backgroundColor: COLORS.accent, padding: 12, borderRadius: RADIUS.md },
  btnText: { color: '#FFF', fontWeight: FONTS.weights.bold },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: SPACING.lg, paddingTop: SPACING.xl },
  appName: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.accent, letterSpacing: 3, marginBottom: 2 },
  athleteName: { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  statusRow: { flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.sm },
  statusCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center' },
  phaseCard: { flex: 1.5 },
  statusNum: { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 28 },
  statusLabel: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontWeight: FONTS.weights.bold, letterSpacing: 1 },
  deloadBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F0F0', margin: SPACING.lg, marginTop: 0, borderRadius: RADIUS.md, padding: SPACING.md },
  deloadText: { color: '#808080', fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold },
  sectionTitle: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, marginTop: SPACING.sm },
  sessionCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderLeftWidth: 4, borderLeftColor: COLORS.accent, marginBottom: SPACING.sm },
  sessionBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, marginBottom: SPACING.sm },
  sessionBadgeText: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold },
  sessionLift: { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: 4 },
  sessionScheme: { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, marginBottom: SPACING.md },
  sessionFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionDay: { color: COLORS.text.muted, fontSize: FONTS.sizes.sm },
  sessionArrow: { color: COLORS.accent, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold },
  offCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm },
  offText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.base },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.sm },
  statBox: { flex: 1, minWidth: '45%', backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center' },
  statValue: { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  statLabel: { fontSize: 10, color: COLORS.text.muted, fontWeight: FONTS.weights.bold, letterSpacing: 1, marginTop: 2 },
  bestsGrid: { flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.sm },
  bestBox: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md },
  bestLabel: { fontSize: 10, color: COLORS.text.muted, fontWeight: FONTS.weights.bold, letterSpacing: 1 },
  bestValue: { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.accentBlue, marginTop: 4 },
  bestExercise: { fontSize: 10, color: COLORS.text.muted, marginTop: 2 },
  prCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm },
  prRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  prKey: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm },
  prVal: { color: COLORS.text.primary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.sm },
  injuryCard: { marginHorizontal: SPACING.lg, backgroundColor: '#1A0F0A', borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: '#4A2010', marginBottom: SPACING.sm },
  injuryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  injuryDot: { color: COLORS.accent, marginRight: 8, fontSize: FONTS.sizes.sm },
  injuryText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm },
  nutritionCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm },
  nutritionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  nutritionTitle: { color: COLORS.text.primary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.sm },
  mockBadge: { backgroundColor: '#0D2B3E', paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.full },
  mockBadgeText: { color: COLORS.accentBlue, fontSize: 10, fontWeight: FONTS.weights.bold },
  calorieRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: SPACING.sm },
  calorieNum: { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  calorieLabel: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm },
  progressBar: { height: 8, backgroundColor: COLORS.surfaceHighlight, borderRadius: 4, marginBottom: SPACING.md },
  progressFill: { height: 8, backgroundColor: COLORS.accent, borderRadius: 4 },
  macroRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: SPACING.md },
  macroBox: { alignItems: 'center' },
  macroValue: { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy },
  macroLabel: { fontSize: 10, color: COLORS.text.muted, fontWeight: FONTS.weights.bold, letterSpacing: 1 },
  connectBtn: { borderWidth: 1, borderColor: COLORS.accentBlue, borderRadius: RADIUS.md, padding: 10, alignItems: 'center' },
  connectBtnText: { color: COLORS.accentBlue, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold },
});
