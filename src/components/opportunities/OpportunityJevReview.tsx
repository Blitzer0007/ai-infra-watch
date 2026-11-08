import { useEffect, useRef, useState } from 'react';
import { authFetch } from '../../utils/apiAuth';
import { normalizeOpportunityJevReview, opportunityJevState, type OpportunityJevReview as Review } from '../../utils/opportunityJevReview';
import type { ResearchCandidate } from '../../utils/opportunityResearch';
import { FilterSelect } from '../FilterControls';

const nextLabels={gather_evidence:'Gather dated, independent evidence',resolve_conflicts:'Resolve source conflicts',inspect_sources:'Inspect the supplied source references',monitor:'Monitor the supplied research context'};
const contextLabels={insufficient:'Insufficient evidence',conflicting:'Conflicting evidence',bounded_review:'Bounded evidence review only'};
export default function OpportunityJevReview({candidates}:{candidates:readonly ResearchCandidate[]}) {
  const choices=candidates.filter(candidate=>candidate.status!=='excluded');
  const [symbol,setSymbol]=useState('');
  const candidate=choices.find(item=>item.symbol===symbol)||choices[0];
  const state=candidate?opportunityJevState(candidate):null;
  const key=state?JSON.stringify(state):'';
  const [results,setResults]=useState<Record<string,Review>>({});
  const [errors,setErrors]=useState<Record<string,string>>({});
  const [attempts,setAttempts]=useState(0);const count=useRef(0);
  const [busy,setBusy]=useState(false);const active=useRef(false);const request=useRef<AbortController|null>(null);const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current?.abort();};},[]);
  const run=async()=>{
    if (!state||active.current||count.current>=5||results[key])return;
    active.current=true;setBusy(true);count.current++;setAttempts(count.current);
    const controller=new AbortController();request.current=controller;
    const timer=window.setTimeout(()=>controller.abort(),15000);
    setErrors(previous=>({...previous,[key]:''}));
    try {
      const response=await authFetch('/api/jev-assess',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'opportunities',state}),signal:controller.signal,cache:'no-store'});
      if(!response.ok)throw new Error();
      const result=normalizeOpportunityJevReview(await response.json(),state);
      if(mounted.current&&!controller.signal.aborted)setResults(previous=>({...previous,[key]:result}));
    } catch {
      if(mounted.current&&request.current===controller)setErrors(previous=>({...previous,[key]:'JEV review is unavailable or was interrupted. Credits may have been used. No automatic retry occurred; research eligibility is unchanged.'}));
    } finally {window.clearTimeout(timer);active.current=false;if(mounted.current)setBusy(false);}
  };
  const result=results[key];
  return <details className="rounded-xl border border-fuchsia-200/25 p-4" data-testid="opportunity-jev-review">
    <summary className="cursor-pointer font-semibold">Review evidence coverage with JEV · optional credit use</summary>
    <section aria-label="JEV opportunity coverage review" className="mt-4 space-y-4 text-sm">
      <p>JEV reviews a compact coverage summary for one selected symbol. It does not retrieve financial data, inspect source documents, predict returns, change research eligibility, or send alerts.</p>
      {!candidate?<p>No supported company candidates are available for this review.</p>:<>
        <FilterSelect label="JEV research symbol" value={candidate.symbol} onChange={event=>setSymbol(event.target.value)}>{choices.map(item=><option key={item.symbol} value={item.symbol}>{item.symbol}</option>)}</FilterSelect>
        <p>The request contains the symbol, rule version, source observation time, eligibility and coverage counts. Holdings, quantities, costs, notes and saved theses are omitted.</p>
        <button type="button" disabled={busy||attempts>=5||!!result} onClick={()=>void run()} className="rounded-lg border border-fuchsia-200/40 px-4 py-3 font-semibold disabled:opacity-50">{busy?'JEV reviewing…':result?'JEV review loaded':errors[key]?'Retry JEV review · may use credits':'Run JEV coverage review · uses credits'}</button>
        <p>{attempts}/5 request attempts used in this view. Successful results are reused for identical summaries. Navigation or reload resets this limit; it is not an account-wide credit budget. One request asks two typed questions; charges follow your provider plan and reported usage. No automatic retries or refresh calls.</p>
        {attempts>=5&&!result&&<p role="status">This view’s request limit is reached.</p>}
        {errors[key]&&<p role="alert" className="text-amber-100">{errors[key]}</p>}
        {result&&<div role="status" className="space-y-2 rounded-lg border border-white/20 p-4" data-testid="opportunity-jev-result"><h2 className="text-lg font-semibold">JEV coverage review for {candidate.symbol}</h2><p>{contextLabels[result.context]}.</p><p>Suggested next check: {nextLabels[result.nextCheck]}.</p><p>These are advisory typed outputs, not verified source findings. Existing deterministic data and accounting gates remain authoritative.</p><p>Input tokens: {result.inputTokens??'unavailable'} · Latency: {result.latencyMs===null?'unavailable':Math.round(result.latencyMs)+' ms'} · Model: {result.model??'unavailable'}.</p><p>Exact credits and remaining balance are unavailable here; check the TypeSafe dashboard.</p></div>}
      </>}
    </section>
  </details>;
}
