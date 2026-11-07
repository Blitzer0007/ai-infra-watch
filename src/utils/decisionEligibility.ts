import { classifyFreshness } from './freshness';
import { compareProviderQuotes } from '../../server/services/marketDataValidation.js';
export type DataQualityStatus = 'valid' | 'delayed' | 'last_close' | 'stale' | 'missing' | 'conflicting' | 'simulated' | 'invalid';
export type ValidatedQuote = {
  symbol: string; price: number | null; currency: string | null; provider: string;
  marketTime: string | null; retrievedAt: string | null; isMarketSessionOpen: boolean | null;
  status: DataQualityStatus; fallbackUsed: boolean;
  adjustedBasis?: 'raw' | 'split_adjusted' | 'total_return';
};
export type DataQualityResult = {
  eligibleForDecision: boolean; status: DataQualityStatus; checkedAt: string; reasons: string[];
  sourceCount: number; marketTime: string | null; retrievedAt: string | null; source?: string | null;
};
export function evaluateDecisionEligibility(quote: ValidatedQuote, requiredEvidenceComplete: boolean, accountingValid: boolean, nowMs = Date.now()): DataQualityResult {
  const reasons: string[] = [];
  let status = quote.status;
  const market = Date.parse(quote.marketTime || '');
  const retrieved = Date.parse(quote.retrievedAt || '');
  if (typeof quote.price !== 'number' || !Number.isFinite(quote.price) || quote.price <= 0 || quote.currency !== 'USD') {
    status = quote.price == null ? 'missing' : 'invalid'; reasons.push('A positive, finite USD price is required.');
  }
  if (!quote.provider.trim() || !Number.isFinite(market) || !Number.isFinite(retrieved)) {
    status = 'missing'; reasons.push('Explicit provider, market timestamp and retrieval timestamp are required.');
  } else if (market > nowMs + 120000 || retrieved > nowMs + 120000 || market > retrieved + 120000) {
    status = 'invalid'; reasons.push('Quote timestamps are inconsistent or in the future.');
  } else {
    const freshness = classifyFreshness(quote, nowMs);
    const retrievalAge = (nowMs - retrieved) / 60000;
    // A last close must be explicitly identified by its provider and session metadata.
    // The 96h cap allows weekends; holiday/session certainty must come from the source.
    const lastClose = quote.status === 'last_close' && quote.isMarketSessionOpen === false && (nowMs - market) <= 96 * 3600000 && retrievalAge <= 120;
    if (!lastClose && (freshness.ageMinutes! > 120 || retrievalAge > 120)) {
      status = 'stale'; reasons.push('Market observation or retrieval is too old for a new assessment.');
    } else if (lastClose) status = 'last_close';
    else if (freshness.label === 'Delayed') status = 'delayed';
    if (quote.status === 'last_close' && quote.isMarketSessionOpen === true) { status = 'invalid'; reasons.push('Last close conflicts with an open market session.'); }
    if (quote.isMarketSessionOpen == null) { status = 'missing'; reasons.push('Market session provenance is unavailable.'); }
  }
  if (['stale', 'missing', 'conflicting', 'simulated', 'invalid'].includes(quote.status)) {
    status = quote.status; reasons.push('Provider quality status: ' + quote.status + '.');
  }
  if (!requiredEvidenceComplete) reasons.push('Required group, peer or supporting evidence is incomplete.');
  if (!accountingValid) reasons.push('Portfolio accounting has not reconciled.');
  return { eligibleForDecision: reasons.length === 0 && ['valid', 'delayed', 'last_close'].includes(status), status,
    checkedAt: new Date(nowMs).toISOString(), reasons, sourceCount: quote.provider.trim() ? 1 : 0,
    marketTime: quote.marketTime, retrievedAt: quote.retrievedAt, source: quote.provider || null };
}

export function normalizeDecisionQuote(symbol: string, input: Record<string, any> | undefined): ValidatedQuote {
  const q = input ?? {};
  const statuses: DataQualityStatus[] = ['valid', 'delayed', 'last_close', 'stale', 'missing', 'conflicting', 'simulated', 'invalid'];
  const status: DataQualityStatus = q.simulated === true || /mock|simulat|fixture|^qa$/i.test(q.provider ?? '') ? 'simulated'
    : q.stale === true ? 'stale' : statuses.includes(q.status) ? q.status : 'valid';
  const quote: ValidatedQuote = { symbol, price: typeof q.price === 'number' ? q.price : null, currency: q.currency ?? null,
    provider: typeof q.provider === 'string' ? q.provider : '', marketTime: q.marketTime ?? null, retrievedAt: q.retrievedAt ?? null,
    isMarketSessionOpen: typeof q.isMarketSessionOpen === 'boolean' ? q.isMarketSessionOpen : null,
    status, fallbackUsed: q.fallbackUsed === true, adjustedBasis: q.adjustedBasis };
  if (Array.isArray(q.independentObservations)) {
    const comparison = compareProviderQuotes([quote, ...q.independentObservations]);
    if (comparison.status === 'invalid' || comparison.status === 'conflicting') quote.status = comparison.status;
  }
  return quote;
}
