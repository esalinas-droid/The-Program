// ─── Library Data — Exercise Library, Warm-Ups, Quick Cues ──────────────────

export type MovementPattern = 'Push' | 'Pull' | 'Hinge' | 'Squat' | 'Carry' | 'Isolation';
export type ExerciseCategory = 'Upper Body' | 'Lower Body' | 'Core' | 'Carries' | 'Conditioning';
export type SubstitutionKey = 'pain' | 'equipment' | 'travel';

export interface Substitution {
  name: string;
  reason: string;
}

export interface Exercise {
  id: string;
  name: string;
  muscles: string;
  equipment: string;
  pattern: MovementPattern;
  category: ExerciseCategory;
  coachingCues: string[];
  commonMistakes: string[];
  substitutions: Record<SubstitutionKey, Substitution[]>;
  primaryMuscles: string[];
  secondaryMuscles: string[];
}

export const EXERCISES: Exercise[] = [
  {
    id: 'floor-press',
    name: 'Floor Press',
    muscles: 'Chest, Triceps',
    equipment: 'Barbell',
    pattern: 'Push',
    category: 'Upper Body',
    coachingCues: [
      'Pin shoulder blades into the floor — stay tight throughout',
      'Drive through the triceps hard at lockout',
      'Touch elbows to floor to reset tension between reps',
      'Slight upper back arch — maintain tightness, not excess',
      'Full grip, thumbs wrapped — white-knuckle the bar',
    ],
    commonMistakes: [
      'Losing shoulder retraction mid-set — results in pec-dominant failure',
      'Bouncing elbows off the floor for momentum',
      'Letting the lats go loose — stay engaged throughout',
    ],
    substitutions: {
      pain: [
        { name: 'DB Floor Press', reason: 'Neutral grip option reduces shoulder impingement risk' },
        { name: 'Cable Fly', reason: 'Removes compressive load from the shoulder capsule' },
        { name: 'Machine Chest Press', reason: 'Fixed path reduces instability stress' },
      ],
      equipment: [
        { name: 'DB Floor Press', reason: 'Same position and pattern with dumbbells' },
        { name: 'Push-ups', reason: 'No equipment — elevate feet to increase load' },
        { name: 'Landmine Press', reason: 'Requires only a barbell and wall anchor' },
      ],
      travel: [
        { name: 'Floor Push-up', reason: 'Zero equipment, same horizontal push pattern' },
        { name: 'Pike Push-up', reason: 'Shifts load toward upper chest and delts' },
        { name: 'Elevated Push-up', reason: 'Use a chair edge for increased range of motion' },
      ],
    },
    primaryMuscles: ['Pectoralis Major', 'Triceps Brachii'],
    secondaryMuscles: ['Anterior Deltoid', 'Serratus Anterior'],
  },
  {
    id: 'ssb-squat',
    name: 'SSB Squat',
    muscles: 'Quads, Upper Back',
    equipment: 'Safety Squat Bar',
    pattern: 'Squat',
    category: 'Lower Body',
    coachingCues: [
      'Push the camber handles FORWARD — this counters the bar\'s pull',
      'Stay tall and upright — the SSB demands more upper back',
      'Drive knees out aggressively in the hole',
      'Brace before descent, maintain through lockout',
      'Keep eyes neutral — don\'t look up excessively',
    ],
    commonMistakes: [
      'Good-morning-ing the weight when fatigued',
      'Forgetting to push handles forward — the bar takes over',
      'Excessive forward lean beyond what the bar naturally demands',
    ],
    substitutions: {
      pain: [
        { name: 'Goblet Squat', reason: 'Removes shoulder and wrist stress completely' },
        { name: 'Belt Squat', reason: 'Zero axial loading — spine fully deloaded' },
        { name: 'Leg Press', reason: 'Machine support removes spinal compression' },
      ],
      equipment: [
        { name: 'High Bar Back Squat', reason: 'Most similar upright torso demand' },
        { name: 'Front Squat', reason: 'Forces the same forward handle push pattern' },
        { name: 'Goblet Squat', reason: 'Accessible, similar movement quality' },
      ],
      travel: [
        { name: 'Goblet Squat with DB', reason: 'Mimics the upright torso demand of SSB' },
        { name: 'Bulgarian Split Squat', reason: 'Heavy unilateral quad loading anywhere' },
        { name: 'Pause Air Squat', reason: 'Bodyweight with a 3-sec pause in the hole' },
      ],
    },
    primaryMuscles: ['Quadriceps', 'Glutes'],
    secondaryMuscles: ['Upper Back', 'Core', 'Hamstrings'],
  },
  {
    id: 'pendlay-row',
    name: 'Pendlay Row',
    muscles: 'Lats, Upper Back',
    equipment: 'Barbell',
    pattern: 'Pull',
    category: 'Upper Body',
    coachingCues: [
      'Bar returns dead to the floor between every rep — reset is mandatory',
      'Pull to lower chest — not the belly button',
      'Back flat and horizontal to the floor before you pull',
      'Lead with the elbows, not the biceps',
      'Explosive on the pull, controlled on the negative',
    ],
    commonMistakes: [
      'Turning it into a bent-over row — no floor contact defeats the purpose',
      'Jerking the hips to assist the pull — that\'s hip-hinge momentum, not back strength',
      'Rounding the lumbar spine under heavy load',
    ],
    substitutions: {
      pain: [
        { name: 'Chest-Supported Row', reason: 'Removes all lower back demand from the equation' },
        { name: 'Cable Seated Row', reason: 'Constant tension, no spinal hinge required' },
        { name: 'Incline DB Row', reason: 'Chest supported, true horizontal pull' },
      ],
      equipment: [
        { name: 'DB Row', reason: 'Same pull pattern, unilateral loading' },
        { name: 'Barbell Bent-Over Row', reason: 'Remove the reset — continuous tension version' },
        { name: 'Band Row', reason: 'Resistance band anchored to post or door' },
      ],
      travel: [
        { name: 'TRX Row', reason: 'Bodyweight horizontal pull — excellent substitute' },
        { name: 'Hotel Door Row', reason: 'Towel around door handle — sit back and pull' },
        { name: 'Single-Arm DB Row', reason: 'Any available weight works' },
      ],
    },
    primaryMuscles: ['Latissimus Dorsi', 'Rhomboids', 'Mid Trapezius'],
    secondaryMuscles: ['Biceps Brachii', 'Rear Deltoid', 'Erector Spinae'],
  },
  {
    id: 'incline-db-press',
    name: 'Incline DB Press',
    muscles: 'Upper Chest, Delts',
    equipment: 'Dumbbells',
    pattern: 'Push',
    category: 'Upper Body',
    coachingCues: [
      'Set bench at 30-45° max — higher angles shift load to delts',
      'Touch DBs at the top, lower with full control',
      'Full stretch at the bottom — let the pecs load completely',
      'Elbows at 45° from torso — not flared, not fully tucked',
      'Initiate with the chest, finish the lockout with triceps',
    ],
    commonMistakes: [
      'Bench angle too high — becomes a shoulder press, not a chest movement',
      'Flaring elbows excessively — creates impingement risk over time',
      'Cutting the range of motion short at the bottom',
    ],
    substitutions: {
      pain: [
        { name: 'Cable Incline Press', reason: 'Constant tension, adjustable angle, less stress' },
        { name: 'Low Incline Push-up', reason: 'Controlled bodyweight option, same angle' },
        { name: 'Pec Deck (High Position)', reason: 'Pure isolation without joint loading' },
      ],
      equipment: [
        { name: 'Incline Barbell Press', reason: 'Same angle and pattern with a barbell' },
        { name: 'Incline Push-up', reason: 'No equipment needed' },
        { name: 'Cable Cross-Over High', reason: 'Upper chest isolation with cables' },
      ],
      travel: [
        { name: 'Feet-Elevated Push-up', reason: 'Use bed edge for the natural incline angle' },
        { name: 'Pike Push-up', reason: 'Higher shoulder demand variation' },
        { name: 'Chair-Elevated Push-up', reason: 'Any sturdy surface creates the angle' },
      ],
    },
    primaryMuscles: ['Upper Pectoralis Major', 'Anterior Deltoid'],
    secondaryMuscles: ['Triceps Brachii', 'Serratus Anterior'],
  },
  {
    id: 'ghr',
    name: 'GHR',
    muscles: 'Hamstrings, Glutes',
    equipment: 'GHR Machine',
    pattern: 'Hinge',
    category: 'Lower Body',
    coachingCues: [
      'Start at full hip extension — lock the hips before moving',
      'Curl your body upward using pure hamstring contraction',
      'Chin should touch the pad at the top of the rep',
      'Slow, deliberate negative — you\'re training the eccentric too',
      'Keep hips neutral throughout — no rotation',
    ],
    commonMistakes: [
      'Not achieving full hip extension at the start position',
      'Using arms to push off and assist the concentric',
      'Hyperextending the lumbar spine at the top',
    ],
    substitutions: {
      pain: [
        { name: 'Nordic Curl', reason: 'Similar eccentric demand with lower load ceiling' },
        { name: 'Seated Leg Curl', reason: 'Hamstring isolation without spinal involvement' },
        { name: 'Swiss Ball Curl', reason: 'Low load hip extension variation' },
      ],
      equipment: [
        { name: 'Nordic Curl', reason: 'Anchor feet under barbell or rack' },
        { name: 'Romanian Deadlift', reason: 'Hip hinge with high hamstring demand' },
        { name: 'Single-Leg Hip Bridge', reason: 'Bridges the pattern with bodyweight' },
      ],
      travel: [
        { name: 'Nordic Curl with Door', reason: 'Anchor feet under a secured door' },
        { name: 'Single-Leg Hip Bridge', reason: 'Bodyweight, zero equipment needed' },
        { name: 'Single-Leg RDL', reason: 'Bodyweight hamstring hinge anywhere' },
      ],
    },
    primaryMuscles: ['Hamstrings', 'Glutes'],
    secondaryMuscles: ['Gastrocnemius', 'Lower Back'],
  },
  {
    id: 'face-pull',
    name: 'Face Pull',
    muscles: 'Rear Delts, Rotator Cuff',
    equipment: 'Cable',
    pattern: 'Pull',
    category: 'Upper Body',
    coachingCues: [
      'Rope attachment at forehead height or above — not chin height',
      'Pull to forehead — not chin or neck',
      'Externally rotate at the finish — think "double bicep pose"',
      'Elbows at or above shoulder height throughout',
      'Control the eccentric — don\'t let it snap back',
    ],
    commonMistakes: [
      'Using too much weight — form breaks down immediately',
      'Pulling to the chin or neck instead of face level',
      'Skipping the external rotation — that\'s where the value lives',
    ],
    substitutions: {
      pain: [
        { name: 'Band Pull-Apart', reason: 'Low load, targets the exact same muscles' },
        { name: 'DB Rear Delt Fly', reason: 'No cable needed, full control over load' },
        { name: 'Prone T/Y/I', reason: 'Bodyweight shoulder health work on the floor' },
      ],
      equipment: [
        { name: 'Band Face Pull', reason: 'Same pattern using a resistance band' },
        { name: 'Seated DB Rear Delt Fly', reason: 'No cable machine required' },
        { name: 'Band Pull-Apart', reason: 'Simplest rear delt work anywhere' },
      ],
      travel: [
        { name: 'Band Pull-Apart', reason: 'Fits in any gym bag — use daily' },
        { name: 'Prone T/Y/I', reason: 'Hotel room floor, zero equipment' },
        { name: 'Wall Slide', reason: 'Scapular upward rotation on any wall' },
      ],
    },
    primaryMuscles: ['Posterior Deltoid', 'External Rotators (Rotator Cuff)'],
    secondaryMuscles: ['Mid Trapezius', 'Rhomboids'],
  },
  {
    id: 'speed-bench',
    name: 'Speed Bench',
    muscles: 'Chest, Triceps, Lats',
    equipment: 'Barbell',
    pattern: 'Push',
    category: 'Upper Body',
    coachingCues: [
      'Load at 50-60% 1RM — heavier completely defeats the purpose',
      'Compensatory acceleration: intent to move the bar FAST every rep',
      'Full setup on every single rep — no slipping between reps',
      'Pull the bar apart for lat and chest pre-tension',
      'Touch and drive — controlled down, explosive up',
    ],
    commonMistakes: [
      'Going too heavy — this is speed work, not max effort work',
      'Slow controlled eccentric is wrong here — still controlled but faster',
      'Losing tightness between sets or relaxing during rest',
    ],
    substitutions: {
      pain: [
        { name: 'Speed DB Press', reason: 'Less shoulder stress with neutral grip option' },
        { name: 'Banded Push-up', reason: 'Speed intent with resistance band for load' },
        { name: 'Med Ball Chest Throw', reason: 'Explosive power without joint loading' },
      ],
      equipment: [
        { name: 'Speed DB Press', reason: 'Same speed focus, just with dumbbells' },
        { name: 'Clap Push-up', reason: 'Explosive bodyweight power development' },
        { name: 'Med Ball Pass', reason: 'If available — builds explosive upper body power' },
      ],
      travel: [
        { name: 'Explosive Push-up', reason: 'Leave the floor on every single rep' },
        { name: 'Clap Push-up', reason: 'Max power output bodyweight option' },
        { name: 'Banded Push-up', reason: 'Band around the back for added resistance' },
      ],
    },
    primaryMuscles: ['Pectoralis Major', 'Triceps Brachii'],
    secondaryMuscles: ['Anterior Deltoid', 'Latissimus Dorsi'],
  },
  {
    id: 'rdl',
    name: 'Romanian Deadlift',
    muscles: 'Hamstrings, Glutes',
    equipment: 'Barbell',
    pattern: 'Hinge',
    category: 'Lower Body',
    coachingCues: [
      'Proud chest, proud belly before you break from the hips',
      'Bar stays touching legs throughout — graze the shins all the way down',
      'Soft knee bend — don\'t lock out or let it turn into a squat',
      'Chase the hamstring stretch, not max depth — stop when back rounds',
      'Drive hips forward at the top — glutes finish the lift',
    ],
    commonMistakes: [
      'Bending the knees too much — turns it into a partial squat',
      'Dropping the chest — losing the proud chest position at depth',
      'Bar drifting away from the body mid-rep',
    ],
    substitutions: {
      pain: [
        { name: 'Trap Bar RDL', reason: 'Neutral grip reduces spinal and shoulder stress' },
        { name: 'KB Swing', reason: 'Hip hinge pattern with back-friendly loading' },
        { name: 'Hip Hinge to Box', reason: 'Limits depth to reduce hamstring stress' },
      ],
      equipment: [
        { name: 'DB Romanian Deadlift', reason: 'Same pattern, dumbbells instead of bar' },
        { name: 'KB Romanian Deadlift', reason: 'Kettlebell version — same mechanics' },
        { name: 'Single-Leg RDL', reason: 'Unilateral version with any available implement' },
      ],
      travel: [
        { name: 'Single-Leg RDL', reason: 'Bodyweight, balance-intensive version' },
        { name: 'Band-Resisted Hip Hinge', reason: 'Anchor band to a post or door' },
        { name: 'Good Morning', reason: 'Bodyweight or light load hip hinge pattern' },
      ],
    },
    primaryMuscles: ['Hamstrings', 'Glutes'],
    secondaryMuscles: ['Erector Spinae', 'Adductors'],
  },
  {
    id: 'belt-squat',
    name: 'Belt Squat',
    muscles: 'Quads, Glutes, Hips',
    equipment: 'Belt Squat Machine',
    pattern: 'Squat',
    category: 'Lower Body',
    coachingCues: [
      'Let the belt loading pull you naturally down into the squat',
      'Stay completely upright — the machine removes the need to lean',
      'Hit full depth — the machine rewards range of motion',
      'Drive through the entire foot — heel and ball equally',
      'Reset stance and brace every rep if needed',
    ],
    commonMistakes: [
      'Leaning forward out of habit from back squat — not needed here',
      'Stopping at parallel — the machine supports full depth',
      'Not loading heavy enough — treat this like a priority lift',
    ],
    substitutions: {
      pain: [
        { name: 'Goblet Squat', reason: 'Anterior loading with zero axial spinal load' },
        { name: 'Leg Press', reason: 'Machine-based, no spinal compression at all' },
        { name: 'Hack Squat Machine', reason: 'Guided movement, no axial loading' },
      ],
      equipment: [
        { name: 'Goblet Squat', reason: 'Best accessible substitute for belt squat pattern' },
        { name: 'Zercher Squat', reason: 'Front-loaded, forces upright torso naturally' },
        { name: 'Landmine Squat', reason: 'Counterbalance makes upright position easy' },
      ],
      travel: [
        { name: 'Goblet Squat with DB', reason: 'Upright torso, anterior loading pattern' },
        { name: 'Bulgarian Split Squat', reason: 'Unilateral loading, no special equipment' },
        { name: 'Pause Air Squat', reason: '3-5 second pause in the hole for intensity' },
      ],
    },
    primaryMuscles: ['Quadriceps', 'Glutes'],
    secondaryMuscles: ['Hip Flexors', 'Calves'],
  },
  {
    id: 'farmer-carry',
    name: 'Farmer Carry',
    muscles: 'Traps, Forearms, Core',
    equipment: 'Farmer Handles',
    pattern: 'Carry',
    category: 'Carries',
    coachingCues: [
      'Tall spine — chin up, chest proud throughout the carry',
      'Retract AND depress the shoulders — not just retract',
      'Walk with intent — purposeful stride, not a defensive shuffle',
      'Eyes forward, not looking at the ground',
      'Re-brace the core with every step',
    ],
    commonMistakes: [
      'Continuously shrugging during the carry — upper traps take over',
      'Looking down — causes forward lean and posture collapse',
      'Strides too long — short, controlled steps produce better results',
    ],
    substitutions: {
      pain: [
        { name: 'Suitcase Carry', reason: 'Unilateral version reduces bilateral compression' },
        { name: 'DB Farmer Carry', reason: 'Lighter load, accessible option' },
        { name: 'Trap Bar Carry', reason: 'Natural neutral grip, comfortable handles' },
      ],
      equipment: [
        { name: 'DB Farmer Carry', reason: 'Dumbbells work just as well for this pattern' },
        { name: 'Trap Bar Carry', reason: 'Trap bar loaded for weighted carry' },
        { name: 'Loaded Backpack Carry', reason: 'Weighted backpack held in hands' },
      ],
      travel: [
        { name: 'Suitcase Carry', reason: 'Carry your actual heavy hotel bag for distance' },
        { name: 'Goblet Hold Walk', reason: 'DB in goblet position, walk for distance' },
        { name: 'Backpack Carry', reason: 'Fill a backpack and walk with purpose' },
      ],
    },
    primaryMuscles: ['Trapezius', 'Forearm Flexors', 'Core'],
    secondaryMuscles: ['Glutes', 'Calves', 'Shoulder Stabilizers'],
  },
  {
    id: 'sled-push',
    name: 'Sled Push',
    muscles: 'Quads, Glutes, Shoulders',
    equipment: 'Sled',
    pattern: 'Carry',
    category: 'Conditioning',
    coachingCues: [
      'Lean into the sled at 45° — this is the power angle',
      'Drive through the floor on every step — like a sprint push-off',
      'Arms locked out and rigid throughout',
      'Head neutral — don\'t hyperextend the neck upward',
      'Powerful rhythmic leg drive — not short choppy steps',
    ],
    commonMistakes: [
      'Standing too upright — loses the 45° power angle',
      'Arms bending under the load — wastes energy into the arms',
      'Short choppy strides that limit drive length and power',
    ],
    substitutions: {
      pain: [
        { name: 'Stationary Bike', reason: 'Lower body conditioning without impact loading' },
        { name: 'Rower', reason: 'Full body, low-impact conditioning session' },
        { name: 'Ski Erg', reason: 'Upper body conditioning with no leg stress' },
      ],
      equipment: [
        { name: 'Prowler Push (Light)', reason: 'Empty prowler for the same movement pattern' },
        { name: 'Uphill Walk', reason: 'Natural terrain provides resistance' },
        { name: 'Loaded Stair Climb', reason: 'Use stairs as a conditioning implement' },
      ],
      travel: [
        { name: 'Hill Sprint', reason: 'Natural resistance with no equipment at all' },
        { name: 'Stair Climb', reason: 'Hotel stairs are perfect for this' },
        { name: 'Explosive Lunge Walk', reason: 'Power-based bodyweight conditioning' },
      ],
    },
    primaryMuscles: ['Quadriceps', 'Glutes', 'Shoulder Stabilizers'],
    secondaryMuscles: ['Calves', 'Core', 'Triceps'],
  },
  {
    id: 'ab-wheel',
    name: 'Ab Wheel',
    muscles: 'Core, Lats, Shoulders',
    equipment: 'Ab Wheel',
    pattern: 'Isolation',
    category: 'Core',
    coachingCues: [
      'Hollow body position BEFORE you move — create intra-abdominal tension first',
      'Do not allow the lower back to arch at full extension',
      'Pause 1-2 seconds at full extension — resist the urge to rush back',
      'Pull back using your lats — not your lower back or hip flexors',
      'Exhale on the way out, inhale on the way back in',
    ],
    commonMistakes: [
      'Hyperextending the lower back at full extension — dangerous under fatigue',
      'Not bracing before initiation — the back takes all the load',
      'Using momentum to roll back instead of a deliberate lat pull',
    ],
    substitutions: {
      pain: [
        { name: 'Dead Bug', reason: 'Same anti-extension demand, zero lower back risk' },
        { name: 'Plank (RKC Brace)', reason: 'Core stability without any movement stress' },
        { name: 'Pallof Press', reason: 'Anti-rotation core work — very joint-friendly' },
      ],
      equipment: [
        { name: 'Barbell Roll-Out', reason: 'Use barbell with plates as the wheel substitute' },
        { name: 'TRX Fallout', reason: 'Suspension trainer creates the exact same demand' },
        { name: 'Stability Ball Roll-Out', reason: 'Same movement, different implement' },
      ],
      travel: [
        { name: 'Dead Bug', reason: 'Bodyweight anti-extension on any floor' },
        { name: 'Hollow Body Hold', reason: 'Sustained anti-extension isometric hold' },
        { name: 'Plank Reach', reason: 'Plank with alternating arm reach forward' },
      ],
    },
    primaryMuscles: ['Rectus Abdominis', 'Obliques', 'Transverse Abdominis'],
    secondaryMuscles: ['Latissimus Dorsi', 'Hip Flexors'],
  },
];

// ─── Warm-Up Protocols ───────────────────────────────────────────────────────

export interface WarmUpProtocol {
  id: string;
  name: string;
  duration: string;
  icon: string;
  color: string;
  steps: string[];
}

export const WARM_UP_PROTOCOLS: WarmUpProtocol[] = [
  {
    id: 'upper-body',
    name: 'Upper Body Warm-Up',
    duration: '8-10 min',
    icon: 'arm-flex',
    color: '#C9A84C',
    steps: [
      '5 min light cardio — row, bike, or brisk walk to raise core temp',
      '2×10 Band Pull-Aparts — focus on full scapular retraction at the back',
      '2×12 Face Pull (light band) — emphasize external rotation at the finish',
      '2×10 Shoulder CARs each arm — full, slow controlled articular rotations',
      '1×8 Empty bar press in today\'s main pattern — groove the exact movement',
    ],
  },
  {
    id: 'lower-body',
    name: 'Lower Body Warm-Up',
    duration: '10 min',
    icon: 'run-fast',
    color: '#4CAF50',
    steps: [
      '5 min bike or row — blood flow without creating fatigue',
      '2×30s Hip Flexor Stretch (90/90 position each side)',
      '2×10 Glute Bridges — squeeze and hold 1 second at the top',
      '1×10 Air Squats — full depth, pause 2s at the bottom of each rep',
      '1×8 Goblet Squat — light KB, focus on depth and positional quality',
      '2×5 Pause Squat at 40% 1RM — 3-second pause, groove the pattern',
    ],
  },
  {
    id: 'full-body',
    name: 'Full Body Warm-Up',
    duration: '12 min',
    icon: 'human',
    color: '#2E75B6',
    steps: [
      '5 min cardio of choice — row, bike, or jump rope',
      '10 World\'s Greatest Stretch each side — thoracic rotation focus',
      '10 Inchworms with a push-up — full body wakeup sequence',
      '10 Lateral Band Walks each direction — glute activation',
      '10 Band Pull-Aparts — upper back and rear delt activation',
      '10 Hip Hinges to wall — groove posterior chain with feedback',
      '2×5 Empty bar squat + press — connecting lower and upper patterns',
      '1×5 First working weight set — ease in, don\'t max out your opener',
    ],
  },
  {
    id: 'shoulder-prehab',
    name: 'Shoulder Prehab',
    duration: '6 min',
    icon: 'human-handsup',
    color: '#E8C96A',
    steps: [
      '2×15 Band Pull-Apart — horizontal plane, full retraction at the back',
      '2×15 Band External Rotation — elbow pinned to the ribs throughout',
      '2×12 Face Pull (light) — high cable or band, full external rotate',
      '2×10 Prone T/Y/I — slow, hold each position for 1 second',
    ],
  },
  {
    id: 'hip-mobility',
    name: 'Hip Mobility Flow',
    duration: '8 min',
    icon: 'yoga',
    color: '#9B6FDE',
    steps: [
      '2 min Figure-4 stretch each hip — relax into it, breathe deeply',
      '10 Hip 90/90 Rotations — smooth transitions between positions',
      '10 Hip CARs each direction — slow and controlled through full range',
      '10 Lateral Lunge stretch each side — get into the adductor',
      '10 Frog Pumps with a pause — glute activation to finish the flow',
    ],
  },
];

// ─── Quick Cues ──────────────────────────────────────────────────────────────

export interface QuickCue {
  cue: string;
  exercise: string;
}

export const QUICK_CUES: QuickCue[] = [
  { cue: 'Spread the floor', exercise: 'Squat' },
  { cue: 'Pull the slack out', exercise: 'Deadlift' },
  { cue: 'Elbows under the bar', exercise: 'Bench Press' },
  { cue: 'Chest up, hips through', exercise: 'Clean' },
  { cue: 'Proud chest, proud belly', exercise: 'Romanian Deadlift' },
  { cue: 'Grip the bar like you\'re bending it', exercise: 'Deadlift' },
  { cue: 'Lat pillars — protect your armpits', exercise: 'Bench Press' },
  { cue: 'Push the handles forward', exercise: 'SSB Squat' },
  { cue: 'Compensatory acceleration — bar speed is the entire point', exercise: 'Speed Work' },
  { cue: 'Tall spine, shoulders depressed', exercise: 'Farmer Carry' },
  { cue: 'Hollow body first, then move', exercise: 'Ab Wheel' },
  { cue: 'Bar stays over mid-foot, always', exercise: 'Conventional Deadlift' },
  { cue: 'Drive elbows to the ceiling', exercise: 'Row' },
  { cue: 'Touch, flex, hold — don\'t just touch and go', exercise: 'Rear Delt Work' },
];
