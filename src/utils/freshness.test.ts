import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFreshness, freshnessLabel } from './freshness';

const now = Date.parse('2026-10-05T10:00:00.000Z');

test('freshness: missing timestamps are Unknown', () => {
  assert.equal(freshnessLabel({}, now), 'Unknown');
});

test('freshness: recent market timestamp is Live', () => {
  assert.equal(freshnessLabel({ marketTime: '2026-10-05T09:55:00.000Z' }, now), 'Live');
});

test('freshness: retrieval-only timestamp is never Live', () => {
  assert.equal(freshnessLabel({ retrievedAt: '2026-10-05T09:55:00.000Z' }, now), 'Delayed');
});

test('freshness: moderately old timestamp is Delayed', () => {
  assert.equal(freshnessLabel({ retrievedAt: '2026-10-05T08:30:00.000Z' }, now), 'Delayed');
});

test('freshness: old timestamp is Last close', () => {
  assert.equal(freshnessLabel({ retrievedAt: '2026-10-04T20:00:00.000Z' }, now), 'Last close');
});

test('freshness: stale provider data is Last close', () => {
  assert.equal(freshnessLabel({ retrievedAt: '2026-10-05T09:59:00.000Z', stale: true }, now), 'Last close');
});

test('freshness: market time takes precedence over retrieval time', () => {
  const result = classifyFreshness({
    marketTime: '2026-10-05T07:00:00.000Z',
    retrievedAt: '2026-10-05T09:59:00.000Z',
  }, now);
  assert.equal(result.label, 'Last close');
  assert.equal(result.ageMinutes, 180);
});