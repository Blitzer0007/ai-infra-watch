import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loadPortfolioHistoryBatch} from './portfolioHistoryBatch';

test('portfolio history bounds in-flight calls and preserves independent successes/failures', async () => {
  let active = 0, peak = 0;
  const result = await loadPortfolioHistoryBatch(['A','B','C','D','E'], async symbol => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    if(symbol === 'B') throw Error('private provider error');
    return [symbol];
  }, () => false);
  assert.equal(peak, 3); assert.deepEqual(Object.keys(result.histories).sort(), ['A','C','D','E']);
  assert.deepEqual(result.failures, ['B']); assert.doesNotMatch(JSON.stringify(result), /private provider error/);
});
test('leaving the view stops queued history requests while allowing active results to settle', async () => {
  let stopped = false; const calls: string[] = [];
  await loadPortfolioHistoryBatch(['A','B','C','D','E'], async symbol => {
    calls.push(symbol); await Promise.resolve(); stopped = true; return [];
  }, () => stopped);
  assert.deepEqual(calls, ['A','B','C']);
  calls.length = 0;
  await loadPortfolioHistoryBatch(['A'], async symbol => { calls.push(symbol); return []; }, () => true);
  assert.deepEqual(calls, []);
});
