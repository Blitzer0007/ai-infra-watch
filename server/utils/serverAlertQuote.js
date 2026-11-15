import { getMarketSessionInfo } from './serverAlertSession.js';

export const SERVER_ALERT_QUOTE_MAX_AGE_MS = 15 * 60_000;
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const instant = value => Number.isSafeInteger(value) && value >= 0 && value <= 253402300799;

/** Yahoo chart metadata admission, not independent source verification. */
export function admitYahooAlertQuote(symbol, meta, nowMs, retrievedAtMs) {
  const blocked = reason => ({ eligible: false, reason, quote: null });
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs > 253402300799999 || !Number.isSafeInteger(retrievedAtMs) ||
      retrievedAtMs > nowMs || nowMs - retrievedAtMs > SERVER_ALERT_QUOTE_MAX_AGE_MS) return blocked('invalid-retrieval-time');
  if (!/^[A-Z0-9.^=-]{1,20}$/.test(symbol || '') || !meta || typeof meta !== 'object' || Array.isArray(meta) || meta.symbol !== symbol) return blocked('identity-missing-or-mismatched');
  if (meta.currency !== 'USD' || !['America/New_York', 'US/Eastern'].includes(meta.exchangeTimezoneName)) return blocked('unsupported-quote-units-or-exchange');
  for (const flag of ['simulated', 'stale', 'fallbackUsed']) if (meta[flag] != null && meta[flag] !== false) return blocked('unsupported-quality-marker');
  if (!positive(meta.regularMarketPrice) || !instant(meta.regularMarketTime)) return blocked('invalid-price-or-market-time');
  const marketMs = meta.regularMarketTime * 1000;
  if (marketMs > retrievedAtMs || nowMs - marketMs > SERVER_ALERT_QUOTE_MAX_AGE_MS) return blocked('stale-or-future-market-time');
  const regular = meta.currentTradingPeriod?.regular;
  if (!instant(regular?.start) || !instant(regular?.end) || regular.start >= regular.end ||
      marketMs < regular.start * 1000 || marketMs >= regular.end * 1000 || nowMs < regular.start * 1000 || nowMs >= regular.end * 1000) return blocked('regular-session-not-confirmed');
  if (meta.marketState != null && meta.marketState !== 'REGULAR') return blocked('non-regular-market-state');
  const nowSession = getMarketSessionInfo(new Date(nowMs));
  const marketSession = getMarketSessionInfo(new Date(marketMs));
  if (!nowSession.isRegularHours || !marketSession.isRegularHours || nowSession.sessionDate !== marketSession.sessionDate) return blocked('incompatible-market-session');
  const price = meta.regularMarketPrice;
  const previousClose = positive(meta.chartPreviousClose) ? meta.chartPreviousClose : null;
  const change = previousClose === null ? null : (price / previousClose - 1) * 100;
  return { eligible: true, reason: null, quote: { price,
    changePct: Number.isFinite(change) ? change : null, marketState: 'REGULAR',
    marketTime: new Date(marketMs).toISOString(), retrievedAt: new Date(retrievedAtMs).toISOString(),
    returnedSymbol: symbol, currency: 'USD', adjustedBasis: 'raw', provider: 'Yahoo Finance', sourceMode: 'live' } };
}

export async function fetchServerAlertQuote(symbol, fetcher = fetch, clock = () => Date.now()) {
  if (!/^[A-Z0-9.^=-]{1,20}$/.test(symbol || '')) return null;
  const response = await fetcher('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?range=1d&interval=1d', {
    headers: { 'User-Agent': 'ai-infra-watch/1.0' }, signal: AbortSignal.timeout(8000), redirect: 'error',
  });
  if (!response.ok) throw Error('quote unavailable');
  const payload = await response.json();
  const results = payload?.chart?.result;
  if (payload?.chart?.error != null || !Array.isArray(results) || results.length !== 1) return null;
  const nowMs = clock();
  return admitYahooAlertQuote(symbol, results[0]?.meta, nowMs, nowMs).quote;
}
