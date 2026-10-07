import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadConfiguredSymbols() {
  try {
    const watchlist = JSON.parse(
      readFileSync(join(process.cwd(), 'data', 'stock_watchlist.json'), 'utf8')
    ).watchlist || [];
    return [...new Set(watchlist.map((item) => item.symbol).filter(Boolean))];
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

function sourceFreshness({ latestAt = null, retrievedAt = null, stale = false, fallback = false, healthyMinutes = 30, agingMinutes = 120, staleMinutes = 360 } = {}) {
  const reference = latestAt || retrievedAt;
  const referenceMs = reference ? Date.parse(reference) : NaN;
  if (stale) return { status: 'STALE', ageMinutes: Number.isFinite(referenceMs) ? Math.max(0, (Date.now() - referenceMs) / 60000) : null };
  if (!Number.isFinite(referenceMs)) return { status: 'UNKNOWN', ageMinutes: null };
  const ageMinutes = Math.max(0, (Date.now() - referenceMs) / 60000);
  const status = ageMinutes <= healthyMinutes && !fallback ? 'FRESH' : ageMinutes <= agingMinutes ? 'AGING' : ageMinutes <= staleMinutes ? 'STALE' : 'VERY_STALE';
  return { status, ageMinutes: Number(ageMinutes.toFixed(1)) };
}

function canonicalText(value) {
  return String(value || '').toLowerCase().replace(/https?:\/\/|www\./g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function detectFeedConflicts(items = []) {
  const groups = new Map();
  for (const item of items) {
    const key = item?.url ? String(item.url) : canonicalText(item?.title);
    if (!key) continue;
    const bucket = groups.get(key) || [];
    bucket.push(item);
    groups.set(key, bucket);
  }
  const conflicts = [];
  for (const [key, bucket] of groups) {
    const dates = [...new Set(bucket.map(item => String(item?.date || item?.dateSigned || '').slice(0, 10)).filter(Boolean))];
    const sources = [...new Set(bucket.map(item => String(item?.source || '')).filter(Boolean))];
    if (dates.length > 1 && sources.length > 1) conflicts.push({ key, sources, dates, type: 'same-evidence-different-date' });
  }
  return conflicts;
}

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

async function fetchWhiteHousePrimaryPolicy(days = 7) {
  const cutoff = Date.now() - days * 86400000;
  const queryUrls = [
    'https://www.whitehouse.gov/news/?s=artificial+intelligence',
    'https://www.whitehouse.gov/presidential-actions/?s=artificial+intelligence',
    'https://www.whitehouse.gov/briefings-statements/?s=artificial+intelligence',
    'https://www.whitehouse.gov/news/?s=semiconductor',
  ];
  const rows = [];
  for (const url of queryUrls) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'ai-infra-watch/1.0' }, signal: AbortSignal.timeout(4500) });
      if (!response.ok) continue;
      const html = await response.text();
      const matches = [...html.matchAll(/<a[^>]+href=[\"'](https:\/\/www\.whitehouse\.gov\/[^\"']+)[\"'][^>]*>([\s\S]*?)<\/a>/gi)];
      for (const match of matches) {
        const href = String(match[1] || '');
        const title = String(match[2] || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;/g, "'").replace(/&#8220;/g, '“').replace(/&#8221;/g, '”').replace(/\s+/g, ' ').trim();
        if (!title || title.length < 18 || title.length > 240) continue;
        if (!/(artificial intelligence|\bAI\b|semiconductor|chip|GPU|data center|power|electricity|export|technology|infrastructure)/i.test(title)) continue;
        rows.push({ title, url: href, source: 'whitehouse.gov', date: null, sourceType: 'primary' });
      }
    } catch {}
  }
  const unique = new Map();
  rows.forEach(row => unique.set(row.url, row));
  return Array.from(unique.values()).slice(0, 20);
}

async function fetchFederalRegisterPrimary(days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const url = 'https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest&conditions%5Bterm%5D=artificial%20intelligence%20semiconductor%20data%20center%20export&conditions%5Bpublication_date%5D%5Bgte%5D=' + since;
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'ai-infra-watch/1.0' }, signal: AbortSignal.timeout(4500) });
    if (!response.ok) throw new Error('Federal Register HTTP ' + response.status);
    const payload = await response.json();
    return (payload?.results || []).slice(0, 20).map(row => ({
      title: row?.title || '',
      url: row?.html_url || '',
      source: 'federalregister.gov',
      date: row?.publication_date || null,
      sourceType: 'primary',
      topic: 'Regulatory / government policy',
      note: 'Federal Register primary-source result; inspect the document for the operative text.'
    })).filter(row => row.title && row.url);
  } catch {
    return [];
  }
}
async function fetchPolicyWebSearch(query, days = 3) {
  const brave = String(process.env.BRAVE_SEARCH_API_KEY || '').trim();
  if (brave) {
    const response = await fetch('https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(query) + '&count=20&search_lang=en&country=us&freshness=' + (days <= 1 ? 'pd' : 'pm'), { headers: { Accept: 'application/json', 'X-Subscription-Token': brave }, signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error('Brave Search HTTP ' + response.status);
    const payload = await response.json();
    return { provider: 'brave-web', articles: payload?.web?.results || [] };
  }
  const tavily = String(process.env.TAVILY_API_KEY || '').trim();
  if (tavily) {
    const response = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: tavily, query, search_depth: 'advanced', max_results: 20, include_answer: false, days }), signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error('Tavily Search HTTP ' + response.status);
    const payload = await response.json();
    return { provider: 'tavily-web', articles: payload?.results || [] };
  }
  throw new Error('No web search provider configured');
}
async function politicalSignals() {
  const query = '"White House" OR Trump OR "JD Vance" (AI OR chip OR semiconductor OR GPU OR "data center" OR power OR export OR regulation OR technology OR infrastructure)';
  const rows = [];
  let provider = 'none';
  let upstreamError = null;

  // Prefer primary government sources that do not require a third-party API key.
  const [whiteHouseRows, federalRows] = await Promise.all([
    fetchWhiteHousePrimaryPolicy(7),
    fetchFederalRegisterPrimary(7),
  ]);
  rows.push(...whiteHouseRows.map(item => ({
    ...item,
    id: 'political-whitehouse-' + Buffer.from(item.url).toString('base64url').slice(0, 32),
    actor: detectPoliticalActor(item.title),
    topic: classifyPoliticalTopic(item.title),
    eventType: /(executive order|presidential memorandum|fact sheet|directive|executive action|signed into law)/i.test(item.title) ? 'Policy / official action' : 'Political statement / coverage',
    relatedSymbols: relatedSymbols(item.title),
    note: 'Primary White House source; verify the underlying document before interpreting market impact.',
  })));
  rows.push(...federalRows.map(item => ({
    ...item,
    id: 'political-federal-register-' + Buffer.from(item.url).toString('base64url').slice(0, 32),
    actor: 'U.S. government',
    relatedSymbols: relatedSymbols(item.title),
  })));
  if (rows.length) provider = 'government-primary';

  // Then use a general web-search provider when configured.
  if (rows.length < 8) {
    try {
      const result = await fetchPolicyWebSearch(query, 3);
      provider = provider === 'government-primary' ? provider + ' + ' + result.provider : result.provider;
      for (const article of result.articles || []) {
        const title = String(article?.title || '').trim();
        const url = String(article?.url || '').trim();
        if (!title || !url) continue;
        let host = ''; try { host = new URL(url).hostname.toLowerCase().replace(/^www\\./, ''); } catch {}
        const official = host === 'whitehouse.gov' || host.endsWith('.whitehouse.gov') || host.endsWith('.gov');
        const body = title + ' ' + String(article?.description || article?.content || '');
        rows.push({ id:'political-web-' + Buffer.from(url).toString('base64url').slice(0,32), actor:detectPoliticalActor(body), title, source:host || provider, sourceType:official?'primary':'secondary', topic:classifyPoliticalTopic(body), eventType:/(executive order|presidential memorandum|fact sheet|directive|executive action|signed into law)/i.test(title)?'Policy / official action':'Political statement / coverage', date:article?.published || article?.published_at || null, url, relatedSymbols:relatedSymbols(body), note:official?'Government-domain search result; verify the underlying official document.':'Web search result; verify the underlying statement or official action before relying on wording.' });
      }
    } catch (error) { upstreamError = String(error?.message || error); }
  }

  if (!rows.length) {
    try {
      const fallback = await fetchGdeltJson(query, '72h', 'GDELT policy fallback');
      provider = 'gdelt-discovery';
      upstreamError = upstreamError || fallback.error || null;
      for (const article of fallback.articles || []) {
        const title = String(article?.title || '').trim(); const url = String(article?.url || '').trim();
        if (!title || !url) continue;
        let host = ''; try { host = new URL(url).hostname.toLowerCase().replace(/^www\\./, ''); } catch {}
        const official = host === 'whitehouse.gov' || host.endsWith('.whitehouse.gov') || host.endsWith('.gov');
        rows.push({ id:'political-gdelt-' + Buffer.from(url).toString('base64url').slice(0,32), actor:detectPoliticalActor(title), title, source:host || 'GDELT', sourceType:official?'primary':'secondary', topic:classifyPoliticalTopic(title), eventType:'Political statement / coverage', date:article?.seendate || null, url, relatedSymbols:relatedSymbols(title), note:official?'Government-domain discovery result.':'GDELT discovery result; verify the source.' });
      }
    } catch (error) { upstreamError = upstreamError || String(error?.message || error); }
  }
  const unique = new Map();
  rows.forEach(row => { const key=row.url || row.title.toLowerCase(); if(!unique.has(key)) unique.set(key,row); });
  return { items:Array.from(unique.values()).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,20), provider, upstreamError: upstreamError && unique.size ? 'Provider degraded: '+upstreamError : upstreamError };
}
async function fetchGdeltNews(timespan) {
  const q = '(NVIDIA OR AMD OR Micron OR "SK Hynix" OR Nebius OR ServiceNow OR Salesforce OR "Digi Power X" OR Meta OR TSMC) (AI OR GPU OR semiconductor OR "data center" OR contract OR export)';
  const result = await fetchGdeltJson(q, timespan, 'GDELT news');
  if (result.error && !result.articles.length) throw new Error(result.error);
  return result.articles.slice(0, 20).map(a => ({
    title: a.title, source: a.domain || a.source || 'GDELT', url: a.url, date: a.seendate
  }));
}

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

async function fetchGoogleNewsRss(query, window = '1d') {
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(query + ' when:' + window) + '&hl=en-US&gl=US&ceid=US:en';
  const response = await fetch(url, {
    headers: { 'User-Agent': 'ai-infra-watch/1.0', Accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Google News RSS HTTP ' + response.status);

  const xml = await response.text();
  const items = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const title = decodeXml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1]);
    const link = decodeXml(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]);
    const date = decodeXml(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]);
    const source = decodeXml(block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1]) || 'Google News';
    if (!title || !link) continue;
    items.push({ title, source, url: link, date });
    if (items.length >= 20) break;
  }
  return items;
}

async function news() {
  try {
    const recent = await fetchGdeltNews('24h');
    if (recent.length) return { items: recent, window: '24h', fallback: false, provider: 'GDELT' };
  } catch {}

  try {
    const fallback = await fetchGdeltNews('72h');
    if (fallback.length) return { items: fallback, window: '72h', fallback: true, provider: 'GDELT' };
  } catch {}

  try {
    const recent = await fetchGoogleNewsRss(
      '(NVIDIA OR AMD OR Micron OR "SK Hynix" OR Nebius OR ServiceNow OR Salesforce OR TSMC) (AI OR GPU OR semiconductor OR "data center")',
      '1d'
    );
    if (recent.length) return { items: recent, window: '24h', fallback: true, provider: 'Google News RSS' };
  } catch {}

  try {
    const fallback = await fetchGoogleNewsRss(
      '(NVIDIA OR AMD OR Micron OR "SK Hynix" OR Nebius OR ServiceNow OR Salesforce OR TSMC) (AI OR GPU OR semiconductor OR "data center")',
      '3d'
    );
    if (fallback.length) return { items: fallback, window: '72h', fallback: true, provider: 'Google News RSS' };
  } catch {
    // Keep the feed explicitly empty when every provider is unavailable.
  }

  return { items: [], window: null, fallback: true, provider: 'unavailable' };
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
  const newsLatestAt = currentNews.map(item => item?.date).filter(Boolean).sort().at(-1) || null;
  const contractsLatestAt = contracts.map(item => item?.dateSigned).filter(Boolean).sort().at(-1) || null;
  const politicalLatestAt = politicalSignalsResult.map(item => item?.date).filter(Boolean).sort().at(-1) || null;
  const congressLatestAt = congressTrades.map(item => item?.date || item?.transactionDate).filter(Boolean).sort().at(-1) || null;
  const newsConflicts = detectFeedConflicts(currentNews);
  const politicalConflicts = detectFeedConflicts(politicalSignalsResult);
  evidenceAvailability.news = { status: currentNews.length ? 'AVAILABLE' : 'NOT_FOUND', count: currentNews.length, source: newsResult?.provider || 'GDELT', retrievedAt: feedRetrievedAt, latestAt: newsLatestAt, refreshIntervalSeconds: 300, fallback: Boolean(newsResult?.fallback), freshness: sourceFreshness({ latestAt: newsLatestAt, retrievedAt: feedRetrievedAt, fallback: Boolean(newsResult?.fallback), healthyMinutes: 180, agingMinutes: 720, staleMinutes: 4320 }), conflictStatus: newsConflicts.length ? 'CONFLICT' : 'CLEAR', conflicts: newsConflicts };
  evidenceAvailability.contracts = { status: contracts.length ? 'AVAILABLE' : 'NOT_FOUND', count: contracts.length, source: contractsResult?.source || 'SEC EDGAR', retrievedAt: feedRetrievedAt, latestAt: contractsLatestAt, refreshIntervalSeconds: 300, stale: Boolean(contractsResult?.stale), upstreamError: contractsResult?.upstreamError || null, freshness: sourceFreshness({ latestAt: contractsLatestAt, retrievedAt: feedRetrievedAt, stale: Boolean(contractsResult?.stale), healthyMinutes: 720, agingMinutes: 2880, staleMinutes: 10080 }) };
  evidenceAvailability.political = { status: politicalSignalsResult.length ? 'AVAILABLE' : 'NOT_FOUND', count: politicalSignalsResult.length, source: 'GDELT + White House primary coverage', retrievedAt: feedRetrievedAt, latestAt: politicalLatestAt, refreshIntervalSeconds: 300, fallback: Boolean(politicalResult?.upstreamError), upstreamError: politicalResult?.upstreamError || null, freshness: sourceFreshness({ latestAt: politicalLatestAt, retrievedAt: feedRetrievedAt, fallback: Boolean(politicalResult?.upstreamError), healthyMinutes: 720, agingMinutes: 2880, staleMinutes: 10080 }), conflictStatus: politicalConflicts.length ? 'CONFLICT' : 'CLEAR', conflicts: politicalConflicts };
  evidenceAvailability.congress = { status: congressTrades.length ? 'AVAILABLE' : 'NOT_FOUND', count: congressTrades.length, source: congressResult?.source || 'Congress API', retrievedAt: feedRetrievedAt, latestAt: congressLatestAt, refreshIntervalSeconds: 300, stale: Boolean(congressResult?.stale), upstreamError: congressResult?.upstreamError || null, freshness: sourceFreshness({ latestAt: congressLatestAt, retrievedAt: feedRetrievedAt, stale: Boolean(congressResult?.stale), healthyMinutes: 720, agingMinutes: 2880, staleMinutes: 10080 }) };
  evidenceAvailability.macro = { ...evidenceAvailability.macro, retrievedAt: feedRetrievedAt, refreshIntervalSeconds: 300 };
  const latestMarketQuote = Object.values(stockPrices).reduce((latest, item) => {
    if (!latest || String(item?.marketTime || item?.retrievedAt || item?.asOf || '') > String(latest.marketTime || latest.retrievedAt || latest.asOf || '')) return item;
    return latest;
  }, null);
  evidenceAvailability.market = {
    ...evidenceAvailability.market,
    retrievedAt: latestMarketQuote?.retrievedAt || latestMarketQuote?.asOf || null,
    marketTime: latestMarketQuote?.marketTime || latestMarketQuote?.asOf || null,
    asOf: latestMarketQuote?.asOf || latestMarketQuote?.marketTime || null,
    refreshIntervalSeconds: 60,
  };

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
    sources:['Yahoo Finance chart data → Finnhub → Alpha Vantage','GDELT → Google News RSS AI-infrastructure news (24h → 72h fallback)','GDELT political/policy coverage (24h → 72h fallback)','SEC EDGAR','Bargo Congress Trades API → fallback providers']
  };
  cached = data;
  cachedAt = Date.now();
  return res.status(200).json({ ...data, cached:false, timestamp:cachedAt });
}