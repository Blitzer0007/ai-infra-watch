import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { authFetch } from '../utils/apiAuth';

type Family = {
  signal_type: string;
  evaluated_samples: number;
  mean_20d_excess_return_pct: number | null;
  win_rate_20d: number | null;
  lifecycle_status: string;
};

export default function SignalScorecardPanel() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    authFetch('/api/signal-scorecard')
      .then(response => response.json())
      .then(body => { if (!cancelled && Array.isArray(body?.families)) setFamilies(body.families); })
      .catch(() => { if (!cancelled) setFamilies([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="rounded-2xl border border-violet-400/15 bg-violet-400/[.025] p-4" aria-label="Signal validation scorecard">
      <div className="flex items-start gap-3">
        <BarChart3 className="w-4 h-4 text-violet-300 mt-0.5" aria-hidden="true" />
        <div>
          <div className="text-sm font-black text-white">Signal validation scorecard</div>
          <div className="text-[11px] text-white/55 mt-1">Signals are checked against SPY after 5 and 20 trading sessions. Negative benchmark-relative results are not treated as validated signals.</div>
        </div>
      </div>
      {loading ? <div className="mt-3 text-[10px] text-white/45">Loading validation history…</div> : families.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 mt-3">
          {families.map(family => {
            const excess = family.mean_20d_excess_return_pct;
            const status = family.lifecycle_status;
            return (
              <div key={family.signal_type} className="rounded-xl border border-white/10 bg-black/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono font-bold uppercase text-white/75">{family.signal_type}</span>
                  <span className="text-[9px] font-mono uppercase text-violet-200">{status}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div><div className="text-[9px] text-white/45">20D excess</div><div className="text-xs font-mono">{excess == null ? '—' : (excess >= 0 ? '+' : '−') + Math.abs(excess).toFixed(2) + ' pts'}</div></div>
                  <div><div className="text-[9px] text-white/45">Samples</div><div className="text-xs font-mono">{family.evaluated_samples}</div></div>
                </div>
                <div className="mt-2 text-[9px] text-white/45">20D win rate: {family.win_rate_20d == null ? '—' : (family.win_rate_20d * 100).toFixed(0) + '%'}</div>
              </div>
            );
          })}
        </div>
      ) : <div className="mt-3 text-[10px] text-white/45">No scored signal families yet. New signals will enter the 5/20-session validation queue.</div>}
      <div className="mt-3 text-[9px] font-mono text-white/35">Guardrail: validation measures historical signal behavior; it is not a forecast or trading instruction.</div>
    </section>
  );
}
