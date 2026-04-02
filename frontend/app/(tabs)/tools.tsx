import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Modal,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';
import {
  EXERCISES,
  WARM_UP_PROTOCOLS,
  QUICK_CUES,
} from '../../src/data/libraryData';
import type {
  Exercise,
  WarmUpProtocol,
  ExerciseCategory,
  SubstitutionKey,
} from '../../src/data/libraryData';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FILTER_CATEGORIES: Array<'All' | ExerciseCategory> = [
  'All', 'Upper Body', 'Lower Body', 'Core', 'Carries', 'Conditioning',
];

const PATTERN_COLORS: Record<string, string> = {
  Push:      '#C9A84C',
  Pull:      '#2E75B6',
  Hinge:     '#9B6FDE',
  Squat:     '#4CAF50',
  Carry:     '#FFA726',
  Isolation: '#4DCEA6',
};

const SUB_REASONS: Array<{ label: string; icon: string; color: string; key: SubstitutionKey }> = [
  { label: 'Pain / Injury',  icon: 'medical-bag',   color: '#E54D4D', key: 'pain' },
  { label: 'No Equipment',   icon: 'wrench-outline', color: '#FFA726', key: 'equipment' },
  { label: 'Travel',         icon: 'airplane',       color: '#2E75B6', key: 'travel' },
  { label: 'Preference',     icon: 'heart-outline',  color: '#9B6FDE', key: 'equipment' },
  { label: 'Crowded Gym',    icon: 'account-group',  color: '#4CAF50', key: 'equipment' },
];

// ─── SectionHeader ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, count }: { icon: string; title: string; count?: number }) {
  return (
    <View style={sh.wrap}>
      <View style={sh.iconWrap}>
        <MaterialCommunityIcons name={icon as any} size={17} color={COLORS.accent} />
      </View>
      <Text style={sh.title}>{title}</Text>
      {count !== undefined && (
        <View style={sh.badge}>
          <Text style={sh.badgeTxt}>{count}</Text>
        </View>
      )}
    </View>
  );
}
const sh = StyleSheet.create({
  wrap:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  iconWrap: { width: 30, height: 30, borderRadius: RADIUS.md, backgroundColor: COLORS.accent + '20', justifyContent: 'center', alignItems: 'center' },
  title:    { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, flex: 1 },
  badge:    { backgroundColor: COLORS.accent + '20', borderRadius: RADIUS.full, paddingHorizontal: 9, paddingVertical: 2, borderWidth: 1, borderColor: COLORS.accent + '55' },
  badgeTxt: { fontSize: 11, fontWeight: FONTS.weights.bold, color: COLORS.accent },
});

// ─── ExerciseCard ─────────────────────────────────────────────────────────────

function ExerciseCard({
  exercise,
  onPress,
  animValue,
}: {
  exercise: Exercise;
  onPress: () => void;
  animValue: Animated.Value;
}) {
  const pc = PATTERN_COLORS[exercise.pattern] ?? COLORS.accent;
  return (
    <Animated.View
      style={[
        s.exCard,
        {
          opacity: animValue,
          transform: [{
            translateY: animValue.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }),
          }],
        },
      ]}
    >
      <TouchableOpacity style={s.exCardInner} onPress={onPress} activeOpacity={0.75}>
        <View style={s.exCardTop}>
          <View style={[s.patternPill, { backgroundColor: pc + '22', borderColor: pc + '66' }]}>
            <Text style={[s.patternPillTxt, { color: pc }]}>{exercise.pattern.toUpperCase()}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text.muted} />
        </View>
        <Text style={s.exName}>{exercise.name}</Text>
        <View style={s.exCardBottom}>
          <View style={s.musclesPill}>
            <Text style={s.musclesPillTxt} numberOfLines={1}>{exercise.muscles}</Text>
          </View>
          <View style={s.equipRow}>
            <MaterialCommunityIcons name="dumbbell" size={11} color={COLORS.text.muted} />
            <Text style={s.equipTxt}>{exercise.equipment}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── ExerciseDetailModal ──────────────────────────────────────────────────────

function ExerciseDetailModal({
  exercise,
  visible,
  onClose,
}: {
  exercise: Exercise | null;
  visible: boolean;
  onClose: () => void;
}) {
  const [subTab, setSubTab] = useState<SubstitutionKey>('pain');

  useEffect(() => {
    if (exercise) setSubTab('pain');
  }, [exercise?.id]);

  const pc = exercise ? (PATTERN_COLORS[exercise.pattern] ?? COLORS.accent) : COLORS.accent;
  const currentSubs = exercise ? (exercise.substitutions[subTab] ?? []) : [];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={md.safe}>
        {/* Header */}
        <View style={md.header}>
          <View style={{ flex: 1 }}>
            <Text style={md.title} numberOfLines={1}>{exercise?.name ?? ''}</Text>
            <Text style={md.subtitle}>{exercise?.category} · {exercise?.pattern}</Text>
          </View>
          <TouchableOpacity style={md.closeBtn} onPress={onClose}>
            <MaterialCommunityIcons name="close" size={22} color={COLORS.text.primary} />
          </TouchableOpacity>
        </View>

        {exercise && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={md.scroll}>
            {/* Demo Video Placeholder */}
            <View style={md.videoBox}>
              <MaterialCommunityIcons name="play-circle-outline" size={52} color={COLORS.accent} />
              <Text style={md.videoLabel}>Demo video coming soon</Text>
            </View>

            {/* Badges */}
            <View style={md.badgeRow}>
              <View style={[md.patBadge, { backgroundColor: pc + '22', borderColor: pc + '66' }]}>
                <Text style={[md.patBadgeTxt, { color: pc }]}>{exercise.pattern}</Text>
              </View>
              <View style={md.equBadge}>
                <MaterialCommunityIcons name="dumbbell" size={12} color={COLORS.text.muted} />
                <Text style={md.equBadgeTxt}>{exercise.equipment}</Text>
              </View>
            </View>

            {/* Coaching Cues */}
            <Text style={md.sectionLbl}>COACHING CUES</Text>
            {exercise.coachingCues.map((cue, i) => (
              <View key={i} style={md.bulletRow}>
                <View style={[md.dot, { backgroundColor: COLORS.accent }]} />
                <Text style={md.bulletTxt}>{cue}</Text>
              </View>
            ))}

            {/* Common Mistakes */}
            <Text style={[md.sectionLbl, { marginTop: SPACING.xl }]}>COMMON MISTAKES</Text>
            {exercise.commonMistakes.map((m, i) => (
              <View key={i} style={md.bulletRow}>
                <View style={[md.dot, { backgroundColor: '#E54D4D' }]} />
                <Text style={[md.bulletTxt, { color: COLORS.text.secondary }]}>{m}</Text>
              </View>
            ))}

            {/* Substitutions */}
            <Text style={[md.sectionLbl, { marginTop: SPACING.xl }]}>SUBSTITUTIONS</Text>
            <View style={md.subTabRow}>
              {(['pain', 'equipment', 'travel'] as SubstitutionKey[]).map(tab => (
                <TouchableOpacity
                  key={tab}
                  style={[md.subTab, subTab === tab && md.subTabOn]}
                  onPress={() => setSubTab(tab)}
                >
                  <Text style={[md.subTabTxt, subTab === tab && md.subTabTxtOn]}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {currentSubs.map((sub, i) => (
              <View key={i} style={[md.subItem, i > 0 && md.subItemBorder]}>
                <Text style={md.subItemName}>{sub.name}</Text>
                <Text style={md.subItemReason}>{sub.reason}</Text>
              </View>
            ))}

            {/* Muscles Worked */}
            <Text style={[md.sectionLbl, { marginTop: SPACING.xl }]}>MUSCLES WORKED</Text>
            <View style={md.musSection}>
              <Text style={md.musGroupLbl}>PRIMARY</Text>
              <View style={md.musGroup}>
                {exercise.primaryMuscles.map((m, i) => (
                  <View key={i} style={md.musPill}>
                    <Text style={md.musPillTxt}>{m}</Text>
                  </View>
                ))}
              </View>
              <Text style={[md.musGroupLbl, { marginTop: SPACING.md }]}>SECONDARY</Text>
              <View style={md.musGroup}>
                {exercise.secondaryMuscles.map((m, i) => (
                  <View key={i} style={[md.musPill, md.musPillSec]}>
                    <Text style={[md.musPillTxt, md.musPillSecTxt]}>{m}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={{ height: 48 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const md = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: COLORS.background },
  header:       { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title:        { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 26 },
  subtitle:     { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, marginTop: 3 },
  closeBtn:     { width: 36, height: 36, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', marginLeft: SPACING.md },
  scroll:       { padding: SPACING.lg },
  videoBox:     { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, height: 176, justifyContent: 'center', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.lg },
  videoLabel:   { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },
  badgeRow:     { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg, flexWrap: 'wrap' },
  patBadge:     { paddingHorizontal: 14, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1 },
  patBadgeTxt:  { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, letterSpacing: 0.3 },
  equBadge:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  equBadgeTxt:  { fontSize: FONTS.sizes.xs, color: COLORS.text.secondary },
  sectionLbl:   { fontSize: 11, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.5, marginBottom: SPACING.md },
  bulletRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.sm },
  dot:          { width: 7, height: 7, borderRadius: RADIUS.full, marginTop: 7, flexShrink: 0 },
  bulletTxt:    { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text.primary, lineHeight: 20 },
  subTabRow:    { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  subTab:       { flex: 1, paddingVertical: 9, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  subTabOn:     { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  subTabTxt:    { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, color: COLORS.text.muted },
  subTabTxtOn:  { color: '#000' },
  subItem:      { paddingVertical: SPACING.md },
  subItemBorder:{ borderTopWidth: 1, borderTopColor: COLORS.border },
  subItemName:  { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary, marginBottom: 4 },
  subItemReason:{ fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 18 },
  musSection:   {},
  musGroupLbl:  { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.5, marginBottom: SPACING.sm },
  musGroup:     { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  musPill:      { backgroundColor: COLORS.accent + '20', borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.accent + '55' },
  musPillTxt:   { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.semibold, color: COLORS.accent },
  musPillSec:   { backgroundColor: COLORS.surface, borderColor: COLORS.border },
  musPillSecTxt:{ color: COLORS.text.secondary },
});

// ─── WarmUpCard ───────────────────────────────────────────────────────────────

function WarmUpCard({
  protocol,
  isExpanded,
  onToggle,
}: {
  protocol: WarmUpProtocol;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.warmCard, isExpanded && s.warmCardExpanded]}
      onPress={onToggle}
      activeOpacity={0.8}
    >
      <View style={s.warmHeader}>
        <View style={[s.warmIcon, { backgroundColor: protocol.color + '22' }]}>
          <MaterialCommunityIcons name={protocol.icon as any} size={20} color={protocol.color} />
        </View>
        <View style={s.warmInfo}>
          <Text style={s.warmName}>{protocol.name}</Text>
          <View style={s.warmMeta}>
            <View style={s.durationBadge}>
              <MaterialCommunityIcons name="clock-outline" size={10} color={COLORS.accent} />
              <Text style={s.durationTxt}>{protocol.duration}</Text>
            </View>
            <Text style={s.stepCountTxt}>{protocol.steps.length} steps</Text>
          </View>
        </View>
        <MaterialCommunityIcons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={COLORS.text.muted}
        />
      </View>

      {isExpanded && (
        <View style={s.warmSteps}>
          {protocol.steps.map((step, i) => (
            <View key={i} style={s.stepRow}>
              <View style={s.stepNum}>
                <Text style={s.stepNumTxt}>{i + 1}</Text>
              </View>
              <Text style={s.stepDesc}>{step}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── SubstitutionFinderModal ──────────────────────────────────────────────────

function SubstitutionFinderModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [step, setStep]                   = useState<1 | 2 | 3>(1);
  const [selectedEx, setSelectedEx]       = useState<Exercise | null>(null);
  const [selectedReason, setSelectedReason] = useState<typeof SUB_REASONS[number] | null>(null);

  const results = selectedEx && selectedReason
    ? (selectedEx.substitutions[selectedReason.key] ?? [])
    : [];

  function handleClose() {
    setStep(1);
    setSelectedEx(null);
    setSelectedReason(null);
    onClose();
  }

  function handleBack() {
    if (step === 3) setStep(2);
    else setStep(1);
  }

  function handleSelectEx(ex: Exercise) {
    setSelectedEx(ex);
    setStep(2);
  }

  function handleSelectReason(reason: typeof SUB_REASONS[number]) {
    setSelectedReason(reason);
    setStep(3);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={sf.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          onPress={handleClose}
          activeOpacity={1}
        />
        <View style={sf.sheet}>
          <View style={sf.handle} />

          {/* Sheet Header */}
          <View style={sf.header}>
            {step > 1 ? (
              <TouchableOpacity style={sf.navBtn} onPress={handleBack}>
                <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.text.primary} />
              </TouchableOpacity>
            ) : (
              <View style={sf.navBtn} />
            )}
            <Text style={sf.title}>
              {step === 1 ? 'Which Exercise?' : step === 2 ? 'Why Are You Swapping?' : 'Alternatives'}
            </Text>
            <TouchableOpacity style={sf.navBtn} onPress={handleClose}>
              <MaterialCommunityIcons name="close" size={20} color={COLORS.text.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={sf.content}
          >
            {/* Step 1: Pick exercise */}
            {step === 1 && EXERCISES.map(ex => (
              <TouchableOpacity key={ex.id} style={sf.exRow} onPress={() => handleSelectEx(ex)}>
                <View style={{ flex: 1 }}>
                  <Text style={sf.exName}>{ex.name}</Text>
                  <Text style={sf.exMuscles}>{ex.muscles}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={16} color={COLORS.text.muted} />
              </TouchableOpacity>
            ))}

            {/* Step 2: Pick reason */}
            {step === 2 && (
              <>
                <Text style={sf.hint}>
                  Replacing:{' '}
                  <Text style={{ color: COLORS.accent, fontWeight: FONTS.weights.bold }}>
                    {selectedEx?.name}
                  </Text>
                </Text>
                {SUB_REASONS.map((reason, i) => (
                  <TouchableOpacity key={i} style={sf.reasonRow} onPress={() => handleSelectReason(reason)}>
                    <View style={[sf.reasonIcon, { backgroundColor: reason.color + '22' }]}>
                      <MaterialCommunityIcons name={reason.icon as any} size={22} color={reason.color} />
                    </View>
                    <Text style={sf.reasonLabel}>{reason.label}</Text>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text.muted} />
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* Step 3: Results */}
            {step === 3 && (
              <>
                <Text style={sf.hint}>
                  Swapping{' '}
                  <Text style={{ color: COLORS.accent, fontWeight: FONTS.weights.bold }}>
                    {selectedEx?.name}
                  </Text>
                  {' · '}
                  <Text style={{ color: selectedReason?.color ?? COLORS.accent }}>
                    {selectedReason?.label}
                  </Text>
                </Text>
                {results.map((result, i) => (
                  <View key={i} style={sf.resultCard}>
                    <View style={sf.rankBadge}>
                      <Text style={sf.rankTxt}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={sf.resultName}>{result.name}</Text>
                      <Text style={sf.resultReason}>{result.reason}</Text>
                    </View>
                  </View>
                ))}
              </>
            )}

            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const sf = StyleSheet.create({
  overlay:     { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet:       { backgroundColor: COLORS.secondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '78%', paddingTop: 10 },
  handle:      { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  navBtn:      { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  title:       { flex: 1, fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.primary, textAlign: 'center' },
  content:     { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  hint:        { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, marginBottom: SPACING.lg, textAlign: 'center', lineHeight: 20 },
  exRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  exName:      { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary, marginBottom: 2 },
  exMuscles:   { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  reasonRow:   { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  reasonIcon:  { width: 46, height: 46, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center' },
  reasonLabel: { flex: 1, fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary },
  resultCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rankBadge:   { width: 28, height: 28, borderRadius: RADIUS.full, backgroundColor: COLORS.accent + '22', borderWidth: 1, borderColor: COLORS.accent + '55', justifyContent: 'center', alignItems: 'center' },
  rankTxt:     { fontSize: 11, fontWeight: FONTS.weights.bold, color: COLORS.accent },
  resultName:  { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary, marginBottom: 3 },
  resultReason:{ fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 18 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function LibraryScreen() {
  const [searchText,        setSearchText]        = useState('');
  const [activeFilter,      setActiveFilter]      = useState<'All' | ExerciseCategory>('All');
  const [searchFocused,     setSearchFocused]     = useState(false);
  const [detailExercise,    setDetailExercise]    = useState<Exercise | null>(null);
  const [detailVisible,     setDetailVisible]     = useState(false);
  const [expandedProtocols, setExpandedProtocols] = useState<Set<string>>(new Set());
  const [showSubFinder,     setShowSubFinder]     = useState(false);

  const headerAnim = useRef(new Animated.Value(0)).current;
  const cardAnims  = useRef(
    Array.from({ length: EXERCISES.length }, () => new Animated.Value(0))
  ).current;

  // ── Derived data ────────────────────────────────────────────────────────────
  const filteredExercises = useMemo(() => {
    let result = activeFilter === 'All'
      ? EXERCISES
      : EXERCISES.filter(e => e.category === activeFilter);
    if (searchText.trim()) {
      const q = searchText.toLowerCase().trim();
      result = result.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.muscles.toLowerCase().includes(q) ||
        e.equipment.toLowerCase().includes(q)
      );
    }
    return result;
  }, [activeFilter, searchText]);

  const filteredCues = useMemo(() => {
    if (!searchText.trim()) return QUICK_CUES;
    const q = searchText.toLowerCase().trim();
    return QUICK_CUES.filter(c =>
      c.cue.toLowerCase().includes(q) || c.exercise.toLowerCase().includes(q)
    );
  }, [searchText]);

  // ── Animations ──────────────────────────────────────────────────────────────
  function runCardAnims(count: number) {
    cardAnims.forEach(a => a.setValue(0));
    Animated.stagger(55, cardAnims.slice(0, count).map(a =>
      Animated.timing(a, { toValue: 1, duration: 370, useNativeDriver: true })
    )).start();
  }

  useEffect(() => {
    Animated.timing(headerAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    runCardAnims(EXERCISES.length);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    runCardAnims(filteredExercises.length);
  }, [activeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ────────────────────────────────────────────────────────────────
  function openDetail(ex: Exercise) {
    setDetailExercise(ex);
    setDetailVisible(true);
  }

  function closeDetail() {
    setDetailVisible(false);
    setTimeout(() => setDetailExercise(null), 400);
  }

  function toggleProtocol(id: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedProtocols(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <Animated.View
        style={[
          s.header,
          {
            opacity: headerAnim,
            transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
          },
        ]}
      >
        <Text style={s.title}>LIBRARY</Text>
        <Text style={s.subtitle}>COACHING REFERENCE</Text>
      </Animated.View>

      {/* Search Bar */}
      <View style={s.searchWrap}>
        <View style={[s.searchBar, searchFocused && s.searchBarFocused]}>
          <MaterialCommunityIcons
            name="magnify"
            size={18}
            color={searchFocused ? COLORS.accent : COLORS.text.muted}
          />
          <TextInput
            style={s.searchInput}
            placeholder="Search exercises, cues, warm-ups..."
            placeholderTextColor={COLORS.text.muted}
            value={searchText}
            onChangeText={setSearchText}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchText.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchText('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="close-circle" size={16} color={COLORS.text.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterScroll}
        contentContainerStyle={s.filterContent}
      >
        {FILTER_CATEGORIES.map(cat => {
          const isActive = activeFilter === cat;
          return (
            <TouchableOpacity
              key={cat}
              style={[
                s.filterPill,
                isActive ? s.filterPillOn : null,
              ]}
              onPress={() => setActiveFilter(cat)}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  letterSpacing: 0.2,
                  color: isActive ? '#C9A84C' : '#8A8A95',
                }}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Main Content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* ── Exercise Library ─────────────────────────────────────────── */}
        <View style={s.section}>
          <SectionHeader icon="dumbbell" title="Exercise Library" count={filteredExercises.length} />
          {filteredExercises.length === 0 ? (
            <View style={s.empty}>
              <MaterialCommunityIcons name="magnify-close" size={28} color={COLORS.text.muted} />
              <Text style={s.emptyTxt}>No exercises match your search</Text>
            </View>
          ) : (
            filteredExercises.map((ex, i) => (
              <ExerciseCard
                key={ex.id}
                exercise={ex}
                onPress={() => openDetail(ex)}
                animValue={cardAnims[i]}
              />
            ))
          )}
        </View>

        {/* ── Warm-Up Protocols ────────────────────────────────────────── */}
        <View style={s.section}>
          <SectionHeader icon="fire" title="Warm-Up Protocols" />
          {WARM_UP_PROTOCOLS.map(protocol => (
            <WarmUpCard
              key={protocol.id}
              protocol={protocol}
              isExpanded={expandedProtocols.has(protocol.id)}
              onToggle={() => toggleProtocol(protocol.id)}
            />
          ))}
        </View>

        {/* ── Quick Cues ───────────────────────────────────────────────── */}
        <View style={s.section}>
          <SectionHeader icon="lightbulb-on-outline" title="Quick Cues" />
          {filteredCues.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyTxt}>No cues match your search</Text>
            </View>
          ) : (
            filteredCues.map((cue, i) => (
              <View key={i} style={[s.cueRow, i > 0 && s.cueRowBorder]}>
                <Text style={s.cueTxt}>"{cue.cue}"</Text>
                <Text style={s.cueEx}>— {cue.exercise}</Text>
              </View>
            ))
          )}
        </View>

        {/* ── Substitution Finder ──────────────────────────────────────── */}
        <View style={s.section}>
          <TouchableOpacity
            style={s.swapCard}
            onPress={() => setShowSubFinder(true)}
            activeOpacity={0.8}
          >
            <View style={s.swapLeft}>
              <View style={s.swapIconWrap}>
                <MaterialCommunityIcons name="swap-horizontal" size={24} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.swapTitle}>Need a Swap?</Text>
                <Text style={s.swapSub}>Find the right substitute for any situation</Text>
              </View>
            </View>
            <MaterialCommunityIcons name="arrow-right" size={20} color={COLORS.accent} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Exercise Detail Modal */}
      <ExerciseDetailModal
        exercise={detailExercise}
        visible={detailVisible}
        onClose={closeDetail}
      />

      {/* Substitution Finder Modal */}
      <SubstitutionFinderModal
        visible={showSubFinder}
        onClose={() => setShowSubFinder(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: COLORS.background },

  // Header
  header:             { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl, paddingBottom: SPACING.sm },
  title:              { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, letterSpacing: 2 },
  subtitle:           { fontSize: 10, color: COLORS.text.muted, letterSpacing: 2.5, marginTop: 2 },

  // Search
  searchWrap:         { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  searchBar:          { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, height: 46, borderWidth: 1, borderColor: COLORS.border },
  searchBarFocused:   { borderColor: COLORS.accent },
  searchInput:        { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text.primary, paddingVertical: 0 },

  // Filter pills
  filterScroll:       { maxHeight: 48 },
  filterContent:      { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, gap: SPACING.sm, alignItems: 'center' },
  filterPill:         { paddingVertical: 7, paddingHorizontal: 16, borderRadius: RADIUS.full, borderWidth: 1, borderColor: '#2A2A30', backgroundColor: '#18181C' },
  filterPillOn:       { backgroundColor: 'rgba(201,168,76,0.15)', borderColor: '#C9A84C' },
  filterPillTxt:      { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, color: '#F5F5F5', letterSpacing: 0.3 },
  filterPillTxtOn:    { color: '#C9A84C' },

  // Main scroll
  scrollContent:      { paddingTop: SPACING.sm },

  // Section card
  section:            { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },

  // Exercise cards
  exCard:             { marginBottom: SPACING.sm },
  exCardInner:        { backgroundColor: COLORS.background, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, minHeight: 86 },
  exCardTop:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs },
  patternPill:        { paddingHorizontal: 9, paddingVertical: 3, borderRadius: RADIUS.full, borderWidth: 1 },
  patternPillTxt:     { fontSize: 10, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5 },
  exName:             { fontSize: 16, fontWeight: FONTS.weights.bold, color: COLORS.text.primary, marginBottom: SPACING.xs },
  exCardBottom:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  musclesPill:        { backgroundColor: COLORS.surface, borderRadius: RADIUS.full, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.border, maxWidth: '60%' },
  musclesPillTxt:     { fontSize: 11, color: COLORS.text.secondary },
  equipRow:           { flexDirection: 'row', alignItems: 'center', gap: 4 },
  equipTxt:           { fontSize: 11, color: COLORS.text.muted },

  // Empty
  empty:              { alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.sm },
  emptyTxt:           { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, textAlign: 'center' },

  // Warm-up cards
  warmCard:           { backgroundColor: COLORS.background, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm },
  warmCardExpanded:   { borderColor: COLORS.accent + '66' },
  warmHeader:         { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  warmIcon:           { width: 44, height: 44, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center' },
  warmInfo:           { flex: 1 },
  warmName:           { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.primary, marginBottom: 4 },
  warmMeta:           { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  durationBadge:      { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.accent + '18', borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 2 },
  durationTxt:        { fontSize: 10, fontWeight: FONTS.weights.bold, color: COLORS.accent },
  stepCountTxt:       { fontSize: 11, color: COLORS.text.muted },
  warmSteps:          { marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  stepRow:            { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.sm },
  stepNum:            { width: 22, height: 22, borderRadius: RADIUS.full, backgroundColor: COLORS.accent + '22', borderWidth: 1, borderColor: COLORS.accent + '55', justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 1 },
  stepNumTxt:         { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.accent },
  stepDesc:           { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 20 },

  // Quick cues
  cueRow:             { paddingVertical: SPACING.sm },
  cueRowBorder:       { borderTopWidth: 1, borderTopColor: COLORS.border },
  cueTxt:             { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold, color: COLORS.accent, marginBottom: 2 },
  cueEx:              { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },

  // Substitution card
  swapCard:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.accent + '0E', borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.accent + '40' },
  swapLeft:           { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flex: 1 },
  swapIconWrap:       { width: 46, height: 46, borderRadius: RADIUS.md, backgroundColor: COLORS.accent + '22', justifyContent: 'center', alignItems: 'center' },
  swapTitle:          { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.accent, marginBottom: 2 },
  swapSub:            { fontSize: FONTS.sizes.xs, color: COLORS.text.secondary, lineHeight: 16 },
});
