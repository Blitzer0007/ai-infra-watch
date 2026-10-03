import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarRange, ChevronRight, Loader2, Search, ShieldAlert, Sparkles, TrendingDown, TrendingUp, Activity, CheckCircle2 } from 'lucide-react';
import { STOCK_METADATA } from '../data';
import { fetchPortfolioHoldings, updatePortfolioHolding } from '../utils/portfolioApi';
import { mapStoredPortfolioHoldings, type PortfolioPosition } from '../utils/portfolioPositions';
import { formatPrice } from '../utils';
import { authHeaders } from '../utils/apiAuth';
import { summarizeCalibration, summarizeValidationMatrix, type CalibrationBucket } from '../utils/measurement';
import { forecastValidationGate, FORECAST_VALIDATION_MINIMUM } from '../utils/forecastValidation';
import { createForecastEvidenceSnapshot, type ForecastEvidenceSnapshot } from '../utils/forecastEvidence';

type PricePoint = { date: string; price: number };

type ForwardOutlookProps = {
  livePrices?: Record<string, { price: number; changePct: number }>;
  macroRisks?: any[];
  contracts?: any[];
  news?: any[];
  politicalSignals?: any[];
};

type Horizon = 5 | 20 | 60 | 120 | 252;

type ForecastSnapshot = {
  id: string; ticker: string; createdAt: string; targetDate: string; horizon: Horizon; scenarioId: string;
  entryPrice: number; median: number; p25: number; p75: number; p10: number; p90: number;
  decisionThesis?: string; lossLimitPct?: number | null; exitRuleType?: string | null; exitRuleValue?: number | null; exitRuleText?: string; practicalNotes?: string; brokerAlertPrices?: number[];
  modelVersion?: string;
  evidenceSnapshot?: ForecastEvidenceSnapshot;
  status: 'pending' | 'verified'; verifiedAt?: string; actualDate?: string; actualPrice?: number; actualReturn?: number; medianError?: number;
};

const FORECAST_STORAGE_KEY = 'aiw-forward-outlook-forecasts-v1';

type Scenario = {
  id: string;
  label: string;
  description: string;
  adjustment: number;
};

const HORIZONS: { days: Horizon; label: string }[] = [
  { days: 5, label: '5D' },
  { days: 20, label: '20D' },
  { days: 60, label: '60D' },
  { days: 120, label: '6M' },
  { days: 252, label: '12M' },
];

const SCENARIOS: Scenario[] = [
  { id: 'base', label: 'Current regime', description: 'Historical analogues closest to today\'s observed momentum and volatility.', adjustment: 0 },
  { id: 'bull', label: 'AI demand strengthens', description: 'Stronger AI-infrastructure demand and supportive business/policy signals.', adjustment: 0.45 },
  { id: 'bear', label: 'Macro / policy shock', description: 'Higher macro or policy stress with weaker market breadth.', adjustment: -0.45 },
];

function addBusinessDays(start: Date, days: number): string {
  const date = new Date(start); let remaining = days;
  while (remaining > 0) { date.setDate(date.getDate() + 1); const day = date.getDay(); if (day !== 0 && day !== 6) remaining -= 1; }
  return date.toISOString().slice(0, 10);
}
function loadForecasts(): ForecastSnapshot[] { try { const raw = localStorage.getItem(FORECAST_STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; } }
function saveForecasts(items: ForecastSnapshot[]) { localStorage.setItem(FORECAST_STORAGE_KEY, JSON.stringify(items.slice(-100))); }

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map(v => (v - m) ** 2)));
}

function recentReturn(history: PricePoint[], days: number): number | null {
  if (history.length <= days) return null;
  const start = history[history.length - 1 - days]?.price;
  const end = history[history.length - 1]?.price;
  return start && end ? (end / start - 1) * 100 : null;
}

function forwardReturns(history: PricePoint[], horizon: number): number[] {
  const result: number[] = [];
  for (let i = 60; i + horizon < history.length; i++) {
    const base = history[i]?.price;
    const future = history[i + horizon]?.price;
    if (base > 0 && future > 0) result.push((future / base - 1) * 100);
  }
  return result;
}

type ForecastAnalytics = {
  sampleSize: number;
  sampleStatus?: string;
  directionalAccuracyPct?: number | null;
  medianAbsoluteError?: number | null;
  meanSignedErrorPct?: number | null;
  p25p75CoveragePct?: number | null;
  p10p90CoveragePct?: number | null;
  byTickerHorizon: Array<{ticker?: string; horizon?: number; count:number; directionalAccuracyPct:number|null; medianAbsoluteError:number|null; p25p75CoveragePct:number|null;}>;
  byScenario: Array<{scenarioId?: string; count:number;}>;
  byModel: Array<{modelVersion?: string; count:number;}>;
  byDirection: Array<{bucket:string; count:number;}>;
  validationGate?: { minimumRequired:number; verifiedCount:number; ready:boolean; status:string; };
  evidenceCoverage?: { forecastsWithSnapshot:number; analystAvailable:number; analystMissingOrFailed:number; withNews:number; withContracts:number; withPolitical:number; withMacro:number; multiChannel:number; };
  longTerm: {verifiedCount:number; oldestVerifiedAt:string|null; newestVerifiedAt:string|null;};
};

type VerificationDrift = {
  sampleSize: number;
  recentCount: number;
  priorCount: number;
  recentDirection: number | null;
  priorDirection: number | null;
  recentMedianAbsError: number | null;
  priorMedianAbsError: number | null;
  errorChange: number | null;
  state: 'limited' | 'stable' | 'watch' | 'drift-signal';
};

function calculateVerificationDrift(
  items: ForecastSnapshot[],
  ticker: string,
  horizon: Horizon,
): VerificationDrift {
  const verified = items
    .filter(item =>
      item.status === 'verified' &&
      item.ticker === ticker &&
      item.horizon === horizon &&
      item.actualReturn != null &&
      item.medianError != null &&
      item.verifiedAt
    )
    .sort((a, b) => String(a.verifiedAt).localeCompare(String(b.verifiedAt)));

  if (verified.length < 10) {
    return {
      sampleSize: verified.length,
      recentCount: 0,
      priorCount: 0,
      recentDirection: null,
      priorDirection: null,
      recentMedianAbsError: null,
      priorMedianAbsError: null,
      errorChange: null,
      state: 'limited',
    };
  }

  const split = Math.floor(verified.length / 2);
  const prior = verified.slice(0, split);
  const recent = verified.slice(split);

  const directionRate = (rows: ForecastSnapshot[]) => {
    const eligible = rows.filter(row => row.median !== 0 && row.actualReturn !== 0);
    return eligible.length
      ? eligible.filter(row => Math.sign(row.median) === Math.sign(row.actualReturn!)).length / eligible.length
      : null;
  };

  const medianAbsError = (rows: ForecastSnapshot[]) => {
    const values = rows.map(row => Math.abs(Number(row.medianError))).filter(Number.isFinite);
    return values.length ? percentile(values, 0.5) : null;
  };

  const recentError = medianAbsError(recent);
  const priorError = medianAbsError(prior);
  const errorChange =
    recentError != null && priorError != null && priorError > 0
      ? ((recentError - priorError) / priorError) * 100
      : null;

  let state: VerificationDrift['state'] = 'stable';
  if (errorChange != null) {
    if (errorChange >= 50) state = 'drift-signal';
    else if (errorChange >= 25) state = 'watch';
  }

  return {
    sampleSize: verified.length,
    recentCount: recent.length,
    priorCount: prior.length,
    recentDirection: directionRate(recent),
    priorDirection: directionRate(prior),
    recentMedianAbsError: recentError,
    priorMedianAbsError: priorError,
    errorChange,
    state,
  };
}


type BacktestRow = {
  asOfDate: string;
  targetDate: string;
  median: number;
  p25: number;
  p75: number;
  p10: number;
  p90: number;
  actual: number;
  positiveProbability: number;
};

type BacktestSummary = {
  rows: BacktestRow[];
  directionalAccuracy: number;
  medianAbsoluteError: number;
  p25p75Coverage: number;
  p10p90Coverage: number;
  baselineDirectionalAccuracy: number;
  baselineMedianAbsoluteError: number;
  directionalLift: number;
  errorLift: number;
  p25CalibrationGap: number;
  p90CalibrationGap: number;
  calibration: CalibrationBucket[];
};

function historicalBacktest(history: PricePoint[], horizon: Horizon): BacktestSummary {
  if (history.length < 220 + horizon) {
    return { rows: [], directionalAccuracy: 0, medianAbsoluteError: 0, p25p75Coverage: 0, p10p90Coverage: 0, baselineDirectionalAccuracy: 0, baselineMedianAbsoluteError: 0, directionalLift: 0, errorLift: 0, p25CalibrationGap: 0, p90CalibrationGap: 0, calibration: [] };
  }

  const regimes = history.map((_, i) => {
    if (i < 20) return { momentum: 0, volatility: 0 };
    const start = history[i - 20]?.price;
    const end = history[i]?.price;
    const daily: number[] = [];
    for (let j = Math.max(1, i - 20); j <= i; j++) {
      const a = history[j - 1]?.price;
      const b = history[j]?.price;
      if (a > 0 && b > 0) daily.push((b / a - 1) * 100);
    }
    return {
      momentum: start > 0 && end > 0 ? (end / start - 1) * 100 : 0,
      volatility: stdev(daily) * Math.sqrt(252)
    };
  });

  const candidatesAt = (asOf: number): number[] => {
    const candidates: { distance: number; ret: number }[] = [];
    const current = regimes[asOf];
    for (let j = 60; j + horizon < asOf; j++) {
      const base = history[j]?.price;
      const future = history[j + horizon]?.price;
      if (!(base > 0 && future > 0)) continue;
      const regime = regimes[j];
      const distance = Math.abs(regime.momentum - current.momentum) + Math.abs(regime.volatility - current.volatility) * 0.7;
      candidates.push({ distance, ret: (future / base - 1) * 100 });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates.slice(0, 25).map(item => item.ret);
  };

  const rows: BacktestRow[] = [];
  const baselineRows: { median: number; actual: number }[] = [];
  const step = horizon >= 120 ? 15 : 20;
  const first = 220;
  const last = history.length - horizon - 1;
  for (let asOf = first; asOf <= last; asOf += step) {
    const sample = candidatesAt(asOf);
    const base = sample.length >= 8 ? sample : [];
    if (base.length < 8) continue;
    const median = percentile(base, 0.5);
    const p25 = percentile(base, 0.25);
    const p75 = percentile(base, 0.75);
    const p10 = percentile(base, 0.1);
    const p90 = percentile(base, 0.9);
    const actual = (history[asOf + horizon].price / history[asOf].price - 1) * 100;

    const baseline: number[] = [];
    for (let j = 60; j + horizon < asOf; j++) {
      const a = history[j]?.price;
      const b = history[j + horizon]?.price;
      if (a > 0 && b > 0) baseline.push((b / a - 1) * 100);
    }
    if (baseline.length >= 8) baselineRows.push({ median: percentile(baseline, 0.5), actual });

    const positiveProbability = base.filter(value => value > 0).length / base.length;
    rows.push({ asOfDate: history[asOf].date, targetDate: history[asOf + horizon].date, median, p25, p75, p10, p90, actual, positiveProbability });
  }

  const directional = rows.filter(row => row.median !== 0 && row.actual !== 0 && Math.sign(row.median) === Math.sign(row.actual));
  const directionalEligible = rows.filter(row => row.median !== 0 && row.actual !== 0);
  const absErrors = rows.map(row => Math.abs(row.actual - row.median));
  const middleCovered = rows.filter(row => row.actual >= row.p25 && row.actual <= row.p75);
  const wideCovered = rows.filter(row => row.actual >= row.p10 && row.actual <= row.p90);
  const baselineDirectional = baselineRows.filter(row => row.median !== 0 && row.actual !== 0 && Math.sign(row.median) === Math.sign(row.actual));
  const baselineEligible = baselineRows.filter(row => row.median !== 0 && row.actual !== 0);
  const baselineErrors = baselineRows.map(row => Math.abs(row.actual - row.median));
  const modelDirectional = directionalEligible.length ? directional.length / directionalEligible.length : 0;
  const baseDirectional = baselineEligible.length ? baselineDirectional.length / baselineEligible.length : 0;
  const modelError = absErrors.length ? percentile(absErrors, 0.5) : 0;
  const baseError = baselineErrors.length ? percentile(baselineErrors, 0.5) : 0;

  return {
    rows,
    directionalAccuracy: modelDirectional,
    medianAbsoluteError: modelError,
    p25p75Coverage: rows.length ? middleCovered.length / rows.length : 0,
    p10p90Coverage: rows.length ? wideCovered.length / rows.length : 0,
    baselineDirectionalAccuracy: baseDirectional,
    baselineMedianAbsoluteError: baseError,
    directionalLift: modelDirectional - baseDirectional,
    errorLift: baseError - modelError,
    p25CalibrationGap: (rows.length ? middleCovered.length / rows.length : 0) - 0.5,
    p90CalibrationGap: (rows.length ? wideCovered.length / rows.length : 0) - 0.8,
    calibration: summarizeCalibration(rows.map(row => ({ confidence: row.positiveProbability, positive: row.actual > 0, excessReturnPct: row.actual - row.median })))
  };
}

function conditionedReturns(history: PricePoint[], horizon: number, currentMomentum: number, currentVolatility: number, modelVersion: string): number[] {
  const candidates: { distance: number; ret: number }[] = [];
  const dailyReturns: number[] = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1]?.price;
    const cur = history[i]?.price;
    if (prev > 0 && cur > 0) dailyReturns.push((cur / prev - 1) * 100);
  }
  const featureValues = { m20: [] as number[], m60: [] as number[], m252: [] as number[], vol: [] as number[] };
  const featureAt = (i: number) => {
    const base = history[i]?.price;
    if (!(base > 0) || i < 20) return null;
    const ret = (days: number) => {
      if (i < days) return 0;
      const start = history[i - days]?.price;
      return start > 0 ? (base / start - 1) * 100 : 0;
    };
    const window = dailyReturns.slice(Math.max(0, i - 20), i);
    return { m20: ret(20), m60: ret(60), m252: ret(252), vol: stdev(window) * Math.sqrt(252) };
  };
  const current = featureAt(history.length - 1);
  if (!current) return [];
  for (let i = Math.max(60, history.length - 500); i < history.length; i++) {
    const f = featureAt(i);
    if (f) { featureValues.m20.push(f.m20); featureValues.m60.push(f.m60); featureValues.m252.push(f.m252); featureValues.vol.push(f.vol); }
  }
  const scales = {
    m20: Math.max(stdev(featureValues.m20), 0.25),
    m60: Math.max(stdev(featureValues.m60), 0.25),
    m252: Math.max(stdev(featureValues.m252), 0.25),
    vol: Math.max(stdev(featureValues.vol), 0.25)
  };

  for (let i = 60; i + horizon < history.length; i++) {
    const base = history[i]?.price;
    const future = history[i + horizon]?.price;
    if (!(base > 0 && future > 0)) continue;
    const f = featureAt(i);
    if (!f) continue;
    let distance: number;
    if (modelVersion === 'analogue-v2') {
      distance = Math.sqrt(
        ((f.m20 - current.m20) / scales.m20) ** 2 +
        ((f.m60 - current.m60) / scales.m60) ** 2 +
        0.5 * ((f.m252 - current.m252) / scales.m252) ** 2 +
        0.8 * ((f.vol - current.vol) / scales.vol) ** 2
      );
    } else {
      distance = Math.abs(f.m20 - currentMomentum) + Math.abs(f.vol - currentVolatility) * 0.7;
    }
    candidates.push({ distance, ret: (future / base - 1) * 100 });
  }

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates.slice(0, Math.min(25, candidates.length)).map(item => item.ret);
}

export default function ForwardOutlook({ livePrices, macroRisks = [], contracts = [], news = [], politicalSignals = [] }: ForwardOutlookProps) {
  const [selectedStock, setSelectedStock] = useState('NVDA');
  const [tickerInput, setTickerInput] = useState('');
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<Horizon>(20);
  const [scenarioId, setScenarioId] = useState('base');
  const [modelVersion, setModelVersion] = useState('analogue-v1');
  const [modelConfig, setModelConfig] = useState<any>(null);
  const [jevLoading, setJevLoading] = useState(false);
  const [jevResult, setJevResult] = useState<{ summary?: string; answer_source?: string; choice?: string; evidenceGate?: string; confidence?: number; rawScore?: number; evidenceQuality?: number } | null>(null);
  const [jevError, setJevError] = useState<string | null>(null);
  const [forecasts, setForecasts] = useState<ForecastSnapshot[]>([]);
  const [forecastAnalytics, setForecastAnalytics] = useState<ForecastAnalytics | null>(null);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [backtestBusy, setBacktestBusy] = useState(false);
  const [backtest, setBacktest] = useState<BacktestSummary | null>(null);
  const [backtestMessage, setBacktestMessage] = useState<string | null>(null);
  const [matrixBusy, setMatrixBusy] = useState(false);
  const [matrix, setMatrix] = useState<{tests:number;direction:number;error:number;coverage50:number;coverage80:number;baselineDirection:number;baselineError:number;calibration:CalibrationBucket[];details:Array<{ticker:string;horizon:number;tests:number;direction:number;error:number;coverage50:number;coverage80:number;baselineDirection:number;baselineError:number}>} | null>(null);
  const [matrixMessage, setMatrixMessage] = useState<string | null>(null);
  const [jevValidationBusy, setJevValidationBusy] = useState(false);
  const [jevValidation, setJevValidation] = useState<{summary:string; choice?:string; evidenceGate?:string; confidence?:number|string; answerSource?:string} | null>(null);
  const [jevValidationError, setJevValidationError] = useState<string | null>(null);
  const [portfolioPositions, setPortfolioPositions] = useState<PortfolioPosition[]>([]);
  const [portfolioLoadError, setPortfolioLoadError] = useState<string | null>(null);
  const [decisionEditing, setDecisionEditing] = useState(false);
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [decisionMessage, setDecisionMessage] = useState<string | null>(null);
  const [decisionDraft, setDecisionDraft] = useState({
    thesis: '', lossLimitPct: '', exitRuleType: 'trailing_stop', exitRuleValue: '', exitRuleText: '', practicalNotes: '', brokerAlerts: '',
  });

  const verificationDrift = useMemo(
    () => calculateVerificationDrift(forecasts, selectedStock, horizon),
    [forecasts, selectedStock, horizon],
  );

  useEffect(() => {
    const holding = portfolioPositions.find(position => position.symbol === selectedStock);
    setDecisionDraft({
      thesis: holding?.decisionThesis || holding?.notes || '',
      lossLimitPct: holding?.lossLimitPct == null ? '' : String(holding.lossLimitPct),
      exitRuleType: holding?.exitRuleType || 'trailing_stop',
      exitRuleValue: holding?.exitRuleValue == null ? '' : String(holding.exitRuleValue),
      exitRuleText: holding?.exitRuleText || '',
      practicalNotes: holding?.practicalNotes || '',
      brokerAlerts: (holding?.brokerAlertPrices || []).join(', '),
    });
    setDecisionEditing(false);
    setDecisionMessage(null);
  }, [portfolioPositions, selectedStock]);

  useEffect(() => {
    let cancelled = false;
    fetchPortfolioHoldings()
      .then(rows => {
        if (cancelled) return;
        setPortfolioPositions(mapStoredPortfolioHoldings(rows));
        setPortfolioLoadError(null);
      })
      .catch(error => {
        if (cancelled) return;
        setPortfolioPositions([]);
        setPortfolioLoadError(error instanceof Error ? error.message : 'Portfolio context unavailable');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPersistentForecasts() {
      try {
        const response = await fetch('/api/forecast-verification', { cache: 'no-store' });
        if (!response.ok) throw new Error('Persistent forecast storage unavailable');
        const body = await response.json();
        const remote: ForecastSnapshot[] = Array.isArray(body.forecasts) ? body.forecasts : [];
        if (!cancelled) {
          setForecasts(remote);
          setForecastAnalytics(body?.analytics || null);
          if (!remote.length) {
            const legacy = loadForecasts();
            for (const item of legacy) {
              fetch('/api/forecast-verification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
              }).catch(() => {});
            }
            if (legacy.length) setForecasts(legacy);
          }
        }
      } catch {
        if (!cancelled) setForecasts(loadForecasts());
      }
    }
    loadPersistentForecasts();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadModel() {
      try {
        const response = await fetch('/api/forecast-verification?ticker=' + encodeURIComponent(selectedStock) + '&horizon=' + horizon);
        if (!response.ok) throw new Error('Model configuration unavailable');
        const body = await response.json();
        if (!cancelled) {
          setModelVersion(body?.model || 'analogue-v1');
          setModelConfig(body?.config || null);
        }
      } catch {
        if (!cancelled) {
          setModelVersion('analogue-v1');
          setModelConfig(null);
        }
      }
    }
    loadModel();
    return () => { cancelled = true; };
  }, [selectedStock, horizon]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/company-scale?action=history&symbol=' + encodeURIComponent(selectedStock) + '&range=5y');
        if (!res.ok) throw new Error('Historical market data request failed (HTTP ' + res.status + ')');
        const data = await res.json();
        if (!cancelled) setHistory(Array.isArray(data.points) ? data.points : []);
      } catch (err: any) {
        if (!cancelled) {
          setHistory([]);
          setError(err?.message || 'Historical market data unavailable');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedStock]);

  const quote = livePrices?.[selectedStock];
  const currentPrice = quote?.price ?? history[history.length - 1]?.price ?? null;

  const metrics = useMemo(() => {
    const oneMonth = recentReturn(history, 20) ?? 0;
    const daily: number[] = [];
    for (let i = 1; i < history.length; i++) {
      const a = history[i - 1]?.price;
      const b = history[i]?.price;
      if (a > 0 && b > 0) daily.push((b / a - 1) * 100);
    }
    const currentWindow = daily.slice(-20);
    return {
      momentum: oneMonth,
      volatility: stdev(currentWindow) * Math.sqrt(252),
      dailyChange: quote?.changePct ?? daily[daily.length - 1] ?? 0,
      oneYear: recentReturn(history, 252) ?? 0,
    };
  }, [history, quote]);

  const macroLoad = useMemo(() => {
    const high = macroRisks.filter(r => String(r?.impactRating || '').toLowerCase() === 'high').length;
    const medium = macroRisks.filter(r => String(r?.impactRating || '').toLowerCase() === 'medium').length;
    return Math.min(100, high * 18 + medium * 9);
  }, [macroRisks]);

  const evidenceCounts = contracts.length + news.length + politicalSignals.length;

  const analysis = useMemo(() => {
    const all = forwardReturns(history, horizon);
    const analogues = conditionedReturns(history, horizon, metrics.momentum, metrics.volatility, modelVersion);
    const base = analogues.length >= 8 ? analogues : all;
    const scenario = SCENARIOS.find(s => s.id === scenarioId) || SCENARIOS[0];
    const shift = scenario.adjustment * Math.max(1, stdev(base));
    const adjusted = base.map(value => value + shift);
    const median = percentile(adjusted, 0.5);
    const p10 = percentile(adjusted, 0.1);
    const p25 = percentile(adjusted, 0.25);
    const p75 = percentile(adjusted, 0.75);
    const p90 = percentile(adjusted, 0.9);
    const positive = adjusted.length ? adjusted.filter(v => v > 0).length / adjusted.length : 0;
    const confidence = adjusted.length >= 20 ? 'Moderate' : adjusted.length >= 8 ? 'Low–Moderate' : 'Insufficient';
    return { sample: adjusted, median, p10, p25, p75, p90, positive, confidence, analogueCount: analogues.length, allCount: all.length };
  }, [history, horizon, metrics.momentum, metrics.volatility, scenarioId, modelVersion]);

  const selectedScenario = SCENARIOS.find(s => s.id === scenarioId) || SCENARIOS[0];
  const meta = STOCK_METADATA[selectedStock] || { name: selectedStock, sector: 'Live Market', logoColor: '#22c55e' };

  const portfolioContext = useMemo(() => {
    const totalInvested = portfolioPositions.reduce((sum, position) => sum + position.investedValue, 0);
    const holding = portfolioPositions.find(position => position.symbol === selectedStock);
    const positionValue = holding && currentPrice != null ? holding.quantity * currentPrice : holding?.investedValue ?? 0;
    const weight = totalInvested > 0 ? positionValue / totalInvested : 0;
    const concentrationPeers = portfolioPositions
      .filter(position => position.symbol !== selectedStock && (position.group === holding?.group || position.theme === holding?.theme || position.peers.includes(selectedStock)))
      .map(position => position.symbol);
    const concentrationWeight = portfolioPositions
      .filter(position => concentrationPeers.includes(position.symbol))
      .reduce((sum, position) => sum + position.investedValue, 0) / Math.max(totalInvested, 1);
    const thesis = String(holding?.notes || '').trim();
    const eventDate = (item: any) => String(item?.date || item?.publishedAt || item?.published_at || item?.filingDate || '').slice(0, 10);
    const eventTitle = (item: any) => String(item?.title || item?.name || item?.summary || 'Relevant event');
    const now = new Date();
    const horizonEnd = new Date(now.getTime() + 20 * 86400000);
    const upcoming = [...contracts, ...news, ...politicalSignals]
      .filter(item => {
        const date = eventDate(item);
        if (!date) return false;
        const parsed = new Date(date + 'T23:59:59Z');
        return parsed >= now && parsed <= horizonEnd;
      })
      .map(item => ({ date: eventDate(item), title: eventTitle(item) }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6);
    return { holding, totalInvested, positionValue, weight, concentrationPeers, concentrationWeight, thesis, upcoming, hasHolding: Boolean(holding) };
  }, [portfolioPositions, selectedStock, currentPrice, contracts, news, politicalSignals]);

  const forecastRisk = useMemo(() => {
    const sample = analysis.sample;
    const negative = sample.filter(value => value < 0);
    return {
      worst: sample.length ? Math.min(...sample) : null,
      negativeCount: negative.length,
      negativePct: sample.length ? negative.length / sample.length : 0,
    };
  }, [analysis.sample]);

  const saveDecisionContext = async () => {
    const holding = portfolioContext.holding;
    if (!holding?.id) return;
    const lossLimitPct = decisionDraft.lossLimitPct.trim() === '' ? null : Number(decisionDraft.lossLimitPct);
    const exitRuleValue = decisionDraft.exitRuleValue.trim() === '' ? null : Number(decisionDraft.exitRuleValue);
    if (lossLimitPct != null && (!Number.isFinite(lossLimitPct) || lossLimitPct < 0 || lossLimitPct > 100)) {
      setDecisionMessage('Loss limit must be between 0% and 100%.'); return;
    }
    if (exitRuleValue != null && (!Number.isFinite(exitRuleValue) || exitRuleValue < 0 || exitRuleValue > 100)) {
      setDecisionMessage('Exit rule percentage must be between 0% and 100%.'); return;
    }
    const brokerAlertPrices = decisionDraft.brokerAlerts.split(',').map(value => Number(value.trim())).filter(value => Number.isFinite(value) && value > 0);
    setDecisionSaving(true); setDecisionMessage(null);
    try {
      const saved = await updatePortfolioHolding({
        id: holding.id,
        symbol: holding.symbol,
        quantity: holding.quantity,
        averageCost: holding.averageCost,
        purchaseDate: holding.purchaseDate,
        notes: holding.notes || '',
        decisionThesis: decisionDraft.thesis.trim(),
        lossLimitPct,
        exitRuleType: decisionDraft.exitRuleType || null,
        exitRuleValue,
        exitRuleText: decisionDraft.exitRuleText.trim(),
        practicalNotes: decisionDraft.practicalNotes.trim(),
        brokerAlertPrices,
        purchaseLots: [],
      });
      setPortfolioPositions(prev => prev.map(position => position.id === saved.id ? mapStoredPortfolioHoldings([saved])[0] : position));
      setDecisionEditing(false);
      setDecisionMessage('Decision rules saved to this holding.');
    } catch (error: any) {
      setDecisionMessage(error?.message || 'Unable to save decision rules.');
    } finally {
      setDecisionSaving(false);
    }
  };

  const runJevEvidenceCheck = async () => {
    if (!history.length || loading) return;
    setJevLoading(true);
    setJevError(null);
    try {
      const scenario = SCENARIOS.find(s => s.id === scenarioId) || SCENARIOS[0];
      const compact = (items: any[], keys: string[]) => items.slice(0, 8).map(item => {
        const out: Record<string, any> = {};
        keys.forEach(key => { if (item?.[key] != null) out[key] = item[key]; });
        return out;
      });
      const prompt = [
        'Act as the JEV evidence/context layer for AI Infra Watch Forward Outlook.',
        'Do not change, invent, or override the numerical historical forecast. Treat the statistical distribution as the source of the numbers.',
        'Assess whether current evidence supports, conflicts with, or is insufficient to contextualize the historical analogue result.',
        'Return a concise summary for the UI with: evidence assessment, key supporting/conflicting signals, important caveats, and what should be verified next.',
        'Do not provide an investment recommendation, price target, or certainty claim.',
        '',
        'Ticker: ' + selectedStock,
        'Horizon: ' + HORIZONS.find(h => h.days === horizon)?.label,
        'Scenario: ' + scenario.label,
        'Historical median: ' + formatReturn(analysis.median),
        'Historical outcome range: ' + [analysis.p10, analysis.p25, analysis.p75, analysis.p90].map(formatReturn).join(' / '),
        'Positive historical outcomes: ' + (analysis.positive * 100).toFixed(0) + '%',
        'Analogue matches: ' + analysis.analogueCount,
        'Baseline observations: ' + analysis.allCount,
        '20D momentum: ' + formatReturn(metrics.momentum),
        'Annualized volatility: ' + metrics.volatility.toFixed(1) + '%',
        '1Y move: ' + formatReturn(metrics.oneYear),
        'Macro load: ' + macroLoad + '/100',
        'Contracts evidence: ' + JSON.stringify(compact(contracts, ['title','company','date','status','summary'])),
        'News evidence: ' + JSON.stringify(compact(news, ['title','source','publishedAt','summary'])),
        'Political/policy evidence: ' + JSON.stringify(compact(politicalSignals, ['title','source','date','summary','impactRating'])),
        'Macro risks: ' + JSON.stringify(compact(macroRisks, ['title','description','impactRating']))
      ].join('\n');

      const response = await fetch('/api/agent-ask', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ question: prompt })
      });
      if (!response.ok) throw new Error('JEV evidence check failed (HTTP ' + response.status + ')');
      const body = await response.json();
      setJevResult({
        summary: body?.summary || body?.answer || 'JEV returned no summary.',
        answer_source: body?.answer_source,
        choice: body?.jev?.choice,
        evidenceGate: body?.jev?.evidence_gate?.action,
        confidence: body?.jev?.confidence,
        rawScore: body?.jev?.evidence_gate?.raw_score,
        evidenceQuality: body?.jev?.evidence_gate?.evidence_quality
      });
    } catch (err: any) {
      setJevResult(null);
      setJevError(err?.message || 'JEV evidence check unavailable');
    } finally {
      setJevLoading(false);
    }
  };

  const trackForecast = async () => {
    if (!currentPrice || !history.length || analysis.confidence === 'Insufficient') return;
    const duplicate = forecasts.some(f =>
      f.status === 'pending' &&
      f.ticker === selectedStock &&
      f.horizon === horizon &&
      f.scenarioId === scenarioId &&
      f.modelVersion === modelVersion
    );
    if (duplicate) {
      setVerificationMessage('This ticker, horizon, scenario, and model are already being tracked.');
      return;
    }
    const capturedAt = new Date().toISOString();
    let analystEvidence: {
      status: 'available' | 'missing' | 'failed';
      source: string | null;
      retrievedAt: string | null;
      analystCount: number | null;
      medianTarget: number | null;
      webEvidenceCount: number;
      error: string | null;
    } = {
      status: 'missing',
      source: null,
      retrievedAt: null,
      analystCount: null,
      medianTarget: null,
      webEvidenceCount: 0,
      error: null,
    };

    try {
      const analystResponse = await fetch('/api/company-scale?action=analyst&symbol=' + encodeURIComponent(selectedStock));
      const analystBody = await analystResponse.json().catch(() => ({}));
      const hasEvidence = Boolean(
        analystBody?.consensusAvailable ||
        analystBody?.structuredEvidenceAvailable ||
        Number(analystBody?.webEvidenceCount) > 0
      );
      if (analystResponse.ok && hasEvidence) {
        analystEvidence = {
          status: 'available',
          source: analystBody?.source || null,
          retrievedAt: analystBody?.retrievedAt || null,
          analystCount: Number.isFinite(Number(analystBody?.analystCount)) ? Number(analystBody.analystCount) : null,
          medianTarget: Number.isFinite(Number(analystBody?.priceTarget?.median)) ? Number(analystBody.priceTarget.median) : null,
          webEvidenceCount: Math.max(0, Number(analystBody?.webEvidenceCount) || 0),
          error: null,
        };
      } else if (analystResponse.status === 503 || !hasEvidence) {
        analystEvidence = {
          ...analystEvidence,
          status: 'missing',
          error: analystBody?.error || null,
        };
      } else {
        analystEvidence = {
          ...analystEvidence,
          status: 'failed',
          error: analystBody?.error || 'Analyst evidence request failed.',
        };
      }
    } catch (error: any) {
      analystEvidence = {
        ...analystEvidence,
        status: 'failed',
        error: error?.message || 'Analyst evidence request failed.',
      };
    }

    const evidenceSnapshot = createForecastEvidenceSnapshot({
      capturedAt,
      ticker: selectedStock,
      currentPrice,
      changePct: metrics.dailyChange,
      quoteSource: 'forward_outlook_live_price',
      momentum20Pct: metrics.momentum,
      volatilityAnnualizedPct: metrics.volatility,
      oneYearReturnPct: metrics.oneYear,
      historyThrough: history[history.length - 1]?.date || null,
      analyst: analystEvidence,
      contracts,
      news,
      political: politicalSignals,
      macro: macroRisks,
    });

    const snapshot: ForecastSnapshot = {
      id: crypto.randomUUID(), ticker: selectedStock, createdAt: capturedAt,
      targetDate: addBusinessDays(new Date(capturedAt), horizon), horizon, scenarioId, entryPrice: currentPrice, modelVersion,
      median: analysis.median, p25: analysis.p25, p75: analysis.p75, p10: analysis.p10, p90: analysis.p90, status: 'pending',
      evidenceSnapshot,
      decisionThesis: portfolioContext.holding?.decisionThesis || portfolioContext.thesis || '',
      lossLimitPct: portfolioContext.holding?.lossLimitPct ?? null,
      exitRuleType: portfolioContext.holding?.exitRuleType ?? null,
      exitRuleValue: portfolioContext.holding?.exitRuleValue ?? null,
      exitRuleText: portfolioContext.holding?.exitRuleText || '',
      practicalNotes: portfolioContext.holding?.practicalNotes || '',
      brokerAlertPrices: portfolioContext.holding?.brokerAlertPrices || []
    };
    try {
      const response = await fetch('/api/forecast-verification', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot)
      });
      if (!response.ok) throw new Error('Persistent forecast storage failed (HTTP ' + response.status + ')');
      const body = await response.json();
      const saved = { ...snapshot, ...(body?.forecast || {}) };
      const next = [...forecasts.filter(f => f.id !== saved.id), saved];
      setForecasts(next);
      saveForecasts(next);
      setVerificationMessage('Forecast saved to the verification database. It can be verified from another device after the target date.');
    } catch (err: any) {
      const next = [...forecasts, snapshot];
      setForecasts(next);
      saveForecasts(next);
      setVerificationMessage((err?.message || 'Database save failed.') + ' Local browser fallback was kept.');
    }
  };

  const verifyDueForecasts = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const due = forecasts.filter(f => f.status === 'pending' && f.targetDate <= today);
    if (!due.length) { setVerificationMessage('No forecast has reached its target date yet.'); return; }
    setVerificationBusy(true); setVerificationMessage(null);
    try {
      const updated = [...forecasts];
      for (const forecast of due) {
        const res = await fetch('/api/stock-history?symbol=' + encodeURIComponent(forecast.ticker) + '&range=5y');
        if (!res.ok) throw new Error('Verification market data failed for ' + forecast.ticker + ' (HTTP ' + res.status + ')');
        const data = await res.json();
        const points: PricePoint[] = Array.isArray(data.points) ? data.points : [];
        const point = points.find(p => p.date >= forecast.targetDate);
        if (!point || !(forecast.entryPrice > 0) || !(point.price > 0)) continue;
        const actualReturn = (point.price / forecast.entryPrice - 1) * 100;
        const patch = {
          id: forecast.id, status: 'verified', verifiedAt: new Date().toISOString(),
          actualDate: point.date, actualPrice: point.price, actualReturn,
          medianError: actualReturn - forecast.median
        };
        const savedResponse = await fetch('/api/forecast-verification', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch)
        });
        if (!savedResponse.ok) throw new Error('Database verification failed for ' + forecast.ticker + ' (HTTP ' + savedResponse.status + ')');
        const savedBody = await savedResponse.json();
        const verified = savedBody?.forecast || { ...forecast, ...patch };
        const index = updated.findIndex(f => f.id === forecast.id);
        if (index >= 0) updated[index] = verified;
      }
      setForecasts(updated); saveForecasts(updated);
      setVerificationMessage('Verification complete using real market history and the persistent database.');
    } catch (err: any) {
      setVerificationMessage(err?.message || 'Forecast verification failed.');
    } finally { setVerificationBusy(false); }
  };

  const runBacktest = async () => {
    if (loading || history.length < 220 + horizon) return;
    setBacktestBusy(true);
    setBacktestMessage(null);
    try {
      const result = historicalBacktest(history, horizon);
      setBacktest(result);
      setBacktestMessage(
        result.rows.length
          ? 'Backtest complete. Each test date uses only market data available before that date.'
          : 'Not enough historical observations to produce a backtest for this horizon.'
      );
    } catch (err: any) {
      setBacktest(null);
      setBacktestMessage(err?.message || 'Backtest failed.');
    } finally {
      setBacktestBusy(false);
    }
  };

  const runValidationMatrix = async () => {
    if (matrixBusy) return;
    setMatrixBusy(true);
    setMatrix(null);
    setMatrixMessage(null);
    const tickers = ['NVDA','MSFT','MU','AVGO','AMD','TSM','META','NBIS'];
    try {
      const histories = await Promise.all(tickers.map(async ticker => {
        const response = await fetch('/api/company-scale?action=history&symbol=' + encodeURIComponent(ticker) + '&range=5y');
        if (!response.ok) throw new Error(ticker + ' history failed (HTTP ' + response.status + ')');
        const body = await response.json();
        return { ticker, points: Array.isArray(body.points) ? body.points : [] };
      }));
      const summaryRows = histories.flatMap(item => HORIZONS.map(h => ({ ticker: item.ticker, horizon: h.days, summary: historicalBacktest(item.points, h.days) })));
      const summary = summarizeValidationMatrix(summaryRows);
      setMatrix(summary);
      setMatrixMessage('Validation matrix complete: ' + histories.length + ' tickers × ' + HORIZONS.length + ' horizons. Results are descriptive averages across valid ticker/horizon backtests.');
    } catch (err: any) {
      setMatrixMessage(err?.message || 'Validation matrix failed.');
    } finally {
      setMatrixBusy(false);
    }
  };

  const runJevBacktestValidation = async () => {
    if (!backtest || !backtest.rows.length || jevValidationBusy) return;
    setJevValidationBusy(true);
    setJevValidationError(null);
    try {
      const compactRows = backtest.rows.slice(-12).map(row => ({
        asOfDate: row.asOfDate,
        targetDate: row.targetDate,
        median: formatReturn(row.median),
        actual: formatReturn(row.actual),
        positiveProbability: row.positiveProbability,
        p25: formatReturn(row.p25),
        p75: formatReturn(row.p75),
        p10: formatReturn(row.p10),
        p90: formatReturn(row.p90)
      }));
      const prompt = [
        'Act as the JEV Validation Analyst for AI Infra Watch.',
        'You are evaluating a deterministic historical backtest. Do not change, recalculate, invent, or override any supplied metric.',
        'Treat the supplied backtest numbers as authoritative measurements.',
        'Do not provide an investment recommendation, price target, trading instruction, election/political recommendation, or certainty claim.',
        'Assess evidence quality and limitations, identify possible model weaknesses, and recommend the next validation experiment.',
        'Clearly distinguish measured facts from hypotheses. If evidence is insufficient, say so.',
        'Return a concise UI-ready summary plus: evidence assessment, key concern, and next experiment.',
        '',
        'Ticker: ' + selectedStock,
        'Horizon: ' + (HORIZONS.find(h => h.days === horizon)?.label || horizon + 'D'),
        'Scenario: base / Current regime',
        'Historical tests: ' + backtest.rows.length,
        'Correct direction: ' + (backtest.directionalAccuracy * 100).toFixed(1) + '%',
        'Typical prediction error: ' + backtest.medianAbsoluteError.toFixed(1) + ' percentage points',
        'Likely range coverage: ' + (backtest.p25p75Coverage * 100).toFixed(1) + '%',
        'Calibration buckets: ' + JSON.stringify(backtest.calibration),
        'Wider expected range coverage: ' + (backtest.p10p90Coverage * 100).toFixed(1) + '%',
        'Recent test rows: ' + JSON.stringify(compactRows),
        'Validation rule: this backtest uses only information available before each historical as-of date; future outcomes are used only as the realized result for that test.'
      ].join('\n');

      const response = await fetch('/api/agent-ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: prompt })
      });
      if (!response.ok) throw new Error('JEV validation failed (HTTP ' + response.status + ')');
      const body = await response.json();
      setJevValidation({
        summary: body?.summary || body?.answer || 'JEV returned no validation summary.',
        choice: body?.jev?.choice,
        evidenceGate: body?.jev?.evidence_gate?.action,
        confidence: body?.jev?.confidence,
        answerSource: body?.answer_source
      });
    } catch (err: any) {
      setJevValidation(null);
      setJevValidationError(err?.message || 'JEV validation unavailable.');
    } finally {
      setJevValidationBusy(false);
    }
  };

  const runTicker = () => {
    const value = tickerInput.trim().toUpperCase();
    if (value) {
      setSelectedStock(value);
      setTickerInput('');
    }
  };

  const formatReturn = (value: number) => (value >= 0 ? '+' : '') + value.toFixed(1) + '%';

  return (
    <div className="space-y-6" id="forward-outlook-view" data-testid="forward-outlook">
      <div className="aiw-page-header flex flex-col space-y-1 md:space-y-2 border-b border-white/10 pb-4">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Section 09 / Forward-looking analysis</span>
        <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase italic text-white">Forward Outlook</h1>
        <p className="text-xs text-white/60 max-w-4xl leading-relaxed">
          Historical scenario analysis: find past market regimes that resemble today, then measure the distribution of subsequent returns. This is not a guaranteed price prediction.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-[#15181E] border border-white/10 rounded-2xl p-4 md:p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <div className="flex-1">
              <label className="text-[9px] font-mono uppercase tracking-widest text-white/40 block mb-1.5">Analyze any public ticker</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-white/30 absolute left-3 top-2.5" />
                  <input value={tickerInput} onChange={e => setTickerInput(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && runTicker()} placeholder="NVDA, MSFT, MU, AVGO..." className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-emerald-400/50 placeholder-white/20 font-mono" />
                </div>
                <button onClick={runTicker} className="px-4 py-2.5 bg-emerald-500 text-black rounded text-[10px] font-mono font-black uppercase tracking-wider cursor-pointer">Analyze</button>
              </div>
            </div>
            <div className="text-right text-[10px] font-mono text-white/40">
              <div>LIVE PRICE</div>
              <div className="text-lg text-white font-bold">{currentPrice != null ? '$' + formatPrice(currentPrice) : '—'}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {['NVDA','MSFT','MU','AVGO','AMD','TSM','META','NBIS'].map(symbol => (
              <button key={symbol} onClick={() => setSelectedStock(symbol)} className={`px-3 py-2 rounded border text-[10px] font-mono font-bold cursor-pointer ${selectedStock === symbol ? 'bg-white text-black border-white' : 'bg-white/5 text-white/60 border-white/10'}`}>{symbol}</button>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded-xl border border-white/5 bg-black/10 p-3"><div className="text-[8px] font-mono uppercase text-white/30">20D momentum</div><div className="text-sm font-mono font-bold mt-1">{formatReturn(metrics.momentum)}</div></div>
            <div className="rounded-xl border border-white/5 bg-black/10 p-3"><div className="text-[8px] font-mono uppercase text-white/30">Annualized vol</div><div className="text-sm font-mono font-bold mt-1">{metrics.volatility.toFixed(1)}%</div></div>
            <div className="rounded-xl border border-white/5 bg-black/10 p-3"><div className="text-[8px] font-mono uppercase text-white/30">1Y move</div><div className="text-sm font-mono font-bold mt-1">{formatReturn(metrics.oneYear)}</div></div>
            <div className="rounded-xl border border-white/5 bg-black/10 p-3"><div className="text-[8px] font-mono uppercase text-white/30">Macro load</div><div className="text-sm font-mono font-bold mt-1">{macroLoad}/100</div></div>
          </div>
        </div>

        <div className="bg-[#15181E] border border-white/10 rounded-2xl p-4 md:p-5 space-y-4">
          <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-emerald-400" /><span className="text-xs font-mono font-black uppercase tracking-widest">Scenario</span></div>
          {SCENARIOS.map(s => (
            <button key={s.id} onClick={() => setScenarioId(s.id)} className={`w-full text-left p-3 rounded-xl border transition cursor-pointer ${scenarioId === s.id ? 'border-emerald-400/40 bg-emerald-400/5' : 'border-white/10 bg-white/[.02]'}`}>
              <div className="flex items-center justify-between"><span className="text-xs font-bold">{s.label}</span>{scenarioId === s.id && <ChevronRight className="w-4 h-4 text-emerald-400" />}</div>
              <p className="text-[10px] text-white/40 mt-1 leading-relaxed">{s.description}</p>
            </button>
          ))}
          <div className="border-t border-white/10 pt-3 text-[9px] font-mono text-white/35">
            Evidence available: {evidenceCounts} current feed items · {macroRisks.length} macro risks
          </div>
        </div>
      </div>

      <div className="bg-[#15181E] border border-white/10 rounded-2xl p-4 md:p-5 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-white/40">Historical analogue distribution · {meta.name} ({selectedStock})</div>
            <h2 className="text-2xl font-black uppercase italic mt-1">Next {HORIZONS.find(h => h.days === horizon)?.label}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {HORIZONS.map(item => <button key={item.days} onClick={() => setHorizon(item.days)} className={`px-3 py-2 rounded border text-[9px] font-mono font-bold cursor-pointer ${horizon === item.days ? 'bg-white text-black border-white' : 'bg-white/5 text-white/50 border-white/10'}`}>{item.label}</button>)}
          </div>
        </div>

        {loading && <div className="flex items-center gap-2 text-xs font-mono text-white/40"><Loader2 className="w-4 h-4 animate-spin" /> Loading 5-year market history…</div>}
        {!loading && error && <div className="text-xs font-mono text-amber-300 border border-amber-300/20 rounded-xl p-3">{error}</div>}

        {!loading && !error && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                ['Wider expected range low', analysis.p10],
                ['Likely range low', analysis.p25],
                ['Median', analysis.median],
                ['Likely range high', analysis.p75],
                ['Wider expected range high', analysis.p90],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-white/5 bg-black/10 p-3">
                  <div className="text-[8px] font-mono uppercase text-white/30">{label}</div>
                  <div className={`text-lg font-black font-mono mt-1 ${Number(value) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatReturn(Number(value))}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-rose-300/15 bg-rose-300/[.03] p-4 min-w-0">
                <div className="flex items-center gap-2 mb-3"><TrendingDown className="w-4 h-4 text-rose-300" /><span className="text-[9px] font-mono uppercase tracking-widest text-rose-200/70">Downside context</span></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Worst analogue</div><div className="text-sm font-mono font-bold mt-1 text-rose-300">{forecastRisk.worst == null ? '—' : formatReturn(forecastRisk.worst)}</div></div>
                  <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Negative outcomes</div><div className="text-sm font-mono font-bold mt-1">{forecastRisk.negativeCount}/{analysis.sample.length || 0}</div></div>
                </div>
                <p className="text-[9px] text-white/35 mt-3">Review the lower tail before interpreting the median. Historical outcomes are not a loss limit.</p>
              </div>
              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[.03] p-4 min-w-0">
                <div className="flex items-center gap-2 mb-3"><BarChart3 className="w-4 h-4 text-cyan-300" /><span className="text-[9px] font-mono uppercase tracking-widest text-cyan-200/70">Portfolio context</span></div>
                {portfolioLoadError ? <div className="text-[9px] font-mono text-amber-200/60">Portfolio context unavailable: {portfolioLoadError}</div> : portfolioContext.hasHolding ? <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Position weight</div><div className="text-sm font-mono font-bold mt-1">{(portfolioContext.weight * 100).toFixed(1)}%</div></div>
                  <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Related holdings</div><div className="text-sm font-mono font-bold mt-1">{portfolioContext.concentrationPeers.length}</div></div>
                  <div className="rounded-lg border border-white/5 bg-black/10 p-2 col-span-2"><div className="text-[8px] text-white/25 uppercase font-mono">Related exposure</div><div className="text-sm font-mono font-bold mt-1">{(portfolioContext.concentrationWeight * 100).toFixed(1)}% · {portfolioContext.concentrationPeers.join(', ') || 'none identified'}</div></div>
                </div> : <div className="text-[9px] text-white/35">No saved holding for {selectedStock}. Forecast is being shown without position context.</div>}
              </div>
              <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[.03] p-4 min-w-0 lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-amber-300" /><span className="text-[9px] font-mono uppercase tracking-widest text-amber-200/70">Decision context</span></div>
                {portfolioContext.hasHolding && <button onClick={() => setDecisionEditing(value => !value)} className="text-[8px] font-mono uppercase tracking-widest text-amber-200/70 hover:text-amber-100">{decisionEditing ? 'Close' : 'Edit rules'}</button>}
              </div>
              {portfolioContext.hasHolding && decisionEditing &&
                <div className="space-y-2">
                  <label className="block text-[8px] text-white/30 uppercase font-mono">Reason to own / thesis<textarea value={decisionDraft.thesis} onChange={e => setDecisionDraft(d => ({ ...d, thesis: e.target.value }))} rows={2} placeholder="Write the reason you own this holding." className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-[10px] text-white/70 outline-none" /></label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[8px] text-white/30 uppercase font-mono">Loss limit %<input value={decisionDraft.lossLimitPct} onChange={e => setDecisionDraft(d => ({ ...d, lossLimitPct: e.target.value }))} type="number" min="0" max="100" step="0.1" placeholder="e.g. 20" className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-[10px] text-white/70 outline-none" /></label>
                    <label className="block text-[8px] text-white/30 uppercase font-mono">Exit rule<select value={decisionDraft.exitRuleType} onChange={e => setDecisionDraft(d => ({ ...d, exitRuleType: e.target.value }))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-[10px] text-white/70 outline-none"><option value="trailing_stop">Trailing stop</option><option value="price_stop">Price stop</option><option value="thesis_break">Thesis break</option><option value="time_limit">Time limit</option><option value="custom">Custom</option></select></label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[8px] text-white/30 uppercase font-mono">Rule %<input value={decisionDraft.exitRuleValue} onChange={e => setDecisionDraft(d => ({ ...d, exitRuleValue: e.target.value }))} type="number" min="0" max="100" step="0.1" placeholder="e.g. 15 or 20" className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-[10px] text-white/70 outline-none" /></label>
                    <label className="block text-[8px] text-white/30 uppercase font-mono">Broker alert prices<input value={decisionDraft.brokerAlerts} onChange={e => setDecisionDraft(d => ({ ...d, brokerAlerts: e.target.value }))} placeholder="56.46, 84.68" className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-[10px] text-white/70 outline-none" /></label>
                  </div>
                  <label className="block text-[8px] text-white/30 uppercase font-mono">Exit rule / invalidation notes<textarea value={decisionDraft.exitRuleText} onChange={e => setDecisionDraft(d => ({ ...d, exitRuleText: e.target.value }))} rows={2} placeholder="Use closing price; gaps can skip the stop; document what invalidates the thesis." className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-[10px] text-white/70 outline-none" /></label>
                  <label className="block text-[8px] text-white/30 uppercase font-mono">Practical notes<textarea value={decisionDraft.practicalNotes} onChange={e => setDecisionDraft(d => ({ ...d, practicalNotes: e.target.value }))} rows={3} placeholder="Broker alerts, fractional-share limitations, review date, etc." className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-[10px] text-white/70 outline-none" /></label>
                  <div className="flex items-center justify-between gap-2"><button disabled={decisionSaving} onClick={saveDecisionContext} className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[8px] font-mono uppercase tracking-widest text-amber-100 disabled:opacity-40">{decisionSaving ? 'Saving…' : 'Save rules'}</button>{decisionMessage && <span className="text-[8px] font-mono text-white/45">{decisionMessage}</span>}</div>
                </div>
              }
              {(!portfolioContext.hasHolding || !decisionEditing) &&
                <div>
                  <div className="text-[8px] text-white/25 uppercase font-mono">Recorded thesis</div>
                  <div className="text-[10px] text-white/65 mt-1 leading-relaxed">{portfolioContext.holding?.decisionThesis || portfolioContext.thesis || 'No thesis recorded. Forecast does not invent a reason to own the stock.'}</div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Loss limit</div><div className="text-[9px] font-mono text-white/45 mt-1">{portfolioContext.holding?.lossLimitPct == null ? 'Not recorded' : portfolioContext.holding.lossLimitPct + '%'}</div></div>
                    <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Exit rule</div><div className="text-[9px] font-mono text-white/45 mt-1">{portfolioContext.holding?.exitRuleType ? ((portfolioContext.holding.exitRuleType.replace('_', ' ')) + (portfolioContext.holding.exitRuleValue != null ? ' · ' + portfolioContext.holding.exitRuleValue + '%' : '')) : 'Not recorded'}</div></div>
                  </div>
                  {portfolioContext.holding?.brokerAlertPrices?.length ? <div className="text-[8px] font-mono text-white/35 mt-2">Broker alerts: {portfolioContext.holding.brokerAlertPrices.map(price => formatPrice(price)).join(', ')}</div> : null}
                  {portfolioContext.holding?.practicalNotes ? <div className="text-[9px] text-white/45 mt-2 leading-relaxed">{portfolioContext.holding.practicalNotes}</div> : null}
                </div>
              }
              </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-[#0F1115] p-4">
                <div className="flex items-center gap-2 mb-3"><CalendarRange className="w-4 h-4 text-emerald-300" /><span className="text-[9px] font-mono uppercase tracking-widest text-white/40">Next 20 days</span></div>
                {portfolioContext.upcoming.length ? <div className="space-y-2">{portfolioContext.upcoming.map((event, index) => <div key={event.date + event.title + index} className="flex gap-3 rounded-lg border border-white/5 bg-black/10 p-2 text-[9px] font-mono"><span className="text-white/30 shrink-0">{event.date}</span><span className="text-white/60">{event.title}</span></div>)}</div> : <div className="text-[9px] text-white/35">No dated contract, news, or policy events in the next 20 calendar days were found in the supplied evidence feeds.</div>}
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#0F1115] p-4">
                <div className="flex items-center gap-2 mb-3"><ShieldAlert className="w-4 h-4 text-amber-300" /><span className="text-[9px] font-mono uppercase tracking-widest text-white/40">Forecast reliability & invalidation</span></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Sample</div><div className="text-sm font-mono font-bold mt-1">{analysis.sample.length}</div></div>
                  <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Confidence</div><div className="text-sm font-mono font-bold mt-1">{analysis.confidence}</div></div>
                  <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Current evidence</div><div className="text-sm font-mono font-bold mt-1">{evidenceCounts}</div></div>
                  <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Macro load</div><div className="text-sm font-mono font-bold mt-1">{macroLoad}/100</div></div>
                </div>
                <p className="text-[9px] text-white/35 mt-3 leading-relaxed">Treat the historical distribution as less applicable if the current thesis changes, evidence conflicts materially, or near-term catalysts dominate the historical analogue. No exit rule is inferred by the system.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-[#0F1115] p-4 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-white/35">Outcome range from historical analogues</span>
                  <span className="text-[9px] font-mono text-white/35">{analysis.analogueCount || analysis.allCount} observations</span>
                </div>
                <div className="relative h-16 rounded-lg bg-white/[.03] border border-white/5">
                  <div className="absolute top-0 bottom-0 left-[10%] border-l border-white/10" />
                  <div className="absolute top-0 bottom-0 left-1/2 border-l border-white/10" />
                  <div className="absolute top-0 bottom-0 right-[10%] border-l border-white/10" />
                  <div className="absolute top-1/2 left-[10%] right-[10%] h-2 -translate-y-1/2 rounded bg-emerald-400/20" />
                  <div className="absolute top-1/2 left-1/4 right-1/4 h-4 -translate-y-1/2 rounded border border-emerald-400/30" />
                  <div className="absolute top-1/2 left-1/2 w-2 h-6 -translate-y-1/2 -translate-x-1/2 bg-white rounded" />
                </div>
                <div className="flex justify-between text-[8px] font-mono text-white/25 mt-1"><span>Downside tail</span><span>Historical median</span><span>Upside tail</span></div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#0F1115] p-4 space-y-3 min-w-0">
                <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-cyan-300" /><span className="text-[9px] font-mono uppercase tracking-widest text-white/40">Model diagnostics</span></div>
                <div className="text-sm font-bold">{analysis.confidence} confidence</div>
                <div className="text-[10px] text-white/45">Positive historical outcomes: {(analysis.positive * 100).toFixed(0)}%</div>
                <div className="text-[10px] text-white/45">Analogue matches: {analysis.analogueCount}</div>
                <div className="text-[10px] text-white/45">Baseline observations: {analysis.allCount}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <div className="flex items-center gap-2 mb-2"><CalendarRange className="w-4 h-4 text-emerald-400" /><span className="text-[9px] font-mono uppercase tracking-widest text-white/40">Interpretation</span></div>
              <p className="text-xs text-white/65 leading-relaxed">
                Under <strong className="text-white">{selectedScenario.label}</strong>, the historical analogue set produced a typical expected move of {formatReturn(analysis.median)} over the selected horizon, with the Likely range spanning {formatReturn(analysis.p25)} to {formatReturn(analysis.p75)}. The model found {analysis.analogueCount} close historical regimes.
              </p>
              <p className="text-[9px] font-mono text-white/30 mt-2">This is a historical distribution, not a promise, target price, or investment recommendation.</p>
            </div>

            <div className="rounded-2xl border border-violet-400/20 bg-violet-400/[.04] p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-4 h-4 text-violet-300" />
                    <span className="text-[9px] font-mono uppercase tracking-widest text-violet-200/70">JEV evidence & context</span>
                  </div>
                  <p className="text-[10px] text-white/45 max-w-3xl">JEV does not generate the numerical forecast. It evaluates current evidence around the historical result and flags support, conflict, or insufficient evidence.</p>
                </div>
                <button onClick={runJevEvidenceCheck} disabled={jevLoading} className="shrink-0 px-4 py-2.5 rounded border border-violet-300/30 bg-violet-300/10 text-violet-100 text-[9px] font-mono font-black uppercase tracking-wider disabled:opacity-50">{jevLoading ? 'JEV CHECKING…' : 'Run JEV Evidence Check'}</button>
              </div>
              {jevError && <div className="mt-3 text-[10px] font-mono text-amber-300 border border-amber-300/20 rounded-xl p-3">{jevError}</div>}
              {jevResult && <div className="mt-4 space-y-3">
                <div className="text-sm text-white/75 leading-relaxed">{jevResult.summary}</div>
                <div className="flex flex-wrap gap-2">
                  {jevResult.choice && <span className="px-2 py-1 rounded border border-violet-300/20 bg-violet-300/5 text-[9px] font-mono text-violet-100">JEV route: {jevResult.choice}</span>}
                  {jevResult.evidenceGate && <span className="px-2 py-1 rounded border border-white/10 bg-white/5 text-[9px] font-mono text-white/60">Evidence gate: {jevResult.evidenceGate}</span>}
                  {jevResult.rawScore != null && <span className="px-2 py-1 rounded border border-violet-300/20 bg-violet-300/5 text-[9px] font-mono text-violet-100">JEV evidence quality: {jevResult.rawScore.toFixed(2)} / 3</span>}
                  {jevResult.evidenceQuality != null && <span className="px-2 py-1 rounded border border-white/10 bg-white/5 text-[9px] font-mono text-white/60">Evidence quality: {jevResult.evidenceQuality.toFixed(0)} / 100</span>}
                  {jevResult.confidence != null && <span className="px-2 py-1 rounded border border-white/10 bg-white/5 text-[9px] font-mono text-white/60">JEV confidence: {jevResult.confidence.toFixed(2)} / 1</span>}
                  {jevResult.answer_source && <span className="px-2 py-1 rounded border border-white/10 bg-white/5 text-[9px] font-mono text-white/60">Source: {jevResult.answer_source}</span>}
                </div>
              </div>}
            </div>

              {jevResult && (
                <div className="mt-4 space-y-3">
                  <div className="text-sm text-white/75 leading-relaxed">{jevResult.summary}</div>
                  <div className="flex flex-wrap gap-2">
                    {jevResult.choice && <span className="px-2 py-1 rounded border border-violet-300/20 bg-violet-300/5 text-[9px] font-mono text-violet-100">JEV route: {jevResult.choice}</span>}
                    {jevResult.evidenceGate && <span className="px-2 py-1 rounded border border-white/10 bg-white/5 text-[9px] font-mono text-white/60">Evidence gate: {jevResult.evidenceGate}</span>}
                    {jevResult.rawScore != null && <span className="px-2 py-1 rounded border border-violet-300/20 bg-violet-300/5 text-[9px] font-mono text-violet-100">JEV evidence quality: {jevResult.rawScore.toFixed(2)} / 3</span>}
                    {jevResult.evidenceQuality != null && <span className="px-2 py-1 rounded border border-white/10 bg-white/5 text-[9px] font-mono text-white/60">Evidence quality: {jevResult.evidenceQuality.toFixed(0)} / 100</span>}
                    {jevResult.confidence != null && <span className="px-2 py-1 rounded border border-white/10 bg-white/5 text-[9px] font-mono text-white/60">JEV confidence: {jevResult.confidence.toFixed(2)} / 1</span>}
                    {jevResult.answer_source && <span className="px-2 py-1 rounded border border-white/10 bg-white/5 text-[9px] font-mono text-white/60">Source: {jevResult.answer_source}</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

            {forecastAnalytics && forecastAnalytics.sampleSize > 0 && (
        <div className="rounded-2xl border border-cyan-400/10 bg-cyan-400/[.02] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-[9px] font-mono uppercase tracking-widest text-cyan-200/70">Forecast validation analytics</div><p className="text-[10px] text-white/35 mt-1">Verified forecasts aggregated by ticker, horizon, scenario and model.</p></div><span className="text-[9px] font-mono text-white/40">Verified {forecastAnalytics.sampleSize}</span></div>
          <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">50+ validation gate</div><div className="text-sm font-mono font-bold mt-1">{forecastValidationGate(forecastAnalytics?.validationGate?.verifiedCount ?? forecastAnalytics?.sampleSize ?? 0).ready ? 'READY' : 'BUILDING'}</div></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Sample status</div><div className="text-sm font-mono font-bold mt-1">{forecastAnalytics.sampleStatus ? forecastAnalytics.sampleStatus.replace('-', ' ') : 'insufficient'}</div></div>
            <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Groups</div><div className="text-sm font-mono font-bold mt-1">{forecastAnalytics.byTickerHorizon.length}</div></div>
            <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Correct direction</div><div className="text-sm font-mono font-bold mt-1">{forecastAnalytics.directionalAccuracyPct == null ? '—' : forecastAnalytics.directionalAccuracyPct.toFixed(1) + '%'}</div></div>
            <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Models</div><div className="text-sm font-mono font-bold mt-1">{forecastAnalytics.byModel.length}</div></div>
            <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Scenarios</div><div className="text-sm font-mono font-bold mt-1">{forecastAnalytics.byScenario.length}</div></div>
            <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Typical error</div><div className="text-sm font-mono font-bold mt-1">{forecastAnalytics.medianAbsoluteError == null ? '—' : forecastAnalytics.medianAbsoluteError.toFixed(1) + ' pp'}</div></div>
            <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Bias</div><div className="text-sm font-mono font-bold mt-1">{forecastAnalytics.meanSignedErrorPct == null ? '—' : (forecastAnalytics.meanSignedErrorPct >= 0 ? '+' : '') + forecastAnalytics.meanSignedErrorPct.toFixed(1) + ' pp'}</div></div>
          </div>
          <div className="text-[9px] font-mono text-white/35">{forecastAnalytics.validationGate?.verifiedCount || forecastAnalytics.sampleSize} verified forecasts · minimum validation sample: {forecastAnalytics.validationGate?.minimumRequired || FORECAST_VALIDATION_MINIMUM}</div>
          <div className="overflow-x-auto"><table className="min-w-full text-left text-[9px] font-mono"><thead className="text-white/25 uppercase"><tr><th className="px-2 py-1.5">Ticker</th><th className="px-2 py-1.5">Horizon</th><th className="px-2 py-1.5">N</th><th className="px-2 py-1.5">Direction</th><th className="px-2 py-1.5">Typical prediction error</th><th className="px-2 py-1.5">Likely range</th></tr></thead><tbody className="divide-y divide-white/5">{forecastAnalytics.byTickerHorizon.slice(0,12).map((row,index)=><tr key={String(row.ticker)+String(row.horizon)+index}><td className="px-2 py-1.5 text-white/65">{row.ticker || '—'}</td><td className="px-2 py-1.5 text-white/45">{row.horizon ? row.horizon+'D' : '—'}</td><td className="px-2 py-1.5 text-white/45">{row.count}</td><td className="px-2 py-1.5 text-white/55">{row.directionalAccuracyPct == null ? '—' : row.directionalAccuracyPct.toFixed(1)+'%'}</td><td className="px-2 py-1.5 text-white/55">{row.medianAbsoluteError == null ? '—' : row.medianAbsoluteError.toFixed(2)+'%'}</td><td className="px-2 py-1.5 text-white/55">{row.p25p75CoveragePct == null ? '—' : row.p25p75CoveragePct.toFixed(1)+'%'}</td></tr>)}</tbody></table></div>
        </div>
      )}
<div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[.03] p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div><div className="text-[9px] font-mono uppercase tracking-widest text-cyan-200/70">Forecast verification</div>
          <p className="text-[10px] text-white/45 mt-1">Save the current forecast, then compare it with the real market return after the selected trading horizon. Automatic verification runs on the scheduled backend job after deployment.</p></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={trackForecast} disabled={!currentPrice || analysis.confidence === 'Insufficient'} className="px-3 py-2 rounded border border-cyan-300/30 bg-cyan-300/10 text-cyan-100 text-[9px] font-mono font-black uppercase disabled:opacity-40">Track this forecast</button>
            <button onClick={verifyDueForecasts} disabled={verificationBusy} className="px-3 py-2 rounded border border-white/10 bg-white/5 text-white/70 text-[9px] font-mono font-black uppercase disabled:opacity-40">{verificationBusy ? 'VERIFYING…' : 'Verify due forecasts'}</button>
          </div>
        </div>
        {verificationMessage && <div className="text-[10px] font-mono text-cyan-200/80 border border-cyan-300/10 rounded-xl p-2">{verificationMessage}</div>}
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1 aiw-scroll-region">{forecasts.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 10).map(f => (
          <div key={f.id} className="rounded-xl border border-white/5 bg-black/10 p-3 text-[9px] font-mono">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-white/55"><span>{f.ticker}</span><span>{f.horizon} trading days</span><span>Target trading date {f.targetDate}</span><span>Entry ${formatPrice(f.entryPrice)}</span><span className={f.status === 'verified' ? 'text-cyan-200' : 'text-amber-200'}>{f.status}</span></div>
            <div className="mt-1 text-white/40">Typical expected move {formatReturn(f.median)} · Likely range {formatReturn(f.p25)} to {formatReturn(f.p75)}{f.status === 'verified' && f.actualReturn != null ? ' · actual ' + formatReturn(f.actualReturn) + ' on ' + f.actualDate : ''}</div>
            {f.evidenceSnapshot && <div className="mt-1 text-white/30">Creation evidence: {f.evidenceSnapshot.analystConsensus.status} analyst evidence · {f.evidenceSnapshot.counts.news + f.evidenceSnapshot.counts.contracts + f.evidenceSnapshot.counts.political + f.evidenceSnapshot.counts.macro} event/context items · captured {new Date(f.evidenceSnapshot.capturedAt).toLocaleString()}</div>}
            {(f.exitRuleType || f.lossLimitPct != null || f.practicalNotes) && <div className="mt-2 text-white/30">Rule: {f.exitRuleType ? f.exitRuleType.replace('_', ' ') : 'not recorded'}{f.exitRuleValue != null ? ' · ' + f.exitRuleValue + '%' : ''}{f.lossLimitPct != null ? ' · loss limit ' + f.lossLimitPct + '%' : ''}{f.practicalNotes ? ' · notes saved' : ''}</div>}
          </div>
        ))}</div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/10 bg-[#15181E]/60 p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-cyan-300" />
            <span className="text-[9px] font-mono uppercase tracking-widest text-white/40">Live forecast accuracy</span>
          </div>
          <p className="text-[10px] text-white/40 mb-3">Only forecasts that have reached their target date and been verified against market history are counted here. Direction, error, bias, and coverage are descriptive while the sample is below 50; the validation gate is considered established only at 50+ verified forecasts.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Verified</div><div className="text-sm font-mono font-bold mt-1">{forecasts.filter(f => f.status === 'verified').length}</div></div>
            <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Pending</div><div className="text-sm font-mono font-bold mt-1">{forecasts.filter(f => f.status === 'pending').length}</div></div>
            <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Direction</div><div className="text-sm font-mono font-bold mt-1">{(() => { const v=forecasts.filter(f=>f.status==='verified' && f.actualReturn != null && f.median !== 0); return v.length ? (v.filter(f=>Math.sign(f.median)===Math.sign(f.actualReturn!)).length/v.length*100).toFixed(0)+'%' : '—'; })()}</div></div>
            <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Typical prediction error</div><div className="text-sm font-mono font-bold mt-1">{(() => { const v=forecasts.filter(f=>f.status==='verified' && f.medianError != null).map(f=>Math.abs(f.medianError!)); return v.length ? percentile(v,0.5).toFixed(1)+' pp' : '—'; })()}</div></div>
          </div>
          {forecastAnalytics?.evidenceCoverage && (
            <div className="mt-3 rounded-xl border border-white/5 bg-black/10 p-3">
              <div className="text-[8px] font-mono uppercase tracking-widest text-white/25">Creation-time evidence coverage</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-[9px] font-mono">
                <div><span className="text-white/30">Snapshots</span><span className="ml-2 text-white/70">{forecastAnalytics?.evidenceCoverage.forecastsWithSnapshot}</span></div>
                <div><span className="text-white/30">Analyst</span><span className="ml-2 text-white/70">{forecastAnalytics?.evidenceCoverage.analystAvailable}</span></div>
                <div><span className="text-white/30">News</span><span className="ml-2 text-white/70">{forecastAnalytics?.evidenceCoverage.withNews}</span></div>
                <div><span className="text-white/30">Multi-channel</span><span className="ml-2 text-white/70">{forecastAnalytics?.evidenceCoverage.multiChannel}</span></div>
              </div>
              <div className="mt-2 text-[8px] text-white/25">Descriptive coverage of evidence captured when forecasts were created; it does not measure forecast quality or imply that any evidence caused an outcome.</div>
            </div>
          )}

          <div className="mt-3 rounded-xl border border-white/5 bg-black/10 p-3">
            <div className="text-[9px] font-mono uppercase tracking-widest text-white/35 mb-2">
              {forecastValidationGate(forecastAnalytics?.validationGate?.verifiedCount ?? forecastAnalytics?.sampleSize ?? 0).ready
                ? 'Validation gate passed · 50+ verified forecasts'
                : 'Validation gate building · 50 verified forecasts required'}
            </div>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <div className="text-[8px] font-mono uppercase tracking-widest text-white/30">Verification drift monitor</div>
                <div className="text-[9px] text-white/35 mt-1">
                  Heuristic comparison of the newest half of verified forecasts for the selected ticker and horizon with the older half. Requires at least 10 verified forecasts.
                </div>
              </div>
              <span className="px-2 py-1 rounded-full border border-white/10 text-[9px] font-mono uppercase text-white/55">
                {verificationDrift.state === 'drift-signal' ? 'DRIFT SIGNAL' : verificationDrift.state === 'watch' ? 'WATCH' : verificationDrift.state === 'limited' ? 'LIMITED SAMPLE' : 'STABLE'}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
              <div><div className="text-[8px] text-white/20 uppercase font-mono">Recent error</div><div className="text-[10px] font-mono font-bold mt-1">{verificationDrift.recentMedianAbsError == null ? '—' : verificationDrift.recentMedianAbsError.toFixed(1) + ' pp'}</div></div>
              <div><div className="text-[8px] text-white/20 uppercase font-mono">Prior error</div><div className="text-[10px] font-mono font-bold mt-1">{verificationDrift.priorMedianAbsError == null ? '—' : verificationDrift.priorMedianAbsError.toFixed(1) + ' pp'}</div></div>
              <div><div className="text-[8px] text-white/20 uppercase font-mono">Error change</div><div className="text-[10px] font-mono font-bold mt-1">{verificationDrift.errorChange == null ? '—' : (verificationDrift.errorChange >= 0 ? '+' : '') + verificationDrift.errorChange.toFixed(0) + '%'}</div></div>
              <div><div className="text-[8px] text-white/20 uppercase font-mono">Verified sample</div><div className="text-[10px] font-mono font-bold mt-1">{verificationDrift.sampleSize}</div></div>
            </div>
            <div className="mt-2 text-[8px] font-mono uppercase text-white/20">
              Recent direction {verificationDrift.recentDirection == null ? '—' : (verificationDrift.recentDirection * 100).toFixed(0) + '%'} · prior direction {verificationDrift.priorDirection == null ? '—' : (verificationDrift.priorDirection * 100).toFixed(0) + '%'} · heuristic: ≥25% error increase = watch, ≥50% = drift signal.
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#15181E]/60 p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-300" /><span className="text-[9px] font-mono uppercase tracking-widest text-white/40">Historical backtest</span></div>
              <p className="text-[10px] text-white/40 mt-1">Replay the same analogue method on past dates without using information from the future.</p>
            </div>
            <button onClick={runBacktest} disabled={backtestBusy || loading || history.length < 220 + horizon} className="px-3 py-2 rounded border border-emerald-300/20 bg-emerald-300/10 text-emerald-100 text-[9px] font-mono font-black uppercase disabled:opacity-40">{backtestBusy ? 'BACKTESTING…' : 'RUN BACKTEST'}</button>
          </div>
          {backtestMessage && <div className="text-[10px] font-mono text-emerald-200/80 border border-emerald-300/10 rounded-xl p-2 mb-3">{backtestMessage}</div>}
          {backtest ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-violet-300/20 bg-violet-300/5 p-3">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="text-[9px] font-mono uppercase tracking-widest text-violet-200/80">JEV validation analyst</div>
                    <p className="text-[10px] text-white/45 mt-1">JEV interprets the measured backtest; it cannot change the numerical results. It identifies evidence gaps, caveats, and the next validation experiment.</p>
                  </div>
                  <button onClick={runJevBacktestValidation} disabled={jevValidationBusy} className="px-3 py-2 rounded border border-violet-300/30 bg-violet-300/10 text-violet-100 text-[9px] font-mono font-black uppercase disabled:opacity-40">{jevValidationBusy ? 'JEV ANALYZING…' : 'RUN JEV VALIDATION'}</button>
                </div>
                {jevValidationError && <div className="mt-2 text-[10px] font-mono text-amber-200 border border-amber-300/10 rounded-lg p-2">{jevValidationError}</div>}
                {jevValidation && <div className="mt-3 space-y-2">
                  <div className="text-xs text-white/70 leading-relaxed">{jevValidation.summary}</div>
                  <div className="flex flex-wrap gap-2 text-[9px] font-mono uppercase">
                    {jevValidation.choice && <span className="px-2 py-1 rounded border border-violet-300/20 text-violet-200">JEV route: {jevValidation.choice}</span>}
                    {jevValidation.evidenceGate && <span className="px-2 py-1 rounded border border-cyan-300/20 text-cyan-200">Evidence gate: {jevValidation.evidenceGate}</span>}
                    {jevValidation.confidence != null && <span className="px-2 py-1 rounded border border-white/10 text-white/50">Confidence: {typeof jevValidation.confidence === 'number' ? jevValidation.confidence.toFixed(2) : jevValidation.confidence}</span>}
                    {jevValidation.answerSource && <span className="px-2 py-1 rounded border border-white/10 text-white/40">Source: {jevValidation.answerSource}</span>}
                  </div>
                </div>}
              </div>
              <div className="text-[9px] font-mono text-white/35 uppercase">{selectedStock} · {HORIZONS.find(h => h.days === horizon)?.label} · {backtest.rows.length} historical tests · base regime</div>
              <div className="text-[9px] font-mono text-violet-200/60 uppercase">Active forecast model: {modelVersion}{modelConfig?.validation_tests ? ' · validated on ' + modelConfig.validation_tests + ' tests' : ''}</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Correct direction</div><div className="text-sm font-mono font-bold mt-1">{(backtest.directionalAccuracy*100).toFixed(0)}%</div></div>
                <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Typical prediction error</div><div className="text-sm font-mono font-bold mt-1">{backtest.medianAbsoluteError.toFixed(1)} pp</div></div>
                <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Likely range coverage</div><div className="text-sm font-mono font-bold mt-1">{(backtest.p25p75Coverage*100).toFixed(0)}%</div></div>
                <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Wider expected range coverage</div><div className="text-sm font-mono font-bold mt-1">{(backtest.p10p90Coverage*100).toFixed(0)}%</div></div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Baseline correct direction</div><div className="text-sm font-mono font-bold mt-1">{(backtest.baselineDirectionalAccuracy*100).toFixed(0)}%</div></div>
                <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Correct-direction lift</div><div className="text-sm font-mono font-bold mt-1">{backtest.directionalLift >= 0 ? '+' : ''}{(backtest.directionalLift*100).toFixed(0)} pp</div></div>
                <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Error lift</div><div className="text-sm font-mono font-bold mt-1">{backtest.errorLift >= 0 ? '+' : ''}{backtest.errorLift.toFixed(1)} pp</div></div>
                <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Calibration gap</div><div className="text-sm font-mono font-bold mt-1">{(backtest.p25CalibrationGap*100).toFixed(0)} / {(backtest.p90CalibrationGap*100).toFixed(0)} pp</div></div>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                {backtest.rows.slice(-8).reverse().map(row => (
                  <div key={row.asOfDate} className="flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-white/5 bg-black/5 px-2 py-1.5 text-[9px] font-mono text-white/45">
                    <span>{row.asOfDate} → {row.targetDate}</span>
                    <span>Typical expected move {formatReturn(row.median)}</span>
                    <span>Actual {formatReturn(row.actual)}</span>
                    <span className={row.actual >= row.p25 && row.actual <= row.p75 ? 'text-cyan-200' : 'text-amber-200'}>{row.actual >= row.p25 && row.actual <= row.p75 ? 'Likely range' : 'outside Likely range'}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="text-[10px] text-white/30 font-mono">Run the backtest to validate the historical analogue method for {selectedStock} at the selected horizon.</div>}
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[.03] p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-emerald-200/80">Cross-ticker validation matrix</div>
            <p className="text-[10px] text-white/45 mt-1">Runs the same backtest across 8 AI/technology tickers and all 5 horizons. This is a validation summary, not a ranking.</p>
          </div>
          <button onClick={runValidationMatrix} disabled={matrixBusy} className="px-3 py-2 rounded border border-emerald-300/30 bg-emerald-300/10 text-emerald-100 text-[9px] font-mono font-black uppercase disabled:opacity-40">{matrixBusy ? 'RUNNING MATRIX…' : 'RUN VALIDATION MATRIX'}</button>
        </div>
        {matrixMessage && <div className="mt-3 text-[10px] font-mono text-emerald-200/80 border border-emerald-300/10 rounded-xl p-2">{matrixMessage}</div>}
        {matrix && <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">

          <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Tests</div><div className="text-sm font-mono font-bold mt-1">{matrix.tests}</div></div>
          <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Avg direction</div><div className="text-sm font-mono font-bold mt-1">{(matrix.direction*100).toFixed(0)}%</div></div>
          <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Avg typical prediction error</div><div className="text-sm font-mono font-bold mt-1">{matrix.error.toFixed(1)} pp</div></div>
          <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Avg likely-range coverage</div><div className="text-sm font-mono font-bold mt-1">{(matrix.coverage50*100).toFixed(0)}%</div></div>
          <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Avg wider-range coverage</div><div className="text-sm font-mono font-bold mt-1">{(matrix.coverage80*100).toFixed(0)}%</div></div>
          <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Baseline correct direction</div><div className="text-sm font-mono font-bold mt-1">{(matrix.baselineDirection*100).toFixed(0)}%</div></div>
          <div className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/25 uppercase font-mono">Baseline error</div><div className="text-sm font-mono font-bold mt-1">{matrix.baselineError.toFixed(1)} pp</div></div>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-[9px] font-mono"><thead><tr className="text-white/30 border-b border-white/5"><th className="text-left p-2">Ticker</th><th className="text-left p-2">Horizon</th><th className="text-right p-2">Tests</th><th className="text-right p-2">Direction</th><th className="text-right p-2">Baseline</th><th className="text-right p-2">Error</th><th className="text-right p-2">Likely range</th></tr></thead><tbody>{matrix.details.map(row => <tr key={row.ticker + '-' + row.horizon} className="border-b border-white/5 text-white/55"><td className="p-2 text-white/75">{row.ticker}</td><td className="p-2">{row.horizon}D</td><td className="p-2 text-right">{row.tests}</td><td className="p-2 text-right">{(row.direction*100).toFixed(0)}%</td><td className="p-2 text-right">{(row.baselineDirection*100).toFixed(0)}%</td><td className="p-2 text-right">{row.error.toFixed(1)}</td><td className="p-2 text-right">{(row.coverage50*100).toFixed(0)}%</td></tr>)}</tbody></table></div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">{matrix.calibration.map(bucket => <div key={bucket.bucket} className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] text-white/30">{bucket.bucket}</div><div className="text-xs font-mono font-bold mt-1">{bucket.n ? (bucket.observedPositiveRate! * 100).toFixed(0) + '%' : '—'}</div><div className="text-[8px] text-white/35">{bucket.n} tests · gap {bucket.calibrationErrorPct == null ? '—' : (bucket.calibrationErrorPct >= 0 ? '+' : '') + bucket.calibrationErrorPct.toFixed(0) + ' pp'}</div></div>)}</div>
        </div>}
      </div>

      {backtest && backtest.calibration.length > 0 && (
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[.025] p-4">
          <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-cyan-300" /><div><div className="text-[9px] font-mono uppercase tracking-widest text-cyan-200/80">Forecast validation · calibration</div><div className="text-[10px] text-white/40 mt-1">Directional confidence is measured against realized positive outcomes. This describes historical calibration; it does not modify the forecast.</div></div></div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mt-3">
            {backtest.calibration.map(bucket => <div key={bucket.bucket} className="rounded-lg border border-white/5 bg-black/10 p-2"><div className="text-[8px] font-mono text-white/30">{bucket.bucket}</div><div className="text-xs font-mono font-bold mt-1">{bucket.n ? (bucket.observedPositiveRate! * 100).toFixed(0) + '%' : '—'} <span className="text-white/30">vs {bucket.predictedPct.toFixed(0)}%</span></div><div className="text-[8px] text-white/35 mt-1">{bucket.n} tests · gap {bucket.calibrationErrorPct == null ? '—' : (bucket.calibrationErrorPct >= 0 ? '+' : '') + bucket.calibrationErrorPct.toFixed(0) + ' pp'}</div></div>)}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/10 bg-[#15181E]/60 p-4">
          <div className="flex items-center gap-2 mb-3"><TrendingUp className="w-4 h-4 text-emerald-400" /><span className="text-[9px] font-mono uppercase tracking-widest text-white/40">What drives the analogue</span></div>
          <ul className="space-y-2 text-xs text-white/55">
            <li>• 20-day momentum: <span className="text-white">{formatReturn(metrics.momentum)}</span></li>
            <li>• Annualized volatility: <span className="text-white">{metrics.volatility.toFixed(1)}%</span></li>
            <li>• Current daily move: <span className="text-white">{formatReturn(metrics.dailyChange)}</span></li>
            <li>• 1-year move: <span className="text-white">{formatReturn(metrics.oneYear)}</span></li>
          </ul>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#15181E]/60 p-4">
          <div className="flex items-center gap-2 mb-3"><ShieldAlert className="w-4 h-4 text-amber-300" /><span className="text-[9px] font-mono uppercase tracking-widest text-white/40">Scenario caveat</span></div>
          <p className="text-xs text-white/55 leading-relaxed">The scenario controls are transparent stress adjustments. They do not claim to know the future. The strongest output is the historical distribution and its evidence trail.</p>
        </div>
      </div>
    </div>
  );
}