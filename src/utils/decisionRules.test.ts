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


testFn('ruleDistance: staged trailing is inactive before take-profit is reached', () => {
  const result = ruleDistance(
    {
      symbol: 'RKLB',
      average_cost: 70,
      rule_stages: [
        { type: 'stop', pct: 20 },
        { type: 'take_profit', pct: 20, action: 'sell_fraction', fraction: 0.5 },
        { type: 'trailing', pct: 15, activates_after: 'take_profit' },
      ],
      purchase_date: '2026-10-01',
    },
    { price: 68 },
    { points: [
      { date: '2026-10-01', price: 70 },
      { date: '2026-10-02', price: 80 },
      { date: '2026-10-03', price: 68 },
    ] },
  );

  assert.equal(result.state, 'clear');
  assert.ok(!result.rules.some(rule => rule.type === 'trailing stop'));
});

testFn('ruleDistance: staged trailing activates after take-profit and uses the post-target peak', () => {
  const history = {
    points: [
      { date: '2026-10-01', price: 70 },
      { date: '2026-10-02', price: 85 },
      { date: '2026-10-03', price: 100 },
      { date: '2026-10-04', price: 84 },
    ],
  };
  const holding = {
    symbol: 'RKLB',
    average_cost: 70,
    rule_stages: [
      { type: 'stop', pct: 20 },
      { type: 'take_profit', pct: 20, action: 'sell_fraction', fraction: 0.5 },
      { type: 'trailing', pct: 15, activates_after: 'take_profit' },
    ],
    purchase_date: '2026-10-01',
  };

  const result = ruleDistance(holding, { price: 84 }, history);
  assert.equal(result.state, 'breached');
  const trailing = result.rules.find(rule => rule.type === 'trailing stop');
  assert.ok(trailing);
  assert.equal(trailing.target, 85);
  assert.equal((trailing as any).activatedDate, '2026-10-02');
});

testFn('ruleDistance: staged state can be persisted and reused after restart', () => {
  const history = {
    points: [
      { date: '2026-10-01', price: 70 },
      { date: '2026-10-02', price: 85 },
      { date: '2026-10-03', price: 100 },
    ],
  };
  const baseHolding = {
    symbol: 'RKLB',
    average_cost: 70,
    rule_stages: [
      { type: 'stop', pct: 20 },
      { type: 'take_profit', pct: 20, action: 'sell_fraction', fraction: 0.5 },
      { type: 'trailing', pct: 15, activates_after: 'take_profit' },
    ],
    purchase_date: '2026-10-01',
  };

  const first = ruleDistance(baseHolding, { price: 100 }, history);
  assert.equal(first.state, 'target-reached');
  assert.ok(first.stageState?.stage_1?.hitDate);

  const second = ruleDistance({ ...baseHolding, rule_stage_state: first.stageState }, { price: 84 }, {
    points: [...history.points, { date: '2026-10-04', price: 84 }],
  });
  assert.equal(second.state, 'breached');
  assert.equal(second.stageState?.stage_2?.peak, 100);
  assert.equal(second.stageState?.stage_2?.activatedDate, '2026-10-02');
});
