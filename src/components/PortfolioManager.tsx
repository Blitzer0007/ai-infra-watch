import { useState } from 'react';
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { createPortfolioHolding, deletePortfolioHolding, updatePortfolioHolding, type StoredPortfolioHolding } from '../utils/portfolioApi';

type Props = { holdings: StoredPortfolioHolding[]; onChanged: (holdings: StoredPortfolioHolding[]) => void };
const emptyForm = { symbol: '', quantity: '', averageCost: '', purchaseDate: '', notes: '' };

export default function PortfolioManager({ holdings, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StoredPortfolioHolding | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const edit = (h: StoredPortfolioHolding) => {
    setEditing(h);
    setForm({ symbol:h.symbol, quantity:String(h.quantity), averageCost:String(h.averageCost), purchaseDate:h.purchaseDate || '', notes:h.notes || '' });
    setError(''); setOpen(true);
  };
  const add = () => { setEditing(null); setForm(emptyForm); setError(''); setOpen(true); };

  const save = async () => {
    const quantity=Number(form.quantity), averageCost=Number(form.averageCost);
    if (!form.symbol.trim() || !Number.isFinite(quantity) || quantity<=0 || !Number.isFinite(averageCost) || averageCost<0) {
      setError('Enter a ticker, positive quantity and valid average buy price.'); return;
    }
    setBusy(true); setError('');
    try {
      if (editing) {
        const saved=await updatePortfolioHolding({...editing,symbol:form.symbol.trim().toUpperCase(),quantity,averageCost,purchaseDate:form.purchaseDate||null,notes:form.notes.trim()});
        onChanged(holdings.map(x=>x.id===saved.id?saved:x));
        window.dispatchEvent(new Event('portfolio-holdings-changed'));
      } else {
        const saved=await createPortfolioHolding({symbol:form.symbol.trim().toUpperCase(),quantity,averageCost,purchaseDate:form.purchaseDate||null,notes:form.notes.trim()});
        onChanged([...holdings,saved].sort((a,b)=>a.symbol.localeCompare(b.symbol)));
        window.dispatchEvent(new Event('portfolio-holdings-changed'));
      }
      setOpen(false);
    } catch(e) { setError(e instanceof Error?e.message:'Unable to save holding.'); }
    finally { setBusy(false); }
  };

  const remove = async (h: StoredPortfolioHolding) => {
    if (!window.confirm('Remove '+h.symbol+' from your persistent portfolio?')) return;
    setBusy(true);
    try { await deletePortfolioHolding(h.id); onChanged(holdings.filter(x=>x.id!==h.id)); window.dispatchEvent(new Event('portfolio-holdings-changed')); }
    catch(e) { setError(e instanceof Error?e.message:'Unable to remove holding.'); }
    finally { setBusy(false); }
  };

  return <section className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[.025] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-[9px] font-mono uppercase tracking-[.2em] text-emerald-300">Persistent portfolio</div>
        <div className="text-sm font-black mt-1">Your holdings are stored in Supabase, not cache.</div>
        <div className="text-[10px] text-white/35 mt-1">Quantity · average buy price · purchase date · notes.</div>
      </div>
      <button type="button" data-testid="portfolio-add-holding" onClick={add} className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[10px] font-mono uppercase text-emerald-300"><Plus className="w-3.5 h-3.5"/> Add holding</button>
    </div>
    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
      {holdings.map(h=><div key={h.id} className="rounded-xl border border-white/5 bg-black/10 p-3">
        <div className="flex items-start justify-between gap-2">
          <div><div className="text-sm font-black">{h.symbol}</div><div className="text-[9px] font-mono text-white/30 mt-1">Qty {h.quantity} · Avg \${h.averageCost.toFixed(2)}</div><div className="text-[9px] text-white/25 mt-1">{h.purchaseDate?'Bought '+h.purchaseDate:'Purchase date not set'}</div></div>
          <div className="flex gap-1"><button type="button" onClick={()=>edit(h)} className="p-1.5 rounded border border-white/10 text-white/45 hover:text-white"><Pencil className="w-3 h-3"/></button><button type="button" onClick={()=>remove(h)} disabled={busy} className="p-1.5 rounded border border-white/10 text-rose-300/60 hover:text-rose-300"><Trash2 className="w-3 h-3"/></button></div>
        </div>
      </div>)}
      {!holdings.length && <div className="text-[10px] font-mono text-white/30">No persistent holdings yet. Add your first position.</div>}
    </div>
    {open && <div className="mt-4 rounded-xl border border-white/10 bg-[#0F1115] p-4">
      <div className="flex items-center justify-between"><div className="text-xs font-bold">{editing?'Edit holding':'Add holding'}</div><button type="button" onClick={()=>setOpen(false)} className="text-white/35 hover:text-white"><X className="w-4 h-4"/></button></div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2 mt-3">
        <Field testId="portfolio-field-ticker" label="Ticker" value={form.symbol} onChange={v=>setForm({...form,symbol:v})} placeholder="NVDA"/>
        <Field testId="portfolio-field-quantity" label="Quantity" value={form.quantity} onChange={v=>setForm({...form,quantity:v})} placeholder="10" type="number"/>
        <Field testId="portfolio-field-average-cost" label="Average buy price" value={form.averageCost} onChange={v=>setForm({...form,averageCost:v})} placeholder="100" type="number"/>
        <Field testId="portfolio-field-purchase-date" label="Purchase date" value={form.purchaseDate} onChange={v=>setForm({...form,purchaseDate:v})} type="date"/>
        <Field testId="portfolio-field-notes" label="Notes" value={form.notes} onChange={v=>setForm({...form,notes:v})} placeholder="Original thesis"/>
      </div>
      {error && <div className="mt-2 text-[10px] text-rose-300">{error}</div>}
      <div className="mt-3 flex gap-2"><button type="button" data-testid="portfolio-save-holding" disabled={busy} onClick={save} className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[10px] font-mono uppercase text-emerald-300"><Save className="w-3 h-3"/> {busy?'Saving…':'Save holding'}</button><button type="button" onClick={()=>setOpen(false)} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-mono uppercase text-white/45">Cancel</button></div>
    </div>}
  </section>;
}

function Field({testId,label,value,onChange,placeholder,type='text'}:{testId?:string;label:string;value:string;onChange:(v:string)=>void;placeholder?:string;type?:string}) {
  return <label className="text-[9px] font-mono text-white/35">{label}<input data-testid={testId} type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="mt-1 w-full rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-xs text-white outline-none focus:border-emerald-400/30"/></label>;
}
