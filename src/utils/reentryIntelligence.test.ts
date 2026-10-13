import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessReentry } from './reentryIntelligence';

const quote = { price: 300, sma20: 295, sma50: 290, drawdownFrom52WeekHighPct: 15 };
test('requires price target, fresh quote, and thesis for a candidate', () => {
  assert.equal(assessReentry({ targetPrice: 310, thesis: 'Long-term cloud thesis', quote }).status, 'REENTRY_CANDIDATE');
  assert.equal(assessReentry({ targetPrice: 310, thesis: '', quote }).status, 'WATCH_ENTRY');
});
test('price at target without trend confirmation is watch only', () => {
  assert.equal(assessReentry({ targetPrice: 310, thesis: 'Thesis', quote: { ...quote, price: 280, sma20: 290, sma50: 300 } }).status, 'WATCH_ENTRY');
});
test('invalidated thesis overrides attractive price', () => {
  assert.equal(assessReentry({ targetPrice: 310, thesis: 'Old thesis', quote, thesisInvalidated: true }).status, 'NOT_READY');
});
test('missing quote is insufficient data', () => {
  assert.equal(assessReentry({ targetPrice: 310, thesis: 'Thesis', quote: null }).status, 'INSUFFICIENT_DATA');
});
