// Pure checks: no provider requests, credentials, averaging, or fallback substitution.
export function compareProviderQuotes(quotes, { discrepancyPct = 2, maxTimeDifferenceMs = 60000 } = {}) {
  if (!Number.isFinite(discrepancyPct) || discrepancyPct < 0 || !Number.isFinite(maxTimeDifferenceMs) || maxTimeDifferenceMs < 0) throw new Error('Invalid comparison thresholds');
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
