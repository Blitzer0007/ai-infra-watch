import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPaperRebalance, netReturnPct, validatePointInTimeInputs } from './jevPortfolioLab';

const decisionAt = '2026-10-09T20:00:00Z';
const executionAt = '2026-10-12T13:30:00Z';

test('rejects look-ahead observations unavailable at decision time', () => {
  assert.throws(() => validatePointInTimeInputs([
    { symbol: 'TEAM', price: 100, observedAt: '2026-10-09T20:01:00Z', availableAt: '2026-10-09T20:01:00Z' },
  ], decisionAt, executionAt), /Look-ahead data rejected/);
});

test('requires execution strictly after the decision', () => {
  assert.throws(() => validatePointInTimeInputs([], decisionAt, decisionAt), /after the decision/);
});

test('rejects position concentration above 15 percent', () => {
  assert.throws(() => buildPaperRebalance({
    current: [], target: [{ symbol: 'NOW', weight: 0.2, sector: 'software' }],
    portfolioValue: 10000, decisionAt, executionAt,
  }), /Position limit/);
});

test('rejects sector concentration above 35 percent', () => {
  assert.throws(() => buildPaperRebalance({
    current: [], target: [
      { symbol: 'NOW', weight: 0.15, sector: 'software' },
      { symbol: 'TEAM', weight: 0.15, sector: 'software' },
      { symbol: 'CRM', weight: 0.10, sector: 'software' },
    ], portfolioValue: 10000, decisionAt, executionAt,
  }), /Sector concentration/);
});

test('enforces a minimum cash reserve', () => {
  assert.throws(() => buildPaperRebalance({
    current: [], target: [{ symbol: 'MSFT', weight: 0.15, sector: 'software' }, { symbol: 'META', weight: 0.15, sector: 'internet' },
      { symbol: 'NVDA', weight: 0.15, sector: 'semiconductors' }, { symbol: 'NOW', weight: 0.15, sector: 'platforms' },
      { symbol: 'TEAM', weight: 0.15, sector: 'collaboration' }, { symbol: 'GOOGL', weight: 0.15, sector: 'search' }],
    portfolioValue: 10000, decisionAt, executionAt,
  }), /Minimum cash reserve/);
});

test('charges costs on traded notional and reports cost transparently', () => {
  const result = buildPaperRebalance({
    current: [{ symbol: 'MSFT', weight: 0.1, sector: 'software' }],
    target: [{ symbol: 'MSFT', weight: 0.15, sector: 'software' }],
    portfolioValue: 10000, decisionAt, executionAt, costBps: 20,
  });
  assert.ok(Math.abs(result.trades[0].notional - 500) < 1e-8);
  assert.equal(result.totalCost, 1);
});

test('net returns deduct transaction costs', () => {
  assert.equal(netReturnPct(10, 5000, 10000, 20), 9.9);
});
