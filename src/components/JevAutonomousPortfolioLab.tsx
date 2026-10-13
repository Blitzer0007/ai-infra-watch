import { useEffect, useMemo, useState } from 'react';
import { Activity, ShieldCheck, Clock3, CircleDollarSign, RefreshCw } from 'lucide-react';
import { buildPaperRebalance, PAPER_LAB_DEFAULTS, runHistoricalPaperBacktest, type HistoricalBacktestResult, type HistoricalPrice, type PaperHolding } from '../utils/jevPortfolioLab';
import { authFetch } from '../utils/apiAuth';
import JevDecisionPanel from './JevDecisionPanel';
import { forecastValidationGate } from '../utils/forecastValidation';

const candidates = [
  { symbol: 'MSFT', sector: 'software', label: 'Microsoft' },
  { symbol: 'META', sector: 'internet', label: 'Meta Platforms' },
  { symbol: 'NOW', sector: 'software', label: 'ServiceNow' },
  { symbol: 'TEAM', sector: 'software', label: 'Atlassian' },
  { symbol: 'NVDA', sector: 'semiconductors', label: 'NVIDIA' },
  { symbol: 'GOOGL', sector: 'internet', label: 'Alphabet' },
];

export default function JevAutonomousPortfolioLab() {
  const [capital, setCapital] = useState(PAPER_LAB_DEFAULTS.initialCapital);
  const [costBps, setCostBps] = useState(PAPER_LAB_DEFAULTS.costBps);
  const [selected, setSelected] = useState<string[]>(['MSFT', 'META', 'NOW', 'NVDA']);
  const [review, setReview] = useState<string | null>(null);
  const [message, setMessage] = useState('No paper rebalance has been approved yet.');
  const [historyCoverage, setHistoryCoverage] = useState<any>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [backtest, setBacktest] = useState<HistoricalBacktestResult | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestError, setBacktestError] = useState('');
  const [candidateResearch, setCandidateResearch] = useState<any>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState('');
  const [savedProposals, setSavedProposals] = useState<any[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState('');
  const selectedKey = selected.join(',');

  const loadHistoryCoverage = async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const symbols = [...new Set([...selected, 'SPY', 'QQQ'])];
      const response = await fetch('/api/jev-lab-history?range=2y&symbols=' + encodeURIComponent(symbols.join(',')));
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(body.results)) throw new Error(body.error || 'Could not load historical data coverage.');
      setHistoryCoverage(body);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Could not load historical data coverage.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadSavedProposals = async () => {
    setLedgerLoading(true);
    setLedgerError('');
    try {
      const response = await authFetch('/api/jev-lab?limit=10', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.ok !== true || !Array.isArray(body.proposals)) {
        throw new Error(body.error || 'Server-side paper ledger is unavailable.');
      }
      setSavedProposals(body.proposals);
    } catch (error) {
      setLedgerError(error instanceof Error ? error.message : 'Server-side paper ledger is unavailable.');
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    void loadHistoryCoverage();
    setBacktest(null);
    setBacktestError('');
    setCandidateResearch(null);
    setResearchError('');
  }, [selectedKey]);

  useEffect(() => {
    void loadSavedProposals();
  }, []);

  const runHistoricalBacktest = async () => {
    setBacktestLoading(true);
    setBacktestError('');
    setBacktest(null);
    try {
      const symbols = [...new Set([...selected, 'SPY', 'QQQ'])];
      const response = await authFetch('/api/jev-lab-history?range=2y&includePrices=true&symbols=' + encodeURIComponent(symbols.join(',')));
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.backtestReady !== true || !Array.isArray(body.prices) || !body.prices.length) {
        const reasons = (body.results || []).filter((item: any) => !item.adjusted || item.stale).map((item: any) => item.symbol + ': ' + (item.error || (item.stale ? 'stale history' : 'adjusted closes unavailable')));
        throw new Error(reasons.length ? reasons.join(' · ') : body.alignmentError || 'Adjusted, aligned history is not available for every holding and benchmark.');
      }
      const result = runHistoricalPaperBacktest({
        prices: body.prices as HistoricalPrice[],
        target,
        startCapital: capital,
        costBps,
        minimumObservations: 50,
        rebalanceEverySessions: 5,
        maxPositionWeight: 0.15,
        maxSectorWeight: 0.35,
        minCashWeight: 0.05,
      });
      setBacktest(result);
    } catch (error) {
      setBacktestError(error instanceof Error ? error.message : 'Historical backtest could not be completed.');
    } finally {
      setBacktestLoading(false);
    }
  };

  const researchCandidates = async () => {
    if (!selected.length || researchLoading) return;
    setResearchLoading(true);
    setResearchError('');
    setCandidateResearch(null);
    try {
      const question = [
        'Run a weekly US-equity paper portfolio research review for these candidate tickers: ' + selected.join(', ') + '.',
        'Compare market data, primary SEC/EDGAR disclosures, recent news, macro/geopolitical evidence, and fundamental/valuation evidence where available.',
        'Use existing independent evidence channels and citations with dates. Distinguish source facts from interpretation; report conflicts and stale or missing channels.',
        'Do not invent unavailable evidence or produce a numeric rank when evidence is insufficient. Return the evidence availability, evidence gate action, missing required families, conflicts, and a concise per-ticker comparison.',
        'This is paper-only research for manual review, not a trading instruction. SPY and QQQ are benchmarks, not candidate holdings.',
      ].join(' ');
      const response = await authFetch('/api/agent-ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.detail || body?.error || 'JEV candidate research failed.');
      setCandidateResearch(body);
      const availability = body?.jev?.evidence_availability || {};
      const gate = body?.jev?.evidence_gate || {};
      const missing = Array.isArray(availability.missing) ? availability.missing : [];
      const conflicts = Number(gate?.conflict_detection?.count || 0);
      const action = String(gate.action || body?.jev?.action || '').toLowerCase();
      if (body?.ok === false || availability.complete !== true || missing.length > 0 || conflicts > 0 || ['insufficient', 'gather_more'].includes(action)) {
        const dedupeKey = 'jev-evidence-review:' + [...selected].sort().join('-') + ':' + (action || 'insufficient') + ':' + [...missing].sort().join('-');
        void authFetch('/api/alert-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: {
            type: 'catalyst', severity: conflicts > 0 ? 'high' : 'medium',
            symbol: 'JEV', title: 'JEV research evidence needs review',
            message: `Candidate review for ${selected.join(', ')} returned gate ${action || 'insufficient'}; missing families: ${missing.join(', ') || 'not reported'}; conflicts: ${conflicts}. Do not treat the packet as a validated ranking until evidence gaps are resolved.`,
            dedupeKey, dedupeMinutes: 1440,
          } }),
        }).catch(() => undefined);
      }
    } catch (error) {
      setResearchError(error instanceof Error ? error.message : 'JEV candidate research failed.');
    } finally {
      setResearchLoading(false);
    }
  };
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
  const approvePaperReview = async () => {
    if (!preview) { setMessage('Target rejected by risk controls. Reduce weights or sector concentration.'); return; }
    const createdAt = new Date().toISOString();
    const clientId = `paper-${Date.now()}`;
    const availability = candidateResearch?.jev?.evidence_availability || {};
    const gate = candidateResearch?.jev?.evidence_gate || {};
    const missing = Array.isArray(availability.missing) ? availability.missing : [];
    const conflicts = Number(gate?.conflict_detection?.count || 0);
    const action = String(gate.action || candidateResearch?.jev?.action || '').toLowerCase();
    const evidenceStatus = !candidateResearch || candidateResearch?.ok === false
      ? 'insufficient'
      : missing.length || conflicts > 0 || availability.complete !== true || ['insufficient', 'gather_more'].includes(action)
        ? 'partial'
        : Number(gate.evidence_quality) >= 0.8 ? 'strong' : 'usable';
    const researchSnapshot = candidateResearch ? {
      capturedAt: createdAt,
      summary: String(candidateResearch.summary || '').slice(0, 4000),
      answerSource: candidateResearch.answer_source || null,
      evidenceGate: gate,
      evidenceAvailability: availability,
      hallucination: candidateResearch.hallucination || null,
    } : {};
    const snapshot = {
      clientId, createdAt, mode: 'paper', universe: 'US', reviewFrequency: 'weekly',
      decisionSource: 'manual approval', capital, costBps, target, preview,
      benchmarkSymbols: ['SPY', 'QQQ'], evidenceStatus, researchSnapshot,
      backtestSnapshot: backtest || {},
      note: 'Manual paper proposal only. No broker integration or live order was used.',
    };
    try {
      const response = await authFetch('/api/jev-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId, mode: 'paper', universe: 'US', reviewFrequency: 'weekly',
          capital, costBps, target, benchmarks: ['SPY', 'QQQ'], preview,
          researchSnapshot, backtestSnapshot: backtest || {}, evidenceStatus,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok !== true || body?.persisted !== true) {
        throw new Error(body?.error || 'Server-side save failed.');
      }
      try {
        const key = 'aiw-jev-paper-portfolio-v1';
        const previous = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify([snapshot, ...previous].slice(0, 100)));
      } catch { /* The server ledger remains authoritative when browser storage is unavailable. */ }
      setReview(createdAt);
      setMessage('Paper proposal saved to the server ledger. No real order was sent.');
      await loadSavedProposals();

      const dedupeKey = 'jev-paper-proposal:' + [...target.map(item => item.symbol)].sort().join('-');
      try {
        const alertResponse = await authFetch('/api/alert-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: {
            type: 'catalyst', severity: evidenceStatus === 'insufficient' ? 'medium' : 'info',
            symbol: 'JEV', title: 'Weekly paper portfolio proposal saved',
            message: `A manual paper review was saved with ${target.length} holdings, ${Math.round(preview.cashWeight * 100)}% cash, estimated costs $${preview.totalCost.toFixed(2)}, and SPY/QQQ benchmarks. Evidence status: ${evidenceStatus}. No live trade was placed.`,
            dedupeKey, dedupeMinutes: 10080,
          } }),
        });
        if (!alertResponse.ok) throw new Error('Telegram delivery was not confirmed.');
        setMessage('Paper proposal saved to the server ledger. Telegram alert sent; no real order was sent.');
      } catch {
        setMessage('Paper proposal saved to the server ledger; Telegram delivery could not be confirmed. No real order was sent.');
      }
    } catch (error) {
      setMessage('Server-side save failed: ' + (error instanceof Error ? error.message : 'paper proposal could not be saved') + '. No Telegram alert was sent.');
    }
  };
  return <div className="space-y-6 text-white">
    <header className="rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-950/40 to-slate-900 p-6">
      <div className="flex items-center gap-2 text-emerald-300 text-xs font-mono uppercase tracking-widest"><Activity size={16}/> JEV Autonomous Portfolio Lab</div>
      <h1 className="mt-3 text-2xl font-semibold">Research first. Paper trade. Verify the edge.</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">Weekly US-stock research lab with SPY and QQQ benchmarks. Candidate research uses the existing evidence-gated agent. Historical metrics use aligned adjusted closes with weekly rebalancing, but remain exploratory until provider point-in-time availability is independently verified.</p>
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
      <div><p className="mb-2 text-sm text-white/70">Candidate universe (manual selection; SPY and QQQ remain benchmarks)</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{candidates.map(item => <label key={item.symbol} className="flex items-center gap-2 rounded-lg border border-white/10 p-3 text-sm"><input type="checkbox" checked={selected.includes(item.symbol)} onChange={event => setSelected(old => event.target.checked ? [...old, item.symbol] : old.filter(symbol => symbol !== item.symbol))}/><span>{item.symbol}</span><span className="ml-auto text-xs text-white/40">{item.sector}</span></label>)}</div></div>
      <div className="rounded-lg bg-black/20 p-4 text-sm"><p>Target allocation: {target.reduce((sum, item) => sum + item.weight, 0).toLocaleString(undefined, { style: 'percent', maximumFractionDigits: 1 })}</p><p>Cash reserve: {preview ? (preview.cashWeight * 100).toFixed(1) + '%' : 'Risk controls blocked this allocation'}</p><p>Estimated transaction costs: {preview ? '$' + preview.totalCost.toFixed(2) : 'Unavailable'}</p><p className="mt-2 text-xs text-white/40">Manual target weights only. Exploratory returns require fresh adjusted closes for every holding and both benchmarks; provider point-in-time availability is still assumed, not verified.</p></div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => void researchCandidates()} disabled={researchLoading || selected.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/30 px-4 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-40">{researchLoading ? 'Researching candidates…' : 'Run JEV candidate research'}</button>
        <button onClick={() => void runHistoricalBacktest()} disabled={backtestLoading || !preview || selected.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-sky-400/30 px-4 py-2 text-sm font-semibold text-sky-200 disabled:opacity-40">{backtestLoading ? 'Running backtest…' : 'Run 2-year historical backtest'}</button>
        <button onClick={approvePaperReview} disabled={!preview || selected.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"><RefreshCw size={16}/> Save manual paper proposal</button>
      </div>
      {researchError && <p role="status" className="text-sm text-amber-200">{researchError}</p>}
      {candidateResearch && <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.03] p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">JEV candidate research result</h3>
          <span className={candidateResearch?.jev?.evidence_gate?.action === 'insufficient' || candidateResearch?.jev?.evidence_gate?.action === 'gather_more' || candidateResearch?.jev?.evidence_availability?.complete !== true || candidateResearch?.ok === false ? 'rounded-full border border-amber-400/30 px-2 py-1 text-xs text-amber-200' : 'rounded-full border border-white/15 px-2 py-1 text-xs text-white/60'}>Gate: {candidateResearch?.jev?.evidence_gate?.action || candidateResearch?.jev?.action || (candidateResearch?.jev?.evidence_availability?.complete === true ? 'complete' : 'insufficient')}</span>
        </div>
        <p className="text-sm text-white/70 whitespace-pre-wrap">{candidateResearch.summary || candidateResearch.error || 'The agent returned no summary.'}</p>
        {Array.isArray(candidateResearch?.jev?.evidence_availability?.missing) && candidateResearch.jev.evidence_availability.missing.length > 0 && <p className="text-xs text-amber-200">Missing evidence: {candidateResearch.jev.evidence_availability.missing.join(', ')}</p>}
        {candidateResearch?.jev?.evidence_gate?.conflict_detection?.count > 0 && <p className="text-xs text-amber-200">Conflicts detected: {candidateResearch.jev.evidence_gate.conflict_detection.count}. Resolve material conflicts before relying on a comparison.</p>}
        <p className="text-xs text-white/40">Research does not change weights. Missing, stale, or conflicting evidence must not be interpreted as a positive ranking; all allocation changes remain manual.</p>
      </div>}
      {backtestError && <p role="status" className="text-sm text-amber-200">Backtest unavailable: {backtestError}</p>}
      {backtest && <div className="rounded-lg border border-sky-400/20 bg-sky-400/[0.03] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Historical paper backtest</h3>
          <span className="rounded-full border border-amber-400/30 px-2 py-1 text-xs text-amber-200">Exploratory · {backtest.evidenceStatus}</span>
        </div>
        <p className="text-xs text-white/45">{backtest.startDate} to {backtest.endDate} · {backtest.observations} aligned trading sessions · {backtest.rebalanceCount} entry/rebalance events</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs text-white/45">Strategy net return</p><p className="text-lg font-semibold">{backtest.strategyNetReturnPct.toFixed(2)}%</p></div>
          <div><p className="text-xs text-white/45">SPY return</p><p className="text-lg font-semibold">{backtest.spyReturnPct.toFixed(2)}%</p><p className="text-xs text-white/40">Excess: {backtest.excessVsSpyPct.toFixed(2)} pp</p></div>
          <div><p className="text-xs text-white/45">QQQ return</p><p className="text-lg font-semibold">{backtest.qqqReturnPct.toFixed(2)}%</p><p className="text-xs text-white/40">Excess: {backtest.excessVsQqqPct.toFixed(2)} pp</p></div>
          <div><p className="text-xs text-white/45">Max drawdown</p><p className="text-lg font-semibold">{backtest.maxDrawdownPct.toFixed(2)}%</p><p className="text-xs text-white/40">Trading costs: {backtest.totalTransactionCostsPct.toFixed(3)}% of starting capital</p></div>
        </div>
        <p className="text-xs text-amber-200/80">Adjusted closes and benchmark dates were aligned. Provider availability is currently assumed after the UTC calendar day, not independently verified; this result is not a validated forecast, evidence-backed JEV strategy, or proof of alpha.</p>
      </div>}
      <p role="status" className="text-sm text-white/60">{message}{review ? ' Last saved: ' + new Date(review).toLocaleString() : ''}</p>
      <div className="mt-3 border-t border-white/10 pt-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Server-side proposal history</h3>
          <button type="button" onClick={() => void loadSavedProposals()} disabled={ledgerLoading} className="rounded-lg border border-white/15 px-2 py-1 text-xs disabled:opacity-50">{ledgerLoading ? 'Loading…' : 'Refresh'}</button>
        </div>
        {ledgerError && <p role="status" className="mt-2 text-xs text-amber-200">{ledgerError} Sign in with your access token and ensure the proposal-table migration has been applied.</p>}
        {!ledgerError && savedProposals.length === 0 && <p className="mt-2 text-xs text-white/40">No server-side paper proposals saved yet.</p>}
        {savedProposals.slice(0, 5).map(item => <div key={item.client_id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 p-3 text-xs">
          <div><p className="font-medium">{(item.target || []).map((holding: any) => holding.symbol).join(', ') || 'No holdings'}</p><p className="mt-1 text-white/40">{item.created_at ? new Date(item.created_at).toLocaleString() : 'Date unavailable'} · {item.review_frequency || 'weekly'} · {item.benchmarks?.join?.(' / ') || 'SPY / QQQ'}</p></div>
          <div className="text-right"><p>${Number(item.capital || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p><p className="mt-1 text-white/45">Evidence: {item.evidence_status || 'insufficient'}</p></div>
        </div>)}
      </div>
    </section>
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Historical market-data coverage</h2>
          <p className="mt-1 text-sm text-white/50">Checks whether price history is available for your selected holdings and both benchmarks.</p>
        </div>
        <button type="button" onClick={() => void loadHistoryCoverage()} disabled={historyLoading} className="rounded-lg border border-white/15 px-3 py-2 text-sm disabled:opacity-50">{historyLoading ? 'Checking…' : 'Refresh coverage'}</button>
      </div>
      {historyError && <p role="status" className="text-sm text-amber-200">{historyError}</p>}
      {historyCoverage && <div className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {historyCoverage.results.map((item: any) => <div key={item.symbol} className="rounded-lg border border-white/10 p-3">
            <div className="flex items-center justify-between gap-2"><span className="font-semibold">{item.symbol}</span><span className={item.ok && item.adjusted && !item.stale ? 'text-xs text-emerald-300' : 'text-xs text-amber-200'}>{!item.ok ? 'Unavailable' : item.stale ? 'Stale cache' : item.adjusted ? 'Adjusted closes' : 'Raw closes only'}</span></div>
            <p className="mt-1 text-xs text-white/45">{item.source || 'No provider'}</p>
            <p className="mt-2 text-sm">{item.adjustedPointCount || 0} adjusted / {item.pointCount} daily points</p>
            <p className="text-xs text-white/40">{item.firstDate || '—'} to {item.lastDate || '—'}</p>
          </div>)}
        </div>
        <p className="text-xs text-white/40">Last checked: {historyCoverage.fetchedAt ? new Date(historyCoverage.fetchedAt).toLocaleString() : 'unknown'}. Coverage includes adjusted-close availability. Backtests are blocked unless all selected holdings and SPY/QQQ have complete, fresh adjusted-close histories on aligned dates. Daily-bar availability remains an explicit assumption, so reported results are exploratory only.</p>
      </div>}
    </section>
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
      <h2 className="text-lg font-semibold">JEV review & forecast-validation guard</h2>
      <p className="text-sm text-white/55">JEV can assess the portfolio context through the existing authenticated assessment endpoint. This is not yet a stock-discovery ranking: insufficient or missing evidence must remain insufficient.</p>
      <JevDecisionPanel kind="portfolio" title="JEV portfolio assessment" subtitle="Reviews the proposed paper allocation and its supplied context; it does not change weights or place orders." state={{
        mode: 'paper', reviewFrequency: 'weekly', universe: 'US equities', benchmarks: ['SPY', 'QQQ'],
        targetHoldings: target, capital, transactionCostBps: costBps,
        riskLimits: { maxPositionWeight: 0.15, maxSectorWeight: 0.35, minCashWeight: 0.05 },
        evidenceQualityInput: {
          evidence_availability: {
            usable_families: [],
            missing: ['market data', 'peer comparison', 'fundamental evidence', 'valuation', 'evidence-backed candidate ranking'],
          },
          evidence_freshness: [],
          conflict_count: 0,
        },
      }} />
      <div className="rounded-lg border border-white/10 p-3 text-sm">
        <p className="font-medium">Forecast validation threshold</p>
        <p className="mt-1 text-white/60">Existing forecast-verification gate: {forecastValidationGate(0).minimumRequired} verified forecasts before the sample is considered ready. This lab has not yet recorded a verified sample.</p>
      </div>
    </section>
  </div>;
}
