import assert from 'node:assert/strict';
import test from 'node:test';

const names = ['AIW_ACCESS_TOKEN', 'CRON_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
process.env.AIW_ACCESS_TOKEN = 'fictional-private-session';
process.env.CRON_SECRET = 'fictional-private-cron';
process.env.SUPABASE_URL = 'https://fictional-private-storage.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fictional-storage-key';
const {default: forecast} = await import('./forecast-verification.js?private-access-regression');
const {default: quality} = await import('./ai-quality.js?private-access-regression');
test.after(() => { for (const name of names) { if (original[name] === undefined) delete process.env[name]; else process.env[name] = original[name]; } });

function response() {
  const output = {status: null, body: null};
  return {output, setHeader() {}, status(value) {output.status = value; return this;}, json(value) {output.body = value; return this;}};
}
test('private forecast and quality reads/writes reject anonymous and wrong sessions before storage or models', async () => {
  const before = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => {calls++; throw Error('No transport allowed');};
  try {
    for (const handler of [forecast, quality]) for (const method of ['GET', 'POST', 'PATCH']) for (const token of ['', 'wrong']) {
      const res = response();
      await handler({method, query: {}, body: {}, headers: {authorization: token ? 'Bearer ' + token : ''}}, res);
      assert.equal(res.output.status, 401);
      assert.doesNotMatch(JSON.stringify(res.output.body), /fictional-storage-key|fictional-private-session/);
    }
    assert.equal(calls, 0);
  } finally {globalThis.fetch = before;}
});
test('authenticated model/quality reads and existing scheduler authentication still work without a write', async () => {
  const before = globalThis.fetch, calls = [];
  globalThis.fetch = async (input, options = {}) => {
    assert.equal(new URL(String(input)).origin, 'https://fictional-private-storage.invalid');
    calls.push(options.method ?? 'GET');
    return new Response('[]', {status: 200, headers: {'Content-Type': 'application/json'}});
  };
  try {
    const model = response();
    await forecast({method: 'GET', query: {ticker: 'FICT', horizon: '5'}, headers: {authorization: 'Bearer fictional-private-session'}}, model);
    assert.equal(model.output.status, 200); assert.equal(model.output.body.model, 'analogue-v1');
    const history = response();
    await quality({method: 'GET', query: {}, headers: {authorization: 'Bearer fictional-private-session'}}, history);
    assert.equal(history.output.status, 200);
    const scheduler = response();
    await forecast({method: 'GET', query: {}, headers: {authorization: 'Bearer fictional-private-cron'}}, scheduler);
    assert.equal(scheduler.output.status, 200);
    assert(calls.length >= 3); assert(calls.every(method => method === 'GET'));
  } finally {globalThis.fetch = before;}
});
