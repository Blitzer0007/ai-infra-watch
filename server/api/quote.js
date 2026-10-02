const YAHOO_SYMBOL = { CERE: 'CBRS' };
const cache = new Map();
const CACHE_MS = 60000;

function yahooSymbol(symbol) {
  return YAHOO_SYMBOL[symbol] || symbol;
}

function validateSymbol(symbol) {
  return typeof symbol === 'string' && /^[A-Za-z0-9.^=-]{1,20}$/.test(symbol);
}

export default async function handler(req, res) {
  const symbol = String(req.query?.symbol || '').trim().toUpperCase();
  if (!validateSymbol(symbol)) return res.status(400).json({ error: 'Valid symbol is required' });

  const forceRefresh = String(req.query?.refresh || '').toLowerCase() === 'true' || req.query?.refresh === '1';
  const cached = cache.get(symbol);
  if (!forceRefresh && cached && Date.now() - cached.at < CACHE_MS) {
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ ...cached.data, cached: true, cacheAgeMs: Date.now() - cached.at });
  }

  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(yahooSymbol(symbol)) + '?range=1d&interval=1d';
  const r = await fetch(url, { headers: { 'User-Agent': 'ai-infra-watch/1.0' } });
  if (!r.ok) return res.status(r.status).json({ error: 'Market data provider returned HTTP ' + r.status });

  const j = await r.json();
  const result = j?.chart?.result?.[0];
  if (!result) return res.status(404).json({ error: 'No market data found for ' + symbol });

  const meta = result.meta || {};
  const closes = result.indicators?.quote?.[0]?.close || [];
  const valid = closes.filter(v => typeof v === 'number');
  const price = typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : valid.at(-1);
  const prevClose = typeof meta.chartPreviousClose === 'number'
    ? meta.chartPreviousClose
    : valid.length > 1 ? valid.at(-2) : undefined;
  if (!Number.isFinite(price)) return res.status(404).json({ error: 'No price available for ' + symbol });

  const changePct = Number.isFinite(prevClose) && prevClose !== 0
    ? ((price / prevClose) - 1) * 100
    : 0;

  const quote = {
    symbol,
    yahooSymbol: yahooSymbol(symbol),
    price,
    changePct,
    low: Number(meta.regularMarketDayLow) || price,
    high: Number(meta.regularMarketDayHigh) || price,
    prevClose: Number(prevClose) || price,
    source: 'live',
    provider: 'Yahoo Finance',
    retrievedAt: new Date().toISOString(),
    marketTime: Number.isFinite(meta.regularMarketTime) ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    stale: false
  };
  cache.set(symbol, { at: Date.now(), data: quote });
  res.setHeader('Cache-Control', forceRefresh ? 'no-store' : 's-maxage=60, stale-while-revalidate=300');
  return res.status(200).json(quote);
}