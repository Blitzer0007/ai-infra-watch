import { useState } from 'react';
import { ledgerIssueLabels, reviewLoadedLedger, type LedgerAvailability, type LoadedLedgerReview as Review } from '../../utils/loadedLedgerReview';
import { formatReviewDate } from '../../utils/portfolioReview';
type Props={holdings:readonly unknown[];transactions:readonly unknown[];holdingsAvailability:LedgerAvailability;transactionsAvailability:LedgerAvailability};
const money=(value:number)=>value!==0&&Math.abs(value)<1e-8?value.toExponential(4)+' USD':value.toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:8});
export default function LoadedLedgerReview(props:Props){
  const [review,setReview]=useState<{inputs:Props;result:Review}|null>(null);
  const unchanged=review&&review.inputs.holdings===props.holdings&&review.inputs.transactions===props.transactions&&review.inputs.holdingsAvailability===props.holdingsAvailability&&review.inputs.transactionsAvailability===props.transactionsAvailability;
  const result=unchanged?review.result:null;
  return <details className="rounded-xl border border-cyan-200/25 p-4" data-testid="loaded-ledger-review">
    <summary className="cursor-pointer font-semibold">Check loaded ledger records</summary>
    <section aria-label="Loaded ledger record review" className="mt-4 space-y-4 text-sm">
      <p>Compare the loaded holdings with stored trade inputs. This local check reads no new data and changes no records or decisions.</p>
      <p>{props.holdings.length} loaded holdings · {props.transactions.length} loaded transactions. Scope includes closed positions recorded in these trades.</p>
      {props.transactionsAvailability==='unavailable'&&<p role="alert">Transaction records are unavailable. This is not an empty trade history.</p>}
      {props.holdingsAvailability==='unavailable'&&<p role="alert">Holdings are unavailable. Quantity reconciliation cannot be established.</p>}
      {review&&!unchanged&&<p role="status">Loaded records changed. Review again to check the current packet; earlier figures are withheld.</p>}
      <button type="button" disabled={props.holdingsAvailability==='loading'||props.transactionsAvailability==='loading'||!!result} onClick={()=>setReview({inputs:props,result:reviewLoadedLedger({...props,assessedAt:new Date().toISOString()})})} className="rounded-lg border border-cyan-200/40 px-4 py-3 font-semibold disabled:opacity-50">{result?'Loaded records reviewed':'Review loaded records'}</button>
      {result&&<div role="status" className="space-y-3 rounded-lg border border-white/20 p-4" data-testid="loaded-ledger-result">
        <h3 className="font-semibold">{result.status==='matched-loaded-records'?'Loaded trade quantities match':result.status==='empty'?'No holdings or trades loaded':result.status==='unavailable'?'Records unavailable':'Ledger inputs need review'}</h3>
        <p>Assessed {formatReviewDate(result.assessedAt)} · {result.reviewedTransactionCount}/{result.transactionCount} transaction records inspected.</p>
        {result.issues.length>0&&<ul className="list-disc space-y-2 pl-5">{result.issues.map((issue,index)=><li key={issue.code+index} className="break-words">{ledgerIssueLabels[issue.code]}{issue.symbol?' · '+issue.symbol:''}{issue.recordId?' · record '+issue.recordId:''}</li>)}</ul>}
        {result.issues.length>=100&&<p>Showing at most 100 findings. No unmatched or invalid packet can produce monetary totals.</p>}
        {result.totals&&<>
          <p>Conditional weighted-average calculations from these loaded USD records:</p>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2"><dt>Remaining recorded cost</dt><dd>{money(result.totals.openCostBasis)}</dd><dt>Recorded trade result</dt><dd>{money(result.totals.recordedTradeResult)}</dd><dt>Purchases including known fees</dt><dd>{money(result.totals.grossPurchaseCost)}</dd><dt>Sales after known fees</dt><dd>{money(result.totals.netSaleProceeds)}</dd></dl>
          <details className="rounded border border-white/20 p-3"><summary className="cursor-pointer font-semibold">Per-symbol record matches</summary><ul className="mt-3 space-y-2">{result.positions.map(position=><li key={position.symbol} className="break-words">{position.symbol}: {position.holdingQuantity.toLocaleString(undefined,{maximumFractionDigits:8})} held / {position.ledgerQuantity.toLocaleString(undefined,{maximumFractionDigits:8})} recorded shares · remaining cost {money(position.openCostBasis)} · recorded trade result {money(position.recordedTradeResult)}</li>)}</ul></details>
        </>}
        <p>Full-history and corporate-action coverage are unverified. Matching loaded records does not certify broker accounting, source truth or decision eligibility. This check does not restore agent P&amp;L totals.</p>
      </div>}
    </section>
  </details>;
}
