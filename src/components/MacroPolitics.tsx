import { useState, useEffect } from 'react';
import { ShieldAlert, RefreshCw, AlertCircle, Sparkles, Activity } from 'lucide-react';
import { MacroRisk } from '../types';
import { PORTFOLIO_POSITIONS } from '../utils/portfolioPositions';

interface MacroPoliticsProps {
  liveRisks?: MacroRisk[];
  livePrices?: Record<string, { price: number; changePct: number }>;
  contracts?: any[];
  news?: any[];
  congressTrades?: any[];
}

type ExposureLevel = 'Direct' | 'Secondary' | 'Limited';



const BASE_PORTFOLIO_EXPOSURE = [
  { symbol: 'DGXX', taiwan: 'Limited', power: 'Direct', export: 'Limited' },
  { symbol: 'DRAM', taiwan: 'Direct', power: 'Secondary', export: 'Secondary' },
  { symbol: 'SOXL', taiwan: 'Direct', power: 'Secondary', export: 'Direct' },
  { symbol: 'NVDA', taiwan: 'Direct', power: 'Secondary', export: 'Direct' },
  { symbol: 'MSFT', taiwan: 'Secondary', power: 'Secondary', export: 'Secondary' },
  { symbol: 'NBIS', taiwan: 'Secondary', power: 'Direct', export: 'Secondary' },
  { symbol: 'VIVO', taiwan: 'Limited', power: 'Direct', export: 'Limited' },
  { symbol: 'META', taiwan: 'Secondary', power: 'Secondary', export: 'Secondary' },
  { symbol: 'NOW', taiwan: 'Limited', power: 'Secondary', export: 'Limited' },
  { symbol: 'PHVS', taiwan: 'Limited', power: 'Limited', export: 'Limited' },
] as const;

type EvidenceInput = {
  contracts?: any[];
  news?: any[];
  congressTrades?: any[];
};

const SCENARIO_KEYWORDS: Record<'taiwan' | 'power' | 'export', string[]> = {
  taiwan: ['taiwan', 'tsmc', 'taiwanese', 'foundry', 'hbm', 'dram', 'nand', 'korea + taiwan'],
  power: ['power', 'grid', 'data center', 'datacenter', 'mw', 'gw', 'utility', 'nuclear', 'solar', 'colocation', 'facility', 'campus'],
  export: ['export', 'china', 'sanction', 'embargo', 'restricted', 'restriction', 'export control', 'chip controls', 'advanced chip', 'gpu export'],
};

function tokenHits(text: string, keywords: string[]) {
  return [...new Set(keywords.filter(keyword => text.includes(keyword)))];
}

function evidenceForSymbol(symbol: string, scenario: 'taiwan' | 'power' | 'export', evidence: EvidenceInput) {
  const position = PORTFOLIO_POSITIONS.find(item => item.symbol === symbol);
  const profileText = [
    position?.name,
    position?.group,
    position?.theme,
    position?.geo,
    position?.notes,
  ].filter(Boolean).join(' ').toLowerCase();

  const relatedContracts = (evidence.contracts || []).filter(item =>
    String(item?.company || '').toUpperCase() === symbol ||
    String(item?.client || '').toUpperCase().includes(symbol)
  );
  const contractText = relatedContracts.map(item => [
    item?.company, item?.client, item?.value, item?.duration, item?.hardware, item?.details, item?.status,
  ].filter(Boolean).join(' ')).join(' ').toLowerCase();

  const relatedNews = (evidence.news || []).filter(item => {
    const text = [item?.title, item?.summary, item?.description, item?.symbols].filter(Boolean).join(' ').toUpperCase();
    return text.includes(symbol);
  });
  const newsText = relatedNews.map(item => [
    item?.title, item?.summary, item?.description,
  ].filter(Boolean).join(' ')).join(' ').toLowerCase();

  const relatedTrades = (evidence.congressTrades || []).filter(item =>
    String(item?.stockSymbol || '').toUpperCase() === symbol
  );
  const tradeText = relatedTrades.map(item => [
    item?.transactionType, item?.amountRange, item?.date,
  ].filter(Boolean).join(' ')).join(' ').toLowerCase();

  const hits = {
    profile: tokenHits(profileText, SCENARIO_KEYWORDS[scenario]),
    contracts: tokenHits(contractText, SCENARIO_KEYWORDS[scenario]),
    news: tokenHits(newsText, SCENARIO_KEYWORDS[scenario]),
    disclosures: tokenHits(tradeText, SCENARIO_KEYWORDS[scenario]),
  };

  const directSignals = hits.profile.length + Math.min(hits.contracts.length, 2) + Math.min(hits.news.length, 1);
  const strongestSignals = [
    ...hits.profile,
    ...hits.contracts.slice(0, 2),
    ...hits.news.slice(0, 1),
  ];

  let level: ExposureLevel = 'Limited';
  if (directSignals >= 3) level = 'Direct';
  else if (directSignals >= 1) level = 'Secondary';

  const peerEvidence = (position?.peers || [])
    .map(peer => BASE_PORTFOLIO_EXPOSURE.find(row => row.symbol === peer)?.[scenario])
    .filter(Boolean) as ExposureLevel[];

  if (level === 'Limited' && peerEvidence.some(item => item === 'Direct' || item === 'Secondary')) {
    level = 'Secondary';
  }

  const basis = strongestSignals.length
    ? strongestSignals.slice(0, 3).join(', ')
    : peerEvidence.length
      ? 'peer exposure'
      : 'no company-specific evidence';

  return {
    level,
    basis,
    evidenceCount: strongestSignals.length,
    sources: {
      profile: hits.profile,
      contracts: hits.contracts,
      news: hits.news,
      disclosures: hits.disclosures,
    },
    relatedContracts: relatedContracts.length,
    relatedNews: relatedNews.length,
    relatedTrades: relatedTrades.length,
  };
}

function derivePortfolioExposure(evidence: EvidenceInput) {
  return BASE_PORTFOLIO_EXPOSURE.map(base => ({
    ...base,
    taiwanEvidence: evidenceForSymbol(base.symbol, 'taiwan', evidence),
    powerEvidence: evidenceForSymbol(base.symbol, 'power', evidence),
    exportEvidence: evidenceForSymbol(base.symbol, 'export', evidence),
  }));
}

function exposureClass(level: 'Direct' | 'Secondary' | 'Limited') {
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
  evidence = {},
}: {
  taiwanProb: number;
  gridSeverity: number;
  embargoBreadth: number;
  livePrices?: Record<string, { price: number; changePct: number }>;
  evidence?: EvidenceInput;
}) {
  const derivedExposure = derivePortfolioExposure(evidence);

  const totalInvested = PORTFOLIO_POSITIONS.reduce((sum, position) => sum + position.investedValue, 0);
  const portfolioRows = derivedExposure.map((exposure) => {
    const position = PORTFOLIO_POSITIONS.find((item) => item.symbol === exposure.symbol);
    const live = livePrices[exposure.symbol];
    const currentValue = live?.price != null && position
      ? live.price * position.quantity
      : position?.investedValue ?? 0;
    const portfolioWeight = totalInvested ? ((position?.investedValue ?? 0) / totalInvested) * 100 : 0;
    const sensitivity = Math.round(
      taiwanProb * 0.5 * exposureFactor(exposure.taiwan) +
      gridSeverity * 0.25 * exposureFactor(exposure.power) +
      embargoBreadth * 0.25 * exposureFactor(exposure.export)
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
        <table className="w-full min-w-[900px] text-[10px] font-mono">
          <thead className="text-white/30 uppercase tracking-wider">
            <tr>
              <th className="text-left p-2">Holding</th>
              <th className="text-right p-2">Portfolio wt.</th>
              <th className="text-center p-2">TSMC</th>
              <th className="text-center p-2">Power</th>
              <th className="text-center p-2">Export</th>
              <th className="text-right p-2">Sensitivity</th>
              <th className="text-right p-2">Weighted contribution</th>
            </tr>
          </thead>
          <tbody>
            {portfolioRows.map((row) => (
              <tr key={row.symbol} className="border-t border-white/5">
                <td className="p-2 font-black text-white">{row.symbol}</td>
                <td className="p-2 text-right text-white/60">{row.portfolioWeight.toFixed(1)}%</td>
                <td className="p-2 text-center"><EvidenceExposurePill level={row.taiwanEvidence.level} basis={row.taiwanEvidence.basis} /></td>
                <td className="p-2 text-center"><EvidenceExposurePill level={row.powerEvidence.level} basis={row.powerEvidence.basis} /></td>
                <td className="p-2 text-center"><EvidenceExposurePill level={row.exportEvidence.level} basis={row.exportEvidence.basis} /></td>
                <td className="p-2 text-right font-black text-white">{row.sensitivity}/100</td>
                <td className="p-2 text-right text-cyan-300 font-bold">{row.weightedContribution.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[9px] text-white/25 font-mono mt-3">
        Formula: 50% TSMC + 25% power + 25% export, multiplied by Direct=1.00, Secondary=0.55, Limited=0.20. Exposure levels are derived from portfolio metadata plus matching contract/news evidence; peer exposure can lift Limited to Secondary. Portfolio weighting uses invested capital. This remains a sensitivity index, not a return forecast.
      </div>
    </div>
  );
}

function ExposurePill({ level }: { level: ExposureLevel }) {
  return (
    <span className={'inline-flex px-2 py-1 rounded border text-[9px] uppercase font-bold ' + exposureClass(level)}>
      {level}
    </span>
  );
}

function EvidenceExposurePill({ level, basis }: { level: ExposureLevel; basis: string }) {
  return (
    <span title={'Evidence basis: ' + basis} className={'inline-flex px-2 py-1 rounded border text-[9px] uppercase font-bold ' + exposureClass(level)}>
      {level}
    </span>
  );
}

function PortfolioExposureMatrix({ evidence = {} }: { evidence?: EvidenceInput }) {
  const derivedExposure = derivePortfolioExposure(evidence);
  return (

  return (
    <div className="bg-[#15181E]/30 border border-white/10 rounded-2xl p-5">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-white">Portfolio Exposure Matrix</h3>
          <p className="text-[10px] text-white/35 mt-1 font-mono">
            Exposure is derived from portfolio metadata and matched live contract/news evidence. Missing company-specific evidence is not treated as direct exposure.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[9px] font-mono uppercase">
          <span className="px-2 py-1 rounded border border-rose-500/20 bg-rose-500/10 text-rose-300">Direct</span>
          <span className="px-2 py-1 rounded border border-amber-500/20 bg-amber-500/10 text-amber-300">Secondary</span>
          <span className="px-2 py-1 rounded border border-white/10 bg-white/5 text-white/40">Limited</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[10px] font-mono">
          <thead className="text-white/30 uppercase tracking-wider">
            <tr>
              <th className="text-left p-2">Holding</th>
              <th className="text-center p-2">TSMC disruption</th>
              <th className="text-center p-2">Power shortfall</th>
              <th className="text-center p-2">AI-chip export controls</th>
            </tr>
          </thead>
          <tbody>
            {derivedExposure.map((row) => (
              <tr key={row.symbol} className="border-t border-white/5">
                <td className="p-2 font-black text-white">{row.symbol}</td>
                <td className="p-2 text-center"><EvidenceExposurePill level={row.taiwanEvidence.level} basis={row.taiwanEvidence.basis} /></td>
                <td className="p-2 text-center"><EvidenceExposurePill level={row.powerEvidence.level} basis={row.powerEvidence.basis} /></td>
                <td className="p-2 text-center"><EvidenceExposurePill level={row.exportEvidence.level} basis={row.exportEvidence.basis} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MacroPolitics({ liveRisks, livePrices = {}, contracts = [], news = [], congressTrades = [] }: MacroPoliticsProps) {
  const [taiwanProb, setTaiwanProb] = useState<number>(15);
  const [gridSeverity, setGridSeverity] = useState<number>(30);
  const [embargoBreadth, setEmbargoBreadth] = useState<number>(25);

  const activeRisks = liveRisks || [];

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
          <span className="text-[9px] uppercase tracking-[0.2em] opacity-60 font-mono font-black block">Calculated System Stress Score</span>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="text-5xl font-black font-mono">{threatScore} / 100</span>
            <span className="text-[11px] font-black tracking-widest uppercase">{verdict.label}</span>
          </div>
          <p className="text-[9px] text-white/40 font-mono mt-2">50% TSMC disruption + 25% power grid + 25% export controls. Values are scenario inputs, not forecasts.</p>
        </div>
        <div className="flex items-start gap-2 max-w-md text-[10px] text-white/40 leading-normal">
          <AlertCircle className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
          <span>Adjust the scenario sliders below to recalculate the score.</span>
        </div>
      </div>

      <PortfolioExposureMatrix evidence={{ contracts, news, congressTrades }} />

      <PortfolioScenarioSensitivity
        taiwanProb={taiwanProb}
        gridSeverity={gridSeverity}
        embargoBreadth={embargoBreadth}
        livePrices={livePrices}
        evidence={{ contracts, news, congressTrades }}
      />

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
                    {r.geminiImpactSummary && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold uppercase tracking-wider">
                        <Sparkles className="w-2.5 h-2.5 mr-1" />
                        Live Analysis
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-white/60 leading-relaxed">
                  {r.description}
                </p>

                {r.geminiImpactSummary && (
                  <div className="mt-2 p-2.5 bg-emerald-500/5 border border-emerald-500/10 rounded-lg text-[10px] text-[#A7F3D0] font-mono leading-relaxed font-normal">
                    <span className="text-[8px] uppercase tracking-wider text-emerald-400/70 font-black block mb-1">🤖 Gemini Sector Impact Summary</span>
                    {r.geminiImpactSummary}
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
