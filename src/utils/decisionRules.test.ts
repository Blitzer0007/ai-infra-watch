import assert from 'node:assert/strict';
import testFn from 'node:test';
import { ruleDistance } from '../../server/api/decision-center.js';

const rklb = (price: number, overrides: Record<string, any> = {}) =>
  ruleDistance(
    {
      symbol: 'RKLB',
      average_cost: 70.57,
      loss_limit_pct: 20,
      broker_alert_prices: [56.46, 84.68],
      ...overrides,
    },
    { price },
    overrides.history || { points: [] },
  );

testFn('ruleDistance: RKLB at $70 is clear with stop and target alerts', () => {
  const result = rklb(70);
  assert.equal(result.state, 'clear');
  assert.equal(result.rules.length, 3);
  assert.deepEqual(
    result.rules.filter(rule => rule.direction).map(rule => rule.direction),
    ['below', 'below', 'above'],
  );
});

testFn('ruleDistance: RKLB at $56 breaches the downside stop', () => {
  const result = rklb(56);
  assert.equal(result.state, 'breached');
  assert.equal(result.nearest?.type, 'loss limit');
});

testFn('ruleDistance: RKLB at $58 is near the downside stop', () => {
  const result = rklb(58);
  assert.equal(result.state, 'near');
  assert.equal(result.nearest?.type, 'broker downside alert');
  assert.ok(result.nearest.distancePct >= 0);
  assert.ok(result.nearest.distancePct <= 3);
});

testFn('ruleDistance: RKLB at $85 reaches the upside target, not a breach', () => {
  const result = rklb(85);
  assert.equal(result.state, 'target-reached');
  assert.equal(result.targetReached?.type, 'broker upside alert');
  assert.equal(result.targetReached?.direction, 'above');
});

testFn('ruleDistance: trailing stop is restored and evaluated from the purchase-date peak', () => {
  const result = rklb(67, {
    broker_alert_prices: [],
    exit_rule_type: 'trailing-stop',
    exit_rule_value: 15,
    purchase_date: '2026-09-29',
    history: {
      points: [
        { date: '2026-09-28', price: 62 },
        { date: '2026-09-29', price: 70 },
        { date: '2026-10-01', price: 80 },
        { date: '2026-10-02', price: 67 },
      ],
    },
  });

  assert.equal(result.state, 'breached');
  const trailing = result.rules.find(rule => rule.type === 'trailing stop');
  assert.ok(trailing);
  assert.equal(trailing.direction, 'below');
  assert.equal(trailing.target, 68);
});

testFn('ruleDistance: time limit is restored and can breach independently', () => {
  const purchaseDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const result = ruleDistance(
    {
      symbol: 'TEST',
      average_cost: 100,
      exit_rule_type: 'time-limit',
      exit_rule_value: 5,
      purchase_date: purchaseDate,
      broker_alert_prices: [],
    },
    { price: 100 },
    { points: [] },
  );

  assert.equal(result.state, 'breached');
  assert.equal(result.nearest?.type, 'time limit');
  assert.equal(result.nearest?.unit, 'days');
});

testFn('ruleDistance: no configured rules still returns no-rule', () => {
  const result = ruleDistance(
    { symbol: 'TEST', average_cost: 100, broker_alert_prices: [] },
    { price: 100 },
    { points: [] },
  );

  assert.equal(result.state, 'no-rule');
  assert.deepEqual(result.rules, []);
});
