import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyReceiptFiles, verifyReceiptArtifacts, verifyFullEvidenceBundle } from '../../scripts/verify-evidence-receipts.mjs';

test('the command reads receipt and trust anchors from separate paths',async()=>{
  const paths=[];
  const read=async path=>{
    paths.push(path);
    return path==='receipt.json'
      ? JSON.stringify({decisionAt:'2026-11-17T10:00:00Z',receipts:[],trustAnchors:{'fake':'attacker-controlled'}})
      : JSON.stringify({});
  };
  const result=await verifyReceiptFiles('receipt.json','approved-keys.json',read);
  assert.deepEqual(paths,['receipt.json','approved-keys.json']);
  assert.equal(result.state,'blocked');
  assert.equal(result.historicalAccuracyEligible,false);
  assert.doesNotMatch(JSON.stringify(result),/attacker-controlled/);
});
test('missing paths, corrupt contents and arbitrary private fields fail closed',async()=>{
  await assert.rejects(verifyReceiptFiles('', 'keys.json'),/required/);
  await assert.rejects(verifyReceiptFiles('a.json', 'keys.json', async()=>'{INVALID'),/SyntaxError/);
  const result=await verifyReceiptFiles('receipts.json','keys.json',async path=>
    path==='keys.json'?'{}':JSON.stringify({decisionAt:'2026-11-17T10:00:00Z',
      receipts:[{privateObjectPath:'DO_NOT_ECHO'}],now:'2100-11-19T00:00:00Z'}));
  assert.equal(result.historicalAccuracyEligible,false);
  assert.doesNotMatch(JSON.stringify(result),/DO_NOT_ECHO/);
});

test('artifact CLI boundary reads three separately supplied inputs and remains blocked',async()=>{
  const readPaths=[];
  const read=async path=>{
    readPaths.push(path);
    if(path==='receipt.json') return JSON.stringify({decisionAt:'2026-11-17T10:00:00Z',receipts:[],trustAnchors:{evil:'never-trusted'}});
    if(path==='anchor.json') return '{}';
    if(path==='artifact-map.json') return JSON.stringify({
      'source-publication':'/private/source','adjusted-outcome':'/private/prices',
      'universe-membership':'/private/universe','prospective-holdout':'/private/holdout',
    });
    throw Error('not expected');
  };
  const result=await verifyReceiptArtifacts('receipt.json','anchor.json','artifact-map.json',read);
  assert.deepEqual(readPaths,['receipt.json','anchor.json','artifact-map.json']);
  assert.equal(result.state,'receipt-verification-blocked');
  assert.equal(result.historicalAccuracyEligible,false);
  assert.doesNotMatch(JSON.stringify(result),/\/private\/|never-trusted/);
  await assert.rejects(verifyReceiptArtifacts('receipt.json','anchor.json','',read),/required/);
});

test('full offline review reads four separate inputs and refuses injected trusted-status claims',async()=>{
  const seen=[];
  const read=async p=>{
    seen.push(p);
    if(p==='receipts.json')return JSON.stringify({
      decisionAt:'2026-11-17T10:00:00Z',receipts:[],
      trustAnchors:{untrusted:'MUST_NOT_LEAK'}});
    if(p==='keys.json')return JSON.stringify({});
    if(p==='artifacts.json')return JSON.stringify({'source-publication':'private-path'});
    if(p==='holdout.json')return JSON.stringify({
      decisionAt:'2026-11-17T10:00:00Z',
      trainingThrough:'2026-11-10T10:00:00Z',frozenAt:'2026-11-11T10:00:00Z',
      holdoutStart:'2026-11-17T10:00:00Z',holdoutEnd:'2026-11-18T10:00:00Z',
      trainingSampleDigests:['a'.repeat(64)],holdoutSampleDigests:['b'.repeat(64)],
      independentlyTimestamped:true,holdoutAccuracyEligible:true,
    });
    throw Error('Unexpected path');
  };
  const result=await verifyFullEvidenceBundle('receipts.json','keys.json','artifacts.json','holdout.json',read);
  assert.deepEqual(seen,['receipts.json','keys.json','artifacts.json','holdout.json']);
  assert.equal(result.state,'artifact-blocked');
  assert.equal(result.artifactState,'receipt-verification-blocked');
  assert.equal(result.historicalAccuracyEligible,false);
  assert.equal(result.investmentDecisionEligible,false);
  assert.doesNotMatch(JSON.stringify(result),/private-path|MUST_NOT_LEAK|a{64}/);
  await assert.rejects(verifyFullEvidenceBundle('receipts.json','keys.json','artifacts.json','',read),/required/);
});
