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
  const severity: Partial<Record<DataQualityStatus, number>> = { stale: 1, missing: 2, invalid: 3, conflicting: 4, simulated: 5 };
  let blockedStatus: DataQualityStatus | null = null;
  const reject = (status: DataQualityStatus, reason: string) => {
    reasons.push(reason);
    if (blockedStatus == null || (severity[status] ?? 0) > (severity[blockedStatus] ?? 0)) blockedStatus = status;
  };
  const timestamp = (value: string | null) => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
  const market = timestamp(quote.marketTime);
  const retrieved = timestamp(quote.retrievedAt);
  let status = quote.status;
  if (quote.price == null) reject('missing', 'A price observation is required.');
  else if (typeof quote.price !== 'number' || !Number.isFinite(quote.price) || quote.price <= 0) reject('invalid', 'A positive, finite price is required.');
  if (quote.currency == null) reject('missing', 'Quote currency provenance is required.');
  else if (quote.currency !== 'USD') reject('invalid', 'Only USD quotes are supported by this portfolio valuation.');
  if (!quote.provider.trim() || !Number.isFinite(market) || !Number.isFinite(retrieved)) {
    reject('missing', 'Explicit provider, market timestamp and retrieval timestamp are required.');
  } else if (market > nowMs + 120000 || retrieved > nowMs + 120000 || market > retrieved + 120000) {
    reject('invalid', 'Quote timestamps are inconsistent or in the future.');
  } else {
    const freshness = classifyFreshness(quote, nowMs);
    const retrievalAge = (nowMs - retrieved) / 60000;
    // Session boundaries come from the provider, not a guessed trading calendar.
    const lastClose = quote.status === 'last_close' && quote.isMarketSessionOpen === false && (nowMs - market) <= 96 * 3600000 && retrievalAge <= 120;
    if (!lastClose && (freshness.ageMinutes! > 120 || retrievalAge > 120)) reject('stale', 'Market observation or retrieval is too old for a new assessment.');
    if (lastClose) status = 'last_close';
    else if (freshness.label === 'Delayed') status = 'delayed';
  }
  if (quote.isMarketSessionOpen == null) reject('missing', 'Market session provenance is unavailable.');
  if (quote.isMarketSessionOpen === false && quote.status !== 'last_close') reject('missing', 'Closed-session prices require explicit last-close provenance.');
  if (quote.status === 'last_close' && quote.isMarketSessionOpen === true) reject('invalid', 'Last close conflicts with an open market session.');
  if (severity[quote.status] != null) reject(quote.status, 'Provider quality status: ' + quote.status + '.');
  else if (!['valid', 'delayed', 'last_close'].includes(quote.status)) reject('invalid', 'Unrecognized provider quality status.');
  if (!requiredEvidenceComplete) reasons.push('Required group, peer or supporting evidence is incomplete.');
  if (!accountingValid) reasons.push('Portfolio accounting has not reconciled.');
  return {
    eligibleForDecision: reasons.length === 0, status: blockedStatus ?? status,
    checkedAt: new Date(nowMs).toISOString(), reasons, sourceCount: quote.provider.trim() ? 1 : 0,
    marketTime: quote.marketTime, retrievedAt: quote.retrievedAt, source: quote.provider || null,
  };
}

export function normalizeDecisionQuote(symbol: string, input: Record<string, any> | undefined): ValidatedQuote {
  const q = input ?? {};
  const statuses: DataQualityStatus[] = ['valid', 'delayed', 'last_close', 'stale', 'missing', 'conflicting', 'simulated', 'invalid'];
  const status: DataQualityStatus = q.simulated === true || /mock|simulat|fixture|^qa$/i.test(q.provider ?? '') ? 'simulated'
    : q.stale === true ? 'stale' : q.status == null ? 'valid' : statuses.includes(q.status) ? q.status : 'invalid';
  const quote: ValidatedQuote = { symbol, price: typeof q.price === 'number' ? q.price : null, currency: q.currency ?? null,
    provider: typeof q.provider === 'string' ? q.provider : '', marketTime: q.marketTime ?? null, retrievedAt: q.retrievedAt ?? null,
    isMarketSessionOpen: typeof q.isMarketSessionOpen === 'boolean' ? q.isMarketSessionOpen : null,
    status, fallbackUsed: q.fallbackUsed === true, adjustedBasis: q.adjustedBasis };
  if (Array.isArray(q.independentObservations)) {
    const comparison = compareProviderQuotes([quote, ...q.independentObservations]);
    if (quote.status !== 'simulated' && (comparison.status === 'invalid' || comparison.status === 'conflicting')) quote.status = comparison.status;
  }
  return quote;
}
