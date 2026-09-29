import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Menu, X, TrendingUp, Grid, FileText, Calendar, ShieldAlert, BadgePercent, Settings as SettingsIcon, Bot
} from 'lucide-react';
import { AppConfig, loadConfig, saveConfig, formatPrice, formatPct, fetchLiveQuote } from './utils';
import { STOCK_METADATA } from './data';
import { PORTFOLIO_POSITIONS } from './utils/portfolioPositions';
import { STOCK_UNIVERSE_SYMBOLS } from './utils/stockUniverse';
import { evaluateFeedAlerts, evaluateQuoteAlerts, notifyBrowser } from './utils/alertEngine';

// Component Views
import Overview from './components/Overview';
import ContractsLedger from './components/ContractsLedger';
import ProgressTracker from './components/ProgressTracker';
import CongressTrades from './components/CongressTrades';
import MacroPolitics from './components/MacroPolitics';
import BuySellWatchlist from './components/BuySellWatchlist';
import PortfolioIntelligence from './components/PortfolioIntelligence';
import Settings from './components/Settings';
import AutonomousResearch from './components/AutonomousResearch';

type StressSnapshot = {
  score: number;
  label: string;
  breadth: number | null;
  avgMove: number | null;
  macroLoad: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function calculatePortfolioStress(
  prices: Record<string, { price: number; changePct: number }>,
  macroRisks: any[] = [],
): StressSnapshot {
  const portfolioSymbols = PORTFOLIO_POSITIONS.map(position => position.symbol);
  const moves = portfolioSymbols
    .map(symbol => prices[symbol]?.changePct)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  const breadth = moves.length
    ? moves.filter(value => value >= 0).length / moves.length
    : null;
  const avgMove = moves.length
    ? moves.reduce((sum, value) => sum + value, 0) / moves.length
    : null;

  // Transparent 0-100 model: 40 pts breadth stress, 30 pts move stress,
  // and 30 pts live macro-risk load. Higher = more observed stress.
  const breadthStress = breadth == null ? 0 : (1 - breadth) * 40;
  const moveStress = avgMove == null ? 0 : clamp((-avgMove / 5) * 30, 0, 30);
  const high = macroRisks.filter(risk => String(risk?.impactRating).toLowerCase() === 'high').length;
  const medium = macroRisks.filter(risk => String(risk?.impactRating).toLowerCase() === 'medium').length;
  const macroLoad = clamp(high * 12 + medium * 6, 0, 30);
  const score = Math.round(clamp(breadthStress + moveStress + macroLoad, 0, 100));

  const label = score >= 70 ? 'Elevated' : score >= 45 ? 'Watch' : 'Contained';
  return { score, label, breadth, avgMove, macroLoad };
}

export default function App() {
  const [activeView, setActiveView] = useState<string>('tracker'); // Default to Progress Tracker as requested
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [tickerPrices, setTickerPrices] = useState<Record<string, { price: number; changePct: number }>>({});
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Live Synthesis Data States
  const [liveData, setLiveData] = useState<{
    stockPrices?: Record<string, { price: number; changePct: number }>;
    contracts?: any[];
    congressTrades?: any[];
    news?: any[];
    macroRisks?: any[];
    politicalSignals?: any[];
    marketSentiment?: string;
    build?: { commit?: string | null; environment?: string };
    timestamp?: number;
  } | null>(null);
  const [isLiveLoading, setIsLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const watchlistSymbols = Object.keys(STOCK_METADATA);

  // Alert engine: keep price thresholds and large-move alerts active across the dashboard.
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    let initialized = false;

    const checkAlerts = async () => {
      const symbols = [...new Set([
        ...config.watchlist,
        ...config.alerts.map(alert => alert.symbol),
        ...STOCK_UNIVERSE_SYMBOLS
      ])];

      const quotes: Record<string, { price: number; changePct: number }> = {};
      for (const symbol of symbols) {
        try {
          const quote = await fetchLiveQuote(symbol, config.finnhubKey || '');
          if (Number.isFinite(quote.price) && Number.isFinite(quote.changePct)) {
            quotes[symbol] = { price: quote.price, changePct: quote.changePct };
          }
        } catch {
          // A single quote failure should not stop alert evaluation for other symbols.
        }
      }

      if (cancelled) return;

      const events = evaluateQuoteAlerts(config, quotes, !initialized);
      initialized = true;

      if (config.browserNotifications) {
        events.forEach(notifyBrowser);
      }
    };

    checkAlerts();
    const interval = setInterval(checkAlerts, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [config]);

  useEffect(() => {
    if (activeView !== 'portfolio') return;
    let cancelled = false;
    async function updateWatchlistQuotes() {
      const updated: Record<string, { price: number; changePct: number }> = {};
      for (const s of watchlistSymbols) {
        try {
          const res = await fetchLiveQuote(s, config?.finnhubKey || '');
          if (!cancelled && Number.isFinite(res.price) && Number.isFinite(res.changePct)) {
            updated[s] = { price: res.price, changePct: res.changePct };
          }
        } catch (e) {
          // ignore individual quote failures
        }
      }
      if (!cancelled) {
        setTickerPrices(prev => ({ ...prev, ...updated }));
        setLiveData(prev => ({ ...(prev || {}), stockPrices: { ...((prev && prev.stockPrices) || {}), ...updated } }));
      }
    }
    updateWatchlistQuotes();
    const interval = setInterval(updateWatchlistQuotes, 90000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeView, config]);

  const handleFetchLiveData = async (forceRefresh = false) => {
    setIsLiveLoading(true);
    setLiveError(null);
    try {
      const res = await fetch(`/api/live-data${forceRefresh ? '?refresh=true' : ''}`);
      if (!res.ok) throw new Error('Failed to fetch live data from server');
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setLiveData({
        ...data,
        timestamp: data.timestamp || Date.now()
      });

      const activeConfig = config || loadConfig();
      if (activeConfig) {
        const catalystEvents = evaluateFeedAlerts(activeConfig, {
          contracts: data.contracts,
          congressTrades: data.congressTrades
        });
        if (activeConfig.browserNotifications) {
          catalystEvents.forEach(notifyBrowser);
        }
      }
      // Sync stockPrices to tickerPrices
      if (data.stockPrices) {
        setTickerPrices((prev) => ({
          ...prev,
          ...data.stockPrices
        }));
      }
    } catch (err: any) {
      console.error('Error loading live data:', err);
      setLiveError(err.message || 'Error fetching live data');
    } finally {
      setIsLiveLoading(false);
    }
  };

  // Load configuration, bootstrap initial prices, and trigger live data load
  useEffect(() => {
    const loaded = loadConfig();
    setConfig(loaded);

    async function updateTicker() {
      const updated: Record<string, { price: number; changePct: number }> = {};
      const allSymbols = STOCK_UNIVERSE_SYMBOLS;
      for (const s of allSymbols) {
        try {
          const res = await fetchLiveQuote(s, loaded.finnhubKey);
          updated[s] = { price: res.price, changePct: res.changePct };
        } catch (e) {
          // ignore
        }
      }
      setTickerPrices((prev) => ({
        ...prev,
        ...updated
      }));
    }

    updateTicker();
    handleFetchLiveData(false);

    const interval = setInterval(updateTicker, 45000);
    return () => clearInterval(interval);
  }, []);

  const handleNavigate = (view: string) => {
    setActiveView(view);
    setIsMobileMenuOpen(false);
  };

  const reloadSettings = () => {
    setConfig(loadConfig());
  };

  if (!config) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-xs font-mono text-slate-500">
        Loading system configuration…
      </div>
    );
  }

  // Sidebar link details
  const navigationItems = [
    { id: 'overview', label: 'Overview', index: '01', icon: Grid },
    { id: 'contracts', label: 'Contracts', index: '02', icon: FileText },
    { id: 'tracker', label: 'Progress Tracker', index: '03', icon: Calendar },
    { id: 'congress', label: 'Congress Trades', index: '04', icon: BadgePercent },
    { id: 'macro', label: 'Macro & Politics', index: '05', icon: ShieldAlert },
    { id: 'portfolio', label: 'Portfolio Intelligence', index: '06', icon: TrendingUp },
    { id: 'watchlist', label: 'Watchlist', index: '07', icon: TrendingUp },
    { id: 'research', label: 'AI Research', index: '08', icon: Bot },
    { id: 'settings', label: 'Settings', index: '⚙', icon: SettingsIcon }
  ];

  return (
    <div className="min-h-screen bg-[#0F1115] text-[#F3F4F6] flex flex-col font-sans selection:bg-emerald-500/35 selection:text-white">
      {/* 1. TOP LIVE FINANCIAL TICKER MARQUEE */}
      <div className="bg-[#0F1115] border-b border-white/10 h-8 flex items-center overflow-hidden relative z-50">
        <div className="flex whitespace-nowrap animate-[marquee_50s_linear_infinite] hover:[animation-play-state:paused] cursor-pointer">
          {Object.keys(STOCK_METADATA).map((sym) => {
            const p = tickerPrices[sym];
            const isUp = p ? p.changePct >= 0 : true;
            return (
              <span key={sym} className="mx-6 text-[10px] font-mono inline-flex items-center space-x-1.5 select-none">
                <span className="text-white/40 font-bold uppercase tracking-wider">{sym}</span>
                <span className="text-[#F3F4F6] font-bold">
                  {p ? `$${formatPrice(p.price)}` : '—'}
                </span>
                <span className={isUp ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                  {p ? `${isUp ? '▲' : '▼'} ${formatPct(p.changePct)}` : '—'}
                </span>
              </span>
            );
          })}
          {/* Repeat for seamless loop */}
          {Object.keys(STOCK_METADATA).map((sym) => {
            const p = tickerPrices[sym];
            const isUp = p ? p.changePct >= 0 : true;
            return (
              <span key={`dup-${sym}`} className="mx-6 text-[10px] font-mono inline-flex items-center space-x-1.5 select-none">
                <span className="text-white/40 font-bold uppercase tracking-wider">{sym}</span>
                <span className="text-[#F3F4F6] font-bold">
                  {p ? `$${formatPrice(p.price)}` : '—'}
                </span>
                <span className={isUp ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                  {p ? `${isUp ? '▲' : '▼'} ${formatPct(p.changePct)}` : '—'}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* 2. BODY LAYOUT */}
      <div className="flex flex-1 relative">
        {/* DESKTOP SIDEBAR */}
        <aside className="hidden lg:flex fixed top-8 bottom-0 left-0 z-40 flex-col w-64 bg-[#0F1115] border-r border-white/10 p-6 space-y-8 overflow-y-auto">
          {/* Brand header */}
          <div className="space-y-1 border-b border-white/10 pb-4">
            <div className="flex items-center space-x-2 text-white">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
              <span className="font-black tracking-tighter text-lg uppercase italic">AI INFRA WATCH</span>
            </div>
            <p className="text-[10px] text-white/40 font-mono tracking-widest uppercase">Self-hosted monitor</p>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 flex flex-col space-y-1.5">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 mb-2">Dashboard Hub</span>
            {navigationItems.map((item) => {
              const IconComp = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-bold tracking-tight transition cursor-pointer ${
                    isActive
                      ? 'bg-white/10 text-emerald-400 border border-white/15'
                      : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <IconComp className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-white/40'}`} />
                    <span>{item.label}</span>
                  </div>
                  <span className="text-[9px] font-mono opacity-50">{item.index}</span>
                </button>
              );
            })}

            <div className="pt-4 mt-4 border-t border-white/10">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 mb-2 block">Independent Pages</span>
              <a
                href="/pages/tracker.html"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-bold tracking-tight text-white/80 hover:text-white hover:bg-white/5 border border-dashed border-white/10 hover:border-white/30 transition"
              >
                <div className="flex items-center space-x-2.5">
                  <TrendingUp className="w-4 h-4 text-[#10B981]" />
                  <span>Interactive HTML Tracker</span>
                </div>
                <span className="text-[9px] font-mono opacity-50">&nearr;</span>
              </a>
            </div>
          </nav>

          {/* Sidebar Footer */}
          <div className="border-t border-white/10 pt-4 text-[10px] font-mono text-white/40 space-y-1">
            <p>System Ver: 1.2.4</p>
            <p className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              <span>Core Online</span>
            </p>
          </div>
        </aside>

        {/* MOBILE TOP NAV HEADER */}
        <div className="lg:hidden w-full bg-[#0F1115] border-b border-white/10 px-4 py-3 flex items-center justify-between sticky top-8 z-40">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
            <span className="font-black text-sm tracking-tight text-white uppercase italic">AI INFRA WATCH</span>
          </div>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-1.5 bg-white/5 border border-white/10 text-white rounded-lg cursor-pointer"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* MOBILE SIDEBAR DRAWERS */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="lg:hidden fixed inset-y-16 left-0 w-72 bg-[#0F1115] border-r border-white/10 p-6 z-40 flex flex-col space-y-8"
            >
              <nav className="flex-1 flex flex-col space-y-1.5 pt-4">
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 mb-2">Dashboard Hub</span>
                {navigationItems.map((item) => {
                  const IconComp = item.icon;
                  const isActive = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavigate(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold tracking-tight transition cursor-pointer ${
                        isActive
                          ? 'bg-white/10 text-emerald-400 border border-white/15'
                          : 'text-[#F3F4F6]/60 hover:text-white hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <IconComp className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-white/40'}`} />
                        <span>{item.label}</span>
                      </div>
                      <span className="text-[10px] font-mono opacity-50">{item.index}</span>
                    </button>
                  );
                })}

                <div className="pt-4 mt-4 border-t border-white/10">
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 mb-2 block">Independent Pages</span>
                  <a
                    href="/pages/tracker.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold tracking-tight text-white/80 hover:text-white hover:bg-white/5 border border-dashed border-white/10 hover:border-white/30 transition"
                  >
                    <div className="flex items-center space-x-2.5">
                      <TrendingUp className="w-4 h-4 text-[#10B981]" />
                      <span>Interactive HTML Tracker</span>
                    </div>
                    <span className="text-[10px] font-mono opacity-50">&nearr;</span>
                  </a>
                </div>
              </nav>

              <div className="border-t border-white/10 pt-4 text-[10px] font-mono text-white/40 space-y-1">
                <p>System Ver: 1.2.4</p>
                <p>Network status: Online</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3. MAIN DASHBOARD MAINSPACE CONTAINER */}
        <main className="flex-1 bg-[#0F1115] p-4 md:p-6 lg:p-8 overflow-x-hidden min-h-[calc(100vh-2rem)] lg:ml-64">
          {/* Universal Live AI Sync Controller Panel */}
          <div className="max-w-7xl mx-auto mb-6 flex flex-col md:flex-row items-start md:items-center justify-between bg-[#15181E]/40 border border-white/10 rounded-2xl p-4 gap-4">
            <div className="flex items-center space-x-3">
              <div className="relative flex-shrink-0">
                <span className={`w-2.5 h-2.5 rounded-full block ${isLiveLoading ? 'bg-yellow-400 animate-pulse' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'}`} />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-mono font-bold tracking-widest text-white uppercase">Live Market Intelligence</span>
                  <span className="text-[8px] font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                    {isLiveLoading ? 'SYNCHRONIZING' : 'ACTIVE FEED'}
                  </span>
                </div>
                <p className="text-[11px] text-white/60 leading-normal mt-0.5">
                  {isLiveLoading 
                    ? "Compiling live market quotes from Yahoo Finance and AI-infrastructure headlines from GDELT..." 
                    : liveData?.marketSentiment 
                      ? `Global AI Market: "${liveData.marketSentiment}"`
                      : "Live market quotes and AI-infrastructure news from the configured public data feeds."}
                </p>
                <div className="mt-1 text-[9px] font-mono text-white/25 uppercase tracking-wider">
                  BUILD {liveData?.build?.commit ? liveData.build.commit.slice(0, 7) : 'LOCAL'} · {liveData?.build?.environment || 'unknown'}
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3 w-full md:w-auto justify-between md:justify-end border-t border-white/5 pt-3 md:pt-0 md:border-0">
              {liveData && liveData.timestamp && (
                <span className="text-[9px] font-mono text-white/40 uppercase tracking-wider">
                  SYNCED: {new Date(liveData.timestamp).toLocaleTimeString()}
                </span>
              )}
              <button
                onClick={() => handleFetchLiveData(true)}
                disabled={isLiveLoading}
                className="bg-emerald-500 hover:bg-emerald-600 text-black px-4 py-2 rounded-lg text-xs font-mono font-black uppercase tracking-wider flex items-center space-x-2 transition disabled:opacity-50 cursor-pointer shadow-[0_4px_12px_rgba(16,185,129,0.15)]"
              >
                <span className={isLiveLoading ? "animate-spin" : ""}>🔄</span>
                <span>{isLiveLoading ? "SYNCHRONIZING..." : "REFRESH FEED"}</span>
              </button>
            </div>
          </div>

          {(() => {
            // Browser-side ticker quotes refresh more frequently than the server feed.
            // Prefer the freshest ticker value, with liveData as a fallback for symbols the
            // browser quote provider could not refresh.
            const prices = { ...(liveData?.stockPrices || {}), ...tickerPrices };
            const stress = calculatePortfolioStress(
              prices,
              liveData?.macroRisks || []
            );
            const coverage = PORTFOLIO_POSITIONS.filter(position => prices[position.symbol]?.price != null).length;
            return (
              <div className="max-w-7xl mx-auto mb-6 rounded-2xl border border-white/10 bg-[#15181E]/50 px-4 py-3">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl border border-amber-400/15 bg-amber-400/5 p-2">
                      <ShieldAlert className="w-4 h-4 text-amber-300" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-mono font-black uppercase tracking-[0.2em] text-white/65">Portfolio Stress Score</span>
                        <span className="text-[9px] font-mono uppercase text-white/25">Higher = more observed stress</span>
                      </div>
                      <div className="text-[10px] text-white/35 mt-0.5">
                        Breadth + average daily move + macro risk load · {coverage}/{PORTFOLIO_POSITIONS.length} holdings with live quotes
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-28 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full bg-amber-300/80 transition-all" style={{ width: stress.score + '%' }} />
                    </div>
                    <div className="text-right min-w-24">
                      <div className="text-xl font-black font-mono text-white">{stress.score}/100</div>
                      <div className="text-[9px] font-mono uppercase tracking-widest text-amber-300">{stress.label}</div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                  <div className="rounded-lg border border-white/5 bg-black/10 px-3 py-2">
                    <div className="text-[8px] font-mono uppercase tracking-widest text-white/25">Breadth</div>
                    <div className="text-[10px] font-mono font-bold text-white/70 mt-1">{stress.breadth == null ? '—' : Math.round(stress.breadth * 100) + '% positive'}</div>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-black/10 px-3 py-2">
                    <div className="text-[8px] font-mono uppercase tracking-widest text-white/25">Avg daily move</div>
                    <div className="text-[10px] font-mono font-bold text-white/70 mt-1">{stress.avgMove == null ? '—' : (stress.avgMove >= 0 ? '+' : '') + stress.avgMove.toFixed(2) + '%'}</div>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-black/10 px-3 py-2">
                    <div className="text-[8px] font-mono uppercase tracking-widest text-white/25">Macro load</div>
                    <div className="text-[10px] font-mono font-bold text-white/70 mt-1">{stress.macroLoad}/30</div>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-black/10 px-3 py-2">
                    <div className="text-[8px] font-mono uppercase tracking-widest text-white/25">Data coverage</div>
                    <div className="text-[10px] font-mono font-bold text-white/70 mt-1">{coverage}/{PORTFOLIO_POSITIONS.length} live</div>
                  </div>
                </div>
              </div>
            );
          })()}

          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              onAnimationComplete={reloadSettings}
              className="max-w-7xl mx-auto"
            >
              {activeView === 'overview' && <Overview config={config} onNavigate={handleNavigate} />}
              {activeView === 'contracts' && <ContractsLedger liveContracts={liveData?.contracts} />}
              {activeView === 'tracker' && <ProgressTracker livePrices={liveData?.stockPrices} />}
              {activeView === 'congress' && <CongressTrades liveTrades={liveData?.congressTrades} />}
              {activeView === 'macro' && <MacroPolitics liveRisks={liveData?.macroRisks} livePrices={liveData?.stockPrices || tickerPrices} contracts={liveData?.contracts} news={liveData?.news} politicalSignals={liveData?.politicalSignals} />}
              {activeView === 'watchlist' && <BuySellWatchlist />}
              {activeView === 'portfolio' && <PortfolioIntelligence livePrices={{ ...(liveData?.stockPrices || {}), ...tickerPrices }} contracts={liveData?.contracts} congressTrades={liveData?.congressTrades} macroRisks={liveData?.macroRisks} news={liveData?.news} />}
              {activeView === 'research' && <AutonomousResearch />}
              {activeView === 'settings' && <Settings />}
            </motion.div>
          </AnimatePresence>

          {/* App Footer */}
          <footer className="max-w-7xl mx-auto border-t border-white/10 mt-12 pt-6 pb-4 text-[10px] font-mono text-white/40 leading-normal space-y-1">
            <p>
              Browser-side quote customization uses locally stored Finnhub authorization tokens. Server-side earnings alerts use Vercel environment credentials when configured; no customer details are transferred.
            </p>
            <p>
              This app tracks execution and deployment targets; it does not provide active capital strategy advice.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
