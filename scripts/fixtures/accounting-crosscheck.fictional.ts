/** Invented ledgers for arithmetic/contract tests; no authentic account history. */
import type { LoadedLedgerInput } from '../../src/utils/loadedLedgerReview';
export const assessedAt='2026-11-14T12:00:00Z';
export const holding=(quantity=1,symbol='FICT')=>({symbol,quantity,averageCost:999,notes:'private holding text',accountingInputs:{contractVersion:'stored-holding-inputs-v1' as const,symbol,quantity}});
export const trade=(id='buy',changes:Record<string,unknown>={})=>({id,symbol:changes.symbol??'FICT',dataQuality:'ok',amount:999,brokerage:999,currency:'EUR',quantity:999,sourceRow:999,notes:'private trade text',accountingInputs:{contractVersion:'stored-ledger-inputs-v1',symbol:'FICT',transactionType:'BUY',quantity:1,amount:100,brokerage:0,currency:'USD',tradeDate:'2026-01-01',executedAt:null,quantityDerived:false,priceDerived:false,...changes}});
export const input=(holdings:unknown[]=[holding()],transactions:unknown[]=[trade()]):LoadedLedgerInput=>({holdings,transactions,assessedAt,holdingsAvailability:'ready',transactionsAvailability:'ready'});
export const cases=[
  {name:'known-fees-partial-sale',input:input([holding()],[trade('b',{quantity:2,amount:200,brokerage:2}),trade('s',{transactionType:'SELL',amount:120,brokerage:1,tradeDate:'2026-02-01'})]),cost:101,realized:18},
  {name:'weighted-average',input:input([holding(2)],[trade('b1',{quantity:2,amount:20,brokerage:2}),trade('b2',{amount:12,tradeDate:'2026-02-01'}),trade('s',{transactionType:'SELL',amount:15,brokerage:1,tradeDate:'2026-03-01'})]),cost:68/3,realized:8/3},
  {name:'fees-exceed-sale',input:input([],[trade('b',{amount:2}),trade('s',{transactionType:'SELL',amount:1,brokerage:3,tradeDate:'2026-02-01'})]),cost:0,realized:-4},
  {name:'minimum-remaining-unit',input:input([holding(1e-8)],[trade('b',{quantity:2e-8,amount:2}),trade('s',{transactionType:'SELL',quantity:1e-8,amount:1,tradeDate:'2026-02-01'})]),cost:1,realized:0},
  {name:'small-money',input:input([holding()],[trade('b',{amount:1e-10})]),cost:1e-10,realized:0},
  {name:'fractional-inventory',input:input([holding(.2)],[trade('b1',{quantity:.1,amount:10}),trade('b2',{quantity:.2,amount:20,tradeDate:'2026-02-01'}),trade('s',{transactionType:'SELL',quantity:.1,amount:12,tradeDate:'2026-03-01'})]),cost:20,realized:2},
  {name:'execution-order-over-row-order',input:input([],[trade('z-sale',{transactionType:'SELL',amount:120,executedAt:'2026-01-01T13:00:00+01:00'}),trade('a-buy',{executedAt:'2026-01-01T11:00:00Z'})]),cost:0,realized:20},
  {name:'multiple-and-closed-symbols',input:input([holding(1,'FICB')],[trade('a-buy'),trade('b-buy',{symbol:'FICB',amount:80}),trade('a-sale',{transactionType:'SELL',amount:110,tradeDate:'2026-02-01'})]),cost:80,realized:10},
];
