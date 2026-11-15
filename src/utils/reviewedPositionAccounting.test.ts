/** Fictional contracts only; arithmetic agreement does not prove authentic source coverage. */
import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {reviewLoadedPositionAccounting,calculateLoadedTradingPerformance} from './reviewedPortfolioAccounting';
import {mapStoredPortfolioHoldings,buildPositionAnalyses,calculatePositionScenario,withCurrentPortfolioWeights} from './portfolioPositions';
import {buildIntelligence,type PricePoint} from './intelligence';
import type {StoredPortfolioHolding} from './portfolioApi';
import type {LoadedLedgerInput} from './loadedLedgerReview';
import {cases,holding,trade,input,assessedAt} from '../../scripts/fixtures/accounting-crosscheck.fictional';
const now=Date.parse(assessedAt);
function projection(i:LoadedLedgerInput,price:number|null=150) {
  const prices=Object.fromEntries(i.holdings.map(raw=>{
    const row=raw as {symbol:string};
    return [row.symbol,{symbol:row.symbol,returnedSymbol:row.symbol,price,changePct:0,provider:'fictional-source',sourceMode:'live',currency:'USD',adjustedBasis:'raw',marketTimePrecision:'instant',marketTime:assessedAt,retrievedAt:assessedAt,isMarketSessionOpen:true}];
  })) as Record<string,PricePoint>;
  const holdings=i.holdings.map(raw=>({...raw as object,currency:'USD'})) as StoredPortfolioHolding[];
  return buildPositionAnalyses(prices,buildIntelligence(prices),mapStoredPortfolioHoldings(holdings),now);
}
function checkAbstention(p:ReturnType<typeof reviewLoadedPositionAccounting>['positions'][number]) {
  assert.equal(p.accountingReconciled,false);assert.equal(p.grantsDecisionEligibility,false);assert.equal(p.historyCoverage,'unverified');
  assert.equal(p.state,'INSUFFICIENT DATA');assert.equal(p.averageInAlert,false);assert.equal(p.recoveryAlert,false);
}
describe('reviewed position cost, conditional P&L and scenario projection',()=>{
  for(const c of cases.filter(c=>c.input.holdings.length))it(`matches aggregate costs: ${c.name}`,()=>{
    const base=projection(c.input),before=JSON.stringify({input:c.input,base});
    const result=reviewLoadedPositionAccounting(c.input,base);
    assert.equal(result.review.status,'matched-loaded-records');
    const aggregate=calculateLoadedTradingPerformance(c.input,base.map(p=>({symbol:p.symbol,quantity:p.quantity,currentPrice:p.livePrice})));
    assert.equal(result.positions.reduce((sum,p)=>sum+p.investedValue!,0),aggregate.openCostBasis);
    for(const p of result.positions) {
      const ledger=result.review.positions.find(r=>r.symbol===p.symbol)!;
      assert.equal(p.investedValue,ledger.openCostBasis);assert.equal(p.pnl,p.currentValue!-ledger.openCostBasis!);
      assert.equal(calculatePositionScenario(p,160).pnl,p.quantity*160-ledger.openCostBasis!);checkAbstention(p);
    }
    assert.equal(JSON.stringify({input:c.input,base}),before);
  });
  for(const price of [50,100,150])it(`preserves gain, loss or observed zero at ${price}`,()=>{
    const i=input(),p=reviewLoadedPositionAccounting(i,projection(i,price)).positions[0];
    assert.equal(p.averageCost,100);assert.equal(p.pnl,price-100);assert.equal(p.pnlPct,price-100);checkAbstention(p);
  });
  it('uses exact cost when dividing into an average cannot round-trip',()=>{
    const i=input([holding(49)],[trade('fractional-average',{quantity:49,amount:1})]);
    const p=reviewLoadedPositionAccounting(i,projection(i)).positions[0];
    assert.notEqual(p.quantity*p.averageCost,p.investedValue);
    assert.equal(calculatePositionScenario(p,1).pnl,48);assert.equal(p.loadedCostBasis,1);
  });
  for(const changes of [{brokerage:null},{currency:null},{quantity:2},{quantityDerived:true},{executedAt:'2026-01-01T25:00:00Z'}])it(`rejects unsupported originals ${JSON.stringify(changes)}`,()=>{
    const i=input([holding()],[trade('bad',changes)]),base=projection(i);
    // Caller-injected display fields must not rescue original ledger evidence.
    base[0].loadedCostBasis=1;base[0].investedValue=1;
    const p=reviewLoadedPositionAccounting(i,base).positions[0];
    assert.equal(p.currentValue,150);assert.equal(p.investedValue,null);assert.equal(p.loadedCostBasis,null);assert.equal(p.pnl,null);assert.equal(p.pnlPct,null);
    assert.equal(p.whatIfProfitAt10Pct,null);assert.equal(calculatePositionScenario(p,160).pnl,null);checkAbstention(p);
  });
  it('rejects ambiguous order, unavailable and absent transactions',()=>{
    for(const i of [input([holding()],[trade(),trade('sell',{transactionType:'SELL'}),trade('buy2')]),input([holding()],[]),{...input(),transactionsAvailability:'loading' as const},{...input(),transactionsAvailability:'unavailable' as const}]) {
      const p=reviewLoadedPositionAccounting(i,projection(i)).positions[0];assert.equal(p.investedValue,null);assert.equal(p.pnl,null);assert.equal(p.currentValue,150);
    }
  });
  it('withholds misbound/duplicate/missing projection quantities and values',()=>{
    const i=input(),base=projection(i);
    for(const rows of [[{...base[0],quantity:2}], [base[0],base[0]], [{...base[0],symbol:'OTHER'}]]) {
      for(const p of reviewLoadedPositionAccounting(i,rows).positions) {assert.equal(p.currentValue,null);assert.equal(p.investedValue,null);assert.equal(p.pnl,null);checkAbstention(p);}
    }
    assert.deepEqual(reviewLoadedPositionAccounting(i,[]).positions,[]);
  });
  it('keeps individual quote values but no subset weights when quotes are partial',()=>{
    const i=input([holding(1,'FICT'),holding(1,'FICB')],[trade(),trade('b',{symbol:'FICB'})]),base=projection(i);
    base[1]={...base[1],livePrice:null,currentValue:null};
    const rows=withCurrentPortfolioWeights(reviewLoadedPositionAccounting(i,base).positions);
    assert.equal(rows[0].currentValue,150);assert.equal(rows[0].pnl,50);assert.equal(rows[1].investedValue,100);assert.equal(rows[1].pnl,null);
    assert(rows.every(p=>p.portfolioWeight===null));
  });
  it('preserves cost but withholds unsupported/stale/overflow marks and scenario overflow',()=>{
    const i=input(),base=projection(i);
    for(const edit of [{liveStale:true},{currentValue:Infinity},{currentValue:1e12+1},{currentValue:149},{quantitySupported:false}]) {
      const p=reviewLoadedPositionAccounting(i,[{...base[0],...edit}]).positions[0];assert.equal(p.currentValue,null);assert.equal(p.pnl,null);
    }
    const p=reviewLoadedPositionAccounting(i,base).positions[0];assert.equal(calculatePositionScenario(p,Infinity).pnl,null);assert.equal(calculatePositionScenario(p,1e13).pnl,null);
  });
  it('preserves a closed zero-quantity row without inventing a percentage return',()=>{
    const i=input([holding(0)],[trade(),trade('close',{transactionType:'SELL',amount:110,tradeDate:'2026-02-01'})]);
    const p=reviewLoadedPositionAccounting(i,projection(i)).positions[0];
    assert.equal(p.investedValue,0);assert.equal(p.currentValue,0);assert.equal(p.pnl,0);assert.equal(p.pnlPct,null);
    assert.deepEqual(calculatePositionScenario(p,120),{saleValue:0,pnl:0,returnPct:null});checkAbstention(p);
  });
  it('retains legitimate tiny costs and uses ledger receipts instead of missing snapshot averages',()=>{
    const i=input([holding()],[trade('tiny',{amount:1e-10})]),base=projection(i);
    base[0].averageCost=0;base[0].costBasisSupported=false;base[0].investedValue=null;
    const p=reviewLoadedPositionAccounting(i,base).positions[0];assert.equal(p.investedValue,1e-10);assert.equal(p.averageCost,1e-10);assert.equal(calculatePositionScenario(p,1e-9).pnl,1e-9-1e-10);checkAbstention(p);
  });
});
