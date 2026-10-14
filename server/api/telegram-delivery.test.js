import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertTelegramAccepted } from './telegram-delivery.js';

test('accepts a successful Telegram API response', async () => {
  const result = await assertTelegramAccepted({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, result: { message_id: 123 } }),
  });
  assert.equal(result.result.message_id, 123);
});

test('rejects HTTP 200 when Telegram API says the message was not accepted', async () => {
  await assert.rejects(
    assertTelegramAccepted({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, description: 'chat not found' }),
    }),
    /Telegram delivery failed: API rejected the message.*chat not found/,
  );
});

test('rejects non-2xx Telegram responses even with an ok payload', async () => {
  await assert.rejects(
    assertTelegramAccepted({
      ok: false,
      status: 429,
      json: async () => ({ ok: true }),
    }),
    /Telegram delivery failed: HTTP 429/,
  );
});

test('rejects malformed Telegram response bodies', async () => {
  await assert.rejects(
    assertTelegramAccepted({
      ok: true,
      status: 200,
      json: async () => { throw new Error('invalid json'); },
    }),
    /Telegram delivery failed: API rejected the message/,
  );
});
