import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchCongressTrades } from '../../api/live-data.js';

const env = { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_URL: 'fictional-preview.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'fictional-production.vercel.app', AI_INFRA_AGENT_URL: 'https://separate-agent.invalid' };
test('Congress self-proxy uses current deployment only and forwards no inbound/backend credentials', async () => {
  const calls = [];
  const result = await fetchCongressTrades({ env, headers: { host: 'untrusted.invalid', authorization: 'fictional-private' }, fetcher: async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ trades: [{ id: 'fictional-trade' }], sourceLabel: 'Fictional source', stale: false }));
  } });
  assert.equal(calls[0].url, 'https://fictional-preview.vercel.app/api/congress-trades?symbol=ALL');
  assert.deepEqual(calls[0].init.headers, { Accept: 'application/json' }); assert.equal(calls[0].init.redirect, 'error');
  assert.deepEqual(result.items, [{ id: 'fictional-trade' }]); assert.equal(result.stale, false);
});
for (const binding of [{}, { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_URL: 'untrusted.invalid' }]) test('unavailable native origin makes zero requests and is not healthy empty coverage', async () => {
  let calls = 0; const result = await fetchCongressTrades({ env: binding, fetcher: async () => { calls++; throw Error(); } });
  assert.equal(calls, 0); assert.equal(result.stale, true); assert.ok(result.upstreamError); assert.deepEqual(result.items, []);
});
for (const mode of ['redirect', 'throw', 'http-error']) test('Congress proxy ' + mode + ' preserves failure without exception disclosure', async () => {
  let calls = 0;
  const result = await fetchCongressTrades({ env, fetcher: async () => { calls++;
    if (mode === 'throw') throw Error('fictional-private-token https://private.invalid/hidden');
    return new Response(null, { status: mode === 'redirect' ? 302 : 503 });
  } });
  assert.equal(calls, 1); assert.equal(result.stale, true); assert.ok(result.upstreamError);
  assert.doesNotMatch(JSON.stringify(result), /fictional-private-token|private.invalid|hidden/);
});
