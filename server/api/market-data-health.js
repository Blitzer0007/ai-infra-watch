import { requireAccess } from '../../api/_access-auth.js';
import { history as routedHistory, quote as routedQuote, classifyProviderError } from '../../api/_market-data.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\\/$/, '');
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const CACHE_MS = 120000;
let cache = { expiresAt: 0, data: null };

function supabaseHeaders() {
  if (!SUPABASE_KEY) throw new Error('Market data health storage is not configured');
  const headers = { apikey: SUPABASE_KEY };
  if (!SUPABASE_KEY.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + SUPABASE_KEY;
  return headers;
}

async function loadRepresentativeSymbols() {
  if (!SUPABASE_URL) throw new Error('Market data health storage is not configured');
  const response = await fetch(
    SUPABASE_URL + '/rest/v1/portfolio_holdings?select=symbol,quantity,average_cost&quantity=gt.0&order=symbol.asc&limit=100',
    { headers: supabaseHeaders(), signal: AbortSignal.timeout(6000) },
  );
  if (!response.ok) throw new Error('Portfolio symbol lookup failed');
  const rows = await response.json();
  const ranked = (Array.isArray(rows) ? rows : [])
    .map(row => ({
      symbol: String(row.symbol || '').trim().toUpperCase(),
      costBasis: Number(row.quantity) * Number(row.average_cost),
    }))
    .filter(row => /^[A-Z0-9.^=-]{1,20}$/.test(row.symbol) && Number.isFinite(row.costBasis) && row.costBasis >= 0)
    .sort((a, b) => b.costBasis - a.costBasis);
  return [...new Set(['SPY', ...ranked.slice(0, 3).map(row => row.symbol)])];
}

function ageSeconds(value, nowMs = Date.now()) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor((nowMs - timestamp) / 1000)) : null;
}

export function summarizeMarketQuote(data, nowMs = Date.now()) {
  if (!data || !(Number(data.price) > 0)) return { available: false, errorCode: 'no_data' };
  return {
    available: true,
    provider: data.provider || 'unknown',
    providerStatus: data.providerStatus || (data.cached ? 'CACHED' : 'PRIMARY'),
    fallbackUsed: Boolean(data.fallbackUsed),
    stale: Boolean(data.stale),
    cached: Boolean(data.cached),
    cacheAgeMs: Number.isFinite(Number(data.cacheAgeMs)) ? Number(data.cacheAgeMs) : null,
    asOf: data.asOf || data.marketTime || null,
    ageSeconds: ageSeconds(data.asOf || data.marketTime, nowMs),
    providerAttempts: Array.isArray(data.providerAttempts) ? data.providerAttempts.map(item => ({
      provider: String(item.provider || 'unknown'),
      status: item.status === 'ok' ? 'ok' : 'failed',
      errorCode: item.errorCode || null,
    })) : [],
  };
}

export function summarizeMarketHistory(data, nowMs = Date.now()) {
  const points = Array.isArray(data?.points) ? data.points : [];
  const adjustedPoints = points.filter(point => point?.adjusted === true && Number(point?.adjustedPrice) > 0);
  const firstDate = points[0]?.date || null;
  const lastDate = points.at(-1)?.date || null;
  const latestTimestamp = lastDate ? Date.parse(String(lastDate) + 'T23:59:59.000Z') : NaN;
  return {
    available: points.length > 0,
    provider: data?.provider || 'unknown',
    providerStatus: data?.providerStatus || (data?.cached ? 'CACHED' : 'PRIMARY'),
    fallbackUsed: Boolean(data?.fallbackUsed),
    stale: Boolean(data?.stale),
    cached: Boolean(data?.cached),
    cacheAgeMs: Number.isFinite(Number(data?.cacheAgeMs)) ? Number(data.cacheAgeMs) : null,
    firstDate,
    lastDate,
    ageDays: Number.isFinite(latestTimestamp) ? Math.max(0, Math.floor((nowMs - latestTimestamp) / 86400000)) : null,
    pointCount: points.length,
    adjustedPointCount: adjustedPoints.length,
    adjustedCoveragePct: points.length ? Math.round((adjustedPoints.length / points.length) * 100) : 0,
    adjustedCloseAvailable: points.length > 0 && adjustedPoints.length === points.length,
    currency: data?.currency || null,
    providerAttempts: Array.isArray(data?.providerAttempts) ? data.providerAttempts.map(item => ({
      provider: String(item.provider || 'unknown'),
      status: item.status === 'ok' ? 'ok' : 'failed',
      errorCode: item.errorCode || null,
    })) : [],
  };
}

export function summarizeMarketDataHealth(symbol, quoteData, historyData, nowMs = Date.now()) {
  return {
    symbol,
    quote: summarizeMarketQuote(quoteData, nowMs),
    history: summarizeMarketHistory(historyData, nowMs),
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAccess(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET required' });
  if (cache.data && Date.now() < cache.expiresAt && String(req.query?.refresh || '') !== 'true') {
    return res.status(200).json({ ...cache.data, cached: true, cacheAgeMs: CACHE_MS - Math.max(0, cache.expiresAt - Date.now()) });
  }

  try {
    const symbols = await loadRepresentativeSymbols();
    const rows = await Promise.all(symbols.map(async symbol => {
      const [quoteResult, historyResult] = await Promise.allSettled([
        routedQuote(symbol),
        routedHistory(symbol, '1y'),
      ]);
      const quoteData = quoteResult.status === 'fulfilled' ? quoteResult.value : null;
      const historyData = historyResult.status === 'fulfilled' ? historyResult.value : null;
      return {
        symbol,
        quote: quoteData
          ? summarizeMarketQuote(quoteData)
          : { available: false, errorCode: classifyProviderError(quoteResult.reason) },
        history: historyData
          ? summarizeMarketHistory(historyData)
          : { available: false, errorCode: classifyProviderError(historyResult.reason) },
      };
    }));
    const data = {
      ok: true,
      retrievedAt: new Date().toISOString(),
      sample: { benchmark: 'SPY', portfolioHoldings: symbols.filter(symbol => symbol !== 'SPY'), maxPortfolioHoldings: 3 },
      rows,
    };
    cache = { expiresAt: Date.now() + CACHE_MS, data };
    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Market data health unavailable',
    });
  }
}
