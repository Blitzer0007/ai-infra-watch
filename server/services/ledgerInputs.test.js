import {test} from 'node:test';
import assert from 'node:assert/strict';
import {storedLedgerInputs} from './ledgerInputs.js';
import {normalizeTransaction,normalize} from '../../api/portfolio.js';
import {calculateActualPortfolio} from '../api/decision-center.js';
import {deriveHoldingLedgerCostBasis} from '../api/portfolio-holding-return-alerts.js';
test('actual DTO carries original accounting gaps alongside legacy display defaults',()=>{
  const tx=normalizeTransaction({id:'fictional',symbol:'FICT',transaction_type:'UNKNOWN',quantity:true,amount:100,brokerage:null,trade_date:'2026-01-01',source_row:1});
  assert.equal(tx.transactionType,'BUY');assert.equal(tx.currency,'USD');
  assert.equal(tx.accountingInputs.transactionType,null);assert.equal(tx.accountingInputs.quantity,null);assert.equal(tx.accountingInputs.currency,null);assert.equal(tx.accountingInputs.brokerage,null);
});
test('explicit reported zero fee and finite SQL numeric strings survive the source adapter',()=>{
  const fields=storedLedgerInputs({symbol:'FICT',transaction_type:'BUY',quantity:'0.1',amount:'10',brokerage:0,currency:'USD',quantity_derived:false,price_derived:false});
  assert.equal(fields.quantity,.1);assert.equal(fields.amount,10);assert.equal(fields.brokerage,0);assert.equal(fields.quantityDerived,false);
  assert.equal(storedLedgerInputs({amount:Infinity,brokerage:true,currency:'GBp'}).amount,null);
  assert.equal(storedLedgerInputs({amount:Infinity,brokerage:true,currency:'GBp'}).brokerage,null);
  assert.equal(storedLedgerInputs({currency:'GBp'}).currency,'GBp');
});
test('both server ledgers preserve cost of a small remainder after a large sale',()=>{
  const tx=[{symbol:'FICT',transaction_type:'BUY',quantity:100000,amount:100000,brokerage:0,currency:'USD',trade_date:'2026-01-01'},{symbol:'FICT',transaction_type:'SELL',quantity:99999,amount:99999,brokerage:0,currency:'USD',trade_date:'2026-02-01'}];
  const holdings=[{symbol:'FICT',quantity:1,average_cost:1}];
  const ledger=deriveHoldingLedgerCostBasis(tx,holdings).get('FICT');assert.equal(ledger.openCostBasis,1);assert.equal(ledger.realizedPnl,0);
  const actual=calculateActualPortfolio(holdings,tx,{FICT:{price:1,changePct:0}});assert.equal(actual.openCostBasis,1);assert.equal(actual.realizedPnl,0);
});
test('both server ledgers flag an excessive sale even when relative position tolerance would allow it',()=>{
  const tx=[{symbol:'FICT',transaction_type:'BUY',quantity:100000,amount:100000,brokerage:0,currency:'USD',trade_date:'2026-01-01'},{symbol:'FICT',transaction_type:'SELL',quantity:100000.000001,amount:100000,brokerage:0,currency:'USD',trade_date:'2026-02-01'}];
  assert.equal(deriveHoldingLedgerCostBasis(tx,[]).get('FICT').invalidSequence,true);
  const actual=calculateActualPortfolio([],tx,{});assert.equal(actual.accountingStatus,'quantity-mismatch');assert.equal(actual.realizedPnl,null);assert.equal(actual.totalTradingPnl,null);
});

test('holding provenance preserves an invalid raw quantity despite a legacy display coercion',()=>{const h=normalize({id:'fictional',symbol:'FICT',quantity:true,average_cost:100});assert.equal(h.quantity,1);assert.equal(h.accountingInputs.quantity,null);assert.equal(h.accountingInputs.symbol,'FICT');});
