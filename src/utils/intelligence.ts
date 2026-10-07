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

export type RotationHorizon = '1D' | '5D' | '20D' | '60D' | '3M' | '6M';
export type RotationGroup = IntelligenceGroup & { horizons: Record<RotationHorizon, number | null>; direction: 'strengthening' | 'weakening' | 'mixed' | 'insufficient'; };
export type RotationPair = PairSignal & { history: number[]; trend: 'widening' | 'narrowing' | 'stable' | 'insufficient'; };
export type MoneyRotationSnapshot = { groups: RotationGroup[]; pairs: RotationPair[]; selectedHorizon: RotationHorizon; methodology: string; freshness: string; };

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

export const MONEY_ROTATION_SYMBOLS = Array.from(new Set([
  ...Object.values(GROUP_MEMBERS).flat(),
  'NVDA', 'AMD', 'NOW', 'CRM', 'MU', '000660.KS', 'NBIS', 'IREN', 'DGXX', 'CIFR', 'META', 'GOOGL',
]));
 
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


const ROTATION_HORIZONS: Array<{ key: RotationHorizon; days: number }> = [
  { key: '1D', days: 1 }, { key: '5D', days: 5 }, { key: '20D', days: 20 },
  { key: '60D', days: 60 }, { key: '3M', days: 63 }, { key: '6M', days: 126 },
];

function historicalReturn(points: Array<{ price: number }>, days: number): number | null {
  if (points.length <= days) return null;
  const end = points.at(-1)?.price ?? 0;
  const start = points.at(-(days + 1))?.price ?? 0;
  return start > 0 && end > 0 ? (end / start - 1) * 100 : null;
}

export function buildMoneyRotation(
  histories: Record<string, Array<{ date: string; price: number }>>,
  prices: Record<string, PricePoint>,
  selectedHorizon: RotationHorizon = '20D',
): MoneyRotationSnapshot {
  const now = new Date().toISOString();
  const groupRows: RotationGroup[] = Object.entries(GROUP_MEMBERS).map(([name, members]) => {
    const horizons = Object.fromEntries(ROTATION_HORIZONS.map(({ key, days }) => {
      const values = members.map(symbol => historicalReturn(histories[symbol] || [], days)).filter((v): v is number => v != null);
      return [key, values.length ? avg(values) : null];
    })) as Record<RotationHorizon, number | null>;
    const current = horizons['1D'];
    const comparison = selectedHorizon === '1D' ? horizons['20D'] : horizons[selectedHorizon];
    const direction: RotationGroup['direction'] = current == null || comparison == null ? 'insufficient' : current > comparison + 0.5 ? 'strengthening' : current < comparison - 0.5 ? 'weakening' : 'mixed';
    const live = members.map(symbol => prices[symbol]).filter(x => x && x.stale !== true);
    const avgChange = avg(live.map(x => x.changePct).filter(Number.isFinite));
    const breadth = live.length ? live.filter(x => x.changePct >= 0).length / live.length : 0;
    const selectedReturn = horizons[selectedHorizon];
    return { name, members, avgChange, breadth, relativeToUniverse: 0, score: clamp(50 + (selectedReturn ?? 0) * 2 + (breadth - 0.5) * 30, 0, 100), horizons, direction };
  });
  const pairs: RotationPair[] = PAIRS.map(([left, right, label]) => {
    const leftHistory = histories[left] || []; const rightHistory = histories[right] || [];
    const history = ROTATION_HORIZONS.map(({ days }) => {
      const l = historicalReturn(leftHistory, days); const r = historicalReturn(rightHistory, days);
      return l != null && r != null ? l - r : NaN;
    }).filter(Number.isFinite) as number[];
    const latest = history.at(-1); const prior = history.at(-2);
    const trend: RotationPair['trend'] = latest == null || prior == null ? 'insufficient' : Math.abs(latest - prior) < 0.5 ? 'stable' : latest > prior ? 'widening' : 'narrowing';
    return { left, right, label, spread: prices[left]?.stale !== true && prices[right]?.stale !== true ? (prices[left]?.changePct ?? 0) - (prices[right]?.changePct ?? 0) : null, history, trend };
  });
  return { groups: groupRows, pairs, selectedHorizon, methodology: 'Flow proxy = price momentum + breadth across the tracked universe; this is not literal capital-flow data.', freshness: 'Historical prices are fetched from the live market history feed; generated ' + now.slice(0, 19) + 'Z.' };
}
