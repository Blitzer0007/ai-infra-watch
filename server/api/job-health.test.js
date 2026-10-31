import test from 'node:test';
import assert from 'node:assert/strict';
import { nextScheduledRun, supabaseHeaders, summarizeArtifacts, summarizeRunTiming, skippedRunsSinceLastSuccess, summarizeReentryDeliveryHealth } from '../../api/job-health.js';

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

test('legacy service_role JWTs retain authorization-header compatibility', () => {
  const key = 'legacy-service-role-jwt';
  const headers = supabaseHeaders(key);
  assert.equal(headers.apikey, key);
  assert.equal(headers.Authorization, ['Be', 'arer'].join('') + ' ' + key);
});

const archiveSample = [
  { id: 3, provider: 'ohlc', artifact_type: 'eod_asof_response_page', sha256: 'a'.repeat(64), object_path: 'ohlc/eod_asof/2026-10-19/NVDA/page-01/hash.json', retrieved_at: '2026-10-20T00:00:00Z', market_date: '2026-10-19', row_count: 250, symbol_count: 1, evidence_status: 'candidate' },
  { id: 2, provider: 'ohlc', artifact_type: 'manifest', sha256: 'b'.repeat(64), object_path: 'ohlc/eod_asof/2026-10-18/NVDA/manifest.json', retrieved_at: '2026-10-19T00:00:00Z', market_date: '2026-10-18', row_count: 250, symbol_count: 1, evidence_status: 'candidate' },
  { id: 4, provider: 'marketparquet', artifact_type: 'stock_daily_full_market_file', sha256: 'c'.repeat(64), object_path: 'marketparquet/stock_daily/2026-10-19/file.parquet', retrieved_at: '2026-10-20T00:10:00Z', market_date: '2026-10-19', row_count: 5000, symbol_count: 4000, evidence_status: 'archive_only' },
];

test('archive inventory reports provider latest rows without promoting evidence status', () => {
  const summary = summarizeArtifacts(archiveSample, 3);
  assert.equal(summary.providers.length, 3);
  assert.equal(summary.providers.find(row => row.provider === 'ohlc').artifactCountInWindow, 2);
  assert.equal(summary.providers.find(row => row.provider === 'ohlc').latest.id, 3);
  assert.equal(summary.providers.find(row => row.provider === 'marketparquet').latest.evidenceStatus, 'archive_only');
  assert.equal(summary.providers.find(row => row.provider === 'sp500-membership').latest, null);
  assert.equal(summary.historicalGate.status, 'BLOCKED');
});

test('archive inventory window exposes truncation explicitly', () => {
  const summary = summarizeArtifacts(archiveSample, 1200);
  assert.equal(summary.inventoryWindow.capped, true);
  assert.equal(summary.inventoryWindow.totalIndexedRows, 1200);
  assert.equal(summary.recentArtifacts.length, 3);
});

test('unknown providers are ignored and recorded hashes do not clear the historical gate', () => {
  const summary = summarizeArtifacts([...archiveSample, { provider: 'unknown', sha256: 'bad', retrieved_at: '2026-10-21' }], 4);
  assert.equal(summary.recentArtifacts.length, 3);
  assert.equal(summary.providers.some(row => row.provider === 'unknown'), false);
  assert.equal(summary.historicalGate.status, 'BLOCKED');
});

test('completed scheduler runs expose elapsed duration and current age', () => {
  const now = Date.parse('2026-10-31T12:00:30.000Z');
  const timing = summarizeRunTiming({
    status: 'completed',
    created_at: '2026-10-31T12:00:00.000Z',
    finished_at: '2026-10-31T12:00:20.000Z',
  }, now);
  assert.equal(timing.durationMs, 20000);
  assert.equal(timing.ageMs, 30000);
  assert.equal(timing.unfinished, false);
  assert.equal(timing.isStuck, false);
});

test('a recent started scheduler run is unfinished but not yet stuck', () => {
  const now = Date.parse('2026-10-31T12:04:00.000Z');
  const timing = summarizeRunTiming({
    status: 'started',
    created_at: '2026-10-31T12:00:00.000Z',
  }, now, 5 * 60 * 1000);
  assert.equal(timing.unfinished, true);
  assert.equal(timing.isStuck, false);
  assert.equal(timing.durationMs, 240000);
});

test('a scheduler run with no completion after threshold is flagged stuck', () => {
  const now = Date.parse('2026-10-31T12:08:00.000Z');
  const timing = summarizeRunTiming({
    status: 'started',
    created_at: '2026-10-31T12:00:00.000Z',
  }, now, 5 * 60 * 1000);
  assert.equal(timing.unfinished, true);
  assert.equal(timing.isStuck, true);
  assert.equal(timing.durationMs, 480000);
});

test('GitHub Actions completion time is measured from updated_at', () => {
  const timing = summarizeRunTiming({
    status: 'completed',
    created_at: '2026-10-31T12:00:00.000Z',
    updated_at: '2026-10-31T12:02:00.000Z',
  }, Date.parse('2026-10-31T12:05:00.000Z'));
  assert.equal(timing.durationMs, 120000);
  assert.equal(timing.unfinished, false);
});

test('Re-entry alert next run follows its 15-minute UTC schedule on weekdays', () => {
  assert.equal(nextScheduledRun('reentry-alerts', new Date('2026-10-26T13:00:00Z')), '2026-10-26T13:15:00.000Z');
  assert.equal(nextScheduledRun('reentry-alerts', new Date('2026-10-26T12:59:00Z')), '2026-10-26T13:00:00.000Z');
});

test('Re-entry alert next run rolls over weekends', () => {
  assert.equal(nextScheduledRun('reentry-alerts', new Date('2026-10-30T20:50:00Z')), '2026-11-02T13:00:00.000Z');
});

test('skipped workflow runs remain a visible release-gate signal until a later success', () => {
  const history = [
    { conclusion: 'skipped', created_at: '2026-10-31T10:00:00Z' },
    { conclusion: 'failure', created_at: '2026-10-31T09:45:00Z' },
    { conclusion: 'success', created_at: '2026-10-31T09:30:00Z' },
    { conclusion: 'skipped', created_at: '2026-10-31T09:15:00Z' },
  ];
  assert.equal(skippedRunsSinceLastSuccess(history, Date.parse('2026-10-31T09:30:00Z')), 1);
  assert.equal(skippedRunsSinceLastSuccess(history, NaN), 2);
});

test('re-entry delivery health distinguishes an active watchlist from confirmed Telegram deliveries', () => {
  const summary = summarizeReentryDeliveryHealth(
    [],
    [{ active: true, ownership_status: 'sold' }, { active: false, ownership_status: 'holding' }],
  );
  assert.equal(summary.activeWatchlistRows, 1);
  assert.equal(summary.activeSoldRows, 1);
  assert.equal(summary.activeHoldingRows, 0);
  assert.equal(summary.deliveryLedgerRowsInWindow, 0);
  assert.deepEqual(summary.statusCounts, { sending: 0, accepted: 0, rejected: 0, uncertain: 0 });
  assert.equal(summary.lastAcceptedAt, null);
});

test('re-entry delivery health counts accepted, rejected, and uncertain ledger rows without exposing row details', () => {
  const summary = summarizeReentryDeliveryHealth([
    { status: 'uncertain', created_at: '2026-10-31T12:03:00Z', completed_at: '2026-10-31T12:03:05Z', symbol: 'MU', delivery_key: 'private' },
    { status: 'accepted', created_at: '2026-10-31T12:00:00Z', completed_at: '2026-10-31T12:00:02Z', symbol: 'NVDA', telegram_message_id: 1234 },
    { status: 'rejected', created_at: '2026-10-31T11:55:00Z', completed_at: '2026-10-31T11:55:01Z' },
  ], [{ active: true, ownership_status: 'sold' }, { active: true, ownership_status: 'holding' }]);
  assert.deepEqual(summary.statusCounts, { sending: 0, accepted: 1, rejected: 1, uncertain: 1 });
  assert.equal(summary.lastAcceptedAt, '2026-10-31T12:00:02Z');
  assert.equal(summary.activeWatchlistRows, 2);
  assert.equal(Object.hasOwn(summary, 'telegram_message_id'), false);
  assert.equal(Object.hasOwn(summary, 'symbol'), false);
});
