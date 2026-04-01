// ── Substitution Library ──────────────────────────────────────────────────────
// Provides 3 ranked alternative exercises per original exercise + reason.
// Used by the Adjust Exercise flow on the Today's Session screen.

export type AdjustReason =
  | 'Pain/Injury'
  | 'No Equipment'
  | 'Gym Crowded'
  | 'Travel'
  | 'Low Energy'
  | 'Preference';

export const ADJUST_REASONS: AdjustReason[] = [
  'Pain/Injury',
  'No Equipment',
  'Gym Crowded',
  'Travel',
  'Low Energy',
  'Preference',
];

export const REASON_ICONS: Record<AdjustReason, string> = {
  'Pain/Injury':  'bandage',
  'No Equipment': 'weight-lifter',
  'Gym Crowded':  'account-group',
  'Travel':       'airplane',
  'Low Energy':   'battery-30',
  'Preference':   'swap-horizontal',
};

export interface Alternative {
  name: string;
  equipment: string;
  intentNote: string;
}

type ReasonMap = Partial<Record<AdjustReason, Alternative[]>>;

// ── Primary library: keyed by exercise name (lowercased for matching) ─────────
const LIBRARY: Record<string, ReasonMap> = {

  // ── SSB Box Squat ────────────────────────────────────────────────────────
  'ssb box squat': {
    'Pain/Injury': [
      { name: 'Belt Squat',         equipment: 'Belt squat machine',       intentNote: 'Same quad-dominant pattern with zero spinal compression' },
      { name: 'Goblet Squat',       equipment: 'Kettlebell or dumbbell',   intentNote: 'Maintains squat depth and quad loading, no bar pressure on traps' },
      { name: 'Leg Press (High Foot)', equipment: 'Leg press machine',     intentNote: 'Quad and glute load preserved with no spinal or shoulder stress' },
    ],
    'No Equipment': [
      { name: 'Goblet Squat',       equipment: 'Any heavy object',         intentNote: 'Mirrors SSB forward lean and quad emphasis with minimal gear' },
      { name: 'Bulgarian Split Squat', equipment: 'Chair or bench',        intentNote: 'Single-leg quad loading that matches SSB volume demand' },
      { name: 'Paused Air Squat',   equipment: 'None',                     intentNote: 'Builds positional strength in the squat pattern under control' },
    ],
    'Gym Crowded': [
      { name: 'Hack Squat',         equipment: 'Hack squat machine',       intentNote: 'Fixed-path squat loading with similar quad emphasis to SSB' },
      { name: 'Front Squat',        equipment: 'Barbell',                  intentNote: 'Matches SSB forward-lean demand and thoracic upright posture' },
      { name: 'Belt Squat',         equipment: 'Belt squat machine',       intentNote: 'Identical movement pattern, removes bar crowding entirely' },
    ],
    'Travel': [
      { name: 'Bulgarian Split Squat', equipment: 'Hotel chair or bed',    intentNote: 'Best single-leg quad loading available without a squat rack' },
      { name: 'Paused Goblet Squat',   equipment: 'Any heavy bag',         intentNote: 'Forces upright torso and quad depth, portable stimulus' },
      { name: 'Jump Squat',         equipment: 'None',                     intentNote: 'Preserves leg drive and power output without equipment' },
    ],
    'Low Energy': [
      { name: 'Paused Box Squat (70%)', equipment: 'Barbell + box',        intentNote: 'Same mechanics, reduced load — lets you move the pattern without grinding' },
      { name: 'Belt Squat',         equipment: 'Belt squat machine',       intentNote: 'Less CNS demand than SSB while keeping quad and glute loading' },
      { name: 'Goblet Squat',       equipment: 'Kettlebell',               intentNote: 'Low-demand quad work that keeps the pattern alive on recovery days' },
    ],
    'Preference': [
      { name: 'Back Squat',         equipment: 'Barbell',                  intentNote: 'Slightly less forward lean, same strength adaptation pathway' },
      { name: 'Cambered Bar Box Squat', equipment: 'Cambered bar + box',   intentNote: 'Increased instability demands more upper back and core engagement' },
      { name: 'Safety Bar Squat',   equipment: 'Safety squat bar',         intentNote: 'Nearly identical to SSB — different grip, same movement intent' },
    ],
  },

  // ── Back Squat ──────────────────────────────────────────────────────────
  'back squat': {
    'Pain/Injury': [
      { name: 'Belt Squat',         equipment: 'Belt squat machine',       intentNote: 'Removes all spinal and shoulder compression, keeps leg drive intact' },
      { name: 'SSB Box Squat',      equipment: 'Safety squat bar + box',   intentNote: 'Reduces wrist and shoulder torque, preserves squat pattern exactly' },
      { name: 'Goblet Squat',       equipment: 'Kettlebell',               intentNote: 'Low-force quad loading that lets injured areas decompress' },
    ],
    'No Equipment': [
      { name: 'Goblet Squat',       equipment: 'Any heavy object',         intentNote: 'Closest bodyweight-accessible squat pattern' },
      { name: 'Bulgarian Split Squat', equipment: 'Chair or bench',        intentNote: 'Unilateral loading exposes weaknesses and builds quad mass' },
      { name: 'Paused Air Squat',   equipment: 'None',                     intentNote: 'Builds positional awareness and mobility in the squat pattern' },
    ],
    'Gym Crowded': [
      { name: 'SSB Box Squat',      equipment: 'Safety squat bar + box',   intentNote: 'Same rack, more forgiving on form when fatigued' },
      { name: 'Hack Squat',         equipment: 'Hack squat machine',       intentNote: 'No rack needed, quad emphasis remains identical' },
      { name: 'Front Squat',        equipment: 'Barbell',                  intentNote: 'Uses same rack, forces more upright posture' },
    ],
    'Travel': [
      { name: 'Bulgarian Split Squat', equipment: 'Hotel chair',           intentNote: 'Best quad loading available at any hotel or gym' },
      { name: 'Jump Squat',         equipment: 'None',                     intentNote: 'Maintains explosive leg power output without equipment' },
      { name: 'Goblet Squat',       equipment: 'Any heavy bag or object',  intentNote: 'Preserves squat pattern and quad loading on the road' },
    ],
    'Low Energy': [
      { name: 'Pause Squat (70%)', equipment: 'Barbell',                   intentNote: 'Same bar path, lower intensity — technique day, not grinding day' },
      { name: 'Box Squat (70%)',   equipment: 'Barbell + box',             intentNote: 'Eliminates stretch reflex, reduces spinal load at the same weight' },
      { name: 'Belt Squat',        equipment: 'Belt squat machine',        intentNote: 'CNS-friendly alternative when you have no gas in the tank' },
    ],
    'Preference': [
      { name: 'SSB Box Squat',      equipment: 'Safety squat bar + box',   intentNote: 'Increases upper back demand and builds more tolerant squat mechanics' },
      { name: 'Front Squat',        equipment: 'Barbell',                  intentNote: 'Greater upright torso demand, excellent quad hypertrophy stimulus' },
      { name: 'Belt Squat',         equipment: 'Belt squat machine',       intentNote: 'High volume quad and glute work without spinal loading' },
    ],
  },

  // ── Bench Press ─────────────────────────────────────────────────────────
  'bench press': {
    'Pain/Injury': [
      { name: 'Floor Press',        equipment: 'Barbell or dumbbells',     intentNote: 'Eliminates shoulder impingement at the bottom, keeps tricep strength intact' },
      { name: 'DB Bench Press',     equipment: 'Dumbbells + bench',        intentNote: 'Free path reduces rotator cuff stress while matching chest stimulus' },
      { name: 'Landmine Press',     equipment: 'Barbell + landmine',       intentNote: 'Shoulder-friendly arc preserves pressing strength with zero impingement risk' },
    ],
    'No Equipment': [
      { name: 'Push-Up (Weighted)', equipment: 'Weight plate on back',     intentNote: 'Horizontal press pattern with scapular freedom, highly scalable' },
      { name: 'Dip',                equipment: 'Parallel bars or chair',   intentNote: 'Matches chest and tricep demand, excellent strength carryover' },
      { name: 'Pike Push-Up',       equipment: 'None',                     intentNote: 'Trains pressing strength in a gravity-loaded pattern' },
    ],
    'Gym Crowded': [
      { name: 'DB Bench Press',     equipment: 'Dumbbells + bench',        intentNote: 'No flat bench rack needed, same horizontal press demand' },
      { name: 'Machine Chest Press', equipment: 'Chest press machine',     intentNote: 'Fixed-path pressing that removes spotter dependency' },
      { name: 'Floor Press',        equipment: 'Barbell or dumbbells',     intentNote: 'Works on any open floor space when benches are taken' },
    ],
    'Travel': [
      { name: 'Push-Up',            equipment: 'None',                     intentNote: 'Preserves horizontal push pattern and maintains pressing proficiency' },
      { name: 'Dip',                equipment: 'Parallel bars or chairs',  intentNote: 'High chest and tricep demand available in most hotel gyms' },
      { name: 'DB Floor Press',     equipment: 'Dumbbells',                intentNote: 'Accessible in any commercial gym, same pressing stimulus' },
    ],
    'Low Energy': [
      { name: 'Close-Grip Bench (70%)', equipment: 'Barbell',             intentNote: 'Shifts demand to triceps, reduces total stimulus — good technique day' },
      { name: 'DB Floor Press',     equipment: 'Dumbbells',                intentNote: 'Lower load ceiling by design, still keeps the pattern trained' },
      { name: 'Machine Chest Press', equipment: 'Machine',                 intentNote: 'Guided path reduces coordination demand when fatigued' },
    ],
    'Preference': [
      { name: 'Floor Press',        equipment: 'Barbell',                  intentNote: 'Eliminates leg drive, increases lockout and tricep demand' },
      { name: 'Close-Grip Bench',   equipment: 'Barbell',                  intentNote: 'Increases tricep loading and builds lockout strength' },
      { name: 'Incline DB Press',   equipment: 'Dumbbells + incline bench', intentNote: 'Shifts emphasis to upper chest and shoulder stability' },
    ],
  },

  // ── Floor Press ─────────────────────────────────────────────────────────
  'floor press': {
    'Pain/Injury': [
      { name: 'DB Floor Press',     equipment: 'Dumbbells',                intentNote: 'Same limited ROM, removes shoulder torque from fixed bar path' },
      { name: 'Cable Chest Press',  equipment: 'Cable machine',            intentNote: 'Continuous tension with no shoulder impingement at end range' },
      { name: 'Push-Up',            equipment: 'None',                     intentNote: 'Chest and tricep loading with natural shoulder blade movement' },
    ],
    'No Equipment': [
      { name: 'Close-Grip Push-Up', equipment: 'None',                     intentNote: 'Matches floor press tricep bias in a bodyweight format' },
      { name: 'Dip',                equipment: 'Parallel bars or chairs',  intentNote: 'High tricep and chest demand close to floor press strength zones' },
      { name: 'Diamond Push-Up',    equipment: 'None',                     intentNote: 'Maximum tricep isolation available without equipment' },
    ],
    'Gym Crowded': [
      { name: 'DB Floor Press',     equipment: 'Dumbbells',                intentNote: 'Works anywhere with dumbbells, same floor press ROM and demand' },
      { name: 'Machine Tricep Press', equipment: 'Tricep machine',         intentNote: 'Keeps lockout strength stimulus without needing bench or floor space' },
      { name: 'Close-Grip Bench',   equipment: 'Barbell',                  intentNote: 'Tricep emphasis match when floor space is occupied' },
    ],
    'Travel': [
      { name: 'Diamond Push-Up',    equipment: 'None',                     intentNote: 'Closest portable floor press alternative targeting triceps' },
      { name: 'Dip',                equipment: 'Chairs or bars',           intentNote: 'Best hotel-friendly option for pressing and tricep stimulus' },
      { name: 'Close-Grip Push-Up', equipment: 'None',                     intentNote: 'Preserves tricep-dominant horizontal press on the road' },
    ],
    'Low Energy': [
      { name: 'DB Floor Press',     equipment: 'Dumbbells',                intentNote: 'Lower load ceiling, same limited ROM, less CNS cost' },
      { name: 'Close-Grip Push-Up', equipment: 'None',                     intentNote: 'Tricep and chest pattern maintained with zero loading decision needed' },
      { name: 'Pushdown (Band)',     equipment: 'Resistance band',          intentNote: 'Tricep pump work without any setup or heavy loading' },
    ],
    'Preference': [
      { name: 'Bench Press',        equipment: 'Barbell',                  intentNote: 'Full ROM adds shoulder and chest depth the floor press limits' },
      { name: 'Close-Grip Bench',   equipment: 'Barbell',                  intentNote: 'Tricep bias maintained with greater ROM' },
      { name: 'Incline DB Press',   equipment: 'Dumbbells + incline bench', intentNote: 'Different angle, upper chest focus, shoulder-friendly arc' },
    ],
  },

  // ── Close-Grip Bench Press ───────────────────────────────────────────────
  'close-grip bench press': {
    'Pain/Injury': [
      { name: 'DB Floor Press',     equipment: 'Dumbbells',                intentNote: 'Eliminates wrist torque from fixed grip, keeps tricep emphasis' },
      { name: 'Neutral-Grip DB Press', equipment: 'Dumbbells + bench',     intentNote: 'Neutral grip removes shoulder and wrist stress completely' },
      { name: 'Pushdown (Cable)',   equipment: 'Cable + rope attachment',   intentNote: 'Isolated tricep loading without any shoulder joint involvement' },
    ],
    'No Equipment': [
      { name: 'Diamond Push-Up',    equipment: 'None',                     intentNote: 'Maximum tricep activation in a bodyweight pressing pattern' },
      { name: 'Dip',                equipment: 'Chairs or bars',           intentNote: 'High tricep and chest demand, available anywhere' },
      { name: 'Close-Grip Push-Up', equipment: 'None',                     intentNote: 'Direct tricep emphasis in the same pressing vector' },
    ],
    'Gym Crowded': [
      { name: 'DB Floor Press',     equipment: 'Dumbbells',                intentNote: 'No bench rack needed, tricep emphasis preserved' },
      { name: 'Machine Tricep Extension', equipment: 'Machine',            intentNote: 'Locked path tricep work without needing bench' },
      { name: 'Pushdown (Cable)',   equipment: 'Cable machine',            intentNote: 'Consistent tricep overload with no setup competition' },
    ],
    'Travel': [
      { name: 'Diamond Push-Up',    equipment: 'None',                     intentNote: 'Most tricep-focused pushing exercise with zero equipment' },
      { name: 'Dip',                equipment: 'Any elevated surface',     intentNote: 'Portable pressing pattern that maintains tricep strength' },
      { name: 'Pushdown (Band)',     equipment: 'Resistance band',          intentNote: 'Lightweight, packable tricep isolation for travel days' },
    ],
    'Low Energy': [
      { name: 'Pushdown (Cable or Band)', equipment: 'Cable or band',      intentNote: 'High-rep tricep pump work with minimal CNS demand' },
      { name: 'Diamond Push-Up',    equipment: 'None',                     intentNote: 'Autoregulating load — only your bodyweight to move' },
      { name: 'JM Press (70%)',     equipment: 'Barbell',                  intentNote: 'Tricep hybrid movement, less full-body fatigue than close grip' },
    ],
    'Preference': [
      { name: 'JM Press',           equipment: 'Barbell',                  intentNote: 'Hybrid movement combining tricep extension and press mechanics' },
      { name: 'Rolling DB Extension', equipment: 'Dumbbells + bench',      intentNote: 'Long-head tricep stretch and contraction in the same set' },
      { name: 'Neutral-Grip DB Press', equipment: 'Dumbbells + bench',     intentNote: 'Shoulder-friendly with significant tricep demand' },
    ],
  },

  // ── Log Clean and Press ─────────────────────────────────────────────────
  'log clean and press': {
    'Pain/Injury': [
      { name: 'DB Seated Overhead Press', equipment: 'Dumbbells + bench', intentNote: 'Seated removes shoulder impingement from clean, keeps pressing strength' },
      { name: 'Axle Push Press (lighter)', equipment: 'Axle bar',         intentNote: 'Same implement style, lower clean demand, preserves press strength' },
      { name: 'Machine Shoulder Press', equipment: 'Shoulder press machine', intentNote: 'Fixed path removes rotator cuff torque during press overhead' },
    ],
    'No Equipment': [
      { name: 'DB Overhead Press',  equipment: 'Dumbbells',                intentNote: 'Same shoulder press pattern, closest accessible overhead stimulus' },
      { name: 'Pike Push-Up',       equipment: 'None',                     intentNote: 'Overhead pressing angle with zero equipment' },
      { name: 'Band Overhead Press', equipment: 'Resistance band',         intentNote: 'Overhead strength maintained in a portable format' },
    ],
    'Gym Crowded': [
      { name: 'DB Overhead Press',  equipment: 'Dumbbells',                intentNote: 'No log or axle needed, identical pressing demand' },
      { name: 'Barbell Overhead Press', equipment: 'Barbell',              intentNote: 'Direct strength carryover to log and axle pressing' },
      { name: 'Machine Shoulder Press', equipment: 'Machine',              intentNote: 'No equipment fight, overhead strength maintained' },
    ],
    'Travel': [
      { name: 'DB Overhead Press',  equipment: 'Dumbbells',                intentNote: 'Available in any commercial gym, preserves pressing strength' },
      { name: 'Pike Push-Up',       equipment: 'None',                     intentNote: 'Overhead pattern maintained with zero equipment on the road' },
      { name: 'Band Press',         equipment: 'Resistance band',          intentNote: 'Overhead stimulus with a packable implement' },
    ],
    'Low Energy': [
      { name: 'DB Overhead Press',  equipment: 'Dumbbells',                intentNote: 'Self-limiting load — easier to hit the right intensity without grinding' },
      { name: 'Push Press (70%)',   equipment: 'Barbell',                  intentNote: 'Leg drive reduces shoulder demand, maintains overhead bar path' },
      { name: 'Machine Shoulder Press', equipment: 'Machine',              intentNote: 'Guided path reduces coordination demand when depleted' },
    ],
    'Preference': [
      { name: 'Axle Clean and Press', equipment: 'Axle bar',               intentNote: 'Thicker grip and axle-specific clean mechanics for strongman specificity' },
      { name: 'Barbell Push Press', equipment: 'Barbell',                  intentNote: 'Speed-strength component added, directly transfers to log press timing' },
      { name: 'Circus DB Press',    equipment: 'Heavy dumbbell',           intentNote: 'Unilateral overhead work exposes side-to-side strength differences' },
    ],
  },

  // ── Axle Clean and Press ────────────────────────────────────────────────
  'axle clean and press': {
    'Pain/Injury': [
      { name: 'DB Overhead Press',  equipment: 'Dumbbells',                intentNote: 'Removes wrist torque from axle clean, keeps overhead stimulus intact' },
      { name: 'Log Push Press',     equipment: 'Log',                      intentNote: 'Neutral grip removes wrist stress while preserving implement pressing skill' },
      { name: 'Seated Barbell OHP', equipment: 'Barbell + rack',           intentNote: 'Eliminates clean demand, focuses purely on overhead pressing strength' },
    ],
    'No Equipment': [
      { name: 'DB Overhead Press',  equipment: 'Dumbbells',                intentNote: 'Best available overhead pressing alternative without axle' },
      { name: 'Pike Push-Up',       equipment: 'None',                     intentNote: 'Overhead pressing pattern maintained without any equipment' },
      { name: 'Band Overhead Press', equipment: 'Resistance band',         intentNote: 'Light overhead volume to maintain shoulder health and motor pattern' },
    ],
    'Gym Crowded': [
      { name: 'DB Overhead Press',  equipment: 'Dumbbells',                intentNote: 'No specialty implement needed, shoulder strength maintained' },
      { name: 'Barbell Push Press', equipment: 'Barbell',                  intentNote: 'Same leg-drive component translates directly to axle press timing' },
      { name: 'Machine Shoulder Press', equipment: 'Machine',              intentNote: 'No axle or barbell competition, pressing volume preserved' },
    ],
    'Travel': [
      { name: 'DB Overhead Press',  equipment: 'Dumbbells',                intentNote: 'Pressing strength maintained in any commercial gym on the road' },
      { name: 'Pike Push-Up',       equipment: 'None',                     intentNote: 'Zero-equipment overhead pressing on travel days' },
      { name: 'Band Overhead Press', equipment: 'Resistance band',         intentNote: 'Packable pressing work to keep shoulder health intact' },
    ],
    'Low Energy': [
      { name: 'DB Push Press',      equipment: 'Dumbbells',                intentNote: 'Leg drive reduces shoulder demand, keeps overhead bar path practiced' },
      { name: 'Seated DB Press',    equipment: 'Dumbbells + bench',        intentNote: 'Seated removes leg and back demand — just press the load' },
      { name: 'Machine Shoulder Press', equipment: 'Machine',              intentNote: 'Autoregulated path removes coordination demand when energy is low' },
    ],
    'Preference': [
      { name: 'Log Clean and Press', equipment: 'Log',                     intentNote: 'Neutral grip and heavier implement, same competition pressing skill' },
      { name: 'Barbell Overhead Press', equipment: 'Barbell',              intentNote: 'Greater shoulder flexibility demand, direct overhead strength builder' },
      { name: 'Circus DB Press',    equipment: 'Heavy dumbbell',           intentNote: 'Unilateral overhead work reveals and addresses strength asymmetries' },
    ],
  },

  // ── Conventional Deadlift ───────────────────────────────────────────────
  'conventional deadlift': {
    'Pain/Injury': [
      { name: 'Trap Bar Deadlift (High Handle)', equipment: 'Trap bar',    intentNote: 'More upright torso removes hamstring and lumbar stress, same total load' },
      { name: 'Romanian Deadlift',  equipment: 'Barbell or dumbbells',     intentNote: 'Hip hinge preserved with reduced compressive lumbar force' },
      { name: '45-Degree Back Extension', equipment: '45-degree bench',    intentNote: 'Posterior chain loading without spinal compression from floor pull' },
    ],
    'No Equipment': [
      { name: 'Single-Leg RDL',     equipment: 'Any weight',               intentNote: 'Hip hinge pattern maintained with load bias and balance demand' },
      { name: 'Hip Hinge (Bodyweight)', equipment: 'None',                  intentNote: 'Groove the hinge pattern and maintain hamstring activation' },
      { name: 'Glute Bridge / Hip Thrust', equipment: 'Floor + weight',    intentNote: 'Posterior chain loaded at hip extension with no spinal stress' },
    ],
    'Gym Crowded': [
      { name: 'Trap Bar Deadlift',  equipment: 'Trap bar',                 intentNote: 'Same pull intensity with a different implement — often less crowded' },
      { name: 'Romanian Deadlift',  equipment: 'Barbell or dumbbells',     intentNote: 'Uses same platform, different movement — frees the deadlift mat' },
      { name: 'Sumo Deadlift',      equipment: 'Barbell',                  intentNote: 'Same bar, different stance — if conventional platform is taken' },
    ],
    'Travel': [
      { name: 'Single-Leg RDL',     equipment: 'Dumbbells',                intentNote: 'Best portable hip hinge available in any hotel gym' },
      { name: 'Hip Thrust (Loaded)', equipment: 'Barbell or dumbbell',     intentNote: 'Hip extension strength maintained without a deadlift platform' },
      { name: 'Romanian Deadlift',  equipment: 'Dumbbells',                intentNote: 'Full hip hinge stimulus with dumbbells found anywhere' },
    ],
    'Low Energy': [
      { name: 'Romanian Deadlift (70%)', equipment: 'Barbell',             intentNote: 'Hip hinge practiced at reduced intensity — technique not grinding day' },
      { name: 'Trap Bar Deadlift',  equipment: 'Trap bar',                 intentNote: 'More forgiving position is easier to execute when fatigued' },
      { name: '45-Degree Back Extension', equipment: '45-degree bench',    intentNote: 'Posterior chain work without CNS cost of a max deadlift effort' },
    ],
    'Preference': [
      { name: 'Sumo Deadlift',      equipment: 'Barbell',                  intentNote: 'Wider stance reduces lower back demand, increases hip and quad involvement' },
      { name: 'Trap Bar Deadlift',  equipment: 'Trap bar',                 intentNote: 'More quad and upright-torso engagement, identical pulling strength builder' },
      { name: 'Block Pull (Below Knee)', equipment: 'Barbell + blocks',    intentNote: 'Removes floor portion to address lockout and upper back strength' },
    ],
  },

  // ── Trap Bar Deadlift ────────────────────────────────────────────────────
  'trap bar deadlift': {
    'Pain/Injury': [
      { name: 'Romanian Deadlift',  equipment: 'Barbell or dumbbells',     intentNote: 'Hip hinge preserved, no compressive trap bar loading on spine' },
      { name: 'Leg Press',          equipment: 'Leg press machine',         intentNote: 'Quad and glute loading without hip hinge stress on low back' },
      { name: 'Goblet Squat',       equipment: 'Kettlebell',               intentNote: 'Quad-dominant knee bend pattern without pulling demand' },
    ],
    'No Equipment': [
      { name: 'Single-Leg RDL',     equipment: 'Any weight',               intentNote: 'Hip hinge maintained with no trap bar required' },
      { name: 'Goblet Squat',       equipment: 'Any heavy object',         intentNote: 'Squat pattern preserved with the upright torso that trap bar favours' },
      { name: 'Romanian Deadlift',  equipment: 'Dumbbells',                intentNote: 'Hip hinge volume maintained with available equipment' },
    ],
    'Gym Crowded': [
      { name: 'Conventional Deadlift', equipment: 'Barbell',               intentNote: 'Same total posterior chain demand if trap bar is in use' },
      { name: 'Romanian Deadlift',  equipment: 'Barbell or dumbbells',     intentNote: 'Hip hinge stimulus matched without needing dedicated equipment' },
      { name: 'Leg Press',          equipment: 'Leg press machine',         intentNote: 'Quad and glute loading accessible when trap bar is occupied' },
    ],
    'Travel': [
      { name: 'Romanian Deadlift',  equipment: 'Dumbbells',                intentNote: 'Best travel hip hinge replacement available' },
      { name: 'Single-Leg RDL',     equipment: 'Dumbbells',                intentNote: 'Unilateral hinge work accessible in any hotel gym' },
      { name: 'Goblet Squat',       equipment: 'Kettlebell or dumbbell',   intentNote: 'Portable squat pattern to replace trap bar loading volume' },
    ],
    'Low Energy': [
      { name: 'Romanian Deadlift (70%)', equipment: 'Barbell',             intentNote: 'Hip hinge practiced at reduced CNS cost' },
      { name: '45-Degree Back Extension', equipment: '45-degree bench',    intentNote: 'Posterior chain maintained with zero approach anxiety' },
      { name: 'Goblet Squat',       equipment: 'Kettlebell',               intentNote: 'Low intensity quad and glute work to preserve the movement pattern' },
    ],
    'Preference': [
      { name: 'Conventional Deadlift', equipment: 'Barbell',               intentNote: 'More hip-hinge dominant, higher hamstring and lower back demand' },
      { name: 'SSB Box Squat',      equipment: 'Safety squat bar + box',   intentNote: 'Keeps lower body loading high with a squat emphasis instead of pull' },
      { name: 'Belt Squat',         equipment: 'Belt squat machine',       intentNote: 'Quad and glute loading without any spinal compression' },
    ],
  },

  // ── Yoke ───────────────────────────────────────────────────────────────
  'yoke': {
    'Pain/Injury': [
      { name: 'Sled Push (lighter)', equipment: 'Sled + plates',           intentNote: 'Same pushing demand and leg drive without loaded spinal compression' },
      { name: 'Farmers Carry',       equipment: 'Farmers handles or dumbbells', intentNote: 'Grip and loaded carry stimulus without overhead yoke pressure' },
      { name: 'Belt Squat Walk',     equipment: 'Belt squat machine',      intentNote: 'Loaded carry mechanics without upper back and trap compression' },
    ],
    'No Equipment': [
      { name: 'Weighted Backpack Carry', equipment: 'Loaded backpack',     intentNote: 'Loaded carry pattern preserved with available gear' },
      { name: 'Suitcase Carry',      equipment: 'Any heavy bag or dumbbell', intentNote: 'Anti-lateral flexion demand without yoke required' },
      { name: 'Goblet Carry Walk',   equipment: 'Kettlebell',               intentNote: 'Anterior load carry to maintain bracing and walking mechanics' },
    ],
    'Gym Crowded': [
      { name: 'Farmers Carry',       equipment: 'Farmers handles or hex dumbbells', intentNote: 'Carry stimulus preserved when yoke course is occupied' },
      { name: 'Sled Push',           equipment: 'Sled + plates',           intentNote: 'Locomotive pushing demand that usually has its own clear lane' },
      { name: 'Loaded Treadmill Walk', equipment: 'Treadmill + weight vest', intentNote: 'Low-interference carry alternative available in any commercial gym' },
    ],
    'Travel': [
      { name: 'Suitcase Carry',      equipment: 'Heavy dumbbell',          intentNote: 'Carry bracing and locomotion in any hotel gym' },
      { name: 'Goblet Carry Walk',   equipment: 'Kettlebell',               intentNote: 'Portable carry work to maintain loaded walking mechanics' },
      { name: 'Farmers Carry (DB)',  equipment: 'Dumbbells',               intentNote: 'Bilateral carry stimulus in any commercial gym environment' },
    ],
    'Low Energy': [
      { name: 'Yoke (50–60%)',        equipment: 'Yoke',                   intentNote: 'Same tool, lower load — technique day, not a max effort carry' },
      { name: 'Sled Drag (light)',    equipment: 'Sled + plates',          intentNote: 'Loaded carry stimulus without yoke compression on a depleted day' },
      { name: 'Farmers Carry (60%)', equipment: 'Farmers handles',         intentNote: 'Carry volume maintained with lower demand on spine and hips' },
    ],
    'Preference': [
      { name: 'Loading Medley',      equipment: 'Mixed carry implements',   intentNote: 'Multiple carry objects trains transitions and varied loading patterns' },
      { name: 'Sled Push + Drag',    equipment: 'Sled',                    intentNote: 'Bilateral pushing and pulling — both yoke directions trained in one set' },
      { name: 'Farmers Carry',       equipment: 'Farmers handles',         intentNote: 'Grip and lockout demand replaces yoke for variation' },
    ],
  },

  // ── Speed Box Squat ─────────────────────────────────────────────────────
  'speed box squat': {
    'Pain/Injury': [
      { name: 'Belt Squat Speed Work', equipment: 'Belt squat machine',    intentNote: 'Same explosive squat pattern with zero spinal bar pressure' },
      { name: 'Leg Press (Explosive)', equipment: 'Leg press machine',     intentNote: 'Lower-body power production without compressive load on spine' },
      { name: 'Jump Squat',          equipment: 'Light barbell or bodyweight', intentNote: 'Preserves rate-of-force development, reduces joint stress' },
    ],
    'No Equipment': [
      { name: 'Jump Squat',          equipment: 'None',                    intentNote: 'Maximum rate-of-force development in the squat pattern' },
      { name: 'Box Jump',            equipment: 'Box or step',             intentNote: 'Explosive lower body output maintained without a barbell' },
      { name: 'Broad Jump',          equipment: 'None',                    intentNote: 'Horizontal power production that complements squat mechanics' },
    ],
    'Gym Crowded': [
      { name: 'Hack Squat (Speed)',  equipment: 'Hack squat machine',      intentNote: 'Fixed path allows explosive work safely without spotter or rack' },
      { name: 'Jump Squat',          equipment: 'Light dumbbells or none', intentNote: 'No rack needed, pure power output in the squat pattern' },
      { name: 'Belt Squat (Speed)', equipment: 'Belt squat machine',       intentNote: 'No rack required for explosive lower-body work' },
    ],
    'Travel': [
      { name: 'Jump Squat',          equipment: 'None',                    intentNote: 'Speed work preserved without any equipment needed' },
      { name: 'Box Jump',            equipment: 'Box or step',             intentNote: 'Explosive lower body power on the road' },
      { name: 'Sprint 20m',          equipment: 'None',                    intentNote: 'Rate-of-force development in a different locomotive pattern' },
    ],
    'Low Energy': [
      { name: 'Speed Work at 50%',   equipment: 'Barbell',                 intentNote: 'Same pattern and intent, lower absolute load — bar speed is the goal' },
      { name: 'Jump Squat',          equipment: 'None',                    intentNote: 'Removes loading decision entirely — just move fast' },
      { name: 'Box Jump',            equipment: 'Box',                     intentNote: 'Explosive stimulus with autoregulating demand' },
    ],
    'Preference': [
      { name: 'Speed Box Squat (SSB)', equipment: 'Safety squat bar',      intentNote: 'Changes bar position and upper back demand in the speed pattern' },
      { name: 'Speed Box Squat (Cambered)', equipment: 'Cambered bar',     intentNote: 'Instability increases upper back demand during explosive work' },
      { name: 'Jump Squat',          equipment: 'Light barbell',           intentNote: 'Rate-of-force development without the box contact variation' },
    ],
  },

  // ── Speed Bench Press ───────────────────────────────────────────────────
  'speed bench press': {
    'Pain/Injury': [
      { name: 'DB Speed Press',      equipment: 'Dumbbells + bench',       intentNote: 'Explosive pressing with shoulder-friendly free path' },
      { name: 'Medicine Ball Chest Pass', equipment: 'Medicine ball',      intentNote: 'Rate-of-force development without joint compression' },
      { name: 'Band Push-Up (Speed)', equipment: 'Resistance band',        intentNote: 'Explosive pressing pattern with no bar forcing injured range' },
    ],
    'No Equipment': [
      { name: 'Explosive Push-Up',   equipment: 'None',                    intentNote: 'Maximum pressing speed in a bodyweight horizontal push' },
      { name: 'Medicine Ball Slam',  equipment: 'Medicine ball',           intentNote: 'Rate-of-force development through explosive whole-body pressing' },
      { name: 'Clap Push-Up',        equipment: 'None',                    intentNote: 'Forces maximum voluntary contraction in the press pattern' },
    ],
    'Gym Crowded': [
      { name: 'DB Speed Press',      equipment: 'Dumbbells + bench',       intentNote: 'No flat bench rack needed, same explosive pressing demand' },
      { name: 'Explosive Push-Up',   equipment: 'None',                    intentNote: 'Speed work preserves bar speed quality with zero setup' },
      { name: 'Machine Speed Press', equipment: 'Chest press machine',     intentNote: 'Guided path for explosive work when bench is occupied' },
    ],
    'Travel': [
      { name: 'Explosive Push-Up',   equipment: 'None',                    intentNote: 'Pressing power maintained with zero equipment' },
      { name: 'Clap Push-Up',        equipment: 'None',                    intentNote: 'Forces maximum speed output in the push pattern' },
      { name: 'DB Speed Press',      equipment: 'Dumbbells',               intentNote: 'Speed work available in any hotel gym with dumbbells' },
    ],
    'Low Energy': [
      { name: 'Speed Work at 45%',   equipment: 'Barbell',                 intentNote: 'Same bar path, lighter load — bar speed is the entire purpose' },
      { name: 'Explosive Push-Up',   equipment: 'None',                    intentNote: 'Autoregulating pressing speed work without any loading decision' },
      { name: 'Band Push-Up',        equipment: 'Resistance band',         intentNote: 'Accommodating resistance maintains speed demand at lower loads' },
    ],
    'Preference': [
      { name: 'Speed Bench (Chains)', equipment: 'Barbell + chains',       intentNote: 'Accommodating resistance rewards acceleration and punishes deceleration' },
      { name: 'Speed Bench (Bands)', equipment: 'Barbell + bands',         intentNote: 'Band resistance peaks at lockout where bar speed needs to be highest' },
      { name: 'DB Speed Press',      equipment: 'Dumbbells',               intentNote: 'Shoulder-friendly speed work with independent arm paths' },
    ],
  },
};

// ── Pattern-based fallback categories ─────────────────────────────────────────
const PATTERN_FALLBACKS: Record<string, ReasonMap> = {
  // Quad-dominant lower body
  squat: {
    'Pain/Injury': [
      { name: 'Belt Squat',            equipment: 'Belt squat machine',    intentNote: 'Same quad pattern with zero spinal compression' },
      { name: 'Goblet Squat',          equipment: 'Kettlebell',            intentNote: 'Quad-dominant loading without bar pressure' },
      { name: 'Leg Press',             equipment: 'Leg press machine',     intentNote: 'Quad and glute load with no spinal demand' },
    ],
    'No Equipment': [
      { name: 'Bulgarian Split Squat', equipment: 'Chair or bench',        intentNote: 'Single-leg quad loading without any equipment' },
      { name: 'Goblet Squat',          equipment: 'Any heavy object',      intentNote: 'Squat pattern with available load' },
      { name: 'Paused Air Squat',      equipment: 'None',                  intentNote: 'Builds squat depth and position awareness' },
    ],
    'Gym Crowded': [
      { name: 'Hack Squat',            equipment: 'Hack squat machine',    intentNote: 'Quad-dominant pattern without rack competition' },
      { name: 'Leg Press',             equipment: 'Leg press machine',     intentNote: 'Same stimulus with separate equipment' },
      { name: 'Belt Squat',            equipment: 'Belt squat machine',    intentNote: 'Quad loading without any rack needed' },
    ],
    'Travel': [
      { name: 'Bulgarian Split Squat', equipment: 'Hotel chair',           intentNote: 'Best lower body exercise available anywhere' },
      { name: 'Jump Squat',            equipment: 'None',                  intentNote: 'Explosive quad work on the road' },
      { name: 'Goblet Squat',          equipment: 'Any dumbbell',          intentNote: 'Hotel gym squat pattern' },
    ],
    'Low Energy': [
      { name: 'Goblet Squat (Light)', equipment: 'Kettlebell',             intentNote: 'Quad pattern preserved at a gentle pace' },
      { name: 'Leg Press',            equipment: 'Leg press machine',      intentNote: 'Less CNS demand than barbell squat variants' },
      { name: 'Belt Squat',           equipment: 'Belt squat machine',     intentNote: 'Easy to regulate intensity, preserves the quad pattern' },
    ],
    'Preference': [
      { name: 'Front Squat',           equipment: 'Barbell',               intentNote: 'Greater upright torso and quad emphasis' },
      { name: 'Bulgarian Split Squat', equipment: 'Dumbbells',             intentNote: 'Unilateral loading addresses asymmetries' },
      { name: 'Hack Squat',            equipment: 'Hack squat machine',    intentNote: 'Fixed-path loading with quad focus' },
    ],
  },
  // Hip hinge
  hinge: {
    'Pain/Injury': [
      { name: 'Romanian Deadlift',  equipment: 'Barbell or dumbbells',     intentNote: 'Hip hinge with reduced spinal compression vs floor pull' },
      { name: '45-Degree Back Extension', equipment: '45-degree bench',    intentNote: 'Posterior chain loaded without compressive pull' },
      { name: 'Hip Thrust',         equipment: 'Barbell + bench',          intentNote: 'Glute and hamstring loading without spinal compression' },
    ],
    'No Equipment': [
      { name: 'Single-Leg RDL',     equipment: 'Any weight',               intentNote: 'Hip hinge with available load' },
      { name: 'Hip Hinge (Bodyweight)', equipment: 'None',                  intentNote: 'Groove the pattern and maintain hamstring activation' },
      { name: 'Glute Bridge',       equipment: 'None or light weight',      intentNote: 'Hip extension strength maintained at bodyweight' },
    ],
    'Gym Crowded': [
      { name: 'Romanian Deadlift',  equipment: 'Barbell or DB',            intentNote: 'Hip hinge preserved with easily available equipment' },
      { name: 'Hip Thrust',         equipment: 'Barbell + bench',          intentNote: 'Glute and hamstring load in a different footprint' },
      { name: 'GHD Hip Extension',  equipment: 'GHD machine',              intentNote: 'Posterior chain loading without platform competition' },
    ],
    'Travel': [
      { name: 'Romanian Deadlift',  equipment: 'Dumbbells',                intentNote: 'Hotel gym hip hinge' },
      { name: 'Single-Leg RDL',     equipment: 'Dumbbell',                 intentNote: 'Unilateral hinge anywhere' },
      { name: 'Hip Thrust',         equipment: 'Dumbbell + bench',         intentNote: 'Glute and hamstring preserved on the road' },
    ],
    'Low Energy': [
      { name: 'Romanian Deadlift (70%)', equipment: 'Barbell',            intentNote: 'Hip hinge practiced at reduced intensity' },
      { name: '45-Degree Back Extension', equipment: '45-degree bench',    intentNote: 'Posterior chain work with zero approach anxiety' },
      { name: 'Single-Leg RDL',     equipment: 'Light dumbbell',          intentNote: 'Hinge with self-limiting unilateral load' },
    ],
    'Preference': [
      { name: 'Good Morning',       equipment: 'Barbell',                  intentNote: 'Greater low back and glute emphasis than standard hip hinge' },
      { name: 'Single-Leg RDL',     equipment: 'Dumbbells',               intentNote: 'Unilateral loading addresses strength asymmetries' },
      { name: 'Hip Thrust',         equipment: 'Barbell + bench',          intentNote: 'Maximum glute activation at hip extension' },
    ],
  },
  // Horizontal push
  press: {
    'Pain/Injury': [
      { name: 'DB Floor Press',     equipment: 'Dumbbells',                intentNote: 'Reduces shoulder range and bar path torque' },
      { name: 'Neutral-Grip DB Press', equipment: 'Dumbbells + bench',     intentNote: 'Neutral grip removes shoulder impingement risk' },
      { name: 'Cable Chest Press',  equipment: 'Cable machine',            intentNote: 'Consistent tension without joint end-range loading' },
    ],
    'No Equipment': [
      { name: 'Push-Up',            equipment: 'None',                     intentNote: 'Preserves horizontal press pattern without a bar' },
      { name: 'Diamond Push-Up',    equipment: 'None',                     intentNote: 'Tricep-dominant pressing with no equipment' },
      { name: 'Dip',                equipment: 'Chairs',                   intentNote: 'Chest and tricep loading available anywhere' },
    ],
    'Gym Crowded': [
      { name: 'DB Bench Press',     equipment: 'Dumbbells + bench',        intentNote: 'No flat bench rack needed, same horizontal demand' },
      { name: 'Machine Chest Press', equipment: 'Machine',                 intentNote: 'No rack competition needed' },
      { name: 'DB Floor Press',     equipment: 'Dumbbells',                intentNote: 'Works anywhere with dumbbells' },
    ],
    'Travel': [
      { name: 'Push-Up',            equipment: 'None',                     intentNote: 'Horizontal pressing stimulus anywhere' },
      { name: 'Dip',                equipment: 'Chairs',                   intentNote: 'Hotel-accessible pressing' },
      { name: 'DB Bench Press',     equipment: 'Dumbbells + bench',        intentNote: 'Full pressing in any commercial gym' },
    ],
    'Low Energy': [
      { name: 'DB Floor Press',     equipment: 'Dumbbells',                intentNote: 'Self-limiting load, preserves the press pattern' },
      { name: 'Machine Press (Light)', equipment: 'Machine',               intentNote: 'Guided path reduces coordination demand when depleted' },
      { name: 'Push-Up',            equipment: 'None',                     intentNote: 'Bodyweight pressing with autoregulated difficulty' },
    ],
    'Preference': [
      { name: 'Incline DB Press',   equipment: 'Dumbbells + incline bench', intentNote: 'Upper chest and shoulder emphasis' },
      { name: 'Close-Grip Bench',   equipment: 'Barbell',                  intentNote: 'Tricep emphasis in horizontal press' },
      { name: 'Neutral-Grip DB Press', equipment: 'Dumbbells',             intentNote: 'Shoulder-friendly with full range of motion' },
    ],
  },
  // Vertical / overhead press
  overhead: {
    'Pain/Injury': [
      { name: 'Seated DB Press',    equipment: 'Dumbbells + bench',        intentNote: 'Seated position reduces impingement from standing clean demand' },
      { name: 'Neutral-Grip Overhead Press', equipment: 'EZ bar or dumbbells', intentNote: 'Neutral grip reduces shoulder impingement at overhead position' },
      { name: 'Landmine Press',     equipment: 'Barbell + landmine',       intentNote: 'Arc-shaped press path avoids overhead impingement zone entirely' },
    ],
    'No Equipment': [
      { name: 'Pike Push-Up',       equipment: 'None',                     intentNote: 'Overhead pressing angle with zero equipment' },
      { name: 'DB Overhead Press',  equipment: 'Dumbbells',                intentNote: 'Pressing strength maintained with available equipment' },
      { name: 'Band Overhead Press', equipment: 'Resistance band',         intentNote: 'Shoulder stimulus with packable implement' },
    ],
    'Gym Crowded': [
      { name: 'DB Overhead Press',  equipment: 'Dumbbells',                intentNote: 'No rack needed, same overhead demand' },
      { name: 'Machine Shoulder Press', equipment: 'Machine',              intentNote: 'Overhead stimulus without any equipment fight' },
      { name: 'Landmine Press',     equipment: 'Barbell + landmine',       intentNote: 'Unique path that rarely has any equipment competition' },
    ],
    'Travel': [
      { name: 'DB Overhead Press',  equipment: 'Dumbbells',                intentNote: 'Pressing strength maintained in any commercial gym' },
      { name: 'Pike Push-Up',       equipment: 'None',                     intentNote: 'Hotel room overhead pressing' },
      { name: 'Band Overhead Press', equipment: 'Resistance band',         intentNote: 'Packable pressing for travel days' },
    ],
    'Low Energy': [
      { name: 'DB Push Press',      equipment: 'Dumbbells',                intentNote: 'Leg drive reduces shoulder demand when depleted' },
      { name: 'Machine Shoulder Press', equipment: 'Machine',              intentNote: 'Guided path removes coordination load on low energy days' },
      { name: 'Band Lateral Raise + Front Raise', equipment: 'Band',      intentNote: 'Shoulder health volume with minimal fatigue cost' },
    ],
    'Preference': [
      { name: 'Barbell Push Press', equipment: 'Barbell',                  intentNote: 'Speed-strength component trains overhead timing and leg drive' },
      { name: 'Circus DB Press',    equipment: 'Heavy dumbbell',           intentNote: 'Unilateral overhead work reveals strength imbalances' },
      { name: 'Z-Press',            equipment: 'Barbell',                  intentNote: 'Seated floor press removes leg drive, maximises shoulder strength' },
    ],
  },
  // Horizontal pull
  row: {
    'Pain/Injury': [
      { name: 'Cable Seated Row',   equipment: 'Cable machine',            intentNote: 'Continuous tension without bicep tendon strain of heavy DB rows' },
      { name: 'Face Pull',          equipment: 'Cable + rope',             intentNote: 'External rotation and rear delt health without spinal stress' },
      { name: 'Band Pull-Apart',    equipment: 'Resistance band',          intentNote: 'Upper back activation without any loading on injured areas' },
    ],
    'No Equipment': [
      { name: 'Inverted Row (TRX or bar)', equipment: 'Low bar or TRX',    intentNote: 'Horizontal pull pattern at bodyweight with any available bar' },
      { name: 'Band Pull-Apart',    equipment: 'Resistance band',          intentNote: 'Rear delt and rhomboid activation with a portable band' },
      { name: 'Towel Row',          equipment: 'Towel + anchor point',     intentNote: 'Pulls your bodyweight horizontally with any door or pole' },
    ],
    'Gym Crowded': [
      { name: 'Cable Seated Row',   equipment: 'Cable machine',            intentNote: 'Dedicated station, rarely competes with DB rows' },
      { name: 'Chest-Supported Row', equipment: 'Incline bench + dumbbells', intentNote: 'Uses a bench instead of a rack — different queue' },
      { name: 'Machine Row',        equipment: 'Machine',                  intentNote: 'Dedicated equipment removes competition with DB benches' },
    ],
    'Travel': [
      { name: 'Inverted Row',       equipment: 'Any low bar or table',     intentNote: 'Horizontal pull available almost anywhere' },
      { name: 'Dumbbell Row',       equipment: 'Dumbbell',                 intentNote: 'Single-arm rowing in any hotel gym' },
      { name: 'Band Pull-Apart',    equipment: 'Resistance band',          intentNote: 'Upper back health maintained with packable equipment' },
    ],
    'Low Energy': [
      { name: 'Cable Seated Row (Light)', equipment: 'Cable machine',      intentNote: 'Lat and rhomboid volume maintained at low intensity' },
      { name: 'Band Pull-Apart',    equipment: 'Resistance band',          intentNote: 'Upper back activation with zero CNS cost' },
      { name: 'Face Pull',          equipment: 'Cable + rope',             intentNote: 'Shoulder health work that can be done at any energy level' },
    ],
    'Preference': [
      { name: 'Pendlay Row',        equipment: 'Barbell',                  intentNote: 'Dead-stop from floor trains upper back power and position' },
      { name: 'Chest-Supported Row', equipment: 'Incline bench + dumbbells', intentNote: 'Removes lower back demand and isolates upper back purely' },
      { name: 'Single-Arm DB Row',  equipment: 'Dumbbell + bench',         intentNote: 'Unilateral loading allows greater range of motion and loading' },
    ],
  },
  // Vertical pull
  pull: {
    'Pain/Injury': [
      { name: 'Lat Pulldown (Neutral Grip)', equipment: 'Cable + bar',    intentNote: 'Removes shoulder impingement risk of wide-grip pulling' },
      { name: 'Assisted Pull-Up',   equipment: 'Assisted pull-up machine', intentNote: 'Same lat activation with reduced demand on injured tissue' },
      { name: 'Straight-Arm Pulldown', equipment: 'Cable + bar',          intentNote: 'Lat loading without any elbow flexor or bicep involvement' },
    ],
    'No Equipment': [
      { name: 'Pull-Up',            equipment: 'Any overhead bar',         intentNote: 'Vertical pull with available overhead grip point' },
      { name: 'Inverted Row',       equipment: 'Low bar',                  intentNote: 'Horizontal pull available without a dedicated lat machine' },
      { name: 'Door Frame Pull',    equipment: 'Door frame',               intentNote: 'Lat activation available in any hotel room' },
    ],
    'Gym Crowded': [
      { name: 'Pull-Up',            equipment: 'Pull-up bar',              intentNote: 'Own bodyweight means no equipment competition' },
      { name: 'Assisted Pull-Up',   equipment: 'Machine',                  intentNote: 'Separate from cable lat pulldown machine' },
      { name: 'Cable Pullover',     equipment: 'Cable machine',            intentNote: 'Lat isolation using a different cable attachment' },
    ],
    'Travel': [
      { name: 'Pull-Up',            equipment: 'Any overhead bar',         intentNote: 'Bodyweight lat work available almost anywhere' },
      { name: 'Inverted Row',       equipment: 'Low bar or table edge',    intentNote: 'Horizontal pull accessible in most hotel gyms' },
      { name: 'Band Pulldown',      equipment: 'Resistance band',          intentNote: 'Lat activation with packable equipment' },
    ],
    'Low Energy': [
      { name: 'Lat Pulldown (Light)', equipment: 'Cable machine',          intentNote: 'Lat volume maintained at a gentle pace' },
      { name: 'Assisted Pull-Up',   equipment: 'Machine',                  intentNote: 'Same movement, reduced loading demand' },
      { name: 'Straight-Arm Pulldown', equipment: 'Cable',                 intentNote: 'Lat pump with minimal bicep or joint stress' },
    ],
    'Preference': [
      { name: 'Weighted Pull-Up',   equipment: 'Pull-up bar + belt',       intentNote: 'Adds load to bodyweight pull for strength progression' },
      { name: 'Neutral-Grip Pull-Up', equipment: 'Pull-up bar',            intentNote: 'Shoulder-friendly grip with strong lat and bicep activation' },
      { name: 'Supinated Pulldown', equipment: 'Cable machine',            intentNote: 'Underhand grip increases bicep contribution and lat stretch' },
    ],
  },
  // Core
  core: {
    'Pain/Injury': [
      { name: 'Dead Bug',           equipment: 'None',                     intentNote: 'Anti-extension core work with zero spinal compression or flexion' },
      { name: 'Pallof Press',       equipment: 'Cable or band',            intentNote: 'Anti-rotation core work that avoids spinal loading entirely' },
      { name: 'McGill Curl-Up',     equipment: 'None',                     intentNote: 'Safe spinal flexion pattern approved for disc health' },
    ],
    'No Equipment': [
      { name: 'Plank',              equipment: 'None',                     intentNote: 'Anti-extension core endurance with zero equipment' },
      { name: 'Dead Bug',           equipment: 'None',                     intentNote: 'Coordination and anti-extension with no load needed' },
      { name: 'Side Plank',         equipment: 'None',                     intentNote: 'Lateral core stability and hip abductor endurance' },
    ],
    'Gym Crowded': [
      { name: 'Pallof Press',       equipment: 'Cable or band',            intentNote: 'Anti-rotation work in any corner of the gym' },
      { name: 'Dead Bug',           equipment: 'None',                     intentNote: 'Floor-based core work that needs zero equipment' },
      { name: 'Plank Variations',   equipment: 'None',                     intentNote: 'Core endurance anywhere in the gym' },
    ],
    'Travel': [
      { name: 'Plank',              equipment: 'None',                     intentNote: 'Anti-extension core stability in any hotel room' },
      { name: 'Dead Bug',           equipment: 'None',                     intentNote: 'Coordination and core control with zero equipment' },
      { name: 'Side Plank',         equipment: 'None',                     intentNote: 'Lateral stability anywhere on the road' },
    ],
    'Low Energy': [
      { name: 'Dead Bug',           equipment: 'None',                     intentNote: 'Core activation without any fatigue cost' },
      { name: 'Plank',              equipment: 'None',                     intentNote: 'Isometric core work at zero intensity cost' },
      { name: 'Pallof Press (Light)', equipment: 'Band',                   intentNote: 'Anti-rotation work at a gentle activation level' },
    ],
    'Preference': [
      { name: 'Ab Wheel Rollout',   equipment: 'Ab wheel',                 intentNote: 'Maximum anti-extension range and core demand' },
      { name: 'Hanging Leg Raise',  equipment: 'Pull-up bar',              intentNote: 'Hip flexor and core strength with full range' },
      { name: 'Dragon Flag',        equipment: 'Bench',                    intentNote: 'Advanced core strength with full body tension demand' },
    ],
  },
  // Tricep
  tricep: {
    'Pain/Injury': [
      { name: 'Pushdown (Rope)',    equipment: 'Cable + rope',             intentNote: 'Neutral grip removes elbow torque from lockout position' },
      { name: 'Overhead DB Extension (Light)', equipment: 'Dumbbell',      intentNote: 'Long-head stretch at reduced load' },
      { name: 'Band Pushdown',      equipment: 'Resistance band',          intentNote: 'Light tricep activation with zero joint compression' },
    ],
    'No Equipment': [
      { name: 'Diamond Push-Up',    equipment: 'None',                     intentNote: 'Maximum tricep activation in a bodyweight push' },
      { name: 'Dip',                equipment: 'Chairs or bars',           intentNote: 'Bodyweight tricep loading available anywhere' },
      { name: 'Close-Grip Push-Up', equipment: 'None',                     intentNote: 'Tricep-dominant pressing with zero equipment' },
    ],
    'Gym Crowded': [
      { name: 'Band Pushdown',      equipment: 'Band',                     intentNote: 'Tricep volume in any gym corner without a cable station' },
      { name: 'Diamond Push-Up',    equipment: 'None',                     intentNote: 'Zero equipment means zero queue' },
      { name: 'Dip',                equipment: 'Parallel bars',            intentNote: 'Separate equipment from cable machines' },
    ],
    'Travel': [
      { name: 'Diamond Push-Up',    equipment: 'None',                     intentNote: 'Tricep volume with zero equipment in any location' },
      { name: 'Dip',                equipment: 'Chairs',                   intentNote: 'Hotel-accessible tricep loading' },
      { name: 'Band Pushdown',      equipment: 'Resistance band',          intentNote: 'Packable tricep isolation anywhere on the road' },
    ],
    'Low Energy': [
      { name: 'Band Pushdown',      equipment: 'Band',                     intentNote: 'High-rep tricep pump with minimal fatigue cost' },
      { name: 'Diamond Push-Up',    equipment: 'None',                     intentNote: 'Autoregulated tricep work at bodyweight' },
      { name: 'Pushdown (Light)',   equipment: 'Cable',                    intentNote: 'Blood flow and pump work without loading CNS' },
    ],
    'Preference': [
      { name: 'Skull Crusher',      equipment: 'EZ bar + bench',           intentNote: 'Long-head tricep stretch that builds mass and lockout strength' },
      { name: 'Overhead Tricep Extension', equipment: 'Dumbbell or cable', intentNote: 'Long-head loading in fully stretched position' },
      { name: 'Dip',                equipment: 'Parallel bars',            intentNote: 'Compound tricep and chest movement with heavy loading potential' },
    ],
  },
  // Bicep / Curl
  curl: {
    'Pain/Injury': [
      { name: 'Hammer Curl',        equipment: 'Dumbbells',                intentNote: 'Neutral grip reduces bicep tendon stress at supinated positions' },
      { name: 'Cable Curl',         equipment: 'Cable + bar',              intentNote: 'Continuous tension with a consistent force curve' },
      { name: 'Band Curl',          equipment: 'Resistance band',          intentNote: 'Light bicep loading with zero compressive joint demand' },
    ],
    'No Equipment': [
      { name: 'Inverted Row (Supinated)', equipment: 'Low bar',            intentNote: 'Bicep and back activation with an underhand grip' },
      { name: 'Towel Curl',         equipment: 'Towel + anchor',           intentNote: 'Curl resistance using bodyweight and an anchor point' },
      { name: 'Band Curl',          equipment: 'Resistance band',          intentNote: 'Bicep loading with a packable implement' },
    ],
    'Gym Crowded': [
      { name: 'Cable Curl',         equipment: 'Cable machine',            intentNote: 'Uses cable machine instead of dumbbell rack' },
      { name: 'Band Curl',          equipment: 'Band',                     intentNote: 'Bicep volume in any gym corner without dumbbell competition' },
      { name: 'Incline DB Curl',    equipment: 'Dumbbells + incline bench', intentNote: 'Different bench and angle — usually less competition' },
    ],
    'Travel': [
      { name: 'Hammer Curl',        equipment: 'Dumbbells',                intentNote: 'Neutral-grip curl in any hotel gym' },
      { name: 'Band Curl',          equipment: 'Resistance band',          intentNote: 'Bicep volume with packable equipment' },
      { name: 'Inverted Row (Supinated)', equipment: 'Any low bar',        intentNote: 'Combined pull and curl pattern anywhere' },
    ],
    'Low Energy': [
      { name: 'Band Curl',          equipment: 'Band',                     intentNote: 'Bicep pump at zero CNS cost' },
      { name: 'Hammer Curl (Light)', equipment: 'Dumbbells',               intentNote: 'Easy pump work to keep bicep tissue stimulated' },
      { name: 'Cable Curl (Light)', equipment: 'Cable',                    intentNote: 'High-rep light curls for blood flow on recovery days' },
    ],
    'Preference': [
      { name: 'Incline DB Curl',    equipment: 'Dumbbells + incline bench', intentNote: 'Long-head stretch at the bottom maximises bicep peak development' },
      { name: 'EZ Bar Curl',        equipment: 'EZ bar',                   intentNote: 'Slightly supinated grip reduces wrist strain at heavier loads' },
      { name: 'Preacher Curl',      equipment: 'Preacher bench',           intentNote: 'Eliminates momentum and maximises bicep isolation' },
    ],
  },
  // Loaded carry
  carry: {
    'Pain/Injury': [
      { name: 'Sled Drag',          equipment: 'Sled + plates',            intentNote: 'Loaded locomotion with far less spinal and grip compression' },
      { name: 'Belt Squat March',   equipment: 'Belt squat machine',       intentNote: 'Loaded walking pattern with zero grip or trap bar stress' },
      { name: 'Prowler Push',       equipment: 'Prowler sled',             intentNote: 'Horizontal push locomotion without carry compression' },
    ],
    'No Equipment': [
      { name: 'Weighted Backpack Walk', equipment: 'Loaded backpack',      intentNote: 'Carry loading with any available weighted bag' },
      { name: 'Suitcase Carry (Any Weight)', equipment: 'Any heavy object', intentNote: 'Anti-lateral flexion carry with whatever is available' },
      { name: 'Bear Hug Carry',     equipment: 'Large stone or bag',       intentNote: 'Object carry that mirrors stone and sandbag events' },
    ],
    'Gym Crowded': [
      { name: 'Sled Push',          equipment: 'Sled',                     intentNote: 'Carry stimulus in a separate lane from the carry corridor' },
      { name: 'Loaded Treadmill Walk', equipment: 'Treadmill + weight vest', intentNote: 'Carry locomotion without a dedicated lane' },
      { name: 'Prowler Push',       equipment: 'Prowler',                  intentNote: 'Loaded movement stimulus in a different footprint' },
    ],
    'Travel': [
      { name: 'Suitcase Carry (DB)', equipment: 'Dumbbell',               intentNote: 'Anti-lateral carry mechanics in any hotel gym' },
      { name: 'Goblet Carry Walk',  equipment: 'Kettlebell',               intentNote: 'Anterior loaded carry accessible anywhere' },
      { name: 'Farmers Carry (DB)', equipment: 'Dumbbells',               intentNote: 'Bilateral carry stimulus in any commercial gym' },
    ],
    'Low Energy': [
      { name: 'Carry at 60% (Short Distance)', equipment: 'Carry implement', intentNote: 'Same movement stimulus at lower intensity' },
      { name: 'Sled Drag (Light)',  equipment: 'Sled',                     intentNote: 'Resisted locomotion with low CNS demand' },
      { name: 'Goblet Carry',       equipment: 'Kettlebell',               intentNote: 'Lower-load carry that keeps the pattern alive' },
    ],
    'Preference': [
      { name: 'Farmers Carry',      equipment: 'Farmers handles or hex DB', intentNote: 'Bilateral grip and trap loading with strong competition carryover' },
      { name: 'Sandbag Carry',      equipment: 'Sandbag',                  intentNote: 'Awkward implement matches competition carry demands closely' },
      { name: 'Keg Carry',          equipment: 'Keg (water or loaded)',    intentNote: 'Bear hug carry that builds shouldering and loading strength' },
    ],
  },
};

// ── Utility: extract exercise name from "4×8 Belt squat" strings ──────────────
export function extractExerciseName(item: string): string {
  return item
    .replace(/^\d+[\-\d]*[×x]\d+[\-\d]*\s*/i, '') // remove "4×8-10 "
    .replace(/\s+[@(].*$/i, '')                      // remove "@RPE..." or "(..."
    .replace(/;.*$/i, '')                             // remove "; notes"
    .replace(/\s+—.*$/i, '')                          // remove " — description"
    .replace(/\s+at\s+\d+.*$/i, '')                  // remove "at 65% e1RM"
    .replace(/\s+\(.*\)$/, '')                        // remove trailing "(deload)"
    .trim();
}

// ── Main lookup function ──────────────────────────────────────────────────────
export function getAlternatives(exerciseName: string, reason: AdjustReason): Alternative[] {
  const key = exerciseName.toLowerCase().trim();

  // 1. Exact key match
  for (const [libKey, reasonMap] of Object.entries(LIBRARY)) {
    if (key.includes(libKey) || libKey.includes(key)) {
      const alts = reasonMap[reason] || reasonMap['Preference'];
      if (alts && alts.length > 0) return alts.slice(0, 3);
    }
  }

  // 2. Pattern category fallback
  if (/(ssb|box squat|hack squat|goblet|front squat|split squat|squat)/.test(key)) {
    const alts = PATTERN_FALLBACKS.squat[reason] || PATTERN_FALLBACKS.squat['Preference']!;
    return alts.slice(0, 3);
  }
  if (/(deadlift|rdl|romanian|back extension|hip extension|hip hinge|good morning)/.test(key)) {
    const alts = PATTERN_FALLBACKS.hinge[reason] || PATTERN_FALLBACKS.hinge['Preference']!;
    return alts.slice(0, 3);
  }
  if (/(bench|floor press|chest press|push-up|push up|incline press)/.test(key)) {
    const alts = PATTERN_FALLBACKS.press[reason] || PATTERN_FALLBACKS.press['Preference']!;
    return alts.slice(0, 3);
  }
  if (/(overhead|ohp|log press|axle press|push press|jerk|strict press)/.test(key)) {
    const alts = PATTERN_FALLBACKS.overhead[reason] || PATTERN_FALLBACKS.overhead['Preference']!;
    return alts.slice(0, 3);
  }
  if (/(row|seal row|pendlay|chest.supported)/.test(key)) {
    const alts = PATTERN_FALLBACKS.row[reason] || PATTERN_FALLBACKS.row['Preference']!;
    return alts.slice(0, 3);
  }
  if (/(pulldown|pull-up|pullup|chin-up|chinup|lat pull|pullover)/.test(key)) {
    const alts = PATTERN_FALLBACKS.pull[reason] || PATTERN_FALLBACKS.pull['Preference']!;
    return alts.slice(0, 3);
  }
  if (/(carry|yoke|farmers|suitcase|sandbag|keg carry|zercher carry)/.test(key)) {
    const alts = PATTERN_FALLBACKS.carry[reason] || PATTERN_FALLBACKS.carry['Preference']!;
    return alts.slice(0, 3);
  }
  if (/(pushdown|tricep|jm press|skullcrush|overhead extension)/.test(key)) {
    const alts = PATTERN_FALLBACKS.tricep[reason] || PATTERN_FALLBACKS.tricep['Preference']!;
    return alts.slice(0, 3);
  }
  if (/(curl|hammer curl|bicep|preacher|zottman)/.test(key)) {
    const alts = PATTERN_FALLBACKS.curl[reason] || PATTERN_FALLBACKS.curl['Preference']!;
    return alts.slice(0, 3);
  }
  if (/(abs|core|plank|pallof|dead bug|ab wheel|sit-up|situp|bird dog|hollow)/.test(key)) {
    const alts = PATTERN_FALLBACKS.core[reason] || PATTERN_FALLBACKS.core['Preference']!;
    return alts.slice(0, 3);
  }

  // 3. Generic fallback
  return [
    { name: 'Bodyweight Version of Exercise', equipment: 'None',               intentNote: 'Maintains movement pattern without load pressure' },
    { name: 'Dumbbell Variation',             equipment: 'Dumbbells',           intentNote: 'Free-path version preserves stimulus with more flexibility' },
    { name: 'Machine Equivalent',             equipment: 'Machine',             intentNote: 'Guided path reduces coordination demand and allows similar loading' },
  ];
}
