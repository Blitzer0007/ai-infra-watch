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
  const macroLoad = clamp(
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

export function calculatePortfolioConcentration(inputs: PortfolioMetricInput[]): PortfolioConcentration {
  const values = inputs
    .map(item => ({
      symbol: item.symbol,
      value: Number.isFinite(item.currentValue ?? NaN) && (item.currentValue ?? 0) > 0
        ? item.currentValue as number
        : Math.max(0, item.investedValue),
      group: item.group || 'Unclassified',
    }))
    .filter(item => item.value > 0);
  const totalValue = values.reduce((sum, item) => sum + item.value, 0);
  const weights = totalValue
    ? values
        .map(item => ({ ...item, weight: item.value / totalValue }))
        .sort((a, b) => b.weight - a.weight)
    : [];
  const groupMap = new Map<string, number>();
  weights.forEach(item => groupMap.set(item.group, (groupMap.get(item.group) ?? 0) + item.value));
  const groupWeights = [...groupMap.entries()]
    .map(([group, value]) => ({ group, value, weight: totalValue ? value / totalValue : 0 }))
    .sort((a, b) => b.weight - a.weight);
  const hhi = weights.length ? weights.reduce((sum, item) => sum + item.weight ** 2, 0) : null;
  return {
    totalValue,
    weights,
    topHolding: weights[0] ?? null,
    top3Weight: weights.slice(0, 3).reduce((sum, item) => sum + item.weight, 0),
    groupWeights,
    hhi,
    effectiveHoldings: hhi && hhi > 0 ? 1 / hhi : null,
  };
}

export function calculatePortfolioAttribution(inputs: PortfolioMetricInput[]): PortfolioAttribution[] {
  const values = inputs
    .map(item => ({
      ...item,
      value: Number.isFinite(item.currentValue ?? NaN) && (item.currentValue ?? 0) > 0
        ? item.currentValue as number
        : Math.max(0, item.investedValue),
    }))
    .filter(item => item.value > 0);
  const total = values.reduce((sum, item) => sum + item.value, 0);
  const totalPnl = inputs.reduce((sum, item) => sum + (Number.isFinite(item.pnl) ? item.pnl : 0), 0);
  return values
    .map(item => ({
      ...item,
      weight: total ? item.value / total : 0,
      pnlContribution: Number.isFinite(item.pnl) ? item.pnl : 0,
      pnlContributionPct: totalPnl !== 0 ? (item.pnl / totalPnl) * 100 : null,
    }))
    .sort((a, b) => Math.abs(b.pnlContribution) - Math.abs(a.pnlContribution));
}

function returnMap(history: HistoricalPricePoint[]) {
  const map = new Map<string, number>();
  for (let i = 1; i < history.length; i++) {
    const previous = Number(history[i - 1]?.price);
    const current = Number(history[i]?.price);
    if (previous > 0 && current > 0) map.set(history[i].date, (current / previous - 1) * 100);
  }
  return map;
}

export function buildPortfolioDailySeries(
  histories: Record<string, HistoricalPricePoint[]>,
  weights: Record<string, number>,
  days = 30,
): PortfolioDailyPoint[] {
  const returnsBySymbol = Object.fromEntries(
    Object.entries(histories).map(([symbol, history]) => [symbol, returnMap(history)]),
  ) as Record<string, Map<string, number>>;
  const dates = [...new Set(Object.values(returnsBySymbol).flatMap(map => [...map.keys()]))].sort();
  const activeDates = dates.slice(-Math.max(1, days));
  return activeDates
    .map(date => {
      const rows = Object.entries(returnsBySymbol)
        .map(([symbol, map]) => ({ symbol, value: map.get(date), weight: weights[symbol] ?? 0 }))
        .filter(row => Number.isFinite(row.value) && row.weight > 0) as Array<{symbol:string;value:number;weight:number}>;
      const weightTotal = rows.reduce((sum, row) => sum + row.weight, 0);
      if (!weightTotal) return null;
      const returnPct = rows.reduce((sum, row) => sum + row.value * (row.weight / weightTotal), 0);
      const breadth = rows.reduce((sum, row) => sum + (row.value >= 0 ? row.weight / weightTotal : 0), 0);
      const stressScore = Math.round(clamp((1 - breadth) * 40 + clamp((-returnPct / 5) * 30, 0, 30), 0, 100));
      return { date, returnPct, stressScore };
    })
    .filter((row): row is PortfolioDailyPoint => row != null);
}

export function comparePortfolioToBenchmarks(
  portfolioHistory: HistoricalPricePoint[],
  benchmarkHistories: Record<string, HistoricalPricePoint[]>,
): BenchmarkComparison[] {
  const portfolioReturns = returnMap(portfolioHistory);
  const results: BenchmarkComparison[] = [];
  for (const [benchmark, history] of Object.entries(benchmarkHistories)) {
    const benchmarkReturns = returnMap(history);
    const dates = [...portfolioReturns.keys()].filter(date => benchmarkReturns.has(date)).sort();
    if (!dates.length) {
      results.push({ benchmark, portfolioReturnPct: null, benchmarkReturnPct: null, relativeReturnPct: null, startDate: null, endDate: null, sampleDays: 0 });
      continue;
    }
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];
    const portfolioReturnPct = [...dates].reduce((value, date) => value * (1 + (portfolioReturns.get(date) ?? 0) / 100), 1) * 100 - 100;
    const benchmarkReturnPct = [...dates].reduce((value, date) => value * (1 + (benchmarkReturns.get(date) ?? 0) / 100), 1) * 100 - 100;
    results.push({
      benchmark,
      portfolioReturnPct,
      benchmarkReturnPct,
      relativeReturnPct: portfolioReturnPct - benchmarkReturnPct,
      startDate,
      endDate,
      sampleDays: dates.length,
    });
  }
  return results;
}

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
