import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  TextInput, Alert, Modal, StyleSheet, Platform, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../src/constants/theme';
import { programsApi, profileApi } from '../src/utils/api';
import { saveProfile, getProfile } from '../src/utils/storage';
import type { AnnualPlan } from '../src/types';

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string | undefined | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso?.slice(0, 10) ?? ''; }
}

function weeksBetween(start: string, endOrNull?: string | null): number {
  try {
    const s = new Date(start);
    const e = endOrNull ? new Date(endOrNull) : new Date();
    return Math.max(1, Math.round((e.getTime() - s.getTime()) / (7 * 86400 * 1000)));
  } catch { return 0; }
}

function currentWeekOfPlan(startDate: string): number {
  return Math.max(1, weeksBetween(startDate) + 1);
}

// ── Sub-components ───────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={s.sectionHeader}>{title}</Text>
  );
}

function StatPill({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <View style={s.statPill}>
      <MaterialCommunityIcons name={icon as any} size={14} color={COLORS.accent} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function ProgramsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<AnnualPlan | null>(null);
  const [archived, setArchived] = useState<AnnualPlan[]>([]);
  const [isFreeMode, setIsFreeMode] = useState(false);

  // Inline name-edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const editRef = useRef<TextInput>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const prof = await profileApi.get();
      setIsFreeMode((prof as any)?.training_mode === 'free');
      const data = await programsApi.list();
      setActive(data.active as AnnualPlan | null);
      setArchived(data.archived as AnnualPlan[]);
    } catch (e) {
      console.warn('[Programs] load error', e);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Save inline name edit ──────────────────────────────────────────────────
  const commitName = async (planId: string) => {
    if (!editName.trim()) { setEditingId(null); return; }
    setSavingName(true);
    try {
      const updated = await programsApi.rename(planId, editName.trim());
      if (active?.planId === planId) setActive({ ...active, name: updated.name });
      else setArchived(prev => prev.map(p => p.planId === planId ? { ...p, name: updated.name } : p));
    } catch { Alert.alert('Error', 'Could not rename program.'); }
    finally { setSavingName(false); setEditingId(null); }
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderActiveCard = () => {
    if (isFreeMode) {
      return (
        <View style={s.emptyCard}>
          <MaterialCommunityIcons name="dumbbell" size={28} color={COLORS.text.muted} />
          <Text style={s.emptyTitle}>Free Training Mode</Text>
          <Text style={s.emptyBody}>
            You're in free training mode. No programs to manage.{' '}
            Switch to a program from Settings to get started.
          </Text>
        </View>
      );
    }
    if (!active) {
      return (
        <View style={s.emptyCard}>
          <MaterialCommunityIcons name="plus-box-outline" size={28} color={COLORS.text.muted} />
          <Text style={s.emptyTitle}>No Active Program</Text>
          <Text style={s.emptyBody}>Tap "+ New Program" below to get started.</Text>
        </View>
      );
    }

    const weekNum = currentWeekOfPlan(active.startDate);
    const totalW = active.totalWeeks;
    const isEditing = editingId === active.planId;

    return (
      <View style={s.activeCard}>
        {/* Status pill */}
        <View style={s.activePill}>
          <Text style={s.activePillText}>ACTIVE</Text>
        </View>

        {/* Name row */}
        <View style={s.nameRow}>
          {isEditing ? (
            <TextInput
              ref={editRef}
              style={s.nameInput}
              value={editName}
              onChangeText={setEditName}
              onBlur={() => commitName(active.planId)}
              onSubmitEditing={() => commitName(active.planId)}
              returnKeyType="done"
              maxLength={120}
              autoFocus
            />
          ) : (
            <Text style={s.activeName} numberOfLines={2}>{active.name || active.planName}</Text>
          )}
          {savingName && editingId === active.planId
            ? <ActivityIndicator size="small" color={COLORS.accent} style={{ marginLeft: 6 }} />
            : (
              <TouchableOpacity
                onPress={() => { setEditingId(active.planId); setEditName(active.name || active.planName); setTimeout(() => editRef.current?.focus(), 50); }}
                style={s.editBtn}
              >
                <MaterialCommunityIcons name="pencil-outline" size={16} color={COLORS.accent} />
              </TouchableOpacity>
            )}
        </View>

        {/* Date range */}
        <Text style={s.dateRange}>
          Started {fmtDate(active.startDate)} · Week {Math.min(weekNum, totalW)} of {totalW}
        </Text>

        {/* Stats row */}
        <View style={s.statsRow}>
          <StatPill icon="dumbbell" value={active.sessions_completed ?? 0} label="sessions" />
          <StatPill icon="trophy-outline" value={active.prs_hit ?? 0} label="PRs" />
        </View>
      </View>
    );
  };

  const renderArchivedRow = (plan: AnnualPlan) => {
    const startFmt = fmtDate(plan.startDate);
    const endFmt = fmtDate(plan.archivedAt ?? undefined);
    const weeks = plan.archivedAt
      ? weeksBetween(plan.startDate, plan.archivedAt)
      : plan.totalWeeks;

    return (
      <TouchableOpacity
        key={plan.planId}
        style={s.archivedRow}
        onPress={() => router.push(`/programs/${plan.planId}`)}
        activeOpacity={0.7}
      >
        <View style={s.archivedLeft}>
          <Text style={s.archivedName} numberOfLines={1}>{plan.name || plan.planName}</Text>
          <Text style={s.archivedDate}>{startFmt} → {endFmt} · {weeks}w</Text>
          <Text style={s.archivedStats}>
            {plan.sessions_completed ?? 0} sessions · {plan.prs_hit ?? 0} PRs
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.text.muted} />
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <ActivityIndicator style={{ marginTop: 80 }} color={COLORS.accent} />
      </View>
    );
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.closeBtn}>
          <MaterialCommunityIcons name="close" size={22} color={COLORS.text.secondary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Programs</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ACTIVE */}
        <SectionHeader title="ACTIVE PROGRAM" />
        {renderActiveCard()}

        {/* ARCHIVED */}
        <SectionHeader title="ARCHIVED PROGRAMS" />
        {archived.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyBody}>No archived programs yet.</Text>
          </View>
        ) : (
          <View style={s.archivedList}>
            {archived.map(renderArchivedRow)}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Footer CTA */}
      {!isFreeMode && (
        <View style={[s.footer, { paddingBottom: insets.bottom + SPACING.md }]}>
          <TouchableOpacity
            style={s.newBtn}
            onPress={() => router.push('/onboarding-path-picker?mode=switch')}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="plus" size={18} color={COLORS.surface} />
            <Text style={s.newBtnText}>+ New Program</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.importBtn}
            onPress={() => router.push('/import-document' as any)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="upload-outline" size={15} color={COLORS.accent} />
            <Text style={s.importBtnText}>Import from document</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.text.primary,
    letterSpacing: 0.3,
  },
  scroll: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  sectionHeader: {
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.bold,
    color: COLORS.text.muted,
    letterSpacing: 1.2,
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
  },
  // Active card
  activeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.accent + '44',
  },
  activePill: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.accent + '22',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    marginBottom: SPACING.sm,
  },
  activePillText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.bold,
    color: COLORS.accent,
    letterSpacing: 1.0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  activeName: {
    flex: 1,
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.text.primary,
    lineHeight: 24,
  },
  nameInput: {
    flex: 1,
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.text.primary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.accent,
    paddingVertical: 2,
  },
  editBtn: {
    marginLeft: SPACING.sm,
    padding: 4,
  },
  dateRange: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    marginBottom: SPACING.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surfaceHighlight,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  statValue: {
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.text.primary,
  },
  statLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
  },
  // Empty states
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  emptyTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.text.secondary,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Archived list
  archivedList: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    marginBottom: SPACING.xl,
  },
  archivedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  archivedLeft: {
    flex: 1,
  },
  archivedName: {
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.text.primary,
    marginBottom: 2,
  },
  archivedDate: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.secondary,
    marginBottom: 2,
  },
  archivedStats: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
  },
  // Footer
  footer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md,
  },
  newBtnText: {
    fontSize: FONTS.sizes.md,
    fontWeight: FONTS.weights.bold,
    color: COLORS.surface,
  },
  importBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             SPACING.xs,
    marginTop:       SPACING.sm,
    paddingVertical: SPACING.sm + 2,
  },
  importBtnText: {
    fontSize:   FONTS.sizes.sm,
    fontWeight: FONTS.weights.medium,
    color:      COLORS.accent,
  },
});
