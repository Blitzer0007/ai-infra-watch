import { useEffect, useMemo, useState } from 'react';
import { Search, AlertTriangle, Loader2, ExternalLink, Activity } from 'lucide-react';
import { formatPrice } from '../utils';
import { CongressTrade } from '../types';
import JevDecisionPanel from './JevDecisionPanel';
import { FilterInput, FilterSelect } from './FilterControls';
import DataTable from './DataTable';

interface CongressTradesProps {
  liveTrades?: CongressTrade[];
}

type HistoryPoint = {
  date: string;
  price: number;
};

type TradeReaction = {
  eventDate: string;
  eventPrice: number;
  nextDate: string | null;
  nextPrice: number | null;
  day5: number | null;
  day20: number | null;
  nextPct: number | null;
  day5Pct: number | null;
  day20Pct: number | null;
  benchmarkNextPct: number | null;
  benchmarkDay5Pct: number | null;
  benchmarkDay20Pct: number | null;
  excessNextPct: number | null;
  excessDay5Pct: number | null;
  excessDay20Pct: number | null;
};

type SourceStatus = {
  label: string;
  kind: 'bargo' | 'fallback' | 'cache' | 'unavailable' | 'loading';
  stale: boolean;
  sourceUrl: string | null;
  upstreamError: string | null;
};

const TRACKED_SYMBOLS = ['DGXX', 'DRAM', 'SOXL', 'NVDA', 'MSFT', 'NBIS', 'VIVO', 'META', 'NOW', 'PHVS'];
const historyCache: Record<string, Promise<HistoryPoint[]>> = {};
const benchmarkHistoryCache: Record<string, Promise<HistoryPoint[]>> = {};

function loadHistory(symbol: string): Promise<HistoryPoint[]> {
  const key = symbol.trim().toUpperCase();
  if (!historyCache[key]) {
    historyCache[key] = fetch('/api/company-scale?action=history&symbol=' + encodeURIComponent(key) + '&range=5y')
      .then(async (res) => {
        if (!res.ok) throw new Error('History HTTP ' + res.status);
        const data = await res.json();
        return Array.isArray(data?.points) ? data.points : [];
      })
      .catch(() => []);
  }
  return historyCache[key];
}

function pct(from: number | null, to: number | null): number | null {
  if (from == null || to == null || !Number.isFinite(from) || !Number.isFinite(to) || from === 0) {
    return null;
  }
  return ((to - from) / from) * 100;
}

function reactionFor(history: HistoryPoint[], benchmarkHistory: HistoryPoint[], tradeDate: string): TradeReaction | null {
  if (!history.length || !tradeDate) return null;
  const eventIndex = history.findIndex((point) => point.date >= tradeDate);
  if (eventIndex < 0) return null;

  const event = history[eventIndex];
  const next = history[eventIndex + 1] || null;
  const day5 = history[eventIndex + 5] || null;
  const day20 = history[eventIndex + 20] || null;
  const benchmarkIndex = benchmarkHistory.findIndex((point) => point.date >= event.date);
  const benchmarkEvent = benchmarkIndex >= 0 ? benchmarkHistory[benchmarkIndex] : null;
  const benchmarkNext = benchmarkIndex >= 0 ? benchmarkHistory[benchmarkIndex + 1] : null;
  const benchmarkDay5 = benchmarkIndex >= 0 ? benchmarkHistory[benchmarkIndex + 5] : null;
  const benchmarkDay20 = benchmarkIndex >= 0 ? benchmarkHistory[benchmarkIndex + 20] : null;

  const nextPct = pct(event.price, next?.price ?? null);
  const day5Pct = pct(event.price, day5?.price ?? null);
  const day20Pct = pct(event.price, day20?.price ?? null);
  const benchmarkNextPct = pct(benchmarkEvent?.price ?? null, benchmarkNext?.price ?? null);
  const benchmarkDay5Pct = pct(benchmarkEvent?.price ?? null, benchmarkDay5?.price ?? null);
  const benchmarkDay20Pct = pct(benchmarkEvent?.price ?? null, benchmarkDay20?.price ?? null);

  return {
    eventDate: event.date,
    eventPrice: event.price,
    nextDate: next?.date || null,
    nextPrice: next?.price || null,
    day5: day5?.price || null,
    day20: day20?.price || null,
    nextPct,
    day5Pct,
    day20Pct,
    benchmarkNextPct,
    benchmarkDay5Pct,
    benchmarkDay20Pct,
    excessNextPct: nextPct == null || benchmarkNextPct == null ? null : nextPct - benchmarkNextPct,
    excessDay5Pct: day5Pct == null || benchmarkDay5Pct == null ? null : day5Pct - benchmarkDay5Pct,
    excessDay20Pct: day20Pct == null || benchmarkDay20Pct == null ? null : day20Pct - benchmarkDay20Pct,
  };
}

function formatPct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '—';
  return (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
}

function reactionTone(value: number | null) {
  return value == null
    ? 'text-white/30'
    : value >= 0
      ? 'text-emerald-400'
      : 'text-rose-400';
}

function sourceTone(status: SourceStatus) {
  switch (status.kind) {
    case 'bargo':
      return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300';
    case 'fallback':
      return 'border-amber-400/20 bg-amber-400/10 text-amber-300';
    case 'cache':
      return 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300';
    case 'unavailable':
      return 'border-rose-400/20 bg-rose-400/10 text-rose-300';
    default:
      return 'border-white/10 bg-white/5 text-white/50';
  }
}

const INITIAL_SOURCE: SourceStatus = {
  label: 'Loading source…',
  kind: 'loading',
  stale: false,
  sourceUrl: null,
  upstreamError: null,
};

export default function CongressTrades(_props: CongressTradesProps) {
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('ct_q') || '');
  const [chamberFilter, setChamberFilter] = useState<'all' | 'Senate' | 'House'>(() => {
    const value = new URLSearchParams(window.location.search).get('ct_chamber');
    return value === 'Senate' || value === 'House' ? value : 'all';
  });
  const [transactionFilter, setTransactionFilter] = useState<'all' | 'buy' | 'sell'>(() => {
    const value = new URLSearchParams(window.location.search).get('ct_type');
    return value === 'buy' || value === 'sell' ? value : 'all';
  });
  const [dateFilter, setDateFilter] = useState<'all' | '30' | '90' | '365'>(() => {
    const value = new URLSearchParams(window.location.search).get('ct_date');
    return value === '30' || value === '90' || value === '365' ? value : 'all';
  });
  const [symbolFilter, setSymbolFilter] = useState(() => new URLSearchParams(window.location.search).get('ct_symbol') || 'NVDA');
  const [trades, setTrades] = useState<CongressTrade[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [searchTrades, setSearchTrades] = useState<CongressTrade[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [benchmarkHistory, setBenchmarkHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceStatus, setSourceStatus] = useState<SourceStatus>(INITIAL_SOURCE);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const keys = ['ct_q', 'ct_chamber', 'ct_type', 'ct_date', 'ct_symbol'];
    const values: Record<string, string> = {
      ct_q: search.trim(),
      ct_chamber: chamberFilter,
      ct_type: transactionFilter,
      ct_date: dateFilter,
      ct_symbol: symbolFilter,
    };

    for (const key of keys) {
      const value = values[key];
      if (!value || (key !== 'ct_q' && ((key === 'ct_chamber' && value === 'all') || (key === 'ct_type' && value === 'all') || (key === 'ct_date' && value === 'all')))) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    const query = params.toString();
    const url = window.location.pathname + (query ? '?' + query : '') + window.location.hash;
    window.history.replaceState(window.history.state, '', url);
  }, [search, chamberFilter, transactionFilter, dateFilter, symbolFilter]);

  useEffect(() => {
    let cancelled = false;

    async function loadTrades() {
      setLoading(true);
      setError(null);
      setSourceStatus(INITIAL_SOURCE);

      try {
        const res = await fetch('/api/congress-trades?symbol=' + encodeURIComponent(symbolFilter));
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.upstreamError || data?.error || 'Congress trades request failed');
        }

        if (!cancelled) {
          setTrades(Array.isArray(data?.trades) ? data.trades : []);
          setSourceStatus({
            label: data?.sourceLabel || 'Congress trade source',
            kind:
              data?.source === 'datadawn'
                ? 'fallback'
                : data?.source === 'cache'
                  ? 'cache'
                  : 'bargo',
            stale: Boolean(data?.stale),
            sourceUrl: data?.sourceUrl || null,
            upstreamError: data?.upstreamError || null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setTrades([]);
          setSourceStatus({
            label: 'All Congress trade sources unavailable',
            kind: 'unavailable',
            stale: false,
            sourceUrl: null,
            upstreamError: err instanceof Error ? err.message : 'Congress trades unavailable',
          });
          setError(err instanceof Error ? err.message : 'Congress trades unavailable');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTrades();
    return () => {
      cancelled = true;
    };
  }, [symbolFilter]);

  useEffect(() => {
    const needle = search.trim();
    if (!needle) {
      setSearchTrades([]);
      setGlobalLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setGlobalLoading(true);
      try {
        const res = await fetch(
          '/api/congress-trades?symbol=ALL&q=' + encodeURIComponent(needle),
          { headers: { Accept: 'application/json' } }
        );
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.upstreamError || data?.error || 'Congress search failed');
        }

        if (!cancelled) {
          setSearchTrades(Array.isArray(data?.trades) ? data.trades : []);
          setSourceStatus({
            label: data?.sourceLabel || 'Congress search source',
            kind:
              data?.source === 'datadawn'
                ? 'fallback'
                : data?.source === 'cache'
                  ? 'cache'
                  : 'bargo',
            stale: Boolean(data?.stale),
            sourceUrl: data?.sourceUrl || null,
            upstreamError: data?.upstreamError || null,
          });
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setSearchTrades([]);
          setError(err instanceof Error ? err.message : 'Congress search failed');
        }
      } finally {
        if (!cancelled) setGlobalLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search]);

  useEffect(() => {
    if (symbolFilter === 'ALL') {
      setHistory([]);
      return;
    }

    let cancelled = false;
    setHistoryLoading(true);

    Promise.all([
      loadHistory(symbolFilter),
      (benchmarkHistoryCache.SPY || (benchmarkHistoryCache.SPY = fetch('/api/company-scale?action=history&symbol=SPY&range=5y')
        .then(async (res) => {
          if (!res.ok) throw new Error('SPY history unavailable');
          const data = await res.json();
          return Array.isArray(data?.points) ? data.points : [];
        })
        .catch(() => []))),
    ]).then(([points, spyPoints]) => {
      if (cancelled) return;
      setHistory(points);
      setBenchmarkHistory(spyPoints);
    }).finally(() => {
      if (!cancelled) setHistoryLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [symbolFilter]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    // An active search intentionally expands to the global disclosure feed.
    // This prevents "Search politician or symbol" from appearing broken just
    // because the currently selected ticker has no matching record.
    const sourceTrades = needle ? searchTrades : trades;
    const now = Date.now();

    return sourceTrades.filter((t) => {
      const matchesSymbol = symbolFilter === 'ALL' || needle ? true : t.stockSymbol === symbolFilter;
      const normalizedChamber = String(t.chamber || '').trim().toLowerCase();
      const matchesChamber = chamberFilter === 'all' || normalizedChamber === chamberFilter.toLowerCase();
      const matchesType = transactionFilter === 'all' || t.transactionType === transactionFilter;
      const tradeDate = t.transactionDate || t.date;
      const ageDays = tradeDate
        ? (now - new Date(tradeDate + 'T00:00:00Z').getTime()) / 86400000
        : Number.POSITIVE_INFINITY;
      const matchesDate = dateFilter === 'all' || ageDays <= Number(dateFilter);
      return matchesSymbol && matchesChamber && matchesType && matchesDate;
    });
  }, [trades, searchTrades, chamberFilter, transactionFilter, dateFilter, search, symbolFilter]);

  const reactions = useMemo(() => {
    if (symbolFilter === 'ALL') return [];
    return filtered
      .filter((trade) => trade.stockSymbol === symbolFilter)
      .map((trade) => ({
        trade,
        reaction: reactionFor(history, benchmarkHistory, trade.filingDate || trade.date || trade.transactionDate),
      }))
      .filter((row) => row.reaction);
  }, [filtered, history, benchmarkHistory, symbolFilter]);

  const reactionSummary = useMemo(() => {
    const avg = (values: Array<number | null | undefined>) => {
      const usable = values.filter((v): v is number => v != null && Number.isFinite(v));
      return usable.length ? usable.reduce((a, b) => a + b, 0) / usable.length : null;
    };
    const summarize = (rows: typeof reactions) => ({
      matched: rows.length,
      next: avg(rows.map(row => row.reaction?.nextPct)),
      day5: avg(rows.map(row => row.reaction?.day5Pct)),
      day20: avg(rows.map(row => row.reaction?.day20Pct)),
      excessNext: avg(rows.map(row => row.reaction?.excessNextPct)),
      excessDay5: avg(rows.map(row => row.reaction?.excessDay5Pct)),
      excessDay20: avg(rows.map(row => row.reaction?.excessDay20Pct)),
    });
    const buys = reactions.filter(row => row.trade.transactionType === 'buy');
    const sells = reactions.filter(row => row.trade.transactionType === 'sell');
    return { all: summarize(reactions), buy: summarize(buys), sell: summarize(sells) };
  }, [reactions]);

  const reactionById = useMemo(() => {
    const map = new Map<string, TradeReaction>();
    reactions.forEach(({ trade, reaction }) => {
      if (reaction) map.set(trade.id, reaction);
    });
    return map;
  }, [reactions]);

  return (
    <div className="space-y-6" id="congress-view">
      <JevDecisionPanel
        kind="congress"
        title="Congress disclosure review"
        state={{
          selected_symbol: symbolFilter,
          source: sourceStatus.label,
          chamber_filter: chamberFilter,
          matched_trades: filtered.length,
          trades: filtered.slice(0, 8).map((trade) => ({
            symbol: trade.stockSymbol,
            chamber: trade.chamber,
            transaction_type: trade.transactionType,
            amount_range: trade.amountRange,
            transaction_date: trade.transactionDate || trade.date,
            filing_date: trade.filingDate,
          })),
          historical_reaction_matches: reactionSummary.matched,
        }}
      />

      <div className="aiw-page-header flex flex-col space-y-1 md:space-y-2 border-b border-white/10 pb-4">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Section 04 / Signals</span>
        <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase italic text-white">
          Congressional Trading Signals
        </h1>
        <p className="text-xs text-white/60 max-w-3xl leading-relaxed">
          Track public congressional disclosure records across searchable tickers, company names, and members. The preset buttons are only shortcuts.
        </p>
      </div>

      <div className="flex items-start space-x-3 bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 text-white/80">
        <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-500" />
        <div className="text-xs leading-relaxed">
          <span className="font-black uppercase tracking-wider text-white">Data note:</span> Filing dates can lag the underlying transaction date. Historical price context below is anchored to the disclosure/filing date when available. The transaction date remains a separate field and is not substituted for the disclosure timestamp.
        </div>
      </div>

      <div className="bg-[#15181E]/30 border border-white/10 p-4 rounded-xl space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSymbolFilter('ALL')}
            className={'px-3 py-2 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-wider transition ' +
              (symbolFilter === 'ALL'
                ? 'bg-white text-black border-white'
                : 'bg-white/5 text-white/50 border-white/10 hover:text-white')}
          >
            Latest Global
          </button>
          {TRACKED_SYMBOLS.map((symbol) => (
            <button
              key={symbol}
              onClick={() => setSymbolFilter(symbol)}
              className={'px-3 py-2 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-wider transition ' +
                (symbolFilter === symbol
                  ? 'bg-emerald-400/10 border-emerald-400/25 text-emerald-300'
                  : 'bg-white/5 text-white/50 border-white/10 hover:text-white')}
            >
              {symbol}
            </button>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="flex space-x-2 w-full lg:w-auto">
            {(['all', 'Senate', 'House'] as const).map((ch) => (
              <button
                key={ch}
                onClick={() => setChamberFilter(ch)}
                className={'px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider rounded border transition flex-1 lg:flex-initial ' +
                  (chamberFilter === ch
                    ? 'bg-white text-black border-white'
                    : 'bg-white/5 text-white/60 border-white/10 hover:text-white hover:bg-white/10')}
              >
                {ch === 'all' ? 'All Chambers' : ch}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              value={transactionFilter}
              onChange={(e) => setTransactionFilter(e.target.value as 'all' | 'buy' | 'sell')}
              label="Filter Congress trades by transaction type"
              className="font-mono text-[10px] uppercase tracking-wider text-white/60"
            >
              <option value="all">All Types</option>
              <option value="buy">Buy only</option>
              <option value="sell">Sell only</option>
            </FilterSelect>
            <FilterSelect
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as 'all' | '30' | '90' | '365')}
              label="Filter Congress trades by transaction age"
              className="font-mono text-[10px] uppercase tracking-wider text-white/60"
            >
              <option value="all">All Dates</option>
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
              <option value="365">Last 365 Days</option>
            </FilterSelect>
          </div>

          <div className="relative w-full lg:w-80">
            <FilterInput
              type="text"
              placeholder="Search member, company, or ticker..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              label="Search Congress trades by politician, company, symbol, type, amount, or date"
              className="font-mono"
            />
            {search.trim() && globalLoading && (
              <Loader2 className="w-3.5 h-3.5 text-cyan-300 absolute right-3 top-1/2 -translate-y-1/2" aria-label="Searching Congress trades" />
            )}
          </div>
        </div>
      </div>

      {symbolFilter !== 'ALL' && (
        <div className="bg-[#15181E]/30 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-cyan-300" />
            <div>
              <div className="text-xs font-black text-white uppercase tracking-wider">Historical price context · {symbolFilter}</div>
              <div className="text-[9px] text-white/30 font-mono mt-1">
                Anchored to the transaction date; this shows what the market did afterward and does not establish that the trade caused the move.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <SummaryMetric label="All matched" value={String(reactionSummary.all.matched)} tone="text-white" />
            <SummaryMetric label="Buy 5D vs SPY" value={formatPct(reactionSummary.buy.excessDay5)} tone={reactionTone(reactionSummary.buy.excessDay5)} />
            <SummaryMetric label="Sell 5D vs SPY" value={formatPct(reactionSummary.sell.excessDay5)} tone={reactionTone(reactionSummary.sell.excessDay5)} />
            <SummaryMetric label="All 20D vs SPY" value={formatPct(reactionSummary.all.excessDay20)} tone={reactionTone(reactionSummary.all.excessDay20)} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-2">
            <SummaryMetric label="Buy next" value={formatPct(reactionSummary.buy.next)} tone={reactionTone(reactionSummary.buy.next)} />
            <SummaryMetric label="Buy 5D" value={formatPct(reactionSummary.buy.day5)} tone={reactionTone(reactionSummary.buy.day5)} />
            <SummaryMetric label="Buy 20D" value={formatPct(reactionSummary.buy.day20)} tone={reactionTone(reactionSummary.buy.day20)} />
            <SummaryMetric label="Sell next" value={formatPct(reactionSummary.sell.next)} tone={reactionTone(reactionSummary.sell.next)} />
            <SummaryMetric label="Sell 5D" value={formatPct(reactionSummary.sell.day5)} tone={reactionTone(reactionSummary.sell.day5)} />
            <SummaryMetric label="Sell 20D" value={formatPct(reactionSummary.sell.day20)} tone={reactionTone(reactionSummary.sell.day20)} />
          </div>
          <div className="mt-2 text-[9px] font-mono text-white/30">Benchmark = SPY price reaction over the same disclosure-anchored dates. Positive excess means the selected ticker moved more than SPY.</div>

          {historyLoading && (
            <div className="text-[9px] font-mono text-white/30 mt-3">Loading 5-year market history…</div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/40 font-mono">
        <span>Congress data source:</span>
        {sourceStatus.sourceUrl ? (
          <a
            href={sourceStatus.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className={'inline-flex items-center gap-1 rounded border px-2 py-1 ' + sourceTone(sourceStatus)}
          >
            {sourceStatus.label}
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <span className={'rounded border px-2 py-1 ' + sourceTone(sourceStatus)}>
            {sourceStatus.label}
          </span>
        )}
        {sourceStatus.stale && (
          <span className="text-cyan-300">• showing last-known-good records</span>
        )}
        {loading && (
          <span className="inline-flex items-center gap-1 text-cyan-300">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading
          </span>
        )}
        {sourceStatus.upstreamError && sourceStatus.kind !== 'unavailable' && (
          <span className="text-amber-300">• Primary issue: {sourceStatus.upstreamError}</span>
        )}
        {error && <span className="text-rose-300">• {error}</span>}
      </div>

      {sourceStatus.kind === 'fallback' && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-400/15 bg-amber-400/5 p-3 text-[10px] text-amber-100/80">
          <AlertTriangle className="w-4 h-4 text-amber-300 mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-black uppercase tracking-wider text-amber-200">Fallback active:</span>{' '}
            the primary Bargo feed was unavailable, so the API is serving normalized public congressional disclosure records from OpenRegs by DataDawn.
            The fallback may not include a separate filing/disclosure timestamp or estimated trade price.
          </div>
        </div>
      )}

      {sourceStatus.kind === 'cache' && (
        <div className="flex items-start gap-3 rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-3 text-[10px] text-cyan-100/80">
          <Activity className="w-4 h-4 text-cyan-300 mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-black uppercase tracking-wider text-cyan-200">Cache fallback active:</span>{' '}
            both live sources were unavailable, so the page is showing the last successful dataset available to the server.
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[9px] font-mono uppercase tracking-widest text-white/30">
        <span aria-live="polite">{filtered.length} matching disclosure{filtered.length === 1 ? '' : 's'}</span>
        <button
          type="button"
          onClick={() => {
            setSearch('');
            setChamberFilter('all');
            setTransactionFilter('all');
            setDateFilter('all');
            setSymbolFilter('ALL');
          }}
          className="rounded border border-white/10 bg-white/5 px-2.5 py-1.5 text-white/50 hover:text-white hover:bg-white/10 transition"
        >
          Clear table filters
        </button>
      </div>

      <div className="bg-[#15181E]/30 border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto max-h-[640px] overflow-y-auto aiw-scroll-region">
          <DataTable<CongressTrade>
            rows={filtered}
            rowKey={(row) => row.id}
            loading={loading || globalLoading}
            empty={sourceStatus.kind === 'unavailable' ? 'No records available from the configured Congress sources.' : search.trim() ? 'No Congress records match the current search.' : 'No transactions found for the selected filters.'}
            initialSort={{ key: 'tradeDate', direction: 'desc' }}
            columns={[
              { key: 'filer', header: 'Filer / Chamber', accessor: row => row.politician, render: row => <div><div className="font-sans font-bold text-white">{row.politician}</div><div className="text-[10px] text-white/40 font-mono tracking-wide uppercase mt-1">{row.chamber}</div></div> },
              { key: 'symbol', header: 'Symbol', accessor: row => row.stockSymbol },
              { key: 'type', header: 'Type', accessor: row => row.transactionType },
              { key: 'amount', header: 'Amount Range', accessor: row => row.amountRange },
              { key: 'tradeDate', header: 'Trade Date', accessor: row => row.transactionDate || row.date || '', type: 'date' },
              { key: 'filed', header: 'Filed', accessor: row => row.filingDate || '', type: 'date' },
              { key: 'close', header: 'Trade-Day Close', accessor: row => reactionById.get(row.id)?.eventPrice ?? null, type: 'currency', render: row => { const reaction = reactionById.get(row.id); return reaction ? '$' + formatPrice(reaction.eventPrice) : '—'; } },
              { key: 'afterward', header: 'Afterward', accessor: row => reactionById.get(row.id)?.nextPct ?? null, type: 'percent', align: 'right', render: row => { const reaction = reactionById.get(row.id); return <div className="text-right"><div>Next {formatPct(reaction?.nextPct ?? null)}</div><div className="text-[9px] mt-1">5D {formatPct(reaction?.day5Pct ?? null)}</div><div className="text-[9px] mt-1">20D {formatPct(reaction?.day20Pct ?? null)}</div><div className="text-[8px] mt-1 text-cyan-200/60">5D vs SPY {formatPct(reaction?.excessDay5Pct ?? null)}</div></div>; } },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/10 p-3">
      <div className="text-[8px] font-mono uppercase tracking-widest text-white/30">{label}</div>
      <div className={'text-base font-black mt-1 ' + tone}>{value}</div>
    </div>
  );
}
