import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { auditArtifactFiles } from './offlineArtifactIntegrity.js';

const kinds=['source-publication','adjusted-outcome','universe-membership','prospective-holdout'];
const statements=['source-published','corporate-actions-reconciled','membership-at-decision','holdout-committed-before-decision'];
const decisionAt='2026-11-17T10:00:00Z';
const now='2026-11-18T12:00:00Z';
const before='2026-11-16T10:00:00Z';
const after='2026-11-18T10:00:00Z';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

async function fixture(fn) {
  const dir=await mkdtemp(path.join(tmpdir(),'aiw-evidence-'));
  try {
    const files={},trustAnchors={},receipts=[];
    for(const [i,kind] of kinds.entries()) {
      const bytes=Buffer.from('fictional immutable artifact for '+kind);
      files[kind]=path.join(dir,kind+'.bin');
      await writeFile(files[kind],bytes);
      const {publicKey,privateKey}=generateKeyPairSync('ed25519');
      trustAnchors[kind]={kind,publisherId:'fictional-reviewer',
        publicKeyPem:publicKey.export({format:'pem',type:'spki'})};
      const payload={version:'evidence-receipt-v1',kind,decisionAt,
        observedAt:kind==='adjusted-outcome'?after:before,
        artifactSha256:digest(bytes),publisherId:'fictional-reviewer',statement:statements[i]};
      receipts.push({payload,keyId:kind,
        signature:sign(null,Buffer.from(JSON.stringify(payload)),privateKey).toString('base64')});
    }
    await fn({decisionAt,now,files,trustAnchors,receipts,dir});
  } finally { await rm(dir,{recursive:true,force:true}); }
}
test('signed claims plus distinct identical artifact bytes prove only digest consistency',async()=>{
  await fixture(async input=>{
    const result=await auditArtifactFiles(input);
    assert.equal(result.state,'signed-digests-observed');
    assert.equal(result.filesVerified,4);
    assert.deepEqual(result.verifiedKinds,kinds);
    assert.equal(result.historicalAccuracyEligible,false);
    assert.equal(result.investmentDecisionEligible,false);
    assert.doesNotMatch(JSON.stringify(result),/fictional-reviewer|BEGIN PUBLIC KEY|\.bin|a{64}/);
  });
});
test('tampering an artifact is detected without leaking bytes or file path',async()=>{
  await fixture(async input=>{
    await writeFile(input.files['adjusted-outcome'],'malicious changed outcome');
    const result=await auditArtifactFiles(input);
    assert.equal(result.state,'digest-mismatch');
    assert.equal(result.filesVerified,1);
    assert.equal(result.historicalAccuracyEligible,false);
    assert.doesNotMatch(JSON.stringify(result),/malicious|\.bin/);
  });
});
test('missing, symlinked, oversized or reused evidence paths fail closed',async()=>{
  await fixture(async input=>{
    const same={...input.files,'prospective-holdout':input.files['source-publication']};
    assert.equal((await auditArtifactFiles({...input,files:same})).state,'artifact-path-reused');
    await symlink(input.files['source-publication'],path.join(input.dir,'alias.bin'));
    assert.equal((await auditArtifactFiles({...input,files:{...input.files,'prospective-holdout':path.join(input.dir,'alias.bin')}})).state,'artifact-path-reused');
    assert.equal((await auditArtifactFiles({...input,files:{...input.files,'prospective-holdout':'/missing-fictional-file'}})).state,'artifact-unavailable');
    assert.equal((await auditArtifactFiles({...input,files:{}})).state,'artifact-manifest-incomplete');
  });
});
test('signatures, decision clock and missing receipts gate access to artifact bytes',async()=>{
  await fixture(async input=>{
    const bad={...input,receipts:[...input.receipts.slice(0,3),{...input.receipts[3],signature:'AAAA'}]};
    assert.equal((await auditArtifactFiles(bad)).state,'receipt-verification-blocked');
    assert.equal((await auditArtifactFiles({...input,receipts:input.receipts.slice(0,3)})).state,'receipt-verification-blocked');
    assert.equal((await auditArtifactFiles({...input,now:'2026-11-17T09:00:00Z'})).state,'receipt-verification-blocked');
  });
});
