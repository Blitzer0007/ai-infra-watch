import {useEffect,useState} from 'react';
import {inspectCouncilSources} from '../utils/portfolioCouncil';
import type {PeerFundamentalSnapshot} from '../utils/peerStrength';
import type {CatalystSnapshot} from '../utils/catalystCalendar';

type Snapshot=ReturnType<typeof inspectCouncilSources>;
/** Explicit, zero-request research preflight, never a model-produced Bull/Bear/Judge verdict. */
export default function CouncilEvidenceReadiness({symbols,quotes,financials,calendar}:{symbols:readonly string[];quotes:Record<string,unknown>;financials:PeerFundamentalSnapshot[];calendar?:CatalystSnapshot}) {
  const [chosen,setChosen]=useState('');
  const symbol=symbols.includes(chosen)?chosen:symbols[0]??'';
  const [horizon,setHorizon]=useState<3|6|12>(3);
  const [receipt,setReceipt]=useState<Snapshot|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{setReceipt(null);setError('');},[symbol,horizon]);
  function inspect(){
    if(!symbol)return;
    try{
      setReceipt(inspectCouncilSources(symbol,quotes[symbol],financials.find(f=>f.symbol===symbol),'preflight:'+crypto.randomUUID(),Date.now(),horizon,calendar));
      setError('');
    }catch{setReceipt(null);setError('Loaded evidence cannot form a valid bounded research packet. No model/provider request occurred.');}
  }
  const families=['market','financial','catalyst','risk'] as const;
  return <details data-testid="council-evidence-readiness" className="rounded-2xl border border-amber-300/30 bg-slate-900/60 p-5">
    <summary className="cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">Bull · Bear · Judge · evidence preflight (manual)</summary>
    <div className="mt-3 space-y-3 text-sm">
      <p>This is a deterministic read-only inspection, not three live AI predictions. Bull, Bear and Judge models are inactive on production. Judge cannot infer a winner from missing or unverified evidence.</p>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">Company<select aria-label="Council evidence company" value={symbol} onChange={e=>setChosen(e.target.value)} className="min-h-11 rounded border border-white/25 bg-slate-950 px-2">{symbols.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
        <label className="flex flex-col gap-1">Research horizon<select aria-label="Evidence horizon" value={horizon} onChange={e=>setHorizon(Number(e.target.value) as 3|6|12)} className="min-h-11 rounded border border-white/25 bg-slate-950 px-2">{[3,6,12].map(x=><option key={x} value={x}>{x} months</option>)}</select></label>
      </div>
      <button type="button" disabled={!symbol} onClick={inspect} className="min-h-11 rounded border border-cyan-200/40 px-4 py-2 disabled:opacity-40">Inspect loaded evidence (no network)</button>
      {error&&<p role="alert" className="text-amber-200">{error}</p>}
      {receipt&&<div data-testid="council-evidence-receipt" className="space-y-2 rounded-xl border border-white/20 p-3">
        <p>Frozen evidence: {receipt.packet.evidence.length}/8 observations · {receipt.packet.horizon_months}-month research context · no forecast outcome</p>
        <ul className="grid gap-2 sm:grid-cols-2">{families.map(family=><li key={family} className="rounded border border-white/15 p-2">{family}: {receipt.packet.evidence.filter(x=>x.family===family).length} declared observation(s) · {receipt.packet.evidence.some(x=>x.family===family)?'requires independent source/admission review':'missing'}</li>)}</ul>
        <p>SEC source status: {receipt.financialStatus} · Calendar: {receipt.calendar.status} · {receipt.calendar.issues.join(', ')||'No calendar issue declared'}</p>
        <p className="text-amber-100">Bull: no model conclusion · Bear: no model conclusion · Judge: abstains. These observations do not authenticate sources or establish a buy/sell/hold recommendation.</p>
      </div>}
      <p className="text-xs text-white/60">Controlled AI role execution is available only through the separately configured, development-only backend with bounded requests and explicit manual interaction. No API call, trading, portfolio write, sender or model credits are used by this preflight.</p>
    </div>
  </details>;
}
