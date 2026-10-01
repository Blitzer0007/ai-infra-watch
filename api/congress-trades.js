const CACHE_MS = 5 * 60 * 1000;
const STALE_CACHE_MS = 24 * 60 * 60 * 1000;
const cache = new Map();


let tickerDirectoryCache = null;
let tickerDirectoryAt = 0;

function normalizeSearchText(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9.-]+/g, ' ');
}

async function resolveCompanyTicker(query) {
  const normalized = normalizeSearchText(query);
  if (!normalized || normalized.length < 2) return null;

  if (tickerDirectoryCache && Date.now() - tickerDirectoryAt < 10 * 60 * 1000) {
    return scoreTickerMatches(tickerDirectoryCache, normalized)[0] || null;
  }

  const response = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: {
      'User-Agent': 'AI Infra Watch/1.0 (research dashboard; contact: dev@example.com)',
      'Accept-Encoding': 'gzip, deflate'
    },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('SEC ticker directory HTTP ' + response.status);

  const payload = await response.json();
  tickerDirectoryCache = Object.values(payload || {})
    .map((entry) => ({
      ticker: String(entry?.ticker || '').trim().toUpperCase(),
      title: String(entry?.title || '').trim()
    }))
    .filter((entry) => entry.ticker && entry.title);
  tickerDirectoryAt = Date.now();

  return scoreTickerMatches(tickerDirectoryCache, normalized)[0] || null;
}

function scoreTickerMatches(rows, query) {
  return rows
    .map((row) => {
      const ticker = normalizeSearchText(row.ticker);
      const title = normalizeSearchText(row.title);
      const tokens = query.split(' ').filter(Boolean);
      let score = 0;
      if (ticker === query) score = 1000;
      else if (title === query) score = 900;
      else if (title.startsWith(query)) score = 700;
      else if (title.includes(query)) score = 500;
      else {
        const matched = tokens.filter((token) => title.includes(token)).length;
        score = matched ? 300 + matched * 25 - Math.max(0, tokens.length - matched) * 5 : 0;
      }
      return { ...row, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
}

const DATA_DAWN_TICKER_ALIASES = {
  VIVO: 'VVPR',
  NVIDIA: 'NVDA',
  MICROSOFT: 'MSFT',
  META: 'META',
  FACEBOOK: 'META',
  SERVICENOW: 'NOW',
  SALESFORCE: 'CRM',
  CRM: 'CRM',
  NEBIUS: 'NBIS',
  PALANTIR: 'PLTR',
  AMAZON: 'AMZN',
  APPLE: 'AAPL',
  GOOGLE: 'GOOGL',
  ALPHABET: 'GOOGL',
  MICRON: 'MU',
  SANDISK: 'SNDK',
  AMD: 'AMD',
  PHARVARIS: 'PHVS',
  'DIGI POWER X': 'DGXX',
  SALESFORCE: 'CRM',
  'SERVICE NOW': 'NOW',
  'SANDISK CORPORATION': 'SNDK',
  'PALANTIR TECHNOLOGIES': 'PLTR',
  'ADVANCED MICRO DEVICES': 'AMD',
  'NVIDIA CORPORATION': 'NVDA',
  'MICROSOFT CORPORATION': 'MSFT',
  'AMAZON.COM': 'AMZN',
  'ALPHABET': 'GOOGL',
};

function normalizeDate(value) {
  const text = String(value || '');
  return text ? text.slice(0, 10) : '';
}

function normalizeTransactionType(value) {
  const raw = String(value || '').toLowerCase();
  return /sale|sell|sold/i.test(raw) ? 'sell' : 'buy';
}

function normalizeTrade(t, index, fallbackSymbol, source) {
  const rawType = t?.type ?? t?.transaction_type ?? '';
  const transactionDate = normalizeDate(t?.transaction_date || t?.trade_date);
  const filingDate = normalizeDate(t?.disclosure_date || t?.filing_date);
  const ticker = String(
    t?.ticker || fallbackSymbol || ''
  ).toUpperCase();

  return {
    id:
      source +
      '-congress-' +
      ticker +
      '-' +
      transactionDate +
      '-' +
      String(t?.member || t?.member_name || '') +
      '-' +
      String(t?.owner || '') +
      '-' +
      String(t?.filing_id || t?.source_url || t?.filing_portal || index),
    politician: t?.member || t?.member_name || 'Unknown filer',
    chamber:
      String(t?.chamber || '').toLowerCase() === 'senate'
        ? 'Senate'
        : 'House',
    stockSymbol: ticker,
    transactionType: normalizeTransactionType(rawType),
    amountRange: t?.amount_range || 'Not disclosed',
    date: filingDate || transactionDate,
    transactionDate,
    filingDate,
    stockPrice: typeof t?.est_price === 'number' ? t.est_price : 0,
    filingPortal: t?.filing_portal || t?.source_url || null,
  };
}

async function fetchJson(url, label) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'AI Infra Watch/1.0',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(label + ' HTTP ' + response.status);
  }

  return response.json();
}

async function fetchBargo(symbol) {
  const url =
    symbol === 'ALL'
      ? 'https://www.bargo.ai/free-apis/congress/v1/trades?limit=100'
      : 'https://www.bargo.ai/free-apis/congress/v1/trades/' +
        encodeURIComponent(symbol) +
        '?limit=500';

  const payload = await fetchJson(url, 'Bargo API');
  return Array.isArray(payload?.trades) ? payload.trades : [];
}

function buildDataDawnUrl(symbol, query = '') {
  const safeSymbol = DATA_DAWN_TICKER_ALIASES[symbol] || symbol;
  const safeQuery = String(query || '').trim().replaceAll("'", "''");
  const predicates = [];

  if (symbol !== 'ALL') {
    predicates.push("UPPER(ticker) = UPPER('" + safeSymbol.replaceAll("'", "''") + "')");
  }

  if (safeQuery) {
    const q = safeQuery.toUpperCase();
    const alias = DATA_DAWN_TICKER_ALIASES[q] || q;
    const escapedAlias = alias.replaceAll("'", "''");
    predicates.push(
      "(UPPER(ticker) = UPPER('" + escapedAlias + "') OR " +
      "UPPER(member_name) LIKE UPPER('%" + safeQuery + "%'))"
    );
  }

  const where = predicates.length ? predicates.join(' AND ') : 'ticker IS NOT NULL';
  const sql =
    'SELECT member_name, transaction_date, ticker, transaction_type, amount_range, owner, chamber, source_url ' +
    'FROM stock_trades WHERE ' + where +
    ' ORDER BY transaction_date DESC LIMIT 500';

  return (
    'https://regs.datadawn.org/openregs.json?sql=' +
    encodeURIComponent(sql) +
    '&_shape=objects'
  );
}

async function fetchDataDawn(symbol, query = '') {
  const payload = await fetchJson(buildDataDawnUrl(symbol, query), 'OpenRegs fallback');
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.rows)
      ? payload.rows
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

  return rows.map((row, index) =>
    normalizeTrade(
      row,
      index,
      symbol === 'ALL' ? undefined : (DATA_DAWN_TICKER_ALIASES[symbol] || symbol),
      'datadawn'
    )
  );
}

function respond(res, {
  symbol,
  trades,
  provider,
  cached,
  stale,
  fetchedAt,
  upstreamError,
  searchResolution,
}) {
  const sourceLabel =
    provider === 'bargo'
      ? cached
        ? 'Bargo • cached'
        : 'Bargo • live'
      : provider === 'datadawn'
        ? 'OpenRegs by DataDawn • fallback'
        : provider === 'cache'
          ? 'Last-known-good cache'
          : 'Unavailable';

  return res.status(200).json({
    symbol,
    trades,
    source: provider === 'bargo' ? 'bargo-congress-trades' : provider,
    sourceLabel,
    sourceUrl:
      provider === 'bargo'
        ? 'https://www.bargo.ai/free-apis/congress'
        : provider === 'datadawn'
          ? 'https://regs.datadawn.org/explore/api.html'
          : null,
    cached,
    stale,
    fetchedAt,
    upstreamError: upstreamError || null,
    searchResolution: searchResolution || null,
  });
}

export default async function handler(req, res) {
  const requestedSymbol = String(req.query?.symbol || 'NVDA').trim().toUpperCase();
  const query = String(req.query?.q || '').trim();
  const aliasSymbol = DATA_DAWN_TICKER_ALIASES[requestedSymbol] || requestedSymbol;
  const symbol = aliasSymbol || 'ALL';
  let searchResolution = null;

  res.setHeader(
    'Cache-Control',
    'public, s-maxage=300, stale-while-revalidate=900'
  );

  const cacheKey = query ? symbol + '|q=' + query.toLowerCase() : symbol;
  const cachedEntry = cache.get(cacheKey);
  if (
    cachedEntry &&
    Date.now() - cachedEntry.createdAt < CACHE_MS
  ) {
    return respond(res, {
      symbol,
      trades: cachedEntry.trades,
      provider: cachedEntry.provider,
      cached: true,
      stale: false,
      fetchedAt: cachedEntry.createdAt,
    });
  }

  let primaryError = null;

  try {
    if (query) {
      try {
        const resolved = await resolveCompanyTicker(query);
        if (resolved) {
          searchResolution = 'Company name matched to ' + resolved.title + ' (' + resolved.ticker + ')';
        }
      } catch {
        // Search must still work for politician names even when SEC resolution is unavailable.
      }
    }

    // Company/ticker searches can use Bargo after SEC resolution. Person-name
    // searches use the broader OpenRegs dataset so older filings are searchable
    // instead of being limited to Bargo's latest global page.
    if (query && searchResolution) {
      const resolvedTicker = searchResolution.match(/\(([A-Z0-9.^=-]+)\)$/)?.[1] || null;
      if (!resolvedTicker) throw new Error('Company search could not resolve a ticker');
      const rawTrades = await fetchBargo(resolvedTicker);
      const needle = query.toUpperCase();
      const trades = rawTrades
        .map((trade, index) => normalizeTrade(trade, index, resolvedTicker, 'bargo'))
        .filter((trade) => trade.stockSymbol && (
          trade.stockSymbol === resolvedTicker ||
          String(trade.politician || '').toUpperCase().includes(needle)
        ))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));

      if (!trades.length) throw new Error('No Bargo matches for resolved company; use OpenRegs fallback');

      const createdAt = Date.now();
      cache.set(cacheKey, { createdAt, trades, provider: 'bargo' });
      return respond(res, {
        symbol,
        trades,
        provider: 'bargo',
        cached: false,
        stale: false,
        fetchedAt: createdAt,
        searchResolution,
      });
    }

    if (query) {
      const trades = (await fetchDataDawn('ALL', query))
        .filter((trade) => trade.stockSymbol)
        .sort((a, b) => String(b.transactionDate).localeCompare(String(a.transactionDate)));

      if (!trades.length) throw new Error('No public congressional disclosure matches found');

      const createdAt = Date.now();
      cache.set(cacheKey, { createdAt, trades, provider: 'datadawn' });
      return respond(res, {
        symbol,
        trades,
        provider: 'datadawn',
        cached: false,
        stale: false,
        fetchedAt: createdAt,
        searchResolution,
      });
    }

    const rawTrades = await fetchBargo(symbol);
    const trades = rawTrades
      .map((trade, index) =>
        normalizeTrade(
          trade,
          index,
          symbol === 'ALL' ? undefined : symbol,
          'bargo'
        )
      )
      .filter((trade) => trade.stockSymbol)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const createdAt = Date.now();
    cache.set(cacheKey, {
      createdAt,
      trades,
      provider: 'bargo',
    });

    return respond(res, {
      symbol,
      trades,
      provider: 'bargo',
      cached: false,
      stale: false,
      fetchedAt: createdAt,
      searchResolution,
    });
  } catch (error) {
    primaryError = error instanceof Error ? error.message : String(error);
  }

  try {
    const resolvedTicker = searchResolution?.match(/\(([A-Z0-9.^=-]+)\)$/)?.[1] || null;
    const fallbackSymbol = query && resolvedTicker ? resolvedTicker : symbol;
    const fallbackQuery = query && resolvedTicker ? '' : query;
    const trades = (await fetchDataDawn(fallbackSymbol, fallbackQuery))
      .filter((trade) => trade.stockSymbol)
      .sort((a, b) => String(b.transactionDate).localeCompare(String(a.transactionDate)));

    const createdAt = Date.now();
    cache.set(cacheKey, {
      createdAt,
      trades,
      provider: 'datadawn',
    });

    return respond(res, {
      symbol,
      trades,
      provider: 'datadawn',
      cached: false,
      stale: false,
      fetchedAt: createdAt,
      upstreamError: primaryError,
      searchResolution,
    });
  } catch (fallbackError) {
    const fallbackMessage =
      fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
    const combinedError = primaryError
      ? primaryError + ' → ' + fallbackMessage
      : fallbackMessage;

    if (
      cachedEntry &&
      Date.now() - cachedEntry.createdAt < STALE_CACHE_MS &&
      Array.isArray(cachedEntry.trades)
    ) {
      return respond(res, {
        symbol,
        trades: cachedEntry.trades,
        provider: 'cache',
        cached: true,
        stale: true,
        fetchedAt: cachedEntry.createdAt,
        upstreamError: combinedError,
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({
      symbol,
      trades: [],
      source: 'unavailable',
      sourceLabel: 'All Congress trade sources unavailable',
      cached: false,
      stale: false,
      fetchedAt: null,
      upstreamError: combinedError,
    });
  }
}
