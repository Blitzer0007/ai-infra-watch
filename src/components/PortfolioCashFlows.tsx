import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { addPortfolioCashFlow, deletePortfolioCashFlow, fetchPortfolioCashFlows, type PortfolioCashFlow, type PortfolioTransaction, type StoredPortfolioHolding } from '../utils/portfolioApi';
import { calculateAccountCashFlowPerformance } from '../utils/portfolioCashFlowAccounting';

type Props = { holdings: StoredPortfolioHolding[]; transactions: PortfolioTransaction[]; livePrices: Record<string, { price: number; stale?: boolean; cached?: boolean }> };
const emptyForm = { eventDate: new Date().toISOString().slice(0, 10), flowType: 'deposit' as PortfolioCashFlow['flowType'], amount: '', currency: 'USD', fxToUsd: '1', notes: '' };
const formatUsd = (value: number | null) => value == null || !Number.isFinite(value) ? '—' : (value < 0 ? '-$' : '$') + Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PortfolioCashFlows({ holdings, transactions, livePrices }: Props) {
  const [cashFlows, setCashFlows] = useState<PortfolioCashFlow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try { setCashFlows(await fetchPortfolioCashFlows()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load cash-flow records. Apply the portfolio cash-flow database migration, then retry.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const performance = useMemo(() => {
    const mapped = holdings.map(holding => {
      const quote = livePrices[holding.symbol.toUpperCase()];
      return { symbol: holding.symbol, quantity: holding.quantity, currentPrice: quote && !quote.stale && !quote.cached && Number(quote.price) > 0 ? Number(quote.price) : null };
    });
    return calculateAccountCashFlowPerformance(mapped, transactions.map(row => ({
      symbol: row.symbol, transactionType: row.transactionType, quantity: row.quantity, amount: row.amount, brokerage: row.brokerage, currency: row.currency || 'USD',
    })), cashFlows.map(row => ({ flowType: row.flowType, amount: row.amount, currency: row.currency, fxToUsd: row.fxToUsd })),
    mapped.every(row => Number(row.currentPrice) > 0));
  }, [holdings, transactions, cashFlows, livePrices]);

  const save = async () => {
    const amount = Number(form.amount), fxToUsd = form.currency === 'USD' ? 1 : Number(form.fxToUsd);
    if (!form.eventDate || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(fxToUsd) || fxToUsd <= 0) { setError('Enter a valid date, positive amount and positive USD conversion rate.'); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      const saved = await addPortfolioCashFlow({ eventDate: form.eventDate, flowType: form.flowType, amount, currency: form.currency, fxToUsd, notes: form.notes.trim() });
      setCashFlows(previous => [...previous, saved].sort((a, b) => a.eventDate.localeCompare(b.eventDate) || (a.createdAt || '').localeCompare(b.createdAt || '')));
      setForm({ ...emptyForm, eventDate: new Date().toISOString().slice(0, 10) }); setSuccess('Cash-flow entry saved.');
      window.dispatchEvent(new Event('portfolio-cash-flows-changed'));
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save cash flow.'); }
    finally { setSaving(false); }
  };
  const remove = async (row: PortfolioCashFlow) => {
    setRemovingId(row.id); setError(''); setSuccess('');
    try { await deletePortfolioCashFlow(row.id); setCashFlows(previous => previous.filter(item => item.id !== row.id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete cash flow.'); }
    finally { setRemovingId(null); }
  };
  const labels: Record<string, string> = {
    complete: 'Calculated from reconciled records', 'quotes-incomplete': 'Waiting for fresh quotes',
    'quantity-mismatch': 'Trade history does not match holdings', 'mixed-trade-currency': 'Non-USD trade history needs FX support',
    'external-flows-missing': 'Opening deposit / external flows missing', 'invalid-records': 'Review transaction records',
  };

  return <section className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[.025] p-4 mt-3" data-testid="portfolio-cash-flows">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="text-[9px] font-mono uppercase tracking-[.2em] text-cyan-300">Account cash flows</div><h3 className="text-sm font-black mt-1">Deposits, withdrawals, dividends, rewards and fees</h3>
        <p className="text-[10px] text-white/40 mt-1">Record your opening deposit and later cash movements. FX is stored per event date so currencies are not silently mixed with USD.</p></div>
      <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-white/10 px-3 py-2 text-[9px] font-mono uppercase text-white/55 disabled:opacity-40">{loading ? 'Loading…' : 'Refresh records'}</button>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2 mt-4">
      <Metric label="Holdings value" value={formatUsd(performance.holdingsValueUsd)} />
      <Metric label="Cash balance" value={formatUsd(performance.cashBalanceUsd)} />
      <Metric label="Account value" value={formatUsd(performance.accountValueUsd)} />
      <Metric label="Net contributions" value={formatUsd(performance.netContributionsUsd)} />
      <Metric label="Rewards received" value={formatUsd(performance.rewardsUsd)} />
      <Metric label="Total account P&L" value={formatUsd(performance.totalPnlUsd)} />
      <Metric label="P&L / contributions" value={performance.pnlOnNetContributionsPct == null ? '—' : (performance.pnlOnNetContributionsPct >= 0 ? '+' : '') + performance.pnlOnNetContributionsPct.toFixed(2) + '%'} />
    </div>
    <div className={'mt-3 rounded-lg border px-3 py-2 text-[10px] ' + (performance.status === 'complete' ? 'border-emerald-400/15 bg-emerald-400/[.03] text-emerald-200/70' : 'border-amber-400/15 bg-amber-400/[.03] text-amber-200/80')}>
      <div className="font-bold">{labels[performance.status] || 'Accounting status unavailable'}</div><div className="mt-1">{performance.note}</div>
      <div className="mt-1 text-white/40">The percentage shown is P&amp;L divided by net contributions, not time-weighted return. Record all cash movements from the account’s opening date for a meaningful result.</div>
    </div>
    <div className="mt-4 rounded-xl border border-white/5 bg-black/10 p-3">
      <div className="text-[9px] font-mono uppercase tracking-widest text-white/40">Add cash movement</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 mt-3">
        <Field label="Date" value={form.eventDate} type="date" onChange={v => setForm({ ...form, eventDate: v })} />
        <label className="text-[9px] font-mono text-white/35">Type<select value={form.flowType} onChange={e => setForm({ ...form, flowType: e.target.value as PortfolioCashFlow['flowType'] })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1115] px-3 py-2 text-xs text-white"><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option><option value="dividend">Dividend</option><option value="reward">Reward credit</option><option value="fee">Fee</option></select></label>
        <Field label="Amount" value={form.amount} type="number" onChange={v => setForm({ ...form, amount: v })} placeholder="100.00" />
        <label className="text-[9px] font-mono text-white/35">Currency<select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value, fxToUsd: e.target.value === 'USD' ? '1' : form.fxToUsd === '1' ? '0.012' : form.fxToUsd })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0F1115] px-3 py-2 text-xs text-white"><option value="USD">USD</option><option value="INR">INR</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="CAD">CAD</option></select></label>
        <Field label="USD per currency unit" value={form.currency === 'USD' ? '1' : form.fxToUsd} type="number" onChange={v => setForm({ ...form, fxToUsd: v })} placeholder="0.012" />
        <Field label="Notes" value={form.notes} onChange={v => setForm({ ...form, notes: v })} placeholder="Broker / source" />
      </div>
      <div className="mt-3 flex items-center gap-2"><button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-[10px] font-mono uppercase text-cyan-200 disabled:opacity-40"><Plus className="w-3 h-3" />{saving ? 'Saving…' : 'Save cash flow'}</button><span className="text-[9px] text-white/30">FX must be the historical USD value of 1 unit of the selected currency.</span></div>
    </div>
    {(error || success) && <div role="status" className={'mt-3 text-[10px] ' + (error ? 'text-rose-300' : 'text-emerald-200')}>{error || success}</div>}
    <div className="mt-4"><div className="text-[9px] font-mono uppercase tracking-widest text-white/40 mb-2">Recorded cash movements ({cashFlows.length})</div>
      {!cashFlows.length && !loading && <div className="text-[10px] text-white/30">No cash flows recorded yet. Add the opening deposit first.</div>}
      <div className="space-y-1.5">{cashFlows.map(row => <div key={row.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-white/5 px-3 py-2">
        <div><div className="text-[10px] font-bold uppercase">{row.flowType} · {row.eventDate}</div><div className="text-[9px] text-white/40 mt-0.5">{row.currency} {row.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} · FX {row.fxToUsd.toFixed(6)} USD/unit{row.notes ? ' · ' + row.notes : ''}</div></div>
        <button type="button" aria-label={'Delete cash flow on ' + row.eventDate} disabled={removingId === row.id} onClick={() => void remove(row)} className="p-1.5 rounded border border-white/10 text-rose-300/60 hover:text-rose-300 disabled:opacity-40"><Trash2 className="w-3 h-3" /></button>
      </div>)}</div>
    </div>
  </section>;
}
function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-white/5 bg-black/10 px-3 py-2"><div className="text-[8px] font-mono uppercase tracking-widest text-white/30">{label}</div><div className="text-[11px] font-mono font-bold text-white/75 mt-1">{value}</div></div>;
}
function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <label className="text-[9px] font-mono text-white/35">{label}<input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="mt-1 w-full rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-xs text-white outline-none focus:border-cyan-400/30" /></label>;
}
