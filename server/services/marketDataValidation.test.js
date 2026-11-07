import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareProviderQuotes, adjustedHistoryEligible } from './marketDataValidation.js';
const a = {symbol:'NVDA',provider:'a',currency:'USD',adjustedBasis:'raw',price:100,marketTime:'2026-11-06T18:00:00Z'};
test('comparable conflicts are flagged without averaging or mutating inputs', () => { const b={...a,provider:'b',price:110}; assert.equal(compareProviderQuotes([a,b]).status,'conflicting'); assert.equal(a.price,100); });
test('different currencies and adjustment bases are rejected', () => { for (const patch of [{currency:'EUR'},{adjustedBasis:'total_return'}]) assert.equal(compareProviderQuotes([a,{...a,provider:'b',...patch}]).status,'invalid'); });
test('noncontemporaneous or same-source quotes are not treated as independent consensus', () => { assert.equal(compareProviderQuotes([a,{...a,price:200}]).status,'valid'); assert.equal(compareProviderQuotes([a,{...a,provider:'b',price:200,marketTime:'2026-11-05T18:00:00Z'}]).status,'valid'); });
test('return history requires complete total-return adjustment', () => { assert.equal(adjustedHistoryEligible([{price:100,adjustedBasis:'total_return'}]),true); assert.equal(adjustedHistoryEligible([{price:100,adjustedBasis:'raw'}]),false); assert.equal(adjustedHistoryEligible([]),false); });
