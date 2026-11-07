import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterReviewQueue, selectConfirmedCatalysts, formatReviewDate } from './portfolioReview';
import type { DecisionCardModel } from './decisionCardAdapter';
const rows = [
  {symbol:'NVDA',companyName:'Nvidia',state:'HOLD / WATCH'},
  {symbol:'AMD',companyName:'Advanced Micro Devices',state:'RISK REVIEW'},
  {symbol:'SOXL',companyName:'Leveraged fund',state:'INSUFFICIENT DATA'},
] as DecisionCardModel[];
test('review filtering preserves risk priority, searches company names, and never mutates inputs', () => {
  assert.deepEqual(filterReviewQueue(rows,'','all').map(x => x.symbol),['AMD','SOXL','NVDA']);
  assert.deepEqual(filterReviewQueue(rows,'nvid','all').map(x => x.symbol),['NVDA']);
  assert.deepEqual(filterReviewQueue(rows,'','INSUFFICIENT DATA').map(x => x.symbol),['SOXL']);
  assert.equal(filterReviewQueue(rows,'unknown','all').length,0);
  assert.equal(rows[0].symbol,'NVDA');
});
const now = Date.parse('2026-11-07T20:00:00Z');
const event = {symbol:'NVDA',date:'2026-11-08',source:'Company investor calendar',confirmed:true};
test('only confirmed, sourced, held, upcoming catalysts survive and duplicates collapse', () => {
  const events = [event,event,{...event,confirmed:false},{...event,source:''},{...event,symbol:'OTHER'},{...event,date:'2026-11-06'},{...event,date:'not-a-date'},{...event,date:'2026-02-31'}];
  assert.deepEqual(selectConfirmedCatalysts(events,['NVDA'],now,'Asia/Kolkata'),[event]);
});
test('date-only confirmed events preserve the local event day without inventing a time', () => {
  const today = {...event,date:'2026-11-07'};
  assert.equal(selectConfirmedCatalysts([today],['NVDA'],now,'America/New_York').length,1);
  assert.equal(selectConfirmedCatalysts([today],['NVDA'],now,'Asia/Kolkata').length,0);
  assert.match(formatReviewDate(event.date,'en-US','America/Los_Angeles'),/Nov 8, 2026/);
  assert.match(formatReviewDate(event.date),/time not supplied/);
  assert.equal(formatReviewDate('invalid'),'Timestamp unavailable');
});
test('review timestamps render in the explicitly chosen timezone', () => {
  assert.match(formatReviewDate('2026-11-07T12:00:00Z','en-US','UTC'),/12:00:00/);
  assert.match(formatReviewDate('2026-11-07T12:00:00Z','en-US','Asia/Kolkata'),/5:30:00/);
});
