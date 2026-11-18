import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeHistoricalProvenance as review } from './historicalProvenanceReview.js';

const fixture = {
  inventoryWindow:{returnedRows:2,totalIndexedRows:220,capped:true},
  historicalGate:{status:'READY'},
  recentArtifacts:[
    {provider:'ohlc',sha256:'a'.repeat(64),retrievedAt:'2026-11-18T12:00:00Z',
      sourceAsOf:'2026-11-17',objectPath:'private/archive/secret'},
    {provider:'sp500-membership',sha256:'not-a-hash',retrievedAt:'2026-11-18T12:01:00Z',
      sourceAsOf:'2026-11-19T12:01:00Z',privateSecret:'DO_NOT_EXPOSE'},
  ],
};
const evaluation={version:'forecast-evaluation-v1',coverage:{returnedRows:20,truncated:true}};
test('empty evidence and malformed inventory never clear accuracy gating',()=>{
  const result=review(null,null);
  assert.equal(result.state,'unavailable');
  assert.equal(result.indexedWindowRows,null);
  assert.equal(result.usableForHistoricalAccuracy,false);
  assert.equal(result.forecastWindowObserved,false);
});
test('stored verified or READY statuses never grant independent provenance',()=>{
  const out=review({...fixture,recentArtifacts:[fixture.recentArtifacts[0]]},
    evaluation,'ready');
  assert.equal(out.state,'metadata-only');
  assert.equal(out.recordedHash,1);
  assert.equal(out.captureTimeKnown,1);
  assert.equal(out.claimedSourceDateKnown,1);
  assert.equal(out.windowCapped,true);
  assert.equal(out.forecastWindowObserved,true);
  assert.equal(out.usableForHistoricalAccuracy,false);
  assert.equal(out.independentPublisherReceipt,false);
  assert.equal(out.prospectiveHoldoutVerified,false);
  assert.doesNotMatch(JSON.stringify(out),/private\/archive|DO_NOT_EXPOSE|a{64}/);
});
test('source-as-of later than retrieval is flagged as contradictory metadata',()=>{
  const out=review(fixture,evaluation,'ready');
  assert.equal(out.state,'conflicting-metadata');
  assert.equal(out.sourceAfterCapture,1);
  assert.equal(out.usableForHistoricalAccuracy,false);
});
test('invalid date, unexpected objects and secret fields cannot crash or leak',()=>{
  const out=review({
    ...fixture,
    recentArtifacts:[{sourceAsOf:'2026-15-42',retrievedAt:'not-a-time',secret:'PRIVATE'},null,[]],
  },null);
  assert.equal(out.claimedSourceDateKnown,0);
  assert.equal(out.captureTimeKnown,0);
  assert.doesNotMatch(JSON.stringify(out),/PRIVATE|sourceAsOf/);
  assert.equal(out.usableForHistoricalAccuracy,false);
});
