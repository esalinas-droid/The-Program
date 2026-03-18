import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, FlatList, ActivityIndicator, Dimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';
import { prApi, bwApi } from '../../src/utils/api';
import { getProfile } from '../../src/utils/storage';
import { PRRecord } from '../../src/types';

const TRACKED_EXERCISES = [
  'SSB Box Squat', 'Back Squat', 'Bench Press', 'Floor Press', 'Close-Grip Bench Press',
  'Conventional Deadlift', 'Sumo Deadlift', 'Trap Bar Deadlift (High Handle)',
  'Block Pull (Below Knee)', 'Log Clean and Press', 'Log Push Press',
  'Axle Clean and Press', 'Axle Push Press', 'Overhead Press (Barbell)',
  'Cambered Bar Box Squat', 'Yoke Carry', 'Farmers Carry', 'Speed Box Squat',
  'Sandbag Carry', 'Suitcase Carry', 'Belt Squat',
];

const { width } = Dimensions.get('window');

export default function TrackScreen() {
  const [tab, setTab] = useState<'prs' | 'chart' | 'bw'>('prs');
  const [prs, setPrs] = useState<PRRecord[]>([]);
  const [bwHistory, setBwHistory] = useState<any[]>([]);
  const [selectedEx, setSelectedEx] = useState<string | null>(null);
  const [exHistory, setExHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      const prof = await getProfile();
      setProfile(prof);
      try {
        const [prData, bwData] = await Promise.all([prApi.getAll(), bwApi.getHistory()]);
        setPrs(prData);
        setBwHistory(bwData);
      } catch {}
      setLoading(false);
    })();
  }, []));

  async function loadExHistory(exercise: string) {
    setSelectedEx(exercise);
    setTab('chart');
    try {
      const data = await prApi.getHistory(exercise);
      setExHistory(data);
    } catch {}
  }

  if (loading) return <View style={s.loading}><ActivityIndicator color={COLORS.accent} /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>PR TRACKING</Text>
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        {[['prs', 'PR TABLE'], ['chart', 'PROGRESS CHART'], ['bw', 'BODYWEIGHT']].map(([key, label]) => (
          <TouchableOpacity testID={`track-tab-${key}`} key={key} style={[s.tabBtn, tab === key && s.tabActive]} onPress={() => setTab(key as any)}>
            <Text style={[s.tabText, tab === key && s.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'prs' && (
        <ScrollView testID="pr-table-scroll">
          <View style={s.tableHeader}>
            <Text style={[s.th, { flex: 2 }]}>EXERCISE</Text>
            <Text style={s.th}>DATE</Text>
            <Text style={s.th}>e1RM</Text>
            <Text style={s.th}>BEST</Text>
          </View>
          {prs.map((pr, i) => (
            <TouchableOpacity testID={`pr-row-${i}`} key={pr.exercise} style={[s.prRow, i % 2 === 0 && s.prRowAlt]} onPress={() => loadExHistory(pr.exercise)}>
              <Text style={[s.prCell, { flex: 2 }]} numberOfLines={1}>{pr.exercise}</Text>
              <Text style={s.prCell}>{pr.lastDate ? formatDate(pr.lastDate) : '—'}</Text>
              <Text style={[s.prCell, { color: COLORS.accentBlue, fontWeight: FONTS.weights.bold }]}>
                {pr.bestE1rm > 0 ? `${pr.bestE1rm}` : '—'}
              </Text>
              <Text style={s.prCell}>{pr.bestWeight > 0 ? `${pr.bestWeight}×${pr.bestReps}` : '—'}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {tab === 'chart' && (
        <ScrollView testID="chart-scroll">
          {selectedEx ? (
            <View style={s.chartContainer}>
              <Text style={s.chartTitle}>{selectedEx}</Text>
              <Text style={s.chartSub}>e1RM over time</Text>
              {exHistory.length < 2 ? (
                <View style={s.noChart}>
                  <Text style={s.noChartText}>Log more sessions to see your progress curve.</Text>
                </View>
              ) : (
                <SimpleLineChart data={exHistory.map(d => ({ x: d.week, y: d.e1rm, label: d.date }))} />
              )}
            </View>
          ) : (
            <View style={s.noChart}>
              <Text style={s.noChartText}>Tap an exercise in the PR Table to view its progress chart.</Text>
            </View>
          )}
          <View style={s.exList}>
            <Text style={s.exListHeader}>SELECT EXERCISE</Text>
            {TRACKED_EXERCISES.map(ex => (
              <TouchableOpacity testID={`select-ex-${ex}`} key={ex} style={[s.exItem, selectedEx === ex && s.exItemActive]} onPress={() => loadExHistory(ex)}>
                <Text style={[s.exItemText, selectedEx === ex && { color: COLORS.accent }]}>{ex}</Text>
                <Text style={s.exItemArrow}>→</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {tab === 'bw' && (
        <ScrollView testID="bw-scroll">
          <View style={s.bwContainer}>
            <Text style={s.chartTitle}>Bodyweight Trend</Text>
            {profile && (
              <View style={s.bwGoals}>
                <View style={s.bwGoalRow}>
                  <Text style={s.bwGoalLabel}>Current</Text>
                  <Text style={[s.bwGoalVal, { color: COLORS.text.primary }]}>{profile.currentBodyweight} lbs</Text>
                </View>
                <View style={s.bwGoalRow}>
                  <Text style={s.bwGoalLabel}>12-Week Goal</Text>
                  <Text style={[s.bwGoalVal, { color: COLORS.accentBlue }]}>{profile.bw12WeekGoal} lbs</Text>
                </View>
                <View style={s.bwGoalRow}>
                  <Text style={s.bwGoalLabel}>Long-Run Goal</Text>
                  <Text style={[s.bwGoalVal, { color: COLORS.accent }]}>{profile.bwLongRunGoal} lbs</Text>
                </View>
              </View>
            )}
            {bwHistory.length < 2 ? (
              <View style={s.noChart}>
                <Text style={s.noChartText}>Log bodyweight in the workout log to see your trend here.</Text>
              </View>
            ) : (
              <SimpleLineChart data={bwHistory.map(d => ({ x: d.date, y: d.weight, label: d.date }))} color={COLORS.accentBlue} />
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SimpleLineChart({ data, color = COLORS.accentBlue }: { data: any[]; color?: string }) {
  if (!data || data.length < 2) return null;
  const vals = data.map(d => d.y);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const W = width - SPACING.lg * 2 - SPACING.xl;
  const H = 160;

  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * W,
    y: H - ((d.y - min) / range) * H,
    val: d.y,
    label: d.label,
  }));

  return (
    <View style={{ marginHorizontal: SPACING.lg, marginVertical: SPACING.lg }}>
      <View style={{ height: H + 20, position: 'relative', borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
        {points.map((pt, i) => (
          <View key={i} style={{ position: 'absolute', left: pt.x - 4, top: pt.y - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        ))}
        {points.slice(1).map((pt, i) => {
          const prev = points[i];
          const dx = pt.x - prev.x;
          const dy = pt.y - prev.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          return (
            <View key={i} style={{ position: 'absolute', left: prev.x, top: prev.y, width: len, height: 2, backgroundColor: color, transformOrigin: '0% 50%', transform: [{ rotate: `${angle}deg` }] }} />
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ color: COLORS.text.muted, fontSize: 10 }}>{data[0].label}</Text>
        <Text style={{ color: color, fontSize: 12, fontWeight: FONTS.weights.bold }}>{max.toFixed(0)}</Text>
        <Text style={{ color: COLORS.text.muted, fontSize: 10 }}>{data[data.length - 1].label}</Text>
      </View>
    </View>
  );
}

function formatDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch { return date; }
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  loading: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  header: { padding: SPACING.lg, paddingTop: SPACING.xl },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, letterSpacing: 2 },
  tabRow: { flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.sm },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: RADIUS.md, backgroundColor: COLORS.surface },
  tabActive: { backgroundColor: COLORS.accent },
  tabText: { fontSize: 10, fontWeight: FONTS.weights.bold, color: COLORS.text.muted, letterSpacing: 1 },
  tabTextActive: { color: '#FFF' },
  tableHeader: { flexDirection: 'row', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  th: { flex: 1, fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1 },
  prRow: { flexDirection: 'row', paddingHorizontal: SPACING.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  prRowAlt: { backgroundColor: COLORS.surface + '40' },
  prCell: { flex: 1, color: COLORS.text.secondary, fontSize: FONTS.sizes.xs },
  chartContainer: { padding: SPACING.lg },
  chartTitle: { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: 4 },
  chartSub: { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, marginBottom: SPACING.lg },
  noChart: { margin: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center' },
  noChartText: { color: COLORS.text.muted, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 22 },
  exList: { padding: SPACING.lg },
  exListHeader: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2, marginBottom: SPACING.sm },
  exItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  exItemActive: { borderLeftWidth: 2, borderLeftColor: COLORS.accent, paddingLeft: 8 },
  exItemText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm },
  exItemArrow: { color: COLORS.text.muted },
  bwContainer: { padding: SPACING.lg },
  bwGoals: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg },
  bwGoalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  bwGoalLabel: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm },
  bwGoalVal: { fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.sm },
});
