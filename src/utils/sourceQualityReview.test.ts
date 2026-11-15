import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {captureSourceQualitySnapshot,normalizeSourceQualityResult,sourceQualityRequest} from './sourceQualityReview';
import {fetchLiveQuote} from '../utils';
import {providerObservationInstant} from './quoteSourceMetadata';

const fixtures=JSON.parse(readFileSync(new URL('../../aitracker-upload/data/research/source-quality-ui-cases.json',import.meta.url),'utf8'));
const now=Date.parse('2026-11-09T14:32:00Z');
const capture=(q:unknown)=>captureSourceQualitySnapshot(['NVDA'],{NVDA:q},'fictional-snapshot',now);
const quote=()=>({symbol:'NVDA',returnedSymbol:'NVDA',price:100,changePct:0,provider:'yahoo',sourceMode:'live',currency:'USD',marketTime:'2026-11-09T14:31:00Z',retrievedAt:'2026-11-09T14:31:10Z',adjustedBasis:'raw',isMarketSessionOpen:true});

test('frozen adapter minimizes metadata, preserves zero, and never borrows requested identity or retrieval time',()=>{
  const raw={...quote(),apiKey:'fictional-private-input',quantity:1000,notes:'private',thesis:'private'};
  const snapshot=capture(raw);raw.price=200;
  const packet=sourceQualityRequest(snapshot,'NVDA',now,1);
  assert.equal(packet.observations[0].price,100);assert.equal(packet.observations[0].change_pct,0);
  assert.ok(!JSON.stringify(packet).includes('private'));assert.equal(packet.observations[0].returned_symbol,'NVDA');
  const sparse=capture({symbol:'NVDA',price:100,asOf:quote().marketTime,retrievedAt:quote().retrievedAt,provider:'Yahoo Finance'}).entries[0].observations[0];
  assert.equal(sparse.returned_symbol,null);assert.equal(sparse.market_time,null);assert.equal(sparse.change_pct,null);
  assert.equal(sparse.source_mode,'unknown');assert.equal(sparse.adjusted_basis,'unknown');assert.equal(sparse.currency,null);
});

test('date-only, currency case, simulation and stale hints stay explicit',()=>{
  const date=capture({price:100,provider:'alpha-vantage',sourceMode:'live',marketDate:'2026-11-09',marketTimePrecision:'date-only',currency:'GBp'}).entries[0].observations[0];
  assert.equal(date.market_time,null);assert.equal(date.time_precision,'date-only');assert.equal(date.currency,'GBp');
  assert.equal(capture({...quote(),provider:'qa',sourceMode:'live'}).entries[0].observations[0].source_mode,'simulated');
  assert.equal(capture({...quote(),status:'stale',stale:false}).entries[0].observations[0].stale,true);
  assert.equal(capture(undefined).entries[0].observations.length,0);
});

for(const fields of [{price:'100'},{changePct:false},{marketTime:'2026-02-31T14:31:00Z'},{marketTime:'2026-11-09T14:31:00'},{marketTimePrecision:'date-only'},{stale:'false'},{symbol:'AMD'},{returnedSymbol:'not a symbol'},{independentObservations:[{}, {}, {}]},{status:'conflicting'},{status:'invalid'}])test('malformed input is withheld rather than upgraded: '+JSON.stringify(fields),()=>{
  const snapshot=capture({...quote(),...fields});assert.ok(snapshot.entries[0].issue);assert.throws(()=>sourceQualityRequest(snapshot,'NVDA',now,1));
});

test('loaded distinct observations are bounded and use only generated public evidence IDs',()=>{
  const snapshot=capture({...quote(),independentObservations:[{...quote(),provider:'finnhub',id:'private-record-id'}]});
  const req=sourceQualityRequest(snapshot,'NVDA',now,1);
  assert.deepEqual(req.observations.map(q=>q.evidence_id),['loaded:NVDA:0','loaded:NVDA:1']);
  assert.equal(req.observations.length,2);assert.ok(!JSON.stringify(req).includes('private-record'));
});

for(const f of fixtures)test('client accepts actual Python contract: '+f.kind,()=>assert.deepEqual(normalizeSourceQualityResult(f.result,f.request),f.result));

test('client rejects wrong scope, authority, policy and leaked result fields',()=>{
  const f=fixtures[0];
  for(const patch of [{run_id:'wrong'},{assessed_at:'2026-11-09T14:33:00Z'},{expected_symbols:['AMD']},{model_calls:1},{provider_requests:1},{jev_calls:1},{grants_decision_eligibility:true},{verifies_provider_identity:true},{token:'fictional-private-output'},{policy:{...f.result.policy,discrepancy_pct:50}},{provided_observation_count:0},{inspected_symbols:[]},{status:'partial'}])assert.throws(()=>normalizeSourceQualityResult({...f.result,...patch},f.request));
  const bad=structuredClone(f.result);bad.inspections[0].findings[0].code='BUY_NOW';assert.throws(()=>normalizeSourceQualityResult(bad,f.request));
  const other=structuredClone(f.result);other.inspections[0].findings[0].evidence_ids=['unknown'];assert.throws(()=>normalizeSourceQualityResult(other,f.request));
});

test('quote transport retains available provenance without inventing returned identity',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({...quote(),marketTimePrecision:'instant'})));
  const value=await fetchLiveQuote('NVDA','');
  assert.equal(value.returnedSymbol,'NVDA');assert.equal(value.sourceMode,'live');assert.equal(value.adjustedBasis,'raw');
});

test('direct provider timestamps cannot coerce booleans or strings into observations',()=>{
  for(const value of [null,undefined,0,-1,true,'123',Infinity,Number.MAX_VALUE])assert.equal(providerObservationInstant(value),null);
  assert.equal(providerObservationInstant(Date.parse('2026-11-09T14:31:00Z')/1000),'2026-11-09T14:31:00.000Z');
});
