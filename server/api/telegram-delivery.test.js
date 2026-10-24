import test from 'node:test';
import assert from 'node:assert/strict';
import { isTelegramMessageAccepted, telegramDeliveryFailure } from '../utils/telegramDelivery.js';

test('Telegram delivery requires an accepted Bot API response and a positive integer message ID', () => {
  assert.equal(isTelegramMessageAccepted(true, { ok: true, result: { message_id: 42 } }), true);
  assert.equal(isTelegramMessageAccepted(true, { ok: true, result: { message_id: 1 } }), true);
  assert.equal(isTelegramMessageAccepted(true, { ok: false, description: 'chat not found' }), false);
  assert.equal(isTelegramMessageAccepted(true, { ok: true, result: {} }), false);
  assert.equal(isTelegramMessageAccepted(true, { ok: true, result: { message_id: 0 } }), false);
  assert.equal(isTelegramMessageAccepted(true, { ok: true, result: { message_id: -1 } }), false);
  assert.equal(isTelegramMessageAccepted(true, { ok: true, result: { message_id: '42' } }), false);
  assert.equal(isTelegramMessageAccepted(false, { ok: true, result: { message_id: 42 } }), false);
  assert.equal(isTelegramMessageAccepted(true, null), false);
  assert.equal(isTelegramMessageAccepted(true, []), false);
});

test('Telegram delivery failure distinguishes rejected HTTP responses from unconfirmed 2xx responses', () => {
  assert.match(telegramDeliveryFailure(200, { ok: false }), /did not confirm an accepted message ID/);
  assert.match(telegramDeliveryFailure(502, { description: 'upstream failed' }), /HTTP 502.*upstream failed/);
  const long = 'x'.repeat(400);
  assert.ok(telegramDeliveryFailure(400, { description: long }).length < 300);
});
