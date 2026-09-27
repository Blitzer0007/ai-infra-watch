import type { VercelRequest, VercelResponse } from '@vercel/node';

const SYMBOLS = [
  'DGXX','DRAM','SOXL','NVDA','MSFT','NBIS','VIVO','META','NOW','PHVS',
  '000660.KS','SNDK','MU','TEAM','SOFI','CRM','AMZN','GOOGL','PLTR','CBRS',
  'RUM','QCOM','INTC','SOXX','IREN','TSM','AMD','TSLA','AAPL','ONDS','CIFR',
  'IONQ','NOK','TRT','AMPG','DELL','IBM'
];

const YAHOO_SYMBOL: Record<string,string> = {
  DRAM: 'DRAM',
  SOXL: 'SOXL',
  VIVO: 'VVPR',
  CBRS: 'CBRS',
  TSM: 'TSM',
  000660: '000660.KS'
};

const CACHE_MS = 60_000;
let cached: any = null;
let cachedAt = 0;

function ySymbol(symbol: string) {
  return YAHOO_SYMBOL[symbol] || symbol;
}

async function fetchQuote(symbol: string) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ySymbol(symbol)) + '?range=5d&interval=1d';
  const r = await fetch(url, { headers: { 'User-Agent': 'ai-infra-watch/1.0' } });
  if (!r.ok) throw new Error('Quote HTTP ' + r.status);
  const j = await r.json();
  const result = j?.chart?.result?.[0];
  const meta = result?.meta;
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const prior = [...closes].reverse().find((v:any) => typeof v === 'number');
  const previousClose = meta?.previousClose;
  const price = typeof meta?.regularMarketPrice === 'number' ? meta.regularMarketPrice : prior;
  const changePct = price != null && previousClose ? ((price / previousClose) - 1) * 100 : 0;
  if (typeof price !== 'number') throw new Error('No price');
  return { price, changePct };
}

async function fetchGdelt() {
  const q = '(NVIDIA OR AMD OR Micron OR "SK Hynix" OR Nebius OR "ServiceNow" OR Salesforce OR "Digi Power X" OR Meta) (AI OR GPU OR semiconductor OR data center OR contract OR export)';
  const url = 'https://api.gdeltproject.org/api/v2/doc/doc?query=' + encodeURIComponent(q) + '&mode=ArtList&format=json&maxrecords=20&timespan=24h';
  const r = await fetch(url, { headers: { 'User-Agent': 'ai-infra-watch/1.0' } });
  if (!r.ok) return [];
  const j = await r.json();
  return (j?.articles || []).slice(0, 20).map((a:any) => ({
    title: a.title,
    source: a.domain || a.source || 'GDELT',
    url: a.url,
    date: a.seendate
  }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  if (cached && Date.now() - cachedAt < CACHE_MS && req.query.refresh !== 'true') {
    return res.status(200).json({ ...cached, cached: true, timestamp: cachedAt });
  }

  const stockPrices: Record<string, {price:number; changePct:number}> = {};
  await Promise.all(SYMBOLS.map(async s => {
    try { stockPrices[s] = await fetchQuote(s); } catch {}
  }));

  const news = await fetchGdelt().catch(() => []);
  const macroRisks = [
    { id:'geo-taiwan', category:'Supply Chain', title:'Taiwan advanced-semiconductor exposure', impactRating:'high', description:'Monitor events that can affect advanced-node manufacturing, packaging and accelerator supply.', dateUpdated:new Date().toISOString().slice(0,10), geminiImpactSummary:'Transmission: geopolitics → wafer supply → accelerator availability → NVDA/AMD/TSM/DRAM.' },
    { id:'geo-controls', category:'Trade Policy', title:'AI-chip export controls', impactRating:'high', description:'Monitor U.S./allied restrictions affecting high-end accelerator shipments and China demand.', dateUpdated:new Date().toISOString().slice(0,10), geminiImpactSummary:'Transmission: policy → addressable market → product mix → relative reaction among NVDA/AMD.' },
    { id:'power', category:'Infrastructure', title:'Data-center power availability', impactRating:'medium', description:'Track grid interconnection, power procurement and capacity announcements for AI infrastructure.', dateUpdated:new Date().toISOString().slice(0,10), geminiImpactSummary:'Transmission: power availability → AI capacity → GPU hosting demand → DGXX/NBIS/IREN/VIVO.' }
  ];

  const data = { stockPrices, news, contracts: [], macroRisks, marketSentiment: 'Live quote + AI-infrastructure news feed active.' };
  cached = data;
  cachedAt = Date.now();
  return res.status(200).json({ ...data, cached:false, timestamp:cachedAt });
}
