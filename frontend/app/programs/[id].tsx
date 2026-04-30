import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, Modal, TextInput, StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';
import { programsApi, profileApi } from '../../src/utils/api';
import { getProfile, saveProfile } from '../../src/utils/storage';
import type { AnnualPlan } from '../../src/types';

function fmtDate(iso?: string | null) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso.slice(0, 10); }
}

function weeksBetween(start: string, end?: string | null) {
  try {
    const s = new Date(start);
    const e = end ? new Date(end) : new Date();
    return Math.max(1, Math.round((e.getTime() - s.getTime()) / (7 * 86400 * 1000)));
  } catch { return 0; }
}

export default function ProgramDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [plan, setPlan] = useState<AnnualPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Re-activate modal state
  const [showReactivateModal, setShowReactivateModal] = useState(false);
  const [reactivatePayload, setReactivatePayload] = useState<{
    last_active_week: number;
    total_weeks: number;
  } | null>(null);

  // Delete confirmation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const DELETE_CONFIRMATION = 'DELETE';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch from the programs list and find the matching plan
      const data = await programsApi.list();
      const all: AnnualPlan[] = [
        ...(data.active ? [data.active as AnnualPlan] : []),
        ...(data.archived as AnnualPlan[]),
      ];
      const found = all.find(p => p.planId === id);
      setPlan(found ?? null);
    } catch (e) {
      console.warn('[ProgramDetail] load error', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── Re-activate ──────────────────────────────────────────────────────────
  const handleReactivate = async () => {
    if (!plan) return;
    setActivating(true);
    try {
      const res = await programsApi.activate(plan.planId);
      setReactivatePayload({ last_active_week: res.last_active_week, total_weeks: res.total_weeks });
      setShowReactivateModal(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not activate program.');
    } finally {
      setActivating(false);
    }
  };

  const applyResumption = async (resume: boolean) => {
    if (!plan || !reactivatePayload) return;
    setShowReactivateModal(false);
    try {
      // Update profile's currentWeek + programStartDate
      const profile = await profileApi.get();
      let newWeek: number;
      let newStartDate: string;
      const today = new Date().toISOString().slice(0, 10);

      if (resume) {
        newWeek = reactivatePayload.last_active_week;
        // Backdate start so weekday math still works: startDate = today - (week - 1) weeks
        const backdate = new Date();
        backdate.setDate(backdate.getDate() - (newWeek - 1) * 7);
        newStartDate = backdate.toISOString().slice(0, 10);
      } else {
        newWeek = 1;
        newStartDate = today;
      }

      await profileApi.update({ currentWeek: newWeek, programStartDate: newStartDate } as any);
      const updatedProfile = { ...(profile as any), currentWeek: newWeek, programStartDate: newStartDate };
      await saveProfile(updatedProfile);

      Alert.alert(
        'Program Activated!',
        resume
          ? `Resuming at Week ${newWeek} of ${reactivatePayload.total_weeks}.`
          : 'Starting fresh from Week 1.',
        [{ text: 'Got it', onPress: () => router.push('/programs') }],
      );
    } catch (e) {
      Alert.alert('Error', 'Could not update your progress. Please try again.');
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!plan || deleteText !== DELETE_CONFIRMATION) return;
    setDeleting(true);
    setShowDeleteModal(false);
    try {
      await programsApi.delete(plan.planId);
      router.replace('/programs');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not delete program.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <ActivityIndicator style={{ marginTop: 80 }} color={COLORS.accent} />
      </View>
    );
  }

  if (!plan) {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.closeBtn}>
          <MaterialCommunityIcons name="close" size={22} color={COLORS.text.secondary} />
        </TouchableOpacity>
        <Text style={[s.emptyBody, { marginTop: 80, textAlign: 'center' }]}>Program not found.</Text>
      </View>
    );
  }

  const weeks = plan.archivedAt
    ? weeksBetween(plan.startDate, plan.archivedAt)
    : weeksBetween(plan.startDate);

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.closeBtn}>
          <MaterialCommunityIcons name="close" size={22} color={COLORS.text.secondary} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{plan.name || plan.planName}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats card */}
        <View style={s.statsCard}>
          <Text style={s.statsCardTitle}>Program Summary</Text>
          <View style={s.statsGrid}>
            <View style={s.statItem}>
              <Text style={s.statBig}>{weeks}</Text>
              <Text style={s.statSub}>weeks</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statBig}>{plan.sessions_completed ?? 0}</Text>
              <Text style={s.statSub}>sessions</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statBig}>{plan.prs_hit ?? 0}</Text>
              <Text style={s.statSub}>PRs</Text>
            </View>
          </View>
          <Text style={s.dateText}>
            {fmtDate(plan.startDate)}{plan.archivedAt ? ` → ${fmtDate(plan.archivedAt)}` : ' → Present'}
          </Text>
        </View>

        {/* Block breakdown */}
        {plan.phases?.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionHeader}>BLOCK BREAKDOWN</Text>
            <View style={s.blockList}>
              {plan.phases.map((phase: any, idx: number) => (
                <View key={idx} style={[s.blockRow, idx < plan.phases.length - 1 && s.blockRowBorder]}>
                  <View style={s.blockIndex}>
                    <Text style={s.blockIndexText}>{idx + 1}</Text>
                  </View>
                  <View style={s.blockMeta}>
                    <Text style={s.blockName}>{phase.name || phase.phase || `Phase ${idx + 1}`}</Text>
                    <Text style={s.blockDetail}>
                      {phase.weeks ?? phase.totalWeeks ?? '?'} weeks
                      {phase.focus ? ` · ${phase.focus}` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* CTA buttons */}
        <View style={s.ctaSection}>
          {plan.status === 'archived' && (
            <TouchableOpacity
              style={[s.reactivateBtn, activating && { opacity: 0.6 }]}
              onPress={handleReactivate}
              disabled={activating}
              activeOpacity={0.85}
            >
              {activating
                ? <ActivityIndicator color={COLORS.surface} size="small" />
                : <Text style={s.reactivateBtnText}>Re-activate this Program</Text>}
            </TouchableOpacity>
          )}

          {plan.status === 'archived' && (
            <TouchableOpacity
              style={s.deleteBtn}
              onPress={() => { setDeleteText(''); setShowDeleteModal(true); }}
              disabled={deleting}
            >
              {deleting
                ? <ActivityIndicator color={COLORS.status?.error ?? '#E55757'} size="small" />
                : <Text style={s.deleteBtnText}>Delete this program</Text>}
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Re-activate choice modal */}
      <Modal visible={showReactivateModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>How do you want to start?</Text>
            <Text style={s.modalBody}>
              Resume where you left off (Week {reactivatePayload?.last_active_week} of {reactivatePayload?.total_weeks}),
              or start fresh from Week 1?
            </Text>
            <TouchableOpacity
              style={s.modalPrimaryBtn}
              onPress={() => applyResumption(true)}
            >
              <Text style={s.modalPrimaryText}>
                Resume Week {reactivatePayload?.last_active_week}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.modalSecondaryBtn}
              onPress={() => applyResumption(false)}
            >
              <Text style={s.modalSecondaryText}>Start over from Week 1</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowReactivateModal(false)} style={s.modalCancelBtn}>
              <Text style={s.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal visible={showDeleteModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Delete Program?</Text>
            <Text style={s.modalBody}>
              This cannot be undone. Your workout history from this program will be preserved,
              but the program document will be permanently deleted.
            </Text>
            <Text style={s.deletePrompt}>
              Type <Text style={s.deleteBold}>DELETE</Text> to confirm:
            </Text>
            <TextInput
              style={s.deleteInput}
              value={deleteText}
              onChangeText={setDeleteText}
              autoCapitalize="characters"
              placeholder="DELETE"
              placeholderTextColor={COLORS.text.muted}
            />
            <TouchableOpacity
              style={[s.modalDangerBtn, deleteText !== DELETE_CONFIRMATION && { opacity: 0.4 }]}
              onPress={handleDelete}
              disabled={deleteText !== DELETE_CONFIRMATION}
            >
              <Text style={s.modalDangerText}>Delete permanently</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowDeleteModal(false)} style={s.modalCancelBtn}>
              <Text style={s.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const ERROR_COLOR = '#E55757';

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1, textAlign: 'center',
    fontSize: FONTS.sizes.md, fontWeight: FONTS.weights.bold, color: COLORS.text.primary,
  },
  scroll: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  // Stats card
  statsCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.xl,
  },
  statsCardTitle: {
    fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold,
    color: COLORS.text.muted, letterSpacing: 0.5, marginBottom: SPACING.md,
  },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: SPACING.md },
  statItem: { alignItems: 'center', flex: 1 },
  statBig: { fontSize: 28, fontWeight: FONTS.weights.bold, color: COLORS.accent },
  statSub: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: COLORS.border, alignSelf: 'stretch' },
  dateText: { fontSize: FONTS.sizes.xs, color: COLORS.text.secondary, textAlign: 'center' },
  // Section
  section: { marginBottom: SPACING.xl },
  sectionHeader: {
    fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold,
    color: COLORS.text.muted, letterSpacing: 1.2, marginBottom: SPACING.sm,
  },
  blockList: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, overflow: 'hidden' },
  blockRow: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md },
  blockRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  blockIndex: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.accent + '22', alignItems: 'center', justifyContent: 'center',
    marginRight: SPACING.md,
  },
  blockIndexText: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.bold, color: COLORS.accent },
  blockMeta: { flex: 1 },
  blockName: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary },
  blockDetail: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 2 },
  // CTAs
  ctaSection: { gap: SPACING.md, marginBottom: SPACING.md },
  reactivateBtn: {
    backgroundColor: COLORS.accent, borderRadius: RADIUS.full,
    paddingVertical: SPACING.md, alignItems: 'center',
  },
  reactivateBtnText: { fontSize: FONTS.sizes.md, fontWeight: FONTS.weights.bold, color: COLORS.surface },
  deleteBtn: { alignItems: 'center', paddingVertical: SPACING.sm },
  deleteBtnText: { fontSize: FONTS.sizes.sm, color: ERROR_COLOR, fontWeight: FONTS.weights.medium },
  emptyBody: { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },
  // Modals
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    padding: SPACING.xl, paddingBottom: SPACING.xxl ?? SPACING.xl,
    gap: SPACING.md,
  },
  modalTitle: { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.bold, color: COLORS.text.primary, textAlign: 'center' },
  modalBody: { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, textAlign: 'center', lineHeight: 20 },
  modalPrimaryBtn: {
    backgroundColor: COLORS.accent, borderRadius: RADIUS.full,
    paddingVertical: SPACING.md, alignItems: 'center',
  },
  modalPrimaryText: { fontSize: FONTS.sizes.md, fontWeight: FONTS.weights.bold, color: COLORS.surface },
  modalSecondaryBtn: {
    borderWidth: 1, borderColor: COLORS.accent, borderRadius: RADIUS.full,
    paddingVertical: SPACING.md, alignItems: 'center',
  },
  modalSecondaryText: { fontSize: FONTS.sizes.md, fontWeight: FONTS.weights.medium, color: COLORS.accent },
  modalDangerBtn: {
    backgroundColor: ERROR_COLOR, borderRadius: RADIUS.full,
    paddingVertical: SPACING.md, alignItems: 'center',
  },
  modalDangerText: { fontSize: FONTS.sizes.md, fontWeight: FONTS.weights.bold, color: '#fff' },
  modalCancelBtn: { alignItems: 'center', paddingVertical: SPACING.xs },
  modalCancelText: { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },
  deletePrompt: { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary },
  deleteBold: { fontWeight: FONTS.weights.bold, color: COLORS.text.primary },
  deleteInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    fontSize: FONTS.sizes.md, color: COLORS.text.primary,
    letterSpacing: 2,
  },
});
