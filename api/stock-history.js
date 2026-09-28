const YAHOO_SYMBOL = { CERE: 'CBRS' };
const ALLOWED_RANGES = new Set(['1y', '2y', '5y', 'max']);
const cache = new Map();
const CACHE_MS = 300000;

function yahooSymbol(symbol) {
  return YAHOO_SYMBOL[symbol] || symbol;
}

function validateSymbol(symbol) {
  return typeof symbol === 'string' && /^[A-Za-z0-9.^=-]{1,20}$/.test(symbol);
}

export default async function handler(req, res) {
  const symbol = String(req.query?.symbol || '').trim().toUpperCase();
  const range = String(req.query?.range || '2y').trim();

  if (!validateSymbol(symbol)) return res.status(400).json({ error: 'Valid symbol is required' });
  if (!ALLOWED_RANGES.has(range)) return res.status(400).json({ error: 'Unsupported history range' });

  const key = symbol + ':' + range;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
    return res.status(200).json({ ...cached.data, cached: true });
  }

  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(yahooSymbol(symbol)) +
    '?range=' + encodeURIComponent(range) + '&interval=1d&events=div%2Csplits';

  const r = await fetch(url, { headers: { 'User-Agent': 'ai-infra-watch/1.0' } });
  if (!r.ok) return res.status(r.status).json({ error: 'Market history provider returned HTTP ' + r.status });

  const j = await r.json();
  const result = j?.chart?.result?.[0];
  if (!result) return res.status(404).json({ error: 'No historical market data found for ' + symbol });

  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const points = timestamps
    .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), price: closes[i] }))
    .filter(p => Number.isFinite(p.price));

  if (!points.length) return res.status(404).json({ error: 'No historical market data found for ' + symbol });

  const data = {
    symbol,
    yahooSymbol: yahooSymbol(symbol),
    currency: result.meta?.currency || 'USD',
    exchange: result.meta?.exchangeName || null,
    points,
    source: 'Yahoo Finance'
  };

  cache.set(key, { at: Date.now(), data });
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
  return res.status(200).json(data);
}