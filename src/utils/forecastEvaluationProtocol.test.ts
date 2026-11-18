import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildForecastEvaluationProtocol as review } from './forecastEvaluationProtocol.js';

const today = '2026-11-18';
const base = {
  ticker: 'FICT', horizon: 20, status: 'verified',
  created_at: '2026-09-01T09:00:00Z', target_date: '2026-09-29',
  verified_at: '2026-09-30T12:00:00Z', median: 5, actual_return: 7,
  p25: 1, p75: 9, p10: -4, p90: 14,
  created_source: 'fictional', evidence_snapshot: { secret: 'should-not-escape' },
};
const evaluate = (rows: unknown[], overrides = {}) => review(rows, { asOfDate: today, ...overrides });

describe('Milestone 4 forecast-evaluation lifecycle contract', () => {
  it('treats an empty or absent source window as unknown historical coverage, not a zero forecast error', () => {
    const empty = evaluate([]);
    assert.equal(empty.coverage.completeUniverse, false);
    assert.equal(empty.lifecycle.total, 0);
    assert.equal(empty.metrics.middle50.coveragePct, null);
    assert.equal(empty.metrics.direction.accuracyPct, null);
    assert.equal(empty.interpretation, 'insufficient');
    assert.equal(empty.decisionEligible, false);
    assert.equal(evaluate(null as unknown as unknown[]).lifecycle.total, 0);
  });

  it('partitions pending forecasts into due, not due, and indeterminate without manufacturing an outcome', () => {
    const rows = [
      { ticker: 'A', status: 'pending', horizon: 5, target_date: '2026-11-17' },
      { ticker: 'A', status: 'pending', horizon: 5, target_date: today },
      { ticker: 'B', status: 'pending', horizon: 20, target_date: '2026-12-01' },
      { ticker: 'C', status: 'pending', horizon: 20, target_date: '2026-02-30' },
      { ticker: 'D', status: 'failed', horizon: 5 },
    ];
    const report = evaluate(rows, { truncated: true });
    assert.equal(report.lifecycle.pendingDueForReview, 2);
    assert.equal(report.lifecycle.pendingNotDue, 1);
    assert.equal(report.lifecycle.pendingUnknownTarget, 1);
    assert.equal(report.lifecycle.unknownStatus, 1);
    assert.equal(report.lifecycle.verifiedReported, 0);
    assert.equal(report.metrics.medianAbsoluteErrorPctPoints, null);
    assert.equal(report.coverage.truncated, true);
    assert.equal(report.horizons['5D'].pendingDueForReview, 2);
  });

  it('reports scorable vs invalid verified rows and filters overlapping ticker/horizon windows', () => {
    const rows = [
      base,
      { ...base, created_at: '2026-09-10T09:00:00Z', target_date: '2026-10-03', verified_at: '2026-10-04T12:00:00Z', median: 99 },
      { ...base, created_at: '2026-10-05T09:00:00Z', target_date: '2026-10-29', verified_at: '2026-10-30T12:00:00Z', actual_return: -2, median: -3 },
      { ...base, ticker: 'MISS', actual_return: null },
      { ...base, ticker: 'NA', created_at: '2026-09-01', target_date: '2026-10-01' },
      { ...base, ticker: 'FUT', target_date: '2027-01-01' },
      { ...base, ticker: 'PRE', verified_at: '2026-09-02T12:00:00Z' },
      { ...base, ticker: 'ZERO', median: null },
    ];
    const result = evaluate(rows);
    assert.equal(result.lifecycle.total, 8);
    assert.equal(result.lifecycle.verifiedReported, 8);
    assert.equal(result.lifecycle.verifiedScorable, 3);
    assert.equal(result.lifecycle.verifiedUnscorable, 5);
    assert.equal(result.lifecycle.independentScorable, 2);
    assert.equal(result.lifecycle.overlappingExcluded, 1);
    assert.equal(result.exclusions.missingOrInvalidOutcome, 1);
    assert.equal(result.exclusions.missingOrInvalidWindow, 1);
    assert.equal(result.exclusions.futureTargetMarkedVerified, 1);
    assert.equal(result.exclusions.invalidVerificationTime, 1);
    assert.equal(result.exclusions.missingOrInvalidMedian, 1);
    assert.equal(result.metrics.medianAbsoluteErrorPctPoints, 1.5);
    assert.equal(result.metrics.direction.accuracyPct, 100);
    assert.equal(result.metrics.middle50.n, 2);
    // The first fictional interval contains +7%; the second does not contain -2%.
    // A denominator of two is correct, but the number of hits is one.
    assert.equal(result.metrics.middle50.hits, 1);
    assert.equal(result.metrics.declaredCreationSourceCount, 2);
    assert.equal(result.metrics.independentlyAuthenticatedSourceCount, null);
    assert.doesNotMatch(JSON.stringify(result), /should-not-escape|FICT|fictional/);
  });

  it('excludes malformed and inverted quantiles from calibration denominator without claiming 0% coverage', () => {
    const rows = [
      { ...base, p25: null, p75: 9, p10: null, p90: null },
      { ...base, ticker: 'ALT', p25: 10, p75: 0, p10: 20, p90: -20 },
      { ...base, ticker: 'VAL', p25: 1, p75: 3, p10: -5, p90: 5 },
    ];
    const result = evaluate(rows);
    assert.equal(result.metrics.middle50.n, 1);
    assert.equal(result.metrics.middle50.hits, 0);
    assert.equal(result.metrics.wide80.n, 1);
    assert.equal(result.metrics.wide80.hits, 0);
    assert.ok(Array.isArray(result.metrics.middle50.wilson95Pct));
    assert.equal(evaluate([{ ...base, p25: null, p75: null }]).metrics.middle50.coveragePct, null);
  });

  it('keeps unavailable market direction distinct from flat returns and preserves zero-return error as a real value', () => {
    const result = evaluate([{ ...base, actual_return: 0, median: 0, p25: 0, p75: 0 }]);
    assert.equal(result.metrics.direction.n, 0);
    assert.equal(result.metrics.direction.accuracyPct, null);
    assert.equal(result.metrics.medianAbsoluteErrorPctPoints, 0);
    assert.equal(result.metrics.middle50.coveragePct, 100);
  });

  it('rejects future-dated verification rather than including unobserved outcomes in accuracy', () => {
    const report = evaluate([
      { ...base, ticker: 'FUTURE_VERIFICATION', verified_at: '2026-11-19T00:01:00Z' },
      { ...base, ticker: 'VALID_VERIFICATION' },
    ]);
    assert.equal(report.lifecycle.verifiedReported, 2);
    assert.equal(report.lifecycle.verifiedUnscorable, 1);
    assert.equal(report.exclusions.invalidVerificationTime, 1);
    assert.equal(report.lifecycle.independentScorable, 1);
    assert.equal(report.metrics.direction.n, 1);
    assert.equal(report.decisionEligible, false);
  });

  it('separates 5D and 20D cohorts without claiming cross-horizon market independence', () => {
    const five = {
      ...base, horizon: 5, created_at: '2026-10-01T09:00:00Z',
      target_date: '2026-10-09', verified_at: '2026-10-10T09:00:00Z',
    };
    const twenty = {
      ...base, horizon: 20, created_at: '2026-10-01T09:00:00Z',
      target_date: '2026-10-29', verified_at: '2026-10-30T09:00:00Z',
    };
    const report = evaluate([five,twenty]);
    assert.equal(report.lifecycle.independentScorable, 2);
    assert.equal(report.horizons['5D'].independentScorable, 1);
    assert.equal(report.horizons['20D'].independentScorable, 1);
    assert.match(report.limitations.join(' '), /across symbols and horizons are not independent/);
    assert.equal(report.decisionEligible, false);
  });

  it('rejects JS coercion of arrays, objects, whitespace and booleans in forecast values', () => {
    const malformed = [
      { ...base, ticker: 'ARRAY_OUTCOME', actual_return: [] },
      { ...base, ticker: 'ARRAY_MEDIAN', median: ['5'] },
      { ...base, ticker: 'WHITESPACE_OUTCOME', actual_return: '   ' },
      { ...base, ticker: 'OBJECT_OUTCOME', actual_return: { valueOf: () => 7 } },
      { ...base, ticker: 'ARRAY_HORIZON', horizon: [20] },
      { ...base, ticker: 'ARRAY_INTERVAL', p25: [1], p75: 9 },
    ];
    const result = evaluate(malformed);
    assert.equal(result.lifecycle.verifiedReported, 6);
    assert.equal(result.exclusions.missingOrInvalidOutcome, 3);
    assert.equal(result.exclusions.missingOrInvalidMedian, 1);
    assert.equal(result.exclusions.invalidHorizon, 1);
    assert.equal(result.lifecycle.independentScorable, 1);
    assert.equal(result.metrics.middle50.n, 0);
    assert.equal(result.metrics.middle50.coveragePct, null);
    assert.equal(result.decisionEligible, false);
  });

  it('preserves genuine zero and finite numeric strings without inventing observations', () => {
    const result = evaluate([{ ...base, ticker: 'DECIMAL', horizon: '20', median: '0', actual_return: '0', p25: '0', p75: '0' }]);
    assert.equal(result.lifecycle.independentScorable, 1);
    assert.equal(result.metrics.medianAbsoluteErrorPctPoints, 0);
    assert.equal(result.metrics.middle50.n, 1);
    assert.equal(result.metrics.middle50.coveragePct, 100);
    assert.equal(result.metrics.direction.n, 0);
  });

  it('declines fabricated dates, future verification, invalid horizons and malformed outcome types', () => {
    const report = evaluate([
      { ...base, ticker: 'A', horizon: 'nope' },
      { ...base, ticker: 'B', target_date: '2026-02-30' },
      { ...base, ticker: 'C', created_at: '2026-09-01T09:00:00' },
      { ...base, ticker: 'D', actual_return: 'NaN' },
      { ...base, ticker: 'E', median: true },
    ]);
    assert.equal(report.lifecycle.verifiedUnscorable, 5);
    assert.equal(report.exclusions.invalidHorizon, 1);
    assert.equal(report.exclusions.missingOrInvalidWindow, 2);
    assert.equal(report.exclusions.missingOrInvalidOutcome, 1);
    assert.equal(report.exclusions.missingOrInvalidMedian, 1);
    assert.throws(() => review([], { asOfDate: '2026-02-30' }), /Invalid UTC/);
  });
});
