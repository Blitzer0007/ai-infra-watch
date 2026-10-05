    signal: options.signal || AbortSignal.timeout(timeout)
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

async function yahooQuote(symbol) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(providerSymbol(symbol)) + '?range=5d&interval=1d';
  const j = await fetchJson(url, { headers: { 'User-Agent': 'ai-infra-watch/1.0' } });
  const result = j?.chart?.result?.[0];
  const meta = result?.meta;
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const valid = closes.filter(Number.isFinite);
  const price = Number.isFinite(meta?.regularMarketPrice) ? meta.regularMarketPrice : valid.at(-1);
  const previous = valid.length > 1 ? valid.at(-2) : meta?.previousClose;
  if (!Number.isFinite(price)) throw new Error('No price');
  return {
    price,
    changePct: Number.isFinite(previous) && previous !== 0 ? ((price / previous) - 1) * 100 : 0,
    source: 'Yahoo Finance',
    provider: 'yahoo',
    marketTime: Number.isFinite(Number(meta?.regularMarketTime)) ? new Date(Number(meta.regularMarketTime) * 1000).toISOString() : null,
    asOf: Number.isFinite(Number(meta?.regularMarketTime)) ? new Date(Number(meta.regularMarketTime) * 1000).toISOString() : new Date().toISOString(),
    stale: false
  };
}

async function finnhubQuote(symbol) {
  const key = String(process.env.FINNHUB_API_KEY || '').trim();
  if (!key) throw new Error('FINNHUB_API_KEY not configured');
  const j = await fetchJson(
    'https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(normalizedSymbol(symbol)) + '&token=' + encodeURIComponent(key),
    { headers: { Accept: 'application/json' } }
  );
  if (!Number.isFinite(j?.c) || j.c <= 0) throw new Error('Finnhub returned no price');
  return {
    price: j.c,
    changePct: Number.isFinite(j.dp) ? j.dp : 0,
    source: 'Finnhub',
    provider: 'finnhub',
    asOf: j.t ? new Date(j.t * 1000).toISOString() : new Date().toISOString(),
    stale: false
  };
}

async function alphaQuote(symbol) {
  const key = String(process.env.ALPHA_VANTAGE_API_KEY || '').trim();
  if (!key) throw new Error('ALPHA_VANTAGE_API_KEY not configured');
  const j = await fetchJson(
    'https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=' +
      encodeURIComponent(normalizedSymbol(symbol)) + '&apikey=' + encodeURIComponent(key),
    { headers: { Accept: 'application/json' } }
  );
  const q = j?.['Global Quote'];
  const price = Number(q?.['05. price']);
  if (!Number.isFinite(price) || price <= 0) throw new Error(j?.['Note'] || j?.['Information'] || 'Alpha Vantage returned no price');
  return {
    price,
    changePct: Number(q?.['10. change percent']?.replace('%', '')) || 0,
    source: 'Alpha Vantage',
    provider: 'alpha-vantage',
    asOf: q?.['07. latest trading day'] ? q['07. latest trading day'] + 'T00:00:00.000Z' : new Date().toISOString(),
    stale: false
  };
}

export async function quote(symbol) {
  const key = cacheKey('quote', symbol);
  const cached = cachedValue(key);
  if (cached) return { ...cached, cached: true };
