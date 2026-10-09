import React, { useState, useEffect } from 'react';
import { rankSearchResults } from '../utils/search';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceDot } from 'recharts';
import { Calendar, CheckCircle, Clock, AlertCircle, Award, Search, Loader2, X } from 'lucide-react';
import { STOCK_METADATA, INITIAL_MILESTONES } from '../data';
import { Milestone } from '../types';
import { formatPrice } from '../utils';
import FreshnessBadge from './FreshnessBadge';

function matchesDate(milestoneDate: string, historyDate: string): boolean {
  const m = milestoneDate.trim().toLowerCase();
  const h = historyDate.trim().toLowerCase();
  if (m === h) return true;

  const parsed = Date.parse(milestoneDate);
  if (!Number.isNaN(parsed) && /^\d{4}-\d{2}-\d{2}$/.test(historyDate)) {
    return new Date(parsed).toISOString().slice(0, 10) === historyDate;
  }

  const monthYear = m.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})$/);
  if (monthYear && /^\d{4}-\d{2}-\d{2}$/.test(historyDate)) {
    const month = new Date(monthYear[1] + ' 1, ' + monthYear[2]).getMonth();
    const date = new Date(historyDate + 'T00:00:00Z');
    return date.getUTCMonth() === month && date.getUTCFullYear() === Number(monthYear[2]);
  }

  return false;
}

interface ProgressTrackerProps {
  livePrices?: Record<string, { price: number; changePct: number; marketTime?: string | null; retrievedAt?: string; asOf?: string | null; stale?: boolean }>;
}

const TRACKER_SYMBOLS_STORAGE_KEY = 'aiw-progress-tracker-symbols-v1';

function loadTrackerSymbols(): string[] {
  const defaults = Object.keys(STOCK_METADATA);
  try {
    const raw = localStorage.getItem(TRACKER_SYMBOLS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return defaults;
    const symbols = parsed
      .filter((value): value is string => typeof value === 'string')
      .map(value => value.trim().toUpperCase())
      .filter(Boolean);
    return [...new Set(symbols)];
  } catch {
    return defaults;
  }
}

function saveTrackerSymbols(symbols: string[]) {
  try {
    localStorage.setItem(TRACKER_SYMBOLS_STORAGE_KEY, JSON.stringify(symbols));
  } catch {
    // Browser storage is a convenience; tracker operation must still work without it.
  }
}

const TRACKER_SYMBOL_ALIASES: Record<string, string> = {
  SALESFORCE: 'CRM',
  MICROSOFT: 'MSFT',
  NVIDIA: 'NVDA',
  MICRON: 'MU',
  ONDAS: 'ONDS',
  ONDASNETWORKS: 'ONDS',
  SERVICENOW: 'NOW',
  NEBIUS: 'NBIS',
  SANDISK: 'SNDK',
  TSMC: 'TSM',
};

function resolveTrackerSymbol(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  return TRACKER_SYMBOL_ALIASES[normalized] || normalized;
}

export default function ProgressTracker({ livePrices }: ProgressTrackerProps) {
  const [selectedStock, setSelectedStock] = useState<string>('NBIS');
  const [milestones] = useState<Milestone[]>(INITIAL_MILESTONES);
  const [activeMilestoneId, setActiveMilestoneId] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<{ date: string; price: number }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [secMilestones, setSecMilestones] = useState<Milestone[]>([]);
  const [secMilestoneLoading, setSecMilestoneLoading] = useState(false);
  const [secMilestoneError, setSecMilestoneError] = useState<string | null>(null);
  const [milestoneSourceStatus, setMilestoneSourceStatus] = useState<{
    sec?: { status?: string; count?: number; error?: string | null };
    web?: { status?: string; count?: number; providers?: string[]; errors?: string[] };
    x?: { status?: string; count?: number; configured?: boolean; error?: string | null };
  } | null>(null);
  const [milestoneRetrievedAt, setMilestoneRetrievedAt] = useState<string | null>(null);
  const [tickerInput, setTickerInput] = useState('');
  const [tickerResolving, setTickerResolving] = useState(false);
  const [tickerResolveError, setTickerResolveError] = useState<string | null>(null);
  const [resolvedIssuer, setResolvedIssuer] = useState<string | null>(null);
  const [trackerSymbols, setTrackerSymbols] = useState<string[]>(() => loadTrackerSymbols());
  const [customizeTracker, setCustomizeTracker] = useState(false);

  const addTrackerSymbol = (symbol: string) => {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) return;
    setTrackerSymbols(prev => {
      const next = prev.includes(normalized) ? prev : [...prev, normalized];
      saveTrackerSymbols(next);
      return next;
    });
  };

  const removeTrackerSymbol = (symbol: string) => {
    setTrackerSymbols(prev => {
      if (prev.length <= 1) return prev;
      const next = prev.filter(item => item !== symbol);
      saveTrackerSymbols(next);
      if (selectedStock === symbol) {
        setSelectedStock(next[0] || Object.keys(STOCK_METADATA)[0] || '');
        setActiveMilestoneId(null);
      }
      return next;
    });
  };


  // Combine the curated timeline with live SEC milestones for the selected symbol.
  const stockMilestones = [
    ...milestones.filter((m) => m.stockSymbol === selectedStock),
    ...secMilestones.filter((m) => m.stockSymbol === selectedStock && !milestones.some(existing => existing.id === m.id))
  ].sort((a, b) => {
    const da = Date.parse(a.date) || 0;
    const db = Date.parse(b.date) || 0;
    return db - da;
  });
  const activeMilestone = stockMilestones.find((m) => m.id === activeMilestoneId) || stockMilestones[0];

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const res = await fetch('/api/company-scale?action=history&symbol=' + encodeURIComponent(selectedStock) + '&range=2y');
        if (!res.ok) throw new Error('History request failed: HTTP ' + res.status);
        const data = await res.json();
        if (!cancelled) setHistoryData(Array.isArray(data.points) ? data.points : []);
      } catch (err: any) {
        if (!cancelled) {
          setHistoryData([]);
          setHistoryError(err?.message || 'Historical market data unavailable');
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    loadHistory();
    return () => { cancelled = true; };
  }, [selectedStock]);

  // Live SEC milestone discovery makes the tracker work for any public ticker,
  // not only symbols present in the curated dashboard metadata.
  useEffect(() => {
    let cancelled = false;
    async function loadSecMilestones() {
      setSecMilestoneLoading(true);
      setSecMilestoneError(null);
      try {
        const res = await fetch('/api/company-scale?action=milestones&symbol=' + encodeURIComponent(selectedStock) + '&limit=12');
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'SEC milestone lookup failed');
        if (!cancelled) {
          const events = Array.isArray(data.events) ? data.events : [];
          setSecMilestones(events);
          setMilestoneSourceStatus(data.sourceStatus || null);
          setMilestoneRetrievedAt(data.retrievedAt || null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setSecMilestones([]);
          setSecMilestoneError(err?.message || 'Live SEC milestones unavailable');
        }
      } finally {
        if (!cancelled) setSecMilestoneLoading(false);
      }
    }
    loadSecMilestones();
    return () => { cancelled = true; };
  }, [selectedStock]);

  const chartHistory = livePrices?.[selectedStock]
    ? (() => {
        const liveObj = livePrices[selectedStock];
        const quoteTimestamp = liveObj.asOf || liveObj.marketTime;
        const parsedQuoteTime = quoteTimestamp ? Date.parse(quoteTimestamp) : NaN;
        // Never place a delayed quote on today's date. Only use a quote when its market date is known.
        if (liveObj.stale || !Number.isFinite(parsedQuoteTime)) return [...historyData];
        const quoteDate = new Date(parsedQuoteTime).toISOString().slice(0, 10);
        const updated = historyData.map((point) =>
          point.date === quoteDate ? { ...point, price: liveObj.price } : point
        );
        if (updated.some((point) => point.date === quoteDate)) return updated;
        const lastHistoryDate = historyData[historyData.length - 1]?.date;
        return !lastHistoryDate || quoteDate > lastHistoryDate
          ? [...historyData, { date: quoteDate, price: liveObj.price }].sort((a, b) => a.date.localeCompare(b.date))
          : [...historyData];
      })()
    : [...historyData];

  const currentMeta = STOCK_METADATA[selectedStock] || { name: selectedStock, sector: 'Live Market', desc: 'Tracking this public ticker from live market and SEC feeds.', logoColor: '#22c55e' };
  const nbisVerification = selectedStock === 'NBIS' && !historyLoading && !secMilestoneLoading
    ? historyData.length > 0 && !historyError && !secMilestoneError ? 'PASS' : 'WAIT'
    : null;
  const externalProjectUpdates = secMilestones.filter(m => Boolean(m.sourceType) && m.sourceType !== 'sec-primary');
  const verifiedSecMilestoneCount = secMilestones.filter(m => m.sourceType === 'sec-primary').length;
  const socialUpdateCount = externalProjectUpdates.filter(m => m.sourceType === 'official-social' || m.sourceType === 'social-post').length;
  const updateDateLabel = (m: Milestone) => m.publishedAt
    ? new Date(m.publishedAt).toLocaleString()
    : (m.date && m.date !== 'Date not supplied' ? m.date : 'Publication date not supplied');

  const resolveAndTrack = async () => {
    const rawInput = tickerInput.trim();
    if (!rawInput || tickerResolving) return;

    const normalized = rawInput.toUpperCase().replace(/[^A-Z0-9.-]/g, '');
    const aliased = TRACKER_SYMBOL_ALIASES[normalized];
    if (aliased) {
      setTickerResolveError(null);
      setResolvedIssuer(null);
      addTrackerSymbol(aliased);
      setSelectedStock(aliased);
      setActiveMilestoneId(null);
      return;
    }

    if (/^[A-Z0-9.-]{1,20}$/.test(rawInput) && !rawInput.includes(' ')) {
      setTickerResolveError(null);
      setResolvedIssuer(null);
      addTrackerSymbol(normalized);
      setSelectedStock(normalized);
      setActiveMilestoneId(null);
      return;
    }

    setTickerResolving(true);
    setTickerResolveError(null);
    try {
      const response = await fetch('/api/company-scale?action=company-search&search=' + encodeURIComponent(rawInput), { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(body?.matches) || !body.matches.length) {
        throw new Error(body?.error || 'No public ticker match found');
      }

      const rankedMatches = rankSearchResults(body.matches, rawInput);
      const match = rankedMatches[0] || body.matches[0];
      const resolvedSymbol = String(match.ticker).toUpperCase();
      addTrackerSymbol(resolvedSymbol);
      setSelectedStock(resolvedSymbol);
      setResolvedIssuer(match.title || null);
      setActiveMilestoneId(null);
    } catch (err: any) {
      setResolvedIssuer(null);
      setTickerResolveError(err?.message || 'Ticker lookup failed');
    } finally {
      setTickerResolving(false);
    }
  };

  const getAccuratePrice = (m: Milestone) => {
    // Prefer an exact trading-day match. For month-only milestones, use the
    // nearest available trading day to the middle of that month so the UI
    // still shows a real market price instead of a missing/static value.
    const exact = chartHistory.find((pt) => matchesDate(m.date, pt.date));
    if (exact) return exact.price;

    const monthYear = m.date.trim().match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})$/i);
    if (monthYear) {
      const month = new Date(monthYear[1] + ' 1, ' + monthYear[2]).getMonth();
      const year = Number(monthYear[2]);
      const candidates = chartHistory
        .filter((pt) => {
          const d = new Date(pt.date + 'T00:00:00Z');
          return d.getUTCFullYear() === year && d.getUTCMonth() === month;
        })
        .sort((a, b) => a.date.localeCompare(b.date));
      if (candidates.length) return candidates[Math.floor((candidates.length - 1) / 2)].price;
    }

    return undefined;
  };

  // Pin dated milestones to their exact day; pin month-only milestones to the middle trading day.
  const chartMilestoneDates = stockMilestones.map(milestone => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(milestone.date)) {
      return { milestone, chartDate: chartHistory.some(point => point.date === milestone.date) ? milestone.date : null };
    }
    const monthYear = milestone.date.trim().match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})$/i);
    if (!monthYear) return { milestone, chartDate: null };
    const month = new Date(monthYear[1] + ' 1, ' + monthYear[2]).getMonth();
    const year = Number(monthYear[2]);
    const monthPoints = chartHistory
      .filter(point => {
        const date = new Date(point.date + 'T00:00:00Z');
        return date.getUTCFullYear() === year && date.getUTCMonth() === month;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    return { milestone, chartDate: monthPoints.length ? monthPoints[Math.floor((monthPoints.length - 1) / 2)].date : null };
  }).filter(item => item.chartDate);
  const chartData = chartHistory.map((pt) => {
    const eventsAtDate = chartMilestoneDates.filter(item => item.chartDate === pt.date).map(item => item.milestone);
    const milestone = eventsAtDate[0];
    return {
      ...pt,
      milestone: milestone ? eventsAtDate.map(item => item.title).join(' · ') : null,
      milestoneId: milestone ? milestone.id : null,
      milestonePrice: milestone ? getAccuratePrice(milestone) : null,
      milestoneCount: eventsAtDate.length,
    };
  });


  // Custom tool tip for chart
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const pt = payload[0].payload;
      return (
        <div className="bg-[#15181E] border border-white/15 p-3 rounded shadow-xl text-xs space-y-1 font-mono">
          <p className="text-white/40">{pt.date}</p>
          <p className="text-white font-bold">Stock Price: ${formatPrice(pt.price)}</p>
          {pt.milestone && (
            <div className="mt-1 pt-1.5 border-t border-white/10 text-emerald-400 font-bold">
              ★ {pt.milestone} (Price: ${formatPrice(pt.milestonePrice)})
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6" id="tracker-view">
      {/* Page Header */}
      <div className="aiw-page-header flex flex-col space-y-1 md:space-y-2 border-b border-white/10 pb-4">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Section 03 / Markets</span>
        <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase italic text-white">
          Build-Out &amp; Stock Price Progress Tracker
        </h1>
        <p className="text-xs text-white/60 max-w-3xl leading-relaxed">
          Observe how concrete progression events—data center scaling, chip validation, and cloud leases—correlate with historical stock prices in real-time.
        </p>
      </div>

      {/* Stock Selection + Arbitrary Ticker Search */}
      <div className="space-y-4 border-b border-white/10 pb-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex-1">
            <label className="text-[9px] font-mono uppercase tracking-widest text-white/40 block mb-1.5">
              Track any public ticker
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-white/30 absolute left-3 top-2.5" />
                <input
                  value={tickerInput}
                  onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && tickerInput.trim()) {
                      void resolveAndTrack();
                    }
                  }}
                  placeholder="e.g. AAPL, CRM, Salesforce, ONDAS"
                  className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-emerald-400/50 placeholder-white/20 font-mono"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  void resolveAndTrack();
                }}
                className="px-4 py-2.5 bg-emerald-500 text-black rounded text-[10px] font-mono font-black uppercase tracking-wider hover:bg-emerald-400 transition cursor-pointer"
              >
                {tickerResolving ? 'Resolving…' : 'Track'}
              </button>
            </div>
            <p className="text-[9px] text-white/30 font-mono mt-1.5">
              Enter a ticker or company name. Company names are resolved against the SEC public company ticker directory, then loaded from live market history and recent SEC 8-K milestones.
            </p>
            {resolvedIssuer && (
              <p className="text-[9px] text-cyan-300/80 font-mono mt-1">
                Resolved: {resolvedIssuer} → {selectedStock}
              </p>
            )}
            {tickerResolveError && (
              <p className="text-[9px] text-amber-300 font-mono mt-1">
                {tickerResolveError}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-mono uppercase tracking-widest text-white/40">Saved tracker tickers</span>
            <button
              type="button"
              onClick={() => setCustomizeTracker(value => !value)}
              className="px-2.5 py-1.5 rounded border border-white/10 bg-white/5 text-[9px] font-mono font-bold uppercase tracking-wider text-white/60 hover:text-white hover:bg-white/10 transition cursor-pointer"
              aria-expanded={customizeTracker}
            >
              {customizeTracker ? 'Done' : 'Customize'}
            </button>
          </div>
          {customizeTracker && (
            <div className="rounded-lg border border-cyan-300/15 bg-cyan-300/[.03] p-2.5 text-[9px] font-mono text-white/45">
              Search any public ticker or company above to add it. Use × on a chip to remove it from your saved tracker list.
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {trackerSymbols.map((symbol) => {
              const isSelected = selectedStock === symbol;
              const color = STOCK_METADATA[symbol]?.logoColor || '#94a3b8';
              return (
                <div
                  key={symbol}
                  className={`inline-flex items-center rounded border transition ${
                    isSelected
                      ? 'bg-white text-black border-white'
                      : 'bg-white/5 text-white/60 border-white/10'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStock(symbol);
                      setTickerInput('');
                      setActiveMilestoneId(null);
                    }}
                    className="px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider cursor-pointer hover:opacity-90"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span>{symbol}</span>
                    </span>
                  </button>
                  {customizeTracker && (
                    <button
                      type="button"
                      onClick={() => removeTrackerSymbol(symbol)}
                      className="mr-1 p-1 rounded text-white/30 hover:text-rose-300 hover:bg-rose-300/10 cursor-pointer"
                      aria-label={`Remove ${symbol} from saved tracker tickers`}
                      title={`Remove ${symbol}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-cyan-100/80">
          {secMilestoneLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
          <span>
            {secMilestoneLoading
              ? 'Checking SEC filings, company announcements, news and X…'
              : verifiedSecMilestoneCount + ' SEC filings · ' + externalProjectUpdates.length + ' company/news/social updates'}
          </span>
          {!secMilestoneLoading && milestoneRetrievedAt && (
            <span className="text-[10px] text-white/35 normal-case tracking-normal">
              Last checked {new Date(milestoneRetrievedAt).toLocaleTimeString()}
            </span>
          )}
          {socialUpdateCount > 0 && <span className="rounded border border-cyan-300/20 px-2 py-0.5 text-[10px]">{socialUpdateCount} social posts</span>}
          {milestoneSourceStatus?.x?.status === 'not-configured' && (
            <span className="text-amber-200/80 normal-case tracking-normal">
              Direct X API is not connected; available web/news search still runs.
            </span>
          )}
          {milestoneSourceStatus?.x?.status === 'credentials-rejected' && (
            <span className="text-amber-200/80 normal-case tracking-normal">X credentials were rejected; check X_BEARER_TOKEN in server settings.</span>
          )}
          {milestoneSourceStatus?.x?.error && milestoneSourceStatus.x.status !== 'not-configured' && (
            <span className="text-amber-200/80 normal-case tracking-normal">X search: {milestoneSourceStatus.x.error}</span>
          )}
          {secMilestoneError && <span className="text-amber-200/80 normal-case tracking-normal">SEC lookup: {secMilestoneError}</span>}
          {milestoneSourceStatus?.sec?.error && <span className="text-amber-200/80 normal-case tracking-normal">SEC lookup: {milestoneSourceStatus.sec.error}</span>}
          {nbisVerification && <span className={nbisVerification === 'PASS' ? 'text-emerald-300' : 'text-amber-300'}>NBIS data-path check: {nbisVerification}</span>}
        </div>
      </div>

      <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[.025] p-4 md:p-5 space-y-3" data-testid="tracker-company-updates" aria-labelledby="tracker-company-updates-title">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
          <div>
            <h2 id="tracker-company-updates-title" className="text-base md:text-lg font-bold text-white">Latest company and X project updates</h2>
            <p className="text-xs text-white/55 mt-1 max-w-3xl leading-relaxed">
              Recent announcements and social posts related to construction, capacity, equipment delivery and deployment. Company posts are company-reported evidence; news leads still need confirmation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSecMilestoneLoading(true);
              setSecMilestoneError(null);
              fetch('/api/company-scale?action=milestones&symbol=' + encodeURIComponent(selectedStock) + '&limit=12&refresh=true', { cache: 'no-store' })
                .then(async response => {
                  const payload = await response.json().catch(() => ({}));
                  if (!response.ok) throw new Error(payload?.error || 'Project updates could not be refreshed.');
                  setSecMilestones(Array.isArray(payload.events) ? payload.events : []);
                  setMilestoneSourceStatus(payload.sourceStatus || null);
                  setMilestoneRetrievedAt(payload.retrievedAt || null);
                })
                .catch(error => setSecMilestoneError(error instanceof Error ? error.message : 'Project updates could not be refreshed.'))
                .finally(() => setSecMilestoneLoading(false));
            }}
            disabled={secMilestoneLoading}
            className="shrink-0 rounded-lg border border-cyan-300/20 bg-cyan-300/5 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-50"
            data-testid="tracker-refresh-project-updates"
          >
            {secMilestoneLoading ? 'Refreshing…' : 'Refresh updates'}
          </button>
        </div>
        {externalProjectUpdates.length ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {externalProjectUpdates.slice(0, 8).map(item => {
              const official = item.sourceType === 'official-company' || item.sourceType === 'official-social';
              const social = item.sourceType === 'official-social' || item.sourceType === 'social-post';
              const className = official
                ? 'border-emerald-300/20 bg-emerald-300/5 text-emerald-100'
                : social
                  ? 'border-cyan-300/20 bg-cyan-300/5 text-cyan-100'
                  : 'border-amber-300/20 bg-amber-300/5 text-amber-100';
              const label = item.sourceType === 'official-company'
                ? 'Official company update'
                : item.sourceType === 'official-social'
                  ? 'Official company X post'
                  : item.sourceType === 'social-post'
                    ? 'Social post · confirm source'
                    : item.sourceType === 'syndicated-release'
                      ? 'Syndicated release · verify original'
                      : 'News lead · not confirmed';
              return (
                <article key={item.id} className="rounded-xl border border-white/10 bg-[#101216] p-3 md:p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={'rounded border px-2 py-1 text-[10px] font-semibold ' + className}>{label}</span>
                    {item.category && <span className="text-[10px] text-white/40">{item.category}</span>}
                  </div>
                  <h3 className="text-sm font-semibold leading-snug text-white">{item.title}</h3>
                  <p className="text-xs leading-relaxed text-white/55">{item.description}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2">
                    <span className="text-[10px] text-white/35">{item.source || 'Source not identified'} · {updateDateLabel(item)}</span>
                    {(item.sourceUrl || item.url) && (
                      <a href={item.sourceUrl || item.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-cyan-200 underline underline-offset-2 hover:text-cyan-100">
                        Open source ↗
                      </a>
                    )}
                  </div>
                  {item.relatedSources?.length ? (
                    <div className="text-[10px] text-white/35">Additional matching sources: {item.relatedSources.length}</div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 bg-black/10 p-4 text-sm text-white/45">
            {secMilestoneLoading ? 'Searching for recent updates…' : 'No recent company or social updates matched this ticker. SEC filing events and curated milestones remain available below.'}
          </div>
        )}
        <p className="text-[11px] text-white/35 leading-relaxed">
          A company post is a reported update, not independent proof that construction is complete. We show dated sources and keep secondary news separate from official company evidence.
        </p>
      </section>

      {/* Interactive Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart Column */}
        <div className="lg:col-span-2 bg-[#15181E] border border-white/10 rounded-2xl p-4 md:p-5 flex flex-col space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-black uppercase italic tracking-tight text-white">{currentMeta.name} ({selectedStock})</h2>
              <span className="text-[10px] text-emerald-400 font-mono tracking-wider uppercase">{currentMeta.sector}</span>
            </div>
            <div className="text-right text-[10px] font-mono font-bold uppercase tracking-wider bg-white/5 border border-white/10 px-3 py-1.5 rounded text-white/60">
              Interactive Milestone Overlay
            </div>
          </div>

          {/* Recharts Wrapper */}
          <div className="h-64 md:h-80 w-full bg-[#0F1115] rounded-xl p-2 border border-white/5">
            {historyLoading && <div className="text-[10px] font-mono text-white/40 p-2">Loading verified daily market history…</div>}
            {!historyLoading && historyError && <div className="text-[10px] font-mono text-amber-300 p-2">{historyError}</div>}
            {!historyLoading && !historyError && chartHistory.length === 0 && <div className="text-[10px] font-mono text-white/40 p-2">No public market history is available for this symbol.</div>}
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 15, right: 15, left: -20, bottom: 5 }}>
                <XAxis dataKey="date" stroke="#64748b" style={{ fontSize: '10px', fontFamily: 'JetBrains Mono', fontWeight: 700 }} />
                <YAxis stroke="#64748b" domain={['auto', 'auto']} style={{ fontSize: '10px', fontFamily: 'JetBrains Mono', fontWeight: 700 }} />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke={currentMeta.logoColor}
                  strokeWidth={2.5}
                  activeDot={{ r: 6 }}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (payload.milestone) {
                      const isActive = payload.milestoneId === activeMilestone?.id;
                      return (
                        <circle
                          key={payload.date}
                          cx={cx}
                          cy={cy}
                          r={isActive ? 8 : 5}
                          fill="#15803d"
                          stroke="#4ade80"
                          strokeWidth={isActive ? 3 : 1.5}
                          className="cursor-pointer animate-pulse"
                          onClick={() => setActiveMilestoneId(payload.milestoneId)}
                        />
                      );
                    }
                    return <circle key={payload.date} cx={cx} cy={cy} r={2} fill={currentMeta.logoColor} />;
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 text-center">
            ★ Click any green milestone dot on the chart to read event briefs and stock valuation impacts.
          </p>
        </div>

        {/* Milestone Detail Sidebar */}
        <div className="bg-[#15181E]/40 border border-white/10 rounded-2xl p-5 flex flex-col justify-between space-y-4 min-h-0">
          {activeMilestone ? (
            <div className="space-y-4 max-h-[420px] lg:max-h-[520px] overflow-y-auto pr-2 aiw-scroll-region min-h-0">
              <div className="flex justify-between items-start border-b border-white/10 pb-3">
                <div className="space-y-1">
                  <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/40">Selected Progression</span>
                  <h3 className="text-base font-black uppercase tracking-tight text-white mt-1 leading-tight">{activeMilestone.title}</h3>
                </div>
                <span className={`text-[9px] font-mono font-bold px-2.5 py-1 rounded ${
                  activeMilestone.status === 'done'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : activeMilestone.status === 'active'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-white/5 text-white/40 border border-white/10'
                }`}>
                  {activeMilestone.status === 'done' && 'DONE'}
                  {activeMilestone.status === 'active' && 'IN PROGRESS'}
                  {activeMilestone.status === 'planned' && 'PLANNED'}
                </span>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-white/40">Milestone Date:</span>
                  <span className="text-white font-bold flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5 text-white/40 mr-1" />
                    {activeMilestone.date}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Price at Event:</span>
                  <span className="text-emerald-400 font-bold">${formatPrice(getAccuratePrice(activeMilestone))}</span>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded p-3.5">
                <p className="text-xs text-white/60 leading-relaxed">
                  {activeMilestone.description}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-white/40 font-mono text-xs">
              No milestones available for this stock.
            </div>
          )}

          <div className="pt-4 border-t border-white/10 bg-white/5 p-3 rounded border border-white/10">
            <span className="text-[10px] font-mono text-white/60 flex items-center flex-wrap gap-2">
              <span className="inline-flex items-center space-x-1.5">
                <Award className="w-4 h-4 text-emerald-400" />
                <span>Current price: ${formatPrice(livePrices?.[selectedStock]?.price ?? historyData[historyData.length - 1]?.price)}</span>
              </span>
              {livePrices?.[selectedStock] && <FreshnessBadge {...livePrices[selectedStock]} showAge />}
            </span>
          </div>
        </div>
      </div>

      {/* Source-backed project updates replace the previous fixed capacity percentages. */}

      {/* Timeline of All Stock Milestones */}
      <div className="bg-[#15181E]/30 border border-white/10 rounded-2xl p-5 md:p-6 space-y-6">
        <h3 className="text-xs font-black uppercase tracking-widest text-white">Milestone Chronology ({selectedStock})</h3>
        <div className="relative border-l-2 border-white/10 pl-4 space-y-6 ml-2 font-mono min-h-[280px] max-h-[55vh] overflow-y-auto pr-2 aiw-scroll-region">
          {stockMilestones.length === 0 ? (
            <p className="text-xs text-white/40">No SEC events were returned for this ticker yet.</p>
          ) : (
            stockMilestones.map((m) => {
              const isActive = m.id === activeMilestone?.id;
              return (
                <div
                  key={m.id}
                  onClick={() => setActiveMilestoneId(m.id)}
                  className={`group relative pl-2 cursor-pointer transition ${
                    isActive ? 'text-emerald-400' : 'text-white/60 hover:text-white'
                  }`}
                >
                  {/* Timeline Node Ring */}
                  <div className={`absolute -left-[27px] w-4 h-4 rounded-full border-2 bg-[#0F1115] flex items-center justify-center transition ${
                    isActive ? 'border-emerald-400 scale-110' : 'border-white/10 group-hover:border-white/40'
                  }`}>
                    {m.status === 'done' ? (
                      <CheckCircle className="w-2.5 h-2.5 text-emerald-400" />
                    ) : m.status === 'active' ? (
                      <Clock className="w-2.5 h-2.5 text-amber-500" />
                    ) : (
                      <AlertCircle className="w-2.5 h-2.5 text-white/20" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                      <span className="text-white/40 font-bold">{m.date}</span>
                      <span className="text-[10px] text-white/20">|</span>
                      <span className="text-emerald-400 font-bold">Price: ${formatPrice(getAccuratePrice(m))}</span>
                    </div>
                    <h4 className="text-sm font-black uppercase tracking-tight text-white group-hover:underline">{m.title}</h4>
                    <p className="text-xs text-white/60 max-w-2xl font-sans mt-1">
                      {m.description.slice(0, 110)}...
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>


    </div>
  );
}