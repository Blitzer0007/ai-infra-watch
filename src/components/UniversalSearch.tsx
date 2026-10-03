import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ArrowRight, Command, Plus, X } from 'lucide-react';
import { STOCK_METADATA } from '../data';
import { STOCK_UNIVERSE_SYMBOLS } from '../utils/stockUniverse';
import { rankSearchResults } from '../utils/search';
import { addTickerShortcut, loadTickerShortcuts } from '../utils/tickerShortcuts';

type UniversalSearchProps = {
  onNavigate: (view: string) => void;
};

type SearchItem = {
  id: string;
  kind: 'page' | 'ticker';
  title: string;
  subtitle: string;
  symbol?: string;
  view?: string;
  aliases?: string[];
};

const TICKER_ALIASES: Record<string, string[]> = {
  CRM: ['salesforce', 'salesforce.com'],
  GOOG: ['google', 'alphabet'],
  SNDK: ['sandisk', 'western digital'],
  TSM: ['tsmc', 'taiwan semiconductor'],
  ONDS: ['ondas', 'ondas networks'],
  NBIS: ['nebius'],
  DGXX: ['digi power', 'digi power x'],
  NVDA: ['nvidia'],
  MU: ['micron'],
  MSFT: ['microsoft'],
  AMD: ['advanced micro devices'],
  META: ['meta', 'facebook'],
  NOW: ['servicenow'],
};

const PAGE_ITEMS: SearchItem[] = [
  { id: 'overview', kind: 'page', title: 'Overview', subtitle: 'Dashboard summary and live intelligence', view: 'overview', aliases: ['home', 'dashboard'] },
  { id: 'contracts', kind: 'page', title: 'Contracts', subtitle: 'Infrastructure contracts and filings', view: 'contracts', aliases: ['filings', 'agreements'] },
  { id: 'tracker', kind: 'page', title: 'Progress Tracker', subtitle: 'Ticker milestones, history and SEC events', view: 'tracker', aliases: ['milestones', 'progress'] },
  { id: 'congress', kind: 'page', title: 'Congress Trades', subtitle: 'Disclosed congressional transactions', view: 'congress', aliases: ['politicians', 'trades'] },
  { id: 'macro', kind: 'page', title: 'Macro & Politics', subtitle: 'Macro risk and geopolitical signals', view: 'macro', aliases: ['politics', 'macro'] },
  { id: 'portfolio', kind: 'page', title: 'Portfolio Intelligence', subtitle: 'Holdings, exposure, attribution and stress', view: 'portfolio', aliases: ['holdings', 'positions'] },
  { id: 'watchlist', kind: 'page', title: 'Watchlist', subtitle: 'Price targets and earnings alerts', view: 'watchlist', aliases: ['alerts'] },
  { id: 'research', kind: 'page', title: 'AI Research', subtitle: 'Autonomous evidence-backed research', view: 'research', aliases: ['agents', 'research'] },
  { id: 'quality', kind: 'page', title: 'AI Quality Lab', subtitle: 'Model quality and evaluation signals', view: 'quality', aliases: ['quality', 'evaluation'] },
  { id: 'outlook', kind: 'page', title: 'Forward Outlook', subtitle: 'Historical validation and expected ranges', view: 'outlook', aliases: ['forecast', 'validation'] },
  { id: 'health', kind: 'page', title: 'Data Health', subtitle: 'Freshness, fallback and source status', view: 'health', aliases: ['data', 'freshness'] },
  { id: 'guide', kind: 'page', title: 'How to Use', subtitle: 'Dashboard workflow and methodology', view: 'guide', aliases: ['help', 'documentation'] },
  { id: 'settings', kind: 'page', title: 'Settings', subtitle: 'Dashboard configuration', view: 'settings', aliases: ['config', 'preferences'] },
];

export default function UniversalSearch({ onNavigate }: UniversalSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [shortcuts, setShortcuts] = useState<string[]>(() => loadTickerShortcuts(Object.keys(STOCK_METADATA)));
  const inputRef = useRef<HTMLInputElement>(null);

  const tickerItems = useMemo<SearchItem[]>(() => {
    const symbols = [...new Set([...STOCK_UNIVERSE_SYMBOLS, ...Object.keys(STOCK_METADATA), ...shortcuts])];
    return symbols.map(symbol => {
      const meta = STOCK_METADATA[symbol];
      return {
        id: 'ticker:' + symbol,
        kind: 'ticker',
        title: symbol,
        subtitle: meta?.name || 'Public ticker',
        symbol,
        aliases: meta ? [meta.name, meta.sector, ...(TICKER_ALIASES[symbol] || [])] : (TICKER_ALIASES[symbol] || []),
      };
    });
  }, [shortcuts]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [...PAGE_ITEMS.slice(0, 6), ...tickerItems.filter(item => shortcuts.includes(item.symbol || '')).slice(0, 6)];
    return rankSearchResults([...PAGE_ITEMS, ...tickerItems], q).slice(0, 10);
  }, [query, tickerItems, shortcuts]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    const onShortcutChange = () => setShortcuts(loadTickerShortcuts(Object.keys(STOCK_METADATA)));
    window.addEventListener('keydown', onKey);
    window.addEventListener('aiw-ticker-shortcuts-changed', onShortcutChange);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('aiw-ticker-shortcuts-changed', onShortcutChange);
    };
  }, []);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
    else setQuery('');
  }, [open]);

  const openTicker = (symbol: string) => {
    addTickerShortcut(symbol, Object.keys(STOCK_METADATA));
    setShortcuts(loadTickerShortcuts(Object.keys(STOCK_METADATA)));
    onNavigate('tracker');
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Open universal search"
        onClick={() => setOpen(true)}
        className="w-full md:w-[360px] lg:w-[440px] h-10 rounded-xl border border-white/10 bg-white/[.03] hover:bg-white/[.06] text-left px-3 flex items-center justify-between gap-3 transition"
      >
        <span className="flex items-center gap-2 text-xs text-white/45 min-w-0">
          <Search className="w-4 h-4 shrink-0" />
          <span className="truncate">Search pages, companies or tickers…</span>
        </span>
        <span className="hidden sm:inline-flex items-center gap-1 text-[9px] font-mono text-white/25 border border-white/10 rounded px-1.5 py-1">
          <Command className="w-3 h-3" />K
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm p-4 md:p-10" role="dialog" aria-modal="true" aria-label="Universal search">
          <div className="max-w-2xl mx-auto mt-[8vh] overflow-hidden rounded-2xl border border-white/10 bg-[#15181E] shadow-2xl">
            <div className="flex items-center gap-3 border-b border-white/10 px-4">
              <Search className="w-5 h-5 text-emerald-400 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Escape') setOpen(false);
                  if (event.key === 'Enter' && results[0]) {
                    if (results[0].kind === 'page') {
                      onNavigate(results[0].view || 'overview');
                      setOpen(false);
                    } else if (results[0].symbol) {
                      openTicker(results[0].symbol);
                    }
                  }
                }}
                placeholder="Search by ticker, company, page or alias…"
                aria-label="Search by ticker, company, page or alias"
                className="flex-1 bg-transparent py-4 text-sm text-white outline-none placeholder:text-white/25"
              />
              <button type="button" aria-label="Close search" onClick={() => setOpen(false)} className="p-1.5 text-white/40 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {results.length === 0 ? (
                <div className="px-4 py-10 text-center text-xs font-mono text-white/35">No matching pages or tickers.</div>
              ) : results.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => item.kind === 'page' ? (onNavigate(item.view || 'overview'), setOpen(false)) : item.symbol ? openTicker(item.symbol) : undefined}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/5 transition"
                >
                  <span className="w-9 h-9 rounded-lg border border-white/10 bg-white/[.03] flex items-center justify-center text-[10px] font-mono font-black text-emerald-400">
                    {item.kind === 'ticker' ? item.symbol : <ArrowRight className="w-4 h-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-white truncate">{item.title}</span>
                    <span className="block text-[10px] text-white/40 truncate">{item.subtitle}</span>
                  </span>
                  {item.kind === 'ticker' && (
                    <span className="flex items-center gap-1 text-[9px] font-mono uppercase text-white/30">
                      {shortcuts.includes(item.symbol || '') ? <><span>Saved</span></> : <><Plus className="w-3 h-3" /><span>Track</span></>}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
