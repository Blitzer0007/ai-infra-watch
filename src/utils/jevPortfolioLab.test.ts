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
      { symbol: 'TEAM', weight: 0.15, sector: 'collaboration' }, { symbol: 'GOOGL', weight: 0.15, sector: 'search' },
      { symbol: 'AMZN', weight: 0.15, sector: 'retail' }],
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
  assert.ok(Math.abs(result.totalCost - 1) < 1e-8);
});

test('net returns deduct transaction costs', () => {
  assert.equal(netReturnPct(10, 5000, 10000, 20), 9.9);
});


import { runHistoricalPaperBacktest, type HistoricalPrice } from './jevPortfolioLab';

function history(): HistoricalPrice[] {
  const rows: HistoricalPrice[] = [];
  const series: Record<string, number[]> = { MSFT: [100, 110, 121], SPY: [100, 105, 110.25], QQQ: [100, 106, 112.36] };
  const dates = ['2026-01-01', '2026-01-08', '2026-01-15'];
  for (const symbol of Object.keys(series)) dates.forEach((date, i) => rows.push({
    symbol, date, close: series[symbol][i], availableAt: date + 'T22:00:00Z',
  }));
  return rows;
}

test('historical backtest compares strategy with both benchmarks and applies costs', () => {
  const result = runHistoricalPaperBacktest({
    prices: history(), target: [{ symbol: 'MSFT', weight: 0.5, sector: 'software' }],
    startCapital: 10000, costBps: 10, minimumObservations: 50,
  });
  assert.equal(result.startDate, '2026-01-01');
  assert.equal(result.endDate, '2026-01-15');
  assert.equal(result.observations, 3);
  assert.ok(result.strategyReturnPct < 21);
  assert.ok(result.spyReturnPct > 10);
  assert.ok(result.qqqReturnPct > result.spyReturnPct);
  assert.ok(result.totalTransactionCostsPct > 0);
  assert.equal(result.evidenceStatus, 'insufficient');
});

test('historical backtest rejects data unavailable at the decision cutoff', () => {
  assert.throws(() => runHistoricalPaperBacktest({
    prices: history(), target: [{ symbol: 'MSFT', weight: 0.5, sector: 'software' }],
    startCapital: 10000,
    decisionCutoffByDate: { '2026-01-08': '2026-01-08T21:00:00Z' },
  }), /Look-ahead data rejected/);
});

test('historical backtest rejects duplicate symbol/date rows', () => {
  const prices = history();
  prices.push({ ...prices[0] });
  assert.throws(() => runHistoricalPaperBacktest({
    prices, target: [{ symbol: 'MSFT', weight: 0.5, sector: 'software' }], startCapital: 10000,
  }), /Duplicate historical price/);
});

test('historical backtest requires common dates for portfolio and both benchmarks', () => {
  assert.throws(() => runHistoricalPaperBacktest({
    prices: history().filter(row => !(row.symbol === 'QQQ' && row.date === '2026-01-08')),
    target: [{ symbol: 'MSFT', weight: 0.5, sector: 'software' }], startCapital: 10000,
  }), /common dates for portfolio and both benchmarks/);
});
