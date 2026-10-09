import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { forecastSampleStatus, forecastValidationGate } from './forecastValidation';
import { buildForecastValidationSummary, getTickerValidationContext, summarizeForecastRows } from '../../server/utils/forecastValidation.js';

function verifiedRow(overrides: Record<string, unknown> = {}) {
  return {
    ticker: 'NVDA',
    horizon: 20,
    status: 'verified',
    median: 5,
    p25: 1,
    p75: 9,
    p10: -4,
    p90: 14,
    actual_return: 7,
    median_error: 2,
    created_at: '2026-10-01T10:00:00Z',
    target_date: '2026-10-29',
    verified_at: '2026-10-30T10:00:00Z',
    ...overrides,
  };
}

describe('forecast validation integration contract', () => {
  it('keeps the shared 50-sample gate aligned with the UI status buckets', () => {
    assert.equal(forecastSampleStatus(24), 'early');
    assert.equal(forecastSampleStatus(25), 'developing');
    assert.equal(forecastSampleStatus(49), 'developing');
    assert.equal(forecastSampleStatus(50), 'initial-validation');
    assert.equal(forecastValidationGate(50).status, '50+ validated forecasts');
  });

  it('never treats an unverified count as established validation', () => {
    assert.equal(forecastValidationGate(0).ready, false);
    assert.equal(forecastValidationGate(10).ready, false);
    assert.equal(forecastValidationGate(49).ready, false);
  });

  it('summarizes verified forecasts without counting invalid rows', () => {
    const summary = summarizeForecastRows([
      verifiedRow(),
      verifiedRow({ status: 'pending' }),
      verifiedRow({ actual_return: null }),
    ]);
    assert.equal(summary.count, 1);
    assert.equal(summary.directionalAccuracyPct, 100);
    assert.equal(summary.medianAbsoluteError, 2);
    assert.equal(summary.p25p75CoveragePct, 100);
    const fullSummary = buildForecastValidationSummary([verifiedRow()]);
    assert.equal(fullSummary.validationGate.verifiedCount, fullSummary.overall.independentCount);
    assert.equal(fullSummary.validationGate.verifiedCount, 1);
    assert.equal(fullSummary.validationGate.ready, false);
  });

  it('opens the API validation gate only when independent total and each horizon threshold are met', () => {
    const rows = Array.from({ length: 50 }, (_, index) => {
      const horizon = index < 25 ? 5 : 20;
      return verifiedRow({
        ticker: 'TKR' + String(index + 1).padStart(2, '0'),
        horizon,
        target_date: horizon === 5 ? '2026-10-08' : '2026-10-29',
      });
    });
    const summary = buildForecastValidationSummary(rows);
    assert.equal(summary.validationGate.verifiedCount, 50);
    assert.equal(summary.validationGate.independent5D, 25);
    assert.equal(summary.validationGate.independent20D, 25);
    assert.equal(summary.validationGate.ready, true);
  });

  it('groups validation by ticker and horizon and returns matching alert context', () => {
    const rows = [
      verifiedRow({ ticker: 'NVDA', horizon: 20 }),
      verifiedRow({
        ticker: 'NVDA',
        horizon: 20,
        created_at: '2026-10-30T10:00:00Z',
        target_date: '2026-11-27',
        verified_at: '2026-11-28T10:00:00Z',
        actual_return: -3,
        median: -1,
        median_error: -2,
      }),
      verifiedRow({ ticker: 'MU', horizon: 20, actual_return: 2, median: 3, median_error: -1 }),
      verifiedRow({ ticker: 'NVDA', horizon: 5, target_date: '2026-10-08' }),
    ];
    const summary = buildForecastValidationSummary(rows);
    assert.equal(summary.byTickerHorizon.length, 3);
    assert.equal(summary.overall.independentCount, 4);

    const context = getTickerValidationContext(rows, 'nvda', 20);
    assert.equal(context?.ticker, 'NVDA');
    assert.equal(context?.horizon, 20);
    assert.equal(context?.count, 2);
    assert.equal(context?.sampleStatus, 'insufficient');
    assert.equal(context?.directionalAccuracyPct, 100);
  });
});
