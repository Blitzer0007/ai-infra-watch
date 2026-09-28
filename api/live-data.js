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

function stripSecHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>(?=.)/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h[1-6]|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t\r]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

function cleanSecPhrase(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:()\-"'"]+|[\s,.;:()\-"'"]+$/g, '')
    .trim();
}

function splitSecSentences(text) {
  return stripSecHtml(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map(cleanSecPhrase)
    .filter(s => s.length >= 25 && s.length <= 1200);
}

function extractCounterparty(text) {
  const source = stripSecHtml(text);
  const candidates = [];
  const between = /\bbetween\s+(.{2,180}?)\s+(?:and)\s+(.{2,180}?)(?:[.;:,]|\n|$)/gi;
  for (const match of source.matchAll(between)) {
    candidates.push(cleanSecPhrase(match[1]), cleanSecPhrase(match[2]));
  }

  const withPattern = /\b(?:agreement|contract|arrangement|lease|order)\s+(?:with|between)\s+(.{2,180}?)(?:\s+(?:to|for|under|pursuant|dated)|[.;:,]|\n|$)/gi;
  for (const match of source.matchAll(withPattern)) {
    candidates.push(cleanSecPhrase(match[1]));
  }

  const entered = /\bentered into\s+(?:a|an)\s+(?:material\s+)?(?:definitive\s+)?(?:agreement|contract|arrangement)\s+with\s+(.{2,180}?)(?:\s+(?:to|for|under|pursuant)|[.;:,]|\n|$)/gi;
  for (const match of source.matchAll(entered)) {
    candidates.push(cleanSecPhrase(match[1]));
  }

  const noise = /^(the company|the registrant|the parties|its subsidiary|the purchaser|the seller|various parties|certain parties)$/i;
  const normalized = [];
  for (const item of candidates) {
    const value = cleanSecPhrase(item);
    if (!value || value.length < 3 || value.length > 100 || noise.test(value)) continue;
    if (value.split(/\s+/).length > 12) continue;
    if (!normalized.some(existing => existing.toLowerCase() === value.toLowerCase())) normalized.push(value);
  }
  return normalized[0] || '';
}

function parseMoney(raw) {
  const value = Number(String(raw).replace(/[$,]/g, '').match(/\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isFinite(value)) return 0;
  const lower = String(raw).toLowerCase();
  if (lower.includes('trillion')) return value * 1e12;
  if (lower.includes('billion') || lower.includes('bn')) return value * 1e9;
  if (lower.includes('million') || lower.includes('mm')) return value * 1e6;
  if (/\$?\s*\d+(?:\.\d+)?\s*m$/i.test(lower)) return value * 1e6;
  if (/\$?\s*\d+(?:\.\d+)?\s*k$/i.test(lower)) return value * 1e3;
  return value;
}

function extractContractDetails(symbol, filing, html) {
  const text = stripSecHtml(html);
  const sentences = splitSecSentences(html);
  const relevant = sentences.filter(sentence =>
    /\b(agreement|contract|lease|purchase|order|commitment|obligation|colocation|capacity|service)\b/i.test(sentence)
  );
  const counterparty = extractCounterparty(text);

  const valueMatches = [];
  for (const sentence of relevant) {
    for (const match of sentence.matchAll(/(?:US\$|\$)\s?\d+(?:,\d{3})*(?:\.\d+)?\s?(?:trillion|billion|million|bn|mm|m|k)?/gi)) {
      valueMatches.push(match[0]);
    }
  }
  const disclosedValue = valueMatches.length
    ? valueMatches.sort((a,b) => parseMoney(b) - parseMoney(a))[0]
    : 'Not quantified';

  let duration = 'See SEC filing';
  for (const sentence of relevant) {
    const match = sentence.match(/\b(?:for|over|during|term(?: of)?|period of)\s+(?:a\s+)?(\d+(?:\.\d+)?)\s*[- ]?(year|years|month|months)\b/i)
      || sentence.match(/\b(\d+(?:\.\d+)?)[ -]?(year|years|month|months)[ -](?:term|agreement|contract|lease)\b/i);
    if (match) {
      duration = match[1] + ' ' + match[2];
      break;
    }
  }

  let hardware = 'See SEC filing';
  const hardwareSentence = sentences.find(sentence =>
    /\b(?:NVIDIA|Blackwell|Rubin|GPU|GPUs|accelerator|data center|datacenter|colocation|megawatt|MW|gigawatt|GW|server|compute)\b/i.test(sentence)
  );
  if (hardwareSentence) hardware = hardwareSentence.slice(0, 500);

  const evidence = [...new Set((relevant.length ? relevant : sentences)
    .filter(sentence =>
      counterparty
        ? sentence.toLowerCase().includes(counterparty.toLowerCase()) || /\b(?:agreement|contract|lease|commitment|obligation)\b/i.test(sentence)
        : /\b(?:agreement|contract|lease|commitment|obligation)\b/i.test(sentence)
    )
    .slice(0, 3))];

  const detailSentences = relevant.filter(sentence =>
    (counterparty && sentence.toLowerCase().includes(counterparty.toLowerCase()))
    || /(?:agreement|contract|lease).{0,180}(?:million|billion|\$|MW|GW|year|month)/i.test(sentence)
  );
  const details = (detailSentences.length ? detailSentences : relevant)
    .slice(0, 3)
    .join(' ')
    .slice(0, 1400)
    || 'SEC Form 8-K Item 1.01 — Entry into a Material Definitive Agreement. Review the primary filing for commercial terms.';

  return {
    id: 'sec-' + filing.accession,
    company: symbol,
    client: counterparty || 'Material definitive agreement',
    value: disclosedValue,
    duration,
    hardware,
    details,
    status: 'SEC filed',
    statusLevel: 'high-verified',
    dateSigned: filing.filingDate,
    source: 'sec-edgar-primary',
    accession: filing.accession,
    url: filing.url,
    items: filing.items,
    evidence: evidence.length ? evidence : ['8-K Item 1.01']
  };
}

async function fetchSecContracts() {
  const ua = { 'User-Agent': 'AI Infra Watch/1.0 (research dashboard; contact: dev@example.com)' };
  try {
    const tickerResponse = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: ua });
    if (!tickerResponse.ok) return [];
    const tickerMap = await tickerResponse.json();
    const cikByTicker = {};
    for (const entry of Object.values(tickerMap)) {
      if (entry && entry.ticker && entry.cik_str) {
        cikByTicker[String(entry.ticker).toUpperCase()] = String(entry.cik_str).padStart(10, '0');
      }
    }

    const candidates = SYMBOLS
      .map(symbol => ({ symbol, cik: cikByTicker[String(symbol).toUpperCase()] }))
      .filter(x => x.cik);

    const filings = [];
    await Promise.all(candidates.map(async ({ symbol, cik }) => {
      try {
        const response = await fetch('https://data.sec.gov/submissions/CIK' + cik + '.json', { headers: ua });
        if (!response.ok) return;
        const payload = await response.json();
        const recent = payload?.filings?.recent;
        if (!recent) return;

        let countForSymbol = 0;
        for (let i = 0; i < (recent.form || []).length; i++) {
          const form = recent.form[i];
          const items = recent.items?.[i] || '';
          const filingDate = recent.filingDate?.[i];
          if (form !== '8-K' || !String(items).includes('1.01') || !filingDate) continue;
          if (Date.now() - new Date(filingDate).getTime() > 120 * 24 * 60 * 60 * 1000) continue;

          const accession = recent.accessionNumber?.[i];
          const accessionPath = accession && accession.replaceAll('-', '');
          const primaryDocument = recent.primaryDocument?.[i];
          if (!accession || !accessionPath || !primaryDocument) continue;

          filings.push({
            symbol,
            filingDate,
            accession,
            items: String(items).split(',').map(x => x.trim()).filter(Boolean),
            url: 'https://www.sec.gov/Archives/edgar/data/' + Number(cik) + '/' + accessionPath + '/' + primaryDocument
          });

          countForSymbol++;
          if (countForSymbol >= 2) break;
        }
      } catch {
        // Skip symbols with unavailable SEC submissions.
      }
    }));

    filings.sort((a,b) => String(b.filingDate).localeCompare(String(a.filingDate)));
    const selected = filings.slice(0, 18);

    const parsed = await Promise.all(selected.map(async filing => {
      try {
        const response = await fetch(filing.url, {
          headers: ua,
          signal: AbortSignal.timeout(6500)
        });
        if (!response.ok) {
          return {
            ...extractContractDetails(filing.symbol, filing, ''),
            value: 'Not quantified',
            client: 'Material definitive agreement',
            duration: 'See SEC filing',
            hardware: 'See SEC filing',
            details: 'SEC Form 8-K Item 1.01 — Entry into a Material Definitive Agreement. Primary filing text could not be fetched during this refresh.'
          };
        }
        const html = await response.text();
        return extractContractDetails(filing.symbol, filing, html);
      } catch {
        return {
          ...extractContractDetails(filing.symbol, filing, ''),
          value: 'Not quantified',
          client: 'Material definitive agreement',
          duration: 'See SEC filing',
          hardware: 'See SEC filing',
          details: 'SEC Form 8-K Item 1.01 — Entry into a Material Definitive Agreement. Primary filing text could not be fetched during this refresh.'
        };
      }
    }));

    return parsed;
  } catch {
    return [];
  }
}

async function fetchCongressTrades() {
  const symbols = new Set(['NVDA','MSFT','NBIS','META','NOW','SNDK','MU','AMD','AMPG','DGXX']);
  try {
    // Use one global request instead of one request per ticker. This stays within
    // Bargo's keyless rate limit and avoids partial/empty results on Vercel.
    const response = await fetch(
      'https://www.bargo.ai/free-apis/congress/v1/trades?limit=100',
      { headers: { 'User-Agent': 'AI Infra Watch/1.0' } }
    );
    if (!response.ok) return [];
    const payload = await response.json();
    return (payload?.trades || [])
      .filter((t) => symbols.has(String(t.ticker || '').toUpperCase()))
      .map((t, index) => ({
        id: 'congress-' + String(t.ticker || '') + '-' + String(t.disclosure_date || t.transaction_date || '') + '-' + index,
        politician: t.member || 'Unknown filer',
        chamber: String(t.chamber || '').toLowerCase() === 'senate' ? 'Senate' : 'House',
        stockSymbol: String(t.ticker || '').toUpperCase(),
        transactionType: String(t.type || '').toLowerCase().includes('sale') ? 'sell' : 'buy',
        amountRange: t.amount_range || 'Not disclosed',
        date: t.disclosure_date || t.transaction_date || '',
        stockPrice: typeof t.est_price === 'number' ? t.est_price : 0
      }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 100);
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
    congressTrades: await fetchCongressTrades(),
    macroRisks,
    marketSentiment:'Live quotes + AI-infrastructure news feed active.',
    sources:['Yahoo Finance chart data','GDELT news','SEC EDGAR','Bargo Congress Trades API']
  };
  cached = data;
  cachedAt = Date.now();
  return res.status(200).json({ ...data, cached:false, timestamp:cachedAt });
}
