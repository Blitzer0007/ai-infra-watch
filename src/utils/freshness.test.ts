import { describe, expect, it } from 'vitest';
import { classifyFreshness, freshnessLabel } from './freshness';

describe('freshness labels', () => {
  const now = Date.parse('2026-10-05T10:00:00.000Z');

  it('labels a recent market timestamp Live', () => {
    expect(freshnessLabel({ marketTime: '2026-10-05T09:55:00.000Z' }, now)).toBe('Live');
  });

  it('labels a moderately old timestamp Delayed', () => {
    expect(freshnessLabel({ retrievedAt: '2026-10-05T08:30:00.000Z' }, now)).toBe('Delayed');
  });

  it('labels an old timestamp Last close', () => {
    expect(freshnessLabel({ retrievedAt: '2026-10-04T20:00:00.000Z' }, now)).toBe('Last close');
  });

  it('forces Last close when the provider marks data stale', () => {
    expect(freshnessLabel({ retrievedAt: '2026-10-05T09:59:00.000Z', stale: true }, now)).toBe('Last close');
  });

  it('prefers market time over retrieval time', () => {
    const result = classifyFreshness({
      marketTime: '2026-10-05T07:00:00.000Z',
      retrievedAt: '2026-10-05T09:59:00.000Z',
    }, now);
    expect(result.label).toBe('Last close');
    expect(result.ageMinutes).toBe(180);
  });
});
