import {useEffect,useRef,useState} from 'react';
import {authFetch} from '../../utils/apiAuth';
import {admitSecDossierPayload,secDossierFailureLabels,SEC_DOSSIER_RESPONSE_LIMIT,SecDossierLoadError,type SecDossierConnection} from '../../utils/secDossierConnection';
/** Opening loads view code only. SEC acquisition requires an explicit click. */
export default function HoldingCompanyDossier({symbol,configuredName}:{symbol:string;configuredName?:string;key?:string}){
  const [open,setOpen]=useState(false);
  const [View,setView]=useState<typeof import('./CompanyDossier').default|null>(null);
  const [failed,setFailed]=useState(false);
  const [loaded,setLoaded]=useState<SecDossierConnection|null>(null);
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[attempts,setAttempts]=useState(0);
  const active=useRef<AbortController|null>(null);
  useEffect(()=>{setLoaded(null);setError('');setAttempts(0);setLoading(false);return()=>{active.current?.abort();active.current=null;};},[symbol]);
  async function loadFinancials(){
    if(active.current||attempts>=3)return;
    const controller=new AbortController();active.current=controller;setLoading(true);setError('');setAttempts(value=>value+1);
    try{
      const response=await authFetch('/api/company-scale?action=dossier&symbol='+encodeURIComponent(symbol),{signal:controller.signal,cache:'no-store'});
      if(response.status===401||response.status===403)throw new SecDossierLoadError('Private access expired or is unavailable. Sign in again before loading SEC inputs.');
      const text=await response.text();if(text.length>SEC_DOSSIER_RESPONSE_LIMIT)throw new SecDossierLoadError('The response exceeded supported limits. Financial inputs were withheld.');
      let value;try{value=JSON.parse(text);}catch{throw new SecDossierLoadError('The financial response had an unsupported format.');}
      if(!response.ok)throw new SecDossierLoadError(secDossierFailureLabels[value?.code]??'SEC financial acquisition is unavailable. No automatic retry will run.');
      const admitted=admitSecDossierPayload(symbol,value);if(!admitted)throw new SecDossierLoadError('The SEC source packet failed issuer or input checks. Financial inputs were withheld.');
      if(active.current===controller)setLoaded(admitted);
    }catch(failure){if(!controller.signal.aborted&&active.current===controller)setError(failure instanceof SecDossierLoadError?failure.message:'Financial acquisition was interrupted or unavailable. No automatic retry will run.');}
    finally{if(active.current===controller){active.current=null;setLoading(false);}}
  }
  const node=useRef<HTMLDetailsElement>(null),pending=useRef(false);
  async function loadView(){
    if(pending.current||View)return;
    pending.current=true;
    try{const loaded=await import('./CompanyDossier');if(node.current)setView(()=>loaded.default);}
    catch{if(node.current)setFailed(true);}
    finally{pending.current=false;}
  }
  return <details ref={node} className="rounded-xl border border-white/20 p-4" data-testid="holding-company-dossier" onToggle={event=>{setOpen(event.currentTarget.open);if(event.currentTarget.open&&!failed)void loadView();}}>
    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Company dossier</summary>
    {open&&<div className="mt-3 space-y-3">
      <p className="text-sm">Load SEC financial declarations for this ticker only. This reads the SEC directory, issuer submissions and companyfacts; no model, account records or alerts are involved. Figures retain their own filing periods and may be incomplete.</p>
      <button type="button" disabled={loading||attempts>=3||loaded?.symbol===symbol} onClick={()=>void loadFinancials()} className="min-h-11 rounded-lg border border-cyan-200/40 px-3 py-2 text-sm font-semibold disabled:opacity-60">{loading?'Loading SEC declarations…':loaded?.symbol===symbol?'SEC source packet loaded':'Load SEC financial declarations'}</button>
      <p className="text-xs">{attempts}/3 attempts in this view. Successful packets may reuse a one-hour server-process cache with the original retrieval time. No background polling or automatic retry.</p>
      {error&&<p role="alert" className="text-sm text-amber-200">{error}</p>}
      {loaded?.symbol===symbol&&<div role="status" data-testid="sec-dossier-connection" className="space-y-2 rounded-lg border border-white/20 p-3 text-sm">
        <p>SEC directory and submissions declare {symbol} → CIK {loaded.cik}{loaded.name?' · '+loaded.name:''}.</p>
        <p>Retrieved {loaded.retrievedAt}. This is acquisition time, not the filing publication time or a current market quote.</p>
        <p>Source authenticity, security class and issuer mapping remain unverified. No trading or valuation eligibility is granted.</p>
        <p>Bounded coverage: up to two latest annual operating periods, the latest annual share/EPS period and two latest instant-balance dates found in supported concepts. Other periods, foreign-filer forms and issuer extensions are not covered.</p>
        <a className="inline-block min-h-11 py-2 underline" href={loaded.urls.companyfacts} target="_blank" rel="noopener noreferrer">Open SEC companyfacts ↗</a>
      </div>}
      {View?<View key={symbol} symbol={symbol} configuredName={configuredName} request={loaded?.symbol===symbol?loaded.request:null} statements={loaded?.symbol===symbol?loaded.statements:null} operations={loaded?.symbol===symbol?loaded.operations:null}/>:failed?<p role="alert">The dossier view could not load. Your holding review remains available. Close this panel and reload the page to try again.</p>:<p role="status">Loading dossier view…</p>}
    </div>}
  </details>;
}
