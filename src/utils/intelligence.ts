import { STOCK_UNIVERSE, type StockUniverseEntry } from './stockUniverse';

export type PricePoint = {
  price: number;
  changePct: number;
  provider?: string;
  retrievedAt?: string;
  stale?: boolean;
  cached?: boolean;
  returnedSymbol?: string | null;
  sourceMode?: 'live' | 'simulated' | 'unknown';
  currency?: string | null;
  adjustedBasis?: 'raw' | 'split_adjusted' | 'total_return' | 'unknown';
  marketTimePrecision?: 'instant' | 'date-only' | 'unknown';
  marketTime?: string | null;
  isMarketSessionOpen?: boolean | null;
  simulated?: boolean;
  status?: string;
};
export type IntelligenceGroup = {
  name: string;
  members: string[];
  avgChange: number | null;
  breadth: number | null;
  relativeToUniverse: number | null;
  score: number | null;
  coverage: ObservationCoverage;
};
export type ObservationCoverage = { observed: number; expected: number; status: 'complete' | 'partial' | 'unavailable' };

export type PairSignal = {
  left: string;
  right: string;
  spread: number | null;
  label: string;
};

export type RotationHorizon = '1D' | '5D' | '20D' | '60D' | '3M' | '6M';
export type RotationGroup = IntelligenceGroup & { horizons: Record<RotationHorizon, number | null>; horizonCoverage: Record<RotationHorizon, ObservationCoverage>; direction: 'positive' | 'negative' | 'flat' | 'insufficient'; scoreMethod: 'percentile' | 'insufficient'; };
export type RotationPair = PairSignal & { horizonSpreads: Array<{ horizon: RotationHorizon; spread: number | null; startDate: string | null; endDate: string | null }> };
export type MoneyRotationSnapshot = { groups: RotationGroup[]; pairs: RotationPair[]; selectedHorizon: RotationHorizon; windows: Record<RotationHorizon, { startDate: string; endDate: string } | null>; methodology: string; freshness: string; };

export type IntelligenceSnapshot = {
  groups: IntelligenceGroup[];
  portfolioBreadth: number | null;
  portfolioAverage: number | null;
  universeAverage: number | null;
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
  if (!values.length) return null;
  const value = values.reduce((sum, item) => sum + item / values.length, 0);
  return Number.isFinite(value) ? value : null;
}
const coverage = (observed: number, expected: number): ObservationCoverage => ({ observed, expected, status: observed === 0 ? 'unavailable' : observed === expected ? 'complete' : 'partial' });
export const usablePricePoint = (value: PricePoint | undefined): value is PricePoint => !!value && value.stale !== true &&
  typeof value.price === 'number' && Number.isFinite(value.price) && value.price > 0 && typeof value.changePct === 'number' && Number.isFinite(value.changePct);
const dailySpread = (left: PricePoint | undefined, right: PricePoint | undefined) => {
  if (!usablePricePoint(left) || !usablePricePoint(right)) return null;
  const spread = left.changePct - right.changePct;
  return Number.isFinite(spread) ? spread : null;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function percentileRank(values: number[], value: number): number | null {
  const usable = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length || !Number.isFinite(value)) return null;
  const below = usable.filter(item => item < value).length;
  const equal = usable.filter(item => item === value).length;
  return Number(((below + equal / 2) / usable.length * 100).toFixed(1));
}


export function buildIntelligence(prices: Record<string, PricePoint>): IntelligenceSnapshot {
  const freshPrices = Object.values(prices).filter(usablePricePoint);
  const allReturns = freshPrices
    .map(x => x?.changePct)
    .filter((x): x is number => typeof x === 'number' && Number.isFinite(x));

  const universeAverage = avg(allReturns);

  const groups = Object.entries(GROUP_MEMBERS).map(([name, members]) => {
    const returns = members
      .map(t => prices[t])
      .filter(usablePricePoint)
      .map(x => x?.changePct)
      .filter((x): x is number => typeof x === 'number' && Number.isFinite(x));

    const avgChange = avg(returns);
    const breadth = returns.length ? returns.filter(x => x >= 0).length / returns.length : null;
    const relative = avgChange != null && universeAverage != null ? avgChange - universeAverage : null;
    const relativeToUniverse = relative != null && Number.isFinite(relative) ? relative : null;
    const rawScore = relativeToUniverse != null && breadth != null ? 50 + relativeToUniverse * 7 + (breadth - 0.5) * 30 : null;
    const score = rawScore != null && Number.isFinite(rawScore) ? clamp(rawScore, 0, 100) : null;

    return { name, members, avgChange, breadth, relativeToUniverse, score, coverage: coverage(returns.length, members.length) };
  });

  // Portfolio positions are now sourced from authenticated Supabase holdings.
  // This utility intentionally has no committed portfolio snapshot fallback.
  const portfolioReturns: number[] = [];

  const pairSignals = PAIRS.map(([left,right,label]) => ({
    left,
    right,
    spread: dailySpread(prices[left], prices[right]),
    label,
  }));

  const sorted = groups.filter(group => group.score != null).sort((a,b) => b.score! - a.score!);

  return {
    groups,
    portfolioBreadth: portfolioReturns.length ? portfolioReturns.filter(x => x >= 0).length / portfolioReturns.length : null,
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

type HistoryPoint = { date: string; price: number };
function checkedHistory(points: HistoryPoint[], asOf: string): HistoryPoint[] {
  const dates = new Set<string>();
  for (const point of points) {
    if (!point || typeof point.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(point.date) ||
      !Number.isFinite(Date.parse(point.date)) || new Date(point.date).toISOString().slice(0, 10) !== point.date ||
      point.date > asOf || dates.has(point.date) || typeof point.price !== 'number' || !Number.isFinite(point.price) || point.price <= 0) return [];
    dates.add(point.date);
  }
  return [...points].sort((a,b) => a.date.localeCompare(b.date));
}
function historicalWindow(points: HistoryPoint[], days: number, endDate: string | null) {
  if (points.length <= days || points.at(-1)?.date !== endDate) return null;
  const end = points.at(-1)!, start = points.at(-(days + 1))!;
  const value = (end.price / start.price - 1) * 100;
  return Number.isFinite(value) ? { value, startDate: start.date, endDate: end.date } : null;
}

export function buildMoneyRotation(
  histories: Record<string, Array<{ date: string; price: number }>>,
  prices: Record<string, PricePoint>,
  selectedHorizon: RotationHorizon = '20D',
  nowMs = Date.now(),
): MoneyRotationSnapshot {
  const asOf = new Date(nowMs).toISOString().slice(0, 10);
  const checked = Object.fromEntries(Object.entries(histories).map(([symbol, points]) => [symbol, checkedHistory(points, asOf)]));
  const endDate = MONEY_ROTATION_SYMBOLS.map(symbol => checked[symbol]?.at(-1)?.date).filter((date): date is string => !!date).sort().at(-1) ?? null;
  // Choose one observed date window per horizon. Different exchange calendars
  // or incomplete histories must not silently compare different start dates.
  const windows = Object.fromEntries(ROTATION_HORIZONS.map(({ key, days }) => {
    const counts = new Map<string, number>();
    for (const symbol of MONEY_ROTATION_SYMBOLS) {
      const window = historicalWindow(checked[symbol] || [], days, endDate);
      if (window) counts.set(window.startDate, (counts.get(window.startDate) || 0) + 1);
    }
    const startDate = [...counts].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
    return [key, startDate && endDate ? { startDate, endDate } : null];
  })) as MoneyRotationSnapshot['windows'];
  const comparableWindow = (symbol: string, key: RotationHorizon, days: number) => {
    const value = historicalWindow(checked[symbol] || [], days, endDate);
    return value && value.startDate === windows[key]?.startDate ? value : null;
  };
  const rawGroupRows = Object.entries(GROUP_MEMBERS).map(([name, members]) => {
    const horizonCoverage = {} as RotationGroup['horizonCoverage'];
    const horizons = Object.fromEntries(ROTATION_HORIZONS.map(({ key, days }) => {
      const values = members.map(symbol => comparableWindow(symbol, key, days)?.value).filter((v): v is number => v != null);
      horizonCoverage[key] = coverage(values.length, members.length);
      return [key, values.length ? avg(values) : null];
    })) as Record<RotationHorizon, number | null>;
    const selected = horizons[selectedHorizon];
    const direction: RotationGroup['direction'] = selected == null ? 'insufficient' : selected > 0 ? 'positive' : selected < 0 ? 'negative' : 'flat';
    const live = members.map(symbol => prices[symbol]).filter(usablePricePoint);
    const avgChange = avg(live.map(x => x.changePct).filter(Number.isFinite));
    const breadth = live.length ? live.filter(x => x.changePct >= 0).length / live.length : null;
    return { name, members, avgChange, breadth, relativeToUniverse: null, horizons, horizonCoverage, direction, coverage: coverage(live.length, members.length) };
  });
  const selectedReturns = rawGroupRows
    .map(row => row.horizons[selectedHorizon])
    .filter((value): value is number => value != null);
  const groupRows: RotationGroup[] = rawGroupRows.map(row => {
    const selectedReturn = row.horizons[selectedHorizon];
    const score = selectedReturn == null || selectedReturns.length < 2 ? null : percentileRank(selectedReturns, selectedReturn);
    return { ...row, score, scoreMethod: score == null ? 'insufficient' : 'percentile' };
  });
  const pairs: RotationPair[] = PAIRS.map(([left, right, label]) => {
    const horizonSpreads = ROTATION_HORIZONS.map(({ key, days }) => {
      const l = comparableWindow(left, key, days), r = comparableWindow(right, key, days);
      const matched = l && r && l.startDate === r.startDate && l.endDate === r.endDate;
      const value = matched ? l.value - r.value : null;
      const spread = value != null && Number.isFinite(value) ? value : null;
      return { horizon: key, spread, startDate: spread != null ? l!.startDate : null, endDate: spread != null ? l!.endDate : null };
    });
    return { left, right, label, spread: dailySpread(prices[left], prices[right]), horizonSpreads };
  });
  return { groups: groupRows, pairs, selectedHorizon, windows,
    methodology: 'Relative return percentile among at least two observed groups; ties use their midpoint rank. Coverage counts describe observed members. Direction is the selected-period return sign, not acceleration or capital flow. Horizons use 1/5/20/60/63/126 source price observations; pair spreads require matching date boundaries.',
    freshness: endDate ? 'Latest source history date: ' + endDate + '. Observation freshness, session completeness and adjustment basis require separate source verification.' : 'History unavailable. No source dates or market freshness established.' };
}
