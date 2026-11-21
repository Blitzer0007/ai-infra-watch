import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, CircleDollarSign, ShieldAlert, Target } from 'lucide-react';
import { authFetch } from '../utils/apiAuth';
import DecisionJournalPanel from './DecisionJournalPanel';

type ActionItem = {
  severity: 'ACT' | 'WATCH' | 'SETUP';
  symbol: string;
  title: string;
  detail: string;
  impact: number | null;
  explanation?: { origin: string; title: string; detail: string; evidenceStatus: string };
};

type DecisionData = {
  ok?: boolean;
  checkedAt?: string;
  actionItems?: ActionItem[];
  rules?: {
    total: number;
    breached: number;
    near: number;
    noRule: number;
    noData: number;
    invalidConfig?: number;
    incomplete?: number;
    evaluated?: number;
    configurationIssues?: Array<{symbol:string;issues:string[]}>;
  };
  portfolio?: {
    holdings: number;
    currentValue: number | null;
    netContributed: number | null;
    cashFlowPnl: number | null;
    totalTradingPnl?: number | null;
    accountingStatus?: string;
    accountingReconciled?: boolean;
    accountingIssues?: Array<{code:string;symbol:string|null;message:string}>;
    concentrationTop3Pct: number | null;
    semiconductorShock15Pct: number | null;
    scenarioShockTotal?: number | null;
    quoteCoverage?: { status: string; coveragePct: number | null; liveQuotes: number; staleFallbacks: number; missingQuotes: number };
    riskScenarios?: Array<{ group: string; shock: number; effectiveShockPct: number | null; holdings: number }>;
  };
  benchmark?: Record<string, { value: number | null; netDeposits: number; pnl: number | null; shares: number; coverage?: { status: string; coveragePct: number; tradesUsed: number; totalTrades: number } }>;
  benchmarkCoverage?: Record<string, { status?: string; coveragePct?: number } | null>;
  earningsStatus?: string;
  earnings?: Array<{ symbol: string; date: string; daysUntil: number; hour?: string | null }>;
  forecast?: {
    verified: number;
    pending: number;
    due: number;
    remaining: number;
    tickers: number;
    dates: number;
    distinctTickerDates: number;
    independentVerified?: number;
    independenceWindowBusinessDays?: number;
    gate: string;
    independent5D?: number;
    independent20D?: number;
    independenceRule?: string;
  };
  signalGate?: {
    eligible: number;
    experimental: number;
    retired: number;
    families: Array<{ signalType: string; samples: number; meanExcessPct: number | null; lifecycle: string; decisionEligible: boolean }>;
    note: string;
  };
  notes?: string[];
  error?: string;
};

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  const amount = Math.abs(value);
  return (value < 0 ? '−$' : '$') + (amount > 0 && amount < .005 ? amount.toExponential(3) : amount.toFixed(2));
}
function signedMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  const amount = Math.abs(value);
  return (value >= 0 ? '+$' : '−$') + (amount > 0 && amount < .005 ? amount.toExponential(3) : amount.toFixed(2));
}

function evaluatedRuleCount(rules: DecisionData['rules']) {
  if (!rules || !Number.isSafeInteger(rules.total) || rules.total < 0 || !Number.isSafeInteger(rules.evaluated) || rules.evaluated! < 0) return null;
  const unresolved = [rules.noRule, rules.noData, rules.invalidConfig ?? 0, rules.incomplete ?? 0];
  if (unresolved.some(value => !Number.isSafeInteger(value) || value < 0) || rules.evaluated! + unresolved.reduce((a,b) => a+b,0) !== rules.total) return null;
  return rules.evaluated!;
}

function readDecisionResponse(body: DecisionData): DecisionData {
  if (!body || body.ok !== true || !body.rules || !body.portfolio ||
      !Number.isSafeInteger(body.rules.total) || body.rules.total < 0 ||
      !Number.isSafeInteger(body.portfolio.holdings) || body.portfolio.holdings < 0 ||
      !Array.isArray(body.actionItems) || body.actionItems.some(item =>
        !item || !['ACT', 'WATCH', 'SETUP'].includes(item.severity) ||
        typeof item.symbol !== 'string' || typeof item.title !== 'string' || typeof item.detail !== 'string')) {
    throw new Error('Decision response is incomplete. Try refreshing the page.');
  }
  return body;
}

export default function DecisionImpactCenter({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [data, setData] = useState<DecisionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    authFetch('/api/decision-center', { cache: 'no-store' })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Decision center unavailable');
        return readDecisionResponse(body);
      })
      .then(body => { if (!cancelled) setData(body); })
      .catch(error => { if (!cancelled) setData({ error: error instanceof Error ? error.message : 'Decision center unavailable' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    const timer = setInterval(() => {
      authFetch('/api/decision-center', { cache: 'no-store' })
        .then(response => response.ok ? response.json() : null)
        .then(body => { if (!cancelled && body?.ok) setData(readDecisionResponse(body)); })
        .catch(() => {});
    }, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  if (loading) {
    return <section className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[.025] p-4" data-testid="decision-impact-center">
      <div className="text-[9px] font-mono uppercase tracking-[.2em] text-cyan-300">Decision impact center</div>
      <div className="mt-2 h-5 w-56 rounded bg-white/5 animate-pulse" />
    </section>;
  }

  if (!data?.ok) {
    return <section className="rounded-2xl border border-amber-400/15 bg-amber-400/[.025] p-4" data-testid="decision-impact-center">
      <div className="text-[9px] font-mono uppercase tracking-[.2em] text-amber-300">Decision impact center</div>
      <div className="text-[10px] text-white/45 mt-2">{data?.error || 'Decision center unavailable.'}</div>
    </section>;
  }

  const actions = data.actionItems || [];
  const act = actions.filter(item => item.severity === 'ACT');
  const watch = actions.filter(item => item.severity === 'WATCH');
  const rules = data.rules!;
  const portfolio = data.portfolio!;
  const rulesEvaluated = evaluatedRuleCount(rules);
  const reviewCoverageComplete = rules.total > 0 && rulesEvaluated === rules.total &&
    portfolio.quoteCoverage?.status === 'complete';
  const earningsCount = data.earningsStatus === 'ok' && Array.isArray(data.earnings)
    ? data.earnings.length : null;
  const spy = data.benchmark?.SPY;
  const soxx = data.benchmark?.SOXX;
  const comparisonReady = portfolio.accountingReconciled === true && portfolio.quoteCoverage?.status === 'complete';
  const spyPnl = comparisonReady && spy?.coverage?.status === 'complete' ? spy.pnl : null;
  const soxxPnl = comparisonReady && soxx?.coverage?.status === 'complete' ? soxx.pnl : null;
  const accountPnl = comparisonReady ? portfolio.cashFlowPnl : null;
  const excessSpy = spyPnl != null && accountPnl != null ? accountPnl - spyPnl : null;
  const excessSoxx = soxxPnl != null && accountPnl != null ? accountPnl - soxxPnl : null;

  return (
    <section className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[.025] p-4 md:p-5 space-y-4" data-testid="decision-impact-center">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[.22em] text-cyan-300">Decision impact center</div>
          <h2 className="text-2xl font-black mt-1">What matters for you now</h2>
          <p className="text-[10px] leading-4 text-white/40 mt-1 max-w-3xl">
            Rules, upcoming events, cash-flow results and portfolio risks are reduced to the few items worth reviewing.
            This is a review layer, not an automatic trade instruction.
          </p>
        </div>
        {!reviewCoverageComplete && <button type="button" onClick={() => onNavigate('health')} className="rounded-lg border border-amber-300/25 px-3 py-2 text-xs font-semibold text-amber-100">Check data sources</button>}
        <button type="button" onClick={() => onNavigate('portfolio')} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-[9px] font-mono uppercase text-white/55 hover:text-white">
          Open portfolio <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <DecisionMetric icon={<ShieldAlert className="w-3.5 h-3.5" />} label="Action now" value={act.length ? String(act.length) : reviewCoverageComplete ? '0' : 'Unknown'} tone={act.length ? 'danger' : reviewCoverageComplete ? 'good' : 'warn'} />
        <DecisionMetric icon={<CalendarClock className="w-3.5 h-3.5" />} label="Next 7 days" value={earningsCount === null ? 'Unknown' : String(earningsCount)} tone={earningsCount === null || earningsCount > 0 ? 'warn' : 'neutral'} />
        <DecisionMetric icon={<CircleDollarSign className="w-3.5 h-3.5" />} label="Trading P&L" value={signedMoney(portfolio.accountingStatus === 'conditional-loaded-records' ? portfolio.totalTradingPnl : null)} tone={portfolio.accountingStatus !== 'conditional-loaded-records' || portfolio.totalTradingPnl == null ? 'neutral' : portfolio.totalTradingPnl >= 0 ? 'good' : 'danger'} />
        <DecisionMetric icon={<Target className="w-3.5 h-3.5" />} label="Validation progress" value={Number.isSafeInteger(data.forecast?.independentVerified) && data.forecast!.independentVerified! >= 0 ? data.forecast!.independentVerified + '/50' : 'Unknown'} tone={(data.forecast?.gate === 'ready') ? 'good' : 'warn'} />
        <DecisionMetric icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Rules evaluated" value={(rulesEvaluated === null ? 'Unknown' : rulesEvaluated) + '/' + rules.total} tone={rules.total > 0 && evaluatedRuleCount(rules) === rules.total ? 'good' : 'warn'} />
      </div>

      <PreTradeGate data={data} />

      <details className="rounded-xl border border-amber-400/20 bg-amber-400/[.035] p-3" data-testid="decision-accounting-issues">
        <summary className="cursor-pointer text-xs font-bold text-amber-200">Accounting coverage and inputs</summary>
        <p className="mt-2 text-xs text-white/60">Trading figures require matched original loaded records. Full account history and corporate actions remain unverified. Cash-flow P&amp;L and benchmark comparisons need separately supported evidence.</p>
        <ul className="mt-2 space-y-2 text-xs text-white/60">
          {(Array.isArray(portfolio.accountingIssues) ? portfolio.accountingIssues : []).map((entry,index) => <li key={entry.code + '-' + index}>{entry.symbol ? entry.symbol + ': ' : ''}{entry.message}</li>)}
        </ul>
      </details>

      {Array.isArray(rules.configurationIssues) && rules.configurationIssues.length > 0 && <details className="rounded-xl border border-amber-400/20 bg-amber-400/[.035] p-3" data-testid="decision-rule-issues">
        <summary className="cursor-pointer text-xs font-bold text-amber-200">Rule configuration and coverage issues</summary>
        <ul className="mt-2 space-y-2 text-xs text-white/60">
          {rules.configurationIssues.map((entry,index) => <li key={entry.symbol + '-' + index}><strong className="text-white/80">{entry.symbol}</strong>: {entry.issues.join(' ')}</li>)}
        </ul>
      </details>}

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_.85fr] gap-3">
        <div className="rounded-xl border border-white/5 bg-black/10 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-white/25">Top review items</div>
              <div className="text-sm font-black mt-1">{actions.length ? 'Focus here first' : reviewCoverageComplete ? 'No rule prompts in this snapshot' : 'Review coverage needs attention'}</div>
            </div>
            {rules.near > 0 && <span className="text-[8px] font-mono uppercase text-amber-300">{rules.near} close to a rule</span>}
          </div>
          <div className="mt-3 space-y-2">
            {actions.slice(0, 3).map((item, index) => (
              <div key={item.symbol + ':' + item.title + ':' + index} className={'rounded-lg border p-3 ' + (item.severity === 'ACT' ? 'border-rose-400/20 bg-rose-400/[.05]' : item.severity === 'WATCH' ? 'border-amber-400/15 bg-amber-400/[.035]' : 'border-cyan-400/10 bg-cyan-400/[.025]')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <SeverityPill severity={item.severity} />
                      <span className="font-black text-sm">{item.symbol}</span>
                      <span className="text-[9px] text-white/35">{item.title}</span>
                    </div>
                    <div className="text-[10px] leading-4 text-white/55 mt-1">{item.detail}</div>
                    {item.explanation && <details className="mt-2 text-xs text-white/70"><summary>Rule explanation</summary><p>{item.explanation.origin}: {item.explanation.detail}</p><p>{item.explanation.evidenceStatus}</p></details>}
                  </div>
                  {item.impact != null && <span className={'text-[10px] font-mono font-bold shrink-0 ' + (item.impact >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{money(item.impact)}</span>}
                </div>
              </div>
            ))}
            {!actions.length && <div className="flex items-center gap-2 text-[10px] text-amber-200"><AlertTriangle className="w-4 h-4" /> No usable review prompts returned. Check rule and data coverage before interpreting this as no risk.</div>}
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-black/10 p-3">
          <div className="text-[9px] font-mono uppercase tracking-widest text-white/25">Your result vs simple benchmark</div>
          <div className="text-sm font-black mt-1">Same cash-flow benchmark</div>
          <div className="text-[9px] text-white/35 mt-1">{comparisonReady ? 'Compare supported dated account cash flows with the same amounts invested on the same dates.' : 'Cash-flow and history evidence is incomplete; comparisons are unavailable.'}</div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <MiniResult label="You" value={signedMoney(accountPnl)} />
            <MiniResult label="SPY" value={signedMoney(spyPnl)} />
            <MiniResult label="You − SPY" value={signedMoney(excessSpy)} />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <MiniResult label="SOXX" value={signedMoney(soxxPnl)} />
            <MiniResult label="You − SOXX" value={signedMoney(excessSoxx)} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
        <RiskCard title="Signal gate" value={data.signalGate ? data.signalGate.eligible + ' eligible' : 'Unknown'} detail={!data.signalGate ? 'Signal history could not be verified.' : (data.signalGate.experimental ?? 0) + ' experimental/under review · ' + (data.signalGate?.retired ?? 0) + ' retired. Only independently validated families can influence decision status.'} />
        <RiskCard title="Top 3 holdings" value={portfolio.concentrationTop3Pct == null ? '—' : portfolio.concentrationTop3Pct.toFixed(1) + '%'} detail="Share of current portfolio value held in the three biggest positions." />
        <RiskCard title="If semiconductors fall 15%" value={money(portfolio.semiconductorShock15Pct)} detail="Estimated dollar loss from current semiconductor exposure; SOXL is counted at 3x. Scenario only." danger />
        <RiskCard title="Forecast evidence" value={data.forecast ? data.forecast.verified + ' verified' : 'Unknown'} detail={!data.forecast ? 'Forecast history could not be verified.' : (data.forecast.independent5D ?? 0) + ' independent 5D · ' + (data.forecast?.independent20D ?? 0) + ' independent 20D · ' + (data.forecast?.pending ?? 0) + ' pending'} />
      </div>

      {portfolio.quoteCoverage?.status && portfolio.quoteCoverage.status !== 'complete' && <div className="rounded-lg border border-amber-400/15 bg-amber-400/[.03] px-3 py-2 text-[9px] font-mono text-amber-200/70">Portfolio quote coverage: {portfolio.quoteCoverage.status} · {portfolio.quoteCoverage.coveragePct?.toFixed?.(0) ?? '—'}% valued. See accounting coverage and inputs for withheld quotes.</div>}
      {(data.benchmarkCoverage?.SPY?.status === 'partial' || data.benchmarkCoverage?.SOXX?.status === 'partial') && <div className="rounded-lg border border-amber-400/15 bg-amber-400/[.03] px-3 py-2 text-[9px] font-mono text-amber-200/70">Benchmark coverage is partial; benchmark edge is withheld where trade dates could not be matched.</div>}
      {rules.targetReached ? <div className="text-[9px] font-mono text-cyan-200/60">{rules.targetReached} target level{rules.targetReached === 1 ? '' : 's'} reached · review staged exits.</div> : null}
      <DecisionJournalPanel />

      <div className="text-[8px] font-mono text-white/25">
        Last checked {data.checkedAt ? new Date(data.checkedAt).toLocaleTimeString() : '—'} · {watch.length} watch items · {rules.noRule} holdings without active rules · {(rules.invalidConfig ?? 0) + (rules.incomplete ?? 0)} rule reviews need attention · 50 verified forecasts is a minimum evidence gate, not 50 independent tests.
      </div>
    </section>
  );
}

function PreTradeGate({ data }: { data: DecisionData }) {
  const rules = data.rules;
  const portfolio = data.portfolio;
  const forecast = data.forecast;
  const signalGate = data.signalGate;

  const checks = [
    {
      label: 'Fresh portfolio pricing',
      ok: portfolio?.quoteCoverage?.status === 'complete',
      detail: typeof portfolio?.quoteCoverage?.coveragePct === 'number' ? portfolio.quoteCoverage.coveragePct.toFixed(0) + '% quote coverage' : 'Coverage unavailable',
    },
    {
      label: 'Accounting reconciliation',
      ok: portfolio?.accountingReconciled === true,
      detail: 'Matched loaded records do not establish full-history reconciliation.',
    },
    {
      label: 'Position rules',
      ok: Boolean(rules && rules.total > 0 && evaluatedRuleCount(rules) === rules.total),
      detail: rules ? (evaluatedRuleCount(rules) ?? 'Unknown') + '/' + rules.total + ' holdings have mathematically evaluated rules; data eligibility is separate' : 'Rule state unavailable',
    },
    {
      label: 'Decision-driving signals',
      ok: Boolean(signalGate && signalGate.eligible > 0),
      detail: signalGate ? signalGate.eligible + ' eligible signal families · ' + signalGate.experimental + ' experimental' : 'Signal gate unavailable',
    },
    {
      label: 'Forecast evidence',
      ok: Boolean(forecast && forecast.independentVerified >= 50 && forecast.independent5D >= 25 && forecast.independent20D >= 25 && forecast.gate === 'ready'),
      detail: forecast ? (forecast.independentVerified ?? 0) + '/50 independent · ' + (forecast.independent5D ?? 0) + ' 5D · ' + (forecast.independent20D ?? 0) + ' 20D' : 'Forecast validation unavailable',
    },
  ];

  const needsReview = checks.some(check => !check.ok);
  const state = needsReview ? 'REVIEW' : 'READY';
  const stateClass = state === 'REVIEW'
    ? 'border-amber-400/20 bg-amber-400/[.035] text-amber-300'
    : 'border-emerald-400/20 bg-emerald-400/[.035] text-emerald-300';

  return (
    <div className={'rounded-xl border p-3 ' + stateClass} data-testid="pre-trade-gate">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-mono uppercase tracking-[.2em]">Pre-trade review gate</div>
          <div className="text-sm font-black mt-1">
            {state === 'REVIEW' ? 'Portfolio review is incomplete' : 'Review conditions are ready'}
          </div>
          <div className="text-[9px] leading-4 text-white/40 mt-1 max-w-3xl">
            This is a portfolio-level readiness review, not a trade blocker. It does not prevent a rule-driven exit and becomes trade-specific only when a discretionary add or increase is proposed.
          </div>
        </div>
        <span className="rounded border border-current/20 px-2 py-1 text-[8px] font-mono font-bold uppercase">{state}</span>
      </div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer font-semibold">Review data readiness</summary>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 mt-3">
        {checks.map(check => (
          <div key={check.label} className="rounded-lg border border-white/5 bg-black/10 p-2.5">
            <div className="flex items-center gap-2 text-[9px] font-mono uppercase">
              {check.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />}
              <span className={check.ok ? 'text-emerald-300' : 'text-amber-300'}>{check.ok ? 'PASS' : 'WAIT'}</span>
            </div>
            <div className="text-[10px] font-bold text-white/70 mt-2">{check.label}</div>
            <div className="text-[8px] leading-4 text-white/35 mt-1">{check.detail}</div>
          </div>
        ))}
      </div>
      {state === 'REVIEW' && (
        <div className="mt-2 text-[8px] font-mono text-amber-200/70">
          Forecast validation is still intentionally building its independent sample. Until the evidence gate is ready, forecast output should remain contextual rather than decision-driving.
        </div>
      )}
      </details>
    </div>
  );
}

function DecisionMetric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: 'danger'|'good'|'warn'|'neutral' }) {
  const toneClass = tone === 'danger' ? 'text-rose-300' : tone === 'good' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : 'text-white/70';
  return <div className="rounded-xl border border-white/5 bg-black/10 p-3"><div className={toneClass}>{icon}</div><div className="text-[8px] font-mono uppercase text-white/25 mt-2">{label}</div><div className={'text-sm font-black font-mono mt-1 ' + toneClass}>{value}</div></div>;
}
function SeverityPill({ severity }: { severity: 'ACT'|'WATCH'|'SETUP' }) {
  const cls = severity === 'ACT' ? 'border-rose-400/20 bg-rose-400/10 text-rose-300' : severity === 'WATCH' ? 'border-amber-400/20 bg-amber-400/10 text-amber-300' : 'border-cyan-400/15 bg-cyan-400/5 text-cyan-200';
  return <span className={'rounded border px-1.5 py-0.5 text-[7px] font-mono uppercase ' + cls}>{severity === 'ACT' ? 'Act' : severity === 'WATCH' ? 'Watch' : 'Setup'}</span>;
}
function MiniResult({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-white/5 bg-white/[.015] p-2"><div className="text-[8px] font-mono uppercase text-white/20">{label}</div><div className="text-[10px] font-mono font-bold mt-1">{value}</div></div>;
}
function RiskCard({ title, value, detail, danger = false }: { title: string; value: string; detail: string; danger?: boolean }) {
  return <div className={'rounded-xl border p-3 ' + (danger ? 'border-rose-400/15 bg-rose-400/[.025]' : 'border-white/5 bg-black/10')}><div className="text-[9px] font-mono uppercase text-white/25">{title}</div><div className={'text-base font-black mt-1 ' + (danger ? 'text-rose-300' : 'text-white/80')}>{value}</div><div className="text-[9px] leading-4 text-white/35 mt-1">{detail}</div></div>;
}
