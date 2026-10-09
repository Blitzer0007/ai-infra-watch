import { isProjectEventRelevant } from '../utils/projectEventRelevance.js';
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
  // SEC EDGAR requests should use the same configurable contact header as the gateway.
  // This helps correct missing/stale User-Agent configuration, but cannot override an SEC-side block.
  const userAgent = String(process.env.EDGAR_USER_AGENT || '').trim() ||
    'AI Infra Watch/1.0 (research dashboard; contact: github-actions[bot]@users.noreply.github.com)';
  const response = await fetch(url, {
    headers: {
      'User-Agent': userAgent,
      'Accept-Encoding': 'gzip, deflate',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    const detail = response.status === 403
      ? ' (SEC denied the request; verify EDGAR_USER_AGENT and continue using independent company/news sources)'
      : '';
    throw new Error('SEC request failed: HTTP ' + response.status + detail);
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
    res.setHeader('Cache-Control', 'no-store');
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

function normalizePositiveAnalystTarget(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
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
  ].some(value => normalizePositiveAnalystTarget(value) != null);
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
      high: normalizePositiveAnalystTarget(priceTarget.targetHigh),
      low: normalizePositiveAnalystTarget(priceTarget.targetLow),
      mean: normalizePositiveAnalystTarget(priceTarget.targetMean),
      median: normalizePositiveAnalystTarget(priceTarget.targetMedian),
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
  // Do not let one configured provider take down all discovery queries.
  // Try secondary providers and a public RSS source in order; carry diagnostics if a fallback succeeds.
  const attempts = [];
  const brave = String(process.env.BRAVE_SEARCH_API_KEY || '').trim();
  const tavily = String(process.env.TAVILY_API_KEY || '').trim();

  if (brave) attempts.push({
    name: 'brave-web',
    run: async () => {
      const response = await fetch('https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(query) + '&count=' + limit + '&search_lang=en&country=us&freshness=' + (days <= 1 ? 'pd' : 'pm'), {
        headers: { Accept: 'application/json', 'X-Subscription-Token': brave },
        signal: AbortSignal.timeout(6500),
      });
      if (!response.ok) throw new Error('Brave Search HTTP ' + response.status);
      const payload = await response.json();
      return { provider: 'brave-web', results: (payload?.web?.results || []).slice(0, limit).map(row => ({
        title: row.title || '', snippet: row.description || row.snippet || '', url: row.url || '',
        published_at: row.published || null, source: 'brave-web',
      })) };
    },
  });

  if (tavily) attempts.push({
    name: 'tavily-web',
    run: async () => {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: tavily, query, search_depth: 'advanced', max_results: limit, include_answer: false, days: Math.min(Math.max(Number(days) || 7, 1), 30) }),
        signal: AbortSignal.timeout(6500),
      });
      if (!response.ok) throw new Error('Tavily Search HTTP ' + response.status);
      const payload = await response.json();
      return { provider: 'tavily-web', results: (payload?.results || []).slice(0, limit).map(row => ({
        title: row.title || '', snippet: row.content || row.snippet || '', url: row.url || '',
        published_at: row.published_date || null, source: 'tavily-web',
      })) };
    },
  });

  attempts.push({ name: 'google-news-rss', run: () => fetchGoogleNewsSearch(query, days, limit) });

  const providerNotes = [];
  let lastSuccessful = null;
  for (const attempt of attempts) {
    try {
      const result = await attempt.run();
      if (!result || !Array.isArray(result.results)) continue;
      lastSuccessful = { ...result, results: result.results.slice(0, limit) };
      if (lastSuccessful.results.length) {
        return { ...lastSuccessful, providerNotes, degraded: providerNotes.length > 0 || lastSuccessful.provider === 'google-news-rss' };
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      providerNotes.push(detail + '; trying the next source');
    }
  }

  if (lastSuccessful) {
    return { ...lastSuccessful, providerNotes, degraded: providerNotes.length > 0 || lastSuccessful.provider === 'google-news-rss' };
  }
  throw new Error(providerNotes.join(' · ') || 'All configured news search sources failed.');
}
async function handleExecutiveSignals(req, res) {
  const days = Math.min(Math.max(Number(req.query?.days) || 7, 1), 14);
  const limit = Math.min(Math.max(Number(req.query?.limit) || 12, 1), 20);
  const wantedExecutive = String(req.query?.executive || '').trim().toLowerCase();
  const wantedOrganization = String(req.query?.organization || '').trim().toLowerCase();
  const profiles = EXECUTIVE_UI_PROFILES.filter(profile => (!wantedExecutive || profile.name.toLowerCase().includes(wantedExecutive)) && (!wantedOrganization || profile.organizations.some(org => org.toLowerCase().includes(wantedOrganization))));
  const signals = [];
  const providerNotes = [];
  const providersUsed = new Set();
  for (const profile of profiles) {
    const orgQuery = profile.organizations.map(org => '"' + org + '"').join(' OR ');
    const queries = ['"' + profile.name + '" (' + orgQuery + ') (AI OR chips OR GPU OR "data center" OR infrastructure OR cloud OR power)'];
    if (profile.x_username) queries.push('site:x.com/' + profile.x_username + ' "' + profile.name + '" AI');
    if (profile.linkedin_profile) queries.push('site:linkedin.com "' + profile.name + '" ' + orgQuery);
    for (const query of queries) {
      try {
        const result = await searchWebProvider(query, days, limit);
        providersUsed.add(result.provider || 'web search');
        providerNotes.push(...(result.providerNotes || []).map(note => note + ' (backup search: ' + result.provider + ')'));
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
  const configuredProvider = providersUsed.size
    ? [...providersUsed].join(' + ')
    : (providerNotes.length || process.env.BRAVE_SEARCH_API_KEY || process.env.TAVILY_API_KEY) ? 'unavailable' : 'google-news-rss';
  return res.status(200).json({ source: 'executive-signal-discovery', profiles, signals: deduped.slice(0, limit), configuredProvider, degraded: providerNotes.length > 0 || [...providersUsed].some(provider => provider === 'google-news-rss'), providerNotes: [...new Set(providerNotes)].slice(0, 5) });
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

const PROJECT_SOURCE_PROFILES = {
  DGXX: { name: 'Digi Power X', aliases: ['DigiPower X', 'DGXX', 'Digihost Technology'], domains: ['digipowerx.com'], xHandle: 'DigipowerX' },
  NBIS: { name: 'Nebius', aliases: ['Nebius Group', 'NBIS'], domains: ['nebius.com'], xHandle: null },
  NVDA: { name: 'NVIDIA', domains: ['nvidia.com'], xHandle: null },
  AMD: { name: 'AMD', domains: ['amd.com'], xHandle: null },
  MU: { name: 'Micron Technology', domains: ['micron.com'], xHandle: null },
  MSFT: { name: 'Microsoft', domains: ['microsoft.com'], xHandle: null },
  META: { name: 'Meta Platforms', domains: ['about.fb.com', 'meta.com'], xHandle: null },
  GOOG: { name: 'Google', domains: ['blog.google', 'abc.xyz'], xHandle: null },
  GOOGL: { name: 'Alphabet Google', domains: ['blog.google', 'abc.xyz'], xHandle: null },
  NOW: { name: 'ServiceNow', domains: ['servicenow.com'], xHandle: null },
  SNDK: { name: 'SanDisk', domains: ['sandisk.com'], xHandle: null },
  VIVO: { name: 'VivoPower', domains: ['vivopower.com'], xHandle: null },
  IREN: { name: 'IREN', domains: ['iren.com'], xHandle: null },
  CIFR: { name: 'Cipher Mining', domains: ['ciphermining.com'], xHandle: null },
  TSM: { name: 'TSMC', domains: ['tsmc.com'], xHandle: null },
  AMZN: { name: 'Amazon', domains: ['aboutamazon.com'], xHandle: null },
  PLTR: { name: 'Palantir', domains: ['palantir.com'], xHandle: null },
  APLD: { name: 'Applied Digital', domains: ['applieddigital.com'], xHandle: null },
  DELL: { name: 'Dell Technologies', domains: ['dell.com'], xHandle: null },
  IBM: { name: 'IBM', domains: ['ibm.com'], xHandle: null },
  QCOM: { name: 'Qualcomm', domains: ['qualcomm.com'], xHandle: null },
  INTC: { name: 'Intel', domains: ['intel.com'], xHandle: null },
  ONDS: { name: 'Ondas', domains: ['ondas.com'], xHandle: null },
  AMPG: { name: 'AmpliTech Group', domains: ['amplitechgroup.com'], xHandle: null },
};

const PROJECT_UPDATE_CACHE = globalThis.__aiwProjectUpdateCache || (globalThis.__aiwProjectUpdateCache = new Map());
const CONTRACT_DISCOVERY_CACHE = globalThis.__aiwContractDiscoveryCache || (globalThis.__aiwContractDiscoveryCache = { at: 0, data: null });

function projectSourceProfile(symbol) {
  return PROJECT_SOURCE_PROFILES[symbol] || { name: symbol, domains: [], xHandle: null };
}

function normalizeSourceDate(value) {
  if (!value) return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function sourceTypeForUrl(url, profile = {}, sourceLabel = '') {
  let parsed;
  try { parsed = new URL(url); } catch { return 'secondary-news'; }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'sec.gov' || host.endsWith('.sec.gov')) return 'sec-primary';
  if ((profile.domains || []).some(domain => host === domain || host.endsWith('.' + domain))) return 'official-company';
  if (host === 'x.com' || host === 'twitter.com' || host === 'mobile.twitter.com') {
    const username = parsed.pathname.split('/').filter(Boolean)[0] || '';
    return profile.xHandle && username.toLowerCase() === profile.xHandle.toLowerCase()
      ? 'official-social'
      : 'social-post';
  }
  if (/prnewswire\.com|globenewswire\.com|businesswire\.com/.test(host)) return 'syndicated-release';
  if (/nasdaq\.com/.test(host) && /press release|news/i.test(sourceLabel)) return 'syndicated-release';
  return 'secondary-news';
}

function sourceVerificationLabel(sourceType) {
  if (sourceType === 'sec-primary') return 'SEC filing';
  if (sourceType === 'official-company') return 'Official company update';
  if (sourceType === 'official-social') return 'Official company social post';
  if (sourceType === 'syndicated-release') return 'Company release syndicated by a news service';
  if (sourceType === 'social-post') return 'Social post — not independently confirmed';
  return 'News lead — needs primary-source confirmation';
}

function projectEventCategory(text) {
  const value = String(text || '').toLowerCase();
  if (/contract|agreement|colocation|customer|client|lease|order/.test(value)) return 'Contract / commercial';
  if (/construction|building shell|phase 1|phase 2|campus|commission|facility|groundbreak/.test(value)) return 'Construction / build-out';
  if (/gpu|deployment|compute|cluster|rack|server/.test(value)) return 'Compute deployment';
  if (/power|substation|grid|megawatt|\bmw\b/.test(value)) return 'Power / capacity';
  return 'Company / project update';
}

function projectEventStatus(text) {
  const value = String(text || '');
  // Only mark completion when the wording explicitly says work is complete or operational.
  if (/\b(completed|completion of construction|fully operational|operations began|commenced operations|commissioned|facility opened|phase\s+[12]\s+(?:was\s+)?delivered|connected capacity reached|construction completed)\b/i.test(value)) {
    return 'done';
  }
  // Ambiguous headlines must not be shown as completed; use active only when work is explicitly underway.
  if (/under construction|construction (?:is )?(?:underway|continues|progressing)|construction update|currently building|building shell|crews are|being built|on track|in progress|progressing|work continues|commissioning|installing|erecting|groundbreaking|ground broken/i.test(value)) {
    return 'active';
  }
  return 'planned';
}

function mapDiscoveredProjectEvent(symbol, row, profile, provider) {
  const title = String(row?.title || '').replace(/\s+/g, ' ').trim();
  const url = String(row?.url || '').trim();
  if (!title || !/^https?:\/\//i.test(url)) return null;
  const snippet = String(row?.snippet || row?.description || row?.content || '').replace(/\s+/g, ' ').trim();
  const combined = title + ' ' + snippet;
  // Search engines can return loosely related infrastructure stories. Never
  // attach one to a ticker unless the issuer name/ticker or official domain matches.
  if (!isProjectEventRelevant(symbol, { ...row, title, snippet, url }, profile, PROJECT_SOURCE_PROFILES)) return null;
  if (!/(contract|agreement|construction|build(?:out)?|phase|facility|data.?cent(?:er|re)|campus|power|megawatt|\bmw\b|commission|capacity|gpu|deployment|infrastructure|operations|columbiana|project|progress|substation|equipment)/i.test(combined)) return null;
  const sourceType = sourceTypeForUrl(url, profile, row?.source || provider);
  const publishedAt = normalizeSourceDate(row?.published_at || row?.published || row?.date || row?.publishedAt);
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./i, ''); } catch {}
  const source = String(row?.source || host || provider || 'Web search').trim();
  return {
    id: 'project-update-' + Buffer.from(url).toString('base64url').slice(0, 28),
    stockSymbol: symbol,
    date: publishedAt ? publishedAt.slice(0, 10) : 'Date not supplied',
    publishedAt,
    title: title.slice(0, 240),
    category: projectEventCategory(combined),
    description: snippet || 'Open the linked source to review the full announcement and confirm the reported details.',
    status: projectEventStatus(combined),
    source,
    sourceUrl: url,
    url,
    sourceType,
    verificationStatus: sourceVerificationLabel(sourceType),
    provider: provider || 'web search',
    evidenceClass: sourceType === 'official-company' || sourceType === 'official-social' || sourceType === 'sec-primary' ? 'primary-source' : 'discovery-lead',
    relatedSources: [],
  };
}

function dedupeProjectEvents(rows, limit = 12) {
  const rank = { 'sec-primary': 6, 'official-company': 5, 'official-social': 4, 'syndicated-release': 3, 'secondary-news': 2, 'social-post': 1 };
  const byKey = new Map();
  for (const row of rows) {
    const titleKey = String(row.title || '').toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    if (!titleKey) continue;
    // Keep distinct SEC accessions even when filings share a generic headline.
    const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(String(row.date || '')) ? row.date : '';
    const key = row.sourceType === 'sec-primary'
      ? 'sec:' + String(row.accession || row.id)
      : titleKey + '|' + dateKey;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const related = [
      ...(existing.relatedSources || []),
      { source: existing.source, url: existing.url, sourceType: existing.sourceType },
      { source: row.source, url: row.url, sourceType: row.sourceType },
    ].filter((item, index, all) => item.url && all.findIndex(other => other.url === item.url) === index);
    const keep = (rank[row.sourceType] || 0) > (rank[existing.sourceType] || 0) ? row : existing;
    byKey.set(key, { ...keep, relatedSources: related.filter(item => item.url !== keep.url) });
  }
  const eventTime = item => {
    const sourceDate = item.publishedAt || (/^\d{4}-\d{2}-\d{2}$/.test(String(item.date || '')) ? item.date : null);
    const parsed = sourceDate ? Date.parse(sourceDate) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return Array.from(byKey.values())
    .sort((a, b) => eventTime(b) - eventTime(a))
    .slice(0, limit);
}

async function fetchXProjectUpdates(symbol, profile, limit = 10) {
  const token = String(process.env.X_BEARER_TOKEN || process.env.X_API_BEARER_TOKEN || '').trim();
  if (!token) return { items: [], status: 'not-configured', configured: false, error: null };
  const terms = '(construction OR "Phase 1" OR "Phase 2" OR Columbiana OR "data center" OR "15 MW" OR "40 MW" OR commissioning OR capacity OR GPU OR infrastructure)';
  const query = profile.xHandle
    ? 'from:' + profile.xHandle + ' ' + terms + ' -is:retweet'
    : '("' + profile.name + '" OR $' + symbol + ') ' + terms + ' -is:retweet -is:reply';
  const params = new URLSearchParams({
    query,
    max_results: String(Math.max(10, Math.min(100, limit * 2))),
    'tweet.fields': 'author_id,created_at,lang,public_metrics',
    expansions: 'author_id',
    'user.fields': 'name,username,verified',
  });
  try {
    const response = await fetch('https://api.x.com/2/tweets/search/recent?' + params.toString(), {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      signal: AbortSignal.timeout(7000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { items: [], status: response.status === 401 || response.status === 403 ? 'credentials-rejected' : response.status === 429 ? 'rate-limited' : 'unavailable', configured: true, error: 'X API HTTP ' + response.status };
    }
    const users = new Map((payload?.includes?.users || []).map(user => [String(user.id), user]));
    const items = (payload?.data || []).map(post => {
      const author = users.get(String(post.author_id)) || {};
      const username = String(author.username || profile.xHandle || 'unknown').replace(/^@/, '');
      const official = Boolean(profile.xHandle && username.toLowerCase() === profile.xHandle.toLowerCase());
      const text = String(post.text || '').trim();
      const publishedAt = normalizeSourceDate(post.created_at);
      const url = 'https://x.com/' + username + '/status/' + String(post.id);
      const sourceType = official ? 'official-social' : 'social-post';
      return {
        id: 'x-post-' + String(post.id),
        stockSymbol: symbol,
        date: publishedAt ? publishedAt.slice(0, 10) : 'Date not supplied',
        publishedAt,
        title: text.replace(/\s+/g, ' ').slice(0, 240),
        category: projectEventCategory(text),
        description: text,
        status: projectEventStatus(text),
        source: 'X @' + username,
        sourceUrl: url,
        url,
        sourceType,
        verificationStatus: sourceVerificationLabel(sourceType),
        provider: 'x-api',
        evidenceClass: official ? 'primary-source' : 'discovery-lead',
        relatedSources: [],
        authorName: String(author.name || ''),
        publicMetrics: post.public_metrics || null,
      };
    }).filter(item => {
      if (!item.title) return false;
      // Posts from the issuer's configured official handle are valid company-reported
      // evidence; third-party posts must explicitly match the tracked issuer.
      if (item.sourceType === 'official-social') return true;
      return isProjectEventRelevant(symbol, {
        title: item.title,
        snippet: item.description,
        url: item.url,
      }, profile, PROJECT_SOURCE_PROFILES);
    });
    return { items, status: 'available', configured: true, error: null };
  } catch (error) {
    return { items: [], status: 'unavailable', configured: true, error: String(error?.message || error) };
  }
}

async function discoverProjectUpdates(symbol, limit = 10, forceRefresh = false) {
  const cacheKey = symbol + ':' + limit;
  const cached = PROJECT_UPDATE_CACHE.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.data;
  const profile = projectSourceProfile(symbol);
  const searchTerms = '(construction OR "Phase 1" OR "Phase 2" OR "ready for service" OR commissioning OR "data center" OR capacity OR MW OR GPU OR deployment OR contract OR colocation OR power OR project)';
  const queries = [
    '"' + profile.name + '" ' + searchTerms,
    ...(profile.domains || []).slice(0, 1).map(domain => 'site:' + domain + ' ' + searchTerms),
    ...(profile.xHandle ? ['site:x.com/' + profile.xHandle + ' ' + searchTerms] : []),
  ];
  const settled = await Promise.allSettled(queries.map(query => searchWebProvider(query, 14, Math.min(10, Math.max(5, limit)))));
  const webRows = [];
  const providers = [];
  const errors = [];
  const providerNotes = [];
  settled.forEach((result, index) => {
    if (result.status !== 'fulfilled') {
      errors.push(String(result.reason?.message || result.reason));
      return;
    }
    providers.push(result.value.provider || 'web search');
    providerNotes.push(...(result.value.providerNotes || []));
    for (const row of result.value.results || []) {
      const item = mapDiscoveredProjectEvent(symbol, row, profile, result.value.provider || 'web search');
      if (item) webRows.push(item);
    }
  });
  const xResult = await fetchXProjectUpdates(symbol, profile, limit);
  const items = dedupeProjectEvents([...xResult.items, ...webRows], Math.min(30, Math.max(limit, limit * 2)));
  const data = {
    items,
    sourceStatus: {
      sec: { status: 'checked-separately', count: 0 },
      web: { status: webRows.length ? 'available' : errors.length === settled.length ? 'unavailable' : 'no-matches', count: webRows.length, providers: [...new Set(providers)], errors: [...new Set([...errors, ...providerNotes])].slice(0, 4) },
      x: { status: xResult.status, count: xResult.items.length, configured: xResult.configured, error: xResult.error },
    },
  };
  PROJECT_UPDATE_CACHE.set(cacheKey, { at: Date.now(), data });
  return data;
}

async function handleContractDiscovery(req, res) {
  const forceRefresh = String(req.query?.refresh || '').toLowerCase() === 'true';
  const limit = Math.min(Math.max(Number(req.query?.limit) || 24, 6), 40);
  if (!forceRefresh && CONTRACT_DISCOVERY_CACHE.data && Date.now() - CONTRACT_DISCOVERY_CACHE.at < 10 * 60 * 1000) {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ ...CONTRACT_DISCOVERY_CACHE.data, cached: true });
  }
  const queries = [
    '"Digi Power X" OR DGXX (contract OR colocation OR "Phase 1" OR construction OR "data center" OR Cerebras)',
    '("Nebius" OR NBIS OR "Applied Digital" OR IREN OR "Cipher Mining" OR "Digi Power X") (agreement OR contract OR capacity OR "data center" OR power OR MW)',
    '(NVIDIA OR AMD OR Micron OR TSMC OR Supermicro) ("supply agreement" OR "purchase order" OR contract OR GPU OR infrastructure)',
    '("AI data center" OR "AI infrastructure") (contract OR agreement OR construction OR campus OR megawatts OR commissioning)',
  ];
  const settled = await Promise.allSettled(queries.map(query => searchWebProvider(query, 30, 8)));
  const all = [];
  const providers = [];
  const errors = [];
  const providerNotes = [];
  settled.forEach(result => {
    if (result.status !== 'fulfilled') {
      errors.push(String(result.reason?.message || result.reason));
      return;
    }
    providers.push(result.value.provider || 'web search');
    providerNotes.push(...(result.value.providerNotes || []));
    for (const row of result.value.results || []) {
      const title = String(row?.title || '').trim();
      const url = String(row?.url || '').trim();
      const summary = String(row?.snippet || row?.description || row?.content || '').replace(/\s+/g, ' ').trim();
      if (!title || !/^https?:\/\//i.test(url)) continue;
      if (!/(contract|agreement|colocation|award|purchase order|supply|construction|phase|data.?cent(?:er|re)|campus|megawatt|\bmw\b|power|GPU|capacity|commission|deployment|infrastructure)/i.test(title + ' ' + summary)) continue;
      let host = '';
      try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch {}
      let profile = { name: '', domains: [], xHandle: null };
      for (const candidate of Object.values(PROJECT_SOURCE_PROFILES)) {
        if ((candidate.domains || []).some(domain => host === domain || host.endsWith('.' + domain))) {
          profile = candidate;
          break;
        }
      }
      const sourceType = sourceTypeForUrl(url, profile, row?.source || '');
      const publishedAt = normalizeSourceDate(row?.published_at || row?.published || row?.date);
      const kind = projectEventCategory(title + ' ' + summary);
      all.push({
        id: 'contract-lead-' + Buffer.from(url).toString('base64url').slice(0, 28),
        title: title.slice(0, 240),
        summary: summary || 'Open the source to review the announcement and confirm whether it represents a signed agreement.',
        url,
        source: String(row?.source || host || 'Web search'),
        sourceType,
        verificationStatus: sourceVerificationLabel(sourceType),
        date: publishedAt ? publishedAt.slice(0, 10) : null,
        publishedAt,
        category: kind,
        ticker: Object.keys(PROJECT_SOURCE_PROFILES).find(symbol => {
          const candidate = PROJECT_SOURCE_PROFILES[symbol];
          return (title + ' ' + summary).toLowerCase().includes(candidate.name.toLowerCase()) || new RegExp('(^|[^A-Z0-9])' + symbol + '([^A-Z0-9]|$)', 'i').test(title + ' ' + summary);
        }) || null,
        isConfirmedContract: false,
      });
    }
  });
  const byKey = new Map();
  for (const row of all) {
    const key = String(row.title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, row);
    else {
      const current = byKey.get(key);
      if ((row.sourceType === 'official-company' || row.sourceType === 'sec-primary') && !['official-company', 'sec-primary'].includes(current.sourceType)) byKey.set(key, row);
    }
  }
  const leads = Array.from(byKey.values())
    .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
    .slice(0, limit);
  const data = {
    leads,
    sourceStatus: {
      status: leads.length ? 'available' : errors.length === settled.length ? 'unavailable' : 'no-matches',
      providers: [...new Set(providers)],
      queriesRun: queries.length,
      failedQueries: errors.length,
      errors: [...new Set(errors)].slice(0, 3),
      providerNotes: [...new Set(providerNotes)].slice(0, 3),
      note: 'These results are discovery leads. Confirm deal terms using the linked primary source before treating them as signed contracts.',
    },
    retrievedAt: new Date().toISOString(),
  };
  CONTRACT_DISCOVERY_CACHE.at = Date.now();
  CONTRACT_DISCOVERY_CACHE.data = data;
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  return res.status(200).json({ ...data, cached: false });
}

async function fetchSecMilestones(symbol, limit) {
  const tickerMap = await loadTickerMap();
  const company = tickerMap.get(symbol);
  if (!company) return { events: [], status: 'not-found', error: 'Ticker not found in the SEC directory.' };
  const payload = await fetchSec('https://data.sec.gov/submissions/CIK' + company.cik + '.json');
  const recent = payload?.filings?.recent;
  if (!recent) return { events: [], status: 'no-records', error: null };
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
    const url = 'https://www.sec.gov/Archives/edgar/data/' + Number(company.cik) + '/' + accessionPath + '/' + primaryDocument;
    const eventTitle = titleFor(selectedItems);
    events.push({
      id: 'sec-milestone-' + accession,
      stockSymbol: symbol,
      date: filedDate,
      publishedAt: filedDate,
      acceptedDateTime: recent.acceptanceDateTime?.[i] || null,
      title: eventTitle,
      category: categoryFor(selectedItems, eventTitle),
      items: selectedItems,
      description: selectedItems.length ? 'SEC 8-K disclosure · Items ' + selectedItems.join(', ') + ' · Accession ' + accession : 'SEC 8-K filing · Accession ' + accession,
      status: 'done',
      accession,
      url,
      sourceUrl: url,
      source: 'SEC EDGAR',
      sourceType: 'sec-primary',
      verificationStatus: 'SEC filing',
      evidenceClass: 'primary-source',
      relatedSources: [],
    });
  }
  return { events, status: 'available', error: null, issuer: company.title };
}

async function handleMilestones(req, res) {
  const symbol = cleanSymbol(req.query?.symbol);
  const limit = Math.min(Math.max(Number(req.query?.limit) || 12, 1), 20);
  const forceRefresh = String(req.query?.refresh || '').toLowerCase() === 'true';
  if (!validMilestoneSymbol(symbol)) return res.status(400).json({ error: 'Valid stock symbol is required.' });
  const [secResult, projectResult] = await Promise.allSettled([
    fetchSecMilestones(symbol, limit),
    discoverProjectUpdates(symbol, limit, forceRefresh),
  ]);
  const sec = secResult.status === 'fulfilled'
    ? secResult.value
    : { events: [], status: 'unavailable', error: String(secResult.reason?.message || secResult.reason) };
  const project = projectResult.status === 'fulfilled'
    ? projectResult.value
    : { items: [], sourceStatus: { web: { status: 'unavailable', count: 0, errors: [String(projectResult.reason?.message || projectResult.reason)] }, x: { status: 'unavailable', count: 0, configured: Boolean(process.env.X_BEARER_TOKEN || process.env.X_API_BEARER_TOKEN) } } };
  const events = dedupeProjectEvents([...(sec.events || []), ...(project.items || [])], Math.min(40, limit + 12));
  const sourceStatus = {
    sec: { status: sec.status, count: (sec.events || []).length, error: sec.error || null },
    web: project.sourceStatus?.web || { status: 'unavailable', count: 0, errors: [] },
    x: project.sourceStatus?.x || { status: 'not-configured', count: 0, configured: false, error: null },
  };
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    symbol,
    issuer: sec.issuer || projectSourceProfile(symbol).name || symbol,
    source: 'multi-source-project-updates',
    events,
    sourceStatus,
    retrievedAt: new Date().toISOString(),
  });
}

export default async function handler(req, res) {
  const action = String(req.query?.action || '').trim().toLowerCase();
  if (action === 'history') return handleHistory(req, res);
  if (action === 'milestones') return handleMilestones(req, res);
  if (action === 'contract-discovery') return handleContractDiscovery(req, res);
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