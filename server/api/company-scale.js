import { history as routedHistory, providerSymbol, quote as routedQuote } from '../../api/_market-data.js';

const tickerCache = globalThis.__aiwTickerCache || (globalThis.__aiwTickerCache = {
  loadedAt: 0,
  map: new Map(),
});

const factsCache = globalThis.__aiwFactsCache || (globalThis.__aiwFactsCache = new Map());
const analystCache = globalThis.__aiwAnalystCache || (globalThis.__aiwAnalystCache = new Map());


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


async function finnhubResearch(symbol, endpoint) {
  const token = String(process.env.FINNHUB_API_KEY || '').trim();
  if (!token) throw new Error('FINNHUB_API_KEY is not configured');
  const response = await fetch(
    'https://finnhub.io/api/v1/' + endpoint +
      '?symbol=' + encodeURIComponent(symbol) +
      '&token=' + encodeURIComponent(token),
    { signal: AbortSignal.timeout(7000) }
  );
  if (!response.ok) throw new Error('Finnhub research HTTP ' + response.status);
  return response.json();
}

function normalizeAnalystValue(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

const ANALYST_SEARCH_NAMES = {
  NVDA: 'NVIDIA',
  MSFT: 'Microsoft',
  NBIS: 'Nebius',
  NOW: 'ServiceNow',
  META: 'Meta Platforms',
  AMD: 'AMD',
  TSM: 'TSMC',
  AVGO: 'Broadcom',
  MU: 'Micron',
  SOXL: 'SOXL',
  RKLB: 'Rocket Lab',
  VIVO: 'VivoPower',
  PHVS: 'Pharvaris',
  DGXX: 'Digi Power X',
};

async function fetchAnalystWebEvidence(symbol, days = 14, limit = 6) {
  const name = ANALYST_SEARCH_NAMES[symbol] || symbol;
  const queries = [
    '"' + name + '" "price target" analyst',
    '"' + name + '" analyst estimates rating',
    '"' + symbol + '" stock analyst consensus',
  ];
  const providers = [];
  const results = [];
  const errors = [];

  for (const query of queries) {
    try {
      const result = await searchWebProvider(query, days, limit);
      providers.push(result.provider);
      results.push(...(result.results || []));
      if (results.length >= limit) break;
    } catch (error) {
      errors.push(String(error?.message || error));
    }
  }

  const seen = new Set();
  const deduped = results.filter(row => {
    const key = String(row?.url || row?.title || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);

  return {
    provider: [...new Set(providers)].join(' + ') || 'unavailable',
    results: deduped,
    error: deduped.length ? null : (errors[0] || null),
  };
}

async function handleAnalyst(req, res) {
  const symbol = cleanSymbol(req.query?.symbol);
  if (!validateMarketSymbol(symbol)) {
    return res.status(400).json({ error: 'Valid stock symbol is required.' });
  }

  const cached = analystCache.get(symbol);
  if (cached && Date.now() - cached.loadedAt < 15 * 60 * 1000) {
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    return res.status(200).json({ ...cached.data, cached: true });
  }

  const endpoints = [
    ['recommendation', 'stock/recommendation'],
    ['priceTarget', 'stock/price-target'],
    ['epsEstimates', 'stock/eps-estimate'],
    ['revenueEstimates', 'stock/revenue-estimate'],
  ];

  const settled = await Promise.allSettled(
    endpoints.map(([, endpoint]) => finnhubResearch(symbol, endpoint))
  );

  const values = {};
  const errors = [];
  settled.forEach((item, index) => {
    const [key] = endpoints[index];
    if (item.status === 'fulfilled') values[key] = item.value;
    else errors.push({ source: key, error: String(item.reason?.message || item.reason || 'Unavailable') });
  });

  const recommendationRows = Array.isArray(values.recommendation) ? values.recommendation : [];
  const recommendation = recommendationRows[0] || {};
  const priceTarget = values.priceTarget && typeof values.priceTarget === 'object'
    ? values.priceTarget
    : {};
  const epsRaw = values.epsEstimates;
  const revenueRaw = values.revenueEstimates;
  const epsEstimates = Array.isArray(epsRaw) ? epsRaw : Array.isArray(epsRaw?.data) ? epsRaw.data : [];
  const revenueEstimates = Array.isArray(revenueRaw) ? revenueRaw : Array.isArray(revenueRaw?.data) ? revenueRaw.data : [];

  const webEvidence = await fetchAnalystWebEvidence(symbol, 14, 6);

  let currentPrice = null;
  let quoteSource = null;
  let quoteRetrievedAt = null;
  try {
    const quote = await routedQuote(symbol);
    currentPrice = normalizeAnalystValue(quote?.price);
    quoteSource = quote?.source || quote?.provider || null;
    quoteRetrievedAt = quote?.asOf || null;
  } catch {
    // Consensus remains useful without a current quote; target upside is then unavailable.
  }

  const ratingCounts = {
    strongBuy: Number(recommendation.strongBuy || 0),
    buy: Number(recommendation.buy || 0),
    hold: Number(recommendation.hold || 0),
    sell: Number(recommendation.sell || 0),
    strongSell: Number(recommendation.strongSell || 0),
  };
  const analystCount = Object.values(ratingCounts).reduce((sum, value) => sum + value, 0);
  const hasRecommendationEvidence = recommendationRows.some(row =>
    row && Object.values(row).some(value => value !== null && value !== undefined && value !== '')
  );
  const hasPriceTargetEvidence = [
    priceTarget.targetHigh,
    priceTarget.targetLow,
    priceTarget.targetMean,
    priceTarget.targetMedian,
  ].some(value => Number.isFinite(Number(value)));
  const hasEstimateEvidence = epsEstimates.some(row => row && (
    Number.isFinite(Number(row?.epsAvg ?? row?.epsAverage)) ||
    Number.isFinite(Number(row?.epsHigh)) ||
    Number.isFinite(Number(row?.epsLow))
  )) || revenueEstimates.some(row => row && (
    Number.isFinite(Number(row?.revenueAvg ?? row?.revenueAverage)) ||
    Number.isFinite(Number(row?.revenueHigh)) ||
    Number.isFinite(Number(row?.revenueLow))
  ));
  const structuredEvidenceAvailable = hasRecommendationEvidence || hasPriceTargetEvidence || hasEstimateEvidence;
  const webEvidenceCount = Array.isArray(webEvidence.results) ? webEvidence.results.length : 0;

  if (!structuredEvidenceAvailable && !webEvidence.results?.length) {
    return res.status(503).json({
      symbol,
      source: 'external-analyst-consensus',
      available: [],
      errors,
      webEvidence,
      consensusAvailable: false,
      error: 'No external analyst consensus source returned usable evidence.',
    });
  }

  const retrievedAt = new Date().toISOString();
  const data = {
    symbol,
    source: Object.keys(values).length ? 'Finnhub analyst' : 'external analyst web evidence',
    webEvidence,
    retrievedAt,
    consensusAvailable: structuredEvidenceAvailable,
    structuredEvidenceAvailable,
    currentPrice,
    quoteSource,
    quoteRetrievedAt,
    recommendation: {
      period: recommendation.period || null,
      ...ratingCounts,
    },
    priceTarget: {
      lastUpdated: priceTarget.lastUpdated || priceTarget.lastUpdatedAt || null,
      high: normalizeAnalystValue(priceTarget.targetHigh),
      low: normalizeAnalystValue(priceTarget.targetLow),
      mean: normalizeAnalystValue(priceTarget.targetMean),
      median: normalizeAnalystValue(priceTarget.targetMedian),
    },
    epsEstimates: epsEstimates.slice(0, 8).map(row => ({
      period: row?.period || null,
      average: normalizeAnalystValue(row?.epsAvg ?? row?.epsAverage),
      high: normalizeAnalystValue(row?.epsHigh),
      low: normalizeAnalystValue(row?.epsLow),
      analysts: Number(row?.numberAnalysts || 0) || null,
    })),
    revenueEstimates: revenueEstimates.slice(0, 8).map(row => ({
      period: row?.period || null,
      average: normalizeAnalystValue(row?.revenueAvg ?? row?.revenueAverage),
      high: normalizeAnalystValue(row?.revenueHigh),
      low: normalizeAnalystValue(row?.revenueLow),
      analysts: Number(row?.numberAnalysts || 0) || null,
    })),
    available: Object.keys(values),
    analystCount,
    webEvidenceCount,
    errors,
    provenance: {
      consensusProvider: structuredEvidenceAvailable ? 'Finnhub' : null,
      consensusRetrievedAt: structuredEvidenceAvailable ? retrievedAt : null,
      quoteProvider: quoteSource,
      quoteRetrievedAt,
      webProvider: webEvidence.provider || null,
      webRetrievedAt: retrievedAt,
    },
  };

  analystCache.set(symbol, { loadedAt: Date.now(), data });
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  return res.status(200).json({ ...data, cached: false });
}

const EXECUTIVE_UI_PROFILES = [
  { id: 'elon-musk', name: 'Elon Musk', organizations: ['Tesla','xAI','X'], x_username: 'elonmusk', linkedin_profile: null, official_domains: ['x.com'] },
  { id: 'arkady-volozh', name: 'Arkady Volozh', organizations: ['Nebius'], x_username: null, linkedin_profile: 'https://www.linkedin.com/in/arkady-volozh', official_domains: ['nebius.com'] },
  { id: 'lisa-su', name: 'Lisa Su', organizations: ['AMD'], x_username: null, linkedin_profile: 'https://www.linkedin.com/in/lisasu-amd', official_domains: ['amd.com'] },
  { id: 'satya-nadella', name: 'Satya Nadella', organizations: ['Microsoft'], x_username: null, linkedin_profile: 'https://www.linkedin.com/in/satyanadella', official_domains: ['microsoft.com'] },
];

async function fetchGoogleNewsSearch(query, days = 7, limit = 8) {
  const requestedDays = Math.min(Math.max(Number(days) || 7, 1), 30);
  const window = requestedDays <= 1 ? '1d' : requestedDays <= 7 ? '7d' : '30d';
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(query + ' when:' + window) + '&hl=en-US&gl=US&ceid=US:en';
  const response = await fetch(url, {
    headers: { 'User-Agent': 'ai-infra-watch/1.0', Accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(6500),
  });
  if (!response.ok) throw new Error('Google News RSS HTTP ' + response.status);
  const xml = await response.text();
  const decode = (value) => String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
  const results = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const title = decode(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1]);
    const url = decode(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]);
    const published_at = decode(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]) || null;
    const sourceName = decode(block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1]) || 'Google News';
    if (!title || !url) continue;
    results.push({ title, snippet: '', url, published_at, source: sourceName });
    if (results.length >= limit) break;
  }
  return { provider: 'google-news-rss', results };
}

async function searchWebProvider(query, days = 7, limit = 8) {
  const brave = String(process.env.BRAVE_SEARCH_API_KEY || '').trim();
  if (brave) {
    const response = await fetch('https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(query) + '&count=' + limit + '&search_lang=en&country=us&freshness=' + (days <= 1 ? 'pd' : 'pm'), { headers: { Accept: 'application/json', 'X-Subscription-Token': brave }, signal: AbortSignal.timeout(6500) });
    if (!response.ok) throw new Error('Brave Search HTTP ' + response.status);
    const payload = await response.json();
    return { provider: 'brave-web', results: (payload?.web?.results || []).slice(0, limit).map(row => ({ title: row.title || '', snippet: row.description || row.snippet || '', url: row.url || '', published_at: row.published || null, source: 'brave-web' })) };
  }
  const tavily = String(process.env.TAVILY_API_KEY || '').trim();
  if (tavily) {
    const response = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: tavily, query, search_depth: 'advanced', max_results: limit, include_answer: false, days: Math.min(Math.max(Number(days) || 7, 1), 30) }), signal: AbortSignal.timeout(6500) });
    if (!response.ok) throw new Error('Tavily Search HTTP ' + response.status);
    const payload = await response.json();
    return { provider: 'tavily-web', results: (payload?.results || []).slice(0, limit).map(row => ({ title: row.title || '', snippet: row.content || row.snippet || '', url: row.url || '', published_at: row.published_date || null, source: 'tavily-web' })) };
  }
  return fetchGoogleNewsSearch(query, days, limit);
}

async function handleExecutiveSignals(req, res) {
  const days = Math.min(Math.max(Number(req.query?.days) || 7, 1), 14);
  const limit = Math.min(Math.max(Number(req.query?.limit) || 12, 1), 20);
  const wantedExecutive = String(req.query?.executive || '').trim().toLowerCase();
  const wantedOrganization = String(req.query?.organization || '').trim().toLowerCase();
  const profiles = EXECUTIVE_UI_PROFILES.filter(profile => (!wantedExecutive || profile.name.toLowerCase().includes(wantedExecutive)) && (!wantedOrganization || profile.organizations.some(org => org.toLowerCase().includes(wantedOrganization))));
  const signals = [];
  const providerNotes = [];
  for (const profile of profiles) {
    const orgQuery = profile.organizations.map(org => '"' + org + '"').join(' OR ');
    const queries = ['"' + profile.name + '" (' + orgQuery + ') (AI OR chips OR GPU OR "data center" OR infrastructure OR cloud OR power)'];
    if (profile.x_username) queries.push('site:x.com/' + profile.x_username + ' "' + profile.name + '" AI');
    if (profile.linkedin_profile) queries.push('site:linkedin.com "' + profile.name + '" ' + orgQuery);
    for (const query of queries) {
      try {
        const result = await searchWebProvider(query, days, limit);
        for (const row of result.results) {
          const lower = String(row.url || '').toLowerCase();
          const official = (profile.x_username && lower.startsWith('https://x.com/' + profile.x_username.toLowerCase())) || (profile.linkedin_profile && lower.startsWith(profile.linkedin_profile.toLowerCase())) || profile.official_domains.some(domain => { try { const host = new URL(row.url).hostname.toLowerCase().replace(/^www\\./, ''); return host === domain || host.endsWith('.' + domain); } catch { return false; } });
          signals.push({ ...row, executive: profile.name, organizations: profile.organizations, official, sourceType: official && /x\\.com|linkedin\\.com/.test(lower) ? 'official-social' : official ? 'official-web' : 'secondary', signalType: official && /x\\.com|linkedin\\.com/.test(lower) ? 'executive_statement' : 'executive_coverage' });
        }
      } catch (error) { providerNotes.push(String(error?.message || error)); }
    }
  }
  const seen = new Set();
  const deduped = signals.filter(row => { const key = String(row.url || row.title || '').toLowerCase(); if (!key || seen.has(key)) return false; seen.add(key); return true; }).sort((a,b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));
  return res.status(200).json({ source: 'executive-signal-discovery', profiles, signals: deduped.slice(0, limit), configuredProvider: process.env.BRAVE_SEARCH_API_KEY ? 'brave-web' : process.env.TAVILY_API_KEY ? 'tavily-web' : 'none', degraded: providerNotes.length > 0, providerNotes: [...new Set(providerNotes)].slice(0, 5) });
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
        acceptedDateTime: recent.acceptanceDateTime?.[i] || null,
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
  if (action === 'executive') return handleExecutiveSignals(req, res);
  if (action === 'analyst') return handleAnalyst(req, res);
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