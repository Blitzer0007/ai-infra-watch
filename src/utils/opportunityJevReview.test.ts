import test from 'node:test';
import assert from 'node:assert/strict';
import type { ResearchCandidate } from './opportunityResearch';
import { opportunityJevState, normalizeOpportunityJevReview, opportunityJevFailure } from './opportunityJevReview';
const candidate:ResearchCandidate={symbol:'FICT',companyName:'Private display name',status:'needs-data',horizonMonths:{min:2,max:12},snapshotId:'private-snapshot',asOf:null,ruleVersion:'reported-growth-cash-flow-v1-experimental',supportingReasons:[],conflictingReasons:[],evidence:[{id:'private-ref',label:'Private text',source:'Bearer fixture-secret',url:'https://example.com/?token=fixture-secret'}],missingInputs:['Private thesis and secret notes'],dataEligibility:'insufficient',signalEligibility:'experimental',portfolioContext:'holding',accounting:'unverified',nextReviewCondition:'Private note'};
const response=()=>({ok:true,enabled:true,fallback:false,kind:'opportunities',answers:{next_check:{type:'choice',choice:'monitor'},context:{type:'choice',choice:'bounded_review'}},input_tokens:123,latency_ms:42,model:'fixture-model',token:'fixture-secret',balance:9000});
test('JEV errors distinguish schema/access/configuration failures without echoing private bodies',()=>{
  assert.match(opportunityJevFailure(400,{error:'private-secret'}),/same release/);
  assert.match(opportunityJevFailure(401,{}),/Unlock/);
  assert.match(opportunityJevFailure(429,{}),/limit/);
  assert.match(opportunityJevFailure(200,{error_code:'not_configured',enabled:true}),/did not call TypeSafe/);
  assert.match(opportunityJevFailure(503,{}),/Credits may have been used/);
  assert.doesNotMatch(opportunityJevFailure(500,{error:'private-secret'}),/private-secret/);
});

test('JEV summary selects bounded coverage metadata and omits private/raw input text',()=>{
  const state=opportunityJevState(candidate);
  assert.equal(state.symbol,'FICT');assert.equal(state.missingInputCount,1);assert.equal(state.evidenceReferenceCount,1);
  assert.doesNotMatch(JSON.stringify(state),/private|Private|secret|Bearer|holding|accounting|https|thesis/);
  assert.ok(JSON.stringify(state).length<1024);
  assert.equal(opportunityJevState({...candidate,missingInputs:Array(150).fill('missing')}).missingInputCount,100);
});
test('excluded or malformed symbols cannot enter a billable request',()=>{
  assert.throws(()=>opportunityJevState({...candidate,status:'excluded'}));
  assert.throws(()=>opportunityJevState({...candidate,symbol:'invalid/path'}));
});
test('new capture IDs with identical public facts reuse the same review key',()=>{
  assert.deepEqual(opportunityJevState(candidate),opportunityJevState({...candidate,snapshotId:'another-capture',companyName:'Another display name'}));
});
test('JEV cannot upgrade deterministic missing/conflicting inputs',()=>{
  const state=opportunityJevState(candidate);let review=normalizeOpportunityJevReview(response(),state);
  assert.equal(review.context,'insufficient');assert.equal(review.nextCheck,'gather_evidence');
  review=normalizeOpportunityJevReview(response(),{...state,dataEligibility:'conflicting'});
  assert.equal(review.context,'conflicting');assert.equal(review.nextCheck,'resolve_conflicts');
  review=normalizeOpportunityJevReview(response(),{...state,dataEligibility:'eligible',evidenceReferenceCount:0});
  assert.equal(review.context,'insufficient');
});
test('fallback, disabled, incomplete, wrong-kind and unrecognized answers are unavailable',()=>{
  const base=response(),state=opportunityJevState(candidate);
  for(const value of [null,{}, {...base,ok:false},{...base,enabled:false},{...base,fallback:true},{...base,kind:'portfolio'},{...base,answers:{}},{...base,answers:{...base.answers,next_check:{type:'choice',choice:'buy'}}}]) assert.throws(()=>normalizeOpportunityJevReview(value,state));
});
test('usage is optional, finite and redacted; balance or profit probability is never inferred',()=>{
  const base=response(),state=opportunityJevState(candidate);const review=normalizeOpportunityJevReview({...base,input_tokens:-1,latency_ms:Infinity,model:'Bearer fixture-secret'},state);
  assert.equal(review.inputTokens,null);assert.equal(review.latencyMs,null);assert.equal(review.model,null);
  assert.doesNotMatch(JSON.stringify(review),/balance|9000|secret|confidence|probability|token/);
});
