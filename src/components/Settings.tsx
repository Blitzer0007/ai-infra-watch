import React, { useState, useEffect } from 'react';
import { AppConfig, loadConfig, saveConfig } from '../utils';
import { STOCK_METADATA } from '../data';
import { Key, Check, Info, Settings2 } from 'lucide-react';

export default function Settings() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Load configuration
  useEffect(() => {
    const cfg = loadConfig();
    setConfig(cfg);
    setApiKeyInput(cfg.finnhubKey);
  }, []);

  if (!config) return null;

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: AppConfig = {
      ...config,
      finnhubKey: apiKeyInput.trim()
    };
    setConfig(updated);
    saveConfig(updated);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleToggleWatchlist = (symbol: string) => {
    let updatedWatchlist = [...config.watchlist];
    if (updatedWatchlist.includes(symbol)) {
      // Don't empty completely
      if (updatedWatchlist.length > 1) {
        updatedWatchlist = updatedWatchlist.filter((s) => s !== symbol);
      }
    } else {
      if (updatedWatchlist.length >= 3) return;
      updatedWatchlist.push(symbol);
    }

    const updated = { ...config, watchlist: updatedWatchlist };
    setConfig(updated);
    saveConfig(updated);
  };

  return (
    <div className="space-y-6" id="settings-view">
      {/* Page Header */}
      <div className="aiw-page-header flex flex-col space-y-1 md:space-y-2 border-b border-slate-800 pb-4">
        <span className="text-xs font-mono uppercase tracking-widest text-slate-500">System Configuration</span>
        <h1 className="text-2xl md:text-3xl font-sans font-semibold tracking-tight text-white">
          System Settings
        </h1>
        <p className="text-sm text-slate-400 max-w-3xl">
          Adjust pipeline endpoints, register Finnhub authorization credentials, and configure watchlist displays.
        </p>
      </div>

      <section className="bg-slate-900/30 border border-cyan-400/15 p-5 rounded-2xl" aria-labelledby="digest-settings-heading">
        <div className="flex items-center space-x-2 border-b border-slate-900 pb-3">
          <Info className="w-5 h-5 text-cyan-300" aria-hidden="true" />
          <h2 id="digest-settings-heading" className="text-sm font-black text-white">Daily portfolio digest</h2>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed mt-3">
          The daily digest is generated server-side from your private portfolio and can deliver through Telegram, email, or a generic webhook.
        </p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] font-mono text-slate-300">
          <div className="rounded-lg border border-white/10 p-3"><strong>Telegram</strong><div className="text-slate-500 mt-1">TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID</div></div>
          <div className="rounded-lg border border-white/10 p-3"><strong>Email</strong><div className="text-slate-500 mt-1">RESEND_API_KEY + PORTFOLIO_DIGEST_EMAIL</div></div>
          <div className="rounded-lg border border-white/10 p-3"><strong>Webhook</strong><div className="text-slate-500 mt-1">PORTFOLIO_DIGEST_WEBHOOK_URL</div></div>
        </div>
        <div className="mt-3 text-[11px] text-slate-500">Configure these as Vercel environment secrets; never put delivery tokens in browser storage or source code.</div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* API Credentials Card */}
        <div className="lg:col-span-2 bg-slate-900/30 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between space-y-6">
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="flex items-center space-x-2 border-b border-slate-900 pb-3">
              <Key className="w-5 h-5 text-emerald-400" />
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-300">Authorization Key</h3>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Register a free Finnhub API Key (up to 60 calls/minute) to query genuine stock quotes and pricing. 
              Leave empty to run realistic simulated trackers. Keys remain client-side only.
            </p>

            <div className="space-y-1.5 font-mono text-xs">
              <label className="text-slate-500 uppercase text-[9px]">Finnhub Token</label>
              <input
                type="password"
                placeholder="Enter Finnhub API token..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-slate-700 placeholder-slate-700 font-mono"
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg text-xs font-medium cursor-pointer transition flex items-center space-x-1.5"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Credentials Saved</span>
                </>
              ) : (
                <span>Save Key Settings</span>
              )}
            </button>
          </form>

          <div className="flex items-start space-x-2.5 bg-slate-950/40 p-4 border border-slate-900 rounded-xl text-xs text-slate-400 leading-normal">
            <Info className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <span>Where to find your key:</span>
              <a href="https://finnhub.io/" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline hover:text-emerald-300 block">
                Get a Free Token on Finnhub.io →
              </a>
            </div>
          </div>
        </div>

        {/* Watchlist Manager Card */}
        <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-900 pb-3">
            <Settings2 className="w-5 h-5 text-amber-500" />
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-300">Watchlist Selector</h3>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Select up to 3 symbols for the main dashboard overview cards ({config.watchlist.length}/3 selected).
          </p>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {Object.keys(STOCK_METADATA).map((sym) => {
              const active = config.watchlist.includes(sym);
              const name = STOCK_METADATA[sym].name;
              return (
                <button
                  type="button"
                  key={sym}
                  aria-pressed={active}
                  aria-label={(active ? "Remove " : "Add ") + sym + " from overview watchlist"}
                  onClick={() => handleToggleWatchlist(sym)}
                  className={`w-full flex items-center justify-between p-2 rounded-lg border text-left transition text-xs font-mono cursor-pointer ${
                    active
                      ? 'bg-slate-800/60 text-white border-slate-700'
                      : 'bg-slate-950/20 text-slate-500 border-slate-900 hover:text-slate-300'
                  }`}
                >
                  <div className="truncate pr-2">
                    <span className="font-bold">{sym}</span>
                    <span className="text-[10px] text-slate-500 block truncate">{name}</span>
                  </div>
                  {active && <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
