import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { evaluateArchivedForecastWindow } from '../../server/utils/forecastArchiveAdapter.js';
import { forecastInstantMicros } from './forecastInputs.js';

const sha = (bytes:Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const encode = (value:unknown) => Buffer.from(JSON.stringify(value)+'\n');
function fixture():any {
  const root = new URL('../../scripts/fixtures/forecast-archive/', import.meta.url);
  return {request:{protocolVersion:'session-close-v1-experimental',symbol:'FICT',venue:'XNYS',currency:'USD',horizonSessions:5,decisionAt:'2026-07-02T20:10:00Z',assessedAt:'2026-07-13T20:05:00Z'},
    manifestBytes:readFileSync(new URL('manifest.json',root)), expectedManifestSha256:'1aca0089d6cf5c4f06deaee108e649e52ff7d96b06091d8105b14f18ae8f440e',
    artifacts:new Map(['calendar','features','outcomes'].map(role=>[role,readFileSync(new URL(role+'.json',root))]))};
}
function repinManifest(input:any, change:(manifest:any)=>void) {
  const manifest=JSON.parse(input.manifestBytes.toString('utf8'));change(manifest);
  input.manifestBytes=encode(manifest);input.expectedManifestSha256=sha(input.manifestBytes);
}
// Test-only repinning isolates semantic checks from checksum failures. The actual CLI
// always uses its separately committed fixed pin and cannot perform this operation.
function editArtifact(input:any, role:string, change:(archive:any)=>void) {
  const value=JSON.parse(input.artifacts.get(role).toString('utf8'));change(value);
  const bytes=encode(value);input.artifacts.set(role,bytes);
  repinManifest(input,m=>{m[role].sha256=sha(bytes);m[role].byteLength=bytes.length;});
}
function replaceArtifact(input:any,role:string,bytes:Buffer) {
  input.artifacts.set(role,bytes);repinManifest(input,m=>{m[role].sha256=sha(bytes);m[role].byteLength=bytes.length;});
}
function denied(input:any,code?:string) {
  const result=evaluateArchivedForecastWindow(input);assert.equal(result.status,'needs-data');
  if(code)assert.equal(result.code,code);
  assert.equal(result.sourceVerified,false);assert.equal(result.productionEligible,false);assert.equal(result.predictiveValidityEstablished,false);
  assert.equal(result.assessment?.outcome??null,null);return result;
}

test('actual pinned archive bytes derive the complete evaluator packet and reproducible outcome',()=>{
  const input=fixture(),manifestBefore=Buffer.from(input.manifestBytes),before=[...input.artifacts].map(([id,bytes]:any)=>[id,Buffer.from(bytes)]);
  const result=evaluateArchivedForecastWindow(input);assert.equal(result.status,'conditional-outcome');
  assert.equal(result.assessment.plan.entryDate,'2026-07-06');assert.equal(result.assessment.plan.targetDate,'2026-07-13');
  assert.equal(result.assessment.outcome.grossReturnPct,0);assert.equal(result.assessment.featureCount,2);assert.equal(result.assessment.outcomeCount,6);
  assert.deepEqual(result.receipt.bindings,{calendar:'matched',features:'matched',outcomes:'matched'});
  assert.equal(result.receipt.manifestPinMatched,true);assert.equal(result.receipt.allRequiredArtifactsMatched,true);assert.equal(result.receipt.inspectedArtifactCount,3);
  assert.equal(result.receipt.inspectedBytes,input.manifestBytes.length+[...input.artifacts.values()].reduce((n:number,b:any)=>n+b.length,0));
  assert(input.manifestBytes.equals(manifestBefore));for(const [id,bytes] of before)assert(input.artifacts.get(id).equals(bytes));
  assert.equal(result.sourceVerified,false);assert.equal(result.assessment.sourceVerified,false);assert.equal(result.productionEligible,false);
});
test('pending assessment never reads, hashes or decodes future outcome bytes',()=>{
  const input=fixture();input.request.assessedAt='2026-07-13T19:59:59.999999Z';input.artifacts.set('outcomes',{private:'must-not-be-read'});
  const result=evaluateArchivedForecastWindow(input);assert.equal(result.status,'pending');assert.equal(result.receipt.inspectedArtifactCount,2);
  assert.equal(result.receipt.bindings.outcomes,'not-required-yet');assert.equal(result.receipt.allRequiredArtifactsMatched,true);
  assert(!JSON.stringify(result).includes('must-not-be-read'));
  input.artifacts.delete('outcomes');assert.equal(evaluateArchivedForecastWindow(input).status,'pending');
});
test('microsecond maturity comparison cannot inspect outcomes one microsecond before target close',()=>{
  const input=fixture();editArtifact(input,'calendar',c=>{c.days.find((d:any)=>d.date==='2026-07-13').closeAt='2026-07-13T20:00:00.000002Z';});
  input.request.assessedAt='2026-07-14T01:30:00.000001+05:30';input.artifacts.delete('outcomes');
  const result=evaluateArchivedForecastWindow(input);assert.equal(result.status,'pending');assert.equal(result.receipt.inspectedArtifactCount,2);
});
test('a missing matured outcome archive is not an empty or zero-return history',()=>{
  const input=fixture();input.artifacts.delete('outcomes');denied(input,'ARTIFACT_BYTES_MISSING');
  repinManifest(input,m=>m.outcomes=null);denied(input,'OUTCOME_ARTIFACT_MISSING');
});
for(const pin of [undefined,null,true,'','0'.repeat(63),'A'.repeat(64)])test('missing/invalid out-of-band pin is rejected: '+String(pin),()=>{
  const input=fixture();input.expectedManifestSha256=pin;denied(input,'MANIFEST_PIN_REQUIRED');
});
test('changing a manifest and its internal artifact digests cannot change the separately selected pin',()=>{
  const input=fixture();const m=JSON.parse(input.manifestBytes.toString());m.features.sha256='0'.repeat(64);input.manifestBytes=encode(m);
  const r=denied(input,'MANIFEST_PIN_MISMATCH');assert.equal(r.receipt.inspectedArtifactCount,0);
});
for(const role of ['calendar','features','outcomes'])test('changed '+role+' bytes fail before projection or numerical output',()=>{
  const input=fixture();const bytes=Buffer.from(input.artifacts.get(role));bytes[bytes.length-2]^=1;input.artifacts.set(role,bytes);
  const result=denied(input,'ARTIFACT_PIN_MISMATCH');assert.equal(result.receipt.bindings[role],'not-checked');
});
for(const role of ['calendar','features','outcomes'])test('valid checksum is insufficient for '+role+' source/record/version binding',()=>{
  for(const field of ['sourceId','recordId',role==='calendar'?'revisionId':'vintageId']) {
    const input=fixture();editArtifact(input,role,a=>a[field]='wrong-but-well-formed');
    denied(input,role==='calendar'?'CALENDAR_CONTENT_BINDING_MISMATCH':'HISTORY_CONTENT_BINDING_MISMATCH');
  }
});
for(const [name,mutate,code] of [
  ['wrong instrument',(a:any)=>a.symbol='OTHER','HISTORY_METADATA_INVALID'],
  ['wrong currency',(a:any)=>a.currency='EUR','HISTORY_METADATA_INVALID'],
  ['wrong price basis',(a:any)=>a.priceBasis='raw_close','HISTORY_BASIS_UNSUPPORTED'],
  ['boolean close',(a:any)=>a.records[0].rawClose=true,'BAR_PRICE_INVALID'],
  ['missing session',(a:any)=>a.records.splice(1,1),'BAR_MISSING_SESSION'],
  ['duplicate record',(a:any)=>a.records.splice(1,0,{...a.records[0]}),'BAR_DUPLICATE'],
  ['wrong record date',(a:any)=>a.records[0].sessionDate='2026-02-30','BAR_METADATA_INVALID'],
  ['post-decision vintage',(a:any)=>a.publishedAt='2026-07-02T20:10:00.000002Z','HISTORY_UNAVAILABLE_AT_CUTOFF'],
  ['stale archive',(a:any)=>a.stale=true,'HISTORY_STALE_OR_UNKNOWN'],
] as const)test('pinned feature content still obeys preflight: '+name,()=>{
  const input=fixture();input.request.decisionAt='2026-07-02T20:10:00.000001Z';editArtifact(input,'features',mutate);denied(input,code);
});
test('calendar publication and days come from bytes, never from caller replacement claims',()=>{
  const input=fixture();editArtifact(input,'calendar',a=>a.publishedAt='2026-07-03T00:00:00Z');denied(input,'CALENDAR_UNAVAILABLE_AT_DECISION');
  const request=fixture();request.request.calendar={availableAt:'2020-01-01T00:00:00Z'};denied(request,'ARCHIVE_REQUEST_INVALID');
});
test('split-adjusted endpoint measurement is derived from the retained outcome records',()=>{
  const input=fixture();editArtifact(input,'outcomes',a=>a.records.forEach((p:any,i:number)=>{p.rawClose=i===0?100:27;p.adjustedClose=i===0?25:27;}));
  const result=evaluateArchivedForecastWindow(input);assert.equal(result.status,'conditional-outcome');assert(Math.abs(result.assessment.outcome.grossReturnPct-8)<1e-10);
});
test('missing target or first later bar cannot create a retained outcome',()=>{
  for(const later of [false,true]) {const input=fixture();editArtifact(input,'outcomes',a=>{
    if(later){a.records.at(-1).sessionDate='2026-07-14';a.records.at(-1).publishedAt='2026-07-14T20:01:00Z';a.publishedAt='2026-07-14T20:01:00Z';}
    else a.records.pop();
  });input.request.assessedAt='2026-07-15T21:00:00Z';denied(input,later?'BAR_OUTSIDE_REQUESTED_SESSIONS':'BAR_MISSING_SESSION');}
});
for(const [name,mutate,code] of [
  ['unsafe artifact path',(m:any)=>m.calendar.artifactId='../private-env','MANIFEST_METADATA_INVALID'],
  ['URL artifact locator',(m:any)=>m.calendar.artifactId='https://private.invalid/data','MANIFEST_METADATA_INVALID'],
  ['boolean byte length',(m:any)=>m.calendar.byteLength=true,'MANIFEST_METADATA_INVALID'],
  ['oversized declared bytes',(m:any)=>m.calendar.byteLength=2097153,'MANIFEST_METADATA_INVALID'],
  ['reused artifact ID',(m:any)=>m.features.artifactId=m.calendar.artifactId,'MANIFEST_ARTIFACT_ALIAS'],
  ['reused artifact digest',(m:any)=>m.features.sha256=m.calendar.sha256,'MANIFEST_ARTIFACT_ALIAS'],
  ['unknown manifest field',(m:any)=>m.apiKey='private-fixture-detail','MANIFEST_METADATA_INVALID'],
  ['unknown schema',(m:any)=>m.schemaVersion='unknown','MANIFEST_METADATA_INVALID'],
] as const)test('manifest rejects '+name,()=>{const input=fixture();repinManifest(input,mutate);const r=denied(input,code);assert(!JSON.stringify(r).includes('private-fixture-detail'));});
for(const role of ['calendar','features','outcomes'])test('unknown/private '+role+' archive fields are withheld without echo',()=>{
  const input=fixture();editArtifact(input,role,a=>a.privateNote='private-fixture-detail');const r=denied(input);assert(!JSON.stringify(r).includes('private-fixture-detail'));
});
test('unknown/private bar fields cannot enter the projection',()=>{
  const input=fixture();editArtifact(input,'features',a=>a.records[0].privateNote='private-fixture-detail');const r=denied(input,'HISTORY_CONTENT_BINDING_MISMATCH');assert(!JSON.stringify(r).includes('private-fixture-detail'));
});
for(const bytes of [Buffer.from('not-json'),Buffer.from('{}\n'),Buffer.from('{"x":1,"x":2}\n'),Buffer.from('{"x":1e400}\n'),Buffer.from('{ "x": 1 }\n'),Buffer.from([0xff,0x0a]),Buffer.from('\ufeff{}\n')])test('ambiguous or malformed retained encoding cannot pass pinned parsing: '+sha(bytes).slice(0,8),()=>{
  const input=fixture();replaceArtifact(input,'calendar',bytes);denied(input);
});
test('valid SHA of duplicate nested keys is still rejected before content projection',()=>{
  const input=fixture();const raw=input.artifacts.get('features').toString().replace('"rawClose":100','"rawClose":1,"rawClose":100');
  replaceArtifact(input,'features',Buffer.from(raw));denied(input,'ARCHIVE_ENCODING_UNSUPPORTED');
});
test('oversized manifest/artifact and shared mutable storage fail before decoding',()=>{
  const input=fixture();input.manifestBytes=Buffer.alloc(32769);denied(input,'ARCHIVE_BYTES_INVALID');
  const oversized=fixture();oversized.artifacts.set('calendar',Buffer.alloc(2097153));denied(oversized,'ARCHIVE_BYTES_INVALID');
  const shared=fixture();shared.artifacts.set('calendar',new Uint8Array(new SharedArrayBuffer(10)));denied(shared,'ARCHIVE_BYTES_INVALID');
});
test('artifact maps accept only selected opaque IDs and never invoke overridden retrieval callbacks',()=>{
  const input=fixture();input.artifacts.get=()=>{throw Error('private-fixture-detail');};assert.equal(evaluateArchivedForecastWindow(input).status,'conditional-outcome');
  input.artifacts.set('/private/env',Buffer.from('private-fixture-detail'));denied(input,'ARTIFACT_MAP_INVALID');
  const extra=fixture();extra.artifacts.delete('outcomes');extra.artifacts.set('not_selected',Buffer.from('private-fixture-detail'));denied(extra,'ARTIFACT_NOT_LISTED');
});
test('absent/malformed options and exceptional access are fixed missing-data results',()=>{
  for(const input of [undefined,null,[],{},fixture().request])denied(input,'ARCHIVE_INPUT_INVALID');
  const input=fixture();Object.defineProperty(input,'request',{get(){throw Error('private-fixture-detail');}});
  const r=denied(input,'ARCHIVE_INPUT_INVALID');assert(!JSON.stringify(r).includes('private-fixture-detail'));
});
test('caller flags and parallel price/time claims cannot grant verification',()=>{
  for(const field of ['sourceVerified','productionEligible','featureHistory','entryPrice']){
    const input=fixture();input.request[field]=true;denied(input,'ARCHIVE_REQUEST_INVALID');
  }
});
test('microsecond helper retains negative-epoch ordering and equivalent timezone instants',()=>{
  assert.equal(forecastInstantMicros('1969-12-31T23:59:59.999999Z'),-1n);
  assert.equal(forecastInstantMicros('2026-07-02T20:10:00.000001Z'),forecastInstantMicros('2026-07-03T01:40:00.000001+05:30'));
  assert.equal(forecastInstantMicros('2026-07-02T20:10:00.0000001Z'),null);
});
test('adapter has no ambient clock/network dependency; receipts do not share state',()=>{
  const input=fixture();Object.freeze(input.request);const now=Date.now,fetch=globalThis.fetch;
  Date.now=()=>{throw Error('Clock forbidden');};globalThis.fetch=()=>{throw Error('Network forbidden');};
  try {const r=evaluateArchivedForecastWindow(input);assert.equal(r.status,'conditional-outcome');r.receipt.bindings.calendar='mutated';assert.equal(evaluateArchivedForecastWindow(input).receipt.bindings.calendar,'matched');}
  finally {Date.now=now;globalThis.fetch=fetch;}
});
test('fixed Cloud archive demo composes real parsing/hashes/projection/evaluator without credentials',()=>{
  const raw=execFileSync(process.execPath,['scripts/forecast-archive-demo.mjs'],{env:{PATH:process.env.PATH},encoding:'utf8',timeout:5000});
  const result=JSON.parse(raw);assert.equal(result.fictional,true);assert.equal(result.cases.completeRetainedWindow.status,'conditional-outcome');
  assert.equal(result.cases.notMaturedWithoutOutcomeBytes.status,'pending');assert.equal(result.cases.tamperedArtifact.code,'ARTIFACT_PIN_MISMATCH');
  assert.equal(result.cases.unreviewedManifest.code,'MANIFEST_PIN_MISMATCH');assert(Object.values(result.cases).every((c:any)=>c.sourceVerified===false&&c.productionEligible===false));
  const denied=spawnSync(process.execPath,['scripts/forecast-archive-demo.mjs','--input','private-file'],{env:{PATH:process.env.PATH},encoding:'utf8',timeout:5000});
  assert.equal(denied.status,2);assert.equal(denied.stdout,'');assert(!denied.stderr.includes('private-file'));
});
