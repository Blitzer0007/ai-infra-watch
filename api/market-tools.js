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
      'User-Agent': 'AI Infra Watch/1.0 (research dashboard; contact: github-actions[bot]@users.noreply.github.com)',
      'Accept-Encoding': 'gzip, deflate',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error('SEC request failed: HTTP ' + response.status);
  }

  return response.json();
}

const SEC_CACHE = {
  tickers: 'public, s-maxage=86400, stale-while-revalidate=604800',
  submissions: 'public, s-maxage=300, stale-while-revalidate=1800',
  archive: 'public, s-maxage=3600, stale-while-revalidate=86400',
  companyfacts: 'public, s-maxage=86400, stale-while-revalidate=604800',
};

function secTarget(req) {
  const resource = String(req.query?.sec || '').trim().toLowerCase();

  if (resource === 'tickers') {
    return {
      resource,
      url: 'https://www.sec.gov/files/company_tickers.json',
      cacheControl: SEC_CACHE.tickers,
    };
  }

  if (resource === 'submissions' || resource === 'companyfacts') {
    const cik = String(req.query?.cik || '').replace(/\D/g, '');
    if (!/^\d{1,10}$/.test(cik)) return null;

    const base =
      resource === 'submissions'
        ? 'https://data.sec.gov/submissions/CIK'
        : 'https://data.sec.gov/api/xbrl/companyfacts/CIK';

    return {
      resource,
      url: base + cik.padStart(10, '0') + '.json',
      cacheControl: SEC_CACHE[resource],
    };
  }


  return null;
}

async function handleSecGateway(req, res) {
  const target = secTarget(req);
  if (!target) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({
      error: 'Supported SEC resources: tickers, submissions, companyfacts.',
    });
  }

  const userAgent =
    String(process.env.EDGAR_USER_AGENT || '').trim() ||
    'AI Infra Watch/1.0 (SEC research; contact: github-actions[bot]@users.noreply.github.com)';

  try {
    const upstream = await fetch(target.url, {
      headers: {
        'User-Agent': userAgent,
        'Accept-Encoding': 'gzip, deflate',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    res.setHeader('Cache-Control', target.cacheControl);
    res.setHeader('X-AIW-SEC-Gateway', 'company-scale');
    res.setHeader('X-AIW-Upstream-Status', String(upstream.status));

    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    const body = await upstream.text();
    return res.status(upstream.status).send(body);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(504).json({
      error: 'SEC gateway upstream fetch failed: ' + String(error?.message || error),
    });
  }
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


const ALLOWED_RANGES = new Set(['1y', '2y', '5y', 'max']);

function validateMarketSymbol(symbol) {
  return typeof symbol === 'string' && /^[A-Za-z0-9.^=-]{1,20}$/.test(symbol);
}

async function handleHistory(req, res) {
  const symbol = String(req.query?.symbol || '').trim().toUpperCase();
  const range = String(req.query?.range || '2y').trim();

  if (!validateMarketSymbol(symbol)) return res.status(400).json({ error: 'Valid symbol is required' });
  if (!ALLOWED_RANGES.has(range)) return res.status(400).json({ error: 'Unsupported history range' });

  try {
    const data = await routedHistory(symbol, range);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
    return res.status(200).json({ symbol, yahooSymbol: providerSymbol(symbol), ...data });
  } catch (error) {
    return res.status(503).json({
      error: error?.message || 'Market history providers unavailable',
      providerErrors: error?.providers || []
    });
  }
}

const ITEM_TITLES = {
  '1.01': 'Entry into a Material Definitive Agreement',
  '1.02': 'Termination of a Material Definitive Agreement',
  '1.03': 'Bankruptcy or Receivership',
  '2.01': 'Completion of Acquisition or Disposition of Assets',
  '2.02': 'Results of Operations and Financial Condition',
  '2.03': 'Creation of a Material Direct Financial Obligation',
  '2.05': 'Costs Associated with Exit or Disposal Activities',
  '3.01': 'Notice of Delisting or Failure to Satisfy a Listing Rule',
  '3.02': 'Unregistered Sale of Equity Securities',
  '3.03': 'Material Modification to Rights of Security Holders',
  '4.01': 'Changes in Registrant\'s Certifying Accountant',
  '4.02': 'Non-Reliance on Previously Issued Financial Statements',
  '5.01': 'Changes in Control of Registrant',
  '5.02': 'Departure or Appointment of Directors or Officers',
  '5.03': 'Amendments to Articles of Bylaws',
  '5.07': 'Submission of Matters to a Vote of Security Holders',
  '7.01': 'Regulation FD Disclosure',
  '8.01': 'Other Events'
};

function categoryFor(items, title = '') {
  const set = new Set(items);
  const text = title.toLowerCase();

  if (set.has('2.02') || set.has('4.02') || text.includes('financial')) return 'Earnings / Financial';
  if (set.has('1.01') || set.has('1.02') || set.has('2.03')) return 'Contracts / Commercial';
  if (set.has('5.01') || set.has('5.02') || set.has('5.03')) return 'Management / Corporate';
  if (set.has('3.01') || set.has('3.02') || set.has('3.03') || set.has('7.01')) return 'Regulatory / Disclosure';
  if (set.has('2.01') || set.has('2.05')) return 'Strategic / Asset';
  return 'Other';
}

function validMilestoneSymbol(symbol) {
  return /^[A-Z0-9.^=-]{1,20}$/.test(symbol);
}

function titleFor(items) {
  for (const item of items) {
    if (ITEM_TITLES[item]) return ITEM_TITLES[item];
  }
  return 'Material SEC event';
}

async function handleMilestones(req, res) {
  const symbol = cleanSymbol(req.query?.symbol);
  const limit = Math.min(Math.max(Number(req.query?.limit) || 12, 1), 20);
  if (!validMilestoneSymbol(symbol)) return res.status(400).json({ error: 'Valid stock symbol is required.' });

  const ua = {
    'User-Agent': 'AI Infra Watch/1.0 (research dashboard; contact: dev@example.com)',
    'Accept-Encoding': 'gzip, deflate'
  };

  try {
    const tickerResponse = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: ua });
    if (!tickerResponse.ok) return res.status(502).json({ error: 'SEC ticker directory unavailable.' });

    const tickerMap = await tickerResponse.json();
    let cik = null;
    for (const entry of Object.values(tickerMap)) {
      if (entry && String(entry.ticker || '').toUpperCase() === symbol) {
        cik = String(entry.cik_str).padStart(10, '0');
        break;
      }
    }

    if (!cik) {
      return res.status(404).json({
        symbol,
        source: 'sec-edgar-primary',
        events: [],
        error: 'SEC issuer/ticker not found for ' + symbol
      });
    }

    const response = await fetch('https://data.sec.gov/submissions/CIK' + cik + '.json', { headers: ua });
    if (!response.ok) return res.status(502).json({ error: 'SEC submissions unavailable.' });

    const payload = await response.json();
    const recent = payload?.filings?.recent;
    if (!recent) return res.status(200).json({ symbol, source: 'sec-edgar-primary', events: [] });

    const events = [];
    const forms = recent.form || [];
    for (let i = 0; i < forms.length && events.length < limit; i++) {
      if (forms[i] !== '8-K') continue;
      const filedDate = recent.filingDate?.[i];
      const accession = recent.accessionNumber?.[i];
      const primaryDocument = recent.primaryDocument?.[i];
      if (!filedDate || !accession || !primaryDocument) continue;

      const items = String(recent.items?.[i] || '').split(',').map(item => item.trim()).filter(Boolean);
      const meaningfulItems = items.filter(item => ITEM_TITLES[item]);
      const selectedItems = meaningfulItems.length ? meaningfulItems : items;
      const accessionPath = accession.replaceAll('-', '');
      const url = 'https://www.sec.gov/Archives/edgar/data/' + Number(cik) + '/' + accessionPath + '/' + primaryDocument;
      const eventTitle = titleFor(selectedItems);

      events.push({
        id: 'sec-milestone-' + accession,
        stockSymbol: symbol,
        date: filedDate,
        title: eventTitle,
        category: categoryFor(selectedItems, eventTitle),
        items: selectedItems,
        description: selectedItems.length
          ? 'SEC 8-K disclosure · Items ' + selectedItems.join(', ') + ' · Accession ' + accession
          : 'SEC 8-K filing · Accession ' + accession,
        status: 'done',
        accession,
        url,
        source: 'sec-edgar-primary'
      });
    }

    return res.status(200).json({ symbol, issuer: payload?.name || symbol, source: 'sec-edgar-primary', events });
  } catch (error) {
    return res.status(502).json({
      symbol,
      source: 'sec-edgar-primary',
      events: [],
      error: 'SEC milestone lookup failed.'
    });
  }
}

export default async function handler(req, res) {
  const action = String(req.query?.action || '').trim().toLowerCase();
  if (action === 'history') return handleHistory(req, res);
  if (action === 'milestones') return handleMilestones(req, res);
  if (req.query?.sec) {
    return handleSecGateway(req, res);
  }

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
