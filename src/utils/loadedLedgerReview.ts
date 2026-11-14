/** Diagnostics over loaded records only. Reuses the existing weighted-average engine. */
import { calculatePortfolioTradingPerformance, type PortfolioAccountingTransaction } from './portfolioAccounting';
export type StoredLedgerInputs={contractVersion:'stored-ledger-inputs-v1';symbol:string|null;transactionType:'BUY'|'SELL'|null;quantity:number|null;amount:number|null;brokerage:number|null;currency:string|null;tradeDate:string|null;executedAt:string|null;quantityDerived:boolean|null;priceDerived:boolean|null};
export type LedgerAvailability='loading'|'ready'|'unavailable';
export type LoadedLedgerInput={holdings:readonly unknown[];transactions:readonly unknown[];holdingsAvailability:LedgerAvailability;transactionsAvailability:LedgerAvailability;assessedAt:string};
export const ledgerIssueLabels={
  RECORDS_LOADING:'Records are still loading.',RECORDS_UNAVAILABLE:'The stored records could not be loaded.',
  RECORD_LIMIT:'The loaded packet exceeds this review’s limits.',INVALID_HOLDING:'A holding has an invalid or duplicate identity or quantity.',
  NO_TRANSACTIONS:'No transaction records were loaded for these holdings.',PROVENANCE_UNAVAILABLE:'Stored accounting inputs are unavailable; legacy defaults cannot establish them.',
  INVALID_TRANSACTION:'A transaction has invalid fields or a duplicate record ID.',CURRENCY_UNKNOWN_OR_UNSUPPORTED:'An explicit USD transaction currency is required.',
  FEE_UNKNOWN:'A transaction fee is unknown or invalid; it cannot be assumed zero.',DERIVED_OR_REVIEW_RECORD:'A record is derived, unassessed or marked for review.',
  TRADE_DATE_INVALID:'A transaction date is invalid or after the review date.',ORDER_AMBIGUOUS:'Same-day buys and sales lack distinct, dated execution times.',
  INVALID_SEQUENCE:'A sale exceeds the inventory established by earlier records.',QUANTITY_MISMATCH:'Recorded trades do not match the loaded holding quantity.',
  NUMERIC_LIMIT:'The numeric scale cannot be reconciled safely.',CALCULATION_MISMATCH:'The existing calculator did not satisfy the ledger conservation checks.',
} as const;
export type LedgerIssueCode=keyof typeof ledgerIssueLabels;
type Issue={code:LedgerIssueCode;symbol:string|null;recordId:string|null};
type Position={symbol:string;holdingQuantity:number;ledgerQuantity:number;currency:'USD';openCostBasis:number;recordedTradeResult:number};
export type LoadedLedgerReview={contractVersion:'loaded-ledger-review-v1';status:'matched-loaded-records'|'needs-data'|'unavailable'|'empty';assessedAt:string;
  holdingCount:number;transactionCount:number;reviewedTransactionCount:number;issues:Issue[];positions:Position[];
  totals:{openCostBasis:number;recordedTradeResult:number;grossPurchaseCost:number;netSaleProceeds:number}|null;
  historyCoverage:'unverified';corporateActionCoverage:'unverified';accountingReconciled:false;grantsDecisionEligibility:false;verifiesSourceRecords:false};
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const symbol=(v:unknown):v is string=>typeof v==='string'&&/^[A-Z0-9.^=-]{1,20}$/.test(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e12;
function day(v:unknown):v is string{return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;}
function time(v:unknown):number|null{
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)||!day(v.slice(0,10))||+v.slice(11,13)>23||+v.slice(14,16)>59||+v.slice(17,19)>59)return null;
  const n=Date.parse(v);return Number.isFinite(n)?n:null;
}
function units(v:unknown):bigint|null{
  if(!finite(v)||v<0||!Number.isSafeInteger(Math.round(v*1e8))||Number(v.toFixed(8))!==v)return null;
  return BigInt(v.toFixed(8).replace('.',''));
}
const fields=['contractVersion','symbol','transactionType','quantity','amount','brokerage','currency','tradeDate','executedAt','quantityDerived','priceDerived'];
export function reviewLoadedLedger(input:LoadedLedgerInput):LoadedLedgerReview {
  const result:LoadedLedgerReview={contractVersion:'loaded-ledger-review-v1',status:'needs-data',assessedAt:input.assessedAt,holdingCount:Array.isArray(input.holdings)?input.holdings.length:0,transactionCount:Array.isArray(input.transactions)?input.transactions.length:0,reviewedTransactionCount:0,issues:[],positions:[],totals:null,historyCoverage:'unverified',corporateActionCoverage:'unverified',accountingReconciled:false,grantsDecisionEligibility:false,verifiesSourceRecords:false};
  const issue=(code:LedgerIssueCode,s:string|null=null,id:string|null=null)=>{if(result.issues.length<100&&!result.issues.some(i=>i.code===code&&i.symbol===s&&i.recordId===id))result.issues.push({code,symbol:s,recordId:id});};
  const assessed=time(input.assessedAt);if(assessed===null){issue('TRADE_DATE_INVALID');return result;}
  if(input.holdingsAvailability!=='ready'||input.transactionsAvailability!=='ready'){result.status='unavailable';issue(input.holdingsAvailability==='loading'||input.transactionsAvailability==='loading'?'RECORDS_LOADING':'RECORDS_UNAVAILABLE');return result;}
  if(!Array.isArray(input.holdings)||!Array.isArray(input.transactions)||input.holdings.length>150||input.transactions.length>1000){issue('RECORD_LIMIT');return result;}
  const held=new Map<string,bigint>();
  for(const row of input.holdings){
    if(!object(row)||!symbol(row.symbol)||held.has(row.symbol)){issue('INVALID_HOLDING');continue;}
    const fields=row.accountingInputs;
    if(!object(fields)||fields.contractVersion!=='stored-holding-inputs-v1'||Object.keys(fields).sort().join(',')!=='contractVersion,quantity,symbol'){issue('PROVENANCE_UNAVAILABLE',row.symbol);continue;}
    if(fields.symbol!==row.symbol||fields.quantity!==row.quantity||units(fields.quantity)===null){issue('INVALID_HOLDING');continue;}
    held.set(row.symbol,units(fields.quantity)!);
  }
  if(result.issues.length)return result;
  if(!input.transactions.length){if(input.holdings.length)issue('NO_TRANSACTIONS');else result.status='empty';return result;}
  const ids=new Set<string>();
  const trades:{id:string;data:StoredLedgerInputs;execution:number|null;quantity:bigint}[]=[];
  for(const raw of input.transactions){
    result.reviewedTransactionCount++;
    if(!object(raw)||typeof raw.id!=='string'||!/^[A-Za-z0-9_.:-]{1,80}$/.test(raw.id)||ids.has(raw.id)){issue('INVALID_TRANSACTION');continue;}
    ids.add(raw.id);const id=raw.id;const data=raw.accountingInputs;
    if(!object(data)||data.contractVersion!=='stored-ledger-inputs-v1'||Object.keys(data).length!==fields.length||Object.keys(data).some(k=>!fields.includes(k))){issue('PROVENANCE_UNAVAILABLE',null,id);continue;}
    const s=symbol(data.symbol)?data.symbol:null;
    if(!s||raw.symbol!==s||!['BUY','SELL'].includes(String(data.transactionType))||units(data.quantity)===null||data.quantity===0||!finite(data.amount)||data.amount<=0){issue('INVALID_TRANSACTION',s,id);continue;}
    if(data.currency!=='USD')issue('CURRENCY_UNKNOWN_OR_UNSUPPORTED',s,id);
    if(!finite(data.brokerage)||data.brokerage<0)issue('FEE_UNKNOWN',s,id);
    if(data.quantityDerived!==false||data.priceDerived!==false||raw.dataQuality!=='ok')issue('DERIVED_OR_REVIEW_RECORD',s,id);
    if(!day(data.tradeDate)||data.tradeDate>input.assessedAt.slice(0,10))issue('TRADE_DATE_INVALID',s,id);
    const execution=time(data.executedAt);
    if(data.executedAt!==null&&(execution===null||execution>assessed||typeof data.tradeDate!=='string'||(data.executedAt as string).slice(0,10)!==data.tradeDate))issue('TRADE_DATE_INVALID',s,id);
    trades.push({id,data:data as StoredLedgerInputs,execution,quantity:units(data.quantity)!});
  }
  if(result.issues.length)return result;
  const universe=new Set([...held.keys(),...trades.map(t=>t.data.symbol!)]);if(universe.size>150){issue('RECORD_LIMIT');return result;}
  const groups=new Map<string,typeof trades>();
  for(const trade of trades){const key=trade.data.symbol+':'+trade.data.tradeDate;groups.set(key,[...(groups.get(key)||[]),trade]);}
  for(const group of groups.values())if(new Set(group.map(t=>t.data.transactionType)).size>1&&(group.some(t=>t.execution===null)||new Set(group.map(t=>t.execution)).size!==group.length))issue('ORDER_AMBIGUOUS',group[0].data.symbol);
  if(result.issues.length)return result;
  trades.sort((a,b)=>a.data.tradeDate!.localeCompare(b.data.tradeDate!)||a.data.symbol!.localeCompare(b.data.symbol!)||(a.execution??0)-(b.execution??0)||a.id.localeCompare(b.id));
  const balances=new Map<string,bigint>();
  for(const trade of trades){const s=trade.data.symbol!;const balance=(balances.get(s)||0n)+(trade.data.transactionType==='BUY'?trade.quantity:-trade.quantity);if(balance<0n)issue('INVALID_SEQUENCE',s,trade.id);if(balance>BigInt(Number.MAX_SAFE_INTEGER))issue('NUMERIC_LIMIT',s);balances.set(s,balance);}
  for(const s of universe)if((held.get(s)||0n)!==(balances.get(s)||0n))issue('QUANTITY_MISMATCH',s);
  if(result.issues.length)return result;
  const canonical:PortfolioAccountingTransaction[]=trades.map((t,index)=>({symbol:t.data.symbol!,transactionType:t.data.transactionType!,quantity:t.data.quantity!,amount:t.data.amount!,brokerage:t.data.brokerage!,currency:'USD',tradeDate:t.data.tradeDate!,sourceRow:index}));
  const holdings=[...held].map(([s,q])=>({symbol:s,quantity:Number(q)/1e8,averageCost:0,currentPrice:null}));
  const calculate=(s?:string)=>calculatePortfolioTradingPerformance(s?holdings.filter(h=>h.symbol===s):holdings,s?canonical.filter(t=>t.symbol===s):canonical,false);
  const valid=(r:ReturnType<typeof calculate>)=>r.status==='quotes-incomplete'&&[r.openCostBasis,r.realizedPnl,r.grossPurchaseCost,r.netSaleProceeds].every(finite)&&Math.abs(r.openCostBasis!-r.realizedPnl!-(r.grossPurchaseCost!-r.netSaleProceeds!))<=Math.max(1e-8,Number.EPSILON*32*Math.max(Math.abs(r.grossPurchaseCost!),Math.abs(r.netSaleProceeds!),1));
  const total=calculate();if(!valid(total)){issue('CALCULATION_MISMATCH');return result;}
  for(const s of [...universe].sort()){const r=calculate(s);if(!valid(r)){issue('CALCULATION_MISMATCH',s);continue;}result.positions.push({symbol:s,holdingQuantity:Number(held.get(s)||0n)/1e8,ledgerQuantity:Number(balances.get(s)||0n)/1e8,currency:'USD',openCostBasis:r.openCostBasis!,recordedTradeResult:r.realizedPnl!});}
  if(result.issues.length){result.positions=[];return result;}
  result.status='matched-loaded-records';result.totals={openCostBasis:total.openCostBasis!,recordedTradeResult:total.realizedPnl!,grossPurchaseCost:total.grossPurchaseCost!,netSaleProceeds:total.netSaleProceeds!};return result;
}
