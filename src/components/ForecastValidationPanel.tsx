// Forecast validation labels intentionally favor plain-language terms for the dashboard.
import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, ShieldAlert } from 'lucide-react';
import { authFetch } from '../utils/apiAuth';

type ValidationSummary = {
  count: number;
  independentCount?:number;
  directionalSampleCount?:number;
  scoreSampleCount?:number;
  neutralOrZeroCount?:number;
  p25p75CoverageCount?:number;
  p10p90CoverageCount?:number;
  calibrationVerdict?:string;
  selection?:{invalidVerifiedRowCount:number;overlapExcludedRowCount:number;retainedRowCount:number};
  sampleStatus: string;
  directionalAccuracyPct: number | null;
  medianAbsoluteError: number | null;
  p25p75CoveragePct: number | null;
  meanSignedErrorPct: number | null;
  predictionMatchPct?: number | null;
  rolling?: { last10: Rolling; last25: Rolling; last50: Rolling };
  newestVerifiedAt?: string | null;
};
type Learning = {
  sampleSize: number;
  model: { typicalMiss: number | null; directionRightPct: number | null; predictionMatchPct: number | null };
  baseline: { name: string; typicalMiss: number | null; improvementPct: number | null };
  drift: { status: string; score: number | null; recent?: Rolling; prior?: Rolling };
  evidenceLearning: { multipleChannelSamples: number; otherSamples: number; predictionMatchLift: number | null; note: string };
  recentLessons?: Array<{ ticker: string; directionRight: boolean | null; rangeHit: boolean; evidenceQuality: string; explanation: string }>;
};
type Rolling = { scoreSampleCount?:number; count: number; directionRightPct: number | null; predictionMatchPct: number | null };

export default function ForecastValidationPanel({ symbol, horizon = 20 }: { symbol: string; horizon?: number }) {
  const [summary, setSummary] = useState<ValidationSummary | null>(null);
  const [globalGate, setGlobalGate] = useState<{ verifiedCount: number; minimumRequired: number; ready: boolean } | null>(null);
  const [learning, setLearning] = useState<Learning | null>(null);
  const [scopeLimit, setScopeLimit] = useState<{ rowLimit: number; truncated: boolean; globalTruncated: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setSummary(null);setGlobalGate(null);setLearning(null);setScopeLimit(null);
    const controller=new AbortController();

    authFetch('/api/forecast-validation?ticker=' + encodeURIComponent(symbol) + '&horizon=' + encodeURIComponent(String(horizon)), {
      cache: 'no-store',signal:controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error('Forecast validation is unavailable.');
        const body = await response.json();
        if (body?.ok !== true || !Number.isSafeInteger(body?.overall?.count) || body.overall.count < 0) {
          throw new Error('Forecast validation is unavailable.');
        }
        return body;
      })
      .then(body => {
        if (cancelled) return;
        setSummary(body?.overall?.count ? body.overall : null);
        setGlobalGate(body?.globalValidationGate || body?.validationGate || null);
        setLearning(body?.learning || null);
        setScopeLimit(body?.scope ? { rowLimit: body.scope.rowLimit, truncated: body.scope.truncated === true, globalTruncated: body?.globalScope?.truncated === true } : null);
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(null);
          setGlobalGate(null);setLearning(null);
          setScopeLimit(null);
          setError('Forecast validation is unavailable.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true;controller.abort(); };
  }, [symbol, horizon]);

  return (
    <section className="mt-4 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.025] p-4" data-testid="forecast-validation-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-300" />
            <div className="text-[9px] font-mono uppercase tracking-widest text-cyan-300">Forecast validation</div>
          </div>
          <div className="text-sm font-black mt-1">{symbol} · {horizon}D verified history</div>
          <div className="text-[9px] text-white/30 mt-1">Descriptive results from recorded outcomes. Sample counts and heuristic scores do not establish predictive validity.</div>
        </div>
        <div className="text-right text-[8px] font-mono text-white/25">
          {loading ? 'Loading' : error ? 'History unavailable' : globalGate?.ready ? 'Global sample-count policy met' : 'Building validation history'}
        </div>
      </div>

      {error && <div role="alert" className="mt-3 rounded-lg border border-amber-400/15 bg-amber-400/[.03] px-3 py-2 text-[9px] font-mono text-amber-200/70">{error}</div>}

      {!error && !loading && !summary && (
        <div className="mt-3 rounded-lg border border-white/5 bg-black/10 p-3">
          <div className="flex items-center gap-2 text-[9px] font-mono uppercase text-white/35"><Clock3 className="w-3.5 h-3.5" /> No eligible verified {horizon}D forecast outcomes in this loaded scope</div>
        </div>
      )}

      <div className="mt-3 rounded-lg border border-cyan-400/10 bg-cyan-400/[.025] px-3 py-2 text-[8px] leading-4 text-white/35">
        Existing tracking uses separate <b className="text-cyan-200/70">5D and 20D streams</b>. The global count policy requires 50 retained outcomes, including 25 in each stream. This panel does not inspect scheduler health or start tracking. Holiday/session alignment and point-in-time validation remain open review work.
      </div>
      {scopeLimit && <p className="mt-2 text-[9px] text-white/40">Results describe loaded history, limited to {scopeLimit.rowLimit} rows per query. {scopeLimit.truncated || scopeLimit.globalTruncated ? 'A query reached the row limit; history and global counts may be incomplete.' : 'A complete historical inventory is not established by this panel.'}</p>}

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
            <Metric label="Eligible outcomes" value={String(summary.count)} />
            <Metric label="Direction right" value={summary.directionalAccuracyPct == null ? '—' : summary.directionalAccuracyPct.toFixed(1) + '%'} />
            <Metric label="Typical miss" value={summary.medianAbsoluteError == null ? '—' : summary.medianAbsoluteError.toFixed(2) + ' pp'} />
            <Metric label="Range hit" value={summary.p25p75CoveragePct == null ? '—' : summary.p25p75CoveragePct.toFixed(1) + '%'} />
            <Metric label="Heuristic match score" value={summary.predictionMatchPct == null ? '—' : summary.predictionMatchPct.toFixed(1) + '%'} />
          </div>
          {learning && (
            <div className="mt-3 rounded-lg border border-cyan-400/10 bg-cyan-400/[.02] p-3">
              <div className="text-[8px] font-mono uppercase tracking-wider text-cyan-200/50">What are we learning?</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                <Metric label="Better than no-change" value={learning.baseline.improvementPct == null ? '—' : (learning.baseline.improvementPct >= 0 ? '+' : '') + learning.baseline.improvementPct.toFixed(1) + '%'} />
                <Metric label="Model typical miss" value={learning.model.typicalMiss == null ? '—' : learning.model.typicalMiss.toFixed(2) + ' pp'} />
                <Metric label="Model drift" value={learning.drift.status === 'insufficient' ? 'Not enough data' : learning.drift.status.replace('-', ' ')} />
                <Metric label="Evidence association" value={learning.evidenceLearning.predictionMatchLift == null ? 'Still learning' : (learning.evidenceLearning.predictionMatchLift >= 0 ? '+' : '') + learning.evidenceLearning.predictionMatchLift.toFixed(1) + ' pp'} />
              </div>
              <div className="mt-2 text-[8px] leading-4 text-white/35">{learning.evidenceLearning.note}</div>
              {learning.recentLessons?.[0] && (
                <div className="mt-2 rounded border border-white/5 bg-black/10 p-2 text-[8px] leading-4 text-white/40">
                  <span className="text-white/60">{learning.recentLessons[0].ticker}:</span> {learning.recentLessons[0].explanation} Evidence at creation: {learning.recentLessons[0].evidenceQuality}.
                </div>
              )}
            </div>
          )}

          <div className="mt-3 rounded-lg border border-white/5 bg-black/10 p-3">
            <div className="text-[8px] font-mono uppercase tracking-wider text-white/30">Recent loaded outcome windows · ordered by target date</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[['Last 10', summary.rolling?.last10], ['Last 25', summary.rolling?.last25], ['Last 50', summary.rolling?.last50]].map(([label, item]) => (
                <div key={label as string} className="rounded border border-white/5 p-2">
                  <div className="text-[8px] text-white/30">{label as string}</div>
                  <div className="text-[10px] font-mono mt-1">{item?.predictionMatchPct == null ? '—' : item.predictionMatchPct.toFixed(1) + '% score'}</div>
                  <div className="text-[8px] text-white/25 mt-1">{item?.directionRightPct == null ? '—' : item.directionRightPct.toFixed(1) + '% direction right'} · {item?.count || 0} checked</div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[8px] font-mono text-white/30">
            <span className="rounded border border-white/10 bg-white/5 px-2 py-1 uppercase">{({insufficient:'Fewer than 10 retained',early:'10–24 retained',developing:'25–49 retained','initial-validation':'50–99 retained',established:'100+ retained'} as Record<string,string>)[summary.sampleStatus]||'Sample count unavailable'}</span>
            {summary.newestVerifiedAt && <span>Last verification processed {new Date(summary.newestVerifiedAt).toLocaleString()}</span>}
            {globalGate && <span>Global retained outcomes: {globalGate.verifiedCount} / {globalGate.minimumRequired}</span>}
          </div>
          <details className="mt-3 rounded border border-white/15 p-3 text-xs" data-testid="forecast-summary-method"><summary className="cursor-pointer font-semibold">Coverage, scoring and limits</summary><div className="mt-3 space-y-2">
            <p>{summary.independentCount??'Unknown'} outcomes retained after per-ticker/horizon overlap filtering. This does not establish statistical independence across equities or horizons.</p>
            {summary.selection&&<p>{summary.selection.invalidVerifiedRowCount} invalid verified rows excluded; {summary.selection.overlapExcludedRowCount} overlapping rows excluded.</p>}
            <p>Direction and heuristic score use {summary.directionalSampleCount??'an unavailable count of'} nonzero prediction/outcome pairs. {summary.neutralOrZeroCount??'An unavailable count of'} zero pairs are excluded from these two metrics but remain in eligible point-error and interval measurements.</p>
            <p>Heuristic score = max(0, 100 − absolute forecast error / max(absolute outcome, 1 percentage point) × 100), averaged over eligible nonzero pairs. It is not a probability or percentage of correct forecasts.</p>
            <p>Interval diagnostic: {summary.calibrationVerdict??'Unavailable'}. Coverage consistent with a target is not proof of calibration or future performance.</p>
            <p>Central interval coverage uses {summary.p25p75CoverageCount??'an unavailable count of'} valid intervals; wide interval coverage uses {summary.p10p90CoverageCount??'an unavailable count of'} valid intervals. Missing or crossed bounds are excluded from coverage.</p>
            <p>Evidence association is descriptive and does not establish causality. Existing sample thresholds and forecast horizons are unchanged.</p>
          </div></details>
          <div className="mt-2 text-[8px] text-white/25">Validation sample status is shown separately from the holding's evidence gates and recorded decision context.</div>
        </>
      )}

      {globalGate && !globalGate.ready && <div className="mt-3 flex items-center gap-2 text-[8px] font-mono text-white/30"><ShieldAlert className="w-3.5 h-3.5 text-amber-300" /> The global 50/25/25 sample-count policy is not met. Meeting it does not establish forecast skill.</div>}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-white/5 bg-black/10 p-2">
    <div className="text-[8px] font-mono uppercase text-white/25">{label}</div>
    <div className="text-sm font-mono font-bold mt-1">{value}</div>
  </div>;
}
