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
