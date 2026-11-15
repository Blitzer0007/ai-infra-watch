import type { EvidenceReference } from './decisionCardAdapter';
import { normalizeDecisionQuote, type ValidatedQuote } from './decisionEligibility';

export type AssetClass = 'equity' | 'fund' | 'leveraged-etf' | 'unknown';
export type FinancialObservation = {
  id: string;
  symbol: string;
  metric: 'revenue-growth-pct' | 'free-cash-flow-usd';
  value: number | null;
  unit: 'percent' | 'USD';
  currency: 'USD';
  periodStart: string;
  periodEnd: string;
  reportingBasis: 'reported';
  provider: string;
  sourceUrl: string;
  publishedAt: string | null;
  retrievedAt: string | null;
  simulated: boolean;
};
export type ProviderFailure = { provider: string; code: 'not-configured' | 'rate-limited' | 'timeout' | 'transport' | 'no-data' | 'invalid-payload' | 'unsupported-currency'; retryable: boolean };
export type ResearchEntry = {
  symbol: string;
  companyName: string;
  assetClass: AssetClass;
  listingCountry: string | null;
  companyEvidence: (EvidenceReference & { simulated:boolean }) | null;
  inputIssues: string[];
  portfolioContext: 'holding' | 'watchlist-only';
  accounting: 'unverified' | 'not-applicable';
  quote: ValidatedQuote;
  financials: FinancialObservation[];
};
export type ResearchSnapshot = {
  schemaVersion: 1;
  id: string;
  capturedAt: string;
  simulated: boolean;
  universe: { holdingsCoverage:'complete'|'unavailable'; holdings: number; watchlistOnly: number; omittedHoldings: number; omittedWatchlist: number; invalidSymbols: number };
  entries: ResearchEntry[];
};
export type SnapshotInput = {
  id: string;
  nowMs: number;
  holdings: readonly string[];
  watchlist: readonly string[];
  quotes: Record<string, Record<string, unknown> | undefined>;
  companies?: Record<string, { name: string; assetClass: AssetClass; listingCountry?: string; provenance?: { provider:string; sourceUrl:string; observedAt:string; simulated?:boolean } }>;
  financials?: readonly FinancialObservation[];
  simulated?: boolean;
  holdingsAvailable?: boolean;
};
const MAX_HOLDINGS = 100;
const MAX_WATCHLIST = 50;
const validSymbol = (value: unknown): value is string => typeof value === 'string' && /^[A-Z][A-Z0-9.-]{0,14}$/.test(value.trim().toUpperCase());

/** Select fields explicitly so credentials/raw responses cannot enter a snapshot. No I/O. */
export function captureResearchSnapshot(input: SnapshotInput): ResearchSnapshot {
  if (!Number.isFinite(input.nowMs) || !input.id.trim() || (input.financials?.length ?? 0) > 2000) throw new Error('Snapshot requires an explicit ID and finite clock.');
  const normalize = (values: readonly string[]) => [...new Set(values.filter(validSymbol).map(value => value.trim().toUpperCase()))].sort();
  const allHoldings = normalize(input.holdings);
  const holdings = allHoldings.slice(0,MAX_HOLDINGS);
  const allWatchlist = normalize(input.watchlist).filter(symbol => !allHoldings.includes(symbol));
  const watchlist = allWatchlist.slice(0,MAX_WATCHLIST);
  const entries = [...holdings,...watchlist].map(symbol => {
    const context = holdings.includes(symbol) ? 'holding' as const : 'watchlist-only' as const;
    const raw = input.quotes[symbol];
    const quote = normalizeDecisionQuote(symbol,raw);
    if (quote.status !== 'simulated' && raw?.symbol != null && (typeof raw.symbol !== 'string' || raw.symbol.trim().toUpperCase() !== symbol)) quote.status = 'conflicting';
    if (input.simulated) quote.status = 'simulated';
    const company = input.companies?.[symbol];
    const assetClass: AssetClass = company && ['equity','fund','leveraged-etf'].includes(company.assetClass) ? company.assetClass : 'unknown';
    const observations = (input.financials ?? []).filter(row => row && row.symbol === symbol);
    return {
      symbol, companyName: typeof company?.name === 'string' ? company.name : symbol, assetClass,
      listingCountry: typeof company?.listingCountry === 'string' ? company.listingCountry : null,
      companyEvidence: company?.provenance ? { id:'listing:'+symbol, label:'Asset/listing classification', source:company.provenance.provider, url:company.provenance.sourceUrl, observedAt:company.provenance.observedAt, simulated:input.simulated === true || company.provenance.simulated === true } : null,
      inputIssues: observations.length > 32 ? ['Financial observation limit exceeded; evidence withheld rather than silently truncated.'] : [], portfolioContext: context,
      accounting: context === 'holding' ? 'unverified' as const : 'not-applicable' as const,
      quote: { ...quote, currency: typeof quote.currency === 'string' ? quote.currency : null,
        marketTime: typeof quote.marketTime === 'string' ? quote.marketTime : null, retrievedAt: typeof quote.retrievedAt === 'string' ? quote.retrievedAt : null,
        adjustedBasis: ['raw','split_adjusted','total_return'].includes(quote.adjustedBasis ?? '') ? quote.adjustedBasis : undefined },
      financials: (observations.length <= 32 ? observations : []).map(row => ({
        id:row.id, symbol:row.symbol, metric:row.metric, value:row.value, unit:row.unit, currency:row.currency,
        periodStart:row.periodStart, periodEnd:row.periodEnd, reportingBasis:row.reportingBasis,
        provider:row.provider, sourceUrl:row.sourceUrl, publishedAt:row.publishedAt, retrievedAt:row.retrievedAt,
        simulated:input.simulated === true || row.simulated,
      })),
    };
  });
  return { schemaVersion:1, id:input.id, capturedAt:new Date(input.nowMs).toISOString(), simulated:input.simulated === true,
    universe:{ holdingsCoverage:input.holdingsAvailable === false ? 'unavailable' : 'complete', holdings:holdings.length, watchlistOnly:watchlist.length,
      omittedHoldings:allHoldings.length-holdings.length, omittedWatchlist:allWatchlist.length-watchlist.length,
      invalidSymbols:[...input.holdings,...input.watchlist].filter(value => !validSymbol(value)).length }, entries };
}
