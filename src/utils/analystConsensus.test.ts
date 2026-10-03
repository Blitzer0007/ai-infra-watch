import { describe, expect, it } from 'vitest';
import { analystFreshness, normalizeAnalystConsensus } from './analystConsensus';

describe('normalizeAnalystConsensus', () => {
  it('consolidates rating counts into percentages and target upside', () => {
    const result = normalizeAnalystConsensus({
      source: 'Finnhub analyst',
      retrievedAt: '2026-10-03T10:00:00.000Z',
      analystCount: 20,
      currentPrice: 100,
      recommendation: { strongBuy: 4, buy: 8, hold: 5, sell: 2, strongSell: 1 },
      priceTarget: { low: 80, mean: 125, median: 120, high: 160 },
    });

    expect(result.analystCount).toBe(20);
    expect(result.percentages.buy).toBe(40);
    expect(result.target.medianUpsidePct).toBeCloseTo(20);
    expect(result.target.meanUpsidePct).toBeCloseTo(25);
    expect(result.target.rangePct).toBeCloseTo(100);
  });

  it('does not manufacture percentages when no analysts are reported', () => {
    const result = normalizeAnalystConsensus({
      recommendation: { strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 },
      priceTarget: { median: 120 },
      currentPrice: 100,
    });

    expect(result.analystCount).toBe(0);
    expect(result.percentages.buy).toBe(0);
    expect(result.target.medianUpsidePct).toBeCloseTo(20);
  });
});

describe('analystFreshness', () => {
  const now = Date.parse('2026-10-03T12:00:00.000Z');

  it('classifies freshness by retrieval age', () => {
    expect(analystFreshness('2026-10-03T11:00:00.000Z', now)).toBe('fresh');
    expect(analystFreshness('2026-10-02T00:00:00.000Z', now)).toBe('aging');
    expect(analystFreshness('2026-09-30T00:00:00.000Z', now)).toBe('stale');
    expect(analystFreshness(null, now)).toBe('unknown');
  });
});
