import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import standaloneLiveData from './standalone-live-data.js';

test('standalone feed cannot publish model-generated or canned financial observations',()=>{
  let status,body;const headers={};
  standaloneLiveData({}, {setHeader(key,value){headers[key]=value;},status(value){status=value;return this;},json(value){body=value;return this;}});
  assert.equal(status,503);assert.equal(headers['Cache-Control'],'no-store');assert.equal(body.code,'STANDALONE_FEED_UNAVAILABLE');
  assert.deepEqual(body.stockPrices,{});assert.deepEqual(body.congressTrades,[]);assert.deepEqual(body.contracts,[]);assert.deepEqual(body.macroRisks,[]);
  assert.equal(body.evidenceAvailability.market.marketTime,null);
});

test('standalone entry point has no model pricing path and registers the unavailable feed boundary',()=>{
  const source=readFileSync(new URL('../../server.ts',import.meta.url),'utf8');
  assert.match(source,/app\.get\("\/api\/live-data", standaloneLiveData\)/);
  assert.doesNotMatch(source,/GoogleGenAI|generateContent|getFallbackData|googleSearch|GEMINI_API_KEY/);
});
