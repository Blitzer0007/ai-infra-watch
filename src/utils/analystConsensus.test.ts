import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analystFreshness, normalizeAnalystConsensus } from './analystConsensus';

test('normalizes analyst recommendation counts and target upside', () => {
  const result = normalizeAnalystConsensus({
    recommendation: { strongBuy: 2, buy: 6, hold: 2, sell: 1, strongSell: 1 },
    analystCount: 12,
    currentPrice: 100,
    priceTarget: { low: 80, mean: 125, median: 120, high: 160, lastUpdated: '2026-10-01' },
    source: 'test-source',
    retrievedAt: '2026-10-02T00:00:00.000Z',
  });

  assert.equal(result.analystCount, 12);
  assert.equal(result.ratings.buy, 6);
  assert.equal(result.percentages.buy, 50);
  assert.equal(result.target.medianUpsidePct, 20);
  assert.equal(result.target.meanUpsidePct, 25);
  assert.equal(result.target.rangePct, 100);
  assert.equal(result.source, 'test-source');
});

test('falls back to rating total when analyst count is missing', () => {
  const result = normalizeAnalystConsensus({
    recommendation: { strongBuy: 1, buy: 2, hold: 1, sell: 0, strongSell: 0 },
  });

  assert.equal(result.analystCount, 4);
  assert.equal(result.percentages.buy, 50);
});

test('classifies analyst freshness consistently', () => {
  const now = Date.parse('2026-10-03T00:00:00.000Z');
  assert.equal(analystFreshness('2026-10-02T12:00:00.000Z', now), 'fresh');
  assert.equal(analystFreshness('2026-09-30T00:00:00.000Z', now), 'aging');
  assert.equal(analystFreshness('2026-09-20T00:00:00.000Z', now), 'stale');
  assert.equal(analystFreshness(null, now), 'unknown');
});


test('treats zero and negative analyst targets as unavailable', () => {
  const result = normalizeAnalystConsensus({
    analystCount: 12,
    currentPrice: 100,
    priceTarget: { low: 0, mean: -1, median: 0, high: 160 },
  });
  const valid = normalizeAnalystConsensus({
    analystCount: 12,
    currentPrice: 100,
    priceTarget: { low: 80, mean: 125, median: 120, high: 160 },
  });
  assert.equal(result.target.low, null);
  assert.equal(result.target.mean, null);
  assert.equal(result.target.median, null);
  assert.equal(result.target.high, 160);
  assert.equal(result.target.medianUpsidePct, null);
  assert.equal(valid.target.median, 120);
  assert.equal(valid.target.medianUpsidePct, 20);
});
