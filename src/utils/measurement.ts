export type PortfolioMetricInput = {
  symbol: string;
  investedValue: number;
  currentValue: number | null;
  pnl: number;
  pnlPct: number;
  dailyChangePct: number | null;
  group: string;
};

export type PortfolioWeight = {
  symbol: string;
  value: number;
  weight: number;
  group: string;
};

export type PortfolioAttribution = PortfolioMetricInput & {
  weight: number;
  pnlContribution: number;
  pnlContributionPct: number | null;
};

export type PortfolioConcentration = {
  totalValue: number;
  weights: PortfolioWeight[];
  topHolding: PortfolioWeight | null;
  top3Weight: number;
  groupWeights: Array<{ group: string; value: number; weight: number }>;
  hhi: number | null;
  effectiveHoldings: number | null;
};

export type PortfolioStressResult = StressResult & {
  weightedAvgMove: number | null;
  weightedBreadth: number | null;
  concentrationPenalty: number;
};

export type HistoricalPricePoint = {
  date: string;
  price: number;
};

export type PortfolioDailyPoint = {
  date: string;
  returnPct: number;
  stressScore: number;
};

export type BenchmarkComparison = {
  benchmark: string;
  portfolioReturnPct: number | null;
  benchmarkReturnPct: number | null;
  relativeReturnPct: number | null;
  startDate: string | null;
  endDate: string | null;
  sampleDays: number;
};

export function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }

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

export function calculatePortfolioStressScore(
  inputs: PortfolioMetricInput[],
  highMacroCount = 0,
  mediumMacroCount = 0,
  macroLoadOverride?: number,
): PortfolioStressResult {
  const valid = inputs.filter(item =>
    Number.isFinite(item.dailyChangePct ?? NaN) &&
    Number.isFinite(item.currentValue ?? NaN) &&
    (item.currentValue ?? 0) > 0
  );
  const total = valid.reduce((sum, item) => sum + (item.currentValue ?? 0), 0);
  const weightedMoves = total
    ? valid.map(item => ({
        move: item.dailyChangePct as number,
        weight: (item.currentValue as number) / total,
      }))
    : [];
  const weightedAvgMove = weightedMoves.length
    ? weightedMoves.reduce((sum, item) => sum + item.move * item.weight, 0)
    : null;
  const weightedBreadth = weightedMoves.length
    ? weightedMoves.reduce((sum, item) => sum + (item.move >= 0 ? item.weight : 0), 0)
    : null;
  const breadthStress = weightedBreadth == null ? 0 : (1 - weightedBreadth) * 40;
  const moveStress = weightedAvgMove == null ? 0 : clamp((-weightedAvgMove / 5) * 30, 0, 30);
  const macroLoad = Number.isFinite(macroLoadOverride)
    ? clamp(Number(macroLoadOverride), 0, 30)
    : clamp(
      Math.max(0, highMacroCount) * 12 + Math.max(0, mediumMacroCount) * 6,
      0,
      30,
    );
  const concentration = calculatePortfolioConcentration(inputs);
  const concentrationPenalty = concentration.hhi == null
    ? 0
    : clamp(Math.max(0, concentration.hhi - 0.15) * 20, 0, 5);
  const score = Math.round(clamp(breadthStress + moveStress + macroLoad + concentrationPenalty, 0, 100));

  return {
    score,
    label: score >= 70 ? 'Elevated' : score >= 45 ? 'Watch' : 'Contained',
    breadth: weightedBreadth,
    avgMove: weightedAvgMove,
    breadthStress,
    moveStress,
    macroLoad,
    freshCount: valid.length,
    weightedAvgMove,
    weightedBreadth,
    concentrationPenalty,
  };
}

export function applyStressHysteresis(
  previousScore: number | null,
  rawScore: number,
  deadband = 4,
): number {
  const next = clamp(Math.round(rawScore), 0, 100);
  if (previousScore == null || !Number.isFinite(previousScore)) return next;
  return Math.abs(next - previousScore) <= Math.max(0, deadband)
    ? Math.round(previousScore)
    : next;
}

export function calculatePortfolioConcentration(inputs: PortfolioMetricInput[]): PortfolioConcentration {
  const values = inputs
    .map(item => ({
      symbol: item.symbol,
      value: Number.isFinite(item.currentValue ?? NaN) && (item.currentValue ?? 0) > 0
        ? item.currentValue as number
        : Math.max(0, item.investedValue),
      group: item.group || 'Unclassified',