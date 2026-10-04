import assert from 'node:assert/strict';
import testFn from 'node:test';
import { sampleLabel, scoreDecision } from './decisionQuality';

testFn('EXIT scores against the decision direction', () => {
  assert.equal(scoreDecision('EXIT_REVIEW', 5), -5);
});

testFn('REDUCE scores against the decision direction', () => {
  assert.equal(scoreDecision('REDUCE_REVIEW', 5), -5);
});

testFn('HOLD rewards positive excess return', () => {
  assert.equal(scoreDecision('HOLD', 5), 5);
});

testFn('WATCH rewards positive excess return', () => {
  assert.equal(scoreDecision('WATCH', -3), -3);
});

testFn('missing excess return is not scored', () => {
  assert.equal(scoreDecision('HOLD', null), null);
});

testFn('weekly sample warning is explicit below 10 outcomes', () => {
  assert.equal(sampleLabel(3), 'INSUFFICIENT SAMPLE · n=3 < 10');
});
