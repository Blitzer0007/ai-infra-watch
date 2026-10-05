import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFreshness, freshnessLabel } from './freshness';

test('freshness labels', () => {
  const now = Date.parse('2026-10-05T10:00:00.000Z');

  test('labels a recent market timestamp Live', () => {
    assert.equal(freshnessLabel({ marketTime: '2026-10-05T09:55:00.000Z' }, now), 'Live');
  });

  test('labels a moderately old timestamp Delayed', () => {
    assert.equal(freshnessLabel({ retrievedAt: '2026-10-05T08:30:00.000Z' }, now), 'Delayed');
  });

  test('labels an old timestamp Last close', () => {
    assert.equal(freshnessLabel({ retrievedAt: '2026-10-04T20:00:00.000Z' }, now), 'Last close');
  });

  test('forces Last close when the provider marks data stale', () => {
    assert.equal(freshnessLabel({ retrievedAt: '2026-10-05T09:59:00.000Z', stale: true }, now), 'Last close');
  });

  test('prefers market time over retrieval time', () => {
    const result = classifyFreshness({
      marketTime: '2026-10-05T07:00:00.000Z',
      retrievedAt: '2026-10-05T09:59:00.000Z',
    }, now);
    assert.equal(result.label, 'Last close');
    assert.equal(result.ageMinutes, 180);
  });
});