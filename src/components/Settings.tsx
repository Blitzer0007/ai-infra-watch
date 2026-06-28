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
      updatedWatchlist.push(symbol);
    }

    const updated = { ...config, watchlist: updatedWatchlist };
    setConfig(updated);
    saveConfig(updated);
  };

  return (
    <div className="space-y-6" id="settings-view">
      {/* Page Header */}
      <div className="flex flex-col space-y-1 md:space-y-2 border-b border-slate-800 pb-4">
        <span className="text-xs font-mono uppercase tracking-widest text-slate-500">System Configuration</span>
        <h1 className="text-2xl md:text-3xl font-sans font-semibold tracking-tight text-white">
          System Settings
        </h1>
        <p className="text-sm text-slate-400 max-w-3xl">
          Adjust pipeline endpoints, register Finnhub authorization credentials, and configure watchlist displays.
        </p>
      </div>

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
            Select symbols to display on the main dashboard overview cards (maximum of 3 active).
          </p>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {Object.keys(STOCK_METADATA).map((sym) => {
              const active = config.watchlist.includes(sym);
              const name = STOCK_METADATA[sym].name;
              return (
                <button
                  key={sym}
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
