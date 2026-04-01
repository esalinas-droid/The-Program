import { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  Linking, ActivityIndicator, Modal, Animated, Pressable,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, FONTS, RADIUS, getSessionStyle } from '../../src/constants/theme';
import { getProfile } from '../../src/utils/storage';
import { logApi, substitutionApi } from '../../src/utils/api';
import { getProgramSession, getWeekSessions, getTodayDayName } from '../../src/data/programData';
import { ProgramSession } from '../../src/types';
import {
  ADJUST_REASONS, REASON_ICONS, AdjustReason, Alternative,
  getAlternatives, extractExerciseName,
} from '../../src/data/substitutions';

const TRAINING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const INJURY_MAP: Record<string, string[]> = {
  'Right hamstring / nerve compression': ['conventional deadlift', 'romanian deadlift', 'rdl', 'stiff-leg', 'from floor'],
  'Low back':          ['jefferson curl', 'spinal flexion', 'good morning'],
  'Left knee':         ['split squat', 'lunge', 'step-up', 'single-leg press'],
  'Left bicep strain': ['stone to shoulder', 'stone lap', 'axle clean', 'log clean from floor'],
  'Shoulder history':  ['behind-neck', 'behind neck', 'snatch grip'],
};

function getInjuryWarnings(session: ProgramSession, injuryFlags: string[]): string[] {
  const warnings: string[] = [];
  const allWork = [session.mainLift, ...session.supplementalWork, ...session.accessories].join(' ').toLowerCase();
  for (const flag of injuryFlags) {
    const triggers = INJURY_MAP[flag];
    if (triggers?.some(t => allWork.includes(t))) {
      warnings.push(`⚠ ${flag.split('/')[0].trim()} — Review flagged movements in this session`);
    }
  }
  return warnings;
}

// ── Swap state shape ──────────────────────────────────────────────────────────
type SwapInfo = { original: string; replacement: string; reason: string };
type SwapMap  = Record<string, SwapInfo>;

// ── AdjustModal ───────────────────────────────────────────────────────────────
interface AdjustModalProps {
  visible: boolean;
  exerciseKey: string;
  exerciseName: string;
  onClose: () => void;
  onConfirm: (key: string, original: string, replacement: string, reason: AdjustReason) => void;
}

function AdjustModal({ visible, exerciseKey, exerciseName, onClose, onConfirm }: AdjustModalProps) {
  const [step, setStep]                 = useState<1 | 2>(1);
  const [selectedReason, setReason]     = useState<AdjustReason | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [selectedAlt, setSelectedAlt]   = useState<Alternative | null>(null);
  const slideAnim = useRef(new Animated.Value(600)).current;

  // Slide in/out on visibility change
  useCallback(() => {}, [])(); // ensure stable ref
  const handleShow = () => {
    setStep(1); setReason(null); setAlternatives([]); setSelectedAlt(null);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }).start();
  };
  const handleHide = (cb?: () => void) => {
    Animated.timing(slideAnim, { toValue: 600, duration: 220, useNativeDriver: true }).start(() => cb?.());
  };

  const handleClose = () => handleHide(onClose);

  const handleReasonSelect = (r: AdjustReason) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReason(r);
    setAlternatives(getAlternatives(extractExerciseName(exerciseName), r));
    setSelectedAlt(null);
    setStep(2);
  };

  const handleAltSelect = (alt: Alternative) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAlt(alt);
  };

  const handleConfirm = () => {
    if (!selectedAlt || !selectedReason) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    handleHide(() => onConfirm(exerciseKey, exerciseName, selectedAlt.name, selectedReason));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onShow={handleShow}
      onRequestClose={handleClose}
    >
      <Pressable style={m.overlay} onPress={step === 1 ? handleClose : undefined}>
        <Animated.View style={[m.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <Pressable onPress={e => e.stopPropagation()}>

            {/* ── Handle ── */}
            <View style={m.handleWrap}>
              <View style={m.handle} />
            </View>

            {/* ── Header ── */}
            <View style={m.header}>
              {step === 2 ? (
                <TouchableOpacity onPress={() => { setStep(1); setSelectedAlt(null); }} style={m.backBtn}>
                  <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text.secondary} />
                </TouchableOpacity>
              ) : (
                <View style={m.backBtn} />
              )}
              <View style={m.headerCenter}>
                <Text style={m.headerTitle}>Adjust Exercise</Text>
                <Text style={m.headerSub} numberOfLines={1}>
                  {extractExerciseName(exerciseName)}
                </Text>
              </View>
              <TouchableOpacity onPress={handleClose} style={m.closeBtn}>
                <MaterialCommunityIcons name="close" size={20} color={COLORS.text.muted} />
              </TouchableOpacity>
            </View>

            {/* ── Step 1: Reason selector ── */}
            {step === 1 && (
              <View style={m.body}>
                <Text style={m.prompt}>Why are you swapping this one?</Text>
                <View style={m.pillGrid}>
                  {ADJUST_REASONS.map(r => (
                    <TouchableOpacity
                      key={r}
                      style={[m.reasonPill, selectedReason === r && m.reasonPillActive]}
                      onPress={() => handleReasonSelect(r)}
                    >
                      <MaterialCommunityIcons
                        name={REASON_ICONS[r] as any}
                        size={16}
                        color={selectedReason === r ? COLORS.primary : COLORS.accent}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={[m.reasonPillText, selectedReason === r && m.reasonPillTextActive]}>
                        {r}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* ── Step 2: Alternatives ── */}
            {step === 2 && selectedReason && (
              <View style={m.body}>
                <View style={m.reasonChip}>
                  <MaterialCommunityIcons name={REASON_ICONS[selectedReason] as any} size={13} color={COLORS.accent} />
                  <Text style={m.reasonChipText}>{selectedReason}</Text>
                </View>
                <Text style={m.prompt}>Your coach's picks:</Text>
                <View style={m.altList}>
                  {alternatives.map((alt, i) => {
                    const isSelected = selectedAlt?.name === alt.name;
                    return (
                      <TouchableOpacity
                        key={alt.name}
                        style={[m.altCard, isSelected && m.altCardSelected]}
                        onPress={() => handleAltSelect(alt)}
                        activeOpacity={0.8}
                      >
                        <View style={m.altRankBadge}>
                          <Text style={m.altRankText}>{i + 1}</Text>
                        </View>
                        <View style={m.altInfo}>
                          <Text style={[m.altName, isSelected && m.altNameSelected]}>{alt.name}</Text>
                          <View style={m.altEquipRow}>
                            <MaterialCommunityIcons name="dumbbell" size={11} color={COLORS.text.muted} />
                            <Text style={m.altEquip}> {alt.equipment}</Text>
                          </View>
                          <Text style={m.altIntentNote}>{alt.intentNote}</Text>
                        </View>
                        <View style={[m.altRadio, isSelected && m.altRadioSelected]}>
                          {isSelected && <View style={m.altRadioInner} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* ── Confirm button ── */}
                <TouchableOpacity
                  style={[m.confirmBtn, !selectedAlt && m.confirmBtnDisabled]}
                  onPress={handleConfirm}
                  disabled={!selectedAlt}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons
                    name="swap-horizontal"
                    size={18}
                    color={selectedAlt ? COLORS.primary : COLORS.text.muted}
                  />
                  <Text style={[m.confirmBtnText, !selectedAlt && m.confirmBtnTextDisabled]}>
                    CONFIRM SWAP
                  </Text>
                </TouchableOpacity>
              </View>
            )}

          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function TodayScreen() {
  const router = useRouter();
  const [week, setWeek]               = useState(1);
  const [sessionType, setSessionType] = useState('');
  const [todaySession, setTodaySession] = useState<ProgramSession | null>(null);
  const [weekSessions, setWeekSessions] = useState<ProgramSession[]>([]);
  const [loggedDays, setLoggedDays]   = useState<Record<string, string>>({});
  const [injuryFlags, setInjuryFlags] = useState<string[]>([]);
  const [collapsed, setCollapsed]     = useState<Record<string, boolean>>({
    warmup: true, activation: true, rampup: true, suppl: true, acc: true, gpp: true, notes: true,
  });
  const [loading, setLoading]         = useState(true);

  // ── Adjust Exercise state ──
  const [swaps, setSwaps]           = useState<SwapMap>({});
  const [modalVisible, setModal]    = useState(false);
  const [adjustKey, setAdjustKey]   = useState('');
  const [adjustName, setAdjustName] = useState('');
  const todayName = getTodayDayName();

  useFocusEffect(useCallback(() => {
    (async () => {
      const prof = await getProfile();
      const w = prof?.currentWeek || 1;
      setWeek(w);
      setInjuryFlags(prof?.injuryFlags || []);
      const day = todayName === 'Sunday' ? 'Monday' : todayName;
      const sess = getProgramSession(w, day);
      setTodaySession(sess);
      setSessionType(sess?.sessionType || '');
      setWeekSessions(getWeekSessions(w));
      try {
        const entries = await logApi.list({ week: w });
        const dayMap: Record<string, string> = {};
        entries.forEach((e: any) => { dayMap[e.day] = e.completed || 'Completed'; });
        setLoggedDays(dayMap);
      } catch {}
      setLoading(false);
    })();
  }, []));

  function toggleSection(key: string) {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function openYouTube(lift: string) {
    Linking.openURL(`https://www.youtube.com/results?search_query=${encodeURIComponent(lift + ' strongman tutorial')}`);
  }

  function openAdjust(key: string, name: string) {
    setAdjustKey(key);
    setAdjustName(name);
    setModal(true);
  }

  async function handleConfirmSwap(key: string, original: string, replacement: string, reason: AdjustReason) {
    setModal(false);
    setSwaps(prev => ({ ...prev, [key]: { original, replacement, reason } }));
    // Log to backend
    try {
      const day = todayName === 'Sunday' ? 'Monday' : todayName;
      await substitutionApi.log({
        date: new Date().toISOString().slice(0, 10),
        week,
        day,
        sessionType,
        originalExercise: extractExerciseName(original),
        replacementExercise: replacement,
        reason,
      });
    } catch (e) {
      console.warn('Substitution log failed:', e);
    }
  }

  // Display helper: returns the current exercise name (swapped or original)
  function displayExercise(key: string, original: string): string {
    return swaps[key]?.replacement ?? original;
  }

  if (loading) return <View style={s.loading}><ActivityIndicator color={COLORS.accent} /></View>;
  if (!todaySession) return <View style={s.loading}><Text style={s.noData}>Loading session data...</Text></View>;

  const sc = getSessionStyle(todaySession.sessionType);
  const mainDisplayName = displayExercise('main', todaySession.mainLift);
  const mainSwapped     = !!swaps['main'];

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} testID="today-scroll">

        {/* ── Header ── */}
        <View style={s.header}>
          <Text style={s.appName}>TODAY'S SESSION</Text>
          <Text style={s.dateText}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </Text>
        </View>

        {/* ── Session Type Badge ── */}
        <View style={s.badgeRow}>
          <View style={[s.badge, { backgroundColor: sc.bg }]}>
            <Text style={[s.badgeText, { color: sc.text }]}>{todaySession.sessionType}</Text>
          </View>
          <Text style={s.phaseText}>Block {todaySession.block} · {todaySession.phase}</Text>
        </View>

        {/* ── Deload Banner ── */}
        {todaySession.isDeload && (
          <View style={s.deloadBanner}>
            <Text style={s.deloadText}>DELOAD WEEK — One boxing session only. Keep intensity low.</Text>
          </View>
        )}

        {/* ── Injury Warning Banners ── */}
        {getInjuryWarnings(todaySession, injuryFlags).map((warning, i) => (
          <View testID={`injury-banner-${i}`} key={i} style={s.injuryBanner}>
            <MaterialCommunityIcons name="alert" size={16} color="#FFF" />
            <Text style={s.injuryBannerText}>{warning}</Text>
          </View>
        ))}

        {/* ── Main Lift Card ── */}
        <View style={s.mainCard}>
          <View style={s.mainCardTopRow}>
            <Text style={s.mainLabel}>MAIN LIFT</Text>
            <TouchableOpacity
              style={s.adjustBtn}
              onPress={() => openAdjust('main', todaySession.mainLift)}
            >
              <MaterialCommunityIcons name="swap-horizontal" size={13} color={COLORS.accent} />
              <Text style={s.adjustBtnText}>Adjust</Text>
            </TouchableOpacity>
          </View>

          <View style={s.mainLiftRow}>
            <View style={{ flex: 1 }}>
              <View style={s.exerciseTitleRow}>
                <Text style={s.mainLift} numberOfLines={2}>{mainDisplayName}</Text>
                {mainSwapped && (
                  <View style={s.swappedBadge}>
                    <MaterialCommunityIcons name="swap-horizontal" size={10} color={COLORS.primary} />
                    <Text style={s.swappedBadgeText}> SWAPPED</Text>
                  </View>
                )}
              </View>
              {mainSwapped && (
                <Text style={s.originalName}>was: {swaps['main'].original}</Text>
              )}
            </View>
            <TouchableOpacity testID="yt-main-lift" onPress={() => openYouTube(mainDisplayName)}>
              <View style={s.ytBtn}><Text style={s.ytBtnText}>▶ Demo</Text></View>
            </TouchableOpacity>
          </View>

          <Text style={s.scheme}>{todaySession.topSetScheme}</Text>
          <View style={s.intentRow}>
            <MaterialCommunityIcons name="target" size={14} color={COLORS.text.muted} />
            <Text style={s.intent}> {todaySession.intentRPETarget}</Text>
          </View>
        </View>

        {/* ── Ramp-Up Sets ── */}
        <CollapsibleSection
          title="RAMP-UP SETS" sectionKey="rampup"
          collapsed={collapsed} onToggle={toggleSection} testID="rampup-section"
        >
          <Text style={s.protocolText}>{todaySession.rampUpSets}</Text>
        </CollapsibleSection>

        {/* ── Warm-Up Protocol ── */}
        <CollapsibleSection
          title="WARM-UP PROTOCOL" sectionKey="warmup"
          collapsed={collapsed} onToggle={toggleSection} testID="warmup-section"
        >
          <Text style={s.protocolText}>{todaySession.warmUpProtocol}</Text>
        </CollapsibleSection>

        {/* ── Activation / Rehab ── */}
        <CollapsibleSection
          title="ACTIVATION / REHAB DRILLS" sectionKey="activation"
          collapsed={collapsed} onToggle={toggleSection} testID="activation-section"
        >
          <Text style={s.protocolText}>{todaySession.activationRehab}</Text>
        </CollapsibleSection>

        {/* ── Supplemental Work ── */}
        {todaySession.supplementalWork.length > 0 && (
          <CollapsibleSection
            title="SUPPLEMENTAL WORK" sectionKey="suppl"
            collapsed={collapsed} onToggle={toggleSection} testID="suppl-section"
          >
            {todaySession.supplementalWork.map((item, i) => {
              const key = `suppl-${i}`;
              const swapped = !!swaps[key];
              const display = swapped ? item.replace(extractExerciseName(item), swaps[key].replacement) : item;
              return (
                <ExerciseListItem
                  key={i}
                  item={display}
                  swapped={swapped}
                  originalName={swapped ? swaps[key].original : undefined}
                  onAdjust={() => openAdjust(key, item)}
                />
              );
            })}
          </CollapsibleSection>
        )}

        {/* ── Accessories ── */}
        {todaySession.accessories.length > 0 && (
          <CollapsibleSection
            title="ACCESSORIES" sectionKey="acc"
            collapsed={collapsed} onToggle={toggleSection} testID="acc-section"
          >
            {todaySession.accessories.map((item, i) => {
              const key = `acc-${i}`;
              const swapped = !!swaps[key];
              const display = swapped ? item.replace(extractExerciseName(item), swaps[key].replacement) : item;
              return (
                <ExerciseListItem
                  key={i}
                  item={display}
                  swapped={swapped}
                  originalName={swapped ? swaps[key].original : undefined}
                  onAdjust={() => openAdjust(key, item)}
                />
              );
            })}
          </CollapsibleSection>
        )}

        {/* ── Event/GPP ── */}
        {todaySession.eventGPP !== '' && (
          <CollapsibleSection
            title="EVENT / GPP" sectionKey="gpp"
            collapsed={collapsed} onToggle={toggleSection} testID="gpp-section"
          >
            <Text style={s.protocolText}>{todaySession.eventGPP}</Text>
          </CollapsibleSection>
        )}

        {/* ── Coaching Notes ── */}
        <CollapsibleSection
          title="COACHING NOTES" sectionKey="notes"
          collapsed={collapsed} onToggle={toggleSection} testID="notes-section"
        >
          <Text style={s.protocolText}>{todaySession.coachingNotes}</Text>
        </CollapsibleSection>

        {/* ── Log This Session ── */}
        <TouchableOpacity
          testID="log-session-btn"
          style={s.logBtn}
          onPress={() => router.push({
            pathname: '/(tabs)/log',
            params: {
              prefill_date: new Date().toISOString().slice(0, 10),
              prefill_week: String(week),
              prefill_day: todayName === 'Sunday' ? 'Monday' : todayName,
              prefill_sessionType: todaySession.sessionType,
              prefill_exercise: mainDisplayName,
            },
          } as any)}
        >
          <MaterialCommunityIcons name="pencil-plus" size={20} color="#FFF" />
          <Text style={s.logBtnText}>  Log This Session</Text>
        </TouchableOpacity>

        {/* ── Week Grid ── */}
        <Text style={s.weekHeader}>WEEK {week} OVERVIEW</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.weekGrid}>
          {weekSessions.map((session, idx) => {
            const day = TRAINING_DAYS[idx];
            const sc2 = getSessionStyle(session.sessionType);
            const isToday = day === todayName;
            const status = loggedDays[day];
            return (
              <TouchableOpacity
                testID={`week-card-${day}`}
                key={day}
                style={[s.weekCard, isToday && s.weekCardToday]}
                onPress={() => {}}
              >
                <Text style={s.weekDay}>{day.slice(0, 3).toUpperCase()}</Text>
                <View style={[s.weekBadge, { backgroundColor: sc2.bg }]}>
                  <Text style={[s.weekBadgeText, { color: sc2.text }]}>
                    {session.sessionType.split(' ')[0]} {session.sessionType.split(' ')[1] || ''}
                  </Text>
                </View>
                <Text style={s.weekLift} numberOfLines={2}>{session.mainLift}</Text>
                <Text style={s.weekScheme} numberOfLines={1}>{session.topSetScheme.split(';')[0]}</Text>
                {status && (
                  <View style={[s.statusBadge, {
                    backgroundColor: status === 'Completed'
                      ? COLORS.sessions.de_lower.bg
                      : status === 'Modified' ? COLORS.sessions.me_lower.bg : COLORS.sessions.event.bg
                  }]}>
                    <Text style={[s.statusBadgeText, {
                      color: status === 'Completed'
                        ? COLORS.status.success
                        : status === 'Modified' ? COLORS.status.warning : COLORS.status.error
                    }]}>
                      {status === 'Completed' ? '✓' : status === 'Modified' ? '~' : '✗'} {status}
                    </Text>
                  </View>
                )}
                <TouchableOpacity testID={`yt-week-${day}`} onPress={() => openYouTube(session.mainLift)} style={s.weekYT}>
                  <Text style={s.weekYTText}>▶</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── Adjust Modal ── */}
      <AdjustModal
        visible={modalVisible}
        exerciseKey={adjustKey}
        exerciseName={adjustName}
        onClose={() => setModal(false)}
        onConfirm={handleConfirmSwap}
      />
    </SafeAreaView>
  );
}

// ── ExerciseListItem ──────────────────────────────────────────────────────────
function ExerciseListItem({ item, swapped, originalName, onAdjust }: {
  item: string; swapped: boolean; originalName?: string; onAdjust: () => void;
}) {
  return (
    <View style={li.wrapper}>
      <View style={{ flex: 1 }}>
        <View style={li.row}>
          <Text style={li.bullet}>•</Text>
          <View style={{ flex: 1 }}>
            <View style={li.nameRow}>
              <Text style={li.text}>{item}</Text>
              {swapped && (
                <View style={li.swappedBadge}>
                  <Text style={li.swappedBadgeText}>↔ SWAPPED</Text>
                </View>
              )}
            </View>
            {swapped && originalName && (
              <Text style={li.original}>was: {originalName}</Text>
            )}
          </View>
        </View>
      </View>
      <TouchableOpacity style={li.adjustBtn} onPress={onAdjust}>
        <Text style={li.adjustBtnText}>Adjust</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── CollapsibleSection ────────────────────────────────────────────────────────
function CollapsibleSection({ title, sectionKey, collapsed, onToggle, children, testID }: any) {
  const isCollapsed = collapsed[sectionKey];
  return (
    <View style={cs.wrapper}>
      <TouchableOpacity testID={testID} style={cs.header} onPress={() => onToggle(sectionKey)}>
        <Text style={cs.title}>{title}</Text>
        <MaterialCommunityIcons name={isCollapsed ? 'chevron-down' : 'chevron-up'} size={20} color={COLORS.text.muted} />
      </TouchableOpacity>
      {!isCollapsed && <View style={cs.content}>{children}</View>}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const cs = StyleSheet.create({
  wrapper:  { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg },
  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.lg },
  title:    { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.secondary, letterSpacing: 1.5 },
  content:  { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },
});

const li = StyleSheet.create({
  wrapper:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  row:          { flexDirection: 'row', flex: 1 },
  bullet:       { color: COLORS.accent, marginRight: 8, fontSize: FONTS.sizes.sm },
  nameRow:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  text:         { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, flex: 1, lineHeight: 20 },
  swappedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.accent, paddingHorizontal: 5, paddingVertical: 1, borderRadius: RADIUS.full },
  swappedBadgeText: { fontSize: 8, color: COLORS.primary, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5 },
  original:     { fontSize: 10, color: COLORS.text.muted, marginTop: 1, fontStyle: 'italic' },
  adjustBtn:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, marginLeft: SPACING.sm },
  adjustBtnText:{ fontSize: 10, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },
});

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: COLORS.background },
  scroll:        { flex: 1 },
  loading:       { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  noData:        { color: COLORS.text.secondary, fontSize: FONTS.sizes.base },
  header:        { padding: SPACING.lg, paddingTop: SPACING.xl },
  appName:       { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.accent, letterSpacing: 3, marginBottom: 4 },
  dateText:      { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  badgeRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm, gap: SPACING.md },
  badge:         { paddingHorizontal: 12, paddingVertical: 5, borderRadius: RADIUS.full },
  badgeText:     { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold },
  phaseText:     { color: COLORS.text.muted, fontSize: FONTS.sizes.sm },
  deloadBanner:  { marginHorizontal: SPACING.lg, backgroundColor: COLORS.sessions.deload.bg, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  deloadText:    { color: COLORS.sessions.deload.text, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.sm },
  injuryBanner:  { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.status.warning, borderRadius: RADIUS.md, padding: SPACING.md, marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, gap: SPACING.sm },
  injuryBannerText: { color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, flex: 1, lineHeight: 18 },

  // Main lift card
  mainCard:        { marginHorizontal: SPACING.lg, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  mainCardTopRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  mainLabel:       { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.accent, letterSpacing: 2 },
  adjustBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.accent + '55', backgroundColor: COLORS.surfaceHighlight },
  adjustBtnText:   { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontWeight: FONTS.weights.semibold },
  mainLiftRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  exerciseTitleRow:{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  mainLift:        { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 30, flex: 1 },
  swappedBadge:    { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.accent, paddingHorizontal: 7, paddingVertical: 3, borderRadius: RADIUS.full },
  swappedBadgeText:{ fontSize: 9, color: COLORS.primary, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5 },
  originalName:    { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontStyle: 'italic', marginBottom: 4 },
  ytBtn:           { backgroundColor: COLORS.accent, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.md, marginLeft: SPACING.sm },
  ytBtnText:       { color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold },
  scheme:          { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, marginBottom: SPACING.sm, lineHeight: 20 },
  intentRow:       { flexDirection: 'row', alignItems: 'center' },
  intent:          { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  protocolText:    { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, lineHeight: 22 },
  logBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accent, margin: SPACING.lg, borderRadius: RADIUS.lg, height: 52 },
  logBtnText:      { color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy },
  weekHeader:      { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2, paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  weekGrid:        { paddingLeft: SPACING.lg, marginBottom: SPACING.sm },
  weekCard:        { width: 150, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginRight: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  weekCardToday:   { borderColor: COLORS.accent, borderWidth: 2 },
  weekDay:         { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.5, marginBottom: 6 },
  weekBadge:       { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.full, marginBottom: 6 },
  weekBadgeText:   { fontSize: 9, fontWeight: FONTS.weights.bold },
  weekLift:        { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.bold, color: COLORS.text.primary, marginBottom: 4 },
  weekScheme:      { fontSize: 10, color: COLORS.text.muted, marginBottom: 6 },
  statusBadge:     { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.full, marginBottom: 4 },
  statusBadgeText: { fontSize: 9, fontWeight: FONTS.weights.bold },
  weekYT:          { backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.sm, padding: 4, alignSelf: 'flex-end' },
  weekYTText:      { color: COLORS.text.secondary, fontSize: 10 },
});

// ── Modal Styles ──────────────────────────────────────────────────────────────
const m = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: '85%' },
  handleWrap:     { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn:        { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  headerCenter:   { flex: 1, alignItems: 'center' },
  headerTitle:    { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  headerSub:      { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontWeight: FONTS.weights.semibold, marginTop: 2 },
  closeBtn:       { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  body:           { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  prompt:         { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: SPACING.md },

  // Step 1 — reason pills
  pillGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  reasonPill:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.primary },
  reasonPillActive:   { borderColor: COLORS.accent, backgroundColor: COLORS.accent },
  reasonPillText:     { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.text.secondary },
  reasonPillTextActive: { color: COLORS.primary },

  // Step 2 — reason chip (above alts)
  reasonChip:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceHighlight, alignSelf: 'flex-start', marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.accent + '55' },
  reasonChipText: { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontWeight: FONTS.weights.semibold },

  // Alternative cards
  altList:        { gap: SPACING.sm, marginBottom: SPACING.lg },
  altCard:        { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1.5, borderColor: COLORS.border, gap: SPACING.sm },
  altCardSelected:{ borderColor: COLORS.accent, backgroundColor: COLORS.surface },
  altRankBadge:   { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.surfaceHighlight, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  altRankText:    { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.accent },
  altInfo:        { flex: 1 },
  altName:        { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.primary, marginBottom: 3 },
  altNameSelected:{ color: COLORS.accent },
  altEquipRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  altEquip:       { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  altIntentNote:  { fontSize: FONTS.sizes.xs, color: COLORS.text.secondary, lineHeight: 16, fontStyle: 'italic' },
  altRadio:       { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  altRadioSelected:{ borderColor: COLORS.accent },
  altRadioInner:  { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.accent },

  // Confirm button
  confirmBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accent, borderRadius: RADIUS.lg, paddingVertical: 15, gap: SPACING.sm },
  confirmBtnDisabled: { backgroundColor: COLORS.surfaceHighlight },
  confirmBtnText:     { color: COLORS.primary, fontWeight: FONTS.weights.heavy, fontSize: FONTS.sizes.base, letterSpacing: 1 },
  confirmBtnTextDisabled: { color: COLORS.text.muted },
});
