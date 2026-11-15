import test from 'node:test';
import assert from 'node:assert/strict';
import {cases} from '../../scripts/fixtures/accounting-crosscheck.fictional';
import {calculateLoadedTradingPerformance} from './reviewedPortfolioAccounting';
import {calculateReviewedServerPortfolio} from '../../server/utils/reviewedDecisionAccounting.js';

const NOW=Date.parse('2026-11-13T18:00:00Z');
const holding=(changes:any={})=>({symbol:'FICT',quantity:1,average_cost:999,...changes});
const trade=(changes:any={})=>({id:'fictional-buy',symbol:'FICT',transaction_type:'BUY',quantity:1,amount:100,
  brokerage:0,currency:'USD',trade_date:'2026-01-01',order_executed_at:null,quantity_derived:false,price_derived:false,...changes});
const quote=(changes:any={})=>({returnedSymbol:'FICT',price:150,currency:'USD',provider:'declared-provider',sourceMode:'live',
  adjustedBasis:'raw',marketTimePrecision:'instant',marketTime:new Date(NOW).toISOString(),retrievedAt:new Date(NOW).toISOString(),isMarketSessionOpen:true,status:'valid',...changes});
const calc=(h:any[]=[holding()],tx:any[]=[trade()],q:any={FICT:quote()},at:any=NOW,availability?:any)=>calculateReviewedServerPortfolio(h,tx,q,at,availability);

for(const c of cases)test('server original rows agree with strict client loaded-record math: '+c.name,()=>{
  const holdings=c.input.holdings.map((row:any)=>({symbol:row.accountingInputs.symbol,quantity:row.accountingInputs.quantity,average_cost:999}));
  const trades=c.input.transactions.map((row:any)=>{const d=row.accountingInputs;return trade({id:row.id,symbol:d.symbol,transaction_type:d.transactionType,
    quantity:d.quantity,amount:d.amount,brokerage:d.brokerage,currency:d.currency,trade_date:d.tradeDate,order_executed_at:d.executedAt,quantity_derived:d.quantityDerived,price_derived:d.priceDerived});});
  const marks=holdings.map(row=>({symbol:row.symbol,quantity:row.quantity,currentPrice:150}));
  const server=calc(holdings,trades,Object.fromEntries(holdings.map(row=>[row.symbol,quote({returnedSymbol:row.symbol,
    marketTime:c.input.assessedAt,retrievedAt:c.input.assessedAt})])),Date.parse(c.input.assessedAt));
  const client=calculateLoadedTradingPerformance(c.input,marks);
  assert.equal(server.accountingStatus,client.status);
  for(const key of ['currentValue','openCostBasis','realizedPnl','unrealizedPnl','totalTradingPnl','grossPurchaseCost','netSaleProceeds','returnVsGrossPurchaseCostPct'] as const)assert.equal(server[key],client[key],key);
  assert.equal(server.accountingReconciled,false);assert.equal(server.grantsDecisionEligibility,false);assert.equal(server.historyCoverage,'unverified');
});
for(const changes of [{brokerage:null},{brokerage:true},{currency:null},{currency:'EUR'},{currency:'usd'},
  {quantity_derived:true},{quantity_derived:undefined},{price_derived:null},{id:undefined},
  {trade_date:'2026-02-31'},{trade_date:'2027-01-01'},{order_executed_at:true},
  {order_executed_at:'2027-01-01T12:00:00Z'},{quantity:1.00000001}]){
  test('original ledger gap withholds cost/P&L without average-cost fallback: '+JSON.stringify(changes),()=>{
    const result=calc([holding()],[trade(changes)]);
    assert.equal(result.currentValue,150);
    for(const key of ['openCostBasis','unrealizedPnl','realizedPnl','totalTradingPnl','netContributed'])assert.equal(result[key],null,key);
    assert.equal(result.accountingStatus,'ledger-inputs-unverified');assert(result.accountingIssues.length>0);
  });
}
for(const changes of [{returnedSymbol:'OTHER'},{currency:'EUR'},{simulated:true},{stale:true},{stale:'false'},
  {status:'conflicting'},{sourceMode:'simulated'},{marketTimePrecision:'date-only'},
  {marketTime:new Date(NOW-121*60000).toISOString()},{marketTime:new Date(NOW+121000).toISOString()},
  {isMarketSessionOpen:null},{price:null}]){
  test('inadmissible quotes cannot supply current value, weights or P&L: '+JSON.stringify(changes),()=>{
    const result=calc([holding()],[trade()],{FICT:quote(changes)});
    assert.equal(result.currentValue,null);assert.equal(result.totalTradingPnl,null);assert.equal(result.unrealizedPnl,null);
    assert.equal(result.realizedPnl,0);assert.equal(result.openCostBasis,100);assert.equal(result.quoteCoverage.status,'partial');
    assert(result.accountingIssues.some(issue=>issue.code==='QUOTE_WITHHELD'));
    assert.deepEqual(result.admittedQuotes,{});assert.deepEqual(result.positionMarks,[]);
  });
}
test('explicit last close supports conditional valuation while remaining distinct from live coverage',()=>{
  const result=calc([holding()],[trade()],{FICT:quote({status:'last_close',isMarketSessionOpen:false,marketTime:new Date(NOW-48*3600000).toISOString()})});
  assert.equal(result.currentValue,150);assert.equal(result.quoteCoverage.status,'last-close');assert.equal(result.quoteCoverage.lastCloseQuotes,1);
  assert.equal(result.totalTradingPnl,50);assert.equal(result.accountingReconciled,false);
});
test('partial quote coverage withholds the full denominator while preserving conditional realized result',()=>{
  const r=calc([holding(),holding({symbol:'DEMO'})],[trade(),trade({id:'demo-buy',symbol:'DEMO'})]);
  assert.equal(r.currentValue,null);assert.equal(r.quoteCoverage.coveragePct,50);assert.equal(r.realizedPnl,0);assert.equal(r.openCostBasis,200);
  assert.equal(r.positionMarks.length,1);assert.equal(r.totalTradingPnl,null);
});
test('unavailable, empty, duplicate, coerced and oversold records cannot certify an empty or reconciled account',()=>{
  for(const r of [calc([holding()],[]),calc([],[]),calc([holding()],[trade(),trade()]),calc([holding({quantity:true})]),
    calc([holding(),holding()]),calc([holding()],[trade({transaction_type:'SELL'})]),calc(undefined,undefined,undefined,NOW,{holdings:'ready',transactions:'unavailable'})]){
    assert.equal(r.totalTradingPnl,null);assert.equal(r.accountingReconciled,false);
  }
  assert.equal(calc([],[]).quoteCoverage.status,'empty');
});
test('same-day source row order cannot replace distinct execution instants',()=>{
  const r=calc([], [trade({quantity:1,source_row:1}),trade({id:'sell',transaction_type:'SELL',source_row:2})],{});
  assert.equal(r.totalTradingPnl,null);assert(r.accountingIssues.some(issue=>issue.code==='ORDER_AMBIGUOUS'));
});
test('finite but excessive numeric aggregates are withheld and no private properties are read',()=>{
  assert.equal(calc([holding({quantity:1e6})],[trade({quantity:1e6})],{FICT:quote({price:1e12})}).currentValue,null);
  const h=holding(),tx=trade();
  Object.defineProperty(h,'notes',{enumerable:true,get(){throw Error('private notes accessed');}});
  Object.defineProperty(tx,'apiKey',{enumerable:true,get(){throw Error('private key accessed');}});
  const r=calc([h],[tx]);assert.equal(r.totalTradingPnl,50);assert(!JSON.stringify(r).includes('apiKey'));
});
