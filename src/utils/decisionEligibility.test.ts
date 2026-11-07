import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDecisionEligibility as evaluate, normalizeDecisionQuote, type ValidatedQuote } from './decisionEligibility';
const now = Date.parse('2026-11-06T18:00:00Z');
const quote: ValidatedQuote = { symbol: 'NVDA', price: 100, currency: 'USD', provider: 'authoritative', marketTime: '2026-11-06T17:59:00Z', retrievedAt: '2026-11-06T18:00:00Z', isMarketSessionOpen: true, status: 'valid', fallbackUsed: false };
test('valid USD quote with explicit timestamps and reconciled inputs is eligible', () => assert.equal(evaluate(quote,true,true,now).eligibleForDecision,true));
for (const price of [null, 0, -1, NaN, Infinity, '100']) test('invalid numeric price ' + String(price), () => assert.equal(evaluate({...quote,price: price as number},true,true,now).eligibleForDecision,false));
for (const patch of [ { currency:'EUR' }, { marketTime:null }, { provider:'' }, { retrievedAt:null }, { marketTime:'2026-11-07T00:00:00Z' }, { isMarketSessionOpen:null }, { status:'simulated' }, { status:'conflicting' }, { status:'stale' }, { marketTime:'2026-11-05T17:00:00Z' } ] as Partial<ValidatedQuote>[]) test('fails closed for ' + JSON.stringify(patch), () => assert.equal(evaluate({...quote,...patch},true,true,now).eligibleForDecision,false));
test('weekend last close uses explicit session and observation provenance', () => {
  const close = {...quote, marketTime:'2026-11-06T21:00:00Z', retrievedAt:'2026-11-07T18:00:00Z', isMarketSessionOpen:false, status:'last_close' as const};
  assert.equal(evaluate(close,true,true,Date.parse(close.retrievedAt)).status,'last_close');
  assert.equal(evaluate(close,true,true,Date.parse(close.retrievedAt)).eligibleForDecision,true);
  assert.equal(evaluate({...close,status:'stale'},true,true,Date.parse(close.retrievedAt)).eligibleForDecision,false);
});
test('accounting and evidence are independently mandatory', () => { assert.equal(evaluate(quote,false,true,now).eligibleForDecision,false); assert.equal(evaluate(quote,true,false,now).eligibleForDecision,false); });
test('normalization retains missing fields and simulation markers', () => { assert.equal(normalizeDecisionQuote('NVDA',{price:100,provider:'qa'}).status,'simulated'); assert.equal(normalizeDecisionQuote('NVDA',undefined).price,null); });
