import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarRange, ChevronRight, Loader2, Search, ShieldAlert, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { STOCK_METADATA } from '../data';
import { formatPrice } from '../utils';

type PricePoint = { date: string; price: number };

type ForwardOutlookProps = {
  livePrices?: Record<string, { price: number; changePct: number }>;
  macroRisks?: any[];
  contracts?: any[];
  news?: any[];
  politicalSignals?: any[];
};

type Horizon = 5 | 20 | 60 | 120 | 252;

type ForecastSnapshot = {
  id: string; ticker: string; createdAt: string; targetDate: string; horizon: Horizon; scenarioId: string;
  entryPrice: number; median: number; p25: number; p75: number; p10: number; p90: number;
  status: 'pending' | 'verified'; verifiedAt?: string; actualDate?: string; actualPrice?: number; actualReturn?: number; medianError?: number;
};

const FORECAST_STORAGE_KEY = 'aiw-forward-outlook-forecasts-v1';

type Scenario = {
  id: string;
  label: string;
  description: string;
  adjustment: number;
};

const HORIZONS: { days: Horizon; label: string }[] = [
  { days: 5, label: '5D' },
  { days: 20, label: '20D' },
  { days: 60, label: '60D' },
  { days: 120, label: '6M' },
  { days: 252, label: '12M' },
];

const SCENARIOS: Scenario[] = [
  { id: 'base', label: 'Current regime', description: 'Historical analogues closest to today\'s observed momentum and volatility.', adjustment: 0 },
  { id: 'bull', label: 'AI demand strengthens', description: 'Stronger AI-infrastructure demand and supportive business/policy signals.', adjustment: 0.45 },
  { id: 'bear', label: 'Macro / policy shock', description: 'Higher macro or policy stress with weaker market breadth.', adjustment: -0.45 },
];

function addBusinessDays(start: Date, days: number): string {
  const date = new Date(start); let remaining = days;
  while (remaining > 0) { date.setDate(date.getDate() + 1); const day = date.getDay(); if (day !== 0 && day !== 6) remaining -= 1; }
  return date.toISOString().slice(0, 10);
}
function loadForecasts(): ForecastSnapshot[] { try { const raw = localStorage.getItem(FORECAST_STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; } }
function saveForecasts(items: ForecastSnapshot[]) { localStorage.setItem(FORECAST_STORAGE_KEY, JSON.stringify(items.slice(-100))); }

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map(v => (v - m) ** 2)));
}

function recentReturn(history: PricePoint[], days: number): number | null {
  if (history.length <= days) return null;
  const start = history[history.length - 1 - days]?.price;
  const end = history[history.length - 1]?.price;
  return start && end ? (end / start - 1) * 100 : null;
}

function forwardReturns(history: PricePoint[], horizon: number): number[] {
  const result: number[] = [];
  for (let i = 60; i + horizon < history.length; i++) {
    const base = history[i]?.price;
    const future = history[i + horizon]?.price;
    if (base > 0 && future > 0) result.push((future / base - 1) * 100);
  }
  return result;
}

function conditionedReturns(history: PricePoint[], horizon: number, currentMomentum: number, currentVolatility: number): number[] {
  const candidates: { distance: number; ret: number }[] = [];
  const dailyReturns: number[] = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1]?.price;
    const cur = history[i]?.price;
    if (prev > 0 && cur > 0) dailyReturns.push((cur / prev - 1) * 100);
  }

  for (let i = 60; i + horizon < history.length; i++) {
    const base = history[i]?.price;
    const future = history[i + horizon]?.price;
    if (!(base > 0 && future > 0)) continue;

    const momentumStart = history[i - 20]?.price;
    const momentum = momentumStart > 0 ? (base / momentumStart - 1) * 100 : 0;
    const window = dailyReturns.slice(Math.max(0, i - 20), i);
    const volatility = stdev(window) * Math.sqrt(252);
    const distance = Math.abs(momentum - currentMomentum) + Math.abs(volatility - currentVolatility) * 0.7;
    candidates.push({ distance, ret: (future / base - 1) * 100 });
  }

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates.slice(0, Math.min(25, candidates.length)).map(item => item.ret);
}

export default function ForwardOutlook({ livePrices, macroRisks = [], contracts = [], news = [], politicalSignals = [] }: ForwardOutlookProps) {
  const [selectedStock, setSelectedStock] = useState('NVDA');
  const [tickerInput, setTickerInput] = useState('');
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<Horizon>(20);
  const [scenarioId, setScenarioId] = useState('base');
  const [jevLoading, setJevLoading] = useState(false);
  const [jevResult, setJevResult] = useState<{ summary?: string; answer_source?: string; choice?: string; evidenceGate?: string; confidence?: number } | null>(null);
  const [jevError, setJevError] = useState<string | null>(null);
  const [forecasts, setForecasts] = useState<ForecastSnapshot[]>([]);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadPersistentForecasts() {
      try {
        const response = await fetch('/api/forecast-verification');
        if (!response.ok) throw new Error('Persistent forecast storage unavailable');
        const body = await response.json();
        const remote: ForecastSnapshot[] = Array.isArray(body.forecasts) ? body.forecasts : [];
        if (!cancelled) {
          setForecasts(remote);
          if (!remote.length) {
            const legacy = loadForecasts();
            for (const item of legacy) {
              fetch('/api/forecast-verification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
              }).catch(() => {});
            }
            if (legacy.length) setForecasts(legacy);
          }
        }
      } catch {
        if (!cancelled) setForecasts(loadForecasts());
      }
    }
    loadPersistentForecasts();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/stock-history?symbol=' + encodeURIComponent(selectedStock) + '&range=5y');
        if (!res.ok) throw new Error('Historical data request failed (HTTP ' + res.status + ')');
        const data = await res.json();
        if (!cancelled) setHistory(Array.isArray(data.points) ? data.points : []);
      } catch (err: any) {
        if (!cancelled) {
          setHistory([]);
          setError(err?.message || 'Historical market data unavailable');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedStock]);

  const quote = livePrices?.[selectedStock];
  const currentPrice = quote?.price ?? history[history.length - 1]?.price ?? null;

  const metrics = useMemo(() => {
    const oneMonth = recentReturn(history, 20) ?? 0;
    const daily: number[] = [];
    for (let i = 1; i < history.length; i++) {
      const a = history[i - 1]?.price;
      const b = history[i]?.price;
      if (a > 0 && b > 0) daily.push((b / a - 1) * 100);
    }
    const currentWindow = daily.slice(-20);
    return {
      momentum: oneMonth,
      volatility: stdev(currentWindow) * Math.sqrt(252),
      dailyChange: quote?.changePct ?? daily[daily.length - 1] ?? 0,
      oneYear: recentReturn(history, 252) ?? 0,
    };
  }, [history, quote]);

  const macroLoad = useMemo(() => {
    const high = macroRisks.filter(r => String(r?.impactRating || '').toLowerCase() === 'high').length;
    const medium = macroRisks.filter(r => String(r?.impactRating || '').toLowerCase() === 'medium').length;
    return Math.min(100, high * 18 + medium * 9);
  }, [macroRisks]);

  const evidenceCounts = contracts.length + news.length + politicalSignals.length;

  const analysis = useMemo(() => {
    const all = forwardReturns(history, horizon);
    const analogues = conditionedReturns(history, horizon, metrics.momentum, metrics.volatility);
    const base = analogues.length >= 8 ? analogues : all;
    const scenario = SCENARIOS.find(s => s.id === scenarioId) || SCENARIOS[0];
    const shift = scenario.adjustment * Math.max(1, stdev(base));
    const adjusted = base.map(value => value + shift);
    const median = percentile(adjusted, 0.5);
    const p10 = percentile(adjusted, 0.1);
    const p25 = percentile(adjusted, 0.25);
    const p75 = percentile(adjusted, 0.75);
    const p90 = percentile(adjusted, 0.9);
    const positive = adjusted.length ? adjusted.filter(v => v > 0).length / adjusted.length : 0;
    const confidence = adjusted.length >= 20 ? 'Moderate' : adjusted.length >= 8 ? 'Low–Moderate' : 'Insufficient';
    return { sample: adjusted, median, p10, p25, p75, p90, positive, confidence, analogueCount: analogues.length, allCount: all.length };
  }, [history, horizon, metrics.momentum, metrics.volatility, scenarioId]);

  const selectedScenario = SCENARIOS.find(s => s.id === scenarioId) || SCENARIOS[0];
  const meta = STOCK_METADATA[selectedStock] || { name: selectedStock, sector: 'Live Market', logoColor: '#22c55e' };

  const runJevEvidenceCheck = async () => {
    if (!history.length || loading) return;
    setJevLoading(true);
    setJevError(null);
    try {
      const scenario = SCENARIOS.find(s => s.id === scenarioId) || SCENARIOS[0];
      const compact = (items: any[], keys: string[]) => items.slice(0, 8).map(item => {
        const out: Record<string, any> = {};
        keys.forEach(key => { if (item?.[key] != null) out[key] = item[key]; });
        return out;
      });
      const prompt = [
        'Act as the JEV evidence/context layer for AI Infra Watch Forward Outlook.',
        'Do not change, invent, or override the numerical historical forecast. Treat the statistical distribution as the source of the numbers.',
        'Assess whether current evidence supports, conflicts with, or is insufficient to contextualize the historical analogue result.',
        'Return a concise summary for the UI with: evidence assessment, key supporting/conflicting signals, important caveats, and what should be verified next.',
        'Do not provide an investment recommendation, price target, or certainty claim.',
        '',
        'Ticker: ' + selectedStock,
        'Horizon: ' + HORIZONS.find(h => h.days === horizon)?.label,
        'Scenario: ' + scenario.label,
        'Historical median: ' + formatReturn(analysis.median),
        'Historical P10/P25/P75/P90: ' + [analysis.p10, analysis.p25, analysis.p75, analysis.p90].map(formatReturn).join(' / '),
        'Positive historical outcomes: ' + (analysis.positive * 100).toFixed(0) + '%',
        'Analogue matches: ' + analysis.analogueCount,
        'Baseline observations: ' + analysis.allCount,
        '20D momentum: ' + formatReturn(metrics.momentum),
        'Annualized volatility: ' + metrics.volatility.toFixed(1) + '%',
        '1Y move: ' + formatReturn(metrics.oneYear),
        'Macro load: ' + macroLoad + '/100',
        'Contracts evidence: ' + JSON.stringify(compact(contracts, ['title','company','date','status','summary'])),
        'News evidence: ' + JSON.stringify(compact(news, ['title','source','publishedAt','summary'])),
        'Political/policy evidence: ' + JSON.stringify(compact(politicalSignals, ['title','source','date','summary','impactRating'])),
        'Macro risks: ' + JSON.stringify(compact(macroRisks, ['title','description','impactRating']))
      ].join('\n');

      const response = await fetch('/api/agent-ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: prompt })
      });
      if (!response.ok) throw new Error('JEV evidence check failed (HTTP ' + response.status + ')');
      const body = await response.json();
      setJevResult({
        summary: body?.summary || body?.answer || 'JEV returned no summary.',
        answer_source: body?.answer_source,
        choice: body?.jev?.choice,
        evidenceGate: body?.jev?.evidence_gate?.action,
        confidence: body?.jev?.confidence
      });
    } catch (err: any) {
      setJevResult(null);
      setJevError(err?.message || 'JEV evidence check unavailable');
    } finally {
      setJevLoading(false);
    }
  };

  const trackForecast = async () => {
    if (!currentPrice || !history.length || analysis.confidence === 'Insufficient') return;
    const snapshot: ForecastSnapshot = {
      id: crypto.randomUUID(), ticker: selectedStock, createdAt: new Date().toISOString(),
      targetDate: addBusinessDays(new Date(), horizon), horizon, scenarioId, entryPrice: currentPrice,
      median: analysis.median, p25: analysis.p25, p75: analysis.p75, p10: analysis.p10, p90: analysis.p90, status: 'pending'
    };
    try {
      const response = await fetch('/api/forecast-verification', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot)
      });
      if (!response.ok) throw new Error('Persistent forecast storage failed (HTTP ' + response.status + ')');
      const body = await response.json();
      const saved = body?.forecast || snapshot;
      const next = [...forecasts.filter(f => f.id !== saved.id), saved];
      setForecasts(next);
      saveForecasts(next);
      setVerificationMessage('Forecast saved to the verification database. It can be verified from another device after the target date.');
    } catch (err: any) {
      const next = [...forecasts, snapshot];
      setForecasts(next);
      saveForecasts(next);
      setVerificationMessage((err?.message || 'Database save failed.') + ' Local browser fallback was kept.');
    }
  };

  const verifyDueForecasts = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const due = forecasts.filter(f => f.status === 'pending' && f.targetDate <= today);
    if (!due.length) { setVerificationMessage('No forecast has reached its target date yet.'); return; }
    setVerificationBusy(true); setVerificationMessage(null);
    try {
      const updated = [...forecasts];
      for (const forecast of due) {
        const res = await fetch('/api/stock-history?symbol=' + encodeURIComponent(forecast.ticker) + '&range=5y');
        if (!res.ok) throw new Error('Verification market data failed for ' + forecast.ticker + ' (HTTP ' + res.status + ')');
        const data = await res.json();
        const points: PricePoint[] = Array.isArray(data.points) ? data.points : [];
        const point = points.find(p => p.date >= forecast.targetDate) || points[points.length - 1];
        if (!point || !(forecast.entryPrice > 0) || !(point.price > 0)) continue;
        const actualReturn = (point.price / forecast.entryPrice - 1) * 100;
        const patch = {
          id: forecast.id, status: 'verified', verifiedAt: new Date().toISOString(),
          actualDate: point.date, actualPrice: point.price, actualReturn,
          medianError: actualReturn - forecast.median
        };
        const savedResponse = await fetch('/api/forecast-verification', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch)
        });
        if (!savedResponse.ok) throw new Error('Database verification failed for ' + forecast.ticker + ' (HTTP ' + savedResponse.status + ')');
        const savedBody = await savedResponse.json();
        const verified = savedBody?.forecast || { ...forecast, ...patch };
        const index = updated.findIndex(f => f.id === forecast.id);
        if (index >= 0) updated[index] = verified;
      }
      setForecasts(updated); saveForecasts(updated);
      setVerificationMessage('Verification complete using real market history and the persistent database.');
    } catch (err: any) {
      setVerificationMessage(err?.message || 'Forecast verification failed.');
    } finally { setVerificationBusy(false); }
  };

  const runTicker = () => {
    const value = tickerInput.trim().toUpperCase();
    if (value) {
      setSelectedStock(value);
      setTickerInput('');
    }
  };

  const formatReturn = (value: number) => (value >= 0 ? '+' : '') + value.toFixed(1) + '%';

  return (
    <div className="space-y-6" id="forward-outlook-view">
      <div className="aiw-page-header flex flex-col space-y-1 md:space-y-2 border-b border-white/10 pb-4">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Section 09 / Forward-looking analysis</span>
        <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase italic text-white">Forward Outlook</h1>
        <p className="text-xs text-white/60 max-w-4xl leading-relaxed">
          Historical scenario analysis: find past market regimes that resemble today, then measure the distribution of subsequent returns. This is not a guaranteed price prediction.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-[#15181E] border border-white/10 rounded-2xl p-4 md:p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <div className="flex-1">
              <label className="text-[9px] font-mono uppercase tracking-widest text-white/40 block mb-1.5">Analyze any public ticker</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-white/30 absolute left-3 top-2.5" />
                  <input value={tickerInput} onChange={e => setTickerInput(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && runTicker()} placeholder="NVDA, MSFT, MU, AVGO..." className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-emerald-400/50 placeholder-white/20 font-mono" />
                </div>
                <button onClick={runTicker} className="px-4 py-2.5 bg-emerald-500 text-black rounded text-[10px] font-mono font-black uppercase tracking-wider cursor-pointer">Analyze</button>
              </div>
            </div>
            <div className="text-right text-[10px] font-mono text-white/40">
              <div>LIVE PRICE</div>
              <div className="text-lg text-white font-bold">{currentPrice != null ? '$' + formatPrice(currentPrice) : '—'}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {['NVDA','MSFT','MU','AVGO','AMD','TSM','META','NBIS'].map(symbol => (
              <button key={symbol} onClick={() => setSelectedStock(symbol)} className={`px-3 py-2 rounded border text-[10px] font-mono font-bold cursor-pointer ${selectedStock === symbol ? 'bg-white text-black border-white' : 'bg-white/5 text-white/60 border-white/10'}`}>{symbol}</button>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded-xl border border-white/5 bg-black/10 p-3"><div className="text-[8px] font-mono uppercase text-white/30">20D momentum</div><div className="text-sm font-mono font-bold mt-1">{formatReturn(metrics.momentum)}</div></div>
            <div className="rounded-xl border border-white/5 bg-black/10 p-3"><div className="text-[8px] font-mono uppercase text-white/30">Annualized vol</div><div className="text-sm font-mono font-bold mt-1">{metrics.volatility.toFixed(1)}%</div></div>
            <div className="rounded-xl border border-white/5 bg-black/10 p-3"><div className="text-[8px] font-mono uppercase text-white/30">1Y move</div><div className="text-sm font-mono font-bold mt-1">{formatReturn(metrics.oneYear)}</div></div>
            <div className="rounded-xl border border-white/5 bg-black/10 p-3"><div className="text-[8px] font-mono uppercase text-white/30">Macro load</div><div className="text-sm font-mono font-bold mt-1">{macroLoad}/100</div></div>
          </div>
        </div>

        <div className="bg-[#15181E] border border-white/10 rounded-2xl p-4 md:p-5 space-y-4">
          <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-emerald-400" /><span className="text-xs font-mono font-black uppercase tracking-widest">Scenario</span></div>
          {SCENARIOS.map(s => (
            <button key={s.id} onClick={() => setScenarioId(s.id)} className={`w-full text-left p-3 rounded-xl border transition cursor-pointer ${scenarioId === s.id ? 'border-emerald-400/40 bg-emerald-400/5' : 'border-white/10 bg-white/[.02]'}`}>
              <div className="flex items-center justify-between"><span className="text-xs font-bold">{s.label}</span>{scenarioId === s.id && <ChevronRight className="w-4 h-4 text-emerald-400" />}</div>
              <p className="text-[10px] text-white/40 mt-1 leading-relaxed">{s.description}</p>
            </button>
          ))}
          <div className="border-t border-white/10 pt-3 text-[9px] font-mono text-white/35">
            Evidence available: {evidenceCounts} current feed items · {macroRisks.length} macro risks
          </div>
        </div>
      </div>

      <div className="bg-[#15181E] border border-white/10 rounded-2xl p-4 md:p-5 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-white/40">Historical analogue distribution · {meta.name} ({selectedStock})</div>
            <h2 className="text-2xl font-black uppercase italic mt-1">Next {HORIZONS.find(h => h.days === horizon)?.label}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {HORIZONS.map(item => <button key={item.days} onClick={() => setHorizon(item.days)} className={`px-3 py-2 rounded border text-[9px] font-mono font-bold cursor-pointer ${horizon === item.days ? 'bg-white text-black border-white' : 'bg-white/5 text-white/50 border-white/10'}`}>{item.label}</button>)}
          </div>
        </div>

        {loading && <div className="flex items-center gap-2 text-xs font-mono text-white/40"><Loader2 className="w-4 h-4 animate-spin" /> Loading 5-year market history…</div>}
        {!loading && error && <div className="text-xs font-mono text-amber-300 border border-amber-300/20 rounded-xl p-3">{error}</div>}

        {!loading && !error && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                ['10th percentile', analysis.p10],
                ['25th percentile', analysis.p25],
                ['Median', analysis.median],
                ['75th percentile', analysis.p75],
                ['90th percentile', analysis.p90],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-white/5 bg-black/10 p-3">
                  <div className="text-[8px] font-mono uppercase text-white/30">{label}</div>
                  <div className={`text-lg font-black font-mono mt-1 ${Number(value) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatReturn(Number(value))}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-[#0F1115] p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-white/35">Outcome range from historical analogues</span>
                  <span className="text-[9px] font-mono text-white/35">{analysis.analogueCount || analysis.allCount} observations</span>
                </div>
                <div className="relative h-16 rounded-lg bg-white/[.03] border border-white/5">
                  <div className="absolute top-0 bottom-0 left-[10%] border-l border-white/10" />
                  <div className="absolute top-0 bottom-0 left-1/2 border-l border-white/10" />
                  <div className="absolute top-0 bottom-0 right-[10%] border-l border-white/10" />
                  <div className="absolute top-1/2 left-[10%] right-[10%] h-2 -translate-y-1/2 rounded bg-emerald-400/20" />
                  <div className="absolute top-1/2 left-1/4 right-1/4 h-4 -translate-y-1/2 rounded border border-emerald-400/30" />
                  <div className="absolute top-1/2 left-1/2 w-2 h-6 -translate-y-1/2 -translate-x-1/2 bg-white rounded" />
                </div>
                <div className="flex justify-between text-[8px] font-mono text-white/25 mt-1"><span>Downside tail</span><span>Historical median</span><span>Upside tail</span></div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#0F1115] p-4 space-y-3">
                <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-cyan-300" /><span className="text-[9px] font-mono uppercase tracking-widest text-white/40">Model diagnostics</span></div>
                <div className="text-sm font-bold">{analysis.confidence} confidence</div>
                <div className="text-[10px] text-white/45">Positive historical outcomes: {(analysis.positive * 100).toFixed(0)}%</div>
                <div className="text-[10px] text-white/45">Analogue matches: {analysis.analogueCount}</div>
                <div className="text-[10px] text-white/45">Baseline observations: {analysis.allCount}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <div className="flex items-center gap-2 mb-2"><CalendarRange className="w-4 h-4 text-emerald-400" /><span className="text-[9px] font-mono uppercase tracking-widest text-white/40">Interpretation</span></div>
              <p className="text-xs text-white/65 leading-relaxed">
                Under <strong className="text-white">{selectedScenario.label}</strong>, the historical analogue set produced a median {formatReturn(analysis.median)} outcome over the selected horizon, with the middle 50% between {formatReturn(analysis.p25)} and {formatReturn(analysis.p75)}. The model found {analysis.analogueCount} close historical regimes.
              </p>
              <p className="text-[9px] font-mono text-white/30 mt-2">This is a historical distribution, not a promise, target price, or investment recommendation.</p>
            </div>

            <div className="rounded-2xl border border-violet-400/20 bg-violet-400/[.04] p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-4 h-4 text-violet-300" />
                    <span className="text-[9px] font-mono uppercase tracking-widest text-violet-200/70">JEV evidence & context</span>
                  </div>
                  <p className="text-[10px] text-white/45 max-w-3xl">
                    JEV does not generate the numerical forecast. It evaluates current evidence around the historical result and flags support, conflict, or insufficient evidence.
                  </p>
                </div>
                <button
                  onClick={runJevEvidenceCheck}
                  disabled={jevLoading}
                  className="shrink-0 px-4 py-2.5 rounded border border-violet-300/30 bg-violet-300/10 text-violet-100 text-[9px] font-mono font-black uppercase tracking-wider disabled:opacity-50"
                >
                  {jevLoading ? 'JEV CHECKING…' : 'Run JEV Evidence Check'}
                </button>
              </div>

              {jevError && <div className="mt-3 text-[10px] font-mono text-amber-300 border border-amber-300/20 rounded-xl p-3">{jevError}</div>}

              {!jevLoading && !jevError && !jevResult && (
                <div className="mt-3 text-[10px] text-white/35">Run the check to have JEV assess the current evidence for {selectedStock} without changing the historical numbers above.</div>
              )}

              {jevResult && (
                <div className="mt-4 space-y-3">
                  <div className="text-sm text-white/75 leading-relaxed">{jevResult.summary}</div>
                  <div className="flex flex-wrap gap-2">
                    {jevResult.choice && <span className="px-2 py-1 rounded border border-violet-300/20 bg-violet-300/5 text-[9px] font-mono text-violet-100">JEV route: {jevResult.choice}</span>}
                    {jevResult.evidenceGate && <span className="px-2 py-1 rounded border border-white/10 bg-white/5 text-[9px] font-mono text-white/60">Evidence gate: {jevResult.evidenceGate}</span>}
                    {jevResult.confidence != null && <span className="px-2 py-1 rounded border border-white/10 bg-white/5 text-[9px] font-mono text-white/60">JEV confidence: {jevResult.confidence}</span>}
                    {jevResult.answer_source && <span className="px-2 py-1 rounded border border-white/10 bg-white/5 text-[9px] font-mono text-white/60">Source: {jevResult.answer_source}</span>}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[.03] p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div><div className="text-[9px] font-mono uppercase tracking-widest text-cyan-200/70">Forecast verification</div>
          <p className="text-[10px] text-white/45 mt-1">Save the current forecast, then compare it with the real return after the selected trading horizon.</p></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={trackForecast} disabled={!currentPrice || analysis.confidence === 'Insufficient'} className="px-3 py-2 rounded border border-cyan-300/30 bg-cyan-300/10 text-cyan-100 text-[9px] font-mono font-black uppercase disabled:opacity-40">Track this forecast</button>
            <button onClick={verifyDueForecasts} disabled={verificationBusy} className="px-3 py-2 rounded border border-white/10 bg-white/5 text-white/70 text-[9px] font-mono font-black uppercase disabled:opacity-40">{verificationBusy ? 'VERIFYING…' : 'Verify due forecasts'}</button>
          </div>
        </div>
        {verificationMessage && <div className="text-[10px] font-mono text-cyan-200/80 border border-cyan-300/10 rounded-xl p-2">{verificationMessage}</div>}
        <div className="space-y-2">{forecasts.slice().reverse().slice(0, 5).map(f => (
          <div key={f.id} className="rounded-xl border border-white/5 bg-black/10 p-3 text-[9px] font-mono">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-white/55"><span>{f.ticker}</span><span>{f.horizon} trading days</span><span>Target {f.targetDate}</span><span>Entry ${formatPrice(f.entryPrice)}</span><span className={f.status === 'verified' ? 'text-cyan-200' : 'text-amber-200'}>{f.status}</span></div>
            <div className="mt-1 text-white/40">Forecast median ${formatReturn(f.median)} · middle 50% ${formatReturn(f.p25)} to ${formatReturn(f.p75)}${f.status === 'verified' && f.actualReturn != null ? ' · actual ' + formatReturn(f.actualReturn) + ' on ' + f.actualDate : ''}</div>
          </div>
        ))}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/10 bg-[#15181E]/60 p-4">
          <div className="flex items-center gap-2 mb-3"><TrendingUp className="w-4 h-4 text-emerald-400" /><span className="text-[9px] font-mono uppercase tracking-widest text-white/40">What drives the analogue</span></div>
          <ul className="space-y-2 text-xs text-white/55">
            <li>• 20-day momentum: <span className="text-white">{formatReturn(metrics.momentum)}</span></li>
            <li>• Annualized volatility: <span className="text-white">{metrics.volatility.toFixed(1)}%</span></li>
            <li>• Current daily move: <span className="text-white">{formatReturn(metrics.dailyChange)}</span></li>
            <li>• 1-year move: <span className="text-white">{formatReturn(metrics.oneYear)}</span></li>
          </ul>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#15181E]/60 p-4">
          <div className="flex items-center gap-2 mb-3"><ShieldAlert className="w-4 h-4 text-amber-300" /><span className="text-[9px] font-mono uppercase tracking-widest text-white/40">Scenario caveat</span></div>
          <p className="text-xs text-white/55 leading-relaxed">The scenario controls are transparent stress adjustments. They do not claim to know the future. The strongest output is the historical distribution and its evidence trail.</p>
        </div>
      </div>
    </div>
  );
}
