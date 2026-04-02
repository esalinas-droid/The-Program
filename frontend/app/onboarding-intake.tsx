import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, KeyboardAvoidingView, Platform, Animated,
  TextInput, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../src/constants/theme';
import { saveProfile } from '../src/utils/storage';
import { submitIntake } from '../services/api';

// ── Constants ─────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 7;

const STEP_META = [
  {
    greeting:  "Let's get to know each other.",
    question:  "What's your primary\ntraining goal?",
    subtext:   "We'll build your entire program around this.",
    canSkip:   false,
  },
  {
    greeting:  "Good choice.",
    question:  "How long have you been\ntraining seriously?",
    subtext:   "This helps us calibrate intensity and volume.",
    canSkip:   false,
  },
  {
    greeting:  "Now let's talk numbers.",
    question:  "What are your current\nbest lifts?",
    subtext:   "Approximate is fine — we'll calibrate as we go.",
    canSkip:   true,
  },
  {
    greeting:  "Recovery matters as much as volume.",
    question:  "How many days per week\ncan you train?",
    subtext:   "Be realistic. Consistency beats frequency every time.",
    canSkip:   false,
  },
  {
    greeting:  "Your coach needs to know what to work around.",
    question:  "Any injuries or pain\nto work around?",
    subtext:   "Select all that apply. We'll adjust your program accordingly.",
    canSkip:   true,
  },
  {
    greeting:  "Equipment matters.",
    question:  "Where do you train?",
    subtext:   "Select all that apply — we'll tailor exercise selection.",
    canSkip:   false,
  },
  {
    greeting:  "One more thing.",
    question:  "Upload anything that helps\nyour coach know you better.",
    subtext:   "Training logs, test results, health history — anything useful.",
    canSkip:   true,
  },
];

const GOALS = [
  { label: 'Strength',             icon: 'weight-lifter'    },
  { label: 'Hypertrophy',          icon: 'arm-flex-outline' },
  { label: 'Powerlifting',         icon: 'podium'           },
  { label: 'Strongman',            icon: 'dumbbell'         },
  { label: 'Athletic Performance', icon: 'run-fast'         },
  { label: 'General Fitness',      icon: 'heart-pulse'      },
];

const EXPERIENCE = [
  { label: 'Beginner',     detail: 'Less than 1 year' },
  { label: 'Intermediate', detail: '1–3 years'        },
  { label: 'Advanced',     detail: '3–7 years'        },
  { label: 'Elite',        detail: '7+ years'         },
];

const LIFT_FIELDS = [
  { key: 'squat',    label: 'Back Squat'   },
  { key: 'bench',    label: 'Bench Press'  },
  { key: 'deadlift', label: 'Deadlift'     },
  { key: 'ohp',      label: 'OHP'          },
] as const;

const TRAINING_DAYS = [
  { days: 3, desc: 'Full body + recovery'  },
  { days: 4, desc: 'Upper/lower split'     },
  { days: 5, desc: 'Classic 5-day split'   },
  { days: 6, desc: 'High-frequency push'   },
];

const INJURIES = [
  'Shoulder', 'Elbow', 'Wrist',
  'Upper Back / Thoracic', 'Lower Back / Lumbar',
  'Neck / Cervical', 'Hip / Hip Flexor', 'Knee',
  'Ankle / Foot', 'SI Joint / Pelvis',
  'Bicep / Tricep', 'Forearm / Grip',
  'Hamstring', 'Quad / Patellar',
  'Hernia / Core', 'Post-Surgical Rehab',
  'Nerve / Numbness', 'Chronic Pain', 'None',
];

const GYM_TYPES = [
  'Commercial Gym', 'Strength / Powerlifting Gym',
  'Strongman Gym', 'CrossFit Box',
  'Olympic Weightlifting Gym', 'Home Gym',
  'Garage Gym', 'College / University Gym',
  'Military / Base Gym', 'Outdoor / Field',
  'Multiple Locations',
];

// ── Main Component ────────────────────────────────────────────────────────────

export default function OnboardingIntake() {
  const router = useRouter();

  // State
  const [step,         setStep]        = useState(1);
  const [saving,       setSaving]      = useState(false);
  const [goal,         setGoal]        = useState('');
  const [experience,   setExperience]  = useState('');
  const [lifts,        setLifts]       = useState({ squat: '', bench: '', deadlift: '', ohp: '' });
  const [liftUnit,     setLiftUnit]    = useState<'lbs' | 'kg'>('lbs');
  const [trainingDays, setDays]        = useState(0);
  const [injuries,     setInjuries]    = useState<string[]>([]);
  const [gymTypes,     setGymTypes]    = useState<string[]>([]);
  const [hasUpload,    setHasUpload]   = useState(false);

  // Stagger animation refs
  const containerFade = useRef(new Animated.Value(1)).current;
  const greetFade     = useRef(new Animated.Value(0)).current;
  const greetSlide    = useRef(new Animated.Value(20)).current;
  const qFade         = useRef(new Animated.Value(0)).current;
  const qSlide        = useRef(new Animated.Value(20)).current;
  const oFade         = useRef(new Animated.Value(0)).current;
  const oSlide        = useRef(new Animated.Value(20)).current;

  // Animate in on mount
  useEffect(() => { animateIn(); }, []);

  const animateIn = () => {
    greetFade.setValue(0);  greetSlide.setValue(20);
    qFade.setValue(0);      qSlide.setValue(20);
    oFade.setValue(0);      oSlide.setValue(20);
    containerFade.setValue(1);

    Animated.stagger(85, [
      Animated.parallel([
        Animated.timing(greetFade,  { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(greetSlide, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(qFade,  { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(qSlide, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(oFade,  { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(oSlide, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
      ]),
    ]).start();
  };

  const transition = (newStep: number) => {
    Animated.timing(containerFade, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
      setStep(newStep);
      animateIn();
    });
  };

  // ── Haptics ────────────────────────────────────────────────────────────────
  const haptic = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  };

  // ── Validation ─────────────────────────────────────────────────────────────
  const canContinue = (): boolean => {
    switch (step) {
      case 1: return !!goal;
      case 2: return !!experience;
      case 3: return Object.values(lifts).some(v => v.trim() !== '');
      case 4: return trainingDays > 0;
      case 5: return injuries.length > 0;
      case 6: return gymTypes.length > 0;
      case 7: return true;
      default: return false;
    }
  };

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goNext = () => {
    if (!canContinue()) return;
    if (step === TOTAL_STEPS) { handleComplete(); return; }
    transition(step + 1);
  };

  const goBack = () => { if (step > 1) transition(step - 1); };
  const goSkip = () => {
    if (step === TOTAL_STEPS) { handleComplete(); return; }
    transition(step + 1);
  };

  // ── Multi-select helpers ──────────────────────────────────────────────────
  const toggleInjury = (item: string) => {
    haptic();
    if (item === 'None') { setInjuries(['None']); return; }
    setInjuries(prev => {
      const clean = prev.filter(i => i !== 'None');
      return clean.includes(item) ? clean.filter(i => i !== item) : [...clean, item];
    });
  };

  const toggleGym = (item: string) => {
    haptic();
    setGymTypes(prev => prev.includes(item) ? prev.filter(g => g !== item) : [...prev, item]);
  };

  // ── Save & complete ────────────────────────────────────────────────────────
  const DAY_MAP: Record<number, string[]> = {
    3: ['monday', 'wednesday', 'friday'],
    4: ['monday', 'tuesday', 'thursday', 'friday'],
    5: ['monday', 'tuesday', 'thursday', 'friday', 'saturday'],
    6: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
  };

  const GOAL_MAP: Record<string, string> = {
    'Strength':            'strength',
    'Hypertrophy':         'hypertrophy',
    'Powerlifting':        'powerlifting',
    'Strongman':           'strongman',
    'Athletic Performance':'athletic',
    'General Fitness':     'general',
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      const currentLifts: Record<string, number> = {};
      if (lifts.squat)    currentLifts['squat']    = parseFloat(lifts.squat)    || 0;
      if (lifts.bench)    currentLifts['bench']    = parseFloat(lifts.bench)    || 0;
      if (lifts.deadlift) currentLifts['deadlift'] = parseFloat(lifts.deadlift) || 0;
      if (lifts.ohp)      currentLifts['ohp']      = parseFloat(lifts.ohp)      || 0;

      const cleanInjuries = injuries.includes('None') ? [] : injuries;

      // 1. Save locally (existing behavior — keeps offline fallback)
      await saveProfile({
        goal,
        experience,
        basePRs: currentLifts,
        units: liftUnit,
        trainingDays,
        injuryFlags: cleanInjuries,
        gymTypes,
        hasUpload,
        currentWeek:      1,
        programStartDate: new Date().toISOString(),
        onboardingComplete: true,
        notifications: {
          dailyReminder:    true,
          dailyReminderTime:'08:00',
          deloadAlert:      true,
          prAlert:          true,
          weeklyCheckin:    true,
        },
        loseitConnected: false,
      } as any);

      // 2. Call backend — generate full 12-month plan
      const response = await submitIntake({
        name: experience ? `${experience} Athlete` : 'Athlete',
        goal: GOAL_MAP[goal] || goal.toLowerCase(),
        experience: experience.toLowerCase(),
        currentLifts,
        liftUnit,
        trainingDays: DAY_MAP[trainingDays] || DAY_MAP[4],
        injuries: cleanInjuries,
        gymTypes,
      });

      // 3. Navigate to the reveal screen with plan data
      router.replace({
        pathname: '/program-reveal',
        params: {
          userId:  response.userId,
          planId:  response.plan.planId,
          planName: response.plan.planName,
        },
      });
    } catch (_error) {
      // API failure — still navigate forward so UX isn't blocked
      router.replace('/(tabs)');
    } finally {
      setSaving(false);
    }
  };

  // ── Step renderers ─────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <View style={s.pillGrid}>
      {GOALS.map(({ label, icon }) => {
        const active = goal === label;
        return (
          <TouchableOpacity
            key={label}
            style={[s.goalPill, active && s.pillActive]}
            onPress={() => { haptic(); setGoal(label); }}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name={icon as any} size={22} color={active ? COLORS.primary : COLORS.accent} />
            <Text style={[s.goalPillText, active && s.pillTextActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderStep2 = () => (
    <View style={s.expList}>
      {EXPERIENCE.map(({ label, detail }) => {
        const active = experience === label;
        return (
          <TouchableOpacity
            key={label}
            style={[s.expPill, active && s.pillActive]}
            onPress={() => { haptic(); setExperience(label); }}
            activeOpacity={0.8}
          >
            <View style={s.expLeft}>
              <Text style={[s.expLabel, active && s.pillTextActive]}>{label}</Text>
              <Text style={[s.expDetail, active && s.expDetailActive]}>{detail}</Text>
            </View>
            {active && (
              <View style={s.checkCircle}>
                <MaterialCommunityIcons name="check" size={14} color={COLORS.primary} />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderStep3 = () => (
    <View>
      {/* lbs / kg toggle */}
      <View style={s.unitToggleRow}>
        <View style={s.unitToggle}>
          {(['lbs', 'kg'] as const).map(u => (
            <TouchableOpacity
              key={u}
              style={[s.unitBtn, liftUnit === u && s.unitBtnActive]}
              onPress={() => { haptic(); setLiftUnit(u); }}
            >
              <Text style={[s.unitBtnText, liftUnit === u && s.unitBtnTextActive]}>
                {u.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {LIFT_FIELDS.map(({ key, label }) => (
        <View key={key} style={s.liftRow}>
          <Text style={s.liftLabel}>{label}</Text>
          <View style={s.liftRight}>
            <TextInput
              style={s.liftInput}
              value={lifts[key]}
              onChangeText={(v) => setLifts(prev => ({ ...prev, [key]: v.replace(/[^0-9.]/g, '') }))}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor={COLORS.text.muted}
              returnKeyType="next"
              selectTextOnFocus
            />
            <Text style={s.liftUnit}>{liftUnit}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  const renderStep4 = () => (
    <View style={s.dayGrid}>
      {TRAINING_DAYS.map(({ days, desc }) => {
        const active = trainingDays === days;
        return (
          <TouchableOpacity
            key={days}
            style={[s.dayCard, active && s.dayCardActive]}
            onPress={() => { haptic(); setDays(days); }}
            activeOpacity={0.8}
          >
            {active && (
              <View style={s.dayCheck}>
                <MaterialCommunityIcons name="check" size={12} color={COLORS.primary} />
              </View>
            )}
            <Text style={[s.dayNum, active && s.dayNumActive]}>{days}</Text>
            <Text style={[s.dayWord, active && s.dayWordActive]}>days/week</Text>
            <Text style={[s.dayDesc, active && s.dayDescActive]}>{desc}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderStep5 = () => (
    <View style={s.chipWrap}>
      {INJURIES.map(item => {
        const active   = injuries.includes(item);
        const isNone   = item === 'None';
        return (
          <TouchableOpacity
            key={item}
            style={[s.chip, active && s.pillActive, isNone && s.noneChip, active && isNone && s.noneChipActive]}
            onPress={() => toggleInjury(item)}
            activeOpacity={0.8}
          >
            {active && (
              <MaterialCommunityIcons
                name="check"
                size={12}
                color={isNone ? COLORS.status.success : COLORS.primary}
                style={{ marginRight: 4 }}
              />
            )}
            <Text style={[s.chipText, active && s.pillTextActive, active && isNone && s.noneChipText]}>
              {item}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderStep6 = () => (
    <View style={s.chipWrap}>
      {GYM_TYPES.map(item => {
        const active = gymTypes.includes(item);
        return (
          <TouchableOpacity
            key={item}
            style={[s.chip, active && s.pillActive]}
            onPress={() => toggleGym(item)}
            activeOpacity={0.8}
          >
            {active && (
              <MaterialCommunityIcons name="check" size={12} color={COLORS.primary} style={{ marginRight: 4 }} />
            )}
            <Text style={[s.chipText, active && s.pillTextActive]}>{item}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderStep7 = () => (
    <View>
      <TouchableOpacity
        style={[s.uploadZone, hasUpload && s.uploadZoneDone]}
        onPress={() => { haptic(); setHasUpload(true); }}
        activeOpacity={0.8}
      >
        <View style={[s.uploadIconRing, hasUpload && s.uploadIconRingDone]}>
          <MaterialCommunityIcons
            name={hasUpload ? 'check-circle-outline' : 'cloud-upload-outline'}
            size={40}
            color={hasUpload ? COLORS.status.success : COLORS.accent}
          />
        </View>
        <Text style={s.uploadTitle}>
          {hasUpload ? 'File attached — nice work' : 'Tap to browse files'}
        </Text>
        <Text style={s.uploadSub}>PDFs, images, spreadsheets, text files</Text>
      </TouchableOpacity>

      <View style={s.uploadOptRow}>
        <MaterialCommunityIcons name="information-outline" size={13} color={COLORS.text.muted} />
        <Text style={s.uploadOptText}>This step is optional — tap Skip to continue</Text>
      </View>
    </View>
  );

  const renderContent = () => {
    switch (step) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      case 6: return renderStep6();
      case 7: return renderStep7();
      default: return null;
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const meta       = STEP_META[step - 1];
  const isLastStep = step === TOTAL_STEPS;
  const active     = canContinue();

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── Top bar ── */}
        <View style={s.topBar}>
          {/* Back */}
          {step > 1 ? (
            <TouchableOpacity style={s.topBtn} onPress={goBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text.secondary} />
            </TouchableOpacity>
          ) : (
            <View style={s.topBtn} />
          )}

          {/* Progress dots */}
          <View style={s.dotsRow}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => {
              const n = i + 1;
              return (
                <View
                  key={n}
                  style={[
                    s.dot,
                    n < step  && s.dotDone,
                    n === step && s.dotActive,
                  ]}
                />
              );
            })}
          </View>

          {/* Skip */}
          {meta.canSkip ? (
            <TouchableOpacity style={[s.topBtn, s.topBtnRight]} onPress={goSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.skipText}>Skip</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.topBtn} />
          )}
        </View>

        {/* ── Scrollable content ── */}
        <Animated.View style={[s.contentWrap, { opacity: containerFade }]}>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Greeting */}
            <Animated.View
              style={{ opacity: greetFade, transform: [{ translateY: greetSlide }] }}
            >
              <Text style={s.greeting}>{meta.greeting}</Text>
            </Animated.View>

            {/* Question + subtext */}
            <Animated.View
              style={{ opacity: qFade, transform: [{ translateY: qSlide }], marginBottom: SPACING.xl }}
            >
              <Text style={s.question}>{meta.question}</Text>
              {meta.subtext ? <Text style={s.subtext}>{meta.subtext}</Text> : null}
            </Animated.View>

            {/* Step options */}
            <Animated.View
              style={{ opacity: oFade, transform: [{ translateY: oSlide }] }}
            >
              {renderContent()}
            </Animated.View>

            <View style={{ height: 24 }} />
          </ScrollView>
        </Animated.View>

        {/* ── Footer ── */}
        <View style={s.footer}>
          <TouchableOpacity
            style={[s.ctaBtn, isLastStep && s.ctaBtnFinal, !active && s.ctaBtnOff]}
            onPress={goNext}
            disabled={saving || (!active && !isLastStep)}
            activeOpacity={0.88}
          >
            {saving ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <>
                <Text style={[s.ctaText, !active && s.ctaTextOff]}>
                  {isLastStep ? 'Build My Program' : 'Continue'}
                </Text>
                {(active || isLastStep) && (
                  <MaterialCommunityIcons
                    name={isLastStep ? 'rocket-launch-outline' : 'arrow-right'}
                    size={18}
                    color={COLORS.primary}
                    style={{ marginLeft: 6 }}
                  />
                )}
              </>
            )}
          </TouchableOpacity>
          <Text style={s.stepCounter}>{step} of {TOTAL_STEPS}</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const BG = '#0A0A0C';

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: BG },
  contentWrap: { flex: 1 },
  scroll:      { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.xxl },

  // ── Top bar ──
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  topBtn:      { width: 44, height: 44, justifyContent: 'center' },
  topBtnRight: { alignItems: 'flex-end' },
  skipText:    { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, fontWeight: FONTS.weights.medium },

  // ── Progress dots ──
  dotsRow:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot:       { width: 7, height: 7, borderRadius: 4, backgroundColor: '#252528' },
  dotDone:   { backgroundColor: COLORS.accent                                    },
  dotActive: { width: 22, height: 7, borderRadius: 4, backgroundColor: COLORS.accent },

  // ── Text hierarchy ──
  greeting: {
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.heavy,
    color: COLORS.accent,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginBottom: SPACING.md,
  },
  question: {
    fontSize: FONTS.sizes.hero,
    fontWeight: FONTS.weights.heavy,
    color: COLORS.text.primary,
    lineHeight: 42,
    marginBottom: SPACING.sm,
  },
  subtext: {
    fontSize: FONTS.sizes.base,
    color: COLORS.text.muted,
    lineHeight: 22,
  },

  // ── Common pill states ──
  pillActive:    { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  pillTextActive:{ color: COLORS.primary, fontWeight: FONTS.weights.heavy },

  // ── Step 1 — Goal pills 2-col ──
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  goalPill: {
    width: '47.5%',
    backgroundColor: '#161618',
    borderRadius: 18,
    padding: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1.5,
    borderColor: '#2A2A2E',
    minHeight: 96,
    justifyContent: 'center',
  },
  goalPillText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.text.secondary,
    textAlign: 'center',
  },

  // ── Step 2 — Experience pills ──
  expList:  { gap: SPACING.sm },
  expPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#161618',
    borderRadius: 18,
    padding: SPACING.lg,
    borderWidth: 1.5,
    borderColor: '#2A2A2E',
  },
  expLeft:       { gap: 3 },
  expLabel:      { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.primary },
  expDetail:     { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },
  expDetailActive: { color: 'rgba(13,13,13,0.65)' },
  checkCircle: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },

  // ── Step 3 — Lift inputs ──
  unitToggleRow: { marginBottom: SPACING.lg },
  unitToggle: {
    flexDirection: 'row',
    backgroundColor: '#161618',
    borderRadius: 12,
    padding: 3,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#2A2A2E',
  },
  unitBtn:        { paddingHorizontal: SPACING.lg, paddingVertical: 8, borderRadius: 9 },
  unitBtnActive:  { backgroundColor: COLORS.accent },
  unitBtnText:    { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.bold, color: COLORS.text.muted },
  unitBtnTextActive: { color: COLORS.primary },
  liftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161618',
    borderRadius: 16,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: '#2A2A2E',
  },
  liftLabel: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, fontWeight: FONTS.weights.medium },
  liftRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liftInput: {
    width: 88,
    height: 48,
    backgroundColor: '#242428',
    borderRadius: 12,
    textAlign: 'center',
    fontSize: FONTS.sizes.xl,
    fontWeight: FONTS.weights.heavy,
    color: COLORS.accent,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
  },
  liftUnit: { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, width: 30 },

  // ── Step 4 — Day cards 2×2 ──
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  dayCard: {
    width: '47.5%',
    backgroundColor: '#161618',
    borderRadius: 22,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#2A2A2E',
    minHeight: 130,
    justifyContent: 'center',
    position: 'relative',
  },
  dayCardActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  dayCheck: {
    position: 'absolute',
    top: 10, right: 10,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  dayNum:         { fontSize: 52, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 58 },
  dayNumActive:   { color: COLORS.primary },
  dayWord:        { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, letterSpacing: 0.3 },
  dayWordActive:  { color: 'rgba(13,13,13,0.65)' },
  dayDesc:        { fontSize: 10, color: COLORS.text.muted, textAlign: 'center', marginTop: 5 },
  dayDescActive:  { color: 'rgba(13,13,13,0.55)' },

  // ── Step 5 & 6 — Multi-select chips ──
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: 100,
    backgroundColor: '#161618',
    borderWidth: 1.5,
    borderColor: '#2A2A2E',
  },
  chipText:  { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, fontWeight: FONTS.weights.medium },
  noneChip:  { borderColor: '#3A3A3E' },
  noneChipActive: { backgroundColor: 'rgba(76,175,80,0.12)', borderColor: COLORS.status.success },
  noneChipText:   { color: COLORS.status.success },

  // ── Step 7 — Upload ──
  uploadZone: {
    borderWidth: 2,
    borderColor: COLORS.accent,
    borderStyle: 'dashed',
    borderRadius: 22,
    paddingVertical: SPACING.xxl + 8,
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: 'rgba(201,168,76,0.03)',
    marginBottom: SPACING.lg,
  },
  uploadZoneDone: {
    borderColor: COLORS.status.success,
    backgroundColor: 'rgba(76,175,80,0.03)',
  },
  uploadIconRing: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(201,168,76,0.07)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  uploadIconRingDone: { backgroundColor: 'rgba(76,175,80,0.07)' },
  uploadTitle:     { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.primary },
  uploadSub:       { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },
  uploadOptRow:    { flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center' },
  uploadOptText:   { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, fontStyle: 'italic' },

  // ── Footer ──
  footer:   { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.lg, gap: SPACING.sm },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    paddingVertical: 17,
    gap: 4,
  },
  ctaBtnFinal: {
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaBtnOff:      { backgroundColor: '#1E1E22' },
  ctaText:        { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.primary, letterSpacing: 0.5 },
  ctaTextOff:     { color: COLORS.text.muted },
  stepCounter:    { textAlign: 'center', fontSize: FONTS.sizes.sm, color: COLORS.text.muted },
});
