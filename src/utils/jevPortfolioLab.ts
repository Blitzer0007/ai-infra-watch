export type PaperHolding = { symbol: string; weight: number; sector: string };
export type DatedObservation = { symbol: string; price: number; observedAt: string; availableAt: string };
export type PaperTrade = { symbol: string; fromWeight: number; toWeight: number; notional: number; cost: number };
export type PaperRebalance = {
  decisionAt: string;
  executionAt: string;
  portfolioValue: number;
  costBps: number;
  trades: PaperTrade[];
  totalCost: number;
  cashWeight: number;
};

const finite = (n: number) => Number.isFinite(n);
const dateMs = (s: string) => Date.parse(s);

export function validatePointInTimeInputs(observations: DatedObservation[], decisionAt: string, executionAt: string) {
  const decision = dateMs(decisionAt), execution = dateMs(executionAt);
  if (!finite(decision) || !finite(execution) || execution <= decision) throw new Error('Execution must occur after the decision timestamp.');
  for (const row of observations) {
    if (!row.symbol || !finite(row.price) || row.price <= 0) throw new Error('Observations require a symbol and positive finite price.');
    const observed = dateMs(row.observedAt), available = dateMs(row.availableAt);
    if (!finite(observed) || !finite(available)) throw new Error('Observation timestamps must be valid ISO dates.');
    if (observed > decision || available > decision) throw new Error('Look-ahead data rejected: observation was not available at decision time.');
  }
  return true;
}

export function buildPaperRebalance(args: {
  current: PaperHolding[];
  target: PaperHolding[];
  portfolioValue: number;
  decisionAt: string;
  executionAt: string;
  costBps?: number;
  maxPositionWeight?: number;
  maxSectorWeight?: number;
  minCashWeight?: number;
  observations?: DatedObservation[];
}): PaperRebalance {
  const { current, target, portfolioValue, decisionAt, executionAt } = args;
  const costBps = args.costBps ?? 10;
  const maxPositionWeight = args.maxPositionWeight ?? 0.15;
  const maxSectorWeight = args.maxSectorWeight ?? 0.35;
  const minCashWeight = args.minCashWeight ?? 0.05;
  if (!finite(portfolioValue) || portfolioValue <= 0) throw new Error('Portfolio value must be positive.');
  if (!finite(costBps) || costBps < 0 || costBps > 500) throw new Error('Cost assumption must be between 0 and 500 basis points.');
  if (args.observations) validatePointInTimeInputs(args.observations, decisionAt, executionAt);
  const seen = new Set<string>();
  for (const h of target) {
    if (!h.symbol || seen.has(h.symbol)) throw new Error('Target holdings must have unique symbols.');
    seen.add(h.symbol);
    if (!finite(h.weight) || h.weight < 0 || h.weight > maxPositionWeight) throw new Error('Position limit exceeded.');
  }
  const sectorWeights = new Map<string, number>();
  for (const h of target) sectorWeights.set(h.sector, (sectorWeights.get(h.sector) ?? 0) + h.weight);
  for (const weight of sectorWeights.values()) if (weight > maxSectorWeight + 1e-9) throw new Error('Sector concentration limit exceeded.');
  const investedWeight = target.reduce((sum, h) => sum + h.weight, 0);
  const cashWeight = 1 - investedWeight;
  if (cashWeight < minCashWeight - 1e-9) throw new Error('Minimum cash reserve breached.');
  const currentMap = new Map(current.map(h => [h.symbol, h.weight]));
  const targetMap = new Map(target.map(h => [h.symbol, h]));
  const symbols = new Set([...currentMap.keys(), ...targetMap.keys()]);
  const trades: PaperTrade[] = [];
  for (const symbol of symbols) {
    const fromWeight = currentMap.get(symbol) ?? 0;
    const toWeight = targetMap.get(symbol)?.weight ?? 0;
    const notional = Math.abs(toWeight - fromWeight) * portfolioValue;
    if (notional > 0.005) trades.push({ symbol, fromWeight, toWeight, notional, cost: notional * costBps / 10000 });
  }
  return { decisionAt, executionAt, portfolioValue, costBps, trades, totalCost: trades.reduce((sum, trade) => sum + trade.cost, 0), cashWeight };
}

export function netReturnPct(grossReturnPct: number, turnoverDollars: number, portfolioValue: number, costBps: number) {
  if (![grossReturnPct, turnoverDollars, portfolioValue, costBps].every(finite) || portfolioValue <= 0 || turnoverDollars < 0 || costBps < 0) {
    throw new Error('Invalid return or transaction-cost inputs.');
  }
  return grossReturnPct - (turnoverDollars * costBps / 10000 / portfolioValue) * 100;
}

export const PAPER_LAB_DEFAULTS = {
  initialCapital: 10000,
  reviewFrequency: 'weekly',
  universe: 'US equities',
  benchmarks: ['SPY', 'QQQ'] as const,
  executionMode: 'manual approval; paper only',
  costBps: 10,
  maxPositionWeight: 0.15,
  maxSectorWeight: 0.35,
  minCashWeight: 0.05,
};


export type HistoricalPrice = {
  symbol: string;
  date: string;
  close: number;
  availableAt: string;
  adjusted?: boolean;
  availabilityStatus?: 'verified' | 'assumed' | 'unknown';
};

export type HistoricalBacktestResult = {
  startDate: string;
  endDate: string;
  observations: number;
  strategyReturnPct: number;
  spyReturnPct: number;
  qqqReturnPct: number;
  strategyNetReturnPct: number;
  excessVsSpyPct: number;
  excessVsQqqPct: number;
  totalTransactionCostsPct: number;
  maxDrawdownPct: number;
  rebalanceCount: number;
  adjustedPricesComplete: boolean;
  pointInTimeVerified: boolean;
  availabilityStatus: 'verified' | 'assumed' | 'unknown';
  evidenceStatus: 'insufficient' | 'ready';
};

/**
 * Deterministic close-to-close paper backtest over caller-supplied adjusted close history.
 * Input must use the same dates for every held symbol and both benchmarks.
 * Holdings drift between weekly rebalances; costs apply to traded notional at entry and each rebalance.
 * Provider availability timestamps may be assumed rather than verified; that keeps evidenceStatus
 * insufficient until a trusted point-in-time history source is available.
 */
export function runHistoricalPaperBacktest(args: {
  prices: HistoricalPrice[];
  target: PaperHolding[];
  startCapital: number;
  costBps?: number;
  decisionCutoffByDate?: Record<string, string>;
  minimumObservations?: number;
  maxPositionWeight?: number;
  maxSectorWeight?: number;
  minCashWeight?: number;
  rebalanceEverySessions?: number;
}): HistoricalBacktestResult {
  const { prices, target, startCapital } = args;
  const costBps = args.costBps ?? 10;
  const minimumObservations = args.minimumObservations ?? 50;
  const rebalanceEverySessions = args.rebalanceEverySessions ?? 5;
  if (!Number.isInteger(rebalanceEverySessions) || rebalanceEverySessions < 1 || rebalanceEverySessions > 252) {
    throw new Error('Rebalance cadence must be between 1 and 252 trading sessions.');
  }
  if (!finite(startCapital) || startCapital <= 0) throw new Error('Starting capital must be positive.');
  if (!finite(costBps) || costBps < 0 || costBps > 500) throw new Error('Cost assumption must be between 0 and 500 basis points.');
  const maxPositionWeight = args.maxPositionWeight ?? PAPER_LAB_DEFAULTS.maxPositionWeight;
  const maxSectorWeight = args.maxSectorWeight ?? PAPER_LAB_DEFAULTS.maxSectorWeight;
  const minCashWeight = args.minCashWeight ?? PAPER_LAB_DEFAULTS.minCashWeight;
  if (![maxPositionWeight, maxSectorWeight, minCashWeight].every(finite) ||
      maxPositionWeight <= 0 || maxPositionWeight > 1 ||
      maxSectorWeight <= 0 || maxSectorWeight > 1 ||
      minCashWeight < 0 || minCashWeight >= 1) {
    throw new Error('Invalid historical backtest risk limits.');
  }
  if (!target.length) throw new Error('Target holdings are required.');
  const seenSymbols = new Set<string>();
  const sectorWeights = new Map<string, number>();
  for (const holding of target) {
    const symbol = String(holding.symbol || '').trim().toUpperCase();
    const sector = String(holding.sector || '').trim().toLowerCase();
    if (!symbol || !sector || seenSymbols.has(symbol)) throw new Error('Target holdings require unique symbols and sectors.');
    seenSymbols.add(symbol);
    if (!finite(holding.weight) || holding.weight < 0 || holding.weight > maxPositionWeight + 1e-9) {
      throw new Error('Historical backtest position limit exceeded.');
    }
    sectorWeights.set(sector, (sectorWeights.get(sector) ?? 0) + holding.weight);
  }
  for (const weight of sectorWeights.values()) {
    if (weight > maxSectorWeight + 1e-9) throw new Error('Historical backtest sector concentration limit exceeded.');
  }
  const investedWeight = target.reduce((sum, holding) => sum + holding.weight, 0);
  if (investedWeight > 1 - minCashWeight + 1e-9) throw new Error('Historical backtest minimum cash reserve breached.');
  const symbols = [...new Set([...target.map(h=>h.symbol.toUpperCase()), 'SPY', 'QQQ'])];
  const byDate = new Map<string, Map<string, HistoricalPrice>>();
  for (const row of prices) {
    if (!symbols.includes(row.symbol)) continue;
    const t = Date.parse(row.date), available = Date.parse(row.availableAt);
    if (!row.symbol || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !finite(t) || !finite(available) || !finite(row.close) || row.close <= 0) throw new Error('Historical prices require valid dates, availability timestamps, and positive finite closes.');
    if (row.adjusted === false) throw new Error('Adjusted closes are required for strategy and benchmark return calculations.');
    const cutoff = args.decisionCutoffByDate?.[row.date];
    if (cutoff && (!finite(Date.parse(cutoff)) || available > Date.parse(cutoff) || t > Date.parse(cutoff))) throw new Error('Look-ahead data rejected by historical backtest.');
    if (!byDate.has(row.date)) byDate.set(row.date, new Map());
    const day = byDate.get(row.date)!;
    if (day.has(row.symbol)) throw new Error('Duplicate historical price for symbol/date.');
    day.set(row.symbol, row);
  }
  // Do not silently drop partial dates: that can hide gaps in an input history and make a backtest look healthier than its evidence supports. Every supplied date must contain the strategy holdings and both benchmarks.
  for (const [date, day] of byDate) {
    const missing = symbols.filter(symbol => !day.has(symbol));
    if (missing.length) throw new Error(`Historical prices must have common dates for portfolio and both benchmarks; ${date} is missing: ${missing.join(', ')}.`);
  }
  const dates = [...byDate.keys()].sort((a,b)=>Date.parse(a)-Date.parse(b));
  if (dates.length < 2) throw new Error('Insufficient common historical dates for strategy and both benchmarks.');
  for (let i=1;i<dates.length;i++) if (Date.parse(dates[i]) <= Date.parse(dates[i-1])) throw new Error('Historical dates must be strictly increasing.');
  const relevantPrices = prices.filter(row => symbols.includes(row.symbol.toUpperCase()));
  const adjustedPricesComplete = relevantPrices.every(row => row.adjusted === true);
  // Provider labels alone cannot prove point-in-time integrity: every decision date
  // needs an explicit cutoff and every used price must have been available by it.
  const pointInTimeVerified = dates.every(date => {
    const rawCutoff = args.decisionCutoffByDate?.[date];
    const cutoff = rawCutoff ? Date.parse(rawCutoff) : NaN;
    if (!finite(cutoff)) return false;
    const day = byDate.get(date)!;
    return [...day.values()].every(row => Date.parse(row.availableAt) <= cutoff && Date.parse(row.date) <= cutoff);
  });
  const availabilityStatuses = relevantPrices.map(row => row.availabilityStatus || 'unknown');
  const availabilityStatus: HistoricalBacktestResult['availabilityStatus'] =
    availabilityStatuses.length > 0 && availabilityStatuses.every(status => status === 'verified')
      ? 'verified'
      : availabilityStatuses.some(status => status === 'assumed') ? 'assumed' : 'unknown';

  let strategyValue = startCapital;
  let spyValue = startCapital;
  let qqqValue = startCapital;
  let peak = startCapital;
  let maxDrawdown = 0;
  let costsDollars = 0;
  let rebalanceCount = 0;
  let driftedWeights = new Map<string, number>(target.map(h => [h.symbol.toUpperCase(), h.weight]));

  // Entry costs are charged once on the initial invested notional, not on cash.
  const initialTurnover = target.reduce((sum, holding) => sum + holding.weight, 0) * strategyValue;
  const initialCost = initialTurnover * costBps / 10000;
  strategyValue -= initialCost;
  costsDollars += initialCost;
  if (initialTurnover > 0) rebalanceCount += 1;

  for (let i = 1; i < dates.length; i++) {
    const prior = byDate.get(dates[i - 1])!;
    const current = byDate.get(dates[i])!;
    const cashWeight = Math.max(0, 1 - [...driftedWeights.values()].reduce((sum, weight) => sum + weight, 0));
    let dailyMultiplier = cashWeight;
    const nextWeights = new Map<string, number>();
    for (const holding of target) {
      const symbol = holding.symbol.toUpperCase();
      const periodMultiplier = current.get(symbol)!.close / prior.get(symbol)!.close;
      const priorWeight = driftedWeights.get(symbol) ?? 0;
      dailyMultiplier += priorWeight * periodMultiplier;
      nextWeights.set(symbol, priorWeight * periodMultiplier);
    }
    if (!finite(dailyMultiplier) || dailyMultiplier <= 0) throw new Error('Historical return multiplier is invalid.');
    strategyValue *= dailyMultiplier;
    for (const [symbol, weight] of nextWeights) nextWeights.set(symbol, weight / dailyMultiplier);
    driftedWeights = nextWeights;

    spyValue *= current.get('SPY')!.close / prior.get('SPY')!.close;
    qqqValue *= current.get('QQQ')!.close / prior.get('QQQ')!.close;

    // Rebalance after each completed five-session block, leaving the final observation untouched.
    if (i < dates.length - 1 && i % rebalanceEverySessions === 0) {
      const turnover = target.reduce((sum, holding) => {
        const symbol = holding.symbol.toUpperCase();
        return sum + Math.abs(holding.weight - (driftedWeights.get(symbol) ?? 0));
      }, 0) * strategyValue;
      const cost = turnover * costBps / 10000;
      strategyValue -= cost;
      costsDollars += cost;
      if (turnover > 0.005) rebalanceCount += 1;
      driftedWeights = new Map(target.map(holding => [holding.symbol.toUpperCase(), holding.weight]));
    }

    peak = Math.max(peak, strategyValue);
    maxDrawdown = Math.min(maxDrawdown, (strategyValue / peak - 1) * 100);
  }
  const strategyReturnPct = (strategyValue / startCapital - 1) * 100;
  const spyReturnPct = (spyValue / startCapital - 1) * 100;
  const qqqReturnPct = (qqqValue / startCapital - 1) * 100;
  return {
    startDate: dates[0], endDate: dates[dates.length - 1], observations: dates.length,
    strategyReturnPct, spyReturnPct, qqqReturnPct,
    strategyNetReturnPct: strategyReturnPct,
    excessVsSpyPct: strategyReturnPct - spyReturnPct,
    excessVsQqqPct: strategyReturnPct - qqqReturnPct,
    totalTransactionCostsPct: costsDollars / startCapital * 100,
    maxDrawdownPct: maxDrawdown,
    rebalanceCount,
    adjustedPricesComplete,
    pointInTimeVerified,
    availabilityStatus,
    evidenceStatus: dates.length - 1 >= minimumObservations && adjustedPricesComplete && pointInTimeVerified && availabilityStatus === 'verified' ? 'ready' : 'insufficient',
  };
}
