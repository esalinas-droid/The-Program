/**
 * documents/[id]/build-plan.tsx — LLM extraction preview screen (Prompt 7B).
 *
 * On mount, calls POST /api/documents/{id}/build-plan.
 * Shows loading state (30-60s) → extraction preview → activate/cancel.
 * Skeleton mode (no exercises extracted) is handled gracefully.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { COLORS, SPACING, FONTS, RADIUS } from '../../../src/constants/theme';
import {
  documentsApi,
  BuildPlanResponse,
  ExtractionConfidence,
} from '../../../src/utils/api';

// ── Types ─────────────────────────────────────────────────────────────────────
type Phase = 'loading' | 'preview' | 'activating' | 'error';

// ── Helpers ───────────────────────────────────────────────────────────────────
const DAY_NAMES: Record<number, string> = {
  1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu',
  5: 'Fri', 6: 'Sat', 7: 'Sun',
};

function getDayName(n: number) { return DAY_NAMES[n] ?? `Day ${n}`; }

function getWeek1Sessions(plan: Record<string, any>) {
  try {
    return plan.phases[0].blocks[0].weeks[0].sessions ?? [];
  } catch { return []; }
}

function getTotalExercises(plan: Record<string, any>) {
  let count = 0;
  for (const ph of plan?.phases ?? []) {
    for (const bl of ph?.blocks ?? []) {
      for (const wk of bl?.weeks ?? []) {
        for (const sess of wk?.sessions ?? []) {
          count += sess?.exercises?.length ?? 0;
        }
      }
    }
  }
  return count;
}

// ── Loading pulse animation ───────────────────────────────────────────────────
function PulsingDots() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    ).start();
  }, [anim]);
  return (
    <Animated.Text style={[s.dots, { opacity: anim }]}>...</Animated.Text>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BuildPlanScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();

  const [phase,       setPhase]       = useState<Phase>('loading');
  const [response,    setResponse]    = useState<BuildPlanResponse | null>(null);
  const [errorMsg,    setErrorMsg]    = useState('');
  const [planName,    setPlanName]    = useState('');
  const [editingName, setEditingName] = useState(false);
  const [week1Open,   setWeek1Open]   = useState(true);
  const [confOpen,    setConfOpen]    = useState(false);
  const [elapsed,     setElapsed]     = useState(0);

  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Elapsed timer while loading ──────────────────────────────────────────
  useEffect(() => {
    if (phase === 'loading') {
      elapsedTimerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    }
    return () => { if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current); };
  }, [phase]);

  // ── Run extraction on mount ───────────────────────────────────────────────
  const runExtraction = useCallback(async () => {
    if (!id) return;
    setPhase('loading');
    setElapsed(0);
    setErrorMsg('');
    try {
      const res = await documentsApi.buildPlan(id);
      setResponse(res);
      setPlanName(res.proposedPlan?.name ?? 'Imported Program');
      setPhase('preview');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Extraction failed. Please try again.');
      setPhase('error');
    }
  }, [id]);

  useEffect(() => { runExtraction(); }, [runExtraction]);

  // ── Activate ──────────────────────────────────────────────────────────────
  const handleActivate = () => {
    Alert.alert(
      'Activate this plan?',
      'Your current active plan will be archived. You can switch back anytime via Programs.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Activate', style: 'default', onPress: confirmActivate },
      ],
    );
  };

  const confirmActivate = async () => {
    if (!response) return;
    setPhase('activating');
    try {
      const result = await documentsApi.activatePlan(id, {
        planName:    planName,
        proposedPlan: response.proposedPlan,
      });
      if (result.success) {
        router.replace('/(tabs)' as any);
        // Small delay then show toast
        setTimeout(() => {
          Alert.alert('Plan imported', 'Ready to train!');
        }, 500);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not activate the plan.');
      setPhase('preview');
    }
  };

  // ── Render: LOADING ───────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        {renderHeader(router, true)}
        <View style={s.loadingContainer}>
          <View style={s.loadingIconWrap}>
            <ActivityIndicator size="large" color={COLORS.accent} />
          </View>
          <Text style={s.loadingTitle}>
            Reading your program<PulsingDots />
          </Text>
          <Text style={s.loadingSub}>
            GPT-4o is analysing your document and mapping it to a training structure.
            This typically takes 20–60 seconds.
          </Text>
          <Text style={s.elapsedText}>{elapsed}s</Text>
          <View style={s.loadingTips}>
            {[
              'Identifying phase structure',
              'Extracting session templates',
              'Mapping exercise prescriptions',
              'Building weekly rotation',
            ].map((tip, i) => (
              <View key={i} style={s.tipRow}>
                <MaterialCommunityIcons
                  name={elapsed > (i + 1) * 8 ? 'check-circle' : 'circle-outline'}
                  size={14}
                  color={elapsed > (i + 1) * 8 ? COLORS.status.success : COLORS.text.muted}
                />
                <Text style={[
                  s.tipText,
                  elapsed > (i + 1) * 8 && { color: COLORS.status.success },
                ]}>
                  {tip}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  // ── Render: ACTIVATING ────────────────────────────────────────────────────
  if (phase === 'activating') {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        {renderHeader(router, true)}
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={s.loadingTitle}>Activating plan...</Text>
        </View>
      </View>
    );
  }

  // ── Render: ERROR ─────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        {renderHeader(router, false)}
        <View style={s.loadingContainer}>
          <MaterialCommunityIcons name="alert-rhombus-outline" size={44} color={COLORS.status.error} />
          <Text style={s.errorTitle}>Extraction Failed</Text>
          <Text style={s.errorMsg}>{errorMsg}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={runExtraction} activeOpacity={0.85}>
            <MaterialCommunityIcons name="refresh" size={16} color={COLORS.surface} />
            <Text style={s.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelLinkBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={s.cancelLinkText}>Cancel — keep my current plan</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Render: PREVIEW ───────────────────────────────────────────────────────
  const plan       = response!.proposedPlan;
  const conf       = response!.confidence;
  const isSkeletonMode = response!.skeletonMode;
  const phases     = plan?.phases ?? [];
  const week1      = getWeek1Sessions(plan);
  const totalExes  = getTotalExercises(plan);

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {renderHeader(router, false)}

      <ScrollView
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Skeleton mode warning ── */}
        {isSkeletonMode && (
          <View style={s.skeletonBanner}>
            <MaterialCommunityIcons name="information-outline" size={18} color={COLORS.status.warning} />
            <Text style={s.skeletonText}>
              I extracted the program structure but couldn't reliably parse exercises.
              You can still activate the skeleton, or cancel and try re-uploading a clearer document.
            </Text>
          </View>
        )}

        {/* ── Plan name — editable ── */}
        <View style={s.nameSectionWrap}>
          {editingName ? (
            <TextInput
              style={s.nameInput}
              value={planName}
              onChangeText={setPlanName}
              onBlur={() => setEditingName(false)}
              autoFocus
              maxLength={50}
              returnKeyType="done"
              onSubmitEditing={() => setEditingName(false)}
            />
          ) : (
            <TouchableOpacity
              style={s.nameRow}
              onPress={() => setEditingName(true)}
              activeOpacity={0.8}
            >
              <Text style={s.nameText} numberOfLines={2}>{planName}</Text>
              <MaterialCommunityIcons name="pencil-outline" size={18} color={COLORS.text.muted} style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          )}
          <Text style={s.nameSub}>Tap to edit name before activating</Text>
        </View>

        {/* ── Confidence summary ── */}
        {conf?.summary ? (
          <View style={s.summaryBox}>
            <MaterialCommunityIcons name="robot-outline" size={16} color={COLORS.accent} />
            <Text style={s.summaryText}>{conf.summary}</Text>
          </View>
        ) : null}

        {/* ── Key stats row ── */}
        <View style={s.statsRow}>
          <StatChip icon="calendar-range" label="Weeks" value={String(plan?.totalWeeks ?? '—')} />
          <StatChip icon="run-fast" label="Days/week" value={String(plan?.trainingDays ?? '—')} />
          <StatChip icon="layers-outline" label="Phases" value={String(phases.length)} />
          <StatChip icon="dumbbell" label="Exercises" value={String(totalExes)} />
        </View>

        {/* ── Phase breakdown ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>PHASE BREAKDOWN</Text>
          {phases.length === 0 ? (
            <Text style={s.emptyNote}>No phases extracted.</Text>
          ) : (
            phases.map((ph: any, i: number) => (
              <View key={i} style={s.phaseRow}>
                <View style={s.phaseNumBadge}>
                  <Text style={s.phaseNumText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.phaseName}>{ph.phaseName ?? ph.name ?? `Phase ${i + 1}`}</Text>
                  <Text style={s.phaseMeta}>
                    Weeks {ph.startWeek ?? '?'}–{ph.endWeek ?? '?'}
                    {ph.goal ? ` · ${ph.goal}` : ''}
                  </Text>
                </View>
                {ph.endWeek && ph.startWeek && (
                  <Text style={s.phaseWeekCount}>
                    {ph.endWeek - ph.startWeek + 1}wk
                  </Text>
                )}
              </View>
            ))
          )}
          {plan?.deloadWeeks?.length > 0 && (
            <View style={s.deloadRow}>
              <MaterialCommunityIcons name="sleep" size={13} color={COLORS.text.muted} />
              <Text style={s.deloadText}>
                Deload weeks: {plan.deloadWeeks.join(', ')}
              </Text>
            </View>
          )}
        </View>

        {/* ── Week 1 preview (collapsible) ── */}
        <TouchableOpacity
          style={s.sectionHeader}
          onPress={() => setWeek1Open(o => !o)}
          activeOpacity={0.8}
        >
          <Text style={s.sectionTitle}>WEEK 1 PREVIEW</Text>
          <MaterialCommunityIcons
            name={week1Open ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={COLORS.text.muted}
          />
        </TouchableOpacity>

        {week1Open && (
          <View style={s.week1Container}>
            {week1.length === 0 ? (
              <Text style={s.emptyNote}>
                {isSkeletonMode
                  ? 'Exercise detail not extracted — skeleton plan only.'
                  : 'No Week 1 sessions generated.'}
              </Text>
            ) : (
              week1.map((sess: any, si: number) => (
                <View key={si} style={s.sessionCard}>
                  <View style={s.sessionHeader}>
                    <View style={s.dayPill}>
                      <Text style={s.dayPillText}>{getDayName(sess.dayNumber)}</Text>
                    </View>
                    <Text style={s.sessionObjective} numberOfLines={1}>
                      {sess.objective || sess.sessionType || 'Session'}
                    </Text>
                  </View>
                  {(sess.exercises ?? []).slice(0, 6).map((ex: any, ei: number) => (
                    <View key={ei} style={s.exRow}>
                      <View style={[
                        s.exCatDot,
                        { backgroundColor: ex.category === 'main' ? COLORS.accent : COLORS.text.muted },
                      ]} />
                      <Text style={s.exName}>{ex.name}</Text>
                      <Text style={s.exPrescription}>{ex.prescription}</Text>
                    </View>
                  ))}
                  {(sess.exercises?.length ?? 0) > 6 && (
                    <Text style={s.moreText}>+{sess.exercises.length - 6} more exercises</Text>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* ── Confidence breakdown (collapsible) ── */}
        <TouchableOpacity
          style={s.sectionHeader}
          onPress={() => setConfOpen(o => !o)}
          activeOpacity={0.8}
        >
          <Text style={s.sectionTitle}>CONFIDENCE BREAKDOWN</Text>
          <MaterialCommunityIcons
            name={confOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={COLORS.text.muted}
          />
        </TouchableOpacity>

        {confOpen && (
          <View style={s.confContainer}>
            {conf?.high?.length > 0 && (
              <View style={s.confBlock}>
                <Text style={[s.confLabel, { color: COLORS.status.success }]}>
                  Confident about:
                </Text>
                {conf.high.map((item: string, i: number) => (
                  <View key={i} style={s.confRow}>
                    <MaterialCommunityIcons name="check-circle-outline" size={13} color={COLORS.status.success} />
                    <Text style={s.confItem}>{item}</Text>
                  </View>
                ))}
              </View>
            )}
            {conf?.low?.length > 0 && (
              <View style={s.confBlock}>
                <Text style={[s.confLabel, { color: COLORS.status.warning }]}>
                  Assumptions made about:
                </Text>
                {conf.low.map((item: string, i: number) => (
                  <View key={i} style={s.confRow}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={13} color={COLORS.status.warning} />
                    <Text style={s.confItem}>{item}</Text>
                  </View>
                ))}
              </View>
            )}
            {conf?.assumptions?.length > 0 && (
              <View style={s.confBlock}>
                <Text style={[s.confLabel, { color: COLORS.text.muted }]}>Details:</Text>
                {conf.assumptions.map((a: any, i: number) => (
                  <View key={i} style={s.assumptionRow}>
                    <Text style={s.assumptionField}>{a.field}:</Text>
                    <Text style={s.assumptionDetail}>
                      {a.what_you_assumed} — {a.why}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Footer actions ── */}
      <View style={[s.footer, { paddingBottom: insets.bottom + SPACING.md }]}>
        <TouchableOpacity
          style={s.activateBtn}
          onPress={handleActivate}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="check-bold" size={18} color={COLORS.surface} />
          <Text style={s.activateBtnText}>Activate this plan</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.cancelBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Text style={s.cancelBtnText}>Cancel — keep my current plan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatChip({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={s.statChip}>
      <MaterialCommunityIcons name={icon as any} size={18} color={COLORS.accent} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function renderHeader(router: ReturnType<typeof useRouter>, disabled: boolean) {
  return (
    <View style={s.header}>
      <TouchableOpacity
        style={s.backBtn}
        onPress={() => !disabled && router.back()}
        activeOpacity={disabled ? 1 : 0.7}
      >
        <MaterialCommunityIcons
          name="chevron-left"
          size={24}
          color={disabled ? COLORS.text.muted : COLORS.text.secondary}
        />
      </TouchableOpacity>
      <Text style={s.headerTitle}>Plan Preview</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen:            { flex: 1, backgroundColor: COLORS.background },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical:   SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn:       { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle:   { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.bold, color: COLORS.text.primary },

  // Loading state
  loadingContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACING.xl, gap: SPACING.lg,
  },
  loadingIconWrap: {
    width: 80, height: 80, borderRadius: RADIUS.xl,
    backgroundColor: 'rgba(201,168,76,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  loadingTitle: {
    fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.bold,
    color: COLORS.text.primary, textAlign: 'center',
  },
  dots:          { fontSize: FONTS.sizes.xl, color: COLORS.accent },
  loadingSub: {
    fontSize: FONTS.sizes.base, color: COLORS.text.secondary,
    textAlign: 'center', lineHeight: 22, maxWidth: 300,
  },
  elapsedText:   { fontSize: FONTS.sizes.xxxl, fontWeight: FONTS.weights.bold, color: COLORS.accent },
  loadingTips:   { gap: SPACING.sm, alignSelf: 'stretch', paddingHorizontal: SPACING.md },
  tipRow:        { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  tipText:       { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },

  // Error state
  errorTitle:    { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.bold, color: COLORS.status.error, textAlign: 'center' },
  errorMsg:      { fontSize: FONTS.sizes.base, color: COLORS.text.secondary, textAlign: 'center', lineHeight: 22, maxWidth: 300 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.accent, borderRadius: RADIUS.full,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl, marginTop: SPACING.sm,
  },
  retryBtnText:  { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.surface },
  cancelLinkBtn: { paddingVertical: SPACING.md },
  cancelLinkText:{ fontSize: FONTS.sizes.base, color: COLORS.text.secondary },

  // Scroll content
  scrollContent: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },

  // Skeleton banner
  skeletonBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    backgroundColor: 'rgba(255,183,3,0.10)', borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: 'rgba(255,183,3,0.25)',
    padding: SPACING.md, marginBottom: SPACING.lg,
  },
  skeletonText: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 18 },

  // Plan name
  nameSectionWrap: { marginBottom: SPACING.lg },
  nameRow:         { flexDirection: 'row', alignItems: 'center' },
  nameText:        { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.bold, color: COLORS.text.primary, flex: 1 },
  nameInput: {
    fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.bold, color: COLORS.text.primary,
    borderBottomWidth: 2, borderBottomColor: COLORS.accent, paddingBottom: 4,
  },
  nameSub:         { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 4 },

  // Summary box
  summaryBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    backgroundColor: 'rgba(201,168,76,0.08)', borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: 'rgba(201,168,76,0.20)',
    padding: SPACING.md, marginBottom: SPACING.lg,
  },
  summaryText: {
    flex: 1, fontSize: FONTS.sizes.base, color: COLORS.text.secondary,
    fontStyle: 'italic', lineHeight: 20,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xl,
  },
  statChip: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md, alignItems: 'center', gap: 3,
  },
  statValue: { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.bold, color: COLORS.text.primary },
  statLabel: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, textAlign: 'center' },

  // Section headers
  section:         { marginBottom: SPACING.xl },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  sectionTitle:    { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, color: COLORS.text.muted, letterSpacing: 1.2 },

  // Phases
  phaseRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  phaseNumBadge: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(201,168,76,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  phaseNumText:    { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.bold, color: COLORS.accent },
  phaseName:       { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary },
  phaseMeta:       { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 2 },
  phaseWeekCount:  { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  deloadRow:       { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: SPACING.sm },
  deloadText:      { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },

  // Week 1 sessions
  week1Container:  { gap: SPACING.md, marginBottom: SPACING.xl },
  sessionCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
  },
  sessionHeader:   { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  dayPill: {
    backgroundColor: 'rgba(201,168,76,0.15)', borderRadius: RADIUS.sm,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  dayPillText:     { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, color: COLORS.accent },
  sessionObjective:{ fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary, flex: 1 },
  exRow:           { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 3 },
  exCatDot:        { width: 6, height: 6, borderRadius: 3 },
  exName:          { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text.primary },
  exPrescription:  { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  moreText:        { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 4, textAlign: 'center' },

  // Confidence
  confContainer:   { gap: SPACING.md, marginBottom: SPACING.xl },
  confBlock:       { gap: SPACING.xs },
  confLabel:       { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, marginBottom: 4 },
  confRow:         { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  confItem:        { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary },
  assumptionRow:   { flexDirection: 'row', gap: SPACING.xs, paddingVertical: 2 },
  assumptionField: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.semibold, color: COLORS.text.muted, width: 90 },
  assumptionDetail:{ flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.text.secondary },

  // Empty / misc
  emptyNote:       { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, fontStyle: 'italic', paddingVertical: SPACING.sm },

  // Footer
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: COLORS.background, borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, gap: SPACING.sm,
  },
  activateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, backgroundColor: COLORS.accent, borderRadius: RADIUS.full,
    paddingVertical: SPACING.md + 2,
  },
  activateBtnText: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.surface },
  cancelBtn:       { alignItems: 'center', paddingVertical: SPACING.sm },
  cancelBtnText:   { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary },
});
