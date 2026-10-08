import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowUpRight, FileText, Globe2, Landmark, Newspaper, ShieldAlert } from 'lucide-react';

type HistoryPoint = { date: string; price: number };

type EarningsRow = {
  symbol: string;
  period: string;
  reportDate: string;
  epsActual?: number | null;
  epsEstimate?: number | null;
  surprisePercent?: number | null;
};

type TimelineEvent = {
  id: string;
  kind: 'SEC' | 'Contract' | 'Earnings' | 'Congress' | 'Macro' | 'News' | 'Political' | 'Autopilot';
  date: string;
  title: string;
  detail: string;
  source: string;
  sourceLevel: 'PRIMARY' | 'PUBLIC DISCLOSURE' | 'RISK LEDGER' | 'NEWS' | 'POLICY COVERAGE' | 'PLATFORM SOCIAL';
  url?: string | null;
};

type Reaction = {
  eventPrice: number | null;
  t1: number | null;
  t5: number | null;
  t20: number | null;
  spyT1: number | null;
  relativeT1: number | null;
};

const historyCache: Record<string, Promise<HistoryPoint[]>> = {};

function loadHistory(symbol: string): Promise<HistoryPoint[]> {
  const key = symbol.trim().toUpperCase();
  if (!historyCache[key]) {
    historyCache[key] = fetch('/api/company-scale?action=history&symbol=' + encodeURIComponent(key) + '&range=5y', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('History request failed');
        const payload = await response.json();
        return Array.isArray(payload?.points) ? payload.points : [];
      })
      .catch(() => []);
  }
  return historyCache[key];
}

async function loadEarningsEvents(symbol: string): Promise<TimelineEvent[]> {
  try {
    const response = await fetch(
      '/api/earnings-alerts?history=1&symbols=' + encodeURIComponent(symbol) + '&limit=6',
      { cache: 'no-store' }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return [];
    const rows = Array.isArray(payload?.historical?.[symbol]) ? payload.historical[symbol] as EarningsRow[] : [];
    return rows.map(row => {
      const surprise = typeof row.surprisePercent === 'number'
        ? ' · EPS surprise ' + (row.surprisePercent >= 0 ? '+' : '') + row.surprisePercent.toFixed(1) + '%'
        : '';
      return {
        id: 'earnings-' + symbol + '-' + row.reportDate + '-' + row.period,
        kind: 'Earnings' as const,
        date: String(row.reportDate),
        title: symbol + ' earnings · ' + String(row.period),
        detail: 'Reported EPS ' + (typeof row.epsActual === 'number' ? row.epsActual.toFixed(2) : 'n/a')
          + ' vs estimate ' + (typeof row.epsEstimate === 'number' ? row.epsEstimate.toFixed(2) : 'n/a')
          + surprise,
        source: 'Finnhub earnings history',
        sourceLevel: 'PRIMARY' as const,
        url: 'https://finnhub.io/',
      };
    }).filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date));
  } catch {
    return [];
  }
}

async function loadAutopilotEvents(symbol: string): Promise<{ events: TimelineEvent[]; undated: number }> {
  try {
    const response = await fetch('/api/autopilot-signals?limit=12', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { events: [], undated: 0 };
    const rows = Array.isArray(payload?.signals) ? payload.signals : [];
    const ticker = symbol.toUpperCase();
    const relevant = rows.filter((row: any) => Array.isArray(row?.tickers) && row.tickers.map((value: unknown) => String(value).toUpperCase()).includes(ticker));
    const undated = relevant.filter((row: any) => !/^\d{4}-\d{2}-\d{2}/.test(String(row?.publishedAt || ''))).length;
    const events = relevant
      .map((row: any, index: number): TimelineEvent => ({
        id: 'autopilot-' + String(row?.url || row?.title || index),
        kind: 'Autopilot',
        date: String(row?.publishedAt || '').slice(0, 10),
        title: String(row?.title || 'Autopilot platform signal'),
        detail: String(row?.snippet || 'Public Autopilot platform/social signal associated with the selected holding.'),
        source: 'Autopilot / X',
        sourceLevel: row?.official ? 'PLATFORM SOCIAL' : 'NEWS',
        url: row?.url || null,
      }))
      .filter((item: TimelineEvent) => /^\d{4}-\d{2}-\d{2}$/.test(item.date));
    return { events, undated };
  } catch {
    return { events: [], undated: 0 };
  }
}

async function loadSecEvents(symbol: string): Promise<TimelineEvent[]> {
  try {
    const response = await fetch('/api/company-scale?action=milestones&symbol=' + encodeURIComponent(symbol) + '&limit=20', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return [];
    return (payload?.events || []).map((event: any) => ({
      id: String(event.id),
      kind: 'SEC' as const,
      date: String(event.date),
      title: String(event.title || 'SEC event'),
      detail: String(event.description || 'SEC 8-K disclosure'),
      source: 'SEC EDGAR',
      sourceLevel: 'PRIMARY' as const,
      url: event.url || null,
    }));
  } catch {
    return [];
  }
}

function clean(value: unknown) {
  return String(value ?? '').toLowerCase();
}

function newsSymbols(title: string): string[] {
  const text = clean(title);
  const aliases: Record<string, string[]> = {
    NVDA: ['nvidia', 'nvda', 'blackwell', 'cuda'],
    DGXX: ['digi power', 'dgxx'],
    DRAM: ['micron', ' dram ', 'memory'],
    SOXL: ['soxl', 'semiconductor'],
    MSFT: ['microsoft', 'msft', 'azure'],
    NBIS: ['nebius', 'nbis'],
    VIVO: ['vivo power', 'vvpr', 'powerhouse'],
    META: ['meta', 'facebook'],
    NOW: ['servicenow', 'service now'],
    PHVS: ['pharvaris', 'phvs'],
  };
  return Object.entries(aliases)
    .filter(([, terms]) => terms.some(term => text.includes(term)))
    .map(([symbol]) => symbol);
}

function normalizePoliticalDate(value: unknown): string {
  const text = String(value ?? '');
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})/);
  return compact ? compact[1] + '-' + compact[2] + '-' + compact[3] : '';
}

function macroHolds(symbol: string, macroId: string): boolean {
  const id = clean(macroId);
  const holdings: Record<string, string[]> = {
    taiwan: ['DRAM', 'SOXL', 'NVDA', 'MSFT', 'NBIS'],
    export: ['DRAM', 'SOXL', 'NVDA', 'MSFT', 'NBIS'],
    power: ['DGXX', 'NBIS', 'VIVO', 'META', 'NOW'],
  };
  const key = id.includes('taiwan') ? 'taiwan' : id.includes('power') || id.includes('grid') ? 'power' : 'export';
  return holdings[key].includes(symbol);
}

function normalizeEventTitle(value: string): string {
  return clean(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

function eventDuplicate(a: TimelineEvent, b: TimelineEvent): boolean {
  if (a.url && b.url && a.url === b.url) return true;
  const dayA = Date.parse(a.date + 'T00:00:00Z');
  const dayB = Date.parse(b.date + 'T00:00:00Z');
  const withinOneDay = Number.isFinite(dayA) && Number.isFinite(dayB) && Math.abs(dayA - dayB) <= 86400000;
  return withinOneDay && normalizeEventTitle(a.title) === normalizeEventTitle(b.title);
}

function dedupeTimelineEvents(items: TimelineEvent[]): TimelineEvent[] {
  const output: TimelineEvent[] = [];
  for (const item of items) {
    const existingIndex = output.findIndex(existing => eventDuplicate(existing, item));
    if (existingIndex < 0) {
      output.push(item);
      continue;
    }
    const existing = output[existingIndex];
    const mergedSource = existing.source === item.source
      ? existing.source
      : existing.source + ' + ' + item.source;
    output[existingIndex] = {
      ...existing,
      source: mergedSource,
      url: existing.url || item.url || null,
      detail: existing.detail,
    };
  }
  return output;
}

function sourceLevel(kind: TimelineEvent['kind']): TimelineEvent['sourceLevel'] {
  if (kind === 'SEC' || kind === 'Contract') return 'PRIMARY';
  if (kind === 'Congress') return 'PUBLIC DISCLOSURE';
  if (kind === 'Macro') return 'RISK LEDGER';
  if (kind === 'Political') return 'POLICY COVERAGE';
  if (kind === 'Autopilot') return 'PLATFORM SOCIAL';
  return 'NEWS';
}

function eventReaction(history: HistoryPoint[], spy: HistoryPoint[], eventDate: string): Reaction | null {
  const event = history.find(point => point.date >= eventDate);
  if (!event) return null;
  const eventIndex = history.findIndex(point => point.date === event.date);
  if (eventIndex < 0) return null;

  const forward = (days: number) => history[eventIndex + days] || null;
  const spyEvent = spy.find(point => point.date === event.date) || spy.find(point => point.date >= event.date) || null;
  const spyIndex = spyEvent ? spy.findIndex(point => point.date === spyEvent.date) : -1;
  const spyForward = (days: number) => spyIndex >= 0 ? spy[spyIndex + days] || null : null;

  const pct = (from: number | null, to: number | null) =>
    from == null || to == null || from === 0 ? null : ((to - from) / from) * 100;

  const t1 = pct(event.price, forward(1)?.price ?? null);
  const spyT1 = spyEvent ? pct(spyEvent.price, spyForward(1)?.price ?? null) : null;

  return {
    eventPrice: event.price,
    t1,
    t5: pct(event.price, forward(5)?.price ?? null),
    t20: pct(event.price, forward(20)?.price ?? null),
    spyT1,
    relativeT1: t1 != null && spyT1 != null ? t1 - spyT1 : null,
  };
}

function fmt(value: number | null): string {
  return value == null || !Number.isFinite(value) ? '—' : (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
}

function tone(value: number | null): string {
  return value == null ? 'text-white/30' : value >= 0 ? 'text-emerald-400' : 'text-rose-400';
}

function evidenceBadge(level: TimelineEvent['sourceLevel']): string {
  if (level === 'PRIMARY') return 'border-cyan-400/20 bg-cyan-400/5 text-cyan-300';
  if (level === 'PUBLIC DISCLOSURE') return 'border-amber-400/20 bg-amber-400/5 text-amber-300';
  if (level === 'RISK LEDGER') return 'border-rose-400/20 bg-rose-400/5 text-rose-300';
  if (level === 'POLICY COVERAGE') return 'border-violet-400/20 bg-violet-400/5 text-violet-300';
  if (level === 'PLATFORM SOCIAL') return 'border-fuchsia-400/20 bg-fuchsia-400/5 text-fuchsia-300';
  return 'border-emerald-400/20 bg-emerald-400/5 text-emerald-300';
}

function iconFor(kind: TimelineEvent['kind']) {
  if (kind === 'SEC' || kind === 'Earnings') return <FileText className="w-3.5 h-3.5" />;
  if (kind === 'Contract') return <FileText className="w-3.5 h-3.5" />;
  if (kind === 'Congress') return <Landmark className="w-3.5 h-3.5" />;
  if (kind === 'Macro' || kind === 'Political' || kind === 'Autopilot') return <Globe2 className="w-3.5 h-3.5" />;
  return <Newspaper className="w-3.5 h-3.5" />;
}

export default function UnifiedEventTimeline({
  symbol,
  contracts = [],
  congressTrades = [],
  macroRisks = [],
  news = [],
  politicalSignals = [],
  purchaseDate = null,
}: {
  symbol: string;
  contracts?: any[];
  congressTrades?: any[];
  macroRisks?: any[];
  news?: any[];
  politicalSignals?: any[];
  purchaseDate?: string | null;
}) {
  const [secEvents, setSecEvents] = useState<TimelineEvent[]>([]);
  const [earningsEvents, setEarningsEvents] = useState<TimelineEvent[]>([]);
  const [autopilotEvents, setAutopilotEvents] = useState<TimelineEvent[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [spy, setSpy] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [kindFilter, setKindFilter] = useState<'ALL' | TimelineEvent['kind']>('ALL');
  const [autopilotUndated, setAutopilotUndated] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ticker = symbol.trim().toUpperCase();
    if (!ticker) return;

    setLoading(true);
    Promise.all([loadSecEvents(ticker), loadEarningsEvents(ticker), loadHistory(ticker), loadHistory('SPY'), loadAutopilotEvents(ticker)])
      .then(([sec, earnings, stock, benchmark, autopilot]) => {
        if (cancelled) return;
        setSecEvents(sec);
        setEarningsEvents(earnings);
        setHistory(stock);
        setSpy(benchmark);
        setAutopilotUndated(autopilot.undated);
        setAutopilotEvents(autopilot.events);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [symbol]);

  const events = useMemo(() => {
    const ticker = symbol.trim().toUpperCase();

    const contractEvents: TimelineEvent[] = (contracts || [])
      .filter(item => String(item?.company || '').toUpperCase() === ticker)
      .map(item => ({
        id: 'contract-' + String(item?.id || item?.dateSigned || item?.client || item?.details),
        kind: 'Contract' as const,
        date: String(item?.dateSigned || item?.date || ''),
        title: String(item?.client || 'Contract disclosure'),
        detail: String(item?.impactSummary || item?.details || 'Contract disclosure linked to the portfolio issuer.'),
        source: item?.source === 'sec-edgar-primary' ? 'SEC EDGAR' : 'Contracts feed',
        sourceLevel: sourceLevel('Contract'),
        url: item?.url || null,
      }))
      .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date));

    const congressEvents: TimelineEvent[] = (congressTrades || [])
      .filter(item => String(item?.stockSymbol || '').toUpperCase() === ticker)
      .map(item => ({
        id: 'congress-' + String(item?.id || item?.transactionDate || item?.date),
        kind: 'Congress' as const,
        date: String(item?.transactionDate || item?.date || ''),
        title: ticker + ' transaction disclosure',
        detail: String(item?.politician || 'Public filer') + ' · ' + String(item?.chamber || 'Chamber') + ' · ' + String(item?.transactionType || 'transaction') + ' · ' + String(item?.amountRange || 'amount not disclosed'),
        source: 'Congress disclosure feed',
        sourceLevel: sourceLevel('Congress'),
        url: item?.filingPortal || null,
      }))
      .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date));

    const macroEvents: TimelineEvent[] = (macroRisks || [])
      .filter(item => macroHolds(ticker, String(item?.id || item?.title || '')))
      .map(item => ({
        id: 'macro-' + String(item?.id || item?.dateUpdated || item?.title),
        kind: 'Macro' as const,
        date: String(item?.dateUpdated || ''),
        title: String(item?.title || 'Macro risk indicator'),
        detail: String(item?.impactSummary || item?.description || 'Macro risk indicator affecting the tracked exposure group.'),
        source: 'Live macro risk ledger',
        sourceLevel: sourceLevel('Macro'),
        url: null,
      }))
      .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date));

    const politicalEvents: TimelineEvent[] = (politicalSignals || [])
      .filter(item => Array.isArray(item?.relatedSymbols) && item.relatedSymbols.map((x: unknown) => String(x).toUpperCase()).includes(ticker))
      .map(item => ({
        id: 'political-' + String(item?.id || item?.date || item?.title),
        kind: 'Political' as const,
        date: normalizePoliticalDate(item?.date),
        title: String(item?.title || 'Political / policy signal'),
        detail: String(item?.eventType || 'Political statement / coverage') + ' · ' + String(item?.topic || 'AI / Technology'),
        source: String(item?.source || 'GDELT'),
        sourceLevel: 'POLICY COVERAGE' as const,
        url: item?.url || null,
      }))
      .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date));

    const newsEvents: TimelineEvent[] = (news || [])
      .filter(item => item?.title && newsSymbols(String(item.title)).includes(ticker))
      .map(item => ({
        id: 'news-' + String(item?.id || item?.date || item?.title),
        kind: 'News' as const,
        date: String(item?.date || ''),
        title: String(item?.title),
        detail: 'Reported by ' + String(item?.source || 'news feed') + '; review the linked report for context.',
        source: String(item?.source || 'News feed'),
        sourceLevel: sourceLevel('News'),
        url: item?.url || null,
      }))
      .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date));

    return dedupeTimelineEvents([...secEvents, ...earningsEvents, ...contractEvents, ...congressEvents, ...macroEvents, ...politicalEvents, ...newsEvents, ...autopilotEvents])
      .filter(event => event.date <= new Date().toISOString().slice(0, 10))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 16);
  }, [symbol, secEvents, earningsEvents, contracts, congressTrades, macroRisks, news, politicalSignals, autopilotEvents]);

  const filteredEvents = useMemo(
    () => kindFilter === 'ALL' ? events : events.filter(event => event.kind === kindFilter),
    [events, kindFilter],
  );

  const rows = useMemo(() => filteredEvents.map(event => ({
    event,
    reaction: eventReaction(history, spy, event.date),
  })), [filteredEvents, history, spy]);

  const matched = rows.filter(row => row.reaction);
  const t1Values = matched
    .map(row => row.reaction!.t1)
    .filter((x): x is number => x != null && Number.isFinite(x));
  const relativeT1Values = matched
    .map(row => row.reaction!.relativeT1)
    .filter((x): x is number => x != null && Number.isFinite(x));
  const avgT1 = t1Values.length
    ? t1Values.reduce((sum, x) => sum + x, 0) / t1Values.length
    : null;
  const avgRel = relativeT1Values.length
    ? relativeT1Values.reduce((sum, x) => sum + x, 0) / relativeT1Values.length
    : null;

  const impactMatrix = useMemo(() => {
    const kinds: TimelineEvent['kind'][] = ['Contract', 'SEC', 'Earnings', 'Political', 'Congress', 'Macro', 'News', 'Autopilot'];
    return kinds
      .map(kind => {
        const kindRows = events
          .filter(event => event.kind === kind)
          .map(event => ({ event, reaction: eventReaction(history, spy, event.date) }));
        const kindMatched = kindRows.filter(row => row.reaction);
        const t1 = kindMatched
          .map(row => row.reaction?.t1 ?? null)
          .filter((value): value is number => value != null);
        const rel = kindMatched
          .map(row => row.reaction?.relativeT1 ?? null)
          .filter((value): value is number => value != null);
        return {
          kind,
          events: kindRows.length,
          matched: kindMatched.length,
          avgT1: t1.length ? t1.reduce((sum, value) => sum + value, 0) / t1.length : null,
          avgRelativeT1: rel.length ? rel.reduce((sum, value) => sum + value, 0) / rel.length : null,
        };
      })
      .filter(item => item.events > 0);
  }, [events, history, spy]);

  const availableKinds = useMemo(
    () => Array.from(new Set(events.map(event => event.kind))),
    [events],
  );

  return (
    <section className="bg-[#15181E] border border-white/10 rounded-2xl p-5">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-300">
            <Activity className="w-4 h-4" />
            <span className="text-[9px] font-mono uppercase tracking-[0.2em]">Unified event reaction timeline</span>
          </div>
          <h2 className="text-lg font-black mt-1">What happened → Evidence → What followed</h2>
          <p className="text-[10px] text-white/35 mt-1 max-w-3xl">
            Aligns dated SEC events, contracts, earnings, political/policy signals, public transaction disclosures, macro indicators, matched news and dated Autopilot platform signals with next trading day / 5th-trading-day / 20th-trading-day reactions. Analyst/executive snapshots remain research context unless they have a dated event; these windows are descriptive, not causal attribution.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 min-w-[230px]">
          <Metric label="Events" value={String(events.length)} />
          <Metric label="Reactions matched" value={String(matched.length)} />
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-white/5 bg-white/[.02] p-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-white/30">Cross-signal impact matrix</div>
            <div className="text-[10px] text-white/35 mt-1">
              Compare observed post-event reactions by evidence type. Averages describe historical associations only; they do not identify a causal winner.
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['ALL', ...availableKinds].map(kind => (
              <button
                key={kind}
                type="button"
                onClick={() => setKindFilter(kind as 'ALL' | TimelineEvent['kind'])}
                className={
                  'rounded border px-2 py-1 text-[8px] font-mono uppercase ' +
                  (kindFilter === kind
                    ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300'
                    : 'border-white/10 bg-white/[.02] text-white/35 hover:text-white/60')
                }
              >
                {kind === 'ALL' ? 'All signals' : kind}
              </button>
            ))}
          </div>
        </div>

        {!impactMatrix.length ? (
          <div className="mt-3 text-[9px] font-mono text-white/25">No cross-signal history is available yet.</div>
        ) : (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
            {impactMatrix.map(item => (
              <div key={item.kind} className="rounded-lg border border-white/5 bg-black/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[8px] font-mono font-black uppercase text-white/55">{item.kind}</span>
                  <span className="text-[8px] font-mono text-white/20">{item.matched}/{item.events} matched</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[7px] font-mono uppercase text-white/25">Avg Next Trading Day</div>
                    <div className={'text-sm font-black mt-0.5 ' + tone(item.avgT1)}>{fmt(item.avgT1)}</div>
                  </div>
                  <div>
                    <div className="text-[7px] font-mono uppercase text-white/25">Vs SPY</div>
                    <div className={'text-sm font-black mt-0.5 ' + tone(item.avgRelativeT1)}>{fmt(item.avgRelativeT1)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {autopilotUndated > 0 && !loading && (
        <div className="mb-3 rounded-lg border border-fuchsia-400/10 bg-fuchsia-400/[.025] px-3 py-2 text-[8px] font-mono text-white/35">
          {autopilotUndated} relevant Autopilot signal{autopilotUndated === 1 ? '' : 's'} had no published date. They remain evidence context but are not assigned a historical price reaction window.
        </div>
      )}

      {loading && (
        <div className="text-[10px] font-mono text-white/35 py-4">Loading event history + market benchmark…</div>
      )}

      {!loading && !events.length && (
        <div className="rounded-xl border border-white/5 bg-white/[.02] p-4 text-[10px] font-mono text-white/30">
          No historical events from the current live feeds could be aligned to {symbol}.
        </div>
      )}

      {!loading && events.length > 0 && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
            <Metric label="Avg Next Trading Day" value={fmt(avgT1)} valueClass={tone(avgT1)} />
            <Metric label="Avg Next Trading Day vs SPY" value={fmt(avgRel)} valueClass={tone(avgRel)} />
            <Metric label="5th Trading Day Tracked" value={String(rows.filter(row => row.reaction?.t5 != null).length)} />
            <Metric label="20th Trading Day Tracked" value={String(rows.filter(row => row.reaction?.t20 != null).length)} />
          </div>

          <div className="overflow-x-auto border border-white/5 rounded-xl">
            <table className="w-full min-w-[980px] text-[10px] font-mono">
              <thead className="bg-white/[.03] text-white/35 uppercase tracking-wider">
                <tr>
                  <th className="text-left p-3">Event / Evidence</th>
                  <th className="text-left p-3">Date</th>
                  <th className="text-right p-3">Event price</th>
                  <th className="text-right p-3">Next Trading Day</th>
                  <th className="text-right p-3">5th Trading Day</th>
                  <th className="text-right p-3">20th Trading Day</th>
                  <th className="text-right p-3">Next Trading Day vs SPY</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ event, reaction }) => (
                  <tr key={event.id} className="border-t border-white/5 align-top">
                    <td className="p-3 min-w-[330px]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[.03] px-2 py-1 text-[8px] font-mono font-black uppercase text-white/55">
                          {iconFor(event.kind)}
                          {event.kind}
                        </span>
                        <span className={'rounded border px-1.5 py-0.5 text-[8px] font-mono uppercase ' + evidenceBadge(event.sourceLevel)}>
                          {event.sourceLevel}
                        </span>
                      </div>
                      <div className="text-white font-bold mt-2">{event.title}</div>
                      <div className="text-white/30 mt-1 leading-4">{event.detail}</div>
                      <div className="flex items-center gap-2 mt-1.5 text-[8px] font-mono text-white/20">
                        <span>{event.source}</span>
                        {event.url && (
                          <a href={event.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200">
                            Source <ArrowUpRight className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap text-white/50">
                      <div>{event.date}</div>
                      {purchaseDate && (
                        <div className={'mt-1 text-[7px] font-mono uppercase ' + (event.date < purchaseDate ? 'text-white/20' : 'text-emerald-300/45')}>
                          {event.date < purchaseDate ? 'Before first purchase' : 'After first purchase'}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-right text-white">
                      {reaction?.eventPrice == null ? '—' : '$' + reaction.eventPrice.toFixed(2)}
                    </td>
                    <td className={'p-3 text-right font-bold ' + tone(reaction?.t1 ?? null)}>{fmt(reaction?.t1 ?? null)}</td>
                    <td className={'p-3 text-right font-bold ' + tone(reaction?.t5 ?? null)}>{fmt(reaction?.t5 ?? null)}</td>
                    <td className={'p-3 text-right font-bold ' + tone(reaction?.t20 ?? null)}>{fmt(reaction?.t20 ?? null)}</td>
                    <td className={'p-3 text-right font-bold ' + tone(reaction?.relativeT1 ?? null)}>{fmt(reaction?.relativeT1 ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-start gap-2 text-[9px] text-white/30 leading-4">
            <ShieldAlert className="w-3.5 h-3.5 text-white/20 mt-0.5 shrink-0" />
            <span>For macro entries, the date is the live indicator's review/update date. Public transaction dates describe the disclosed transaction, not the filing date. Post-event returns show what followed in the market; they do not establish that the event caused the move.</span>
          </div>
        </>
      )}
    </section>
  );
}

function Metric({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[.025] p-3">
      <div className="text-[8px] font-mono uppercase tracking-widest text-white/25">{label}</div>
      <div className={'text-lg font-black mt-1 ' + (valueClass || 'text-white')}>{value}</div>
    </div>
  );
}
