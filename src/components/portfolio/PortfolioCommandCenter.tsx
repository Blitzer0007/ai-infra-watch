import { useId, useState } from 'react';
import { Activity, ArrowUpRight, CalendarClock, CircleAlert, Layers3, ShieldCheck, Wallet } from 'lucide-react';
import { loadReviewTimeZone, saveReviewTimeZone, type ReviewTimeZone } from '../../utils/reviewPreferences';
import { selectConfirmedCatalysts, formatReviewDate, type ConfirmedCatalyst, type ExplanationLevel } from '../../utils/portfolioReview';
import type { DecisionCardModel, PortfolioSummary } from '../../utils/decisionCardAdapter';
import PortfolioReviewQueue from './PortfolioReviewQueue';
import FinancialTerm from '../education/FinancialTerm';
export type { PortfolioSummary } from '../../utils/decisionCardAdapter';

export type CommandCenterProps = {
  summary: PortfolioSummary;
  positions: DecisionCardModel[];
  loading: boolean;
  error?: string | null;
  catalysts?: ConfirmedCatalyst[];
  explanationLevel?: ExplanationLevel;
  onSelectPosition: (symbol: string) => void;
  onOpenEvidence: (symbol: string) => void;
};

export default function PortfolioCommandCenter({
  summary, positions, loading, error, catalysts = [],
  explanationLevel = 'simple', onSelectPosition, onOpenEvidence,
}: CommandCenterProps) {
  const [zone, setZone] = useState<ReviewTimeZone>(loadReviewTimeZone);
  const zoneId = useId();
  const timeZone = zone === 'local' ? undefined : zone;
  const confirmed = selectConfirmedCatalysts(catalysts, positions.map(item => item.symbol), Date.now(), timeZone);
  const hasQualityWarning = positions.some(item => !item.dataQuality.eligibleForDecision);
  const money = summary.portfolioValueUsd == null
    ? 'Unavailable'
    : '$' + summary.portfolioValueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const counts = summary.reviewCounts;
  const tiles = [
    { label: 'Portfolio value', value: money, detail: 'Coverage: ' + summary.valueCoverage, icon: Wallet },
    { label: 'Tracked holdings', value: String(summary.holdingsCount), detail: 'Positions in review', icon: Layers3 },
    { label: 'Risk reviews', value: String(counts.riskReview), detail: counts.insufficientData + ' data reviews', icon: CircleAlert },
  ];

  return <section
    aria-label="Portfolio Command Center"
    data-testid="portfolio-command-center"
    className="aiw-command-center min-w-0 space-y-6 rounded-[1.5rem] border border-white/10 p-4 sm:p-6 lg:p-7"
  >
    <header className="flex flex-col gap-5 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.17em] text-cyan-200/80">
          <Activity aria-hidden="true" className="h-4 w-4" />
          <span>Portfolio workspace</span>
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-white/30" />
          <span>Daily review</span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Portfolio Command Center</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
          Review what needs attention, inspect the evidence, then decide what to research next.
          Research classifications, not trade orders.
        </p>
      </div>
      <div className="flex shrink-0 flex-col gap-2 text-sm">
        <label htmlFor={zoneId} className="font-medium text-slate-300">Review timezone</label>
        <select
          id={zoneId}
          value={zone}
          onChange={event => {
            const value = event.target.value as ReviewTimeZone;
            setZone(value);
            saveReviewTimeZone(value);
          }}
          className="min-h-11 w-full rounded-xl border border-white/20 bg-[#161e2b] px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 sm:w-auto"
        >
          <option value="local">Device local time</option>
          <option value="Asia/Kolkata">India (Asia/Kolkata)</option>
          <option value="America/New_York">US market (America/New_York)</option>
          <option value="UTC">UTC</option>
        </select>
        <p className="text-xs text-slate-400">Times shown in {timeZone ?? 'device local time'}.</p>
      </div>
    </header>

    {loading ? <p role="status" className="rounded-xl border border-white/10 p-5 text-slate-300">Loading holdings…</p>
      : error ? <p role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-5 text-amber-100">Portfolio unavailable: {error}</p>
      : !positions.length ? <p className="rounded-xl border border-dashed border-white/20 p-6 text-slate-300">No holdings yet. Add holdings through the existing portfolio manager.</p>
      : <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="portfolio-summary-grid">
          {tiles.map(tile => <div key={tile.label} className="aiw-stat-tile min-w-0 rounded-2xl border border-white/10 bg-[#151e2a]/80 p-4 sm:p-5">
            <div className="mb-5 flex items-center justify-between gap-3 text-xs font-medium text-slate-300">
              <span>{tile.label}</span>
              <tile.icon aria-hidden="true" className="h-[18px] w-[18px] text-cyan-300/85" />
            </div>
            <p className="break-words text-2xl font-semibold tracking-tight text-white">{tile.value}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">{tile.detail}</p>
          </div>)}
          <div className="aiw-stat-tile min-w-0 rounded-2xl border border-white/10 bg-[#151e2a]/80 p-4 sm:p-5">
            <div className="mb-5 flex items-center justify-between gap-3 text-xs font-medium text-slate-300">
              <FinancialTerm termId="concentration" explanationLevel={explanationLevel} />
              <Activity aria-hidden="true" className="h-[18px] w-[18px] text-cyan-300/85" />
            </div>
            <p className="text-2xl font-semibold tracking-tight text-white">
              {summary.topConcentrationPct == null ? 'Unavailable' : summary.topConcentrationPct.toFixed(1) + '%'}
            </p>
            <p className="mt-2 text-xs text-slate-400">Top 3 holdings</p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,1fr)]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-cyan-300" />
              Review readiness
            </h3>
            <p role="status" className={`mt-3 rounded-xl border px-3 py-3 text-sm leading-relaxed ${hasQualityWarning
              ? 'border-amber-300/25 bg-amber-300/[0.07] text-amber-100'
              : 'border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100'}`}>
              {hasQualityWarning
                ? 'Data-quality warning: some assessments are withheld. Expand each card for missing inputs.'
                : 'All required decision inputs passed the quality gate.'}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              Validated snapshot: {summary.asOf ? formatReviewDate(summary.asOf, undefined, timeZone) : 'Unavailable'}
              {' · '}Source dates without times retain their calendar date.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <CalendarClock aria-hidden="true" className="h-4 w-4 text-cyan-300" />
              Upcoming verified catalysts
            </h3>
            <div className="mt-3 text-sm leading-relaxed text-slate-300">
              <FinancialTerm termId="catalyst" explanationLevel={explanationLevel} /> dates:
              {confirmed.length ? <ul className="mt-2 space-y-2">
                {confirmed.map(item => <li key={item.symbol + item.date + item.source} className="rounded-lg border border-white/10 p-2.5">
                  <span className="font-semibold text-white">{item.symbol}</span>
                  {' · '}{formatReviewDate(item.date, undefined, timeZone)}
                  <span className="block text-xs text-slate-400">{item.source} · Review before the event</span>
                </li>)}
              </ul> : <p className="mt-2 text-xs leading-relaxed text-slate-400">
                No confirmed, sourced catalyst supplied to this snapshot. Check the existing events screen; estimated dates are not confirmed catalysts.
              </p>}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#121a25] p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-white">Prioritized review queue</h3>
              <p className="mt-1 text-sm text-slate-400">Select a position to review its evidence before acting.</p>
            </div>
            <ArrowUpRight aria-hidden="true" className="h-5 w-5 text-cyan-300/70" />
          </div>
          <p className="mb-4 text-xs leading-relaxed text-slate-300">
            Opportunity reviews: {counts.addReview} · Monitoring: {counts.holdWatch} · Risk reviews: {counts.riskReview} · Insufficient data: {counts.insufficientData}
          </p>
          <PortfolioReviewQueue
            timeZone={timeZone}
            explanationLevel={explanationLevel}
            positions={positions}
            onSelectPosition={onSelectPosition}
            onOpenEvidence={onOpenEvidence}
          />
        </div>
      </>}
  </section>;
}
