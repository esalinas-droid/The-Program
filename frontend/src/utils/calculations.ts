// ── e1RM Formulas ─────────────────────────────────────────────────────────────
export function epleyE1RM(weight: number, reps: number): number {
  if (!weight || !reps || weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

export function brzyckiE1RM(weight: number, reps: number): number {
  if (!weight || !reps || weight <= 0 || reps <= 0 || reps >= 37) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (36 / (37 - reps)));
}

// ── Unit Conversion ───────────────────────────────────────────────────────────
export function lbsToKg(lbs: number): number {
  return Math.round(lbs * 0.4536 * 100) / 100;
}

export function kgToLbs(kg: number): number {
  return Math.round(kg * 2.2046 * 100) / 100;
}

export function formatWeight(weight: number, units: 'lbs' | 'kg'): string {
  if (units === 'kg') return `${lbsToKg(weight).toFixed(1)} kg`;
  return `${weight} lbs`;
}

export function convertWeight(weight: number, fromUnit: 'lbs' | 'kg', toUnit: 'lbs' | 'kg'): number {
  if (fromUnit === toUnit) return weight;
  return fromUnit === 'lbs' ? lbsToKg(weight) : kgToLbs(weight);
}

// ── Percentage Table ──────────────────────────────────────────────────────────
export const PERCENT_TABLE = [100, 97.5, 95, 92.5, 90, 87.5, 85, 80, 75, 70, 65, 60];

export function getPercentageTableRows(e1rm: number, units: 'lbs' | 'kg') {
  return PERCENT_TABLE.map(pct => {
    const lbsVal = Math.round(e1rm * pct / 100);
    const kgVal = lbsToKg(lbsVal);
    return { pct, lbs: lbsVal, kg: kgVal };
  });
}

// ── Plate Math ────────────────────────────────────────────────────────────────
const LBS_PLATES = [45, 25, 10, 5, 2.5];
const KG_PLATES = [20, 15, 10, 5, 2.5, 1.25];

export interface PlateMathResult {
  possible: boolean;
  platesPerSide: Array<{ weight: number; count: number }>;
  totalWeight: number;
  remainder: number;
}

export function calculatePlateMath(
  targetWeight: number, barWeight: number, unit: 'lbs' | 'kg'
): PlateMathResult {
  const plates = unit === 'kg' ? KG_PLATES : LBS_PLATES;
  const weightOnBar = targetWeight - barWeight;
  if (weightOnBar < 0) return { possible: false, platesPerSide: [], totalWeight: barWeight, remainder: 0 };
  
  let remaining = weightOnBar / 2;
  const platesPerSide: Array<{ weight: number; count: number }> = [];
  
  for (const plate of plates) {
    if (remaining >= plate) {
      const count = Math.floor(remaining / plate);
      platesPerSide.push({ weight: plate, count });
      remaining = Math.round((remaining - count * plate) * 100) / 100;
    }
  }
  
  const loaded = platesPerSide.reduce((sum, p) => sum + p.weight * p.count * 2, 0) + barWeight;
  return {
    possible: remaining < 0.1,
    platesPerSide,
    totalWeight: loaded,
    remainder: remaining
  };
}

// ── Program Calculations ──────────────────────────────────────────────────────
export const DELOAD_WEEKS = [4, 8, 12, 20, 24, 28, 32, 36, 40, 44, 48, 52];

export function getBlock(week: number): number {
  if (week <= 4) return 1;
  if (week <= 8) return 2;
  if (week <= 12) return 3;
  if (week <= 20) return 4;
  if (week <= 32) return 5;
  if (week <= 44) return 6;
  return 7;
}

export function getBlockName(block: number): string {
  const names: Record<number, string> = {
    1: 'Rebuild / Recomp / Movement Quality',
    2: 'Build — Symptom-Aware Strength',
    3: 'Intensify — Event Confidence',
    4: 'Volume-Strength',
    5: 'Strength Emphasis',
    6: 'Event / Peak Preparation',
    7: 'Flexible / Pivot',
  };
  return names[block] || 'Unknown';
}

export function getPhase(week: number): string {
  if (DELOAD_WEEKS.includes(week)) return 'Deload';
  const prevDeload = Math.max(0, ...DELOAD_WEEKS.filter(d => d < week));
  const pos = ((week - prevDeload - 1) % 3) + 1;
  return ['Intro', 'Build', 'Peak'][pos - 1];
}

export function getWavePosition(week: number): 1 | 2 | 3 | 4 {
  if (DELOAD_WEEKS.includes(week)) return 4;
  const prevDeload = Math.max(0, ...DELOAD_WEEKS.filter(d => d < week));
  const pos = ((week - prevDeload - 1) % 3) + 1;
  return pos as 1 | 2 | 3;
}

export function getCurrentWeekFromDate(startDateStr: string): number {
  const start = new Date(startDateStr);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 1;
  const week = Math.floor(diffDays / 7) + 1;
  return Math.min(Math.max(week, 1), 52);
}

export function isDeloadWeek(week: number): boolean {
  return DELOAD_WEEKS.includes(week);
}
