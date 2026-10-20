import test from 'node:test';
import assert from 'node:assert/strict';
import { nextScheduledRun, supabaseHeaders, summarizeArtifacts } from '../../api/job-health.js';

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
