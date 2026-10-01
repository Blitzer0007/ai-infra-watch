import { history as loadMarketHistory, providerSymbol } from './_market-data.js';

const MAX_SYMBOLS = 12;
const DEFAULT_LIMIT = 6;
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

function cleanSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function validSymbol(symbol) {
  return /^[A-Z0-9.^=-]{1,20}$/.test(symbol);
}

function toPct(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return ((to - from) / from) * 100;
}

function enrichReaction(points, eventDate) {
  if (!Array.isArray(points) || !points.length) return null;

  const eventIndex = points.findIndex(point => point.date >= eventDate);
  if (eventIndex < 0) return null;

  const before = points[eventIndex - 1];
  const event = points[eventIndex];
  if (!before || !Number.isFinite(before.price) || !Number.isFinite(event.price)) {
    return null;
  }

  return {
    anchorDate: before.date,
    anchorPrice: before.price,
    eventTradingDate: event.date,
    eventPrice: event.price,
    t1: toPct(event.price, points[eventIndex + 1]?.price),
    t5: toPct(event.price, points[eventIndex + 5]?.price),
    t20: toPct(event.price, points[eventIndex + 20]?.price),
  };
}

async function fetchFinnhub(symbol) {
  const apiKey = String(process.env.FINNHUB_API_KEY || '').trim();
  if (!apiKey) throw new Error('FINNHUB_API_KEY is not configured');

  const url = new URL('https://finnhub.io/api/v1/stock/earnings');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('limit', '8');
  url.searchParams.set('token', apiKey);

  const response = await fetch(url, {
    headers: { 'User-Agent': 'AI Infra Watch/1.0' },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error('Finnhub earnings history returned HTTP ' + response.status);
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

async function getSymbolHistory(symbol, limit) {
  const cacheKey = symbol + ':' + limit;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return { ...cached.value, cached: true };
  }

  const [earningsRows, market] = await Promise.all([
    fetchFinnhub(symbol),
    loadMarketHistory(symbol, '2y'),
  ]);

  const rows = earningsRows
    .filter(row => row?.period && row?.actual != null && row?.date)
    .slice(0, Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, 8)));

  const history = rows.map(row => ({
    symbol,
    period: String(row.period),
    reportDate: String(row.date),
    hour: row.hour || null,
    epsActual: Number.isFinite(Number(row.actual)) ? Number(row.actual) : null,
    epsEstimate: Number.isFinite(Number(row.estimate)) ? Number(row.estimate) : null,
    surprise: Number.isFinite(Number(row.surprise)) ? Number(row.surprise) : null,
    surprisePercent: Number.isFinite(Number(row.surprisePercent))
      ? Number(row.surprisePercent)
      : null,
    reaction: enrichReaction(market?.points, String(row.date)),
  }));

  const value = {
    symbol,
    yahooSymbol: providerSymbol(symbol),
    source: 'finnhub',
    marketSource: market?.source || null,
    historical: history,
  };
  cache.set(cacheKey, { at: Date.now(), value });
  return { ...value, cached: false };
}

export default async function handler(req, res) {
  const symbols = String(req.query?.symbols || req.query?.symbol || '')
    .split(',')
    .map(cleanSymbol)
    .filter(Boolean)
    .slice(0, MAX_SYMBOLS);
  const limit = Math.max(1, Math.min(Number(req.query?.limit) || DEFAULT_LIMIT, 8));

  if (!symbols.length || symbols.some(symbol => !validSymbol(symbol))) {
    return res.status(400).json({ error: 'One or more valid stock symbols are required.' });
  }

  try {
    const settled = await Promise.allSettled(
      symbols.map(symbol => getSymbolHistory(symbol, limit))
    );

    const historical = {};
    const errors = [];

    settled.forEach((result, index) => {
      const symbol = symbols[index];
      if (result.status === 'fulfilled') {
        historical[symbol] = result.value.historical;
      } else {
        errors.push({
          symbol,
          error: String(result.reason?.message || result.reason),
        });
      }
    });

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    return res.status(Object.keys(historical).length ? 200 : 503).json({
      ok: Object.keys(historical).length > 0,
      as_of: new Date().toISOString(),
      symbols,
      limit,
      historical,
      errors,
    });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({
      ok: false,
      historical: {},
      errors: [{ symbol: 'ALL', error: String(error?.message || error) }],
    });
  }
}
