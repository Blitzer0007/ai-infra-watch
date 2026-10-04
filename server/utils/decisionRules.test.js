import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRuleStages,
  ruleDistance,
  simulateSameCash,
  calculateActualPortfolio,
  countIndependentForecasts,
  scoreDecision,
} from './decisionRules.js';

const rklb = {
  symbol: 'RKLB',
  average_cost: 70.57,
  loss_limit_pct: 20,
  rule_stages: [
    { type: 'stop', pct: 20, basis: 'average_cost' },
    { type: 'take_profit', pct: 20, action: 'sell_fraction', fraction: 0.5 },
    { type: 'trailing', pct: 15, activates_after: 'take_profit' },
  ],
  rule_stage_state: {},
};

test('directional broker levels distinguish downside and upside', () => {
  const holding = { ...rklb, broker_alerts: [
    { price: 56.46, direction: 'below', label: 'stop' },
    { price: 84.68, direction: 'above', label: 'target' },
  ], rule_stages: [] };
  assert.equal(ruleDistance(holding, { price: 70 }).state, 'clear');
  assert.equal(ruleDistance(holding, { price: 56 }).state, 'breached');
  assert.equal(ruleDistance(holding, { price: 85 }).state, 'target-reached');
  assert.equal(ruleDistance(holding, { price: 58 }).state, 'near');
});

test('staged trailing activates only after take profit and uses post-activation peak', () => {
  const preTarget = evaluateRuleStages(rklb, 68, { points: [
    { date: '2026-10-01', price: 70 },
    { date: '2026-10-02', price: 80 },
    { date: '2026-10-03', price: 68 },
  ]});
  assert.equal(preTarget.state, 'clear');
  assert.equal(preTarget.rules.some(rule => rule.type === 'trailing stop'), false);

  const targetHit = evaluateRuleStages(rklb, 85, { points: [
    { date: '2026-10-01', price: 70 },
    { date: '2026-10-02', price: 85 },
  ]});
  assert.equal(targetHit.state, 'target-reached');
  assert.equal(targetHit.nextState.stage1_hit_at, '2026-10-02');

  const postTarget = evaluateRuleStages(
    { ...rklb, rule_stage_state: targetHit.nextState },
    84,
    { points: [
      { date: '2026-10-01', price: 70 },
      { date: '2026-10-02', price: 85 },
      { date: '2026-10-03', price: 100 },
      { date: '2026-10-04', price: 84 },
    ]},
  );
  assert.equal(postTarget.state, 'breached');
  assert.ok(postTarget.rules.some(rule => rule.type === 'trailing stop' && rule.breached));
  assert.equal(postTarget.nextState.stage2_peak_price, 100);
});

test('staged state survives a restart through persisted rule_stage_state', () => {
  const saved = { stage1_hit_at: '2026-10-02', stage1_hit_price: 85, stage2_peak_price: 100 };
  const result = evaluateRuleStages({ ...rklb, rule_stage_state: saved }, 90, { points: [
    { date: '2026-10-02', price: 85 },
    { date: '2026-10-03', price: 100 },
    { date: '2026-10-04', price: 90 },
  ]});
  assert.equal(result.nextState.stage1_hit_at, '2026-10-02');
  assert.equal(result.nextState.stage2_peak_price, 100);
});

test('same-cash benchmark uses last price on or before trade date', () => {
  const result = simulateSameCash(
    [{ trade_date: '2026-10-04', transaction_type: 'BUY', amount: 100, brokerage: 0 }],
    { points: [
      { date: '2026-10-02', price: 100 },
      { date: '2026-10-05', price: 105 },
    ]},
    105,
  );
  assert.equal(result.transactionsUsed, 1);
  assert.equal(result.status, 'complete');
  assert.equal(result.shares, 1);
});

test('portfolio value uses stale fallback and marks true missing quote as partial', () => {
  const fallback = calculateActualPortfolio(
    [{ symbol: 'RKLB', quantity: 1 }],
    [{ transaction_type: 'BUY', amount: 70, brokerage: 0 }],
    { RKLB: null },
    { RKLB: { points: [{ date: '2026-10-03', price: 72 }] } },
    new Date('2026-10-04T12:00:00Z'),
  );
  assert.equal(fallback.currentValue, 72);
  assert.equal(fallback.quoteCoveragePct, 100);
  assert.equal(fallback.status, 'complete');

  const missing = calculateActualPortfolio(
    [{ symbol: 'RKLB', quantity: 1 }, { symbol: 'NVDA', quantity: 1 }],
    [{ transaction_type: 'BUY', amount: 70, brokerage: 0 }],
    { RKLB: null, NVDA: null },
    { RKLB: { points: [{ date: '2026-10-03', price: 72 }] } },
    new Date('2026-10-04T12:00:00Z'),
  );
  assert.equal(missing.quoteCoveragePct, 50);
  assert.equal(missing.status, 'partial');
  assert.equal(missing.unavailableQuotes, 1);
});

test('independence counts overlapping 20-session forecasts once per ticker anchor', () => {
  const rows = [
    '2026-10-01','2026-10-02','2026-10-05','2026-10-06','2026-10-07'
  ].map((created_at, i) => ({ ticker: 'NVDA', status: 'verified', created_at: created_at + 'T12:00:00Z', verified_at: created_at }));
  assert.equal(countIndependentForecasts(rows), 1);
});

test('decision score respects decision intent', () => {
  assert.equal(scoreDecision('EXIT_REVIEW', 5), -5);
  assert.equal(scoreDecision('HOLD', 5), 5);
  assert.equal(scoreDecision('ADD_REVIEW', -2), -2);
});
