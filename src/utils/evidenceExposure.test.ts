import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateExposureWeightedMacroLoad, validatePortfolioExposure, type ExposureEvidenceItem } from './evidenceExposure';

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

test('exposure validation: all dimensions assessed is VALIDATED', () => {
  const result = validatePortfolioExposure([
    { symbol: 'NVDA', taiwan: assessed, power: assessed, export: assessed },
  ]);
  assert.equal(result.status, 'VALIDATED');
  assert.equal(result.assessedDimensions, 3);
  assert.equal(result.fullyAssessedHoldings, 1);
  assert.equal(result.assessedPct, 100);
});

test('exposure validation: partial coverage is PARTIAL', () => {
  const result = validatePortfolioExposure([
    { symbol: 'CUSTOM', taiwan: assessed, power: notAssessed, export: assessed },
  ]);
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.assessedDimensions, 2);
  assert.equal(result.notAssessedDimensions, 1);
  assert.ok(Math.abs(result.assessedPct - 66.7) < 0.1);
});

test('exposure validation: empty portfolio is NOT ASSESSED', () => {
  assert.equal(validatePortfolioExposure([]).status, 'NOT ASSESSED');
});
test('exposure-weighted macro load separates assessed and worst-case missing evidence', () => {
    const result = calculateExposureWeightedMacroLoad([
      { symbol: 'AAA', value: 100, taiwan: assessed, power: notAssessed, export: assessed },
    ], [
      { title: 'Taiwan advanced-node exposure', impactRating: 'high' },
      { title: 'Data-center power availability', impactRating: 'medium' },
      { title: 'AI-chip export controls', impactRating: 'high' },
    ]);
    assert.equal(result.assessedLoad, 24);
    assert.equal(result.worstCaseLoad, 30);
  assert.equal(result.assessedCoveragePct, 66.7);
});