const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

function normalizeTrade(t, index, symbol) {
  const rawType = String(t?.type || '').toLowerCase();
  const transactionDate = String(t?.transaction_date || t?.trade_date || '');
  const filingDate = String(t?.disclosure_date || t?.filing_date || '');
  const ticker = String(t?.ticker || symbol || '').toUpperCase();

  return {
    id:
      'bargo-congress-' +
      ticker +
      '-' +
      filingDate +
      '-' +
      transactionDate +
      '-' +
      String(index),
    politician: t?.member || 'Unknown filer',
    chamber:
      String(t?.chamber || '').toLowerCase() === 'senate'
        ? 'Senate'
        : 'House',
    stockSymbol: ticker,
    transactionType: /sale|sell|sold/i.test(rawType) ? 'sell' : 'buy',
    amountRange: t?.amount_range || 'Not disclosed',
    date: filingDate || transactionDate,
    transactionDate,
    filingDate,
    stockPrice: typeof t?.est_price === 'number' ? t.est_price : 0,
    filingPortal: t?.filing_portal || null,
  };
}

async function fetchBargo(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'AI Infra Watch/1.0',
    },
  });

  if (!response.ok) {
    throw new Error('Bargo API HTTP ' + response.status);
  }

  const payload = await response.json();
  return Array.isArray(payload?.trades) ? payload.trades : [];
}

export default async function handler(req, res) {
  const symbol = String(req.query?.symbol || 'NVDA').trim().toUpperCase();

  res.setHeader(
    'Cache-Control',
    's-maxage=300, stale-while-revalidate=900'
  );

  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.createdAt < CACHE_MS) {
    return res.status(200).json({
      symbol,
      trades: cached.trades,
      source: 'bargo-congress-trades',
      cached: true,
      fetchedAt: cached.createdAt,
    });
  }

  try {
    const url =
      symbol === 'ALL'
        ? 'https://www.bargo.ai/free-apis/congress/v1/trades?limit=100'
        : 'https://www.bargo.ai/free-apis/congress/v1/trades/' +
          encodeURIComponent(symbol) +
          '?limit=100';

    const rawTrades = await fetchBargo(url);
    const trades = rawTrades
      .map((trade, index) => normalizeTrade(trade, index, symbol === 'ALL' ? undefined : symbol))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const createdAt = Date.now();
    cache.set(symbol, { createdAt, trades });

    return res.status(200).json({
      symbol,
      trades,
      source: 'bargo-congress-trades',
      cached: false,
      fetchedAt: createdAt,
    });
  } catch (error) {
    return res.status(502).json({
      symbol,
      trades: [],
      source: 'bargo-congress-trades',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
