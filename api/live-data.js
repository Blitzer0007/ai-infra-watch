import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadConfiguredSymbols() {
  try {
    const watchlist = JSON.parse(
      readFileSync(join(process.cwd(), 'data', 'stock_watchlist.json'), 'utf8')
    ).watchlist || [];
    const portfolio = JSON.parse(
      readFileSync(join(process.cwd(), 'data', 'portfolio_snapshot.json'), 'utf8')
    ).positions || [];
    return [...new Set([
      ...portfolio.map((item) => item.symbol),
      ...watchlist.map((item) => item.symbol),
    ].filter(Boolean))];
  } catch {
    return [
      'DGXX','DRAM','SOXL','NVDA','MSFT','NBIS','VIVO','META','NOW','PHVS',
      '000660.KS','SNDK','MU','TEAM','SOFI','CRM','AMZN','GOOGL','PLTR','CBRS',
      'RUM','QCOM','INTC','SOXX','IREN','TSM','AMD','TSLA','AAPL','ONDS','CIFR',
      'IONQ','NOK','TRT','AMPG','DELL','IBM'
    ];
  }
}

const SYMBOLS = loadConfiguredSymbols();

// Keep a short-lived in-memory cache for warm Vercel invocations.
// The refresh=true query parameter bypasses this cache explicitly.
const CACHE_MS = 60 * 1000;
const FEED_TIMEOUT_MS = 3500;
let cached = null;
let cachedAt = 0;

async function fetchSecContracts() {
  const ua = { 'User-Agent': process.env.EDGAR_USER_AGENT || 'AI Infra Watch/1.0 (research dashboard; contact: configured-admin@example.com)' };
  try {
    const tickerResponse = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: ua, signal: AbortSignal.timeout(FEED_TIMEOUT_MS) });
    if (!tickerResponse.ok) return [];
    const tickerMap = await tickerResponse.json();
    const cikByTicker = {};
    for (const entry of Object.values(tickerMap)) {
      if (entry && entry.ticker && entry.cik_str) cikByTicker[String(entry.ticker).toUpperCase()] = String(entry.cik_str).padStart(10, '0');
    }

    const candidates = SYMBOLS
      .map(symbol => ({ symbol, cik: cikByTicker[String(symbol).toUpperCase()] }))
      .filter(x => x.cik);

    const results = await Promise.all(candidates.map(async ({ symbol, cik }) => {
      try {
        const response = await fetch('https://data.sec.gov/submissions/CIK' + cik + '.json', { headers: ua, signal: AbortSignal.timeout(FEED_TIMEOUT_MS) });
        if (!response.ok) return [];
        const payload = await response.json();
        const recent = payload?.filings?.recent;
        if (!recent) return [];

        const rows = [];
        for (let i = 0; i < recent.form.length; i++) {
          const form = recent.form[i];
          const items = recent.items?.[i] || '';
          const filingDate = recent.filingDate?.[i];
          if (form !== '8-K' || !String(items).includes('1.01') || !filingDate) continue;
          if (Date.now() - new Date(filingDate).getTime() > 120 * 24 * 60 * 60 * 1000) continue;

          const accession = recent.accessionNumber[i];
          const accessionPath = accession.replaceAll('-', '');
          const primaryDocument = recent.primaryDocument?.[i];
          const url = primaryDocument
            ? 'https://www.sec.gov/Archives/edgar/data/' + Number(cik) + '/' + accessionPath + '/' + primaryDocument
            : 'https://www.sec.gov/Archives/edgar/data/' + Number(cik) + '/' + accessionPath + '/' + accession + '-index.html';

          rows.push({
            id: 'sec-' + accession,
            company: symbol,
            client: 'Material definitive agreement',
            value: 'Not quantified',
            duration: 'See SEC filing',
            hardware: 'See SEC filing',
            details: 'SEC Form 8-K Item 1.01 — Entry into a Material Definitive Agreement. Review the primary filing for counterparties and commercial terms.',
            status: 'SEC filed',
            statusLevel: 'high-verified',
            dateSigned: filingDate,
            source: 'sec-edgar-primary',
            accession,
            url,
            items: String(items).split(',').map(x => x.trim()).filter(Boolean),
            evidence: [form + ' Item 1.01']
          });
          if (rows.length >= 5) break;
        }
        return rows;
      } catch {
        return [];
      }
    }));

    return {
      items: results.flat().sort((a, b) => String(b.dateSigned).localeCompare(String(a.dateSigned))).slice(0, 40),
      source: 'SEC EDGAR',
      stale: false,
      upstreamError: null,
    };
  } catch (error) {
    return {
      items: [],
      source: 'SEC EDGAR unavailable',
      stale: true,
      upstreamError: error?.message || 'SEC contracts feed failed',
    };
  }
}

async function fetchCongressTrades(req) {
  try {
    const host = req?.headers?.host;
    const forwardedProto = req?.headers?.['x-forwarded-proto'];
    const origin = host
      ? (forwardedProto ? String(forwardedProto).split(',')[0].trim() : 'https') + '://' + host
      : 'http://localhost';

    const response = await fetch(origin + '/api/congress-trades?symbol=ALL', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(9000),
    });

    if (!response.ok) throw new Error('Congress API HTTP ' + response.status);

    const payload = await response.json();
    return {
      items: Array.isArray(payload?.trades) ? payload.trades : [],
      source: payload?.sourceLabel || payload?.source || 'Congress API',
      stale: Boolean(payload?.stale),
      upstreamError: payload?.upstreamError || null,
    };
  } catch (error) {
    return {
      items: [],
      source: 'Congress API unavailable',
      stale: true,
      upstreamError: error?.message || 'Congress feed failed',
    };
  }
}


import { quote as routedQuote } from './_market-data.js';

async function fetchGdeltJson(query, timespan, label = 'GDELT') {
  const url =
    'https://api.gdeltproject.org/api/v2/doc/doc?query=' +
    encodeURIComponent(query) +
    '&mode=ArtList&format=json&maxrecords=20&timespan=' +
    encodeURIComponent(timespan || '24h') +
    '&sort=datedesc';

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'ai-infra-watch/1.0' },
        signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
      });
      if (response.ok) {
        const payload = await response.json();
        return {
          articles: Array.isArray(payload?.articles) ? payload.articles : [],
          error: null,
        };
      }

      lastError = new Error(label + ' HTTP ' + response.status);
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status) || attempt === 1) break;
    } catch (error) {
      lastError = error;
      if (attempt === 1) break;
    }
    await new Promise(resolve => setTimeout(resolve, 250 * (2 ** attempt)));
  }

  return {
    articles: [],
    error: label + ' unavailable: ' + String(lastError?.message || lastError || 'unknown error'),
  };
}

function classifyPoliticalTopic(text) {
  const value = text.toLowerCase();
  if (value.includes('export') || value.includes('chip') || value.includes('semiconductor') || value.includes('gpu')) {
    return 'Semiconductors / Export Controls';
  }
  if (value.includes('data center') || value.includes('data-centre') || value.includes('power') || value.includes('electricity') || value.includes('grid') || value.includes('energy')) {
    return 'Data Centers / Power';
  }
  if (value.includes('regulat') || value.includes('law') || value.includes('order') || value.includes('policy') || value.includes('framework')) {
    return 'AI Policy / Regulation';
  }
  if (value.includes('investment') || value.includes('growth') || value.includes('innovation') || value.includes('infrastructure')) {
    return 'AI Growth / Infrastructure';
  }
  if (value.includes('security') || value.includes('defense') || value.includes('national security')) {
    return 'AI National Security';
  }
  return 'AI / Technology';
}

function detectPoliticalActor(text) {
  const value = text.toLowerCase();
  if (value.includes('donald trump') || value.includes('trump')) return 'Donald Trump';
  if (value.includes('jd vance') || value.includes('j.d. vance') || value.includes('vice president vance')) return 'JD Vance';
  if (value.includes('white house') || value.includes('trump administration')) return 'White House / U.S. Administration';
  return 'U.S. political leadership';
}

function relatedSymbols(text) {
  const value = text.toLowerCase();
  const symbols = new Set();

  if (/(nvidia|nvda|gpu|chip|semiconductor|blackwell|hbm|export)/.test(value)) {
    ['NVDA', 'AMD', 'DRAM', 'SOXL', 'TSM', 'SNDK', 'INTC'].forEach(symbol => symbols.add(symbol));
  }
  if (/(data center|data-centre|power|electricity|grid|energy|neocloud|cloud)/.test(value)) {
    ['DGXX', 'NBIS', 'IREN', 'VIVO', 'MSFT', 'META', 'NOW'].forEach(symbol => symbols.add(symbol));
  }
  if (/(artificial intelligence|\bai\b|ai model|ai models|ai infrastructure|innovation|investment|growth)/.test(value)) {
    ['NVDA', 'MSFT', 'META', 'NBIS', 'NOW'].forEach(symbol => symbols.add(symbol));
  }

  return Array.from(symbols);
}

async function politicalSignals() {
  const queries = [
    {
      label: 'GDELT political coverage',
      query: '(Donald Trump OR "JD Vance" OR "White House" OR "Trump administration") (AI OR "artificial intelligence" OR "AI infrastructure" OR "data center" OR power OR electricity OR semiconductor OR GPU OR chip OR export OR regulation OR innovation OR investment)'
    },
    {
      label: 'White House primary coverage',
      query: 'domainis:whitehouse.gov (Trump OR "White House") (AI OR "artificial intelligence" OR "data center" OR semiconductor OR chip OR power OR electricity OR regulation OR innovation)'
    }
  ];

  async function runQuery(item, timespan) {
    const result = await fetchGdeltJson(item.query, timespan, item.label);
    const signals = result.articles.map(article => {
      const title = String(article?.title || '').trim();
      const urlValue = String(article?.url || '').trim();
      const source = String(article?.domain || article?.source || 'GDELT');
      const date = article?.seendate || null;
      const text = title + ' ' + source;
      let sourceHost = '';
      try { sourceHost = new URL(urlValue).hostname.toLowerCase(); } catch {}

      const primary = sourceHost === 'whitehouse.gov' || sourceHost.endsWith('.whitehouse.gov');

      return {
        id: 'political-' + Buffer.from((urlValue || title).slice(0, 160)).toString('base64url').slice(0, 32),
        actor: detectPoliticalActor(text),
        title,
        source,
        sourceType: primary ? 'primary' : 'secondary',
        topic: classifyPoliticalTopic(text),
        eventType: /(executive order|presidential memorandum|fact sheet|signed into law|executive action|announces|announced|directive)/i.test(title)
          ? 'Policy / official action'
          : 'Political statement / coverage',
        date,
        url: urlValue || null,
        relatedSymbols: relatedSymbols(text),
        note: primary
          ? 'Primary White House source signal.'
          : 'Media coverage signal; verify the underlying statement or official action before treating the headline as a quote.'
      };
    }).filter(item => item.title);

    return { signals, error: result.error };
  }

  // Use one broad 72-hour query first. GDELT's DOC API can apply soft
  // rate limits; sequential requests with bounded retry avoid the previous
  // pattern of firing multiple requests simultaneously and receiving empty
  // results during throttling.
  let first = await runQuery(queries[0], '72h');
  let articles = first.signals;
  let errors = first.error ? [first.error] : [];

  if (articles.length < 10) {
    const second = await runQuery(queries[1], '72h');
    articles = articles.concat(second.signals);
    if (second.error) errors.push(second.error);
  }

  // Last bounded fallback with a simpler query if both specialized queries
  // yielded nothing.
  if (!articles.length) {
    const fallback = await runQuery({
      label: 'GDELT AI policy fallback',
      query: '(Trump OR "White House" OR "JD Vance") (AI OR technology OR semiconductor OR chip OR GPU OR "data center" OR power OR energy OR export OR regulation OR investment OR infrastructure)'
    }, '72h');
    articles = fallback.signals;
    if (fallback.error) errors.push(fallback.error);
  }

  const unique = new Map();
  articles.forEach(item => {
    const key = item.url || item.title.toLowerCase();
    const existing = unique.get(key);
    if (!existing || (item.sourceType === 'primary' && existing.sourceType !== 'primary')) {
      unique.set(key, item);
    }
  });

  return {
    items: Array.from(unique.values())
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, 20),
    upstreamError: errors.length && !unique.size ? errors.join('; ') : null,
  };
}

async function fetchGdeltNews(timespan) {
  const q = '(NVIDIA OR AMD OR Micron OR "SK Hynix" OR Nebius OR ServiceNow OR Salesforce OR "Digi Power X" OR Meta OR TSMC) (AI OR GPU OR semiconductor OR "data center" OR contract OR export)';
  const result = await fetchGdeltJson(q, timespan, 'GDELT news');
  if (result.error && !result.articles.length) throw new Error(result.error);
  return result.articles.slice(0, 20).map(a => ({
    title: a.title, source: a.domain || a.source || 'GDELT', url: a.url, date: a.seendate
  }));
}

async function news() {
  try {
    const recent = await fetchGdeltNews('24h');
    if (recent.length) return { items: recent, window: '24h', fallback: false };
  } catch {}

  try {
    const fallback = await fetchGdeltNews('72h');
    return { items: fallback, window: '72h', fallback: true };
  } catch {
    return { items: [], window: null, fallback: true };
  }
}

export default async function handler(req, res) {
  const forceRefresh = req.query && req.query.refresh === 'true';
  res.setHeader('Cache-Control', forceRefresh ? 'no-store' : 's-maxage=60, stale-while-revalidate=300');
  if (cached && Date.now() - cachedAt < CACHE_MS && !forceRefresh) {
    return res.status(200).json({ ...cached, cached:true, timestamp:cachedAt });
  }

  const stockPrices = {};
  await Promise.all(SYMBOLS.map(async symbol => {
    try { stockPrices[symbol] = await routedQuote(symbol); } catch {}
  }));

  const today = new Date().toISOString().slice(0,10);
  const macroRisks = [
    { id:'taiwan', category:'Supply Chain', title:'Taiwan advanced-node exposure', impactRating:'high', description:'Monitor events that could affect advanced-node manufacturing, packaging and accelerator supply.', dateUpdated:today, impactSummary:'Geopolitics → wafer supply → accelerator availability → NVDA/AMD/TSM/DRAM.' },
    { id:'controls', category:'Trade Policy', title:'AI-chip export controls', impactRating:'high', description:'Monitor restrictions affecting high-end accelerator shipments and China demand.', dateUpdated:today, impactSummary:'Policy → addressable market → product mix → relative reaction for NVDA/AMD.' },
    { id:'power', category:'Infrastructure', title:'Data-center power availability', impactRating:'medium', description:'Track grid interconnection, power procurement and AI capacity announcements.', dateUpdated:today, impactSummary:'Power → AI capacity → GPU hosting demand → DGXX/NBIS/IREN/VIVO.' }
  ];

  const evidenceAvailability = {
    market: {
      status: Object.keys(stockPrices).length ? 'AVAILABLE' : 'NOT_FOUND',
      source: Object.values(stockPrices)[0]?.source || null,
      provider: Object.values(stockPrices)[0]?.provider || null,
      retrievedAt: new Date().toISOString(),
      stale: Object.values(stockPrices).some((item) => item?.stale === true)
    },
    contracts: {
      status: 'PENDING',
      count: 0
    },
    news: {
      status: 'PENDING',
      count: 0,
      source: 'GDELT'
    },
    political: {
      status: 'NOT_FOUND',
      count: 0
    },
    congress: {
      status: 'NOT_FOUND',
      count: 0
    },
    macro: {
      status: macroRisks.length ? 'AVAILABLE' : 'NOT_FOUND',
      count: macroRisks.length,
      source: 'AI Infra Watch deterministic risk map'
    }
  };

  const [newsResult, contractsResult, congressResult, politicalResult] = await Promise.all([
    news(),
    fetchSecContracts(),
    fetchCongressTrades(req),
    politicalSignals(),
  ]);
  const currentNews = newsResult?.items || [];
  const contracts = contractsResult?.items || [];
  const congressTrades = congressResult?.items || [];
  const politicalSignalsResult = politicalResult?.items || [];
  const feedRetrievedAt = new Date().toISOString();
  evidenceAvailability.news = { status: currentNews.length ? 'AVAILABLE' : 'NOT_FOUND', count: currentNews.length, source: 'GDELT', retrievedAt: feedRetrievedAt, refreshIntervalSeconds: 300, fallback: Boolean(newsResult?.fallback) };
  evidenceAvailability.contracts = { status: contracts.length ? 'AVAILABLE' : 'NOT_FOUND', count: contracts.length, source: contractsResult?.source || 'SEC EDGAR', retrievedAt: feedRetrievedAt, refreshIntervalSeconds: 300, stale: Boolean(contractsResult?.stale), upstreamError: contractsResult?.upstreamError || null };
  evidenceAvailability.political = { status: politicalSignalsResult.length ? 'AVAILABLE' : 'NOT_FOUND', count: politicalSignalsResult.length, source: 'GDELT + White House primary coverage', retrievedAt: feedRetrievedAt, refreshIntervalSeconds: 300, fallback: Boolean(politicalResult?.upstreamError), upstreamError: politicalResult?.upstreamError || null };
  evidenceAvailability.congress = { status: congressTrades.length ? 'AVAILABLE' : 'NOT_FOUND', count: congressTrades.length, source: congressResult?.source || 'Congress API', retrievedAt: feedRetrievedAt, refreshIntervalSeconds: 300, stale: Boolean(congressResult?.stale), upstreamError: congressResult?.upstreamError || null };
  evidenceAvailability.macro = { ...evidenceAvailability.macro, retrievedAt: feedRetrievedAt, refreshIntervalSeconds: 300 };
  evidenceAvailability.market = { ...evidenceAvailability.market, retrievedAt: Object.values(stockPrices).reduce((latest, item) => item?.retrievedAt && item.retrievedAt > latest ? item.retrievedAt : latest, ''), refreshIntervalSeconds: 60 };

  const data = {
    build: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
      environment: process.env.VERCEL_ENV || 'local'
    },
    stockPrices,
    news: currentNews,
    contracts,
    congressTrades,
    macroRisks,
    politicalSignals: politicalSignalsResult,
    evidenceAvailability,
    marketSentiment:'Live quotes + AI-infrastructure, political and policy news feeds active.',
    feedStatus: {
      newsWindow: newsResult?.window || null,
      newsFallback: Boolean(newsResult?.fallback),
      politicalFallback: politicalSignalsResult.length === 0,
      politicalUpstreamError: politicalResult?.upstreamError || null
    },
    sources:['Yahoo Finance chart data → Finnhub → Alpha Vantage','GDELT AI-infrastructure news (24h → 72h fallback)','GDELT political/policy coverage (24h → 72h fallback)','SEC EDGAR','Bargo Congress Trades API → fallback providers']
  };
  cached = data;
  cachedAt = Date.now();
  return res.status(200).json({ ...data, cached:false, timestamp:cachedAt });
}
