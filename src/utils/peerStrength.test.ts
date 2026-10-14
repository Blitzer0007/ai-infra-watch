import assert from 'node:assert/strict';
import test from 'node:test';
import { scorePeerStrength, type PeerFundamentalSnapshot, type PeerMetricEvidence } from './peerStrength';

const now = Date.parse('2026-10-14T00:00:00Z');
const metric = (value: number, unit: PeerMetricEvidence['unit'] = 'percent'): PeerMetricEvidence => ({
  value, unit, source: 'SEC companyfacts', observedAt: '2026-10-01T00:00:00Z', status: 'verified',
});
const snapshot = (symbol: string, overrides: Partial<Record<keyof PeerFundamentalSnapshot['metrics'], PeerMetricEvidence>> = {}): PeerFundamentalSnapshot => ({
  symbol,
  metrics: {
    size: metric(1000, 'usd'),
    revenueGrowth: metric(20),
    operatingMargin: metric(15),
    capitalIntensity: metric(10),
    analystCoverage: metric(12, 'count'),
    ...overrides,
  },
});

test('scores only fresh verified metrics and exposes source evidence and coverage', () => {
  const result = scorePeerStrength([
    snapshot('AAA', { revenueGrowth: metric(10) }),
    snapshot('BBB', { revenueGrowth: metric(30) }),
  ], { now, minimumCoverage: 0.6 });
  assert.equal(result[0].status, 'scored');
  assert.equal(result[0].score != null, true);
  assert.equal(result[0].coverage, 1);
  assert.equal(result[0].evidence.revenueGrowth?.source, 'SEC companyfacts');
  assert.equal(result[0].availableMetrics.length, 5);
});

test('does not fabricate scores when coverage is below the evidence threshold', () => {
  const sparse = snapshot('SPARSE', {
    size: { ...metric(1000, 'usd'), status: 'stale', observedAt: '2025-01-01T00:00:00Z' },
    revenueGrowth: { ...metric(20), status: 'missing', value: null },
    operatingMargin: { ...metric(10), status: 'conflicted' },
    capitalIntensity: { ...metric(10), status: 'stale', observedAt: '2025-01-01T00:00:00Z' },
    analystCoverage: { ...metric(2, 'count'), status: 'stale', observedAt: '2025-01-01T00:00:00Z' },
  });
  const result = scorePeerStrength([sparse], { now, minimumCoverage: 0.6 })[0];
  assert.equal(result.score, null);
  assert.equal(result.status, 'insufficient-evidence');
  assert.equal(result.coverage, 0);
  assert.ok(result.missingMetrics.includes('revenueGrowth'));
  assert.ok(result.staleMetrics.includes('size'));
  assert.ok(result.conflictedMetrics.includes('operatingMargin'));
});

test('normalizes size and coverage logarithmically and rewards lower capital intensity', () => {
  const results = scorePeerStrength([
    snapshot('LOW', { size: metric(100, 'usd'), revenueGrowth: metric(10), capitalIntensity: metric(80), analystCoverage: metric(1, 'count') }),
    snapshot('HIGH', { size: metric(10000, 'usd'), revenueGrowth: metric(30), capitalIntensity: metric(10), analystCoverage: metric(20, 'count') }),
  ], { now, minimumCoverage: 0.6 });
  const low = results.find(item => item.symbol === 'LOW')!;
  const high = results.find(item => item.symbol === 'HIGH')!;
  assert.ok((high.score ?? 0) > (low.score ?? 0));
  assert.ok(high.availableMetrics.includes('capitalIntensity'));
});

test('excludes evidence with a missing source or future timestamp', () => {
  const result = scorePeerStrength([
    snapshot('AAA', {
      size: { ...metric(100, 'usd'), source: '' },
      revenueGrowth: { ...metric(20), observedAt: '2027-01-01T00:00:00Z' },
    }),
  ], { now, minimumCoverage: 0.1 })[0];
  assert.equal(result.evidence.size, undefined);
  assert.equal(result.evidence.revenueGrowth, undefined);
  assert.ok(result.staleMetrics.includes('size'));
  assert.ok(result.staleMetrics.includes('revenueGrowth'));
});
