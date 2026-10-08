import React, { useEffect, useMemo, useState } from 'react';
import { AppConfig, loadConfig, saveConfig, formatPrice, formatPct } from '../utils';
import { STOCK_METADATA } from '../data';
import { STOCK_UNIVERSE } from '../utils/stockUniverse';
import { Bell, BellOff, Trash2, Plus, Star, Zap, Search, RefreshCw, Settings2, ArrowUpRight, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { authFetch } from '../utils/apiAuth';
import { loadAlertEvents, saveAlertEvents } from '../utils/alertEngine';
import { fetchPortfolioHoldings, StoredPortfolioHolding } from '../utils/portfolioApi';
import EarningsAlerts from './EarningsAlerts';

type LiveQuote = {
  price: number;
  changePct: number;
  provider?: string;
  retrievedAt?: string;
  asOf?: string | null;
  stale?: boolean;
  cached?: boolean;
};

type AlertDraft = {
  symbol: string;
  targetPrice: string;
  type: 'above' | 'below';
};

const MAX_WATCHLIST = 50;
const NEAR_TARGET_PCT = 5;
const normalizeSymbol = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

function distanceToTarget(price: number, target: number) {
  if (!Number.isFinite(price) || !Number.isFinite(target) || target <= 0) return Number.POSITIVE_INFINITY;
  return Math.abs((target - price) / target) * 100;
}

function freshness(quote?: LiveQuote) {
  if (!quote) return 'Waiting for quote';
  if (quote.stale) return 'Quote needs refresh';
  if (quote.cached) return 'Cached quote';
  return 'Live quote';
}

export default function BuySellWatchlist() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [serverSync, setServerSync] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'attention' | 'symbol' | 'today'>('attention');
  const [watchDraft, setWatchDraft] = useState('');
  const [message, setMessage] = useState('');
  const [alertDraft, setAlertDraft] = useState<AlertDraft>({ symbol: 'NVDA', targetPrice: '', type: 'above' });
  const [editingAlert, setEditingAlert] = useState<number | null>(null);
  const [events, setEvents] = useState(loadAlertEvents());
  const [rules, setRules] = useState<StoredPortfolioHolding[]>([]);
  const [rulesError, setRulesError] = useState('');

  useEffect(() => {
    const cfg = loadConfig();
    setConfig(cfg);
    setEvents(loadAlertEvents());
    let cancelled = false;

    void fetchPortfolioHoldings()
      .then(rows => { if (!cancelled) setRules(rows); })
      .catch(error => { if (!cancelled) setRulesError(error instanceof Error ? error.message : 'Portfolio rules are unavailable.'); });

    void authFetch('/api/alert-config', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        if (!cancelled && data?.config?.updated_at) setServerSync(data.config.updated_at);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setEvents(loadAlertEvents()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    let timer: number | undefined;

    const refreshQuotes = async () => {
      setRefreshing(true);
      const symbols = [...new Set([...config.watchlist, ...config.alerts.map(alert => alert.symbol)])];
      const results = await Promise.all(symbols.map(async symbol => {
        try {
          const response = await fetch('/api/quote?symbol=' + encodeURIComponent(symbol) + '&refresh=true', { cache: 'no-store' });
          if (!response.ok) return null;
          const data = await response.json();
          if (!Number.isFinite(Number(data?.price))) return null;
          return [symbol, {
            price: Number(data.price),
            changePct: Number(data.changePct) || 0,
            provider: data.provider,
            retrievedAt: data.retrievedAt,
            asOf: data.asOf,
            stale: data.stale === true,
            cached: data.cached === true,
          } as LiveQuote] as const;
        } catch {
          return null;
        }
      }));
      if (!cancelled) {
        const next: Record<string, LiveQuote> = {};
        results.forEach(item => { if (item) next[item[0]] = item[1]; });
        setQuotes(next);
        setLastRefresh(Date.now());
        setRefreshing(false);
        timer = window.setTimeout(() => { void refreshQuotes(); }, 60000);
      }
    };

    void refreshQuotes();
    void authFetch('/api/alert-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      watchlist: config.watchlist,
      alerts: config.alerts,
      largeMoveEnabled: config.largeMoveEnabled,
      largeMovePct: config.largeMovePct,
      catalystAlerts: config.catalystAlerts,
    }), cache: 'no-store' }).then(async response => {
      if (!response.ok || cancelled) return;
      const data = await response.json().catch(() => ({}));
      setServerSync(data?.updated_at || new Date().toISOString());
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [config?.watchlist?.join(','), config?.alerts?.map(a => a.symbol + ':' + a.targetPrice + ':' + a.type + ':' + a.active).join('|')]);

  const persist = (updated: AppConfig) => {
    setConfig(updated);
    saveConfig(updated);
    setMessage('');
  };

  const catalog = useMemo(() => {
    const bySymbol = new Map(STOCK_UNIVERSE.map(item => [item.symbol, item]));
    return [...new Set([
      ...STOCK_UNIVERSE.map(item => item.symbol),
      ...(config?.watchlist || []),
      ...(config?.alerts || []).map(alert => alert.symbol),
    ])].map(symbol => {
      const item = bySymbol.get(symbol);
      const meta = STOCK_METADATA[symbol];
      return { symbol, name: meta?.name || item?.name || symbol, group: item?.group || meta?.sector || '', theme: item?.theme || '' };
    }).sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [config?.watchlist, config?.alerts]);

  if (!config) return null;

  const filtered = config.watchlist.map(symbol => {
    const row = catalog.find(item => item.symbol === symbol);
    return { symbol, name: row?.name || symbol, group: row?.group || '', theme: row?.theme || '', quote: quotes[symbol] };
  }).filter(row => {
    const text = [row.symbol, row.name, row.group, row.theme].join(' ').toLowerCase();
    return !query.trim() || text.includes(query.trim().toLowerCase());
  }).sort((a, b) => {
    const attention = (symbol: string) => {
      const q = quotes[symbol]?.price;
      const alerts = config.alerts.filter(alert => alert.symbol === symbol && alert.active);
      if (alerts.some(alert => q != null && (alert.type === 'above' ? q >= alert.targetPrice : q <= alert.targetPrice))) return 0;
      if (alerts.some(alert => q != null && distanceToTarget(q, alert.targetPrice) <= NEAR_TARGET_PCT)) return 1;
      if (quotes[symbol] && Math.abs(quotes[symbol].changePct) >= config.largeMovePct) return 2;
      return 3;
    };
    if (sort === 'symbol') return a.symbol.localeCompare(b.symbol);
    if (sort === 'today') return (b.quote?.changePct || 0) - (a.quote?.changePct || 0);
    return attention(a.symbol) - attention(b.symbol) || a.symbol.localeCompare(b.symbol);
  });

  const activeAlerts = config.alerts.filter(alert => alert.active);
  const triggered = activeAlerts.filter(alert => {
    const price = quotes[alert.symbol]?.price;
    return price != null && (alert.type === 'above' ? price >= alert.targetPrice : price <= alert.targetPrice);
  });
  const near = activeAlerts.filter(alert => {
    const price = quotes[alert.symbol]?.price;
    if (price == null) return false;
    const hit = alert.type === 'above' ? price >= alert.targetPrice : price <= alert.targetPrice;
    return !hit && distanceToTarget(price, alert.targetPrice) <= NEAR_TARGET_PCT;
  });
  const largeMoves = config.watchlist.filter(symbol => Math.abs(quotes[symbol]?.changePct || 0) >= config.largeMovePct);
  const freshCount = config.watchlist.filter(symbol => quotes[symbol] && !quotes[symbol].stale && !quotes[symbol].cached).length;
  const completeRules = rules.filter(h => Boolean(String(h.decisionThesis || h.notes || '').trim()) && Number(h.lossLimitPct) > 0 && Boolean(String(h.exitRuleType || '').trim())).length;

  const addWatchlist = (e: React.FormEvent) => {
    e.preventDefault();
    const symbol = normalizeSymbol(watchDraft);
    if (!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)) {
      setMessage('Enter a valid ticker, such as NVDA or 000660.KS.');
      return;
    }
    if (config.watchlist.includes(symbol)) {
      setMessage(symbol + ' is already being watched.');
      return;
    }
    if (config.watchlist.length >= MAX_WATCHLIST) {
      setMessage('Watchlist is full. Remove a stock before adding another.');
      return;
    }
    persist({ ...config, watchlist: [...config.watchlist, symbol] });
    setWatchDraft('');
  };

  const removeWatchlist = (symbol: string) => {
    if (config.watchlist.length <= 1) {
      setMessage('Keep at least one stock on the watchlist.');
      return;
    }
    persist({
      ...config,
      watchlist: config.watchlist.filter(item => item !== symbol),
      alerts: config.alerts.filter(alert => alert.symbol !== symbol),
    });
  };

  const saveAlert = (e: React.FormEvent) => {
    e.preventDefault();
    const symbol = normalizeSymbol(alertDraft.symbol);
    const target = Number(alertDraft.targetPrice);
    if (!/^[A-Z0-9.^=-]{1,20}$/.test(symbol) || !Number.isFinite(target) || target <= 0) {
      setMessage('Enter a valid ticker and positive target price.');
      return;
    }
    const alerts = [...config.alerts];
    const next = { symbol, targetPrice: target, type: alertDraft.type, active: true };
    if (editingAlert == null) alerts.push(next);
    else alerts[editingAlert] = { ...alerts[editingAlert], ...next };
    persist({
      ...config,
      alerts: alerts.slice(0, 100),
      watchlist: config.watchlist.includes(symbol) ? config.watchlist : config.watchlist.length < MAX_WATCHLIST ? [...config.watchlist, symbol] : config.watchlist,
    });
    setEditingAlert(null);
    setAlertDraft({ symbol: 'NVDA', targetPrice: '', type: 'above' });
  };

  const refreshNow = async () => {
    setRefreshing(true);
    const symbols = [...new Set([...config.watchlist, ...config.alerts.map(alert => alert.symbol)])];
    const next: Record<string, LiveQuote> = {};
    await Promise.all(symbols.map(async symbol => {
      try {
        const response = await fetch('/api/quote?symbol=' + encodeURIComponent(symbol) + '&refresh=true', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (Number.isFinite(Number(data?.price))) {
          next[symbol] = {
            price: Number(data.price),
            changePct: Number(data.changePct) || 0,
            provider: data.provider,
            retrievedAt: data.retrievedAt,
            asOf: data.asOf,
            stale: data.stale === true,
            cached: data.cached === true,
          };
        }
      } catch {}
    }));
    setQuotes(next);
    setLastRefresh(Date.now());
    setRefreshing(false);
  };

  return (
    <div className="space-y-6" id="watchlist-view">
      <div className="aiw-page-header border-b border-white/10 pb-5">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Section 07 / Monitoring</span>
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">Watchlist</h1>
            <p className="text-xs text-white/50 max-w-3xl mt-2">Stocks you are watching, what needs attention, alerts and upcoming events.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-[9px] font-mono uppercase">
            <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-white/40">{freshCount}/{config.watchlist.length} fresh</span>
            <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-white/40">{activeAlerts.length} active alerts</span>
            <span className={serverSync ? 'rounded border border-emerald-400/15 bg-emerald-400/5 px-2 py-1 text-emerald-300' : 'rounded border border-white/10 bg-white/5 px-2 py-1 text-white/35'}>{serverSync ? 'Server sync ' + new Date(serverSync).toLocaleTimeString() : 'Server sync pending'}</span>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.025] p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div><div className="text-[9px] font-mono uppercase tracking-widest text-amber-200">What needs attention?</div><h2 className="text-lg font-black text-white mt-1">Your watchlist at a glance</h2></div>
          <button type="button" onClick={() => void refreshNow()} disabled={refreshing} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-bold uppercase text-white/60 hover:text-white disabled:opacity-40"><RefreshCw className={refreshing ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} /> {refreshing ? 'Refreshing…' : 'Refresh prices'}</button>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="rounded-lg border border-white/10 bg-black/15 p-3"><div className="text-[8px] uppercase font-mono text-white/30">Watched</div><div className="text-xl font-black text-white mt-1">{config.watchlist.length}</div></div>
          <div className="rounded-lg border border-rose-400/15 bg-rose-400/5 p-3"><div className="text-[8px] uppercase font-mono text-white/30">Triggered</div><div className="text-xl font-black text-white mt-1">{triggered.length}</div></div>
          <div className="rounded-lg border border-amber-400/15 bg-amber-400/5 p-3"><div className="text-[8px] uppercase font-mono text-white/30">Near target</div><div className="text-xl font-black text-white mt-1">{near.length}</div></div>
          <div className="rounded-lg border border-cyan-400/15 bg-cyan-400/5 p-3"><div className="text-[8px] uppercase font-mono text-white/30">Large moves</div><div className="text-xl font-black text-white mt-1">{largeMoves.length}</div></div>
          <div className="rounded-lg border border-white/10 bg-black/15 p-3"><div className="text-[8px] uppercase font-mono text-white/30">Rule coverage</div><div className="text-xl font-black text-white mt-1">{completeRules}/{rules.length || 0}</div></div>
        </div>
        {(triggered.length || near.length || largeMoves.length) ? (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
            {triggered.slice(0, 3).map(alert => <div key={'trigger-' + alert.symbol + alert.targetPrice} className="rounded-lg border border-rose-400/15 bg-rose-400/5 p-3"><div className="flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 text-rose-300" /><span className="text-[10px] font-bold text-white">{alert.symbol}</span></div><p className="text-[9px] text-rose-200/70 mt-1">{'Target reached at $' + quotes[alert.symbol]?.price.toFixed(2) + '.'}</p></div>)}
            {near.slice(0, 3).map(alert => <div key={'near-' + alert.symbol + alert.targetPrice} className="rounded-lg border border-amber-400/15 bg-amber-400/5 p-3"><div className="flex items-center gap-2"><Info className="w-3.5 h-3.5 text-amber-300" /><span className="text-[10px] font-bold text-white">{alert.symbol}</span></div><p className="text-[9px] text-amber-100/60 mt-1">{distanceToTarget(quotes[alert.symbol].price, alert.targetPrice).toFixed(1) + '% from target.'}</p></div>)}
            {largeMoves.slice(0, 3).map(symbol => <div key={'move-' + symbol} className="rounded-lg border border-cyan-400/15 bg-cyan-400/5 p-3"><div className="flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-cyan-300" /><span className="text-[10px] font-bold text-white">{symbol}</span></div><p className="text-[9px] text-cyan-100/60 mt-1">{formatPct(quotes[symbol]?.changePct) + ' today.'}</p></div>)}
          </div>
        ) : <div className="mt-3 rounded-lg border border-white/5 bg-black/15 p-3 text-[10px] text-white/35">Nothing needs attention based on your active alerts and large-move threshold.</div>}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[.02] p-4 md:p-5">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-3">
          <div><h2 className="text-sm font-black text-white">Your watchlist</h2><p className="text-[10px] text-white/35 mt-1">Up to {MAX_WATCHLIST} stocks. Server Smart Alerts can monitor these without the browser being open.</p></div>
          <form onSubmit={addWatchlist} className="flex gap-2 w-full xl:w-auto"><input aria-label="Add stock to watchlist" value={watchDraft} onChange={e => setWatchDraft(e.target.value)} placeholder="Add ticker, e.g. NVDA" className="min-w-0 w-full xl:w-56 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-mono text-white outline-none" /><button type="submit" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[10px] font-bold text-emerald-200"><Plus className="w-3.5 h-3.5" /> Add</button></form>
        </div>
        <div className="mt-3 flex flex-col md:flex-row gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-white/30" aria-hidden="true" /><input aria-label="Search your watchlist" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search ticker, company or theme" className="w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 py-2 text-[10px] text-white outline-none" /></div><select aria-label="Sort your watchlist" value={sort} onChange={e => setSort(e.target.value as typeof sort)} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[10px] font-mono uppercase text-white/55"><option value="attention">Needs attention</option><option value="symbol">Ticker</option><option value="today">Today's move</option></select></div>
        {message && <div className="mt-2 rounded-lg border border-amber-400/10 bg-amber-400/5 px-3 py-2 text-[9px] text-amber-200">{message}</div>}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(row => {
            const alert = config.alerts.find(item => item.symbol === row.symbol && item.active);
            const hit = alert && row.quote ? (alert.type === 'above' ? row.quote.price >= alert.targetPrice : row.quote.price <= alert.targetPrice) : false;
            const isNear = alert && row.quote && !hit ? distanceToTarget(row.quote.price, alert.targetPrice) <= NEAR_TARGET_PCT : false;
            return <article key={row.symbol} className={'rounded-xl border p-4 bg-[#15181E]/30 ' + (hit ? 'border-rose-400/25' : isNear ? 'border-amber-400/20' : 'border-white/10')}>
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="flex items-center gap-2"><span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] font-mono font-black text-white">{row.symbol}</span>{hit && <span className="rounded bg-rose-400/10 px-1.5 py-0.5 text-[8px] font-bold uppercase text-rose-300">Target reached</span>}{isNear && <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[8px] font-bold uppercase text-amber-300">Near target</span>}</div><h3 className="text-[12px] font-black text-white mt-2 truncate">{row.name}</h3><p className="text-[9px] text-white/30 mt-0.5 truncate">{row.group}{row.theme ? ' · ' + row.theme : ''}</p></div><Star className="w-4 h-4 text-amber-300 fill-amber-300" aria-hidden="true" /></div>
              <div className="mt-4 flex items-end justify-between gap-3"><div><div className="text-2xl font-black font-mono text-white">{row.quote ? '$' + formatPrice(row.quote.price) : '—'}</div><div className={(row.quote?.changePct || 0) >= 0 ? 'text-[10px] font-mono font-bold text-emerald-300 mt-1' : 'text-[10px] font-mono font-bold text-rose-300 mt-1'}>{row.quote ? formatPct(row.quote.changePct) + ' today' : 'Quote unavailable'}</div></div><div className="text-right"><div className={row.quote?.stale ? 'text-[8px] font-mono uppercase text-amber-300' : 'text-[8px] font-mono uppercase text-white/30'}>{freshness(row.quote)}</div>{row.quote?.retrievedAt && <div className="text-[8px] text-white/20 mt-1">{new Date(row.quote.retrievedAt).toLocaleTimeString()}</div>}</div></div>
              {alert && row.quote && <div className="mt-3 rounded-lg border border-white/5 bg-black/15 p-2.5"><div className="text-[8px] font-mono uppercase text-white/30">Your target</div><div className="mt-1 flex items-center justify-between gap-2"><span className="text-[10px] font-mono font-bold text-white">{alert.type === 'above' ? 'Above' : 'Below'} {'$' + formatPrice(alert.targetPrice)}</span><span className="text-[9px] text-white/40">{hit ? 'Reached' : distanceToTarget(row.quote.price, alert.targetPrice).toFixed(1) + '% away'}</span></div></div>}
              <div className="mt-3 flex flex-wrap gap-1.5"><button type="button" onClick={() => { window.location.href = '/outlook?symbol=' + encodeURIComponent(row.symbol); }} className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[8px] font-bold uppercase text-white/60 hover:text-white">View <ArrowUpRight className="w-3 h-3" /></button><button type="button" onClick={() => { setAlertDraft({ symbol: row.symbol, targetPrice: '', type: 'above' }); setEditingAlert(null); document.getElementById('watchlist-alert-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} className="rounded border border-cyan-300/10 bg-cyan-300/5 px-2 py-1.5 text-[8px] font-bold uppercase text-cyan-200">Set alert</button><button type="button" onClick={() => removeWatchlist(row.symbol)} aria-label={'Remove ' + row.symbol + ' from watchlist'} className="rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[8px] font-bold uppercase text-white/45 hover:text-rose-300">Remove</button></div>
            </article>;
          })}
        </div>
        {!filtered.length && <div className="mt-4 rounded-lg border border-white/10 bg-black/15 p-6 text-center text-[10px] text-white/35">No watched stocks match your search.</div>}
      </section>

      <section id="watchlist-alert-form" className="rounded-2xl border border-white/10 bg-white/[.02] p-4 md:p-5">
        <div className="flex items-end justify-between gap-3"><div><h2 className="text-sm font-black text-white">{editingAlert == null ? 'Price alerts' : 'Edit price alert'}</h2><p className="text-[10px] text-white/35 mt-1">Be notified when price crosses a level.</p></div><span className="text-[9px] font-mono uppercase text-white/30">{activeAlerts.length}/{config.alerts.length} active</span></div>
        <form onSubmit={saveAlert} className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2">
          <input aria-label="Alert stock ticker" list="watchlist-stock-options" value={alertDraft.symbol} onChange={e => setAlertDraft(prev => ({ ...prev, symbol: e.target.value }))} placeholder="Ticker" className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-mono text-white outline-none" />
          <select aria-label="Alert direction" value={alertDraft.type} onChange={e => setAlertDraft(prev => ({ ...prev, type: e.target.value as 'above' | 'below' }))} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[10px] font-mono uppercase text-white/65"><option value="above">Rises above</option><option value="below">Falls below</option></select>
          <input aria-label="Alert target price" type="number" min="0.0001" step="any" required placeholder="Target price" value={alertDraft.targetPrice} onChange={e => setAlertDraft(prev => ({ ...prev, targetPrice: e.target.value }))} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-mono text-white outline-none" />
          <button type="submit" className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2 text-[10px] font-bold uppercase text-black"><Plus className="w-3.5 h-3.5" /> {editingAlert == null ? 'Add alert' : 'Save alert'}</button>
        </form>
        <datalist id="watchlist-stock-options">{catalog.map(item => <option key={item.symbol} value={item.symbol}>{item.name}</option>)}</datalist>
        {editingAlert != null && <button type="button" onClick={() => { setEditingAlert(null); setAlertDraft({ symbol: 'NVDA', targetPrice: '', type: 'above' }); }} className="mt-2 text-[9px] text-white/40 hover:text-white">Cancel edit</button>}
        <div className="mt-4 space-y-2">
          {config.alerts.map((alert, index) => {
            const price = quotes[alert.symbol]?.price;
            const hit = price != null && (alert.type === 'above' ? price >= alert.targetPrice : price <= alert.targetPrice);
            const isNear = price != null && !hit && distanceToTarget(price, alert.targetPrice) <= NEAR_TARGET_PCT;
            return <div key={alert.symbol + ':' + alert.targetPrice + ':' + index} className={'flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-lg border p-3 ' + (hit && alert.active ? 'border-rose-400/20 bg-rose-400/5' : isNear && alert.active ? 'border-amber-400/15 bg-amber-400/5' : 'border-white/10 bg-black/15')}>
              <div><div className="flex flex-wrap items-center gap-2"><span className="text-[11px] font-mono font-black text-white">{alert.symbol}</span><span className="text-[9px] text-white/40">{alert.type === 'above' ? 'Rises above' : 'Falls below'} {'$' + formatPrice(alert.targetPrice)}</span><span className={!alert.active ? 'rounded px-1.5 py-0.5 text-[8px] font-bold uppercase bg-white/5 text-white/30' : hit ? 'rounded px-1.5 py-0.5 text-[8px] font-bold uppercase bg-rose-400/10 text-rose-300' : isNear ? 'rounded px-1.5 py-0.5 text-[8px] font-bold uppercase bg-amber-400/10 text-amber-300' : 'rounded px-1.5 py-0.5 text-[8px] font-bold uppercase bg-emerald-400/10 text-emerald-300'}>{!alert.active ? 'Paused' : hit ? 'Triggered' : isNear ? 'Near target' : 'Monitoring'}</span></div><div className="text-[9px] text-white/30 mt-1">Current {price == null ? '—' : '$' + formatPrice(price)}{price != null && !hit ? ' · ' + distanceToTarget(price, alert.targetPrice).toFixed(1) + '% away' : ''}</div></div>
              <div className="flex items-center gap-1"><button type="button" onClick={() => { setEditingAlert(index); setAlertDraft({ symbol: alert.symbol, targetPrice: String(alert.targetPrice), type: alert.type }); }} className="rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[8px] font-bold uppercase text-white/55 hover:text-white">Edit</button><button type="button" aria-label={alert.active ? 'Pause ' + alert.symbol + ' alert' : 'Enable ' + alert.symbol + ' alert'} onClick={() => persist({ ...config, alerts: config.alerts.map((item, i) => i === index ? { ...item, active: !item.active } : item) })} className="rounded border border-white/10 bg-white/5 p-1.5 text-white/45">{alert.active ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}</button><button type="button" aria-label={'Delete ' + alert.symbol + ' alert'} onClick={() => persist({ ...config, alerts: config.alerts.filter((_, i) => i !== index) })} className="rounded border border-white/10 bg-white/5 p-1.5 text-white/45 hover:text-rose-300"><Trash2 className="w-3.5 h-3.5" /></button></div>
            </div>;
          })}
          {!config.alerts.length && <p className="rounded-lg border border-white/10 bg-black/15 p-5 text-[10px] text-white/35 text-center">No price alerts yet.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-cyan-300/10 bg-cyan-300/[.02] p-4 md:p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2"><div><h2 className="text-sm font-black text-white">Notifications</h2><p className="text-[10px] text-white/35 mt-1">Notification controls are centralized in Settings.</p></div><button type="button" onClick={() => { window.location.href = '/settings'; }} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-bold uppercase text-white/55 hover:text-white">Manage notifications <ArrowUpRight className="w-3 h-3" /></button></div>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2"><div className="rounded-lg border border-white/10 bg-black/15 p-2.5"><div className="text-[8px] font-mono uppercase text-white/25">Browser</div><div className="text-[9px] text-white/55 mt-1">{config.browserNotifications ? 'Enabled' : 'Off'}</div></div><div className="rounded-lg border border-white/10 bg-black/15 p-2.5"><div className="text-[8px] font-mono uppercase text-white/25">Large moves</div><div className="text-[9px] text-white/55 mt-1">{config.largeMoveEnabled ? config.largeMovePct + '% threshold' : 'Off'}</div></div><div className="rounded-lg border border-white/10 bg-black/15 p-2.5"><div className="text-[8px] font-mono uppercase text-white/25">Catalysts</div><div className="text-[9px] text-white/55 mt-1">{config.catalystAlerts ? 'Enabled' : 'Off'}</div></div><div className="rounded-lg border border-white/10 bg-black/15 p-2.5"><div className="text-[8px] font-mono uppercase text-white/25">Server</div><div className="text-[9px] text-emerald-300/80 mt-1"><CheckCircle2 className="inline w-3 h-3 mr-1" />Independent</div></div></div>
      </section>

      <EarningsAlerts />

      <details className="rounded-2xl border border-white/10 bg-white/[.02] p-4 md:p-5">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3"><div><div className="text-[9px] font-mono uppercase tracking-widest text-amber-200">Portfolio rules</div><h2 className="text-sm font-black text-white mt-1">Targets, risk limits and exit rules</h2><p className="text-[10px] text-white/35 mt-1">Review the rules saved for the holdings you own.</p></div><Settings2 className="w-4 h-4 text-white/30" /></summary>
        {rulesError ? <div className="mt-4 rounded-lg border border-rose-400/15 bg-rose-400/5 p-3 text-[10px] text-rose-200">{rulesError}</div> : <div className="mt-4 overflow-x-auto rounded-xl border border-white/10"><table className="min-w-[860px] w-full text-left"><thead className="bg-black/20"><tr className="text-[8px] font-mono uppercase tracking-widest text-white/35"><th className="px-3 py-2.5">Stock</th><th className="px-3 py-2.5">Target</th><th className="px-3 py-2.5">Max</th><th className="px-3 py-2.5">Loss limit</th><th className="px-3 py-2.5">Exit rule</th><th className="px-3 py-2.5">Broker alerts</th></tr></thead><tbody className="divide-y divide-white/5">{rules.map(h => <tr key={h.symbol} className="text-[10px] text-white/60"><td className="px-3 py-3 font-mono font-black text-white">{h.symbol}</td><td className="px-3 py-3 font-mono">{h.targetAllocationPct == null ? '—' : h.targetAllocationPct + '%'}</td><td className="px-3 py-3 font-mono">{h.maxAllocationPct == null ? '—' : h.maxAllocationPct + '%'}</td><td className="px-3 py-3 font-mono">{h.lossLimitPct == null ? 'Not set' : h.lossLimitPct + '%'}</td><td className="px-3 py-3 font-mono uppercase">{h.exitRuleType ? (h.exitRuleType === 'trailing_stop' ? 'Trailing' : h.exitRuleType.replaceAll('_', ' ')) + (h.exitRuleValue == null ? '' : ' · ' + h.exitRuleValue + '%') : 'Not set'}</td><td className="px-3 py-3 font-mono text-amber-100">{h.brokerAlerts?.length ? h.brokerAlerts.map(a => (a.direction === 'below' ? 'Below ' : 'Above ') + formatPrice(a.price)).join(' · ') : 'Not set'}</td></tr>)}</tbody></table></div>}
      </details>

      <section className="rounded-2xl border border-white/10 bg-white/[.02] p-4">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-black text-white">Recent alerts</h2><p className="text-[9px] text-white/30 mt-1">Local notification history from this device.</p></div><div className="flex items-center gap-2"><span className="text-[8px] font-mono uppercase text-white/25">{events.length} stored</span><button type="button" onClick={() => { saveAlertEvents([]); setEvents([]); }} className="text-[8px] font-bold uppercase text-white/35 hover:text-rose-300">Clear</button></div></div>
        <div className="mt-3 max-h-64 overflow-y-auto space-y-2">{events.slice(0, 12).map(event => <div key={event.id} className="rounded-lg border border-white/5 bg-black/15 p-2.5"><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-bold text-white">{event.title}</span><span className="text-[8px] font-mono uppercase text-white/25">{event.severity}</span></div><div className="text-[9px] text-white/45 mt-1">{event.message}</div><div className="text-[8px] font-mono text-white/20 mt-1">{new Date(event.timestamp).toLocaleString()}</div></div>)}{!events.length && <p className="text-[10px] text-white/30 py-4 text-center">No local alert events yet.</p>}</div>
      </section>
    </div>
  );
}
