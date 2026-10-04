import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, CircleDollarSign, ShieldAlert, Target } from 'lucide-react';
import { authFetch } from '../utils/apiAuth';

type ActionItem = {
  severity: 'ACT' | 'WATCH' | 'SETUP';
  symbol: string;
  title: string;
  detail: string;
  impact: number | null;
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
  };
  portfolio?: {
    holdings: number;
    currentValue: number | null;
    netContributed: number | null;
    cashFlowPnl: number | null;
    concentrationTop3Pct: number | null;
    semiconductorShock15Pct: number | null;
  };
  benchmark?: Record<string, { value: number; netDeposits: number; pnl: number; shares: number }>;
  earnings?: Array<{ symbol: string; date: string; daysUntil: number; hour?: string | null }>;
  forecast?: {
    verified: number;
    pending: number;
    due: number;
    remaining: number;
    tickers: number;
    dates: number;
    distinctTickerDates: number;
    gate: string;
  };
  notes?: string[];
  error?: string;
};

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return (value < 0 ? '−$' : '$') + Math.abs(value).toFixed(2);
}
function signedMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return (value >= 0 ? '+$' : '−$') + Math.abs(value).toFixed(2);
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
        return body;
      })
      .then(body => { if (!cancelled) setData(body); })
      .catch(error => { if (!cancelled) setData({ error: error instanceof Error ? error.message : 'Decision center unavailable' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    const timer = setInterval(() => {
      authFetch('/api/decision-center', { cache: 'no-store' })
        .then(response => response.ok ? response.json() : null)
        .then(body => { if (!cancelled && body?.ok) setData(body); })
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
  const spy = data.benchmark?.SPY;
  const soxx = data.benchmark?.SOXX;
  const excessSpy = spy && portfolio.cashFlowPnl != null ? portfolio.cashFlowPnl - spy.pnl : null;
  const excessSoxx = soxx && portfolio.cashFlowPnl != null ? portfolio.cashFlowPnl - soxx.pnl : null;

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
        <button type="button" onClick={() => onNavigate('portfolio')} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-[9px] font-mono uppercase text-white/55 hover:text-white">
          Open portfolio <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <DecisionMetric icon={<ShieldAlert className="w-3.5 h-3.5" />} label="Action now" value={String(act.length)} tone={act.length ? 'danger' : 'good'} />
        <DecisionMetric icon={<CalendarClock className="w-3.5 h-3.5" />} label="Next 7 days" value={String(data.earnings?.length || 0)} tone={data.earnings?.length ? 'warn' : 'neutral'} />
        <DecisionMetric icon={<CircleDollarSign className="w-3.5 h-3.5" />} label="Cash-flow P&L" value={signedMoney(portfolio.cashFlowPnl)} tone={(portfolio.cashFlowPnl || 0) >= 0 ? 'good' : 'danger'} />
        <DecisionMetric icon={<Target className="w-3.5 h-3.5" />} label="20D verified" value={(data.forecast?.verified ?? 0) + '/50'} tone={(data.forecast?.verified ?? 0) >= 50 ? 'good' : 'warn'} />
        <DecisionMetric icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Rules set" value={(rules.total - rules.noRule) + '/' + rules.total} tone={rules.noRule ? 'warn' : 'good'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_.85fr] gap-3">
        <div className="rounded-xl border border-white/5 bg-black/10 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-white/25">Top review items</div>
              <div className="text-sm font-black mt-1">{actions.length ? 'Focus here first' : 'Nothing urgent detected'}</div>
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
                  </div>
                  {item.impact != null && <span className={'text-[10px] font-mono font-bold shrink-0 ' + (item.impact >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{money(item.impact)}</span>}
                </div>
              </div>
            ))}
            {!actions.length && <div className="flex items-center gap-2 text-[10px] text-emerald-300"><CheckCircle2 className="w-4 h-4" /> No rule breach or near-rule item is currently detected.</div>}
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-black/10 p-3">
          <div className="text-[9px] font-mono uppercase tracking-widest text-white/25">Your result vs doing nothing special</div>
          <div className="text-sm font-black mt-1">Same cash-flow benchmark</div>
          <div className="text-[9px] text-white/35 mt-1">Your real dated deposits/withdrawals are compared with putting the same cash into a benchmark on the same dates.</div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <MiniResult label="You" value={signedMoney(portfolio.cashFlowPnl)} />
            <MiniResult label="SPY" value={signedMoney(spy?.pnl)} />
            <MiniResult label="You − SPY" value={signedMoney(excessSpy)} />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <MiniResult label="SOXX" value={signedMoney(soxx?.pnl)} />
            <MiniResult label="You − SOXX" value={signedMoney(excessSoxx)} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <RiskCard title="Top 3 holdings" value={portfolio.concentrationTop3Pct == null ? '—' : portfolio.concentrationTop3Pct.toFixed(1) + '%'} detail="Share of current portfolio value held in the three biggest positions." />
        <RiskCard title="If semiconductors fall 15%" value={money(portfolio.semiconductorShock15Pct)} detail="Estimated dollar loss from current semiconductor exposure; SOXL is counted at 3x. Scenario only." danger />
        <RiskCard title="Forecast evidence" value={(data.forecast?.verified ?? 0) + ' verified'} detail={(data.forecast?.pending ?? 0) + ' pending · ' + (data.forecast?.distinctTickerDates ?? 0) + ' distinct ticker/date outcomes'} />
      </div>

      <div className="text-[8px] font-mono text-white/25">
        Last checked {data.checkedAt ? new Date(data.checkedAt).toLocaleTimeString() : '—'} · {watch.length} watch items · {rules.noRule} holdings without active rules · 50 verified forecasts is a minimum evidence gate, not 50 independent tests.
      </div>
    </section>
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
