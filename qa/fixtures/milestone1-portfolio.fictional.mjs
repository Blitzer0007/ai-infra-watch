// Fictional original database rows projected through the production API helpers.
import {storedHoldingInputs,storedHoldingValuationInputs,storedLedgerInputs,transactionQuality} from '../../server/services/ledgerInputs.js';
const mode=process.argv[2];
if(!['valid','unknown-fee','partial','simulated','tiny','zero','loss','unavailable','legacy-ui'].includes(mode))throw Error('Unknown case');
const symbols=mode==='partial'?['NVDA','AMD']:['NVDA'];
const cost=mode==='tiny'?1e-10:mode==='legacy-ui'?150:100;
const holdings=symbols.map(symbol=>{
 const raw={symbol,quantity:1,average_cost:mode==='legacy-ui'?150:999,currency:'USD'};
 return {id:'fictional-'+symbol,symbol,quantity:1,averageCost:raw.average_cost,currency:'USD',purchaseDate:'2026-01-01',accountingInputs:storedHoldingInputs(raw),valuationInputs:storedHoldingValuationInputs(raw)};
});
const transactions=symbols.map(symbol=>{
 const raw={symbol,transaction_type:'BUY',quantity:1,amount:cost,brokerage:mode==='unknown-fee'?null:0,currency:'USD',trade_date:'2026-01-01',order_executed_at:null,quantity_derived:false,price_derived:false};
 return {id:'fictional-buy-'+symbol,symbol,transactionType:'BUY',quantity:1,amount:cost,brokerage:raw.brokerage,currency:'USD',tradeDate:raw.trade_date,sourceRow:1,dataQuality:transactionQuality(raw).status,accountingInputs:storedLedgerInputs(raw)};
});
process.stdout.write(JSON.stringify({holdings,transactions,price:mode==='tiny'?2e-10:mode==='loss'?80:mode==='zero'?100:150}));
