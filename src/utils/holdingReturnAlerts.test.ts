import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getHoldingReturnThresholdTransitions } from '../../server/api/portfolio-holding-return-alerts.js';

describe('per-holding return milestone transitions', () => {
  it('triggers one-time +25% and +30% milestones when crossed', () => {
    assert.deepEqual(getHoldingReturnThresholdTransitions('MSFT', 27, new Map()), {
      trigger: [25],
      reset: [],
    });
    assert.deepEqual(getHoldingReturnThresholdTransitions('NOW', 31, new Map()), {
      trigger: [25, 30],
      reset: [],
    });
  });

  it('does not repeat an alert while the same threshold remains active', () => {
    const states = new Map([
      ['holding-return:MSFT:25', { active: true }],
    ]);
    assert.deepEqual(getHoldingReturnThresholdTransitions('msft', 28, states), {
      trigger: [],
      reset: [],
    });
  });

  it('resets a threshold after the return falls below it, permitting a later recross', () => {
    const states = new Map([
      ['holding-return:NOW:25', { active: true }],
      ['holding-return:NOW:30', { active: true }],
    ]);
    assert.deepEqual(getHoldingReturnThresholdTransitions('NOW', 27, states), {
      trigger: [],
      reset: [30],
    });
    assert.deepEqual(getHoldingReturnThresholdTransitions('NOW', 24, states), {
      trigger: [],
      reset: [25, 30],
    });
  });

  it('ignores missing or invalid return values', () => {
    assert.deepEqual(getHoldingReturnThresholdTransitions('MSFT', null, new Map()), {
      trigger: [],
      reset: [],
    });
    assert.deepEqual(getHoldingReturnThresholdTransitions('', 30, new Map()), {
      trigger: [],
      reset: [],
    });
  });
});
