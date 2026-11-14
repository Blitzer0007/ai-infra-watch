import {useEffect, useRef, useState} from 'react';
import {authFetch} from '../utils/apiAuth';
import {inspectCouncilSources, councilCoverageState, councilEnvelope, type CouncilResult, type CouncilAdmission} from '../utils/portfolioCouncil';
import {councilAdmissionEnvelope,councilV2Envelope,councilRequestDigest} from '../../shared/councilAdmission.js';
import {councilJevEnvelope} from '../../shared/portfolioCouncilContract.js';
import type {PeerFundamentalSnapshot} from '../utils/peerStrength';
import type {CatalystSnapshot} from '../utils/catalystCalendar';

type JevCoverage = {available:boolean;coverage:string|null;next_check:string|null;input_tokens:number|null};
const control='rounded-lg border border-white/20 bg-slate-950 px-3 py-2 text-sm disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300';
const human=(s:string)=>s.replaceAll('_',' ').replaceAll('-',' ');

/** Manual development research. No allocation, ledger, delivery, or discovery capabilities. */
export default function JevCouncilPanel({symbols,quotes,financials,calendar}:{symbols:string[];quotes:Record<string,unknown>;financials:PeerFundamentalSnapshot[];calendar?:CatalystSnapshot}) {
  const [chosen,setChosen]=useState(symbols[0]||'');
  const symbol=symbols.includes(chosen)?chosen:symbols[0]||'';
  const [horizon,setHorizon]=useState<3|6|12>(3);
  const [result,setResult]=useState<CouncilResult|null>(null);
  const [sources,setSources]=useState<ReturnType<typeof inspectCouncilSources>|null>(null);
  const [admission,setAdmission]=useState<CouncilAdmission|null>(null);
  const [jev,setJev]=useState<JevCoverage|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [attempts,setAttempts]=useState(0);
  const flight=useRef<AbortController|null>(null);
  const version=useRef(0);
  const attemptCount=useRef(0);
  useEffect(()=>{
    version.current+=1;flight.current?.abort();flight.current=null;
    setResult(null);setSources(null);setAdmission(null);setJev(null);setError('');setBusy(false);
    return ()=>{version.current+=1;flight.current?.abort();flight.current=null;};
  },[symbol,horizon]);

  function inspect() {
    if(flight.current)return;
    try {
      setSources(inspectCouncilSources(symbol,quotes[symbol],financials.find(f=>f.symbol===symbol),'council:'+crypto.randomUUID(),Date.now(),horizon,calendar));
      setResult(null);setAdmission(null);setJev(null);setError('');
    }catch {setSources(null);setError('Loaded source inspection is unavailable. No model request occurred.');}
  }

  async function run(mode:'demo'|'loaded-v2'|'admission-v2'|'jev') {
    if(flight.current||attemptCount.current>=5||(['loaded-v2','admission-v2'].includes(mode)&&!sources)||(mode==='jev'&&(!result||result.mode!=='nvidia'||result.status!=='complete')))return;
    const controller=new AbortController();flight.current=controller;
    const current=version.current;
    if(mode==='demo'){setSources(null);setAdmission(null);}
    attemptCount.current+=1;setAttempts(attemptCount.current);setBusy(true);setError('');
    const timeout=setTimeout(()=>controller.abort(),47000);
    try {
      const runId='council:'+crypto.randomUUID();
      const payload=mode==='jev'&&result?{mode,run_id:result.run_id,state:councilCoverageState(result)}:
        mode==='demo'?{mode,run_id:runId,assessed_at:new Date().toISOString()}:
        {...sources!.request,mode};
      if(mode==='loaded-v2'&&(!('packet' in payload)||!payload.packet.evidence.length))throw Error();
      const response=await authFetch('/api/agent-ask?task=council',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
      const raw=await response.text();if(raw.length>65536)throw Error();
      const value=JSON.parse(raw);
      const valid=mode==='admission-v2'?councilAdmissionEnvelope(value,payload,await councilRequestDigest(payload)):mode==='loaded-v2'?councilV2Envelope(value,payload,await councilRequestDigest(payload)):mode==='jev'?councilJevEnvelope(value,payload):councilEnvelope(value,payload);
      if(!response.ok||!valid)throw Error();
      if(current!==version.current)return;
      if(mode==='jev')setJev(value);else if(mode==='admission-v2')setAdmission(value);else {setResult(value);setAdmission(value.admission||null);setJev(null);}
    } catch {
      if(current===version.current)setError('Council review unavailable. Check the private development configuration or loaded evidence. No automatic retry occurred.');
    } finally {
      clearTimeout(timeout);
      if(current===version.current){flight.current=null;setBusy(false);}
    }
  }
  const disabled=busy||attempts>=5;
  return <details data-testid="portfolio-council" className="rounded-2xl border border-cyan-300/25 bg-slate-900/70 p-5 text-white">
    <summary className="cursor-pointer text-lg font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">Bull · Bear · Judge research council <span className="text-xs font-normal text-cyan-200">Development preview</span></summary>
    <div className="mt-4 space-y-4">
      <p className="max-w-3xl text-sm leading-6 text-slate-300">Bull and Bear independently select loaded evidence. Judge compares their cases and may abstain. A preference is a provisional interpretation; future correctness requires independently measured outcomes.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Council company<select aria-label="Council company" value={symbol} onChange={e=>setChosen(e.target.value)} className={control+' mt-1 block'}>{symbols.map(s=><option key={s}>{s}</option>)}</select></label>
        <label className="text-sm">Research horizon<select aria-label="Council research horizon" value={horizon} onChange={e=>setHorizon(Number(e.target.value) as 3|6|12)} className={control+' mt-1 block'}>{[3,6,12].map(n=><option key={n} value={n}>{n} months</option>)}</select></label>
        <button className={control} disabled={disabled||!!result} onClick={()=>void run('demo')}>Run fictional council demo</button>
        <button className={control} disabled={busy||!symbol} onClick={inspect}>Inspect loaded sources</button>
        <button className={control} disabled={disabled||!sources||!!admission} onClick={()=>void run('admission-v2')}>Validate research inputs</button>
        <button className={control+' text-cyan-200'} disabled={disabled||!!result||!sources?.packet.evidence.length} onClick={()=>void run('loaded-v2')}>Analyze loaded evidence</button>
        {result&&<button className={control} disabled={busy} onClick={()=>{setResult(null);setSources(null);setAdmission(null);setJev(null);setError('');}}>Start a new review</button>}
      </div>
      <p className="text-xs leading-5 text-slate-400">Manual only · Up to six model calls and three loaded-data tools per council · Five attempts per page session · No automatic retries. Loaded analysis requires a separately enabled NVIDIA development backend. TypeSafe is optional and runs only on a separate click.</p>
      {sources&&<details open data-testid="council-source-receipt" className="rounded-xl border border-white/15 p-3 text-sm">
        <summary className="cursor-pointer font-medium">Loaded source inspection · {sources.packet.symbol} · {sources.packet.evidence.length} observations</summary>
        <div className="mt-3 space-y-3 text-xs text-slate-300">
          <p>Frozen at {sources.packet.assessed_at}. Inspection makes no request. Analysis will use this snapshot until you inspect again.</p>
          <p>SEC receipt: {human(sources.financialStatus)} · Calendar: {human(sources.calendar.status)} · Source authenticity remains unverified.</p>
          {sources.sec&&<p className="break-words">Declared issuer CIK: {sources.sec.cik} · Source retrieved: {sources.sec.retrieved_at}</p>}
          <p>Derived ratios and cash flow are calculated from reported inputs, not directly reported metrics. Date-only filing publications stay date-only; no midnight observation or publication time is invented. Filing references go only to the private validation backend, not model prompts. Conditional research admission is separate from source authentication or decision eligibility.</p>
          {sources.sec?.observations.map((o:any)=><div key={o.evidence.evidence_id} className="break-words rounded bg-black/20 p-3">
            <p className="font-medium text-white">{human(o.evidence.metric)}: {o.evidence.value.toLocaleString()} {o.evidence.unit}</p>
            <p>Calculation: {human(o.method)} · Period: {o.evidence.period_start||'point in time'} to {o.evidence.period_end}</p>
            {o.inputs.map((f:any,i:number)=><p key={i}>{f.tag} · {f.value.toLocaleString()} {f.unit} · {f.form} {f.accession} · Filed {f.filed_on} (date only)</p>)}
          </div>)}
          {!!sources.sec?.issues.length&&<p>SEC gaps: {sources.sec.issues.map(human).join(' · ')}</p>}
          {sources.calendar.event&&<p>Selected event: {sources.calendar.event.date} · {sources.calendar.event.confirmation} · countdown uses elapsed UTC days, not trading sessions.</p>}
          <p>Calendar gaps: {sources.calendar.issues.map(human).join(' · ')||'none under configured checks'} · Original calendar coverage remains unknown.</p>
        </div>
      </details>}
      {admission&&<details open data-testid="council-admission" className="rounded-xl border border-amber-300/25 p-3 text-sm">
        <summary className="cursor-pointer font-medium">Research input checks · {human(admission.status)}</summary>
        <div className="mt-3 space-y-3 text-xs text-slate-300">
          <p>Rules: {admission.rule_version}. Conditional checks use declared inputs only. Source authenticity and forecast validity remain unverified; no decision eligibility was granted.</p>
          <p>Missing conditional coverage: {admission.quality.missing_families.join(', ')||'none under these input checks'}. Validation itself makes no model or provider call.</p>
          {admission.records.map(r=><div key={r.evidence_id} className="break-words rounded bg-black/20 p-2"><p>{r.evidence_id} · {human(r.kind)} · {r.eligible?'Conditionally usable for research':'Needs data'}</p>
            {!!r.reason_codes.length&&<p>{r.reason_codes.map(human).join(' · ')}</p>}
            {r.publication_window&&<p>Possible publication range: {r.publication_window.earliest} to before {r.publication_window.latest_exclusive}. Date-only, unknown-zone bounds; neither endpoint is the actual publication time.</p>}
          </div>)}
          <p>The legacy council protocol remains separate. V2 analysis independently rechecks the same frozen source declarations before using its conditional coverage.</p>
        </div>
      </details>}
      {busy&&<p role="status" className="text-sm text-cyan-200">Reviewing the frozen evidence snapshot…</p>}
      {error&&<p role="alert" className="text-sm text-amber-200">{error}</p>}
      {attempts>=5&&<p className="text-sm text-amber-200">The session review limit is reached.</p>}
      {result&&<div data-testid="council-result" className="space-y-4" aria-live="polite">
        <div className="rounded-xl border border-amber-300/25 bg-amber-300/5 p-4">
          <h3 className="font-semibold">{result.symbol} · {result.mode==='fixture'?'Fictional demonstration':'Loaded evidence review'} · {result.horizon_months} months</h3>
          <p className="mt-2 text-sm">Evidence result: <strong>{human(result.disposition)}</strong> · Run: {human(result.status)}</p>
          <p className="mt-1 text-sm text-amber-100">Source authenticity is unverified. Forecast validity is not established. No decision eligibility was granted; allocations and messages are unaffected.</p>
          <p className="mt-2 text-xs text-slate-300">Missing usable coverage: {result.quality.missing_families.join(', ')||'none under configured metadata checks'} · Conflicting records: {result.quality.conflicting_ids.length}</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">{(['bull','bear','judge'] as const).map(role=>{
          const item=result.roles[role];
          return <article key={role} className="min-w-0 rounded-xl border border-white/15 p-4">
            <h3 className="font-semibold capitalize">{role}</h3>
            <p className="mt-1 text-xs text-slate-400">Research summary{role==='judge'?' · cited comparison':' · independent evidence selection'}</p>
            <p className="mt-3 break-words text-sm leading-6">{item?.summary||'No validated conclusion was returned.'}</p>
            {item?.preference&&<p className="mt-2 text-sm text-cyan-200">Judge preference: {human(item.preference)}</p>}
            {!!item?.claims?.length&&<p className="mt-3 text-xs text-slate-400">Values below come from inspected observations. Support or challenge is a model interpretation.</p>}
            {!!item?.claims?.length&&<ul className="mt-3 space-y-2 text-xs">{item.claims.map(claim=>{
              const row=result.evidence.find(e=>e.evidence_id===claim.evidence_id)!;
              return <li key={claim.claim_id} className="break-words rounded bg-black/20 p-2">{claim.claim_id} · {human(claim.implication)} · {claim.stance}<br/>{human(row.metric)}: {row.value.toLocaleString()} {row.unit}<br/>Source: {row.source_id}{row.simulated?' · simulated':''}</li>;
            })}</ul>}
            {!!item?.winning_claim_ids?.length&&<p className="mt-2 text-xs">Winning citations: {item.winning_claim_ids.join(', ')}</p>}
            {item?.limitations?.map((s,i)=><p key={i} className="mt-2 text-xs text-slate-400">{s}</p>)}
          </article>;
        })}</div>
        <details className="rounded-xl border border-white/10 p-3"><summary className="cursor-pointer text-sm">Evidence provenance and run trace</summary>
          <div className="mt-3 space-y-3 text-xs">{result.evidence.map(row=><div key={row.evidence_id} className="break-words"><p>{row.evidence_id} · {row.source_id} · basis {row.basis}</p><p>Observed: {row.observed_at||'unknown'} · Published: {row.published_at||'unknown'} · Retrieved: {row.retrieved_at||'unknown'}</p><p>Period: {row.period_start||'unknown'} to {row.period_end||'unknown'}</p><p>{result.quality.issues.find(i=>i.evidence_id===row.evidence_id)?.codes.map(human).join(' · ')||'Configured metadata checks passed; source not independently verified.'}</p></div>)}
            <p>Model calls: {result.usage.model_calls}/6 · Tools: {result.usage.tool_calls}/3 · Prompt characters: {result.usage.prompt_chars} · Provider requests: {result.usage.provider_requests??'unreported'} · TypeSafe calls in council: {result.usage.jev_calls}</p>
            <p>Trace: {result.trace.map(t=>t.role+' '+t.action).join(' → ')} · Stop: {human(result.termination_reason)}</p>
            <p>Free-form model summaries and limitations are withheld. Displayed summaries describe validated selections; source authenticity and future outcomes remain unverified.</p>
            <p className="break-all">Snapshot: {result.snapshot_id}</p>
          </div>
        </details>
        <div className="rounded-xl border border-white/10 p-3 text-sm">
          <button className={control} disabled={disabled||!!jev||result.mode!=='nvidia'||result.status!=='complete'} onClick={()=>void run('jev')}>Check coverage with TypeSafe</button>
          <p className="mt-2 text-xs text-slate-400">Optional typed check of coverage counts only; may consume TypeSafe credits when enabled. Unavailable for the fictional demo. It cannot validate source truth, predict returns, or override evidence gates.</p>
          {jev&&<p className="mt-2" role="status">{jev.available?`TypeSafe coverage: ${human(jev.coverage!)} · Next check: ${human(jev.next_check!)} · Input tokens: ${jev.input_tokens??'unreported'}`:'TypeSafe coverage is unavailable. No automatic retry occurred.'}</p>}
        </div>
      </div>}
    </div>
  </details>;
}
