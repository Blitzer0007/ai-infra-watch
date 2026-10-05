import DataTable from './DataTable';
import { useState, useEffect } from 'react';
import { ShieldAlert, RefreshCw, AlertCircle, Sparkles, Activity } from 'lucide-react';
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
  const totalInvested = positions.reduce((sum, position) => sum + position.investedValue, 0);
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
    const portfolioWeight = totalInvested ? ((position?.investedValue ?? 0) / totalInvested) * 100 : 0;
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
    };
  });

  const portfolioSensitivity = portfolioRows.reduce((sum, row) => sum + row.weightedContribution, 0);
  const portfolioWorstCaseSensitivity = portfolioRows.reduce((sum, row) => sum + row.worstCaseContribution, 0);

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

      <div className="text-[9px] text-white/25 font-mono mt-3">
        Formula: 50% TSMC + 25% power + 25% export, multiplied by Direct=1.00, Secondary=0.55, Limited=0.20. Assessed-only excludes unassessed dimensions; worst case assumes unassessed = Direct. Portfolio weighting uses invested capital.
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
  const actorTone = (actor: string) => {
    if (actor === 'Donald Trump') return 'text-amber-300';
    if (actor === 'JD Vance') return 'text-cyan-300';
    return 'text-white/70';
  };

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
          {signals.length} signal{signals.length === 1 ? '' : 's'} · recent feed window
        </div>
      </div>

      {signals.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-white/[.02] p-5 text-[10px] font-mono text-white/35">
          No recent political / AI policy signals were returned by the configured live feeds.
        </div>
      ) : (