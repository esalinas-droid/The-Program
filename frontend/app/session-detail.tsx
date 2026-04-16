import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { logApi } from '../src/utils/api';

// ── Constants ──────────────────────────────────────────────────────────────────
const BG     = '#0A0A0C';
const CARD   = '#111114';
const BORDER = '#1E1E22';
const GOLD   = '#C9A84C';
const TEXT   = '#E8E8E6';
const MUTED  = '#888';
const TEAL   = '#4DCEA6';

// ── Types ─────────────────────────────────────────────────────────────────────
interface LogEntry {
  _id?: string;
  id?: string;
  exercise: string;
  weight: number;
  reps: number;
  rpe?: number;
  setNumber?: number;
  setIndex?: number;
  date: string;
  e1rm?: number;
  sessionType?: string;
}

interface ExerciseGroup {
  name: string;
  sets: LogEntry[];
  bestSet: LogEntry | null;
  totalVolume: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDisplayDate(dateStr: string): { day: string; month: string; year: string; dayOfWeek: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    day:       String(d),
    month:     MONTH_NAMES[m - 1],
    year:      String(y),
    dayOfWeek: DAY_NAMES[dt.getDay()],
  };
}

function groupByExercise(logs: LogEntry[]): ExerciseGroup[] {
  const map = new Map<string, LogEntry[]>();
  for (const entry of logs) {
    const name = entry.exercise || 'Unknown';
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(entry);
  }
  return Array.from(map.entries()).map(([name, sets]) => {
    // Sort by setIndex (0-based) or setNumber (1-based)
    sets.sort((a, b) => (a.setIndex ?? a.setNumber ?? 0) - (b.setIndex ?? b.setNumber ?? 0));
    const bestSet = sets.reduce<LogEntry | null>((best, s) => {
      if (!best) return s;
      const bE1rm = best.weight * (1 + best.reps / 30);
      const sE1rm = s.weight   * (1 + s.reps   / 30);
      return sE1rm > bE1rm ? s : best;
    }, null);
    const totalVolume = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
    return { name, sets, bestSet, totalVolume };
  });
}

// ── Exercise Card ─────────────────────────────────────────────────────────────
function ExerciseCard({ group }: { group: ExerciseGroup }) {
  const [expanded, setExpanded] = useState(true);  // Start expanded for read-only detail view
  return (
    <View style={styles.exerciseCard}>
      <TouchableOpacity
        style={styles.exerciseHeader}
        onPress={() => setExpanded(v => !v)}
        activeOpacity={0.8}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.exerciseName}>{group.name}</Text>
          <Text style={styles.exerciseMeta}>
            {group.sets.length} set{group.sets.length !== 1 ? 's' : ''}
            {group.bestSet ? `  ·  Best: ${group.bestSet.weight}×${group.bestSet.reps}` : ''}
          </Text>
        </View>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={MUTED}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.setsContainer}>
          {group.sets.map((s, i) => (
            <View key={i} style={styles.setRow}>
              <Text style={styles.setLabel}>
                Set {(s.setIndex != null ? s.setIndex + 1 : s.setNumber) || i + 1}
              </Text>
              <Text style={styles.setValues}>
                {s.weight} lbs × {s.reps} reps
                {s.rpe ? <Text style={styles.rpeTag}>  @RPE {s.rpe}</Text> : null}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function SessionDetailScreen() {
  const router    = useRouter();
  const { date, sessionType } = useLocalSearchParams<{ date: string; sessionType: string }>();

  const [loading, setLoading]   = useState(true);
  const [groups,  setGroups]    = useState<ExerciseGroup[]>([]);
  const [stats,   setStats]     = useState({ sets: 0, volume: 0, avgRpe: 0 });

  const loadLogs = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    try {
      const result = await logApi.list({ startDate: date, endDate: date });
      const logs: LogEntry[] = Array.isArray(result) ? result : (result?.logs || []);
      console.log(`[SessionDetail] date=${date}, fetched ${logs.length} logs`);
      const exerciseGroups = groupByExercise(logs);
      setGroups(exerciseGroups);

      // Compute summary stats
      const totalSets   = logs.length;
      const totalVolume = logs.reduce((sum, l) => sum + l.weight * l.reps, 0);
      const rpeEntries  = logs.filter(l => l.rpe && l.rpe > 0);
      const avgRpe      = rpeEntries.length > 0
        ? rpeEntries.reduce((s, l) => s + (l.rpe || 0), 0) / rpeEntries.length
        : 0;
      setStats({ sets: totalSets, volume: totalVolume, avgRpe });
    } catch (err) {
      console.warn('[SessionDetail] fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const dateInfo = date ? formatDisplayDate(date) : null;
  const decodedType = sessionType ? decodeURIComponent(sessionType) : 'Session';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={TEXT} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{decodedType}</Text>
          {dateInfo && (
            <Text style={styles.headerSub}>
              {dateInfo.dayOfWeek} · {dateInfo.month} {dateInfo.day}, {dateInfo.year}
            </Text>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={GOLD} size="large" />
          <Text style={styles.loadingText}>Loading session…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Stats summary */}
          <View style={styles.statsRow}>
            {[
              { label: 'SETS',   value: String(stats.sets) },
              { label: 'VOLUME', value: stats.volume > 0 ? `${(stats.volume / 1000).toFixed(1)}k` : '0' },
              { label: 'AVG RPE', value: stats.avgRpe > 0 ? stats.avgRpe.toFixed(1) : '—' },
            ].map(({ label, value }) => (
              <View key={label} style={styles.statItem}>
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Exercise cards */}
          {groups.length === 0 ? (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="dumbbell" size={40} color="#333" />
              <Text style={styles.emptyText}>No logged exercises found</Text>
              <Text style={styles.emptySubText}>Data may not have been saved for this session</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionLabel}>EXERCISES ({groups.length})</Text>
              {groups.map((g, i) => (
                <ExerciseCard key={`${g.name}-${i}`} group={g} />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: BG },
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 14, gap: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  backBtn:      { padding: 4 },
  headerTitle:  { fontSize: 18, fontWeight: '700', color: TEXT, letterSpacing: -0.3 },
  headerSub:    { fontSize: 12, color: MUTED, marginTop: 2 },

  loadingBox:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText:  { fontSize: 13, color: MUTED },

  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 60 },

  statsRow:    { flexDirection: 'row', backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 20, overflow: 'hidden' },
  statItem:    { flex: 1, alignItems: 'center', paddingVertical: 18 },
  statValue:   { fontSize: 22, fontWeight: '700', color: TEXT },
  statLabel:   { fontSize: 9, fontWeight: '700', color: MUTED, letterSpacing: 0.8, marginTop: 3 },

  sectionLabel: { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 1.2, marginBottom: 10 },

  exerciseCard:   { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, marginBottom: 10, overflow: 'hidden' },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8 },
  exerciseName:   { fontSize: 15, fontWeight: '700', color: TEXT, marginBottom: 2 },
  exerciseMeta:   { fontSize: 12, color: MUTED },

  setsContainer: { borderTopWidth: 1, borderTopColor: BORDER, paddingHorizontal: 14, paddingVertical: 8 },
  setRow:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#16161A' },
  setLabel:      { fontSize: 13, color: MUTED, fontWeight: '600' },
  setValues:     { fontSize: 13, color: TEXT, fontWeight: '600' },
  rpeTag:        { fontSize: 12, color: TEAL },

  emptyBox:     { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
  emptyText:    { fontSize: 16, fontWeight: '600', color: '#444', textAlign: 'center' },
  emptySubText: { fontSize: 12, color: '#333', textAlign: 'center', maxWidth: 260 },
});
