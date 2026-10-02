import { STOCK_UNIVERSE, type StockUniverseEntry } from './stockUniverse';

export type PricePoint = {
  price: number;
  changePct: number;
  provider?: string;
  retrievedAt?: string;
  stale?: boolean;
  cached?: boolean;
};
export type IntelligenceGroup = {
  name: string;
  members: string[];
  avgChange: number;
  breadth: number;
  relativeToUniverse: number;
  score: number;
};

export type PairSignal = {
  left: string;
  right: string;
  spread: number | null;
  label: string;
};

export type IntelligenceSnapshot = {
  groups: IntelligenceGroup[];
  portfolioBreadth: number;
  portfolioAverage: number;
  universeAverage: number;
  topGroup: string | null;
  bottomGroup: string | null;
  pairSignals: PairSignal[];
};

const GROUP_MEMBERS = (() => {
  const entries: Array<{ symbol: string; group: string }> = [
    ...STOCK_UNIVERSE.map((item: StockUniverseEntry) => ({ symbol: item.symbol, group: item.group })),
  ];
  const groups = new Map<string, string[]>();
  for (const entry of entries) {
    const members = groups.get(entry.group) ?? [];
    if (!members.includes(entry.symbol)) members.push(entry.symbol);
    groups.set(entry.group, members);
  }
  return Object.fromEntries(groups.entries());
})();

const PAIRS: Array<[string,string,string]> = [
  ['NVDA','AMD','Accelerator relative strength'],
  ['NOW','CRM','Enterprise software relative strength'],
  ['MU','000660.KS','Memory cycle spread'],
  ['NBIS','IREN','AI infrastructure capacity'],
  ['DGXX','CIFR','Power-to-compute exposure'],
  ['META','GOOGL','AI platform relative strength'],
];

function avg(values: number[]) {
  return values.length ? values.reduce((a,b) => a+b, 0) / values.length : 0;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function buildIntelligence(prices: Record<string, PricePoint>): IntelligenceSnapshot {
  const freshPrices = Object.values(prices).filter(x => x?.stale !== true);
  const allReturns = freshPrices
    .map(x => x?.changePct)
    .filter((x): x is number => typeof x === 'number' && Number.isFinite(x));

  const universeAverage = avg(allReturns);

  const groups = Object.entries(GROUP_MEMBERS).map(([name, members]) => {
    const returns = members
      .map(t => prices[t])
      .filter((x) => x?.stale !== true)
      .map(x => x?.changePct)
      .filter((x): x is number => typeof x === 'number' && Number.isFinite(x));

    const avgChange = avg(returns);
    const breadth = returns.length ? returns.filter(x => x >= 0).length / returns.length : 0;
    const relativeToUniverse = avgChange - universeAverage;
    const score = clamp(50 + relativeToUniverse * 7 + (breadth - 0.5) * 30, 0, 100);

    return { name, members, avgChange, breadth, relativeToUniverse, score };
  });

  // Portfolio positions are now sourced from authenticated Supabase holdings.
  // This utility intentionally has no committed portfolio snapshot fallback.
  const portfolioReturns: number[] = [];

  const pairSignals = PAIRS.map(([left,right,label]) => ({
    left,
    right,
    spread: prices[left]?.stale !== true && prices[right]?.stale !== true &&
      typeof prices[left]?.changePct === 'number' && typeof prices[right]?.changePct === 'number'
      ? prices[left].changePct - prices[right].changePct
      : null,
    label,
  }));

  const sorted = [...groups].sort((a,b) => b.score - a.score);

  return {
    groups,
    portfolioBreadth: portfolioReturns.length ? portfolioReturns.filter(x => x >= 0).length / portfolioReturns.length : 0,
    portfolioAverage: avg(portfolioReturns),
    universeAverage,
    topGroup: sorted[0]?.name || null,
    bottomGroup: sorted.at(-1)?.name || null,
    pairSignals,
  };
}
