import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {calculateLoadedTradingPerformance,buildAccountingCrosscheckPacket} from './reviewedPortfolioAccounting';
import {calculateLoadedCashFlowPerformance} from './reviewedCashFlowAccounting';
import {cases,holding,trade,input} from '../../scripts/fixtures/accounting-crosscheck.fictional';
const marks=[{symbol:'FICT',quantity:1,currentPrice:150}];
const flow=(changes:Record<string,unknown>={})=>({id:'fictional-deposit',amount:999,currency:'EUR',notes:'private deposit',accountingInputs:{contractVersion:'stored-cash-flow-inputs-v1',eventDate:'2026-01-01',flowType:'deposit',amount:200,currency:'USD',fxToUsd:1,...changes}});

describe('original-input conditional accounting consumer',()=>{
  for(const c of cases)it(c.name,()=>{
    const rows=(c.input.holdings as ReturnType<typeof holding>[]).map(h=>({symbol:h.symbol,quantity:h.quantity,currentPrice:150}));
    const r=calculateLoadedTradingPerformance(c.input,rows);
    assert.equal(r.status,'conditional-loaded-records');
    assert(Math.abs(r.openCostBasis!-c.cost)<=Math.max(Math.abs(c.cost)*1e-14,1e-14));
    assert(Math.abs(r.realizedPnl!-c.realized)<=Math.max(Math.abs(c.realized)*1e-14,1e-14));
    assert.equal(r.accountingReconciled,false);assert.equal(r.grantsDecisionEligibility,false);assert.equal(r.historyCoverage,'unverified');
    const serialized=JSON.stringify(buildAccountingCrosscheckPacket(c.input));assert(!serialized.includes('private'));assert(!serialized.includes('averageCost'));assert(!serialized.includes('sourceRow'));
  });
  for(const changes of [{brokerage:null},{currency:null},{quantityDerived:true},{tradeDate:'2027-01-01'},{quantity:2},{amount:NaN}])it(`withholds ledger totals for ${JSON.stringify(changes)}`,()=>{
    const i=input([holding()],[trade('b',changes)]),r=calculateLoadedTradingPerformance(i,marks);
    assert.equal(r.status,'ledger-inputs-unverified');assert.equal(r.currentValue,150);
    for(const key of ['openCostBasis','realizedPnl','unrealizedPnl','totalTradingPnl','returnVsGrossPurchaseCostPct'] as const)assert.equal(r[key],null);
    assert.equal(buildAccountingCrosscheckPacket(i),null);
  });
  for(const availability of ['loading','unavailable'] as const)it(`never treats ${availability} trades as complete`,()=>{
    const r=calculateLoadedTradingPerformance({...input(),transactionsAvailability:availability},marks);assert.equal(r.realizedPnl,null);assert.equal(r.totalTradingPnl,null);
  });
  it('keeps known zero trade results separate from unavailable records',()=>{
    assert.equal(calculateLoadedTradingPerformance(input(),marks).realizedPnl,0);
    assert.equal(calculateLoadedTradingPerformance(input([holding()],[]),marks).realizedPnl,null);
    assert.equal(calculateLoadedTradingPerformance(input([holding()],[]),marks).unrealizedPnl,null);
  });
  for(const invalidMarks of [[],[{...marks[0],quantity:2}],[marks[0],marks[0]],[{...marks[0],currentPrice:null}],[{...marks[0],currentPrice:NaN}],[{...marks[0],currentPrice:Infinity}]])it('withholds quote-dependent values for unbound or missing marks',()=>{
    const r=calculateLoadedTradingPerformance(input(),invalidMarks);assert.equal(r.status,'quotes-incomplete');assert.equal(r.currentValue,null);assert.equal(r.unrealizedPnl,null);assert.equal(r.realizedPnl,0);
  });
  it('rejects provenance-free or coerced holding values and does not mutate inputs',()=>{
    const i=input([{...holding(),accountingInputs:undefined}]);assert.equal(calculateLoadedTradingPerformance(i,marks).currentValue,null);
    const valid=input(),before=JSON.stringify(valid);calculateLoadedTradingPerformance(valid,marks);buildAccountingCrosscheckPacket(valid);assert.equal(JSON.stringify(valid),before);
  });
  it('uses explicit ASCII symbol ordering in the cross-language packet',()=>{
    const packet=buildAccountingCrosscheckPacket(input([holding(1,'^FICT'),holding(1,'FICB')],[trade('a',{symbol:'^FICT'}),trade('b',{symbol:'FICB'})]));
    assert.deepEqual(packet?.expected.positions.map(p=>p.symbol),['FICB','^FICT']);
  });
});

describe('cash-flow original-input gate',()=>{
  it('ignores display defaults and calculates only conditional loaded-record totals',()=>{
    const r=calculateLoadedCashFlowPerformance(input(),marks,[flow()],'ready');assert.equal(r.status,'conditional-loaded-records');assert.equal(r.netContributionsUsd,200);assert.equal(r.cashBalanceUsd,100);assert.equal(r.accountValueUsd,250);assert.equal(r.totalPnlUsd,50);assert.equal(r.accountingReconciled,false);assert.equal(r.grantsDecisionEligibility,false);
  });
  for(const changes of [{currency:null},{fxToUsd:null},{fxToUsd:true},{fxToUsd:1.00000001},{amount:null},{amount:Infinity},{eventDate:'2026-02-30'},{eventDate:'2027-01-01'},{flowType:null},{private:'not allowed'}])it(`withholds unsupported original flow ${JSON.stringify(changes)}`,()=>{
    const r=calculateLoadedCashFlowPerformance(input(),marks,[flow(changes)],'ready');assert.equal(r.status,'invalid-records');assert.equal(r.totalPnlUsd,null);assert.equal(r.cashBalanceUsd,null);
  });
  it('withholds flows when retrieval failed or original provenance is absent',()=>{
    for(const availability of ['loading','unavailable'] as const)assert.equal(calculateLoadedCashFlowPerformance(input(),marks,[flow()],availability).totalPnlUsd,null);
    assert.equal(calculateLoadedCashFlowPerformance(input(),marks,[{...flow(),accountingInputs:undefined}],'ready').totalPnlUsd,null);
    assert.equal(calculateLoadedCashFlowPerformance(input(),marks,[flow(),flow()],'ready').totalPnlUsd,null);
  });
  it('does not bypass strict trade quantity/fee/currency/order checks',()=>{
    for(const changes of [{quantity:1.00000001},{brokerage:null},{currency:null}])assert.equal(calculateLoadedCashFlowPerformance(input([holding()],[trade('b',changes)]),marks,[flow()],'ready').cashBalanceUsd,null);
  });
  it('keeps missing quotes and empty external flows distinct',()=>{
    const r=calculateLoadedCashFlowPerformance(input(),[{...marks[0],currentPrice:null}],[flow()],'ready');assert.equal(r.status,'quotes-incomplete');assert.equal(r.cashBalanceUsd,100);assert.equal(r.totalPnlUsd,null);
    assert.equal(calculateLoadedCashFlowPerformance(input(),marks,[],'ready').status,'external-flows-missing');
  });
});
