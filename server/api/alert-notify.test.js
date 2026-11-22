import test from 'node:test';
import assert from 'node:assert/strict';

// Every credential and destination in this test is fictional. External transport is intercepted.
const testAccess = 'fictional-settings-test-access';
process.env.AIW_ACCESS_TOKEN = testAccess;
process.env.SUPABASE_URL = 'https://fictional-never-write-db.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fictional-never-write-key';
process.env.TELEGRAM_BOT_TOKEN = 'fictional-test-bot';
process.env.TELEGRAM_CHAT_ID = 'fictional-test-chat';
const {default: handler} = await import('./alert-notify.js');
const request = () => ({method: 'POST', headers: {authorization: 'Bearer ' + testAccess},
  body: {event: {type: 'price', severity: 'info', symbol: 'AIW', title: 'Telegram connection test',
    message: 'AI Infra Watch Telegram notifications are connected.'}}});
const response = () => ({code: 0, body: null, setHeader() {},
  status(code) {this.code = code; return this;}, json(body) {this.body = body; return this;}});

test('existing Settings test sends exactly one labeled message without digest or database activity', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.telegram.org/botfictional-test-bot/sendMessage');
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body); calls.push(body);
    assert.equal(body.chat_id, 'fictional-test-chat');
    assert.match(body.text, /Telegram connection test/);
    return new Response(JSON.stringify({ok: true, result: {message_id: 17}}), {status: 200});
  });
  const res = response(); await handler(request(), res);
  assert.equal(res.code, 200); assert.equal(res.body.sent, 1); assert.equal(res.body.ok, true);
  assert.equal(calls.length, 1);
});

test('unconfirmed Telegram 2xx is a failure, never a successful Settings test', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url, 'https://api.telegram.org/botfictional-test-bot/sendMessage');
    return new Response(JSON.stringify({ok: true, result: {message_id: 0}}), {status: 200});
  });
  const res = response(); await handler(request(), res);
  assert.equal(res.code, 502); assert.equal(res.body.sent, 0); assert.equal(res.body.ok, false);
});

test('unauthenticated test requests cannot contact Telegram or the database', async t => {
  t.mock.method(globalThis, 'fetch', async () => {throw Error('transport must not be used');});
  const res = response(); await handler({...request(), headers: {}}, res);
  assert.equal(res.code, 401);
});
