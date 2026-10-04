import { useEffect, useState } from 'react';
import { BookOpen, Check, CircleHelp, X } from 'lucide-react';
import { authFetch, authHeaders } from '../utils/apiAuth';
import { fetchPortfolioHoldings, fetchPortfolioTransactions, type StoredPortfolioHolding, type PortfolioTransaction } from '../utils/portfolioApi';

type Entry = {
  id:string; symbol:string; decision_date:string; decision:string; thesis:string; rule_text?:string|null;
  decision_price:number; forecast_median?:number|null; forecast_p25?:number|null; forecast_p75?:number|null;
  review_target_date:string; review_status:'pending'|'outcome_ready'|'completed'; outcome_return_pct?:number|null;
  benchmark_symbol?:string; benchmark_return_pct?:number|null; excess_return_pct?:number|null; forecast_error_pct?:number|null;
  decision_score_pct?:number|null; action_taken?:string|null; transaction_id?:string|null;
  rule_followed?:boolean|null; review_notes?:string|null;
};
type Weekly = {
  decisions:number; outcomes:number; beatsBenchmark:number; averageExcessReturnPct:number|null;
  averageDecisionScorePct?:number|null; sampleAdequate?:boolean; sampleLabel?:string;
  averageForecastErrorPct:number|null; ruleAdherencePct:number|null; openOutcomeReviews:number; reflection:string;
};
function pct(v:number|null|undefined){ return v==null||!Number.isFinite(v)?'—':(v>=0?'+':'−')+Math.abs(v).toFixed(2)+'%'; }
function label(v:string){ return String(v||'').replace(/_/g,' '); }
function ruleFor(h:StoredPortfolioHolding){
  const p:string[]=[];
  if(h.lossLimitPct!=null)p.push('Loss limit '+h.lossLimitPct+'%');
  if(h.exitRuleType)p.push(h.exitRuleType+(h.exitRuleValue!=null?' '+h.exitRuleValue:''));
  if(h.brokerAlerts?.length)p.push('Broker alerts '+h.brokerAlerts.map(a=>'$'+a.price+' '+a.direction).join(' / '));
  else if(h.brokerAlertPrices?.length)p.push('Broker alerts $'+h.brokerAlertPrices.join(' / $'));
  if(h.ruleStages?.length)p.push('Staged: '+h.ruleStages.map(s=>String(s.type).replace('_',' ')+(s.pct!=null?' '+s.pct+'%':'')).join(' → '));
  return p.join(' · ');
}

export default function DecisionJournalPanel(){
  const [entries,setEntries]=useState<Entry[]>([]);
  const [holdings,setHoldings]=useState<StoredPortfolioHolding[]>([]);
  const [transactions,setTransactions]=useState<PortfolioTransaction[]>([]);
  const [weekly,setWeekly]=useState<Weekly|null>(null);
  const [open,setOpen]=useState(false);
  const [holdingId,setHoldingId]=useState('');
  const [decision,setDecision]=useState('HOLD');
  const [thesis,setThesis]=useState('');
  const [ruleText,setRuleText]=useState('');
  const [benchmark,setBenchmark]=useState('SPY');
  const [actionTaken,setActionTaken]=useState('none');
  const [transactionId,setTransactionId]=useState('');
  const [notes,setNotes]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  const load=async()=>{
    try{
      const [jr,p]=await Promise.all([
        authFetch('/api/decision-journal',{cache:'no-store'}),
        fetchPortfolioHoldings(),
      ]);
      const body=await jr.json().catch(()=>({}));
      if(!jr.ok)throw new Error(body?.error||'Decision journal unavailable');
      setEntries(Array.isArray(body?.entries)?body.entries:[]);
      setWeekly(body?.weekly||null);
      setHoldings(p);
      try { setTransactions(await fetchPortfolioTransactions()); } catch { setTransactions([]); }
      if(!holdingId&&p[0]){
        setHoldingId(p[0].id);
        setThesis(p[0].decisionThesis||p[0].notes||'');
        setRuleText(ruleFor(p[0]));
        setBenchmark(p[0].riskGroup?.toLowerCase()==='semiconductor'?'SOXX':'SPY');
      }
    }catch(e){setError(e instanceof Error?e.message:'Decision journal unavailable');}
    finally{setLoading(false);}
  };
  useEffect(()=>{load();},[]);
  const choose=(id:string)=>{
    const h=holdings.find(x=>x.id===id);
    setHoldingId(id);setThesis(h?.decisionThesis||h?.notes||'');setRuleText(h?ruleFor(h):'');
    setBenchmark(h?.riskGroup?.toLowerCase()==='semiconductor'?'SOXX':'SPY');
    setTransactionId('');setActionTaken('none');
  };
  const create=async()=>{
    if(!holdingId||!thesis.trim()){setError('Select a holding and record the thesis.');return;}
    setBusy(true);setError('');
    try{
      const r=await authFetch('/api/decision-journal',{
        method:'POST',
        headers:authHeaders({'Content-Type':'application/json'}),
        body:JSON.stringify({holdingId,decision,thesis:thesis.trim(),ruleText:ruleText.trim(),benchmarkSymbol:benchmark,actionTaken,transactionId:transactionId||null})
      });
      const b=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(b?.error||'Unable to log decision');
      setOpen(false);await load();
    }catch(e){setError(e instanceof Error?e.message:'Unable to log decision');}
    finally{setBusy(false);}
  };
  const mark=async(e:Entry,followed:boolean)=>{
    setBusy(true);setError('');
    try{
      const r=await authFetch('/api/decision-journal',{method:'PATCH',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({id:e.id,ruleFollowed:followed,reviewNotes:notes[e.id]||''})});
      const b=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(b?.error||'Unable to update review');
      await load();
    }catch(x){setError(x instanceof Error?x.message:'Unable to update review');}
    finally{setBusy(false);}
  };
  if(loading)return <section className="rounded-2xl border border-white/10 bg-black/10 p-4" data-testid="decision-journal"><div className="text-[9px] font-mono uppercase text-white/30">Decision journal</div><div className="mt-2 text-[10px] text-white/40">Loading decision history…</div></section>;
  const selectedSymbol=holdings.find(h=>h.id===holdingId)?.symbol;
  const weeklyView: Weekly = weekly || { decisions:0, outcomes:0, beatsBenchmark:0, averageExcessReturnPct:null, averageDecisionScorePct:null, averageForecastErrorPct:null, ruleAdherencePct:null, openOutcomeReviews:0, sampleLabel:'UNAVAILABLE', reflection:'Weekly decision review is unavailable from the current data response.' };
  return <section className="rounded-2xl border border-white/10 bg-black/10 p-4" data-testid="decision-journal">
    <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-cyan-300" aria-hidden="true"/><div className="text-sm font-black">Decision journal + 20-day review</div></div><p className="text-[10px] leading-4 text-white/40 mt-1">Capture the thesis, intended decision, benchmark and actual action. The system scores the outcome in the direction of the decision.</p></div>
      <button type="button" onClick={()=>{setOpen(!open);setError('')}} className="rounded-lg border border-cyan-400/15 bg-cyan-400/[.05] px-3 py-2 text-[9px] font-mono uppercase text-cyan-200">{open?'Close':'Log decision'}</button></div>
    {open&&<div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 rounded-xl border border-cyan-400/10 bg-cyan-400/[.02] p-3">
      <label className="text-[9px] font-mono uppercase text-white/35">Holding<select value={holdingId} onChange={e=>choose(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1115] px-3 py-2 text-xs text-white">{holdings.map(h=><option key={h.id} value={h.id}>{h.symbol}</option>)}</select></label>
      <label className="text-[9px] font-mono uppercase text-white/35">Decision<select value={decision} onChange={e=>setDecision(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1115] px-3 py-2 text-xs text-white">{['HOLD','ADD_REVIEW','REDUCE_REVIEW','EXIT_REVIEW','WATCH'].map(v=><option key={v} value={v}>{label(v)}</option>)}</select></label>
      <label className="text-[9px] font-mono uppercase text-white/35">Benchmark<select value={benchmark} onChange={e=>setBenchmark(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1115] px-3 py-2 text-xs text-white"><option value="SPY">SPY</option><option value="SOXX">SOXX</option></select></label>
      <label className="text-[9px] font-mono uppercase text-white/35">Action taken<select value={actionTaken} onChange={e=>setActionTaken(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1115] px-3 py-2 text-xs text-white">{['none','BUY','SELL','HOLD','OTHER'].map(v=><option key={v} value={v}>{label(v)}</option>)}</select></label>
      <label className="md:col-span-2 text-[9px] font-mono uppercase text-white/35">Linked transaction<select value={transactionId} onChange={e=>setTransactionId(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1115] px-3 py-2 text-xs text-white"><option value="">Not linked</option>{transactions.filter(t=>t.symbol===selectedSymbol).map(t=><option key={t.id} value={t.id}>{t.tradeDate} · {t.transactionType} · {t.quantity} @ {t.price==null?'—':t.price}</option>)}</select></label>
      <label className="md:col-span-2 text-[9px] font-mono uppercase text-white/35">Thesis<textarea value={thesis} onChange={e=>setThesis(e.target.value)} rows={3} placeholder="Why am I making this decision?" className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1115] px-3 py-2 text-xs text-white"/></label>
      <label className="md:col-span-2 text-[9px] font-mono uppercase text-white/35">Rule<textarea value={ruleText} onChange={e=>setRuleText(e.target.value)} rows={2} placeholder="What would make me change course?" className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1115] px-3 py-2 text-xs text-white"/></label>
      <div className="md:col-span-2 flex items-center gap-2"><button type="button" disabled={busy} onClick={create} className="rounded-lg border border-emerald-400/15 bg-emerald-400/[.06] px-3 py-2 text-[9px] font-mono uppercase text-emerald-300">{busy?'Saving…':'Save decision'}</button><span className="text-[9px] text-white/30">Benchmark choice and actual action are stored with the decision; outcome is reviewed after 20 trading sessions.</span></div>
    </div>}
    {<div className="mt-3 rounded-xl border border-violet-400/10 bg-violet-400/[.025] p-3"><div className="flex items-center gap-2"><CircleHelp className="w-3.5 h-3.5 text-violet-300"/><span data-testid="decision-weekly-review" className="text-[9px] font-mono uppercase tracking-widest text-violet-200">Weekly decision review</span></div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-2"><Stat label="Decisions" value={String(weekly.decisions)}/><Stat label="Outcomes" value={String(weekly.outcomes)}/><Stat label="Score" value={pct(weekly.averageDecisionScorePct)}/><Stat label="Excess" value={pct(weekly.averageExcessReturnPct)}/><Stat label="Rule adherence" value={weekly.ruleAdherencePct==null?'—':weekly.ruleAdherencePct.toFixed(0)+'%'}/><Stat label="Sample" value={weekly.sampleLabel || (weekly.sampleAdequate?'Adequate':'Insufficient')}/></div>
      <div className="mt-2 text-[9px] leading-4 text-white/40">Reflection: {weekly.reflection}</div></div>}
    {error&&<div className="mt-2 text-[10px] text-rose-300">{error}</div>}
    <div className="mt-3 space-y-2">{entries.slice(0,6).map(e=><div key={e.id} className="rounded-xl border border-white/5 bg-white/[.015] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="font-black text-sm">{e.symbol}</span><span className="text-[8px] font-mono uppercase text-cyan-200 border border-cyan-400/15 rounded px-1.5 py-0.5">{label(e.decision)}</span><span className="text-[9px] text-white/25">{e.decision_date}</span></div><span className={'text-[8px] font-mono uppercase '+(e.review_status==='completed'?'text-emerald-300':e.review_status==='outcome_ready'?'text-amber-300':'text-white/35')}>{label(e.review_status)}</span></div>
      <div className="text-[10px] text-white/45 mt-2">{e.thesis}</div><div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2"><Stat label="Forecast" value={e.forecast_median==null?'—':pct(e.forecast_median)}/><Stat label={'vs '+(e.benchmark_symbol||'SPY')} value={pct(e.excess_return_pct)}/><Stat label="Decision score" value={pct(e.decision_score_pct)}/><Stat label="Action" value={label(e.action_taken||'none')}/><Stat label="Rule" value={e.rule_followed==null?'Needs review':e.rule_followed?'Followed':'Not followed'}/></div>
      {e.review_status==='outcome_ready'&&<div className="mt-3 flex flex-wrap gap-2 items-center"><button type="button" disabled={busy} aria-label={'Mark rule followed for '+e.symbol} onClick={()=>mark(e,true)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/15 bg-emerald-400/[.05] px-2 py-1.5 text-[8px] font-mono uppercase text-emerald-300"><Check className="w-3 h-3"/> Rule followed</button><button type="button" disabled={busy} aria-label={'Mark rule not followed for '+e.symbol} onClick={()=>mark(e,false)} className="inline-flex items-center gap-1 rounded-lg border border-rose-400/15 bg-rose-400/[.05] px-2 py-1.5 text-[8px] font-mono uppercase text-rose-300"><X className="w-3 h-3"/> Rule not followed</button><input value={notes[e.id]||''} onChange={x=>setNotes({...notes,[e.id]:x.target.value})} placeholder="One sentence: what did I learn?" className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-black/10 px-2 py-1.5 text-[9px] text-white"/></div>}
    </div>)}{!entries.length&&<div className="text-[10px] text-white/30">No decisions logged yet. Start with the next meaningful portfolio decision.</div>}</div>
  </section>;
}
function Stat({label,value}:{label:string;value:string}){return <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] uppercase font-mono text-white/20">{label}</div><div className="text-[10px] font-mono font-bold mt-1 text-white/75">{value}</div></div>}
