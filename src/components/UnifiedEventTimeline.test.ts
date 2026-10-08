import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeTimelineEvents } from './UnifiedEventTimeline';

const base = (overrides: any = {}) => ({
  id: 'a',
  kind: 'SEC',
  date: '2026-10-08',
  title: 'NVDA material contract',
  detail: 'detail',
  source: 'SEC EDGAR',
  sourceLevel: 'PRIMARY',
  ...overrides,
});

test('timeline merges identical URLs', () => {
  const result = dedupeTimelineEvents([
    base(),
    base({ id: 'b', source: 'News', sourceLevel: 'NEWS', url: 'https://example.com/a' }),
    base({ id: 'c', url: 'https://example.com/a', date: '2026-10-08' }),
  ]);
  assert.equal(result.length, 2);
  assert.match(result[1].source, /SEC EDGAR|News/);
});

test('timeline merges same title within one day', () => {
  const result = dedupeTimelineEvents([
    base({ url: null }),
    base({ id: 'b', date: '2026-10-09', url: null, source: 'News', sourceLevel: 'NEWS' }),
  ]);
  assert.equal(result.length, 1);
});

test('timeline keeps distinct titles', () => {
  const result = dedupeTimelineEvents([
    base({ url: null }),
    base({ id: 'b', title: 'NVDA earnings', url: null }),
  ]);
  assert.equal(result.length, 2);
});
