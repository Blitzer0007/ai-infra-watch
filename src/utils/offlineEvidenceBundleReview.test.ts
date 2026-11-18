import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { reviewOfflineEvidenceBundle as review } from './offlineEvidenceBundleReview.js';

const kinds=['source-publication','adjusted-outcome','universe-membership','prospective-holdout'];
const statements=['source-published','corporate-actions-reconciled','membership-at-decision','holdout-committed-before-decision'];
const decisionAt='2026-11-17T10:00:00Z';
const now='2026-11-18T12:00:00Z';
const commitment={
  decisionAt,trainingThrough:'2026-11-10T10:00:00Z',frozenAt:'2026-11-11T10:00:00Z',
  holdoutStart:'2026-11-17T10:00:00Z',holdoutEnd:'2026-11-18T10:00:00Z',
  trainingSampleDigests:['a'.repeat(64)],holdoutSampleDigests:['b'.repeat(64)],
};
async function fixture(fn){
  const dir=await mkdtemp(path.join(tmpdir(),'m5-bundle-'));
  try{
    const receipts=[],trustAnchors={},files={};
    for(const [i,kind] of kinds.entries()){
      const bytes=Buffer.from('Fictional independent '+kind+' artifact');
      const file=path.join(dir,kind+'.bin');
      await writeFile(file,bytes);
      files[kind]=file;
      const {privateKey,publicKey}=generateKeyPairSync('ed25519');
      trustAnchors[kind]={kind,publisherId:'fictional-reviewer',publicKeyPem:publicKey.export({type:'spki',format:'pem'})};
      const payload={
        version:'evidence-receipt-v1',kind,decisionAt,
        observedAt:kind==='adjusted-outcome'?'2026-11-18T10:00:00Z':'2026-11-16T10:00:00Z',
        artifactSha256:createHash('sha256').update(bytes).digest('hex'),
        publisherId:'fictional-reviewer',statement:statements[i],
      };
      receipts.push({payload,keyId:kind,
        signature:sign(null,Buffer.from(JSON.stringify(payload)),privateKey).toString('base64')});
    }
    await fn({receipts,trustAnchors,files,decisionAt,commitment,now});
  }finally{await rm(dir,{recursive:true,force:true});}
}
test('complete fictional signatures, files and split still cannot approve accuracy',async()=>{
  await fixture(async input=>{
    const result=await review(input);
    assert.equal(result.state,'structural-evidence-observed');
    assert.equal(result.filesVerified,4);
    assert.equal(result.holdoutState,'structural-checks-observed');
    assert.equal(result.decisionAligned,true);
    assert.equal(result.historicalAccuracyEligible,false);
    assert.equal(result.investmentDecisionEligible,false);
    assert.doesNotMatch(JSON.stringify(result),/fictional-reviewer|BEGIN PUBLIC KEY|\.bin|a{64}/);
  });
});
test('mismatched receipt/holdout decision stops before touching artifacts',async()=>{
  const result=await review({decisionAt,commitment:{...commitment,decisionAt:'2026-11-16T10:00:00Z'},
    files:{'source-publication':'/private/should-not-open'}});
  assert.equal(result.state,'decision-mismatch');
  assert.equal(result.filesVerified,0);
});
test('overlap, missing holdout evidence and pending outcomes block verification',async()=>{
  await fixture(async input=>{
    const cases=[
      {commitment:{...commitment,holdoutSampleDigests:[...commitment.trainingSampleDigests]},state:'unsafe-split'},
      {commitment:{...commitment,holdoutSampleDigests:[]},state:'unverified'},
      {commitment:{...commitment,holdoutEnd:'2026-11-20T10:00:00Z'},state:'pending-holdout-window'},
    ];
    for(const x of cases){
      const result=await review({...input,commitment:x.commitment});
      assert.equal(result.state,'holdout-blocked');
      assert.equal(result.holdoutState,x.state);
      assert.equal(result.filesVerified,0);
      assert.equal(result.historicalAccuracyEligible,false);
    }
  });
});
test('tampered artifact or missing trusted receipt cannot establish complete evidence',async()=>{
  await fixture(async input=>{
    await writeFile(input.files['adjusted-outcome'],'tampered bytes');
    const result=await review(input);
    assert.equal(result.state,'artifact-blocked');
    assert.equal(result.artifactState,'digest-mismatch');
    assert.equal(result.historicalAccuracyEligible,false);
    const incomplete=await review({...input,receipts:input.receipts.slice(0,3)});
    assert.equal(incomplete.state,'artifact-blocked');
    assert.equal(incomplete.artifactState,'receipt-verification-blocked');
  });
});
