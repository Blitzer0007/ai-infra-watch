import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeYahooQuote, normalizeFinnhubQuote, normalizeAlphaQuote } from './quoteNormalization.js';
import { summarizeQuoteCoverage } from './marketDataValidation.js';
import { summarizeMarketQuote } from '../api/market-data-health.js';
const now=Date.parse('2026-11-06T19:05:00Z');
const seconds=value=>Date.parse(value)/1000;

test('reported identity and declared adapter mode are retained without borrowing requested symbols',()=>{
  const observed=normalizeYahooQuote({meta:{symbol:'NVDA',regularMarketPrice:100}},now,'NVDA');
  assert.equal(observed.returnedSymbol,'NVDA');assert.equal(observed.sourceMode,'live');
  assert.equal(normalizeYahooQuote({meta:{regularMarketPrice:100}},now,'NVDA').returnedSymbol,null);
  assert.equal(normalizeFinnhubQuote({c:100},now).returnedSymbol,null);
  assert.equal(normalizeAlphaQuote({'05. price':'100'},now,'NVDA').returnedSymbol,null);
});
const yahoo=()=>({meta:{symbol:'NVDA',regularMarketPrice:110,regularMarketTime:seconds('2026-11-06T19:00:00Z'),currency:'USD',exchangeTimezoneName:'America/New_York',
  chartPreviousClose:90,currentTradingPeriod:{regular:{start:seconds('2026-11-06T14:30:00Z'),end:seconds('2026-11-06T21:00:00Z')}}},
  timestamp:['2026-11-04','2026-11-05','2026-11-06'].map(day=>seconds(day+'T14:30:00Z')),
  indicators:{quote:[{close:[90,100,110]}]}});

test('Yahoo daily change uses an earlier exchange session instead of the five-day chart baseline',()=>{
  const value=normalizeYahooQuote(yahoo(),now,'NVDA');
  assert.equal(value.prevClose,100);assert.ok(Math.abs(value.changePct-10)<1e-10);
  assert.equal(value.dailyChangeSource,'prior-session-chart-close');assert.equal(value.currency,'USD');assert.equal(value.isMarketSessionOpen,true);
  assert.equal(value.marketTime,'2026-11-06T19:00:00.000Z');assert.equal(value.asOf,value.marketTime);assert.equal(value.retrievedAt,'2026-11-06T19:05:00.000Z');
});
test('missing daily reference, range, currency and observation time remain null',()=>{
  const value=normalizeYahooQuote({meta:{regularMarketPrice:100,chartPreviousClose:80,previousClose:80}},now);
  assert.equal(value.changePct,null);assert.equal(value.prevClose,null);assert.equal(value.low,null);assert.equal(value.high,null);
  assert.equal(value.marketTime,null);assert.equal(value.asOf,null);assert.equal(value.currency,null);assert.equal(value.status,'missing');
});
test('a provider-observed unchanged reference yields a genuine zero move',()=>{
  const input=yahoo();input.meta.regularMarketPrice=100;
  assert.equal(normalizeYahooQuote(input,now).changePct,0);
  assert.equal(normalizeFinnhubQuote({c:100,dp:0,t:seconds('2026-11-06T19:00:00Z')},now).changePct,0);
  assert.equal(normalizeAlphaQuote({'05. price':'100','10. change percent':'0.00%'},now).changePct,0);
});
test('Yahoo rejects malformed price or identity and cannot promote a historical close to a current quote',()=>{
  for(const price of [null,0,-1,Infinity,'100'])assert.throws(()=>normalizeYahooQuote({meta:{regularMarketPrice:price},indicators:{quote:[{close:[100]}]}},now),/no price/);
  assert.throws(()=>normalizeYahooQuote(yahoo(),now,'AMD'),/different symbol/);
});
test('ambiguous, unaligned or unknown-zone chart references stay unavailable',()=>{
  const duplicate=yahoo();duplicate.timestamp[0]=duplicate.timestamp[1];
  assert.equal(normalizeYahooQuote(duplicate,now).changePct,null);
  const unaligned=yahoo();unaligned.timestamp.pop();assert.equal(normalizeYahooQuote(unaligned,now).changePct,null);
  const unknown=yahoo();unknown.meta.exchangeTimezoneName='Unknown/Zone';assert.equal(normalizeYahooQuote(unknown,now).changePct,null);
});
test('Finnhub derives a move only from an observed positive previous close and never invents metadata',()=>{
  const derived=normalizeFinnhubQuote({c:110,pc:100,dp:null},now);
  assert.ok(Math.abs(derived.changePct-10)<1e-10);assert.equal(derived.dailyChangeSource,'previous-close-ratio');
  const absent=normalizeFinnhubQuote({c:100,dp:null,t:null},now);
  assert.equal(absent.changePct,null);assert.equal(absent.marketTime,null);assert.equal(absent.asOf,null);assert.equal(absent.currency,null);assert.equal(absent.isMarketSessionOpen,null);
  assert.equal(normalizeFinnhubQuote({c:100,dp:0,t:Number.MAX_VALUE},now).marketTime,null);
});
test('Alpha Vantage preserves date-only precision and does not infer midnight observation or USD',()=>{
  const value=normalizeAlphaQuote({'01. symbol':'NVDA','05. price':'110','08. previous close':'100','07. latest trading day':'2026-11-06'},now,'NVDA');
  assert.ok(Math.abs(value.changePct-10)<1e-10);assert.equal(value.marketDate,'2026-11-06');assert.equal(value.marketTimePrecision,'date-only');
  assert.equal(value.marketTime,null);assert.equal(value.asOf,null);assert.equal(value.currency,null);assert.equal(value.isMarketSessionOpen,null);
});
test('malformed Alpha fields do not become flat moves, valid dates or reassigned symbols',()=>{
  const value=normalizeAlphaQuote({'05. price':'100','10. change percent':'','07. latest trading day':'2026-02-31'},now);
  assert.equal(value.changePct,null);assert.equal(value.marketDate,null);
  assert.throws(()=>normalizeAlphaQuote({'01. symbol':'AMD','05. price':'100'},now,'NVDA'),/different symbol/);
  assert.throws(()=>normalizeAlphaQuote({'05. price':' '},now),/no price/);
});
test('market-wide coverage uses oldest complete observation time rather than a single newest retrieval',()=>{
  const value=summarizeQuoteCoverage({A:{price:100,changePct:0,provider:'yahoo',marketTime:'2026-11-06T19:00:00Z'},
    B:{price:100,changePct:1,provider:'finnhub',marketTime:'2026-11-06T18:58:00Z'}},['A','B'],now);
  assert.equal(value.priceCoverage,'complete');assert.equal(value.timeCoverage,'complete');assert.equal(value.asOf,'2026-11-06T18:58:00Z');assert.equal(value.providers.length,2);
});
test('partial prices, missing moves, unknown/future times and stale observations stay distinct',()=>{
  const value=summarizeQuoteCoverage({A:{price:100,changePct:null,provider:'yahoo',retrievedAt:new Date(now).toISOString()},
    B:{price:100,changePct:0,provider:'finnhub',marketTime:'2027-01-01T00:00:00Z',stale:true}},['A','B','C'],now);
  assert.equal(value.priceCoverage,'partial');assert.equal(value.asOf,null);assert.deepEqual(value.missingSymbols,['C']);assert.deepEqual(value.missingMoveSymbols,['A']);
  assert.deepEqual(value.unknownTimeSymbols,['A','B']);assert.deepEqual(value.staleSymbols,['B']);
});
test('health diagnostics cannot turn retrieval time, date-only data or a future timestamp into fresh source age',()=>{
  const absent=summarizeMarketQuote({price:100,retrievedAt:new Date(now).toISOString(),marketTime:null},now);
  assert.equal(absent.ageSeconds,null);assert.equal(absent.metadataCoverage.marketTime,false);
  const day=summarizeMarketQuote({price:100,marketTimePrecision:'date-only',asOf:'2026-11-06T00:00:00Z',marketDate:'2026-11-06'},now);
  assert.equal(day.ageSeconds,null);assert.equal(day.marketDate,'2026-11-06');
  const future=summarizeMarketQuote({price:100,marketTime:'2027-01-01T00:00:00Z'},now);assert.equal(future.ageSeconds,null);assert.equal(future.futureTimestampDetected,true);
  assert.equal(summarizeMarketQuote({price:Infinity},now).available,false);
});
