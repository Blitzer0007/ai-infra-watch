import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { reviewLoadedLedger, type StoredLedgerInputs } from './loadedLedgerReview';
import { storedLedgerInputs,storedHoldingInputs } from '../../server/services/ledgerInputs.js';
const NOW='2026-11-09T12:00:00Z';
const holding=(symbol='FICT',quantity=1)=>({symbol,quantity,accountingInputs:storedHoldingInputs({symbol,quantity}),averageCost:999,notes:'private notes must not be copied'});
const transaction=(id='fictional-buy',fields:Record<string,unknown>={})=>{
  const raw={symbol:'FICT',transaction_type:'BUY',quantity:1,amount:100,brokerage:0,currency:'USD',trade_date:'2026-01-01',quantity_derived:false,price_derived:false,...fields};
  return {id,symbol:raw.symbol,dataQuality:'ok',accountingInputs:storedLedgerInputs(raw) as StoredLedgerInputs,notes:'private transaction text'};
};
const review=(holdings:readonly unknown[]=[holding()],transactions:readonly unknown[]=[transaction()],extra:Record<string,unknown>={})=>reviewLoadedLedger({holdings,transactions,holdingsAvailability:'ready',transactionsAvailability:'ready',assessedAt:NOW,...extra});
const code=(result:ReturnType<typeof review>,value:string)=>result.issues.some(i=>i.code===value);
describe('loaded ledger diagnostics over existing accounting',()=>{
  it('matches only supplied records without borrowing holding cost or upgrading authority',()=>{
    const result=review();assert.equal(result.status,'matched-loaded-records');assert.deepEqual(result.totals,{openCostBasis:100,recordedTradeResult:0,grossPurchaseCost:100,netSaleProceeds:0});
    assert.equal(result.positions[0].openCostBasis,100);assert.equal(result.historyCoverage,'unverified');assert.equal(result.corporateActionCoverage,'unverified');
    assert.equal(result.accountingReconciled,false);assert.equal(result.grantsDecisionEligibility,false);assert.equal(result.verifiesSourceRecords,false);assert(!JSON.stringify(result).includes('private'));
  });
  it('keeps fees greater than sale proceeds as a real loss',()=>{
    const result=review([holding('FICT',1)],[transaction('b',{quantity:2,amount:2}),transaction('s',{transaction_type:'SELL',amount:1,brokerage:3,trade_date:'2026-02-01'})]);
    assert.deepEqual(result.totals,{openCostBasis:1,recordedTradeResult:-3,grossPurchaseCost:2,netSaleProceeds:-2});
  });
  it('includes fully closed positions and distinguishes an empty ledger',()=>{
    const result=review([],[transaction('b'),transaction('s',{transaction_type:'SELL',amount:120,trade_date:'2026-02-01'})]);assert.equal(result.status,'matched-loaded-records');assert.equal(result.positions[0].ledgerQuantity,0);assert.equal(result.totals?.recordedTradeResult,20);assert.equal(result.totals?.openCostBasis,0);
    assert.equal(review([],[]).status,'empty');assert.equal(review([],[]).totals,null);assert(code(review([holding()],[]),'NO_TRANSACTIONS'));
  });
  for(const state of ['loading','unavailable'] as const)it(`separates ${state} from a known empty ledger`,()=>{const r=review([],[],{transactionsAvailability:state});assert.equal(r.status,'unavailable');assert.equal(r.totals,null);assert(code(r,state==='loading'?'RECORDS_LOADING':'RECORDS_UNAVAILABLE'));});
  for(const fields of [{brokerage:null},{brokerage:true},{brokerage:-1},{brokerage:'invalid'}])it(`withholds an unknown/invalid fee ${JSON.stringify(fields)}`,()=>{const r=review([holding()],[transaction('b',fields)]);assert(code(r,'FEE_UNKNOWN'));assert.equal(r.totals,null);});
  for(const currency of [undefined,null,'EUR','GBp','usd','USd',''])it(`does not infer USD for ${String(currency)}`,()=>{const r=review([holding()],[transaction('b',{currency})]);assert(code(r,'CURRENCY_UNKNOWN_OR_UNSUPPORTED'));assert.equal(r.totals,null);});
  for(const fields of [{quantity_derived:true},{price_derived:true},{quantity_derived:undefined}])it(`withholds derived/unknown inputs ${JSON.stringify(fields)}`,()=>assert(code(review([holding()],[transaction('b',fields)]),'DERIVED_OR_REVIEW_RECORD')));
  it('does not accept legacy defaults in place of stored inputs',()=>{const r=review([holding()],[{id:'legacy',symbol:'FICT',transactionType:'BUY',quantity:1,amount:100,brokerage:0,currency:'USD'}]);assert(code(r,'PROVENANCE_UNAVAILABLE'));assert.equal(r.totals,null);});
  it('rejects review status and private extra provenance fields without echo',()=>{
    const tx=transaction();assert(code(review([holding()],[{...tx,dataQuality:'review'}]),'DERIVED_OR_REVIEW_RECORD'));
    const bad={...tx,accountingInputs:{...tx.accountingInputs,privateField:'do-not-display'}};const r=review([holding()],[bad]);assert(code(r,'PROVENANCE_UNAVAILABLE'));assert(!JSON.stringify(r).includes('do-not-display'));
  });
  for(const fields of [{transaction_type:'OTHER'},{quantity:true},{quantity:0},{quantity:1e-9},{quantity:1e9},{amount:0},{amount:NaN},{amount:Infinity},{symbol:'OTHER'}])it(`rejects unsuitable transaction fields ${JSON.stringify(fields)}`,()=>{
    const tx=transaction('b',fields);const r=review([holding()],[{...tx,symbol:'FICT'}]);assert(code(r,'INVALID_TRANSACTION'));assert.equal(r.totals,null);assert.doesNotThrow(()=>JSON.stringify(r));
  });
  for(const date of ['2026-02-30','2027-01-01','2026-01-01T00:00:00Z',''])it(`rejects unsuitable trade date ${date}`,()=>assert(code(review([holding()],[transaction('b',{trade_date:date})]),'TRADE_DATE_INVALID')));
  it('rejects duplicate IDs, duplicate holdings and out-of-scope identities',()=>{
    assert(code(review([holding()],[transaction(),transaction()]),'INVALID_TRANSACTION'));assert(code(review([holding(),holding()]),'INVALID_HOLDING'));
    assert(code(review([holding('fict')]),'INVALID_HOLDING'));assert(code(review([holding('FICT',NaN)]),'INVALID_HOLDING'));
  });
  it('rejects oversized inputs without truncating into success',()=>{assert(code(review(Array.from({length:151},(_,i)=>holding('F'+i))),'RECORD_LIMIT'));assert(code(review([holding()],Array.from({length:1001},(_,i)=>transaction('b'+i))),'RECORD_LIMIT'));});
  it('rejects sales before inventory and reports exact eight-decimal quantity mismatches',()=>{
    assert(code(review([],[transaction('s',{transaction_type:'SELL'})]),'INVALID_SEQUENCE'));
    assert(code(review([holding('FICT',1.00000001)]),'QUANTITY_MISMATCH'));
    assert(code(review([holding('FICT',0.99999)]),'QUANTITY_MISMATCH'));
  });
  it('withholds ambiguous same-day buys and sales instead of using report row order',()=>{
    const r=review([],[transaction('b'),transaction('s',{transaction_type:'SELL'})]);assert(code(r,'ORDER_AMBIGUOUS'));assert.equal(r.totals,null);
  });
  it('uses distinct explicit execution times for same-day mixed actions',()=>{
    const txs=[transaction('s',{transaction_type:'SELL',amount:120,order_executed_at:'2026-01-01T12:00:00Z'}),transaction('b',{order_executed_at:'2026-01-01T11:00:00Z'})];const before=JSON.stringify(txs);
    const r=review([],txs);assert.equal(r.status,'matched-loaded-records');assert.equal(r.totals?.recordedTradeResult,20);assert.equal(JSON.stringify(txs),before);
  });
  it('same-day mixed actions with equal execution instants remain ambiguous',()=>{
    const r=review([],[transaction('b',{order_executed_at:'2026-01-01T12:00:00Z'}),transaction('s',{transaction_type:'SELL',order_executed_at:'2026-01-01T12:00:00Z'})]);assert(code(r,'ORDER_AMBIGUOUS'));
  });
  for(const stamp of ['2026-01-01T12:00:00','2026-01-02T12:00:00Z','2027-01-01T12:00:00Z','2026-01-01T24:00:00Z'])it(`rejects invalid or inconsistent execution time ${stamp}`,()=>assert(code(review([holding()],[transaction('b',{order_executed_at:stamp})]),'TRADE_DATE_INVALID')));
  it('preserves a small remaining position after a large partial sale',()=>{
    const r=review([holding('FICT',1)],[transaction('b',{quantity:100000,amount:100000}),transaction('s',{transaction_type:'SELL',quantity:99999,amount:99999,trade_date:'2026-02-01'})]);assert.equal(r.status,'matched-loaded-records');assert.equal(r.totals?.openCostBasis,1);assert.equal(r.totals?.recordedTradeResult,0);
  });
  it('retains the minimum recorded remaining share unit',()=>{
    const r=review([holding('FICT',0.00000001)],[transaction('b',{quantity:0.00000002,amount:2}),transaction('s',{transaction_type:'SELL',quantity:0.00000001,amount:1,trade_date:'2026-02-01'})]);assert.equal(r.status,'matched-loaded-records');assert.equal(r.totals?.openCostBasis,1);
  });
});

it('the existing accounting kernel rejects a slightly excessive sale',async()=>{
  const {calculatePortfolioTradingPerformance}=await import('./portfolioAccounting');
  const r=calculatePortfolioTradingPerformance([],[{symbol:'FICT',transactionType:'BUY',quantity:100000,amount:100000,currency:'USD'},{symbol:'FICT',transactionType:'SELL',quantity:100000.000001,amount:100000,currency:'USD'}],true);
  assert.equal(r.status,'quantity-mismatch');assert.equal(r.realizedPnl,null);assert.equal(r.totalTradingPnl,null);
});

it('holding display coercions cannot establish original record quantities',()=>{const r=review([{...holding(),quantity:1,accountingInputs:storedHoldingInputs({symbol:'FICT',quantity:true})}]);assert(code(r,'INVALID_HOLDING'));assert.equal(r.totals,null);});
