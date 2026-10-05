import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePortfolioExposure, type ExposureEvidenceItem } from './evidenceExposure';

const assessed: ExposureEvidenceItem = {
  level: 'Direct',
  assessment: 'assessed',
  basis: 'baseline',
  sourceCounts: { profile: 0, contracts: 0, news: 0 },
};
const notAssessed: ExposureEvidenceItem = {
  level: 'Limited',
  assessment: 'not_assessed',
  basis: 'no baseline or matching evidence',
  sourceCounts: { profile: 0, contracts: 0, news: 0 },
};

test('portfolio exposure validation', () => {
  test('returns VALIDATED when every holding has all three dimensions assessed', () => {
    const result = validatePortfolioExposure([
      { symbol: 'NVDA', taiwan: assessed, power: assessed, export: assessed },
    ]);
    assert.equal(result.status, 'VALIDATED');
    assert.equal(result.assessedDimensions, 3);
    assert.equal(result.fullyAssessedHoldings, 1);
    assert.equal(result.assessedPct, 100);
  });

  test('returns PARTIAL when some dimensions are not assessed', () => {
    const result = validatePortfolioExposure([
      { symbol: 'CUSTOM', taiwan: assessed, power: notAssessed, export: assessed },
    ]);
    assert.equal(result.status, 'PARTIAL');
    assert.equal(result.assessedDimensions, 2);
    assert.equal(result.notAssessedDimensions, 1);
    assert.ok(Math.abs(result.assessedPct - 66.7) < 0.1);
  });

  test('does not call an empty portfolio assessed', () => {
    assert.equal(validatePortfolioExposure([]).status, 'NOT ASSESSED');
  });
});