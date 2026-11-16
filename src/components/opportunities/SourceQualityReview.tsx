import { useEffect, useRef, useState } from 'react';
import { authFetch } from '../../utils/apiAuth';
import { formatReviewDate } from '../../utils/portfolioReview';
import { normalizeSourceQualityResult, sourceQualityFindingLabels, sourceQualityRequest, type SourceQualityResult, type SourceQualitySnapshot } from '../../utils/sourceQualityReview';
import { FilterSelect } from '../FilterControls';

const unavailable='Source-quality review is unavailable or was interrupted. No automatic retry occurred. Existing research and holding decisions are unchanged.';
const statusLabels={'complete':'Configured metadata checks passed','partial':'Partial metadata review','needs-data':'Needs source data'};
export default function SourceQualityReview({snapshot}:{snapshot:SourceQualitySnapshot}) {
  const [selected,setSelected]=useState('');
  const entry=snapshot.entries.find(row=>row.symbol===selected)||snapshot.entries[0];
  const key=entry?`${snapshot.id}:${entry.symbol}`:'';
  const currentKey=useRef(key);currentKey.current=key;
  const [results,setResults]=useState<Record<string,SourceQualityResult>>({});
  const [errors,setErrors]=useState<Record<string,string>>({});
  const [attempts,setAttempts]=useState(0);const count=useRef(0);
  const [busy,setBusy]=useState(false);
  const active=useRef<{controller:AbortController;key:string}|null>(null);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;active.current?.controller.abort();active.current=null;};},[]);
  useEffect(()=>{if(active.current&&active.current.key!==key){active.current.controller.abort();active.current=null;setBusy(false);}},[key]);
  const run=async()=>{
    if(!entry||entry.issue||active.current||count.current>=5||results[key])return;
    const attempt=++count.current;setAttempts(attempt);
    const slot={controller:new AbortController(),key};active.current=slot;setBusy(true);
    const timer=window.setTimeout(()=>slot.controller.abort(),10000);
    setErrors(previous=>({...previous,[key]:''}));
    try{
      const request=sourceQualityRequest(snapshot,entry.symbol,Date.now(),attempt);
      const response=await authFetch('/api/agent-ask?task=source-quality',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),cache:'no-store',redirect:'error',signal:slot.controller.signal});
      if(!response.ok)throw new Error();
      const raw=await response.text();if(new TextEncoder().encode(raw).byteLength>262144)throw new Error();
      const result=normalizeSourceQualityResult(JSON.parse(raw),request);
      if(mounted.current&&active.current===slot&&currentKey.current===key&&!slot.controller.signal.aborted)setResults(previous=>({...previous,[key]:result}));
    }catch{
      if(mounted.current&&active.current===slot&&currentKey.current===key)setErrors(previous=>({...previous,[key]:unavailable}));
    }finally{
      window.clearTimeout(timer);
      if(active.current===slot){active.current=null;if(mounted.current)setBusy(false);}
    }
  };
  const result=results[key];
  return <details className="rounded-xl border border-cyan-200/25 p-4" data-testid="source-quality-review">
    <summary className="cursor-pointer font-semibold">Inspect loaded quote metadata · development review</summary>
    <section aria-label="Source-quality metadata review" className="mt-4 space-y-4 text-sm">
      <p>Inspect a frozen copy of loaded quote metadata. This review uses no AI credits, fetches no source data and changes no research or holding decision.</p>
      {!entry?<p>No symbols are available in this snapshot.</p>:<>
        <FilterSelect label="Source-quality symbol" value={entry.symbol} onChange={event=>setSelected(event.target.value)}>{snapshot.entries.map(row=><option key={row.symbol} value={row.symbol}>{row.symbol}</option>)}</FilterSelect>
        <p>Captured {formatReviewDate(snapshot.capturedAt)}. Assessment time is recorded when you run the review; missing observation time stays missing.</p>
        {entry.issue&&<p role="alert" className="text-amber-100">{entry.issue}</p>}
        <button type="button" onClick={()=>void run()} disabled={busy||attempts>=5||!!result||!!entry.issue} className="rounded-lg border border-cyan-200/40 px-4 py-3 font-semibold disabled:opacity-50">{busy?'Inspecting metadata…':result?'Source review loaded':errors[key]?'Retry source review':'Run source-quality review'}</button>
        <p>{attempts}/5 manual attempts used in this visit. Successful results stay bound to this frozen input. Capture a new snapshot to reassess; nothing retries or refreshes automatically.</p>
        {attempts>=5&&!result&&<p role="status">This visit’s review limit is reached.</p>}
        {errors[key]&&<p role="alert" className="text-amber-100">{errors[key]}</p>}
        {result&&<div role="status" className="space-y-3 rounded-lg border border-white/20 p-4" data-testid="source-quality-result">
          <h2 className="text-lg font-semibold">Source-quality review for {entry.symbol}</h2>
          <p className="font-semibold">{result.inspections.some(item=>item.status==='review')?'Source discrepancy needs review':statusLabels[result.status]}</p>
          <p>Assessed {formatReviewDate(result.assessed_at)}. {result.inspected_symbols.length}/{result.expected_symbols.length} selected symbols inspected; {result.inspected_observation_count}/{result.provided_observation_count} supplied observations inspected; {result.metadata_covered_observation_count} passed per-record metadata checks.</p>
          <p>{result.inspection_complete?'Inspection completed.':'Inspection stopped at its '+(result.termination_reason==='call-budget'?'call limit':'time limit')+'.'} {result.pending_comparison_symbols.length>0?'Comparison still pending.':''} {result.uninspected_symbols.length>0?'Some selected symbols remain uninspected.':''}</p>
          {result.inspections.map(item=><div key={item.symbol} className="space-y-2">
            <h3 className="font-semibold">Findings for {item.symbol}</h3>
            {item.findings.filter(f=>f.code!=='NO_DISTINCT_PROVIDER_COMPARISON').length===0?<p>No configured per-record metadata gaps were found.</p>:<ul className="list-disc space-y-2 pl-5">{item.findings.filter(f=>f.code!=='NO_DISTINCT_PROVIDER_COMPARISON').map((finding,index)=><li key={finding.code+index}>{sourceQualityFindingLabels[finding.code]} <span className="text-white/60">{finding.severity==='blocker'?'Needs data':'Attention'}{finding.evidence_ids.length?' · '+finding.evidence_ids.join(', '):''}</span></li>)}</ul>}
            <p>{item.comparison_status==='not-assessed'?'No distinct-provider price comparison was performed.':item.comparison_status==='no-comparable-pairs'?'The supplied observations were not compatible for a price comparison.':`${item.comparisons.length} comparable price pair${item.comparisons.length===1?'':'s'} inspected.`}</p>
            {item.comparisons.map(pair=><p key={pair.evidence_ids.join('|')}>Price discrepancy: {pair.discrepancy_pct.toLocaleString(undefined,{maximumFractionDigits:4})}% · {pair.exceeds_threshold?'exceeds':'within'} the diagnostic threshold.</p>)}
          </div>)}
          <p>Metadata coverage and matching prices do not verify provider identity, independent sources or financial facts. No decision eligibility was granted.</p>
          <details className="rounded border border-white/20 p-3"><summary className="cursor-pointer font-semibold">Policy and review usage</summary><p className="mt-3">Diagnostic policy: {result.policy.max_quote_age_seconds/60} minutes maximum age, {result.policy.max_time_difference_seconds} seconds alignment and {result.policy.discrepancy_pct}% discrepancy. This is not an exchange calendar or a holding-decision rule.</p><p className="mt-2">Local tool calls: {result.tool_calls}. Provider requests: {result.provider_requests}. Model calls: {result.model_calls}. JEV calls: {result.jev_calls}.</p></details>
        </div>}
        <details className="rounded border border-white/20 p-3"><summary className="cursor-pointer font-semibold">Frozen quote inputs for {entry.symbol}</summary><div className="mt-3 space-y-3"><p>Only these quote fields, a generated review ID and the assessment time are sent. Quantities, costs, notes and theses are omitted.</p>
          {!entry.observations.length?<p>No usable observation packet was loaded.</p>:entry.observations.map(row=><dl key={row.evidence_id} className="grid min-w-0 grid-cols-1 gap-1 break-words rounded border border-white/10 p-3 sm:grid-cols-2"><dt>Evidence</dt><dd>{row.evidence_id}</dd><dt>Declared provider / mode</dt><dd>{row.provider} / {row.source_mode}</dd><dt>Provider-returned symbol</dt><dd>{row.returned_symbol??'Unavailable'}</dd><dt>Price / daily move</dt><dd>{row.price??'Unavailable'} / {row.change_pct===null?'Unavailable':row.change_pct+'%'}</dd><dt>Currency / basis</dt><dd>{row.currency??'Unknown'} / {row.adjusted_basis}</dd><dt>Observation time</dt><dd>{row.market_time??(row.market_date?row.market_date+' (date only)':'Unavailable')}</dd><dt>Retrieval time</dt><dd>{row.retrieved_at??'Unavailable'}</dd><dt>Session flag</dt><dd>{row.is_market_session_open===null?'Unknown':row.is_market_session_open?'Open':'Closed'}</dd></dl>)}
        </div></details>
      </>}
    </section>
  </details>;
}
