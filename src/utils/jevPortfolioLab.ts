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
