import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Loader2, ShieldCheck, Sparkles } from 'lucide-react';

type JevAnswer = {
  type?: 'choice' | 'score' | 'noul' | string;
  choice?: string | null;
  confidence?: number | null;
  score?: number | null;
  legend?: Record<string, string>;
  noul?: number | null;
};

type Props = {
  kind: 'platform' | 'contracts' | 'events' | 'macro' | 'congress' | 'earnings';
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
        headers: { 'Content-Type': 'application/json' },
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
