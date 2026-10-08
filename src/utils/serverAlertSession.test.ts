import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getMarketSessionInfo,
  shouldEvaluateLargeMove,
  shouldEmitLargeMoveSummary,
} from '../../server/utils/serverAlertSession.js';

const utc = (value) => new Date(value);

test('uses New York regular-session boundaries', () => {
  const beforeOpen = getMarketSessionInfo(utc('2026-10-08T13:29:00Z'));
  const open = getMarketSessionInfo(utc('2026-10-08T13:30:00Z'));
  const close = getMarketSessionInfo(utc('2026-10-08T20:00:00Z'));
  const afterClose = getMarketSessionInfo(utc('2026-10-08T20:10:00Z'));

  assert.equal(beforeOpen.isRegularHours, false);
  assert.equal(open.isRegularHours, true);
  assert.equal(open.sessionDate, '2026-10-08');
  assert.equal(close.isRegularHours, false);
  assert.equal(afterClose.isAfterRegularHours, true);
});

test('large moves require regular market time and regular quote state', () => {
  assert.equal(shouldEvaluateLargeMove(utc('2026-10-08T13:45:00Z'), 'REGULAR'), true);
  assert.equal(shouldEvaluateLargeMove(utc('2026-10-08T13:45:00Z'), 'POST'), false);
  assert.equal(shouldEvaluateLargeMove(utc('2026-10-08T21:00:00Z'), 'POST'), false);
});

test('consolidated summary is eligible only after regular hours', () => {
  assert.equal(shouldEmitLargeMoveSummary(utc('2026-10-08T19:59:00Z')), false);
  assert.equal(shouldEmitLargeMoveSummary(utc('2026-10-08T20:00:00Z')), true);
});
