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


export type PortfolioHoldingHistoryInput = {
  symbol: string;
  quantity: number;
  averageCost: number;
};

export type PortfolioHistoryValuePoint = {
  date: string;
  value: number;
  normalizedValue: number;
};

export type PortfolioCorrelation = {
  symbols: string[];
  values: Record<string, Record<string, number | null>>;
  sampleDays: Record<string, Record<string, number>>;
};

function pearsonCorrelation(a: number[], b: number[]): number | null {
  if (a.length < 5 || a.length !== b.length) return null;
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  const centeredA = a.map(value => value - meanA);
  const centeredB = b.map(value => value - meanB);
  const numerator = centeredA.reduce((sum, value, index) => sum + value * centeredB[index], 0);
  const denominator = Math.sqrt(
    centeredA.reduce((sum, value) => sum + value ** 2, 0) *
    centeredB.reduce((sum, value) => sum + value ** 2, 0),
  );
  return denominator > 0 ? numerator / denominator : null;
}

export function buildPortfolioHistoryValue(
  histories: Record<string, HistoricalPricePoint[]>,
  holdings: PortfolioHoldingHistoryInput[],
): PortfolioHistoryValuePoint[] {
  const active = holdings.filter(item =>
    Number.isFinite(item.quantity) && item.quantity > 0 && Array.isArray(histories[item.symbol]) && histories[item.symbol].length,
  );
  if (!active.length) return [];
  const priceMaps = Object.fromEntries(
    active.map(item => [
      item.symbol,
      new Map(histories[item.symbol].map(point => [point.date, point.price])),
    ]),
  ) as Record<string, Map<string, number>>;
  const dates = [...new Set(active.flatMap(item => [...priceMaps[item.symbol].keys()]))].sort();
  const rows = dates.map(date => {
    const available = active
      .map(item => ({ item, price: priceMaps[item.symbol].get(date) }))
      .filter(row => Number.isFinite(row.price)) as Array<{ item: PortfolioHoldingHistoryInput; price: number }>;
    if (!available.length) return null;
    const value = available.reduce((sum, row) => sum + row.item.quantity * row.price, 0);
    return { date, value };
  }).filter((row): row is { date: string; value: number } => row != null && row.value > 0);
  const firstValue = rows[0]?.value ?? null;
  return rows.map(row => ({
    ...row,
    normalizedValue: firstValue ? (row.value / firstValue) * 100 : 100,
  }));
}

export function calculatePortfolioCorrelation(
  histories: Record<string, HistoricalPricePoint[]>,
  symbols: string[],
): PortfolioCorrelation {
  const selected = symbols.filter(symbol => Array.isArray(histories[symbol]) && histories[symbol].length);
  const returns = Object.fromEntries(selected.map(symbol => [symbol, returnMap(histories[symbol])])) as Record<string, Map<string, number>>;
  const values: Record<string, Record<string, number | null>> = {};
  const sampleDays: Record<string, Record<string, number>> = {};
  selected.forEach(left => {
    values[left] = {};
    sampleDays[left] = {};
    selected.forEach(right => {
      const dates = [...returns[left].keys()].filter(date => returns[right].has(date)).sort();
      const a = dates.map(date => returns[left].get(date) as number);
      const b = dates.map(date => returns[right].get(date) as number);
      values[left][right] = left === right ? 1 : pearsonCorrelation(a, b);
      sampleDays[left][right] = dates.length;
    });
  });
  return { symbols: selected, values, sampleDays };
}
\nexport type StressInput = {
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
export type ValidationMatrixDetail = {
  ticker: string;
  horizon: number;
  tests: number;
  direction: number;
  error: number;
  coverage50: number;
  coverage80: number;
  baselineDirection: number;
  baselineError: number;
};

export type ValidationMatrixSummary = {
  tests: number;
  direction: number;
  error: number;
  coverage50: number;
  coverage80: number;
  baselineDirection: number;
  baselineError: number;
  calibration: CalibrationBucket[];
  details: ValidationMatrixDetail[];
};

/** Aggregates independent ticker/horizon backtests without ranking or reweighting them. */
export function summarizeValidationMatrix(
  runs: Array<{ ticker: string; horizon: number; summary: {
    rows: Array<{ positiveProbability: number; actual: number; median: number }>;
    directionalAccuracy: number;
    medianAbsoluteError: number;
    p25p75Coverage: number;
    p10p90Coverage: number;
    baselineDirectionalAccuracy: number;
    baselineMedianAbsoluteError: number;
  } }>,
): ValidationMatrixSummary {
  const valid = runs.filter(item => item.summary.rows.length > 0);
  const rows = valid.flatMap(item => item.summary.rows);
  const avg = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const details = valid.map(item => ({
    ticker: item.ticker,
    horizon: item.horizon,
    tests: item.summary.rows.length,
    direction: item.summary.directionalAccuracy,
    error: item.summary.medianAbsoluteError,
    coverage50: item.summary.p25p75Coverage,
    coverage80: item.summary.p10p90Coverage,
    baselineDirection: item.summary.baselineDirectionalAccuracy,
    baselineError: item.summary.baselineMedianAbsoluteError,
  }));
  return {
    tests: rows.length,
    direction: avg(valid.map(item => item.summary.directionalAccuracy)),
    error: avg(valid.map(item => item.summary.medianAbsoluteError)),
    coverage50: avg(valid.map(item => item.summary.p25p75Coverage)),
    coverage80: avg(valid.map(item => item.summary.p10p90Coverage)),
    baselineDirection: avg(valid.map(item => item.summary.baselineDirectionalAccuracy)),
    baselineError: avg(valid.map(item => item.summary.baselineMedianAbsoluteError)),
    calibration: summarizeCalibration(rows.map(row => ({
      confidence: row.positiveProbability,
      positive: row.actual > 0,
      excessReturnPct: row.actual - row.median,
    }))),
    details,
  };
}

export type CalibrationBucket = {
  bucket: string;
  n: number;
  predictedPct: number;
  observedPositiveRate: number | null;
  meanExcessReturnPct: number | null;
  calibrationErrorPct: number | null;
};

/** Descriptive calibration only; it never changes measured outcomes. */
export function summarizeCalibration(
  observations: Array<{ confidence: number; positive: boolean; excessReturnPct?: number | null }>,
): CalibrationBucket[] {
  const buckets = [
    { label: '0–20%', min: 0, max: 0.2 },
    { label: '20–40%', min: 0.2, max: 0.4 },
    { label: '40–60%', min: 0.4, max: 0.6 },
    { label: '60–80%', min: 0.6, max: 0.8 },
    { label: '80–100%', min: 0.8, max: 1.000001 },
  ];
  return buckets.map(({ label, min, max }) => {
    const rows = observations.filter(item => Number.isFinite(item.confidence) && item.confidence >= min && item.confidence < max);
    const predictedPct = ((min + Math.min(max, 1)) / 2) * 100;
    const observedPositiveRate = rows.length ? rows.filter(item => item.positive).length / rows.length : null;
    const excess = rows.map(item => item.excessReturnPct).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const meanExcessReturnPct = excess.length ? excess.reduce((sum, value) => sum + value, 0) / excess.length : null;
    return {
      bucket: label,
      n: rows.length,
      predictedPct,
      observedPositiveRate,
      meanExcessReturnPct,
      calibrationErrorPct: observedPositiveRate == null ? null : observedPositiveRate * 100 - predictedPct,
    };
  });
}
