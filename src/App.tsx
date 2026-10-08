import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Menu, X, TrendingUp, Grid, FileText, Calendar, ShieldAlert, BadgePercent, Settings as SettingsIcon, Bot, BookOpen
} from 'lucide-react';
import { AppConfig, loadConfig, saveConfig, formatPrice, formatPct, fetchLiveQuote } from './utils';
import { STOCK_METADATA } from './data';
import { STOCK_UNIVERSE_SYMBOLS } from './utils/stockUniverse';
import { PORTFOLIO_POSITIONS } from './utils/portfolioPositions';
import { evaluateFeedAlerts, evaluateQuoteAlerts, notifyBrowser, notifyTelegram } from './utils/alertEngine';
import { fetchPortfolioHoldings } from './utils/portfolioApi';
import { authFetch, getAccessToken } from './utils/apiAuth';
import FreshnessBadge from './components/FreshnessBadge';

const VIEW_IDS = new Set(['overview','contracts','tracker','congress','macro','portfolio','watchlist','research','quality','outlook','health','guide','settings']);
const VIEW_PATHS: Record<string, string> = {
  overview: '/overview', contracts: '/contracts', tracker: '/tracker', congress: '/congress', macro: '/macro',
  portfolio: '/portfolio', watchlist: '/watchlist', research: '/research', quality: '/quality', outlook: '/outlook',
  health: '/health', guide: '/guide', settings: '/settings'
};
function viewFromPath(pathname: string) {
  const view = pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || 'overview';
  return VIEW_IDS.has(view) ? view : 'overview';
}

// Component Views
import Overview from './components/Overview';
import ContractsLedger from './components/ContractsLedger';
import ProgressTracker from './components/ProgressTracker';
import CongressTrades from './components/CongressTrades';
import MacroPolitics from './components/MacroPolitics';
import BuySellWatchlist from './components/BuySellWatchlist';
import PortfolioIntelligence from './components/PortfolioIntelligence';
import Settings from './components/Settings';
import HelpGuide from './components/HelpGuide';
import ForwardOutlook from './components/ForwardOutlook';
import AutonomousResearch from './components/AutonomousResearch';
import DataHealth from './components/DataHealth';
import AIQualityLab from './components/AIQualityLab';

type LivePrice = {
  price: number;
  changePct: number;
  provider?: string;
  retrievedAt?: string;
  marketTime?: string | null;
  asOf?: string | null;
  stale?: boolean;
  cached?: boolean;
};

export default function App() {
  const [activeView, setActiveView] = useState<string>(() => viewFromPath(window.location.pathname));
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [tickerPrices, setTickerPrices] = useState<Record<string, LivePrice>>({});
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [lastQuoteRefresh, setLastQuoteRefresh] = useState<number | null>(null);
  const [portfolioSymbols, setPortfolioSymbols] = useState<string[]>([]);

  // Live Synthesis Data States
  const [liveData, setLiveData] = useState<{
    stockPrices?: Record<string, LivePrice>;
    contracts?: any[];
    congressTrades?: any[];
    news?: any[];
    macroRisks?: any[];
    politicalSignals?: any[];
    marketSentiment?: string;
    build?: { commit?: string | null; environment?: string };
    timestamp?: number;
    evidenceAvailability?: Record<string, any>;
  } | null>(null);
  const [isLiveLoading, setIsLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const watchlistSymbols = [...new Set([
    ...STOCK_UNIVERSE_SYMBOLS,
    ...portfolioSymbols,
  ])];

  useEffect(() => {
    const syncServerAlertConfig = async (cfg: AppConfig) => {
      if (!getAccessToken()) return;
      try {
        await authFetch('/api/alert-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cfg),
          cache: 'no-store',
        });
      } catch {
        // Server-side smart monitoring retries on the next config change or app load.
      }
    };

    void syncServerAlertConfig(loadConfig());
    const onConfigChanged = (event: Event) => {
      const detail = (event as CustomEvent<AppConfig>).detail;
      if (detail) void syncServerAlertConfig(detail);
    };
    window.addEventListener('aiw-config-changed', onConfigChanged);
    return () => window.removeEventListener('aiw-config-changed', onConfigChanged);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadPortfolioSymbols = async () => {
      try {
        const rows = await fetchPortfolioHoldings();
        if (!cancelled) setPortfolioSymbols(rows.map(row => row.symbol));
      } catch {
        if (!cancelled) setPortfolioSymbols(PORTFOLIO_POSITIONS.map(position => position.symbol));
      }
    };
    void loadPortfolioSymbols();
    const refresh = () => void loadPortfolioSymbols();
    window.addEventListener('portfolio-holdings-changed', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('portfolio-holdings-changed', refresh);
    };
  }, []);

  // Alert engine: keep price thresholds and large-move alerts active across the dashboard.
  const quoteAlertsInitialized = useRef(false);

  useEffect(() => {
    if (!config || Object.keys(tickerPrices).length === 0) return;

    const symbols = [...new Set([
      ...config.watchlist,
      ...config.alerts.map(alert => alert.symbol),
      ...STOCK_UNIVERSE_SYMBOLS
    ])];

    const quotes: Record<string, LivePrice> = {};
    for (const symbol of symbols) {
      const quote = tickerPrices[symbol];
      if (quote && Number.isFinite(quote.price) && Number.isFinite(quote.changePct)) {
        quotes[symbol] = quote;
      }
    }

    const events = evaluateQuoteAlerts(
      config,
      quotes,
      !quoteAlertsInitialized.current
    );
    quoteAlertsInitialized.current = true;

    if (config.browserNotifications) {
      events.forEach(notifyBrowser);
    }
    void notifyTelegram(events);
  }, [config, tickerPrices]);

  useEffect(() => {
    if (activeView !== 'portfolio') return;
    let cancelled = false;
    let timer: number | undefined;

    async function updateWatchlistQuotes() {
      const updated: Record<string, LivePrice> = {};
      for (const s of watchlistSymbols) {
        try {
          const res = await fetchLiveQuote(s, config?.finnhubKey || '', true);
          if (!cancelled && Number.isFinite(res.price) && Number.isFinite(res.changePct)) {
            updated[s] = {
              price: res.price,
              changePct: res.changePct,
              provider: res.provider,
              retrievedAt: res.retrievedAt,
              marketTime: res.marketTime,
              asOf: res.asOf,
              stale: res.stale,
              cached: res.cached
            };
          }
        } catch {
          // ignore individual quote failures
        }
      }
      if (!cancelled) {
        setTickerPrices(prev => ({ ...prev, ...updated }));
        setLiveData(prev => ({ ...(prev || {}), stockPrices: { ...((prev && prev.stockPrices) || {}), ...updated } }));
        setLastQuoteRefresh(Date.now());
        timer = window.setTimeout(updateWatchlistQuotes, 60000);
      }
    }

    void updateWatchlistQuotes();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [activeView, config, portfolioSymbols]);

  const handleFetchLiveData = async (forceRefresh = false) => {
    setIsLiveLoading(true);
    setLiveError(null);
    try {
      const res = await fetch(
        `/api/live-data?refresh=true`,
        { cache: 'no-store' }
      );
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
        void notifyTelegram(catalystEvents);
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

    let tickerTimer: number | undefined;
    let feedTimer: number | undefined;
    let cancelled = false;

    async function updateTicker() {
      const updated: Record<string, LivePrice> = {};
      for (const s of STOCK_UNIVERSE_SYMBOLS) {
        if (cancelled) return;
        try {
          const res = await fetchLiveQuote(s, loaded.finnhubKey, true);
          if (Number.isFinite(res.price) && Number.isFinite(res.changePct)) {
            updated[s] = {
              price: res.price,
              changePct: res.changePct,
              provider: res.provider,
              retrievedAt: res.retrievedAt,
              marketTime: res.marketTime,
              asOf: res.asOf,
              stale: res.stale,
              cached: res.cached
            };
          }
        } catch {
          // ignore individual quote failures
        }
      }

      if (cancelled) return;
      setTickerPrices(prev => ({ ...prev, ...updated }));
      setLastQuoteRefresh(Date.now());
      tickerTimer = window.setTimeout(updateTicker, 60000);
    }

    void updateTicker();
    void handleFetchLiveData(true);

    const scheduleFeedRefresh = () => {
      if (cancelled) return;
      feedTimer = window.setTimeout(async () => {
        if (cancelled) return;
        await handleFetchLiveData(true);
        scheduleFeedRefresh();
      }, 300000);
    };
    scheduleFeedRefresh();

    return () => {
      cancelled = true;
      if (tickerTimer) window.clearTimeout(tickerTimer);
      if (feedTimer) window.clearTimeout(feedTimer);
    };
  }, []);

  const handleNavigate = (view: string) => {
    const nextView = VIEW_IDS.has(view) ? view : 'overview';
    setActiveView(nextView);
    setIsMobileMenuOpen(false);
    const nextPath = VIEW_PATHS[nextView] || '/overview';
    if (window.location.pathname !== nextPath) window.history.pushState({ view: nextView }, '', nextPath);
  };

  useEffect(() => {
    const onPopState = () => setActiveView(viewFromPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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
  // The summary is the default landing surface: overview is intentionally the first route.
  const navigationItems = [
    { id: 'overview', label: 'Overview', index: '01', icon: Grid },
    { id: 'contracts', label: 'Contracts', index: '02', icon: FileText },
    { id: 'tracker', label: 'Progress Tracker', index: '03', icon: Calendar },
    { id: 'congress', label: 'Congress Trades', index: '04', icon: BadgePercent },
    { id: 'macro', label: 'Macro & Politics', index: '05', icon: ShieldAlert },
    { id: 'portfolio', label: 'Portfolio Intelligence', index: '06', icon: TrendingUp },
    { id: 'watchlist', label: 'Watchlist', index: '07', icon: TrendingUp },
    { id: 'research', label: 'AI Research', index: '08', icon: Bot },
    { id: 'quality', label: 'AI Quality Lab', index: '09', icon: Bot },
    { id: 'outlook', label: 'Forward Outlook', index: '10', icon: TrendingUp },
    { id: 'health', label: 'Data Health', index: '11', icon: ShieldAlert },
    { id: 'guide', label: 'How to Use', index: '?', icon: BookOpen },
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
                {p && <FreshnessBadge marketTime={p.marketTime} retrievedAt={p.retrievedAt} asOf={p.asOf} stale={p.stale} showAge={false} />}
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
                {p && <FreshnessBadge marketTime={p.marketTime} retrievedAt={p.retrievedAt} asOf={p.asOf} stale={p.stale} showAge={false} />}
              </span>
            );
          })}
        </div>
      </div>

      {/* 2. BODY LAYOUT */}
      <div className="flex flex-col xl:flex-row flex-1 relative w-full min-w-0 max-w-full overflow-x-hidden">
        {/* DESKTOP SIDEBAR */}
        <aside className="aiw-desktop-sidebar fixed top-8 bottom-0 left-0 z-40 flex-col w-64 bg-[#0F1115] border-r border-white/10 p-6 space-y-8 overflow-y-auto">
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
                  data-testid={"nav-" + item.id}
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
        <div className="aiw-mobile-header w-full min-w-0 max-w-full shrink-0 bg-[#0F1115] border-b border-white/10 px-4 py-3 flex items-center justify-between sticky top-8 z-40">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
            <span className="font-black text-sm tracking-tight text-white uppercase italic">AI INFRA WATCH</span>
          </div>

          <button
            type="button"
            aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
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
              className="aiw-mobile-drawer fixed inset-y-16 left-0 w-72 bg-[#0F1115] border-r border-white/10 p-6 z-40 flex flex-col space-y-8"
            >
              <nav className="flex-1 flex flex-col space-y-1.5 pt-4">
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 mb-2">Dashboard Hub</span>
                {navigationItems.map((item) => {
                  const IconComp = item.icon;
                  const isActive = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={isActive ? "page" : undefined}
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

                              </nav>

              <div className="border-t border-white/10 pt-4 text-[10px] font-mono text-white/40 space-y-1">
                <p>System Ver: 1.2.4</p>
                <p>Network status: Online</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 3. MAIN DASHBOARD MAINSPACE CONTAINER */}
        <main className="aiw-main flex-1 w-full min-w-0 max-w-full bg-[#0F1115] p-4 md:p-6 lg:p-8 overflow-x-hidden min-h-[calc(100vh-2rem)]">
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
              {(() => {
                const quoteValues = Object.values(tickerPrices) as LivePrice[];
                const fresh = quoteValues.filter(item => !item.stale).length;
                const stale = quoteValues.filter(item => item.stale).length;
                return quoteValues.length ? (
                  <span className="text-[8px] font-mono uppercase tracking-wider text-white/35">
                    QUOTE FRESHNESS · {fresh} current · {stale} last close
                  </span>
                ) : null;
              })()}
              <span className="text-[9px] font-mono text-white/25 uppercase tracking-wider">
                AUTO: FEED 5M · QUOTES 60S{lastQuoteRefresh ? ' · LAST QUOTE ' + new Date(lastQuoteRefresh).toLocaleTimeString() : ''}
              </span>
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
              {activeView === 'contracts' && <ContractsLedger liveContracts={liveData?.contracts} portfolioSymbols={portfolioSymbols} />}
              {activeView === 'tracker' && <ProgressTracker livePrices={liveData?.stockPrices} />}
              {activeView === 'congress' && <CongressTrades liveTrades={liveData?.congressTrades} livePrices={{ ...(liveData?.stockPrices || {}), ...tickerPrices }} />}
              {activeView === 'macro' && <MacroPolitics liveRisks={liveData?.macroRisks} livePrices={liveData?.stockPrices || tickerPrices} contracts={liveData?.contracts} news={liveData?.news} politicalSignals={liveData?.politicalSignals} />}
              {activeView === 'watchlist' && <BuySellWatchlist />}
              {activeView === 'portfolio' && <PortfolioIntelligence livePrices={{ ...(liveData?.stockPrices || {}), ...tickerPrices }} contracts={liveData?.contracts} congressTrades={liveData?.congressTrades} macroRisks={liveData?.macroRisks} news={liveData?.news} politicalSignals={liveData?.politicalSignals} />}
              {activeView === 'research' && <AutonomousResearch />}
              {activeView === 'quality' && <AIQualityLab />}
              {activeView === 'settings' && <Settings />}
              {activeView === 'guide' && <HelpGuide onNavigate={handleNavigate} />}
              {activeView === 'health' && <DataHealth evidenceAvailability={liveData?.evidenceAvailability || {}} timestamp={liveData?.timestamp} isLoading={isLiveLoading} onRefresh={() => handleFetchLiveData(true)} error={liveError} />}
              {activeView === 'outlook' && <ForwardOutlook livePrices={{ ...(liveData?.stockPrices || {}), ...tickerPrices }} macroRisks={liveData?.macroRisks} contracts={liveData?.contracts} news={liveData?.news} politicalSignals={liveData?.politicalSignals} />}
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