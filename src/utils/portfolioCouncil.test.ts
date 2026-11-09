import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCouncilPacket,councilCoverageState,councilEnvelope,councilPayload} from './portfolioCouncil';
import {councilDevelopmentEnabled,councilJevEnvelope} from '../../shared/portfolioCouncilContract.js';
const fixture=JSON.parse(readFileSync('aitracker-upload/data/research/council-ui-case.json','utf8'));
test('actual Python fixture validates; fixture cannot gain decision authority or evidence eligibility',()=>{
  assert.equal(councilEnvelope(fixture.result,fixture.request),true);
  for(const patch of [{sends_messages:true},{disposition:'balanced'},{symbol:'NVDA'},{unexpected:'private'},{run_id:'different'}])assert.equal(councilEnvelope({...fixture.result,...patch},fixture.request),false);
  const fake=structuredClone(fixture.result);fake.roles.judge.winning_claim_ids=['bull:3'];assert.equal(councilEnvelope(fake,fixture.request),false);
});
test('DTO preserves zero and missing provenance and excludes portfolio/private source text',()=>{
  const stamp='2026-11-09T12:00:00Z';
  const quote={symbol:'MSFT',returnedSymbol:'MSFT',provider:'yahoo',sourceMode:'live',price:100,changePct:0,currency:'USD',marketTime:stamp,retrievedAt:stamp,quantity:100,notes:'fictional-private-note',apiKey:'fictional-private-key'};
  const financial={symbol:'MSFT',metrics:{revenueGrowth:{value:12,status:'verified',unit:'percent',source:'fictional-private-text',observedAt:stamp,periodEnd:'2026-03-31'}}};
  const packet=buildCouncilPacket('MSFT',quote,financial,'test',Date.parse(stamp),6);
  assert.equal(packet.evidence.length,3);assert.equal(packet.evidence[1].value,0);
  assert.equal(packet.evidence[0].published_at,null);assert.equal(packet.evidence[2].basis,'unknown');assert.equal(packet.evidence[2].period_start,null);
  assert.ok(!JSON.stringify(packet).includes('fictional-private'));
  assert.equal(buildCouncilPacket('MSFT',{...quote,returnedSymbol:'NVDA'},null,'test',Date.parse(stamp),3).evidence.length,0);
  assert.equal(buildCouncilPacket('MSFT',{...quote,price:NaN,changePct:undefined},null,'test',Date.parse(stamp),3).evidence.length,0);
  assert.equal(councilPayload({mode:'loaded',packet:{...packet,notes:'private'}}),null);
});
test('development cannot be enabled in Vercel/production; TypeSafe receives typed counts only',()=>{
  assert.equal(councilDevelopmentEnabled({COUNCIL_DEV_ENABLED:'true'}),true);
  for(const env of [{},{COUNCIL_DEV_ENABLED:'true',VERCEL:'1'},{COUNCIL_DEV_ENABLED:'true',NODE_ENV:'production'},{COUNCIL_DEV_ENABLED:'true',VERCEL_ENV:'production'}])assert.equal(councilDevelopmentEnabled(env),false);
  assert.equal(councilPayload({mode:'jev',run_id:'test',state:councilCoverageState(fixture.result)}),null);
  const state=councilCoverageState({...fixture.result,mode:'nvidia'});
  const payload={mode:'jev',run_id:'test',state};assert.equal(councilPayload(payload),payload);
  assert.equal(councilPayload({...payload,state:{...state,narrative:'private'}}),null);
  assert.equal(councilJevEnvelope({contract_version:'council-jev-v1',run_id:'test',available:false,coverage:null,next_check:null,input_tokens:null,error_code:'not-enabled',grants_decision_eligibility:false},payload),true);
});
