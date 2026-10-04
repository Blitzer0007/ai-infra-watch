import { useState } from 'react';
import { ChevronDown, Pencil, Plus, Save, Trash2, X, ShieldAlert } from 'lucide-react';
import {
  addPortfolioPurchase,
  createPortfolioHolding,
  deletePortfolioHolding,
  fetchPortfolioPurchaseLots,
  updatePortfolioHolding,
  type PortfolioPurchaseLot,
  type StoredPortfolioHolding,
} from '../utils/portfolioApi';

type Props = { holdings: StoredPortfolioHolding[]; onChanged: (holdings: StoredPortfolioHolding[]) => void };
const emptyForm = { symbol: '', quantity: '', averageCost: '', purchaseDate: '', notes: '' };
const emptyPurchase = { investedAmount: '', executionPrice: '', purchaseDate: '', notes: '' };

export default function PortfolioManager({ holdings, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StoredPortfolioHolding | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lots, setLots] = useState<PortfolioPurchaseLot[]>([]);
  const [purchaseOpen, setPurchaseOpen] = useState<string | null>(null);
  const [purchaseForm, setPurchaseForm] = useState(emptyPurchase);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');
  const [lotChecks, setLotChecks] = useState<Record<string, { status: 'ok' | 'warn' | 'missing'; message: string }>>({});

  const edit = (h: StoredPortfolioHolding) => {
    setEditing(h);
    setForm({ symbol:h.symbol, quantity:String(h.quantity), averageCost:String(h.averageCost), purchaseDate:h.purchaseDate || '', notes:h.notes || '' });
    setError(''); setOpen(true);
  };
  const add = () => { setEditing(null); setForm(emptyForm); setError(''); setOpen(true); };

  const showHistory = async (h: StoredPortfolioHolding) => {
    if (expandedId === h.id) { setExpandedId(null); return; }
    setExpandedId(h.id);
    setPurchaseError('');
    try {
      const loadedLots = await fetchPortfolioPurchaseLots(h.id);
      setLots(loadedLots);
      try {
        const response = await fetch('/api/company-scale?action=history&symbol=' + encodeURIComponent(h.symbol) + '&range=1y', { cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        const points = Array.isArray(body?.points) ? body.points : [];
        const checks: Record<string, { status: 'ok' | 'warn' | 'missing'; message: string }> = {};
        for (const lot of loadedLots) {
          if (!lot.purchaseDate) {
            checks[lot.id] = { status: 'warn', message: 'Purchase date missing.' };
            continue;
          }
          const weekday = new Date(lot.purchaseDate + 'T00:00:00Z').getUTCDay();
          if (weekday === 0 || weekday === 6) {
            checks[lot.id] = { status: 'warn', message: 'Purchase date falls on a weekend; verify the broker execution date.' };
            continue;
          }
          const close = points.find((point: any) => point.date === lot.purchaseDate)?.price;
          if (!(Number(close) > 0)) {
            checks[lot.id] = { status: 'missing', message: 'No market close found for this purchase date.' };
            continue;
          }
          const deviation = Math.abs(Number(lot.executionPrice) / Number(close) - 1) * 100;
          checks[lot.id] = deviation > 20
            ? { status: 'warn', message: 'Execution price is ' + deviation.toFixed(1) + '% from that day\'s close; verify price, currency or split handling.' }
            : { status: 'ok', message: 'Execution price is within 20% of that day\'s close.' };
        }
        setLotChecks(checks);
      } catch {
        setLotChecks({});
      }
    } catch (e) {
      setPurchaseError(e instanceof Error ? e.message : 'Unable to load purchase history.');
    }
  };

  const startPurchase = (h: StoredPortfolioHolding) => {
    setPurchaseOpen(h.id);
    setPurchaseForm({ ...emptyPurchase, purchaseDate: new Date().toISOString().slice(0, 10) });
    setPurchaseError('');
  };

  const savePurchase = async (h: StoredPortfolioHolding) => {
    const investedAmount = Number(purchaseForm.investedAmount);
    const executionPrice = Number(purchaseForm.executionPrice);
    if (!Number.isFinite(investedAmount) || investedAmount <= 0 || !Number.isFinite(executionPrice) || executionPrice <= 0) {
      setPurchaseError('Enter a positive investment amount and execution price.');
      return;
    }
    setPurchaseBusy(true); setPurchaseError('');
    try {
      const saved = await addPortfolioPurchase({
        holdingId: h.id,
        investedAmount,
        executionPrice,
        purchaseDate: purchaseForm.purchaseDate || null,
        notes: purchaseForm.notes.trim(),
      });
      const updatedHolding = {
        ...saved.holding,
        purchaseLots: [...(h.purchaseLots || []), saved.lot],
      };
      onChanged(holdings.map(x => x.id === saved.holding.id ? updatedHolding : x));
      setLots(prev => [...prev, saved.lot].sort((a, b) => (a.purchaseDate || '').localeCompare(b.purchaseDate || '') || (a.createdAt || '').localeCompare(b.createdAt || '')));
      setPurchaseOpen(null);
      window.dispatchEvent(new Event('portfolio-holdings-changed'));
    } catch(e) {
      setPurchaseError(e instanceof Error ? e.message : 'Unable to save purchase.');
    } finally {
      setPurchaseBusy(false);
    }
  };

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
    try { await deletePortfolioHolding(h.id); onChanged(holdings.filter(x=>x.id!==h.id)); if (expandedId === h.id) setExpandedId(null); window.dispatchEvent(new Event('portfolio-holdings-changed')); }
    catch(e) { setError(e instanceof Error?e.message:'Unable to remove holding.'); }
    finally { setBusy(false); }
  };

  return <section className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[.025] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-[9px] font-mono uppercase tracking-[.2em] text-emerald-300">Persistent portfolio</div>
        <div className="text-sm font-black mt-1">Your holdings are stored in Supabase, not cache.</div>
        <div className="text-[10px] text-white/35 mt-1">Aggregate position + immutable purchase-lot history.</div>
      </div>
      <button type="button" data-testid="portfolio-add-holding" onClick={add} className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[10px] font-mono uppercase text-emerald-300"><Plus className="w-3.5 h-3.5"/> Add holding</button>
    </div>

    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
      {holdings.map(h=><div key={h.id} className="rounded-xl border border-white/5 bg-black/10 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-black">{h.symbol}</div>
            <div className="text-[9px] font-mono text-white/30 mt-1">Qty {h.quantity} · Avg ${h.averageCost.toFixed(2)}</div>
            <div className="text-[9px] text-white/25 mt-1">{h.purchaseDate?'First purchase '+h.purchaseDate:'Purchase date not set'}</div>
          </div>
          <div className="flex gap-1">
            <button type="button" aria-label={"Add purchase to " + h.symbol} title="Add purchase" onClick={()=>startPurchase(h)} className="p-1.5 rounded border border-emerald-400/15 text-emerald-300/70 hover:text-emerald-300"><Plus className="w-3 h-3"/></button>
            <button type="button" aria-label={"Purchase history for " + h.symbol} title="Purchase history" onClick={()=>showHistory(h)} className="p-1.5 rounded border border-white/10 text-white/45 hover:text-white"><ChevronDown className={'w-3 h-3 transition-transform '+(expandedId===h.id?'rotate-180':'')}/></button>
            <button type="button" aria-label={"Edit " + h.symbol} onClick={()=>edit(h)} className="p-1.5 rounded border border-white/10 text-white/45 hover:text-white"><Pencil className="w-3 h-3"/></button>
            <button type="button" aria-label={"Delete " + h.symbol} onClick={()=>remove(h)} disabled={busy} className="p-1.5 rounded border border-white/10 text-rose-300/60 hover:text-rose-300"><Trash2 className="w-3 h-3"/></button>
          </div>
        </div>

        {purchaseOpen === h.id && <div className="mt-3 rounded-lg border border-emerald-400/15 bg-emerald-400/[.03] p-3">
          <div className="text-[9px] font-mono uppercase tracking-widest text-emerald-300">Add purchase to {h.symbol}</div>
          <div className="text-[9px] text-white/30 mt-1">This creates a new purchase record and recalculates the weighted average. It does not overwrite prior purchases.</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-3">
            <Field testId={'portfolio-purchase-amount-'+h.symbol} label="Investment amount" value={purchaseForm.investedAmount} onChange={v=>setPurchaseForm({...purchaseForm,investedAmount:v})} placeholder="5.00" type="number"/>
            <Field testId={'portfolio-purchase-price-'+h.symbol} label="Execution price" value={purchaseForm.executionPrice} onChange={v=>setPurchaseForm({...purchaseForm,executionPrice:v})} placeholder="725.93" type="number"/>
            <Field testId={'portfolio-purchase-date-'+h.symbol} label="Purchase date" value={purchaseForm.purchaseDate} onChange={v=>setPurchaseForm({...purchaseForm,purchaseDate:v})} type="date"/>
            <Field testId={'portfolio-purchase-notes-'+h.symbol} label="Notes" value={purchaseForm.notes} onChange={v=>setPurchaseForm({...purchaseForm,notes:v})} placeholder="Why I added"/>
          </div>
          {purchaseError && <div className="mt-2 text-[10px] text-rose-300">{purchaseError}</div>}
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={purchaseBusy} onClick={()=>savePurchase(h)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[10px] font-mono uppercase text-emerald-300"><Save className="w-3 h-3"/> {purchaseBusy?'Saving…':'Add purchase'}</button>
            <button type="button" onClick={()=>setPurchaseOpen(null)} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-mono uppercase text-white/45">Cancel</button>
          </div>
        </div>}

        {expandedId === h.id && <div className="mt-3 rounded-lg border border-white/5 bg-white/[.015] p-3">
          <div className="text-[9px] font-mono uppercase tracking-widest text-white/35">Purchase history</div>
          {purchaseError && purchaseOpen !== h.id && <div className="mt-2 text-[10px] text-rose-300">{purchaseError}</div>}
          {!purchaseError && !lots.length && <div className="mt-2 text-[10px] text-white/30">No purchase lots recorded.</div>}
          <div className="mt-2 space-y-1.5">
            {lots.map((lot, index)=><div key={lot.id} className="grid grid-cols-[auto_1fr_auto] gap-2 items-center rounded-lg border border-white/5 px-2 py-2">
              <div className="text-[9px] font-mono text-white/35">#{index+1}</div>
              <div>
                <div className="text-[10px] font-bold">{lot.purchaseDate || 'Date not set'} · ${lot.investedAmount.toFixed(2)} invested</div>
                <div className="text-[9px] text-white/30 mt-0.5">{lot.quantity.toFixed(8)} shares @ ${lot.executionPrice.toFixed(2)}{lot.notes ? ' · '+lot.notes : ''}</div>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-mono text-emerald-300/70">{((lot.quantity * lot.executionPrice)).toFixed(2)} basis</div>
                {lotChecks[lot.id] && <div className={'mt-1 inline-flex items-center gap-1 text-[8px] font-mono ' + (lotChecks[lot.id].status === 'warn' ? 'text-amber-200' : lotChecks[lot.id].status === 'missing' ? 'text-white/30' : 'text-emerald-200')} title={lotChecks[lot.id].message}>
                  {lotChecks[lot.id].status !== 'ok' && <ShieldAlert className="w-3 h-3" />}
                  {lotChecks[lot.id].status === 'ok' ? 'SANITY OK' : lotChecks[lot.id].status === 'warn' ? 'VERIFY LOT' : 'NO MARKET DATE'}
                </div>}
              </div>
            </div>)}
          </div>
        </div>}
      </div>)}
      {!holdings.length && <div className="text-[10px] font-mono text-white/30">No persistent holdings yet. Add your first position.</div>}
    </div>

    {open && <div className="mt-4 rounded-xl border border-white/10 bg-[#0F1115] p-4">
      <div className="flex items-center justify-between"><div className="text-xs font-bold">{editing?'Edit holding':'Add holding'}</div><button type="button" aria-label="Close holding editor" onClick={()=>setOpen(false)} className="text-white/45 hover:text-white"><X className="w-4 h-4"/></button></div>
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
