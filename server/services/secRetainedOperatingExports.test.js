import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {reviewRetainedSecExports,reviewRetainedSecOperatingExports} from './secRetainedExports.js';
const root=new URL('../../scripts/fixtures/sec-operating.fictional/',import.meta.url);
const hash=b=>createHash('sha256').update(b).digest('hex'),encode=v=>Buffer.from(JSON.stringify(v)+'\n');
const input=()=>({request:{symbol:'FICT',expectedCik:'0000000001',expectedExchange:'Nasdaq',assessedAt:'2026-11-14T12:00:00Z',periods:[{start:'2025-01-01',end:'2025-12-31'},{start:'2024-01-01',end:'2024-12-31'}]},manifestBytes:readFileSync(new URL('manifest.json',root)),expectedManifestSha256:'00cd03b5dc35becea1629cea47b4ff798e879b66db7a84198f74c13046865f5d',artifacts:new Map([['listings',readFileSync(new URL('../sec-exports.fictional/listings.json',root))],['companyfacts',readFileSync(new URL('companyfacts.json',root))]])});
function manifest(i,fn){const m=JSON.parse(i.manifestBytes);fn(m);i.manifestBytes=encode(m);i.expectedManifestSha256=hash(i.manifestBytes);}
function body(i,fn){const facts=JSON.parse(i.artifacts.get('companyfacts'));fn(facts);const b=encode(facts);i.artifacts.set('companyfacts',b);manifest(i,m=>{m.sources.companyfacts.sha256=hash(b);m.sources.companyfacts.byteLength=b.length;});}
function denied(i,code){const r=reviewRetainedSecOperatingExports(i);assert.equal(r.status,'needs-data');assert.deepEqual(r.snapshots,[]);if(code)assert.equal(r.code,code);assert.equal(r.sourceAuthenticityVerified,false);assert.equal(r.issuerMappingVerified,false);assert.equal(r.grantsValuationEligibility,false);assert.equal(r.aggregationEligibility,false);return r;}
describe('retained annual operating exports',()=>{
  it('runs pinned native bytes through listing identity, annual projection and independent admission',()=>{
    const r=reviewRetainedSecOperatingExports(input());assert.equal(r.contractVersion,'sec-retained-operating-review-v1');assert.equal(r.status,'conditional');assert.equal(r.code,'RETAINED_OPERATING_DECLARATIONS_BOUND');assert.equal(r.snapshots.length,2);assert.equal(r.snapshots.flatMap(s=>s.observations).length,14);assert(r.snapshots.every(s=>s.contractVersion==='sec-operating-observations-v1'&&s.status==='partial'&&s.aggregationEligibility===false));assert.equal(r.snapshots[0].observations.find(o=>o.metric==='net_income_loss').value,-8);assert.equal(r.bindings.companyfacts.bytesMatched,true);assert.equal(r.bindings.manifestSha256,input().expectedManifestSha256);assert.equal(r.simulationStatus,'fictional');assert.equal(r.sourceAuthenticityVerified,false);assert.equal(r.historicalAvailabilityVerified,false);assert.equal(r.grantsDecisionEligibility,false);assert.equal(r.grantsValuationEligibility,false);assert.deepEqual(r.usage,{providerCalls:0,modelCalls:0,databaseCalls:0});
  });
  it('does not silently activate the new profile in the existing core export reader',()=>{
    const r=reviewRetainedSecExports(input());assert.equal(r.contractVersion,'sec-retained-export-review-v1');assert.equal(r.status,'needs-data');assert.equal(r.code,'NO_SUPPORTED_STATEMENTS');assert.deepEqual(r.snapshots,[]);
  });
  it('rejects instant, duplicate, quarterly/YTD and excessive period requests',()=>{
    for(const periods of [[{start:null,end:'2025-12-31'}],[{start:'2025-10-01',end:'2025-12-31'}],Array(2).fill(input().request.periods[0]),Array(4).fill(input().request.periods[0])]){const i=input();i.request.periods=periods;denied(i,'EXPORT_REQUEST_INVALID');}
  });
  it('withholds all operating facts for unpinned, missing or changed source bytes',()=>{
    const i=input();i.expectedManifestSha256='0'.repeat(64);denied(i,'MANIFEST_PIN_MISMATCH');const j=input();j.artifacts.delete('companyfacts');denied(j,'EXPORT_BYTES_INVALID');const k=input();k.artifacts.set('companyfacts',Buffer.from('{}'));denied(k,'EXPORT_PIN_MISMATCH');
  });
  for(const status of ['not-configured','rate-limited','timeout','transport-error','no-data','unavailable'])it(`keeps companyfacts ${status} distinct and has no fallback snapshot`,()=>{
    const i=input();manifest(i,m=>m.sources.companyfacts={status});i.artifacts.delete('companyfacts');const r=denied(i,'COMPANYFACTS_'+status.toUpperCase().replaceAll('-','_'));assert.equal(r.bindings.companyfacts.inspectedBytes,0);assert.equal(r.sourceStatus.companyfacts,status);
  });
  it('stops before operating bytes are inspected when the listing source is unavailable',()=>{
    const i=input();manifest(i,m=>m.sources.listings={status:'rate-limited'});i.artifacts.delete('listings');i.artifacts.set('companyfacts',Buffer.from('private-uninspected-body'));const r=denied(i,'LISTINGS_RATE_LIMITED');assert.equal(r.bindings.companyfacts.inspectedBytes,0);assert(!JSON.stringify(r).includes('private-uninspected-body'));
  });
  it('reuses strict identity, declared URL, chronology and native JSON validation',()=>{
    const i=input();body(i,f=>f.cik=2);denied(i,'COMPANYFACTS_IDENTITY_MISMATCH');const j=input();manifest(j,m=>m.sources.companyfacts.finalUrl='https://example.com/?private');assert(!JSON.stringify(denied(j,'EXPORT_METADATA_INVALID')).includes('example.com'));
    const k=input();manifest(k,m=>m.sources.companyfacts.retrievedAt='2026-11-14T12:00:00.000001Z');denied(k,'EXPORT_METADATA_INVALID');
    const n=input();const b=Buffer.from(n.artifacts.get('companyfacts').toString().replace('"cik": 1','"cik": 1, "cik": 2'));n.artifacts.set('companyfacts',b);manifest(n,m=>{m.sources.companyfacts.sha256=hash(b);m.sources.companyfacts.byteLength=b.length;});denied(n,'EXPORT_JSON_INVALID');
  });
  it('retains partial negative-income coverage without inferring revenue, EBITDA or financial health',()=>{
    const i=input();body(i,f=>f.facts={'us-gaap':{NetIncomeLoss:f.facts['us-gaap'].NetIncomeLoss}});const r=reviewRetainedSecOperatingExports(i);assert.equal(r.status,'conditional');assert.equal(r.snapshots[0].observations.length,1);assert.equal(r.snapshots[0].observations[0].value,-8);assert.equal(r.snapshots[0].missingMetrics.length,8);assert(r.snapshots.every(s=>s.unsupportedDerivedMetrics.includes('ebitda')&&!s.grantsValuationEligibility));
  });
  it('checks shared-accession filing metadata across all requested annual periods',()=>{
    const i=input();body(i,f=>{for(const c of Object.values(f.facts['us-gaap']))for(const row of c.units.USD)if(row.end==='2024-12-31')row.fy=2024;});denied(i,'FILING_METADATA_CONFLICT');
  });
  it('does not accept unclosed filing windows or an unsupported recognized-unit array',()=>{
    const i=input();manifest(i,m=>m.sources.companyfacts.retrievedAt='2026-02-20T00:00:00Z');denied(i,'NO_SUPPORTED_STATEMENTS');const j=input();body(j,f=>f.facts['us-gaap'].NetIncomeLoss.units.EUR=Array(501).fill(f.facts['us-gaap'].NetIncomeLoss.units.USD[0]));denied(j,'STATEMENT_INPUTS_INVALID');
  });
  it('keeps all old fixed-pin core demo observations unchanged',()=>{
    const env={PATH:process.env.PATH};const r=JSON.parse(execFileSync(process.execPath,['scripts/sec-retained-exports-demo.mjs'],{env,encoding:'utf8'}));assert.equal(r.result.snapshots.flatMap(s=>s.observations).length,10);assert.equal(r.result.contractVersion,'sec-retained-export-review-v1');
  });
  it('actual operating demo uses a fixed fictional pin, permits no paths and derives fourteen declarations',()=>{
    const env={PATH:process.env.PATH};const r=JSON.parse(execFileSync(process.execPath,['scripts/sec-operating-exports-demo.mjs'],{env,encoding:'utf8'}));assert.equal(r.fictional,true);assert.equal(r.result.status,'conditional');assert.equal(r.result.snapshots.flatMap(s=>s.observations).length,14);assert(!JSON.stringify(r).includes('"units"'));assert.equal(spawnSync(process.execPath,['scripts/sec-operating-exports-demo.mjs','/tmp/external'],{env}).status,2);
  });
});
