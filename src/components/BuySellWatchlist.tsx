import React, { useEffect, useState } from 'react';
import { AppConfig, loadConfig, saveConfig, formatPrice } from '../utils';
import { STOCK_METADATA } from '../data';
import { Bell, BellOff, Trash2, Plus, Star, Zap, ShieldCheck } from 'lucide-react';
import { authFetch } from '../utils/apiAuth';
import { loadAlertEvents, notifyTelegram, requestBrowserNotifications, isTelegramEnabled, setTelegramEnabled } from '../utils/alertEngine';
import { fetchPortfolioHoldings, StoredPortfolioHolding } from '../utils/portfolioApi';
import EarningsAlerts from './EarningsAlerts';

export default function BuySellWatchlist() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [liveQuotes, setLiveQuotes] = useState<Record<string, number>>({});
  const [portfolioRules, setPortfolioRules] = useState<StoredPortfolioHolding[]>([]);
  const [portfolioRulesError, setPortfolioRulesError] = useState('');
  const [lastQuoteRefresh, setLastQuoteRefresh] = useState<number | null>(null);
  const [newSymbol, setNewSymbol] = useState('NBIS');
  const [newTargetPrice, setNewTargetPrice] = useState('');
  const [newType, setNewType] = useState<'above' | 'below'>('above');
  const [alertEvents, setAlertEvents] = useState(loadAlertEvents());
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [telegramEnabled, setTelegramEnabledState] = useState(() => isTelegramEnabled());
  const [telegramConfigured, setTelegramConfigured] = useState<boolean | null>(null);
  const [telegramChecking, setTelegramChecking] = useState(true);
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [telegramMessage, setTelegramMessage] = useState('');

  useEffect(() => {
    setConfig(loadConfig());
    setAlertEvents(loadAlertEvents());

    let cancelled = false;
    const loadRules = async () => {
      try {
        const holdings = await fetchPortfolioHoldings();
        if (!cancelled) {
          setPortfolioRules(holdings);
          setPortfolioRulesError('');
        }
      } catch (error) {
        if (!cancelled) setPortfolioRulesError(error instanceof Error ? error.message : 'Portfolio rules unavailable');
      }
    };
    void loadRules();

    const checkTelegram = async () => {
      setTelegramChecking(true);
      try {
        const response = await authFetch('/api/alert-notify', { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!cancelled) {
          if (response.status === 401) {
            setTelegramConfigured(null);
            setTelegramMessage('Authentication required. Refresh the dashboard session before enabling Telegram alerts.');
          } else {
            setTelegramConfigured(response.ok && data.telegram_configured === true);
          }
        }
      } catch {
        if (!cancelled) setTelegramConfigured(null);
      } finally {
        if (!cancelled) setTelegramChecking(false);
      }
    };
    void checkTelegram();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setAlertEvents(loadAlertEvents()), 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    let timer: number | undefined;

    const refreshQuotes = async () => {
      const symbols = [...new Set([...config.watchlist, ...config.alerts.map(a => a.symbol)])];
      const results = await Promise.all(symbols.map(async symbol => {
        try {
          const res = await fetch(
            '/api/quote?symbol=' + encodeURIComponent(symbol) + '&refresh=true',
            { cache: 'no-store' }
          );
          if (!res.ok) return null;
          const data = await res.json();
          return [symbol, Number(data.price)] as const;
        } catch {
          return null;
        }
      }));

      if (cancelled) return;
      const next: Record<string, number> = {};
      results.forEach(item => {
        if (item && Number.isFinite(item[1])) next[item[0]] = item[1];
      });
      setLiveQuotes(prev => ({ ...prev, ...next }));
      setLastQuoteRefresh(Date.now());
      timer = window.setTimeout(refreshQuotes, 60000);
    };

    void refreshQuotes();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
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

  const handleLargeMoveToggle = () => {
    const updated = { ...config, largeMoveEnabled: !config.largeMoveEnabled };
    setConfig(updated);
    saveConfig(updated);
  };

  const handleLargeMoveThreshold = (value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const updated = { ...config, largeMovePct: parsed };
    setConfig(updated);
    saveConfig(updated);
  };

  const handleTelegramToggle = async () => {
    setTelegramMessage('');
    if (!telegramEnabled) {
      if (telegramConfigured !== true) {
        setTelegramMessage('Telegram is not configured on the server. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Vercel.');
        return;
      }
      setTelegramEnabled(true);
      setTelegramEnabledState(true);
      setTelegramMessage('Telegram alerts enabled for this browser session.');
      return;
    }

    setTelegramEnabled(false);
    setTelegramEnabledState(false);
    setTelegramMessage('Telegram alerts disabled on this browser. Scheduled server-side digests and earnings alerts are unchanged.');
  };

  const handleTelegramTest = async () => {
    if (!telegramEnabled || telegramConfigured !== true || telegramTesting) return;
    setTelegramTesting(true);
    setTelegramMessage('Sending test alert…');
    try {
      const response = await authFetch('/api/alert-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            id: 'telegram-test:' + Date.now(),
            type: 'price',
            severity: 'info',
            symbol: 'AIW',
            title: 'Telegram connection test',
            message: 'Your AI Infra Watch Telegram signal channel is connected and receiving dashboard alerts.',
            timestamp: Date.now(),
            source: 'Watchlist settings',
          },
        }),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || data?.delivery?.error || 'Telegram test failed.');
      setTelegramMessage('Test alert sent successfully. Check your Telegram chat.');
    } catch (error) {
      setTelegramMessage(error instanceof Error ? error.message : 'Telegram test failed.');
    } finally {
      setTelegramTesting(false);
    }
  };

  const handleBrowserNotifications = async () => {
    const permission = await requestBrowserNotifications();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      const updated = { ...config, browserNotifications: true };
      setConfig(updated);
      saveConfig(updated);
    }
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
      <div className="aiw-page-header flex flex-col space-y-1 md:space-y-2 border-b border-white/10 pb-4">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Section 06 / Signals</span>
        <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase italic text-white">Alert Targets &amp; Watchlist</h1>
        <p className="text-xs text-white/60 max-w-3xl leading-relaxed">Monitor configured price thresholds using the live server market feed.</p>
        <div className="text-[9px] font-mono uppercase tracking-wider text-white/30 mt-1">
          AUTO QUOTES 60S{lastQuoteRefresh ? ' · LAST CHECK ' + new Date(lastQuoteRefresh).toLocaleTimeString() : ''}
        </div>
      </div>

      <EarningsAlerts />

      <section className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.025] p-4 md:p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-amber-200">Portfolio Rules Matrix</div>
            <h2 className="text-lg font-black uppercase tracking-tight text-white mt-1">All holdings · decision &amp; allocation rules</h2>
            <p className="text-[10px] text-white/40 mt-1">One place to review every holding's thesis, risk limit, exit rule, allocation boundaries and broker review prices. These are review/alert points, not automatic trades.</p>
          </div>
          <div className="shrink-0 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.04] px-3 py-2 text-[9px] font-mono uppercase tracking-widest text-emerald-200">
            {portfolioRules.filter(h => h.lossLimitPct != null || h.exitRuleType || (h.decisionThesis || '').trim()).length} of {portfolioRules.length} holdings have a rule
          </div>
        </div>

        {portfolioRulesError ? (
          <div className="mt-4 rounded-lg border border-rose-400/15 bg-rose-400/[0.04] px-3 py-2 text-[10px] text-rose-200">{portfolioRulesError}</div>
        ) : portfolioRules.length === 0 ? (
          <div className="mt-4 rounded-lg border border-white/10 bg-black/10 px-3 py-5 text-center text-[10px] text-white/35">Loading portfolio rules…</div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
            <table className="min-w-[1050px] w-full text-left">
              <thead className="bg-black/20">
                <tr className="text-[8px] font-mono uppercase tracking-widest text-white/35">
                  <th className="px-3 py-2.5">Stock</th>
                  <th className="px-3 py-2.5">Target</th>
                  <th className="px-3 py-2.5">Max</th>
                  <th className="px-3 py-2.5">Loss limit</th>
                  <th className="px-3 py-2.5">Exit rule</th>
                  <th className="px-3 py-2.5">Broker review levels</th>
                  <th className="px-3 py-2.5">Thesis</th>
                  <th className="px-3 py-2.5">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {portfolioRules.map(h => (
                  <tr key={h.symbol} className="text-[10px] text-white/65 hover:bg-white/[0.02]">
                    <td className="px-3 py-3 align-top">
                      <button type="button" onClick={() => { window.location.href = '/outlook?symbol=' + encodeURIComponent(h.symbol); }} className="font-mono font-black text-white hover:text-amber-200">{h.symbol}</button>
                    </td>
                    <td className="px-3 py-3 align-top font-mono">{h.targetAllocationPct == null ? '—' : h.targetAllocationPct + '%'}</td>
                    <td className="px-3 py-3 align-top font-mono">{h.maxAllocationPct == null ? '—' : h.maxAllocationPct + '%'}</td>
                    <td className="px-3 py-3 align-top font-mono">{h.lossLimitPct == null ? '—' : h.lossLimitPct + '%'}</td>
                    <td className="px-3 py-3 align-top font-mono uppercase">{h.exitRuleType ? (h.exitRuleType === 'trailing_stop' ? 'Trailing' : h.exitRuleType.replaceAll('_', ' ')) + (h.exitRuleValue == null ? '' : ' · ' + h.exitRuleValue + '%') : '—'}</td>
                    <td className="px-3 py-3 align-top font-mono text-amber-100">{h.brokerAlerts?.length ? h.brokerAlerts.map(alert => '</td>
                    <td className="px-3 py-3 align-top max-w-[360px] text-white/45">{h.decisionThesis || 'Not recorded'}{(!h.lossLimitPct && !h.exitRuleType) ? <div className="mt-1 text-[8px] text-rose-200/60">Missing loss/exit rule</div> : null}{!h.decisionThesis ? <div className="mt-1 text-[8px] text-rose-200/60">Missing thesis</div> : null}</td>
                    <td className="px-3 py-3 align-top">
                      <button type="button" onClick={() => { window.location.href = '/outlook?symbol=' + encodeURIComponent(h.symbol); }} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[8px] font-mono uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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

          <div className="pt-3 border-t border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-white/40 uppercase tracking-widest font-black">Catalyst Alerts</span>
              <button
                type="button"
                onClick={() => {
                  const updated = { ...config, catalystAlerts: !config.catalystAlerts };
                  setConfig(updated);
                  saveConfig(updated);
                }}
                className={config.catalystAlerts ? 'px-2 py-1 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold uppercase' : 'px-2 py-1 rounded border border-white/10 bg-white/5 text-white/40 text-[9px] font-bold uppercase'}
              >
                {config.catalystAlerts ? 'ON' : 'OFF'}
              </button>
            </div>
            <p className="text-[10px] text-white/40">New SEC material-agreement filings and congressional disclosures for watched symbols.</p>
          </div>

          <div className="pt-3 border-t border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[9px] text-white/40 uppercase tracking-widest font-black">Telegram Notifications</span>
                <div className="text-[9px] text-white/30 mt-1">
                  {telegramChecking
                    ? 'Checking server configuration…'
                    : telegramConfigured === true
                      ? 'Server bot connected'
                      : telegramConfigured === false
                        ? 'Server bot not configured'
                        : telegramMessage || 'Authentication required' }
                </div>
              </div>
              <span className={telegramConfigured === true ? 'px-2 py-1 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold uppercase' : 'px-2 py-1 rounded border border-white/10 bg-white/5 text-white/40 text-[9px] font-bold uppercase'}>
                {telegramConfigured === true ? 'CONNECTED' : telegramChecking ? 'CHECKING' : telegramMessage ? 'AUTH REQUIRED' : 'NOT READY'}
              </span>
            </div>
            <p className="text-[10px] text-white/40">Send price-target, Smart Move, and catalyst signals to your configured Telegram chat.</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleTelegramToggle()}
                disabled={telegramChecking || telegramConfigured !== true}
                className={telegramEnabled
                  ? 'px-3 py-2 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50'
                  : 'px-3 py-2 rounded border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50'}
              >
                {telegramEnabled ? '✓ Telegram enabled' : 'Enable Telegram alerts'}
              </button>
              <button
                type="button"
                onClick={() => void handleTelegramTest()}
                disabled={!telegramEnabled || telegramConfigured !== true || telegramTesting}
                className="px-3 py-2 rounded border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
              >
                {telegramTesting ? 'Sending…' : 'Send test alert'}
              </button>
            </div>
            {telegramMessage && <p className="text-[9px] text-white/50 leading-relaxed">{telegramMessage}</p>}
          </div>

          <div className="pt-3 border-t border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-white/40 uppercase tracking-widest font-black">Smart Move Alerts</span>
              <button
                type="button"
                onClick={handleLargeMoveToggle}
                className={config.largeMoveEnabled ? 'px-2 py-1 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold uppercase' : 'px-2 py-1 rounded border border-white/10 bg-white/5 text-white/40 text-[9px] font-bold uppercase'}
              >
                {config.largeMoveEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[10px] text-white/50">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Alert when a watched stock moves at least</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={config.largeMovePct}
                  onChange={e => handleLargeMoveThreshold(e.target.value)}
                  className="w-16 px-2 py-1.5 bg-[#0F1115] border border-white/10 rounded text-white text-right"
                />
                <span className="text-[10px] text-white/40">%</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleBrowserNotifications}
              disabled={notificationPermission === 'granted'}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded border border-white/10 bg-white/5 hover:bg-white/10 text-[10px] font-bold uppercase tracking-wider text-white/70 disabled:opacity-50"
            >
              <Bell className="w-3.5 h-3.5" />
              {notificationPermission === 'granted' ? 'Browser notifications enabled' : 'Enable browser notifications'}
            </button>
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

          <div className="pt-3 border-t border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-white/40 uppercase tracking-widest font-black">Recent Alert Events</span>
              <span className="text-[9px] font-mono text-white/30">{alertEvents.length} stored</span>
            </div>
            {alertEvents.length === 0 ? (
              <p className="text-[10px] text-white/30 py-2">No alert events yet. The monitor checks every 60 seconds.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {alertEvents.slice(0, 8).map(event => (
                  <div key={event.id} className="p-2.5 rounded border border-white/10 bg-[#0F1115]/40">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-[10px] font-bold text-white truncate">{event.title}</span>
                      </div>
                      <span className="text-[8px] uppercase text-white/30">{event.severity}</span>
                    </div>
                    <p className="text-[9px] text-white/50 mt-1 leading-relaxed">{event.message}</p>
                    <p className="text-[8px] text-white/25 mt-1 font-mono">{new Date(event.timestamp).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
 + formatPrice(alert.price) + ' ' + alert.direction).join(' / ') : 'Not set'}</td>
                    <td className="px-3 py-3 align-top max-w-[360px] text-white/45">{h.decisionThesis || 'Not recorded'}</td>
                    <td className="px-3 py-3 align-top">
                      <button type="button" onClick={() => { window.location.href = '/outlook?symbol=' + encodeURIComponent(h.symbol); }} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[8px] font-mono uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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

          <div className="pt-3 border-t border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-white/40 uppercase tracking-widest font-black">Catalyst Alerts</span>
              <button
                type="button"
                onClick={() => {
                  const updated = { ...config, catalystAlerts: !config.catalystAlerts };
                  setConfig(updated);
                  saveConfig(updated);
                }}
                className={config.catalystAlerts ? 'px-2 py-1 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold uppercase' : 'px-2 py-1 rounded border border-white/10 bg-white/5 text-white/40 text-[9px] font-bold uppercase'}
              >
                {config.catalystAlerts ? 'ON' : 'OFF'}
              </button>
            </div>
            <p className="text-[10px] text-white/40">New SEC material-agreement filings and congressional disclosures for watched symbols.</p>
          </div>

          <div className="pt-3 border-t border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[9px] text-white/40 uppercase tracking-widest font-black">Telegram Notifications</span>
                <div className="text-[9px] text-white/30 mt-1">
                  {telegramChecking
                    ? 'Checking server configuration…'
                    : telegramConfigured === true
                      ? 'Server bot connected'
                      : telegramConfigured === false
                        ? 'Server bot not configured'
                        : telegramMessage || 'Authentication required' }
                </div>
              </div>
              <span className={telegramConfigured === true ? 'px-2 py-1 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold uppercase' : 'px-2 py-1 rounded border border-white/10 bg-white/5 text-white/40 text-[9px] font-bold uppercase'}>
                {telegramConfigured === true ? 'CONNECTED' : telegramChecking ? 'CHECKING' : telegramMessage ? 'AUTH REQUIRED' : 'NOT READY'}
              </span>
            </div>
            <p className="text-[10px] text-white/40">Send price-target, Smart Move, and catalyst signals to your configured Telegram chat.</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleTelegramToggle()}
                disabled={telegramChecking || telegramConfigured !== true}
                className={telegramEnabled
                  ? 'px-3 py-2 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50'
                  : 'px-3 py-2 rounded border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50'}
              >
                {telegramEnabled ? '✓ Telegram enabled' : 'Enable Telegram alerts'}
              </button>
              <button
                type="button"
                onClick={() => void handleTelegramTest()}
                disabled={!telegramEnabled || telegramConfigured !== true || telegramTesting}
                className="px-3 py-2 rounded border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50"
              >
                {telegramTesting ? 'Sending…' : 'Send test alert'}
              </button>
            </div>
            {telegramMessage && <p className="text-[9px] text-white/50 leading-relaxed">{telegramMessage}</p>}
          </div>

          <div className="pt-3 border-t border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-white/40 uppercase tracking-widest font-black">Smart Move Alerts</span>
              <button
                type="button"
                onClick={handleLargeMoveToggle}
                className={config.largeMoveEnabled ? 'px-2 py-1 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold uppercase' : 'px-2 py-1 rounded border border-white/10 bg-white/5 text-white/40 text-[9px] font-bold uppercase'}
              >
                {config.largeMoveEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[10px] text-white/50">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Alert when a watched stock moves at least</span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={config.largeMovePct}
                  onChange={e => handleLargeMoveThreshold(e.target.value)}
                  className="w-16 px-2 py-1.5 bg-[#0F1115] border border-white/10 rounded text-white text-right"
                />
                <span className="text-[10px] text-white/40">%</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleBrowserNotifications}
              disabled={notificationPermission === 'granted'}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded border border-white/10 bg-white/5 hover:bg-white/10 text-[10px] font-bold uppercase tracking-wider text-white/70 disabled:opacity-50"
            >
              <Bell className="w-3.5 h-3.5" />
              {notificationPermission === 'granted' ? 'Browser notifications enabled' : 'Enable browser notifications'}
            </button>
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

          <div className="pt-3 border-t border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-white/40 uppercase tracking-widest font-black">Recent Alert Events</span>
              <span className="text-[9px] font-mono text-white/30">{alertEvents.length} stored</span>
            </div>
            {alertEvents.length === 0 ? (
              <p className="text-[10px] text-white/30 py-2">No alert events yet. The monitor checks every 60 seconds.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {alertEvents.slice(0, 8).map(event => (
                  <div key={event.id} className="p-2.5 rounded border border-white/10 bg-[#0F1115]/40">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-[10px] font-bold text-white truncate">{event.title}</span>
                      </div>
                      <span className="text-[8px] uppercase text-white/30">{event.severity}</span>
                    </div>
                    <p className="text-[9px] text-white/50 mt-1 leading-relaxed">{event.message}</p>
                    <p className="text-[8px] text-white/25 mt-1 font-mono">{new Date(event.timestamp).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
