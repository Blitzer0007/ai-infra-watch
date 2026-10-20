import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeArtifacts } from '../../api/historical-evidence-health.js';

const sample = [
  { id: 3, provider: 'ohlc', artifact_type: 'eod_asof_response_page', sha256: 'a'.repeat(64), object_path: 'ohlc/eod_asof/2026-10-19/NVDA/page-01/hash.json', retrieved_at: '2026-10-20T00:00:00Z', market_date: '2026-10-19', row_count: 250, symbol_count: 1, evidence_status: 'candidate' },
  { id: 2, provider: 'ohlc', artifact_type: 'manifest', sha256: 'b'.repeat(64), object_path: 'ohlc/eod_asof/2026-10-18/NVDA/manifest.json', retrieved_at: '2026-10-19T00:00:00Z', market_date: '2026-10-18', row_count: 250, symbol_count: 1, evidence_status: 'candidate' },
  { id: 4, provider: 'marketparquet', artifact_type: 'stock_daily_full_market_file', sha256: 'c'.repeat(64), object_path: 'marketparquet/stock_daily/2026-10-19/file.parquet', retrieved_at: '2026-10-20T00:10:00Z', market_date: '2026-10-19', row_count: 5000, symbol_count: 4000, evidence_status: 'archive_only' },
];

test('archive summary reports latest artifact by provider and keeps evidence status distinct', () => {
  const summary = summarizeArtifacts(sample, 3);
  assert.equal(summary.providers.length, 3);
  assert.equal(summary.providers.find(row => row.provider === 'ohlc').artifactCountInWindow, 2);
  assert.equal(summary.providers.find(row => row.provider === 'ohlc').latest.id, 3);
  assert.equal(summary.providers.find(row => row.provider === 'marketparquet').latest.evidenceStatus, 'archive_only');
  assert.equal(summary.providers.find(row => row.provider === 'sp500-membership').latest, null);
  assert.equal(summary.historicalGate.status, 'BLOCKED');
});

test('archive inventory explicitly flags when indexed history exceeds the displayed window', () => {
  const summary = summarizeArtifacts(sample, 1200);
  assert.equal(summary.inventoryWindow.capped, true);
  assert.equal(summary.inventoryWindow.totalIndexedRows, 1200);
  assert.equal(summary.recentArtifacts.length, 3);
});

test('unrecognized providers are ignored and status strings are not promoted to historical gate approval', () => {
  const summary = summarizeArtifacts([...sample, { provider: 'unknown', sha256: 'bad', retrieved_at: '2026-10-21' }], 4);
  assert.equal(summary.recentArtifacts.length, 3);
  assert.equal(summary.providers.some(row => row.provider === 'unknown'), false);
  assert.equal(summary.historicalGate.status, 'BLOCKED');
});
