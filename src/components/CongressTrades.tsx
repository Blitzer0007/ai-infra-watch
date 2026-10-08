import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, ExternalLink, Activity, Building2, CalendarDays, ChevronDown, FileText, Search, SlidersHorizontal, TrendingDown, TrendingUp } from 'lucide-react';
import { formatPrice } from '../utils';
import { CongressTrade } from '../types';
import { STOCK_METADATA } from '../data';
import JevDecisionPanel from './JevDecisionPanel';
import { FilterInput, FilterSelect } from './FilterControls';
import DataTable from './DataTable';

interface CongressTradesProps {
  liveTrades?: CongressTrade[];
  livePrices?: Record<string, { price: number; changePct: number; stale?: boolean }>;
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
  ownBaselineDay5Pct: number | null;
  ownBaselineGapDay5Pct: number | null;
  ownBaselineDay20Pct: number | null;
  ownBaselineGapDay20Pct: number | null;
};

type SourceStatus = {
  label: string;
  kind: 'bargo' | 'fallback' | 'cache' | 'unavailable' | 'loading';
  stale: boolean;
  sourceUrl: string | null;
  upstreamError: string | null;
};

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

function median(values: number[]): number | null {
  const usable = values.filter(Number.isFinite).sort((a,b)=>a-b);
  if (!usable.length) return null;
  const mid = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[mid] : (usable[mid - 1] + usable[mid]) / 2;
}

function stockBaseline(history: HistoryPoint[], horizon: 5 | 20): number | null {
  const values: number[] = [];
  for (let i = 0; i + horizon < history.length; i++) {
    const value = pct(history[i]?.price ?? null, history[i + horizon]?.price ?? null);
    if (value != null) values.push(value);
  }
  return median(values);
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

  const baseline5 = stockBaseline(history, 5);
  const baseline20 = stockBaseline(history, 20);
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
    ownBaselineDay5Pct: baseline5,
    ownBaselineGapDay5Pct: day5Pct == null || baseline5 == null ? null : day5Pct - baseline5,
    ownBaselineDay20Pct: baseline20,
    ownBaselineGapDay20Pct: day20Pct == null || baseline20 == null ? null : day20Pct - baseline20,
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

export default function CongressTrades({ liveTrades = [], livePrices = {} }: CongressTradesProps) {
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
  const quickFilterSymbols = useMemo(() => {
    const symbols = [...liveTrades, ...trades, ...searchTrades]
      .map(trade => String(trade?.stockSymbol || '').trim().toUpperCase())
      .filter(Boolean);
    return [...new Set(symbols)].sort();
  }, [liveTrades, trades, searchTrades]);
  const popularFilterSymbols = useMemo(() => {
    const counts = new Map<string, number>();
    for (const trade of [...liveTrades, ...trades, ...searchTrades]) {
      const symbol = String(trade?.stockSymbol || '').trim().toUpperCase();
      if (!symbol) continue;
      counts.set(symbol, (counts.get(symbol) || 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([symbol]) => symbol);
    const ordered = symbolFilter !== 'ALL' ? [symbolFilter, ...ranked] : ranked;
    return [...new Set(ordered)].slice(0, 11);
  }, [liveTrades, trades, searchTrades, symbolFilter]);

  const moreFilterSymbols = useMemo(
    () => quickFilterSymbols.filter(symbol => !popularFilterSymbols.includes(symbol)),
    [quickFilterSymbols, popularFilterSymbols]
  );

  const selectedMetadata = symbolFilter !== 'ALL' ? STOCK_METADATA[symbolFilter] : undefined;
  const selectedLivePrice = symbolFilter !== 'ALL' ? livePrices[symbolFilter] : undefined;
  const selectedHistoryPrice = symbolFilter !== 'ALL' && history.length ? history[history.length - 1]?.price ?? null : null;
  const selectedPrice = selectedLivePrice?.price ?? selectedHistoryPrice;
  const selectedChange = selectedLivePrice?.changePct ?? null;

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
        reaction: reactionFor(history, benchmarkHistory, trade.filingDate || trade.transactionDate || trade.date),
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
      medianNext: median(rows.map(row => row.reaction?.nextPct).filter((v): v is number => v != null)),
      medianDay5: median(rows.map(row => row.reaction?.day5Pct).filter((v): v is number => v != null)),
      medianDay20: median(rows.map(row => row.reaction?.day20Pct).filter((v): v is number => v != null)),
      excessNext: avg(rows.map(row => row.reaction?.excessNextPct)),
      excessDay5: avg(rows.map(row => row.reaction?.excessDay5Pct)),
      excessDay20: avg(rows.map(row => row.reaction?.excessDay20Pct)),
      medianExcessDay5: median(rows.map(row => row.reaction?.excessDay5Pct).filter((v): v is number => v != null)),
      medianExcessDay20: median(rows.map(row => row.reaction?.excessDay20Pct).filter((v): v is number => v != null)),
      ownBaselineDay5: avg(rows.map(row => row.reaction?.ownBaselineDay5Pct)),
      ownBaselineGapDay5: avg(rows.map(row => row.reaction?.ownBaselineGapDay5Pct)),
    });
    const buys = reactions.filter(row => row.trade.transactionType === 'buy');
    const sells = reactions.filter(row => row.trade.transactionType === 'sell');
    const uniqueEventDates = new Set(reactions.map(row => row.trade.filingDate || row.trade.transactionDate || row.trade.date).filter(Boolean)).size;
    const confidence = sourceStatus.kind === 'unavailable' || sourceStatus.stale
      ? 'Low'
      : uniqueEventDates >= 30 && reactions.length >= 30
        ? 'High'
        : uniqueEventDates >= 15 && reactions.length >= 15
          ? 'Moderate'
          : 'Low';
    return { all: summarize(reactions), buy: summarize(buys), sell: summarize(sells), matched: reactions.length, uniqueEventDates, confidence };
  }, [reactions, sourceStatus]);

  const reactionById = useMemo(() => {
    const map = new Map<string, TradeReaction>();
    reactions.forEach(({ trade, reaction }) => {
      if (reaction) map.set(trade.id, reaction);
    });
    return map;
  }, [reactions]);

  return (
    <div className="space-y-5" id="congress-view">
      <div className="flex items-start gap-4 pt-1">
        <div className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300"><Building2 className="h-6 w-6" /></div>
        <div className="min-w-0">
          <div className="mb-1 text-[10px] font-mono uppercase tracking-[0.18em] text-emerald-300/70">Section 04 / Signals</div>
          <h1 className="text-3xl md:text-4xl font-black tracking-[-0.045em] text-white">Congress Trades</h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/50">Track U.S. Congress members' stock trades and analyze historical price context.</p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-amber-400/15 bg-[#11161b] px-4 py-3.5 text-white/80 shadow-[0_10px_35px_rgba(0,0,0,.12)]">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div className="text-[11px] leading-relaxed"><span className="font-black uppercase tracking-wider text-amber-200">Data note:</span>{' '}Filing dates can lag the underlying transaction date. Historical price context below is anchored to the disclosure/filing date when available. The transaction date remains a separate field and is not substituted for the disclosure timestamp.</div>
      </div>

      <section className="rounded-2xl border border-white/10 bg-[#0e141a] p-4 md:p-5 shadow-[0_14px_40px_rgba(0,0,0,.14)]">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.35fr_1fr_1fr_1fr]">
          <FilterBlock icon={<Search className="h-3.5 w-3.5 text-white/45" />} label="Ticker / Search">
            <div className="relative">
              <FilterInput type="text" placeholder="Search ticker, company, or member..." value={search} onChange={(e) => setSearch(e.target.value)} label="Search Congress trades by politician, company, symbol, type, amount, or date" className="w-full rounded-xl border-white/10 bg-[#0a0f14] px-3.5 py-3 font-sans text-sm text-white placeholder:text-white/25" />
              {search.trim() && globalLoading && <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-cyan-300" aria-label="Searching Congress trades" />}
            </div>
          </FilterBlock>
          <FilterBlock icon={<Building2 className="h-3.5 w-3.5 text-white/45" />} label="Chamber">
            <FilterSelect value={chamberFilter} onChange={(e) => setChamberFilter(e.target.value as 'all' | 'Senate' | 'House')} label="Filter Congress trades by chamber" className="w-full rounded-xl border-white/10 bg-[#0a0f14] px-3.5 py-3 font-sans text-sm text-white">
              <option value="all">All Chambers</option><option value="Senate">Senate</option><option value="House">House</option>
            </FilterSelect>
          </FilterBlock>
          <FilterBlock icon={<SlidersHorizontal className="h-3.5 w-3.5 text-white/45" />} label="Trade Type">
            <FilterSelect value={transactionFilter} onChange={(e) => setTransactionFilter(e.target.value as 'all' | 'buy' | 'sell')} label="Filter Congress trades by transaction type" className="w-full rounded-xl border-white/10 bg-[#0a0f14] px-3.5 py-3 font-sans text-sm text-white">
              <option value="all">All Types</option><option value="buy">Buy only</option><option value="sell">Sell only</option>
            </FilterSelect>
          </FilterBlock>
          <FilterBlock icon={<CalendarDays className="h-3.5 w-3.5 text-white/45" />} label="Date Range">
            <FilterSelect value={dateFilter} onChange={(e) => setDateFilter(e.target.value as 'all' | '30' | '90' | '365')} label="Filter Congress trades by transaction age" className="w-full rounded-xl border-white/10 bg-[#0a0f14] px-3.5 py-3 font-sans text-sm text-white">
              <option value="all">All Dates</option><option value="30">Last 30 Days</option><option value="90">Last 90 Days</option><option value="365">Last 365 Days</option>
            </FilterSelect>
          </FilterBlock>
        </div>

        <div className="my-4 h-px bg-white/[0.07]" />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-white/55">Popular / Active</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => setSymbolFilter('ALL')} className={'rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ' + (symbolFilter === 'ALL' ? 'border-emerald-300 bg-emerald-400/10 text-emerald-300 shadow-[0_0_0_1px_rgba(52,211,153,.2)]' : 'border-white/10 bg-[#11171d] text-white/55 hover:border-white/20 hover:text-white')}>Latest Global</button>
              {popularFilterSymbols.map(symbol => <button key={symbol} type="button" onClick={() => setSymbolFilter(symbol)} className={'rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ' + (symbolFilter === symbol ? 'border-emerald-300 bg-emerald-400/10 text-emerald-300 shadow-[0_0_0_1px_rgba(52,211,153,.2)]' : 'border-white/10 bg-[#11171d] text-white/55 hover:border-white/20 hover:text-white')}>{symbol}</button>)}
              {moreFilterSymbols.length > 0 && <label className="relative inline-flex"><span className="sr-only">More Congress symbols</span><select value="" onChange={e => e.target.value && setSymbolFilter(e.target.value)} className="appearance-none rounded-xl border border-white/10 bg-[#11171d] px-3.5 py-2.5 pr-9 text-xs font-semibold text-white/60 outline-none transition hover:border-white/20"><option value="">+ More</option>{moreFilterSymbols.map(symbol => <option key={symbol} value={symbol}>{symbol}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" /></label>}
            </div>
          </div>
          <button type="button" onClick={() => { setSearch(''); setChamberFilter('all'); setTransactionFilter('all'); setDateFilter('all'); setSymbolFilter('ALL'); }} className="self-start rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-white/45 transition hover:bg-white/[0.06] hover:text-white lg:self-end">Reset filters</button>
        </div>
      </section>

      {symbolFilter !== 'ALL' && <>
        <section className="rounded-2xl border border-white/10 bg-[#0e141a] p-4 md:p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#162029] text-sm font-black text-emerald-300">{symbolFilter.slice(0, 2)}</div>
              <div className="min-w-0"><div className="flex items-center gap-2"><h2 className="truncate text-xl font-black text-white">{symbolFilter}</h2><span className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/15 bg-emerald-400/10 px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />Selected</span></div><p className="mt-0.5 truncate text-xs text-white/45">{selectedMetadata?.name || 'Selected public-company disclosure ticker'}</p></div>
            </div>
            <div className="hidden text-right sm:block"><div className="text-[9px] font-mono uppercase tracking-widest text-white/35">Data coverage</div><div className="mt-1 text-xs text-white/60">{filtered.length} matching disclosures</div></div>
          </div>
          <div className="my-4 h-px bg-white/[0.07]" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <CompanyMetric label="Latest price" value={selectedPrice == null ? '—' : '$' + formatPrice(selectedPrice)} tone="text-white" detail={selectedChange == null ? (selectedLivePrice?.stale ? 'Last known quote' : 'Historical close') : formatPct(selectedChange)} />
            <CompanyMetric label="Market cap" value="—" tone="text-white" detail="Not in current feed" />
            <CompanyMetric label="Sector" value={selectedMetadata?.sector || '—'} tone="text-white" detail="Configured metadata" />
            <CompanyMetric label="Industry" value="—" tone="text-white" detail="Not in current feed" />
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0e141a] p-4 md:p-5">
          <div className="flex items-start gap-3"><div className="mt-0.5 rounded-lg bg-cyan-400/10 p-2 text-cyan-300"><Activity className="h-5 w-5" /></div><div className="min-w-0"><h2 className="text-lg font-black text-white">Historical Price Context · {symbolFilter}</h2><p className="mt-1 max-w-4xl text-[11px] leading-relaxed text-white/45">Anchored to the disclosure/filing date, this shows what the market did afterward and does not establish that the trade caused the move.</p></div></div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryMetric label="All matched" value={String(reactionSummary.all.matched)} tone="text-white" icon={<FileText className="h-4 w-4" />} />
            <SummaryMetric label="Buy 5D vs SPY" value={formatPct(reactionSummary.buy.excessDay5)} tone={reactionTone(reactionSummary.buy.excessDay5)} icon={<TrendingUp className="h-4 w-4" />} />
            <SummaryMetric label="Sell 5D vs SPY" value={formatPct(reactionSummary.sell.excessDay5)} tone={reactionTone(reactionSummary.sell.excessDay5)} icon={<TrendingDown className="h-4 w-4" />} />
            <SummaryMetric label="All 20D vs SPY" value={formatPct(reactionSummary.all.excessDay20)} tone={reactionTone(reactionSummary.all.excessDay20)} icon={<Activity className="h-4 w-4" />} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <SecondaryMetric label="Buy next" value={formatPct(reactionSummary.buy.next)} tone={reactionTone(reactionSummary.buy.next)} />
            <SecondaryMetric label="Buy 5D" value={formatPct(reactionSummary.buy.day5)} tone={reactionTone(reactionSummary.buy.day5)} />
            <SecondaryMetric label="Buy 20D" value={formatPct(reactionSummary.buy.day20)} tone={reactionTone(reactionSummary.buy.day20)} />
            <SecondaryMetric label="Sell next" value={formatPct(reactionSummary.sell.next)} tone={reactionTone(reactionSummary.sell.next)} />
            <SecondaryMetric label="Sell 5D" value={formatPct(reactionSummary.sell.day5)} tone={reactionTone(reactionSummary.sell.day5)} />
            <SecondaryMetric label="Sell 20D" value={formatPct(reactionSummary.sell.day20)} tone={reactionTone(reactionSummary.sell.day20)} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] font-mono text-white/40"><span>5D mean {formatPct(reactionSummary.all.day5)}</span><span>5D median {formatPct(reactionSummary.all.medianDay5)}</span><span>20D mean {formatPct(reactionSummary.all.day20)}</span><span>20D median {formatPct(reactionSummary.all.medianDay20)}</span><span>Own-stock 5D baseline {formatPct(reactionSummary.all.ownBaselineDay5)}</span></div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-400/10 bg-violet-400/[0.025] px-3 py-2 text-[10px] font-mono text-violet-100/60"><span>Event vs own baseline {formatPct(reactionSummary.all.ownBaselineGapDay5)}</span><span>{reactionSummary.uniqueEventDates} unique event dates · same-date trades remain correlated</span><span className={reactionSummary.matched < 30 ? 'text-amber-300' : 'text-emerald-300'}>EVIDENCE CONFIDENCE · {reactionSummary.confidence.toUpperCase()}</span></div>
          {historyLoading && <div className="mt-3 inline-flex items-center gap-2 text-[10px] font-mono text-cyan-300/70"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading 5-year market history…</div>}
        </section>
      </>}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-widest text-white/35">
        <div className="flex flex-wrap items-center gap-2"><span>Congress data source</span>{sourceStatus.sourceUrl ? <a href={sourceStatus.sourceUrl} target="_blank" rel="noreferrer" className={'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 ' + sourceTone(sourceStatus)}>{sourceStatus.label}<ExternalLink className="h-3 w-3" /></a> : <span className={'rounded-lg border px-2.5 py-1.5 ' + sourceTone(sourceStatus)}>{sourceStatus.label}</span>}{sourceStatus.stale && <span className="text-cyan-300">• last-known-good records</span>}{loading && <span className="inline-flex items-center gap-1 text-cyan-300"><Loader2 className="h-3 w-3 animate-spin" />Loading</span>}{error && <span className="text-rose-300">• {error}</span>}</div>
        <span>{filtered.length} matching disclosure{filtered.length === 1 ? '' : 's'}</span>
      </div>

      {sourceStatus.kind === 'fallback' && <div className="flex items-start gap-3 rounded-xl border border-amber-400/15 bg-amber-400/5 p-3 text-[10px] text-amber-100/80"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div><span className="font-black uppercase tracking-wider text-amber-200">Fallback active:</span>{' '}the primary Bargo feed was unavailable, so the API is serving normalized public congressional disclosure records from OpenRegs by DataDawn. The fallback may not include a separate filing/disclosure timestamp or estimated trade price.</div></div>}
      {sourceStatus.kind === 'cache' && <div className="flex items-start gap-3 rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-3 text-[10px] text-cyan-100/80"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" /><div><span className="font-black uppercase tracking-wider text-cyan-200">Cache fallback active:</span>{' '}both live sources were unavailable, so the page is showing the last successful dataset available to the server.</div></div>}

      <div className="rounded-2xl border border-white/10 bg-[#0e141a] overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.07] bg-white/[0.015] px-4 py-3"><div><div className="text-[11px] font-semibold text-white/75">Disclosure activity</div><div className="mt-0.5 text-[10px] text-white/35">Sortable public filing records with historical reaction context.</div></div><div className="hidden items-center gap-2 text-[9px] font-mono uppercase tracking-wider text-white/30 sm:flex"><span>Filtered view</span><span className="rounded-md border border-white/10 bg-white/[0.025] px-2 py-1 text-white/55">{filtered.length}</span></div></div>
        <div className="overflow-x-auto max-h-[640px] overflow-y-auto aiw-scroll-region">
          <DataTable<CongressTrade> rows={filtered} rowKey={row => row.id} loading={loading || globalLoading} empty={sourceStatus.kind === 'unavailable' ? 'No records available from the configured Congress sources.' : search.trim() ? 'No Congress records match the current search.' : 'No transactions found for the selected filters.'} initialSort={{ key: 'tradeDate', direction: 'desc' }} columns={[
            { key: 'filer', header: 'Filer / Chamber', accessor: row => row.politician, render: row => <div><div className="font-sans font-bold text-white">{row.politician}</div><div className="mt-1 text-[10px] font-mono uppercase tracking-wide text-white/40">{row.chamber}</div></div> },
            { key: 'symbol', header: 'Symbol', accessor: row => row.stockSymbol },
            { key: 'type', header: 'Type', accessor: row => row.transactionType, render: row => <span className={'inline-flex rounded-md border px-2 py-1 text-[9px] font-mono font-bold uppercase tracking-wider ' + (row.transactionType === 'buy' ? 'border-emerald-400/15 bg-emerald-400/10 text-emerald-300' : 'border-rose-400/15 bg-rose-400/10 text-rose-300')}>{row.transactionType}</span> },
            { key: 'amount', header: 'Amount Range', accessor: row => row.amountRange },
            { key: 'tradeDate', header: 'Trade Date', accessor: row => row.transactionDate || row.date || '', type: 'date' },
            { key: 'filed', header: 'Filed', accessor: row => row.filingDate || '', type: 'date' },
            { key: 'close', header: 'Trade-Day Close', accessor: row => reactionById.get(row.id)?.eventPrice ?? null, type: 'currency', render: row => { const reaction = reactionById.get(row.id); return reaction ? '$' + formatPrice(reaction.eventPrice) : '—'; } },
            { key: 'afterward', header: 'Afterward', accessor: row => reactionById.get(row.id)?.nextPct ?? null, type: 'percent', align: 'right', render: row => { const reaction = reactionById.get(row.id); return <div className="text-right"><div className={reactionTone(reaction?.nextPct ?? null)}>Next {formatPct(reaction?.nextPct ?? null)}</div><div className="mt-1 text-[9px] text-white/45">5D {formatPct(reaction?.day5Pct ?? null)}</div><div className="mt-1 text-[9px] text-white/45">20D {formatPct(reaction?.day20Pct ?? null)}</div><div className="mt-1 text-[8px] text-cyan-200/60">5D vs SPY {formatPct(reaction?.excessDay5Pct ?? null)}</div></div>; } },
          ]} />
        </div>
      </div>

      <JevDecisionPanel kind="congress" title="Congress disclosure review" state={{
        selected_symbol: symbolFilter, source: sourceStatus.label, chamber_filter: chamberFilter, matched_trades: filtered.length,
        trades: filtered.slice(0, 8).map(trade => ({ symbol: trade.stockSymbol, chamber: trade.chamber, transaction_type: trade.transactionType, amount_range: trade.amountRange, transaction_date: trade.transactionDate || trade.date, filing_date: trade.filingDate })),
        historical_reaction_matches: reactionSummary.matched, evidence_confidence: reactionSummary.confidence, unique_event_dates: reactionSummary.uniqueEventDates,
      }} />
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0b1015] px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-white/35">{label}</div>
        {icon && <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/5 bg-[#131b22] text-white/55">{icon}</div>}
      </div>
      <div className={'mt-1.5 text-2xl font-black tracking-tight ' + tone}>{value}</div>
    </div>
  );
}
function FilterBlock({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return <div><label className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-white/75">{icon}{label}</label>{children}</div>;
}

