/** Conditional calculations over original loaded inputs, never full-history proof. */
import { reviewLoadedLedger, type LoadedLedgerInput } from './loadedLedgerReview';
import type { PortfolioTradingPerformance } from './portfolioAccounting';

export type ReviewedTradingPerformance = Omit<PortfolioTradingPerformance,'status'> & {
  status:'conditional-loaded-records'|'ledger-inputs-unverified'|'quotes-incomplete';
  accountingReconciled:false; grantsDecisionEligibility:false; historyCoverage:'unverified';
};
export type LoadedMark = {symbol:string;quantity:number;currentPrice:number|null};

export function calculateLoadedTradingPerformance(input:LoadedLedgerInput, marks:readonly LoadedMark[]):ReviewedTradingPerformance {
  const review=reviewLoadedLedger(input);
  // Marks are admitted by the quote consumer. Bind them to original holding
  // quantities here; display defaults/duplicate symbols must not add value.
  const symbols=new Set<string>();
  const marked=input.holdingsAvailability==='ready'&&Array.isArray(input.holdings)&&Array.isArray(marks)&&input.holdings.length<=150&&marks.length===input.holdings.length&&input.holdings.every(raw=>{
    const row=raw as {symbol?:unknown;quantity?:unknown;accountingInputs?:{contractVersion?:unknown;symbol?:unknown;quantity?:unknown}};
    const original=row?.accountingInputs;
    if(!original||Object.keys(original).sort().join(',')!=='contractVersion,quantity,symbol'||original.contractVersion!=='stored-holding-inputs-v1'
      ||typeof row.symbol!=='string'||!/^[A-Z0-9.^=-]{1,20}$/.test(row.symbol)||symbols.has(row.symbol)
      ||original.symbol!==row.symbol||original.quantity!==row.quantity||typeof row.quantity!=='number'||!Number.isFinite(row.quantity)||row.quantity<0
      ||!Number.isSafeInteger(Math.round(row.quantity*1e8))||Number(row.quantity.toFixed(8))!==row.quantity)return false;
    symbols.add(row.symbol);
    const matches=marks.filter(mark=>mark.symbol===row.symbol);
    return matches.length===1&&matches[0].quantity===row.quantity&&(row.quantity===0||typeof matches[0].currentPrice==='number'&&Number.isFinite(matches[0].currentPrice)&&matches[0].currentPrice>0);
  });
  const value=marked?marks.reduce((sum,row)=>sum+(row.quantity===0?0:row.quantity*row.currentPrice!),0):null;
  const currentValue=value!==null&&Number.isFinite(value)&&Math.abs(value)<=1e12?value:null;
  const base:ReviewedTradingPerformance={status:'ledger-inputs-unverified',currentValue,openCostBasis:null,unrealizedPnl:null,realizedPnl:null,totalTradingPnl:null,
    grossPurchaseCost:null,netSaleProceeds:null,returnVsGrossPurchaseCostPct:null,quantityMismatchSymbols:review.issues.filter(i=>i.code==='QUANTITY_MISMATCH'&&i.symbol).map(i=>i.symbol!),derivedTransactionCount:0,currency:null,
    accountingReconciled:false,grantsDecisionEligibility:false,historyCoverage:'unverified'};
  if(review.status!=='matched-loaded-records'||!review.totals)return base;
  const totals=review.totals;
  const unrealizedPnl=currentValue!==null?currentValue-totals.openCostBasis:null;
  const totalTradingPnl=unrealizedPnl!==null?unrealizedPnl+totals.recordedTradeResult:null;
  const pct=totalTradingPnl!==null&&totals.grossPurchaseCost>0?totalTradingPnl/totals.grossPurchaseCost*100:null;
  if([unrealizedPnl,totalTradingPnl,pct].some(value=>value!==null&&!Number.isFinite(value)))return base;
  return {...base,status:currentValue===null?'quotes-incomplete':'conditional-loaded-records',currency:'USD',openCostBasis:totals.openCostBasis,realizedPnl:totals.recordedTradeResult,
    grossPurchaseCost:totals.grossPurchaseCost,netSaleProceeds:totals.netSaleProceeds,unrealizedPnl,totalTradingPnl,returnVsGrossPurchaseCostPct:pct};
}

/** Explicit offline handoff, allowlisting fields; never copies notes, auth or quotes. */
export function buildAccountingCrosscheckPacket(input:LoadedLedgerInput) {
  const review=reviewLoadedLedger(input);
  if(review.status!=='matched-loaded-records'||!review.totals)return null;
  return {contractVersion:'loaded-accounting-crosscheck-v1' as const,assessedAt:input.assessedAt,
    holdings:input.holdings.map(raw=>{const row=raw as {accountingInputs:{symbol:string;quantity:number}};return {symbol:row.accountingInputs.symbol,quantity:row.accountingInputs.quantity};}),
    transactions:input.transactions.map(raw=>{const row=raw as {id:string;accountingInputs:Record<string,unknown>};const v=row.accountingInputs;return {id:row.id,symbol:v.symbol,transactionType:v.transactionType,quantity:v.quantity,amount:v.amount,brokerage:v.brokerage,currency:v.currency,tradeDate:v.tradeDate,executedAt:v.executedAt};}),
    expected:{positions:review.positions.map(p=>({symbol:p.symbol,quantity:p.ledgerQuantity,openCostBasis:p.openCostBasis,recordedTradeResult:p.recordedTradeResult})).sort((a,b)=>a.symbol<b.symbol?-1:a.symbol>b.symbol?1:0),totals:{...review.totals}}};
}
