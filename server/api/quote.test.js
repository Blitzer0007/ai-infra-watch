import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuoteHandler } from './quote.js';
import { evaluateDeclaredQuote } from '../../shared/quoteAdmission.js';

const now = Date.parse('2026-11-20T19:00:00Z');
const seconds = value => Date.parse(value) / 1000;
const fixture = (symbol = 'NVDA') => ({ chart: { result: [{
  meta: { symbol, currency: 'USD', regularMarketPrice: 110, regularMarketPreviousClose: 100,
    regularMarketTime: seconds('2026-11-20T18:59:00Z'), exchangeTimezoneName: 'America/New_York',
    currentTradingPeriod: { regular: { start: seconds('2026-11-20T14:30:00Z'), end: seconds('2026-11-20T21:00:00Z') } } },
  timestamp: ['18', '19', '20'].map(day => seconds('2026-11-' + day + 'T14:30:00Z')),
  indicators: { quote: [{ close: [90, 100, 110] }] },
}] } });
const reply = body => ({ ok: true, json: async () => body });
const response = () => ({ code: null, body: null, headers: {},
  setHeader(key, value) { this.headers[key] = value; },
  status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } });
async function invoke(handler, query = { symbol: 'NVDA' }, method = 'GET') {
  const res = response(); await handler({ method, query }, res); return res;
}

test('public HTTP quotes preserve the metadata required by the shared admission gate', async () => {
  const calls = [];
  const handler = createQuoteHandler({ clock: () => now, fetcher: async (url, options) => {
    calls.push(url); assert(options.signal instanceof AbortSignal); return reply(fixture());
  } });
  const res = await invoke(handler, { symbol: ' nvda ' });
  assert.equal(res.code, 200);
  assert.equal(res.body.symbol, 'NVDA');
  assert.equal(res.body.returnedSymbol, 'NVDA');
  assert.equal(res.body.currency, 'USD');
  assert.equal(res.body.marketTimePrecision, 'instant');
  assert.equal(res.body.isMarketSessionOpen, true);
  assert.equal(res.body.adjustedBasis, 'raw');
  assert.equal(res.body.sourceMode, 'live');
  assert.equal(evaluateDeclaredQuote('NVDA', res.body, now).eligible, true);
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]).searchParams.get('range'), '5d');
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('HTTP daily change uses a prior exchange session rather than a chart-range baseline', async () => {
  const payload = fixture();
  delete payload.chart.result[0].meta.regularMarketPreviousClose;
  payload.chart.result[0].meta.chartPreviousClose = 90;
  const res = await invoke(createQuoteHandler({ clock: () => now, fetcher: async () => reply(payload) }));
  assert.equal(res.body.prevClose, 100);
  assert(Math.abs(res.body.changePct - 10) < 1e-10);
  assert.equal(res.body.dailyChangeSource, 'prior-session-chart-close');
});

test('unknown provider metadata and daily moves stay unknown instead of becoming invented values', async () => {
  const res = await invoke(createQuoteHandler({ clock: () => now,
    fetcher: async () => reply({ chart: { result: [{ meta: { regularMarketPrice: 110 } }] } }) }));
  assert.equal(res.code, 200);
  for (const key of ['returnedSymbol', 'currency', 'marketTime', 'prevClose', 'changePct', 'low', 'high', 'isMarketSessionOpen'])
    assert.equal(res.body[key], null, key);
  assert.equal(evaluateDeclaredQuote('NVDA', res.body, now).eligible, false);
});

test('wrong returned symbols and chart-only prices cannot become accepted quote responses', async () => {
  for (const payload of [fixture('AMD'), { chart: { result: [{ meta: {}, indicators: { quote: [{ close: [110] }] } }] } }]) {
    const res = await invoke(createQuoteHandler({ clock: () => now, fetcher: async () => reply(payload) }));
    assert.equal(res.code, 502); assert.equal(res.body.price, undefined);
  }
});

test('the public route does not silently rewrite CERE as CBRS', async () => {
  const urls = [];
  const handler = createQuoteHandler({ clock: () => now, fetcher: async url => { urls.push(url); return reply(fixture('CBRS')); } });
  const res = await invoke(handler, { symbol: 'CERE' });
  assert.equal(new URL(urls[0]).pathname.split('/').at(-1), 'CERE');
  assert.equal(res.code, 502);
});

test('declared legacy aliases retain returned identity and cannot bypass symbol admission', async () => {
  const urls = [];
  const handler = createQuoteHandler({ clock: () => now, fetcher: async url => { urls.push(url); return reply(fixture('VIVO')); } });
  const res = await invoke(handler, { symbol: 'VVPR' });
  assert.equal(new URL(urls[0]).pathname.split('/').at(-1), 'VIVO');
  assert.equal(res.body.returnedSymbol, 'VIVO');
  assert.equal(evaluateDeclaredQuote('VVPR', res.body, now).eligible, false);
});

test('cached responses keep the original observation and retrieval times; force and expiry refetch', async () => {
  let time = now, calls = 0;
  const handler = createQuoteHandler({ clock: () => time, fetcher: async () => { calls++; return reply(fixture()); } });
  const initial = await invoke(handler);
  time += 30_000;
  const cached = await invoke(handler);
  assert.equal(calls, 1); assert.equal(cached.body.cached, true); assert.equal(cached.body.cacheAgeMs, 30_000);
  assert.equal(cached.body.retrievedAt, initial.body.retrievedAt);
  assert.equal(cached.body.marketTime, initial.body.marketTime);
  await invoke(handler, { symbol: 'NVDA', refresh: 'true' }); assert.equal(calls, 2);
  time += 60_000;
  await invoke(handler); assert.equal(calls, 3);
  await invoke(handler, { symbol: 'NVDA', refresh: '1' }); assert.equal(calls, 4);
});

test('an expired or failed forced request never relabels an old cache entry as a fresh quote', async () => {
  let fail = false, time = now;
  const handler = createQuoteHandler({ clock: () => time, fetcher: async () => {
    if (fail) throw new Error('fictional-private-provider-detail'); return reply(fixture());
  } });
  await invoke(handler); fail = true;
  const forced = await invoke(handler, { symbol: 'NVDA', refresh: 'true' });
  assert.equal(forced.code, 502); assert.equal(forced.body.price, undefined);
  time += 60_000;
  assert.equal((await invoke(handler)).code, 502);
});

test('provider rejection, rate limits and timeouts use bounded errors without keyed-provider fallbacks', async () => {
  for (const [failure, expectedCode, expectedStatus] of [
    [{ ok: false, status: 403 }, 'provider_http_error', 502],
    [{ ok: false, status: 429 }, 'rate_limited', 503],
    [{ ok: false, status: 500 }, 'provider_server_error', 502],
    [new Error('fictional-private-token timed out'), 'timeout', 504],
    [new Error('fictional-private-token'), 'provider_error', 502],
  ]) {
    const calls = [];
    const handler = createQuoteHandler({ clock: () => now, fetcher: async url => {
      calls.push(url); if (failure instanceof Error) throw failure; return failure;
    } });
    const res = await invoke(handler);
    assert.equal(res.code, expectedStatus);
    assert.equal(res.body.providerAttempts[0].errorCode, expectedCode);
    assert.doesNotMatch(JSON.stringify(res.body), /fictional-private-token/);
    assert.equal(calls.length, 1); assert.equal(new URL(calls[0]).hostname, 'query1.finance.yahoo.com');
  }
});

test('unsupported methods and malformed symbols fail before any upstream request', async () => {
  let calls = 0;
  const handler = createQuoteHandler({ fetcher: async () => { calls++; throw Error('must not fetch'); } });
  assert.equal((await invoke(handler, { symbol: 'NVDA' }, 'POST')).code, 405);
  for (const symbol of ['', null, ['NVDA'], 'NVDA&key=fictional', 'A'.repeat(21)])
    assert.equal((await invoke(handler, { symbol })).code, 400);
  assert.equal(calls, 0);
});
