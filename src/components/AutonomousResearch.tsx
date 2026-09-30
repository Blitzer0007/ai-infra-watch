import { useEffect, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Clock3,
  Loader2,
  MessageSquareText,
  Radio,
  Search,
  ShieldAlert,
  Terminal,
  XCircle,
} from 'lucide-react';

type ResearchResponse = {
  mode?: string;
  question?: string;
  ok?: boolean;
  degraded?: boolean;
  summary?: string;
  answer_source?: 'agent-llm' | 'deterministic-evidence' | 'deterministic-fallback' | 'none' | string;
  jev?: {
    enabled?: boolean;
    action?: string;
    choice?: string;
    confidence?: number;
    model?: string;
    latency_ms?: number;
    tool?: string;
    error?: string;
    evidence_availability?: {
      required?: string[];
      missing?: string[];
      complete?: boolean;
      channels?: Record<string, {
        status?: 'AVAILABLE' | 'EMPTY' | 'FAILED' | 'MISSING' | string;
        observedCalls?: number;
        successfulCalls?: number;
        failedCalls?: number;
        usableCalls?: number;
        lastError?: string | null;
      }>;
      status_counts?: Record<string, number>;
    };
    evidence_gate?: {
      enabled?: boolean;
      action?: string;
      choice?: string;
      choice_confidence?: number;
      raw_score?: number | null;
      evidence_quality?: number | null;
      model?: string;
      latency_ms?: number;
      input_tokens?: number | null;
      checked_after_successful_calls?: number;
      fallback?: boolean;
      error?: string;
    };
  };
  error?: string | null;
  resolution?: string | null;
  discovered?: string[];
  calls?: Array<{
    tool: string;
    arguments?: Record<string, unknown>;
    ok: boolean;
    output?: unknown;
    error?: string | null;
  }>;
  trajectory?: Array<{
    node: string;
    kind: string;
    tool?: string | null;
    ok: boolean;
    note?: string | null;
    duration_ms?: number | null;
  }>;
};

function answerSourceLabel(source?: string) {
  switch (source) {
    case 'agent-llm': return 'Agent LLM synthesis';
    case 'deterministic-evidence': return 'Deterministic evidence output';
    case 'deterministic-fallback': return 'Deterministic fallback';
    case 'none': return 'No answer source';
    default: return source || 'Source not reported';
  }
}

function answerSourceClass(source?: string) {
  if (source === 'agent-llm') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300';
  if (source === 'deterministic-evidence') return 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300';
  if (source === 'deterministic-fallback') return 'border-amber-400/20 bg-amber-400/10 text-amber-300';
  return 'border-white/10 bg-white/5 text-white/40';
}

const EXAMPLES = [
  'What changed recently across MU, NVDA and SNDK?',
  'Compare recent earnings reactions for NVDA and AMD.',
  'Trace recent SEC contract disclosures for AI infrastructure companies.',
];

export default function AutonomousResearch() {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<ResearchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [backendMessage, setBackendMessage] = useState('');

  const checkBackend = async () => {
    try {
      const res = await fetch('/api/agent-ask', { method: 'GET' });
      const body = await res.json().catch(() => ({}));
      const online = res.ok && (body?.ok === true || body?.status === 'ok');
      setBackendOnline(online);
      setBackendMessage(
        online
          ? body?.service || 'Autonomous backend online'
          : body?.error || 'Autonomous backend is not connected'
      );
    } catch {
      setBackendOnline(false);
      setBackendMessage('Unable to reach the autonomous backend proxy');
    }
  };

  useEffect(() => {
    void checkBackend();
  }, []);

  const runResearch = async (overrideQuestion?: string) => {
    const q = (overrideQuestion ?? question).trim();
    if (!q || busy) return;

    setBusy(true);
    setResult(null);

    try {
      const res = await fetch('/api/agent-ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body?.detail || body?.error || `Agent request failed (${res.status})`);
      }

      setResult(body);
      setBackendOnline(true);
      setBackendMessage('Autonomous backend online');
      setQuestion(q);
    } catch (err: any) {
      setResult({
        question: q,
        ok: false,
        degraded: true,
        summary: '',
        error: err?.message || 'Autonomous research failed',
      });
      setBackendOnline(false);
      setBackendMessage(err?.message || 'Autonomous research failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6" id="autonomous-research-view">
      <div className="aiw-page-header flex flex-col space-y-1 md:space-y-2 border-b border-white/10 pb-4">
        <span className="text-xs font-mono uppercase tracking-widest text-white/40">Agentic Research</span>
        <div className="flex items-center gap-3">
          <Bot className="w-7 h-7 text-emerald-400" />
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">Autonomous AI Research</h1>
        </div>
        <p className="text-sm text-white/55 max-w-3xl">
          Ask a research question and let the bounded MCP agent select market, filing, earnings,
          event-study, relationship, and rotation tools from the live catalog.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#15181E]/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider">
            <span className={`w-2 h-2 rounded-full ${backendOnline === true ? 'bg-emerald-400' : backendOnline === false ? 'bg-rose-400' : 'bg-yellow-400 animate-pulse'}`} />
            <span className="text-white/70">
              {backendOnline === true ? 'AGENT BACKEND ONLINE' : backendOnline === false ? 'AGENT BACKEND OFFLINE' : 'CHECKING AGENT BACKEND'}
            </span>
          </div>
          <button
            onClick={() => void checkBackend()}
            className="text-[10px] font-mono uppercase tracking-wider text-white/40 hover:text-white transition cursor-pointer"
          >
            Recheck
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runResearch();
          }}
          className="space-y-3"
        >
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about a ticker, catalyst, filing, earnings reaction, peer relationship, or market rotation..."
            rows={4}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-emerald-400/40 resize-y"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[10px] font-mono text-white/35">
              {backendMessage || 'Native Vercel Python agent route; a separate backend URL is optional.'}
            </span>
            <button
              type="submit"
              disabled={busy || !question.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-mono font-black uppercase tracking-wider text-black hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {busy ? 'Investigating...' : 'Run Research'}
            </button>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              onClick={() => void runResearch(example)}
              disabled={busy}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-[10px] leading-relaxed text-white/50 hover:text-white hover:border-white/20 transition disabled:opacity-40 cursor-pointer"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <>
          <div className="rounded-2xl border border-white/10 bg-[#15181E]/40 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {result.ok
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  : <XCircle className="w-5 h-5 text-rose-400" />}
                <span className="text-xs font-mono uppercase tracking-wider text-white/70">
                  {result.mode || 'autonomous-mcp'}
                </span>
                {result.degraded && (
                  <span className="rounded border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 text-[9px] font-mono uppercase text-yellow-300">
                    degraded
                  </span>
                )}
              </div>
              {result.question && (
                <span className="max-w-2xl truncate text-[10px] font-mono text-white/30">{result.question}</span>
              )}
            </div>

            <div className="rounded-xl border border-white/5 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-white/35">
                  <MessageSquareText className="w-3.5 h-3.5" />
                  Synthesis
                </div>
                <span className={'rounded border px-2 py-1 text-[9px] font-mono font-black uppercase tracking-wider ' + answerSourceClass(result.answer_source)}>
                  Answer source: {answerSourceLabel(result.answer_source)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-white/80">
                {result.summary || result.error || 'No synthesis was returned.'}
              </p>
              {result.resolution && (
                <p className="mt-3 text-[10px] font-mono text-white/35">Resolution: {result.resolution}</p>
              )}
              {result.jev?.evidence_gate && (
                <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <div className="mb-2 text-[9px] font-mono uppercase tracking-wider text-white/35">
                    Evidence coverage
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(result.jev.evidence_gate.evidence_availability?.channels || {}).map(([family, channel]) => (
                      <span
                        key={family}
                        className={
                          'rounded border px-1.5 py-0.5 ' +
                          (
                            channel.status === 'AVAILABLE'
                              ? 'border-emerald-400/20 bg-emerald-400/5 text-emerald-300'
                              : channel.status === 'EMPTY'
                                ? 'border-cyan-400/20 bg-cyan-400/5 text-cyan-300'
                                : channel.status === 'FAILED'
                                  ? 'border-rose-400/20 bg-rose-400/5 text-rose-300'
                                  : 'border-amber-400/20 bg-amber-400/5 text-amber-300'
                          )
                        }
                      >
                        {family}: {channel.status || 'UNKNOWN'}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] font-mono text-white/25">
                <span>Tool outputs below are the evidence sources used by the answer.</span>
                {result.jev?.enabled && result.jev.choice && (
                  <span className="rounded border border-fuchsia-400/20 bg-fuchsia-400/5 px-1.5 py-0.5 text-fuchsia-300/80">
                    Jev route: {result.jev.choice} · {typeof result.jev.confidence === 'number' ? Math.round(result.jev.confidence * 100) + '%' : 'confidence n/a'}
                  </span>
                )}
                {result.jev?.evidence_gate && (
                  <span className={
                    'rounded border px-1.5 py-0.5 ' +
                    (
                      result.jev.evidence_gate.action === 'stop'
                        ? 'border-emerald-400/20 bg-emerald-400/5 text-emerald-300/80'
                        : result.jev.evidence_gate.action === 'gather_more'
                          ? 'border-amber-400/20 bg-amber-400/5 text-amber-300/80'
                          : result.jev.evidence_gate.action === 'insufficient'
                            ? 'border-rose-400/20 bg-rose-400/5 text-rose-300/80'
                            : 'border-fuchsia-400/20 bg-fuchsia-400/5 text-fuchsia-300/80'
                    )
                  }>
                    Evidence gate: {result.jev.evidence_gate.action || 'continue'}
                    {typeof result.jev.evidence_gate.evidence_quality === 'number'
                      ? ' · ' + Math.round(result.jev.evidence_gate.evidence_quality) + '/100'
                      : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-white/10 bg-[#15181E]/40 p-5">
              <div className="mb-4 flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-white/50">
                <Terminal className="w-4 h-4" />
                MCP Tool Calls
              </div>
              <div className="space-y-2">
                {(result.calls || []).map((call, index) => (
                  <div key={`${call.tool}-${index}`} className="rounded-xl border border-white/5 bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-xs font-mono text-white/80">{call.tool}</span>
                      {call.ok
                        ? <span className="text-[9px] font-mono uppercase text-emerald-400">OK</span>
                        : <span className="text-[9px] font-mono uppercase text-rose-400">FAILED</span>}
                    </div>
                    {call.error && <p className="mt-2 text-[10px] text-rose-300/80">{call.error}</p>}
                  </div>
                ))}
                {!(result.calls || []).length && (
                  <p className="text-xs text-white/30">No MCP calls recorded.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#15181E]/40 p-5">
              <div className="mb-4 flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-white/50">
                <Radio className="w-4 h-4" />
                Agent Trace
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {(result.trajectory || []).map((step, index) => (
                  <div key={`${step.node}-${index}`} className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/20 p-3">
                    <span className="mt-0.5 text-[9px] font-mono text-white/25">T{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-mono uppercase text-white/70">{step.node}</span>
                        {step.tool && <span className="text-[9px] font-mono text-emerald-400/70">{step.tool}</span>}
                      </div>
                      {step.note && <p className="mt-1 text-[10px] text-white/35">{step.note}</p>}
                    </div>
                    <div className="flex items-center gap-2 text-[9px] font-mono text-white/25">
                      <Clock3 className="w-3 h-3" />
                      {typeof step.duration_ms === 'number' ? `${step.duration_ms}ms` : '—'}
                    </div>
                  </div>
                ))}
                {!(result.trajectory || []).length && (
                  <p className="text-xs text-white/30">No trajectory data returned.</p>
                )}
              </div>
            </div>
          </div>

          {result.discovered && result.discovered.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-[#15181E]/40 p-4">
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-white/35">
                <ShieldAlert className="w-3.5 h-3.5" />
                Discovered tools: {result.discovered.length}
              </div>
              <p className="mt-2 text-[10px] font-mono leading-relaxed text-white/30">
                {result.discovered.join(' · ')}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
