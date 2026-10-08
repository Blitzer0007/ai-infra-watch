import DataTable from './DataTable';
import { useState, useEffect } from 'react';
import { ShieldAlert, AlertCircle, Activity, RotateCcw, Minus, Plus, ExternalLink, Filter } from 'lucide-react';
import { MacroRisk } from '../types';
import { mapStoredPortfolioHoldings, type PortfolioPosition } from '../utils/portfolioPositions';
import { fetchPortfolioHoldings } from '../utils/portfolioApi';
import { derivePortfolioExposure, validatePortfolioExposure, type ExposureLevel } from '../utils/evidenceExposure';
import JevDecisionPanel from './JevDecisionPanel';
import AutopilotSignalsPanel from './AutopilotSignalsPanel';

interface MacroPoliticsProps {
  liveRisks?: MacroRisk[];
  livePrices?: Record<string, { price: number; changePct: number }>;
  contracts?: any[];
  news?: any[];
  politicalSignals?: any[];
  evidenceAvailability?: Record<string, any>;
  onNavigate?: (view: string) => void;
}

function exposureClass(level: ExposureLevel) {
  if (level === 'Direct') return 'bg-rose-500/10 text-rose-300 border-rose-500/20';
  if (level === 'Secondary') return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
  return 'bg-white/5 text-white/40 border-white/10';
}

type MacroScenarioKey = 'taiwan' | 'power' | 'export';

function exposureFactor(level: ExposureLevel) {
  if (level === 'Direct') return 1;
  if (level === 'Secondary') return 0.55;
  return 0.2;
}

function PortfolioScenarioSensitivity({
  taiwanProb,
  gridSeverity,
  embargoBreadth,
  livePrices = {},
  contracts = [],
  news = [],
  positions = [],
}: {
  taiwanProb: number;
  gridSeverity: number;
  embargoBreadth: number;
  livePrices?: Record<string, { price: number; changePct: number }>;
  contracts?: any[];
  news?: any[];
  positions?: PortfolioPosition[];
}) {
  const derivedExposure = derivePortfolioExposure(positions.map(position => position.symbol), contracts, news, positions);
  const validation = validatePortfolioExposure(derivedExposure);
  const totalReferenceValue = positions.reduce((sum, position) => {
    const live = livePrices[position.symbol];
    const currentValue = live?.price != null && Number.isFinite(Number(live.price))
      ? Number(live.price) * position.quantity
      : position.investedValue;
    return sum + Math.max(0, currentValue);
  }, 0);
  const scenarioInputs = {
    taiwan: { value: taiwanProb, weight: 0.5 },
    power: { value: gridSeverity, weight: 0.25 },
    export: { value: embargoBreadth, weight: 0.25 },
  } as const;
  const portfolioRows = derivedExposure.map((exposure) => {
    const position = positions.find((item) => item.symbol === exposure.symbol);
    const live = livePrices[exposure.symbol];
    const currentValue = live?.price != null && position
      ? live.price * position.quantity
      : position?.investedValue ?? 0;
    const portfolioWeight = totalReferenceValue ? (Math.max(0, currentValue) / totalReferenceValue) * 100 : 0;
    const calculateSensitivity = (worstCase: boolean) => Math.round(
      (Object.entries(scenarioInputs) as Array<[MacroScenarioKey, { value: number; weight: number }]>).reduce((sum, [scenario, input]) => {
        const dimension = exposure[scenario];
        const factor = dimension?.assessment === 'assessed'
          ? exposureFactor(dimension.level)
          : worstCase ? 1 : 0;
        return sum + input.value * input.weight * factor;
      }, 0)
    );
    const assessedSensitivity = calculateSensitivity(false);
    const worstCaseSensitivity = calculateSensitivity(true);
    return {
      ...exposure,
      position,
      currentValue,
      portfolioWeight,
      sensitivity: assessedSensitivity,
      worstCaseSensitivity,
      weightedContribution: assessedSensitivity * (portfolioWeight / 100),
      worstCaseContribution: worstCaseSensitivity * (portfolioWeight / 100),
      referenceCapitalSensitivity: currentValue * (assessedSensitivity / 100),
      worstCaseReferenceCapitalSensitivity: currentValue * (worstCaseSensitivity / 100),
    };
  });

  const portfolioSensitivity = portfolioRows.reduce((sum, row) => sum + row.weightedContribution, 0);
  const portfolioWorstCaseSensitivity = portfolioRows.reduce((sum, row) => sum + row.worstCaseContribution, 0);
  const portfolioReferenceCapitalSensitivity = portfolioRows.reduce((sum, row) => sum + row.referenceCapitalSensitivity, 0);
  const portfolioWorstCaseReferenceCapitalSensitivity = portfolioRows.reduce((sum, row) => sum + row.worstCaseReferenceCapitalSensitivity, 0);
  const topSensitivityRows = portfolioRows.slice().sort((a, b) => b.weightedContribution - a.weightedContribution).slice(0, 3);

  return (
    <div className="bg-[#15181E]/30 border border-white/10 rounded-2xl p-5">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-300" />
            <h3 className="text-xs font-black uppercase tracking-widest text-white">Stock-Specific Scenario Sensitivity</h3>
          </div>
          <p className="text-[10px] text-white/35 mt-1 font-mono max-w-3xl">
            Maps your current scenario inputs onto the exposure matrix and portfolio weights. This is a sensitivity index, not an expected price move or return forecast.
          </p>
        </div>
        <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/5 px-4 py-3 min-w-[250px]">
          <div className="text-[8px] font-mono uppercase tracking-widest text-cyan-300/60">Portfolio scenario sensitivity</div>
          <div className="grid grid-cols-2 gap-4 mt-1">
            <div><div className="text-[8px] text-white/30 font-mono uppercase">Assessed-only</div><div className="text-2xl font-black font-mono text-cyan-300">{Math.round(portfolioSensitivity)} / 100</div></div>
            <div><div className="text-[8px] text-white/30 font-mono uppercase">Worst case</div><div className="text-2xl font-black font-mono text-amber-300">{Math.round(portfolioWorstCaseSensitivity)} / 100</div></div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="rounded-lg border border-white/5 bg-black/10 px-2 py-2">
              <div className="text-[8px] font-mono uppercase text-white/25">Reference capital sensitivity</div>
              <div className="text-sm font-black font-mono text-cyan-200">${portfolioReferenceCapitalSensitivity.toFixed(0)}</div>
            </div>
            <div className="rounded-lg border border-white/5 bg-black/10 px-2 py-2">
              <div className="text-[8px] font-mono uppercase text-white/25">Upper-bound reference</div>
              <div className="text-sm font-black font-mono text-amber-200">${portfolioWorstCaseReferenceCapitalSensitivity.toFixed(0)}</div>
            </div>
          </div>
          <div className="mt-2 text-[8px] font-mono uppercase tracking-wider text-white/35">
            Exposure validation: <span className={validation.status === 'VALIDATED' ? 'text-emerald-300' : validation.status === 'PARTIAL' ? 'text-amber-300' : 'text-white/45'}>{validation.status}</span>
            <span className="text-white/25"> · {validation.assessedDimensions}/{validation.dimensions || 0} dimensions assessed</span>
          </div>
          <div className="mt-1 text-[8px] text-white/25 font-mono">Worst case treats each unassessed dimension as Direct exposure; it is an upper-bound sensitivity, not a prediction.</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <DataTable
          rows={portfolioRows}
          rowKey={(row) => row.symbol}
          empty="No portfolio exposure rows available."
          initialSort={{ key: 'symbol', direction: 'asc' }}
          columns={[
            { key: 'symbol', header: 'Holding', accessor: row => row.symbol },
            { key: 'weight', header: 'Portfolio wt.', accessor: row => row.portfolioWeight, type: 'percent', align: 'right', render: row => row.portfolioWeight.toFixed(1) + '%' },
            { key: 'taiwan', header: 'TSMC', accessor: row => row.taiwan.level, align: 'center', render: row => <ExposurePill level={row.taiwan.level} assessment={row.taiwan.assessment} basis={row.taiwan.basis} /> },
            { key: 'power', header: 'Power', accessor: row => row.power.level, align: 'center', render: row => <ExposurePill level={row.power.level} assessment={row.power.assessment} basis={row.power.basis} /> },
            { key: 'export', header: 'Export', accessor: row => row.export.level, align: 'center', render: row => <ExposurePill level={row.export.level} assessment={row.export.assessment} basis={row.export.basis} /> },
            { key: 'sensitivity', header: 'Sensitivity', accessor: row => row.sensitivity, type: 'number', align: 'right', render: row => row.sensitivity + '/100' },
            { key: 'contribution', header: 'Weighted contribution', accessor: row => row.weightedContribution, type: 'number', align: 'right', render: row => row.weightedContribution.toFixed(1) },
          ]}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
        {topSensitivityRows.map(row => (
          <div key={row.symbol} className="rounded-lg border border-white/5 bg-black/10 px-3 py-2">
            <div className="flex items-center justify-between gap-2"><span className="text-[9px] font-mono uppercase text-white/30">{row.symbol}</span><span className="text-[9px] font-mono text-cyan-200">{row.portfolioWeight.toFixed(1)}%</span></div>
            <div className="mt-1 text-[9px] uppercase tracking-wider text-white/30">Top weighted scenario contributor</div>
            <div className="mt-1 text-sm font-black font-mono text-white">${row.referenceCapitalSensitivity.toFixed(0)} reference</div>
          </div>
        ))}
      </div>
      <div className="text-[9px] text-white/25 font-mono mt-3">
        Formula: 50% TSMC + 25% power + 25% export, multiplied by Direct=1.00, Secondary=0.55, Limited=0.20. Reference capital sensitivity uses current value when available and invested value as fallback; it is not a forecasted loss.
      </div>
    </div>
  );
}

function ExposurePill({ level, basis, assessment = 'assessed' }: { level: ExposureLevel; basis?: string; assessment?: 'assessed' | 'not_assessed' }) {
  const displayLevel = assessment === 'not_assessed' ? 'Not assessed' : level;
  const className = assessment === 'not_assessed'
    ? 'bg-white/5 text-white/35 border-white/10'
    : exposureClass(level);
  return (
    <span
      title={basis ? 'Evidence basis: ' + basis : undefined}
      className={'inline-flex px-2 py-1 rounded border text-[9px] uppercase font-bold ' + className}
    >
      {displayLevel}
    </span>
  );
}

function PortfolioExposureMatrix({ contracts = [], news = [], positions = [] }: { contracts?: any[]; news?: any[]; positions?: PortfolioPosition[] }) {
  const derivedExposure = derivePortfolioExposure(positions.map(position => position.symbol), contracts, news, positions);
  return (
    <div className="bg-[#15181E]/30 border border-white/10 rounded-2xl p-5">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-white">Portfolio Exposure Matrix</h3>
          <p className="text-[10px] text-white/35 mt-1 font-mono">
            Evidence-adjusted exposure from portfolio metadata plus matching contract/news evidence. Missing live evidence does not create direct exposure.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[9px] font-mono uppercase">
          <span className="px-2 py-1 rounded border border-rose-500/20 bg-rose-500/10 text-rose-300">Direct</span>
          <span className="px-2 py-1 rounded border border-amber-500/20 bg-amber-500/10 text-amber-300">Secondary</span>
          <span className="px-2 py-1 rounded border border-white/10 bg-white/5 text-white/40">Limited</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <DataTable
          rows={derivedExposure}
          rowKey={(row) => row.symbol}
          empty="No portfolio sensitivity rows available."
          initialSort={{ key: 'symbol', direction: 'asc' }}
          columns={[
            { key: 'symbol', header: 'Holding', accessor: row => row.symbol },
            { key: 'taiwan', header: 'TSMC disruption', accessor: row => row.taiwan.level, align: 'center', render: row => <ExposurePill level={row.taiwan.level} basis={row.taiwan.basis} /> },
            { key: 'power', header: 'Power shortfall', accessor: row => row.power.level, align: 'center', render: row => <ExposurePill level={row.power.level} basis={row.power.basis} /> },
            { key: 'export', header: 'AI-chip export controls', accessor: row => row.export.level, align: 'center', render: row => <ExposurePill level={row.export.level} basis={row.export.basis} /> },
          ]}
        />
      </div>
    </div>
  );
}



function ExecutiveSignalsPanel() {
  const [signals, setSignals] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const load = async () => {
    setLoading(true); setMessage('');
    try {
      const response = await fetch('/api/company-scale?action=executive&days=7&limit=12', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Executive signals unavailable');
      setSignals(Array.isArray(body?.signals) ? body.signals : []);
      setProfiles(Array.isArray(body?.profiles) ? body.profiles : []);
      if (body?.configuredProvider === 'none') setMessage('Web search provider not configured. Official profile links remain available. Add BRAVE_SEARCH_API_KEY or TAVILY_API_KEY for live X/LinkedIn discovery.');
      else if (body?.providerNotes?.length) setMessage(body.providerNotes.join(' · '));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Executive signals unavailable'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  return (
    <section data-testid='executive-signals' className='bg-[#15181E]/30 border border-violet-400/15 rounded-2xl p-5'>
      <div className='flex flex-wrap items-start justify-between gap-3'><div><div className='text-[10px] font-mono uppercase tracking-[0.2em] text-violet-300'>Executive / social signals</div><h3 className='text-lg font-black uppercase tracking-tight text-white mt-1'>Leadership statements</h3><p className='text-[10px] text-white/35 mt-1 font-mono max-w-4xl'>Public executive signals from official X, LinkedIn and company web sources when indexed. Official matches are separated from secondary coverage.</p></div><button onClick={() => void load()} disabled={loading} className='rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-mono uppercase text-cyan-300'>{loading ? 'Loading' : 'Refresh'}</button></div>
      {message && <div className='mt-3 rounded-lg border border-amber-400/15 bg-amber-400/[.03] px-3 py-2 text-[9px] font-mono text-amber-200/65'>{message}</div>}
      <div className='mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2'>{profiles.map(profile => <div key={profile.id} className='rounded-lg border border-white/5 bg-black/10 p-3'><div className='text-[9px] font-mono font-black text-white'>{profile.name}</div><div className='text-[8px] text-white/30 mt-1'>{profile.organizations.join(' · ')}</div>{profile.x_username && <a className='text-[8px] text-cyan-300 mt-2 inline-block' href={'https://x.com/' + profile.x_username} target='_blank' rel='noreferrer'>X / @{profile.x_username}</a>}{profile.linkedin_profile && <a className='text-[8px] text-cyan-300 mt-2 ml-3 inline-block' href={profile.linkedin_profile} target='_blank' rel='noreferrer'>LinkedIn</a>}</div>)}</div>
      <div className='mt-4 space-y-2 max-h-[420px] overflow-y-auto pr-1 aiw-scroll-region'>{signals.length ? signals.map((signal,index) => <article key={signal.url || index} className='rounded-lg border border-white/5 bg-white/[.02] p-3'><div className='flex flex-wrap items-center gap-2'><span className='text-[8px] font-mono uppercase text-violet-300'>{signal.executive}</span><span className={'text-[8px] font-mono uppercase rounded border px-1.5 py-0.5 ' + (signal.official ? 'border-emerald-400/20 text-emerald-300' : 'border-amber-400/20 text-amber-300')}>{signal.sourceType}</span></div><div className='text-[11px] font-bold text-white mt-1'>{signal.title}</div>{signal.snippet && <p className='text-[9px] leading-4 text-white/35 mt-1'>{signal.snippet}</p>}<div className='flex flex-wrap items-center gap-3 mt-2'><span className='text-[8px] font-mono text-white/20'>{signal.source}</span>{signal.published_at && <span className='text-[8px] font-mono text-white/20'>{new Date(signal.published_at).toLocaleString()}</span>}<a className='text-[8px] font-mono text-cyan-300' href={signal.url} target='_blank' rel='noreferrer'>Open source</a></div></article>) : !loading && <div className='rounded-lg border border-white/5 bg-white/[.02] p-4 text-[9px] font-mono text-white/30'>No executive signals returned by the configured search sources.</div>}</div>
      <div className='mt-3 pt-3 border-t border-white/5 text-[8px] font-mono text-white/20'>Executive statements are evidence. Autonomous Research routes these results through JEV for provenance, freshness and conflict checks before synthesis; inferred market impact stays separate from the executive's words.</div>
    </section>
  );
}
function PoliticalSignalsFeed({ signals = [] }: { signals?: any[] }) {
  const [sourceFilter, setSourceFilter] = useState<'all' | 'primary' | 'secondary'>('all');
  const [topicFilter, setTopicFilter] = useState('all');
  const topicBuckets = ['all', 'AI / Technology', 'Trade Policy', 'Supply Chain', 'Infrastructure', 'Regulation'];

  const actorTone = (actor: string) => {
    if (actor === 'Donald Trump') return 'text-amber-300';
    if (actor === 'JD Vance') return 'text-cyan-300';
    return 'text-white/70';
  };

  const matchesTopic = (signal: any) => {
    if (topicFilter === 'all') return true;
    const haystack = String(signal.topic || '') + ' ' + String(signal.eventType || '') + ' ' + String(signal.title || '');
    if (topicFilter === 'AI / Technology') return /(ai|artificial intelligence|chip|gpu|semiconductor|technology)/i.test(haystack);
    if (topicFilter === 'Trade Policy') return /(export|trade|tariff|sanction|embargo|restriction|control)/i.test(haystack);
    if (topicFilter === 'Supply Chain') return /(supply|tsmc|taiwan|foundry|hbm|memory)/i.test(haystack);
    if (topicFilter === 'Infrastructure') return /(power|grid|data.?center|energy|utility|infrastructure)/i.test(haystack);
    return /(regulation|law|act|policy|rule|executive)/i.test(haystack);
  };
  const visibleSignals = signals.filter(signal =>
    (sourceFilter === 'all' || String(signal.sourceType || '').toLowerCase() === sourceFilter) &&
    matchesTopic(signal)
  );

  return (
    <section className="bg-[#15181E]/30 border border-white/10 rounded-2xl p-5">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-300">Live political / policy feed</div>
          <h3 className="text-lg font-black uppercase tracking-tight text-white mt-1">Political &amp; AI Policy Signals</h3>
          <p className="text-[10px] text-white/35 mt-1 font-mono max-w-4xl">
            Tracks recent political statements, official actions and related reporting that mention AI, chips, data centers, power or regulation. Headlines are evidence signals, not verified quotations; open the source before relying on wording.
          </p>
        </div>
        <div className="text-[9px] font-mono uppercase tracking-wider text-white/30">
          {visibleSignals.length} of {signals.length} signal{signals.length === 1 ? '' : 's'} · filtered recent feed
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-4 rounded-xl border border-white/5 bg-black/10 p-2" aria-label="Political signal filters">
        <span className="inline-flex items-center gap-1 text-[8px] font-mono uppercase tracking-wider text-white/25"><Filter className="w-3 h-3" /> Filter</span>
        {topicBuckets.map(topic => (
          <button type="button" key={topic} onClick={() => setTopicFilter(topic)} aria-pressed={topicFilter === topic} className={'px-2 py-1 rounded border text-[8px] font-mono uppercase tracking-wider ' + (topicFilter === topic ? 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200' : 'border-white/10 bg-white/5 text-white/40 hover:text-white/70')}>
            {topic === 'all' ? 'All topics' : topic}
          </button>
        ))}
        <span className="h-4 w-px bg-white/10 mx-1" aria-hidden="true" />
        {(['all', 'primary', 'secondary'] as const).map(source => (
          <button type="button" key={source} onClick={() => setSourceFilter(source)} aria-pressed={sourceFilter === source} className={'px-2 py-1 rounded border text-[8px] font-mono uppercase tracking-wider ' + (sourceFilter === source ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-white/5 text-white/40 hover:text-white/70')}>
            {source === 'all' ? 'All sources' : source}
          </button>
        ))}
      </div>

      {visibleSignals.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-white/[.02] p-5 text-[10px] font-mono text-white/35">
          No recent political / AI policy signals were returned by the configured live feeds.
        </div>
      ) : (
        <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1 aiw-scroll-region">
          {visibleSignals.map((signal, index) => (
            <article
              key={signal.id || signal.url || signal.title || index}
              className="rounded-xl border border-white/5 bg-white/[.02] p-4"
            >
              <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={'text-[9px] font-mono font-black uppercase tracking-wider ' + actorTone(signal.actor || '')}>
                      {signal.actor || 'U.S. political leadership'}
                    </span>
                    <span className="px-2 py-0.5 rounded border border-cyan-400/15 bg-cyan-400/5 text-cyan-300 text-[8px] font-mono uppercase tracking-wider">
                      {signal.topic || 'AI / Technology'}
                    </span>
                    <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-white/40 text-[8px] font-mono uppercase tracking-wider">
                      {signal.eventType || 'Political statement / coverage'}
                    </span>
                    <span className={'px-2 py-0.5 rounded border text-[8px] font-mono uppercase tracking-wider ' +
                      (signal.sourceType === 'primary'
                        ? 'border-emerald-400/15 bg-emerald-400/5 text-emerald-300'
                        : 'border-amber-400/15 bg-amber-400/5 text-amber-300')}>
                      {signal.sourceType === 'primary'
                        ? String(signal.source || '').toLowerCase().includes('federalregister')
                          ? 'FEDERAL REGISTER · PRIMARY'
                          : String(signal.source || '').toLowerCase().includes('whitehouse')
                            ? 'WHITE HOUSE · PRIMARY'
                            : 'PRIMARY'
                        : 'SECONDARY'}
                    </span>
                  </div>

                  <h4 className="text-sm font-black text-white leading-relaxed">
                    {signal.title}
                  </h4>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[9px] font-mono text-white/30">
                    <span>{signal.source || 'GDELT'}</span>
                    {signal.date && <span>{new Date(signal.date).toLocaleString()}</span>}
                  </div>

                  {Array.isArray(signal.relatedSymbols) && signal.relatedSymbols.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {signal.relatedSymbols.map((symbol: string) => (
                        <span
                          key={symbol}
                          className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[8px] font-mono font-bold text-white/55"
                        >
                          {symbol}
                        </span>
                      ))}
                    </div>
                  )}

                  {signal.note && (
                    <p className="text-[9px] text-white/30 font-mono mt-3 leading-relaxed">{signal.note}</p>
                  )}
                </div>

                {signal.url && (
                  <a
                    href={signal.url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-mono uppercase tracking-wider text-cyan-300 hover:text-cyan-200 hover:bg-white/10"
                  >
                    Open source
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-white/5 text-[9px] text-white/25 font-mono">
        Data source: GDELT document search with government-domain discovery. Primary-source badges distinguish returned government sources such as whitehouse.gov and federalregister.gov; secondary items require source verification.
      </div>
    </section>
  );
}

function scenarioBaselineFromRisks(risks: MacroRisk[] = []) {
  let taiwan = 15;
  let power = 30;
  let exportBreadth = 25;
  for (const risk of risks) {
    const text = (String(risk.title || '') + ' ' + String(risk.description || '')).toLowerCase();
    const score = risk.impactRating === 'high' ? 75 : risk.impactRating === 'medium' ? 45 : 15;
    if (text.includes('taiwan') || text.includes('tsmc')) taiwan = score;
    else if (text.includes('power') || text.includes('grid')) power = score;
    else if (text.includes('export') || text.includes('embargo') || text.includes('prohibition')) exportBreadth = score;
  }
  return { taiwan, power, export: exportBreadth };
}

function feedStatus(item: any) {
  if (!item) return { label: 'MISSING', tone: 'text-rose-300 border-rose-400/20 bg-rose-400/5' };
  if (item.conflictStatus === 'CONFLICT' || item.status === 'CONFLICT') return { label: 'CONFLICT', tone: 'text-rose-300 border-rose-400/20 bg-rose-400/5' };
  if (item.freshness?.status === 'VERY_STALE' || item.stale) return { label: 'STALE', tone: 'text-amber-300 border-amber-400/20 bg-amber-400/5' };
  if (item.freshness?.status === 'AGING') return { label: 'AGING', tone: 'text-yellow-200 border-yellow-400/20 bg-yellow-400/5' };
  if (item.fallback) return { label: 'FALLBACK', tone: 'text-yellow-200 border-yellow-400/20 bg-yellow-400/5' };
  if (item.status === 'AVAILABLE') return { label: 'HEALTHY', tone: 'text-emerald-300 border-emerald-400/20 bg-emerald-400/5' };
  return { label: String(item.status || 'UNKNOWN').toUpperCase(), tone: 'text-white/45 border-white/10 bg-white/5' };
}

function evidenceCount(item: any) {
  return Number.isFinite(Number(item?.count)) ? Number(item.count) : 0;
}

export default function MacroPolitics({ liveRisks, livePrices = {}, contracts = [], news = [], politicalSignals = [], evidenceAvailability = {}, onNavigate }: MacroPoliticsProps) {
  const [taiwanProb, setTaiwanProb] = useState<number>(15);
  const [gridSeverity, setGridSeverity] = useState<number>(30);
  const [embargoBreadth, setEmbargoBreadth] = useState<number>(25);
  const [portfolioPositions, setPortfolioPositions] = useState<PortfolioPosition[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState('');

  const activeRisks = liveRisks || [];

  useEffect(() => {
    let cancelled = false;
    setPortfolioLoading(true);
    fetchPortfolioHoldings()
      .then(rows => {
        if (cancelled) return;
        setPortfolioPositions(mapStoredPortfolioHoldings(rows));
        setPortfolioError('');
      })
      .catch(error => {
        if (cancelled) return;
        setPortfolioPositions([]);
        setPortfolioError(error instanceof Error ? error.message : 'Portfolio holdings unavailable');
      })
      .finally(() => {
        if (!cancelled) setPortfolioLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Sync scenario controls to the observed baseline risk framework.
  useEffect(() => {
    const baseline = scenarioBaselineFromRisks(liveRisks || []);
    setTaiwanProb(baseline.taiwan);
    setGridSeverity(baseline.power);
    setEmbargoBreadth(baseline.export);
  }, [liveRisks]);

  // Calculate customized threat coefficient
  const calculateThreatScore = () => {
    // Weighted formula
    const raw = (taiwanProb * 0.5) + (gridSeverity * 0.25) + (embargoBreadth * 0.25);
    return Math.round(raw);
  };

  const threatScore = calculateThreatScore();

  const getThreatVerdict = (score: number) => {
    if (score < 20) return { label: 'LOW VULNERABILITY', color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' };
    if (score < 45) return { label: 'ELEVATED SYSTEM RISK', color: 'text-amber-400 border-amber-500/20 bg-amber-500/5' };
    return { label: 'SEVERE CRITICAL HAZARD', color: 'text-rose-400 border-rose-500/20 bg-rose-500/5' };
  };

  const verdict = getThreatVerdict(threatScore);

  return (
    <div className="space-y-6" id="macro-view">
      {/* Page Header */}
      <div className="aiw-page-header flex flex-col space-y-1 md:space-y-2 border-b border-white/10 pb-4">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Section 05 / Signals</span>
        <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase italic text-white">
          Macro &amp; Geopolitical Risk Ledger
        </h1>
        <p className="text-xs text-white/60 max-w-3xl leading-relaxed">
          AI infrastructure rests on a physical hardware foundation. Monitor state-level risks, regulatory hurdles, and localized power constraints.
        </p>
      </div>

      <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-5 rounded-2xl border ${verdict.color}`}>
        <div>
          <span className="text-[9px] uppercase tracking-[0.2em] opacity-60 font-mono font-black block">Calculated Scenario Stress Index</span>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="text-5xl font-black font-mono">{threatScore} / 100</span>
            <span className="text-[11px] font-black tracking-widest uppercase">{verdict.label}</span>
          </div>
          <p className="text-[9px] text-white/40 font-mono mt-2">50% TSMC disruption + 25% power grid + 25% export controls. These are transparent scenario inputs, not forecasts and not model-generated probabilities.</p>
        </div>
        <div className="flex items-start gap-2 max-w-md text-[10px] text-white/40 leading-normal">
          <AlertCircle className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
          <span>Adjust the scenario sliders to recalculate the local stress index.</span>
        </div>
      </div>

      <section className="rounded-2xl border border-white/10 bg-[#15181E]/30 p-4" aria-labelledby="macro-evidence-heading">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-cyan-300">Observed evidence status</div>
            <h2 id="macro-evidence-heading" className="text-xs font-black uppercase tracking-widest text-white mt-1">What is actually changing</h2>
            <p className="text-[9px] text-white/35 font-mono mt-1">Risk frameworks are separate from observed evidence. Counts below reflect the live feeds returned to this page.</p>
          </div>
          {onNavigate && <button type="button" onClick={() => onNavigate('health')} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-mono uppercase text-cyan-200 hover:bg-white/10"><ExternalLink className="w-3 h-3" /> Data health</button>}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
          {[['News', 'news'], ['Political / Policy', 'political'], ['SEC Contracts', 'contracts'], ['Congress', 'congress']].map(([label, key]) => {
            const item = evidenceAvailability[key] || { count: key === 'news' ? news.length : key === 'political' ? politicalSignals.length : key === 'contracts' ? contracts.length : 0, status: 'AVAILABLE' };
            const status = feedStatus(item);
            return <div key={key} className="rounded-xl border border-white/5 bg-black/10 p-3"><div className="flex items-center justify-between gap-2"><span className="text-[8px] font-mono uppercase tracking-wider text-white/30">{label}</span><span className={'px-1.5 py-0.5 rounded border text-[7px] font-mono uppercase ' + status.tone}>{status.label}</span></div><div className="mt-1 text-lg font-black font-mono text-white">{evidenceCount(item)}</div><div className="text-[8px] font-mono text-white/20">{item.freshness?.status || (item.retrievedAt ? 'retrieved' : 'current response')}</div></div>;
          })}
        </div>
      </section>
      <section className="rounded-2xl border border-white/10 bg-[#15181E]/30 p-4" aria-labelledby="macro-scenario-controls">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-cyan-300">Scenario lab</div>
            <h2 id="macro-scenario-controls" className="text-xs font-black uppercase tracking-widest text-white mt-1">Repeatable stress presets</h2>
            <p className="text-[9px] text-white/35 font-mono mt-1">Baseline mirrors the current rule-based framework. Presets are stress-test inputs, not observed probabilities or return forecasts.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => { const base = scenarioBaselineFromRisks(activeRisks); setTaiwanProb(base.taiwan); setGridSeverity(base.power); setEmbargoBreadth(base.export); }} className="inline-flex items-center gap-1.5 rounded border border-cyan-400/15 bg-cyan-400/[.04] px-2 py-1.5 text-[8px] font-mono uppercase text-cyan-200"><RotateCcw className="w-3 h-3" /> Live baseline</button>
            <button type="button" onClick={() => { setTaiwanProb(75); setGridSeverity(30); setEmbargoBreadth(25); }} className="rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[8px] font-mono uppercase text-white/55 hover:text-white">Taiwan shock</button>
            <button type="button" onClick={() => { setTaiwanProb(15); setGridSeverity(75); setEmbargoBreadth(25); }} className="rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[8px] font-mono uppercase text-white/55 hover:text-white">Power squeeze</button>
            <button type="button" onClick={() => { setTaiwanProb(15); setGridSeverity(30); setEmbargoBreadth(75); }} className="rounded border border-white/10 bg-white/5 px-2 py-1.5 text-[8px] font-mono uppercase text-white/55 hover:text-white">Export controls</button>
            <button type="button" onClick={() => { setTaiwanProb(100); setGridSeverity(100); setEmbargoBreadth(100); }} className="rounded border border-rose-400/15 bg-rose-400/[.04] px-2 py-1.5 text-[8px] font-mono uppercase text-rose-200">Combined stress</button>
          </div>
        </div>
      </section>
      <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[.03] p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-cyan-300">Evidence provenance</div>
            <h3 className="text-xs font-black uppercase tracking-widest text-white mt-1">Macro &amp; Political Data Sources</h3>
            <p className="text-[10px] text-white/35 mt-1 font-mono">
              Risk labels and the scenario index are computed by AI Infra Watch rules. Current political signals are retrieved from GDELT, including a White House-focused query; primary badges require a whitehouse.gov result domain. No generative model is used to create the macro risk score.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[8px] font-mono uppercase tracking-wider">
            <span className="rounded border border-white/10 bg-white/5 px-2 py-2 text-white/45 text-center">Rule-based risk map</span>
            <span className="rounded border border-white/10 bg-white/5 px-2 py-2 text-white/45 text-center">GDELT politics</span>
            <span className="rounded border border-white/10 bg-white/5 px-2 py-2 text-white/45 text-center">White House primary</span>
            <span className="rounded border border-white/10 bg-white/5 px-2 py-2 text-white/45 text-center">Market / SEC context</span>
          </div>
        </div>
      </div>

      {portfolioLoading && (
        <div className="rounded-xl border border-cyan-400/10 bg-cyan-400/[.02] px-4 py-3 text-[9px] font-mono text-cyan-200/50">
          Loading current portfolio holdings for macro exposure…
        </div>
      )}
      {!portfolioLoading && portfolioError && (
        <div className="rounded-xl border border-amber-400/15 bg-amber-400/[.03] px-4 py-3 text-[9px] font-mono text-amber-200/60">
          Portfolio impact unavailable: {portfolioError}
        </div>
      )}
      {!portfolioLoading && !portfolioError && portfolioPositions.length === 0 && (
        <div className="rounded-xl border border-amber-400/15 bg-amber-400/[.03] px-4 py-3 text-[9px] font-mono text-amber-200/60">
          No saved portfolio holdings were returned, so portfolio impact is not inferred.
        </div>
      )}
      {activeRisks.length === 0 && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[.03] px-4 py-3 text-[9px] font-mono text-amber-200/70">
          Macro evidence: NOT ASSESSED · no live risk records were returned. The scenario sliders below are user-defined stress inputs, not observed probabilities.
        </div>
      )}
      <PortfolioExposureMatrix contracts={contracts} news={news} positions={portfolioPositions} />

      <PortfolioScenarioSensitivity
        taiwanProb={taiwanProb}
        gridSeverity={gridSeverity}
        embargoBreadth={embargoBreadth}
        livePrices={livePrices}
        contracts={contracts}
        news={news}
        positions={portfolioPositions}
      />

      <JevDecisionPanel
        kind="macro"
        title="Macro exposure review"
        state={{
          system_stress_score: threatScore,
          taiwan_stress_level: taiwanProb,
          power_grid_stress_level: gridSeverity,
          export_control_breadth: embargoBreadth,
          live_risks: activeRisks.slice(0, 8).map((risk) => ({
            id: risk.id,
            category: risk.category,
            title: risk.title,
            impact_rating: risk.impactRating,
            description: risk.description,
            updated: risk.dateUpdated,
          })),
        }}
      />

      <PoliticalSignalsFeed signals={politicalSignals} />

      <AutopilotSignalsPanel />

      <ExecutiveSignalsPanel />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Risks Catalog Column */}
        <div className="lg:col-span-2 space-y-4">
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-white">Risk Framework / Exposure Themes</h3>
            <p className="text-[9px] text-white/30 font-mono mt-1">Structural monitoring themes. Observed policy/news events are shown separately below.</p>
          </div>
          
          <div className="space-y-4">
            {activeRisks.map((r) => (
              <div key={r.id} className="bg-[#15181E]/30 border border-white/10 p-5 rounded-xl space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[9px] font-mono text-white/40 uppercase tracking-wider">{r.category}</span>
                    <h4 className="text-sm font-black uppercase tracking-tight text-white mt-1">{r.title}</h4>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                      r.impactRating === 'high'
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        : r.impactRating === 'medium'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}>
                      STRUCTURAL · {r.impactRating.toUpperCase()}
                    </span>
                    {r.impactSummary && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold uppercase tracking-wider">
                        Impact
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-white/60 leading-relaxed">
                  {r.description}
                </p>

                {r.impactSummary && (
                  <div className="mt-2 p-2.5 bg-emerald-500/5 border border-emerald-500/10 rounded-lg text-[10px] text-[#A7F3D0] font-mono leading-relaxed font-normal">
                    <span className="text-[8px] uppercase tracking-wider text-emerald-400/70 font-black block mb-1">Impact Pathway</span>
                    {r.impactSummary}
                  </div>
                )}

                <div className="flex justify-between text-[9px] font-mono text-white/30 border-t border-white/5 pt-2">
                  <span>FRAMEWORK DATE: {r.dateUpdated}</span>
                  <span>FRAMEWORK: ACTIVE</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Interactive Impact Calculator */}
        <div className="bg-[#15181E]/30 border border-white/10 p-5 rounded-2xl flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-2 border-b border-white/10 pb-3">
              <ShieldAlert className="w-5 h-5 text-rose-500" />
              <h3 className="text-xs font-black uppercase tracking-widest text-white">Geopolitical Risk Stress Tool</h3>
            </div>

            <div className="rounded-lg border border-amber-400/15 bg-amber-400/[.03] px-3 py-2 text-[8px] font-mono uppercase tracking-wider text-amber-200/70">SIMULATED SCENARIO · not observed likelihood</div>
            <p className="text-xs text-white/60 leading-relaxed">
              Slide variables representing user-defined scenario inputs to evaluate simulated cumulative supply-chain impacts on neocloud networks.
            </p>

            <div className="space-y-4 pt-2 font-mono text-xs">
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] text-white/40 font-bold uppercase tracking-wider">
                  <span>Taiwan / TSMC Stress Level</span>
                  <span className="text-white font-black">{taiwanProb}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Decrease Taiwan stress by 5" onClick={() => setTaiwanProb(v => Math.max(0, v - 5))} className="rounded border border-white/10 bg-white/5 p-1 text-white/45 hover:text-white"><Minus className="w-3 h-3" /></button>
                  <input aria-label="Taiwan TSMC stress level"
                    type="range"
                    min="0"
                    max="100"
                    value={taiwanProb}
                    onChange={(e) => setTaiwanProb(parseInt(e.target.value))}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                  <button type="button" aria-label="Increase Taiwan stress by 5" onClick={() => setTaiwanProb(v => Math.min(100, v + 5))} className="rounded border border-white/10 bg-white/5 p-1 text-white/45 hover:text-white"><Plus className="w-3 h-3" /></button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px] text-white/40 font-bold uppercase tracking-wider">
                  <span>Power Grid Stress Level</span>
                  <span className="text-white font-black">{gridSeverity}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Decrease power stress by 5" onClick={() => setGridSeverity(v => Math.max(0, v - 5))} className="rounded border border-white/10 bg-white/5 p-1 text-white/45 hover:text-white"><Minus className="w-3 h-3" /></button>
                  <input aria-label="Power grid stress level"
                    type="range"
                    min="0"
                    max="100"
                    value={gridSeverity}
                    onChange={(e) => setGridSeverity(parseInt(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <button type="button" aria-label="Increase power stress by 5" onClick={() => setGridSeverity(v => Math.min(100, v + 5))} className="rounded border border-white/10 bg-white/5 p-1 text-white/45 hover:text-white"><Plus className="w-3 h-3" /></button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px] text-white/40 font-bold uppercase tracking-wider">
                  <span>AI Chip Export-Control Breadth</span>
                  <span className="text-white font-black">{embargoBreadth}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Decrease export-control breadth by 5" onClick={() => setEmbargoBreadth(v => Math.max(0, v - 5))} className="rounded border border-white/10 bg-white/5 p-1 text-white/45 hover:text-white"><Minus className="w-3 h-3" /></button>
                  <input aria-label="Export-control breadth"
                    type="range"
                    min="0"
                    max="100"
                    value={embargoBreadth}
                    onChange={(e) => setEmbargoBreadth(parseInt(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <button type="button" aria-label="Increase export-control breadth by 5" onClick={() => setEmbargoBreadth(v => Math.min(100, v + 5))} className="rounded border border-white/10 bg-white/5 p-1 text-white/45 hover:text-white"><Plus className="w-3 h-3" /></button>
                </div>
              </div>
            </div>
          </div>


        </div>
      </div>
    </div>
  );
}