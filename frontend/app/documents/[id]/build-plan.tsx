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
  programsApi,
  BuildPlanResponse,
  ExtractionConfidence,
} from '../../../src/utils/api';
import { getProfile } from '../../../src/utils/storage';

// ── Types ─────────────────────────────────────────────────────────────────────
type Phase = 'loading' | 'preview' | 'activating' | 'error';

// ── Picker data model ─────────────────────────────────────────────────────────
interface WeekItem {
  weekNumber:   number;
  sessionCount: number;
  isDeload:     boolean;
  isTest:       boolean;
  goal:         string;
}
interface BlockGroup {
  blockName: string;
  startWeek: number;
  endWeek:   number;
  weeks:     WeekItem[];
}

/** Flatten phases → blocks → weeks into a flat list of BlockGroups for the picker. */
function buildBlockGroups(plan: Record<string, any>): BlockGroup[] {
  const groups: BlockGroup[] = [];
  for (const ph of plan?.phases ?? []) {
    for (const bl of ph?.blocks ?? []) {
      const rawWeeks: any[] = bl?.weeks ?? [];
      if (!rawWeeks.length) continue;
      const nums = rawWeeks.map((w: any) => w.weekNumber as number);
      groups.push({
        blockName: (bl.blockName || bl.blockGoal || `Block ${bl.blockNumber ?? groups.length + 1}`),
        startWeek: Math.min(...nums),
        endWeek:   Math.max(...nums),
        weeks: rawWeeks.map((w: any) => ({
          weekNumber:   w.weekNumber as number,
          sessionCount: ((w.sessions ?? []) as any[]).length,
          isDeload:     !!w.isDeload,
          isTest:       !!w.isTest,
          goal:         (bl.blockGoal || ph.goal || '') as string,
        })),
      });
    }
  }
  // Fallback: if plan has no blocks, create one synthetic group with all weeks
  if (!groups.length) {
    const total = plan?.totalWeeks ?? 0;
    if (total > 0) {
      groups.push({
        blockName: 'WEEKS',
        startWeek: 1,
        endWeek:   total,
        weeks: Array.from({ length: total }, (_, i) => ({
          weekNumber:   i + 1,
          sessionCount: 0,
          isDeload:     (plan?.deloadWeeks ?? []).includes(i + 1),
          isTest:       (plan?.testingWeeks ?? []).includes(i + 1),
          goal:         '',
        })),
      });
    }
  }
  return groups;
}

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
  // ── Start-from picker state ──────────────────────────────────────────────
  const [selectedWeek,   setSelectedWeek]   = useState<number>(1);
  const [isReactivation, setIsReactivation] = useState(false);
  const [smartDefault,   setSmartDefault]   = useState(1);

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
    // Reset picker state each time extraction runs
    setSelectedWeek(1);
    setIsReactivation(false);
    setSmartDefault(1);
    try {
      const res = await documentsApi.buildPlan(id);
      setResponse(res);
      setPlanName(res.proposedPlan?.name ?? 'Imported Program');
      setPhase('preview');

      // ── Reactivation detection: check for an existing active imported plan ────
      // Non-blocking: failures here don't prevent activation.
      // Only set isReactivation=true if user has previously imported a program
      // (prevents false positives from AI-generated plans from onboarding).
      try {
        const prof = await getProfile();
        const hasImportedBefore = (prof as any)?.has_imported_program === true;
        const { active } = await programsApi.list();
        if (active?.startDate && hasImportedBefore) {
          const startMs = new Date(active.startDate).getTime();
          const days    = Math.max(0, Math.floor((Date.now() - startMs) / 86_400_000));
          const curWk   = Math.floor(days / 7) + 1;
          const newMax  = (res.proposedPlan?.totalWeeks as number) ?? curWk + 1;
          const def     = Math.min(curWk + 1, newMax);
          setIsReactivation(true);
          setSmartDefault(def);
          setSelectedWeek(def);
        }
      } catch { /* non-critical */ }
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Extraction failed. Please try again.');
      setPhase('error');
    }
  }, [id]);

  useEffect(() => { runExtraction(); }, [runExtraction]);

  // ── Activate ──────────────────────────────────────────────────────────────
  // NOTE: Alert.alert with multi-button arrays is silently swallowed on
  // react-native-web — the onPress callback never fires.  The "Cancel — keep
  // my current plan" button below already lets the user back out, so the
  // confirmation dialog is redundant UX. Call confirmActivate directly.
  const handleActivate = () => {
    if (!response?.proposedPlan) {
      setErrorMsg('No plan data available. Please re-run extraction.');
      setPhase('error');
      return;
    }
    confirmActivate();
  };

  const confirmActivate = async () => {
    if (!response?.proposedPlan) return;
    setPhase('activating');
    try {
      const result = await documentsApi.activatePlan(id, {
        planName:    planName,
        proposedPlan: response.proposedPlan,
        startWeek:   selectedWeek,
      });
      if (result.success) {
        // '/' resolves to (tabs)/index.tsx via Expo Router's group resolution.
        router.replace('/');
      } else {
        // Backend returned { success: false } without throwing — show error
        // so the user isn't stuck on the 'activating' spinner indefinitely.
        setErrorMsg('Could not activate the plan. Please try again.');
        setPhase('error');
      }
    } catch (e: any) {
      const msg: string = e?.message ?? 'Could not activate the plan.';
      setErrorMsg(msg);
      setPhase('error');
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

        {/* ── Start From picker ── */}
        <StartFromPicker
          plan={response?.proposedPlan}
          selectedWeek={selectedWeek}
          onSelect={setSelectedWeek}
          isReactivation={isReactivation}
          smartDefault={smartDefault}
        />

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
          <Text style={s.activateBtnText}>
            {isReactivation ? 'Re-activate plan' : 'Activate plan'}
          </Text>
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
// ─────────────────────────────────────────────────────────────────────────────
// StartFromPicker
// ─────────────────────────────────────────────────────────────────────────────
interface StartFromPickerProps {
  plan:           Record<string, any> | undefined;
  selectedWeek:   number;
  onSelect:       (week: number) => void;
  isReactivation: boolean;
  smartDefault:   number;
}

function StartFromPicker({
  plan, selectedWeek, onSelect, isReactivation, smartDefault,
}: StartFromPickerProps) {
  if (!plan) return null;
  const groups = buildBlockGroups(plan);
  if (!groups.length) return null;

  return (
    <View style={ps.section}>
      {/* Section header */}
      <Text style={ps.sectionTitle}>START FROM</Text>
      <Text style={ps.subtitle}>Pick the week you want to begin training.</Text>

      {/* Reactivation callout */}
      {isReactivation && (
        <View style={ps.callout}>
          <MaterialCommunityIcons
            name="calendar-clock"
            size={16}
            color={COLORS.accent}
          />
          <Text style={ps.calloutText}>
            Suggested start:{' '}
            <Text style={{ fontWeight: '600' }}>Week {smartDefault}</Text>
            {' '}— picks up where your last session left off.
          </Text>
        </View>
      )}

      {/* Block groups */}
      {groups.map((group) => (
        <View key={group.blockName + group.startWeek}>
          {/* Block header label */}
          <Text style={ps.blockLabel}>
            {group.blockName.toUpperCase()}
            {' · '}
            WEEK{group.startWeek === group.endWeek ? '' : 'S'}{' '}
            {group.startWeek === group.endWeek
              ? group.startWeek
              : `${group.startWeek}–${group.endWeek}`}
          </Text>

          {/* Week rows */}
          {group.weeks.map((w) => {
            const sel = w.weekNumber === selectedWeek;
            // Build metadata string
            let meta = '';
            if (w.isDeload)      meta = 'Deload week';
            else if (w.isTest)   meta = 'Testing week';
            else if (w.goal)     meta = `${w.goal}${w.sessionCount ? ` · ${w.sessionCount} session${w.sessionCount !== 1 ? 's' : ''}` : ''}`;
            else if (w.sessionCount) meta = `${w.sessionCount} session${w.sessionCount !== 1 ? 's' : ''}`;

            return (
              <TouchableOpacity
                key={w.weekNumber}
                style={[ps.weekRow, sel ? ps.weekRowSel : ps.weekRowUnsel]}
                onPress={() => onSelect(w.weekNumber)}
                activeOpacity={0.7}
              >
                {/* Numbered circle */}
                <View style={[ps.circle, sel ? ps.circleSel : ps.circleUnsel]}>
                  <Text style={[ps.circleNum, sel ? ps.circleNumSel : ps.circleNumUnsel]}>
                    {w.weekNumber}
                  </Text>
                </View>

                {/* Labels */}
                <View style={ps.weekLabelCol}>
                  <Text style={[ps.weekLabel, sel && ps.weekLabelSel]}>
                    Week {w.weekNumber}
                  </Text>
                  {sel && meta ? (
                    <Text style={ps.weekMeta}>{meta}</Text>
                  ) : null}
                </View>

                {/* Check mark when selected */}
                {sel && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color={COLORS.accent}
                    style={{ marginLeft: 'auto' as any }}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const ps = StyleSheet.create({
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.bold,
    color: COLORS.accent,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    marginBottom: SPACING.md,
  },
  callout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: 'rgba(201,168,76,0.10)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.25)',
    padding: SPACING.sm,
    marginBottom: SPACING.md,
  },
  calloutText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.accent,
    flex: 1,
  },
  blockLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.bold,
    color: COLORS.accent,
    letterSpacing: 1.1,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    marginBottom: 4,
    borderWidth: 1,
  },
  weekRowSel: {
    backgroundColor: '#1A1200',
    borderColor: COLORS.accent,
  },
  weekRowUnsel: {
    backgroundColor: COLORS.card,
    borderColor: 'transparent',
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleSel:   { backgroundColor: COLORS.accent },
  circleUnsel: { backgroundColor: COLORS.surfaceHighlight },
  circleNum: {
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.bold,
  },
  circleNumSel:   { color: COLORS.text.inverse },
  circleNumUnsel: { color: COLORS.accent },
  weekLabelCol: { flex: 1 },
  weekLabel: {
    fontSize: FONTS.sizes.base,
    color: COLORS.text.primary,
  },
  weekLabelSel: { fontWeight: '500' },
  weekMeta: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.accent,
    marginTop: 1,
  },
});

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
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.accent, borderRadius: 14,
    paddingVertical: SPACING.md + 2, paddingHorizontal: SPACING.lg,
  },
  activateBtnText: {
    fontSize: FONTS.sizes.base, fontWeight: '500', color: COLORS.text.inverse,
  },
  cancelBtn:       { alignItems: 'center', paddingVertical: SPACING.sm },
  cancelBtnText:   { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary },
});
