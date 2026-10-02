import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Search, ShieldCheck, XCircle } from 'lucide-react';
import { authFetch } from '../utils/apiAuth';

type EvidenceChannel = {
  status?: string;
  observedCalls?: number;
  successfulCalls?: number;
  failedCalls?: number;
  usableCalls?: number;
  lastError?: string | null;
};

type ResearchResult = {
  ok?: boolean;
  degraded?: boolean;
  summary?: string;
  error?: string;
  resolution?: string;
  answer_source?: string;
  calls?: Array<{ tool?: string; ok?: boolean; error?: string | null }>;
  hallucination?: {
    status?: string;
    claimCount?: number;
    groundedClaims?: number;
    ungroundedClaims?: number;
    hallucinationRate?: number | null;
  };
  jev?: {
    evidence_availability?: {
      required?: string[];
      missing?: string[];
      complete?: boolean;
      channels?: Record<string, EvidenceChannel>;
    };
    evidence_gate?: {
      action?: string;
      conflict_detection?: { detected?: boolean; count?: number };
      evidence_quality?: number | null;
      citation_coverage?: { coverage?: number | null };
    };
  };
};

const PROMPTS = [
  'What changed across my holdings?',
  'Why did my portfolio move recently?',
  'What recent SEC, news and macro developments matter to my holdings?',
];

const FAMILIES = [
  ['portfolio', 'Portfolio'],
  ['market', 'Market'],
  ['regulatory_primary', 'SEC / EDGAR'],
  ['news', 'News'],
  ['macro', 'Macro / geopolitical'],
] as const;

function channelClass(status?: string) {
  if (status === 'AVAILABLE') return 'border-emerald-400/20 bg-emerald-400/5 text-emerald-300';
  if (status === 'FAILED') return 'border-rose-400/20 bg-rose-400/5 text-rose-300';
  if (status === 'EMPTY') return 'border-amber-400/20 bg-amber-400/5 text-amber-300';
  return 'border-white/10 bg-white/[.02] text-white/40';
}

function inferEvidenceFamily(tool?: string) {
  const name = String(tool || '').toLowerCase();
  if (name.includes('portfolio') || name.includes('holdings')) return 'portfolio';
  if (name.startsWith('stocks.') || name.includes('quote') || name.includes('market')) return 'market';
  if (name.startsWith('filings.') || name.includes('sec') || name.includes('edgar')) return 'regulatory_primary';
  if (name.startsWith('news.')) return 'news';
  if (name.includes('macro') || name.includes('political') || name.includes('geopolitical') || name.includes('risk')) return 'macro';
  return null;
}

export default function PortfolioResearchPanel() {
  const [question, setQuestion] = useState(PROMPTS[0]);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [busy, setBusy] = useState(false);

  const observedChannels = useMemo(() => {
    const inferred: Record<string, EvidenceChannel> = {};
    for (const call of result?.calls || []) {
      if (!call.ok) continue;
      const family = inferEvidenceFamily(call.tool);
      if (!family) continue;
      const existing = inferred[family] || {};
      inferred[family] = {
        ...existing,
        status: 'AVAILABLE',
        observedCalls: Number(existing.observedCalls || 0) + 1,
        successfulCalls: Number(existing.successfulCalls || 0) + 1,
      };
    }
    return inferred;
  }, [result]);

  const channels = { ...observedChannels, ...(result?.jev?.evidence_availability?.channels || {}) };
  const portfolioQuestion = /portfolio|my holdings|my positions|held stocks|holdings/i.test(result?.summary || '') || /portfolio|my holdings|my positions|held stocks|holdings/i.test(question);
  const required = result?.jev?.evidence_availability?.required?.length
    ? result.jev.evidence_availability.required
    : portfolioQuestion ? FAMILIES.map(([key]) => key) : [];
  const missing = result?.jev?.evidence_availability?.missing || required.filter(key => channels[key]?.status !== 'AVAILABLE');
  const gate = result?.jev?.evidence_gate;

  const toolFamilies = useMemo(() => {
    const tools = (result?.calls || [])
      .filter(call => call.ok && call.tool)
      .map(call => call.tool as string);
    return [...new Set(tools)];
  }, [result]);

  async function runResearch(prompt = question) {
    const q = prompt.trim();
    if (!q || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await authFetch('/api/agent-ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.detail || body?.error || `Research request failed (${response.status})`);
      setResult(body);
    } catch (error) {
      setResult({ ok: false, degraded: true, error: error instanceof Error ? error.message : 'Portfolio research failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="portfolio-research">
      <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[.025] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[.2em] text-cyan-300/70">PORTFOLIO AUTONOMOUS RESEARCH</div>
            <h2 className="text-lg font-black mt-1">Research the portfolio as one subject</h2>
            <p className="text-[11px] text-white/45 mt-1 max-w-3xl">
              The agent first reads your persistent holdings, discovers the held ticker universe, then gathers market,
              primary SEC/EDGAR, recent news and macro/geopolitical evidence before producing an evidence-gated packet.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[9px] font-mono text-white/35">
            NO TRADING INSTRUCTIONS
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {PROMPTS.map(prompt => (
            <button
              key={prompt}
              type="button"
              onClick={() => { setQuestion(prompt); void runResearch(prompt); }}
              disabled={busy}
              className="rounded-lg border border-white/10 bg-white/[.03] px-3 py-2 text-left text-[10px] text-white/55 hover:text-white hover:border-white/20 disabled:opacity-40"
            >
              {prompt}
            </button>
          ))}
        </div>

        <form
          className="mt-3 flex flex-col md:flex-row gap-2"
          onSubmit={event => { event.preventDefault(); void runResearch(); }}
        >
          <input
            data-testid="portfolio-research-question"
            value={question}
            onChange={event => setQuestion(event.target.value)}
            className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-400/30"
            placeholder="Ask what changed across my holdings..."
          />
          <button
            data-testid="portfolio-research-run"
            type="submit"
            disabled={busy || !question.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-[10px] font-mono font-black uppercase tracking-wider text-black disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {busy ? 'Researching…' : 'Research Portfolio'}
          </button>
        </form>
      </div>

      {result && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/10 bg-[#15181E]/45 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {result.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
                <span className="text-[10px] font-mono uppercase tracking-wider text-white/55">Research packet</span>
                {result.degraded && <span className="text-[9px] font-mono uppercase text-amber-300">degraded</span>}
              </div>
              <span className="text-[9px] font-mono text-white/30">{result.resolution || 'completed'}</span>
            </div>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/80 max-h-[28rem] overflow-y-auto aiw-scroll-region">
              {result.summary || result.error || 'No research synthesis returned.'}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-3">
            <div className="rounded-2xl border border-white/10 bg-[#15181E]/40 p-4">
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-white/35">
                <ShieldCheck className="w-3.5 h-3.5" /> Evidence coverage
              </div>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
                {FAMILIES.map(([key, label]) => {
                  const channel = channels[key];
                  const requiredHere = required.includes(key);
                  return (
                    <div key={key} className={'rounded-lg border p-2 ' + channelClass(channel?.status)}>
                      <div className="text-[9px] font-mono uppercase">{label}</div>
                      <div className="mt-1 text-[9px] font-mono">
                        {channel?.status || (requiredHere ? 'MISSING' : 'NOT USED')}
                      </div>
                    </div>
                  );
                })}
              </div>
              {missing.length > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[.03] p-2 text-[9px] leading-4 text-amber-200/70">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Required evidence still missing: {missing.join(', ')}.
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#15181E]/40 p-4">
              <div className="text-[10px] font-mono uppercase tracking-wider text-white/35">Research integrity</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] font-mono">
                <span className="rounded border border-white/10 p-2 text-white/45">Gate: <b className="text-white/70">{gate?.action || '—'}</b></span>
                <span className="rounded border border-white/10 p-2 text-white/45">Quality: <b className="text-white/70">{gate?.evidence_quality != null ? Math.round(gate.evidence_quality) + '%' : '—'}</b></span>
                <span className="rounded border border-white/10 p-2 text-white/45">Conflict: <b className={gate?.conflict_detection?.detected ? 'text-amber-300' : 'text-emerald-300'}>{gate?.conflict_detection?.detected ? `${gate.conflict_detection.count || 0} detected` : 'none detected'}</b></span>
                <span className="rounded border border-white/10 p-2 text-white/45">Citation coverage: <b className="text-white/70">{gate?.citation_coverage?.coverage != null ? Math.round((gate.citation_coverage.coverage || 0) * 100) + '%' : '—'}</b></span>
              </div>
              {result.hallucination && (
                <div className="mt-2 rounded border border-white/10 p-2 text-[9px] font-mono text-white/40">
                  Claim grounding: <span className="text-white/70">{result.hallucination.status || '—'}</span>
                  {' · '}claims {result.hallucination.claimCount ?? 0}
                  {' · '}flagged {result.hallucination.ungroundedClaims ?? 0}
                </div>
              )}
            </div>
          </div>

          {toolFamilies.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-[#15181E]/35 p-3">
              <div className="text-[9px] font-mono uppercase tracking-wider text-white/30">Evidence channels used</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {toolFamilies.map(tool => (
                  <span key={tool} className="rounded border border-white/10 px-2 py-1 text-[8px] font-mono text-white/40">{tool}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
