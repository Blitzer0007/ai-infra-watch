import test from 'node:test';
import assert from 'node:assert/strict';
import { percentileRank } from './intelligence';

test('money rotation percentile rank is comparable across horizon units', () => {
  assert.equal(percentileRank([1, 2, 3, 4], 1), 12.5);
  assert.equal(percentileRank([1, 2, 3, 4], 4), 87.5);
  assert.equal(percentileRank([1, 2, 3, 4], 2.5), 37.5);
  assert.equal(percentileRank([], 2), null);
});
