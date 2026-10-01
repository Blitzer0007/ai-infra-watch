const CACHE_MS = 10 * 60 * 1000;

let tickerDirectoryCache = null;
let tickerDirectoryAt = 0;

function normalize(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9.-]+/g, ' ');
}

function validQuery(value) {
  return String(value || '').trim().length >= 1 && String(value || '').trim().length <= 80;
}

async function loadTickerDirectory() {
  if (tickerDirectoryCache && Date.now() - tickerDirectoryAt < CACHE_MS) {
    return tickerDirectoryCache;
  }

  const response = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: {
      'User-Agent': 'AI Infra Watch/1.0 (research dashboard; contact: dev@example.com)',
      'Accept-Encoding': 'gzip, deflate'
    },
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) {
    throw new Error('SEC ticker directory HTTP ' + response.status);
  }

  const payload = await response.json();
  const rows = Object.values(payload || {})
    .map((entry) => ({
      ticker: String(entry?.ticker || '').trim().toUpperCase(),
      title: String(entry?.title || '').trim(),
      cik: entry?.cik_str == null ? null : String(entry.cik_str).padStart(10, '0')
    }))
    .filter((entry) => entry.ticker && entry.title);

  tickerDirectoryCache = rows;
  tickerDirectoryAt = Date.now();
  return rows;
}

function scoreMatch(query, row) {
  const q = normalize(query);
  const ticker = normalize(row.ticker);
  const title = normalize(row.title);

  if (ticker === q) return 1000;
  if (title === q) return 900;
  if (title.startsWith(q)) return 700;
  if (title.includes(q)) return 500;

  const tokens = q.split(' ').filter(Boolean);
  const matched = tokens.filter((token) => title.includes(token)).length;
  return matched ? 300 + matched * 25 - Math.max(0, tokens.length - matched) * 5 : 0;
}

export default async function handler(req, res) {
  const query = String(req.query?.q || '').trim();

  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');

  if (!validQuery(query)) {
    return res.status(400).json({ error: 'Search query is required.' });
  }

  try {
    const rows = await loadTickerDirectory();
    const matches = rows
      .map((row) => ({ row, score: scoreMatch(query, row) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.row.ticker.localeCompare(b.row.ticker))
      .slice(0, 8)
      .map(({ row }) => row);

    if (!matches.length) {
      return res.status(404).json({
        query,
        source: 'sec-company-ticker-directory',
        matches: [],
        error: 'No public SEC ticker match found for ' + query
      });
    }

    return res.status(200).json({
      query,
      source: 'sec-company-ticker-directory',
      matches
    });
  } catch (error) {
    return res.status(502).json({
      query,
      source: 'sec-company-ticker-directory',
      matches: [],
      error: error?.message || 'Ticker directory unavailable.'
    });
  }
}
