import { useCallback, useEffect, useState } from 'react';
import { Activity, BellRing, ExternalLink, RefreshCw, Save, Trash2, FlaskConical } from 'lucide-react';
import { authFetch } from '../utils/apiAuth';
import { type ReentryStatus } from '../utils/reentryIntelligence';

type Item = {
  symbol: string; ownershipStatus: 'holding' | 'sold'; salePrice: number | null; saleDate: string | null;
  plannedExitPrice: number | null; upperReviewPrice: number | null; targetPrice: number;
  thesis: string; thesisInvalidated: boolean; active: boolean; lastPrice?: number | null;
  sma20?: number | null; sma50?: number | null; drawdownFrom52WeekHighPct?: number | null;
  retrievedAt?: string | null; status?: ReentryStatus; reasons?: string[];
};
const STATUS: Record<ReentryStatus, { label: string; tone: string }> = {
  HOLDING: { label: 'Still holding', tone: 'border-white/10 text-white/65 bg-white/[.03]' },
  EXIT_REVIEW: { label: 'Exit review needed', tone: 'border-amber-300/20 text-amber-200 bg-amber-300/[.05]' },
  EVIDENCE_REVIEW_REQUIRED: { label: 'Evidence review needed', tone: 'border-violet-300/20 text-violet-200 bg-violet-300/[.05]' },
  NOT_READY: { label: 'Not attractive yet', tone: 'border-white/10 text-white/55 bg-white/[.03]' },
  WATCH_ENTRY: { label: 'Watch for entry', tone: 'border-amber-300/20 text-amber-200 bg-amber-300/[.05]' },
  REENTRY_CANDIDATE: { label: 'Re-entry candidate', tone: 'border-emerald-300/20 text-emerald-200 bg-emerald-300/[.05]' },
  INSUFFICIENT_DATA: { label: 'Insufficient data', tone: 'border-rose-300/20 text-rose-200 bg-rose-300/[.05]' },
};
const numberOrNull = (value: unknown) => Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null;
const money = (value: number | null | undefined) => value == null ? '—' : '$' + value.toLocaleString('en-US', { maximumFractionDigits: 2 });
const initialDraft = (): Item => ({
  symbol: 'META',
  ownershipStatus: 'holding',
  salePrice: null,
  saleDate: null,
  plannedExitPrice: 770,
  upperReviewPrice: 770,
  targetPrice: 720,
  thesis: 'Durable advertising and social-platform business; long-term AI potential including Muse. Re-check monetization, AI spending, competition, regulation and execution against this thesis.',
  thesisInvalidated: false,
  active: true,
});
export default function ReentryIntelligence() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState<Item>(initialDraft());
  const [research, setResearch] = useState<any>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState('');


  const [editing, setEditing] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await authFetch('/api/reentry-alerts', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not load re-entry watchlist.');
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Re-entry data unavailable. Sign in and retry.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const save = async () => {
    const symbol = draft.symbol.trim().toUpperCase();
    if (!/^[A-Z0-9.^=-]{1,20}$/.test(symbol) || !(draft.targetPrice > 0)) { setError('Enter a valid ticker and a target entry price greater than zero.'); return; }
    if (draft.ownershipStatus === 'sold' && (!(draft.salePrice != null && draft.salePrice > 0) || !draft.saleDate)) {
      setError('Record the actual sale price and sale date before activating sold-stock re-entry monitoring. Do not mark META sold while you still hold it.');
      return;
    }
    setSaving(true); setError(''); setMessage('');
    try {
      const response = await authFetch('/api/reentry-alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, symbol }), cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not save re-entry watch.');
      setDraft(initialDraft());
      setEditing(null); setMessage(symbol + (draft.ownershipStatus === 'holding' ? ' holding rule saved. The planned price only triggers an exit review; it does not place a sell.' : ' re-entry rule saved. Alerts are review prompts only; no purchase is automatic.'));
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save re-entry watch.'); }
    finally { setSaving(false); }
  };
  const loadResearch = async (rawSymbol: string) => {
    const symbol = rawSymbol.trim().toUpperCase();
    if (!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)) { setResearchError('Enter a valid ticker before requesting research.'); return; }
    setResearchLoading(true); setResearchError(''); setResearch(null);
    try {
      const response = await authFetch('/api/reentry-alerts?research=true&symbol=' + encodeURIComponent(symbol), { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok !== true) throw new Error(data?.error || 'Could not load analyst and institutional evidence.');
      setResearch(data);
    } catch (e) {
      setResearchError(e instanceof Error ? e.message : 'Research sources are unavailable. Retry later.');
    } finally {
      setResearchLoading(false);
    }
  };
  const remove = async (symbol: string) => {
    try {
      const response = await authFetch('/api/reentry-alerts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol }), cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not remove watch.');
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not remove watch.'); }
  };
  const edit = (item: Item) => { setEditing(item.symbol); setDraft({ ...item }); };
  return <section className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[.025] p-4 md:p-5">
    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
      <div><div className="flex items-center gap-2 text-cyan-100"><Activity className="w-4 h-4" /><h2 className="text-sm font-black">Re-entry Intelligence</h2></div><p className="mt-1 max-w-3xl text-[10px] leading-relaxed text-white/45">Track an existing holding’s planned exit-review level, then switch it to sold only after an actual sale. Lower-price and upper-price paths trigger evidence reviews—not automatic trades.</p></div>
      <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-bold uppercase text-white/65 disabled:opacity-50"><RefreshCw className={'w-3 h-3 ' + (loading ? 'animate-spin' : '')}/> Refresh</button>
    </div>
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
      <label className="text-[9px] uppercase tracking-wide text-white/40">Ticker<input value={draft.symbol} onChange={e=>setDraft(v=>({...v,symbol:e.target.value.toUpperCase()}))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none focus:border-cyan-300/40" placeholder="MSFT"/></label>
      <label className="text-[9px] uppercase tracking-wide text-white/40">Position status<select value={draft.ownershipStatus} onChange={e=>setDraft(v=>({...v,ownershipStatus:e.target.value as 'holding'|'sold',salePrice:e.target.value==='holding'?null:v.salePrice,saleDate:e.target.value==='holding'?null:v.saleDate}))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none focus:border-cyan-300/40"><option value="holding">Still holding — monitor exit review</option><option value="sold">Sold — monitor re-entry</option></select></label>
      <label className="text-[9px] uppercase tracking-wide text-white/40">Lower re-entry target (USD)<input type="number" min="0.01" step="0.01" value={draft.targetPrice || ''} onChange={e=>setDraft(v=>({...v,targetPrice:Number(e.target.value)}))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none focus:border-cyan-300/40" placeholder="Your price, not a forecast"/></label>
      {draft.ownershipStatus === 'sold' && <label className="text-[9px] uppercase tracking-wide text-white/40">Actual sale price (USD)<input type="number" min="0" step="0.01" value={draft.salePrice ?? ''} onChange={e=>setDraft(v=>({...v,salePrice:numberOrNull(e.target.value)}))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none focus:border-cyan-300/40" placeholder="Last sale price"/></label>}
      {draft.ownershipStatus === 'sold' && <label className="text-[9px] uppercase tracking-wide text-white/40">Sale date<input type="date" value={draft.saleDate || ''} onChange={e=>setDraft(v=>({...v,saleDate:e.target.value || null}))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none focus:border-cyan-300/40"/></label>}
      <label className="text-[9px] uppercase tracking-wide text-white/40">Planned exit-review level (USD)<input type="number" min="0" step="0.01" value={draft.plannedExitPrice ?? ''} onChange={e=>setDraft(v=>({...v,plannedExitPrice:numberOrNull(e.target.value)}))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none focus:border-cyan-300/40" placeholder="Optional price review reminder"/></label>
      <label className="text-[9px] uppercase tracking-wide text-white/40">Upper-price evidence review (USD)<input type="number" min="0" step="0.01" value={draft.upperReviewPrice ?? ''} onChange={e=>setDraft(v=>({...v,upperReviewPrice:numberOrNull(e.target.value)}))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none focus:border-cyan-300/40" placeholder="Review evidence before re-entry"/></label>
      <label className="md:col-span-2 text-[9px] uppercase tracking-wide text-white/40">Why you still believe in the company<textarea value={draft.thesis} onChange={e=>setDraft(v=>({...v,thesis:e.target.value}))} rows={2} maxLength={1200} className="mt-1 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none focus:border-cyan-300/40" placeholder="Long-term thesis; what must remain true?"/></label>
      <label className="md:col-span-2 flex items-start gap-2 text-[10px] text-white/55"><input type="checkbox" checked={draft.thesisInvalidated} onChange={e=>setDraft(v=>({...v,thesisInvalidated:e.target.checked}))} className="mt-0.5"/> Thesis invalidated — suppress re-entry candidate alerts until reviewed.</label>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" disabled={researchLoading || loading} onClick={()=>void loadResearch(draft.symbol)} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300/20 bg-violet-300/[.06] px-3 py-2 text-[9px] font-bold uppercase text-violet-100 disabled:opacity-50"><FlaskConical className="w-3 h-3"/>{researchLoading ? 'Loading evidence…' : 'Load analyst + fund holdings evidence'}</button><button type="button" disabled={saving} onClick={()=>void save()} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-200 px-3 py-2 text-[9px] font-black uppercase text-slate-950 disabled:opacity-50"><Save className="w-3 h-3"/>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add to re-entry watchlist'}</button>{editing && <button type="button" onClick={()=>{setEditing(null);setDraft(initialDraft());}} className="rounded-lg border border-white/10 px-3 py-2 text-[9px] text-white/55">Cancel edit</button>}<span className="inline-flex items-center gap-1 text-[9px] text-white/30"><BellRing className="w-3 h-3"/> Telegram alerts on candidate transition</span></div>
    {researchError && <p role="alert" className="mt-3 rounded-lg border border-rose-300/20 bg-rose-300/[.05] p-3 text-[10px] text-rose-200">{researchError}</p>}
    {research && <div className="mt-4 rounded-xl border border-violet-300/15 bg-violet-300/[.03] p-3 md:p-4">
      <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between"><div><h3 className="text-xs font-black text-violet-100">{research.symbol} · Analyst and institutional evidence</h3><p className="mt-1 text-[9px] text-white/40">Fetched {research.requestedAt ? new Date(research.requestedAt).toLocaleString() : 'time unavailable'}{research.cached ? ' · cached' : ''}. This is evidence, not a recommendation.</p></div><button type="button" onClick={()=>void loadResearch(research.symbol)} className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[8px] uppercase text-white/60"><RefreshCw className="h-3 w-3"/> Refresh research</button></div>
      <div className="mt-3 rounded-lg border border-white/10 bg-black/15 p-3">
        <h4 className="text-[10px] font-bold text-white/80">Analyst consensus and 12-month price targets</h4>
        {research.analyst?.status === 'available' ? <><p className="mt-1 text-[10px] text-white/65">Ratings: {research.analyst.ratings ? `Strong Buy ${research.analyst.ratings.strongBuy} · Buy ${research.analyst.ratings.buy} · Hold ${research.analyst.ratings.hold} · Sell ${research.analyst.ratings.sell} · Strong Sell ${research.analyst.ratings.strongSell}` : 'Not supplied'}{research.analyst.recommendationPeriod ? ' · Period ' + research.analyst.recommendationPeriod : ''}</p><p className="mt-1 text-[10px] text-white/65">Targets: low {money(research.analyst.targets?.low)} · mean {money(research.analyst.targets?.mean)} · median {money(research.analyst.targets?.median)} · high {money(research.analyst.targets?.high)}{research.analyst.targets?.analystCount ? ' · ' + research.analyst.targets.analystCount + ' analysts' : ''}</p><p className="mt-1 text-[9px] text-white/35">Source: {research.analyst.source} · targets last updated {research.analyst.targets?.lastUpdated || 'not reported'} · retrieved {research.analyst.retrievedAt ? new Date(research.analyst.retrievedAt).toLocaleString() : 'unknown'}.</p></> : <p className="mt-1 text-[10px] text-amber-100/70">Analyst data unavailable: {research.analyst?.message || 'No consensus returned.'} Configure the server-side Finnhub key or retry later.</p>}
      </div>
      <div className="mt-3"><div className="flex items-center justify-between gap-2"><h4 className="text-[10px] font-bold text-white/80">Disclosed institutional holdings (SEC 13F)</h4><a href={research.institutionalHoldings?.autopilotReference} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[9px] text-cyan-200/70 hover:text-cyan-100">Autopilot tracker context <ExternalLink className="h-3 w-3"/></a></div><p className="mt-1 text-[9px] leading-relaxed text-amber-100/55">{research.institutionalHoldings?.asOfMeaning}</p>
        {research.institutionalHoldings?.message && <p className="mt-1 text-[10px] text-amber-100/70">{research.institutionalHoldings.message}</p>}
        <div className="mt-2 space-y-2">{(research.institutionalHoldings?.managers || []).map((manager: any) => <div key={manager.cik} className="rounded-lg border border-white/10 bg-black/15 p-2.5"><div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1"><div><p className="text-[10px] font-bold text-white/80">{manager.name}</p><p className="text-[9px] text-white/40">Report date {manager.reportDate || 'unknown'} · Filed {manager.filingDate || 'unknown'}</p></div><span className={'text-[8px] uppercase font-bold ' + (manager.status === 'reported_in_filing' ? 'text-emerald-200' : manager.status === 'unavailable' ? 'text-rose-200' : 'text-white/45')}>{manager.status === 'reported_in_filing' ? 'META reported' : manager.status === 'unavailable' ? 'Unavailable' : 'Not in latest filing'}</span></div>{manager.status === 'reported_in_filing' && <p className="mt-1 text-[9px] text-white/60">{manager.shares?.toLocaleString('en-US') ?? '—'} shares · reported value {money(manager.marketValueUsd)}</p>}{manager.message && <p className="mt-1 text-[9px] text-rose-100/50">{manager.message}</p>}{manager.filingUrl && <a href={manager.filingUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[9px] text-cyan-200/65 hover:text-cyan-100">Open SEC filing <ExternalLink className="h-3 w-3"/></a>}</div>)}</div>
        <p className="mt-2 text-[9px] leading-relaxed text-white/35">13F reports are delayed and show selected reportable long U.S. equity positions only. A fund not reporting META here does not prove it has no exposure elsewhere, and a filed position may have changed since quarter-end.</p>
      </div>
    </div>}
    {error && <p role="alert" className="mt-3 rounded-lg border border-rose-300/20 bg-rose-300/[.05] p-3 text-[10px] text-rose-200">{error}</p>}
    {message && <p role="status" className="mt-3 rounded-lg border border-emerald-300/20 bg-emerald-300/[.05] p-3 text-[10px] text-emerald-200">{message}</p>}
    <div className="mt-4 space-y-2">
      {items.map(item => { const status = item.status || 'INSUFFICIENT_DATA'; const meta = STATUS[status]; return <div key={item.symbol} className="rounded-xl border border-white/10 bg-black/15 p-3">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-black text-white">{item.symbol}</span><span className={'rounded border px-2 py-1 text-[8px] font-bold uppercase '+meta.tone}>{meta.label}</span>{item.thesisInvalidated && <span className="text-[8px] uppercase text-rose-200">Thesis invalidated</span>}</div><p className="mt-1 text-[10px] text-white/45">{item.ownershipStatus === 'holding' ? 'Holding' : 'Sold'} · Price {money(item.lastPrice)} · Lower re-entry {money(item.targetPrice)} · Exit review {money(item.plannedExitPrice)} · Upper evidence review {money(item.upperReviewPrice)} · 20-day avg {money(item.sma20)} · 50-day avg {money(item.sma50)}</p><p className="mt-1 text-[9px] text-white/30">52-week high drawdown: {item.drawdownFrom52WeekHighPct == null ? 'unavailable' : item.drawdownFrom52WeekHighPct.toFixed(1)+'%'} · {item.retrievedAt ? 'Updated '+new Date(item.retrievedAt).toLocaleString() : 'Waiting for market data'}</p></div><div className="flex gap-1"><button type="button" onClick={()=>edit(item)} className="rounded border border-white/10 px-2 py-1 text-[8px] uppercase text-white/55">Edit</button><button type="button" aria-label={'Remove '+item.symbol} onClick={()=>void remove(item.symbol)} className="rounded border border-white/10 p-1.5 text-white/40 hover:text-rose-200"><Trash2 className="w-3 h-3"/></button></div></div>
        <ul className="mt-2 space-y-1 text-[9px] text-white/50">{(item.reasons || ['Refresh for current price and trend context.']).map((reason,i)=><li key={i}>• {reason}</li>)}</ul>
      </div>; })}
      {!loading && !items.length && <p className="rounded-lg border border-white/10 p-4 text-center text-[10px] text-white/35">No rules saved yet. Start with the planned META thresholds, then save only when you are ready.</p>}
      {loading && <p className="py-3 text-center text-[10px] text-white/35">Loading re-entry watchlist…</p>}
    </div>
    <p className="mt-3 text-[9px] leading-relaxed text-white/25">Alerts are review prompts only. A candidate means your price target and trend rules align; it does not prove fair value or confirm current fundamentals. Verify earnings, valuation, news, thesis and portfolio risk before acting. No orders are placed.</p>
  </section>;
}
