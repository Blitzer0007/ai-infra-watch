import { useEffect, useState } from 'react';
import { Activity, ArrowUpRight, FileText, Globe2, Landmark, Zap } from 'lucide-react';
import { authFetch } from '../utils/apiAuth';
import type { Contract, CongressTrade, MacroRisk } from '../types';
import JevDecisionPanel from './JevDecisionPanel';

type Price = { price: number; changePct: number };
type NewsItem = { title?: string; source?: string; url?: string; date?: string };
type PoliticalSignal = {
  id?: string;
  title?: string;
  source?: string;
  url?: string | null;
  date?: string | null;
  topic?: string;
  eventType?: string;
  sourceType?: 'primary' | 'secondary';
  relatedSymbols?: string[];
};
type Props = {
  prices?: Record<string, Price>;
  contracts?: Contract[];
  congressTrades?: CongressTrade[];
  macroRisks?: MacroRisk[];
  news?: NewsItem[];
  politicalSignals?: PoliticalSignal[];
  heldSymbols?: string[];
};

function symbols(values: string[], allowed: string[]) {
  return [...new Set(values.map(value => String(value).toUpperCase()).filter(value => allowed.includes(value)))];
}

function date(value?: string) {
  return value ? value.slice(0, 10) : '—';
}

function containsTerm(text: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  const pattern = term.includes(' ')
    ? escaped.replace(/\\s+/g, '\\s+')
    : '\\b' + escaped + '\\b';
  return new RegExp(pattern, 'i').test(text);
}
function newsSymbols(title: string, allowed: string[]) {
  const text = title.toLowerCase();
  const aliases: Record<string, string[]> = {
    NVDA: ['nvidia', 'nvda', 'blackwell', 'cuda'],
    DGXX: ['digi power', 'dgxx'],
    DRAM: ['micron', ' dram ', 'memory'],
    SOXL: ['soxl', 'semiconductor'],
    MSFT: ['microsoft', 'msft'],
    NBIS: ['nebius', 'nbis'],
    VIVO: ['vivo', 'vvpr', 'powerhouse'],
    META: ['meta', 'facebook'],
    NOW: ['servicenow', 'service now'],
    PHVS: ['pharvaris', 'phvs'],
  };
  return symbols(Object.entries(aliases).filter(([, terms]) => terms.some(term => containsTerm(text, term))).map(([key]) => key), allowed);
}

function macroAffectedSymbols(risk: { title?: string; description?: string; impactSummary?: string }, allowed: string[]) {
  const text = [risk.title, risk.description, risk.impactSummary].filter(Boolean).join(' ');
  const aliases: Record<string, string[]> = {
    NVDA: ['nvidia', 'nvda'],
    DGXX: ['digi power', 'dgxx'],
    DRAM: ['micron', 'dram'],
    SOXL: ['soxl', 'semiconductor'],
    MSFT: ['microsoft', 'msft'],
    NBIS: ['nebius', 'nbis'],
    VIVO: ['vivo', 'vvpr', 'powerhouse'],
    META: ['meta', 'facebook'],
    NOW: ['servicenow', 'service now'],
    PHVS: ['pharvaris', 'phvs'],
    RKLB: ['rocket lab', 'rklb'],
  };
  return allowed.filter(symbol =>
    (aliases[symbol] || [symbol]).some(alias => containsTerm(text, alias)),
  );
}

function evidenceProfile(kind: string, source: string, sourceType?: string) {
  if (kind === 'Autopilot') {
    return sourceType === 'primary'
      ? { level: 'PRIMARY', note: 'Official Autopilot public social source' }
      : { level: 'NEWS', note: 'Secondary Autopilot-related coverage' };
  }
  if (kind === 'Political') {
    return sourceType === 'primary'
      ? { level: 'PRIMARY', note: 'Primary official source' }
      : { level: 'POLICY COVERAGE', note: 'Secondary political/policy coverage' };
  }
  if (kind === 'Contract' && source === 'SEC EDGAR') {
    return { level: 'PRIMARY', note: 'Primary SEC filing' };
  }
  if (kind === 'Congress') {
    return { level: 'PUBLIC DISCLOSURE', note: 'Public transaction disclosure' };
  }
  if (kind === 'Macro') {
    return { level: 'RISK LEDGER', note: 'Live macro indicator' };
  }
  return { level: 'NEWS', note: 'Secondary reporting source' };
}

function evidenceBadge(level: string) {
  if (level === 'POLICY COVERAGE') return 'border-violet-400/20 bg-violet-400/5 text-violet-300';
  if (level === 'PRIMARY') return 'border-cyan-400/20 bg-cyan-400/5 text-cyan-300';
  if (level === 'PUBLIC DISCLOSURE') return 'border-amber-400/20 bg-amber-400/5 text-amber-300';
  if (level === 'RISK LEDGER') return 'border-rose-400/20 bg-rose-400/5 text-rose-300';
  return 'border-emerald-400/20 bg-emerald-400/5 text-emerald-300';
}

function badge(kind: string) {
  if (kind === 'Autopilot') return 'border-violet-400/20 bg-violet-400/5 text-violet-300';
  if (kind === 'Political') return 'border-violet-400/20 bg-violet-400/5 text-violet-300';
  if (kind === 'Contract') return 'border-cyan-400/20 bg-cyan-400/5 text-cyan-300';
  if (kind === 'Congress') return 'border-amber-400/20 bg-amber-400/5 text-amber-300';
  if (kind === 'Macro') return 'border-rose-400/20 bg-rose-400/5 text-rose-300';
  return 'border-emerald-400/20 bg-emerald-400/5 text-emerald-300';
}

export default function PortfolioSignalFusion({ prices = {}, contracts = [], congressTrades = [], macroRisks = [], news = [], politicalSignals = [], heldSymbols = [] }: Props) {
  const [autopilotSignals, setAutopilotSignals] = useState<any[]>([]);
  const portfolioSymbols = heldSymbols.map(symbol => symbol.toUpperCase()).filter(Boolean);
  useEffect(() => {
    let cancelled = false;
    authFetch('/api/autopilot-signals?limit=8', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(body => {
        if (!cancelled) setAutopilotSignals(Array.isArray(body?.signals) ? body.signals : []);
      })
      .catch(() => { if (!cancelled) setAutopilotSignals([]); });
    return () => { cancelled = true; };
  }, []);

  const signals = [
    ...contracts
      .filter(x => x && portfolioSymbols.includes(String(x.company || '').toUpperCase()))
      .sort((a, b) => String(b.dateSigned).localeCompare(String(a.dateSigned)))
      .slice(0, 3)
      .map(x => ({
        kind: 'Contract',
        title: x.client || x.details,
        detail: x.details,
        when: x.dateSigned,
        affected: symbols([x.company], portfolioSymbols),
        source: x.source === 'sec-edgar-primary' ? 'SEC EDGAR' : 'Contracts feed',
        url: x.url || null,
      })),
    ...congressTrades
      .filter(x => x && portfolioSymbols.includes(String(x.stockSymbol || '').toUpperCase()))
      .sort((a, b) => String(b.transactionDate || b.date).localeCompare(String(a.transactionDate || a.date)))
      .slice(0, 3)
      .map(x => ({
        kind: 'Congress',
        title: x.stockSymbol + ' ' + (x.transactionType === 'buy' ? 'purchase' : 'sale') + ' disclosure',
        detail: x.politician + ' · ' + x.chamber + ' · ' + x.amountRange + '. Transaction date is used for timeline context.',
        when: x.transactionDate || x.date,
        affected: symbols([x.stockSymbol], portfolioSymbols),
        source: 'Congress disclosure feed',
        url: x.filingPortal || null,
      })),
    ...macroRisks.slice(0, 3).map(x => {
      const riskId = String(x?.id || x?.title || '').toLowerCase();
      const key = riskId.includes('taiwan') ? 'taiwan' : riskId.includes('power') || riskId.includes('grid') ? 'power' : 'export';
      return {
        kind: 'Macro',
        title: x.title,
        detail: x.impactSummary || x.description,
        when: x.dateUpdated,
        affected: macroAffectedSymbols(x, portfolioSymbols),
        source: 'Live macro risk ledger',
        url: null,
      };
    }),
    ...politicalSignals
      .filter(x => x && Array.isArray(x?.relatedSymbols) && x.relatedSymbols.some(symbol => portfolioSymbols.includes(String(symbol).toUpperCase())))
      .slice(0, 3)
      .map(x => ({
        kind: 'Political',
        title: x.title || x.topic || 'Political / policy signal',
        detail: (x.eventType || 'Political statement / coverage') + ' · ' + (x.topic || 'AI / Technology'),
        when: x.date || undefined,
        affected: symbols((x.relatedSymbols || []).map(symbol => String(symbol).toUpperCase()), portfolioSymbols),
        source: x.source || 'GDELT',
        sourceType: x.sourceType || 'secondary',
        url: x.url || null,
      })),
    ...autopilotSignals
      .map(x => ({
        ...x,
        affected: symbols((x.tickers || []), portfolioSymbols),
      }))
      .filter(x => x.affected.length)
      .slice(0, 3)
      .map(x => ({
        kind: 'Autopilot',
        title: x.title || 'Autopilot platform signal',
        detail: x.snippet || 'Public Autopilot platform/social signal linked to one or more held positions.',
        when: x.publishedAt || undefined,
        affected: x.affected,
        source: 'Autopilot / X',
        sourceType: x.official ? 'primary' : 'secondary',
        url: x.url || null,
      })),
    ...news
      .filter(x => x && x.title)
      .map(x => ({ ...x, affected: newsSymbols(x.title || '', portfolioSymbols) }))
      .filter(x => x.affected.length)
      .slice(0, 3)
      .map(x => ({
        kind: 'News',
        title: x.title || 'Market signal',
        detail: 'Reported by ' + (x.source || 'news feed') + '; use the linked article for source context.',
        when: x.date,
        affected: x.affected,
        source: x.source || 'News feed',
        url: x.url || null,
      })),
  ].sort((a, b) => String(b.when || '').localeCompare(String(a.when || ''))).slice(0, 8);

  const touched = symbols(signals.flatMap(x => x.affected), portfolioSymbols);

  useEffect(() => {
    if (!signals.length) return;
    const hash = (value: string) => Array.from(value).reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0).toString(36);
    void Promise.allSettled(signals.map(signal => {
      const symbol = signal.affected[0];
      const signalPrice = symbol && prices[symbol] ? Number(prices[symbol].price) : null;
      const confidence = signal.kind === 'Autopilot' && (signal as any).sourceType === 'primary'
        ? 0.75
        : signal.kind === 'Contract' && signal.source === 'SEC EDGAR'
        ? 0.85
        : signal.kind === 'Political' && (signal as any).sourceType === 'primary'
          ? 0.80
          : 0.55;
      return authFetch('/api/signal-scorecard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signalKey: hash([signal.kind, signal.title, signal.when || '', signal.affected.join(',')].join('|')),
          symbol,
          signalType: signal.kind,
          signalState: signal.title,
          confidence,
          signalPrice,
          observedAt: signal.when ? new Date(signal.when).toISOString() : new Date().toISOString(),
          evidence: { source: signal.source, sourceType: (signal as any).sourceType || 'secondary', url: signal.url || null, affected: signal.affected },
        }),
      });
    }));
  }, [signals, prices]);

  return (
    <section className="bg-[#15181E] border border-white/10 rounded-2xl p-5">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-400">
            <Zap className="w-4 h-4" />
            <span className="text-[9px] font-mono uppercase tracking-[0.2em]">Signal fusion / portfolio impact</span>
          </div>
          <h2 className="text-lg font-black mt-1">What changed → Why it matters → Which holdings are affected</h2>
          <p className="text-[10px] text-white/35 mt-1 max-w-3xl">
            Combines recent SEC contract disclosures, public congressional transaction records, macro indicators, matched news and public Autopilot platform signals. Autopilot evidence can affect which holdings are highlighted, but it does not change the numeric portfolio stress score.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 min-w-[240px]">
          <Metric label="Recent signals" value={String(signals.length)} />
          <Metric label="Holdings touched" value={String(touched.length)} />
        </div>
      </div>

      <JevDecisionPanel
        kind="platform"
        title="Portfolio signal triage"
        state={{
          signal_count: signals.length,
          holdings_touched: touched,
          signals: signals.slice(0, 8).map((signal) => ({
            kind: signal.kind,
            title: signal.title,
            detail: signal.detail,
            date: signal.when,
            affected: signal.affected,
            source: signal.source,
          })),
        }}
      />

      {signals.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-white/[.02] p-4 text-xs text-white/35">No combined signals are available from the current refresh.</div>
      ) : (
        <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1 aiw-scroll-region">
          {signals.map((signal, index) => {
            const evidence = evidenceProfile(signal.kind, signal.source, (signal as any).sourceType);
            return (
            <div key={signal.kind + signal.title + index} className="rounded-xl border border-white/5 bg-white/[.02] p-3">
              <div className="flex flex-col lg:flex-row gap-3">
                <div className={'inline-flex shrink-0 w-fit h-fit items-center gap-1 rounded border px-2 py-1 text-[8px] font-mono font-black uppercase ' + badge(signal.kind)}>
                  {signal.kind === 'Contract' ? <FileText className="w-3 h-3" /> : signal.kind === 'Congress' ? <Landmark className="w-3 h-3" /> : signal.kind === 'Macro' ? <Globe2 className="w-3 h-3" /> : signal.kind === 'Autopilot' ? <Zap className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
                  {signal.kind}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-white">{signal.title}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-white/25 font-mono mt-1">
                        <span>{date(signal.when)} · {signal.source}</span>
                        <span title={evidence.note} className={'rounded border px-1.5 py-0.5 uppercase tracking-wider ' + evidenceBadge(evidence.level)}>{evidence.level}</span>
                      </div>
                    </div>
                    {signal.url && <a href={signal.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[9px] font-mono text-cyan-300 hover:text-cyan-200">Source <ArrowUpRight className="w-3 h-3" /></a>}
                  </div>
                  <div className="text-[10px] text-white/45 mt-2 leading-5">{signal.detail}</div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {signal.affected.map(symbol => {
                      const quote = prices[symbol];
                      return <span key={symbol} className="inline-flex items-center gap-1 rounded border border-white/10 bg-black/10 px-2 py-1 text-[9px] font-mono text-white/70">
                        {symbol}
                        {quote?.price != null && <span className={quote.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{quote.changePct >= 0 ? '+' : ''}{quote.changePct.toFixed(2)}%</span>}
                      </span>;
                    })}
                  </div>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 text-[9px] text-white/25">
        <Globe2 className="w-3 h-3" />
        Current daily price percentages are contextual only; this panel does not infer causation or trade instructions.
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/5 bg-white/[.025] p-3"><div className="text-[8px] font-mono uppercase tracking-widest text-white/25">{label}</div><div className="text-lg font-black mt-1 text-white">{value}</div></div>;
}
