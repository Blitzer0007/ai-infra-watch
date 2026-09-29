import { useEffect, useMemo, useState } from 'react';
import { Search, AlertTriangle, Loader2, ExternalLink } from 'lucide-react';
import { formatPrice } from '../utils';
import { CongressTrade } from '../types';

interface CongressTradesProps {
  liveTrades?: CongressTrade[];
}

const TRACKED_SYMBOLS = ['DGXX', 'DRAM', 'SOXL', 'NVDA', 'MSFT', 'NBIS', 'VIVO', 'META', 'NOW', 'PHVS'];

export default function CongressTrades({ liveTrades }: CongressTradesProps) {
  const [search, setSearch] = useState('');
  const [chamberFilter, setChamberFilter] = useState<'all' | 'Senate' | 'House'>('all');
  const [symbolFilter, setSymbolFilter] = useState('NVDA');
  const [trades, setTrades] = useState<CongressTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTrades() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/congress-trades?symbol=' + encodeURIComponent(symbolFilter));
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data?.error || 'Congress trades request failed');
        }

        if (!cancelled) {
          setTrades(Array.isArray(data?.trades) ? data.trades : []);
        }
      } catch (err) {
        if (!cancelled) {
          setTrades([]);
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

  const sourceTrades = symbolFilter === 'ALL' && liveTrades?.length
    ? liveTrades
    : trades;

  const filtered = useMemo(() => sourceTrades.filter((t) => {
    const matchesChamber = chamberFilter === 'all' || t.chamber === chamberFilter;
    const needle = search.trim().toLowerCase();
    const matchesSearch =
      !needle ||
      t.politician.toLowerCase().includes(needle) ||
      t.stockSymbol.toLowerCase().includes(needle);
    return matchesChamber && matchesSearch;
  }), [sourceTrades, chamberFilter, search]);

  return (
    <div className="space-y-6" id="congress-view">
      <div className="flex flex-col space-y-1 md:space-y-2 border-b border-white/10 pb-4">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Section 04 / Signals</span>
        <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase italic text-white">
          Congressional Trading Signals
        </h1>
        <p className="text-xs text-white/60 max-w-3xl leading-relaxed">
          Track public disclosure records for the configured AI-infrastructure symbols. Choose a ticker to query its ticker-specific trade feed.
        </p>
      </div>

      <div className="flex items-start space-x-3 bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 text-white/80">
        <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-500" />
        <div className="text-xs leading-relaxed">
          <span className="font-black uppercase tracking-wider text-white">Data note:</span> Filing dates can lag the underlying transaction date. Treat the table as a disclosure record, not a real-time transaction feed.
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
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-white/40 font-mono">
        <span>Data source: Bargo U.S. Congress Stock Trades API.</span>
        <span>•</span>
        <span>{symbolFilter === 'ALL' ? 'Global recent feed' : symbolFilter + ' ticker feed'}</span>
        {loading && <span className="inline-flex items-center gap-1 text-cyan-300"><Loader2 className="w-3 h-3 animate-spin" /> Loading</span>}
        {error && <span className="text-amber-300">• {error}</span>}
      </div>

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
                <th className="p-4 text-right">Est. Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-white/40">
                    {loading ? 'Loading disclosure records…' : 'No transactions found for the selected filters.'}
                  </td>
                </tr>
              ) : (
                filtered.map((t) => (
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
                    <td className="p-4 text-white/40 font-bold">{t.filingDate || t.date || '—'}</td>
                    <td className="p-4 text-right text-emerald-400 font-bold">
                      {t.stockPrice > 0 ? '$' + formatPrice(t.stockPrice) : '—'}
                      {t.filingPortal && (
                        <a
                          href={t.filingPortal}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 inline-flex text-cyan-300 hover:text-cyan-200"
                          title="Open filing portal"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
