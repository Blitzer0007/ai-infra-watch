import { useMemo, useState } from 'react';
import {
  ArrowRight, BookOpen, CheckCircle2, CircleHelp, FileSearch, Gauge,
  Globe2, Layers3, ShieldAlert, Sparkles, TrendingUp, X
} from 'lucide-react';

type Props = {
  onNavigate: (view: string) => void;
};

type GuideItem = {
  id: string;
  title: string;
  question: string;
  meaning: string;
  example: string;
  screenshot: string;
  view: string;
  icon: any;
};

const ITEMS: GuideItem[] = [
  {
    id: 'portfolio-intelligence',
    title: 'Portfolio Intelligence',
    question: 'What does this mean?',
    meaning: 'This is the main portfolio analysis layer. It combines your holdings, live prices, peers, catalysts, evidence, macro risks and historical events so you can investigate what changed and why.',
    example: 'Example: MU shows RISK REVIEW. Read the trigger, verify the evidence, then check its event history before deciding what the change means for your thesis.',
    screenshot: 'Screenshot reference: Portfolio Intelligence / holding state',
    view: 'portfolio',
    icon: TrendingUp
  },
  {
    id: 'portfolio-triage',
    title: 'Portfolio Triage',
    question: 'What should I look at first?',
    meaning: 'Triage shows what deserves your attention first. ADD REVIEW, RISK REVIEW and INSUFFICIENT DATA tell you where to investigate, not what trade to make.',
    example: 'RISK REVIEW = investigate relevant downside evidence. ADD REVIEW = investigate supporting evidence. INSUFFICIENT DATA = do not force a conclusion.',
    screenshot: 'Screenshot reference: Portfolio Intelligence / review-state badges',
    view: 'portfolio',
    icon: Gauge
  },
  {
    id: 'evidence',
    title: 'Evidence',
    question: 'Why does the app say this?',
    meaning: 'Evidence is the information behind a signal: filings, official announcements, contracts, market data, policy statements, news and historical events.',
    example: 'Primary source: SEC/company/government source. Secondary source: reporting about the event. A model score is an output, not a source.',
    screenshot: 'Screenshot reference: Evidence / source / date / related stock',
    view: 'research',
    icon: FileSearch
  },
  {
    id: 'contracts',
    title: 'Contracts & Catalysts',
    question: 'What business event could matter?',
    meaning: 'The Contracts Ledger records commercial agreements and milestones. Check the customer, scope, date, status and original source.',
    example: 'A signed AI data-center agreement is a documented catalyst. It does not by itself prove a future stock-price increase.',
    screenshot: 'Screenshot reference: Contracts Ledger',
    view: 'contracts',
    icon: Layers3
  },
  {
    id: 'progress',
    title: 'Progress Tracker & Event Study',
    question: 'Did the market react?',
    meaning: 'These views connect milestones with historical price behavior. Look at the event date, immediate reaction, persistence and reversals.',
    example: 'If a stock moved from $100 to $108 after an event and later returned to $105, the chart shows the observed reaction; it does not prove causation.',
    screenshot: 'Screenshot reference: Progress Tracker / milestone on price chart',
    view: 'tracker',
    icon: TrendingUp
  },
  {
    id: 'macro',
    title: 'Macro & Politics',
    question: 'What external risks can affect my holdings?',
    meaning: 'This area tracks geopolitical, policy, semiconductor, power and regulatory risks and maps evidence-backed exposure to your holdings.',
    example: 'Direct = evidence indicates a direct connection. Secondary = indirect connection. Limited = current evidence shows limited connection.',
    screenshot: 'Screenshot reference: Macro & Politics / exposure matrix',
    view: 'macro',
    icon: ShieldAlert
  },
  {
    id: 'sensitivity',
    title: 'Scenario impact',
    question: 'What if a risk becomes worse?',
    meaning: 'Scenario impact is a modeled sensitivity score, not a price forecast. It shows which holdings are more sensitive to the assumptions you enter.',
    example: 'Taiwan disruption + power stress + export-control assumptions produce a sensitivity score. It does not mean the portfolio will fall by that score.',
    screenshot: 'Screenshot reference: Macro & Politics / Scenario impact',
    view: 'macro',
    icon: Gauge
  },
  {
    id: 'signals',
    title: 'Political & AI Policy Signals',
    question: 'What are policymakers saying or doing?',
    meaning: 'Signals collect recent political statements, official actions and related reporting about AI, chips, data centers, power and regulation.',
    example: 'PRIMARY means the returned source is an official source. SECONDARY means reporting that should be verified before relying on the wording.',
    screenshot: 'Screenshot reference: Political & AI Policy Signals',
    view: 'macro',
    icon: Globe2
  },
  {
    id: 'watchlist',
    title: 'Watchlist',
    question: 'What should I monitor outside my holdings?',
    meaning: 'Watchlist lets you follow peers and emerging names using the same market, peer, catalyst and event framework.',
    example: 'If AMD moves while NVDA is flat, use the watchlist to investigate whether the difference is explained by a catalyst, peer rotation or market event.',
    screenshot: 'Screenshot reference: Watchlist / peer signals',
    view: 'watchlist',
    icon: TrendingUp
  },
  {
    id: 'forward-outlook',
    title: 'Forward Outlook & Forecast Verification',
    question: 'How do I test whether the historical forecast actually works?',
    meaning: 'Forward Outlook uses historical market regimes to build return distributions for 5D, 20D, 60D, 6M and 12M horizons. It is scenario analysis and historical evidence, not a guaranteed price prediction. Forecast Verification stores a forecast and later compares it with the observed market return.',
    example: 'For a 20D forecast, Median +20% means the historical analogue distribution had a +20% median—not that the stock will reach +20%. Middle historical range is the middle historical range. After the target date, actual return and median error show what happened.',
    screenshot: 'Screenshot reference: Forward Outlook / forecast verification / validation matrix',
    view: 'outlook',
    icon: TrendingUp
  },
  {
    id: 'research',
    title: 'AI Research',
    question: 'How do I ask the system to investigate?',
    meaning: 'AI Research is the evidence-synthesis layer. Ask it to find, connect and explain new evidence instead of asking it to predict tomorrow’s price.',
    example: 'Good: “Find new evidence from the last 24 hours that could affect my holdings.” Weak: “Which stock will go up tomorrow?”',
    screenshot: 'Screenshot reference: AI Research',
    view: 'research',
    icon: Sparkles
  }
];

export default function HelpGuide({ onNavigate }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('portfolio-intelligence');
  const [jevBusy, setJevBusy] = useState(false);
  const [jevAnswer, setJevAnswer] = useState<string | null>(null);
  const [jevMeta, setJevMeta] = useState<{ route?: string; gate?: string } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? ITEMS.filter(item => (item.title + ' ' + item.question + ' ' + item.meaning + ' ' + item.example).toLowerCase().includes(q)) : ITEMS;
  }, [query]);

  const active = ITEMS.find(item => item.id === selected) ?? ITEMS[0];
  const Icon = active.icon;

  const askJev = async (prompt: string) => {
    if (jevBusy) return;
    setJevBusy(true);
    setJevAnswer(null);
    setJevMeta(null);
    try {
      const response = await fetch('/api/agent-ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: [
            'Act as the JEV-powered in-app guide for AI Infra Watch.',
            'The user wants guidance, not an investment recommendation.',
            'Explain the current UI in plain English, give the next 3 useful steps, identify what evidence the user should verify, and say when evidence is insufficient.',
            'Current guide topic: ' + active.title,
            'Topic meaning: ' + active.meaning,
            'Topic example: ' + active.example,
            'User request: ' + prompt
          ].join(' ')
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.detail || body?.error || 'JEV guide request failed');
      setJevAnswer(body.summary || body.error || 'No JEV guidance was returned.');
      setJevMeta({
        route: body?.jev?.choice,
        gate: body?.jev?.evidence_gate?.action
      });
    } catch (error: any) {
      setJevAnswer(error?.message || 'JEV guide is currently unavailable.');
    } finally {
      setJevBusy(false);
    }
  };


  return (
    <div className="space-y-6">
      <div className="aiw-page-header flex flex-col gap-2 border-b border-white/10 pb-5">
        <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-mono uppercase tracking-[0.2em]">
          <BookOpen className="w-4 h-4" />
          AI INFRA WATCH / USER GUIDE
        </div>
        <h1 className="text-3xl md:text-5xl font-black tracking-tighter uppercase italic text-white">
          How to Read This Dashboard
        </h1>
        <p className="text-xs md:text-sm text-white/50 max-w-3xl leading-relaxed">
          Plain-English explanations of every major screen, score and evidence label. Use the examples to understand what the application is telling you — and what it is not telling you.
        </p>
      </div>

      <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4 md:p-5">
        <div className="flex items-start gap-3">
          <CircleHelp className="w-5 h-5 text-emerald-300 mt-0.5 shrink-0" />
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-emerald-300">The core mental model</div>
            <div className="text-sm md:text-base font-black text-white mt-1">
              Market Data + Business Events + Sources + History + Macro Risk + Portfolio Holdings → Research Priorities
            </div>
            <p className="text-[10px] md:text-xs text-white/45 mt-2">
              A signal tells you where to look. Evidence tells you why. Your own review determines what it means for your portfolio.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-4">
        <div className="rounded-2xl border border-white/10 bg-[#15181E]/50 p-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-white/35 mb-3">Find a concept</div>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search Portfolio Intelligence, evidence, scores..."
            className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-400/30"
          />
          <div className="mt-3 space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
            {filtered.map(item => {
              const ItemIcon = item.icon;
              const isActive = item.id === selected;
              return (
                <button
                  key={item.id}
                  onClick={() => setSelected(item.id)}
                  className={'w-full text-left rounded-xl border px-3 py-3 transition ' + (
                    isActive
                      ? 'border-emerald-400/20 bg-emerald-400/10'
                      : 'border-transparent bg-white/[.02] hover:bg-white/5'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <ItemIcon className={'w-4 h-4 ' + (isActive ? 'text-emerald-300' : 'text-white/35')} />
                    <span className={'text-xs font-black ' + (isActive ? 'text-white' : 'text-white/70')}>{item.title}</span>
                  </div>
                  <div className="text-[10px] text-white/35 mt-1 pl-6">{item.question}</div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="p-4 text-xs text-white/35">No guide topic matches your search.</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#15181E]/50 overflow-hidden">
          <div className="p-5 md:p-6 border-b border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-2.5">
                  <Icon className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-emerald-300/70">Concept</div>
                  <h2 className="text-xl md:text-2xl font-black text-white mt-1">{active.title}</h2>
                </div>
              </div>
              <span className="text-[9px] font-mono uppercase text-white/25">{active.screenshot}</span>
            </div>
          </div>

          <div className="p-5 md:p-6 space-y-5">
            <section>
              <div className="text-[9px] font-mono uppercase tracking-widest text-white/30">In plain English</div>
              <p className="text-sm text-white/75 leading-relaxed mt-2">{active.meaning}</p>
            </section>

            <section className="rounded-xl border border-cyan-400/10 bg-cyan-400/5 p-4">
              <div className="text-[9px] font-mono uppercase tracking-widest text-cyan-300/70">Example</div>
              <p className="text-xs text-white/65 leading-relaxed mt-2">{active.example}</p>
            </section>
            {active.id === 'forward-outlook' && (
              <section className="rounded-xl border border-amber-400/15 bg-amber-400/5 p-4">
                <div className="text-[9px] font-mono uppercase tracking-widest text-amber-300/80">How to interpret validation</div>
                <div className="mt-2 space-y-2 text-xs text-white/60 leading-relaxed">
                  <p><span className="text-white/80 font-bold">Directional accuracy</span> = how often the forecast median had the same sign as the observed return.</p>
                  <p><span className="text-white/80 font-bold">Median absolute error</span> = typical distance between forecast median and actual return, measured in percentage points.</p>
                  <p><span className="text-white/80 font-bold">Middle historical range coverage</span> = the share of actual outcomes inside the middle historical range. Low coverage means the range is too narrow for the observed outcomes.</p>
                  <p><span className="text-white/80 font-bold">Baseline / lift</span> compares the analogue method with a simple unconditional historical baseline. Positive lift is descriptive evidence for that backtest—not proof of future performance.</p>
                  <p><span className="text-white/80 font-bold">JEV validation</span> interprets the measured backtest and identifies evidence gaps or the next experiment. JEV does not change the numerical forecast.</p>
                  <p><span className="text-white/80 font-bold">Automatic model selection</span> periodically compares analogue-v1 with analogue-v2 using walk-forward historical validation. A model is changed only when the validation evidence clears the conservative selection rule; otherwise the current model remains active.</p>
                  <p><span className="text-white/80 font-bold">Forecast verification</span> records the model version with each forecast so later accuracy measurements remain reproducible. Duplicate pending forecasts with the same ticker, horizon, scenario, and model are blocked.</p>
                </div>
              </section>
            )}

            <section className="rounded-xl border border-fuchsia-400/15 bg-fuchsia-400/5 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-fuchsia-300/80">JEV-powered guide</div>
                  <p className="text-xs text-white/60 mt-1">Ask JEV to explain this screen using the current evidence workflow.</p>
                </div>
                <button
                  onClick={() => void askJev('How should I use this page right now?')}
                  disabled={jevBusy}
                  className="shrink-0 inline-flex items-center justify-center gap-2 rounded-lg border border-fuchsia-400/25 bg-fuchsia-400/10 px-3 py-2 text-[10px] font-mono font-black uppercase tracking-wider text-fuchsia-200 hover:bg-fuchsia-400/15 disabled:opacity-40 cursor-pointer"
                >
                  {jevBusy ? 'JEV THINKING…' : 'Ask JEV'}
                </button>
              </div>
              {jevAnswer && (
                <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="whitespace-pre-wrap text-xs text-white/75 leading-relaxed">{jevAnswer}</p>
                  {(jevMeta?.route || jevMeta?.gate) && (
                    <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-mono text-white/30">
                      {jevMeta.route && <span>JEV route: {jevMeta.route}</span>}
                      {jevMeta.gate && <span>Evidence check: {jevMeta.gate}</span>}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-white/5 bg-black/10 p-4">
              <div className="text-[9px] font-mono uppercase tracking-widest text-white/30">How to use it</div>
              <div className="flex flex-wrap gap-2 mt-3">
                {(active.id === 'forward-outlook'
                  ? ['Select ticker + horizon', 'Review historical distribution', 'Run historical test', 'Compare baseline + calibration', 'Track and verify later']
                  : ['Read the signal', 'Open the evidence', 'Check the source/date', 'Compare history', 'Review exposure']).map((step, index) => (
                  <div key={step} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[.02] px-2.5 py-2">
                    <span className="w-5 h-5 rounded-full bg-white/5 text-white/60 text-[9px] font-mono flex items-center justify-center">{index + 1}</span>
                    <span className="text-[10px] text-white/55">{step}</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <div className="text-[9px] font-mono text-white/25">
                Visual reference is the live dashboard section named above. This guide explains the UI without fabricating historical screenshots.
              </div>
              <button
                onClick={() => onNavigate(active.view)}
                className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-[10px] font-mono font-black uppercase tracking-wider text-black hover:bg-emerald-300 transition"
              >
                Open this section
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#15181E]/40 p-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          <h3 className="text-xs font-black uppercase tracking-widest text-white">The 30-second rule</h3>
        </div>
        <p className="text-xs text-white/50 mt-2 leading-relaxed">
          Never act on a badge, color or score alone. First ask: <span className="text-white/75 font-bold">What changed?</span> Then: <span className="text-white/75 font-bold">What evidence supports it?</span> Then: <span className="text-white/75 font-bold">How does it connect to my holding?</span>
        </p>
      </div>
    </div>
  );
}
