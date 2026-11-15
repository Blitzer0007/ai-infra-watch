/** Conditional calculations over original loaded inputs, never full-history proof. */
import { reviewLoadedLedger, type LoadedLedgerInput } from './loadedLedgerReview';
import {calculatePositionScenario,SNAPSHOT_COST_ISSUE,type PositionAnalysis} from './portfolioPositions';
import type { PortfolioTradingPerformance } from './portfolioAccounting';

export type ReviewedTradingPerformance = Omit<PortfolioTradingPerformance,'status'> & {
  status:'conditional-loaded-records'|'ledger-inputs-unverified'|'quotes-incomplete';
  accountingReconciled:false; grantsDecisionEligibility:false; historyCoverage:'unverified';
};
export type LoadedMark = {symbol:string;quantity:number;currentPrice:number|null};

function loadedQuantitiesBound(input:LoadedLedgerInput,rows:readonly {symbol:string;quantity:number}[]):boolean {
  const symbols=new Set<string>();
  return input.holdingsAvailability==='ready'&&Array.isArray(input.holdings)&&Array.isArray(rows)&&input.holdings.length<=150&&rows.length===input.holdings.length&&input.holdings.every(raw=>{
    const row=raw as {symbol?:unknown;quantity?:unknown;accountingInputs?:{contractVersion?:unknown;symbol?:unknown;quantity?:unknown}};
    const original=row?.accountingInputs;
    if(!original||Object.keys(original).sort().join(',')!=='contractVersion,quantity,symbol'||original.contractVersion!=='stored-holding-inputs-v1'
      ||typeof row.symbol!=='string'||!/^[A-Z0-9.^=-]{1,20}$/.test(row.symbol)||symbols.has(row.symbol)
      ||original.symbol!==row.symbol||original.quantity!==row.quantity||typeof row.quantity!=='number'||!Number.isFinite(row.quantity)||row.quantity<0
      ||!Number.isSafeInteger(Math.round(row.quantity*1e8))||Number(row.quantity.toFixed(8))!==row.quantity)return false;
    symbols.add(row.symbol);
    const matches=rows.filter(mark=>mark.symbol===row.symbol);
    return matches.length===1&&matches[0].quantity===row.quantity;
  });
}

export function calculateLoadedTradingPerformance(input:LoadedLedgerInput, marks:readonly LoadedMark[]):ReviewedTradingPerformance {
  const review=reviewLoadedLedger(input);
  // Marks are admitted by the quote consumer. Bind them to original holding
  // quantities here; display defaults/duplicate symbols must not add value.
  const marked=loadedQuantitiesBound(input,marks)&&marks.every(row=>row.quantity===0||typeof row.currentPrice==='number'&&Number.isFinite(row.currentPrice)&&row.currentPrice>0);
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

/** Fold exact loaded-record cost into the admitted view; never grants history/source authority. */
export function reviewLoadedPositionAccounting(input:LoadedLedgerInput,positions:readonly PositionAnalysis[]) {
  const review=reviewLoadedLedger(input);
  const bound=loadedQuantitiesBound(input,positions);
  const matched=bound&&review.status==='matched-loaded-records';
  const bySymbol=new Map(review.positions.map(row=>[row.symbol,row]));
  const rows=positions.map(position=>{
    const ledger=matched?bySymbol.get(position.symbol):undefined;
    const cost=ledger?.holdingQuantity===position.quantity&&ledger.ledgerQuantity===position.quantity?ledger.openCostBasis:null;
    const average=cost!==null?(position.quantity>0?cost/position.quantity:0):position.averageCost;
    const supported=position.quantitySupported!==false&&cost!==null&&Number.isFinite(average)&&average>=0;
    const value=bound&&position.quantitySupported!==false&&typeof position.currentValue==='number'&&Number.isFinite(position.currentValue)&&position.currentValue>=0&&position.currentValue<=1e12
      &&(position.quantity===0?position.currentValue===0:typeof position.livePrice==='number'&&Number.isFinite(position.livePrice)&&position.livePrice>0&&!position.liveStale&&position.currentValue===position.quantity*position.livePrice)?position.currentValue:null;
    const pnl=supported&&value!==null&&cost!==null?value-cost:null;
    const validPnl=pnl!==null&&Number.isFinite(pnl)&&Math.abs(pnl)<=1e12?pnl:null;
    const percent=validPnl!==null&&cost!==null&&cost>0?validPnl/cost*100:null;
    const explanation=supported?'Loaded-record cost and P&L only; full history and corporate actions remain unverified.':'Original ledger inputs are unsupported or incomplete; position cost and P&L are withheld.';
    const projected={...position,loadedCostBasis:supported?cost:null,investedValue:supported?cost:null,averageCost:supported?average:position.averageCost,currency:supported?'USD':position.currency,
      costBasisSupported:supported,currentValue:value,livePrice:value!==null?position.livePrice:null,pnl:validPnl,pnlPct:percent!==null&&Number.isFinite(percent)?percent:null,
      accountingStatus:supported?'conditional-loaded-records' as const:'ledger-inputs-unverified' as const,accountingReconciled:false as const,historyCoverage:'unverified' as const,grantsDecisionEligibility:false as const,
      state:'INSUFFICIENT DATA' as const,rationale:explanation,strategyContext:explanation,averageInAlert:false,recoveryAlert:false,potentialUpsideSignal:'INSUFFICIENT DATA' as const,
      valuationIssues:[...position.valuationIssues.filter(issue=>!supported||issue!==SNAPSHOT_COST_ISSUE),...(!bound?['The displayed projection does not match the original loaded holding quantities.']:[]),...(!supported?[explanation]:[])]};
    return {...projected,whatIfProfitAt10Pct:value!==null&&projected.livePrice!==null?calculatePositionScenario(projected,projected.livePrice*1.1).pnl:null,
      whatIfProfitAt20Pct:value!==null&&projected.livePrice!==null?calculatePositionScenario(projected,projected.livePrice*1.2).pnl:null};
  });
  return {review,positions:rows};
}
