import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSchedulerFleet as review } from './schedulerFleetHealth.js';

const healthy = {
  id: 'fictional-job', status: 'completed', conclusion: 'success',
  lastSuccessAt: '2026-11-18T12:00:00Z', recentFailureCount: 0,
  recentSkippedCount: 0, stuckRunCount: 0, isStuck: false,
};

describe('Milestone 5 scheduler observation fleet', () => {
  it('does not present missing, loading or failed network evidence as healthy', () => {
    assert.deepEqual(review([]), {state:'unknown', healthy:0, attention:0, incomplete:0, unknown:0, total:0, observed:false});
    assert.equal(review([], {loading:true}).state, 'loading');
    assert.equal(review([healthy], {error:'unavailable'}).state, 'unknown');
  });
  it('requires a recorded success time, not merely a completed workflow', () => {
    assert.deepEqual(review([healthy]), {state:'healthy', healthy:1, attention:0, incomplete:0, unknown:0, total:1, observed:true});
    assert.equal(review([{...healthy, lastSuccessAt:null}]).unknown, 1);
    assert.equal(review([{...healthy, lastSuccessAt:'not-a-time'}]).unknown, 1);
    assert.equal(review([{...healthy, status:'no_runs'}]).unknown, 1);
    assert.equal(review([{...healthy, status:'stale'}]).unknown, 1);
  });
  it('exposes failure and stuck state even when old success is present', () => {
    const result = review([healthy, {...healthy,id:'failed', recentFailureCount:1}, {...healthy,id:'stuck',isStuck:true}]);
    assert.equal(result.state, 'attention');
    assert.equal(result.healthy, 1);
    assert.equal(result.attention, 2);
  });
  it('separates intentionally skipped or disabled schedulers from actual failure', () => {
    const result = review([healthy, {...healthy,id:'skipped',conclusion:'skipped'}, {...healthy,id:'disabled',status:'disabled'}]);
    assert.equal(result.state, 'incomplete');
    assert.equal(result.incomplete, 2);
    assert.equal(result.attention, 0);
    assert.equal(result.healthy, 1);
  });
  it('does not leak arbitrary input payload fields and ignores malformed records', () => {
    const result = review([{...healthy,token:'private-credential'}, null, 'bad', []]);
    assert.equal(result.total, 1);
    assert.doesNotMatch(JSON.stringify(result), /private-credential/);
  });
});
