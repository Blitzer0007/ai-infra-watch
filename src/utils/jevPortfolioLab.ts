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
  evidenceStatus: 'insufficient' | 'ready';
};

/**
 * Deterministic point-in-time backtest over caller-supplied adjusted close history.
 * Input must use the same dates for every held symbol and both benchmarks.
 * Rebalances to target weights at each close; costs apply to changes in weights.
 * This intentionally does not fetch prices or manufacture missing observations.
 */
export function runHistoricalPaperBacktest(args: {
  prices: HistoricalPrice[];
  target: PaperHolding[];
  startCapital: number;
  costBps?: number;
  decisionCutoffByDate?: Record<string, string>;
  minimumObservations?: number;
}): HistoricalBacktestResult {
  const { prices, target, startCapital } = args;
  const costBps = args.costBps ?? 10;
  const minimumObservations = args.minimumObservations ?? 50;
  if (!finite(startCapital) || startCapital <= 0) throw new Error('Starting capital must be positive.');
  if (!finite(costBps) || costBps < 0 || costBps > 500) throw new Error('Cost assumption must be between 0 and 500 basis points.');
  if (!target.length || target.some(h => !h.symbol || !finite(h.weight) || h.weight < 0) || target.reduce((s,h)=>s+h.weight,0) > 0.95 + 1e-9) throw new Error('Invalid target weights or cash reserve.');
  const symbols = [...new Set([...target.map(h=>h.symbol), 'SPY', 'QQQ'])];
  const byDate = new Map<string, Map<string, HistoricalPrice>>();
  for (const row of prices) {
    if (!symbols.includes(row.symbol)) continue;
    const t = Date.parse(row.date), available = Date.parse(row.availableAt);
    if (!row.symbol || !finite(t) || !finite(available) || !finite(row.close) || row.close <= 0) throw new Error('Historical prices require valid dates, availability timestamps, and positive finite closes.');
    const cutoff = args.decisionCutoffByDate?.[row.date];
    if (cutoff && (!finite(Date.parse(cutoff)) || available > Date.parse(cutoff) || t > Date.parse(cutoff))) throw new Error('Look-ahead data rejected by historical backtest.');
    if (!byDate.has(row.date)) byDate.set(row.date, new Map());
    const day = byDate.get(row.date)!;
    if (day.has(row.symbol)) throw new Error('Duplicate historical price for symbol/date.');
    day.set(row.symbol, row);
  }
  const dates = [...byDate.keys()].sort((a,b)=>Date.parse(a)-Date.parse(b)).filter(date => symbols.every(symbol=>byDate.get(date)?.has(symbol)));
  if (dates.length < 2) throw new Error('Insufficient common historical dates for strategy and both benchmarks.');
  for (let i=1;i<dates.length;i++) if (Date.parse(dates[i]) <= Date.parse(dates[i-1])) throw new Error('Historical dates must be strictly increasing.');
  let strategyValue=startCapital, spyValue=startCapital, qqqValue=startCapital, peak=startCapital, maxDrawdown=0, costsDollars=0;
  let driftedWeights = new Map<string,number>();
  for(let i=1;i<dates.length;i++){
    const prior=byDate.get(dates[i-1])!, current=byDate.get(dates[i])!;
    const turnover=target.reduce((sum,h)=>sum+Math.abs(h.weight-(driftedWeights.get(h.symbol)??0)),0)*strategyValue;
    const cost=turnover*costBps/10000;
    costsDollars += cost;
    strategyValue -= cost;
    let grossMultiplier=1;
    const nextWeights = new Map<string,number>();
    for(const h of target){
      const periodMultiplier=current.get(h.symbol)!.close/prior.get(h.symbol)!.close;
      grossMultiplier += h.weight*(periodMultiplier-1);
      nextWeights.set(h.symbol,h.weight*periodMultiplier);
    }
    strategyValue *= grossMultiplier;
    if(grossMultiplier>0) for(const [symbol,weight] of nextWeights) nextWeights.set(symbol,weight/grossMultiplier);
    driftedWeights=nextWeights;
    spyValue *= current.get('SPY')!.close/prior.get('SPY')!.close;
    qqqValue *= current.get('QQQ')!.close/prior.get('QQQ')!.close;
    peak=Math.max(peak,strategyValue);
    maxDrawdown=Math.min(maxDrawdown,(strategyValue/peak-1)*100);
  }
  const strategyReturnPct=(strategyValue/startCapital-1)*100;
  const spyReturnPct=(spyValue/startCapital-1)*100;
  const qqqReturnPct=(qqqValue/startCapital-1)*100;
  return {
    startDate:dates[0], endDate:dates[dates.length-1], observations:dates.length,
    strategyReturnPct, spyReturnPct, qqqReturnPct,
    strategyNetReturnPct:strategyReturnPct,
    excessVsSpyPct:strategyReturnPct-spyReturnPct,
    excessVsQqqPct:strategyReturnPct-qqqReturnPct,
    totalTransactionCostsPct:costsDollars/startCapital*100,
    maxDrawdownPct:maxDrawdown,
    evidenceStatus: dates.length-1 >= minimumObservations ? 'ready' : 'insufficient',
  };
}
