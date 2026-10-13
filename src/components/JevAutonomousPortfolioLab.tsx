import { useMemo, useState } from 'react';
import { Activity, ShieldCheck, Clock3, CircleDollarSign, RefreshCw } from 'lucide-react';
import { buildPaperRebalance, PAPER_LAB_DEFAULTS, type PaperHolding } from '../utils/jevPortfolioLab';
import JevDecisionPanel from './JevDecisionPanel';
import { forecastValidationGate } from '../utils/forecastValidation';

const candidates = [
  { symbol: 'MSFT', sector: 'software', label: 'Microsoft' },
  { symbol: 'META', sector: 'internet', label: 'Meta Platforms' },
  { symbol: 'NOW', sector: 'software', label: 'ServiceNow' },
  { symbol: 'TEAM', sector: 'software', label: 'Atlassian' },
  { symbol: 'NVDA', sector: 'semiconductors', label: 'NVIDIA' },
  { symbol: 'GOOGL', sector: 'internet', label: 'Alphabet' },
  { symbol: 'SPY', sector: 'broad-market', label: 'S&P 500 ETF' },
  { symbol: 'QQQ', sector: 'growth-index', label: 'Nasdaq-100 ETF' },
];

export default function JevAutonomousPortfolioLab() {
  const [capital, setCapital] = useState(PAPER_LAB_DEFAULTS.initialCapital);
  const [costBps, setCostBps] = useState(PAPER_LAB_DEFAULTS.costBps);
  const [selected, setSelected] = useState<string[]>(['MSFT', 'META', 'NOW', 'NVDA']);
  const [review, setReview] = useState<string | null>(null);
  const [message, setMessage] = useState('No paper rebalance has been approved yet.');
  const target: PaperHolding[] = useMemo(() => selected.map(symbol => {
    const item = candidates.find(candidate => candidate.symbol === symbol)!;
    return { symbol, sector: item.sector, weight: Math.min(0.15, 0.6 / Math.max(selected.length, 1)) };
  }), [selected]);
  const preview = useMemo(() => {
    try {
      return buildPaperRebalance({
        current: [], target, portfolioValue: capital,
        decisionAt: new Date(Date.now() - 60_000).toISOString(),
        executionAt: new Date(Date.now() + 60_000).toISOString(),
        costBps, maxPositionWeight: 0.15, maxSectorWeight: 0.35, minCashWeight: 0.05,
      });
    } catch { return null; }
  }, [capital, costBps, target]);
  const approvePaperReview = () => {
    if (!preview) { setMessage('Target rejected by risk controls. Reduce weights or sector concentration.'); return; }
    const snapshot = {
      id: `paper-${Date.now()}`, createdAt: new Date().toISOString(),
      mode: 'paper', decisionSource: 'manual approval', capital, costBps,
      target, preview, benchmarkSymbols: ['SPY', 'QQQ'],
      jevEvidenceGate: 'not run — evidence-backed candidate ranking is not yet connected',
      note: 'This is a paper-trading proposal, not a live quote-backed recommendation.',
    };
    try {
      const key = 'aiw-jev-paper-portfolio-v1';
      const previous = JSON.parse(localStorage.getItem(key) || '[]');
      localStorage.setItem(key, JSON.stringify([snapshot, ...previous].slice(0, 100)));
      setReview(snapshot.createdAt);
      setMessage('Paper proposal saved locally. No real order was sent.');
      void fetch('/api/alert-notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: { type: 'catalyst', severity: 'info', symbol: 'JEV', title: 'Weekly paper portfolio proposal saved', message: `A manual paper review was saved with ${target.length} holdings, ${Math.round(preview.cashWeight * 100)}% cash, estimated costs ${preview.totalCost.toFixed(2)}, and SPY/QQQ benchmarks. Evidence-ranked recommendations are not yet connected. No live trade was placed.` } }) }).then(async response => { if (!response.ok) throw new Error('Telegram alert was not delivered'); setMessage('Paper proposal saved locally. Telegram alert sent. No real order was sent.'); }).catch(() => setMessage('Paper proposal saved locally; Telegram alert could not be confirmed. No real order was sent.'));
    } catch { setMessage('Could not save paper proposal in this browser.'); }
  };
  return <div className="space-y-6 text-white">
    <header className="rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-950/40 to-slate-900 p-6">
      <div className="flex items-center gap-2 text-emerald-300 text-xs font-mono uppercase tracking-widest"><Activity size={16}/> JEV Autonomous Portfolio Lab</div>
      <h1 className="mt-3 text-2xl font-semibold">Research first. Paper trade. Verify the edge.</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">Weekly US-stock research lab with SPY and QQQ benchmarks. This preview provides a risk-checked paper proposal workflow; evidence-backed JEV stock ranking and historical performance are not yet connected, so it deliberately does not claim a return or recommend a live trade.</p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-white/15 px-3 py-1">PAPER ONLY</span><span className="rounded-full border border-white/15 px-3 py-1">MANUAL APPROVAL</span><span className="rounded-full border border-white/15 px-3 py-1">NO BROKER ORDERS</span></div>
    </header>
    <section className="grid gap-3 md:grid-cols-3">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><Clock3 className="text-sky-300" size={20}/><p className="mt-3 text-xs text-white/50">Review cadence</p><p className="mt-1 font-semibold">Weekly</p><p className="text-xs text-white/40">Review timestamped evidence before proposing changes.</p></div>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><ShieldCheck className="text-emerald-300" size={20}/><p className="mt-3 text-xs text-white/50">Risk guardrails</p><p className="mt-1 font-semibold">15% position · 35% sector</p><p className="text-xs text-white/40">Minimum 5% cash; invalid proposals are blocked.</p></div>
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><CircleDollarSign className="text-amber-300" size={20}/><p className="mt-3 text-xs text-white/50">Estimated trading cost</p><p className="mt-1 font-semibold">{costBps} bps</p><p className="text-xs text-white/40">Deducted on traded notional, adjustable for sensitivity.</p></div>
    </section>
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
      <h2 className="text-lg font-semibold">Paper portfolio setup</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-white/70">Starting capital ($)
          <input className="mt-2 w-full rounded-lg border border-white/15 bg-black/20 p-2 text-white" type="number" min="100" step="100" value={capital} onChange={event => setCapital(Math.max(100, Number(event.target.value) || 100))}/>
        </label>
        <label className="text-sm text-white/70">Transaction cost (basis points)
          <input className="mt-2 w-full rounded-lg border border-white/15 bg-black/20 p-2 text-white" type="number" min="0" max="500" value={costBps} onChange={event => setCostBps(Math.max(0, Math.min(500, Number(event.target.value) || 0)))}/>
        </label>
      </div>
      <div><p className="mb-2 text-sm text-white/70">Candidate universe (illustrative setup, not a JEV-ranked list)</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{candidates.map(item => <label key={item.symbol} className="flex items-center gap-2 rounded-lg border border-white/10 p-3 text-sm"><input type="checkbox" checked={selected.includes(item.symbol)} onChange={event => setSelected(old => event.target.checked ? [...old, item.symbol] : old.filter(symbol => symbol !== item.symbol))}/><span>{item.symbol}</span><span className="ml-auto text-xs text-white/40">{item.sector}</span></label>)}</div></div>
      <div className="rounded-lg bg-black/20 p-4 text-sm"><p>Target allocation: {target.reduce((sum, item) => sum + item.weight, 0).toLocaleString(undefined, { style: 'percent', maximumFractionDigits: 1 })}</p><p>Cash reserve: {preview ? (preview.cashWeight * 100).toFixed(1) + '%' : 'Risk controls blocked this allocation'}</p><p>Estimated transaction costs: {preview ? '$' + preview.totalCost.toFixed(2) : 'Unavailable'}</p><p className="mt-2 text-xs text-white/40">Current stage: manual paper proposal. Returns are not shown until timestamped market history and benchmark histories are wired in.</p></div>
      <button onClick={approvePaperReview} disabled={!preview || selected.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"><RefreshCw size={16}/> Save approved paper proposal</button>
      <p role="status" className="text-sm text-white/60">{message}{review ? ' Last saved: ' + new Date(review).toLocaleString() : ''}</p>
    </section>
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
      <h2 className="text-lg font-semibold">JEV review & forecast-validation guard</h2>
      <p className="text-sm text-white/55">JEV can assess the portfolio context through the existing authenticated assessment endpoint. This is not yet a stock-discovery ranking: insufficient or missing evidence must remain insufficient.</p>
      <JevDecisionPanel kind="portfolio" title="JEV portfolio assessment" subtitle="Reviews the proposed paper allocation and its supplied context; it does not change weights or place orders." state={{
        mode: 'paper', reviewFrequency: 'weekly', universe: 'US equities', benchmarks: ['SPY', 'QQQ'],
        targetHoldings: target, capital, transactionCostBps: costBps,
        riskLimits: { maxPositionWeight: 0.15, maxSectorWeight: 0.35, minCashWeight: 0.05 },
        evidenceQualityInput: { required: ['market data', 'peer comparison', 'fundamental evidence', 'valuation'], observed: [], stale: [], missing: ['evidence-backed candidate ranking not connected'], conflictCount: 0 },
      }} />
      <div className="rounded-lg border border-white/10 p-3 text-sm">
        <p className="font-medium">Forecast validation threshold</p>
        <p className="mt-1 text-white/60">Existing forecast-verification gate: {forecastValidationGate(0).minimumRequired} verified forecasts before the sample is considered ready. This lab has not yet recorded a verified sample.</p>
      </div>
    </section>
  </div>;
}
