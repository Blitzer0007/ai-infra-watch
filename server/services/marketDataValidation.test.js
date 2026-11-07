import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareProviderQuotes, adjustedHistoryEligible } from './marketDataValidation.js';
const a = {symbol:'NVDA',provider:'a',currency:'USD',adjustedBasis:'raw',price:100,marketTime:'2026-11-06T18:00:00Z'};
test('comparable conflicts are flagged without averaging or mutating inputs', () => { const b={...a,provider:'b',price:110}; assert.equal(compareProviderQuotes([a,b]).status,'conflicting'); assert.equal(a.price,100); });
test('different currencies and adjustment bases are rejected', () => { for (const patch of [{currency:'EUR'},{adjustedBasis:'total_return'}]) assert.equal(compareProviderQuotes([a,{...a,provider:'b',...patch}]).status,'invalid'); });
test('noncontemporaneous or same-source quotes are not treated as independent consensus', () => { assert.equal(compareProviderQuotes([a,{...a,price:200}]).status,'valid'); assert.equal(compareProviderQuotes([a,{...a,provider:'b',price:200,marketTime:'2026-11-05T18:00:00Z'}]).status,'valid'); });
test('return history requires complete total-return adjustment', () => { assert.equal(adjustedHistoryEligible([{price:100,adjustedBasis:'total_return'}]),true); assert.equal(adjustedHistoryEligible([{price:100,adjustedBasis:'raw'}]),false); assert.equal(adjustedHistoryEligible([]),false); });

test('session metadata recognizes sourced Friday close on Saturday without assuming holiday dates', async () => {
  const { regularSessionMetadata } = await import('./marketDataValidation.js');
  const meta = { regularMarketTime: Date.parse('2026-11-06T21:00:00Z') / 1000, currentTradingPeriod: { regular: { start: Date.parse('2026-11-06T14:30:00Z') / 1000, end: Date.parse('2026-11-06T21:00:00Z') / 1000 } } };
  assert.equal(regularSessionMetadata(meta, Date.parse('2026-11-07T12:00:00Z')).status, 'last_close');
  assert.equal(regularSessionMetadata(meta, Date.parse('2026-11-06T18:00:00Z')).isMarketSessionOpen, true);
  assert.equal(regularSessionMetadata({...meta, regularMarketTime: null}).marketTime, null);
  assert.equal(regularSessionMetadata({...meta, regularMarketTime: '123'}).marketTime, null);
  assert.equal(regularSessionMetadata({...meta, currentTradingPeriod: null}).status, 'missing');
});
test('early close follows provider boundaries and cannot label an intraday price as the close', async () => {
  const { regularSessionMetadata } = await import('./marketDataValidation.js');
  const end = Date.parse('2026-11-27T18:00:00Z');
  const meta = { regularMarketTime: end / 1000, currentTradingPeriod: { regular: { start: (end - 3.5 * 3600000) / 1000, end: end / 1000 } } };
  assert.equal(regularSessionMetadata(meta, end + 3600000).status, 'last_close');
  assert.equal(regularSessionMetadata({...meta, regularMarketTime: (end - 3600000) / 1000}, end + 3600000).status, 'missing');
  assert.equal(regularSessionMetadata({...meta, regularMarketTime: (end + 3600000) / 1000}, end + 7200000).status, 'missing');
});
test('malformed independent observations fail closed without crashing the renderer', () => {
  assert.equal(compareProviderQuotes([a,null]).status,'invalid');
  assert.equal(compareProviderQuotes(Array(33).fill(a)).status,'invalid');
});
test('out-of-range provider epochs are missing rather than crashing normalization', async () => {
  const { regularSessionMetadata } = await import('./marketDataValidation.js');
  assert.equal(regularSessionMetadata({regularMarketTime:Number.MAX_VALUE}).marketTime,null);
});
