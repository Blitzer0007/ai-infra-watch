import assert from 'node:assert/strict';
import test from 'node:test';
import { requireAdjustedHistory } from '../../api/_market-data.js';

const sample = {
  provider: 'yahoo',
  stale: false,
  points: [
    { date: '2026-01-02', price: 100, adjustedPrice: 80, adjusted: true },
    { date: '2026-01-05', price: 101, adjustedPrice: 81, adjusted: true },
  ],
};

test('uses adjusted close as the canonical backtest price and preserves raw close', () => {
  const result = requireAdjustedHistory(sample);
  assert.equal(result.priceBasis, 'split_dividend_adjusted_close');
  assert.equal(result.points[0].price, 80);
  assert.equal(result.points[0].adjustedPrice, 80);
  assert.equal(result.points[0].rawPrice, 100);
  assert.equal(result.points[1].price, 81);
});

test('rejects Finnhub/Alpha-style raw-only fallback history', () => {
  assert.throws(() => requireAdjustedHistory({
    provider: 'finnhub',
    stale: false,
    points: [{ date: '2026-01-02', price: 100, adjustedPrice: null, adjusted: false }],
  }), /complete split\/dividend-adjusted close series/);
});

test('rejects partial adjusted coverage rather than silently dropping dates', () => {
  assert.throws(() => requireAdjustedHistory({
    ...sample,
    points: [...sample.points, { date: '2026-01-06', price: 102, adjustedPrice: null, adjusted: false }],
  }), /complete split\/dividend-adjusted close series/);
});

test('rejects stale cached history', () => {
  assert.throws(() => requireAdjustedHistory({ ...sample, stale: true }), /stale/);
});

test('rejects duplicate dates', () => {
  assert.throws(() => requireAdjustedHistory({
    ...sample,
    points: [...sample.points, sample.points[1]],
  }), /duplicate market dates/);
});
