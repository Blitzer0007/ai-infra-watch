import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createQuoteHandler } from '../../server/api/quote.js';
import { fetchLiveQuote } from '../utils';
import { evaluateDeclaredQuote } from '../../shared/quoteAdmission.js';

const now = Date.parse('2026-11-20T19:00:00Z');
function payload(patch = {}) {
  return {chart: {result: [{meta: {symbol: 'NVDA', currency: 'USD', regularMarketPrice: 110,
    regularMarketPreviousClose: 100, regularMarketTime: (now - 60_000) / 1000,
    currentTradingPeriod: {regular: {start: (now - 3600_000) / 1000, end: (now + 3600_000) / 1000}}, ...patch}}]}};
}

function routeFetch(t: TestContext, data: unknown) {
  const upstream: string[] = [];
  const controller = createQuoteHandler({clock: () => now, fetcher: async (url: string) => {
    upstream.push(url); return new Response(JSON.stringify(data), {status: 200});
  }});
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://127.0.0.1');
    assert.equal(url.pathname, '/api/quote');
    const response = {code: 0, body: null as unknown, setHeader() {},
      status(code: number) {this.code = code; return this;}, json(body: unknown) {this.body = body; return this;}};
    await controller({method: 'GET', query: Object.fromEntries(url.searchParams)}, response);
    return new Response(JSON.stringify(response.body), {status: response.code});
  });
  return upstream;
}

test('actual client helper → HTTP controller → provider normalizer preserves admitted identity and time', async t => {
  const upstream = routeFetch(t, payload());
  const result = await fetchLiveQuote('NVDA', '', true);
  assert.equal(result.currency, 'USD'); assert.equal(result.returnedSymbol, 'NVDA');
  assert.equal(result.marketTimePrecision, 'instant'); assert.equal(result.isMarketSessionOpen, true);
  assert.equal(evaluateDeclaredQuote('NVDA', result, now).eligible, true);
  assert.equal(upstream.length, 1);
});

test('the real client helper cannot promote missing currency, stale or simulated responses', async t => {
  for (const fields of [{currency: null}, {stale: true}, {simulated: true}]) {
    await t.test(JSON.stringify(fields), async child => {
      routeFetch(child, payload(fields));
      const result = await fetchLiveQuote('NVDA', '', true);
      assert.equal(evaluateDeclaredQuote('NVDA', result, now).eligible, false);
    });
  }
});

test('missing daily reference is not changed into a flat daily move for the client', async t => {
  routeFetch(t, payload({regularMarketPreviousClose: null}));
  await assert.rejects(fetchLiveQuote('NVDA', '', true), /no usable price and daily move/);
});
