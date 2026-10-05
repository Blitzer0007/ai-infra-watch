import DataTable from './DataTable';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, BarChart3, FileText, Globe2, Network, Search, ShieldAlert, TrendingUp, WalletCards, Zap } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, LineChart, Line, Cell } from 'recharts';
import { buildIntelligence, buildMoneyRotation, type RotationHorizon } from '../utils/intelligence';
import { buildPositionAnalyses, mapStoredPortfolioHoldings, type PositionAnalysis } from '../utils/portfolioPositions';
import { fetchPortfolioHoldings, fetchPortfolioTransactions, type PortfolioTransaction, type StoredPortfolioHolding } from '../utils/portfolioApi';
import PortfolioManager from './PortfolioManager';
import { STOCK_UNIVERSE } from '../utils/stockUniverse';
import EventImpactExplorer from './EventImpactExplorer';
import PortfolioSignalFusion from './PortfolioSignalFusion';
import UnifiedEventTimeline from './UnifiedEventTimeline';
import JevDecisionPanel from './JevDecisionPanel';
import { FilterInput, FilterSelect } from './FilterControls';
import { applyStressHysteresis, buildPortfolioDailySeriesFromTransactions, buildPortfolioPerformanceIndexFromTransactions, calculatePortfolioAttribution, calculatePortfolioConcentration, calculatePortfolioCorrelation, calculatePortfolioStressScore, comparePortfolioToBenchmarks } from '../utils/measurement';
import SignalScorecardPanel from './SignalScorecardPanel';
import PortfolioResearchPanel from './PortfolioResearchPanel';
import { authFetch } from '../utils/apiAuth';
import { calculatePeerCounterfactual, selectMostRelevantPeer, selectDynamicPeers, type PeerCounterfactual } from '../utils/peerIntelligence';
import { analystFreshness, normalizeAnalystConsensus } from '../utils/analystConsensus';
import { calculateExposureWeightedMacroLoad, derivePortfolioExposure } from '../utils/evidenceExposure';
import ForecastValidationPanel from './ForecastValidationPanel';
import FreshnessBadge from './FreshnessBadge';
type Price = {
  price: number;
  changePct: number;
  provider?: string;
  retrievedAt?: string;
  marketTime?: string | null;
  asOf?: string | null;
  stale?: boolean;
  cached?: boolean;
};
type PortfolioTab = 'overview' | 'holdings' | 'performance' | 'evidence' | 'research' | 'watchlist' | 'events' | 'rotation' | 'network';
type PortfolioHistoryPoint = { date: string; price: number };
type PortfolioHistoryState = { loading: boolean; histories: Record<string, PortfolioHistoryPoint[]>; error: string };
type HistoricalPriceState = {
  loading: boolean;
  high52w: number | null;
  high52wDate: string | null;
  historicalHigh: number | null;
  historicalHighDate: string | null;
  error: string;
};
type SelectedChartState = {
  loading: boolean;
  points: PortfolioHistoryPoint[];
  range: '5D' | '1M' | '3M' | '6M' | '1Y' | 'MAX';
  error: string;
  retrievedAt: string | null;
};

type Props = {
  livePrices?: Record<string, Price>;
  contracts?: any[];
  congressTrades?: any[];
  macroRisks?: any[];
  news?: any[];
  politicalSignals?: any[];
};

const WATCHLIST = STOCK_UNIVERSE;

// Batch 36 production deploy marker: validated portfolio UX + VIVO history fixes.
export default function PortfolioIntelligence({ livePrices = {}, contracts = [], congressTrades = [], macroRisks = [], news = [], politicalSignals = [] }: Props) {
  const [tab, setTab] = useState<PortfolioTab>(() => {
    const value = new URLSearchParams(window.location.search).get('portfolio_tab');
    return value === 'holdings' || value === 'performance' || value === 'evidence' || value === 'research' || value === 'watchlist' || value === 'events' || value === 'rotation' || value === 'network' ? value : 'overview';
  });
  const [viewMode, setViewMode] = useState<'simple' | 'detailed'>(() => localStorage.getItem('aiw-portfolio-view-mode') === 'detailed' ? 'detailed' : 'simple');
  const [q, setQ] = useState(() => new URLSearchParams(window.location.search).get('portfolio_q') || '');
  const [group, setGroup] = useState(() => new URLSearchParams(window.location.search).get('portfolio_group') || 'All');
  const [holdingFilter, setHoldingFilter] = useState<'All' | 'Positive Today' | 'Negative Today' | 'Below Cost' | 'Needs Review'>('All');
  const [holdingSort, setHoldingSort] = useState<'Symbol' | 'P&L %' | 'Daily Move' | 'Value'>('Symbol');
  const [selected, setSelected] = useState(() => new URLSearchParams(window.location.search).get('portfolio_symbol') || 'NVDA');
  const [holdings, setHoldings] = useState<StoredPortfolioHolding[]>([]);
  const [portfolioTransactions, setPortfolioTransactions] = useState<PortfolioTransaction[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState('');
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistoryState>({ loading: false, histories: {}, error: '' });
  const [currency, setCurrency] = useState<'USD' | 'INR'>(() => localStorage.getItem('aiw_portfolio_currency') === 'INR' ? 'INR' : 'USD');
  const [usdInr, setUsdInr] = useState<number | null>(null);
  const [historicalPrice, setHistoricalPrice] = useState<HistoricalPriceState>({
    loading: false,
    high52w: null,
    high52wDate: null,
    historicalHigh: null,
    historicalHighDate: null,
    error: '',
  });
  const [chartRange, setChartRange] = useState<SelectedChartState['range']>('1Y');
  const [selectedChart, setSelectedChart] = useState<SelectedChartState>({ loading: false, points: [], range: '1Y', error: '', retrievedAt: null });
  const [peerComparison, setPeerComparison] = useState<PeerCounterfactual | null>(null);
  const [peerPortfolioComparisons, setPeerPortfolioComparisons] = useState<PeerCounterfactual[]>([]);
  const [peerLoading, setPeerLoading] = useState(false);
  const [analystConsensus, setAnalystConsensus] = useState<any>(null);
  const [analystLoading, setAnalystLoading] = useState(false);
  const [analystError, setAnalystError] = useState('');

  useEffect(() => { localStorage.setItem('aiw_portfolio_currency', currency); let cancelled = false; fetch('/api/quote?symbol=INR=X', { cache: 'default' }).then(response => response.json()).then(data => { const rate = Number(data?.price); if (!cancelled && Number.isFinite(rate) && rate > 0) setUsdInr(rate); }).catch(() => {}); return () => { cancelled = true; }; }, [currency]);
  const formatPortfolioMoney = (usd: number | null | undefined) => { if (usd == null || !Number.isFinite(usd)) return '—'; if (currency === 'INR' && usdInr) return '₹' + (usd * usdInr).toLocaleString('en-IN', { maximumFractionDigits: 2 }); return '$' + usd.toLocaleString('en-US', { maximumFractionDigits: 2 }); };

  const changeTab = (nextTab: PortfolioTab) => {
    setTab(nextTab);
  };
  const changeViewMode = (mode: 'simple' | 'detailed') => {
    setViewMode(mode);
    localStorage.setItem('aiw-portfolio-view-mode', mode);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('portfolio_tab', tab);

    if (q.trim()) params.set('portfolio_q', q.trim());
    else params.delete('portfolio_q');

    if (group !== 'All') params.set('portfolio_group', group);
    else params.delete('portfolio_group');

    if (selected) params.set('portfolio_symbol', selected);
    else params.delete('portfolio_symbol');

    const query = params.toString();
    const url = window.location.pathname + (query ? '?' + query : '') + window.location.hash;
    window.history.replaceState(window.history.state, '', url);
  }, [tab, q, group, selected]);

  useEffect(() => {
    let cancelled = false;
    setPortfolioLoading(true);
    Promise.all([
      fetchPortfolioHoldings(),
      fetchPortfolioTransactions().catch(() => []),
    ])
      .then(([rows, transactions]) => {
        if (!cancelled) {
          setHoldings(rows);
          setPortfolioTransactions(transactions);
          setPortfolioError('');
        }
      })
      .catch(error => { if (!cancelled) setPortfolioError(error instanceof Error ? error.message : 'Portfolio service unavailable'); })
      .finally(() => { if (!cancelled) setPortfolioLoading(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (!selected) {
      setHistoricalPrice({ loading: false, high52w: null, high52wDate: null, historicalHigh: null, historicalHighDate: null, error: '' });
      return () => { cancelled = true; };
    }

    setHistoricalPrice({ loading: true, high52w: null, high52wDate: null, historicalHigh: null, historicalHighDate: null, error: '' });
    fetch('/api/company-scale?action=history&symbol=' + encodeURIComponent(selected) + '&range=max', { cache: 'no-store' })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(body?.points)) throw new Error(body?.error || 'Historical price data unavailable');
        return body;
      })
      .then(body => {
        if (cancelled) return;
        const points = body.points
          .filter((point: any) => point && typeof point.date === 'string' && Number.isFinite(Number(point.price)))
          .map((point: any) => ({ date: point.date, price: Number(point.price) }))
          .sort((a: {date:string;price:number}, b: {date:string;price:number}) => a.date.localeCompare(b.date));
        if (!points.length) throw new Error('No historical price points available');
        const cutoff = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
        const recent = points.filter((point: {date:string;price:number}) => point.date >= cutoff);
        const high52 = (recent.length ? recent : points).reduce((best: {date:string;price:number}, point: {date:string;price:number}) => point.price > best.price ? point : best);
        const historicalHigh = points.reduce((best: {date:string;price:number}, point: {date:string;price:number}) => point.price > best.price ? point : best);
        setHistoricalPrice({
          loading: false,
          high52w: high52.price,
          high52wDate: high52.date,
          historicalHigh: historicalHigh.price,
          historicalHighDate: historicalHigh.date,
          error: '',
        });
      })
      .catch(error => {
        if (!cancelled) setHistoricalPrice({ loading: false, high52w: null, high52wDate: null, historicalHigh: null, historicalHighDate: null, error: error instanceof Error ? error.message : 'Historical price data unavailable' });
      });
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    let cancelled = false;
    const symbols = [...new Set([...holdings.map(item => item.symbol), 'SPY', 'QQQ', 'SOXX'])];
    if (!symbols.length) { setPortfolioHistory({ loading: false, histories: {}, error: '' }); return () => { cancelled = true; }; }
    setPortfolioHistory({ loading: true, histories: {}, error: '' });
    Promise.allSettled(symbols.map(async symbol => {
      const response = await fetch('/api/company-scale?action=history&symbol=' + encodeURIComponent(symbol) + '&range=1y', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(body?.points)) throw new Error(symbol + ': historical data unavailable');
      return { symbol, points: body.points.filter((point: any) => point && typeof point.date === 'string' && Number.isFinite(Number(point.price))).map((point: any) => ({ date: point.date, price: Number(point.price) })).sort((a: PortfolioHistoryPoint, b: PortfolioHistoryPoint) => a.date.localeCompare(b.date)) };
    })).then(results => {
      if (cancelled) return;
      const histories: Record<string, PortfolioHistoryPoint[]> = {}; const failures: string[] = [];
      results.forEach(result => { if (result.status === 'fulfilled') histories[result.value.symbol] = result.value.points; else failures.push(String(result.reason?.message || result.reason || 'history unavailable')); });
      setPortfolioHistory({ loading: false, histories, error: failures.length ? failures.slice(0, 3).join(' · ') : '' });
    });
    return () => { cancelled = true; };
  }, [holdings.map(item => item.symbol).join(',')]);
  const positions = useMemo(() => holdings.length ? mapStoredPortfolioHoldings(holdings) : [], [holdings]);
  const intelligence = useMemo(() => buildIntelligence(livePrices), [livePrices]);
  const [rotationHorizon, setRotationHorizon] = useState<RotationHorizon>('20D');
  const [rotationGroup, setRotationGroup] = useState<string>('All');
  const rotation = useMemo(() => buildMoneyRotation(portfolioHistory.histories, livePrices), [portfolioHistory.histories, livePrices]);
  const analyses = useMemo(() => { const base = buildPositionAnalyses(livePrices, intelligence, positions); const totalValue = base.reduce((sum, item) => sum + (item.currentValue ?? item.investedValue), 0); return base.map(item => { const weight = totalValue > 0 ? (item.currentValue ?? item.investedValue) / totalValue : 0; return { ...item, portfolioWeight: weight, minorPosition: weight < 0.02 }; }); }, [livePrices, intelligence, positions]);
  useEffect(() => { if (!analyses.length) return; const today = new Date().toISOString().slice(0, 10); const hash = (value: string) => Array.from(value).reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0).toString(36); void Promise.allSettled(analyses.map(item => authFetch('/api/signal-scorecard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signalKey: hash(['position_state', item.symbol, item.state, today].join('|')), symbol: item.symbol, signalType: 'position_state', signalState: item.state, confidence: item.state === 'INSUFFICIENT DATA' ? 0.25 : 0.60, signalPrice: item.livePrice, observedAt: new Date().toISOString(), evidence: { dailyChangePct: item.dailyChangePct, pnlPct: item.pnlPct, groupScore: item.groupScore, groupBreadth: item.groupBreadth, relativeToUniverse: item.relativeToUniverse, vsPeers: item.vsPeers } }) }))); }, [analyses]);
  const selectedAnalysis = analyses.find(x => x.symbol === selected) ?? analyses[0];
  const selectedPeerSet = useMemo(() => selectedAnalysis ? selectDynamicPeers(STOCK_UNIVERSE.find(item => item.symbol === selectedAnalysis.symbol) ?? selectedAnalysis as any, livePrices) : { primary: null, core: [], extended: [] }, [selectedAnalysis?.symbol, livePrices]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedAnalysis?.symbol) {
      setAnalystConsensus(null);
      return () => { cancelled = true; };
    }
    setAnalystLoading(true);
    setAnalystError('');
    fetch('/api/company-scale?action=analyst&symbol=' + encodeURIComponent(selectedAnalysis.symbol), { cache: 'no-store' })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Analyst consensus unavailable');
        return body;
      })
      .then(body => { if (!cancelled) setAnalystConsensus(body); })
      .catch(error => { if (!cancelled) { setAnalystConsensus(null); setAnalystError(error instanceof Error ? error.message : 'Analyst consensus unavailable'); } })
      .finally(() => { if (!cancelled) setAnalystLoading(false); });
    return () => { cancelled = true; };
  }, [selectedAnalysis?.symbol]);

  useEffect(() => {
    if (!holdings.length) return;
    if (!holdings.some(item => item.symbol === selected)) setSelected(holdings[0].symbol);
  }, [holdings, selected]);

  useEffect(() => {
    let cancelled = false;
    if (!selected) {
      setSelectedChart({ loading: false, points: [], range: chartRange, error: '', retrievedAt: null });
      return () => { cancelled = true; };
    }
    setSelectedChart(prev => ({ ...prev, loading: true, range: chartRange, error: '' }));
    fetch('/api/company-scale?action=history&symbol=' + encodeURIComponent(selected) + '&range=' + (chartRange === 'MAX' ? 'max' : '1y'), { cache: 'no-store' })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(body?.points)) throw new Error(body?.error || 'Live price history unavailable');
        return body;
      })
      .then(body => {
        if (cancelled) return;
        const points = body.points
          .filter((point: any) => point && typeof point.date === 'string' && Number.isFinite(Number(point.price)))
          .map((point: any) => ({ date: point.date, price: Number(point.price) }))
          .sort((a: PortfolioHistoryPoint, b: PortfolioHistoryPoint) => a.date.localeCompare(b.date));
        const days: Record<SelectedChartState['range'], number> = { '5D': 7, '1M': 31, '3M': 93, '6M': 186, '1Y': 366, 'MAX': 10000 };
        const cutoff = Date.now() - days[chartRange] * 86400000;
        const filtered = chartRange === 'MAX' ? points : points.filter(point => new Date(point.date + 'T00:00:00Z').getTime() >= cutoff);
        setSelectedChart({ loading: false, points: filtered, range: chartRange, error: '', retrievedAt: new Date().toISOString() });
      })
      .catch(error => {
        if (!cancelled) setSelectedChart({ loading: false, points: [], range: chartRange, error: error instanceof Error ? error.message : 'Live price history unavailable', retrievedAt: null });
      });
    return () => { cancelled = true; };
  }, [selected, chartRange]);

  useEffect(() => {
    let cancelled = false;
    if (!analyses.length) {
      setPeerPortfolioComparisons([]);
      return () => { cancelled = true; };
    }
    const jobs = analyses.map(async analysis => {
      const meta = STOCK_UNIVERSE.find(item => item.symbol === analysis.symbol);
      if (!meta) return null;
      const peer = selectMostRelevantPeer(meta, livePrices);
      if (!peer) return null;
      try {
        const response = await fetch('/api/company-scale?action=history&symbol=' + encodeURIComponent(peer.symbol) + '&range=max', { cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(body?.points)) throw new Error('history unavailable');
        const history = body.points
          .filter((point: any) => point && typeof point.date === 'string' && Number.isFinite(Number(point.price)))
          .map((point: any) => ({ date: point.date, price: Number(point.price) }));
        return calculatePeerCounterfactual({
          holding: analysis,
          peer,
          peerHistory: history,
          peerCurrentPrice: livePrices[peer.symbol]?.price ?? null,
          actualCurrentPrice: analysis.livePrice,
          transactions: portfolioTransactions,
        });
      } catch {
        return calculatePeerCounterfactual({
          holding: analysis,
          peer,
          peerHistory: [],
          peerCurrentPrice: livePrices[peer.symbol]?.price ?? null,
          actualCurrentPrice: analysis.livePrice,
          transactions: portfolioTransactions,
        });
      }
    });
    Promise.all(jobs).then(results => {
      if (!cancelled) setPeerPortfolioComparisons(results.filter((item): item is PeerCounterfactual => Boolean(item)).map((item, index) => ({ ...item, holdingSymbol: analyses[index]?.symbol || '—' })) as Array<PeerCounterfactual & { holdingSymbol: string }>);
    });
    return () => { cancelled = true; };
  }, [analyses.map(item => item.symbol + ':' + item.purchaseDate + ':' + item.investedValue).join('|'), livePrices, portfolioTransactions.length, portfolioTransactions.map(item => item.sourceRow).join(',')]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedAnalysis) {
      setPeerComparison(null);
      return () => { cancelled = true; };
    }
    const meta = STOCK_UNIVERSE.find(item => item.symbol === selectedAnalysis.symbol);
    if (!meta) {
      setPeerComparison(null);
      return () => { cancelled = true; };
    }
    const peer = selectMostRelevantPeer(meta, livePrices);
    if (!peer) {
      setPeerComparison(null);
      return () => { cancelled = true; };
    }
    setPeerLoading(true);
    fetch('/api/company-scale?action=history&symbol=' + encodeURIComponent(peer.symbol) + '&range=max', { cache: 'no-store' })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(body?.points)) throw new Error(body?.error || 'Peer history unavailable');
        return body;
      })
      .then(body => {
        if (cancelled) return;
        const history = body.points
          .filter((point: any) => point && typeof point.date === 'string' && Number.isFinite(Number(point.price)))
          .map((point: any) => ({ date: point.date, price: Number(point.price) }));
        setPeerComparison(calculatePeerCounterfactual({
          holding: selectedAnalysis,
          peer,
          peerHistory: history,
          peerCurrentPrice: livePrices[peer.symbol]?.price ?? null,
          actualCurrentPrice: selectedAnalysis.livePrice,
          transactions: portfolioTransactions,
        }));
      })
      .catch(() => {
        if (!cancelled) setPeerComparison(calculatePeerCounterfactual({
          holding: selectedAnalysis,
          peer,
          peerHistory: [],
          peerCurrentPrice: livePrices[peer.symbol]?.price ?? null,
          actualCurrentPrice: selectedAnalysis.livePrice,
        }));
      })
      .finally(() => { if (!cancelled) setPeerLoading(false); });
    return () => { cancelled = true; };
  }, [selectedAnalysis?.symbol, selectedAnalysis?.purchaseDate, selectedAnalysis?.investedValue, selectedAnalysis?.quantity, selectedAnalysis?.livePrice, livePrices, portfolioTransactions.length, portfolioTransactions.map(item => item.sourceRow).join(',')]);

  const filtered: PositionAnalysis[] = useMemo(() => {
    const result = analyses.filter((h: PositionAnalysis) => {
      const searchable = (h.symbol + ' ' + h.name + ' ' + h.theme).toLowerCase();
      if (group !== 'All' && h.group !== group) return false;
      if (!searchable.includes(q.trim().toLowerCase())) return false;
      if (holdingFilter === 'Positive Today' && !(h.dailyChangePct != null && h.dailyChangePct > 0)) return false;
      if (holdingFilter === 'Negative Today' && !(h.dailyChangePct != null && h.dailyChangePct < 0)) return false;
      if (holdingFilter === 'Below Cost' && !(h.livePrice != null && h.livePrice < h.averageCost)) return false;
      if (holdingFilter === 'Needs Review' && !['ADD REVIEW', 'RISK REVIEW', 'INSUFFICIENT DATA'].includes(h.state)) return false;
      return true;
    });
    return result.sort((a, b) => {
      if (holdingSort === 'P&L %') return (b.pnlPct ?? -Infinity) - (a.pnlPct ?? -Infinity);
      if (holdingSort === 'Daily Move') return (b.dailyChangePct ?? -Infinity) - (a.dailyChangePct ?? -Infinity);
      if (holdingSort === 'Value') return (b.currentValue ?? b.investedValue) - (a.currentValue ?? a.investedValue);
      return a.symbol.localeCompare(b.symbol);
    });
  }, [analyses, q, group, holdingFilter, holdingSort]);

  const breadthMoves = analyses
    .filter(h => typeof h.dailyChangePct === 'number' && Number.isFinite(h.dailyChangePct))
    .map(h => h.dailyChangePct as number);
  const breadthPositive = breadthMoves.filter(value => value >= 0).length;
  const breadthCoverage = breadthMoves.length;
  const addReviews = analyses.filter(h => h.state === 'ADD REVIEW').length;
  const riskReviews = analyses.filter(h => h.state === 'RISK REVIEW').length;
  const infraScore = Math.round(intelligence.groups.find(g => g.name === 'AI Infrastructure')?.score ?? 0);
  const investedTotal = analyses.reduce((sum, h) => sum + h.investedValue, 0);
  const livePositions = analyses.filter(h => h.livePrice != null && !h.liveStale);
  const stalePositions = analyses.filter(h => h.livePrice != null && h.liveStale);
  const allQuotesFresh = analyses.length > 0 && livePositions.length === analyses.length;
  const liveCurrentTotal = allQuotesFresh
    ? analyses.reduce((sum, h) => sum + (h.currentValue ?? 0), 0)
    : null;
  const liveUnrealized = liveCurrentTotal != null ? liveCurrentTotal - investedTotal : null;
  const liveUnrealizedPct = liveCurrentTotal != null && investedTotal
    ? (liveUnrealized as number / investedTotal) * 100
    : null;
  const stressFreshCount = analyses.filter(item => item.livePrice != null && !item.liveStale).length;
  const stressStaleCount = analyses.filter(item => item.livePrice != null && item.liveStale).length;
  const portfolioMetricInputs = useMemo(() => analyses.map(item => ({ symbol: item.symbol, investedValue: item.investedValue, currentValue: item.currentValue, pnl: item.pnl, pnlPct: item.pnlPct, dailyChangePct: item.dailyChangePct, group: item.group })), [analyses]);
  const concentration = useMemo(() => calculatePortfolioConcentration(portfolioMetricInputs), [portfolioMetricInputs]);
  const macroExposureRows = useMemo(() => {
    const exposure = derivePortfolioExposure(analyses.map(item => item.symbol), contracts, news, positions);
    const values = new Map(analyses.map(item => [item.symbol, item.currentValue ?? item.investedValue]));
    return exposure.map(row => ({ ...row, value: Number(values.get(row.symbol) || 0) }));
  }, [analyses, contracts, news, positions]);
  const macroExposureLoad = useMemo(
    () => calculateExposureWeightedMacroLoad(macroExposureRows, macroRisks),
    [macroExposureRows, macroRisks],
  );
  const rawWeightedStress = useMemo(
    () => calculatePortfolioStressScore(
      portfolioMetricInputs,
      macroRisks.filter(risk => String(risk?.impactRating).toLowerCase() === 'high').length,
      macroRisks.filter(risk => String(risk?.impactRating).toLowerCase() === 'medium').length,
      macroExposureLoad.assessedLoad,
    ),
    [portfolioMetricInputs, macroRisks, macroExposureLoad.assessedLoad],
  );
  const [stableStressScore, setStableStressScore] = useState<number | null>(null);
  useEffect(() => {
    setStableStressScore(previous => applyStressHysteresis(previous, rawWeightedStress.score));
  }, [rawWeightedStress.score]);
  const stress = useMemo(() => {
    const score = stableStressScore ?? rawWeightedStress.score;
    return {
      ...rawWeightedStress,
      score,
      label: score >= 70 ? 'Elevated' : score >= 45 ? 'Watch' : 'Contained',
    };
  }, [rawWeightedStress, stableStressScore]);
  const weightedStress = stress;
  const macroHighCount = macroRisks.filter(risk => String(risk?.impactRating).toLowerCase() === 'high').length;
  const macroMediumCount = macroRisks.filter(risk => String(risk?.impactRating).toLowerCase() === 'medium').length;
  const attribution = useMemo(() => calculatePortfolioAttribution(portfolioMetricInputs), [portfolioMetricInputs]);
  const portfolioWeights = useMemo(() => Object.fromEntries(concentration.weights.map(item => [item.symbol, item.weight])), [concentration.weights]);
  const portfolioHistoryValue = useMemo(
    () => buildPortfolioPerformanceIndexFromTransactions(
      portfolioHistory.histories,
      portfolioTransactions,
    ),
    [portfolioHistory.histories, portfolioTransactions],
  );
  const correlationSymbols = analyses.slice().sort((a, b) => (b.portfolioWeight ?? 0) - (a.portfolioWeight ?? 0)).slice(0, 8).map(item => item.symbol);
  const portfolioCorrelation = useMemo(() => calculatePortfolioCorrelation(portfolioHistory.histories, correlationSymbols), [portfolioHistory.histories, correlationSymbols.join(',')]);
  const stressTrend = useMemo(() => buildPortfolioDailySeriesFromTransactions(
    Object.fromEntries(Object.entries(portfolioHistory.histories).filter(([symbol]) => !['SPY', 'QQQ', 'SOXX'].includes(symbol))) as Record<string, PortfolioHistoryPoint[]>,
    portfolioTransactions,
    30,
  ), [portfolioHistory.histories, portfolioTransactions]);
  const syntheticPortfolioHistory = useMemo(() => { if (!stressTrend.length) return []; let value = 100; const rows: PortfolioHistoryPoint[] = [{ date: stressTrend[0].date, price: value }]; stressTrend.slice(1).forEach(row => { value *= 1 + row.returnPct / 100; rows.push({ date: row.date, price: value }); }); return rows; }, [stressTrend]);
  const benchmarkComparisons = useMemo(() => comparePortfolioToBenchmarks(syntheticPortfolioHistory, Object.fromEntries(['SPY', 'QQQ', 'SOXX'].map(symbol => [symbol, portfolioHistory.histories[symbol] || []]))), [syntheticPortfolioHistory, portfolioHistory.histories]);
  const topConcentration = concentration.topHolding;
  const top3ConcentrationPct = concentration.top3Weight * 100;
  const groupConcentration = concentration.groupWeights.slice(0, 3);
  const stressTrendAverage = stressTrend.length ? stressTrend.reduce((sum, row) => sum + row.stressScore, 0) / stressTrend.length : null;
  const stressTrendLatest = stressTrend.at(-1)?.stressScore ?? null;
  const decisionContext = useMemo(() => {
    const heldSymbols = new Set(analyses.map(item => item.symbol));
    const relevantContracts = contracts.filter(item => heldSymbols.has(String(item?.company || '').toUpperCase())).length;
    const relevantCongress = congressTrades.filter(item => heldSymbols.has(String(item?.stockSymbol || '').toUpperCase())).length;
    const relevantPolitical = politicalSignals.filter(item =>
      Array.isArray(item?.relatedSymbols) &&
      item.relatedSymbols.some(symbol => heldSymbols.has(String(symbol).toUpperCase()))
    ).length;
    const recoveryHoldings = analyses.filter(item => item.recoveryAlert).map(item => item.symbol);
    const riskHoldings = analyses.filter(item => item.state === 'RISK REVIEW').map(item => item.symbol);
    const staleCount = analyses.filter(item => item.liveStale || item.livePrice == null).length;
    return {
      portfolio: {
        holdingCount: analyses.length,
        freshQuoteCount: livePositions.length,
        staleOrMissingQuoteCount: staleCount,
        selectedHolding: selectedAnalysis?.symbol || null,
        selectedHoldingState: selectedAnalysis?.state || null,
        selectedHoldingPnlPct: selectedAnalysis?.pnlPct ?? null,
        selectedHoldingDailyChangePct: selectedAnalysis?.dailyChangePct ?? null,
        selectedHoldingStrategyContext: selectedAnalysis?.strategyContext || null,
        recoveryWatch: recoveryHoldings,
        riskReview: riskHoldings,
      },
      measurements: {
        weightedStress: stress.score,
        weightedStressLabel: stress.label,
        macroLoadAssessed: macroExposureLoad.assessedLoad,
        macroLoadWorstCase: macroExposureLoad.worstCaseLoad,
        macroExposureCoveragePct: macroExposureLoad.assessedCoveragePct,
        weightedBreadth: weightedStress.weightedBreadth,
        weightedAverageMove: weightedStress.weightedAvgMove,
        concentrationHhi: concentration.hhi,
        topHolding: concentration.topHolding,
        top3Weight: concentration.top3Weight,
        effectiveHoldings: concentration.effectiveHoldings,
        stressTrendLatest,
        stressTrendAverage,
        benchmarkComparisons,
      },
      analystConsensus: {
        status: analystLoading ? 'loading' : analystError ? 'failed' : analystConsensus
          ? ((analystConsensus.consensusAvailable || Number(analystConsensus.webEvidenceCount || 0) > 0) ? 'available' : 'empty')
          : 'missing',
        source: analystConsensus?.source || null,
        retrievedAt: analystConsensus?.retrievedAt || null,
        freshness: analystConsensus ? analystFreshness(analystConsensus.retrievedAt || null) : 'unknown',
        ratingCounts: analystConsensus?.recommendation || null,
        analystCount: Number(analystConsensus?.analystCount || 0),
        priceTarget: analystConsensus?.priceTarget || null,
        webEvidenceCount: Array.isArray(analystConsensus?.webEvidence?.results) ? analystConsensus.webEvidence.results.length : Number(analystConsensus?.webEvidenceCount || 0),
        epsEstimates: Array.isArray(analystConsensus?.epsEstimates) ? analystConsensus.epsEstimates : [],
        revenueEstimates: Array.isArray(analystConsensus?.revenueEstimates) ? analystConsensus.revenueEstimates : [],
        evidence: Array.isArray(analystConsensus?.webEvidence?.results) ? analystConsensus.webEvidence.results.slice(0, 6).map((item: any) => ({
          title: item?.title || null,
          url: item?.url || null,
          source: item?.source || null,
          publishedAt: item?.published_at || item?.publishedAt || null,
        })) : [],
        errors: analystConsensus?.errors || (analystError ? [analystError] : []),
        selectedSymbol: selectedAnalysis?.symbol || null,
      },
      evidenceAvailability: {
        heldContracts: relevantContracts,
        heldCongressDisclosures: relevantCongress,
        heldPoliticalSignals: relevantPolitical,
        macroRiskItems: macroRisks.length,
        newsItems: news.length,
        analystConsensus: {
          status: analystLoading ? 'loading' : analystError ? 'failed' : analystConsensus
            ? ((analystConsensus.consensusAvailable || Number(analystConsensus.webEvidenceCount || 0) > 0) ? 'available' : 'empty')
            : 'missing',
          symbol: selectedAnalysis?.symbol || null,
          source: analystConsensus?.source || null,
          retrievedAt: analystConsensus?.retrievedAt || null,
          freshness: analystConsensus ? analystFreshness(analystConsensus.retrievedAt || null) : 'unknown',
          analystCount: Number(analystConsensus?.analystCount || 0),
          webEvidenceCount: Array.isArray(analystConsensus?.webEvidence?.results) ? analystConsensus.webEvidence.results.length : Number(analystConsensus?.webEvidenceCount || 0),
          structuredEvidence: {
            ratings: analystConsensus?.recommendation || null,
            priceTarget: analystConsensus?.priceTarget || null,
            epsEstimates: Array.isArray(analystConsensus?.epsEstimates) ? analystConsensus.epsEstimates.slice(0, 4) : [],
            revenueEstimates: Array.isArray(analystConsensus?.revenueEstimates) ? analystConsensus.revenueEstimates.slice(0, 4) : [],
          },
        },
        contractSource: relevantContracts > 0 ? 'available' : 'none observed',
        congressSource: relevantCongress > 0 ? 'available' : 'none observed',
        politicalSource: relevantPolitical > 0 ? 'available' : 'none observed',
      },
      evidenceQualityInput: {
        evidence_availability: {
          required: [],
          missing: [],
          usable_families: [
            ...(analyses.length > 0 ? ['portfolio'] : []),
            ...(livePositions.length > 0 ? ['market'] : []),
            ...(relevantContracts > 0 ? ['regulatory_primary'] : []),
            ...(relevantCongress > 0 ? ['congress'] : []),
            ...(news.length > 0 ? ['news'] : []),
            ...(macroRisks.length > 0 ? ['macro'] : []),
            ...(analystConsensus && !analystError && (analystConsensus.consensusAvailable || Number(analystConsensus.webEvidenceCount || 0) > 0) ? ['analyst_consensus'] : []),
          ],
        },
        evidence_freshness: [
          ...(analyses.length > 0 ? [{
            freshness: {
              status: livePositions.length === analyses.length ? 'FRESH' : livePositions.length > 0 ? 'AGING' : 'STALE',
            },
          }] : []),
          ...(analystConsensus && !analystError ? [{
            freshness: {
              status: analystFreshness(analystConsensus.retrievedAt || null).toUpperCase(),
            },
          }] : []),
        ],
        conflict_detection: { detected: false, count: 0 },
        citation_coverage: {},
      },
      guardrails: [
        'Measurements describe observed portfolio state; they are not trade instructions.',
        'Recovery watch requires negative P&L and negative daily move with supportive group/peer evidence.',
        'Historical stress uses current weights across the historical window and does not reconstruct historical position sizes.',
        'Benchmark comparisons use overlapping available market dates only.',
      ],
    };
  }, [
    analyses,
    livePositions.length,
    selectedAnalysis,
    weightedStress,
    concentration,
    stressTrendLatest,
    stressTrendAverage,
    benchmarkComparisons,
    contracts,
    congressTrades,
    politicalSignals,
    macroRisks.length,
    news.length,
    analystConsensus,
    analystLoading,
    analystError,
  ]);


  return (
    <div className="space-y-6" data-testid="portfolio-intelligence">
      <div className="aiw-page-header sticky top-0 z-30 -mx-2 px-2 py-3 flex flex-wrap items-end justify-between gap-3 bg-[#0F1115]/95 backdrop-blur-md border-b border-white/10">
        <div>
          <div className="text-[10px] font-mono tracking-[.2em] uppercase text-emerald-400">AI INFRA WATCH / PORTFOLIO INTELLIGENCE</div>
          <div className="text-2xl font-black mt-2">Portfolio + Watchlist Decision Lab</div>
          <div className="text-xs text-white/45 mt-1">Broker snapshot · live market feed · peers · rotation · catalysts · event study</div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-[10px] font-mono text-white/40">
          <span className="px-2 py-1 rounded-full border border-white/10">DATA {stressFreshCount}/{analyses.length} CURRENT</span>
          {selectedAnalysis && <FreshnessBadge {...(livePrices[selectedAnalysis.symbol] || {})} labelOverride={selectedAnalysis.liveStale ? 'Last close' : undefined} showAge />}
          <span className="px-2 py-1 rounded-full border border-white/10">UP TODAY {breadthPositive}/{breadthCoverage}</span>
          <span className="px-2 py-1 rounded-full border border-white/10">ADD REVIEWS {addReviews}</span>
          <span className="px-2 py-1 rounded-full border border-white/10">RISK REVIEWS {riskReviews}</span>
          <div className="flex items-center rounded-lg border border-white/10 bg-white/[.02] p-0.5" aria-label="Portfolio view density">
            <button type="button" onClick={() => changeViewMode('simple')} aria-pressed={viewMode === 'simple'} className={'px-2 py-1 rounded text-[9px] uppercase ' + (viewMode === 'simple' ? 'bg-white text-black' : 'text-white/45 hover:text-white')}>Simple</button>
            <button type="button" onClick={() => changeViewMode('detailed')} aria-pressed={viewMode === 'detailed'} className={'px-2 py-1 rounded text-[9px] uppercase ' + (viewMode === 'detailed' ? 'bg-white text-black' : 'text-white/45 hover:text-white')}>Detailed</button>
          </div>
        </div>
      </div>

      <PortfolioManager holdings={holdings} onChanged={setHoldings} />
      {portfolioLoading && <div className="text-[10px] font-mono text-white/30">Loading persistent holdings…</div>}
      {portfolioError && <div className="rounded-xl border border-amber-400/15 bg-amber-400/[.03] px-3 py-2 text-[10px] text-amber-200/70">{portfolioError}. Persistent portfolio data could not be loaded; check the portfolio API and Supabase connection.</div>}

      <section className="rounded-2xl border border-white/10 bg-[#15181E]/50 px-4 py-3">
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
                Share up today + average daily move + exposure-weighted macro load · {stressFreshCount}/{analyses.length} holdings with current quotes{stressStaleCount ? ' · ' + stressStaleCount + ' last close' : ''}
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
        <div className="flex items-center justify-end gap-2 mb-2"><span className="text-[10px] font-mono uppercase text-white/55">Display currency</span>{(['USD', 'INR'] as const).map(code => <button key={code} type="button" aria-pressed={currency === code} onClick={() => setCurrency(code)} className={"px-2 py-1 rounded border text-[10px] font-mono " + (currency === code ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-200" : "border-white/10 text-white/55")}>{code}</button>)}</div>
       <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
          <div className="rounded-lg border border-white/5 bg-black/10 px-3 py-2">
            <div className="text-[8px] font-mono uppercase tracking-widest text-white/25">Up today</div>
            <div className="text-[10px] font-mono font-bold text-white/70 mt-1">{stress.breadth == null ? '—' : Math.round(stress.breadth * 100) + '% positive'}</div>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/10 px-3 py-2">
            <div className="text-[8px] font-mono uppercase tracking-widest text-white/25">Avg daily move</div>
            <div className="text-[10px] font-mono font-bold text-white/70 mt-1">{stress.avgMove == null ? '—' : (stress.avgMove >= 0 ? '+' : '') + stress.avgMove.toFixed(2) + '%'}</div>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/10 px-3 py-2">
            <div className="text-[8px] font-mono uppercase tracking-widest text-white/25">Macro load</div>
            <div className="text-[10px] font-mono font-bold text-white/70 mt-1">{macroExposureLoad.assessedLoad.toFixed(1)}/30</div>
            <div className="text-[8px] font-mono text-white/25 mt-1">assessed · worst {macroExposureLoad.worstCaseLoad.toFixed(1)}/30</div>
            <div className="text-[7px] font-mono text-white/20 mt-1">{macroExposureLoad.assessedCoveragePct.toFixed(0)}% exposure dimensions assessed</div>
          </div>
          <div className="rounded-lg border border-white/5 bg-black/10 px-3 py-2">
            <div className="text-[8px] font-mono uppercase tracking-widest text-white/25">Data coverage</div>
            <div className="text-[10px] font-mono font-bold text-white/70 mt-1">{stress.freshCount}/{analyses.length} fresh</div>
          </div>
        </div>
      </section>

      {(tab === 'performance' || (tab === 'overview' && viewMode === 'detailed')) && (
              <section className="rounded-2xl border border-white/10 bg-[#15181E]/50 p-4">
                <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-3">
                  <div><div className="text-[9px] font-mono uppercase tracking-[0.2em] text-cyan-300">Portfolio measurement layer</div><h2 className="text-lg font-black mt-1">Exposure, attribution & benchmark context</h2><p className="text-[10px] text-white/35 mt-1">Weights use current value when fresh; cost basis is used only when current value is unavailable. Benchmarks use overlapping market dates.</p></div>
                  <div className="text-[9px] font-mono text-white/30">{portfolioHistory.loading ? 'LOADING 1Y HISTORY…' : portfolioHistory.error ? 'PARTIAL HISTORY' : 'HISTORY READY'}</div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">
                  <Info label="Weighted stress" value={weightedStress.score + '/100'} />
                  <Info label="Largest holding" value={topConcentration ? topConcentration.symbol + ' ' + (topConcentration.weight * 100).toFixed(1) + '%' : '—'} />
                  <Info label="Top 3 concentration" value={top3ConcentrationPct.toFixed(1) + '%'} />
                  <Info label="Held positions" value={String(analyses.length)} />
                  <Info label="Effective holdings (HHI)" value={concentration.effectiveHoldings == null ? '—' : concentration.effectiveHoldings.toFixed(1) + ' eq.'} />
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-3 mt-3">
                  <div className="rounded-xl border border-white/5 bg-black/10 p-3"><div className="flex items-center justify-between"><div><div className="text-[8px] font-mono uppercase tracking-widest text-white/25">30-day transaction-aware stress backcast</div><div className="text-[9px] text-white/30 mt-1">Observed market-move component using the actual held quantities from the broker transaction history; current macro load is separate.</div></div><div className="text-right"><div className="text-sm font-black">{stressTrendLatest == null ? '—' : stressTrendLatest + '/100'}</div><div className="text-[8px] font-mono text-white/25">avg {stressTrendAverage == null ? '—' : stressTrendAverage.toFixed(1)}</div></div></div>
                    <div className="h-36 mt-2">{stressTrend.length > 1 ? <ResponsiveContainer width="100%" height="100%"><LineChart data={stressTrend}><CartesianGrid strokeDasharray="3 3" strokeOpacity={0.08} /><XAxis dataKey="date" hide /><YAxis domain={[0, 100]} hide /><Tooltip contentStyle={{ background: '#15181E', border: '1px solid rgba(255,255,255,.1)', fontSize: 10 }} formatter={(value: number) => [value.toFixed(0), 'Stress']} /><Line type="monotone" dataKey="stressScore" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer> : <div className="h-full flex items-center justify-center text-[9px] font-mono text-white/25">Need overlapping historical prices to build the trend.</div>}</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-black/10 p-3"><div className="text-[8px] font-mono uppercase tracking-widest text-white/25">Concentration by group</div><div className="space-y-2 mt-3">{groupConcentration.length ? groupConcentration.map(item => <div key={item.group}><div className="flex justify-between text-[9px] font-mono"><span className="text-white/60">{item.group}</span><span className="text-white/40">{(item.weight * 100).toFixed(1)}%</span></div><div className="h-1.5 rounded-full bg-white/5 mt-1 overflow-hidden"><div className="h-full bg-cyan-300/60" style={{ width: Math.min(100, item.weight * 100) + '%' }} /></div></div>) : <div className="text-[9px] font-mono text-white/25">No valued holdings available.</div>}</div></div>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_1fr] gap-3 mt-3">
                  <div className="rounded-xl border border-white/5 bg-black/10 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[8px] font-mono uppercase tracking-widest text-white/25">Portfolio history</div>
                        <div className="text-[9px] text-white/30 mt-1">Transaction-aware portfolio performance since your first active holding; broker buys and sells are reconstructed against historical market prices.</div>
                      </div>
                      <div className="text-right text-[9px] font-mono text-white/35">
                        {portfolioHistoryValue.length ? portfolioHistoryValue[0].date + ' → ' + portfolioHistoryValue.at(-1)!.date : 'No history'}
                      </div>
                    </div>
                    <div className="h-40 mt-2">
                      {portfolioHistoryValue.length > 1 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={portfolioHistoryValue}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.08} />
                            <XAxis dataKey="date" hide />
                            <YAxis hide domain={['auto', 'auto']} />
                            <Tooltip contentStyle={{ background: '#15181E', border: '1px solid rgba(255,255,255,.1)', fontSize: 10 }} formatter={(value: number) => [value.toFixed(1), 'Indexed value']} />
                            <Line type="monotone" dataKey="normalizedValue" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : <div className="h-full flex items-center justify-center text-[9px] font-mono text-white/25">Need overlapping holding history to build portfolio history.</div>}
                    </div>
                    <div className="text-[8px] font-mono text-white/20 mt-1">Indexed to 100 at the first date when the broker transaction history shows an active position; market performance is separated from new cash added by later purchases. This is historical reconstruction, not a forecast.</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-black/10 p-3">
                    <div className="text-[8px] font-mono uppercase tracking-widest text-white/25">Holding correlation</div>
                    <div className="text-[9px] text-white/30 mt-1">Pearson correlation of daily returns over the overlapping available history. At least five shared sessions are required.</div>
                    {portfolioCorrelation.symbols.length > 0 ? (
                      <div className="overflow-x-auto mt-3">
                        <table className="w-full text-[8px] font-mono">
                          <thead><tr><th className="text-left text-white/25 pb-2 pr-2">Ticker</th>{portfolioCorrelation.symbols.map(symbol => <th key={symbol} className="text-center text-white/25 pb-2 px-1">{symbol}</th>)}</tr></thead>
                          <tbody>{portfolioCorrelation.symbols.map(left => <tr key={left}>
                            <td className="text-white/55 py-1 pr-2 font-bold">{left}</td>
                            {portfolioCorrelation.symbols.map(right => {
                              const value = portfolioCorrelation.values[left]?.[right] ?? null;
                              const sample = portfolioCorrelation.sampleDays[left]?.[right] ?? 0;
                              return <td key={right} title={sample + ' overlapping sessions'} className="text-center px-1 py-1 text-white/50">{value == null ? '—' : value.toFixed(2)}</td>;
                            })}
                          </tr>)}</tbody>
                        </table>
                      </div>
                    ) : <div className="text-[9px] font-mono text-white/25 mt-3">No overlapping history available for correlation.</div>}
                  </div>
                </div>
        
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-3">
                  <div className="rounded-xl border border-white/5 bg-black/10 p-3"><div className="text-[8px] font-mono uppercase tracking-widest text-white/25">P&L contribution by holding</div><div className="space-y-2 mt-3">{attribution.map(item => <div key={item.symbol} className="flex items-center gap-3"><span className="w-12 text-[9px] font-mono font-bold text-white/65">{item.symbol}</span><div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden"><div className={item.pnlContribution >= 0 ? 'h-full bg-emerald-400/60' : 'h-full bg-rose-400/60'} style={{ width: Math.min(100, Math.abs(item.pnlContribution) / Math.max(1, Math.abs(attribution[0]?.pnlContribution || 1)) * 100) + '%' }} /></div><span className={'w-24 text-right text-[9px] font-mono ' + (item.pnlContribution >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{item.pnlContribution >= 0 ? '+' : ''}${item.pnlContribution.toFixed(2)}</span></div>)}{!attribution.length && <div className="text-[9px] font-mono text-white/25">No P&L attribution available.</div>}</div></div>
                  <div className="rounded-xl border border-white/5 bg-black/10 p-3"><div className="text-[8px] font-mono uppercase tracking-widest text-white/25">Matched benchmark window</div><div className="space-y-2 mt-3">{benchmarkComparisons.map(item => <div key={item.benchmark} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 px-3 py-2"><div><div className="text-[10px] font-black">{item.benchmark}</div><div className="text-[8px] font-mono text-white/25">{item.sampleDays ? item.startDate + ' → ' + item.endDate + ' · ' + item.sampleDays + ' sessions' : 'No overlapping history'}</div></div><div className="text-right"><div className="text-[9px] font-mono text-white/45">Portfolio {item.portfolioReturnPct == null ? '—' : (item.portfolioReturnPct >= 0 ? '+' : '') + item.portfolioReturnPct.toFixed(2) + '%'}</div><div className="text-[9px] font-mono text-white/45">{item.benchmark} {item.benchmarkReturnPct == null ? '—' : (item.benchmarkReturnPct >= 0 ? '+' : '') + item.benchmarkReturnPct.toFixed(2) + '%'}</div><div className={'text-[9px] font-mono font-bold ' + (item.relativeReturnPct == null ? 'text-white/25' : item.relativeReturnPct >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{benchmarkResultLabel(item.relativeReturnPct, item.benchmark)}</div></div></div>)}</div></div>
                </div>
                <div className="mt-3 text-[8px] font-mono text-white/20">Weighted stress measures observed moves and exposure concentration, not a forecast. P&L attribution is descriptive. Benchmark comparisons are descriptive matched-window measurements.</div>
              </section>
              )}
      {(tab === 'overview' && viewMode === 'detailed') && (
              <div className="grid grid-cols-2 xl:grid-cols-5 gap-3" id="portfolio-investment-summary">
                <Metric label="Invest amount" value={formatPortfolioMoney(investedTotal)} suffix={currency === 'INR' ? 'home currency · USD basis' : 'position cost'} tone="neutral" icon={<WalletCards/>}/>
                <Metric label="Current value" value={formatPortfolioMoney(liveCurrentTotal)} suffix={livePositions.length + '/' + analyses.length + ' fresh · ' + stalePositions.length + ' fallback'} tone="up" icon={<TrendingUp/>}/>
                <Metric label="Unrealized P&L" value={liveUnrealized != null ? (liveUnrealized >= 0 ? '+' : '−') + formatPortfolioMoney(Math.abs(liveUnrealized)) : '—'} suffix={(liveUnrealizedPct != null ? '(' + liveUnrealizedPct.toFixed(2) + '%)' : '') + (stalePositions.length ? ' · snapshot fallback' : '')} tone={liveUnrealized != null && liveUnrealized >= 0 ? 'up' : 'down'} icon={<Activity/>}/>
                <Metric label="AI infra signal" value={infraScore.toString()} suffix="/100" tone={infraScore >= 50 ? "up" : "down"} icon={<Zap/>}/>
                <Metric label="Top live group" value={intelligence.topGroup || '—'} suffix="" tone="warn" icon={<ShieldAlert/>}/>
              </div>      )}
      <div className="flex flex-wrap gap-1 border-b border-white/10 pb-2">
        <span className="px-2 py-2 text-[9px] font-mono uppercase tracking-widest text-white/20">Explore</span>
        {([['overview','Overview'],['holdings','Holdings'],['performance','Performance'],['evidence','Evidence'],['watchlist','Watchlist'],['events','Event Study'],['rotation','Money Rotation'],['network','Relationship Graph']] as const).map(x =>
          <button type="button" key={x[0]} onClick={() => changeTab(x[0])} aria-pressed={tab === x[0]} className={'px-3 py-2 rounded-lg border text-[11px] font-mono uppercase ' + (tab === x[0] ? 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400' : 'border-transparent text-white/45 hover:text-white hover:bg-white/5')}>
            {x[1]}
          </button>
        )}
      </div>


      {tab === 'research' && <PortfolioResearchPanel />}

      {tab === 'holdings' && (
        <div className="space-y-4">
          <Panel title="Holdings" subtitle="Compact portfolio view. Select a row to open the holding context below.">
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[760px] text-left">
                <thead className="bg-black/20">
                  <tr className="text-[9px] font-mono uppercase tracking-widest text-white/30">
                    <th className="px-3 py-2.5">Stock</th>
                    <th className="px-3 py-2.5">Weight</th>
                    <th className="px-3 py-2.5">P&amp;L</th>
                    <th className="px-3 py-2.5">Today</th>
                    <th className="px-3 py-2.5">Rule</th>
                    <th className="px-3 py-2.5">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map(h => (
                    <tr key={h.symbol} className={selected === h.symbol ? 'bg-cyan-300/[.04]' : 'hover:bg-white/[.02]'}>
                      <td className="px-3 py-3">
                        <button type="button" onClick={() => setSelected(h.symbol)} className="font-black text-sm text-white hover:text-cyan-200">{h.symbol}</button>
                        <div className="text-[9px] text-white/30 mt-0.5">{h.name}</div>
                      </td>
                      <td className="px-3 py-3 font-mono text-[10px]">{((h.portfolioWeight || 0) * 100).toFixed(1)}%</td>
                      <td className={'px-3 py-3 font-mono text-[10px] ' + (h.pnlPct >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{h.livePrice == null ? '—' : (h.pnlPct >= 0 ? '+' : '') + h.pnlPct.toFixed(2) + '%'}</td>
                      <td className={'px-3 py-3 font-mono text-[10px] ' + (h.dailyChangePct == null ? 'text-white/35' : h.dailyChangePct >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{h.dailyChangePct == null ? '—' : (h.dailyChangePct >= 0 ? '+' : '') + h.dailyChangePct.toFixed(2) + '%'}</td>
                      <td className="px-3 py-3"><StatePill state={h.state}/></td>
                      <td className="px-3 py-3 font-mono text-[10px]">{formatPortfolioMoney(h.currentValue ?? h.investedValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length && <div className="p-6 text-center text-[10px] text-white/30">No holdings match the current filters.</div>}
            </div>
          </Panel>
          {selectedAnalysis && <SelectedHoldingChart h={selectedAnalysis} chart={selectedChart} chartRange={chartRange} onChartRangeChange={setChartRange} />}
          {selectedAnalysis && <PositionDetail h={selectedAnalysis} historicalPrice={historicalPrice}/>}
          {selectedAnalysis && <PeerCounterfactualPanel h={selectedAnalysis} comparison={peerComparison} loading={peerLoading} />}
        </div>
      )}

      {tab === 'evidence' && (
        <div className="space-y-4">
          <PortfolioEvidenceCoverage analyses={analyses} contracts={contracts} congressTrades={congressTrades} macroRisks={macroRisks} news={news} analystConsensus={analystConsensus} analystLoading={analystLoading} analystError={analystError} selectedSymbol={selectedAnalysis?.symbol || null} />
          <SignalScorecardPanel />
          <PortfolioSignalFusion prices={livePrices} contracts={contracts} congressTrades={congressTrades} macroRisks={macroRisks} news={news} politicalSignals={politicalSignals} heldSymbols={analyses.map(item => item.symbol)} />
          <UnifiedEventTimeline symbol={selected} contracts={contracts} congressTrades={congressTrades} macroRisks={macroRisks} news={news} politicalSignals={politicalSignals} purchaseDate={selectedAnalysis?.purchaseDate || null} />
        </div>
      )}

      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-4 items-start">
            <section className="min-w-0 space-y-3 self-start xl:sticky xl:top-4" aria-label="Portfolio decision context">
              <JevDecisionPanel
                kind="portfolio"
                title="Portfolio decision context"
                subtitle="Typed research triage and context from measured portfolio evidence; not a trade instruction."
                state={{ ...decisionContext, analystConsensus: decisionContext.analystConsensus || { status: analystLoading ? 'loading' : analystError ? 'unavailable' : 'not_retrieved' } }}
              />
              {selectedAnalysis && <DecisionGateSummary h={selectedAnalysis} />}
            </section>
            <section className="min-w-0">
              <Panel title="Held portfolio universe" subtitle="Broker positions · live quotes · actual holding dates · select a holding to update the intelligence rendered below">
              <div className="rounded-xl border border-white/5 bg-black/10 p-3 mb-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                  <FilterInput
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Search ticker, name or theme"
                    label="Search held portfolio universe by ticker, name, or theme"
                    icon={<Search className="w-3.5 h-3.5" />}
                  />
                  <FilterSelect
                    value={group}
                    onChange={e => setGroup(e.target.value)}
                    label="Filter held portfolio universe by group"
                  >
                    {['All', ...intelligence.groups.map((item) => item.name)].map(g => <option key={g}>{g}</option>)}
                  </FilterSelect>
                  <FilterSelect
                    value={holdingFilter}
                    onChange={e => setHoldingFilter(e.target.value as typeof holdingFilter)}
                    label="Filter held portfolio universe by state"
                  >
                    {['All', 'Positive Today', 'Negative Today', 'Below Cost', 'Needs Review'].map(value => <option key={value}>{value}</option>)}
                  </FilterSelect>
                  <FilterSelect
                    value={holdingSort}
                    onChange={e => setHoldingSort(e.target.value as typeof holdingSort)}
                    label="Sort held portfolio universe"
                  >
                    {['Symbol', 'P&L %', 'Daily Move', 'Value'].map(value => <option key={value}>{value}</option>)}
                  </FilterSelect>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                  <div className="text-[9px] font-mono text-white/35" aria-live="polite">{filtered.length} shown · {analyses.length} held · {livePositions.length} fresh quotes</div>
                  {selectedAnalysis && <div className="text-[9px] font-mono text-cyan-300/80">Selected: <span className="font-bold">{selectedAnalysis.symbol}</span></div>}
                </div>
              </div>

              <div className="grid grid-cols-1 2xl:grid-cols-2 gap-2">{filtered.map(h => <PositionRow key={h.symbol} h={h} selected={selected === h.symbol} onSelect={() => setSelected(h.symbol)} />)}</div>
              </Panel>
            </section>
          </div>

          <div className="space-y-4">
            {selectedAnalysis && <SelectedHoldingChart h={selectedAnalysis} chart={selectedChart} chartRange={chartRange} onChartRangeChange={setChartRange} />}
            {viewMode === 'detailed' && (
              <>
                <PortfolioEvidenceCoverage analyses={analyses} contracts={contracts} congressTrades={congressTrades} macroRisks={macroRisks} news={news} analystConsensus={analystConsensus} analystLoading={analystLoading} analystError={analystError} selectedSymbol={selectedAnalysis?.symbol || null} />
                {selectedAnalysis && <PeerCounterfactualPanel h={selectedAnalysis} comparison={peerComparison} loading={peerLoading} />}
                {selectedAnalysis && <PositionDetail h={selectedAnalysis} historicalPrice={historicalPrice}/>}
                <PortfolioPeerImpactSummary comparisons={peerPortfolioComparisons} />
              </>
            )}
          </div>

          {viewMode === 'detailed' && (
            <>
              <div className="bg-[#15181E] border border-white/10 rounded-2xl px-4 py-3 text-[10px] text-white/45">
                <span className="font-mono text-white/65 uppercase mr-2">PORTFOLIO DATA NOTE</span>
                Broker order history is used for holding-period context and cash-flow-aware comparisons. Advanced evidence panels are available from the Evidence tab.
              </div>

              <SignalScorecardPanel />

              <PortfolioSignalFusion
                prices={livePrices}
                contracts={contracts}
                congressTrades={congressTrades}
                macroRisks={macroRisks}
                news={news}
                politicalSignals={politicalSignals}
                heldSymbols={analyses.map(item => item.symbol)}
              />

              <UnifiedEventTimeline
                symbol={selected}
                contracts={contracts}
                congressTrades={congressTrades}
                macroRisks={macroRisks}
                news={news}
                politicalSignals={politicalSignals}
                purchaseDate={selectedAnalysis?.purchaseDate || null}
              />
            </>
          )}
        </>
      )}

      {tab === 'watchlist' && (
        <Panel title="Watchlist intelligence universe" subtitle={WATCHLIST.length + " configured names analyzed using the same market/peer/rotation framework"}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {WATCHLIST.map(w => {
              const quote = livePrices[w.symbol];
              const isSelected = selected === w.symbol;
              return (
                <div key={w.symbol} className={'text-left border rounded-xl p-3 transition ' + (isSelected ? 'border-emerald-400/30 bg-emerald-400/5' : 'border-white/5 bg-white/[.02]')}>
                  <div className="flex justify-between items-start gap-2">
                    <button type="button" onClick={() => setSelected(w.symbol)} className="text-left min-w-0">
                      <span className="font-black text-xs">{w.symbol}</span>
                      <div className="text-xs mt-1">{w.name}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelected(w.symbol)}
                      className="text-[9px] font-mono uppercase tracking-wider text-cyan-300/80 hover:text-cyan-200"
                    >
                      Analyze →
                    </button>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between gap-2">
                    <span className="font-mono font-black text-base">{quote?.price != null ? '$' + quote.price.toFixed(2) : '—'}</span>
                    <span className={'text-[10px] font-mono ' + (quote?.changePct == null ? 'text-white/30' : quote.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                      {quote?.changePct == null ? 'quote pending' : (quote.changePct >= 0 ? '+' : '') + quote.changePct.toFixed(2) + '%'}
                    </span>
                  </div>
                  <div className="text-[10px] text-white/35 mt-2">{w.group} · {w.theme}</div>
                  <div className="text-[9px] text-white/25 mt-2">Peers: {w.peers.join(' · ')}</div>
                </div>
              );
            })}
          </div>

          {(() => {
            const watch = WATCHLIST.find(item => item.symbol === selected);
            if (!watch) return null;
            const quote = livePrices[watch.symbol];
            const groupInfo = intelligence.groups.find(item => item.name === watch.group);
            const peerReturns = watch.peers
              .map(peer => livePrices[peer]?.changePct)
              .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
            const peerAverage = peerReturns.length ? peerReturns.reduce((a, b) => a + b, 0) / peerReturns.length : null;
            const vsPeers = quote?.changePct != null && peerAverage != null ? quote.changePct - peerAverage : null;
            const universeVs = groupInfo?.relativeToUniverse ?? null;

            return (
    <div className="mt-4 rounded-xl border border-cyan-400/10 bg-cyan-400/[0.03] p-4">
                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3">
                  <div>
                    <div className="text-[9px] font-mono uppercase tracking-widest text-cyan-300">Watchlist analysis</div>
                    <div className="text-lg font-black mt-1">{watch.symbol} · {watch.name}</div>
                    <div className="text-[10px] text-white/35 mt-1">{watch.group} · {watch.theme}</div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 min-w-[420px] max-w-full">
                    <Info label="Live price" value={quote?.price == null ? '—' : '$' + quote.price.toFixed(2)} />
                    <Info label="Daily move" value={quote?.changePct == null ? '—' : (quote.changePct >= 0 ? '+' : '') + quote.changePct.toFixed(2) + '%'} />
                    <Info label="Vs peers" value={vsPeers == null ? '—' : (vsPeers >= 0 ? '+' : '') + vsPeers.toFixed(2) + ' pts'} />
                    <Info label="Group signal" value={groupInfo ? Math.round(groupInfo.score) + '/100' : '—'} />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                  <Info label="Group participation" value={groupInfo ? Math.round(groupInfo.breadth * 100) + '%' : '—'} />
                  <Info label="Group vs all tracked" value={universeVs == null ? '—' : (universeVs >= 0 ? '+' : '') + universeVs.toFixed(2) + ' pts'} />
                  <Info label="Peers" value={watch.peers.join(' · ') || 'No peers configured'} />
                </div>

                <div className="mt-3 rounded-lg border border-white/5 bg-black/10 p-3">
                  <div className="text-[8px] font-mono uppercase tracking-widest text-white/25">Analysis basis</div>
                  <div className="text-[10px] text-white/50 mt-2 leading-5">
                    {quote?.changePct == null
                      ? 'Waiting for a live quote before calculating peer-relative performance.'
                      : peerAverage == null
                        ? 'Live price is available, but no peer quotes are currently available for a peer-relative comparison.'
                        : 'Current daily move is compared with the configured peer basket; group signal combines daily return, how many names are up, and performance versus the tracked universe.'}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => changeTab('events')}
                    className="rounded border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-mono uppercase text-white/55 hover:text-white"
                  >
                    Open Event Study
                  </button>
                </div>
              </div>
            );
          })()}

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
            <Insight title="Memory cluster" body="SK Hynix · Micron · SanDisk · DRAM" icon={<BarChart3/>}/>
            <Insight title="Compute cluster" body="NVDA · AMD · TSM · QCOM · INTC · CBRS" icon={<Network/>}/>
            <Insight title="Software rotation" body="NOW · CRM · TEAM vs AI hardware breadth" icon={<TrendingUp/>}/>
          </div>
        </Panel>
      )}

      {tab === 'rotation' && (
        <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_.75fr] gap-4">
          <Panel title="Money rotation engine" subtitle="Multi-timeframe relative-strength and breadth proxy across infrastructure, compute, memory and software">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {(['1D','5D','20D','60D','3M','6M'] as RotationHorizon[]).map(h => <button key={h} onClick={() => setRotationHorizon(h)} aria-pressed={rotationHorizon === h} className={'px-2.5 py-1.5 rounded border text-[9px] font-mono font-bold ' + (rotationHorizon === h ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-white/10 text-white/35')}>{h}</button>)}
              <select value={rotationGroup} onChange={e => setRotationGroup(e.target.value)} aria-label="Filter money rotation group" className="ml-auto bg-[#15181E] border border-white/10 rounded px-2 py-1.5 text-[9px] font-mono text-white/55"><option value="All">All groups</option>{rotation.groups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}</select>
            </div>
            <div className="flex flex-wrap gap-2 mb-2 text-[8px] font-mono uppercase tracking-wider">
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-300">Strengthening</span>
              <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-2 py-1 text-rose-300">Weakening</span>
              <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-amber-300">Mixed</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/45">Insufficient</span>
            </div>
            <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={rotation.groups.filter(g => rotationGroup === 'All' || g.name === rotationGroup).map(g => ({group:g.name, score:Math.round(g.score), move:g.horizons[rotationHorizon], direction:g.direction}))}>
              <CartesianGrid stroke="#ffffff10" vertical={false}/><XAxis dataKey="group" stroke="#ffffff35" tick={{fontSize:9}} interval={0} angle={-18} textAnchor="end" height={55}/><YAxis stroke="#ffffff35" tick={{fontSize:10}}/><Tooltip contentStyle={{background:'#15181E',border:'1px solid #ffffff20'}} formatter={(v,n) => n === 'score' ? [v + '/100','Rotation signal'] : [typeof v === 'number' ? v.toFixed(1) + '%' : '—','Period return']}/><Bar dataKey="score" radius={[5,5,0,0]}>{rotation.groups.filter(g => rotationGroup === 'All' || g.name === rotationGroup).map(g => <Cell key={g.name} fill={rotationDirectionColor(g.direction)} />)}</Bar>
            </BarChart></ResponsiveContainer></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">{rotation.groups.filter(g => rotationGroup === 'All' || g.name === rotationGroup).map(g => {
              const tone = rotationDirectionClass(g.direction);
              return <div key={g.name} className={'rounded-xl border p-3 ' + tone.card}>
                <div className="flex justify-between gap-2 items-start"><div><span className="text-xs font-bold">{g.name}</span><span className={'ml-2 inline-flex rounded-full border px-1.5 py-0.5 text-[8px] font-mono uppercase ' + tone.pill}>{g.direction}</span></div><span className={'text-[10px] font-mono font-bold ' + tone.text}>{Math.round(g.score)}/100</span></div>
                <div className="text-[9px] text-white/35 mt-1">{g.members.join(' · ')}</div>
                <div className="grid grid-cols-3 gap-1 mt-2 text-[8px] font-mono">{(['1D','20D','60D'] as RotationHorizon[]).map(h => <div key={h}><span className="text-white/20">{h}</span><div className={'font-bold ' + rotationReturnClass(g.horizons[h])}>{g.horizons[h] == null ? '—' : (g.horizons[h]! >= 0 ? '+' : '') + g.horizons[h]!.toFixed(1) + '%'}</div></div>)}</div>
              </div>;
            })}</div>
            <div className="mt-3 text-[9px] text-white/30">{rotation.methodology} {portfolioHistory.error ? 'History warning: ' + portfolioHistory.error : ''}</div>
          </Panel>
          <Panel title="Pair monitor" subtitle="Relative-strength spread history and current transition state">
            <div className="space-y-2">{rotation.pairs.map(x => {
              const spreadClass = x.spread == null ? 'text-white/35' : x.spread >= 0 ? 'text-emerald-300' : 'text-rose-300';
              const trendClass = x.trend === 'widening' ? 'text-emerald-300' : x.trend === 'narrowing' ? 'text-rose-300' : x.trend === 'stable' ? 'text-amber-300' : 'text-white/35';
              return <div key={x.left+x.right} className={'rounded-xl border p-3 ' + (x.spread == null ? 'border-white/5 bg-black/10' : x.spread >= 0 ? 'border-emerald-400/10 bg-emerald-400/[.025]' : 'border-rose-400/10 bg-rose-400/[.025]')}>
                <div className="flex justify-between gap-3"><div className="text-xs font-bold">{x.left} ↔ {x.right}</div><div className={'text-[10px] font-mono font-bold ' + spreadClass}>{x.spread == null ? '—' : (x.spread >= 0 ? '+' : '') + x.spread.toFixed(2) + ' pts'}</div></div>
                <div className="text-[10px] text-white/35 mt-1">{x.label} · <span className={trendClass}>{x.trend}</span></div>
                <div className="flex gap-1 mt-2">{x.history.slice(-6).map((v,i) => <span key={i} className={'h-2 flex-1 rounded ' + (v >= 0 ? 'bg-emerald-400/40' : 'bg-rose-400/40')} title={(v >= 0 ? '+' : '') + v.toFixed(2) + ' pts'} />)}</div>
              </div>;
            })}</div>
          </Panel>
        </div>
      )}


      {tab === 'events' && selectedAnalysis && (
        <div className="space-y-3">
          <Panel title="Event study universe" subtitle="Choose any held portfolio position. Each ticker is evaluated independently against its SEC filing chronology and SPY market context.">
            <div className="flex flex-wrap gap-2">
              {analyses.map((position) => (
                <button
                  key={position.symbol}
                  onClick={() => setSelected(position.symbol)}
                  className={
                    'px-3 py-2 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-wider transition ' +
                    (selected === position.symbol
                      ? 'bg-emerald-400/10 border-emerald-400/25 text-emerald-300'
                      : 'bg-white/[.02] border-white/10 text-white/45 hover:text-white hover:bg-white/[.04]')
                  }
                >
                  {position.symbol}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-white/30 mt-3">
              {analyses.length} portfolio holdings supported · select a ticker to load its recent SEC events and historical price reactions.
            </div>
          </Panel>
          <EventImpactExplorer symbol={selectedAnalysis.symbol} />
        </div>
      )}

      {tab === 'network' && (
        <Panel title="Relationship network" subtitle="Live first-order peer relationships from the portfolio universe — select a holding to inspect its connected names">
        {selectedAnalysis ? (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4">
                <div className="text-[8px] font-mono uppercase tracking-widest text-emerald-300">Selected holding</div>
                <div className="text-2xl font-black mt-2">{selectedAnalysis.symbol}</div>
                <div className="text-[10px] text-white/40 mt-1">{selectedAnalysis.name} · {selectedAnalysis.group}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Info label="Daily move" value={selectedAnalysis.dailyChangePct == null ? '—' : (selectedAnalysis.dailyChangePct >= 0 ? '+' : '') + selectedAnalysis.dailyChangePct.toFixed(2) + '%'} />
                  <Info label="Peer average" value={selectedAnalysis.peerAverageChange == null ? '—' : (selectedAnalysis.peerAverageChange >= 0 ? '+' : '') + selectedAnalysis.peerAverageChange.toFixed(2) + '%'} />
                </div>
              </div>

              <div className="hidden lg:flex items-center justify-center text-white/15">
                <Network className="w-7 h-7" />
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[.02] p-4">
                <div className="text-[8px] font-mono uppercase tracking-widest text-white/30">Dynamic peer universe</div>
                <div className="text-[8px] text-white/25 mt-1">Primary + core + extended peers selected from the full configured universe using transparent comparability signals.</div>
                <div className="mt-3 space-y-2">
                  {selectedPeerSet.primary && (() => {
                    const peerSymbol = selectedPeerSet.primary.symbol;
                    const peer = analyses.find(item => item.symbol === peerSymbol);
                    const peerQuote = livePrices[peerSymbol];
                    const selectedMove = selectedAnalysis.dailyChangePct;
                    const peerMove = peerQuote?.changePct ?? peer?.dailyChangePct ?? null;
                    const spread = selectedMove != null && peerMove != null ? selectedMove - peerMove : null;
                    return <button type="button" onClick={() => setSelected(peerSymbol)} className="w-full rounded-lg border border-violet-400/20 bg-violet-400/[.04] p-3 text-left hover:bg-white/[.04] transition">
                      <div className="flex items-center justify-between gap-3"><div><div className="text-[8px] font-mono uppercase text-violet-300">Primary peer</div><div className="text-xs font-black text-white mt-1">{peerSymbol}</div><div className="text-[8px] text-white/25 mt-1">{selectedPeerSet.primary.reasons.join(' · ')}</div></div><div className="text-right"><div className="text-[10px] font-mono font-bold">{peerMove == null ? 'quote —' : (peerMove >= 0 ? '+' : '') + peerMove.toFixed(2) + '%'}</div><div className="text-[8px] font-mono mt-1">{spread == null ? 'spread —' : 'vs selected ' + (spread >= 0 ? '+' : '') + spread.toFixed(2) + ' pts'}</div></div></div>
                    </button>;
                  })()}
                  {selectedPeerSet.core.map(peerCandidate => {
                    const peerSymbol = peerCandidate.symbol;
                    const peer = analyses.find(item => item.symbol === peerSymbol);
                    const peerQuote = livePrices[peerSymbol];
                    const peerMove = peerQuote?.changePct ?? peer?.dailyChangePct ?? null;
                    return <button key={peerSymbol} type="button" onClick={() => setSelected(peerSymbol)} className="w-full rounded-lg border border-white/5 bg-black/10 p-2.5 text-left hover:bg-white/[.04] transition">
                      <div className="flex items-center justify-between gap-2"><div><div className="text-[10px] font-black text-white">{peerSymbol}</div><div className="text-[8px] text-white/25">{peerCandidate.reasons.join(' · ')}</div></div><div className="text-[8px] font-mono text-white/40">{peerMove == null ? '—' : (peerMove >= 0 ? '+' : '') + peerMove.toFixed(2) + '%'}</div></div>
                    </button>;
                  })}
                  <div className="text-[8px] font-mono uppercase tracking-widest text-white/20 pt-1">Extended peers · {selectedPeerSet.extended.length}</div>
                  <div className="flex flex-wrap gap-1.5">{selectedPeerSet.extended.map(peer => <button key={peer.symbol} type="button" onClick={() => setSelected(peer.symbol)} className="rounded-md border border-white/5 px-2 py-1 text-[8px] font-mono text-white/45 hover:text-white">{peer.symbol}</button>)}</div>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
              <Insight title="Dynamic peer selection" body={(selectedPeerSet.primary ? 'Primary: ' + selectedPeerSet.primary.symbol + '. ' : 'No primary peer. ') + selectedPeerSet.core.length + ' core and ' + selectedPeerSet.extended.length + ' extended peers selected from the universe.'} icon={<Network/>}/>
              <Insight title="Relative movement" body="Peer spread is the selected holding's daily percentage move minus the connected peer's current daily move." icon={<Activity/>}/>
              <Insight title="Transmission context" body={selectedAnalysis.theme + ' → peer response → group breadth / relative strength. This is a monitoring relationship, not a causal claim.'} icon={<FileText/>}/>
            </div>
          </>
        ) : (
          <div className="text-[10px] font-mono text-white/30">Select a holding to inspect its peer relationships.</div>
        )}
        </Panel>
      )}

      <div className="text-[10px] text-white/30 flex items-center gap-2"><Globe2 className="w-3 h-3"/> Position states are model outputs for review, not automatic trade instructions.</div>
    </div>
  );
}

function rotationDirectionColor(direction: 'strengthening' | 'weakening' | 'mixed' | 'insufficient') {
  return direction === 'strengthening' ? '#34d399' : direction === 'weakening' ? '#fb7185' : direction === 'mixed' ? '#fbbf24' : '#64748b';
}
function rotationDirectionClass(direction: 'strengthening' | 'weakening' | 'mixed' | 'insufficient') {
  if (direction === 'strengthening') return { card: 'border-emerald-400/15 bg-emerald-400/[.035]', pill: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300', text: 'text-emerald-300' };
  if (direction === 'weakening') return { card: 'border-rose-400/15 bg-rose-400/[.035]', pill: 'border-rose-400/20 bg-rose-400/10 text-rose-300', text: 'text-rose-300' };
  if (direction === 'mixed') return { card: 'border-amber-400/15 bg-amber-400/[.035]', pill: 'border-amber-400/20 bg-amber-400/10 text-amber-300', text: 'text-amber-300' };
  return { card: 'border-white/8 bg-white/[.02]', pill: 'border-white/10 bg-white/5 text-white/45', text: 'text-white/50' };
}
function rotationReturnClass(value: number | null) {
  return value == null ? 'text-white/35' : value >= 0 ? 'text-emerald-300' : 'text-rose-300';
}

function benchmarkResultLabel(relative: number | null, benchmark: string) {
  if (relative == null || !Number.isFinite(relative)) return 'Comparison unavailable';
  const amount = Math.abs(relative).toFixed(2);
  return relative > 0
    ? 'Outperformed ' + benchmark + ' by ' + amount + ' pts'
    : relative < 0
      ? 'Underperformed ' + benchmark + ' by ' + amount + ' pts'
      : 'Matched ' + benchmark;
}
function MiniMetric({label,value,valueClass='text-white/75'}:{label:string;value:string;valueClass?:string}) {
  return <div className="rounded-lg border border-white/5 bg-black/10 px-2 py-1.5">
    <div className="text-[8px] font-mono uppercase tracking-wider text-white/25">{label}</div>
    <div className={'text-[10px] font-mono font-bold mt-0.5 ' + valueClass}>{value}</div>
  </div>;
}

function PositionRow({h,selected,onSelect}:{h:PositionAnalysis;selected:boolean;onSelect:()=>void;key?: string}) {
  const pnlClass = h.livePrice == null ? 'text-white/35' : h.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300';
  const dailyClass = h.dailyChangePct == null ? 'text-white/35' : h.dailyChangePct >= 0 ? 'text-emerald-300' : 'text-rose-300';
  const value = h.currentValue ?? h.investedValue;
  const weight = (h.portfolioWeight || 0) * 100;
  return <button type="button" onClick={onSelect} aria-pressed={selected} className={'group w-full text-left border rounded-xl p-3 transition focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/50 ' + (selected ? 'border-cyan-300/30 bg-cyan-300/[.05] shadow-[inset_3px_0_0_rgba(103,232,249,.85)]' : 'border-white/5 bg-white/[.02] hover:border-white/10 hover:bg-white/[.035]')}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-black text-sm tracking-tight">{h.symbol}</span>
          <StatePill state={h.state}/>
          {selected && <span className="px-1.5 py-0.5 rounded border border-cyan-300/20 bg-cyan-300/10 text-cyan-200 text-[8px] font-mono uppercase">Selected</span>}
          {h.minorPosition && <span className="px-1.5 py-0.5 rounded border border-white/10 bg-white/5 text-white/45 text-[8px] font-mono">Minor · {weight.toFixed(1)}%</span>}
        </div>
        <div className="text-[10px] text-white/45 truncate mt-1">{h.name}</div>
        <div className="text-[9px] font-mono uppercase tracking-wider text-white/25 mt-1">{h.group}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-black text-base">{h.livePrice != null ? '$' + h.livePrice.toFixed(2) : '—'}</div>
        <div className={'text-[10px] font-mono font-bold ' + dailyClass}>{h.dailyChangePct == null ? 'quote pending' : (h.dailyChangePct >= 0 ? '+' : '') + h.dailyChangePct.toFixed(2) + '% today'}</div>
        <div className={'text-[8px] font-mono mt-1 ' + (h.livePrice != null && !h.liveStale ? 'text-emerald-300/70' : 'text-amber-300/70')}>{h.livePrice != null ? (h.liveStale ? 'STALE QUOTE' : 'FRESH QUOTE') : 'QUOTE UNAVAILABLE'}</div>
      </div>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-3 pt-3 border-t border-white/5">
      <MiniMetric label="Qty" value={h.quantity.toFixed(4)} />
      <MiniMetric label="Avg cost" value={'$' + h.averageCost.toFixed(2)} />
      <MiniMetric label="P&L" value={h.livePrice == null ? '—' : (h.pnlPct >= 0 ? '+' : '') + h.pnlPct.toFixed(2) + '%'} valueClass={pnlClass} />
      <MiniMetric label="Value" value={'$' + value.toFixed(2)} valueClass="text-white/85" />
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-[8px] font-mono text-white/25">
      <span>Portfolio weight {weight.toFixed(1)}%</span>
      <span>{h.purchaseDate ? 'Bought ' + h.purchaseDate : 'Purchase date not set'}</span>
    </div>
  </button>;
}



function AnalystExpectationsPanel({ symbol, currentPrice }: { symbol: string; currentPrice: number | null }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch("/api/company-scale?action=analyst&symbol=" + encodeURIComponent(symbol), { cache: "no-store" })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || "Analyst expectations unavailable");
        return body;
      })
      .then(body => { if (!cancelled) setData(body); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Analyst expectations unavailable"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol]);

  const recommendation = data?.recommendation || {};
  const target = data?.priceTarget || {};
  const median = Number.isFinite(Number(target.median)) && Number(target.median) > 0 ? Number(target.median) : null;
  const mean = Number.isFinite(Number(target.mean)) && Number(target.mean) > 0 ? Number(target.mean) : null;
  const low = Number.isFinite(Number(target.low)) && Number(target.low) > 0 ? Number(target.low) : null;
  const high = Number.isFinite(Number(target.high)) && Number(target.high) > 0 ? Number(target.high) : null;
  const consensus = normalizeAnalystConsensus({ recommendation, priceTarget: target, currentPrice, retrievedAt: data?.retrievedAt ?? null, source: data?.source ?? null, analystCount: data?.analystCount ?? null });
  const targetMove = consensus.target.medianUpsidePct;
  const ratingCount = consensus.analystCount;
  const freshness = analystFreshness(consensus.retrievedAt);
  const eps = Array.isArray(data?.epsEstimates) ? data.epsEstimates[0] : null;
  const revenue = Array.isArray(data?.revenueEstimates) ? data.revenueEstimates[0] : null;

  return (
    <section data-testid="analyst-expectations" className="mt-4 rounded-xl border border-violet-400/15 bg-violet-400/[0.025] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-violet-300">External analyst expectations</div>
          <div className="text-sm font-black text-white mt-1">Street estimates · separate from Forecast Track</div>
          <div className="text-[9px] font-mono text-white/30 mt-1">External consensus and estimate data; not an AI Infra Watch forecast.</div>
        </div>
        <div className="text-[8px] font-mono uppercase text-white/25">{loading ? "Loading" : !error && data && ratingCount > 0 && median == null ? "PARTIAL" : data?.source || "Finnhub"}</div>
      </div>

      {error && <div className="mt-3 rounded-lg border border-amber-400/15 bg-amber-400/[.03] px-3 py-2 text-[9px] font-mono text-amber-200/70">{error}</div>}
      {!error && loading && <div className="mt-3 text-[9px] font-mono text-white/30">Loading analyst expectations…</div>}

      {!error && !loading && data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
            <Info label="Strong buy" value={String(recommendation.strongBuy ?? 0) + (ratingCount ? ' · ' + consensus.percentages.strongBuy.toFixed(0) + '%' : '')} />
            <Info label="Buy" value={String(recommendation.buy ?? 0) + (ratingCount ? ' · ' + consensus.percentages.buy.toFixed(0) + '%' : '')} />
            <Info label="Hold" value={String(recommendation.hold ?? 0) + (ratingCount ? ' · ' + consensus.percentages.hold.toFixed(0) + '%' : '')} />
            <Info label="Sell" value={String(recommendation.sell ?? 0) + (ratingCount ? ' · ' + consensus.percentages.sell.toFixed(0) + '%' : '')} />
            <Info label="Strong sell" value={String(recommendation.strongSell ?? 0) + (ratingCount ? ' · ' + consensus.percentages.strongSell.toFixed(0) + '%' : '')} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
            <Info label="Median target" value={median == null ? "Not available" : "$" + median.toFixed(2)} />
            <Info label="Mean target" value={mean == null ? "Not available" : "$" + mean.toFixed(2)} />
            <Info label="Target low" value={low == null ? "Not available" : "$" + low.toFixed(2)} />
            <Info label="Target high" value={high == null ? "Not available" : "$" + high.toFixed(2)} />
            <Info label="Vs current" value={targetMove == null ? "—" : (targetMove >= 0 ? "+" : "") + targetMove.toFixed(1) + "%"} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
            <Info label="Analyst count" value={String(ratingCount)} />
            <Info label="EPS estimate" value={eps?.average == null ? "—" : Number(eps.average).toFixed(2)} />
            <Info label="Revenue estimate" value={revenue?.average == null ? "—" : "$" + (Number(revenue.average) / 1e9).toFixed(1) + "B"} />
          </div>
          <div className="mt-3 rounded-lg border border-white/5 bg-black/10 p-3">
            <div className="text-[8px] font-mono uppercase tracking-widest text-white/25">Web analyst evidence</div>
            <div className="text-[9px] text-white/30 mt-1">Independent web-search results are source links only; they are not converted into consensus numbers here.</div>
            <div className="mt-2 space-y-1.5">
              {(data.webEvidence?.results || []).slice(0, 4).map((item: any) => (
                <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="block text-[9px] leading-4 text-cyan-300 hover:text-cyan-200">
                  {item.title || item.url}
                </a>
              ))}
              {!data.webEvidence?.results?.length && <span className="text-[8px] font-mono text-white/20">No web analyst results returned.</span>}
            </div>
            {data.webEvidence?.error && <div className="mt-2 text-[8px] font-mono text-amber-200/50">{data.webEvidence.error}</div>}
          </div>
          <div className="mt-3 text-[8px] font-mono text-white/20">
            {data.retrievedAt ? "Retrieved " + new Date(data.retrievedAt).toLocaleString() + " · " + freshness : "Retrieved time unavailable"}
            {target.lastUpdated ? " · Targets " + target.lastUpdated : ""}
            {eps?.period ? " · EPS " + eps.period : ""}
            {revenue?.period ? " · Revenue " + revenue.period : ""}
            {data.errors?.length ? " · Some analyst endpoints unavailable" : ""}
          </div>
        </>
      )}
    </section>
  );
}
function PortfolioEvidenceCoverage({
  analyses,
  contracts,
  congressTrades,
  macroRisks,
  news,
  analystConsensus,
  analystLoading,
  analystError,
  selectedSymbol,
}: {
  analyses: PositionAnalysis[];
  contracts: any[];
  congressTrades: any[];
  macroRisks: any[];
  news: any[];
  analystConsensus: any;
  analystLoading: boolean;
  analystError: string;
  selectedSymbol: string | null;
}) {
  const held = new Set(analyses.map(item => item.symbol));
  const secCount = contracts.filter(item => held.has(String(item?.company || item?.stockSymbol || '').toUpperCase())).length;
  const congressCount = congressTrades.filter(item => held.has(String(item?.stockSymbol || item?.symbol || '').toUpperCase())).length;
  const analystEvidenceCount = Array.isArray(analystConsensus?.webEvidence?.results)
    ? analystConsensus.webEvidence.results.length
    : Number(analystConsensus?.webEvidenceCount || 0);
  const analystCount = Number(analystConsensus?.analystCount || 0);
  const medianTarget = Number.isFinite(Number(analystConsensus?.priceTarget?.targetMedian)) && Number(analystConsensus.priceTarget.targetMedian) > 0
    ? Number(analystConsensus.priceTarget.targetMedian)
    : Number.isFinite(Number(analystConsensus?.priceTarget?.median)) && Number(analystConsensus.priceTarget.median) > 0
      ? Number(analystConsensus.priceTarget.median)
      : null;
  const analystStatus = analystLoading
    ? 'loading'
    : analystError
      ? 'failed'
      : analystConsensus
        ? ((analystConsensus.consensusAvailable || analystEvidenceCount > 0)
          ? (analystCount > 0 && medianTarget == null ? 'partial' : 'available')
          : 'empty')
        : 'missing';
  const channels = [
    { label: 'Quotes', value: analyses.filter(item => item.livePrice != null).length, total: analyses.length },
    { label: 'Group', value: analyses.filter(item => item.groupScore != null).length, total: analyses.length },
    { label: 'Peers', value: analyses.filter(item => item.vsPeers != null).length, total: analyses.length },
    { label: 'SEC / events', value: secCount, total: null },
    { label: 'Congress', value: congressCount, total: null },
    { label: 'News', value: news.length, total: null },
    { label: 'Macro', value: macroRisks.length, total: null },
    { label: 'Analysts', value: analystStatus === 'available' || analystStatus === 'partial' ? 1 : 0, total: null },
  ];
  const available = channels.filter(item => item.value > 0).length;
  const status = available >= 5 ? 'SUFFICIENT COVERAGE' : available >= 3 ? 'PARTIAL COVERAGE' : 'INSUFFICIENT COVERAGE';
  const analystFresh = analystConsensus ? analystFreshness(analystConsensus.retrievedAt || null) : 'unknown';
  return <section className="rounded-2xl border border-white/10 bg-[#15181E]/60 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-[9px] font-mono uppercase tracking-[.2em] text-cyan-300">Evidence coverage</div>
        <h2 className="text-base font-black mt-1">{status}</h2>
        <div className="text-[9px] text-white/35 mt-1">Coverage describes retrieved evidence availability; it is not a confidence, quality, or recommendation score.</div>
      </div>
      <div className="text-[8px] font-mono text-white/25">{available}/{channels.length} channels available</div>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 mt-3">
      {channels.map(channel => <div key={channel.label} className={'rounded-lg border p-2 ' + (channel.value > 0 ? 'border-emerald-400/15 bg-emerald-400/[.03]' : 'border-amber-400/15 bg-amber-400/[.02]')}>
        <div className="text-[8px] font-mono uppercase tracking-wider text-white/45">{channel.label}</div>
        <div className="text-[10px] font-mono font-bold mt-1">{channel.value > 0 ? 'AVAILABLE' : 'MISSING'}</div>
        {channel.total != null && <div className="text-[8px] font-mono text-white/25 mt-1">{channel.value}/{channel.total}</div>}
      </div>)}
    </div>
    <div className="mt-3 rounded-xl border border-violet-400/10 bg-violet-400/[.025] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[8px] font-mono uppercase tracking-widest text-violet-300">Analyst evidence · selected holding</div>
          <div className="text-[9px] text-white/30 mt-1">{selectedSymbol || 'No held holding selected'} · external consensus is separate from the AI Infra Watch forecast.</div>
        </div>
        <div className="text-[8px] font-mono uppercase text-white/35">{analystStatus === 'partial' ? 'PARTIAL' : analystStatus}</div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
        <Info label="Analyst count" value={analystCount > 0 ? String(analystCount) : '—'} />
        <Info label="Median target" value={medianTarget != null ? medianTarget.toFixed(2) : 'Not available'} />
        <Info label="Web evidence" value={analystEvidenceCount > 0 ? String(analystEvidenceCount) : '—'} />
        <Info label="Freshness" value={analystFresh} />
        <Info label="Retrieved" value={analystConsensus?.retrievedAt ? new Date(analystConsensus.retrievedAt).toLocaleString() : '—'} />
      </div>
      {analystConsensus?.source && <div className="mt-2 text-[8px] font-mono text-white/25">Source: {analystConsensus.source}</div>}
      {analystError && <div className="mt-2 text-[8px] font-mono text-amber-200/60">Retrieval error: {analystError}</div>}
      {!analystLoading && !analystError && analystStatus !== 'available' && <div className="mt-2 text-[8px] font-mono text-amber-200/60">No usable analyst evidence was retrieved for this selected holding.</div>}
    </div>
  </section>;
}
function DecisionGateSummary({h}:{h:PositionAnalysis}) {
  const leveraged = h.symbol === 'SOXL';
  const groupThreshold = leveraged ? 68 : 62;
  const breadthThreshold = leveraged ? 0.67 : 0.50;
  const gates = [
    ['Below average cost', h.livePrice != null && !h.liveStale && h.livePrice < h.averageCost],
    ['Group score', h.groupScore != null && h.groupScore >= groupThreshold],
    ['Group participation', h.groupBreadth != null && h.groupBreadth >= breadthThreshold],
    ['Group vs universe', h.relativeToUniverse != null && h.relativeToUniverse >= 0],
    ['Peer relative', h.vsPeers != null && h.vsPeers >= 0],
  ] as const;
  return <section className="rounded-2xl border border-white/10 bg-[#15181E]/55 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-[9px] font-mono uppercase tracking-[.2em] text-emerald-300">Decision gates</div><h2 className="text-base font-black mt-1">Current evidence gate for {h.symbol}</h2></div><StatePill state={h.state}/></div>
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
      {gates.map(([label,passed]) => <div key={label} className={'rounded-lg border p-2 ' + (passed ? 'border-emerald-400/15 bg-emerald-400/[.03]' : 'border-amber-400/15 bg-amber-400/[.02]')}><div className="flex items-center justify-between gap-2"><span className="text-[8px] font-mono uppercase text-white/45">{label}</span><span className={'text-[8px] font-mono font-bold ' + (passed ? 'text-emerald-300' : 'text-amber-300')}>{passed ? 'PASS' : 'WAIT'}</span></div></div>)}
    </div>
  </section>;
}

function PortfolioPeerImpactSummary({comparisons}:{comparisons:Array<PeerCounterfactual & { holdingSymbol?: string }>}) {
  const available = comparisons.filter(item => item.status === 'available' && item.hypotheticalProfit != null && item.actualProfit != null);
  const actualProfit = available.reduce((sum, item) => sum + (item.actualProfit ?? 0), 0);
  const peerProfit = available.reduce((sum, item) => sum + (item.hypotheticalProfit ?? 0), 0);
  const difference = peerProfit - actualProfit;
  const totalBasis = available.reduce((sum, item) => sum + (Number.isFinite(item.actualCostBasis) ? Math.abs(Number(item.actualCostBasis)) : 0), 0);
  const aggregateReturnGap = totalBasis > 0 ? (difference / totalBasis) * 100 : null;
  const coverage = comparisons.length ? Math.round((available.length / comparisons.length) * 100) : 0;
  const contributors = [...available]
    .filter(item => item.difference != null)
    .sort((a, b) => Math.abs(b.difference ?? 0) - Math.abs(a.difference ?? 0))
    .slice(0, 5);
  return <section className="rounded-2xl border border-white/10 bg-[#15181E]/60 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[9px] font-mono uppercase tracking-[.2em] text-white/40">Portfolio peer impact</div><h2 className="text-base font-black mt-1">Actual portfolio vs peer opportunity-cost scenario</h2><div className="text-[9px] text-white/35 mt-1">Uses your broker transaction history and purchase dates where available. The peer scenario mirrors the same cash-flow pattern using the peer's historical prices. Historical comparison only.</div></div><div className="text-[8px] font-mono text-white/25">{available.length}/{comparisons.length} holdings covered</div></div>
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3"><Info label="Actual total profit" value={available.length ? actualProfit.toFixed(2) : '—'}/><Info label="Closest-peer scenario profit" value={available.length ? peerProfit.toFixed(2) : '—'}/><Info label="Difference" value={available.length ? (difference >= 0 ? '+' : '') + difference.toFixed(2) : '—'}/><Info label="Return gap" value={aggregateReturnGap == null ? '—' : (aggregateReturnGap >= 0 ? '+' : '') + aggregateReturnGap.toFixed(2) + ' pts'}/><Info label="Coverage" value={comparisons.length ? coverage + '%' : '—'}/></div>
    {contributors.length > 0 && <div className="mt-3 border-t border-white/5 pt-3"><div className="text-[9px] font-mono uppercase text-white/35">Largest contributors to the difference</div><div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">{contributors.map(item => <div key={(item.holdingSymbol || '—') + ':' + (item.peer?.symbol || '—')} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 px-3 py-2"><div><div className="text-[10px] font-bold">{item.holdingSymbol || 'Holding'} → {item.peer?.symbol || 'Peer'}</div><div className="text-[8px] text-white/30">Historical opportunity-cost comparison · not a forecast</div></div><div className={'text-[10px] font-mono font-bold ' + ((item.difference ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{(item.difference ?? 0) >= 0 ? '+' : ''}{(item.difference ?? 0).toFixed(2)}</div></div>)}</div></div>}
  </section>;
}

function SelectedHoldingChart({h, chart, chartRange, onChartRangeChange}:{h:PositionAnalysis;chart:SelectedChartState;chartRange:SelectedChartState['range'];onChartRangeChange:(range:SelectedChartState['range'])=>void}) {
  const priceText = h.livePrice == null ? '—' : h.livePrice.toFixed(2);
  return <section className="rounded-2xl border border-cyan-400/15 bg-[#15181E]/70 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="text-[9px] font-mono uppercase tracking-[.2em] text-cyan-300">Selected holding / live market view</div><div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1"><h2 className="text-xl font-black">{h.symbol}</h2><span className="text-[10px] text-white/40">{h.name}</span><span className="font-mono font-bold">{priceText}</span><span className={(h.dailyChangePct ?? 0) >= 0 ? 'text-[10px] font-mono text-emerald-300' : 'text-[10px] font-mono text-rose-300'}>{h.dailyChangePct == null ? 'quote pending' : (h.dailyChangePct >= 0 ? '+' : '') + h.dailyChangePct.toFixed(2) + '% today'}</span></div></div>
      <div className="text-right text-[8px] font-mono text-white/30">{h.liveStale ? 'STALE QUOTE' : 'LIVE QUOTE'} · {h.liveRetrievedAt ? new Date(h.liveRetrievedAt).toLocaleTimeString() : 'timestamp unavailable'}</div>
    </div>
    <div className="flex flex-wrap gap-1 mt-3">{(['5D','1M','3M','6M','1Y','MAX'] as const).map(range => <button type="button" key={range} onClick={() => onChartRangeChange(range)} aria-pressed={chartRange === range} className={chartRange === range ? 'px-2.5 py-1.5 rounded-lg border text-[9px] font-mono border-cyan-300/30 bg-cyan-300/10 text-cyan-200' : 'px-2.5 py-1.5 rounded-lg border text-[9px] font-mono border-white/10 text-white/45 hover:text-white'}>{range}</button>)}</div>
    <div className="h-64 mt-3">{chart.loading ? <div className="h-full flex items-center justify-center text-[9px] font-mono text-white/30">Loading price history…</div> : chart.error ? <div className="h-full flex items-center justify-center text-[9px] font-mono text-amber-300/70">{chart.error}</div> : chart.points.length > 1 ? <ResponsiveContainer width="100%" height="100%"><LineChart data={chart.points}><CartesianGrid strokeDasharray="3 3" strokeOpacity={0.06}/><XAxis dataKey="date" tick={{fontSize:9}} tickLine={false} axisLine={false} minTickGap={28}/><YAxis domain={['auto','auto']} tick={{fontSize:9}} tickLine={false} axisLine={false} width={48}/><Tooltip contentStyle={{background:'#15181E',border:'1px solid rgba(255,255,255,.1)',fontSize:10}} formatter={(value:number)=>[Number(value).toFixed(2),'Price']}/><Line type="monotone" dataKey="price" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer> : <div className="h-full flex items-center justify-center text-[9px] font-mono text-white/30">No sufficient historical price data for this range.</div>}</div>
    <div className="mt-2 flex flex-wrap justify-between gap-2 text-[8px] font-mono text-white/25"><span>{chart.points.length ? chart.points[0].date + ' → ' + chart.points.at(-1)?.date : 'No chart dates'}</span><span>{chart.retrievedAt ? 'History retrieved ' + new Date(chart.retrievedAt).toLocaleTimeString() : 'History timestamp unavailable'}</span></div>
  </section>;
}

function PeerCounterfactualPanel({h,comparison,loading}:{h:PositionAnalysis;comparison:PeerCounterfactual|null;loading:boolean}) {
  return <section className="rounded-2xl border border-violet-400/15 bg-[#15181E]/60 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[9px] font-mono uppercase tracking-[.2em] text-violet-300">Peer opportunity-cost comparison</div><h2 className="text-base font-black mt-1">{comparison?.peer?.symbol || (loading ? 'Finding most relevant peer…' : 'No configured peer')}</h2><div className="text-[9px] text-white/35 mt-1">{comparison?.peer?.reasons.join(' · ') || 'Shows what the closest configured peer would have done over the same historical window; use this as opportunity cost, not as a recommendation.'}</div></div><div className="text-[8px] font-mono text-white/25">Historical opportunity-cost comparison · not a forecast</div></div>
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3"><Info label={comparison?.basis === 'broker-transactions' ? 'Your total return' : 'Your return'} value={comparison?.actualReturnPct == null ? (h.livePrice == null ? '—' : (h.pnlPct >= 0 ? '+' : '') + h.pnlPct.toFixed(2) + '%') : (comparison.actualReturnPct >= 0 ? '+' : '') + comparison.actualReturnPct.toFixed(2) + '%'}/><Info label="Peer scenario return" value={comparison?.hypotheticalReturnPct == null ? '—' : (comparison.hypotheticalReturnPct >= 0 ? '+' : '') + comparison.hypotheticalReturnPct.toFixed(2) + '%'}/><Info label="Return gap" value={comparison?.differencePctPoints == null ? '—' : (comparison.differencePctPoints >= 0 ? '+' : '') + comparison.differencePctPoints.toFixed(2) + ' pts'}/><Info label="Your value now" value={h.currentValue == null ? '—' : h.currentValue.toFixed(2)}/><Info label={comparison?.basis === 'broker-transactions' ? 'Peer scenario value if you made the same trades' : 'Peer scenario value'} value={comparison?.hypotheticalValue == null ? '—' : comparison.hypotheticalValue.toFixed(2)}/><Info label="Difference vs your holding" value={comparison?.difference == null ? '—' : comparison.difference.toFixed(2)}/></div>
    <div className="mt-2 text-[8px] font-mono text-white/25">{comparison?.basis === 'broker-transactions' ? 'Mirrors your broker buy/sell cash flows in the peer using each transaction date. This compares historical total-return outcomes, not a forecast.' : comparison?.peerEntryDate ? 'Same investment amount from ' + comparison.peerEntryDate + ' · ' + comparison.peer?.name : 'Peer purchase-date history is unavailable.'}</div>
  </section>;
}

function PositionDetail({h, historicalPrice}:{h:PositionAnalysis;historicalPrice:HistoricalPriceState}) {
  const [customTarget, setCustomTarget] = useState('');
  const canCalculateExitScenarios = h.livePrice != null && !h.liveStale;
  const isLeveraged = h.symbol === 'SOXL';
  const addGroupThreshold = isLeveraged ? 68 : 62;
  const addBreadthThreshold = isLeveraged ? 0.67 : 0.50;
  const scenarios = [
    canCalculateExitScenarios && h.livePrice != null ? { label: 'Current', price: h.livePrice } : null,
    { label: 'Break-even (average cost)', price: h.averageCost },
    canCalculateExitScenarios && h.livePrice != null ? { label: '+10% from current', price: h.livePrice * 1.10 } : null,
    canCalculateExitScenarios && h.livePrice != null ? { label: '+20% from current', price: h.livePrice * 1.20 } : null,
    historicalPrice.high52w != null ? { label: '52-week high', price: historicalPrice.high52w, date: historicalPrice.high52wDate } : null,
    historicalPrice.historicalHigh != null ? { label: 'Historical high (available)', price: historicalPrice.historicalHigh, date: historicalPrice.historicalHighDate } : null,
    Number(customTarget) > 0 ? { label: 'Custom target', price: Number(customTarget) } : null,
  ].filter(Boolean) as Array<{label:string;price:number;date?:string}>;
  const distanceTo52wHigh = canCalculateExitScenarios && h.livePrice != null && historicalPrice.high52w != null && h.livePrice > 0
    ? ((historicalPrice.high52w / h.livePrice) - 1) * 100
    : null;
  const distanceToHistoricalHigh = canCalculateExitScenarios && h.livePrice != null && historicalPrice.historicalHigh != null && h.livePrice > 0
    ? ((historicalPrice.historicalHigh / h.livePrice) - 1) * 100
    : null;
  const checks = [
    { label: 'Below average cost', passed: canCalculateExitScenarios && h.livePrice != null && h.livePrice < h.averageCost, detail: canCalculateExitScenarios && h.livePrice != null ? '$' + h.livePrice.toFixed(2) + ' vs $' + h.averageCost.toFixed(2) : 'Fresh quote required' },
    { label: 'Group strength', passed: h.groupScore != null && h.groupScore >= addGroupThreshold, detail: h.groupScore == null ? 'No group strength' : Math.round(h.groupScore) + '/100 · need ≥' + addGroupThreshold },
    { label: 'Group participation', passed: h.groupBreadth != null && h.groupBreadth >= addBreadthThreshold, detail: h.groupBreadth == null ? 'No group participation' : Math.round(h.groupBreadth * 100) + '% · need ≥' + Math.round(addBreadthThreshold * 100) + '%' },
    { label: 'Group vs all tracked', passed: h.relativeToUniverse != null && h.relativeToUniverse >= 0, detail: h.relativeToUniverse == null ? 'No comparison available' : (h.relativeToUniverse >= 0 ? '+' : '') + h.relativeToUniverse.toFixed(2) + ' pts' },
    { label: 'Vs tracked peers', passed: h.vsPeers != null && h.vsPeers >= 0, detail: h.vsPeers == null ? 'Peer quote required' : (h.vsPeers >= 0 ? '+' : '') + h.vsPeers.toFixed(2) + ' pts' },
  ];

  return <Panel title={h.symbol + ' decision context'} subtitle={h.name + ' · ' + h.group}>
    <div className="grid grid-cols-2 gap-2">
      <Info label="Invested" value={'$' + h.investedValue.toFixed(2)}/>
      <Info label="Current value" value={h.currentValue == null ? '—' : '$' + h.currentValue.toFixed(2)}/>
      <Info label="P&L" value={h.livePrice == null ? '—' : (h.pnl >= 0 ? '+' : '') + '$' + h.pnl.toFixed(2) + ' (' + h.pnlPct.toFixed(2) + '%)'}/>
      <Info label="Daily move" value={h.dailyChangePct == null ? '—' : (h.dailyChangePct >= 0 ? '+' : '') + h.dailyChangePct.toFixed(2) + '%'}/>
      <Info label="Group strength" value={h.groupScore == null ? '—' : Math.round(h.groupScore) + '/100'}/>
      <Info label="Group participation" value={h.groupBreadth == null ? '—' : Math.round(h.groupBreadth * 100) + '% up'}/>
      <Info label="Group vs universe" value={h.relativeToUniverse == null ? '—' : (h.relativeToUniverse >= 0 ? '+' : '') + h.relativeToUniverse.toFixed(2) + ' pts'}/>
      <Info label="Vs tracked peers" value={h.vsPeers == null ? '—' : (h.vsPeers >= 0 ? '+' : '') + h.vsPeers.toFixed(2) + ' pts'}/>
    </div>
    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
      <Info label="Holding since" value={h.purchaseDate || 'Not set'} />
      <Info label="First broker purchase" value={h.firstPurchaseDate || h.purchaseDate || 'Not set'} />
      <Info label="Holding period" value={h.holdingPeriodDays == null ? '—' : h.holdingPeriodDays + ' days'} />
      <Info label="Purchase lots" value={String(h.purchaseLotCount ?? 0)} />
      <Info label="Average cost" value={h.averageCost.toFixed(2)} />
      <Info label="Upside evidence" value={h.potentialUpsideSignal} />
      <Info label="Current vs average" value={canCalculateExitScenarios && h.livePrice != null ? (((h.livePrice / h.averageCost) - 1) * 100 >= 0 ? '+' : '') + (((h.livePrice / h.averageCost) - 1) * 100).toFixed(2) + '%' : '—'} />
      <Info label="Current allocation" value={h.portfolioWeight == null ? '—' : (h.portfolioWeight * 100).toFixed(1) + '%'} />
      <Info label="Target allocation" value={h.targetAllocationPct == null ? 'Not set' : h.targetAllocationPct.toFixed(1) + '%'} />
      <Info label="Max / reduce-review" value={h.maxAllocationPct == null ? 'Not set' : h.maxAllocationPct.toFixed(1) + '%'} />
    </div>
    <div className="mt-3 rounded-xl border border-amber-300/10 bg-amber-300/[0.025] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-amber-200/70">Decision rules</div>
          <div className="text-[10px] text-white/40 mt-1">Set your thesis, loss limit, exit rule and broker alert prices. These rules drive review signals and Smart Alerts; they do not place trades.</div>
        </div>
        <button type="button" onClick={() => { window.location.href = '/outlook?symbol=' + encodeURIComponent(h.symbol); }} className="shrink-0 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-[8px] font-mono uppercase tracking-widest text-amber-100 hover:bg-amber-300/15">
          Edit decision rules
        </button>
      </div>
    </div>
    {(h.targetAllocationPct != null || h.maxAllocationPct != null) && (
      <div className="mt-3 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.025] p-4">
        <div className="text-[9px] font-mono uppercase tracking-widest text-emerald-300">Allocation plan</div>
        <div className="text-[10px] text-white/35 mt-1">Target and maximum portfolio weights turn strong performance into a structured allocation review instead of an automatic buy or sell.</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
          <Info label="Current weight" value={h.portfolioWeight == null ? '—' : (h.portfolioWeight * 100).toFixed(1) + '%'} />
          <Info label="Target" value={h.targetAllocationPct == null ? '—' : h.targetAllocationPct.toFixed(1) + '%'} />
          <Info label="Max" value={h.maxAllocationPct == null ? '—' : h.maxAllocationPct.toFixed(1) + '%'} />
          <Info label="Drift" value={h.portfolioWeight == null || h.targetAllocationPct == null ? '—' : ((h.portfolioWeight * 100) - h.targetAllocationPct >= 0 ? '+' : '') + ((h.portfolioWeight * 100) - h.targetAllocationPct).toFixed(1) + ' pts'} />
        </div>
        <div className="mt-3 text-[10px] text-white/45">
          {h.maxAllocationPct != null && h.portfolioWeight != null && h.portfolioWeight * 100 >= h.maxAllocationPct
            ? '🔴 Above your maximum allocation — review reducing exposure.'
            : h.targetAllocationPct != null && h.portfolioWeight != null && h.portfolioWeight * 100 < h.targetAllocationPct && h.pnlPct > 0 && h.dailyChangePct != null && h.dailyChangePct > 0
              ? '🟢 Below target while the position is performing positively — review whether increasing toward target is justified by your thesis and evidence.'
              : h.targetAllocationPct != null && h.portfolioWeight != null && h.portfolioWeight * 100 < h.targetAllocationPct
                ? '🟡 Below target — review an increase only when your thesis and evidence support it.'
                : '🟢 Within your allocation plan — continue monitoring thesis, evidence and concentration.'}
        </div>
      </div>
    )}
    <AnalystExpectationsPanel symbol={h.symbol} currentPrice={h.livePrice} />
    <ForecastValidationPanel symbol={h.symbol} horizon={20} />
    <div className="mt-4 rounded-xl border border-cyan-400/10 bg-cyan-400/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-cyan-300">Exit / Profit Scenarios</div>
          <div className="text-base font-black mt-1">{h.symbol} · {h.name}</div>
          <div className="text-[10px] text-white/35 mt-1">Estimated proceeds and P&amp;L for the full position at each reference price. Historical levels are reference points, not forecasts.</div>
        </div>
        <div className="rounded-lg border border-cyan-400/15 bg-cyan-400/[.05] px-2.5 py-2 text-right">
          <div className="text-[8px] font-mono uppercase tracking-wider text-cyan-200/70">Stock symbol</div>
          <div className="text-sm font-black font-mono text-cyan-100">{h.symbol}</div>
          <div className="text-[8px] font-mono text-white/30">Qty {h.quantity.toFixed(4)}</div>
        </div>
      </div>
      {historicalPrice.loading && <div className="text-[10px] font-mono text-white/30 mt-3">Loading historical highs…</div>}
      {historicalPrice.error && <div className="text-[10px] font-mono text-amber-300/70 mt-3">Historical comparison unavailable: {historicalPrice.error}</div>}
      {scenarios.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <DataTable
        rows={scenarios}
        rowKey={(row) => row.label}
        empty="No exit scenarios available."
        initialSort={{ key: 'reference', direction: 'asc' }}
        columns={[
          { key: 'reference', header: 'Reference', accessor: row => row.label, render: row => <div><span className="text-white/60">{row.label}</span>{row.date ? <span className="block text-[8px] text-white/25 mt-0.5">{row.date}</span> : null}</div> },
          { key: 'price', header: 'Price', accessor: row => row.price, type: 'currency', render: row => '$' + row.price.toFixed(2) },
          { key: 'saleValue', header: 'Sale value', accessor: row => row.price * h.quantity, type: 'currency', render: row => '$' + (row.price * h.quantity).toFixed(2) },
          { key: 'profit', header: 'Profit / loss', accessor: row => row.price * h.quantity - h.investedValue, type: 'currency', render: row => { const v = row.price * h.quantity - h.investedValue; return <span className={v > 0 ? 'text-emerald-300 font-bold' : v < 0 ? 'text-rose-300 font-bold' : 'text-white/55'}>{(v >= 0 ? '+' : '') + '$' + v.toFixed(2)}</span>; } },
          { key: 'return', header: 'Return', accessor: row => h.investedValue ? ((row.price * h.quantity - h.investedValue) / h.investedValue) * 100 : 0, type: 'percent', render: row => { const v = h.investedValue ? ((row.price * h.quantity - h.investedValue) / h.investedValue) * 100 : 0; return <span className={v > 0 ? 'text-emerald-300 font-bold' : v < 0 ? 'text-rose-300 font-bold' : 'text-white/55'}>{(v >= 0 ? '+' : '') + v.toFixed(2) + '%'}</span>; } },
          { key: 'fromCurrent', header: 'From current', accessor: row => canCalculateExitScenarios && h.livePrice != null && h.livePrice > 0 ? ((row.price / h.livePrice) - 1) * 100 : null, type: 'percent', render: row => { const v = canCalculateExitScenarios && h.livePrice != null && h.livePrice > 0 ? ((row.price / h.livePrice) - 1) * 100 : null; return v == null ? '—' : <span className={v > 0 ? 'text-emerald-300 font-bold' : v < 0 ? 'text-rose-300 font-bold' : 'text-white/55'}>{(v >= 0 ? '+' : '') + v.toFixed(2) + '%'}</span>; } },
        ]}
      />
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Info label="52-week high distance" value={distanceTo52wHigh == null ? '—' : '+' + distanceTo52wHigh.toFixed(2) + '% from current'} />
        <Info label="Historical high distance" value={distanceToHistoricalHigh == null ? '—' : '+' + distanceToHistoricalHigh.toFixed(2) + '% from current'} />
      </div>
      <div className="mt-3 rounded-xl border border-white/5 bg-black/10 p-3">
        <div className="text-[9px] font-mono uppercase tracking-widest text-white/30">Custom target price</div>
        <div className="mt-2 flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            type="number"
            min="0"
            step="0.01"
            value={customTarget}
            onChange={e => setCustomTarget(e.target.value)}
            placeholder="Enter price"
            aria-label="Custom target price"
            className="w-full sm:w-44 rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-xs font-mono text-white outline-none focus:border-cyan-400/30"
          />
          <div className="text-[9px] text-white/30">Adds a hypothetical full-position sale row; it is not a forecast or trading instruction.</div>
        </div>
      </div>
    </div>
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[.02] p-4">
      <div className="flex items-center justify-between gap-2"><div className="text-[10px] font-mono uppercase text-white/35">Model state</div><StatePill state={h.state}/></div>
      <div className="text-sm mt-2">{h.rationale}</div>
    </div>
    <div className={'mt-3 rounded-xl border p-4 ' + (h.recoveryAlert ? 'border-emerald-300/25 bg-emerald-300/[.05]' : 'border-white/10 bg-white/[.02]')}>
      <div className={'text-[9px] font-mono uppercase tracking-widest ' + (h.recoveryAlert ? 'text-emerald-300' : 'text-white/35')}>{h.recoveryAlert ? 'Recovery watch · triggered' : 'Recovery watch · not triggered'}</div>
      <div className="text-sm mt-2">{h.recoveryAlert ? 'The holding is declining today while the evidence gates remain supportive.' : 'No recovery-watch alert is triggered for this holding under the current evidence gate.'}</div>
      <div className="text-[10px] text-white/40 mt-2">{h.recoveryAlert ? h.strategyContext : 'Requires a fresh declining quote, position below cost, and supportive group/peer evidence.'}</div>
    </div>
    <div className={'mt-3 rounded-xl border p-4 ' + (h.averageInAlert ? 'border-emerald-300/20 bg-emerald-300/[.04]' : 'border-white/10 bg-white/[.02]')}>
      <div className={'text-[9px] font-mono uppercase tracking-widest ' + (h.averageInAlert ? 'text-emerald-300' : 'text-white/35')}>{h.averageInAlert ? 'Average-in review · triggered' : 'Average-in review · not triggered'}</div>
      <div className="text-sm mt-2">{h.averageInAlert ? 'Price is below your average cost and every configured evidence gate is currently satisfied.' : 'No average-in review is triggered for this holding under the current evidence gate.'}</div>
      <div className="text-[10px] text-white/40 mt-2">{h.averageInAlert ? h.strategyContext : 'Use the gate breakdown below to see which conditions are currently preventing an average-in review.'}</div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
        {checks.map(check => <GateCheck key={check.label} label={check.label} passed={check.passed} detail={check.detail} />)}
      </div>
    </div>
    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
      <RuleCard title="Add review trigger" body={h.addTrigger} tone="up"/>
      <RuleCard title="Risk review trigger" body={h.riskTrigger} tone="down"/>
    </div>
    <div className="mt-3 bg-[#0F1115] border border-white/5 rounded-xl p-4">
      <div className="text-[9px] font-mono uppercase text-white/25">Transmission chain</div>
      <div className="text-sm mt-2 leading-6">{h.theme} → catalyst/news → revenue/capex/supply-chain effect → peer response → event persistence → portfolio rotation regime.</div>
      <div className="text-[10px] text-white/30 mt-2">Peers: {h.peers.join(' · ')} · Geo/risk lens: {h.geo}</div>
    </div>
  </Panel>;
}

function GateCheck({label,passed,detail}:{label:string;passed:boolean;detail:string;key?: string}) {
  return <div className="border border-white/5 rounded-xl p-3 bg-black/10">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-mono uppercase text-white/55">{label}</span>
      <span className={'text-[8px] font-mono font-bold uppercase ' + (passed ? 'text-emerald-300' : 'text-amber-300')}>{passed ? 'PASS' : 'WAIT'}</span>
    </div>
    <div className="text-[10px] text-white/35 mt-2">{detail}</div>
  </div>;
}
function RuleCard({title,body,tone}:{title:string;body:string;tone:'up'|'down'}) {
  return <div className="border border-white/5 rounded-xl p-3">
    <div className={'text-[10px] font-mono uppercase ' + (tone === 'up' ? 'text-emerald-400' : 'text-rose-400')}>{title}</div>
    <div className="text-[10px] text-white/40 mt-2 leading-5">{body}</div>
  </div>;
}

function StatePill({state}:{state:PositionAnalysis['state']}) {
  const cls = state === 'ADD REVIEW'
    ? 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20'
    : state === 'RISK REVIEW'
      ? 'bg-rose-400/10 text-rose-300 border-rose-400/20'
      : state === 'INSUFFICIENT DATA'
        ? 'bg-amber-400/10 text-amber-300 border-amber-400/20'
        : 'bg-white/5 text-white/55 border-white/10';
  return <span className={'inline-flex px-1.5 py-0.5 rounded border text-[8px] font-mono font-bold uppercase ' + cls}>{state}</span>;
}

function Panel({title,subtitle,children}:{title:string;subtitle:string;children:ReactNode}) {
  return <section className="bg-[#15181E] border border-white/10 rounded-2xl p-5">
    <div className="mb-4"><div className="text-sm font-bold">{title}</div><div className="text-[11px] text-white/40 mt-1">{subtitle}</div></div>
    {children}
  </section>;
}

function Info({label,value}:{label:string;value:string}) {
  const textValue = String(value);
  const upper = textValue.toUpperCase();
  const positive = upper === 'SUPPORTED' || upper === 'AVAILABLE' || upper === 'PASS' || upper.includes('FRESH') || /^\+/.test(textValue);
  const negative = upper === 'WEAK' || upper === 'FAILED' || upper.includes('ERROR') || upper.includes('STALE') || upper.includes('UNAVAILABLE') || /^[-−]/.test(textValue);
  const tone = positive ? 'text-emerald-300' : negative ? 'text-rose-300' : upper === 'MIXED' || upper === 'WAIT' || upper.includes('INSUFFICIENT') ? 'text-amber-300' : 'text-white';
  return <div className="bg-white/[.025] border border-white/5 rounded-xl p-3">
    <div className="text-[9px] uppercase font-mono text-white/25">{label}</div>
    <div className={'text-xs mt-1 font-medium ' + tone}>{value}</div>
  </div>;
}

function Metric({label,value,suffix,tone,icon}:{label:string;value:string;suffix:string;tone:'up'|'down'|'warn'|'neutral';icon?:ReactNode}) {
  const c = tone === 'up' ? 'text-emerald-400' : tone === 'down' ? 'text-rose-400' : tone === 'warn' ? 'text-amber-300' : 'text-white';
  return <div className="bg-white/[.025] border border-white/5 rounded-xl p-3">
    <div className="flex items-center justify-between text-[9px] uppercase font-mono text-white/30">{label}{icon && <span className={c}>{icon}</span>}</div>
    <div className={'text-lg font-black mt-2 ' + c}>{value}<span className="text-[10px] text-white/30 ml-1">{suffix}</span></div>
  </div>;
}

function Insight({title,body,icon}:{title:string;body:string;icon:ReactNode}) {
  return <div className="border border-white/5 rounded-xl p-3">
    <div className="flex items-center gap-2 text-xs font-bold">{icon}<span>{title}</span></div>
    <div className="text-[10px] text-white/35 mt-2">{body}</div>
  </div>;
}