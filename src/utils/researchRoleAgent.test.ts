import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {councilRequestDigest} from '../../shared/councilAdmission.js';
import {researchRoleResponseEnvelope} from './researchRoleAgent';
const inputs=JSON.parse(readFileSync('aitracker-upload/data/research/council-benchmark.fictional.json','utf8'));
const fixtures=JSON.parse(readFileSync('aitracker-upload/data/research/research-role-response.fictional.json','utf8'));
const payload=(id:string)=>({...structuredClone(inputs.cases.find((r:any)=>r.case_id===id).request),mode:'research-v2'});

test('all eight actual Python responses bind source admission, trace and selected citations',async()=>{
  for(const row of fixtures.cases){const p=payload(row.case_id);assert.equal(researchRoleResponseEnvelope(row.response,p,await councilRequestDigest(p)),true);}
});
test('partial failed and unconfigured workflows remain explicit incomplete states',async()=>{
  for(const row of fixtures.failures){const p=payload(row.case_id);assert.equal(row.response.result.status,row.kind);assert.equal(researchRoleResponseEnvelope(row.response,p,await councilRequestDigest(p)),true);
    const forged=structuredClone(row.response);forged.result.status='complete';forged.result.termination_reason='completed';assert.equal(researchRoleResponseEnvelope(forged,p,await councilRequestDigest(p)),false);}
});
test('forged prose scope action authority counters and trace cannot cross the wire',async()=>{
  const example=fixtures.cases[0],p=payload(example.case_id),digest=await councilRequestDigest(p);
  const mutations=[(v:any)=>v.result.grants_decision_eligibility=true,(v:any)=>v.result.sends_messages=true,
    (v:any)=>v.result.roles.company.summary='Guaranteed winner',(v:any)=>v.result.scope='portfolio',
    (v:any)=>v.result.symbol='OTHER',(v:any)=>v.result.request_sha256='0'.repeat(64),
    (v:any)=>v.result.roles.company.review_codes=['BUY_NOW'],(v:any)=>v.result.roles.company.evidence_ids=['loaded:price'],
    (v:any)=>v.result.trace[0].evidence_ids=['sec:revenue_growth_pct'],
    (v:any)=>v.result.trace[0].action='web',(v:any)=>v.result.trace[0].evidence_ids.push('outside'),
    (v:any)=>v.result.trace[0].families=['risk'],(v:any)=>v.result.trace[1].evidence_ids=['sec:free_cash_flow_usd'],
    (v:any)=>v.result.usage.tool_calls=0,(v:any)=>v.result.usage.model_calls=7,
    (v:any)=>v.result.usage.prompt_chars=0,(v:any)=>v.result.usage.provider_requests=1,
    (v:any)=>v.result.policy.max_model_calls=10,(v:any)=>v.result.selection_is_exhaustive=true,
    (v:any)=>v.admission.source_authenticity_verified=true,(v:any)=>v.private_key='fictional-private-key'];
  for(const mutate of mutations){const v=structuredClone(example.response);mutate(v);assert.equal(researchRoleResponseEnvelope(v,p,digest),false);}
});
test('numeric questions need a matching metric and production model labels need actual attempts',async()=>{
  const example=fixtures.cases[0],p=payload(example.case_id),digest=await councilRequestDigest(p),v=structuredClone(example.response);
  v.result.roles.company.review_codes=['REVIEW_NEGATIVE_CASH_FLOW'];v.result.roles.company.evidence_ids=['sec:revenue_growth_pct'];
  assert.equal(researchRoleResponseEnvelope(v,p,digest),false);
  const live=structuredClone(example.response);live.result.mode='multi-model';
  assert.equal(researchRoleResponseEnvelope(live,p,digest),false);
  live.result.usage.provider_requests=6;assert.equal(researchRoleResponseEnvelope(live,p,digest),true);
});
