import { useCallback, useEffect, useState } from 'react';
import { Activity, BellRing, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { authFetch } from '../utils/apiAuth';
import { assessReentry, type ReentryAssessment, type ReentryQuote, type ReentryStatus } from '../utils/reentryIntelligence';

type Item = {
  symbol: string; salePrice: number | null; saleDate: string | null; targetPrice: number;
  thesis: string; thesisInvalidated: boolean; active: boolean; lastPrice?: number | null;
  sma20?: number | null; sma50?: number | null; drawdownFrom52WeekHighPct?: number | null;
  retrievedAt?: string | null; status?: ReentryStatus; reasons?: string[];
};
const STATUS: Record<ReentryStatus, { label: string; tone: string }> = {
  NOT_READY: { label: 'Not attractive yet', tone: 'border-white/10 text-white/55 bg-white/[.03]' },
  WATCH_ENTRY: { label: 'Watch for entry', tone: 'border-amber-300/20 text-amber-200 bg-amber-300/[.05]' },
  REENTRY_CANDIDATE: { label: 'Re-entry candidate', tone: 'border-emerald-300/20 text-emerald-200 bg-emerald-300/[.05]' },
  INSUFFICIENT_DATA: { label: 'Insufficient data', tone: 'border-rose-300/20 text-rose-200 bg-rose-300/[.05]' },
};
const numberOrNull = (value: unknown) => Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null;
const money = (value: number | null | undefined) => value == null ? '—' : '$' + value.toLocaleString('en-US', { maximumFractionDigits: 2 });
export default function ReentryIntelligence() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState<Item>({ symbol: 'MSFT', salePrice: null, saleDate: new Date().toISOString().slice(0,10), targetPrice: 0, thesis: '', thesisInvalidated: false, active: true });
  const [editing, setEditing] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await authFetch('/api/reentry-alerts?refresh=true', { cache: 'no-store' });
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
    setSaving(true); setError(''); setMessage('');
    try {
      const response = await authFetch('/api/reentry-alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, symbol }), cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not save re-entry watch.');
      setDraft({ symbol: 'MSFT', salePrice: null, saleDate: new Date().toISOString().slice(0,10), targetPrice: 0, thesis: '', thesisInvalidated: false, active: true });
      setEditing(null); setMessage(symbol + ' saved. Server-side Telegram monitoring will evaluate it on the next scheduled scan.');
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save re-entry watch.'); }
    finally { setSaving(false); }
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
      <div><div className="flex items-center gap-2 text-cyan-100"><Activity className="w-4 h-4" /><h2 className="text-sm font-black">Re-entry Intelligence</h2></div><p className="mt-1 max-w-3xl text-[10px] leading-relaxed text-white/45">Track stocks you sold but still believe in. Telegram checks run server-side, even when this dashboard is closed. A price target is not a valuation estimate.</p></div>
      <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-bold uppercase text-white/65 disabled:opacity-50"><RefreshCw className={'w-3 h-3 ' + (loading ? 'animate-spin' : '')}/> Refresh</button>
    </div>
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
      <label className="text-[9px] uppercase tracking-wide text-white/40">Ticker<input value={draft.symbol} onChange={e=>setDraft(v=>({...v,symbol:e.target.value.toUpperCase()}))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none focus:border-cyan-300/40" placeholder="MSFT"/></label>
      <label className="text-[9px] uppercase tracking-wide text-white/40">Target entry price (USD)<input type="number" min="0.01" step="0.01" value={draft.targetPrice || ''} onChange={e=>setDraft(v=>({...v,targetPrice:Number(e.target.value)}))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none focus:border-cyan-300/40" placeholder="Your price, not a forecast"/></label>
      <label className="text-[9px] uppercase tracking-wide text-white/40">Sale price (optional)<input type="number" min="0" step="0.01" value={draft.salePrice ?? ''} onChange={e=>setDraft(v=>({...v,salePrice:numberOrNull(e.target.value)}))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none focus:border-cyan-300/40" placeholder="Last sale price"/></label>
      <label className="text-[9px] uppercase tracking-wide text-white/40">Sale date<input type="date" value={draft.saleDate || ''} onChange={e=>setDraft(v=>({...v,saleDate:e.target.value || null}))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none focus:border-cyan-300/40"/></label>
      <label className="md:col-span-2 text-[9px] uppercase tracking-wide text-white/40">Why you still believe in the company<textarea value={draft.thesis} onChange={e=>setDraft(v=>({...v,thesis:e.target.value}))} rows={2} maxLength={1200} className="mt-1 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none focus:border-cyan-300/40" placeholder="Long-term thesis; what must remain true?"/></label>
      <label className="md:col-span-2 flex items-start gap-2 text-[10px] text-white/55"><input type="checkbox" checked={draft.thesisInvalidated} onChange={e=>setDraft(v=>({...v,thesisInvalidated:e.target.checked}))} className="mt-0.5"/> Thesis invalidated — suppress re-entry candidate alerts until reviewed.</label>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" disabled={saving} onClick={()=>void save()} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-200 px-3 py-2 text-[9px] font-black uppercase text-slate-950 disabled:opacity-50"><Save className="w-3 h-3"/>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add to re-entry watchlist'}</button>{editing && <button type="button" onClick={()=>{setEditing(null);setDraft({symbol:'MSFT',salePrice:null,saleDate:new Date().toISOString().slice(0,10),targetPrice:0,thesis:'',thesisInvalidated:false,active:true});}} className="rounded-lg border border-white/10 px-3 py-2 text-[9px] text-white/55">Cancel edit</button>}<span className="inline-flex items-center gap-1 text-[9px] text-white/30"><BellRing className="w-3 h-3"/> Telegram alerts on candidate transition</span></div>
    {error && <p role="alert" className="mt-3 rounded-lg border border-rose-300/20 bg-rose-300/[.05] p-3 text-[10px] text-rose-200">{error}</p>}
    {message && <p role="status" className="mt-3 rounded-lg border border-emerald-300/20 bg-emerald-300/[.05] p-3 text-[10px] text-emerald-200">{message}</p>}
    <div className="mt-4 space-y-2">
      {items.map(item => { const status = item.status || 'INSUFFICIENT_DATA'; const meta = STATUS[status]; return <div key={item.symbol} className="rounded-xl border border-white/10 bg-black/15 p-3">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-black text-white">{item.symbol}</span><span className={'rounded border px-2 py-1 text-[8px] font-bold uppercase '+meta.tone}>{meta.label}</span>{item.thesisInvalidated && <span className="text-[8px] uppercase text-rose-200">Thesis invalidated</span>}</div><p className="mt-1 text-[10px] text-white/45">Price {money(item.lastPrice)} · Your target {money(item.targetPrice)} · 20-day avg {money(item.sma20)} · 50-day avg {money(item.sma50)}</p><p className="mt-1 text-[9px] text-white/30">52-week high drawdown: {item.drawdownFrom52WeekHighPct == null ? 'unavailable' : item.drawdownFrom52WeekHighPct.toFixed(1)+'%'} · {item.retrievedAt ? 'Updated '+new Date(item.retrievedAt).toLocaleString() : 'Waiting for market data'}</p></div><div className="flex gap-1"><button type="button" onClick={()=>edit(item)} className="rounded border border-white/10 px-2 py-1 text-[8px] uppercase text-white/55">Edit</button><button type="button" aria-label={'Remove '+item.symbol} onClick={()=>void remove(item.symbol)} className="rounded border border-white/10 p-1.5 text-white/40 hover:text-rose-200"><Trash2 className="w-3 h-3"/></button></div></div>
        <ul className="mt-2 space-y-1 text-[9px] text-white/50">{(item.reasons || ['Refresh for current price and trend context.']).map((reason,i)=><li key={i}>• {reason}</li>)}</ul>
      </div>; })}
      {!loading && !items.length && <p className="rounded-lg border border-white/10 p-4 text-center text-[10px] text-white/35">No sold stocks tracked yet. Start with MSFT or NOW and set your own entry target.</p>}
      {loading && <p className="py-3 text-center text-[10px] text-white/35">Loading re-entry watchlist…</p>}
    </div>
    <p className="mt-3 text-[9px] leading-relaxed text-white/25">A candidate means your price target and trend rules align; it does not prove fair value or confirm current fundamentals. Verify earnings, valuation, news, thesis and portfolio risk before acting. No orders are placed.</p>
  </section>;
}
