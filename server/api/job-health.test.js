import test from 'node:test';
import assert from 'node:assert/strict';
import { nextScheduledRun, supabaseHeaders } from '../../api/job-health.js';

test('private OHLC archive next run uses the weekday 23:30 UTC slot', () => {
  assert.equal(nextScheduledRun('private-ohlc-asof-archive', new Date('2026-10-20T03:00:00Z')), '2026-10-20T23:30:00.000Z');
});

test('private MarketParquet archive next run uses the weekday 23:40 UTC slot', () => {
  assert.equal(nextScheduledRun('private-marketparquet-archive', new Date('2026-10-20T03:00:00Z')), '2026-10-20T23:40:00.000Z');
});

test('weekday archives roll across the weekend to Monday', () => {
  assert.equal(nextScheduledRun('private-ohlc-asof-archive', new Date('2026-10-23T23:50:00Z')), '2026-10-26T23:30:00.000Z');
});

test('S&P membership audit points to the first day of the next month when already past this month', () => {
  assert.equal(nextScheduledRun('private-sp500-membership-audit', new Date('2026-10-20T03:00:00Z')), '2026-11-01T04:17:00.000Z');
});

test('S&P membership audit retains this month when the monthly run is still ahead', () => {
  assert.equal(nextScheduledRun('private-sp500-membership-audit', new Date('2026-10-01T00:00:00Z')), '2026-10-01T04:17:00.000Z');
});


test('new Supabase secret keys are sent as apikey only', () => {
  assert.deepEqual(supabaseHeaders('sb_secret_test-value'), { apikey: 'sb_secret_test-value' });
});

test('legacy service_role JWTs retain Authorization Bearer compatibility', () => {
  assert.deepEqual(supabaseHeaders('legacy-service-role-jwt'), {
    apikey: 'legacy-service-role-jwt',
    Authorization: 'Bearer legacy-service-role-jwt',
  });
});
