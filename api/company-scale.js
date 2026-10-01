const tickerCache = globalThis.__aiwTickerCache || (globalThis.__aiwTickerCache = {
  loadedAt: 0,
  map: new Map(),
});

const factsCache = globalThis.__aiwFactsCache || (globalThis.__aiwFactsCache = new Map());

function cleanSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

async function fetchSec(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'AI Infra Watch/1.0 (research dashboard; contact: dev@example.com)',
      'Accept-Encoding': 'gzip, deflate',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error('SEC request failed: HTTP ' + response.status);
  }

  return response.json();
}

async function loadTickerMap() {
  if (Date.now() - tickerCache.loadedAt < 86400000 && tickerCache.map.size) {
    return tickerCache.map;
  }

  const data = await fetchSec('https://www.sec.gov/files/company_tickers.json');
  const map = new Map();

  for (const row of Object.values(data || {})) {
    const symbol = cleanSymbol(row?.ticker);
    if (!symbol) continue;
    const cik = String(row?.cik_str || '').padStart(10, '0');
    if (!cik) continue;
    map.set(symbol, {
      cik,
      title: row?.title || symbol,
    });
  }

  tickerCache.map = map;
  tickerCache.loadedAt = Date.now();
  return map;
}

function pickRevenueFact(facts) {
  const usgaap = facts?.facts?.['us-gaap'];
  if (!usgaap) return null;

  const candidates = [
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'Revenues',
    'SalesRevenueNet',
    'SalesRevenueGoodsNet',
    'SalesRevenueServicesNet',
  ];

  for (const tag of candidates) {
    const unitBlock = usgaap[tag]?.units?.USD;
    if (!Array.isArray(unitBlock)) continue;

    const annual = unitBlock
      .filter(row =>
        row?.form === '10-K' &&
        row?.fp === 'FY' &&
        typeof row?.val === 'number' &&
        row?.end &&
        row?.start
      )
      .map(row => ({
        value: row.val,
        start: row.start,
        end: row.end,
        filed: row.filed || null,
        form: row.form,
        frame: row.frame || null,
      }))
      .sort((a, b) =>
        String(b.end).localeCompare(String(a.end)) ||
        String(b.filed || '').localeCompare(String(a.filed || ''))
      );

    if (!annual.length) continue;

    const latest = annual.find(row => {
      const days = (new Date(row.end).getTime() - new Date(row.start).getTime()) / 86400000;
      return days >= 300 && days <= 400;
    }) || annual[0];

    if (latest) {
      return {
        tag,
        ...latest,
      };
    }
  }

  return null;
}

async function getCompanyScale(symbol) {
  const normalized = cleanSymbol(symbol);
  if (!normalized) throw new Error('Symbol is required.');

  const cached = factsCache.get(normalized);
  if (cached && Date.now() - cached.loadedAt < 86400000) {
    return cached.data;
  }

  const tickerMap = await loadTickerMap();
  const company = tickerMap.get(normalized);
  if (!company) {
    return {
      symbol: normalized,
      company: null,
      cik: null,
      revenue: null,
      source: 'sec-edgar-companyfacts',
      error: 'SEC ticker directory does not contain this symbol.',
    };
  }

  const facts = await fetchSec(
    'https://data.sec.gov/api/xbrl/companyfacts/CIK' + company.cik + '.json'
  );
  const revenue = pickRevenueFact(facts);

  const data = {
    symbol: normalized,
    company: company.title,
    cik: company.cik,
    revenue,
    source: 'sec-edgar-companyfacts',
  };

  factsCache.set(normalized, {
    loadedAt: Date.now(),
    data,
  });

  return data;
}

function scoreTickerMatches(rows, query) {
  const normalized = String(query || '').trim().toUpperCase().replace(/[^A-Z0-9.-]+/g, ' ');
  return rows
    .map((row) => {
      const ticker = cleanSymbol(row?.ticker);
      const title = String(row?.title || '').trim().toUpperCase().replace(/[^A-Z0-9.-]+/g, ' ');
      const tokens = normalized.split(' ').filter(Boolean);
      let score = 0;
      if (ticker === normalized) score = 1000;
      else if (title === normalized) score = 900;
      else if (title.startsWith(normalized)) score = 700;
      else if (title.includes(normalized)) score = 500;
      else {
        const matched = tokens.filter((token) => title.includes(token)).length;
        score = matched ? 300 + matched * 25 - Math.max(0, tokens.length - matched) * 5 : 0;
      }
      return { ...row, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
}

export default async function handler(req, res) {
  const search = String(req.query?.search || '').trim();
  if (search) {
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    if (search.length > 80) return res.status(400).json({ error: 'Search query is too long.' });
    try {
      const tickerMap = await loadTickerMap();
      const rows = Array.from(tickerMap.entries()).map(([ticker, meta]) => ({ ticker, title: meta.title }));
      const matches = scoreTickerMatches(rows, search).slice(0, 8);
      if (!matches.length) {
        return res.status(404).json({
          query: search,
          source: 'sec-company-ticker-directory',
          matches: [],
          error: 'No public ticker match found for ' + search
        });
      }
      return res.status(200).json({
        query: search,
        source: 'sec-company-ticker-directory',
        matches: matches.map(({ ticker, title }) => ({ ticker, title }))
      });
    } catch (error) {
      return res.status(502).json({
        query: search,
        source: 'sec-company-ticker-directory',
        matches: [],
        error: String(error?.message || error)
      });
    }
  }

  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');

  const symbol = cleanSymbol(req.query?.symbol);
  if (!symbol) {
    return res.status(400).json({ error: 'A stock symbol or search query is required.' });
  }

  try {
    const data = await getCompanyScale(symbol);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({
      symbol,
      source: 'sec-edgar-companyfacts',
      error: String(error?.message || error),
    });
  }
}
