import test from 'node:test';
import assert from 'node:assert/strict';
import handler, {
  authorizedForNotify,
  isFinnhubCalendarPayload,
  telegramAccepted,
} from './earnings-alerts.js';

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('a spoofed Vercel cron User-Agent cannot authorize notification delivery', async () => {
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = '';
  try {
    assert.equal(await authorizedForNotify({
      headers: { 'user-agent': 'vercel-cron/1.0' },
    }), false);
  } finally {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  }
});

test('a valid configured cron bearer secret authorizes notification delivery', async () => {
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'unit-test-cron-secret';
  try {
    assert.equal(await authorizedForNotify({
      headers: { authorization: 'Bearer unit-test-cron-secret' },
    }), true);
  } finally {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  }
});

test('unauthorized notify request is rejected before any upstream provider call', async () => {
  const previousSecret = process.env.CRON_SECRET;
  const previousFetch = globalThis.fetch;
  process.env.CRON_SECRET = '';
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('unexpected upstream request');
  };

  try {
    const res = responseRecorder();
    await handler({
      method: 'GET',
      query: { notify: '1', days: '14' },
      headers: { 'user-agent': 'vercel-cron/1.0' },
    }, res);

    assert.equal(res.statusCode, 401);
    assert.equal(res.body?.ok, false);
    assert.equal(fetchCalls, 0, 'unauthorized callers must not consume Finnhub quota');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  }
});

test('Finnhub empty calendar is valid, while an error object is not an empty calendar', () => {
  assert.equal(isFinnhubCalendarPayload({ earningsCalendar: [] }), true);
  assert.equal(isFinnhubCalendarPayload({ earningsCalendar: [{ symbol: 'NVDA', date: '2026-10-25' }] }), true);
  assert.equal(isFinnhubCalendarPayload({ error: 'No access' }), false);
  assert.equal(isFinnhubCalendarPayload({}), false);
  assert.equal(isFinnhubCalendarPayload(null), false);
  assert.equal(isFinnhubCalendarPayload({ earningsCalendar: {} }), false);
});

test('Telegram delivery requires HTTP success, API ok=true, and a positive message ID', () => {
  assert.equal(telegramAccepted(true, { ok: true, result: { message_id: 42 } }), true);
  assert.equal(telegramAccepted(true, { ok: false, description: 'chat not found' }), false);
  assert.equal(telegramAccepted(true, { ok: true, result: {} }), false);
  assert.equal(telegramAccepted(true, { ok: true, result: { message_id: 0 } }), false);
  assert.equal(telegramAccepted(true, { ok: true, result: { message_id: '42' } }), false);
  assert.equal(telegramAccepted(false, { ok: true, result: { message_id: 42 } }), false);
  assert.equal(telegramAccepted(true, null), false);
});
