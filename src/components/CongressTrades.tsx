import { useEffect, useMemo, useState } from 'react';
import { Search, AlertTriangle, Loader2, ExternalLink, Activity } from 'lucide-react';
import { formatPrice } from '../utils';
import { CongressTrade } from '../types';
import JevDecisionPanel from './JevDecisionPanel';

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

function loadHistory(symbol: string): Promise<HistoryPoint[]> {
  const key = symbol.trim().toUpperCase();
  if (!historyCache[key]) {
    historyCache[key] = fetch('/api/stock-history?symbol=' + encodeURIComponent(key) + '&range=5y')
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

function reactionFor(history: HistoryPoint[], tradeDate: string): TradeReaction | null {
  if (!history.length || !tradeDate) return null;
  const eventIndex = history.findIndex((point) => point.date >= tradeDate);
  if (eventIndex < 0) return null;

  const event = history[eventIndex];
  const next = history[eventIndex + 1] || null;
  const day5 = history[eventIndex + 5] || null;
  const day20 = history[eventIndex + 20] || null;

  return {
    eventDate: event.date,
    eventPrice: event.price,
    nextDate: next?.date || null,
    nextPrice: next?.price || null,
    day5: day5?.price || null,
    day20: day20?.price || null,
    nextPct: pct(event.price, next?.price ?? null),
    day5Pct: pct(event.price, day5?.price ?? null),
    day20Pct: pct(event.price, day20?.price ?? null),
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
  const [search, setSearch] = useState('');
  const [chamberFilter, setChamberFilter] = useState<'all' | 'Senate' | 'House'>('all');
  const [symbolFilter, setSymbolFilter] = useState('NVDA');
  const [trades, setTrades] = useState<CongressTrade[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [searchTrades, setSearchTrades] = useState<CongressTrade[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceStatus, setSourceStatus] = useState<SourceStatus>(INITIAL_SOURCE);

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
    if (symbolFilter === 'ALL') {
      setHistory([]);
      return;
    }

    let cancelled = false;
    setHistoryLoading(true);

    loadHistory(symbolFilter).then((points) => {
      if (!cancelled) setHistory(points);
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

    return sourceTrades.filter((t) => {
      const matchesSymbol = symbolFilter === 'ALL' || needle ? true : t.stockSymbol === symbolFilter;
      const matchesChamber = chamberFilter === 'all' || t.chamber === chamberFilter;
      return matchesSymbol && matchesChamber;
    });
  }, [trades, searchTrades, chamberFilter, search, symbolFilter]);

  const reactions = useMemo(() => {
    if (symbolFilter === 'ALL') return [];
    return filtered
      .map((trade) => ({
        trade,
        reaction: reactionFor(history, trade.transactionDate || trade.date),
      }))
      .filter((row) => row.reaction);
  }, [filtered, history, symbolFilter]);

  const reactionSummary = useMemo(() => {
    const next = reactions.map((row) => row.reaction?.nextPct).filter((v): v is number => v != null);
    const day5 = reactions.map((row) => row.reaction?.day5Pct).filter((v): v is number => v != null);
    const day20 = reactions.map((row) => row.reaction?.day20Pct).filter((v): v is number => v != null);

    return {
      matched: reactions.length,
      next: next.length ? next.reduce((a, b) => a + b, 0) / next.length : null,
      day5: day5.length ? day5.reduce((a, b) => a + b, 0) / day5.length : null,
      day20: day20.length ? day20.reduce((a, b) => a + b, 0) / day20.length : null,
    };
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
          Track public congressional disclosure records across searchable tickers and members. Search any supported ticker or politician; the preset buttons are only shortcuts.
        </p>
      </div>

      <div className="flex items-start space-x-3 bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 text-white/80">
        <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-500" />
        <div className="text-xs leading-relaxed">
          <span className="font-black uppercase tracking-wider text-white">Data note:</span> Filing dates can lag the underlying transaction date. Historical price context below is anchored to the transaction date, while the filing date remains the disclosure timestamp.
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

          <div className="relative w-full lg:w-80">
            <Search className="w-4 h-4 text-white/40 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search politician or symbol..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-white placeholder-white/20 font-mono"
              aria-label="Search Congress trades by politician, symbol, type, amount, or date"
            />
            {search.trim() && globalLoading && (
              <Loader2 className="w-3.5 h-3.5 text-cyan-300 absolute right-3 top-3 animate-spin" />
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

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <SummaryMetric label="Trades matched to history" value={String(reactionSummary.matched)} tone="text-white" />
            <SummaryMetric label="Average next-day move" value={formatPct(reactionSummary.next)} tone={reactionTone(reactionSummary.next)} />
            <SummaryMetric label="Average 5-day move" value={formatPct(reactionSummary.day5)} tone={reactionTone(reactionSummary.day5)} />
            <SummaryMetric label="Average 20-day move" value={formatPct(reactionSummary.day20)} tone={reactionTone(reactionSummary.day20)} />
          </div>

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

      <div className="bg-[#15181E]/30 border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-white/10 bg-[#0F1115]/60 text-white/40 uppercase tracking-widest text-[9px] font-black">
                <th className="p-4">Filer / Chamber</th>
                <th className="p-4">Symbol</th>
                <th className="p-4">Type</th>
                <th className="p-4">Amount Range</th>
                <th className="p-4">Trade Date</th>
                <th className="p-4">Filed</th>
                <th className="p-4">Trade-Day Close</th>
                <th className="p-4 text-right">Afterward</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-white/40">
                    {loading
                      ? 'Loading disclosure records…'
                      : sourceStatus.kind === 'unavailable'
                        ? 'No records available from the configured Congress sources.'
                        : search.trim()
                          ? 'No Congress records match the current search.'
                          : 'No transactions found for the selected filters.'}
                  </td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const reaction = reactionById.get(t.id);

                  return (
                    <tr key={t.id} className="hover:bg-white/5 transition">
                      <td className="p-4 font-sans font-bold text-white">
                        <div>{t.politician}</div>
                        <div className="text-[10px] text-white/40 font-mono tracking-wide uppercase mt-1">{t.chamber}</div>
                      </td>
                      <td className="p-4">
                        <span className="px-2 py-0.5 bg-white/5 border border-white/10 text-white rounded text-[9px] font-black uppercase tracking-wider">
                          {t.stockSymbol}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={'px-2 py-0.5 rounded text-[9px] font-bold uppercase ' +
                          (t.transactionType === 'buy'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20')}
                        >
                          {t.transactionType}
                        </span>
                      </td>
                      <td className="p-4 text-white/80 font-bold">{t.amountRange}</td>
                      <td className="p-4 text-white/60 font-bold">{t.transactionDate || t.date || '—'}</td>
                      <td className="p-4 text-white/40 font-bold">{t.filingDate || '—'}</td>
                      <td className="p-4 text-white font-bold">
                        {reaction ? '$' + formatPrice(reaction.eventPrice) : '—'}
                      </td>
                      <td className="p-4 text-right">
                        <div className={'font-bold ' + reactionTone(reaction?.nextPct ?? null)}>
                          Next day {formatPct(reaction?.nextPct ?? null)}
                        </div>
                        <div className={'text-[9px] mt-1 ' + reactionTone(reaction?.day5Pct ?? null)}>
                          5 days {formatPct(reaction?.day5Pct ?? null)}
                        </div>
                        <div className={'text-[9px] mt-1 ' + reactionTone(reaction?.day20Pct ?? null)}>
                          20 days {formatPct(reaction?.day20Pct ?? null)}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
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
