import { useState, useEffect } from 'react';
import { ShieldAlert, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';
import { MacroRisk } from '../types';

interface MacroPoliticsProps {
  liveRisks?: MacroRisk[];
}



const PORTFOLIO_EXPOSURE = [
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

function exposureClass(level: 'Direct' | 'Secondary' | 'Limited') {
  if (level === 'Direct') return 'bg-rose-500/10 text-rose-300 border-rose-500/20';
  if (level === 'Secondary') return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
  return 'bg-white/5 text-white/40 border-white/10';
}

function PortfolioExposureMatrix() {
  return (
    <div className="bg-[#15181E]/30 border border-white/10 rounded-2xl p-5">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-white">Portfolio Exposure Matrix</h3>
          <p className="text-[10px] text-white/35 mt-1 font-mono">
            Scenario exposure across your 10 held positions. This is an internal exposure lens, not a probability forecast.
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
            {PORTFOLIO_EXPOSURE.map((row) => (
              <tr key={row.symbol} className="border-t border-white/5">
                <td className="p-2 font-black text-white">{row.symbol}</td>
                <td className="p-2 text-center"><span className={'inline-flex px-2 py-1 rounded border text-[9px] uppercase font-bold ' + exposureClass(row.taiwan)}>{row.taiwan}</span></td>
                <td className="p-2 text-center"><span className={'inline-flex px-2 py-1 rounded border text-[9px] uppercase font-bold ' + exposureClass(row.power)}>{row.power}</span></td>
                <td className="p-2 text-center"><span className={'inline-flex px-2 py-1 rounded border text-[9px] uppercase font-bold ' + exposureClass(row.export)}>{row.export}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MacroPolitics({ liveRisks }: MacroPoliticsProps) {
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
      <div className="flex flex-col space-y-1 md:space-y-2 border-b border-white/10 pb-4">
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

      <PortfolioExposureMatrix />

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
