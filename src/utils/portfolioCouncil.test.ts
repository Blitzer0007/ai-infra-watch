import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCouncilPacket,councilCoverageState,councilEnvelope,councilPayload,inspectCouncilSources,councilCatalyst} from './portfolioCouncil';
import {captureEarningsCalendar} from './catalystCalendar';
import {adaptSecCouncilFacts} from '../../server/utils/councilSecAdapter.js';
import {councilDevelopmentEnabled,councilJevEnvelope} from '../../shared/portfolioCouncilContract.js';
const fixture=JSON.parse(readFileSync('aitracker-upload/data/research/council-ui-case.json','utf8'));
const secFacts=()=>JSON.parse(readFileSync('qa/fixtures/council-sec.fictional.json','utf8'));
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
  assert.equal(packet.evidence[0].published_at,null);assert.equal(packet.evidence[2].basis,'unknown');assert.equal(packet.evidence[2].period_start,null);assert.equal(packet.evidence[2].observed_at,null);
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
test('SEC receipt evidence is frozen and minimized; legacy metadata cannot override its missing times',()=>{
  const receipt=adaptSecCouncilFacts({symbol:'MSFT',expectedCik:'1',facts:secFacts(),retrievedAt:'2026-11-09T12:00:00Z'});
  const source={symbol:'MSFT',metrics:{},councilSource:receipt,notes:'fictional-private'};
  const result=inspectCouncilSources('MSFT',null,source,'test',Date.parse('2026-11-09T12:01:00Z'),3);
  assert.equal(result.packet.evidence.length,4);assert.equal(result.sec.observations[0].inputs[0].accession,'0000000001-26-000001');
  assert.ok(!JSON.stringify(result.packet).includes('accession'));assert.ok(!JSON.stringify(result).includes('fictional-private'));
  receipt.observations[0].evidence.value=999;assert.equal(result.packet.evidence[0].value,20);assert.equal(result.sec.observations[0].evidence.value,20);
  const invalid=inspectCouncilSources('MSFT',null,source,'bad',Date.parse('2026-11-09T12:01:00Z'),3);
  assert.equal(invalid.financialStatus,'invalid-source-receipt');assert.equal(invalid.packet.evidence.length,0);
});
const event=(patch:any={})=>({id:'event',symbol:'MSFT',date:'2026-11-12T12:00:00Z',kind:'earnings',source:'Fictional issuer',sourceUrl:'https://example.com/results',confirmation:'confirmed',confirmationBasis:'issuer',publishedAt:'2026-11-01T12:00:00Z',retrievedAt:'2026-11-09T12:00:00Z',...patch});
const calendar=(events:any[])=>captureEarningsCalendar({ok:true,upcoming:events},'2026-11-09T12:00:00Z');
test('exact catalyst countdown is elapsed UTC days and retains reported-versus-estimated distinction',()=>{
  const now=Date.parse('2026-11-09T12:00:00Z');
  const result=councilCatalyst(calendar([event()]),'MSFT',now);
  assert.equal(result.evidence?.value,3);assert.equal(result.evidence?.basis,'unknown');assert.equal(result.evidence?.observed_at,null);assert.equal(result.event?.confirmation,'confirmed');
  const estimate=councilCatalyst(calendar([event({confirmation:'estimated'})]),'MSFT',now);
  assert.equal(estimate.evidence?.basis,'estimate');
  const partial=councilCatalyst(calendar([event({date:'2026-11-10T00:00:00Z'})]),'MSFT',now);
  assert.equal(partial.evidence?.value,.5);
});
test('date-only events, unavailable calendars and cancelled/past events cannot become precise counts',()=>{
  const now=Date.parse('2026-11-09T12:00:00Z');
  for(const ev of [event({date:'2026-11-12'}),event({confirmation:'cancelled'}),event({date:'2026-11-08T00:00:00Z'})])assert.equal(councilCatalyst(calendar([ev]),'MSFT',now).evidence,null);
  assert.equal(councilCatalyst(undefined,'MSFT',now).status,'unavailable');
  assert.equal(councilCatalyst(calendar([]),'MSFT',now).status,'available');
});
test('unresolved revisions withhold countdown instead of silently retaining an older event',()=>{
  const snapshot=calendar([event(),event({id:'change',supersedesId:'event',publishedAt:'2026-10-01T00:00:00Z'})]);
  const result=councilCatalyst(snapshot,'MSFT',Date.parse('2026-11-09T12:00:00Z'));
  assert.equal(result.evidence,null);assert.ok(result.issues.includes('CALENDAR_REVISION_UNRESOLVED'));
});
test('all supported loaded families fit the eight-record bound without raw source URLs or filing text',()=>{
  const now=Date.parse('2026-11-09T12:00:00Z'),stamp=new Date(now).toISOString();
  const source={symbol:'MSFT',councilSource:adaptSecCouncilFacts({symbol:'MSFT',expectedCik:1,facts:secFacts(),retrievedAt:stamp})};
  const quote={symbol:'MSFT',returnedSymbol:'MSFT',price:100,changePct:0,currency:'USD',sourceMode:'live',provider:'yahoo',marketTime:stamp,retrievedAt:stamp};
  const result=inspectCouncilSources('MSFT',quote,source,'test',now,3,calendar([event()]));
  assert.equal(result.packet.evidence.length,7);assert.deepEqual([...new Set(result.packet.evidence.map(e=>e.family))].sort(),['catalyst','financial','market','risk']);
  assert.equal(councilPayload({mode:'loaded',packet:result.packet})!==null,true);
  assert.ok(!/https:|sourceUrl|entityName/.test(JSON.stringify(result.packet)));
});
