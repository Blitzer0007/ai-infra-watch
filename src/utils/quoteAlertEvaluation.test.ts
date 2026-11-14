import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { DEFAULT_CONFIG, fetchLiveQuote, type AppConfig } from '../utils';
import { admitBrowserAlertQuote, evaluateBrowserQuoteAlerts, readQuoteAlertState, QUOTE_ALERT_STATE_KEY } from './quoteAlertEvaluation';
import { evaluateQuoteAlerts, ALERT_EVENTS_KEY, ALERT_STATE_KEY } from './alertEngine';

const NOW = Date.parse('2026-11-13T18:00:00Z');
const config: AppConfig = { ...DEFAULT_CONFIG, alerts: [{ symbol: 'FICT', targetPrice: 105, type: 'above', active: true }], largeMoveEnabled: true, largeMovePct: 5 };
const quote = (price = 100, minute = 0, edits: Record<string, unknown> = {}) => ({
  price, changePct: 0, returnedSymbol: 'FICT', sourceMode: 'live', adjustedBasis: 'raw', provider: 'yahoo',
  currency: 'USD', marketTimePrecision: 'instant', isMarketSessionOpen: true, simulated: false, stale: false,
  marketTime: new Date(NOW + minute * 60_000).toISOString(), retrievedAt: new Date(NOW + minute * 60_000).toISOString(), status: 'valid', ...edits,
});
const step = (price = 100, minute = 0, previous: unknown = null, edits: Record<string, unknown> = {}, cfg = config, bootstrap = false) => evaluateBrowserQuoteAlerts(cfg, { FICT: quote(price, minute, edits) }, previous, NOW + minute * 60_000, bootstrap);

test('supported declared quote is admitted without source authenticity or trading claims', () => {
  assert.equal(admitBrowserAlertQuote('FICT', quote(), NOW).eligible, true);
});
const blocked: Record<string, unknown>[] = [
  { stale: true }, { simulated: true }, { simulated: 'false' }, { stale: 'false' }, { fallbackUsed: 'false' },
  { sourceMode: 'simulated' }, { sourceMode: 'unknown' }, { sourceMode: undefined },
  { returnedSymbol: undefined }, { returnedSymbol: 'OTHER' }, { symbol: 'OTHER' },
  { currency: undefined }, { currency: 'EUR' }, { adjustedBasis: 'total_return' }, { adjustedBasis: 'split_adjusted' },
  { provider: '' }, { provider: 'fixture' }, { provider: {} },
  { marketTimePrecision: 'date-only' }, { marketTime: '2026-11-13' }, { marketTime: '2026-02-30T18:00:00Z' },
  { marketTime: '2026-11-13T18:04:00Z' }, { retrievedAt: '2026-11-13T18:04:00Z' },
  { marketTime: '2026-11-13T17:44:59Z' }, { retrievedAt: '2026-11-13T17:44:59Z' },
  { marketTime: null }, { retrievedAt: null }, { isMarketSessionOpen: undefined },
  { isMarketSessionOpen: false, status: 'last_close' }, { status: 'conflicting' }, { status: 'missing' }, { status: 'provider-error' },
  { price: 0 }, { price: -1 }, { price: '100' }, { price: NaN },
  { independentObservations: [null] }, { independentObservations: {} },
  { independentObservations: [{}] },
  { independentObservations: [{ symbol: 'OTHER', provider: 'another', price: 100, currency: 'USD', adjustedBasis: 'raw', marketTime: '2026-11-13T18:00:00Z' }] },
  { independentObservations: [{ symbol: 'FICT', provider: 'another', price: 100, currency: 'USD', adjustedBasis: 'raw', marketTime: '2026-11-13' }] },
  { independentObservations: [{ symbol: 'FICT', provider: 'another', currency: 'USD', adjustedBasis: 'raw', price: 200, marketTime: '2026-11-13T18:00:00Z' }] },
];
for (const [index, patch] of blocked.entries()) test(`unsafe packet ${index + 1} cannot emit, establish or reset alert state`, () => {
  assert.equal(admitBrowserAlertQuote('FICT', quote(110, 0, patch), NOW).eligible, false);
  const before = step().state;
  const result = step(110, 1, before, patch);
  assert.deepEqual(result.events, []); assert.deepEqual(result.state, before);
});
test('first supported samples are baselines even after an invalid startup consumed global bootstrap', () => {
  const invalid = step(110, 0, null, { stale: true }, config, true);
  const first = step(110, 1, invalid.state); assert.equal(first.events.length, 0);
  const below = step(100, 2, first.state); const crossing = step(105, 3, below.state);
  assert.equal(crossing.events.length, 1); assert.equal(crossing.events[0].value, 105);
  assert.equal(crossing.events[0].source, 'yahoo');
});
test('a suppressed invalid sample cannot rearm a triggered rule', () => {
  const baseline = step(); const triggered = step(110, 1, baseline.state);
  const invalid = step(100, 2, triggered.state, { simulated: true });
  assert.deepEqual(invalid.state, triggered.state);
  assert.equal(step(110, 3, invalid.state).events.length, 0);
  const validReset = step(100, 4, invalid.state);
  assert.equal(step(110, 5, validReset.state).events.length, 1);
});
test('each symbol and newly configured rule gets its own eligible baseline', () => {
  const first = step();
  const cfg = { ...config, alerts: [...config.alerts, { symbol: 'FICT', type: 'below' as const, targetPrice: 150, active: true }] };
  assert.equal(step(100, 1, first.state, {}, cfg).events.length, 0);
  const second = evaluateBrowserQuoteAlerts(config, { OTHER: quote(110, 1, { returnedSymbol: 'OTHER' }) }, first.state, NOW + 60_000);
  assert.equal(second.events.length, 0);
});
test('duplicate, reordered and revised same-time observations cannot trigger or reset', () => {
  const first = step(); const second = step(110, 1, first.state);
  const duplicate = evaluateBrowserQuoteAlerts(config, { FICT: quote(110, 1) }, second.state, NOW + 2 * 60_000);
  assert.deepEqual(duplicate.state, second.state); assert.equal(duplicate.events.length, 0);
  const old = evaluateBrowserQuoteAlerts(config, { FICT: quote(100) }, second.state, NOW + 2 * 60_000);
  assert.deepEqual(old.state, second.state); assert.equal(old.assessments[0].eligible, false);
  const revision = evaluateBrowserQuoteAlerts(config, { FICT: quote(100, 1) }, second.state, NOW + 2 * 60_000);
  assert.deepEqual(revision.state, second.state); assert.equal(revision.assessments[0].eligible, false);
});
test('daily moves retain observed zero, seed each day and deduplicate each direction', () => {
  const first = step(100, 0); const rise = step(101, 1, first.state, { changePct: 5 });
  assert.equal(rise.events.filter(e => e.type === 'large-move').length, 1);
  const flat = step(100, 2, rise.state, { changePct: 0 });
  assert.equal(step(101, 3, flat.state, { changePct: 6 }).events.filter(e => e.type === 'large-move').length, 0);
  const down = step(99, 4, flat.state, { changePct: -10 });
  assert.equal(down.events.find(e => e.type === 'large-move')?.severity, 'critical');
  assert.equal(step(99, 1440, down.state, { changePct: -10 }).events.length, 0);
});
test('enabling or changing a move threshold rebaselines instead of manufacturing a crossing', () => {
  const first = step(100, 0, null, { changePct: 6 }, { ...config, largeMovePct: 10 });
  assert.equal(step(100, 1, first.state, { changePct: 6 }).events.length, 0);
  const disabled = step(100, 2, first.state, { changePct: 6 }, { ...config, largeMoveEnabled: false });
  assert.equal(step(100, 3, disabled.state, { changePct: 6 }).events.length, 0);
});
test('missing or coerced percentage withholds move alerts while valid price thresholds can cross', () => {
  for (const changePct of [undefined, null, '5', NaN]) {
    const first = step(100, 0, null, { changePct });
    const second = step(110, 1, first.state, { changePct });
    assert.deepEqual(second.events.map(e => e.type), ['price']);
  }
});
test('invalid settings do not become default numeric thresholds; duplicate rules emit once', () => {
  const cfg = { ...config, largeMovePct: '5' as any, alerts: [...config.alerts, ...config.alerts, { ...config.alerts[0], targetPrice: '100' as any }] };
  const first = step(100, 0, null, {}, cfg);
  assert.deepEqual(step(110, 1, first.state, { changePct: 6 }, cfg).events.map(e => e.type), ['price']);
});
test('explicit clocks, 15 minute boundary, bounds and malformed receipts fail safely', () => {
  assert.equal(admitBrowserAlertQuote('FICT', quote(), NOW + 15 * 60_000).eligible, true);
  assert.equal(admitBrowserAlertQuote('FICT', quote(), NOW + 15 * 60_000 + 1).eligible, false);
  for (const now of [NaN, Infinity, -1]) assert.equal(admitBrowserAlertQuote('FICT', quote(), now).eligible, false);
  assert.deepEqual(readQuoteAlertState({ version: 1, symbols: { FICT: { marketMs: NOW, price: 100 } } }), { version: 1, symbols: {} });
  assert.equal(evaluateBrowserQuoteAlerts({ ...config, alerts: Array(201).fill(config.alerts[0]) }, {}, null, NOW).events.length, 0);
});
test('pure transitions do not mutate inputs, read ambient clocks or bundle storage/provider transports', () => {
  const state = step().state, copy = structuredClone(state), q = quote(110, 1), before = structuredClone(q);
  const original = Date.now;
  try { Date.now = () => { throw Error('ambient clock'); }; evaluateBrowserQuoteAlerts(config, { FICT: q }, state, NOW + 60_000); }
  finally { Date.now = original; }
  assert.deepEqual(state, copy); assert.deepEqual(q, before);
  const bundle = buildSync({ entryPoints: ['src/utils/quoteAlertEvaluation.ts'], bundle: true, platform: 'browser', write: false }).outputFiles[0].text;
  assert.doesNotMatch(bundle, /\bfetch\(|process\.env|localStorage|supabase|apiAuth|setInterval|new Notification/);
});
test('actual quote-fetch adapter preserves conflict observations and malformed stale markers', async t => {
  const packet = { ...quote(), symbol: 'FICT', stale: 'false', independentObservations: [null] };
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(packet)));
  const loaded = await fetchLiveQuote('FICT', '');
  assert.equal(loaded.stale as unknown, 'false'); assert.deepEqual(loaded.independentObservations, [null]);
  assert.equal(admitBrowserAlertQuote('FICT', loaded, NOW).eligible, false);
});
test('wrapper retains legacy history/feed state and returns no detections if storage fails', t => {
  const data = new Map<string, string>([[ALERT_STATE_KEY, '{"catalyst:old":true}'], [ALERT_EVENTS_KEY, '[{"id":"fictional-old"}]']]);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete (globalThis as any).localStorage; });
  let denied = false;
  let denyWrites = false;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => { if (denied) throw Error('storage denied'); return data.get(key) ?? null; }, setItem: (key: string, value: string) => { if (denyWrites) throw Error('write denied'); data.set(key, value); } } });
  evaluateQuoteAlerts(config, { FICT: quote() }, false, NOW);
  const result = evaluateQuoteAlerts(config, { FICT: quote(110, 1) }, false, NOW + 60_000);
  assert.equal(result.length, 1); assert.equal(JSON.parse(data.get(ALERT_EVENTS_KEY)!)[1].id, 'fictional-old');
  assert.equal(data.get(ALERT_STATE_KEY), '{"catalyst:old":true}'); assert.ok(data.has(QUOTE_ALERT_STATE_KEY));
  data.set(QUOTE_ALERT_STATE_KEY, '{broken');
  assert.equal(evaluateQuoteAlerts(config, { FICT: quote(110, 2) }, false, NOW + 2 * 60_000).length, 0);
  evaluateQuoteAlerts(config, { FICT: quote(100, 3) }, false, NOW + 3 * 60_000);
  denyWrites = true;
  assert.deepEqual(evaluateQuoteAlerts(config, { FICT: quote(110, 4) }, false, NOW + 4 * 60_000), []);
  denied = true;
  assert.deepEqual(evaluateQuoteAlerts(config, { FICT: quote(110, 3) }, false, NOW + 3 * 60_000), []);
});
