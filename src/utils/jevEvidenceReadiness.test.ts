import assert from 'node:assert/strict';
import test from 'node:test';
import { hasFreshEvidence, isJevEvidenceGateReady } from './jevEvidenceReadiness';

test('reads the canonical nested freshness records returned by the Python agent', () => {
  assert.equal(hasFreshEvidence([
    { tool: 'stocks.get_quotes', freshness: { status: 'FRESH', age_hours: 1 } },
    { tool: 'news.search', freshness: { status: 'FRESH', age_hours: 3 } },
  ]), true);
});

test('accepts legacy flat freshness aliases but rejects stale or unknown sources', () => {
  assert.equal(hasFreshEvidence([{ status: 'FRESH' }, { state: 'verified' }]), true);
  assert.equal(hasFreshEvidence([{ freshness: 'current' }]), true);
  assert.equal(hasFreshEvidence([{ freshness: { status: 'AGING' } }]), false);
  assert.equal(hasFreshEvidence([{ tool: 'news.search', freshness: { status: 'UNKNOWN' } }]), false);
  assert.equal(hasFreshEvidence([]), false);
  assert.equal(hasFreshEvidence(null), false);
});

test('only a successful, enabled, non-fallback stop decision releases the evidence gate', () => {
  const base = {
    availabilityComplete: true,
    researchOk: true,
    gate: { enabled: true, fallback: false, action: 'stop' },
  };
  assert.equal(isJevEvidenceGateReady(base), true);
  assert.equal(isJevEvidenceGateReady({ ...base, gate: { ...base.gate, action: 'continue' } }), false);
  assert.equal(isJevEvidenceGateReady({ ...base, gate: { ...base.gate, action: 'gather_more' } }), false);
  assert.equal(isJevEvidenceGateReady({ ...base, gate: { ...base.gate, fallback: true } }), false);
  assert.equal(isJevEvidenceGateReady({ ...base, gate: { ...base.gate, fallback: undefined } }), false);
  assert.equal(isJevEvidenceGateReady({ ...base, gate: { ...base.gate, enabled: false } }), false);
  assert.equal(isJevEvidenceGateReady({ ...base, researchOk: false }), false);
  assert.equal(isJevEvidenceGateReady({ ...base, availabilityComplete: false }), false);
});
