import assert from 'node:assert/strict';
import test from 'node:test';
import { createAutoForecastId } from './forecast-auto-track.js';

test('auto forecast ID is deterministic per ticker, horizon, scenario, model and UTC day', () => {
  const first = createAutoForecastId('nvda', 5, 'base', 'analogue-v1', '2026-10-31T01:15:00.000Z');
  const retry = createAutoForecastId('NVDA', 5, 'base', 'analogue-v1', '2026-10-31T01:45:00.000Z');

  assert.equal(first, retry);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('auto forecast ID changes for a new day, horizon, scenario or model version', () => {
  const base = createAutoForecastId('NVDA', 5, 'base', 'analogue-v1', '2026-10-31');
  assert.notEqual(createAutoForecastId('NVDA', 5, 'base', 'analogue-v1', '2026-11-01'), base);
  assert.notEqual(createAutoForecastId('NVDA', 20, 'base', 'analogue-v1', '2026-10-31'), base);
  assert.notEqual(createAutoForecastId('NVDA', 5, 'bull', 'analogue-v1', '2026-10-31'), base);
  assert.notEqual(createAutoForecastId('NVDA', 5, 'base', 'analogue-v2', '2026-10-31'), base);
});
