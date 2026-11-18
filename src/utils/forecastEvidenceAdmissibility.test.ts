import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeForecastEvidenceAdmissibility as review} from './forecastEvidenceAdmissibility';

const evaluation={
  version:'forecast-evaluation-v1',
  coverage:{returnedRows:18,truncated:false},
  lifecycle:{independentScorable:15,pendingDueForReview:2,verifiedUnscorable:1},
};
const archive={
  historicalGate:{status:'BLOCKED',reason:'archive only'},
  inventoryWindow:{returnedRows:10,totalIndexedRows:20,capped:true},
  providers:[{provider:'mock',artifact:{secret:'PRIVATE'}}],
};
test('missing both sources yields unknown counts, not false zeroes or historical approval',()=>{
  const result=review(null,null,'unavailable');
  assert.equal(result.archive.indexedMetadataRows,null);
  assert.equal(result.evaluation.independentScorable,null);
  assert.equal(result.evaluation.state,'unavailable');
  assert.equal(result.historicalEvaluationEligible,false);
});
test('archived rows and verified forecast counts do not authenticate original source availability',()=>{
  const r=review(archive,evaluation,'ready');
  assert.equal(r.archive.indexedMetadataRows,10);
  assert.equal(r.archive.windowCapped,true);
  assert.equal(r.evaluation.independentScorable,15);
  assert.equal(r.evaluation.dueForReview,2);
  assert.equal(r.requiredProof.sourcePublishedBeforeDecision,'not-independently-established');
  assert.equal(r.requiredProof.adjustedMarketOutcome,'not-independently-established');
  assert.equal(r.historicalEvaluationEligible,false);
  assert.doesNotMatch(JSON.stringify(r),/PRIVATE|archive only/);
});
test('even a spoofed positive backend gate is not enough without independent receipt proofs',()=>{
  const r=review({...archive,historicalGate:{status:'READY'}},evaluation,'ready');
  assert.equal(r.archive.recordedHistoricalGate,'READY');
  assert.equal(r.requiredProof.prospectiveHoldoutAndLeakageAudit,'not-independently-established');
  assert.equal(r.investmentDecisionEligible,false);
});
test('empty indexed metadata window does not mean that no data exists across history',()=>{
  const r=review({...archive,inventoryWindow:{returnedRows:0,totalIndexedRows:200,capped:true}},evaluation,'ready');
  assert.equal(r.archive.state,'no-indexed-metadata');
  assert.equal(r.archive.indexedTotalRows,200);
  assert.equal(r.archive.windowCapped,true);
  assert.equal(r.historicalEvaluationEligible,false);
});
test('unavailable forecast report is not a zero accuracy or complete holdout',()=>{
  const r=review(archive,{...evaluation,coverage:{returnedRows:999,truncated:true}},'unavailable');
  assert.equal(r.evaluation.returnedRows,null);
  assert.equal(r.evaluation.windowTruncated,null);
  assert.equal(r.evaluation.independentScorable,null);
  assert.equal(r.historicalEvaluationEligible,false);
});
test('secret-bearing arbitrary inputs are never re-emitted in the public summary',()=>{
  const result=review({...archive,secret:'TOP_SECRET'},{
    ...evaluation,sourcePayload:{apiKey:'TOP_SECRET'},
  },'ready');
  assert.doesNotMatch(JSON.stringify(result),/TOP_SECRET|apiKey|sourcePayload/);
});
