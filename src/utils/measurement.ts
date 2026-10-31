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

function toPriceMap(history: HistoricalPricePoint[] = []) {
  return new Map(
    [...history]
      .filter(point => point?.date && Number.isFinite(Number(point.price)) && Number(point.price) > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(point => [point.date, Number(point.price)]),
  );
}
export function buildPortfolioDailySeriesFromTransactions(
  histories: Record<string, HistoricalPricePoint[]>,
  transactions: Array<{ symbol: string; transactionType: 'BUY' | 'SELL'; quantity: number; tradeDate: string; sourceRow?: number }>,
  days = 30,
): PortfolioDailyPoint[] {
  // Include every symbol present in the transaction ledger, even when its
  // history request failed. Otherwise a missing holding would silently vanish
  // from the portfolio denominator and the remaining symbols would be
  // reweighted as if they represented the entire portfolio.
  const symbolFilter = new Set([
    ...Object.keys(histories),
    ...transactions.map(row => String(row.symbol || '')),
  ].map(symbol => symbol.trim().toUpperCase()).filter(Boolean));
  const cleanHistories = histories;
  const dates = [...new Set(Object.values(cleanHistories).flatMap(history => history.map(point => point.date)))].sort();
  const activeDates = dates.slice(-Math.max(1, days + 1));
  const priceMaps = Object.fromEntries(
    Object.entries(cleanHistories).map(([symbol, history]) => [
      symbol.toUpperCase(),
      new Map(history.map(point => [point.date, Number(point.price)])),
    ]),
  ) as Record<string, Map<string, number>>;

  const quantities: Record<string, number> = {};
  const orderedTransactions = [...transactions].sort(
    (a, b) => a.tradeDate.localeCompare(b.tradeDate) || Number(a.sourceRow || 0) - Number(b.sourceRow || 0),
  );
  let transactionIndex = 0;
  const result: PortfolioDailyPoint[] = [];

  for (let i = 0; i < activeDates.length; i++) {
    const date = activeDates[i];
    while (transactionIndex < orderedTransactions.length && orderedTransactions[transactionIndex].tradeDate < date) {
      const row = orderedTransactions[transactionIndex++];
      const symbol = String(row.symbol || '').toUpperCase();
      const quantity = Number(row.quantity);
      if (!symbolFilter.has(symbol) || !(quantity > 0)) continue;
      quantities[symbol] = row.transactionType === 'SELL'
        ? Math.max(0, (quantities[symbol] ?? 0) - quantity)
        : (quantities[symbol] ?? 0) + quantity;
    }

    if (i > 0) {
      const previousDate = activeDates[i - 1];
      const activePositions = Object.entries(quantities).filter(([, quantity]) => quantity > 0);
      const rows = activePositions.map(([symbol, quantity]) => {
        const previousPrice = priceMaps[symbol]?.get(previousDate);
        const currentPrice = priceMaps[symbol]?.get(date);
        if (!(Number.isFinite(previousPrice) && previousPrice > 0 && Number.isFinite(currentPrice) && currentPrice > 0)) {
          return null;
        }
        const value = quantity * previousPrice;
        const move = (currentPrice / previousPrice - 1) * 100;
        return Number.isFinite(value) && value > 0 && Number.isFinite(move)
          ? { symbol, move, value }
          : null;
      });
      // Never calculate a portfolio-wide return from only the symbols that
      // happen to have both prices. Withheld dates are safer than silently
      // redistributing missing holdings' weights across the available subset.
      const completeCoverage = activePositions.length > 0 && rows.every(row => row != null);
      const completeRows = rows.filter((row): row is { symbol: string; move: number; value: number } => row != null);
      const totalValue = completeRows.reduce((sum, row) => sum + row.value, 0);
      if (completeCoverage && totalValue > 0) {
        const returnPct = completeRows.reduce((sum, row) => sum + row.move * (row.value / totalValue), 0);
        const breadth = completeRows.reduce((sum, row) => sum + (row.move >= 0 ? row.value / totalValue : 0), 0);
        const stressScore = Math.round(clamp((1 - breadth) * 40 + clamp((-returnPct / 5) * 30, 0, 30), 0, 100));
        result.push({ date, returnPct, stressScore });
      }
    }

    while (transactionIndex < orderedTransactions.length && orderedTransactions[transactionIndex].tradeDate === date) {
      const row = orderedTransactions[transactionIndex++];
      const symbol = String(row.symbol || '').toUpperCase();
      const quantity = Number(row.quantity);
      if (!symbolFilter.has(symbol) || !(quantity > 0)) continue;
      quantities[symbol] = row.transactionType === 'SELL'
        ? Math.max(0, (quantities[symbol] ?? 0) - quantity)
        : (quantities[symbol] ?? 0) + quantity;
    }
  }
  return result.slice(-Math.max(1, days));
}

export function buildPortfolioPerformanceIndexFromTransactions(
  histories: Record<string, HistoricalPricePoint[]>,
  transactions: Array<{ symbol: string; transactionType: 'BUY' | 'SELL'; quantity: number; tradeDate: string; sourceRow?: number }>,
): PortfolioHistoryValuePoint[] {
  const daily = buildPortfolioDailySeriesFromTransactions(histories, transactions, 3650);
  if (!daily.length) return [];
  let indexed = 100;
  return daily.map((row) => {
    indexed *= 1 + row.returnPct / 100;
    return { date: row.date, value: indexed, normalizedValue: indexed };
  });
}


export function buildPortfolioDailySeries(
  histories: Record<string, HistoricalPricePoint[]>,
  weights: Record<string, number>,
  days = 30,
): PortfolioDailyPoint[] {
  const expected = Object.entries(weights)
    .filter(([, weight]) => Number.isFinite(weight) && weight > 0)
    .map(([symbol, weight]) => ({ symbol: symbol.toUpperCase(), weight, prices: toPriceMap(histories[symbol] || []) }));
  const expectedWeight = expected.reduce((sum, row) => sum + row.weight, 0);
  if (!expected.length || expectedWeight <= 0 || expected.some(row => row.prices.size === 0)) return [];
  const dates = [...new Set(expected.flatMap(row => [...row.prices.keys()]))].sort();
  const activeDates = dates.slice(-Math.max(1, days + 1));
  const result: PortfolioDailyPoint[] = [];
  for (let i = 1; i < activeDates.length; i++) {
    const previousDate = activeDates[i - 1];
    const date = activeDates[i];
    const rows = expected.map(row => {
      const previousPrice = row.prices.get(previousDate);
      const currentPrice = row.prices.get(date);
      if (!(previousPrice && currentPrice)) return null;
      const move = (currentPrice / previousPrice - 1) * 100;
      return Number.isFinite(move) ? { move, weight: row.weight } : null;
    });
    // Each observation must cover every positive-weight holding over the same
    // pair of market dates. Missing rows are withheld rather than reweighted.
    if (rows.some(row => row == null)) continue;
    const completeRows = rows.filter((row): row is { move: number; weight: number } => row != null);
    const returnPct = completeRows.reduce((sum, row) => sum + row.move * (row.weight / expectedWeight), 0);
    const breadth = completeRows.reduce((sum, row) => sum + (row.move >= 0 ? row.weight / expectedWeight : 0), 0);
    const stressScore = Math.round(clamp((1 - breadth) * 40 + clamp((-returnPct / 5) * 30, 0, 30), 0, 100));
    result.push({ date, returnPct, stressScore });
  }
  return result.slice(-Math.max(1, days));
}

export function comparePortfolioToBenchmarks(
  portfolioHistory: HistoricalPricePoint[],
  benchmarkHistories: Record<string, HistoricalPricePoint[]>,
): BenchmarkComparison[] {
  const portfolioPrices = toPriceMap(portfolioHistory);
  const results: BenchmarkComparison[] = [];
  for (const [benchmark, history] of Object.entries(benchmarkHistories)) {
    const benchmarkPrices = toPriceMap(history);
    const dates = [...portfolioPrices.keys()].filter(date => benchmarkPrices.has(date)).sort();
    if (dates.length < 2) {
      results.push({
        benchmark,
        portfolioReturnPct: null,
        benchmarkReturnPct: null,
        relativeReturnPct: null,
        startDate: null,
        endDate: null,
        sampleDays: 0,
      });
      continue;
    }
    // Calculate both series over the exact same pair of common price dates.
    // Intersecting separately calculated daily-return end dates can compare a
    // one-day portfolio return with a multi-day benchmark return after gaps.
    let portfolioGrowth = 1;
    let benchmarkGrowth = 1;
    for (let i = 1; i < dates.length; i++) {
      const previousDate = dates[i - 1];
      const currentDate = dates[i];
      portfolioGrowth *= (portfolioPrices.get(currentDate) as number) / (portfolioPrices.get(previousDate) as number);
      benchmarkGrowth *= (benchmarkPrices.get(currentDate) as number) / (benchmarkPrices.get(previousDate) as number);
    }
    const portfolioReturnPct = (portfolioGrowth - 1) * 100;
    const benchmarkReturnPct = (benchmarkGrowth - 1) * 100;
    results.push({
      benchmark,
      portfolioReturnPct,
      benchmarkReturnPct,
      relativeReturnPct: portfolioReturnPct - benchmarkReturnPct,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      sampleDays: dates.length - 1,
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