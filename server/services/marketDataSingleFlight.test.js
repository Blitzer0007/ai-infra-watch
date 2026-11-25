import assert from 'node:assert/strict';
import test from 'node:test';
import {history,quote,requireAdjustedHistory} from '../../api/_market-data.js';
const NOW=Date.parse('2026-11-25T12:00:00Z');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const gate=()=>{let open;const promise=new Promise(resolve=>{open=resolve;});return {promise,open};};
function yahoo(url,price=100){
  const symbol=decodeURIComponent(new URL(String(url)).pathname.split('/').at(-1));
  return new Response(JSON.stringify({chart:{result:[{meta:{symbol,currency:'USD',regularMarketPrice:price,regularMarketTime:NOW/1000},
    timestamp:[NOW/1000-86400],indicators:{quote:[{close:[price]}],adjclose:[{adjclose:[price-1]}]}}]}}));
}
async function isolated(run){
  const fetcher=globalThis.fetch,clock=Date.now;
  const keys=['FINNHUB_API_KEY','ALPHA_VANTAGE_API_KEY'];const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  keys.forEach(k=>{process.env[k]='fake-flight-key';});Date.now=()=>NOW;
  try{await run();}finally{globalThis.fetch=fetcher;Date.now=clock;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
}

test('concurrent normalized history keys share one request and retain source quality',()=>isolated(async()=>{
  const pending=gate();let calls=0;
  globalThis.fetch=async url=>{calls++;await pending.promise;return yahoo(url);};
  const results=Promise.all([history('FICTFLIGHT','1y'),history(' fictflight ','1y'),history('FICTFLIGHT','1y')]);
  await tick();try{assert.equal(calls,1);}finally{pending.open();}
  const rows=await results;
  assert(rows.every(row=>row.provider==='yahoo'&&row.stale===false&&row.currency==='USD'));
  assert(rows.every(row=>row.historyQuality.discardedPointCount===0));
  assert.equal(requireAdjustedHistory(rows[0]).points[0].price,99);
  assert.equal((await history('FICTFLIGHT','1y')).cached,true);assert.equal(calls,1);
}));
test('concurrent quote keys share an actual provider result without inventing timing or identity',()=>isolated(async()=>{
  const pending=gate();let calls=0;
  globalThis.fetch=async url=>{calls++;await pending.promise;return yahoo(url,120);};
  const results=Promise.all([quote('FICTQUOTE'),quote(' fictquote '),quote('FICTQUOTE')]);
  await tick();try{assert.equal(calls,1);}finally{pending.open();}
  const rows=await results;
  for(const row of rows){assert.equal(row.price,120);assert.equal(row.returnedSymbol,'FICTQUOTE');assert.equal(row.marketTime,new Date(NOW).toISOString());assert.equal(row.stale,false);}
}));
test('symbols ranges and quote/history kinds cannot reuse each other pending data',()=>isolated(async()=>{
  const pending=gate();let calls=0;
  globalThis.fetch=async url=>{calls++;await pending.promise;return yahoo(url);};
  const results=Promise.all([quote('FICTSCOPE'),history('FICTSCOPE','1y'),history('FICTSCOPE','max'),history('FICTOTHER','1y')]);
  await tick();try{assert.equal(calls,4);}finally{pending.open();}
  const [q,...histories]=await results;assert.equal(q.returnedSymbol,'FICTSCOPE');assert(histories.every(row=>row.points.length===1));
}));
test('a cached quote read cannot swallow explicit refresh and concurrent refreshes share one load',()=>isolated(async()=>{
  let calls=0;globalThis.fetch=async url=>{calls++;return yahoo(url,100);};
  await quote('FICTREFRESH');assert.equal(calls,1);
  const pending=gate();globalThis.fetch=async url=>{calls++;await pending.promise;return yahoo(url,105);};
  const cached=quote('FICTREFRESH');
  const refreshed=Promise.all([quote('FICTREFRESH',{forceRefresh:true}),quote('FICTREFRESH',{forceRefresh:true})]);
  await tick();try{assert.equal(calls,2);const old=await cached;assert.equal(old.cached,true);assert.equal(old.price,100);}finally{pending.open();}
  assert((await refreshed).every(row=>row.price===105));
}));
test('one failed provider chain rejects all waiters and clears the flight for later recovery',()=>isolated(async()=>{
  const pending=gate();let calls=0;
  globalThis.fetch=async()=>{calls++;await pending.promise;return new Response('private-provider-body',{status:429});};
  const results=Promise.allSettled(Array.from({length:5},()=>history('FICTRECOVER','1y')));
  await tick();try{assert.equal(calls,1);}finally{pending.open();}
  const rows=await results;assert.equal(calls,3);
  assert(rows.every(row=>row.status==='rejected'&&row.reason.providers.length===3));
  assert(!JSON.stringify(rows.map(row=>row.reason.providers)).includes('private-provider-body'));
  globalThis.fetch=async url=>{calls++;return yahoo(url);};
  assert.equal((await history('FICTRECOVER','1y')).provider,'yahoo');assert.equal(calls,4);
}));
test('concurrent expired-cache loads share one failed chain and preserve stale quality metadata',()=>isolated(async()=>{
  let calls=0;globalThis.fetch=async url=>{calls++;return yahoo(url);};
  const original=await history('FICTSTALEFLIGHT','1y');Date.now=()=>NOW+300001;
  const pending=gate();globalThis.fetch=async()=>{calls++;await pending.promise;return new Response('',{status:503});};
  const results=Promise.all([history('FICTSTALEFLIGHT','1y'),history('FICTSTALEFLIGHT','1y')]);
  await tick();try{assert.equal(calls,2);}finally{pending.open();}
  const rows=await results;assert.equal(calls,4);
  for(const row of rows){assert.equal(row.stale,true);assert.equal(row.cacheAgeMs,300001);assert.deepEqual(row.historyQuality,original.historyQuality);assert.throws(()=>requireAdjustedHistory(row),/stale/);}
}));
