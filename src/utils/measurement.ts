export type StressInput = {
  dailyChanges: number[];
  highMacroCount: number;
  mediumMacroCount: number;
};

export type StressResult = {
  score: number;
  label: 'Elevated' | 'Watch' | 'Contained';
  breadth: number | null;
  avgMove: number | null;
  breadthStress: number;
  moveStress: number;
  macroLoad: number;
  freshCount: number;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function calculateStressScore(input: StressInput): StressResult {
  const moves = input.dailyChanges.filter((value) => Number.isFinite(value));
  const breadth = moves.length
    ? moves.filter((value) => value >= 0).length / moves.length
    : null;
  const avgMove = moves.length
    ? moves.reduce((sum, value) => sum + value, 0) / moves.length
    : null;
  const breadthStress = breadth == null ? 0 : (1 - breadth) * 40;
  const moveStress = avgMove == null ? 0 : clamp((-avgMove / 5) * 30, 0, 30);
  const macroLoad = clamp(
    Math.max(0, input.highMacroCount) * 12 + Math.max(0, input.mediumMacroCount) * 6,
    0,
    30,
  );
  const score = Math.round(clamp(breadthStress + moveStress + macroLoad, 0, 100));

  return {
    score,
    label: score >= 70 ? 'Elevated' : score >= 45 ? 'Watch' : 'Contained',
    breadth,
    avgMove,
    breadthStress,
    moveStress,
    macroLoad,
    freshCount: moves.length,
  };
}

export function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function sampleQuality(n: number): 'limited' | 'moderate' | 'good' {
  if (n < 5) return 'limited';
  if (n < 10) return 'moderate';
  return 'good';
}

export function summarizeSample(values: number[]) {
  const clean = values.filter(Number.isFinite);
  const n = clean.length;
  const mean = n ? clean.reduce((sum, value) => sum + value, 0) / n : null;
  return {
    n,
    mean,
    median: median(clean),
    quality: sampleQuality(n),
  };
}
