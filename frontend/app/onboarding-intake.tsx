import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Platform, Animated,
  TextInput, ActivityIndicator, Alert, Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../src/constants/theme';
import { saveProfile } from '../src/utils/storage';
import { programApi, profileApi, uploadApi, planApi } from '../src/utils/api';
import { getLocalDateString } from '../src/utils/dateHelpers';
import { getStoredUser, getAuthToken, storeUser } from '../src/utils/auth';

// ── Constants ─────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 13;

const STEP_META = [
  {
    greeting:  "Welcome to The Program.",
    question:  "What's your name?",
    subtext:   "So your coach knows who they're working with.",
    canSkip:   false,
  },
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
    subtext:   "Approximate is fine — we calibrate as you train.",
    canSkip:   true,
  },
  {
    greeting:  "Body composition matters.",
    question:  "What's your current\nbody weight?",
    subtext:   "Used to set intensity zones and track progress.",
    canSkip:   false,
  },
  {
    greeting:  "Let's plan your schedule.",
    question:  "How many days per week\ncan you train?",
    subtext:   "Be realistic. Consistency beats frequency every time.",
    canSkip:   false,
  },
  {
    greeting:  "Your program is more effective when we know this.",
    question:  "Where do your lifts\nbreak down?",
    subtext:   "Select all that apply — your coach will target these directly.",
    canSkip:   true,
  },
  {
    greeting:  "Equipment shapes your exercise menu.",
    question:  "What specialty equipment\ndo you have access to?",
    subtext:   "Select all that apply. This determines your exercise variations.",
    canSkip:   true,
  },
  {
    greeting:  "Your coach needs to know what to work around.",
    question:  "Any injuries or pain\nto manage?",
    subtext:   "Select all that apply. Your program will work around these.",
    canSkip:   true,
  },
  {
    greeting:  "This helps your coach keep you safe.",
    question:  "Any medical documents\nto share?",
    subtext:   "Upload X-rays, doctor's notes, or PT reports. Your coach will use these to protect you. Completely optional.",
    canSkip:   true,
  },
  {
    greeting:  "Recovery is where strength is made.",
    question:  "Tell me about your\nrecovery quality.",
    subtext:   "This directly affects your volume prescription.",
    canSkip:   false,
  },
  {
    greeting:  "One more thing.",
    question:  "Do you have a current\nworkout program?",
    subtext:   "Describe it and we'll build around what's already working for you. Or skip to let the AI design from scratch.",
    canSkip:   true,
  },
  {
    greeting:  "Almost there.",
    question:  "Where do you train &\ndo you have a competition?",
    subtext:   "Gym environment + competition timeline shape your periodization.",
    canSkip:   false,
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
  { label: 'Beginner',     detail: 'Less than 1 year — learning the patterns' },
  { label: 'Intermediate', detail: '1–3 years — building consistent strength'  },
  { label: 'Advanced',     detail: '3–7 years — optimizing every variable'     },
  { label: 'Elite',        detail: '7+ years — competing or ready to'          },
];

const BASE_LIFT_FIELDS = [
  { key: 'squat',    label: 'Back Squat'          },
  { key: 'bench',    label: 'Bench Press'         },
  { key: 'deadlift', label: 'Deadlift'            },
  { key: 'ohp',      label: 'Overhead Press'      },
] as const;

const STRONGMAN_LIFT_FIELDS = [
  { key: 'log',      label: 'Log Clean & Press'   },
  { key: 'axle',     label: 'Axle Clean & Press'  },
  { key: 'yoke',     label: 'Yoke (per 40 ft)'    },
] as const;

const TRAINING_DAYS = [
  { days: 3, desc: '3 max effort sessions/week'     },
  { days: 4, desc: 'Classic 4-day ME+DE split'      },
  { days: 5, desc: 'High volume — 5th day GPP/events'  },
  { days: 6, desc: 'Full frequency push'               },
];

const PRIMARY_WEAKNESSES = [
  { label: 'Off the chest / bottom ROM',         icon: 'arrow-collapse-down'  },
  { label: 'Tricep lockout (top half)',           icon: 'lock-open-outline'    },
  { label: 'Shoulder girdle / pec tie-in',       icon: 'human-handsup'        },
  { label: 'Off the floor (deadlift / clean)',   icon: 'arrow-up-bold'        },
  { label: 'Knee / hip transition (mid-pull)',   icon: 'approximately-equal'  },
  { label: 'Lockout / hip drive (deadlift)',     icon: 'arrow-up-bold-circle' },
  { label: 'Squat depth / the hole',             icon: 'arrow-collapse-down'  },
  { label: 'Upper back rounding under load',     icon: 'human-queue'          },
  { label: 'Core stability / bracing',           icon: 'circle-double'        },
  { label: 'Hip mobility / achieving depth',     icon: 'rotate-left'          },
  { label: 'Shoulder / overhead mobility',       icon: 'arm-flex-outline'     },
  { label: 'Overhead lockout & stability',       icon: 'arrow-up-box-outline' },
  { label: 'Pressing strength (general upper)',  icon: 'weight-lifter'        },
  { label: 'Posterior chain (hamstrings/glutes)',icon: 'walk'                 },
  { label: 'Grip strength / forearm endurance', icon: 'hand-clap'            },
  { label: 'Conditioning / work capacity',       icon: 'heart-pulse'          },
  { label: 'Mental / confidence under maximal', icon: 'brain'                },
];

const SPECIALTY_EQUIPMENT = [
  { label: 'Safety Squat Bar (SSB)',    key: 'ssb'             },
  { label: 'Cambered Bar',              key: 'cambered_bar'    },
  { label: 'Trap Bar / Hex Bar',        key: 'trap_bar'        },
  { label: 'Axle Bar',                  key: 'axle'            },
  { label: 'Log Bar',                   key: 'log'             },
  { label: 'Resistance Bands',          key: 'bands'           },
  { label: 'Chains',                    key: 'chains'          },
  { label: 'Yoke',                      key: 'yoke'            },
  { label: 'Farmer Handles',            key: 'farmer_handles'  },
  { label: 'Atlas Stones',              key: 'atlas_stones'    },
  { label: 'Sled / Push Sled',          key: 'sled'            },
  { label: 'GHR Machine',              key: 'ghr'             },
  { label: 'Reverse Hyper',             key: 'reverse_hyper'   },
  { label: 'Belt Squat Machine',        key: 'belt_squat'      },
  { label: 'Monolift',                  key: 'monolift'        },
  { label: 'Calibrated Plates',         key: 'calibrated'      },
  { label: 'None of the above',         key: 'none'            },
];

const INJURIES = [
  'Shoulder (general)',         'Rotator Cuff',
  'Elbow (tendinitis/pain)',    'Wrist / Forearm',
  'Upper Back / Thoracic',      'Lower Back / Lumbar',
  'SI Joint / Pelvis',          'Hip / Hip Flexor',
  'Groin / Adductor',           'Knee (general)',
  'Patellar Tendinitis',        'Ankle / Foot',
  'Hamstring',                  'Quad / Patellar',
  'Bicep (tendon)',             'Tricep (tendon)',
  'Neck / Cervical',            'Hernia / Core',
  'Nerve / Sciatica',           'Post-Surgical Rehab',
  'Chronic / Systemic Pain',    'None',
];

const SLEEP_OPTIONS = [
  { label: '< 6 hrs',   value: '5',  detail: 'Severely under-recovered' },
  { label: '6 – 7 hrs', value: '6',  detail: 'Below optimal'            },
  { label: '7 – 8 hrs', value: '7',  detail: 'Good baseline'            },
  { label: '8 – 9 hrs', value: '8',  detail: 'Optimal for athletes'     },
  { label: '9+ hrs',    value: '9',  detail: 'Maximum recovery'         },
];

const STRESS_LEVELS = [
  { label: 'Low',       value: 'low',       detail: 'Life is calm — training is the priority', icon: 'battery-high'  },
  { label: 'Moderate',  value: 'moderate',  detail: 'Manageable — normal life demands',         icon: 'battery-medium'},
  { label: 'High',      value: 'high',      detail: 'Work/life feels heavy most days',           icon: 'battery-low'   },
  { label: 'Very High', value: 'very_high', detail: 'Survival mode — barely keeping up',         icon: 'battery-alert' },
];

const OCCUPATION_TYPES = [
  { label: 'Desk / Sedentary',          value: 'sedentary', detail: 'Minimal physical activity at work', icon: 'laptop'         },
  { label: 'Moderately Active',         value: 'active',    detail: 'On feet part of the day',           icon: 'walk'           },
  { label: 'Physically Demanding',      value: 'manual',    detail: 'Manual labor / trades / field work', icon: 'hammer-wrench'  },
];

const COMPETITION_TYPES = [
  { label: 'Powerlifting Meet',       icon: 'trophy'         },
  { label: 'Strongman Show',          icon: 'dumbbell'       },
  { label: 'Olympic Weightlifting',   icon: 'weight-lifter'  },
  { label: 'Highland Games',          icon: 'hammer'         },
  { label: 'Local / Charity Event',   icon: 'certificate'    },
  { label: 'General Performance',     icon: 'run-fast'       },
];

const GYM_TYPES = [
  'Commercial Gym',              'Strength / Powerlifting Gym',
  'Strongman Gym',               'CrossFit Box',
  'Olympic Weightlifting Gym',   'Home Gym',
  'Garage Gym',                  'College / University Gym',
  'Military / Base Gym',         'Outdoor / Field',
  'Multiple Locations',
];

// ── Goal → backend key map ────────────────────────────────────────────────────
const GOAL_MAP: Record<string, string> = {
  'Strength':            'Strength',
  'Hypertrophy':         'Hypertrophy',
  'Powerlifting':        'Powerlifting',
  'Strongman':           'Strongman',
  'Athletic Performance':'Athletic Performance',
  'General Fitness':     'General Fitness',
};

const DAY_MAP: Record<number, string[]> = {
  3: ['monday', 'wednesday', 'friday'],
  4: ['monday', 'tuesday', 'thursday', 'friday'],
  5: ['monday', 'tuesday', 'thursday', 'friday', 'saturday'],
  6: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
};

// ── Main Component ────────────────────────────────────────────────────────────

export default function OnboardingIntake() {
  const router = useRouter();
  const { mode, path } = useLocalSearchParams<{ mode?: string; path?: string }>();
  const isRebuildMode = mode === 'rebuild';
  const isFreeMode    = path === 'free';
  const FREE_TOTAL    = 3;  // free mode shows only 3 steps

  // ── Core state ──────────────────────────────────────────────────────────────
  const [step,         setStep]        = useState(1);
  const [saving,       setSaving]      = useState(false);

  // Step 1 — Name
  const [userName,     setUserName]    = useState('');

  // Step 2 — Goal
  const [goal,         setGoal]        = useState('');

  // Step 2 — Experience
  const [experience,   setExperience]  = useState('');

  // Step 3 — Lifts
  const [lifts, setLifts] = useState<Record<string, string>>({
    squat: '', bench: '', deadlift: '', ohp: '',
    log: '', axle: '', yoke: '',
  });
  const [liftUnit, setLiftUnit] = useState<'lbs' | 'kg'>('lbs');

  // Step 4 — Bodyweight
  const [bodyweight,    setBodyweight]   = useState('');
  const [bw12WeekGoal,  setBw12Week]     = useState('');

  // Step 5 — Training frequency
  const [trainingDays, setDays] = useState(0);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);

  // Step 6 — Primary weaknesses
  const [primaryWeaknesses, setPrimaryWeaknesses] = useState<string[]>([]);

  // Step 7 — Specialty equipment
  const [specialtyEquipment, setSpecialtyEquipment] = useState<string[]>([]);

  // Step 8 — Injuries
  const [injuries, setInjuries] = useState<string[]>([]);

  // Step 11 — Recovery profile (sleep / stress / occupation)
  const [selectedSleep,    setSelectedSleep]   = useState('');
  const [stressLevel,      setStressLevel]     = useState('');
  const [occupationType,   setOccupationType]  = useState('');

  // Step 13 — Gym + Competition (last step before Build My Program)
  const [gymTypes,         setGymTypes]        = useState<string[]>([]);
  const [hasCompetition,   setHasCompetition]  = useState<boolean | null>(null);
  const [competitionType,  setCompetitionType] = useState('');
  const [competitionDate,  setCompetitionDate] = useState('');

  // Step 12 — Current Program (optional)
  const [currentProgram,   setCurrentProgram]  = useState('');
  const [programFiles,     setProgramFiles]    = useState<{uri: string; name: string; type: string}[]>([]);
  const [programMode,      setProgramMode]     = useState<'upload'|'type'|'skip'|null>(null);
  const [analyzingProgram, setAnalyzingProgram] = useState(false);

  // Step 10 — Medical Documents (optional)
  const [medicalFiles,     setMedicalFiles]    = useState<{uri: string; name: string; type: string}[]>([]);
  const [analyzingMedical, setAnalyzingMedical] = useState(false);
  const [medicalAnalysis,  setMedicalAnalysis] = useState<string>('');

  // ── Animation refs ──────────────────────────────────────────────────────────
  const containerFade = useRef(new Animated.Value(1)).current;
  const greetFade     = useRef(new Animated.Value(0)).current;
  const greetSlide    = useRef(new Animated.Value(20)).current;
  const qFade         = useRef(new Animated.Value(0)).current;
  const qSlide        = useRef(new Animated.Value(20)).current;
  const oFade         = useRef(new Animated.Value(0)).current;
  const oSlide        = useRef(new Animated.Value(20)).current;

  useEffect(() => { animateIn(); }, []);

  // Warm up the backend as soon as onboarding starts. The hosting proxy can
  // 404 on a cold-start, so we trigger a wake-up call now while the user
  // spends a few minutes filling out the form. We don't care about the
  // result — just that the container is awake by the time the user submits.
  useEffect(() => {
    profileApi.get().catch(() => { /* warmup-only; ignore errors */ });
  }, []);

  // ── Rebuild mode: pre-populate from existing profile ─────────────────────────
  useEffect(() => {
    if (!isRebuildMode) return;
    (async () => {
      try {
        const p: any = await profileApi.get();
        if (!p) return;

        // Step 1 — Name
        if (p.name) setUserName(p.name);

        // Step 2 — Goal (direct match, GOAL_MAP values equal labels)
        if (p.goal) setGoal(p.goal);

        // Step 3 — Experience
        if (p.experience) setExperience(p.experience);

        // Step 4 — Lifts (basePRs → string map)
        if (p.basePRs) {
          setLifts({
            squat:    p.basePRs.squat    ? String(p.basePRs.squat)    : '',
            bench:    p.basePRs.bench    ? String(p.basePRs.bench)    : '',
            deadlift: p.basePRs.deadlift ? String(p.basePRs.deadlift) : '',
            ohp:      p.basePRs.ohp      ? String(p.basePRs.ohp)      : '',
            log:      p.basePRs.log      ? String(p.basePRs.log)      : '',
            axle:     p.basePRs.axle     ? String(p.basePRs.axle)     : '',
            yoke:     p.basePRs.yoke     ? String(p.basePRs.yoke)     : '',
          });
        }
        if (p.units) setLiftUnit(p.units as 'lbs' | 'kg');

        // Step 5 — Bodyweight
        if (p.currentBodyweight) setBodyweight(String(p.currentBodyweight));
        if (p.bw12WeekGoal)      setBw12Week(String(p.bw12WeekGoal));

        // Step 6 — Training frequency & days
        const daysCount = p.trainingDaysCount || 4;
        setDays(daysCount);
        setSelectedDays(p.preferredDays?.length ? p.preferredDays : (DAY_MAP[daysCount] || []));

        // Step 7 — Primary weaknesses
        if (p.primaryWeaknesses?.length) setPrimaryWeaknesses(p.primaryWeaknesses);

        // Step 8 — Specialty equipment
        if (p.specialtyEquipment?.length) setSpecialtyEquipment(p.specialtyEquipment);

        // Step 9 — Injuries (ensure at least 'None' so canContinue passes)
        const inj: string[] = p.injuryFlags || [];
        setInjuries(inj.length > 0 ? inj : ['None']);

        // Step 11 — Recovery
        if (p.sleepHours != null) {
          const h = p.sleepHours;
          setSelectedSleep(h < 6 ? '5' : h < 7 ? '6' : h < 8 ? '7' : h < 9 ? '8' : '9');
        }
        if (p.stressLevel)    setStressLevel(p.stressLevel);
        if (p.occupationType) setOccupationType(p.occupationType);

        // Step 13 — Gym + Competition
        if (p.gymTypes?.length) setGymTypes(p.gymTypes);
        if (p.hasCompetition != null) setHasCompetition(p.hasCompetition);
        if (p.competitionType) setCompetitionType(p.competitionType);
        if (p.competitionDate) setCompetitionDate(p.competitionDate);

        console.log('[Onboarding Rebuild] ✅ Pre-populated from profile:', p.name);
      } catch (err) {
        console.warn('[Onboarding Rebuild] Could not pre-populate:', err);
      }
    })();
  }, [isRebuildMode]);

  const animateIn = () => {
    greetFade.setValue(0); greetSlide.setValue(20);
    qFade.setValue(0);     qSlide.setValue(20);
    oFade.setValue(0);     oSlide.setValue(20);
    containerFade.setValue(1);
    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(greetFade,  { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(greetSlide, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(qFade,  { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(qSlide, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(oFade,  { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(oSlide, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
    ]).start();
  };

  const transition = (newStep: number) => {
    Animated.timing(containerFade, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
      setStep(newStep);
      // Delay animateIn to let React finish rendering the new step on Android
      requestAnimationFrame(() => {
        setTimeout(() => {
          animateIn();
        }, Platform.OS === 'android' ? 80 : 10);
      });
    });
  };

  const haptic = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
  };

  // ── Validation ─────────────────────────────────────────────────────────────
  const canContinue = (): boolean => {
    // ── Free mode: 3 simplified steps ────────────────────────────────────
    if (isFreeMode) {
      switch (step) {
        case 1: return userName.trim().length >= 2 && !!experience;
        case 2: return bodyweight.trim() !== '' && parseFloat(bodyweight) > 0;
        case 3: return true; // injuries optional, always skippable
        default: return false;
      }
    }
    // ── Full mode: 13 steps ───────────────────────────────────────────────
    switch (step) {
      case 1:  return userName.trim().length >= 2;
      case 2:  return !!goal;
      case 3:  return !!experience;
      case 4:  return Object.values(lifts).some(v => v.trim() !== '');
      case 5:  return bodyweight.trim() !== '' && parseFloat(bodyweight) > 0;
      case 6:  return trainingDays > 0 && selectedDays.length === trainingDays;
      case 7:  return true; // optional, can skip
      case 8:  return true; // optional, can skip
      case 9:  return injuries.length > 0;
      case 10: return true; // optional — medical documents
      case 11: return !!selectedSleep && !!stressLevel && !!occupationType;
      case 12: return true; // optional, can skip — current program
      case 13: {
      if (gymTypes.length === 0 || hasCompetition === null) return false;
      if (hasCompetition === true) return competitionType !== '' && competitionDate.trim() !== '';
      return true; // hasCompetition === false → no date needed, activate immediately
    }
      default: return false;
    }
  };

  const _totalSteps = isFreeMode ? FREE_TOTAL : TOTAL_STEPS;

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goNext = () => {
    if (step === _totalSteps) { handleComplete(); return; }
    if (!canContinue()) return;
    transition(step + 1);
  };
  const goBack = () => { if (step > 1) transition(step - 1); };
  const goSkip = () => {
    if (step === _totalSteps) { handleComplete(); return; }
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

  const toggleWeakness = (item: string) => {
    haptic();
    setPrimaryWeaknesses(prev =>
      prev.includes(item) ? prev.filter(w => w !== item) : [...prev, item]
    );
  };

  const toggleEquipment = (item: string) => {
    haptic();
    if (item === 'None of the above') { setSpecialtyEquipment(['None of the above']); return; }
    setSpecialtyEquipment(prev => {
      const clean = prev.filter(e => e !== 'None of the above');
      return clean.includes(item) ? clean.filter(e => e !== item) : [...clean, item];
    });
  };

  const toggleGym = (item: string) => {
    haptic();
    setGymTypes(prev => prev.includes(item) ? prev.filter(g => g !== item) : [...prev, item]);
  };

  // ── Complete & submit ──────────────────────────────────────────────────────
  const handleComplete = async () => {
    setSaving(true);
    try {
      // BUG 3B: Fetch user's registered name so Home tab greeting is populated
      const authUser = await getStoredUser();

      const currentLifts: Record<string, number> = {};
      if (lifts.squat)    currentLifts['squat']    = parseFloat(lifts.squat)    || 0;
      if (lifts.bench)    currentLifts['bench']    = parseFloat(lifts.bench)    || 0;
      if (lifts.deadlift) currentLifts['deadlift'] = parseFloat(lifts.deadlift) || 0;
      if (lifts.ohp)      currentLifts['ohp']      = parseFloat(lifts.ohp)      || 0;
      if (lifts.log)      currentLifts['log']      = parseFloat(lifts.log)      || 0;
      if (lifts.axle)     currentLifts['axle']     = parseFloat(lifts.axle)     || 0;
      if (lifts.yoke)     currentLifts['yoke']     = parseFloat(lifts.yoke)     || 0;

      const cleanInjuries = injuries.includes('None') ? [] : injuries;
      const bwNum         = parseFloat(bodyweight) || 200;
      const bw12wNum      = parseFloat(bw12WeekGoal) || 0;
      const sleepNum      = parseFloat(selectedSleep) || 7;
      const cleanEquip    = specialtyEquipment.filter(e => e !== 'None of the above');

      console.log('[Onboarding] Step 1 — Saving profile locally...');

      // 1a. Process uploaded files (non-blocking — results saved to profile by backend)
      if (programFiles.length > 0 || medicalFiles.length > 0) {
        console.log('[Onboarding] Processing uploaded files...');
        try {
          const convertToBase64 = async (files: {uri: string; name: string; type: string}[]) => {
            const results = [];
            for (const f of files) {
              try {
                const base64 = await FileSystem.readAsStringAsync(f.uri, { encoding: FileSystem.EncodingType.Base64 });
                results.push({ data: base64, name: f.name, mimeType: f.type });
              } catch (err) { console.warn('[Onboarding] File read failed:', f.name, err); }
            }
            return results;
          };
          if (programFiles.length > 0) {
            const b64Files = await convertToBase64(programFiles);
            if (b64Files.length > 0) {
              uploadApi.analyzeProgram(b64Files, currentProgram.trim() || undefined).catch(err =>
                console.warn('[Onboarding] Program upload analysis failed (non-critical):', err)
              );
            }
          }
          if (medicalFiles.length > 0) {
            const b64Files = await convertToBase64(medicalFiles);
            if (b64Files.length > 0) {
              uploadApi.analyzeMedical(b64Files).catch(err =>
                console.warn('[Onboarding] Medical upload analysis failed (non-critical):', err)
              );
            }
          }
        } catch (uploadErr) {
          console.warn('[Onboarding] Upload processing failed (non-critical):', uploadErr);
        }
      }

      // ── ORDER OF OPERATIONS (matters!) ─────────────────────────────────────
      // Previously this saved local profile with onboardingComplete=true BEFORE
      // calling the backend. If the backend call failed for any reason, the
      // user was permanently stuck "post-onboarding" locally with no plan on
      // the server — they'd see an empty Schedule tab forever.
      //
      // Now we:
      //   1. Build the payload
      //   2. Save local profile WITHOUT onboardingComplete (offline cache only)
      //   3. Call backend submitIntake — this is the source of truth
      //   4. Only after backend confirms, set onboardingComplete locally and
      //      sync the cached AuthUser via storeUser()
      // ────────────────────────────────────────────────────────────────────────

      // 1. Save locally (no onboardingComplete yet — backend hasn't confirmed)
      await saveProfile({
        name:            userName.trim() || authUser?.name || 'Athlete',
        goal:            GOAL_MAP[goal] || goal,
        experience,
        basePRs:         currentLifts,
        units:           liftUnit,
        injuryFlags:     cleanInjuries,
        gymTypes,
        currentBodyweight: bwNum,
        bw12WeekGoal:    bw12wNum,
        primaryWeaknesses,
        specialtyEquipment: cleanEquip,
        sleepHours:      sleepNum,
        stressLevel,
        occupationType,
        hasCompetition:  !!hasCompetition,
        competitionDate: hasCompetition ? competitionDate : undefined,
        competitionType: hasCompetition ? competitionType : undefined,
        trainingDaysCount: trainingDays,
        currentWeek:     1,
        programStartDate: getLocalDateString(),
        // onboardingComplete intentionally omitted — set only after backend success
        notifications: {
          dailyReminder:     true,
          dailyReminderTime: '08:00',
          deloadAlert:       true,
          prAlert:           true,
          weeklyCheckin:     true,
        },
        loseitConnected: false,
      } as any);

      // 2. Generate plan via backend with auth (saves under correct userId)
      const payload = {
        goal:               GOAL_MAP[goal] || goal,
        experience:         experience,           // keep Title Case (matches ExperienceLevel enum)
        lifts:              currentLifts,
        liftUnit,
        frequency:          trainingDays,
        injuries:           cleanInjuries,
        gym:                gymTypes,
        bodyweight:         bwNum,
        primaryWeaknesses,
        specialtyEquipment: cleanEquip,
        sleepHours:         sleepNum,
        stressLevel:        stressLevel || undefined,
        occupationType:     occupationType || undefined,
        competitionDate:    hasCompetition ? competitionDate : undefined,
        competitionType:    hasCompetition ? competitionType : undefined,
        preferredDays:      selectedDays,
        hasCompetition:     !!hasCompetition,
        currentProgram:     currentProgram.trim() || undefined,
      };
      // CHECK 3: Verify auth token exists before calling backend
      const _token = await getAuthToken();
      console.log('[Onboarding] AUTH TOKEN EXISTS:', !!_token, '| prefix:', _token?.substring(0, 20));

      // ── REBUILD MODE: use /plans/rebuild — preserve all history ────────────
      if (isRebuildMode) {
        console.log('[Onboarding Rebuild] Calling planApi.rebuild...');
        await planApi.rebuild(payload);

        // Update local profile (keep history fields intact)
        await saveProfile({
          goal:              GOAL_MAP[goal] || goal,
          experience,
          basePRs:           currentLifts,
          units:             liftUnit,
          injuryFlags:       cleanInjuries,
          gymTypes,
          currentBodyweight: bwNum,
          bw12WeekGoal:      bw12wNum,
          primaryWeaknesses,
          specialtyEquipment: cleanEquip,
          sleepHours:         sleepNum,
          stressLevel,
          occupationType,
          hasCompetition:    !!hasCompetition,
          competitionDate:   hasCompetition ? competitionDate : undefined,
          competitionType:   hasCompetition ? competitionType : undefined,
          trainingDaysCount: trainingDays,
          onboardingComplete: true,
        } as any);

        Alert.alert(
          'Program Rebuilt! 🎉',
          'Your new workout plan is ready. All training history, PRs, streaks, and logs are preserved.',
          [{ text: "Let's Go", onPress: () => router.replace('/(tabs)') }]
        );
        setSaving(false);
        return;
      }
      // ── FREE MODE: save profile only — no plan generated ──────────────────
      if (isFreeMode) {
        console.log('[Onboarding Free] Saving free-mode profile...');
        const cleanInjFree = (injuries || []).filter(i => i && i.toLowerCase() !== 'none');
        await profileApi.update({
          name: userName.trim(),
          experience,
          currentBodyweight: parseFloat(bodyweight) || undefined,
          units: liftUnit,
          injuryFlags: cleanInjFree,
          training_mode: 'free',
          has_imported_program: false,
          onboardingComplete: true,
        } as any);
        await saveProfile({
          name: userName.trim(),
          experience,
          currentBodyweight: parseFloat(bodyweight) || undefined,
          units: liftUnit,
          injuryFlags: cleanInjFree,
          training_mode: 'free',
          has_imported_program: false,
          onboardingComplete: true,
        } as any);
        setSaving(false);
        router.replace('/(tabs)');
        return;
      }
      // ──────────────────────────────────────────────────────────────────────

      const response = await programApi.submitIntake(payload);
      console.log('[Onboarding] Step 2 — Response received:', JSON.stringify(response, null, 2));

      // ── BACKEND CONFIRMED — now safe to mark onboarding complete locally ───
      // Update three things together so launch-flow checks all agree:
      //   (a) local profile (used by isOnboardingComplete()/getProfile())
      //   (b) cached AuthUser (used by index.tsx's storedUser?.onboardingComplete)
      //   (c) backend profile (used by /api/auth/me)
      // If any of these later disagree, the launch flow can self-heal.
      try {
        await saveProfile({ onboardingComplete: true } as any);
      } catch (e) {
        console.warn('[Onboarding] Local onboardingComplete save failed:', e);
      }

      try {
        const currentUser = await getStoredUser();
        if (currentUser) {
          await storeUser({ ...currentUser, onboardingComplete: true });
        }
      } catch (e) {
        console.warn('[Onboarding] storeUser sync failed (non-critical):', e);
      }

      // 3. Sync all new fields to MongoDB profile (non-blocking)
      try {
        await profileApi.update({
          name:              userName.trim() || 'Athlete',
          experience,
          currentBodyweight: bwNum,
          bw12WeekGoal:      bw12wNum,
          basePRs:           currentLifts,
          injuryFlags:       cleanInjuries,
          gymTypes,
          goal:              GOAL_MAP[goal] || goal,  // Title Case — no toLowerCase
          primaryWeaknesses,
          specialtyEquipment: cleanEquip,
          sleepHours:         sleepNum,
          stressLevel,
          occupationType,
          hasCompetition:     !!hasCompetition,
          competitionDate:    hasCompetition ? competitionDate : '',
          competitionType:    hasCompetition ? competitionType : '',
          trainingDaysCount:  trainingDays,
          weaknesses:         primaryWeaknesses,
          onboardingComplete: true,
        } as any);
      } catch (syncErr) {
        console.log('[Onboarding] MongoDB sync non-critical error:', syncErr);
      }

      // 4. Navigate to reveal screen
      console.log('[Onboarding] Step 4 — Navigating to program-reveal with:', {
        userId: response.profile?.userId || response.userId,
        planId: response.plan?.planId,
        planName: response.plan?.planName,
      });
      router.replace({
        pathname: '/program-reveal',
        params: {
          userId:  response.profile?.userId || response.userId,
          planId:  response.plan?.planId,
          planName: response.plan?.planName,
        },
      });
    } catch (_error: any) {
      console.error('[Onboarding] ❌ ERROR in handleComplete:', _error);
      console.error('[Onboarding] Error message:', _error?.message);
      console.error('[Onboarding] Error stack:', _error?.stack);
      Alert.alert(
        'Onboarding Error',
        _error?.message || 'Failed to generate program. Please try again.',
        [{ text: 'OK' }],
      );
      // Do NOT redirect — let the user fix and retry
    } finally {
      setSaving(false);
    }
  };

  // ── Step renderers ─────────────────────────────────────────────────────────

  // Name step
  const renderNameStep = () => (
    <View style={{ paddingHorizontal: 4 }}>
      <TextInput
        style={{
          backgroundColor: '#1A1A1E',
          borderWidth: 1.5,
          borderColor: userName.trim().length >= 2 ? COLORS.accent : COLORS.border,
          borderRadius: RADIUS.lg,
          padding: SPACING.lg,
          fontSize: 22,
          fontWeight: '600' as any,
          color: COLORS.text.primary,
          textAlign: 'center',
        }}
        value={userName}
        onChangeText={setUserName}
        placeholder="Your first name"
        placeholderTextColor={COLORS.text.muted}
        autoFocus
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="next"
        onSubmitEditing={() => { if (userName.trim().length >= 2) goNext(); }}
      />
    </View>
  );

  // Step 1 — Goal
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

  // Step 2 — Experience
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

  // Step 3 — Lifts
  const renderStep3 = () => {
    const isStrongman = goal === 'Strongman';
    return (
      <View>
        <View style={s.unitToggleRow}>
          <View style={s.unitToggle}>
            {(['lbs', 'kg'] as const).map(u => (
              <TouchableOpacity
                key={u}
                style={[s.unitBtn, liftUnit === u && s.unitBtnActive]}
                onPress={() => { haptic(); setLiftUnit(u); }}
              >
                <Text style={[s.unitBtnText, liftUnit === u && s.unitBtnTextActive]}>{u.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {BASE_LIFT_FIELDS.map(({ key, label }) => (
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
              <Text style={s.liftUnitText}>{liftUnit}</Text>
            </View>
          </View>
        ))}

        {isStrongman && (
          <>
            <View style={s.liftDivider}>
              <View style={s.liftDividerLine} />
              <Text style={s.liftDividerText}>Strongman Events</Text>
              <View style={s.liftDividerLine} />
            </View>
            {STRONGMAN_LIFT_FIELDS.map(({ key, label }) => (
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
                  <Text style={s.liftUnitText}>{liftUnit}</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </View>
    );
  };

  // Step 4 — Bodyweight
  const renderStep4 = () => (
    <View>
      <View style={s.bwRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.bwLabel}>Current weight</Text>
          <View style={s.bwInputWrap}>
            <TextInput
              style={s.bwInput}
              value={bodyweight}
              onChangeText={v => setBodyweight(v.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={COLORS.text.muted}
              selectTextOnFocus
            />
            <Text style={s.bwUnit}>{liftUnit}</Text>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.bwLabel}>12-week goal (optional)</Text>
          <View style={s.bwInputWrap}>
            <TextInput
              style={[s.bwInput, s.bwInputSecondary]}
              value={bw12WeekGoal}
              onChangeText={v => setBw12Week(v.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={COLORS.text.muted}
              selectTextOnFocus
            />
            <Text style={s.bwUnit}>{liftUnit}</Text>
          </View>
        </View>
      </View>

      <View style={s.bwNote}>
        <MaterialCommunityIcons name="information-outline" size={13} color={COLORS.accent} />
        <Text style={s.bwNoteText}>
          Body weight is used to scale volume, track weekly compliance, and set safe loading zones for accessory work.
        </Text>
      </View>
    </View>
  );

  // Step 5 — Training frequency + day picker
  const DAYS_OF_WEEK = [
    { key: 'monday',    abbr: 'Mon' }, { key: 'tuesday',   abbr: 'Tue' },
    { key: 'wednesday', abbr: 'Wed' }, { key: 'thursday',  abbr: 'Thu' },
    { key: 'friday',    abbr: 'Fri' }, { key: 'saturday',  abbr: 'Sat' },
    { key: 'sunday',    abbr: 'Sun' },
  ];

  const handleSetDays = (n: number) => {
    haptic();
    setDays(n);
    // Apply smart defaults
    const defaults: Record<number, string[]> = {
      3: ['monday', 'wednesday', 'friday'],
      4: ['monday', 'tuesday', 'thursday', 'friday'],
      5: ['monday', 'tuesday', 'thursday', 'friday', 'saturday'],
      6: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    };
    setSelectedDays(defaults[n] || []);
  };

  const toggleDay = (key: string) => {
    haptic();
    setSelectedDays(prev => {
      if (prev.includes(key)) return prev.filter(d => d !== key);
      if (prev.length >= trainingDays) return [...prev.slice(1), key]; // replace oldest
      return [...prev, key];
    });
  };

  const renderStep5 = () => (
    <View>
      <View style={s.dayGrid}>
        {TRAINING_DAYS.map(({ days, desc }) => {
          const active = trainingDays === days;
          return (
            <TouchableOpacity
              key={days}
              style={[s.dayCard, active && s.dayCardActive]}
              onPress={() => handleSetDays(days)}
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

      {/* ── Day Picker ── appears once frequency is chosen */}
      {trainingDays > 0 && (
        <View style={s.dayPickerSection}>
          <View style={s.dayPickerHeader}>
            <MaterialCommunityIcons name="calendar-week" size={15} color={COLORS.accent} />
            <Text style={s.dayPickerTitle}>Which days?</Text>
            <View style={s.dayPickerBadge}>
              <Text style={s.dayPickerBadgeTxt}>
                {selectedDays.length}/{trainingDays} selected
              </Text>
            </View>
          </View>
          <Text style={s.dayPickerSub}>
            Choose your {trainingDays} training day{trainingDays !== 1 ? 's' : ''} — defaults set for you, tap to change
          </Text>
          <View style={s.dayPickerRow}>
            {DAYS_OF_WEEK.map(({ key, abbr }) => {
              const selected = selectedDays.includes(key);
              return (
                <TouchableOpacity
                  key={key}
                  style={[s.dayPill, selected && s.dayPillActive]}
                  onPress={() => toggleDay(key)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.dayPillText, selected && s.dayPillTextActive]}>{abbr}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {selectedDays.length < trainingDays && (
            <Text style={s.dayPickerHint}>
              Select {trainingDays - selectedDays.length} more day{trainingDays - selectedDays.length !== 1 ? 's' : ''}
            </Text>
          )}
          {selectedDays.length === trainingDays && (
            <View style={s.dayPickerConfirmed}>
              <MaterialCommunityIcons name="check-circle" size={13} color="#4CAF50" />
              <Text style={s.dayPickerConfirmedTxt}>
                Schedule: {selectedDays.map(d => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(' · ')}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );

  // Step 6 — Primary weaknesses
  const renderStep6 = () => (
    <View>
      <View style={s.chipWrap}>
        {PRIMARY_WEAKNESSES.map(({ label }) => {
          const active = primaryWeaknesses.includes(label);
          return (
            <TouchableOpacity
              key={label}
              style={[s.chip, active && s.pillActive]}
              onPress={() => toggleWeakness(label)}
              activeOpacity={0.8}
            >
              {active && (
                <MaterialCommunityIcons name="check" size={12} color={COLORS.primary} style={{ marginRight: 4 }} />
              )}
              <Text style={[s.chipText, active && s.pillTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  // Step 7 — Specialty equipment
  const renderStep7 = () => (
    <View style={s.chipWrap}>
      {SPECIALTY_EQUIPMENT.map(({ label }) => {
        const active  = specialtyEquipment.includes(label);
        const isNone  = label === 'None of the above';
        return (
          <TouchableOpacity
            key={label}
            style={[
              s.chip,
              active && s.pillActive,
              isNone && s.noneChip,
              active && isNone && s.noneChipActive,
            ]}
            onPress={() => toggleEquipment(label)}
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
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // Step 8 — Injuries
  const renderStep8 = () => (
    <View style={s.chipWrap}>
      {INJURIES.map(item => {
        const active = injuries.includes(item);
        const isNone = item === 'None';
        return (
          <TouchableOpacity
            key={item}
            style={[s.chip, active && s.pillActive, isNone && s.noneChip, active && isNone && s.noneChipActive]}
            onPress={() => toggleInjury(item)}
            activeOpacity={0.8}
          >
            {active && (
              <MaterialCommunityIcons
                name="check" size={12}
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

  // Step 9 — Recovery profile
  const renderStep9 = () => (
    <View style={{ gap: SPACING.xl }}>
      {/* Sleep */}
      <View>
        <Text style={s.sectionLabel}>Average nightly sleep</Text>
        <View style={s.sleepRow}>
          {SLEEP_OPTIONS.map(({ label, value }) => {
            const active = selectedSleep === value;
            return (
              <TouchableOpacity
                key={value}
                style={[s.sleepChip, active && s.pillActive]}
                onPress={() => { haptic(); setSelectedSleep(value); }}
                activeOpacity={0.8}
              >
                <Text style={[s.sleepChipText, active && s.pillTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Stress */}
      <View>
        <Text style={s.sectionLabel}>Life stress level</Text>
        <View style={{ gap: SPACING.sm }}>
          {STRESS_LEVELS.map(({ label, value, detail, icon }) => {
            const active = stressLevel === value;
            return (
              <TouchableOpacity
                key={value}
                style={[s.recoveryCard, active && s.recoveryCardActive]}
                onPress={() => { haptic(); setStressLevel(value); }}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={icon as any} size={20}
                  color={active ? COLORS.primary : COLORS.accent}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[s.recoveryCardLabel, active && s.pillTextActive]}>{label}</Text>
                  <Text style={[s.recoveryCardDetail, active && s.recoveryCardDetailActive]}>{detail}</Text>
                </View>
                {active && (
                  <MaterialCommunityIcons name="check-circle" size={18} color={COLORS.primary} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Occupation */}
      <View>
        <Text style={s.sectionLabel}>Job / daily activity type</Text>
        <View style={{ gap: SPACING.sm }}>
          {OCCUPATION_TYPES.map(({ label, value, detail, icon }) => {
            const active = occupationType === value;
            return (
              <TouchableOpacity
                key={value}
                style={[s.recoveryCard, active && s.recoveryCardActive]}
                onPress={() => { haptic(); setOccupationType(value); }}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={icon as any} size={20}
                  color={active ? COLORS.primary : COLORS.accent}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[s.recoveryCardLabel, active && s.pillTextActive]}>{label}</Text>
                  <Text style={[s.recoveryCardDetail, active && s.recoveryCardDetailActive]}>{detail}</Text>
                </View>
                {active && (
                  <MaterialCommunityIcons name="check-circle" size={18} color={COLORS.primary} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );

  // ── File picker helpers ─────────────────────────────────────────────────────
  const pickDocument = async (target: 'program' | 'medical') => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/vnd.ms-excel',
               'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const file = { uri: asset.uri, name: asset.name || 'document', type: asset.mimeType || 'application/octet-stream' };
        if (target === 'program') setProgramFiles(prev => [...prev, file]);
        else setMedicalFiles(prev => [...prev, file]);
        haptic();
      }
    } catch (err) { console.warn('Document pick failed:', err); }
  };

  const pickImage = async (target: 'program' | 'medical', source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert('Camera Permission', 'Please enable camera access in Settings.'); return; }
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const name = asset.fileName || `photo_${Date.now()}.jpg`;
        const file = { uri: asset.uri, name, type: asset.mimeType || 'image/jpeg' };
        if (target === 'program') setProgramFiles(prev => [...prev, file]);
        else setMedicalFiles(prev => [...prev, file]);
        haptic();
      }
    } catch (err) { console.warn('Image pick failed:', err); }
  };

  // ── Medical documents step ────────────────────────────────────────────────
  const renderMedicalStep = () => (
    <View style={{ paddingHorizontal: 4 }}>
      {/* Privacy notice */}
      <View style={{ backgroundColor: '#5B9BF515', borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <MaterialCommunityIcons name="lock-outline" size={18} color="#5B9BF5" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#5B9BF5', marginBottom: 2 }}>Your data is private</Text>
          <Text style={{ fontSize: 11, color: COLORS.text.secondary, lineHeight: 16 }}>
            Medical documents are encrypted and only used by the AI to personalize your program. Never shared or sold.
          </Text>
        </View>
      </View>

      {/* Upload area */}
      <View style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: medicalFiles.length > 0 ? '#FF6B6B' : COLORS.border, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center', marginBottom: SPACING.lg }}>
        <MaterialCommunityIcons name="hospital-box-outline" size={40} color={COLORS.text.muted} />
        <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text.primary, marginTop: SPACING.sm }}>Upload medical documents</Text>
        <Text style={{ fontSize: 12, color: COLORS.text.muted, textAlign: 'center', marginTop: 4 }}>X-rays, MRIs, doctor's notes, PT reports</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: SPACING.lg }}>
          <TouchableOpacity onPress={() => pickImage('medical', 'camera')} style={{ backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialCommunityIcons name="camera" size={16} color={COLORS.text.primary} />
            <Text style={{ fontSize: 12, color: COLORS.text.primary, fontWeight: '600' }}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => pickDocument('medical')} style={{ backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialCommunityIcons name="file-document-outline" size={16} color={COLORS.text.primary} />
            <Text style={{ fontSize: 12, color: COLORS.text.primary, fontWeight: '600' }}>Files</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => pickImage('medical', 'library')} style={{ backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialCommunityIcons name="image-outline" size={16} color={COLORS.text.primary} />
            <Text style={{ fontSize: 12, color: COLORS.text.primary, fontWeight: '600' }}>Photos</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Uploaded files list */}
      {medicalFiles.length > 0 && (
        <View style={{ marginBottom: SPACING.md }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.text.muted, letterSpacing: 1.5, marginBottom: 8 }}>UPLOADED ({medicalFiles.length})</Text>
          {medicalFiles.map((f, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.surface, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border }}>
              <MaterialCommunityIcons name={f.type.includes('pdf') ? 'file-pdf-box' : 'image'} size={24} color="#FF6B6B" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text.primary }} numberOfLines={1}>{f.name}</Text>
                <Text style={{ fontSize: 11, color: '#4DCEA6' }}>🔒 Encrypted</Text>
              </View>
              <TouchableOpacity onPress={() => setMedicalFiles(prev => prev.filter((_, idx) => idx !== i))}>
                <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.text.muted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  // Current Program step (optional) — with file upload
  const renderProgramStep = () => (
    <View style={{ paddingHorizontal: 4 }}>
      {!programMode && (
        <View style={{ gap: 10 }}>
          <TouchableOpacity onPress={() => setProgramMode('upload')} style={{ backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }} activeOpacity={0.8}>
            <MaterialCommunityIcons name="file-upload-outline" size={28} color={COLORS.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text.primary }}>Upload Program Files</Text>
              <Text style={{ fontSize: 12, color: COLORS.text.secondary, marginTop: 2 }}>Photos, PDFs, spreadsheets of your current routine</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setProgramMode('type')} style={{ backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }} activeOpacity={0.8}>
            <MaterialCommunityIcons name="keyboard-outline" size={28} color={COLORS.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text.primary }}>Type / Paste It</Text>
              <Text style={{ fontSize: 12, color: COLORS.text.secondary, marginTop: 2 }}>Describe your current split in your own words</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setProgramMode('skip')} style={{ backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }} activeOpacity={0.8}>
            <MaterialCommunityIcons name="auto-fix" size={28} color={COLORS.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text.primary }}>Start Fresh with AI</Text>
              <Text style={{ fontSize: 12, color: COLORS.text.secondary, marginTop: 2 }}>No existing program — build one from scratch</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {programMode === 'upload' && (
        <View>
          <View style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: programFiles.length > 0 ? COLORS.accent : COLORS.border, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center', marginBottom: SPACING.lg }}>
            <MaterialCommunityIcons name="file-plus-outline" size={40} color={COLORS.text.muted} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text.primary, marginTop: SPACING.sm }}>Upload your workout program</Text>
            <Text style={{ fontSize: 12, color: COLORS.text.muted, textAlign: 'center', marginTop: 4 }}>PDF, images, Excel, screenshots — anything with your program</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: SPACING.lg }}>
              <TouchableOpacity onPress={() => pickImage('program', 'camera')} style={{ backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons name="camera" size={16} color={COLORS.text.primary} />
                <Text style={{ fontSize: 12, color: COLORS.text.primary, fontWeight: '600' }}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => pickDocument('program')} style={{ backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons name="file-document-outline" size={16} color={COLORS.text.primary} />
                <Text style={{ fontSize: 12, color: COLORS.text.primary, fontWeight: '600' }}>Files</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => pickImage('program', 'library')} style={{ backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons name="image-outline" size={16} color={COLORS.text.primary} />
                <Text style={{ fontSize: 12, color: COLORS.text.primary, fontWeight: '600' }}>Photos</Text>
              </TouchableOpacity>
            </View>
          </View>

          {programFiles.length > 0 && (
            <View style={{ marginBottom: SPACING.md }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.text.muted, letterSpacing: 1.5, marginBottom: 8 }}>UPLOADED ({programFiles.length})</Text>
              {programFiles.map((f, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.surface, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border }}>
                  <MaterialCommunityIcons name={f.type.includes('pdf') ? 'file-pdf-box' : f.type.includes('image') ? 'image' : 'file-excel-box'} size={24} color={COLORS.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text.primary }} numberOfLines={1}>{f.name}</Text>
                    <Text style={{ fontSize: 11, color: '#4DCEA6' }}>Ready to analyze</Text>
                  </View>
                  <TouchableOpacity onPress={() => setProgramFiles(prev => prev.filter((_, idx) => idx !== i))}>
                    <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.text.muted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={() => { setProgramMode(null); setProgramFiles([]); }} style={{ flex: 1, padding: 14, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, alignItems: 'center' }}>
              <Text style={{ color: COLORS.text.secondary, fontSize: 14, fontWeight: '600' }}>Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {programMode === 'type' && (
        <View>
          <TextInput
            style={{ backgroundColor: '#1A1A1E', borderWidth: 1.5, borderColor: currentProgram.trim() ? COLORS.accent : COLORS.border, borderRadius: RADIUS.lg, padding: SPACING.lg, fontSize: 15, color: COLORS.text.primary, minHeight: 160, textAlignVertical: 'top', lineHeight: 22 }}
            value={currentProgram}
            onChangeText={setCurrentProgram}
            placeholder={"Monday: Squat 5x5, RDL 3x10, Leg Press 3x12\nTuesday: Bench 5x5, OHP 3x8, Rows 4x10\nThursday: Deadlift 3x3, Front Squat 3x8\nFriday: Incline Press 4x8, Pull-ups 4x8"}
            placeholderTextColor={COLORS.text.muted + '80'}
            multiline
            autoFocus
            autoCorrect={false}
          />
          <Text style={{ fontSize: 12, color: COLORS.text.muted, marginTop: SPACING.sm, textAlign: 'center' }}>
            Include exercises, sets, reps, and which days
          </Text>
          <TouchableOpacity onPress={() => setProgramMode(null)} style={{ marginTop: SPACING.md, padding: 14, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, alignItems: 'center' }}>
            <Text style={{ color: COLORS.text.secondary, fontSize: 14, fontWeight: '600' }}>Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {programMode === 'skip' && (
        <View style={{ alignItems: 'center', padding: 30 }}>
          <MaterialCommunityIcons name="auto-fix" size={48} color={COLORS.accent} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text.primary, marginTop: SPACING.md }}>We'll build your program from scratch</Text>
          <Text style={{ fontSize: 13, color: COLORS.text.secondary, marginTop: 8, textAlign: 'center' }}>Based on your goals, experience, and schedule</Text>
        </View>
      )}
    </View>
  );

  // Step 10 — Gym types + Competition
  const renderStep10 = () => (
    <View style={{ gap: SPACING.xl }}>
      {/* Gym type */}
      <View>
        <Text style={s.sectionLabel}>Training environment</Text>
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
      </View>

      {/* Competition */}
      <View>
        <Text style={s.sectionLabel}>Competition calendar</Text>
        <View style={s.compToggleRow}>
          {[{ label: 'Yes, I compete', value: true }, { label: 'No competition', value: false }].map(({ label, value }) => (
            <TouchableOpacity
              key={String(value)}
              style={[s.compToggleBtn, hasCompetition === value && s.compToggleBtnActive]}
              onPress={() => { haptic(); setHasCompetition(value); }}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name={value ? 'trophy-outline' : 'calendar-remove-outline'}
                size={18}
                color={hasCompetition === value ? COLORS.primary : COLORS.accent}
              />
              <Text style={[s.compToggleTxt, hasCompetition === value && s.pillTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {hasCompetition === true && (
          <View style={{ gap: SPACING.md, marginTop: SPACING.md }}>
            <Text style={s.bwLabel}>Competition type</Text>
            <View style={s.chipWrap}>
              {COMPETITION_TYPES.map(({ label, icon }) => {
                const active = competitionType === label;
                return (
                  <TouchableOpacity
                    key={label}
                    style={[s.chip, active && s.pillActive]}
                    onPress={() => { haptic(); setCompetitionType(label); }}
                    activeOpacity={0.8}
                  >
                    {active && (
                      <MaterialCommunityIcons name="check" size={12} color={COLORS.primary} style={{ marginRight: 4 }} />
                    )}
                    <Text style={[s.chipText, active && s.pillTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[s.bwLabel, { marginTop: SPACING.sm }]}>Target competition date</Text>
            <View style={s.liftRow}>
              <MaterialCommunityIcons name="calendar-month-outline" size={18} color={COLORS.accent} />
              <TextInput
                style={[s.liftInput, { flex: 1, width: undefined, marginLeft: SPACING.sm }]}
                value={competitionDate}
                onChangeText={setCompetitionDate}
                placeholder="e.g. November 2025"
                placeholderTextColor={COLORS.text.muted}
                returnKeyType="done"
              />
            </View>
          </View>
        )}
      </View>
    </View>
  );

  // ── Free mode: combined Name + Experience step ───────────────────────────
  const renderFreeStep1 = () => (
    <View>
      {/* Name */}
      {renderNameStep()}
      {/* Experience — shown right below name in free mode */}
      <Text style={[s.stepLabel, { marginTop: 28, marginBottom: 8 }]}>Experience level</Text>
      {renderStep2()}
    </View>
  );

  const renderContent = () => {
    if (isFreeMode) {
      switch (step) {
        case 1: return renderFreeStep1();    // Name + Experience
        case 2: return renderStep4();        // Bodyweight + units
        case 3: return renderStep8();        // Injuries
        default: return null;
      }
    }
    switch (step) {
      case 1:  return renderNameStep();
      case 2:  return renderStep1();
      case 3:  return renderStep2();
      case 4:  return renderStep3();
      case 5:  return renderStep4();
      case 6:  return renderStep5();
      case 7:  return renderStep6();
      case 8:  return renderStep7();
      case 9:  return renderStep8();
      case 10: return renderMedicalStep();
      case 11: return renderStep9();
      case 12: return renderProgramStep();
      case 13: return renderStep10();
      default: return null;
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const meta       = isFreeMode ? { title: ['Set up your profile', 'Body weight', 'Injuries'][step - 1] || '' } : STEP_META[step - 1];
  const isLastStep = step === _totalSteps;
  const active     = canContinue();

  return (
    <SafeAreaView style={s.safe}>
        {/* ── Top bar ── */}
        <View style={s.topBar}>
          {step > 1 ? (
            <TouchableOpacity style={s.topBtn} onPress={goBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text.secondary} />
            </TouchableOpacity>
          ) : (
            <View style={s.topBtn} />
          )}

          <View style={s.dotsRow}>
            {Array.from({ length: _totalSteps }, (_, i) => {
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

          {meta.canSkip ? (
            <TouchableOpacity style={[s.topBtn, s.topBtnRight]} onPress={goSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.skipText}>Skip</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.topBtn} />
          )}
        </View>

        {/* ── Scrollable content ── */}
        {/* ── Rebuild mode banner ── */}
        {isRebuildMode && (
          <View style={s.rebuildBanner}>
            <MaterialCommunityIcons name="update" size={13} color={COLORS.accent} />
            <Text style={s.rebuildBannerText}>REBUILD MODE — history &amp; logs are safe</Text>
          </View>
        )}
        {/* ── Free mode banner ── */}
        {isFreeMode && (
          <View style={[s.rebuildBanner, { backgroundColor: 'rgba(42,157,143,0.06)', borderBottomColor: 'rgba(42,157,143,0.18)' }]}>
            <MaterialCommunityIcons name="notebook-outline" size={13} color="#2A9D8F" />
            <Text style={[s.rebuildBannerText, { color: '#2A9D8F' }]}>FREE TRAINING — no plan generated</Text>
          </View>
        )}
        <Animated.View style={[s.contentWrap, { opacity: containerFade }]}>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            keyboardDismissMode="on-drag"
            contentInset={{ bottom: 120 }}
          >
            <Animated.View style={{ opacity: greetFade, transform: [{ translateY: greetSlide }] }}>
              <Text style={s.greeting}>{meta.greeting}</Text>
            </Animated.View>

            <Animated.View style={{ opacity: qFade, transform: [{ translateY: qSlide }], marginBottom: SPACING.xl }}>
              <Text style={s.question}>{meta.question}</Text>
              {meta.subtext ? <Text style={s.subtext}>{meta.subtext}</Text> : null}
            </Animated.View>

            <Animated.View style={{ opacity: oFade, transform: [{ translateY: oSlide }] }}>
              {renderContent()}
            </Animated.View>

            <View style={{ height: 120 }} />
          </ScrollView>
        </Animated.View>

        {/* ── Footer ── */}
        <View style={s.footer}>
          <TouchableOpacity
            style={[s.ctaBtn, active && isLastStep && s.ctaBtnFinal, !active && s.ctaBtnOff]}
            onPress={goNext}
            disabled={saving || !active}
            activeOpacity={0.88}
          >
            {saving ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <>
                <Text style={[s.ctaText, !active && s.ctaTextOff]}>
                  {isLastStep
                    ? (isRebuildMode ? 'Rebuild My Program' : isFreeMode ? 'Done' : 'Build My Program')
                    : (isFreeMode && step === _totalSteps - 1 ? 'Almost done' : 'Continue')}
                </Text>
                {(active || isLastStep) && (
                  <MaterialCommunityIcons
                    name={isLastStep ? 'rocket-launch-outline' : 'arrow-right'}
                    size={18}
                    color={isLastStep ? '#0D0D0D' : COLORS.primary}
                    style={{ marginLeft: 6 }}
                  />
                )}
              </>
            )}
          </TouchableOpacity>
          <Text style={s.stepCounter}>{step} of {_totalSteps}</Text>
        </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const BG = '#0A0A0C';

const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: BG },
  contentWrap:   { flex: 1 },
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.xxl },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  topBtn:      { width: 44, height: 44, justifyContent: 'center' },
  topBtnRight: { alignItems: 'flex-end' },
  skipText:    { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, fontWeight: FONTS.weights.medium },

  dotsRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: '#252528' },
  dotDone:   { backgroundColor: COLORS.accent },
  dotActive: { width: 18, height: 6, borderRadius: 3, backgroundColor: COLORS.accent },

  greeting: {
    fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.accent,
    letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: SPACING.md,
  },
  question: {
    fontSize: FONTS.sizes.hero, fontWeight: FONTS.weights.heavy,
    color: COLORS.text.primary, lineHeight: 42, marginBottom: SPACING.sm,
  },
  subtext: { fontSize: FONTS.sizes.base, color: COLORS.text.muted, lineHeight: 22 },

  pillActive:     { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  pillTextActive: { color: COLORS.primary, fontWeight: FONTS.weights.heavy },

  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  goalPill: {
    width: '47.5%', backgroundColor: '#161618', borderRadius: 18, padding: SPACING.lg,
    alignItems: 'center', gap: SPACING.sm, borderWidth: 1.5, borderColor: '#2A2A2E',
    minHeight: 96, justifyContent: 'center',
  },
  goalPillText: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.text.secondary, textAlign: 'center' },

  expList: { gap: SPACING.sm },
  expPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#161618', borderRadius: 18, padding: SPACING.lg,
    borderWidth: 1.5, borderColor: '#2A2A2E',
  },
  expLeft:         { gap: 3 },
  expLabel:        { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.primary },
  expDetail:       { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },
  expDetailActive: { color: 'rgba(13,13,13,0.65)' },
  checkCircle: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.18)', justifyContent: 'center', alignItems: 'center',
  },

  unitToggleRow: { marginBottom: SPACING.lg },
  unitToggle: {
    flexDirection: 'row', backgroundColor: '#161618', borderRadius: 12,
    padding: 3, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#2A2A2E',
  },
  unitBtn:           { paddingHorizontal: SPACING.lg, paddingVertical: 8, borderRadius: 9 },
  unitBtnActive:     { backgroundColor: COLORS.accent },
  unitBtnText:       { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.bold, color: COLORS.text.muted },
  unitBtnTextActive: { color: COLORS.primary },

  liftRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#161618',
    borderRadius: 16, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    marginBottom: SPACING.sm, borderWidth: 1, borderColor: '#2A2A2E',
  },
  liftLabel:    { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, fontWeight: FONTS.weights.medium },
  liftRight:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liftInput: {
    width: 88, height: 48, backgroundColor: '#242428', borderRadius: 12,
    textAlign: 'center', fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy,
    color: COLORS.accent, borderWidth: 1.5, borderColor: COLORS.accent,
  },
  liftUnitText: { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, width: 30 },
  liftDivider: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginVertical: SPACING.md },
  liftDividerLine: { flex: 1, height: 1, backgroundColor: '#2A2A2E' },
  liftDividerText: { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontWeight: FONTS.weights.bold, letterSpacing: 1.5, textTransform: 'uppercase' },

  bwRow:        { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  bwLabel:      { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontWeight: FONTS.weights.bold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm },
  bwInputWrap:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#161618', borderRadius: 16, borderWidth: 1.5, borderColor: '#2A2A2E', paddingHorizontal: SPACING.md, height: 56 },
  bwInput: { flex: 1, fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.accent, textAlign: 'center' },
  bwInputSecondary: { color: COLORS.text.secondary },
  bwUnit:       { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, marginLeft: 4 },
  bwNote: { flexDirection: 'row', gap: SPACING.sm, backgroundColor: 'rgba(201,168,76,0.06)', borderRadius: 12, padding: SPACING.md, borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)', alignItems: 'flex-start' },
  bwNoteText: { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.text.muted, lineHeight: 18 },

  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  dayCard: {
    width: '47.5%', backgroundColor: '#161618', borderRadius: 22, padding: SPACING.xl,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#2A2A2E', minHeight: 130, justifyContent: 'center', position: 'relative',
  },
  dayCardActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  dayCheck: {
    position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'center', alignItems: 'center',
  },
  dayNum:        { fontSize: 52, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 58 },
  dayNumActive:  { color: COLORS.primary },
  dayWord:       { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, letterSpacing: 0.3 },
  dayWordActive: { color: 'rgba(13,13,13,0.65)' },
  dayDesc:       { fontSize: 10, color: COLORS.text.muted, textAlign: 'center', marginTop: 5 },
  dayDescActive: { color: 'rgba(13,13,13,0.55)' },

  // Day picker — which specific days of the week
  dayPickerSection:    { marginTop: SPACING.lg, backgroundColor: '#161618', borderWidth: 1.5, borderColor: '#2A2A2E', borderRadius: 18, padding: SPACING.md },
  dayPickerHeader:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: 4 },
  dayPickerTitle:      { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, flex: 1 },
  dayPickerBadge:      { backgroundColor: COLORS.accent + '22', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  dayPickerBadgeTxt:   { fontSize: 11, color: COLORS.accent, fontWeight: FONTS.weights.bold },
  dayPickerSub:        { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginBottom: SPACING.md, lineHeight: 18 },
  dayPickerRow:        { flexDirection: 'row', justifyContent: 'space-between', gap: 5 },
  dayPill:             { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12, backgroundColor: '#0D0D0D', borderWidth: 1.5, borderColor: '#2A2A2E' },
  dayPillActive:       { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  dayPillText:         { fontSize: 11, fontWeight: FONTS.weights.semibold, color: COLORS.text.muted },
  dayPillTextActive:   { color: COLORS.primary },
  dayPickerHint:       { marginTop: SPACING.sm, fontSize: FONTS.sizes.xs, color: COLORS.text.muted, textAlign: 'center' },
  dayPickerConfirmed:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm },
  dayPickerConfirmedTxt: { fontSize: FONTS.sizes.xs, color: '#4CAF50', fontWeight: FONTS.weights.medium, flex: 1 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: 10,
    borderRadius: 100, backgroundColor: '#161618',
    borderWidth: 1.5, borderColor: '#2A2A2E',
  },
  chipText: { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, fontWeight: FONTS.weights.medium },
  noneChip:       { borderColor: '#3A3A3E' },
  noneChipActive: { backgroundColor: 'rgba(76,175,80,0.12)', borderColor: COLORS.status.success },
  noneChipText:   { color: COLORS.status.success },

  sectionLabel: {
    fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, color: COLORS.accent,
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: SPACING.sm,
  },

  sleepRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  sleepChip: {
    paddingHorizontal: SPACING.md, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#161618', borderWidth: 1.5, borderColor: '#2A2A2E',
  },
  sleepChipText: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.text.secondary },

  recoveryCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: '#161618', borderRadius: 16, padding: SPACING.lg,
    borderWidth: 1.5, borderColor: '#2A2A2E',
  },
  recoveryCardActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  recoveryCardLabel:  { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.primary },
  recoveryCardDetail: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 2 },
  recoveryCardDetailActive: { color: 'rgba(13,13,13,0.6)' },

  compToggleRow: { flexDirection: 'row', gap: SPACING.sm },
  compToggleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#161618', borderRadius: 16, paddingVertical: SPACING.lg,
    borderWidth: 1.5, borderColor: '#2A2A2E',
  },
  compToggleBtnActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  compToggleTxt: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.text.secondary },

  uploadZone: {
    borderWidth: 2, borderColor: COLORS.accent, borderStyle: 'dashed', borderRadius: 22,
    paddingVertical: SPACING.xxl + 8, alignItems: 'center', gap: SPACING.md,
    backgroundColor: 'rgba(201,168,76,0.03)', marginBottom: SPACING.lg,
  },
  uploadZoneDone:    { borderColor: COLORS.status.success, backgroundColor: 'rgba(76,175,80,0.03)' },
  uploadIconRing:    { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(201,168,76,0.07)', justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  uploadIconRingDone:{ backgroundColor: 'rgba(76,175,80,0.07)' },
  uploadTitle:       { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.primary },
  uploadSub:         { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },
  uploadOptRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center' },
  uploadOptText:     { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, fontStyle: 'italic' },

  footer:     { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.lg, gap: SPACING.sm },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.accent, borderRadius: 16, paddingVertical: 17, gap: 4,
  },
  ctaBtnFinal: {
    backgroundColor: COLORS.accent, shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  ctaBtnOff:    { backgroundColor: '#1E1E22' },
  ctaText:      { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.primary, letterSpacing: 0.5 },
  ctaTextOff:   { color: COLORS.text.muted },
  stepCounter:  { textAlign: 'center', fontSize: FONTS.sizes.sm, color: COLORS.text.muted },

  // Rebuild mode banner
  rebuildBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(201,168,76,0.07)', borderBottomWidth: 1,
    borderBottomColor: 'rgba(201,168,76,0.18)', paddingVertical: 9,
  },
  rebuildBannerText: {
    fontSize: 11, color: COLORS.accent, fontWeight: FONTS.weights.bold as any,
    letterSpacing: 1.2, textTransform: 'uppercase',
  },
});
