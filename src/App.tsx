import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, X } from 'lucide-react';
import { AppConfig, loadConfig, saveConfig, formatPrice, formatPct, fetchLiveQuote } from './utils';
import { STOCK_METADATA } from './data';
import { STOCK_UNIVERSE_SYMBOLS } from './utils/stockUniverse';
import { PORTFOLIO_POSITIONS } from './utils/portfolioPositions';
import { evaluateFeedAlerts, evaluateQuoteAlerts, notifyBrowser, notifyTelegram } from './utils/alertEngine';
import { fetchPortfolioHoldings } from './utils/portfolioApi';
import { authFetch, getAccessToken } from './utils/apiAuth';
import FreshnessBadge from './components/FreshnessBadge';
import WorkspaceNavigation from './components/shell/WorkspaceNavigation';
import WorkspaceHeader from './components/shell/WorkspaceHeader';
import FeedStatusBar from './components/shell/FeedStatusBar';
import UniversalSearch from './components/UniversalSearch';
import OpportunityScanner from './components/opportunities/OpportunityScanner';
import CatalystCalendar from './components/calendar/CatalystCalendar';
import AlertInbox from './components/alerts/AlertInbox';
import {unavailableCatalystSnapshot} from './utils/catalystCalendar';
import {createReviewReadingSession,canonicalReviewHref} from './utils/reviewWorkspaceNavigation';
import type {ReviewRecordContext} from './utils/reviewRecordContext';

const VIEW_IDS = new Set(['overview','opportunities','calendar','alerts','contracts','tracker','congress','macro','portfolio','watchlist','research','jev-lab','quality','outlook','health','guide','settings']);
const VIEW_PATHS: Record<string, string> = {
  overview: '/overview', opportunities: '/opportunities', calendar: '/calendar', alerts: '/alerts', contracts: '/contracts', tracker: '/tracker', congress: '/congress', macro: '/macro',
  portfolio: '/portfolio', watchlist: '/watchlist', research: '/research', 'jev-lab': '/jev-lab', quality: '/quality', outlook: '/outlook',
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
import JevAutonomousPortfolioLab from './components/JevAutonomousPortfolioLab';
import DataHealth from './components/DataHealth';
import AIQualityLab from './components/AIQualityLab';

type LivePrice = {
  returnedSymbol?:string|null;sourceMode?:string;currency?:string|null;adjustedBasis?:string;marketTimePrecision?:string;isMarketSessionOpen?:boolean|null;simulated?:boolean;status?:string;fallbackUsed?:boolean;independentObservations?:unknown;
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
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', onEscape);
    };
  }, [isMobileMenuOpen]);
  const [lastQuoteRefresh, setLastQuoteRefresh] = useState<number | null>(null);
  const [portfolioSymbols, setPortfolioSymbols] = useState<string[]>([]);
  const [portfolioSymbolsKnown,setPortfolioSymbolsKnown]=useState(false);
  const [portfolioQuoteTab,setPortfolioQuoteTab]=useState(()=>new URLSearchParams(window.location.search).get('portfolio_tab')||'overview');
  const [calendarSnapshot,setCalendarSnapshot]=useState(unavailableCatalystSnapshot);
  const [reviewSessions]=useState(()=>({calendar:createReviewReadingSession(),alerts:createReviewReadingSession()}));
  const reviewRecords=useRef(new Map<string,ReviewRecordContext>());
  const [reviewRecordEntry,setReviewRecordEntry]=useState<string|null>(null);
  const reviewRecord=reviewRecordEntry&&window.history.state?.aiwReviewEntry===reviewRecordEntry
    ?reviewRecords.current.get(reviewRecordEntry)??null:null;

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
      if (import.meta.env.DEV || import.meta.env.VITE_QA_MODE === 'true') return;
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
        if (!cancelled) {setPortfolioSymbols(rows.map(row => row.symbol));setPortfolioSymbolsKnown(true);}
      } catch {
        if (!cancelled) {setPortfolioSymbols(PORTFOLIO_POSITIONS.map(position => position.symbol));setPortfolioSymbolsKnown(false);}
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
    if (activeView !== 'portfolio'||portfolioQuoteTab==='research') return;
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
              returnedSymbol:res.returnedSymbol,sourceMode:res.sourceMode,currency:res.currency,adjustedBasis:res.adjustedBasis,
              marketTimePrecision:res.marketTimePrecision,isMarketSessionOpen:res.isMarketSessionOpen,simulated:res.simulated,status:res.status,
              fallbackUsed:res.fallbackUsed,independentObservations:res.independentObservations,
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
  }, [activeView, config, portfolioSymbols, portfolioQuoteTab]);

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
              returnedSymbol:res.returnedSymbol,sourceMode:res.sourceMode,currency:res.currency,adjustedBasis:res.adjustedBasis,
              marketTimePrecision:res.marketTimePrecision,isMarketSessionOpen:res.isMarketSessionOpen,simulated:res.simulated,status:res.status,
              fallbackUsed:res.fallbackUsed,independentObservations:res.independentObservations,
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

  const handleReviewHref=(href:string,record?:ReviewRecordContext)=>{
    const safe=canonicalReviewHref(href);if(!safe)return;
    const nextView=viewFromPath(safe.split('?')[0]);
    let entry:string|null=null;
    if(nextView==='portfolio'&&record){
      const params=new URL(safe,'https://navigation.invalid').searchParams;
      if(record.symbol===params.get('research_symbol')&&record.origin===params.get('research_from')){
        entry=crypto.randomUUID();
        if(reviewRecords.current.size>=100)reviewRecords.current.delete(reviewRecords.current.keys().next().value!);
        reviewRecords.current.set(entry,record);
      }
    }
    setReviewRecordEntry(entry);
    if(nextView==='portfolio')setPortfolioQuoteTab(new URL(safe,'https://navigation.invalid').searchParams.get('portfolio_tab')||'overview');
    window.history.pushState(entry?{view:nextView,aiwReviewEntry:entry}:{view:nextView},'',safe);
    setActiveView(nextView);setIsMobileMenuOpen(false);
  };
  const handleNavigate = (view: string) => {
    const nextView = VIEW_IDS.has(view) ? view : 'overview';
    if(nextView==='portfolio'&&activeView==='portfolio'){setIsMobileMenuOpen(false);return;}
    if(nextView==='portfolio')setPortfolioQuoteTab('overview');
    setReviewRecordEntry(null);
    setActiveView(nextView);
    setIsMobileMenuOpen(false);
    const nextPath=(nextView==='calendar'||nextView==='alerts')&&reviewSessions[nextView].href
      ?reviewSessions[nextView].href:VIEW_PATHS[nextView] || '/overview';
    if (window.location.pathname+window.location.search !== nextPath) window.history.pushState({ view: nextView }, '', nextPath);
  };
  useEffect(() => {
    const onPopState = () => {
      const view=viewFromPath(window.location.pathname);
      if(view==='portfolio')setPortfolioQuoteTab(new URLSearchParams(window.location.search).get('portfolio_tab')||'overview');
      const entry=window.history.state?.aiwReviewEntry;
      setReviewRecordEntry(view==='portfolio'&&typeof entry==='string'&&reviewRecords.current.has(entry)?entry:null);
      setActiveView(view);
    };
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



  return (
    <div className="aiw-application aiw-light-workspace min-h-screen bg-[#0c121a] text-[#F3F4F6] flex flex-col font-sans selection:bg-cyan-300/25 selection:text-white">
      <a href="#main-content" className="aiw-skip-link">Skip to main content</a>
{/* 1. FINITE, ACCESSIBLE MARKET OBSERVATION STRIP */}
      <div role="region" aria-label="Observed market quotes"
        className="aiw-market-strip relative z-50 flex h-8 w-full min-w-0 items-center gap-3 overflow-hidden border-b border-white/10 px-3 sm:px-5">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.13em] text-cyan-200/80">Quotes</span>
        <div tabIndex={0} aria-label="Scroll market quote observations"
          className="aiw-market-strip-scroll flex min-w-0 flex-1 items-center gap-6 overflow-x-auto whitespace-nowrap">
          {Object.keys(STOCK_METADATA).map(sym => {
            const quote = tickerPrices[sym];
            const valid = quote && Number.isFinite(quote.price) && Number.isFinite(quote.changePct);
            const up = valid ? quote.changePct >= 0 : null;
            return <span key={sym} className="inline-flex shrink-0 items-center gap-1.5 text-[11px]">
              <span className="font-semibold tracking-wide text-slate-400">{sym}</span>
              <span className="font-semibold text-white">{valid ? '$' + formatPrice(quote.price) : '—'}</span>
              {valid && <span className={up ? 'font-semibold text-emerald-300' : 'font-semibold text-rose-300'}>
                {formatPct(quote.changePct)}
              </span>}
              {valid && <FreshnessBadge marketTime={quote.marketTime} retrievedAt={quote.retrievedAt}
                asOf={quote.asOf} stale={quote.stale} showAge={false}/>}
            </span>;
          })}
        </div>
      </div>

      {/* 2. BODY LAYOUT */}
      <div className="flex flex-col xl:flex-row flex-1 relative w-full min-w-0 max-w-full overflow-x-hidden">
{/* DESKTOP SIDEBAR: EVERY ROUTE IS PRESENT AND GROUPED BY JOB */}
        <aside className="aiw-desktop-sidebar fixed bottom-0 left-0 top-8 z-40 w-64 flex-col overflow-y-auto border-r border-white/10 p-5">
          <div className="aiw-brand-block mb-5 flex items-center gap-3 rounded-2xl border border-white/10 p-3">
            <span aria-hidden="true" className="aiw-brand-mark flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-black">A</span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold tracking-tight text-white">AI Infra Watch</p>
              <p className="mt-1 text-[11px] text-slate-400">Portfolio research platform</p>
            </div>
          </div>
          <WorkspaceNavigation activeView={activeView} onNavigate={handleNavigate} variant="desktop"/>
          <div className="aiw-sidebar-footer mt-5 border-t border-white/10 px-3 py-4 text-xs leading-relaxed text-slate-400">
            <p>Research for considered decisions</p>
          </div>
        </aside>

{/* MOBILE HEADER */}
        <div className="aiw-mobile-header sticky top-8 z-40 flex w-full max-w-full shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="aiw-brand-mark flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black">A</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold tracking-tight text-white">AI Infra Watch</p>
              <p className="text-[11px] text-slate-400">Research workspaces</p>
            </div>
          </div>
          <button type="button" aria-expanded={isMobileMenuOpen} aria-controls="aiw-mobile-workspace-menu"
            aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="aiw-mobile-menu-button inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-white/15">
            {isMobileMenuOpen ? <X aria-hidden="true" size={21}/> : <Menu aria-hidden="true" size={21}/>}
          </button>
        </div>

{/* MOBILE NAVIGATION DRAWER */}
        <AnimatePresence>
          {isMobileMenuOpen && <>
            <motion.button type="button" aria-label="Close menu overlay"
              initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              transition={{duration:0.15}} onClick={() => setIsMobileMenuOpen(false)}
              className="aiw-mobile-backdrop fixed inset-0 z-30 cursor-default bg-[#050b12]/75"/>
            <motion.div id="aiw-mobile-workspace-menu"
              initial={{x:'-100%'}} animate={{x:0}} exit={{x:'-100%'}}
              transition={{type:'tween',duration:0.2}}
              className="aiw-mobile-drawer fixed bottom-0 left-0 z-40 flex w-[min(21rem,92vw)] flex-col overflow-y-auto border-r border-white/15 p-5"
              aria-label="Mobile application navigation">
              <div className="mb-5 border-b border-white/10 pb-4">
                <p className="text-sm font-bold text-white">Workspaces</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">Select a destination to continue your research.</p>
              </div>
              <WorkspaceNavigation activeView={activeView} onNavigate={handleNavigate} variant="mobile"/>
            </motion.div>
          </>}
        </AnimatePresence>

{/* 3. APPLICATION-WIDE WORKSPACE */}
        <main id="main-content"
          className="aiw-main flex-1 w-full min-w-0 max-w-full overflow-x-hidden px-4 pb-8 pt-5 md:px-6 lg:px-8">
          <div className="aiw-top-actions mx-auto mb-4 flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-400">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-cyan-300"/>
              Evidence before decisions
            </div>
            <UniversalSearch onNavigate={handleNavigate}/>
          </div>
          <div className="mx-auto mb-4 max-w-7xl">
            <WorkspaceHeader view={activeView} onNavigate={handleNavigate}/>
          </div>
          <div className="mx-auto mb-6 max-w-7xl">
            <FeedStatusBar loading={isLiveLoading} error={liveError}
              observedAt={liveData?.timestamp ?? null} buildCommit={liveData?.build?.commit}
              environment={liveData?.build?.environment}
              quoteCount={Object.keys(tickerPrices).length}
              quotesNotFlaggedStale={(Object.values(tickerPrices) as LivePrice[]).filter(quote => !quote.stale).length}
              lastQuoteRefresh={lastQuoteRefresh}
              onRefresh={() => { void handleFetchLiveData(true); }}/>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              onAnimationComplete={reloadSettings}
              className="aiw-view-stage max-w-7xl mx-auto min-w-0" data-testid="application-workspace"
            >
              {activeView === 'overview' && <Overview config={config} onNavigate={handleNavigate} livePrices={{ ...(liveData?.stockPrices || {}), ...tickerPrices }} news={liveData?.news} timestamp={liveData?.timestamp} evidenceAvailability={liveData?.evidenceAvailability} />}
              {activeView === 'contracts' && <ContractsLedger liveContracts={liveData?.contracts} portfolioSymbols={portfolioSymbols} />}
              {activeView === 'tracker' && <ProgressTracker livePrices={liveData?.stockPrices} />}
              {activeView === 'congress' && <CongressTrades liveTrades={liveData?.congressTrades} livePrices={{ ...(liveData?.stockPrices || {}), ...tickerPrices }} />}
              {activeView === 'macro' && <MacroPolitics onNavigate={handleNavigate} liveRisks={liveData?.macroRisks} livePrices={liveData?.stockPrices || tickerPrices} contracts={liveData?.contracts} news={liveData?.news} politicalSignals={liveData?.politicalSignals} evidenceAvailability={liveData?.evidenceAvailability} />}
              {activeView === 'watchlist' && <BuySellWatchlist onEarningsSnapshot={setCalendarSnapshot} />}
              {activeView === 'calendar' && <CatalystCalendar snapshot={calendarSnapshot} onOpenWatchlist={() => handleNavigate('watchlist')} session={reviewSessions.calendar} onOpenResearch={handleReviewHref} />}
              {activeView === 'alerts' && <AlertInbox onOpenHealth={() => handleNavigate('health')} session={reviewSessions.alerts} onOpenResearch={handleReviewHref} />}
              {activeView === 'opportunities' && <OpportunityScanner holdings={portfolioSymbols} watchlist={config.watchlist} quotes={{ ...tickerPrices, ...(liveData?.stockPrices || {}) } as unknown as Record<string,Record<string,unknown>>} loading={isLiveLoading} holdingsAvailable={portfolioSymbolsKnown} />}
              {activeView === 'portfolio' && <PortfolioIntelligence livePrices={{ ...(liveData?.stockPrices || {}), ...tickerPrices }} contracts={liveData?.contracts} congressTrades={liveData?.congressTrades} macroRisks={liveData?.macroRisks} news={liveData?.news} politicalSignals={liveData?.politicalSignals} researchWatchlist={config.watchlist} reviewRecord={reviewRecord} onOpenReviewHref={handleReviewHref} onSectionChange={setPortfolioQuoteTab} />}
              {activeView === 'research' && <AutonomousResearch />}
              {activeView === 'jev-lab' && <JevAutonomousPortfolioLab livePrices={{ ...tickerPrices, ...(liveData?.stockPrices || {}) }} calendarSnapshot={calendarSnapshot} />}
              {activeView === 'quality' && <AIQualityLab />}
              {activeView === 'settings' && <Settings />}
              {activeView === 'guide' && <HelpGuide onNavigate={handleNavigate} />}
              {activeView === 'health' && <DataHealth evidenceAvailability={liveData?.evidenceAvailability || {}} timestamp={liveData?.timestamp} isLoading={isLiveLoading} onRefresh={() => handleFetchLiveData(true)} error={liveError} />}
              {activeView === 'outlook' && <ForwardOutlook livePrices={{ ...(liveData?.stockPrices || {}), ...tickerPrices }} macroRisks={liveData?.macroRisks} contracts={liveData?.contracts} news={liveData?.news} politicalSignals={liveData?.politicalSignals} />}
            </motion.div>
          </AnimatePresence>

          {/* App Footer */}
          <footer className="aiw-app-footer max-w-7xl mx-auto border-t border-white/10 mt-12 pt-6 pb-4 text-xs text-slate-400 leading-relaxed space-y-1">
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