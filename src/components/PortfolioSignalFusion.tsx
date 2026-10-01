import { Activity, ArrowUpRight, FileText, Globe2, Landmark, Zap } from 'lucide-react';
import type { Contract, CongressTrade, MacroRisk } from '../types';
import JevDecisionPanel from './JevDecisionPanel';

type Price = { price: number; changePct: number };
type NewsItem = { title?: string; source?: string; url?: string; date?: string };
type Props = {
  prices?: Record<string, Price>;
  contracts?: Contract[];
  congressTrades?: CongressTrade[];
  macroRisks?: MacroRisk[];
  news?: NewsItem[];
};

const PORTFOLIO_SYMBOLS = ['DGXX', 'DRAM', 'SOXL', 'NVDA', 'MSFT', 'NBIS', 'VIVO', 'META', 'NOW', 'PHVS'];

const MACRO_HOLDINGS: Record<string, string[]> = {
  taiwan: ['DRAM', 'SOXL', 'NVDA', 'MSFT', 'NBIS'],
  export: ['DRAM', 'SOXL', 'NVDA', 'MSFT', 'NBIS'],
  power: ['DGXX', 'NBIS', 'VIVO', 'META', 'NOW'],
};

function symbols(values: string[]) {
  return [...new Set(values.filter(value => PORTFOLIO_SYMBOLS.includes(value)))];
}

function date(value?: string) {
  return value ? value.slice(0, 10) : '—';
}

function newsSymbols(title: string) {
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
  return symbols(Object.entries(aliases).filter(([, terms]) => terms.some(term => text.includes(term))).map(([key]) => key));
}

function evidenceProfile(kind: string, source: string) {
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
  if (level === 'PRIMARY') return 'border-cyan-400/20 bg-cyan-400/5 text-cyan-300';
  if (level === 'PUBLIC DISCLOSURE') return 'border-amber-400/20 bg-amber-400/5 text-amber-300';
  if (level === 'RISK LEDGER') return 'border-rose-400/20 bg-rose-400/5 text-rose-300';
  return 'border-emerald-400/20 bg-emerald-400/5 text-emerald-300';
}

function badge(kind: string) {
  if (kind === 'Contract') return 'border-cyan-400/20 bg-cyan-400/5 text-cyan-300';
  if (kind === 'Congress') return 'border-amber-400/20 bg-amber-400/5 text-amber-300';
  if (kind === 'Macro') return 'border-rose-400/20 bg-rose-400/5 text-rose-300';
  return 'border-emerald-400/20 bg-emerald-400/5 text-emerald-300';
}

export default function PortfolioSignalFusion({ prices = {}, contracts = [], congressTrades = [], macroRisks = [], news = [] }: Props) {
  const signals = [
    ...contracts
      .filter(x => PORTFOLIO_SYMBOLS.includes(x.company))
      .sort((a, b) => String(b.dateSigned).localeCompare(String(a.dateSigned)))
      .slice(0, 3)
      .map(x => ({
        kind: 'Contract',
        title: x.client || x.details,
        detail: x.geminiImpactSummary || x.details,
        when: x.dateSigned,
        affected: symbols([x.company]),
        source: x.source === 'sec-edgar-primary' ? 'SEC EDGAR' : 'Contracts feed',
        url: x.url || null,
      })),
    ...congressTrades
      .filter(x => PORTFOLIO_SYMBOLS.includes(x.stockSymbol))
      .sort((a, b) => String(b.transactionDate || b.date).localeCompare(String(a.transactionDate || a.date)))
      .slice(0, 3)
      .map(x => ({
        kind: 'Congress',
        title: x.stockSymbol + ' ' + (x.transactionType === 'buy' ? 'purchase' : 'sale') + ' disclosure',
        detail: x.politician + ' · ' + x.chamber + ' · ' + x.amountRange + '. Transaction date is used for timeline context.',
        when: x.transactionDate || x.date,
        affected: symbols([x.stockSymbol]),
        source: 'Congress disclosure feed',
        url: x.filingPortal || null,
      })),
    ...macroRisks.slice(0, 3).map(x => {
      const key = x.id.toLowerCase().includes('taiwan') ? 'taiwan' : x.id.toLowerCase().includes('power') ? 'power' : 'export';
      return {
        kind: 'Macro',
        title: x.title,
        detail: x.impactSummary || x.description,
        when: x.dateUpdated,
        affected: symbols(MACRO_HOLDINGS[key]),
        source: 'Live macro risk ledger',
        url: null,
      };
    }),
    ...news
      .filter(x => x.title)
      .map(x => ({ ...x, affected: newsSymbols(x.title || '') }))
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

  const touched = symbols(signals.flatMap(x => x.affected));

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
            Combines recent SEC contract disclosures, public congressional transaction records, macro indicators and matched news. Each signal is labeled by evidence source; price moves are shown as context, not attributed to the signal.
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
        <div className="space-y-2">
          {signals.map((signal, index) => {
            const evidence = evidenceProfile(signal.kind, signal.source);
            return (
            <div key={signal.kind + signal.title + index} className="rounded-xl border border-white/5 bg-white/[.02] p-3">
              <div className="flex flex-col lg:flex-row gap-3">
                <div className={'inline-flex shrink-0 w-fit h-fit items-center gap-1 rounded border px-2 py-1 text-[8px] font-mono font-black uppercase ' + badge(signal.kind)}>
                  {signal.kind === 'Contract' ? <FileText className="w-3 h-3" /> : signal.kind === 'Congress' ? <Landmark className="w-3 h-3" /> : signal.kind === 'Macro' ? <Globe2 className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
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
