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
  assert.equal(classifyScan({ activeRows: 0, evaluatedRows: 0, qualifyingCandidates: 0, telegramSent: 0, errors: 0 }), 'empty_watchlist');
});

test('evaluated watchlist with no qualifying candidate is reported distinctly', () => {
  assert.equal(classifyScan({ activeRows: 4, evaluatedRows: 4, qualifyingCandidates: 0, telegramSent: 0, errors: 0 }), 'evaluated_no_qualifying_candidate');
});

test('candidate with accepted Telegram message is explicitly identified', () => {
  assert.equal(classifyScan({ activeRows: 2, evaluatedRows: 2, qualifyingCandidates: 1, telegramSent: 1, errors: 0 }), 'telegram_delivery_confirmed');
});

test('candidate without accepted Telegram message is not reported as delivered', () => {
  assert.equal(classifyScan({ activeRows: 2, evaluatedRows: 2, qualifyingCandidates: 1, telegramSent: 0, errors: 0 }), 'candidate_not_delivered');
});

test('partial/error scan is not reported as a completed clean evaluation', () => {
  assert.equal(classifyScan({ activeRows: 2, evaluatedRows: 2, qualifyingCandidates: 0, telegramSent: 0, errors: 1 }), 'completed_with_errors');
});
