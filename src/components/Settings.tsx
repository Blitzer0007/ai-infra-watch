import React, { useEffect, useState } from 'react';
import { AppConfig, getOverviewFavorites, loadConfig, saveConfig, fetchLiveQuote } from '../utils';
import { STOCK_METADATA } from '../data';
import { STOCK_UNIVERSE } from '../utils/stockUniverse';
import { Key, Check, Info, Settings2, Bell, MessageCircle, Zap, Database, RotateCcw } from 'lucide-react';
import { authFetch } from '../utils/apiAuth';
import { requestBrowserNotifications, isTelegramEnabled, setTelegramEnabled } from '../utils/alertEngine';

export default function Settings() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [telegramConfigured, setTelegramConfigured] = useState<boolean | null>(null);
  const [telegramEnabled, setTelegramEnabledState] = useState(() => isTelegramEnabled());
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [telegramMessage, setTelegramMessage] = useState('');
  const [quoteTest, setQuoteTest] = useState<{ status: 'idle' | 'testing' | 'success' | 'error'; message: string }>({
    status: 'idle',
    message: '',
  });

  useEffect(() => {
    setConfig(loadConfig());
    setApiKeyInput(loadConfig().finnhubKey);

    let cancelled = false;
    const checkTelegram = async () => {
      try {
        const response = await authFetch('/api/alert-notify', { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!cancelled) setTelegramConfigured(response.ok && data.telegram_configured === true);
      } catch {
        if (!cancelled) setTelegramConfigured(null);
      }
    };
    void checkTelegram();
    return () => { cancelled = true; };
  }, []);

  if (!config) {
    return <div className="rounded-xl border border-white/10 bg-white/[.02] p-6 text-xs font-mono text-white/40">Loading settings…</div>;
  }

  const favorites = getOverviewFavorites(config);
  const universe = STOCK_UNIVERSE.map(item => item.symbol);
  const activeSymbols = [...new Set([...universe, ...Object.keys(STOCK_METADATA)])];

  const persist = (updated: AppConfig) => {
    setConfig(updated);
    saveConfig(updated);
  };

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    persist({ ...config, finnhubKey: apiKeyInput.trim() });
    setSavedSuccess(true);
    window.setTimeout(() => setSavedSuccess(false), 2000);
  };

  const toggleFavorite = (symbol: string) => {
    const current = getOverviewFavorites(config);
    if (current.includes(symbol)) {
      if (current.length <= 1) return;
      persist({ ...config, overviewFavorites: current.filter(s => s !== symbol) });
      return;
    }
    if (current.length >= 3) return;
    persist({ ...config, overviewFavorites: [...current, symbol] });
  };

  const toggleBrowserNotifications = async () => {
    if (config.browserNotifications) {
      persist({ ...config, browserNotifications: false });
      return;
    }
    const permission = await requestBrowserNotifications();
    if (permission === 'granted') {
      persist({ ...config, browserNotifications: true });
    }
  };

  const toggleTelegram = () => {
    setTelegramMessage('');
    if (telegramConfigured !== true) {
      setTelegramMessage('Telegram is not configured on the server yet. Add the Telegram secrets in Vercel first.');
      return;
    }
    const next = !telegramEnabled;
    setTelegramEnabled(next);
    setTelegramEnabledState(next);
    setTelegramMessage(next
      ? 'Telegram alerts enabled for this browser session.'
      : 'Telegram alerts disabled for this browser session. Scheduled server-side alerts remain available.');
  };

  const testTelegram = async () => {
    if (!telegramEnabled || telegramConfigured !== true || telegramTesting) return;
    setTelegramTesting(true);
    setTelegramMessage('Sending test message…');
    try {
      const response = await authFetch('/api/alert-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            id: 'telegram-settings-test:' + Date.now(),
            type: 'price',
            severity: 'info',
            symbol: 'AIW',
            title: 'Telegram connection test',
            message: 'AI Infra Watch Telegram notifications are connected.',
            timestamp: Date.now(),
            source: 'Settings',
          },
        }),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || data?.delivery?.error || 'Telegram test failed.');
      setTelegramMessage('Test message sent. Check your Telegram chat.');
    } catch (error) {
      setTelegramMessage(error instanceof Error ? error.message : 'Telegram test failed.');
    } finally {
      setTelegramTesting(false);
    }
  };

  const testQuote = async () => {
    setQuoteTest({ status: 'testing', message: 'Checking the live quote path…' });
    try {
      const result = await fetchLiveQuote('NVDA', apiKeyInput.trim(), true);
      const source = result.provider || 'server fallback';
      setQuoteTest({
        status: 'success',
        message: 'NVDA returned $' + result.price.toFixed(2) + ' from ' + source + '.',
      });
    } catch (error) {
      setQuoteTest({
        status: 'error',
        message: error instanceof Error ? error.message : 'Quote test failed.',
      });
    }
  };

  const resetPreferences = () => {
    const defaults = loadConfig();
    const updated: AppConfig = {
      ...config,
      finnhubKey: '',
      overviewFavorites: defaults.overviewFavorites,
      browserNotifications: false,
      catalystAlerts: defaults.catalystAlerts,
      largeMoveEnabled: defaults.largeMoveEnabled,
      largeMovePct: defaults.largeMovePct,
    };
    setApiKeyInput('');
    setTelegramMessage('');
    persist(updated);
  };

  return (
    <div className="space-y-6" id="settings-view">
      <div className="aiw-page-header border-b border-white/10 pb-5">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">System preferences</span>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white mt-1">Settings</h1>
        <p className="text-xs text-white/50 max-w-3xl mt-2 leading-relaxed">
          Control what appears on your dashboard, how notifications behave, and which market-data connection the app uses.
        </p>
      </div>

      <section className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.025] p-4 md:p-5" aria-labelledby="dashboard-settings-heading">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-emerald-300" aria-hidden="true" />
          <h2 id="dashboard-settings-heading" className="text-sm font-black text-white">Dashboard</h2>
        </div>
        <p className="text-[10px] text-white/40 mt-1">Pick the three stocks shown on your Overview cards. This does not change the stocks monitored by alerts.</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-white/35">Overview favorites</div>
            <div className="text-[10px] text-white/55 mt-1">{favorites.length}/3 selected</div>
          </div>
          <div className="flex flex-wrap gap-1.5 justify-end">
            {favorites.map(symbol => (
              <span key={symbol} className="rounded border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[9px] font-mono text-emerald-300">{symbol}</span>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
          {activeSymbols.map(symbol => {
            const active = favorites.includes(symbol);
            const meta = STOCK_METADATA[symbol];
            const universeItem = STOCK_UNIVERSE.find(item => item.symbol === symbol);
            const name = meta?.name || universeItem?.name || symbol;
            return (
              <button
                type="button"
                key={symbol}
                aria-pressed={active}
                aria-label={(active ? 'Remove ' : 'Add ') + symbol + ' from Overview favorites'}
                onClick={() => toggleFavorite(symbol)}
                disabled={!active && favorites.length >= 3}
                className={'rounded-lg border p-2 text-left transition ' + (
                  active
                    ? 'border-emerald-400/25 bg-emerald-400/10 text-white'
                    : 'border-white/10 bg-white/[.02] text-white/50 hover:text-white disabled:opacity-35'
                )}
              >
                <div className="text-[10px] font-mono font-black">{symbol}</div>
                <div className="text-[9px] mt-0.5 truncate">{name}</div>
                {active && <Check className="w-3.5 h-3.5 text-emerald-300 mt-1" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4" aria-label="Market data and notifications settings">
        <div className="rounded-2xl border border-white/10 bg-white/[.02] p-4 md:p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-300" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-black text-white">Market data</h2>
              <p className="text-[10px] text-white/35 mt-0.5">Use Finnhub when you have a key; otherwise the app uses its server quote fallback.</p>
            </div>
          </div>

          <form onSubmit={handleSaveKey} className="space-y-3">
            <label className="text-[9px] font-mono uppercase tracking-widest text-white/35 block">Finnhub API key</label>
            <input
              type="password"
              placeholder="Optional — paste your Finnhub key"
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-300/40"
            />
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-bold text-white hover:bg-white/15 transition">
                {savedSuccess ? 'Saved' : 'Save key'}
              </button>
              <button type="button" onClick={() => void testQuote()} disabled={quoteTest.status === 'testing'} className="rounded-lg border border-cyan-300/15 bg-cyan-300/5 px-3 py-2 text-[10px] font-bold text-cyan-200 hover:bg-cyan-300/10 transition disabled:opacity-40">
                {quoteTest.status === 'testing' ? 'Testing…' : 'Test quote'}
              </button>
            </div>
          </form>

          {quoteTest.message && (
            <div className={'rounded-lg border px-3 py-2 text-[10px] leading-relaxed ' + (
              quoteTest.status === 'success'
                ? 'border-emerald-400/15 bg-emerald-400/5 text-emerald-200'
                : quoteTest.status === 'error'
                  ? 'border-rose-400/15 bg-rose-400/5 text-rose-200'
                  : 'border-white/10 bg-white/[.02] text-white/45'
            )}>
              {quoteTest.message}
            </div>
          )}

          <div className="rounded-lg border border-white/5 bg-black/15 p-3 text-[9px] text-white/35 leading-relaxed">
            Your Finnhub key is stored locally in this browser. Notification secrets are never entered here; Telegram delivery secrets stay server-side.
            <a href="https://finnhub.io/" target="_blank" rel="noopener noreferrer" className="block mt-1 text-cyan-300 hover:text-cyan-200">Get a Finnhub key →</a>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[.02] p-4 md:p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-300" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-black text-white">Notifications</h2>
              <p className="text-[10px] text-white/35 mt-0.5">Browser alerts need this page open. Server alerts can run independently.</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/15 p-3">
              <div className="flex items-center gap-2 min-w-0">
                <Bell className="w-3.5 h-3.5 text-white/50 shrink-0" />
                <div>
                  <div className="text-[10px] font-bold text-white">Browser notifications</div>
                  <div className="text-[9px] text-white/35">Price, large-move and catalyst notifications while open</div>
                </div>
              </div>
              <button type="button" onClick={() => void toggleBrowserNotifications()} className={'shrink-0 rounded border px-2.5 py-1.5 text-[9px] font-bold uppercase ' + (config.browserNotifications ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/5 text-white/50')}>
                {config.browserNotifications ? 'On' : 'Off'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/15 p-3">
              <div className="flex items-center gap-2 min-w-0">
                <MessageCircle className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                <div>
                  <div className="text-[10px] font-bold text-white">Telegram</div>
                  <div className="text-[9px] text-white/35">{telegramConfigured === true ? 'Server bot configured' : telegramConfigured === false ? 'Server bot not configured' : 'Checking server configuration…'}</div>
                </div>
              </div>
              <span className={'shrink-0 rounded border px-2.5 py-1.5 text-[9px] font-bold uppercase ' + (telegramConfigured === true ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/5 text-white/40')}>
                {telegramConfigured === true ? 'Ready' : 'Not ready'}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={toggleTelegram} disabled={telegramConfigured !== true} className={'rounded-lg border px-3 py-2 text-[10px] font-bold transition disabled:opacity-40 ' + (telegramEnabled ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/5 text-white/60 hover:text-white')}>
                {telegramEnabled ? 'Disable Telegram here' : 'Enable Telegram here'}
              </button>
              <button type="button" onClick={() => void testTelegram()} disabled={!telegramEnabled || telegramConfigured !== true || telegramTesting} className="rounded-lg border border-cyan-300/15 bg-cyan-300/5 px-3 py-2 text-[10px] font-bold text-cyan-200 disabled:opacity-40">
                {telegramTesting ? 'Sending…' : 'Send test'}
              </button>
            </div>
            {telegramMessage && <p className="text-[9px] text-white/45 leading-relaxed">{telegramMessage}</p>}
          </div>

          <div className="border-t border-white/5 pt-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold text-white">Large-move alerts</span>
              <button type="button" onClick={() => persist({ ...config, largeMoveEnabled: !config.largeMoveEnabled })} className={'rounded border px-2.5 py-1 text-[9px] font-bold uppercase ' + (config.largeMoveEnabled ? 'border-amber-400/20 bg-amber-400/10 text-amber-300' : 'border-white/10 bg-white/5 text-white/40')}>{config.largeMoveEnabled ? 'On' : 'Off'}</button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span className="text-[9px] text-white/40">Alert when a watched stock moves at least</span>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  aria-label="Large move alert percentage"
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={config.largeMovePct}
                  onChange={e => {
                    const value = Number(e.target.value);
                    if (Number.isFinite(value) && value > 0) persist({ ...config, largeMovePct: Math.min(100, value) });
                  }}
                  className="w-16 rounded border border-white/10 bg-black/20 px-2 py-1.5 text-right text-[10px] text-white"
                />
                <span className="text-[9px] text-white/30">%</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold text-white">Catalyst alerts</span>
              <button type="button" onClick={() => persist({ ...config, catalystAlerts: !config.catalystAlerts })} className={'rounded border px-2.5 py-1 text-[9px] font-bold uppercase ' + (config.catalystAlerts ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/5 text-white/40')}>{config.catalystAlerts ? 'On' : 'Off'}</button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[.02] p-4 md:p-5" aria-labelledby="digest-settings-heading">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-cyan-300" aria-hidden="true" />
          <h2 id="digest-settings-heading" className="text-sm font-black text-white">Server delivery</h2>
        </div>
        <p className="text-[10px] text-white/40 mt-1 leading-relaxed">
          Daily portfolio digests, scheduled earnings checks and server Smart Alerts use Vercel-side secrets. Keep tokens and webhook credentials out of browser storage.
        </p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
          {[
            ['Telegram', telegramConfigured === true ? 'Configured' : 'Needs setup'],
            ['Email', 'Vercel environment setting'],
            ['Webhook', 'Vercel environment setting'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/10 bg-black/15 p-3">
              <div className="text-[10px] font-bold text-white">{label}</div>
              <div className="text-[9px] text-white/35 mt-1">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[.02] p-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold text-white">Reset local preferences</div>
          <div className="text-[9px] text-white/35 mt-1">Resets dashboard favorites, market-data key, notification toggles and alert thresholds. Your saved portfolio is not changed.</div>
        </div>
        <button type="button" onClick={resetPreferences} className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-rose-400/15 bg-rose-400/5 px-3 py-2 text-[10px] font-bold text-rose-200 hover:bg-rose-400/10 transition">
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      </section>
    </div>
  );
}
