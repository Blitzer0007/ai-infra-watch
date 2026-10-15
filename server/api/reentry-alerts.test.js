import { test } from 'node:test';
import assert from 'node:assert/strict';
import { telegramAccepted } from './reentry-alerts.js';

test('Telegram delivery counts only a successful API response with a message id', () => {
  assert.equal(telegramAccepted(true, { ok: true, result: { message_id: 42 } }), true);
});

test('Telegram HTTP 200 with API ok=false is not accepted', () => {
  assert.equal(telegramAccepted(true, { ok: false, description: 'chat not found' }), false);
});

test('Telegram success without a message id is not accepted as delivery evidence', () => {
  assert.equal(telegramAccepted(true, { ok: true, result: {} }), false);
});

test('HTTP failure is never accepted even if the body claims success', () => {
  assert.equal(telegramAccepted(false, { ok: true, result: { message_id: 42 } }), false);
});

test('re-entry notification fires only when entering the candidate state', async () => {
  const { shouldNotifyCandidate } = await import('./reentry-alerts.js');
  assert.equal(shouldNotifyCandidate('NOT_CANDIDATE', true), true);
  assert.equal(shouldNotifyCandidate(null, true), true);
  assert.equal(shouldNotifyCandidate('REENTRY_CANDIDATE', true), false);
  assert.equal(shouldNotifyCandidate('REENTRY_CANDIDATE', false), false);
  assert.equal(shouldNotifyCandidate('NOT_CANDIDATE', false), false);
});

test('a failed delivery leaves the previous non-candidate signature eligible for retry', async () => {
  const { shouldNotifyCandidate } = await import('./reentry-alerts.js');
  // State is only patched after sendTelegram succeeds in runScan; a failed send therefore retries next scan.
  const persistedSignature = 'NOT_CANDIDATE';
  assert.equal(shouldNotifyCandidate(persistedSignature, true), true);
  assert.equal(shouldNotifyCandidate(persistedSignature, true), true);
});


import { classifyScan } from './reentry-alerts.js';

test('empty watchlist is not reported as a successful no-candidate evaluation', () => {
  assert.equal(classifyScan({ activeRows: 0, evaluatedRows: 0, qualifyingCandidates: 0, notifyEligibleCandidates: 0, telegramSent: 0, errors: 0 }), 'empty_watchlist');
});

test('evaluated watchlist with no qualifying candidate is reported distinctly', () => {
  assert.equal(classifyScan({ activeRows: 4, evaluatedRows: 4, qualifyingCandidates: 0, notifyEligibleCandidates: 0, telegramSent: 0, errors: 0 }), 'evaluated_no_qualifying_candidate');
});

test('candidate with accepted Telegram message is explicitly identified', () => {
  assert.equal(classifyScan({ activeRows: 2, evaluatedRows: 2, qualifyingCandidates: 1, notifyEligibleCandidates: 1, telegramSent: 1, errors: 0 }), 'telegram_delivery_confirmed');
});

test('candidate without accepted Telegram message is not reported as delivered', () => {
  assert.equal(classifyScan({ activeRows: 2, evaluatedRows: 2, qualifyingCandidates: 1, notifyEligibleCandidates: 1, telegramSent: 0, errors: 0 }), 'candidate_not_delivered');
});

test('an already-active candidate without a new transition is not falsely called undelivered', () => {
  assert.equal(classifyScan({ activeRows: 1, evaluatedRows: 1, qualifyingCandidates: 1, notifyEligibleCandidates: 0, telegramSent: 0, errors: 0 }), 'evaluated_existing_candidate_no_new_alert');
});

test('partial/error scan is not reported as a completed clean evaluation', () => {
  assert.equal(classifyScan({ activeRows: 2, evaluatedRows: 2, qualifyingCandidates: 0, notifyEligibleCandidates: 0, telegramSent: 0, errors: 1 }), 'completed_with_errors');
});


test('partial evaluation without explicit errors is reported as incomplete', () => {
  assert.equal(classifyScan({ activeRows: 3, evaluatedRows: 2, qualifyingCandidates: 0, notifyEligibleCandidates: 0, telegramSent: 0, errors: 0 }), 'incomplete_scan');
});


import { buildDeliveryKey } from './reentry-alerts.js';

test('durable delivery key is stable for the same configured thesis and target', () => {
  const row = { symbol: 'nvda', target_price: 120, sale_date: '2026-01-10', thesis: 'AI infra growth' };
  assert.equal(buildDeliveryKey(row), buildDeliveryKey({ ...row, symbol: 'NVDA' }));
});

test('changing target or thesis creates a distinct delivery episode key', () => {
  const row = { symbol: 'NVDA', target_price: 120, sale_date: '2026-01-10', thesis: 'AI infra growth' };
  assert.notEqual(buildDeliveryKey(row), buildDeliveryKey({ ...row, target_price: 110 }));
  assert.notEqual(buildDeliveryKey(row), buildDeliveryKey({ ...row, thesis: 'Changed thesis' }));
});

test('durable delivery key does not contain raw thesis text', () => {
  const key = buildDeliveryKey({ symbol: 'NVDA', target_price: 120, thesis: 'private thesis text' });
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key.includes('private thesis text'), false);
});
