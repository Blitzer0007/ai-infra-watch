import { calculateAccountCashFlowPerformance, type AccountCashFlowPerformance, type CashFlowRecord } from './portfolioCashFlowAccounting';
import { reviewLoadedLedger, type LoadedLedgerInput, type LedgerAvailability, type StoredLedgerInputs } from './loadedLedgerReview';
import { calculateLoadedTradingPerformance, type LoadedMark } from './reviewedPortfolioAccounting';

type Result=Omit<AccountCashFlowPerformance,'status'> & {status:AccountCashFlowPerformance['status']|'conditional-loaded-records';accountingReconciled:false;grantsDecisionEligibility:false;historyCoverage:'unverified'};
const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=1e12;
const invalid=():Result=>({status:'invalid-records',holdingsValueUsd:null,cashBalanceUsd:null,accountValueUsd:null,netContributionsUsd:null,dividendsUsd:null,feesUsd:null,rewardsUsd:null,totalPnlUsd:null,pnlOnNetContributionsPct:null,quantityMismatchSymbols:[],
  note:'Account totals are withheld until original holdings, trades and cash-flow inputs are available and consistent. Full-history and corporate-action coverage remain unverified.',accountingReconciled:false,grantsDecisionEligibility:false,historyCoverage:'unverified'});

export function calculateLoadedCashFlowPerformance(input:LoadedLedgerInput,marks:readonly LoadedMark[],flows:readonly unknown[],availability:LedgerAvailability):Result {
  const review=reviewLoadedLedger(input);
  if(review.status!=='matched-loaded-records'||availability!=='ready'||!Array.isArray(flows)||flows.length>1000)return invalid();
  const ids=new Set<string>(),canonical:CashFlowRecord[]=[];
  for(const raw of flows){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return invalid();
    const row=raw as {id?:unknown;accountingInputs?:Record<string,unknown>},v=row.accountingInputs;
    if(typeof row.id!=='string'||!/^[A-Za-z0-9_.:-]{1,80}$/.test(row.id)||ids.has(row.id)||!v||Array.isArray(v)
      ||Object.keys(v).sort().join(',')!=='amount,contractVersion,currency,eventDate,flowType,fxToUsd'||v.contractVersion!=='stored-cash-flow-inputs-v1'
      ||typeof v.eventDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v.eventDate)||!Number.isFinite(Date.parse(v.eventDate+'T00:00:00Z'))
      ||new Date(v.eventDate+'T00:00:00Z').toISOString().slice(0,10)!==v.eventDate||v.eventDate>input.assessedAt.slice(0,10)
      ||!['deposit','withdrawal','dividend','fee','reward'].includes(String(v.flowType))||!positive(v.amount)||!positive(v.fxToUsd)
      ||typeof v.currency!=='string'||!/^[A-Z]{3}$/.test(v.currency)||(v.currency==='USD'&&v.fxToUsd!==1)||!positive(v.amount*v.fxToUsd))return invalid();
    ids.add(row.id);canonical.push({flowType:v.flowType as CashFlowRecord['flowType'],amount:v.amount,fxToUsd:v.fxToUsd,currency:v.currency});
  }
  const trading=calculateLoadedTradingPerformance(input,marks);
  const trades=input.transactions.map(raw=>{const v=(raw as {accountingInputs:StoredLedgerInputs}).accountingInputs;return {symbol:v.symbol!,transactionType:v.transactionType!,quantity:v.quantity!,amount:v.amount!,brokerage:v.brokerage!,currency:v.currency!};});
  const result=calculateAccountCashFlowPerformance([...marks],trades,canonical,trading.currentValue!==null);
  if(Object.values(result).some(v=>typeof v==='number'&&(!Number.isFinite(v)||Math.abs(v)>1e12)))return invalid();
  return {...result,status:result.status==='complete'?'conditional-loaded-records':result.status,
    note:'Conditional calculation from loaded records; full-history, broker gross/fee conventions and corporate-action coverage are unverified. '+result.note,
    accountingReconciled:false,grantsDecisionEligibility:false,historyCoverage:'unverified'};
}
