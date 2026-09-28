import React, { useEffect, useState } from 'react';
import { AppConfig, loadConfig, saveConfig, formatPrice } from '../utils';
import { STOCK_METADATA } from '../data';
import { Bell, BellOff, Trash2, Plus, Star } from 'lucide-react';

export default function BuySellWatchlist() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [liveQuotes, setLiveQuotes] = useState<Record<string, number>>({});
  const [newSymbol, setNewSymbol] = useState('NBIS');
  const [newTargetPrice, setNewTargetPrice] = useState('');
  const [newType, setNewType] = useState<'above' | 'below'>('above');

  useEffect(() => { setConfig(loadConfig()); }, []);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    const symbols = [...new Set([...config.watchlist, ...config.alerts.map(a => a.symbol)])];
    Promise.all(symbols.map(async symbol => {
      try {
        const res = await fetch('/api/quote?symbol=' + encodeURIComponent(symbol));
        if (!res.ok) return null;
        const data = await res.json();
        return [symbol, Number(data.price)] as const;
      } catch { return null; }
    })).then(results => {
      if (cancelled) return;
      const next: Record<string, number> = {};
      results.forEach(item => {
        if (item && Number.isFinite(item[1])) next[item[0]] = item[1];
      });
      setLiveQuotes(next);
    });
    return () => { cancelled = true; };
  }, [config]);

  if (!config) return null;

  const handleToggleAlert = (index: number) => {
    const alerts = [...config.alerts];
    alerts[index] = { ...alerts[index], active: !alerts[index].active };
    const updated = { ...config, alerts };
    setConfig(updated);
    saveConfig(updated);
  };

  const handleRemoveAlert = (index: number) => {
    const updated = { ...config, alerts: config.alerts.filter((_, i) => i !== index) };
    setConfig(updated);
    saveConfig(updated);
  };

  const handleAddAlert = (e: React.FormEvent) => {
    e.preventDefault();
    const targetPrice = parseFloat(newTargetPrice);
    if (!Number.isFinite(targetPrice)) return;
    const updated = {
      ...config,
      alerts: [...config.alerts, { symbol: newSymbol, targetPrice, type: newType, active: true }]
    };
    setConfig(updated);
    saveConfig(updated);
    setNewTargetPrice('');
  };

  return (
    <div className="space-y-6" id="watchlist-view">
      <div className="flex flex-col space-y-1 md:space-y-2 border-b border-white/10 pb-4">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Section 06 / Signals</span>
        <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase italic text-white">Alert Targets &amp; Watchlist</h1>
        <p className="text-xs text-white/60 max-w-3xl leading-relaxed">Monitor configured price thresholds using the live server market feed.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-white">Active Watchlist</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {config.watchlist.map(symbol => {
              const meta = STOCK_METADATA[symbol];
              const price = liveQuotes[symbol];
              return (
                <div key={symbol} className="bg-[#15181E]/30 border border-white/10 p-4 rounded-xl flex flex-col justify-between space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[9px] font-mono px-2 py-0.5 bg-white/5 border border-white/10 rounded text-white font-black tracking-widest uppercase">{symbol}</span>
                      <h4 className="text-sm font-black uppercase tracking-tight text-white mt-2 truncate max-w-[180px]">{meta?.name || symbol}</h4>
                    </div>
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  </div>
                  <div className="flex items-baseline space-x-2 pt-1 font-mono">
                    <span className="text-2xl font-black text-white">{price != null ? '$' + formatPrice(price) : '—'}</span>
                    <span className="text-xs font-bold text-white/40">LIVE</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-[#15181E]/30 border border-white/10 rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-white">Price Target Signals</h3>
            <div className="space-y-3 font-mono text-xs">
              {config.alerts.length === 0 ? (
                <p className="text-white/40 text-center py-6">No alerts set. Create one below.</p>
              ) : config.alerts.map((alert, index) => {
                const price = liveQuotes[alert.symbol];
                const triggered = price != null && (alert.type === 'above' ? price >= alert.targetPrice : price <= alert.targetPrice);
                const badgeClass = triggered && alert.active
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/10 animate-pulse'
                  : 'bg-white/5 text-white/40 border border-white/5';
                return (
                  <div key={index} className="flex items-center justify-between p-2.5 bg-[#0F1115]/40 border border-white/10 rounded">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-black text-white">{alert.symbol}</span>
                        <span className={'text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ' + badgeClass}>
                          {triggered && alert.active ? 'TRIGGERED' : 'MONITORING'}
                        </span>
                      </div>
                      <div className="text-[10px] text-white/40">
                        If {alert.type} {'$' + formatPrice(alert.targetPrice)} (Cur: {price != null ? '$' + formatPrice(price) : '—'})
                      </div>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button onClick={() => handleToggleAlert(index)} className="p-1.5 hover:bg-white/5 text-white/40 hover:text-white rounded cursor-pointer transition" title={alert.active ? 'Mute Alert' : 'Enable Alert'}>
                        {alert.active ? <Bell className="w-4 h-4 text-emerald-400" /> : <BellOff className="w-4 h-4" />}
                      </button>
                      <button onClick={() => handleRemoveAlert(index)} className="p-1.5 hover:bg-white/5 text-white/40 hover:text-rose-400 rounded cursor-pointer transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleAddAlert} className="space-y-3 pt-3 border-t border-white/10 font-mono text-xs">
            <span className="text-[9px] text-white/40 uppercase tracking-widest font-black block">Add Signal Threshold</span>
            <div className="grid grid-cols-2 gap-2">
              <select value={newSymbol} onChange={e => setNewSymbol(e.target.value)} className="px-2 py-2 bg-[#0F1115] border border-white/10 rounded text-white focus:outline-none font-mono text-xs">
                {Object.keys(STOCK_METADATA).map(s => <option key={s} value={s} className="bg-[#0F1115] text-white">{s}</option>)}
              </select>
              <select value={newType} onChange={e => setNewType(e.target.value as 'above' | 'below')} className="px-2 py-2 bg-[#0F1115] border border-white/10 rounded text-white focus:outline-none font-mono text-xs">
                <option value="above">Goes Above</option>
                <option value="below">Goes Below</option>
              </select>
            </div>
            <div className="flex space-x-2">
              <input type="number" step="any" required placeholder="Price threshold..." value={newTargetPrice} onChange={e => setNewTargetPrice(e.target.value)} className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded text-white focus:outline-none font-mono text-xs" />
              <button type="submit" className="px-4 py-2 bg-white text-black border border-white hover:bg-white/90 font-bold uppercase tracking-wider rounded flex items-center space-x-1 cursor-pointer transition text-xs">
                <Plus className="w-4 h-4" /><span>Add</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
