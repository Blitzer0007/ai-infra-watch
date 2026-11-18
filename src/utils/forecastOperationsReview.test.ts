import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeForecastOperations as review } from './forecastOperationsReview';

const positive={
  version:'forecast-evaluation-v1',
  coverage:{returnedRows:9,truncated:false,asOfUtcDate:'2026-11-18'},
  lifecycle:{pendingDueForReview:2,pendingNotDue:1,pendingUnknownTarget:1,verifiedUnscorable:2,independentScorable:3,overlappingExcluded:1},
};
const done={
  id:'forecast-auto-tracker',status:'completed',conclusion:'success',lastRunAt:'2026-11-18T00:15:00Z',
  lastRunAgeMs:1000,recentFailureCount:0,recentSkippedCount:0,stuckRunCount:0,isStuck:false,
};

test('missing scheduler and unavailable lifecycle do not masquerade as zero errors',()=>{
  const result=review([],null);
  assert.equal(result.scheduler.state,'unavailable');
  assert.equal(result.evaluation.state,'unavailable');
  assert.equal(result.evaluation.dueForReview,null);
  assert.equal(result.evaluation.returnedRows,null);
  assert.equal(result.conclusion,'incomplete');
});

test('a real last-success observation still flags due and unscorable forecasts for review',()=>{
  const result=review([done],positive,'ready');
  assert.equal(result.scheduler.state,'last-run-success');
  assert.equal(result.evaluation.state,'review-required');
  assert.equal(result.evaluation.dueForReview,2);
  assert.equal(result.evaluation.verifiedUnscorable,2);
  assert.equal(result.conclusion,'attention');
  assert.match(result.note,/does not prove valid market outcomes/);
});

test('a skipped or failed recorded run triggers attention even when lifecycle window shows no due forecasts',()=>{
  const zero={...positive,lifecycle:{...positive.lifecycle,pendingDueForReview:0,verifiedUnscorable:0}};
  const failed=review([{...done,recentSkippedCount:1}],zero,'ready');
  assert.equal(failed.scheduler.state,'review-required');
  assert.equal(failed.evaluation.state,'observed-window');
  assert.equal(failed.conclusion,'attention');
  assert.equal(review([{...done,isStuck:true,stuckRunCount:1}],zero,'ready').scheduler.state,'review-required');
});

test('unknown run counts and missing run time cannot be silently inferred as success',()=>{
  const result=review([{id:'forecast-auto-tracker',status:'completed',conclusion:'success'}],positive,'ready');
  assert.equal(result.scheduler.state,'unknown');
  assert.equal(result.conclusion,'attention');
  assert.equal(review([{id:'forecast-auto-tracker',status:'no_runs',conclusion:null}],null).scheduler.state,'no-recorded-run');
});

test('window truncation is retained; data cannot be called complete even if all returned records are scorable',()=>{
  const clean={...positive,coverage:{...positive.coverage,truncated:true},
    lifecycle:{...positive.lifecycle,pendingDueForReview:0,verifiedUnscorable:0}};
  const result=review([done],clean,'ready');
  assert.equal(result.evaluation.windowTruncated,true);
  assert.equal(result.evaluation.state,'observed-window');
  assert.equal(result.conclusion,'observed-only');
  assert.match(result.note,/not the entire database/);
});

test('malformed or secret-bearing payloads cannot leak raw scheduler or forecast content',()=>{
  const reviewResult=review([{...done,secretToken:'NEVER-LEAK'}],
    {...positive,evidence_snapshot:{token:'NEVER-LEAK'},lifecycle:{...positive.lifecycle,pendingDueForReview:'bad'}},'ready');
  assert.equal(reviewResult.evaluation.state,'unavailable');
  assert.equal(reviewResult.evaluation.dueForReview,null);
  assert.doesNotMatch(JSON.stringify(reviewResult),/NEVER-LEAK|evidence_snapshot/);
});
