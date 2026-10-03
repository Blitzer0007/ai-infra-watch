import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, BarChart3, FileText, Globe2, Network, Search, ShieldAlert, TrendingUp, WalletCards, Zap } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, LineChart, Line } from 'recharts';
import { buildIntelligence, buildMoneyRotation, type RotationHorizon } from '../utils/intelligence';
import { buildPositionAnalyses, mapStoredPortfolioHoldings, PORTFOLIO_AS_OF, PORTFOLIO_SNAPSHOT, type PositionAnalysis } from '../utils/portfolioPositions';
import { fetchPortfolioHoldings, type StoredPortfolioHolding } from '../utils/portfolioApi';
import PortfolioManager from './PortfolioManager';
import { STOCK_UNIVERSE } from '../utils/stockUniverse';
import EventImpactExplorer from './EventImpactExplorer';
import PortfolioSignalFusion from './PortfolioSignalFusion';
import UnifiedEventTimeline from './UnifiedEventTimeline';
import JevDecisionPanel from './JevDecisionPanel';
import { FilterInput, FilterSelect } from './FilterControls';
import { buildPortfolioDailySeries, calculatePortfolioAttribution, calculatePortfolioConcentration, calculatePortfolioStressScore, comparePortfolioToBenchmarks } from '../utils/measurement';
import SignalScorecardPanel from './SignalScorecardPanel';
import PortfolioResearchPanel from './PortfolioResearchPanel';
import { authFetch } from '../utils/apiAuth';
import { calculatePeerCounterfactual, selectMostRelevantPeer, selectDynamicPeers, type PeerCounterfactual } from '../utils/peerIntelligence';
import { analystFreshness, normalizeAnalystConsensus } from '../utils/analystConsensus';
type Price = {
  price: number;
  changePct: number;
  provider?: string;
  retrievedAt?: string;
  stale?: boolean;
  cached?: boolean;
};
type PortfolioTab = 'overview' | 'research' | 'watchlist' | 'events' | 'rotation' | 'network';
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

export default function PortfolioIntelligence({ livePrices = {}, contracts = [], congressTrades = [], macroRisks = [], news = [], politicalSignals = [] }: Props) {
  const [tab, setTab] = useState<PortfolioTab>(() => {
    const value = new URLSearchParams(window.location.search).get('portfolio_tab');
    return value === 'research' || value === 'watchlist' || value === 'events' || value === 'rotation' || value === 'network' ? value : 'overview';
  });
  const [q, setQ] = useState(() => new URLSearchParams(window.location.search).get('portfolio_q') || '');
  const [group, setGroup] = useState(() => new URLSearchParams(window.location.search).get('portfolio_group') || 'All');
  const [selected, setSelected] = useState(() => new URLSearchParams(window.location.search).get('portfolio_symbol') || 'NVDA');
  const [holdings, setHoldings] = useState<StoredPortfolioHolding[]>([]);
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
    fetchPortfolioHoldings()
      .then(rows => { if (!cancelled) { setHoldings(rows); setPortfolioError(''); } })
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
        });
      } catch {
        return calculatePeerCounterfactual({
          holding: analysis,
          peer,
          peerHistory: [],
          peerCurrentPrice: livePrices[peer.symbol]?.price ?? null,
          actualCurrentPrice: analysis.livePrice,
        });
      }
    });
    Promise.all(jobs).then(results => {
      if (!cancelled) setPeerPortfolioComparisons(results.filter((item): item is PeerCounterfactual => Boolean(item)));
    });
    return () => { cancelled = true; };
  }, [analyses.map(item => item.symbol + ':' + item.purchaseDate + ':' + item.investedValue).join('|'), livePrices]);

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
  }, [selectedAnalysis?.symbol, selectedAnalysis?.purchaseDate, selectedAnalysis?.investedValue, selectedAnalysis?.quantity, selectedAnalysis?.livePrice, livePrices]);

  const filtered: PositionAnalysis[] = useMemo(() => analyses.filter((h: PositionAnalysis) =>
    (group === 'All' || h.group === group) &&
    (h.symbol + ' ' + h.name + ' ' + h.theme).toLowerCase().includes(q.toLowerCase())
  ), [analyses, q, group]);

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
  const weightedStress = useMemo(() => calculatePortfolioStressScore(portfolioMetricInputs, macroRisks.filter(risk => String(risk?.impactRating).toLowerCase() === 'high').length, macroRisks.filter(risk => String(risk?.impactRating).toLowerCase() === 'medium').length), [portfolioMetricInputs, macroRisks]);
  const stress = weightedStress;
  const attribution = useMemo(() => calculatePortfolioAttribution(portfolioMetricInputs), [portfolioMetricInputs]);
  const portfolioWeights = useMemo(() => Object.fromEntries(concentration.weights.map(item => [item.symbol, item.weight])), [concentration.weights]);
  const portfolioHistoryValue = useMemo(() => buildPortfolioHistoryValue(
    portfolioHistory.histories,
    positions.map(item => ({ symbol: item.symbol, quantity: item.quantity, averageCost: item.averageCost })),
  ), [portfolioHistory.histories, positions]);
  const correlationSymbols = analyses.slice().sort((a, b) => (b.portfolioWeight ?? 0) - (a.portfolioWeight ?? 0)).slice(0, 8).map(item => item.symbol);
  const portfolioCorrelation = useMemo(() => calculatePortfolioCorrelation(portfolioHistory.histories, correlationSymbols), [portfolioHistory.histories, correlationSymbols.join(',')]);
  const stressTrend = useMemo(() => buildPortfolioDailySeries(Object.fromEntries(Object.entries(portfolioHistory.histories).filter(([symbol]) => !['SPY', 'QQQ', 'SOXX'].includes(symbol))) as Record<string, PortfolioHistoryPoint[]>, portfolioWeights, 30), [portfolioHistory.histories, portfolioWeights]);
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
        weightedStress: weightedStress.score,
        weightedStressLabel: weightedStress.label,
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
        <div className="flex flex-wrap gap-2 text-[10px] font-mono text-white/40">
          <span className="px-2 py-1 rounded-full border border-white/10">BREADTH {breadthPositive}/{breadthCoverage}</span>
          <span className="px-2 py-1 rounded-full border border-white/10">ADD REVIEWS {addReviews}</span>
          <span className="px-2 py-1 rounded-full border border-white/10">RISK REVIEWS {riskReviews}</span>
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
                Breadth + average daily move + macro risk load · {stressFreshCount}/{analyses.length} holdings with fresh quotes{stressStaleCount ? ' · ' + stressStaleCount + ' stale' : ''}
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
            <div className="text-[10px] font-mono font-bold text-white/70 mt-1">{stress.freshCount}/{analyses.length} fresh</div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#15181E]/50 p-4">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-3">
          <div><div className="text-[9px] font-mono uppercase tracking-[0.2em] text-cyan-300">Portfolio measurement layer</div><h2 className="text-lg font-black mt-1">Exposure, attribution & benchmark context</h2><p className="text-[10px] text-white/35 mt-1">Weights use current value when fresh; cost basis is used only when current value is unavailable. Benchmarks use overlapping market dates.</p></div>
          <div className="text-[9px] font-mono text-white/30">{portfolioHistory.loading ? 'LOADING 1Y HISTORY…' : portfolioHistory.error ? 'PARTIAL HISTORY' : 'HISTORY READY'}</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
          <Info label="Weighted stress" value={weightedStress.score + '/100'} />
          <Info label="Largest holding" value={topConcentration ? topConcentration.symbol + ' ' + (topConcentration.weight * 100).toFixed(1) + '%' : '—'} />
          <Info label="Top 3 concentration" value={top3ConcentrationPct.toFixed(1) + '%'} />
          <Info label="Effective holdings" value={concentration.effectiveHoldings == null ? '—' : concentration.effectiveHoldings.toFixed(1)} />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-3 mt-3">
          <div className="rounded-xl border border-white/5 bg-black/10 p-3"><div className="flex items-center justify-between"><div><div className="text-[8px] font-mono uppercase tracking-widest text-white/25">30-day constant-weight stress backcast</div><div className="text-[9px] text-white/30 mt-1">Observed market-move component using current portfolio weights across the historical window; current macro load is separate.</div></div><div className="text-right"><div className="text-sm font-black">{stressTrendLatest == null ? '—' : stressTrendLatest + '/100'}</div><div className="text-[8px] font-mono text-white/25">avg {stressTrendAverage == null ? '—' : stressTrendAverage.toFixed(1)}</div></div></div>
            <div className="h-36 mt-2">{stressTrend.length > 1 ? <ResponsiveContainer width="100%" height="100%"><LineChart data={stressTrend}><CartesianGrid strokeDasharray="3 3" strokeOpacity={0.08} /><XAxis dataKey="date" hide /><YAxis domain={[0, 100]} hide /><Tooltip contentStyle={{ background: '#15181E', border: '1px solid rgba(255,255,255,.1)', fontSize: 10 }} formatter={(value: number) => [value.toFixed(0), 'Stress']} /><Line type="monotone" dataKey="stressScore" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer> : <div className="h-full flex items-center justify-center text-[9px] font-mono text-white/25">Need overlapping historical prices to build the trend.</div>}</div>
          </div>
          <div className="rounded-xl border border-white/5 bg-black/10 p-3"><div className="text-[8px] font-mono uppercase tracking-widest text-white/25">Concentration by group</div><div className="space-y-2 mt-3">{groupConcentration.length ? groupConcentration.map(item => <div key={item.group}><div className="flex justify-between text-[9px] font-mono"><span className="text-white/60">{item.group}</span><span className="text-white/40">{(item.weight * 100).toFixed(1)}%</span></div><div className="h-1.5 rounded-full bg-white/5 mt-1 overflow-hidden"><div className="h-full bg-cyan-300/60" style={{ width: Math.min(100, item.weight * 100) + '%' }} /></div></div>) : <div className="text-[9px] font-mono text-white/25">No valued holdings available.</div>}</div></div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_1fr] gap-3 mt-3">
          <div className="rounded-xl border border-white/5 bg-black/10 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[8px] font-mono uppercase tracking-widest text-white/25">Portfolio history</div>
                <div className="text-[9px] text-white/30 mt-1">Historical portfolio value using current recorded quantities against available market history. Transactions are not reconstructed.</div>
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
            <div className="text-[8px] font-mono text-white/20 mt-1">Indexed to 100 at the first common available date; this is a historical reconstruction, not a forecast.</div>
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
        <div className="rounded-xl border border-white/5 bg-black/10 p-3"><div className="text-[8px] font-mono uppercase tracking-widest text-white/25">P&L contribution by holding</div><div className="space-y-2 mt-3">{attribution.slice(0, 6).map(item => <div key={item.symbol} className="flex items-center gap-3"><span className="w-12 text-[9px] font-mono font-bold text-white/65">{item.symbol}</span><div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden"><div className={item.pnlContribution >= 0 ? 'h-full bg-emerald-400/60' : 'h-full bg-rose-400/60'} style={{ width: Math.min(100, Math.abs(item.pnlContribution) / Math.max(1, Math.abs(attribution[0]?.pnlContribution || 1)) * 100) + '%' }} /></div><span className={'w-24 text-right text-[9px] font-mono ' + (item.pnlContribution >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{item.pnlContribution >= 0 ? '+' : ''}${item.pnlContribution.toFixed(2)}</span></div>)}{!attribution.length && <div className="text-[9px] font-mono text-white/25">No P&L attribution available.</div>}</div></div>
          <div className="rounded-xl border border-white/5 bg-black/10 p-3"><div className="text-[8px] font-mono uppercase tracking-widest text-white/25">Matched benchmark window</div><div className="space-y-2 mt-3">{benchmarkComparisons.map(item => <div key={item.benchmark} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 px-3 py-2"><div><div className="text-[10px] font-black">{item.benchmark}</div><div className="text-[8px] font-mono text-white/25">{item.sampleDays ? item.startDate + ' → ' + item.endDate + ' · ' + item.sampleDays + ' sessions' : 'No overlapping history'}</div></div><div className="text-right"><div className="text-[9px] font-mono text-white/45">Portfolio {item.portfolioReturnPct == null ? '—' : (item.portfolioReturnPct >= 0 ? '+' : '') + item.portfolioReturnPct.toFixed(2) + '%'}</div><div className="text-[9px] font-mono text-white/45">{item.benchmark} {item.benchmarkReturnPct == null ? '—' : (item.benchmarkReturnPct >= 0 ? '+' : '') + item.benchmarkReturnPct.toFixed(2) + '%'}</div><div className={'text-[9px] font-mono font-bold ' + (item.relativeReturnPct == null ? 'text-white/25' : item.relativeReturnPct >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{item.relativeReturnPct == null ? 'Relative —' : 'Relative ' + (item.relativeReturnPct >= 0 ? '+' : '') + item.relativeReturnPct.toFixed(2) + ' pts'}</div></div></div>)}</div></div>
        </div>
        </div>
        <div className="mt-3 text-[8px] font-mono text-white/20">Weighted stress measures observed moves and exposure concentration, not a forecast. P&L attribution is descriptive. Benchmark comparisons are descriptive matched-window measurements.</div>
      </section>
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3" id="portfolio-investment-summary">
        <Metric label="Invest amount" value={formatPortfolioMoney(investedTotal)} suffix={currency === 'INR' ? 'home currency · USD basis' : 'position cost'} tone="neutral" icon={<WalletCards/>}/>
        <Metric label="Current value" value={formatPortfolioMoney(liveCurrentTotal)} suffix={livePositions.length + '/' + analyses.length + ' fresh · ' + stalePositions.length + ' fallback'} tone="up" icon={<TrendingUp/>}/>
        <Metric label="Unrealized P&L" value={liveUnrealized != null ? (liveUnrealized >= 0 ? '+' : '−') + formatPortfolioMoney(Math.abs(liveUnrealized)) : '—'} suffix={(liveUnrealizedPct != null ? '(' + liveUnrealizedPct.toFixed(2) + '%)' : '') + (stalePositions.length ? ' · snapshot fallback' : '')} tone={liveUnrealized != null && liveUnrealized >= 0 ? 'up' : 'down'} icon={<Activity/>}/>
        <Metric label="AI infra signal" value={infraScore.toString()} suffix="/100" tone={infraScore >= 50 ? "up" : "down"} icon={<Zap/>}/>
        <Metric label="Top live group" value={intelligence.topGroup || '—'} suffix="" tone="warn" icon={<ShieldAlert/>}/>
