export type ForecastEvidenceStatus = 'available' | 'missing' | 'failed';

export type ForecastEvidenceItem = {
  title?: string;
  source?: string;
  url?: string;
  date?: string;
  publishedAt?: string;
  published_at?: string;
  summary?: string;
  snippet?: string;
  impactRating?: string;
  status?: string;
};

export type ForecastEvidenceSnapshot = {
  capturedAt: string;
  source: 'forward_outlook';
  ticker: string;
  quote: {
    price: number | null;
    changePct: number | null;
    capturedAt: string;
    source: string | null;
  };
  marketContext: {
    momentum20Pct: number | null;
    volatilityAnnualizedPct: number | null;
    oneYearReturnPct: number | null;
    historyThrough: string | null;
  };
  analystConsensus: {
    status: ForecastEvidenceStatus;
    source: string | null;
    retrievedAt: string | null;
    analystCount: number | null;
    medianTarget: number | null;
    webEvidenceCount: number;
    error: string | null;
  };
  events: {
    contracts: ForecastEvidenceItem[];
    news: ForecastEvidenceItem[];
    political: ForecastEvidenceItem[];
    macro: ForecastEvidenceItem[];
  };
  counts: {
    contracts: number;
    news: number;
    political: number;
    macro: number;
  };
};

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function compactItems(items: unknown[], limit = 8): ForecastEvidenceItem[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, limit).map((item: any) => ({
    ...(item?.title != null ? { title: String(item.title) } : {}),
    ...(item?.source != null ? { source: String(item.source) } : {}),
    ...(item?.url != null ? { url: String(item.url) } : {}),
    ...(item?.date != null ? { date: String(item.date) } : {}),
    ...(item?.publishedAt != null ? { publishedAt: String(item.publishedAt) } : {}),
    ...(item?.published_at != null ? { published_at: String(item.published_at) } : {}),
    ...(item?.summary != null ? { summary: String(item.summary) } : {}),
    ...(item?.snippet != null ? { snippet: String(item.snippet) } : {}),
    ...(item?.impactRating != null ? { impactRating: String(item.impactRating) } : {}),
    ...(item?.status != null ? { status: String(item.status) } : {}),
  }));
}

export function createForecastEvidenceSnapshot(input: {
  capturedAt: string;
  ticker: string;
  currentPrice?: number | null;
  changePct?: number | null;
  quoteSource?: string | null;
  momentum20Pct?: number | null;
  volatilityAnnualizedPct?: number | null;
  oneYearReturnPct?: number | null;
  historyThrough?: string | null;
  analyst?: {
    status?: ForecastEvidenceStatus;
    source?: string | null;
    retrievedAt?: string | null;
    analystCount?: number | null;
    medianTarget?: number | null;
    webEvidenceCount?: number | null;
    error?: string | null;
  } | null;
  contracts?: unknown[];
  news?: unknown[];
  political?: unknown[];
  macro?: unknown[];
}): ForecastEvidenceSnapshot {
  const capturedAt = String(input.capturedAt);
  const contracts = compactItems(input.contracts || []);
  const news = compactItems(input.news || []);
  const political = compactItems(input.political || []);
  const macro = compactItems(input.macro || []);
  const analyst = input.analyst || {};

  return {
    capturedAt,
    source: 'forward_outlook',
    ticker: String(input.ticker || '').toUpperCase(),
    quote: {
      price: finiteNumber(input.currentPrice),
      changePct: finiteNumber(input.changePct),
      capturedAt,
      source: input.quoteSource ? String(input.quoteSource) : null,
    },
    marketContext: {
      momentum20Pct: finiteNumber(input.momentum20Pct),
      volatilityAnnualizedPct: finiteNumber(input.volatilityAnnualizedPct),
      oneYearReturnPct: finiteNumber(input.oneYearReturnPct),
      historyThrough: input.historyThrough ? String(input.historyThrough) : null,
    },
    analystConsensus: {
      status: analyst.status || 'missing',
      source: analyst.source ? String(analyst.source) : null,
      retrievedAt: analyst.retrievedAt ? String(analyst.retrievedAt) : null,
      analystCount: finiteNumber(analyst.analystCount),
      medianTarget: finiteNumber(analyst.medianTarget),
      webEvidenceCount: Math.max(0, Math.floor(Number(analyst.webEvidenceCount) || 0)),
      error: analyst.error ? String(analyst.error) : null,
    },
    events: { contracts, news, political, macro },
    counts: {
      contracts: contracts.length,
      news: news.length,
      political: political.length,
      macro: macro.length,
    },
  };
}
