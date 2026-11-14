import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {councilAdmissionPayload,councilAdmissionEnvelope,councilV2Envelope,councilPublicationWindow,councilRequestDigest} from '../../shared/councilAdmission.js';
const fixture=()=>JSON.parse(readFileSync('qa/fixtures/council-admission.fictional.json','utf8'));
test('actual JS request and Python receipts agree on byte hash, conditional coverage and original unknowns',async()=>{
  const f=fixture();assert.equal(JSON.stringify(f.request),f.request_raw);assert.ok(councilAdmissionPayload(f.request));
  const digest=await councilRequestDigest(f.request);
  assert.equal(councilAdmissionEnvelope(f.admission,f.request,digest),true);
  assert.equal(councilV2Envelope(f.result,f.request,digest),true);
  assert.equal(f.admission.status,'conditional');assert.equal(f.admission.quality.usable_ids.length,7);
  assert.equal(f.request.packet.evidence[2].published_at,null);assert.equal(f.request.packet.evidence[2].basis,'unknown');
});
for(const mode of ['private','value','missing-source','wrong-symbol','cross-ratio','fatal','event-value'])test('v2 request rejects '+mode,()=>{
  const v=fixture().request;
  if(mode==='private')v.sources.sec.observations[0].inputs[0].notes='fictional-private';
  if(mode==='value')v.sources.sec.observations[0].inputs[0].value=999;
  if(mode==='missing-source')delete v.sources.catalyst;
  if(mode==='wrong-symbol')v.sources.sec.symbol='NVDA';
  if(mode==='cross-ratio'){
    v.sources.sec.observations[0].inputs[0].value=130;v.sources.sec.observations[0].evidence.value=30;v.packet.evidence[2].value=30;
  }
  if(mode==='fatal')v.sources.sec.issues.push('ISSUER_MISMATCH');
  if(mode==='event-value')v.packet.evidence.at(-1).value+=1;
  assert.equal(councilAdmissionPayload(v),null);
});
for(const mode of ['digest','window','authority','eligible','family','extra','quality','model-version'])test('v2 response rejects '+mode,async()=>{
  const f=fixture(),v=f.result,digest=await councilRequestDigest(f.request);
  if(mode==='digest')v.admission.request_sha256='0'.repeat(64);
  if(mode==='window')v.admission.records[2].publication_window.earliest='2026-02-20T00:00:00Z';
  if(mode==='authority')v.admission.source_authenticity_verified=true;
  if(mode==='eligible')v.admission.records[2].eligible=false;
  if(mode==='family')v.admission.quality.missing_families=['financial'];
  if(mode==='extra')v.admission.private='fictional-private';
  if(mode==='quality')v.quality.usable_ids=[];
  if(mode==='model-version')v.contract_version='portfolio-council-v1';
  assert.equal(councilV2Envelope(v,f.request,digest),false);
});
test('date-only envelopes preserve precision over leap/year boundaries and reject unsupported eras',()=>{
  assert.deepEqual(councilPublicationWindow('2024-02-29'),{earliest:'2024-02-28T10:00:00.000Z',latest_exclusive:'2024-03-01T12:00:00.000Z',precision:'date-only',offset_policy:'utc-minus12-plus14'});
  assert.equal(councilPublicationWindow('1999-12-31'),null);assert.equal(councilPublicationWindow('2026-02-30'),null);
});
test('changing mode or retained filing content changes the bound request digest',async()=>{
  const f=fixture(),before=await councilRequestDigest(f.request);
  assert.notEqual(await councilRequestDigest({...f.request,mode:'admission-v2'}),before);
  f.request.sources.sec.cik='0000000002';assert.notEqual(await councilRequestDigest(f.request),before);
});
for(const mode of ['summary','limitations','missing-presentation','unknown-presentation','wrong-implication','duplicate-citation','claim-order','uncited-preference','duplicate-winning'])test('controlled v2 response rejects '+mode,async()=>{
  const f=fixture(),v=f.result,digest=await councilRequestDigest(f.request);
  if(mode==='summary')v.roles.bull.summary='Cash flow is positive.';
  if(mode==='limitations')v.roles.bull.limitations=['Revenue grew ninety percent.'];
  if(mode==='missing-presentation')delete v.presentation_version;
  if(mode==='unknown-presentation')v.presentation_version='unreviewed';
  if(mode==='wrong-implication')v.roles.bull.claims[0].implication='cash-flow';
  if(mode==='duplicate-citation')v.roles.bull.claims.push({...v.roles.bull.claims[0],claim_id:'bull:1'});
  if(mode==='claim-order')v.roles.bull.claims[0].claim_id='bull:2';
  if(mode==='uncited-preference')v.roles.judge={summary:'The judge recorded a provisional bull preference. Future outcomes remain unknown.',preference:'bull',winning_claim_ids:[]};
  if(mode==='duplicate-winning')v.roles.judge.winning_claim_ids=['bull:0','bull:0'];
  assert.equal(councilV2Envelope(v,f.request,digest),false);
});
