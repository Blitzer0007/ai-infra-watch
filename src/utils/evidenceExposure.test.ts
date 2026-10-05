import { describe, expect, it } from 'vitest';
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

describe('portfolio exposure validation', () => {
  it('returns VALIDATED when every holding has all three dimensions assessed', () => {
    const result = validatePortfolioExposure([
      { symbol: 'NVDA', taiwan: assessed, power: assessed, export: assessed },
    ]);
    expect(result.status).toBe('VALIDATED');
    expect(result.assessedDimensions).toBe(3);
    expect(result.fullyAssessedHoldings).toBe(1);
    expect(result.assessedPct).toBe(100);
  });

  it('returns PARTIAL when some dimensions are not assessed', () => {
    const result = validatePortfolioExposure([
      { symbol: 'CUSTOM', taiwan: assessed, power: notAssessed, export: assessed },
    ]);
    expect(result.status).toBe('PARTIAL');
    expect(result.assessedDimensions).toBe(2);
    expect(result.notAssessedDimensions).toBe(1);
    expect(result.assessedPct).toBeCloseTo(66.7);
  });

  it('does not call an empty portfolio assessed', () => {
    expect(validatePortfolioExposure([]).status).toBe('NOT ASSESSED');
  });
});
