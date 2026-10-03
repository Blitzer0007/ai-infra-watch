import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { forecastSampleStatus, forecastValidationGate } from './forecastValidation';

describe('forecast validation sample gate', () => {
  it('keeps small samples explicitly insufficient', () => {
    assert.equal(forecastSampleStatus(0), 'insufficient');
    assert.equal(forecastSampleStatus(9), 'insufficient');
  });

  it('does not mark 49 observations as established validation', () => {
    assert.equal(forecastSampleStatus(49), 'developing');
    assert.equal(forecastValidationGate(49).ready, false);
  });

  it('opens the validation gate at exactly 50 verified forecasts', () => {
    const gate = forecastValidationGate(50);
    assert.equal(gate.ready, true);
    assert.equal(gate.minimumRequired, 50);
    assert.equal(gate.verifiedCount, 50);
    assert.equal(forecastSampleStatus(50), 'initial-validation');
  });

  it('handles invalid counts conservatively', () => {
    assert.equal(forecastValidationGate(Number.NaN).ready, false);
    assert.equal(forecastValidationGate(-10).verifiedCount, 0);
  });
});
