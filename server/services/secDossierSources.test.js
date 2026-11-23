import test from 'node:test';
import assert from 'node:assert/strict';
import {createSecDossierLoader} from './secDossierSources.js';
import {fictionalSecDossier} from '../../qa/fixtures/sec-dossier.fictional.mjs';
const contact='Fictional offline test fixture@example.invalid';
const epoch=Date.parse('2026-11-14T12:00:00Z');
function fixtureFetch(packet,calls=[]){return async (url,options)=>{
  calls.push({url,options});const u=new URL(url);assert(['www.sec.gov','data.sec.gov'].includes(u.hostname));
  const value=url.includes('company_tickers')?Object.fromEntries(packet.directory.map((row,i)=>[i,row])):url.includes('/submissions/')?packet.submissions:packet.facts;
  return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
};}
test('manual acquisition uses three allowlisted GETs and cache preserves original retrieval times',async()=>{
  let clock=epoch;const calls=[],load=createSecDossierLoader({fetchImpl:fixtureFetch(fictionalSecDossier(),calls),now:()=>clock});
  const first=await load('DEMO',contact);assert(first.ok);assert.equal(first.cacheStatus,'miss');assert.equal(calls.length,3);assert(calls.every(c=>c.options.redirect==='error'&&!c.options.method));
  first.packet.submissions.name='changed outside cache';
  clock+=1000;const second=await load('DEMO',contact);assert.equal(second.cacheStatus,'hit');assert.equal(second.packet.retrievedAt,first.packet.retrievedAt);assert.equal(calls.length,3);
  assert.equal(second.packet.submissions.name,'Fictional Components Ltd');
  clock+=3600000;const third=await load('DEMO',contact);assert.equal(third.cacheStatus,'miss');assert.equal(calls.length,6);assert.notEqual(third.packet.retrievedAt,first.packet.retrievedAt);
});
test('invalid symbols and absent contact fail before any transport',async()=>{
  let calls=0;const load=createSecDossierLoader({fetchImpl:async()=>{calls++;throw Error('forbidden');}});
  for(const symbol of ['https://example.invalid','DEMO,OTHER','../DEMO',[],undefined])assert.equal((await load(symbol,contact)).code,'INVALID_SYMBOL');
  for(const value of ['', 'missing-contact',contact+'\r\nInjected: yes'])assert.equal((await load('DEMO',value)).code,'CONTACT_NOT_CONFIGURED');
  assert.equal(calls,0);
});
test('mismatched submissions stop before companyfacts and upstream errors never leak',async()=>{
  const p=fictionalSecDossier();p.submissions.tickers=['OTHER'];const calls=[];
  assert.equal((await createSecDossierLoader({fetchImpl:fixtureFetch(p,calls),now:()=>epoch})('DEMO',contact)).code,'ISSUER_MISMATCH');assert.equal(calls.length,2);
  const load=createSecDossierLoader({fetchImpl:async()=>{throw Error('private-upstream-detail');},now:()=>epoch});
  const result=await load('DEMO',contact);assert.deepEqual(result,{ok:false,code:'SOURCE_UNAVAILABLE'});
});
test('bounded streams and rate limits fail without partial packets or automatic retry',async()=>{
  for(const response of [()=>new Response('x'.repeat(16000001),{headers:{'Content-Type':'application/json'}}),()=>new Response('{}',{status:429,headers:{'Content-Type':'application/json'}}),()=>new Response('redirect',{status:302})]){
    let calls=0;const load=createSecDossierLoader({fetchImpl:async()=>{calls++;return response();},now:()=>epoch});const r=await load('DEMO',contact);assert.equal(r.ok,false);assert.equal(calls,1);assert(!Object.hasOwn(r,'packet'));
  }
  let calls=0;const load=createSecDossierLoader({fetchImpl:async()=>{calls++;throw Error('offline');},now:()=>epoch});
  for(let i=0;i<6;i++)await load('DEMO',contact);assert.equal((await load('DEMO',contact)).code,'RATE_LIMITED');assert.equal(calls,6);
});
test('same-symbol overlap is deduplicated and another symbol is bounded by process concurrency',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;}),calls=[];
  const fetchImpl=fixtureFetch(fictionalSecDossier(),calls);
  const load=createSecDossierLoader({fetchImpl:async(...args)=>{await gate;return fetchImpl(...args);},now:()=>epoch});
  const first=load('DEMO',contact),same=load('DEMO',contact);assert.deepEqual(await load('OTHER',contact),{ok:false,code:'BUSY'});
  release();assert.deepEqual(await first,await same);assert.equal(calls.length,3);
});
