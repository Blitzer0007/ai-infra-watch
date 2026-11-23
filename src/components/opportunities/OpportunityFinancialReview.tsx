import {useMemo,useState} from 'react';
import type {ResearchCandidate} from '../../utils/opportunityResearch';
import {useManualSecDossier} from '../../utils/useManualSecDossier';
import {opportunityFinancialReview} from '../../utils/opportunityFinancialReview';
import {formatStatementValue} from '../../utils/dossierStatements';

export default function OpportunityFinancialReview({candidates,snapshotId}:{candidates:ResearchCandidate[];snapshotId:string;key?:string}){
  const [selected,setSelected]=useState(candidates[0]?.symbol??'');
  const symbol=candidates.some(c=>c.symbol===selected)?selected:candidates[0]?.symbol??'';
  if(!symbol)return null;
  return <details className="min-w-0 rounded-xl border border-white/20 p-4" data-testid="opportunity-financial-review">
    <summary className="min-h-11 cursor-pointer py-2 font-semibold">Company financial inputs · optional SEC read</summary>
    <div className="mt-3 space-y-3 text-sm">
      <p>Inspect annual declarations for one company in this scan. Opening this panel does not fetch financial data. The explicit load reads public SEC documents using your private dashboard session.</p>
      <label className="block">Financial review company<select aria-label="Financial review company" value={symbol} onChange={e=>setSelected(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/25 bg-[#15181e] px-3 py-2">{candidates.map(c=><option key={c.symbol} value={c.symbol}>{c.symbol} · {c.companyName}</option>)}</select></label>
      <CompanyInputs key={snapshotId+':'+symbol} symbol={symbol}/>
    </div>
  </details>;
}

function CompanyInputs({symbol}:{symbol:string;key?:string}){
  const {loaded,loading,error,attempts,loadFinancials}=useManualSecDossier(symbol);
  const [period,setPeriod]=useState('');
  const review=useMemo<ReturnType<typeof opportunityFinancialReview>>(()=>opportunityFinancialReview(symbol,loaded),[symbol,loaded]);
  const selected=review.periods.find(p=>p.key===period);
  return <div className="min-w-0 space-y-3" data-testid="opportunity-company-inputs">
    <button type="button" disabled={loading||!!loaded||attempts>=3} onClick={()=>void loadFinancials()} className="min-h-11 rounded-lg border border-cyan-200/40 px-3 py-2 font-semibold disabled:opacity-60">{loading?'Loading SEC inputs…':loaded?'SEC source packet loaded':'Load SEC financial inputs'}</button>
    <p className="text-xs">{attempts}/3 attempts for this company view. Server-process cache may retain the original retrieval time for one hour. No automatic retry or polling.</p>
    {error&&<p role="alert" className="text-amber-200">{error}</p>}
    {loaded&&<>
      <p role="status">{symbol} · declared CIK {loaded.cik} · retrieved {loaded.retrievedAt}. Source authenticity and security classification remain unverified.</p>
      {review.status==='invalid'?<p role="alert">Financial declarations failed scope or compatibility checks and were withheld.</p>:<>
        {review.periods.length?<label className="block">Annual financial period<select aria-label="Annual financial period" value={selected?.key??''} onChange={e=>setPeriod(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/25 bg-[#15181e] px-3 py-2"><option value="">Choose a period</option>{review.periods.map(p=><option key={p.key} value={p.key}>{p.start} to {p.end}</option>)}</select></label>:<p>No supported annual periods were returned. This does not establish an empty filing history.</p>}
        {selected&&<>
          {!!selected.rows.length&&<div className="max-w-full overflow-x-auto"><table className="w-full text-left" data-testid="opportunity-financial-table"><caption className="py-2 text-left">Original annual declarations · {selected.start} to {selected.end}</caption><thead><tr><th className="p-2">Metric</th><th className="p-2">Declared value</th><th className="p-2">Filing</th></tr></thead><tbody>{selected.rows.map(row=><tr key={row.id} className="border-t border-white/15"><th scope="row" className="p-2 font-normal">{row.label}</th><td className="whitespace-nowrap p-2">{formatStatementValue(row.value,row.unit)}</td><td className="p-2"><a className="inline-block min-h-11 py-2 underline" href={row.sourceReference.filingIndexUrl} target="_blank" rel="noopener noreferrer">{row.filing.form} · filed {row.filing.filedOn} ↗</a></td></tr>)}</tbody></table></div>}
          {!!selected.missing.length&&<p role="status">Missing supported declaration groups: {selected.missing.join('; ')}. Missing values are not zero.</p>}
        </>}
      </>}
      <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">Source scope and remaining checks</summary><div className="space-y-2"><a className="inline-block min-h-11 py-2 underline" href={loaded.urls.companyfacts} target="_blank" rel="noopener noreferrer">Open SEC companyfacts ↗</a><p>Filing links are constructed from supplied accession metadata; original filings are not retained or authenticated here. Filing days are not exact publication times. Different revenue definitions remain separate and are not added or interchanged.</p><p>Statement context does not support aggregation or investment conclusions. Revenue growth, free-cash-flow totals, forecasts, valuation multiples and account returns remain withheld.</p></div></details>
    </>}
    <p className="rounded-lg border border-amber-200/25 p-3">This financial review does not change the frozen scan, research eligibility or JEV summary. Rerunning the scan clears this review. Verified asset/listing evidence, compatible financial observations and usable market data are still required.</p>
  </div>;
}
