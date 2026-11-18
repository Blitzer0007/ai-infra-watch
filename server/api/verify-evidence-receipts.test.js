import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyReceiptFiles } from '../../scripts/verify-evidence-receipts.mjs';

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
