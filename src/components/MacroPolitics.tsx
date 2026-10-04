import DataTable from './DataTable';
import { useState, useEffect } from 'react';
import { ShieldAlert, RefreshCw, AlertCircle, Sparkles, Activity } from 'lucide-react';
import { MacroRisk } from '../types';
import { mapStoredPortfolioHoldings, type PortfolioPosition } from '../utils/portfolioPositions';
import { fetchPortfolioHoldings } from '../utils/portfolioApi';
import { derivePortfolioExposure, type ExposureLevel } from '../utils/evidenceExposure';
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
  const totalInvested = positions.reduce((sum, position) => sum + position.investedValue, 0);
  const portfolioRows = derivedExposure.map((exposure) => {
    const position = positions.find((item) => item.symbol === exposure.symbol);
    const live = livePrices[exposure.symbol];
    const currentValue = live?.price != null && position
      ? live.price * position.quantity
      : position?.investedValue ?? 0;
    const portfolioWeight = totalInvested ? ((position?.investedValue ?? 0) / totalInvested) * 100 : 0;
    const sensitivity = Math.round(
      taiwanProb * 0.5 * exposureFactor(exposure.taiwan.level) +
      gridSeverity * 0.25 * exposureFactor(exposure.power.level) +
      embargoBreadth * 0.25 * exposureFactor(exposure.export.level)
    );
    return {
      ...exposure,
      position,
      currentValue,
      portfolioWeight,
      sensitivity,
      weightedContribution: sensitivity * (portfolioWeight / 100),
    };
  });

  const portfolioSensitivity = portfolioRows.reduce((sum, row) => sum + row.weightedContribution, 0);

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
        <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/5 px-4 py-3">
          <div className="text-[8px] font-mono uppercase tracking-widest text-cyan-300/60">Portfolio scenario sensitivity</div>
          <div className="text-2xl font-black font-mono text-cyan-300 mt-1">{Math.round(portfolioSensitivity)} / 100</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <DataTable
          rows={portfolioRows}
          rowKey={(row) => row.symbol}
          empty="No portfolio risk rows available."
          initialSort={{ key: 'symbol', direction: 'asc' }}
          columns={[
            { key: 'symbol', header: 'Holding', accessor: row => row.symbol },
            { key: 'weight', header: 'Portfolio wt.', accessor: row => row.portfolioWeight, type: 'percent', align: 'right', render: row => row.portfolioWeight.toFixed(1) + '%' },
            { key: 'taiwan', header: 'TSMC', accessor: row => row.taiwan.level, align: 'center', render: row => <ExposurePill level={row.taiwan.level} basis={row.taiwan.basis} /> },
            { key: 'power', header: 'Power', accessor: row => row.power.level, align: 'center', render: row => <ExposurePill level={row.power.level} basis={row.power.basis} /> },
            { key: 'export', header: 'Export', accessor: row => row.export.level, align: 'center', render: row => <ExposurePill level={row.export.level} basis={row.export.basis} /> },
            { key: 'sensitivity', header: 'Sensitivity', accessor: row => row.sensitivity, type: 'number', align: 'right', render: row => row.sensitivity + '/100' },
            { key: 'contribution', header: 'Portfolio impact', accessor: row => row.weightedContribution, type: 'number', align: 'right', render: row => row.weightedContribution.toFixed(1) },
          ]}
        />
      </div>

      <div className="text-[9px] text-white/25 font-mono mt-3">
        Formula: 50% TSMC + 25% power + 25% export, multiplied by Direct=1.00, Secondary=0.55, Limited=0.20. Portfolio weighting uses invested capital.
      </div>
    </div>
  );
}

function ExposurePill({ level, basis }: { level: ExposureLevel; basis?: string }) {
  return (
    <span
      title={basis ? 'Evidence basis: ' + basis : undefined}
      className={'inline-flex px-2 py-1 rounded border text-[9px] uppercase font-bold ' + exposureClass(level)}
    >
      {level}
    </span>
  );
}

function PortfolioExposureMatrix({ contracts = [], news = [], positions = [] }: { contracts?: any[]; news?: any[]; positions?: PortfolioPosition[] }) {
  const derivedExposure = derivePortfolioExposure(positions.map(position => position.symbol), contracts, news, positions);
  return (
    <div className="bg-[#15181E]/30 border border-white/10 rounded-2xl p-5">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-white">Portfolio Risk & Sensitivity</h3>
          <p className="text-[10px] text-white/35 mt-1 font-mono">
            Source-supported sensitivity from portfolio metadata plus matching contract/news evidence. Missing live evidence does not create direct sensitivity.
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
        <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1 aiw-scroll-region">
          {signals.map((signal, index) => (
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
                      {signal.sourceType === 'primary' ? 'PRIMARY' : 'SECONDARY'}
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
        Data source: GDELT document search, including a White House-focused query. Primary-source badges are limited to results whose returned domain is whitehouse.gov; secondary items require source verification.
      </div>
    </section>
  );
}

export default function MacroPolitics({ liveRisks, livePrices = {}, contracts = [], news = [], politicalSignals = [] }: MacroPoliticsProps) {
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

  // Sync sliders dynamically if live risks are updated
  useEffect(() => {
    if (liveRisks && liveRisks.length > 0) {
      liveRisks.forEach((risk) => {
        const cat = risk.category.toLowerCase();
        const title = risk.title.toLowerCase();
        const desc = risk.description.toLowerCase();
        
        const score = risk.impactRating === 'high' ? 75 : risk.impactRating === 'medium' ? 45 : 15;
        
        if (title.includes('taiwan') || desc.includes('taiwan') || desc.includes('tsmc')) {
          setTaiwanProb(score);
        } else if (title.includes('power') || title.includes('grid') || desc.includes('grid') || desc.includes('power')) {
          setGridSeverity(score);
        } else if (title.includes('export') || title.includes('embargo') || desc.includes('export') || desc.includes('embargo') || title.includes('prohibition')) {
          setEmbargoBreadth(score);
        }
      });
    }
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
        title="Macro risk review"
        state={{
          system_stress_score: threatScore,
          taiwan_disruption_probability: taiwanProb,
          power_grid_shortfall: gridSeverity,
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
          <h3 className="text-xs font-black uppercase tracking-widest text-white">Current Risk Indicators (Live Feed)</h3>
          
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
                      {r.impactRating.toUpperCase()} IMPACT
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
                  <span>LAST REVIEW: {r.dateUpdated}</span>
                  <span>IMPACT MATRIX: ACTIVE</span>
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

            <p className="text-xs text-white/60 leading-relaxed">
              Slide variables representing estimated likelihoods to evaluate simulated cumulative supply chain impacts on neocloud networks.
            </p>

            <div className="space-y-4 pt-2 font-mono text-xs">
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] text-white/40 font-bold uppercase tracking-wider">
                  <span>TSMC Disruption Probability</span>
                  <span className="text-white font-black">{taiwanProb}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={taiwanProb}
                  onChange={(e) => setTaiwanProb(parseInt(e.target.value))}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px] text-white/40 font-bold uppercase tracking-wider">
                  <span>Northeast Power Grid Shortfall</span>
                  <span className="text-white font-black">{gridSeverity}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={gridSeverity}
                  onChange={(e) => setGridSeverity(parseInt(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px] text-white/40 font-bold uppercase tracking-wider">
                  <span>AI Chip Export Prohibitions</span>
                  <span className="text-white font-black">{embargoBreadth}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={embargoBreadth}
                  onChange={(e) => setEmbargoBreadth(parseInt(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>
            </div>
          </div>


        </div>
      </div>
    </div>
  );
}
