import test from 'node:test';
import assert from 'node:assert/strict';
import { getReturnThresholdTransitions } from '../../server/api/portfolio-return-alerts.js';

test('first crossing of 25% triggers only the 25% milestone', () => {
  assert.deepEqual(getReturnThresholdTransitions(27, new Map()), { trigger: [25], reset: [] });
});

test('crossing 30% triggers both milestones if neither has fired yet', () => {
  assert.deepEqual(getReturnThresholdTransitions(31, new Map()), { trigger: [25, 30], reset: [] });
});

test('active milestones do not repeat while return stays above thresholds', () => {
  const states = new Map([
    ['portfolio-return:25', { active: true }],
    ['portfolio-return:30', { active: true }],
  ]);
  assert.deepEqual(getReturnThresholdTransitions(34, states), { trigger: [], reset: [] });
});

test('falling below a threshold resets it for a future recrossing', () => {
  const states = new Map([
    ['portfolio-return:25', { active: true }],
    ['portfolio-return:30', { active: true }],
  ]);
  assert.deepEqual(getReturnThresholdTransitions(28, states), { trigger: [], reset: [30] });
  assert.deepEqual(getReturnThresholdTransitions(20, states), { trigger: [], reset: [25, 30] });
});

test('non-finite returns do not trigger or reset anything', () => {
  assert.deepEqual(getReturnThresholdTransitions(null, new Map()), { trigger: [], reset: [] });
  assert.deepEqual(getReturnThresholdTransitions(Number.NaN, new Map()), { trigger: [], reset: [] });
});
