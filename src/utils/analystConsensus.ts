export type AnalystRecommendationCounts = {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
};

export type AnalystConsensusInput = {
  recommendation?: Partial<AnalystRecommendationCounts> | null;
  priceTarget?: {
    low?: number | null;
    high?: number | null;
    mean?: number | null;
    median?: number | null;
    lastUpdated?: string | null;
  } | null;
  currentPrice?: number | null;
  retrievedAt?: string | null;
  source?: string | null;
  analystCount?: number | null;
};

export type AnalystConsensus = {
  ratings: AnalystRecommendationCounts;
  analystCount: number;
  percentages: Record<keyof AnalystRecommendationCounts, number>;
  target: {
    low: number | null;
    mean: number | null;
    median: number | null;
    high: number | null;
    medianUpsidePct: number | null;
    meanUpsidePct: number | null;
    rangePct: number | null;
    lastUpdated: string | null;
  };
  source: string;
  retrievedAt: string | null;
};

const RATING_KEYS: (keyof AnalystRecommendationCounts)[] = [
  'strongBuy', 'buy', 'hold', 'sell', 'strongSell',
];

const finite = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function normalizeAnalystConsensus(input: AnalystConsensusInput): AnalystConsensus {
  const ratings = RATING_KEYS.reduce((result, key) => {
    result[key] = Math.max(0, Math.round(finite(input.recommendation?.[key]) ?? 0));
    return result;
  }, {} as AnalystRecommendationCounts);

  const analystCount = Math.max(
    0,
    Math.round(finite(input.analystCount) ?? RATING_KEYS.reduce((sum, key) => sum + ratings[key], 0)),
  );
  const percentages = RATING_KEYS.reduce((result, key) => {
    result[key] = analystCount > 0 ? (ratings[key] / analystCount) * 100 : 0;
    return result;
  }, {} as Record<keyof AnalystRecommendationCounts, number>);

  const low = finite(input.priceTarget?.low);
  const mean = finite(input.priceTarget?.mean);
  const median = finite(input.priceTarget?.median);
  const high = finite(input.priceTarget?.high);
  const current = finite(input.currentPrice);

  return {
    ratings,
    analystCount,
    percentages,
    target: {
      low,
      mean,
      median,
      high,
      medianUpsidePct: current != null && current > 0 && median != null ? (median / current - 1) * 100 : null,
      meanUpsidePct: current != null && current > 0 && mean != null ? (mean / current - 1) * 100 : null,
      rangePct: low != null && high != null && low > 0 ? (high / low - 1) * 100 : null,
      lastUpdated: input.priceTarget?.lastUpdated ?? null,
    },
    source: String(input.source || 'External analyst data'),
    retrievedAt: input.retrievedAt ?? null,
  };
}

export function analystFreshness(retrievedAt: string | null, now = Date.now()): 'fresh' | 'aging' | 'stale' | 'unknown' {
  if (!retrievedAt) return 'unknown';
  const timestamp = Date.parse(retrievedAt);
  if (!Number.isFinite(timestamp)) return 'unknown';
  const ageHours = Math.max(0, now - timestamp) / 3600000;
  if (ageHours <= 24) return 'fresh';
  if (ageHours <= 72) return 'aging';
  return 'stale';
}
