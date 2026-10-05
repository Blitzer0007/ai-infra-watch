// Forecast validation labels intentionally favor plain-language terms for the dashboard.\nimport { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, ShieldAlert } from 'lucide-react';
import { authFetch } from '../utils/apiAuth';

type ValidationSummary = {
  count: number;
  sampleStatus: string;
  directionalAccuracyPct: number | null;
  medianAbsoluteError: number | null;
  p25p75CoveragePct: number | null;
  meanSignedErrorPct: number | null;
  predictionMatchPct?: number | null;
  rolling?: { last10: Rolling; last25: Rolling; last50: Rolling };
  newestVerifiedAt?: string | null;
};
type Rolling = { count: number; directionRightPct: number | null; predictionMatchPct: number | null };

export default function ForecastValidationPanel({ symbol, horizon = 20 }: { symbol: string; horizon?: number }) {
  const [summary, setSummary] = useState<ValidationSummary | null>(null);
  const [globalGate, setGlobalGate] = useState<{ verifiedCount: number; minimumRequired: number; ready: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    authFetch('/api/forecast-validation?ticker=' + encodeURIComponent(symbol) + '&horizon=' + encodeURIComponent(String(horizon)), {
      cache: 'no-store',
    })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || 'Forecast validation unavailable');
        return body;
      })
      .then(body => {
        if (cancelled) return;
        setSummary(body?.overall?.count ? body.overall : null);
        setGlobalGate(body?.globalValidationGate || body?.validationGate || null);
      })
      .catch(err => {
        if (!cancelled) {
          setSummary(null);
          setGlobalGate(null);
          setError(err instanceof Error ? err.message : 'Forecast validation unavailable');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
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
          <div className="text-[9px] text-white/30 mt-1">Shows how closely completed forecasts matched what actually happened. This helps us learn whether the model is improving — it is not a trade instruction.</div>
        </div>
        <div className="text-right text-[8px] font-mono text-white/25">
          {loading ? 'Loading' : globalGate?.ready ? 'Validation history: 50+' : 'Building validation history'}
        </div>
      </div>

      {error && <div className="mt-3 rounded-lg border border-amber-400/15 bg-amber-400/[.03] px-3 py-2 text-[9px] font-mono text-amber-200/70">{error}</div>}

      {!error && !loading && !summary && (
        <div className="mt-3 rounded-lg border border-white/5 bg-black/10 p-3">
          <div className="flex items-center gap-2 text-[9px] font-mono uppercase text-white/35"><Clock3 className="w-3.5 h-3.5" /> No verified {horizon}D forecast sample yet</div>
        </div>
      )}

      <div className="mt-3 rounded-lg border border-cyan-400/10 bg-cyan-400/[.025] px-3 py-2 text-[8px] leading-4 text-white/35">
        Auto tracking is on: each weekday AI Infra Watch records one new <b className="text-cyan-200/70">20D forecast</b> for each held stock when there is no pending forecast already waiting to mature.
        A forecast only counts toward the <b className="text-white/60">50 verified sample</b> after its target date is reached and the actual market result is recorded. You do not need to add these manually.
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
            <Metric label="Verified" value={String(summary.count)} />
            <Metric label="Direction right" value={summary.directionalAccuracyPct == null ? '—' : summary.directionalAccuracyPct.toFixed(1) + '%'} />
            <Metric label="Typical miss" value={summary.medianAbsoluteError == null ? '—' : summary.medianAbsoluteError.toFixed(2) + ' pp'} />
            <Metric label="Range hit" value={summary.p25p75CoveragePct == null ? '—' : summary.p25p75CoveragePct.toFixed(1) + '%'} />
            <Metric label="Prediction match" value={summary.predictionMatchPct == null ? '—' : summary.predictionMatchPct.toFixed(1) + '%'} />
          </div>
          <div className="mt-3 rounded-lg border border-white/5 bg-black/10 p-3">
            <div className="text-[8px] font-mono uppercase tracking-wider text-white/30">Is the model improving?</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[['Last 10', summary.rolling?.last10], ['Last 25', summary.rolling?.last25], ['Last 50', summary.rolling?.last50]].map(([label, item]) => (
                <div key={label as string} className="rounded border border-white/5 p-2">
                  <div className="text-[8px] text-white/30">{label as string}</div>
                  <div className="text-[10px] font-mono mt-1">{item?.predictionMatchPct == null ? '—' : item.predictionMatchPct.toFixed(1) + '% match'}</div>
                  <div className="text-[8px] text-white/25 mt-1">{item?.directionRightPct == null ? '—' : item.directionRightPct.toFixed(1) + '% direction right'} · {item?.count || 0} checked</div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[8px] font-mono text-white/30">
            <span className="rounded border border-white/10 bg-white/5 px-2 py-1 uppercase">{summary.sampleStatus.replace('-', ' ')}</span>
            {summary.newestVerifiedAt && <span>Last verified {new Date(summary.newestVerifiedAt).toLocaleString()}</span>}
            {globalGate && <span>Verified history {globalGate.verifiedCount} / {globalGate.minimumRequired}</span>}
          </div>
          <div className="mt-2 text-[8px] text-white/25">Validation sample status is shown separately from the holding's evidence gates and recorded decision context.</div>
        </>
      )}

      {globalGate && !globalGate.ready && <div className="mt-3 flex items-center gap-2 text-[8px] font-mono text-white/30"><ShieldAlert className="w-3.5 h-3.5 text-amber-300" /> 50 completed forecasts are needed before the overall validation history is considered established.</div>}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-white/5 bg-black/10 p-2">
    <div className="text-[8px] font-mono uppercase text-white/25">{label}</div>
    <div className="text-sm font-mono font-bold mt-1">{value}</div>
  </div>;
}
