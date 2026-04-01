import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';
import { substitutionApi } from '../../src/utils/api';

// ── Types ────────────────────────────────────────────────────────────────────
type TriggerType = 'Pain' | 'Readiness' | 'Missed Session' | 'User Request' | 'Performance';
type ScopeType   = 'Today Only' | 'This Block' | 'Year Plan';

interface ChangeEntry {
  id: string;
  timestamp: string;       // ISO string for sorting
  displayDate: string;     // human label: "Wed, Apr 1"
  changeLabel: string;     // "SSB Box Squat → Belt Squat"
  trigger: TriggerType;
  scope: ScopeType;
  explanation: string;
  source: 'substitution' | 'plan';
}

// ── Trigger config ────────────────────────────────────────────────────────────
const TRIGGER: Record<TriggerType, { color: string; bg: string; icon: string }> = {
  'Pain':           { color: '#EF5350', bg: '#2A0000', icon: 'bandage'             },
  'Readiness':      { color: '#2E75B6', bg: '#001428', icon: 'battery-30'           },
  'Missed Session': { color: '#888888', bg: '#1E1E1E', icon: 'calendar-remove'      },
  'User Request':   { color: '#C9A84C', bg: '#211800', icon: 'hand-pointing-right'  },
  'Performance':    { color: '#4CAF50', bg: '#001800', icon: 'trending-up'           },
};

// ── Scope config ──────────────────────────────────────────────────────────────
const SCOPE: Record<ScopeType, { color: string; bg: string }> = {
  'Today Only': { color: '#C9A84C', bg: '#211800' },
  'This Block': { color: '#2E75B6', bg: '#001428' },
  'Year Plan':  { color: '#9B6FDE', bg: '#0D0020' },
};

// ── Filter pill data ──────────────────────────────────────────────────────────
const TRIGGER_PILLS: Array<TriggerType | 'All'> = [
  'All', 'Pain', 'Readiness', 'Missed Session', 'User Request', 'Performance',
];
const SCOPE_PILLS: ScopeType[] = ['Today Only', 'This Block', 'Year Plan'];

// ── Mock plan-level changes ───────────────────────────────────────────────────
const MOCK_PLAN: ChangeEntry[] = [
  {
    id: 'plan-8',
    timestamp: '2026-03-16T06:00:00Z',
    displayDate: 'Mon, Mar 16',
    changeLabel: 'Programme initialised — Week 1, Block 1',
    trigger: 'User Request',
    scope: 'Year Plan',
    explanation:
      'Your 52-week conjugate programme has been built from your onboarding profile. All training maxes, injury flags, competition timeline, and bodyweight goals have been factored in. Every future change will appear here.',
    source: 'plan',
  },
  {
    id: 'plan-7',
    timestamp: '2026-03-17T09:00:00Z',
    displayDate: 'Tue, Mar 17',
    changeLabel: 'DE Lower session added — Block 1, Fridays',
    trigger: 'Performance',
    scope: 'This Block',
    explanation:
      'Baseline squat assessment showed above-average bar speed at 70%. A speed-specific Friday session has been added to Block 1 to develop that rate-of-force quality before intensification phases begin.',
    source: 'plan',
  },
  {
    id: 'plan-6',
    timestamp: '2026-03-18T09:30:00Z',
    displayDate: 'Wed, Mar 18',
    changeLabel: 'Block 2 Week 5 intensity capped at 85%',
    trigger: 'Readiness',
    scope: 'This Block',
    explanation:
      'Onboarding check-in flagged elevated fatigue coming into the programme. Week 5 of Block 2 will have a built-in 85% intensity cap across all main lifts to protect CNS health at the block transition.',
    source: 'plan',
  },
  {
    id: 'plan-5',
    timestamp: '2026-03-21T10:00:00Z',
    displayDate: 'Sat, Mar 21',
    changeLabel: 'Overhead accessory volume +1 session — Blocks 4–6',
    trigger: 'Performance',
    scope: 'Year Plan',
    explanation:
      'Log and axle press are consistently your highest-RPE movements relative to your training max. One dedicated overhead accessory session per block has been added from Block 4 through 6 to close that gap before the competition window.',
    source: 'plan',
  },
  {
    id: 'plan-4',
    timestamp: '2026-03-22T08:00:00Z',
    displayDate: 'Sun, Mar 22',
    changeLabel: 'Conventional Deadlift → Romanian Deadlift — Block 2 supplemental',
    trigger: 'Pain',
    scope: 'This Block',
    explanation:
      'Your right hamstring flag combined with the movement risk profile of floor-start pulls. Conventional deadlift has been replaced with Romanian Deadlift in all Block 2 supplemental slots. Full floor pulls return when cleared in Block 3 check-in.',
    source: 'plan',
  },
  {
    id: 'plan-3',
    timestamp: '2026-03-28T07:30:00Z',
    displayDate: 'Sat, Mar 28',
    changeLabel: 'GPP volume reduced — Week 3 only',
    trigger: 'Readiness',
    scope: 'Today Only',
    explanation:
      'Weekly check-in flagged recovery score below threshold after two consecutive hard training days. GPP conditioning reduced from 4 rounds to 2 for this week only. Full volume resumes Week 4.',
    source: 'plan',
  },
  {
    id: 'plan-2',
    timestamp: '2026-03-29T09:00:00Z',
    displayDate: 'Sun, Mar 29',
    changeLabel: 'Axle cleans from floor → rack-start — Blocks 1 & 2',
    trigger: 'Pain',
    scope: 'This Block',
    explanation:
      'Left bicep strain history identified as a distal tendon risk with floor-start cleans under fatigue. All axle cleans have been converted to rack-start for Blocks 1 and 2 to protect that attachment while maintaining the pressing strength development.',
    source: 'plan',
  },
  {
    id: 'plan-1',
    timestamp: '2026-03-30T10:00:00Z',
    displayDate: 'Mon, Mar 30',
    changeLabel: 'Stone to shoulder removed — Event Day Week 2',
    trigger: 'User Request',
    scope: 'Today Only',
    explanation:
      'You flagged stone to shoulder as a movement to avoid during onboarding. Removed from the Week 2 Event Day session and replaced with a keg carry progression that preserves loading and event-specific demand.',
    source: 'plan',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function reasonToTrigger(reason: string): TriggerType {
  if (reason === 'Pain/Injury')  return 'Pain';
  if (reason === 'Low Energy')   return 'Readiness';
  return 'User Request';
}

function reasonToExplanation(reason: string, original: string, replacement: string): string {
  switch (reason) {
    case 'Pain/Injury':
      return `Swapped to reduce load on the flagged area while keeping the movement pattern intact. Your block progression is unaffected — the same training intent is preserved with a lower-risk implement.`;
    case 'Low Energy':
      return `Energy levels flagged low before this session. Swapped for a less CNS-demanding alternative that keeps the stimulus honest without grinding through residual fatigue.`;
    case 'No Equipment':
      return `Equipment unavailable at time of session. Nearest equivalent selected to maintain the movement pattern, loading stimulus, and block progression without interruption.`;
    case 'Gym Crowded':
      return `Equipment occupied — common in public facilities during peak hours. Alternative uses different gear with the same training stimulus. Your block structure and progression are unchanged.`;
    case 'Travel':
      return `Travel day substitute. Movement pattern and training intent preserved with available equipment. Session counts toward your block completion as planned.`;
    case 'Preference':
      return `Personal preference swap accepted by the coach. Same movement category, different implement — the block stimulus and progression remain consistent with the original plan.`;
    default:
      return `Swapped to better match current conditions. Training intent preserved and block progression unaffected.`;
  }
}

function formatDisplayDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ChangesScreen() {
  const [entries, setEntries]         = useState<ChangeEntry[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [filterTrigger, setFTrigger]  = useState<TriggerType | null>(null);
  const [filterScope, setFScope]      = useState<ScopeType | null>(null);

  const loadData = useCallback(async () => {
    try {
      const subs = await substitutionApi.list();
      const subEntries: ChangeEntry[] = subs.map((s: any) => ({
        id: s.id || String(Math.random()),
        timestamp: s.timestamp || s.date || new Date().toISOString(),
        displayDate: formatDisplayDate(s.timestamp || s.date || ''),
        changeLabel: `${s.originalExercise} → ${s.replacementExercise}`,
        trigger: reasonToTrigger(s.reason),
        scope: 'Today Only' as ScopeType,
        explanation: reasonToExplanation(s.reason, s.originalExercise, s.replacementExercise),
        source: 'substitution' as const,
      }));

      const all = [...subEntries, ...MOCK_PLAN].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setEntries(all);
    } catch {
      // Still show mock data if API fails
      setEntries([...MOCK_PLAN].reverse());
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  // ── Filter logic ──────────────────────────────────────────────────────────
  const filteredEntries = entries.filter(e => {
    if (filterTrigger && e.trigger !== filterTrigger) return false;
    if (filterScope && e.scope !== filterScope) return false;
    return true;
  });

  function handleTriggerPill(pill: TriggerType | 'All') {
    if (pill === 'All') { setFTrigger(null); setFScope(null); return; }
    setFTrigger(prev => prev === pill ? null : pill);
  }

  function handleScopePill(pill: ScopeType) {
    setFScope(prev => prev === pill ? null : pill);
  }

  if (loading) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
      >

        {/* ── Header ── */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>CHANGE LOG</Text>
            <Text style={s.subtitle}>Every adaptation, explained.</Text>
          </View>
          <View style={s.countBadge}>
            <Text style={s.countText}>{filteredEntries.length}</Text>
          </View>
        </View>

        {/* ── Filter Row ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filterScroll}
          contentContainerStyle={s.filterContent}
        >
          {/* Trigger filters */}
          {TRIGGER_PILLS.map(pill => {
            const isAll     = pill === 'All';
            const isActive  = isAll
              ? filterTrigger === null && filterScope === null
              : filterTrigger === pill;
            const cfg       = isAll ? null : TRIGGER[pill as TriggerType];
            return (
              <TouchableOpacity
                key={pill}
                style={[
                  s.pill,
                  isActive && s.pillActive,
                  isActive && !isAll && { borderColor: cfg!.color, backgroundColor: cfg!.bg },
                ]}
                onPress={() => handleTriggerPill(pill)}
              >
                {!isAll && cfg && (
                  <MaterialCommunityIcons
                    name={cfg.icon as any}
                    size={12}
                    color={isActive ? cfg.color : COLORS.text.muted}
                    style={{ marginRight: 4 }}
                  />
                )}
                <Text style={[s.pillText, isActive && !isAll && { color: cfg!.color }]}>
                  {pill}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Divider */}
          <View style={s.pillDivider} />

          {/* Scope filters */}
          {SCOPE_PILLS.map(pill => {
            const isActive = filterScope === pill;
            const cfg      = SCOPE[pill];
            return (
              <TouchableOpacity
                key={pill}
                style={[
                  s.pill,
                  isActive && { borderColor: cfg.color, backgroundColor: cfg.bg },
                ]}
                onPress={() => handleScopePill(pill)}
              >
                <Text style={[s.pillText, isActive && { color: cfg.color }]}>{pill}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Active filter summary ── */}
        {(filterTrigger || filterScope) && (
          <View style={s.activeFilterRow}>
            <MaterialCommunityIcons name="filter-outline" size={13} color={COLORS.text.muted} />
            <Text style={s.activeFilterText}>
              {[filterTrigger, filterScope].filter(Boolean).join(' · ')}{' '}
              <Text style={{ color: COLORS.accent }}>({filteredEntries.length} entries)</Text>
            </Text>
            <TouchableOpacity onPress={() => { setFTrigger(null); setFScope(null); }}>
              <Text style={s.clearFilter}>Clear</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Empty state ── */}
        {filteredEntries.length === 0 && (
          <View style={s.empty}>
            <MaterialCommunityIcons name="filter-off-outline" size={40} color={COLORS.text.muted} />
            <Text style={s.emptyTitle}>No entries match this filter</Text>
            <Text style={s.emptyText}>Try clearing the filter to see all changes.</Text>
          </View>
        )}

        {/* ── Change entries ── */}
        <View style={s.entriesList}>
          {filteredEntries.map((entry, idx) => {
            const tCfg = TRIGGER[entry.trigger];
            const sCfg = SCOPE[entry.scope];
            const isFirst = idx === 0;

            return (
              <View key={entry.id} style={[s.card, isFirst && s.cardFirst]}>
                {/* Gold left accent border */}
                <View style={[s.cardAccent, { backgroundColor: tCfg.color }]} />

                <View style={s.cardBody}>
                  {/* Row 1: badges + date */}
                  <View style={s.cardTopRow}>
                    <View style={s.badgesRow}>
                      {/* Trigger badge */}
                      <View style={[s.triggerBadge, { backgroundColor: tCfg.bg, borderColor: tCfg.color + '55' }]}>
                        <MaterialCommunityIcons name={tCfg.icon as any} size={11} color={tCfg.color} />
                        <Text style={[s.triggerBadgeText, { color: tCfg.color }]}> {entry.trigger}</Text>
                      </View>
                      {/* Scope badge */}
                      <View style={[s.scopeBadge, { backgroundColor: sCfg.bg, borderColor: sCfg.color + '44' }]}>
                        <Text style={[s.scopeBadgeText, { color: sCfg.color }]}>{entry.scope}</Text>
                      </View>
                    </View>
                    {/* Timestamp */}
                    <Text style={s.cardDate}>{entry.displayDate}</Text>
                  </View>

                  {/* Row 2: change label */}
                  <Text style={s.changeLabel}>{entry.changeLabel}</Text>

                  {/* Row 3: explanation */}
                  <Text style={s.explanation}>{entry.explanation}</Text>

                  {/* Source tag */}
                  <View style={s.sourceRow}>
                    <MaterialCommunityIcons
                      name={entry.source === 'plan' ? 'robot-outline' : 'swap-horizontal'}
                      size={11}
                      color={COLORS.text.muted}
                    />
                    <Text style={s.sourceText}>
                      {entry.source === 'plan' ? ' AI Programme Adjustment' : ' Exercise Substitution'}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Footer ── */}
        {filteredEntries.length > 0 && (
          <View style={s.footer}>
            <MaterialCommunityIcons name="shield-check-outline" size={14} color={COLORS.text.muted} />
            <Text style={s.footerText}>
              {' '}Every change is logged automatically. Nothing is adjusted without a recorded reason.
            </Text>
          </View>
        )}

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.background },
  scroll:  { flex: 1 },
  loading: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl, paddingBottom: SPACING.md,
  },
  title:      { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.accent, letterSpacing: 3, marginBottom: 4 },
  subtitle:   { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 26 },
  countBadge: { backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center' },
  countText:  { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, color: COLORS.accent },

  // Filter row
  filterScroll:  { maxHeight: 44 },
  filterContent: { paddingHorizontal: SPACING.lg, alignItems: 'center', gap: SPACING.sm, paddingRight: SPACING.xl },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  pillActive:    { borderColor: COLORS.accent, backgroundColor: COLORS.surfaceHighlight },
  pillText:      { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.semibold, color: COLORS.text.muted, lineHeight: 14 },
  pillDivider:   { width: 1, height: 20, backgroundColor: COLORS.border, marginHorizontal: SPACING.xs },

  // Active filter summary
  activeFilterRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  activeFilterText: { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  clearFilter:      { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontWeight: FONTS.weights.semibold },

  // Empty state
  empty: {
    alignItems: 'center', justifyContent: 'center',
    padding: SPACING.xl, marginTop: SPACING.xl, gap: SPACING.md,
  },
  emptyTitle: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.secondary },
  emptyText:  { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, textAlign: 'center' },

  // Entry list
  entriesList: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, gap: SPACING.sm },

  // Change card
  card: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardFirst: { borderColor: COLORS.accent + '33' },
  cardAccent:{ width: 3, flexShrink: 0 },
  cardBody:  { flex: 1, padding: SPACING.lg },

  // Card rows
  cardTopRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.md },
  badgesRow:   { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap', flex: 1 },
  cardDate:    { fontSize: 10, color: COLORS.text.muted, marginLeft: SPACING.sm, paddingTop: 2, flexShrink: 0 },

  // Trigger badge
  triggerBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: RADIUS.full, borderWidth: 1,
  },
  triggerBadgeText: { fontSize: 10, fontWeight: FONTS.weights.heavy, letterSpacing: 0.3 },

  // Scope badge
  scopeBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full, borderWidth: 1 },
  scopeBadgeText: { fontSize: 10, fontWeight: FONTS.weights.semibold },

  // Change label
  changeLabel: {
    fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold,
    color: COLORS.text.primary, marginBottom: SPACING.sm, lineHeight: 22,
  },

  // Explanation
  explanation: {
    fontSize: FONTS.sizes.sm, color: COLORS.text.secondary,
    lineHeight: 20, marginBottom: SPACING.sm,
  },

  // Source tag
  sourceRow: { flexDirection: 'row', alignItems: 'center' },
  sourceText: { fontSize: 10, color: COLORS.text.muted, fontStyle: 'italic' },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  footerText: { fontSize: 10, color: COLORS.text.muted, lineHeight: 16, flex: 1 },
});
