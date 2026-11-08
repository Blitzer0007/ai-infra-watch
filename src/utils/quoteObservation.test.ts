import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuoteObservation } from './quoteObservation';
import { fetchLiveQuote } from '../utils';

test('quote parsing preserves an observed zero move and missing range fields stay unavailable', () => {
  assert.deepEqual(parseQuoteObservation({price:100,changePct:0},'NVDA'),{price:100,changePct:0,low:null,high:null,prevClose:null});
  assert.deepEqual(parseQuoteObservation({price:100,changePct:1,low:110,high:90},'NVDA'),{price:100,changePct:1,low:null,high:null,prevClose:null});
});

test('quote parsing rejects absent, coerced or non-finite moves, invalid prices and the wrong symbol', () => {
  for(const changePct of [undefined,null,'',false,'0',NaN,Infinity]) assert.equal(parseQuoteObservation({price:100,changePct},'NVDA'),null);
  for(const price of [0,-1,NaN,Infinity,'100']) assert.equal(parseQuoteObservation({price,changePct:0},'NVDA'),null);
  assert.equal(parseQuoteObservation({symbol:'AMD',price:100,changePct:0},'NVDA'),null);
});

test('server quote transport does not turn a missing move into a neutral observation', async t => {
  const calls:string[]=[];
  t.mock.method(globalThis,'fetch',async (url:string)=>{calls.push(url);return new Response(JSON.stringify({symbol:'NVDA',price:100}));});
  await assert.rejects(fetchLiveQuote('NVDA',''),/no usable price and daily move/);
  assert.deepEqual(calls,['/api/quote?symbol=NVDA']);
});

test('direct-provider failure uses the same strict fallback parsing without a real network request', async t => {
  const calls:string[]=[];
  t.mock.method(globalThis,'fetch',async(url:string)=>{
    calls.push(url);
    return new Response(JSON.stringify(url.startsWith('/api/')?{symbol:'NVDA',price:100,changePct:0}:{c:100,dp:null}));
  });
  const value=await fetchLiveQuote('NVDA','fixture-key');
  assert.equal(value.changePct,0);assert.equal(value.prevClose,null);assert.equal(calls.length,2);
});
