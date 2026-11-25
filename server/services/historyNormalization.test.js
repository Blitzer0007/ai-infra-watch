import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeMarketHistory,completeHistoryQuality,marketDateFromSeconds} from './historyNormalization.js';
import {history,requireAdjustedHistory} from '../../api/_market-data.js';
import {summarizeMarketHistory} from '../api/market-data-health.js';
const NOW=Date.parse('2026-11-25T12:00:00Z');
const row={date:'2026-11-23',price:100,adjustedPrice:80,adjusted:true};

test('usable raw observations survive omissions without gaining complete adjusted coverage',()=>{
  const data=normalizeMarketHistory({currency:'USD',points:[row,{...row,date:'2026-11-24',price:0}]},NOW);
  assert.deepEqual(data.points,[row]);assert.equal(data.historyQuality.discardedPointCount,1);
  assert.equal(completeHistoryQuality(data),false);
  assert.throws(()=>requireAdjustedHistory(data),/complete split/);
  const health=summarizeMarketHistory(data,NOW);
  assert.equal(health.available,true);assert.equal(health.adjustedCloseAvailable,false);
  assert.equal(health.discardedPointCount,1);
});
test('calendar price and adjusted-number validation never coerces untrusted values',()=>{
  const invalid=[null,false,true,'100',0,-1,NaN,Infinity];
  for(const timestamp of [...invalid,Number.MAX_VALUE])assert.equal(marketDateFromSeconds(timestamp),null);
  for(const price of invalid){
    assert.throws(()=>normalizeMarketHistory({points:[{...row,price}]},NOW),/No usable/);
    assert.throws(()=>requireAdjustedHistory({points:[{...row,price}]}),/complete split/);
    assert.equal(summarizeMarketHistory({points:[{...row,price}]},NOW).adjustedCloseAvailable,false);
  }
  for(const adjustedPrice of invalid){
    const data=normalizeMarketHistory({points:[{...row,adjustedPrice}]},NOW);
    assert.equal(data.points[0].adjusted,false);assert.equal(data.historyQuality.invalidAdjustedPointCount,1);
    assert.throws(()=>requireAdjustedHistory(data),/complete split/);
  }
  for(const date of ['2026-02-30','2026-13-01','2026-11-26','2026-11-23T00:00:00Z']){
    assert.throws(()=>normalizeMarketHistory({points:[{...row,date}]},NOW),/No usable/);
    assert.equal(summarizeMarketHistory({points:[{...row,date}]},NOW).adjustedCloseAvailable,false);
  }
});
test('duplicates are counted and conflicting raw or adjusted closes cannot silently win',()=>{
  const data=normalizeMarketHistory({points:[row,row]},NOW);
  assert.equal(data.points.length,1);assert.equal(data.historyQuality.duplicatePointCount,1);
  assert.throws(()=>requireAdjustedHistory(data));
  for(const change of [{price:101},{adjustedPrice:81},{adjusted:false}])
    assert.throws(()=>normalizeMarketHistory({points:[row,{...row,...change}]},NOW),/Conflicting/);
  assert.equal(summarizeMarketHistory({points:[row,row]},NOW).adjustedCloseAvailable,false);
  assert.equal(summarizeMarketHistory(data,NOW).duplicateDateCount,1);
});
test('clean complete adjusted observations retain original raw closes and unknown currency',()=>{
  const data=normalizeMarketHistory({currency:null,points:[{...row,date:'2026-11-24'},row]},NOW);
  const adjusted=requireAdjustedHistory(data);
  assert.equal(data.currency,null);assert.equal(completeHistoryQuality(data),true);
  assert.deepEqual(adjusted.points.map(p=>p.rawPrice),[100,100]);
  assert.deepEqual(adjusted.points.map(p=>p.price),[80,80]);
  assert.equal(summarizeMarketHistory(data,NOW).adjustedCloseAvailable,true);
  for(const quality of [{},null,{...data.historyQuality,discardedPointCount:'0'},{...data.historyQuality,inputPointCount:1}]){
    const malformed={...data,historyQuality:quality};assert.equal(completeHistoryQuality(malformed),false);
    assert.throws(()=>requireAdjustedHistory(malformed));
  }
});
test('oversized missing empty and invalid-clock packets cannot become provider successes',()=>{
  for(const value of [{},{points:[]},{points:Array(20001).fill(row)}])assert.throws(()=>normalizeMarketHistory(value,NOW));
  assert.throws(()=>normalizeMarketHistory({points:[row]},NaN));
});

async function providers(run){
  const prior=globalThis.fetch,clock=Date.now;
  const keys=['FINNHUB_API_KEY','ALPHA_VANTAGE_API_KEY'];
  const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  for(const key of keys)process.env[key]='fake-history-key';
  Date.now=()=>NOW;
  try{await run();}finally{globalThis.fetch=prior;Date.now=clock;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
}
function yahoo(closes,timestamps=closes.map((_,i)=>Date.parse(`2026-11-${20+i}T21:00:00Z`)/1000)){return new Response(JSON.stringify({chart:{result:[{meta:{currency:'USD'},timestamp:timestamps,indicators:{quote:[{close:closes}],adjclose:[{adjclose:closes}]}}]}}));}

test('all unusable Yahoo closes trigger the configured fallback instead of a false primary success',()=>providers(async()=>{
 for(const variant of ['price','timestamp']){
  const calls=[];
  globalThis.fetch=async url=>{
    const host=new URL(String(url)).hostname;calls.push(host);
    if(host==='query1.finance.yahoo.com')return variant==='price'?yahoo([0,-1]):yahoo([100,102],[null,'1795179600']);
    assert.equal(host,'finnhub.io');return new Response(JSON.stringify({s:'ok',t:[1795179600,1795438800],c:[100,102]}));
  };
  const data=await history('FICTFALL'+variant.toUpperCase(),'1y');
  assert.deepEqual(calls,['query1.finance.yahoo.com','finnhub.io']);assert.equal(data.provider,'finnhub');
  assert.equal(data.providerStatus,'FALLBACK');assert.equal(data.providerAttempts[0].errorCode,'no_data');
  assert.deepEqual(data.points.map(p=>p.price),[100,102]);assert.equal(data.currency,null);
  assert.throws(()=>requireAdjustedHistory(data),/complete split/);
 }
}));
test('Alpha decimal strings decode explicitly; boolean or missing closes cannot become one or zero',()=>providers(async()=>{
  const calls=[];
  globalThis.fetch=async url=>{
    const host=new URL(String(url)).hostname;calls.push(host);
    if(host==='query1.finance.yahoo.com')return yahoo([0]);
    if(host==='finnhub.io')return new Response(JSON.stringify({s:'ok',t:[1795179600],c:[0]}));
    assert.equal(host,'www.alphavantage.co');return new Response(JSON.stringify({'Time Series (Daily)':{
      '2026-11-20':{'4. close':'123.45'},'2026-11-23':{'4. close':true},'2026-11-24':{'4. close':null}}}));
  };
  const data=await history('FICTALPHA','1y');
  assert.equal(calls.length,3);assert.equal(data.provider,'alpha-vantage');
  assert.deepEqual(data.points.map(p=>p.price),[123.45]);assert.equal(data.historyQuality.discardedPointCount,2);
  assert.throws(()=>requireAdjustedHistory(data),/complete split/);
}));
test('mixed primary history remains displayable but omissions and cache fallback remain explicit',()=>providers(async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;return yahoo([100,0,102]);};
  const data=await history('FICTPART','1y');
  assert.equal(calls,1);assert.equal(data.provider,'yahoo');assert.equal(data.historyQuality.discardedPointCount,1);
  assert.throws(()=>requireAdjustedHistory(data),/complete split/);
  const cached=await history('FICTPART','1y');assert.equal(calls,1);assert.equal(cached.cached,true);
  Date.now=()=>NOW+300001;
  globalThis.fetch=async()=>{calls++;return new Response('private outage response',{status:503});};
  const stale=await history('FICTPART','1y');
  assert.equal(calls,4);assert.equal(stale.stale,true);assert.equal(stale.providerStatus,'STALE_FALLBACK');
  assert.equal(stale.historyQuality.discardedPointCount,1);assert.throws(()=>requireAdjustedHistory(stale),/stale/);
  assert(!JSON.stringify(stale).includes('private outage response'));
}));
