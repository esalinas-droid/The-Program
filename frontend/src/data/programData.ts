import { ProgramSession } from '../types';
import { getBlock, getBlockName, getPhase, getWavePosition, DELOAD_WEEKS } from '../utils/calculations';

// ── Warm-up Protocols (static per session type) ──────────────────────────────
const WARMUPS: Record<string, string> = {
  ME_LOWER: '3-5 min backward sled drag or bike · 90/90 breathing 2×5 · Adductor rockback 1×8/side · Glute bridge 2×10',
  ME_UPPER: '3 min easy row/bike · Band pull-aparts 2×20 · Face pulls 2×15 · Band external rotation 2×12',
  DE_LOWER: '3-5 min backward sled drag · Supported hip shift or airplane 1×5/side · Hamstring floss 1×8/side',
  DE_UPPER: '2-3 min bike/rope · Band pull-aparts 2×20 · Band pressdowns 2×20 · Wall slides 2×10',
  EVENT:    '5 min walk/sled drag · 90/90 breathing 2×5 · Suitcase carry 2×40 ft/side · Split-stance hip iso 2×20s/side',
  BOXING:   'Jump rope or shadowbox 3 min · Neck rolls 1×8 · Shoulder circles 1×10/side · Hip circles 1×10/side · Leg swings 1×10/side · Inchworm 1×5',
};

// ── Activation Drills (static per session type) ───────────────────────────────
const ACTIVATION: Record<string, string> = {
  ME_LOWER: 'McGill curl-up 1×6/side · Side plank 2×20-30s/side · Bird dog 1×6/side · BW box squat 2×6',
  ME_UPPER: 'Dead bug 2×6/side · Tall-kneeling Pallof press 2×8/side · Scap push-ups 2×10',
  DE_LOWER: 'Glute bridge iso 2×20s · Side plank 2×20s/side · Goblet squat to box 2×5',
  DE_UPPER: 'Dead bug 1×6/side · Med-ball chest pass 3×3 or box plyo push-up 3×3',
  EVENT:    'Dead bug 2×6/side · March + brace drill 2×20 ft · Empty implement or empty yoke 1-2 runs',
  BOXING:   'McGill curl-up 1×6/side · Bird dog 1×6/side · Hip flexor stretch 1×30s/side · Glute bridge 1×10 · Band pull-apart 1×20',
};

// ── WEDNESDAY BOXING SESSION (same every week) ───────────────────────────────
function getWednesdaySession(week: number): ProgramSession {
  const block = getBlock(week);
  const isDeload = DELOAD_WEEKS.includes(week);
  const rounds = block <= 2 ? '15-20' : '20-25';
  const roundsActual = week <= 8 ? '15-20' : '20-25';
  return {
    week, day: 'Wednesday',
    sessionType: isDeload ? 'Deload Boxing / Recovery / Mobility' : 'Boxing / Recovery / Mobility',
    mainLift: 'Boxing',
    warmUpProtocol: WARMUPS.BOXING,
    activationRehab: ACTIVATION.BOXING,
    rampUpSets: `McGill curl-up 1×6/side · Bird dog 1×6/side · Hip flexor stretch 1×30s/side · Glute bridge 1×10 · Band pull-apart 1×20`,
    topSetScheme: `${roundsActual} rounds × 1:1 work:rest @ 85% effort max`,
    supplementalWork: [
      'Oblique circuit: Suitcase carry 3×40 ft/side · Pallof press 3×10/side · Side plank 3×30s/side',
      'Core circuit: Dead bug 2×8/side · Copenhagen plank 2×20s/side · McGill curl-up 2×6/side',
    ],
    accessories: [
      'Hip mobility: 90/90 hip switch 2×5/side · Hip flexor stretch 2×45s/side · Pigeon pose 2×45s/side',
      'Hip mobility cont: Adductor rockback 2×8/side · Fire hydrant 2×12/side · Glute bridge iso 2×20s',
      'Forearm finisher: Wrist roller 3 trips · Pronation/supination 2×15/side · Plate pinch 3×25s · Band finger ext 2×25',
    ],
    eventGPP: isDeload ? 'Backward sled drag 6 trips @ RPE 5; easy walk 10 min' : 'Backward sled drag 6-8 trips @ RPE 5; reverse hyper 3×15 (restoration) or easy walk 10 min',
    intentRPETarget: 'RPE 6-7 max on boxing, mobility is full effort',
    coachingNotes: isDeload ? 'Deload week — boxing lighter, full mobility still mandatory.' : 'Boxing + GPP. Oblique/hip work drives yoke and carry performance. Full hip mobility circuit essential.',
    key: isDeload ? 'Deload' : getPhase(week),
    block: getBlock(week), blockName: getBlockName(getBlock(week)),
    phase: isDeload ? 'Deload' : getPhase(week),
    isDeload,
  };
}

// ── Top Set Scheme (block-intensity adjusted) ─────────────────────────────────
function getMEScheme(pos: number, block: number, lift: string): string {
  if (pos === 4) return '3×5 @RPE 6 — deload, move well';
  // Trap bar always stays conservative
  if (lift.includes('Trap Bar')) return 'Work to top 5 @RPE 7; smooth reps only';
  // Log/Axle for ME Upper
  if (lift.includes('Log') || lift.includes('Axle')) {
    if (block <= 3) return '6×3 @RPE 6-7; crisp technique only';
    return '4-6×1-3 @RPE 7-8; technique first';
  }
  const sets = block <= 3 ? 5 : 3;
  const rpe = block <= 1 ? '7' : block <= 2 ? '7-8' : block <= 3 ? '8' : block <= 4 ? '8' : '8-8.5';
  const extra = pos === 1 && block <= 2 ? '; then 2×5 backoff' : '';
  return `Work to top ${sets} @RPE ${rpe}${extra}`;
}

function getDELowerScheme(pos: number): string {
  if (pos === 4) return '6×2 easy/fast — deload, stay snappy';
  if (pos === 1) return '10×2 @~50-60% + light mini bands; target RPE 6-7, crisp bar speed';
  if (pos === 2) return '8×2 @~50-60% total load feel; target RPE 6-7 with clean acceleration';
  return '8×2 @~50-60% + light bands or chains; target RPE 6-7';
}

function getDEUpperScheme(pos: number): string {
  if (pos === 4) return '6×3 easy/fast — deload';
  if (pos === 1) return '9×3 @~40-50% + light mini bands; target RPE 6-7 and perfect speed';
  if (pos === 2) return '8×3 @~40-50% + light/moderate chains; target RPE 6-7 and crisp lockout';
  return '6×2 @~50-60%; target RPE 6-7 with violent dip-drive and clean lockout';
}

function getEventScheme(pos: number): string {
  if (pos === 4) return 'Technique only — 2-4 easy exposures, walk away fresh';
  if (pos === 1) return '6-8 runs building speed @RPE 6-8; keep posture and foot speed';
  if (pos === 2) return '6-8 work sets of 1-3 reps @RPE 6-8; technique first';
  return '4-6 full medley runs @RPE 7-8; quality transitions over sloppy load';
}

// ── Main Lift per day/position ────────────────────────────────────────────────
const ME_LOWER_LIFTS: Record<number, string> = {
  1: 'SSB Box Squat', 2: 'Cambered Bar Box Squat',
  3: 'Trap Bar Deadlift (High Handles)', 4: 'Belt Squat',
};
const ME_UPPER_LIFTS: Record<number, string> = {
  1: 'Floor Press', 2: 'Close-Grip Bench Press',
  3: 'Log Clean and Press', 4: 'Close-Grip Bench Press',
};
const DE_LOWER_LIFTS: Record<number, string> = {
  1: 'Speed Box Squat — Straight Bar + Mini Bands',
  2: 'Speed Box Squat — SSB + Chains',
  3: 'Speed Box Squat — Cambered Bar + Light Bands',
  4: 'Speed Box Squat (deload)',
};
const DE_UPPER_LIFTS: Record<number, string> = {
  1: 'Speed Bench Press (3 grips) — Mini Bands',
  2: 'Speed Bench Press — Chains',
  3: 'Axle / Log Push Press Speed Work',
  4: 'Speed Bench Press (deload)',
};
const EVENT_LIFTS: Record<number, string> = {
  1: 'Yoke',
  2: 'Log Clean and Press',
  3: 'Yoke + Sandbag / Keg Medley',
  4: 'Yoke / Log Technique Only',
};

// ── Ramp-up sets ──────────────────────────────────────────────────────────────
function getRampUp(lift: string, deload: boolean): string {
  if (deload) return 'Warm-up only — empty bar or very light × 2-3 sets';
  if (lift.includes('SSB') || lift.includes('Cambered')) return 'Empty bar ×10 ×2 · 95×5 · 135×5 · 185×3 · 225×3 · 275×2 · 315×1';
  if (lift.includes('Trap Bar')) return 'Light pull-through or RDL ×10 · 135×5 · 185×3 · 225×3 · 275×2 · 315×1';
  if (lift.includes('Belt Squat')) return 'Light ×10 ×2 · Build to working weight';
  if (lift.includes('Floor') || lift.includes('Close-Grip') || lift.includes('Bench')) return 'Bar ×10 ×2 · 95×8 · 135×5 · 185×3 · 225×1-2';
  if (lift.includes('Log') || lift.includes('Axle')) return 'Empty implement clean/rack drill 2-3×3 · Empty press 2×5 · Front rack hold 2×10-15s · Build with singles';
  if (lift.includes('Speed Bench')) return 'Bar ×8 ×2 · 95×3 · 135×3 · 155-185×1-2';
  if (lift.includes('Speed Box')) return 'Bar ×5 ×2 · 95×2 · 135×2 · 185×2';
  if (lift.includes('Yoke')) return 'Empty/very light ×1-2 runs · 30-40% ×1 · 50-60% ×1 · 70% ×1';
  return 'Build to working weight';
}

// ── Supplemental Work ─────────────────────────────────────────────────────────
function getSupplemental(day: string, pos: number, isDeload: boolean): string[] {
  if (isDeload) {
    if (day === 'Monday') return ['45-degree back extension 3×12', 'Single-leg press or step-up 3×10'];
    if (day === 'Tuesday') return ['DB row 3×10', 'Band pushdown 3×20'];
    if (day === 'Thursday') return ['Light sled drag 6 trips', 'Standing abs 3×12'];
    if (day === 'Friday') return ['Pushdown 3×20', 'Face pull 3×15'];
    if (day === 'Saturday') return ['Breathing / bracing between runs', 'Short walk only'];
  }
  if (day === 'Monday') {
    if (pos === 1) return ['Belt squat 4×8-10', '45-degree back extension 4×10-12'];
    if (pos === 2) return ['GHD hip extension 4×8', 'DB split squat 3×8/leg'];
    return ['SSB good morning 4×6', 'Reverse lunge 3×8/leg'];
  }
  if (day === 'Tuesday') {
    if (pos === 1) return ['Close-grip bench press 4×6', 'Chest-supported row 4×10'];
    if (pos === 2) return ['Neutral-grip DB press 4×8', 'Seal row 4×8-10'];
    return ['Incline close-grip bench 4×6', 'Lat pulldown 4×10'];
  }
  if (day === 'Thursday') {
    if (pos === 1) return ['Speed pull from 2-inch blocks 6×1 @~50-60%', 'GHD hip extension 4×8'];
    if (pos === 2) return ['Trap bar speed pulls 6×1 @~50-60%', '45-degree back extension 4×12'];
    return ['Speed pull against light bands 6×1 from blocks @~50-60%', 'Belt squat 4×10'];
  }
  if (day === 'Friday') {
    if (pos === 1) return ['JM press 4×8-10', 'Chest-supported row 4×10'];
    if (pos === 2) return ['Rolling DB extension 4×10', 'Seal row 4×8-10'];
    return ['Close-grip bench press 4×6', 'Lat pulldown 4×10'];
  }
  if (day === 'Saturday') {
    if (pos === 1) return ['Sandbag carry 4-6 × 40-60 ft @RPE 6-8; fast pickup tight brace', 'Axle clean technique EMOM 8-10 min @RPE 5-6'];
    if (pos === 2) return ['Yoke 4-6 runs @RPE 6-7; 70-85% smooth best', 'Farmers carry 4 × 60-80 ft @RPE 6-8; straps off posture tall', 'Medley 2-3 rounds @RPE 6-7; keep transitions sharp'];
    return ['Axle clean and press 5-6 work sets @RPE 6-8', 'Sled drag finisher 6 trips @RPE 6-7; aerobic not sloppy'];
  }
  return [];
}

// ── Accessories ────────────────────────────────────────────────────────────────
function getAccessories(day: string, pos: number, isDeload: boolean): string[] {
  if (isDeload) {
    if (day === 'Monday') return ['Dead bug 3×10/side', 'Pallof press 3×12/side'];
    if (day === 'Tuesday') return ['Face pull 3×15', 'Hammer curl 2×12'];
    if (day === 'Wednesday') return [];
    if (day === 'Thursday') return ['Mobility work only'];
    if (day === 'Friday') return ['Easy mobility'];
    if (day === 'Saturday') return [];
  }
  if (day === 'Monday') {
    if (pos === 1) return ['Standing cable abs 4×12', 'Side plank / suitcase carry'];
    if (pos === 2) return ['Weighted sit-up 4×10', 'Bird dog / McGill curl-up'];
    return ['Hanging knee raise 4×12', 'Band anti-rotation press'];
  }
  if (day === 'Tuesday') {
    if (pos === 1) return ['Band pushdown 4×20', 'Face pull 4×15', 'Hammer curl 3×12'];
    if (pos === 2) return ['Rolling DB extension 3×12', 'Rear delt raise 4×15', 'EZ bar curl 3×12'];
    return ['Band pushdown 4×20', 'Face pull 4×15', 'Hammer curl 3×12'];
  }
  if (day === 'Thursday') {
    if (pos === 1) return ['Standing abs 4×12'];
    if (pos === 2) return ['Ab wheel 4×8'];
    return ['Pallof press 4×10/side'];
  }
  if (day === 'Friday') {
    if (pos === 1) return ['Face pull 4×15', 'Pushdown 4×20'];
    if (pos === 2) return ['Rear delt raise 4×15', 'Pushdown 4×20'];
    return ['Face pull 4×15', 'Hammer curl 3×12'];
  }
  if (day === 'Saturday') {
    return ['Breathing / bracing between runs — prioritize recovery between efforts'];
  }
  return [];
}

// ── Event/GPP ─────────────────────────────────────────────────────────────────
function getEventGPP(day: string, pos: number, isDeload: boolean): string {
  if (isDeload) {
    if (day === 'Monday') return 'Easy sled drag 6 trips';
    if (day === 'Tuesday') return 'Easy cuff/shoulder prehab only';
    if (day === 'Thursday') return 'Mobility only';
    if (day === 'Friday') return 'Optional very light boxing';
    return 'One boxing session only this week';
  }
  if (day === 'Monday') {
    if (pos === 1) return 'Backward sled drag 8 trips @RPE 5-6';
    if (pos === 2) return 'Prowler push 8-10 pushes @RPE 6-7; steady drive, no grind';
    return 'Backward sled drag 10 trips @RPE 5-6 for recovery/GPP';
  }
  if (day === 'Tuesday') {
    if (pos === 1) return 'Shoulder prehab + t-spine mobility';
    if (pos === 2) return 'Scap / cuff work';
    return 'Shoulder prehab';
  }
  if (day === 'Thursday') {
    if (pos === 1) return 'Backward sled drag 10 trips @RPE 5-6';
    if (pos === 2) return 'Prowler push 8-10 trips @RPE 6-7; steady drive, no grind';
    return 'Backward sled drag 8 trips @RPE 5-6';
  }
  if (day === 'Friday') {
    return 'Optional easy boxing later in day';
  }
  return '';
}

// ── Coaching Notes ────────────────────────────────────────────────────────────
function getCoachingNotes(day: string, lift: string, pos: number, isDeload: boolean): string {
  if (isDeload) return 'Deload — move well, leave fresh. No grinding.';
  if (day === 'Monday') {
    if (lift.includes('SSB')) return 'Build clean reps and trunk stiffness; stop before nerve symptoms. Brace like you mean it.';
    if (lift.includes('Cambered')) return 'Drive hips through, stay stacked. Own the oscillation.';
    return 'No symptom chasing; own the setup. Trap bar removes lumbar stress.';
  }
  if (day === 'Tuesday') {
    if (lift.includes('Floor')) return 'Elbow-friendly volume. Pressing rebuild — protect the bicep.';
    if (lift.includes('Close-Grip')) return 'Own the groove. Tight arch, controlled descent.';
    return 'No ugly cleans. Technique first — violent hip drive into press.';
  }
  if (day === 'Thursday') return 'Stay fast and symptom-free. Speed is the priority.';
  if (day === 'Friday') {
    if (lift.includes('Speed Bench')) return 'Fast bar, tight shoulders. Speed is the workout.';
    return 'Explosive dip-drive. Violent lockout.';
  }
  if (day === 'Saturday') {
    if (lift.includes('Yoke + Sandbag') || lift.includes('Medley')) return 'Conditioning without slop. Quality transitions. Recovery: Sunday off.';
    if (lift.includes('Yoke')) return 'Own the pick and foot rhythm. Recovery: Sunday off.';
    return 'Technical clean + violent drive. Recovery: Sunday off.';
  }
  return 'Execute with intent.';
}

// ── Session Type Label ─────────────────────────────────────────────────────────
function getSessionType(day: string, isDeload: boolean): string {
  const prefix = isDeload ? 'Deload ' : '';
  if (day === 'Monday') return `${prefix}ME Lower`;
  if (day === 'Tuesday') return `${prefix}ME Upper`;
  if (day === 'Wednesday') return isDeload ? 'Deload Boxing / Recovery / Mobility' : 'Boxing / Recovery / Mobility';
  if (day === 'Thursday') return `${prefix}DE Lower`;
  if (day === 'Friday') return `${prefix}DE Upper`;
  if (day === 'Saturday') return `${prefix}Strongman Event Day`;
  return 'Off';
}

// ── Main Generator ────────────────────────────────────────────────────────────
export function getProgramSession(week: number, day: string): ProgramSession {
  if (day === 'Wednesday') return getWednesdaySession(week);
  if (day === 'Sunday') {
    return {
      week, day, sessionType: 'Off', mainLift: 'Rest Day',
      warmUpProtocol: '', activationRehab: '', rampUpSets: '',
      topSetScheme: 'Full rest. Walk, stretch, recover.',
      supplementalWork: [], accessories: [],
      eventGPP: 'Optional: easy walk 20-30 min', intentRPETarget: 'RPE 0',
      coachingNotes: 'Full rest. Sunday is off. Let the adaptation happen.',
      key: getPhase(week), block: getBlock(week), blockName: getBlockName(getBlock(week)),
      phase: getPhase(week), isDeload: DELOAD_WEEKS.includes(week),
    };
  }

  const isDeload = DELOAD_WEEKS.includes(week);
  const wavePos = getWavePosition(week);
  const block = getBlock(week);
  const phase = getPhase(week);

  let mainLift = '';
  if (day === 'Monday') mainLift = ME_LOWER_LIFTS[wavePos];
  else if (day === 'Tuesday') mainLift = ME_UPPER_LIFTS[wavePos];
  else if (day === 'Thursday') mainLift = DE_LOWER_LIFTS[wavePos];
  else if (day === 'Friday') mainLift = DE_UPPER_LIFTS[wavePos];
  else if (day === 'Saturday') mainLift = EVENT_LIFTS[wavePos];

  let topSetScheme = '';
  if (day === 'Monday' || day === 'Tuesday') topSetScheme = getMEScheme(wavePos, block, mainLift);
  else if (day === 'Thursday') topSetScheme = getDELowerScheme(wavePos);
  else if (day === 'Friday') topSetScheme = getDEUpperScheme(wavePos);
  else if (day === 'Saturday') topSetScheme = getEventScheme(wavePos);

  const isMEDay = day === 'Monday' || day === 'Tuesday';
  const warmupKey = day === 'Monday' ? 'ME_LOWER' : day === 'Tuesday' ? 'ME_UPPER' :
    day === 'Thursday' ? 'DE_LOWER' : day === 'Friday' ? 'DE_UPPER' : 'EVENT';
  const intentMap: Record<string, string> = {
    Monday: isDeload ? 'Deload / taper' : 'Moderate',
    Tuesday: isDeload ? 'Deload / taper' : 'Moderate',
    Thursday: isDeload ? 'Deload / taper' : 'Dynamic speed focus',
    Friday: isDeload ? 'Deload / taper' : 'Dynamic speed focus',
    Saturday: isDeload ? 'Deload / taper' : 'Moderate',
  };

  return {
    week, day,
    sessionType: getSessionType(day, isDeload),
    mainLift,
    warmUpProtocol: WARMUPS[warmupKey],
    activationRehab: ACTIVATION[warmupKey],
    rampUpSets: getRampUp(mainLift, isDeload),
    topSetScheme,
    supplementalWork: getSupplemental(day, wavePos, isDeload),
    accessories: getAccessories(day, wavePos, isDeload),
    eventGPP: getEventGPP(day, wavePos, isDeload),
    intentRPETarget: intentMap[day] || 'Moderate',
    coachingNotes: getCoachingNotes(day, mainLift, wavePos, isDeload),
    key: isDeload ? 'Deload' : phase,
    block,
    blockName: getBlockName(block),
    phase: isDeload ? 'Deload' : phase,
    isDeload,
  };
}

// ── Pre-compute the full 52-week program ──────────────────────────────────────
const TRAINING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function getWeekSessions(week: number): ProgramSession[] {
  return TRAINING_DAYS.map(day => getProgramSession(week, day));
}

export function getTodaySession(week: number): ProgramSession {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = days[new Date().getDay()];
  // If Sunday (off), return Monday's upcoming session
  if (today === 'Sunday') return getProgramSession(week, 'Monday');
  return getProgramSession(week, today);
}

export function getTodayDayName(): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date().getDay()];
}
