import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { forecastSampleStatus, forecastValidationGate } from './forecastValidation';

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
});
