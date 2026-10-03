import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, ShieldAlert } from 'lucide-react';
import { authFetch } from '../utils/apiAuth';

type ValidationSummary = {
  count: number;
  sampleStatus: string;
  directionalAccuracyPct: number | null;
  medianAbsoluteError: number | null;
  p25p75CoveragePct: number | null;
  meanSignedErrorPct: number | null;
  newestVerifiedAt?: string | null;
};

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
        setGlobalGate(body?.validationGate || null);
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
          <div className="text-[9px] text-white/30 mt-1">Descriptive validation of completed forecasts. It does not alter portfolio decision rules or create a trade instruction.</div>
        </div>
        <div className="text-right text-[8px] font-mono text-white/25">
          {loading ? 'Loading' : globalGate?.ready ? 'Global sample gate: 50+' : 'Global sample gate: building'}
        </div>
      </div>

      {error && <div className="mt-3 rounded-lg border border-amber-400/15 bg-amber-400/[.03] px-3 py-2 text-[9px] font-mono text-amber-200/70">{error}</div>}

      {!error && !loading && !summary && (
        <div className="mt-3 rounded-lg border border-white/5 bg-black/10 p-3">
          <div className="flex items-center gap-2 text-[9px] font-mono uppercase text-white/35"><Clock3 className="w-3.5 h-3.5" /> No verified {horizon}D forecast sample yet</div>
        </div>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
            <Metric label="Verified" value={String(summary.count)} />
            <Metric label="Direction" value={summary.directionalAccuracyPct == null ? '—' : summary.directionalAccuracyPct.toFixed(1) + '%'} />
            <Metric label="Typical error" value={summary.medianAbsoluteError == null ? '—' : summary.medianAbsoluteError.toFixed(2) + ' pp'} />
            <Metric label="Likely range" value={summary.p25p75CoveragePct == null ? '—' : summary.p25p75CoveragePct.toFixed(1) + '%'} />
            <Metric label="Bias" value={summary.meanSignedErrorPct == null ? '—' : (summary.meanSignedErrorPct >= 0 ? '+' : '') + summary.meanSignedErrorPct.toFixed(2) + ' pp'} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[8px] font-mono text-white/30">
            <span className="rounded border border-white/10 bg-white/5 px-2 py-1 uppercase">{summary.sampleStatus.replace('-', ' ')}</span>
            {summary.newestVerifiedAt && <span>Last verified {new Date(summary.newestVerifiedAt).toLocaleString()}</span>}
            {globalGate && <span>Global verified sample {globalGate.verifiedCount} / {globalGate.minimumRequired}</span>}
          </div>
          <div className="mt-2 text-[8px] text-white/25">Validation sample status is shown separately from the holding's evidence gates and recorded decision context.</div>
        </>
      )}

      {globalGate && !globalGate.ready && <div className="mt-3 flex items-center gap-2 text-[8px] font-mono text-white/30"><ShieldAlert className="w-3.5 h-3.5 text-amber-300" /> 50 verified forecasts are required before the global validation gate is considered established.</div>}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-white/5 bg-black/10 p-2">
    <div className="text-[8px] font-mono uppercase text-white/25">{label}</div>
    <div className="text-sm font-mono font-bold mt-1">{value}</div>
  </div>;
}
