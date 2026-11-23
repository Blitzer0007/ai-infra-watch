import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {councilRequestDigest} from '../../shared/councilAdmission.js';
import {researchRoleReview,researchRoleReviewEnvelope,RESEARCH_REVIEW_CODES} from './researchRoleReview';

const inputs=JSON.parse(readFileSync('aitracker-upload/data/research/council-benchmark.fictional.json','utf8'));
const fixtures=JSON.parse(readFileSync('aitracker-upload/data/research/research-role-review.fictional.json','utf8'));
const getCase=(id:string)=>inputs.cases.find((row:any)=>row.case_id===id);

test('all Python baseline role packets match the browser contract and exact frozen request',async()=>{
  for(const fixture of fixtures.cases){
    const payload=getCase(fixture.case_id).request;
    const before=JSON.stringify(payload),digest=await councilRequestDigest(payload);
    assert.deepEqual(researchRoleReview(payload,fixture.admission,digest),fixture.review);
    assert.equal(researchRoleReviewEnvelope(fixture.review,payload,fixture.admission,digest),true);
    assert.equal(JSON.stringify(payload),before);
    for(const role of Object.values(fixture.review.roles) as any[]){
      assert(role.review_codes.every((code:string)=>Object.hasOwn(RESEARCH_REVIEW_CODES,code)));
      assert(role.review_codes.length<=7);
    }
    assert.deepEqual(fixture.review.policy,{read_only:true,max_evidence:8,max_review_codes:7,model_calls:0,provider_requests:0,tool_calls:0});
    for(const key of ['source_authenticity_verified','forecast_validity_established','grants_decision_eligibility','changes_allocation','sends_messages'])assert.equal(fixture.review[key],false);
  }
});

test('unsupported fields, prose, references and authority cannot be introduced in role results',async()=>{
  const fixture=fixtures.cases[0],payload=getCase(fixture.case_id).request,digest=await councilRequestDigest(payload);
  const mutations=[(v:any)=>v.roles.company.evidence_ids.push('outside'),
    (v:any)=>v.roles.company.review_codes.push('Invented winner'),(v:any)=>v.roles.daily.status='ready',
    (v:any)=>v.roles.company.summary='Cash flow is positive.',(v:any)=>v.provider_key='fictional-private-key',
    (v:any)=>v.grants_decision_eligibility=true,(v:any)=>v.policy.provider_requests=1,
    (v:any)=>v.symbol='OTHER',(v:any)=>v.request_sha256='0'.repeat(64)];
  for(const mutate of mutations){const value=structuredClone(fixture.review);mutate(value);assert.equal(researchRoleReviewEnvelope(value,payload,fixture.admission,digest),false);}
});

test('foreign digest or malformed admission cannot produce an apparently usable role review',async()=>{
  const fixture=fixtures.cases[0],payload=getCase(fixture.case_id).request,digest=await councilRequestDigest(payload);
  assert.equal(researchRoleReview(payload,fixture.admission,'0'.repeat(64)),null);
  assert.equal(researchRoleReview(payload,{...fixture.admission,source_authenticity_verified:true},digest),null);
  assert.equal(researchRoleReview(payload,{...fixture.admission,private:'fictional'},digest),null);
  assert.equal(researchRoleReview(null,fixture.admission,digest),null);
  const changed=structuredClone(payload);changed.packet.run_id='different';
  assert.equal(researchRoleReview(changed,fixture.admission,await councilRequestDigest(changed)),null);
});

test('uncertain filings and unconfirmed catalysts have no citations; zero cash flow is retained',()=>{
  const filing=fixtures.cases.find((row:any)=>row.case_id==='same-day-filing-uncertainty').review;
  assert.deepEqual(filing.roles.company.evidence_ids,[]);
  assert(filing.roles.daily.review_codes.includes('FILL_FINANCIAL_COVERAGE'));
  const catalyst=fixtures.cases.find((row:any)=>row.case_id==='unconfirmed-catalyst').review;
  assert.deepEqual(catalyst.roles.catalyst.evidence_ids,[]);
  assert(catalyst.roles.catalyst.review_codes.includes('EVENT_CONFIRMATION_REQUIRED'));
  const zero=fixtures.cases.find((row:any)=>row.case_id==='zero-cash-flow').review;
  assert(zero.roles.company.evidence_ids.includes('sec:free_cash_flow_usd'));
  assert(zero.roles.company.review_codes.includes('REVIEW_ZERO_CASH_FLOW'));
});
