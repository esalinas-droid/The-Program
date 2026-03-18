import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';
import { logApi, checkinApi } from '../../src/utils/api';
import { getProfile } from '../../src/utils/storage';
import { getBlock, getBlockName, getPhase, DELOAD_WEEKS } from '../../src/utils/calculations';
import { CheckInData } from '../../src/types';

export default function CheckInScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [weekStats, setWeekStats] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [history, setHistory] = useState<CheckInData[]>([]);

  useFocusEffect(useCallback(() => {
    (async () => {
      const prof = await getProfile();
      setProfile(prof);
      const week = prof?.currentWeek || 1;
      try {
        const [stats, checkins] = await Promise.all([
          logApi.weekStats(week),
          checkinApi.list(),
        ]);
        setWeekStats(stats);
        setHistory(checkins);
      } catch {}
      setLoading(false);
    })();
  }, []));

  function generateRecommendations(stats: any, prof: any): string[] {
    const recs: string[] = [];
    if (stats?.avgPain >= 3) recs.push('⚠ Avg pain is high. Reduce hinge stress next week. Add extra rehab and core-focused work.');
    if (stats?.avgRPE >= 9) recs.push('⚠ Intensity is very high. Trim accessories 20% next week. Protect the main lifts.');
    if (stats?.completionRate < 75) recs.push('⚠ Completion is low. Simplify next week. Run minimum viable sessions only.');
    if (recs.length === 0) recs.push('✓ Strong week. Continue progression as planned.');
    return recs;
  }

  async function handleCompleteCheckIn() {
    if (!profile) return;
    setSaving(true);
    const week = profile.currentWeek || 1;
    const recs = generateRecommendations(weekStats, profile);
    const checkIn: CheckInData = {
      week,
      date: new Date().toISOString().slice(0, 10),
      avgPain: weekStats?.avgPain || 0,
      avgRPE: weekStats?.avgRPE || 0,
      completionRate: weekStats?.completionRate || 0,
      avgBodyweight: profile.currentBodyweight || 0,
      personalNotes: notes,
      recommendations: recs,
    };
    try {
      await checkinApi.create(checkIn);
      const updated = await checkinApi.list();
      setHistory(updated);
      Alert.alert('Check-In Saved ✓', `Week ${week} check-in recorded.`);
      setNotes('');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save check-in');
    }
    setSaving(false);
  }

  if (loading) return <View style={s.loading}><ActivityIndicator color={COLORS.accent} /></View>;

  const week = profile?.currentWeek || 1;
  const block = getBlock(week);
  const nextWeek = Math.min(week + 1, 52);
  const recs = generateRecommendations(weekStats, profile);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView testID="checkin-scroll">
        <View style={s.header}>
          <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={s.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text.secondary} />
          </TouchableOpacity>
          <Text style={s.title}>WEEKLY CHECK-IN</Text>
        </View>

        <Text style={s.weekLabel}>WEEK {week} — Block {block}: {getBlockName(block)}</Text>

        {/* Stats Summary */}
        <View style={s.statsCard}>
          <Text style={s.cardTitle}>THIS WEEK'S STATS</Text>
          <View style={s.statsGrid}>
            <StatItem label="AVG PAIN" value={weekStats?.avgPain?.toFixed(1) ?? '—'} color={weekStats?.avgPain >= 3 ? '#CF6679' : COLORS.text.primary} />
            <StatItem label="AVG RPE" value={weekStats?.avgRPE?.toFixed(1) ?? '—'} />
            <StatItem label="COMPLETION" value={weekStats ? `${weekStats.completionRate}%` : '—'} />
            <StatItem label="BODYWEIGHT" value={profile?.currentBodyweight ? `${profile.currentBodyweight} lbs` : '—'} />
          </View>
        </View>

        {/* Nutrition (Mock) */}
        <View style={s.nutritionCard}>
          <View style={s.cardHeaderRow}>
            <Text style={s.cardTitle}>NUTRITION — WEEKLY AVG</Text>
            <View style={s.mockBadge}><Text style={s.mockText}>SAMPLE DATA</Text></View>
          </View>
          <View style={s.macroGrid}>
            <MacroItem label="CALORIES" value="2,960" unit="avg/day" />
            <MacroItem label="PROTEIN" value="212g" unit="avg/day" />
            <MacroItem label="CARBS" value="328g" unit="avg/day" />
            <MacroItem label="FAT" value="86g" unit="avg/day" />
          </View>
        </View>

        {/* Coach Recommendations */}
        <View style={s.recsCard}>
          <Text style={s.cardTitle}>COACH RECOMMENDATIONS</Text>
          {recs.map((rec, i) => (
            <View key={i} style={[s.recRow, rec.startsWith('✓') && s.recGreen, rec.startsWith('⚠') && s.recOrange]}>
              <Text style={[s.recText, rec.startsWith('✓') && { color: '#4CAF50' }, rec.startsWith('⚠') && { color: COLORS.accent }]}>{rec}</Text>
            </View>
          ))}
        </View>

        {/* Next Week Focus */}
        <View style={s.nextCard}>
          <Text style={s.cardTitle}>NEXT WEEK FOCUS (WEEK {nextWeek})</Text>
          <View style={s.nextRow}>
            <Text style={s.nextLabel}>Phase</Text>
            <Text style={s.nextVal}>{DELOAD_WEEKS.includes(nextWeek) ? 'Deload' : getPhase(nextWeek)}</Text>
          </View>
          <View style={s.nextRow}>
            <Text style={s.nextLabel}>Block</Text>
            <Text style={s.nextVal}>{getBlockName(getBlock(nextWeek))}</Text>
          </View>
          <View style={s.nextRow}>
            <Text style={s.nextLabel}>Deload</Text>
            <Text style={[s.nextVal, DELOAD_WEEKS.includes(nextWeek) && { color: '#808080' }]}>{DELOAD_WEEKS.includes(nextWeek) ? 'YES — Keep intensity low' : 'No'}</Text>
          </View>
        </View>

        {/* Personal Notes */}
        <View style={s.notesCard}>
          <Text style={s.cardTitle}>PERSONAL NOTES</Text>
          <TextInput
            testID="checkin-notes"
            style={s.notesInput}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="How did the week feel? What worked, what didn't? Goals for next week..."
            placeholderTextColor={COLORS.text.muted}
          />
        </View>

        <TouchableOpacity testID="complete-checkin-btn" style={[s.completeBtn, saving && { opacity: 0.6 }]} onPress={handleCompleteCheckIn} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.completeBtnText}>Complete Check-In — Week {week}</Text>}
        </TouchableOpacity>

        {/* Check-In History */}
        {history.length > 0 && (
          <>
            <Text style={s.historyTitle}>CHECK-IN HISTORY</Text>
            {history.map((ci, i) => (
              <View key={ci.id || i} style={s.historyCard}>
                <Text style={s.historyWeek}>Week {ci.week} · {ci.date}</Text>
                <View style={s.historyStats}>
                  <Text style={s.historyStat}>Pain: {ci.avgPain}</Text>
                  <Text style={s.historyStat}>RPE: {ci.avgRPE}</Text>
                  <Text style={s.historyStat}>Done: {ci.completionRate}%</Text>
                </View>
                {ci.personalNotes ? <Text style={s.historyNotes}>{ci.personalNotes}</Text> : null}
              </View>
            ))}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function StatItem({ label, value, color }: any) {
  return (
    <View style={si.box}>
      <Text style={[si.value, color && { color }]}>{value}</Text>
      <Text style={si.label}>{label}</Text>
    </View>
  );
}
const si = StyleSheet.create({
  box: { flex: 1, alignItems: 'center', padding: SPACING.sm },
  value: { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  label: { fontSize: 9, color: COLORS.text.muted, fontWeight: FONTS.weights.bold, letterSpacing: 1, marginTop: 2 },
});

function MacroItem({ label, value, unit }: any) {
  return (
    <View style={mi.box}>
      <Text style={mi.value}>{value}</Text>
      <Text style={mi.label}>{label}</Text>
      <Text style={mi.unit}>{unit}</Text>
    </View>
  );
}
const mi = StyleSheet.create({
  box: { flex: 1, alignItems: 'center' },
  value: { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.accentBlue },
  label: { fontSize: 9, color: COLORS.text.muted, fontWeight: FONTS.weights.bold, letterSpacing: 1 },
  unit: { fontSize: 9, color: COLORS.text.muted },
});

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  loading: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: SPACING.lg, paddingTop: SPACING.xl, gap: SPACING.md },
  backBtn: { padding: 4 },
  title: { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, letterSpacing: 2 },
  weekLabel: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, letterSpacing: 1, paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  statsCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm },
  cardTitle: { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.accent, letterSpacing: 2, marginBottom: SPACING.md },
  statsGrid: { flexDirection: 'row' },
  nutritionCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  mockBadge: { backgroundColor: '#0D2B3E', paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.full },
  mockText: { color: COLORS.accentBlue, fontSize: 9, fontWeight: FONTS.weights.bold },
  macroGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  recsCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm },
  recRow: { padding: SPACING.sm, borderRadius: RADIUS.sm, marginBottom: SPACING.sm },
  recGreen: { backgroundColor: '#1A3A1A' },
  recOrange: { backgroundColor: '#2A1A0A' },
  recText: { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 20 },
  nextCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm },
  nextRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  nextLabel: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm },
  nextVal: { color: COLORS.text.primary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.sm },
  notesCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm },
  notesInput: { backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.md, minHeight: 120, padding: SPACING.md, color: COLORS.text.primary, fontSize: FONTS.sizes.sm, textAlignVertical: 'top', borderWidth: 1, borderColor: COLORS.border, lineHeight: 20 },
  completeBtn: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.accent, borderRadius: RADIUS.lg, height: 52, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg },
  completeBtnText: { color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy },
  historyTitle: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2, paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  historyCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm },
  historyWeek: { color: COLORS.accent, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.sm, marginBottom: 6 },
  historyStats: { flexDirection: 'row', gap: SPACING.lg, marginBottom: 6 },
  historyStat: { color: COLORS.text.secondary, fontSize: FONTS.sizes.xs },
  historyNotes: { color: COLORS.text.muted, fontSize: FONTS.sizes.xs, fontStyle: 'italic' },
});
