/** Data Health display adapter: summarizes ONLY the already loaded bounded market sample.
 * A provider's remaining quota and original publication time are not available from
 * providerAttempts, and must never be invented from an HTTP 429 classification.
 * Calendar age is not a trading-session freshness certification.
 */
export function summarizeMarketObservation(rows, { loading = false, error = '' } = {}) {
  const counts = {
    sampleRows: 0, quoteWithheld: 0, quoteAdmissionUnknown: 0, quoteUnavailable: 0, quoteTimeUnknown: 0, quoteAged: 0,
    historyUnavailable: 0, historyDateUnknown: 0, historyAged: 0,
    adjustedIncomplete: 0, fallbackRows: 0, rateLimitedAttempts: 0,
  };
  if (error) return { state: 'unknown', observed: false, quotaRemaining: null, ...counts };
  if (!Array.isArray(rows) || rows.length === 0) return {
    state: loading ? 'loading' : 'unknown', observed: false, quotaRemaining: null, ...counts,
  };
  const finiteAge = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  for (const item of rows) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const quote = item.quote && typeof item.quote === 'object' && !Array.isArray(item.quote) ? item.quote : {};
    const history = item.history && typeof item.history === 'object' && !Array.isArray(item.history) ? item.history : {};
    counts.sampleRows++;
    if (quote.valuationAdmission?.eligible === false) counts.quoteWithheld++;
    else if (quote.valuationAdmission?.eligible !== true) counts.quoteAdmissionUnknown++;
    if (quote.available !== true) counts.quoteUnavailable++;
    else if (finiteAge(quote.ageSeconds) === null || quote.futureTimestampDetected === true) counts.quoteTimeUnknown++;
    else if (quote.ageSeconds > 900 || quote.stale === true) counts.quoteAged++;
    if (history.available !== true) counts.historyUnavailable++;
    else if (finiteAge(history.ageDays) === null || history.futureDateDetected === true || Number(history.invalidDateCount || 0) > 0) counts.historyDateUnknown++;
    else if (history.ageDays > 5 || history.stale === true) counts.historyAged++;
    if (history.adjustedCloseAvailable !== true) counts.adjustedIncomplete++;
    if (quote.fallbackUsed === true || history.fallbackUsed === true) counts.fallbackRows++;
    // May contain attempts from different providers; these are ATTEMPTS, never unique quota events.
    for (const attempts of [quote.providerAttempts, history.providerAttempts]) {
      if (!Array.isArray(attempts)) continue;
      counts.rateLimitedAttempts += attempts.filter(attempt =>
        attempt && typeof attempt === 'object' && attempt.errorCode === 'rate_limited'
      ).length;
    }
    if (quote.errorCode === 'rate_limited' && !Array.isArray(quote.providerAttempts)) counts.rateLimitedAttempts++;
    if (history.errorCode === 'rate_limited' && !Array.isArray(history.providerAttempts)) counts.rateLimitedAttempts++;
  }
  if (!counts.sampleRows) return { state: 'unknown', observed: false, quotaRemaining: null, ...counts };
  const attention = counts.quoteWithheld || counts.quoteUnavailable || counts.quoteAged || counts.historyUnavailable ||
    counts.historyAged || counts.rateLimitedAttempts;
  const incomplete = counts.quoteAdmissionUnknown || counts.quoteTimeUnknown || counts.historyDateUnknown || counts.adjustedIncomplete || counts.fallbackRows;
  return {
    state: attention ? 'attention' : incomplete ? 'partial' : 'observed-only',
    observed: true,
    quotaRemaining: null,
    ...counts,
  };
}
