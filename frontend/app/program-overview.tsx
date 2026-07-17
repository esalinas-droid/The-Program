import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS, getSessionStyle } from '../src/constants/theme';
import { programApi } from '../src/utils/api';
import type { AnnualPlan, ProgramPhase, ProgramBlock } from '../src/types';

// ── Helpers ──────────────────────────────────────────────────────────────────
function currentWeekOfPlan(startDate: string): number {
  try {
    const s = new Date(startDate);
    const diff = Math.floor((Date.now() - s.getTime()) / (7 * 86400 * 1000));
    return Math.max(1, diff + 1);
  } catch {
    return 1;
  }
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

function uniqueSessionTypes(block: ProgramBlock): string[] {
  const wk0 = block.weeks?.[0];
  const seen: string[] = [];
  for (const s of wk0?.sessions ?? []) {
    const t = s.sessionType || '';
    if (t && !seen.includes(t)) seen.push(t);
  }
  return seen;
}

// ── Sub-components ───────────────────────────────────────────────────────────
function WeekPill({ weekNumber, isDeload, isCurrent }: { weekNumber: number; isDeload: boolean; isCurrent: boolean }) {
  const deloadStyle = COLORS.sessions.deload;
  return (
    <View
      style={[
        s.pill,
        isDeload && { backgroundColor: deloadStyle.bg, borderColor: deloadStyle.borderColor },
        isCurrent && s.pillCurrent,
      ]}
    >
      {isDeload && (
        <MaterialCommunityIcons
          name="weather-night"
          size={10}
          color={isCurrent ? COLORS.background : deloadStyle.text}
          style={{ marginRight: 2 }}
        />
      )}
      <Text
        style={[
          s.pillText,
          isDeload && { color: deloadStyle.text },
          isCurrent && s.pillTextCurrent,
        ]}
      >
        {weekNumber}
      </Text>
    </View>
  );
}

function SessionDot({ sessionType }: { sessionType: string }) {
  const st = getSessionStyle(sessionType);
  return (
    <View style={s.legendItem}>
      <View style={[s.dot, { backgroundColor: st.borderColor }]} />
      <Text style={[s.legendLabel, { color: st.text }]} numberOfLines={1}>
        {st.label}
      </Text>
    </View>
  );
}

function BlockRow({ block, currentWeek }: { block: ProgramBlock; currentWeek: number }) {
  const weeks = [...(block.weeks ?? [])].sort((a, b) => a.weekNumber - b.weekNumber);
  const first = weeks[0]?.weekNumber;
  const last = weeks[weeks.length - 1]?.weekNumber;
  const types = uniqueSessionTypes(block);

  return (
    <View style={s.block}>
      <View style={s.blockHeader}>
        <Text style={s.blockName} numberOfLines={1}>{block.blockName}</Text>
        <Text style={s.blockRange}>Wk {first}–{last}</Text>
      </View>
      {!!block.blockGoal && <Text style={s.blockGoal} numberOfLines={2}>{block.blockGoal}</Text>}

      {types.length > 0 && (
        <View style={s.legendRow}>
          {types.map((t, i) => <SessionDot key={`${block.blockId}-t${i}`} sessionType={t} />)}
        </View>
      )}

      <View style={s.pillRow}>
        {weeks.map((w) => (
          <WeekPill
            key={w.weekId || `w${w.weekNumber}`}
            weekNumber={w.weekNumber}
            isDeload={!!w.isDeload}
            isCurrent={w.weekNumber === currentWeek}
          />
        ))}
      </View>
    </View>
  );
}

function PhaseCard({ phase, currentWeek }: { phase: ProgramPhase; currentWeek: number }) {
  const isCurrentPhase = currentWeek >= phase.startWeek && currentWeek <= phase.endWeek;
  return (
    <View style={[s.phaseCard, isCurrentPhase && s.phaseCardCurrent]}>
      <View style={s.phaseHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.phaseNumber}>PHASE {phase.phaseNumber}</Text>
          <Text style={s.phaseName}>{phase.phaseName}</Text>
        </View>
        <View style={s.phaseRangeBadge}>
          <Text style={s.phaseRangeText}>Wk {phase.startWeek}–{phase.endWeek}</Text>
        </View>
      </View>
      {!!phase.expectedAdaptation && (
        <Text style={s.phaseAdaptation} numberOfLines={2}>{phase.expectedAdaptation}</Text>
      )}
      {phase.blocks.map((b) => (
        <BlockRow key={b.blockId} block={b} currentWeek={currentWeek} />
      ))}
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function ProgramOverviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<AnnualPlan | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await programApi.getYearPlan();
      setPlan(data);
    } catch {
      setError('Could not load your program. Complete onboarding first.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const currentWeek = plan ? currentWeekOfPlan(plan.startDate) : 1;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.text.primary} />
        </TouchableOpacity>
        <Text style={s.topBarTitle}>Full Program</Text>
        <View style={s.backBtn} />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.accent} /></View>
      ) : error ? (
        <View style={s.center}>
          <MaterialCommunityIcons name="calendar-remove" size={40} color={COLORS.text.muted} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : plan ? (
        <ScrollView
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: insets.bottom + SPACING.xxl }}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary */}
          <Text style={s.planName} numberOfLines={2}>{plan.name || plan.planName}</Text>
          <Text style={s.planMeta}>
            Started {fmtDate(plan.startDate)} · {plan.trainingDays} days/week
          </Text>
          <View style={s.nowBanner}>
            <MaterialCommunityIcons name="map-marker" size={16} color={COLORS.background} />
            <Text style={s.nowBannerText}>
              You are in Week {Math.min(currentWeek, plan.totalWeeks)} of {plan.totalWeeks}
            </Text>
          </View>

          {/* Legend for deload */}
          <View style={s.deloadHint}>
            <MaterialCommunityIcons name="weather-night" size={12} color={COLORS.sessions.deload.text} />
            <Text style={s.deloadHintText}>= deload week (reduced load & volume)</Text>
          </View>

          {plan.phases.map((p) => (
            <PhaseCard key={p.phaseId} phase={p} currentWeek={currentWeek} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { color: COLORS.text.primary, fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.semibold },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.xl },
  errorText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.base, textAlign: 'center' },

  planName: { color: COLORS.text.primary, fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.bold },
  planMeta: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, marginTop: SPACING.xs },
  nowBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.accent, borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, marginTop: SPACING.md,
  },
  nowBannerText: { color: COLORS.background, fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold },
  deloadHint: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.md, marginBottom: SPACING.sm },
  deloadHintText: { color: COLORS.text.muted, fontSize: FONTS.sizes.xs },

  phaseCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    padding: SPACING.lg, marginTop: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  phaseCardCurrent: { borderColor: COLORS.accent },
  phaseHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  phaseNumber: { color: COLORS.accent, fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, letterSpacing: 1 },
  phaseName: { color: COLORS.text.primary, fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.bold, marginTop: 2 },
  phaseRangeBadge: {
    backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.sm,
    paddingVertical: 3, paddingHorizontal: SPACING.sm,
  },
  phaseRangeText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.semibold },
  phaseAdaptation: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, marginTop: SPACING.xs, marginBottom: SPACING.sm },

  block: {
    borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingTop: SPACING.md, marginTop: SPACING.md,
  },
  blockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blockName: { flex: 1, color: COLORS.text.primary, fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold },
  blockRange: { color: COLORS.text.muted, fontSize: FONTS.sizes.xs, marginLeft: SPACING.sm },
  blockGoal: { color: COLORS.text.muted, fontSize: FONTS.sizes.xs, marginTop: 2 },

  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginTop: SPACING.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.medium },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.md },
  pill: {
    minWidth: 34, height: 30, borderRadius: RADIUS.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.surfaceHighlight, borderWidth: 1, borderColor: COLORS.border,
  },
  pillCurrent: { backgroundColor: COLORS.accent, borderColor: COLORS.accentLight },
  pillText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold },
  pillTextCurrent: { color: COLORS.background, fontWeight: FONTS.weights.bold },
});
