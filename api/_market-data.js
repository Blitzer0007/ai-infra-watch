const YAHOO_SYMBOL = {
  DRAM: 'DRAM',
  SOXL: 'SOXL',
  // VivoPower changed Nasdaq ticker from VVPR to VIVO on 2026-03-16.
  // Yahoo Finance exposes the current symbol as VIVO; keep VVPR as a legacy alias.
  VIVO: 'VIVO',
  VVPR: 'VIVO',
  CBRS: 'CBRS',
  TSM: 'TSM',
  '000660.KS': '000660.KS'
};

const memoryCache = new Map();
const CACHE_MS = 60000;

function normalizedSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

export function providerSymbol(symbol) {
  const s = normalizedSymbol(symbol);
  return YAHOO_SYMBOL[s] || s;
}

function cacheKey(kind, symbol, range = '') {
  return kind + ':' + normalizedSymbol(symbol) + ':' + range;
}

function cachedValue(key, maxAge = CACHE_MS) {
  const item = memoryCache.get(key);
  return item && Date.now() - item.at < maxAge ? item.data : null;
}

function remember(key, data) {
  memoryCache.set(key, { at: Date.now(), data });
  return data;
}


export function classifyProviderError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  const http = message.match(/http\\s+(\\d{3})/);
  if (http) {
    const status = Number(http[1]);
    if (status === 429) return 'rate_limited';
    if (status >= 500) return 'provider_server_error';
    if (status >= 400) return 'provider_http_error';
  }
  if (/not configured/.test(message)) return 'not_configured';
  if (/no price|no .*history|no .*points|history unavailable|returned no price/.test(message)) return 'no_data';
  if (/rate limit|too many requests|quota/.test(message)) return 'rate_limited';
  if (/timeout|timed out|abort/.test(message)) return 'timeout';
  return 'provider_error';
}

async function fetchJson(url, options = {}, timeout = 8000) {
  const response = await fetch(url, {
    ...options,
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
  const cacheEntry = memoryCache.get(key);
  if (cacheEntry && Date.now() - cacheEntry.at < CACHE_MS) {
    return { ...cacheEntry.data, cached: true, cacheAgeMs: Date.now() - cacheEntry.at };
  }

  const providers = [
    ['yahoo', yahooQuote],
    ['finnhub', finnhubQuote],
    ['alpha-vantage', alphaQuote]
  ];
  const errors = [];
  for (const [name, fn] of providers) {
    try {
      const data = await fn(symbol);
      const providerAttempts = [...errors, { provider: name, status: 'ok' }];
      return remember(key, {
        ...data,
        providerStatus: errors.length ? 'FALLBACK' : 'PRIMARY',
        fallbackUsed: errors.length > 0,
        providerAttempts,
      });
    } catch (error) {
      errors.push({ provider: name, status: 'failed', errorCode: classifyProviderError(error) });
    }
  }

  const last = memoryCache.get(key);
  if (last) {
    return {
      ...last.data,
      stale: true,
      cached: true,
      cacheAgeMs: Date.now() - last.at,
      providerStatus: 'STALE_FALLBACK',
      fallbackUsed: true,
      providerAttempts: errors,
    };
  }
  const error = new Error('All market quote providers failed for ' + normalizedSymbol(symbol));
  error.providers = errors;
  throw error;
}

async function yahooHistory(symbol, range) {
  const chartBase = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(providerSymbol(symbol));
  const url = range === 'max'
    ? chartBase + '?period1=0&period2=' + Math.floor(Date.now() / 1000) + '&interval=1d&events=div%2Csplits'
    : chartBase + '?range=' + encodeURIComponent(range) + '&interval=1d&events=div%2Csplits';
  const result = (await fetchJson(url, { headers: { 'User-Agent': 'ai-infra-watch/1.0' } }))?.chart?.result?.[0];
  if (!result) throw new Error('No Yahoo history');
  const ts = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const adjustedCloses = result.indicators?.adjclose?.[0]?.adjclose || [];
  const points = ts.map((t, i) => ({
    date: new Date(t * 1000).toISOString().slice(0,10),
    price: closes[i],
    adjustedPrice: Number.isFinite(adjustedCloses[i]) ? adjustedCloses[i] : null,
    adjusted: Number.isFinite(adjustedCloses[i]),
  })).filter(p => Number.isFinite(p.price));
  if (!points.length) throw new Error('No Yahoo history points');
  return { points, currency: result.meta?.currency || 'USD', exchange: result.meta?.exchangeName || null };
}

function rangeDays(range) {
  return ({'1y':365,'2y':730,'5y':1825,'max':3650}[range] || 730);
}

async function finnhubHistory(symbol, range) {
  const key = String(process.env.FINNHUB_API_KEY || '').trim();
  if (!key) throw new Error('FINNHUB_API_KEY not configured');
  const to = Math.floor(Date.now() / 1000);
  const from = to - rangeDays(range) * 86400;
  const j = await fetchJson(
    'https://finnhub.io/api/v1/stock/candle?symbol=' + encodeURIComponent(normalizedSymbol(symbol)) +
      '&resolution=D&from=' + from + '&to=' + to + '&token=' + encodeURIComponent(key)
  );
  if (j?.s !== 'ok' || !Array.isArray(j?.c)) throw new Error('Finnhub history unavailable');
  const points = j.c.map((price, i) => ({
    date: new Date(j.t[i] * 1000).toISOString().slice(0,10),
    price,
    adjustedPrice: null,
    adjusted: false,
  })).filter(p => Number.isFinite(p.price));
  if (!points.length) throw new Error('No Finnhub history points');
  return { points, currency: 'USD', exchange: null };
}

async function alphaHistory(symbol, range) {
  const key = String(process.env.ALPHA_VANTAGE_API_KEY || '').trim();
  if (!key) throw new Error('ALPHA_VANTAGE_API_KEY not configured');
  const fn = range === '1y' || range === '2y' ? 'TIME_SERIES_DAILY' : 'TIME_SERIES_DAILY';
  const j = await fetchJson(
    'https://www.alphavantage.co/query?function=' + fn + '&symbol=' + encodeURIComponent(normalizedSymbol(symbol)) +
      '&outputsize=full&apikey=' + encodeURIComponent(key)
  );
  const series = j?.['Time Series (Daily)'];
  if (!series) throw new Error(j?.['Note'] || j?.['Information'] || 'Alpha Vantage history unavailable');
  const cutoff = Date.now() - rangeDays(range) * 86400000;
  const points = Object.entries(series)
    .filter(([date]) => new Date(date).getTime() >= cutoff)
    .map(([date, row]) => ({ date, price: Number(row?.['4. close']), adjustedPrice: null, adjusted: false }))
    .filter(p => Number.isFinite(p.price))
    .sort((a,b) => a.date.localeCompare(b.date));
  if (!points.length) throw new Error('No Alpha Vantage history points');
  return { points, currency: 'USD', exchange: null };
}

export async function history(symbol, range = '2y') {
  const key = cacheKey('history', symbol, range);
  const cacheEntry = memoryCache.get(key);
  if (cacheEntry && Date.now() - cacheEntry.at < 300000) {
    return { ...cacheEntry.data, cached: true, cacheAgeMs: Date.now() - cacheEntry.at };
  }

  const providers = [
    ['yahoo', yahooHistory],
    ['finnhub', finnhubHistory],
    ['alpha-vantage', alphaHistory]
  ];
  const errors = [];
  for (const [name, fn] of providers) {
    try {
      const data = await fn(symbol, range);
      const providerAttempts = [...errors, { provider: name, status: 'ok' }];
      return remember(key, {
        ...data,
        source: name === 'yahoo' ? 'Yahoo Finance' : name === 'finnhub' ? 'Finnhub' : 'Alpha Vantage',
        provider: name,
        stale: false,
        providerStatus: errors.length ? 'FALLBACK' : 'PRIMARY',
        fallbackUsed: errors.length > 0,
        providerAttempts,
      });
    } catch (error) {
      errors.push({ provider: name, status: 'failed', errorCode: classifyProviderError(error) });
    }
  }

  const last = memoryCache.get(key);
  if (last) {
    return {
      ...last.data,
      stale: true,
      cached: true,
      cacheAgeMs: Date.now() - last.at,
      providerStatus: 'STALE_FALLBACK',
      fallbackUsed: true,
      providerAttempts: errors,
    };
  }
  const error = new Error('All market history providers failed for ' + normalizedSymbol(symbol));
  error.providers = errors;
  throw error;
}