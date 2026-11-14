// Pure checks: no provider requests, credentials, averaging, or fallback substitution.
export function compareProviderQuotes(quotes, { discrepancyPct = 2, maxTimeDifferenceMs = 60000 } = {}) {
  if (!Number.isFinite(discrepancyPct) || discrepancyPct < 0 || !Number.isFinite(maxTimeDifferenceMs) || maxTimeDifferenceMs < 0) throw new Error('Invalid comparison thresholds');
  if (!Array.isArray(quotes) || quotes.length > 32 || quotes.some(q => !q || typeof q !== 'object')) return { status: 'invalid', reason: 'Malformed or excessive provider observations' };
  for (let i = 0; i < quotes.length; i++) for (let j = i + 1; j < quotes.length; j++) {
    const a = quotes[i], b = quotes[j];
    if (!a.provider || !b.provider || a.provider === b.provider || a.symbol !== b.symbol) continue;
    if (!a.currency || a.currency !== b.currency || !a.adjustedBasis || a.adjustedBasis !== b.adjustedBasis) return { status: 'invalid', reason: 'Incomparable currency or adjustment basis' };
    if (![a.price, b.price].every(x => typeof x === 'number' && Number.isFinite(x) && x > 0)) return { status: 'invalid', reason: 'Invalid price' };
    const times = [Date.parse(a.marketTime), Date.parse(b.marketTime)];
    if (!times.every(Number.isFinite) || Math.abs(times[0] - times[1]) > maxTimeDifferenceMs) continue;
    if (Math.abs(a.price - b.price) / Math.min(a.price, b.price) * 100 > discrepancyPct) return { status: 'conflicting', reason: 'Independent comparable prices exceed discrepancy threshold' };
  }
  return { status: 'valid', reason: 'No comparable conflict detected; this alone does not establish eligibility' };
}
export function adjustedHistoryEligible(points) {
  return points.length > 0 && points.every(p => p.adjustedBasis === 'total_return' && typeof p.price === 'number' && Number.isFinite(p.price) && p.price > 0);
}

/** Price coverage and observation-time coverage are separate from provider health. */
export function summarizeQuoteCoverage(quotes, expectedSymbols, nowMs = Date.now()) {
  const symbols = [...new Set(expectedSymbols)];
  const observed = symbols.filter(symbol => typeof quotes[symbol]?.price === 'number' && Number.isFinite(quotes[symbol].price) && quotes[symbol].price > 0);
  const times = observed.map(symbol => quotes[symbol].marketTime).filter(value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) && Date.parse(value) <= nowMs + 120000);
  const ordered = times.sort((a,b)=>Date.parse(a)-Date.parse(b));
  const completeTimes = symbols.length > 0 && observed.length === symbols.length && times.length === symbols.length;
  return { expected:symbols.length,observed:observed.length,priceCoverage:observed.length===0?'unavailable':observed.length===symbols.length?'complete':'partial',
    missingSymbols:symbols.filter(symbol=>!observed.includes(symbol)),
    missingMoveSymbols:observed.filter(symbol=>typeof quotes[symbol].changePct!=='number'||!Number.isFinite(quotes[symbol].changePct)),
    unknownTimeSymbols:observed.filter(symbol=>!ordered.includes(quotes[symbol].marketTime)),
    staleSymbols:observed.filter(symbol=>quotes[symbol].stale===true),
    providers:[...new Set(observed.map(symbol=>quotes[symbol].provider).filter(value=>typeof value==='string'&&value))],
    timeCoverage:completeTimes?'complete':'incomplete',asOf:completeTimes?ordered[0]:null };
}

/** Normalize provider-supplied regular-session boundaries without guessing a calendar. */
export function regularSessionMetadata(meta, nowMs = Date.now()) {
  const marketSeconds = meta?.regularMarketTime;
  const period = meta?.currentTradingPeriod?.regular;
  const timestamp = typeof marketSeconds === 'number' && Number.isFinite(marketSeconds) && marketSeconds > 0 && marketSeconds <= 8640000000000
    ? marketSeconds * 1000 : null;
  const start = typeof period?.start === 'number' && Number.isFinite(period.start) && period.start > 0 ? period.start * 1000 : null;
  const end = typeof period?.end === 'number' && Number.isFinite(period.end) && period.end > 0 ? period.end * 1000 : null;
  const knownSession = start != null && end != null && start < end && end - start <= 24 * 3600000;
  const open = knownSession ? nowMs >= start && nowMs < end : null;
  // Closed does not automatically mean last close: a premarket quote or an old
  // session must not be relabelled as the latest close. The provider must identify
  // a completed regular session, with an observation at its close (15m tolerance).
  const closingObservation = knownSession && nowMs >= end && timestamp != null && timestamp >= end - 15 * 60000 && timestamp <= end + 120000;
  return {
    marketTime: timestamp == null ? null : new Date(timestamp).toISOString(),
    isMarketSessionOpen: open,
    status: closingObservation ? 'last_close' : open === true ? 'valid' : 'missing',
  };
}
