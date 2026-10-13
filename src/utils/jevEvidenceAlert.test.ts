import assert from 'node:assert/strict';
import test from 'node:test';
import { describeJevEvidenceGap } from './jevEvidenceAlert';

test('explains generic evidence insufficiency when no required families are declared', () => {
  const result = describeJevEvidenceGap({
    complete: false,
    missing: [],
    observed_families: ['market', 'news'],
    usable_families: ['market'],
    usable_family_count: 1,
    channels: { market: { status: 'AVAILABLE' }, news: { status: 'EMPTY' } },
  }, { minimum_independent_families: 2 }, 'stop');
  assert.match(result.message, /usable independent families: 1\/2 minimum/);
  assert.match(result.message, /missing required families: none declared/);
  assert.match(result.message, /news=EMPTY/);
  assert.match(result.message, /JEV action was “stop”/);
  assert.ok(result.dedupeSuffix.includes('usable=1/2'));
});

test('reports explicit missing requirements and failed observed channels', () => {
  const result = describeJevEvidenceGap({
    complete: false,
    missing: ['regulatory_primary'],
    observed_families: ['news', 'regulatory_primary'],
    usable_families: ['news'],
    usable_family_count: 1,
    channels: { news: { status: 'AVAILABLE' }, regulatory_primary: { status: 'FAILED' } },
  }, { minimum_independent_families: 2, missing_required_families: ['regulatory_primary'] }, 'gather_more');
  assert.match(result.message, /regulatory_primary/);
  assert.match(result.message, /regulatory_primary=FAILED/);
  assert.match(result.message, /reported JEV action: gather_more/);
});

test('does not call every unobserved optional channel missing', () => {
  const result = describeJevEvidenceGap({
    complete: false,
    missing: [],
    observed_families: [],
    usable_families: [],
    usable_family_count: 0,
    channels: { market: { status: 'MISSING' }, news: { status: 'MISSING' } },
  }, { minimum_independent_families: 2 }, 'continue');
  assert.match(result.message, /usable independent families: 0\/2 minimum/);
  assert.doesNotMatch(result.message, /market=MISSING/);
  assert.match(result.message, /none declared/);
});
