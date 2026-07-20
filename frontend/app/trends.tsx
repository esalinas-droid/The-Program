/**
 * Trends — read-only analytics transparency screen.
 * Renders the user's stored training_analytics doc (no new computation here).
 * Entry point: Programs screen → "Training trends".
 * Cards render ONLY when their data exists — nothing zero-filled or fabricated.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { analyticsApi } from '../src/utils/api';
import { COLORS, SPACING, RADIUS, FONTS } from '../src/constants/theme';

// Movement-pattern → theme session color (tokens only, no raw hex)
const PATTERN_COLORS: Record<string, string> = {
  squat: COLORS.sessions.me_lower.borderColor,
  hinge: COLORS.sessions.event.borderColor,
  press: COLORS.sessions.de_upper.borderColor,
  pull:  COLORS.sessions.de_lower.borderColor,
  other: COLORS.sessions.deload.borderColor,
};
const PATTERN_ORDER = ['squat', 'hinge', 'press', 'pull', 'other'];

const LIFT_LABELS: Record<string, string> = {
  squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift',
  ohp: 'Overhead Press', log: 'Log Press', axle: 'Axle',
};

function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function fatigueDisplay(fatigue: any): { label: string; color: string } | null {
  if (!fatigue || fatigue.status === 'unknown') return null;
  if (fatigue.status === 'high') return { label: 'High', color: COLORS.status.error };
  if (fatigue.status === 'moderate') return { label: 'Elevated', color: COLORS.status.warning };
  if ((fatigue.index ?? 0) <= 0) return { label: 'Fresh', color: COLORS.status.success };
  return { label: 'Normal', color: COLORS.status.info };
}

function Card({ icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <MaterialCommunityIcons name={icon} size={15} color={COLORS.accent} />
        <Text style={s.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export default function TrendsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      // Server recomputes automatically when the stored doc is >24h stale
      const d = await analyticsApi.trends();
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const hasData = !!(data?.available && data?.logCount);

  // ── Card data (each card renders only when its data exists) ────────────────
  const fatigue = hasData ? fatigueDisplay(data.fatigue) : null;
  const creepFlags: any[] = hasData ? (data.rpeCreep?.flags || []) : [];
  const strengthLifts: [string, any][] = hasData ? Object.entries(data.effective1RM || {}) : [];
  const volumeWeeks: any[] = hasData ? (data.weeklyVolume || []) : [];
  const volumeHasAny = volumeWeeks.some(w => (w.total || 0) > 0);
  const painRows: any[] = hasData
    ? (data.painTrends?.perInjury || []).filter(
        (p: any) => p.status === 'active' && ['rising', 'stable', 'falling'].includes(p.trend))
    : [];
  const painCorrelation = hasData ? (data.painTrends?.correlations?.[0] || null) : null;
  const compliance = hasData ? data.compliance : null;
  const maxVol = Math.max(1, ...volumeWeeks.map(w => w.total || 0));
  // oldest → newest, left → right
  const volBars = [...volumeWeeks].sort((a, b) => b.weekIndex - a.weekIndex);

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} testID="trends-back">
          <MaterialCommunityIcons name="chevron-left" size={26} color={COLORS.text.secondary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={s.headerTitle}>Trends</Text>
          {!!data?.computedAt && (
            <Text style={s.updatedText}>updated {relativeTime(data.computedAt)}</Text>
          )}
        </View>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.accent} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.accent} />}
        >
          {!hasData ? (
            <View style={s.emptyWrap} testID="trends-empty-state">
              <MaterialCommunityIcons name="chart-line" size={40} color={COLORS.text.muted} />
              <Text style={s.emptyTitle}>No trends yet</Text>
              <Text style={s.emptyBody}>
                Log a few weeks of training and your trends will appear here.
              </Text>
            </View>
          ) : (
            <>
              {data.lowConfidence && (
                <View style={s.lowConfBanner} testID="trends-low-confidence">
                  <MaterialCommunityIcons name="information-outline" size={14} color={COLORS.status.warning} />
                  <Text style={s.lowConfText}>
                    Limited data — under 3 weeks of logs. Trends firm up as you keep logging.
                  </Text>
                </View>
              )}

              {/* Fatigue */}
              {fatigue && (
                <Card icon="battery-heart-variant" title="FATIGUE">
                  <View style={s.fatigueRow}>
                    <View style={[s.statusPill, { borderColor: fatigue.color }]}>
                      <Text style={[s.statusPillText, { color: fatigue.color }]}>{fatigue.label}</Text>
                    </View>
                  </View>
                  {!!data.fatigue?.explanation && (
                    <Text style={s.cardBody}>{data.fatigue.explanation}</Text>
                  )}
                </Card>
              )}

              {/* RPE creep — only when flagged */}
              {creepFlags.length > 0 && (
                <Card icon="trending-up" title="RPE CREEP">
                  {creepFlags.map((f: any) => (
                    <View key={f.exercise} style={{ marginBottom: SPACING.sm }}>
                      <Text style={s.creepLift}>{f.exercise}</Text>
                      <Text style={s.cardBody}>
                        RPE {f.exposures.map((x: any) => `${x.rpe}`).join(' → ')} at ~{f.exposures[0]?.load} lbs
                        {'  '}(same load, effort climbing)
                      </Text>
                    </View>
                  ))}
                  <Text style={s.cardHint}>
                    Effort is rising at the same weight — worth asking your coach about recovery.
                  </Text>
                </Card>
              )}

              {/* Strength trend */}
              {strengthLifts.length > 0 && (
                <Card icon="arm-flex-outline" title="STRENGTH">
                  {strengthLifts.map(([lift, rec]) => {
                    const trendPct = data.prProgression?.[lift]?.trendPct;
                    const trendIcon =
                      trendPct == null || Math.abs(trendPct) < 1 ? 'trending-neutral'
                        : trendPct > 0 ? 'trending-up' : 'trending-down';
                    const trendColor =
                      trendPct == null || Math.abs(trendPct) < 1 ? COLORS.text.muted
                        : trendPct > 0 ? COLORS.status.success : COLORS.status.warning;
                    return (
                      <View key={lift} style={s.liftRow}>
                        <View style={{ flex: 1 }}>
                          <View style={s.liftHeaderRow}>
                            <Text style={s.liftName}>{LIFT_LABELS[lift] || lift}</Text>
                            <MaterialCommunityIcons name={trendIcon as any} size={16} color={trendColor} />
                            {trendPct != null && Math.abs(trendPct) >= 1 && (
                              <Text style={[s.trendPct, { color: trendColor }]}>
                                {trendPct > 0 ? '+' : ''}{trendPct}%
                              </Text>
                            )}
                          </View>
                          <Text style={s.cardBody}>
                            Entered 1RM {rec.entered ?? '—'} lbs · effective {rec.effective} lbs
                            {rec.deltaPct != null ? ` (${rec.deltaPct > 0 ? '+' : ''}${rec.deltaPct}%)` : ''}
                          </Text>
                          {rec.diverges && (
                            <Text style={s.divergeNote}>Your coach may suggest updating this.</Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </Card>
              )}

              {/* Volume — simple custom stacked bars, dependency-free */}
              {volumeHasAny && (
                <Card icon="chart-bar" title="WEEKLY VOLUME">
                  <View style={s.barsRow}>
                    {volBars.map(w => (
                      <View key={w.weekIndex} style={s.barCol}>
                        <View style={s.barTrack}>
                          {PATTERN_ORDER.map(p => {
                            const v = w.byPattern?.[p] || 0;
                            if (!v) return null;
                            const h = Math.max(2, Math.round((v / maxVol) * 110));
                            return <View key={p} style={{ height: h, backgroundColor: PATTERN_COLORS[p], width: '100%' }} />;
                          })}
                        </View>
                        <Text style={s.barLabel}>
                          {w.weekIndex === 0 ? 'now' : `-${w.weekIndex}w`}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View style={s.legendRow}>
                    {PATTERN_ORDER.filter(p => volBars.some(w => (w.byPattern?.[p] || 0) > 0)).map(p => (
                      <View key={p} style={s.legendItem}>
                        <View style={[s.legendDot, { backgroundColor: PATTERN_COLORS[p] }]} />
                        <Text style={s.legendText}>{p}</Text>
                      </View>
                    ))}
                  </View>
                </Card>
              )}

              {/* Pain trends — active injuries with data only; neutral tone */}
              {painRows.length > 0 && (
                <Card icon="heart-pulse" title="PAIN TRENDS">
                  {painRows.map((p: any) => {
                    const icon = p.trend === 'rising' ? 'trending-up'
                      : p.trend === 'falling' ? 'trending-down' : 'trending-neutral';
                    const color = p.trend === 'rising' ? COLORS.status.warning
                      : p.trend === 'falling' ? COLORS.status.success : COLORS.status.info;
                    return (
                      <View key={p.injury} style={s.painRow}>
                        <MaterialCommunityIcons name={icon as any} size={16} color={color} />
                        <Text style={s.cardBody}>
                          Reports around {p.injury} are {p.trend}
                          {p.recentAvg != null ? ` (recent avg ${p.recentAvg}/10)` : ''}.
                        </Text>
                      </View>
                    );
                  })}
                  {!!painCorrelation && (
                    <Text style={s.cardHint}>
                      Most reports follow {painCorrelation.exercise}.
                    </Text>
                  )}
                </Card>
              )}

              {/* Compliance */}
              {compliance?.pct != null && (
                <Card icon="calendar-check-outline" title="COMPLIANCE">
                  <Text style={s.complianceBig}>
                    {compliance.completedSessions}
                    <Text style={s.complianceSmall}> of {compliance.plannedSessions} sessions · last {compliance.windowWeeks} weeks</Text>
                  </Text>
                  <View style={s.progressTrack}>
                    <View style={[s.progressFill, { width: `${Math.min(100, compliance.pct)}%` }]} />
                  </View>
                </Card>
              )}

              <Text style={s.footNote}>
                Read-only view of what your coach computes from your logs.
              </Text>
            </>
          )}
          <View style={{ height: insets.bottom + SPACING.xxl }} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.bold, color: COLORS.text.primary },
  updatedText: { fontSize: 10, color: COLORS.text.muted, marginTop: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },

  emptyWrap: { alignItems: 'center', paddingVertical: SPACING.xxl * 2, gap: SPACING.sm },
  emptyTitle: { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary },
  emptyBody: {
    fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, textAlign: 'center',
    lineHeight: 20, paddingHorizontal: SPACING.xl,
  },

  lowConfBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md, marginBottom: SPACING.md,
  },
  lowConfText: { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.text.secondary, lineHeight: 16 },

  card: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg, borderWidth: 1,
    borderColor: COLORS.border, padding: SPACING.lg, marginBottom: SPACING.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  cardTitle: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, color: COLORS.text.secondary, letterSpacing: 1 },
  cardBody: { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 20, flex: 1 },
  cardHint: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: SPACING.xs, lineHeight: 16 },

  fatigueRow: { flexDirection: 'row', marginBottom: SPACING.sm },
  statusPill: {
    borderWidth: 1, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: 4,
    backgroundColor: COLORS.surfaceHighlight,
  },
  statusPillText: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.bold },

  creepLift: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary, marginBottom: 2 },

  liftRow: { flexDirection: 'row', marginBottom: SPACING.md },
  liftHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: 2 },
  liftName: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary },
  trendPct: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.semibold },
  divergeNote: { fontSize: FONTS.sizes.xs, color: COLORS.accent, marginTop: 2 },

  barsRow: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    gap: SPACING.sm, marginTop: SPACING.xs,
  },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barTrack: {
    width: '70%', height: 112, justifyContent: 'flex-end',
    borderRadius: RADIUS.sm, overflow: 'hidden', backgroundColor: COLORS.surfaceHighlight,
  },
  barLabel: { fontSize: 9, color: COLORS.text.muted },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginTop: SPACING.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: RADIUS.full },
  legendText: { fontSize: FONTS.sizes.xs, color: COLORS.text.secondary },

  painRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.sm },

  complianceBig: { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  complianceSmall: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.regular, color: COLORS.text.muted },
  progressTrack: {
    height: 6, backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.full,
    marginTop: SPACING.sm, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.accent, borderRadius: RADIUS.full },

  footNote: {
    fontSize: FONTS.sizes.xs, color: COLORS.text.muted, textAlign: 'center',
    marginTop: SPACING.sm,
  },
});
