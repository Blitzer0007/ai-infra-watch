import test from 'node:test';
import assert from 'node:assert/strict';
import { auditProspectiveHoldoutSplit as audit } from './prospectiveHoldoutSplit.js';
const id = x => x.repeat(64);
const c={
  trainingThrough:'2026-11-10T20:00:00Z',
  frozenAt:'2026-11-11T10:00:00Z',
  decisionAt:'2026-11-12T10:00:00Z',
  holdoutStart:'2026-11-12T10:00:00Z',
  holdoutEnd:'2026-11-17T10:00:00Z',
  trainingSampleDigests:[id('a'),id('b')],
  holdoutSampleDigests:[id('c'),id('d')],
  privateRows:'NO_PRIVATE_ROWS_IN_RESULT',
};
const now='2026-11-18T12:00:00Z';
test('separated retrospective metadata can only establish structural checks',()=>{
  const result=audit({commitment:c,now});
  assert.equal(result.state,'structural-checks-observed');
  assert.equal(result.temporalOrderValid,true);
  assert.equal(result.holdoutWindowComplete,true);
  assert.equal(result.leakedSampleCount,0);
  assert.equal(result.holdoutAccuracyEligible,false);
  assert.equal(result.independentlyTimestamped,false);
  assert.equal(result.investmentDecisionEligible,false);
  assert.doesNotMatch(JSON.stringify(result),/NO_PRIVATE_ROWS_IN_RESULT|a{64}|b{64}/);
});
test('reused sample digests or duplicate samples reject prospective claims',()=>{
  const r=audit({commitment:{...c,holdoutSampleDigests:[id('a'),id('d'),id('d')]},now});
  assert.equal(r.state,'unsafe-split');
  assert.equal(r.leakedSampleCount,1);
  assert.equal(r.duplicateHoldout,1);
  assert.equal(r.holdoutAccuracyEligible,false);
});
test('freeze after decision, training after freeze or retrospective evaluation reject',()=>{
  for(const changed of [
    {frozenAt:'2026-11-13T10:00:00Z'},
    {trainingThrough:'2026-11-12T10:00:00Z'},
    {holdoutStart:'2026-11-11T10:00:00Z'},
    {holdoutEnd:'2026-11-12T10:00:00Z'},
  ]) {
    assert.equal(audit({commitment:{...c,...changed},now}).state,'unsafe-split');
  }
});
test('holdout window in future remains pending and cannot establish accuracy',()=>{
  const r=audit({commitment:c,now:'2026-11-14T10:00:00Z'});
  assert.equal(r.state,'pending-holdout-window');
  assert.equal(r.holdoutWindowComplete,false);
  assert.equal(r.holdoutAccuracyEligible,false);
});
test('missing or malformed sample manifest and invalid timestamps stay unverified',()=>{
  for(const input of [
    null, {}, {commitment:{}},
    {commitment:{...c,holdoutSampleDigests:[]}},
    {commitment:{...c,trainingSampleDigests:['PRIVATE-ID']}},
    {commitment:{...c,trainingSampleDigests:[id('A')]}},
  ]) {
    const r=audit(input);
    assert.equal(r.state,'unverified');
    assert.equal(r.holdoutAccuracyEligible,false);
  }
  assert.equal(audit({commitment:{...c,frozenAt:'2026-02-30T00:00:00Z'},now}).state,'unsafe-split');
});
