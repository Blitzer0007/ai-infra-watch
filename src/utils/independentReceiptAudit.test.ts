import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { auditIndependentReceipts as audit } from './independentReceiptAudit.js';

const TYPES = [
  ['source-publication', 'source-published', '2026-11-16T10:00:00Z'],
  ['adjusted-outcome', 'corporate-actions-reconciled', '2026-11-18T10:00:00Z'],
  ['universe-membership', 'membership-at-decision', '2026-11-16T10:00:00Z'],
  ['prospective-holdout', 'holdout-committed-before-decision', '2026-11-16T10:00:00Z'],
];
const decisionAt = '2026-11-17T10:00:00Z';
const now = '2026-11-18T12:00:00Z';
const keys = Object.fromEntries(TYPES.map(([kind]) => {
  const {privateKey,publicKey} = generateKeyPairSync('ed25519');
  return [kind,{privateKey,publicKey:publicKey.export({format:'pem',type:'spki'})}];
}));
const anchors = Object.fromEntries(TYPES.map(([kind]) => [kind,{
  publicKeyPem:keys[kind].publicKey,publisherId:'fictional-independent-reviewer',kind,
}]));
function receipt(kind,statement,time) {
  const payload = {version:'evidence-receipt-v1',kind,decisionAt,observedAt:time,
    artifactSha256:'a'.repeat(64),publisherId:'fictional-independent-reviewer',statement};
  const signature=sign(null,Buffer.from(JSON.stringify(payload)),keys[kind].privateKey).toString('base64');
  return {payload,keyId:kind,signature};
}
const receipts=TYPES.map(([kind,statement,time])=>receipt(kind,statement,time));
const input={trustAnchors:anchors,receipts,decisionAt,now};

test('full detached signatures and temporal ordering can be observed but never approve accuracy',()=>{
  const out=audit(input);
  assert.equal(out.state,'signatures-and-timing-observed');
  assert.equal(out.verifiedTypes.length,4);
  assert.equal(out.missingTypes.length,0);
  assert.equal(out.invalidCount,0);
  assert.equal(out.historicalAccuracyEligible,false);
  assert.equal(out.investmentDecisionEligible,false);
  assert.doesNotMatch(JSON.stringify(out),/PRIVATE|BEGIN PUBLIC KEY|a{64}|fictional-independent-reviewer/);
});
test('missing trust anchor, missing receipt and unauthorized signature fail closed',()=>{
  assert.equal(audit({...input,trustAnchors:{...anchors,'source-publication':undefined}}).state,'invalid-or-conflicting-receipts');
  const partial=audit({...input,receipts:receipts.slice(0,2)});
  assert.equal(partial.state,'incomplete-receipts');
  assert.deepEqual(partial.missingTypes,['universe-membership','prospective-holdout']);
  const forged={...receipts[0],payload:{...receipts[0].payload,observedAt:'2026-11-15T10:00:00Z'}};
  assert.equal(audit({...input,receipts:[forged,...receipts.slice(1)]}).invalidCount,1);
});
test('same signed receipt cannot certify multiple kinds or publishers',()=>{
  const reused={...receipts[0],keyId:'adjusted-outcome'};
  assert.equal(audit({...input,receipts:[reused,...receipts.slice(1)]}).invalidCount,1);
  const duplicate=audit({...input,receipts:[...receipts,receipts[0]]});
  assert.equal(duplicate.invalidCount,1);
  assert.equal(duplicate.historicalAccuracyEligible,false);
});
test('no post-decision source/holdout, no pre-decision outcome, no future attestations',()=>{
  const lateSource=receipt('source-publication','source-published','2026-11-18T10:00:00Z');
  const earlyOutcome=receipt('adjusted-outcome','corporate-actions-reconciled','2026-11-16T10:00:00Z');
  const futureUniverse=receipt('universe-membership','membership-at-decision','2026-11-20T10:00:00Z');
  assert.equal(audit({...input,receipts:[lateSource,...receipts.slice(1)]}).invalidCount,1);
  assert.equal(audit({...input,receipts:[receipts[0],earlyOutcome,...receipts.slice(2)]}).invalidCount,1);
  assert.equal(audit({...input,receipts:[...receipts.slice(0,2),futureUniverse,receipts[3]]}).invalidCount,1);
});
test('invalid or malformed payloads do not crash, leak or certify investments',()=>{
  for(const bad of [
    {},{...input,receipts:[]},{...input,decisionAt:'invalid'},
    {...input,now:'invalid'},{...input,receipts:[{payload:{},keyId:'x',signature:'abc'}]},
    {...input,receipts:[null]},
    {...input,trustAnchors:[]},
  ]) {
    const result=audit(bad);
    assert.equal(result.historicalAccuracyEligible,false);
    assert.equal(result.investmentDecisionEligible,false);
    assert.equal(result.state==='signatures-and-timing-observed',false);
  }
});
