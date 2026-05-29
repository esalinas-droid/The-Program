// ── A.2 — Onboarding asset bundle ────────────────────────────────────────────
// All paths relative to frontend/assets/onboarding/.
// Used by Steps 7 (weaknesses), 8 (equipment), and 9 (injuries/body-map).

// ── Weakness photos  (17 items — all have photos) ───────────────────────────
export const WEAKNESS_IMAGES: Record<string, any> = {
  'Off the chest / bottom ROM':          require('../../assets/onboarding/weaknesses/off-the-chest.png'),
  'Tricep lockout (top half)':           require('../../assets/onboarding/weaknesses/tricep-lockout.png'),
  'Shoulder girdle / pec tie-in':        require('../../assets/onboarding/weaknesses/shoulder-girdle.png'),
  'Off the floor (deadlift / clean)':    require('../../assets/onboarding/weaknesses/off-the-floor.png'),
  'Knee / hip transition (mid-pull)':    require('../../assets/onboarding/weaknesses/knee-hip-transition.png'),
  'Lockout / hip drive (deadlift)':      require('../../assets/onboarding/weaknesses/lockout-hip-drive.png'),
  'Squat depth / the hole':              require('../../assets/onboarding/weaknesses/squat-depth.png'),
  'Upper back rounding under load':      require('../../assets/onboarding/weaknesses/upper-back-rounding.png'),
  'Core stability / bracing':            require('../../assets/onboarding/weaknesses/core-stability.png'),
  'Hip mobility / achieving depth':      require('../../assets/onboarding/weaknesses/hip-mobility.png'),
  'Shoulder / overhead mobility':        require('../../assets/onboarding/weaknesses/shoulder-mobility.png'),
  'Overhead lockout & stability':        require('../../assets/onboarding/weaknesses/overhead-lockout.png'),
  'Pressing strength (general upper)':   require('../../assets/onboarding/weaknesses/pressing-strength.png'),
  'Posterior chain (hamstrings/glutes)': require('../../assets/onboarding/weaknesses/posterior-chain.png'),
  'Grip strength / forearm endurance':   require('../../assets/onboarding/weaknesses/grip-strength.png'),
  'Conditioning / work capacity':        require('../../assets/onboarding/weaknesses/conditioning.png'),
  'Mental / confidence under maximal':   require('../../assets/onboarding/weaknesses/mental-confidence.png'),
};

// ── Equipment photos  (10 items have photos; rest show text chips) ───────────
export const EQUIPMENT_IMAGES: Record<string, any> = {
  'Safety Squat Bar (SSB)': require('../../assets/onboarding/equipment/safety-squat-bar.png'),
  'Trap Bar / Hex Bar':     require('../../assets/onboarding/equipment/trap-bar.png'),
  'Axle Bar':               require('../../assets/onboarding/equipment/axle-bar.png'),
  'Log Bar':                require('../../assets/onboarding/equipment/log-press.png'),
  'Yoke':                   require('../../assets/onboarding/equipment/yoke.png'),
  'Farmer Handles':         require('../../assets/onboarding/equipment/farmers-handles.png'),
  'Atlas Stones':           require('../../assets/onboarding/equipment/atlas-stones.png'),
  'Sled / Push Sled':       require('../../assets/onboarding/equipment/prowler-sled.png'),
  'Kettlebells':            require('../../assets/onboarding/equipment/kettlebells.png'),
  'Sandbag':                require('../../assets/onboarding/equipment/sandbag.png'),
};

// ── Anatomy body-map images  (used on injury step as a visual reference) ────
export const ANATOMY_IMAGES = {
  male: {
    front: require('../../assets/onboarding/anatomy/male-front.png'),
    back:  require('../../assets/onboarding/anatomy/male-back.png'),
  },
  female: {
    front: require('../../assets/onboarding/anatomy/female-front.png'),
    back:  require('../../assets/onboarding/anatomy/female-back.png'),
  },
} as const;
