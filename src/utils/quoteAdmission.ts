/** Declared quote integrity only; no source authentication, accounting or trade authority. */
import { evaluateQuoteQuality, normalizeDecisionQuote, type DataQualityStatus } from './decisionEligibility';
import { validCalendarInstant } from './catalystCalendar';

export function evaluateDeclaredQuote(symbol: string, value: unknown, nowMs: number,
  policy: { requireOpenSession?: boolean; maxAgeMs?: number } = {}) {
  const reasons: string[] = [];
  const blocked = (status: DataQualityStatus = 'invalid') => ({ eligible: false, status, reasons, quote: null });
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs > 8_640_000_000_000_000 || !/^[A-Z0-9.^=-]{1,20}$/.test(symbol) || !value || typeof value !== 'object' || Array.isArray(value)) {
    reasons.push('Invalid clock, symbol or quote packet.'); return blocked();
  }
  const q = value as Record<string, any>;
  if (typeof q.returnedSymbol !== 'string' || q.returnedSymbol.trim().toUpperCase() !== symbol || (q.symbol != null && q.symbol !== symbol)) reasons.push('Provider-returned identity is missing or mismatched.');
  if (q.sourceMode !== 'live') reasons.push('A declared live source mode is required.');
  if (q.adjustedBasis !== 'raw') reasons.push('Loaded positions require raw USD quote units.');
  for (const flag of ['stale', 'simulated', 'fallbackUsed']) if (q[flag] != null && typeof q[flag] !== 'boolean') reasons.push('Malformed quality marker: ' + flag + '.');
  if (q.simulated === true || q.stale === true) reasons.push('Simulated or stale quotes are withheld.');
  if (q.marketTimePrecision !== 'instant' || !validCalendarInstant(q.marketTime) || !validCalendarInstant(q.retrievedAt)) reasons.push('Exact market and retrieval instants are required.');
  if (policy.requireOpenSession && q.isMarketSessionOpen !== true) reasons.push('Automatic browser alerts require an explicitly open regular session.');
  if (q.independentObservations != null && !Array.isArray(q.independentObservations)) reasons.push('Malformed independent-observation collection.');
  if (Array.isArray(q.independentObservations) && (q.independentObservations.length > 32 || q.independentObservations.some(row =>
    !row || typeof row !== 'object' || Array.isArray(row) || row.symbol !== symbol || typeof row.provider !== 'string' || !row.provider.trim() || row.provider.length > 80
      || typeof row.price !== 'number' || !Number.isFinite(row.price) || row.price <= 0 || row.currency !== 'USD' || row.adjustedBasis !== 'raw'
      || !validCalendarInstant(row.marketTime)))) reasons.push('Independent price-comparison metadata is incomplete or incompatible.');
  if (typeof q.provider !== 'string' || !q.provider.trim() || q.provider.length > 80 || /[\u0000-\u001f\u007f]/.test(q.provider)) reasons.push('A bounded provider label is required.');
  if (reasons.length) return blocked(q.simulated === true || q.sourceMode === 'simulated' ? 'simulated' : q.stale === true ? 'stale' : q.status === 'conflicting' ? 'conflicting' : 'invalid');
  const quote = normalizeDecisionQuote(symbol, q);
  const quality = evaluateQuoteQuality(quote, nowMs);
  reasons.push(...quality.reasons);
  if (policy.maxAgeMs !== undefined) {
    if (!Number.isFinite(policy.maxAgeMs) || policy.maxAgeMs < 0) reasons.push('Invalid quote age policy.');
    else if (nowMs - Date.parse(quote.marketTime!) > policy.maxAgeMs || nowMs - Date.parse(quote.retrievedAt!) > policy.maxAgeMs) reasons.push('Market observation or retrieval exceeds the automatic-alert age policy.');
  }
  return { eligible: reasons.length === 0, status: quality.status, reasons, quote: reasons.length ? null : quote };
}
