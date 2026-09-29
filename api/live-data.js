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

async function fetchSecContracts() {
  const ua = { 'User-Agent': 'AI Infra Watch/1.0 (research dashboard; contact: dev@example.com)' };
  try {
    const tickerResponse = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: ua });
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
        const response = await fetch('https://data.sec.gov/submissions/CIK' + cik + '.json', { headers: ua });
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

    return results.flat().sort((a, b) => String(b.dateSigned).localeCompare(String(a.dateSigned))).slice(0, 40);
  } catch {
    return [];
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

    if (!response.ok) return [];

    const payload = await response.json();
    return Array.isArray(payload?.trades) ? payload.trades : [];
  } catch {
    return [];
  }
}


const YAHOO_SYMBOL = {
  DRAM: 'DRAM',
  SOXL: 'SOXL',
  VIVO: 'VVPR',
  CBRS: 'CBRS',
  TSM: 'TSM',
  '000660.KS': '000660.KS'
};

let cached = null;
let cachedAt = 0;
const CACHE_MS = 60000;

function yahooSymbol(symbol) {
  return YAHOO_SYMBOL[symbol] || symbol;
}

async function quote(symbol) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(yahooSymbol(symbol)) + '?range=5d&interval=1d';
  const r = await fetch(url, { headers: { 'User-Agent': 'ai-infra-watch/1.0' } });
  if (!r.ok) throw new Error('Quote HTTP ' + r.status);
  const j = await r.json();
  const result = j && j.chart && j.chart.result && j.chart.result[0];
  const meta = result && result.meta;
  const closes = result && result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close || [];
  const validCloses = closes.filter(v => typeof v === 'number');
  const latestClose = validCloses.length ? validCloses[validCloses.length - 1] : undefined;
  const priorCloseFromSeries = validCloses.length > 1 ? validCloses[validCloses.length - 2] : undefined;
  const price = typeof (meta && meta.regularMarketPrice) === 'number' ? meta.regularMarketPrice : latestClose;
  const prevClose = typeof priorCloseFromSeries === 'number' ? priorCloseFromSeries : (meta && meta.previousClose);
  const changePct = typeof price === 'number' && typeof prevClose === 'number' && prevClose !== 0 ? ((price / prevClose) - 1) * 100 : 0;
  if (typeof price !== 'number') throw new Error('No price');
  return { price, changePct };
}

async function news() {
  const q = '(NVIDIA OR AMD OR Micron OR "SK Hynix" OR Nebius OR ServiceNow OR Salesforce OR "Digi Power X" OR Meta OR TSMC) (AI OR GPU OR semiconductor OR "data center" OR contract OR export)';
  const url = 'https://api.gdeltproject.org/api/v2/doc/doc?query=' + encodeURIComponent(q) + '&mode=ArtList&format=json&maxrecords=20&timespan=24h';
  const r = await fetch(url, { headers: { 'User-Agent': 'ai-infra-watch/1.0' } });
  if (!r.ok) return [];
  const j = await r.json();
  return (j && j.articles || []).slice(0,20).map(a => ({
    title:a.title, source:a.domain || a.source || 'GDELT', url:a.url, date:a.seendate
  }));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  if (cached && Date.now() - cachedAt < CACHE_MS && !(req.query && req.query.refresh === 'true')) {
    return res.status(200).json({ ...cached, cached:true, timestamp:cachedAt });
  }

  const stockPrices = {};
  await Promise.all(SYMBOLS.map(async symbol => {
    try { stockPrices[symbol] = await quote(symbol); } catch {}
  }));

  const currentNews = await news().catch(() => []);
  const today = new Date().toISOString().slice(0,10);
  const macroRisks = [
    { id:'taiwan', category:'Supply Chain', title:'Taiwan advanced-node exposure', impactRating:'high', description:'Monitor events that could affect advanced-node manufacturing, packaging and accelerator supply.', dateUpdated:today, geminiImpactSummary:'Geopolitics → wafer supply → accelerator availability → NVDA/AMD/TSM/DRAM.' },
    { id:'controls', category:'Trade Policy', title:'AI-chip export controls', impactRating:'high', description:'Monitor restrictions affecting high-end accelerator shipments and China demand.', dateUpdated:today, geminiImpactSummary:'Policy → addressable market → product mix → relative reaction for NVDA/AMD.' },
    { id:'power', category:'Infrastructure', title:'Data-center power availability', impactRating:'medium', description:'Track grid interconnection, power procurement and AI capacity announcements.', dateUpdated:today, geminiImpactSummary:'Power → AI capacity → GPU hosting demand → DGXX/NBIS/IREN/VIVO.' }
  ];

  const data = {
    build: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
      environment: process.env.VERCEL_ENV || 'local'
    },
    stockPrices,
    news: currentNews,
    contracts: await fetchSecContracts(),
    congressTrades: await fetchCongressTrades(req),
    macroRisks,
    marketSentiment:'Live quotes + AI-infrastructure news feed active.',
    sources:['Yahoo Finance chart data','GDELT news','SEC EDGAR','Bargo Congress Trades API']
  };
  cached = data;
  cachedAt = Date.now();
  return res.status(200).json({ ...data, cached:false, timestamp:cachedAt });
}
