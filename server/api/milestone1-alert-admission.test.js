import test from 'node:test';
import assert from 'node:assert/strict';
import {financialNotificationAdmission} from '../../shared/financialNotificationAdmission.js';
import {evaluatePortfolioReturnAlerts,getReturnThresholdTransitions} from './portfolio-return-alerts.js';
import {evaluatePortfolioHoldingReturnAlerts,getHoldingReturnThresholdTransitions,getHoldingReviewTransition} from './portfolio-holding-return-alerts.js';
import {quoteHistory} from './reentry-alerts.js';

test('caller flags, legacy complete statuses and claimed receipts cannot enable financial sends or state changes',async t=>{
  const calls=[];t.mock.method(globalThis,'fetch',async(...args)=>{calls.push(args);throw Error('No transport authorized');});
  for(const digest of [null,{}, {returnReview:{returnPct:30,portfolio:{accountingStatus:'complete',accountingReconciled:true,verifiesSourceRecords:true,historyCoverage:'complete',corporateActionCoverage:'complete',quoteCoverage:{status:'complete'}}},rows:[{symbol:'FICT',price:130,quantity:1,averageCost:100,quoteStatus:'fresh'}]},
    {receipt:{contractVersion:'verified-financial-notification-v1',verified:true}}]){
    assert.equal(financialNotificationAdmission(digest).eligible,false);
    for(const evaluate of [evaluatePortfolioReturnAlerts,evaluatePortfolioHoldingReturnAlerts]){
      const result=await evaluate(digest);assert.equal(result.evaluated,false);assert.equal(result.sent,0);assert.deepEqual(result.triggered,[]);
    }
  }
  assert.deepEqual(calls,[]);
});
test('unknown numeric samples do not rearm legacy thresholds or erase active review state',()=>{
  for(const value of [null,undefined,'',true,false,[],{},NaN,Infinity]){
    assert.deepEqual(getReturnThresholdTransitions(value,new Map([['portfolio-return:25',{active:true}]])),{trigger:[],reset:[]});
    assert.deepEqual(getHoldingReturnThresholdTransitions('FICT',value,new Map([['holding-return:FICT:25',{active:true}]])),{trigger:[],reset:[]});
    assert.equal(getHoldingReviewTransition('FICT',value,[],[],{active:true}).reset,false);
  }
  assert.deepEqual(getReturnThresholdTransitions(0,new Map([['portfolio-return:25',{active:true}]])),{trigger:[],reset:[25]});
});
const NOW=Date.parse('2026-11-13T18:00:00Z');
const meta=()=>({symbol:'FICT',currency:'USD',exchangeTimezoneName:'America/New_York',regularMarketPrice:100,regularMarketTime:NOW/1000,
  currentTradingPeriod:{regular:{start:NOW/1000-12600,end:NOW/1000+10800}}});
function packet(changes={}){
  const timestamp=Array.from({length:250},(_,i)=>(NOW-((250-i)*86400000))/1000);
  return {chart:{result:[{meta:{...meta(),...changes},timestamp,indicators:{quote:[{close:timestamp.map(()=>100)}],adjclose:[{adjclose:timestamp.map(()=>100)}]}}]}};
}
for(const changes of [{symbol:'OTHER'},{currency:'KRW'},{regularMarketPrice:0},{regularMarketPrice:'100'},
  {regularMarketTime:NOW/1000-901},{regularMarketTime:NOW/1000+1},{simulated:true},{stale:true},{stale:'false'},
  {currentTradingPeriod:{regular:{start:NOW/1000-3600,end:NOW/1000+25*3600}}}]){
  test('re-entry transport withholds bad current quotes instead of borrowing a history close: '+JSON.stringify(changes),async()=>{
    await assert.rejects(()=>quoteHistory('FICT',async()=>new Response(JSON.stringify(packet(changes))),()=>NOW),/quote withheld/);
  });
}
test('admitted re-entry transport retains adjusted-price calculations and deterministic retrieval time',async()=>{
  let call;
  const value=await quoteHistory('FICT',async(url,options)=>{call={url,options};return new Response(JSON.stringify(packet()));},()=>NOW);
  assert.equal(value.price,100);assert.equal(value.retrievedAt,new Date(NOW).toISOString());
  assert.equal(value.priceBasis,'split_dividend_adjusted_close');assert.equal(call.options.redirect,'error');
});
