import { regularSessionMetadata } from './marketDataValidation.js';

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const numeric = value => {
  if (finite(value)) return value;
  if (typeof value !== 'string' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const parsed = Number(value); return finite(parsed) ? parsed : null;
};
const timestamp = seconds => positive(seconds) && seconds <= 8640000000000 ? new Date(seconds * 1000).toISOString() : null;
const ratioChange = (price, previous) => {
  if (!positive(price) || !positive(previous)) return null;
  const change = (price / previous - 1) * 100; return finite(change) ? change : null;
};
function range(low, high) {
  low = positive(low) ? low : null; high = positive(high) ? high : null;
  return low != null && high != null && low > high ? { low: null, high: null } : { low, high };
}
function dayAt(seconds, zone) {
  if (!timestamp(seconds) || typeof zone !== 'string' || !zone.trim()) return null;
  try { return new Intl.DateTimeFormat('en-CA', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(seconds*1000)); }
  catch { return null; }
}

function yahooPrevious(meta, times, closes) {
  if (positive(meta.regularMarketPreviousClose)) return { price: meta.regularMarketPreviousClose, source: 'regularMarketPreviousClose' };
  const marketDay = dayAt(meta.regularMarketTime, meta.exchangeTimezoneName);
  if (!marketDay || !Array.isArray(times) || !Array.isArray(closes) || times.length !== closes.length) return { price: null, source: null };
  const currentBars = times.filter((time,index)=>positive(closes[index])&&dayAt(time,meta.exchangeTimezoneName)===marketDay&&time<=meta.regularMarketTime);
  if (currentBars.length !== 1) return { price:null,source:null };
  const candidates = times.map((time,index)=>({time,price:closes[index],day:dayAt(time,meta.exchangeTimezoneName)}))
    .filter(row=>positive(row.price)&&row.day&&row.day<marketDay&&row.time<meta.regularMarketTime)
    .sort((a,b)=>b.time-a.time);
  if (candidates.length > 1 && candidates[0].day === candidates[1].day) return { price: null, source: null };
  return candidates[0] ? { price:candidates[0].price,source:'prior-session-chart-close' } : { price:null,source:null };
}

export function normalizeYahooQuote(result, nowMs = Date.now(), expectedSymbol = null) {
  const meta = result?.meta || {};
  if (expectedSymbol && meta.symbol != null && String(meta.symbol).trim().toUpperCase() !== expectedSymbol) throw new Error('Yahoo returned a different symbol');
  if (!positive(meta.regularMarketPrice)) throw new Error('Yahoo returned no price');
  const previous = yahooPrevious(meta,result?.timestamp,result?.indicators?.quote?.[0]?.close);
  const session = regularSessionMetadata(meta,nowMs);
  return { price:meta.regularMarketPrice,changePct:ratioChange(meta.regularMarketPrice,previous.price),prevClose:previous.price,
    dailyChangeSource:previous.source,...range(meta.regularMarketDayLow,meta.regularMarketDayHigh),
    source:'Yahoo Finance',provider:'yahoo',sourceMode:'live',returnedSymbol:typeof meta.symbol==='string'?meta.symbol.trim().toUpperCase():null,
    currency:typeof meta.currency==='string'&&meta.currency.trim()?meta.currency:null,
    retrievedAt:new Date(nowMs).toISOString(),adjustedBasis:'raw',...session,asOf:session.marketTime,stale:false };
}

export function normalizeFinnhubQuote(value, nowMs = Date.now()) {
  if (!positive(value?.c)) throw new Error('Finnhub returned no price');
  const previous = positive(value.pc) ? value.pc : null;
  const derived = ratioChange(value.c,previous);
  const changePct = finite(value.dp) ? value.dp : derived;
  const marketTime = timestamp(value.t);
  return {price:value.c,changePct,prevClose:previous,...range(value.l,value.h),
    dailyChangeSource:finite(value.dp)?'provider-percent':derived!=null?'previous-close-ratio':null,
    source:'Finnhub',provider:'finnhub',sourceMode:'live',returnedSymbol:null,marketTime,asOf:marketTime,retrievedAt:new Date(nowMs).toISOString(),
    currency:null,isMarketSessionOpen:null,status:'missing',adjustedBasis:'raw',stale:false};
}

export function normalizeAlphaQuote(value, nowMs = Date.now(), expectedSymbol = null) {
  if (expectedSymbol && value?.['01. symbol'] != null && String(value['01. symbol']).trim().toUpperCase() !== expectedSymbol) throw new Error('Alpha Vantage returned a different symbol');
  const price = numeric(value?.['05. price']);
  if (!positive(price)) throw new Error('Alpha Vantage returned no price');
  const parsedPrevious = numeric(value['08. previous close']);
  const previous = positive(parsedPrevious) ? parsedPrevious : null;
  const percent = value['10. change percent'];
  const reported = typeof percent === 'string' ? numeric(percent.trim().replace(/%$/, '')) : numeric(percent);
  const derived = ratioChange(price,previous);
  const day = value['07. latest trading day'];
  const validDay = typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day;
  return {price,changePct:reported??derived,prevClose:previous,...range(numeric(value['04. low']),numeric(value['03. high'])),
    dailyChangeSource:reported!=null?'provider-percent':derived!=null?'previous-close-ratio':null,
    source:'Alpha Vantage',provider:'alpha-vantage',sourceMode:'live',returnedSymbol:typeof value['01. symbol']==='string'?value['01. symbol'].trim().toUpperCase():null,
    marketTime:null,asOf:null,marketDate:validDay?day:null,
    marketTimePrecision:validDay?'date-only':'unknown',retrievedAt:new Date(nowMs).toISOString(),currency:null,
    isMarketSessionOpen:null,status:'missing',adjustedBasis:'raw',stale:false};
}
