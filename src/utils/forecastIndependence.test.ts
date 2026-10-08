import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { independentForecastRows } from '../../server/utils/forecastIndependence.js';
import { calibrationVerdict } from '../../server/utils/forecastCalibration.js';

function row(overrides = {}) {
  return {
    ticker: 'NVDA',
    horizon: 5,
    status: 'verified',
    created_at: '2026-10-01T10:00:00Z',
    target_date: '2026-10-08',
    ...overrides,
  };
}

describe('forecast independence and calibration', () => {
  it('treats 5D and 20D forecasts as separate streams', () => {
    const rows = [
      row(),
      row({ horizon: 20, target_date: '2026-10-29' }),
    ];
    assert.equal(independentForecastRows(rows).length, 2);
  });

  it('rejects overlapping windows for the same ticker and horizon', () => {
    const rows = [
      row({ created_at: '2026-10-01T10:00:00Z', target_date: '2026-10-08' }),
      row({ created_at: '2026-10-07T10:00:00Z', target_date: '2026-10-14' }),
      row({ created_at: '2026-10-15T10:00:00Z', target_date: '2026-10-22' }),
    ];
    assert.equal(independentForecastRows(rows).length, 2);
  });

  it('does not manufacture independence when the forecast window dates are missing', () => {
    assert.equal(independentForecastRows([row({ created_at: null })]).length, 0);
    assert.equal(independentForecastRows([row({ target_date: null })]).length, 0);
  });

  it('keeps calibration insufficient until 50 independent samples', () => {
    assert.equal(
      calibrationVerdict({ lowerPct: 45, upperPct: 55 }, { lowerPct: 75, upperPct: 85 }, 49),
      'insufficient',
    );
  });

  it('only labels clearly narrow or wide calibration when the confidence interval excludes the target', () => {
    assert.equal(
      calibrationVerdict({ lowerPct: 10, upperPct: 35 }, { lowerPct: 20, upperPct: 65 }, 50),
      'too narrow',
    );
    assert.equal(
      calibrationVerdict({ lowerPct: 65, upperPct: 90 }, { lowerPct: 90, upperPct: 98 }, 50),
      'too wide',
    );
    assert.equal(
      calibrationVerdict({ lowerPct: 35, upperPct: 65 }, { lowerPct: 70, upperPct: 90 }, 50),
      'well calibrated',
    );
  });
});
