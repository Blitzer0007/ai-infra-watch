import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { authHeaders } from '../utils/apiAuth';

type JevAnswer = {
  type?: 'choice' | 'score' | 'noul' | string;
  choice?: string | null;
  confidence?: number | null;
  score?: number | null;
  legend?: Record<string, string>;
  noul?: number | null;
};

type EvidenceMeasurement = {
  score?: number | null;
  percent?: number | null;
  label?: string;
  usable_family_count?: number;
  usable_families?: string[];
  fresh_count?: number;
  aging_count?: number;
  stale_count?: number;
  missing_required?: string[];
  conflict_count?: number;
  citation_coverage?: number | null;
  source?: string;
};

type Props = {
  kind: 'platform' | 'portfolio' | 'contracts' | 'events' | 'macro' | 'congress' | 'earnings';
  state: unknown;
  title?: string;
  subtitle?: string;
};

function labelize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function confidence(value?: number | null) {
  return typeof value === 'number' ? Math.round(value * 100) + '%' : 'n/a';
}

function evidenceQuality(score?: number | null) {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return { percent: null, label: 'n/a' };
  }

  // TypeSafe Score uses the four-level criteria as an ordinal scale:
  // 0 = first criterion ... 3 = fourth criterion. Normalize that scale to 0-100
  // so every Jev panel presents the same human-readable evidence-quality metric.
  const normalized = Math.max(0, Math.min(3, score)) / 3 * 100;
  const percent = Math.round(normalized);
  const label =
    percent < 25 ? 'Minimal' :
    percent < 50 ? 'Partial' :
    percent < 75 ? 'Usable' :
    'Strong';

  return { percent, label };
}

export default function JevDecisionPanel({
  kind,
  state,
  title = 'Jev decision layer',
  subtitle = 'Typed triage and evidence checks; this does not generate narrative text or trading instructions.',
}: Props) {
  const [answers, setAnswers] = useState<Record<string, JevAnswer>>({});
  const [latency, setLatency] = useState<number | null>(null);
  const [inputTokens, setInputTokens] = useState<number | null>(null);
  const [model, setModel] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ran, setRan] = useState(false);

  const evidenceMeasurement = useMemo<EvidenceMeasurement | null>(() => {
    const value = (state as any)?.evidenceQualityInput;
    if (!value || typeof value !== 'object') return null;
    const availability = value.evidence_availability || {};
    const families = Array.isArray(availability.usable_families) ? availability.usable_families : [];
    const freshness = Array.isArray(value.evidence_freshness) ? value.evidence_freshness : [];
    const statuses = freshness.map((item: any) => String(item?.freshness?.status || '').toUpperCase());
    const fresh = statuses.filter((item: string) => item === 'FRESH').length;
    const aging = statuses.filter((item: string) => item === 'AGING').length;
    const stale = statuses.filter((item: string) => item === 'STALE').length;
    let score = families.length >= 3 ? 3 : families.length === 2 ? 2 : families.length === 1 ? 1 : 0;
    if (statuses.length && stale === statuses.length) score = Math.min(score, 1);
    else if (statuses.length && fresh === 0 && aging === statuses.length) score = Math.min(score, 2);
    const missing = Array.isArray(availability.missing) ? availability.missing : [];
    if (missing.length) score = Math.min(score, 1.5);
    return {
      score,
      percent: Math.round(score / 3 * 100),
      label: score < .75 ? 'Minimal' : score < 1.5 ? 'Partial' : score < 2.25 ? 'Usable' : 'Strong',
      usable_family_count: families.length,
      usable_families: families,
      fresh_count: fresh,
      aging_count: aging,
      stale_count: stale,
      missing_required: missing,
      source: 'portfolio measured evidence input',
    };
  }, [state]);

  const stableState = useMemo(() => JSON.stringify(state ?? {}), [state]);

  useEffect(() => {
    setAnswers({});
    setError('');
    setRan(false);
    setLatency(null);
    setInputTokens(null);
    setModel('');
  }, [kind, stableState]);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/jev-assess', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ kind, state }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error || body?.detail?.error || 'Jev assessment unavailable');
      }
      setAnswers(body.answers || {});
      setLatency(typeof body.latency_ms === 'number' ? body.latency_ms : null);
      setInputTokens(typeof body.input_tokens === 'number' ? body.input_tokens : null);
      setModel(body.model || '');
      setRan(true);
    } catch (err) {
      setAnswers({});
      setError(err instanceof Error ? err.message : 'Jev assessment unavailable');
      setRan(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-fuchsia-400/10 bg-fuchsia-400/[0.02] p-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-fuchsia-300">
            <BrainCircuit className="w-4 h-4" />
            <span className="text-[9px] font-mono font-black uppercase tracking-[0.2em]">Jev</span>
          </div>
          <h3 className="text-xs font-black uppercase tracking-widest text-white mt-1">{title}</h3>
          <p className="text-[10px] text-white/35 mt-1 max-w-3xl">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-fuchsia-400/20 bg-fuchsia-400/10 px-3 py-2 text-[9px] font-mono font-black uppercase tracking-wider text-fuchsia-200 hover:bg-fuchsia-400/15 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {busy ? 'Evaluating…' : ran ? 'Re-run Jev' : 'Run Jev Review'}
        </button>
      </div>

      {evidenceMeasurement && (
        <div className="mt-3 rounded-xl border border-cyan-400/10 bg-cyan-400/[0.02] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[8px] font-mono uppercase tracking-widest text-cyan-300">Measured evidence state</div>
              <div className="text-[9px] text-white/35 mt-1">Deterministic coverage input; Jev does not choose this score.</div>
            </div>
            <div className="text-sm font-black text-white">{evidenceMeasurement.percent}/100 · {evidenceMeasurement.label}</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
            <div className="text-[8px] font-mono text-white/35">Families: <span className="text-white/70">{evidenceMeasurement.usable_family_count}</span></div>
            <div className="text-[8px] font-mono text-white/35">Fresh: <span className="text-white/70">{evidenceMeasurement.fresh_count}</span></div>
            <div className="text-[8px] font-mono text-white/35">Aging: <span className="text-white/70">{evidenceMeasurement.aging_count}</span></div>
            <div className="text-[8px] font-mono text-white/35">Stale: <span className="text-white/70">{evidenceMeasurement.stale_count}</span></div>
          </div>
          {evidenceMeasurement.usable_families?.length ? <div className="mt-2 text-[8px] font-mono text-white/25">Sources: {evidenceMeasurement.usable_families.map(labelize).join(' · ')}</div> : null}
          {evidenceMeasurement.missing_required?.length ? <div className="mt-1 text-[8px] font-mono text-amber-200/60">Missing: {evidenceMeasurement.missing_required.map(labelize).join(' · ')}</div> : null}
        </div>
      )}

      {!ran && (
        <div className="mt-3 text-[10px] font-mono text-white/25">
          Run on demand to preserve Jev credits; multiple checks are evaluated in one request.
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/5 p-3 text-[10px] text-amber-200/80 font-mono">
          Jev unavailable: {error}
        </div>
      )}

      {Object.keys(answers).length > 0 && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
          {(Object.entries(answers) as Array<[string, JevAnswer]>).map(([key, answer]) => (
            <div key={key} className="rounded-xl border border-white/5 bg-black/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-mono uppercase tracking-wider text-white/35">{labelize(key)}</span>
                <ShieldCheck className="w-3.5 h-3.5 text-fuchsia-300/70" />
              </div>

              {answer.type === 'choice' && (
                <>
                  <div className="mt-2 text-sm font-black text-white">{labelize(answer.choice || 'unknown')}</div>
                  <div className="mt-1 text-[9px] font-mono text-fuchsia-200/70">
                    confidence {confidence(answer.confidence)}
                  </div>
                </>
              )}

              {answer.type === 'score' && (
                <>
                  {key === 'evidence_quality' ? (
                    (() => {
                      const quality = evidenceQuality(answer.score);
                      return (
                        <>
                          <div className="mt-2 flex items-end justify-between gap-3">
                            <div className="text-sm font-black text-white">
                              {quality.percent != null ? quality.percent + '/100' : 'n/a'}
                              <span className="text-[9px] font-mono font-normal text-white/35 ml-2">
                                {quality.label}
                              </span>
                            </div>
                            {typeof answer.score === 'number' && (
                              <span className="text-[9px] font-mono text-white/25">
                                Jev {answer.score.toFixed(2)} / 3.00
                              </span>
                            )}
                          </div>
                          {quality.percent != null && (
                            <div
                              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5"
                              aria-label={'Evidence quality ' + quality.percent + ' out of 100'}
                            >
                              <div
                                className="h-full rounded-full bg-fuchsia-300/80 transition-all"
                                style={{ width: quality.percent + '%' }}
                              />
                            </div>
                          )}
                          <div className="mt-2 text-[8px] font-mono uppercase tracking-wider text-white/25">
                            0–24 Minimal · 25–49 Partial · 50–74 Usable · 75–100 Strong
                          </div>
                          <div className="mt-1 text-[9px] font-mono text-fuchsia-200/70">
                            confidence {confidence(answer.confidence)}
                          </div>
                        </>
                      );
                    })()
                  ) : (
                    <>
                      <div className="mt-2 text-sm font-black text-white">
                        {typeof answer.score === 'number' ? answer.score.toFixed(2) : 'n/a'}
                        {answer.legend?.[String(Math.round(answer.score ?? 0))] && (
                          <span className="text-[9px] font-mono font-normal text-white/35 ml-2">
                            {answer.legend[String(Math.round(answer.score ?? 0))]}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[9px] font-mono text-fuchsia-200/70">
                        confidence {confidence(answer.confidence)}
                      </div>
                    </>
                  )}
                </>
              )}

              {answer.type === 'noul' && (
                <div className="mt-2 text-sm font-black text-white">
                  {typeof answer.noul === 'number' ? Math.round(answer.noul * 100) + '% yes' : 'n/a'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {ran && Object.keys(answers).length > 0 && (
        <div className="mt-3 text-[9px] font-mono text-white/25">
          {model ? 'Model: ' + model + ' · ' : ''}
          {latency != null ? Math.round(latency) + ' ms' : 'latency n/a'}
          {inputTokens != null ? ' · ' + inputTokens + ' input tokens' : ''}
        </div>
      )}
    </section>
  );
}
