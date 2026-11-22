import { providerSymbol, classifyProviderError } from '../../api/_market-data.js';
import { normalizeYahooQuote } from '../services/quoteNormalization.js';
import { quoteFailureReason } from '../utils/quoteFailureReasons.js';

const CACHE_MS = 60_000;
const validSymbol = value => typeof value === 'string' && /^[A-Z0-9.^=-]{1,20}$/.test(value);

/** The public route stays Yahoo-only: no configured-key fallback or new polling. */
export function createQuoteHandler({ fetcher = (...args) => fetch(...args), clock = () => Date.now() } = {}) {
  const cache = new Map();
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const symbol = typeof req.query?.symbol === 'string' ? req.query.symbol.trim().toUpperCase() : '';
    if (!validSymbol(symbol)) return res.status(400).json({ error: 'Valid symbol is required' });
    const forceRefresh = typeof req.query?.refresh === 'string' && ['true', '1'].includes(req.query.refresh.toLowerCase());
    const nowMs = clock();
    const cached = cache.get(symbol);
    const cacheAgeMs = cached ? nowMs - cached.at : null;
    if (!forceRefresh && cached && cacheAgeMs >= 0 && cacheAgeMs < CACHE_MS)
      return res.status(200).json({ ...cached.data, cached: true, cacheAgeMs });

    try {
      const yahooSymbol = providerSymbol(symbol);
      const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
        encodeURIComponent(yahooSymbol) + '?range=5d&interval=1d';
      const response = await fetcher(url, {
        headers: { 'User-Agent': 'ai-infra-watch/1.0' }, signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const payload = await response.json();
      const retrievedAtMs = clock();
      const observed = normalizeYahooQuote(payload?.chart?.result?.[0], retrievedAtMs, yahooSymbol);
      const data = {
        symbol, yahooSymbol, ...observed,
        providerStatus: 'PRIMARY', fallbackUsed: false,
        providerAttempts: [{ provider: 'yahoo', status: 'ok' }],
      };
      cache.set(symbol, { at: retrievedAtMs, data });
      return res.status(200).json({ ...data, cached: false, cacheAgeMs: 0 });
    } catch (error) {
      const errorCode = classifyProviderError(error);
      const providerAttempts = [{ provider: 'yahoo', status: 'failed', errorCode }];
      const status = errorCode === 'rate_limited' ? 503 : errorCode === 'timeout' ? 504 : 502;
      return res.status(status).json({ error: quoteFailureReason({ providers: providerAttempts }), providerAttempts });
    }
  };
}

export default createQuoteHandler();
