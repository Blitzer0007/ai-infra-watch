import assert from 'node:assert/strict';
import test from 'node:test';
import { hasFreshMarketHistory } from '../utils/forecastHistoryGuard.js';

test('accepts provider history and a recent non-stale cache result', () => {
  const points = [{ date: '2026-10-30', price: 100 }];
  assert.equal(hasFreshMarketHistory({ points, stale: false }), true);
  assert.equal(hasFreshMarketHistory({ points, stale: false, cached: true }), true);
});

test('rejects explicit stale fallback history', () => {
  assert.equal(hasFreshMarketHistory({
    points: [{ date: '2026-10-30', price: 100 }],
    stale: true,
    cached: true,
    providerStatus: 'STALE_FALLBACK',
  }), false);
});

test('rejects missing, empty, and invalid price history', () => {
  assert.equal(hasFreshMarketHistory(null), false);
  assert.equal(hasFreshMarketHistory({ stale: false, points: [] }), false);
  assert.equal(hasFreshMarketHistory({ stale: false, points: [{ date: '2026-10-30', price: 0 }] }), false);
  assert.equal(hasFreshMarketHistory({ stale: false, points: [{ date: '', price: 100 }] }), false);
});
