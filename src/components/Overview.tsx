import { useState, useEffect } from 'react';
import { Cpu, Server, Activity, ArrowRight, ShieldAlert, BadgeInfo } from 'lucide-react';
import { AppConfig, formatPrice, formatPct, fetchLiveQuote, getOverviewFavorites } from '../utils';
import DecisionImpactCenter from './DecisionImpactCenter';
import { STOCK_METADATA } from '../data';

type OverviewLivePrice = {
  price: number;
  changePct: number;
  provider?: string;
  retrievedAt?: string;
  marketTime?: string | null;
  asOf?: string | null;
  stale?: boolean;
};

type OverviewNews = {
  title?: string;
  url?: string;
  source?: string;
  date?: string | null;
};

interface OverviewProps {
  config: AppConfig;
  onNavigate: (view: string) => void;
  livePrices?: Record<string, OverviewLivePrice>;
  news?: OverviewNews[];
  timestamp?: number;
  evidenceAvailability?: Record<string, any>;
}

// Flowchart nodes dictionary with rich informational metrics
const FLOWCHART_NODES: Record<string, {
  title: string;
  role: string;
  plain: string;
  layman: string;
  metrics: { k: string; v: string }[];
  actionText: string;
  actionView: string;
}> = {
  all: {
    title: 'AI Infrastructure Supply Chain',
    role: 'The Hardware-to-Software Highway',
    plain: 'This interactive map models how capital, energy, and physical hardware flow through the AI ecosystem. Silicon design houses rely on memory/storage providers; cloud-builders package raw chips with regional power; enterprise platforms leverage cloud compute to scale software products. Click any node to inspect detailed commercial relationships.',
    layman: 'Think of this entire supply chain like a digital city: Micron & SanDisk provide the concrete and roads (memory and storage); NVIDIA & AMD build the high-speed engines (processors); Nebius & Digi Power X build the massive utility systems and warehouses (supercomputer cloud hosting); and Meta, Microsoft, Google, & ServiceNow rent these spaces to build and run the actual software applications. They all rely on each other to survive and profit!',
    metrics: [
      { k: 'Physical Hardware', v: 'NVIDIA, AMD, Micron, SanDisk, AMPG' },
      { k: 'Infrastructure Hosts', v: 'Nebius & Digi Power X' },
      { k: 'Enterprise Platforms', v: 'Microsoft, Google, ServiceNow, Meta' }
    ],
    actionText: 'Go to Progress Tracker',
    actionView: 'tracker'
  },
  mu: {
    title: 'Micron Technology (MU)',
    role: 'High-Bandwidth Memory (HBM)',
    plain: 'Micron designs the ultra-fast HBM3E memory stacked around premium AI processors. Because deep learning demands high data rates, fast memory prevents massive silicon blocks from idling, making Micron a critical bottleneck supplier.',
    layman: 'High-speed memory behaves like lanes on a highway. Super-fast AI chips (like NVIDIA\'s) are like race cars; without Micron\'s high-bandwidth memory lanes to feed them data, they get stuck in traffic and idle. This makes Micron a critical supplier that every chipmaker needs.',
    metrics: [
      { k: 'Core Silicon', v: '24GB / 36GB HBM3E stacks' },
      { k: 'Key Clients', v: 'NVIDIA Blackwell, AMD Instinct MI325X' },
      { k: 'Bottleneck Level', v: 'Severe; entire wafer lines booked out through 2026' }
    ],
    actionText: 'View Congress Trading Logs',
    actionView: 'congress'
  },
  sndk: {
    title: 'SanDisk / WD Enterprise',
    role: 'High-Capacity SSDs',
    plain: 'SanDisk supplies deep-learning SSD arrays that house multi-terabyte training sets. Fast data load times prevent cluster starvation during multi-week training runs.',
    layman: 'AI models learn by reading billions of text files, images, and documents. SanDisk builds the physical enterprise "libraries" (high-capacity, ultra-fast SSD arrays) where this massive learning material is stored. Rapid drive speeds prevent expensive chips from waiting for data.',
    metrics: [
      { k: 'Primary Tech', v: 'PCIe Gen5 Enterprise NVMe SSDs' },
      { k: 'Storage Capacity', v: '30.72TB per blade unit' },
      { k: 'AI Role', v: 'Pre-training raw data repositories' }
    ],
    actionText: 'View Macro Risk Signals',
    actionView: 'macro'
  },
  ampg: {
    title: 'AmpliTech Group (AMPG)',
    role: 'Cellular Signal Radio Hardware',
    plain: 'AmpliTech constructs specialized low-noise amplifiers. While they collaborated with NVIDIA for an AI-RAN (Radio Access Network) telecom model, they do not provide data center compute chips, making them a thematic play rather than a direct host supplier.',
    layman: 'They design precision wireless amplifiers. While they collaborated with NVIDIA to demonstrate futuristic, AI-driven cellular towers (AI-RAN), they do not feed the raw computing cloud itself, making them an indirect, thematic play.',
    metrics: [
      { k: 'NVIDIA Alignment', v: 'AI-RAN telecom software demo' },
      { k: 'Core Tech', v: 'O-RAN 64T64R massive MIMO modules' },
      { k: 'Supplier Status', v: 'Indirect; high RF telecom niche' }
    ],
    actionText: 'View Settings Profile',
    actionView: 'settings'
  },
  nvda: {
    title: 'NVIDIA Corp (NVDA)',
    role: 'AI Chip & Software Monopoly',
    plain: 'NVIDIA stands as the premier silicon design powerhouse. They hold strategic equity blocks (including $2B in Nebius) to lock in key infrastructure hosts, securing long-term software integrations (CUDA) at scale.',
    layman: 'The undisputed heart of the AI boom. They design the premium chips ("brains") and write the mandatory software (CUDA) that runs them. By investing in host providers like Nebius, NVIDIA guarantees a dedicated customer base that is locked into their technology ecosystem.',
    metrics: [
      { k: 'Host Stake', v: '$2.0B strategic equity in Nebius' },
      { k: 'Flagship Nodes', v: 'H200, Blackwell GB200, Vera Rubin' },
      { k: 'Ecosystem Lock', v: 'CUDA API proprietary software suite' }
    ],
    actionText: 'See Build-out Progress Tracker',
    actionView: 'tracker'
  },
  amd: {
    title: 'Advanced Micro Devices (AMD)',
    role: 'The Chief Silicon Challenger',
    plain: 'AMD designs the Instinct chip family, positioning themselves as the primary public-market competitor to NVIDIA. Cloud builders buy AMD hardware to lower overall capex and maintain negotiating leverage.',
    layman: 'The essential challenger. They design rival chips so that tech giants (like Microsoft) have an alternative supplier. This competition gives buyers leverage to negotiate better prices and prevents NVIDIA from holding an absolute monopoly.',
    metrics: [
      { k: 'Primary Accelerator', v: 'Instinct MI300X & MI325X platforms' },
      { k: 'Software Solution', v: 'ROCm open-source API stack' },
      { k: 'Major Partners', v: 'Microsoft Azure, Oracle Cloud' }
    ],
    actionText: 'Check Congressional Trades',
    actionView: 'congress'
  },
  nbis: {
    title: 'Nebius Group N.V. (NBIS)',
    role: 'Large-Cap AI Neocloud',
    plain: 'Nebius functions as a specialized supercomputer landlord. They procure thousands of scarce NVIDIA GPUs, configure massive high-density clusters, and lease them on long-term contracts to mega-cap clients.',
    layman: 'A specialized supercomputer landlord. They buy thousands of scarce, expensive NVIDIA chips, cluster them together with massive power grids, and lease them on long-term contracts to tech giants like Meta. This saves Meta from spending years and billions building their own physical datacenters.',
    metrics: [
      { k: '★ Anchor Mover', v: 'Meta $27.0B Dedicated Lease' },
      { k: 'Azure Partnership', v: '$19.4B 5-year New Jersey capacity deal' },
      { k: 'Connected Scale', v: '170MW active (targeting 800MW-1GW)' }
    ],
    actionText: 'Inspect Contracts Ledger',
    actionView: 'contracts'
  },
  dgxx: {
    title: 'Digi Power X Inc. (DGXX)',
    role: 'Small-Cap Power-to-Compute Host',
    plain: 'Digi Power X is converting legacy energy assets into GPU hosting environments. With secured power lines, they build localized clusters to attract AI developers seeking short queues and low latency.',
    layman: 'An energy-to-compute converter. They take local power infrastructure and convert it into high-density computer centers. By offering secure power, they attract chip developers like Cerebras and rent bare-metal Blackwell servers to custom AI companies like SubQ.',
    metrics: [
      { k: '★ Anchor Mover', v: 'Cerebras Systems $2.5B colocation deal' },
      { k: 'SubQ AI Contract', v: '$19.6M Blackwell bare-metal lease' },
      { k: 'Columbiana AL Campus', v: '40MW capacity under build-out' }
    ],
    actionText: 'View Build-out Milestones',
    actionView: 'tracker'
  },
  meta: {
    title: 'Meta Platforms (META)',
    role: 'Open-Weights Model Developer',
    plain: 'Meta trains and hosts the open Llama model family. To offset the time needed to construct proprietary datacenters, they lease massive blocks of Nebius\'s premium GPU capacity.',
    layman: 'The open-source AI developer. Since building giant datacenters takes years, Meta leases massive chunks of Nebius\'s already-built supercomputer cloud. This allows Meta to train next-generation Llama models immediately to stay ahead of closed competitors.',
    metrics: [
      { k: 'Nebius Lease Value', v: 'Up to $27.0B committed over 5 years' },
      { k: 'Core Target', v: 'Vera Rubin and Blackwell clusters' },
      { k: 'Model Suite', v: 'Llama 3.1 405B & Llama 4 development' }
    ],
    actionText: 'Inspect Contracts Ledger',
    actionView: 'contracts'
  },
  msft: {
    title: 'Microsoft Corp (MSFT)',
    role: 'AI Hyperscaler & Software Platform',
    plain: 'Microsoft anchors GenAI scale via Azure, hosting OpenAI workloads and Copilot. They secure additional neocloud capacity from Nebius to supplement internal supply constraints.',
    layman: 'The commercial pioneer of AI. They integrate virtual assistants (Copilot) into Office and Windows. Because demand is growing faster than their own datacenters can expand, Microsoft leases billions in external cloud capacity from Nebius and Digi Power X to keep services running smoothly.',
    metrics: [
      { k: 'Nebius Lease Value', v: '$19.4B (5 years in Vineland, NJ)' },
      { k: 'In-House Silicon', v: 'Azure Maia 100 deep-learning chips' },
      { k: 'Energy Grid', v: 'Secured multi-gigawatt nuclear and solar PPAs' }
    ],
    actionText: 'Inspect Contracts Ledger',
    actionView: 'contracts'
  },
  goog: {
    title: 'Alphabet Inc. (Google)',
    role: 'Dual-Silicon AI Platform',
    plain: 'Google utilizes a hybrid model, deploying extensive internal TPU processors alongside premium NVIDIA platforms. They lease regional compute blocks to power global Gemini API scale.',
    layman: 'A dual-strategy giant. They design their own custom Google processors (TPUs) to bypass paying NVIDIA\'s high profit margins, but they also buy extensive NVIDIA equipment. They rent extra cloud capacity to keep Gemini processing billions of user questions daily.',
    metrics: [
      { k: 'Proprietary Silicon', v: 'TPU v5p and TPU v6 (Trillium)' },
      { k: 'Primary Model', v: 'Gemini 1.5 Pro & Ultra (2M Context)' },
      { k: 'Enterprise Portal', v: 'Google Vertex AI developer dashboard' }
    ],
    actionText: 'Check Congressional Trades',
    actionView: 'congress'
  },
  now: {
    title: 'ServiceNow (NOW)',
    role: 'Enterprise Workflow Agents',
    plain: 'ServiceNow integrates LLMs directly into enterprise systems. Operating primarily at the software level, they lease hyperscale cloud layers (Azure/GCP) to feed active client sessions.',
    layman: 'The office automatons. They build specialized virtual workers to automate IT support, HR, and customer service. Since they run purely as software, they pay Microsoft and Google for cloud hosting space, meaning ServiceNow\'s growth directly boosts cloud revenues.',
    metrics: [
      { k: 'Flagship Software', v: 'Now Assist workflow automation' },
      { k: 'Hardware Proxy', v: 'Relies on downstream Microsoft/Google clouds' },
      { k: 'SaaS Expansion', v: 'IT, HR, and Customer Service agent loops' }
    ],
    actionText: 'Manage Watchlist Targets',
    actionView: 'watchlist'
  },
  cere: {
    title: 'Cerebras Systems',
    role: 'Wafer-Scale Compute Challenger',
    plain: 'Cerebras manufactures massive wafer-scale processors containing trillions of transistors. They lease secure power and space from Digi Power X to deploy high-density training services.',
    layman: 'A radical hardware innovator. They build giant computer processors the size of a dinner plate. Rather than managing physical warehouses, they lease space and secure power from Digi Power X to host their service, creating a highly efficient symbiotic relationship.',
    metrics: [
      { k: 'Colocation Lease', v: 'Up to $2.5B over 10 years (Alabama campus)' },
      { k: 'Primary Hardware', v: 'Wafer-Scale Engine 3 (WSE-3)' },
      { k: 'Stock Reaction', v: 'DGXX popped +29% on contract signing day' }
    ],
    actionText: 'View Progress Milestones',
    actionView: 'tracker'
  },
  subq: {
    title: 'SubQ AI',
    role: 'Enterprise AI Operations',
    plain: 'SubQ AI hosts enterprise-grade deep learning workloads. Rather than managing physical sites, they rent bare-metal Blackwell nodes from Digi Power X\'s NeoCloudz platform.',
    layman: 'A custom AI operator for corporations. They help companies run advanced data analytics but do not own physical servers. Instead, they rent premium bare-metal NVIDIA Blackwell chips directly from Digi Power X\'s NeoCloudz platform to run their models.',
    metrics: [
      { k: 'Compute Value', v: '$19.6M lease over 24 months' },
      { k: 'Upfront Deposit', v: '$2.95M cash collateral' },
      { k: 'Compute Focus', v: 'Blackwell GPU bare-metal operations' }
    ],
    actionText: 'Inspect Contracts Ledger',
    actionView: 'contracts'
  }
};

export default function Overview({ config, onNavigate, livePrices = {}, news = [], timestamp, evidenceAvailability = {} }: OverviewProps) {
  const overviewFavorites = getOverviewFavorites(config);
  const [quotes, setQuotes] = useState<Record<string, any>>({});
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('all');
  const [flowFilter, setFlowFilter] = useState<'all' | 'hardware' | 'cloud' | 'enterprise'>('all');

  // Prefer the app-wide quote feed and only fetch a missing symbol as a fallback.
  // This avoids a second market-data truth while preserving standalone usage.

  useEffect(() => {
    let active = true;
    async function fetchAll() {
      setLoadingQuotes(true);
      const fetched: Record<string, any> = {};
      const symbols = overviewFavorites;
      if (symbols.length === 0) symbols.push('NVDA', 'NBIS', 'DGXX');

      for (const sym of symbols) {
        const shared = livePrices[sym];
        if (shared && Number.isFinite(shared.price) && Number.isFinite(shared.changePct)) {
          fetched[sym] = { ok: true, data: shared };
          continue;
        }
        try {
          const res = await fetchLiveQuote(sym, config.finnhubKey, true);
          fetched[sym] = { ok: true, data: res };
        } catch (err: any) {
          fetched[sym] = { ok: false, error: err.message || 'Error loading' };
        }
      }

      if (active) {
        setQuotes(fetched);
        setLoadingQuotes(false);
      }
    }
    fetchAll();
    const interval = setInterval(fetchAll, 60000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [overviewFavorites.join(','), config.finnhubKey, livePrices]);

  // Selected relationships mapping for visual highlighting
  const getRelations = (id: string) => {
    const graphRelations: Record<string, { up: string[]; down: string[] }> = {
      mu: { up: [], down: ['nvda', 'amd'] },
      sndk: { up: [], down: ['nvda', 'amd'] },
      ampg: { up: [], down: ['nvda', 'amd'] },
      nvda: { up: ['mu', 'sndk', 'ampg'], down: ['nbis', 'dgxx'] },
      amd: { up: ['mu', 'sndk', 'ampg'], down: ['nbis', 'dgxx'] },
      nbis: { up: ['nvda', 'amd'], down: ['meta', 'msft'] },
      dgxx: { up: ['nvda', 'amd'], down: ['msft', 'goog', 'cere', 'subq'] },
      meta: { up: ['nbis'], down: [] },
      msft: { up: ['nbis', 'dgxx'], down: ['now'] },
      goog: { up: ['dgxx'], down: ['now'] },
      now: { up: ['msft', 'goog'], down: [] },
      cere: { up: ['dgxx'], down: [] },
      subq: { up: ['dgxx'], down: [] }
    };
    return graphRelations[id] || { up: [], down: [] };
  };

  const isHighlighted = (id: string) => {
    if (selectedNodeId === 'all') return false;
    if (selectedNodeId === id) return true;
    const rels = getRelations(selectedNodeId);
    return rels.up.includes(id) || rels.down.includes(id);
  };

  const isPathHighlighted = (fromId: string, toId: string) => {
    if (selectedNodeId === 'all') return false;
    if (selectedNodeId === fromId && getRelations(fromId).down.includes(toId)) return true;
    if (selectedNodeId === toId && getRelations(toId).up.includes(fromId)) return true;
    return false;
  };

  const activeNodeInfo = FLOWCHART_NODES[selectedNodeId] || FLOWCHART_NODES.all;

  return (
    <div className="space-y-6" id="overview-view">
      {/* Page Header */}
      <div className="aiw-page-header flex flex-col space-y-1 md:space-y-2 border-b border-white/10 pb-4">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Section 01 / Markets</span>
        <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase italic text-white">
          AI Infrastructure Ecosystem Overview
        </h1>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <p className="text-xs text-white/60 max-w-3xl leading-relaxed">
            Live quotes, contracts, policy, congressional disclosures and infrastructure relationships in one decision-oriented view.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[9px] font-mono uppercase tracking-wider text-white/35">
            {timestamp && <span className="rounded-lg border border-white/10 bg-white/[.02] px-2.5 py-1.5">SYNCED {new Date(timestamp).toLocaleTimeString()}</span>}
            <button type="button" onClick={() => onNavigate('health')} className="rounded-lg border border-cyan-400/15 bg-cyan-400/[.04] px-2.5 py-1.5 text-cyan-200 hover:bg-cyan-400/[.08]">Open data health</button>
          </div>
        </div>
      </div>

      <DecisionImpactCenter onNavigate={onNavigate} />

      {/* Daily landing summary: the first thing users see is what changed since the prior close. */}
      <section className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[.025] p-4" aria-labelledby="daily-summary-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300">Daily portfolio + market summary</div>
            <h2 id="daily-summary-heading" className="text-xl font-black mt-1">What changed since yesterday</h2>
            <p className="text-[11px] text-white/55 mt-1">Current daily moves versus the previous market close. This is observed market context, not a forecast.</p>
          </div>
          <button type="button" onClick={() => onNavigate('portfolio')} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-mono uppercase text-white/70 hover:text-white hover:bg-white/5">Open portfolio</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
          {(Object.keys(livePrices).length
            ? (Object.entries(livePrices) as Array<[string, OverviewLivePrice]>).filter(([, item]) => Number.isFinite(item?.changePct))
            : (Object.entries(quotes) as Array<[string, any]>).filter(([, item]) => item?.ok && Number.isFinite(item?.data?.changePct)).map(([symbol, item]) => [symbol, item.data] as [string, OverviewLivePrice]))
            .sort((a,b) => Math.abs(b[1].changePct) - Math.abs(a[1].changePct))
            .slice(0,3)
            .map(([symbol,item]) => {
              const move = Number(item.changePct);
              return <div key={symbol} className="rounded-xl border border-white/10 bg-black/10 p-3">
                <div className="flex items-center justify-between"><span className="text-sm font-black">{symbol}</span><span className={move >= 0 ? 'text-[11px] font-mono text-emerald-300' : 'text-[11px] font-mono text-rose-300'}>{move >= 0 ? '▲ +' : '▼ −'}{Math.abs(move).toFixed(2)}%</span></div>
                <div className="text-[10px] text-white/55 mt-1">{item.stale ? 'Last known quote' : 'Previous close → current quote'}</div>
              </div>;
            })}
        </div>
        {!Object.keys(livePrices).length && !Object.values(quotes).some((item: any) => item?.ok) && <div className="mt-3 text-[11px] text-white/50">Waiting for the first live quote refresh.</div>}
      </section>

      {/* Layman Connections & Benefits Master Guide */}
      <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-white/10 rounded-2xl p-5 md:p-6 space-y-4">
        <div className="flex items-center space-x-2.5">
          <Cpu className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-black uppercase tracking-wider text-white">How Every Stock Connects (In Plain English)</h2>
        </div>
        <p className="text-xs text-white/70 leading-relaxed max-w-4xl">
          The AI boom behaves like a giant digital city. Instead of independent companies, each stock is a specific vendor on a single, high-speed highway. They form a seamless cycle where one company's raw output is another's critical raw material:
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
          <div className="bg-[#15181E]/60 border border-white/5 rounded-xl p-4 space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-pink-400 font-bold block">01 / Foundation (Suppliers)</span>
            <h3 className="text-sm font-black text-white uppercase">MU · SNDK · AMPG</h3>
            <p className="text-[11px] text-white/60 leading-normal">
              <strong>The Role:</strong> They provide the raw material "bricks & roads" (ultra-fast memory, deep SSD storage, and signal amplifiers).
            </p>
            <p className="text-[11px] text-emerald-400 leading-normal">
              <strong>Benefit of Connection:</strong> Ensures high-speed chips aren't left waiting for slow data feeds, maximizing processor output.
            </p>
          </div>

          <div className="bg-[#15181E]/60 border border-white/5 rounded-xl p-4 space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold block">02 / The Brains (Designers)</span>
            <h3 className="text-sm font-black text-white uppercase">NVDA · AMD</h3>
            <p className="text-[11px] text-white/60 leading-normal">
              <strong>The Role:</strong> They invent the ultra-complex computing "engines" (GPUs) that calculate neural logic patterns.
            </p>
            <p className="text-[11px] text-emerald-400 leading-normal">
              <strong>Benefit of Connection:</strong> Provides the fundamental thinking engines that are packaged together inside giant computer centers.
            </p>
          </div>

          <div className="bg-[#15181E]/60 border border-white/5 rounded-xl p-4 space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-blue-400 font-bold block">03 / Landlords (Hosts)</span>
            <h3 className="text-sm font-black text-white uppercase">NBIS · DGXX</h3>
            <p className="text-[11px] text-white/60 leading-normal">
              <strong>The Role:</strong> "Supercomputer Landlords". They buy thousands of Tier 2 chips, bundle them with extreme power, and lease them on long-term contracts.
            </p>
            <p className="text-[11px] text-emerald-400 leading-normal">
              <strong>Benefit of Connection:</strong> Saves software developers from spending years and billions of dollars building physical infrastructure themselves.
            </p>
          </div>

          <div className="bg-[#15181E]/60 border border-white/5 rounded-xl p-4 space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-rose-400 font-bold block">04 / Builders (Applications)</span>
            <h3 className="text-sm font-black text-white uppercase">META · MSFT · GOOG · NOW</h3>
            <p className="text-[11px] text-white/60 leading-normal">
              <strong>The Role:</strong> "AI Architects". They rent Tier 3 cloud spaces to train next-gen models and deploy AI agents for corporations and consumers.
            </p>
            <p className="text-[11px] text-emerald-400 leading-normal">
              <strong>Benefit of Connection:</strong> Creates the consumer services (like ChatGPT & Llama) that bring AI utility to the world and fund the entire chain.
            </p>
          </div>
        </div>
      </div>

      {/* API Key Notice */}
      {!config.finnhubKey && (
        <div className="flex items-start space-x-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 md:p-4 text-amber-300">
          <BadgeInfo className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div className="text-xs leading-relaxed">
            <span className="font-bold text-amber-200">SERVER MARKET FEED ACTIVE.</span> Quotes use the server-side market feed when no optional Finnhub key is configured. <button onClick={() => onNavigate('settings')} className="text-amber-200 underline hover:text-white font-bold cursor-pointer">Settings panel</button>
          </div>
        </div>
      )}

      {/* Quote Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {overviewFavorites.map((sym) => {
          const q = quotes[sym];
          const name = STOCK_METADATA[sym]?.name || sym;
          
          if (loadingQuotes) {
            return (
              <div key={sym} className="bg-[#15181E]/40 border border-white/15 p-4 rounded-xl flex flex-col space-y-3 animate-pulse">
                <div className="h-4 bg-white/5 rounded w-1/2"></div>
                <div className="h-6 bg-white/5 rounded w-1/3"></div>
                <div className="h-3 bg-white/5 rounded w-3/4"></div>
              </div>
            );
          }

          if (!q || !q.ok) {
            return (
              <div key={sym} className="bg-[#15181E]/40 border border-white/15 p-4 rounded-xl flex flex-col space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{sym}</span>
                    <h3 className="text-sm font-bold text-white/80 truncate">{name}</h3>
                  </div>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 bg-rose-500/15 text-rose-400 border border-rose-500/20 rounded">Error</span>
                </div>
                <div className="text-xs text-white/40 py-2 leading-relaxed">
                  {q?.error || 'Rate limit or loading failure.'}
                </div>
              </div>
            );
          }

          const { price, changePct, low, high, prevClose, source } = q.data;
          const isUp = changePct >= 0;

          return (
            <div key={sym} className="bg-[#15181E] border border-white/10 p-5 rounded-xl flex flex-col space-y-3 hover:border-white/20 transition">
              <div className="flex justify-between items-start">
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest px-2 py-0.5 bg-white/5 border border-white/10 rounded">{sym}</span>
                    <span className="text-[9px] font-mono text-white/40">{source === 'live' ? 'LIVE FEED' : 'UNAVAILABLE'}</span>
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-tight text-white/80 truncate mt-2">{name}</h3>
                </div>
              </div>

              <div className="flex items-baseline space-x-2.5 pt-1">
                <span className="text-3xl font-mono font-bold text-white tracking-tight">${formatPrice(price)}</span>
                <span className={`text-xs font-mono font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isUp ? '▲' : '▼'} {formatPct(changePct)}
                </span>
              </div>

              <div className="flex justify-between items-center text-[9px] font-mono text-white/40 border-t border-white/10 pt-2.5 mt-1">
                <span>RANGE: ${formatPrice(low)} - ${formatPrice(high)}</span>
                <span>PREV CLOSE: ${formatPrice(prevClose)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Interactive Supply Chain Card */}
      <div className="bg-[#15181E]/30 border border-white/10 rounded-2xl overflow-hidden p-5 md:p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold uppercase tracking-wide text-white">Interactive AI Infrastructure Supply Chain</h2>
            <p className="text-xs text-white/40">
              Trace capital and hardware flow. Click any node or connection line to inspect details. ★ marks key contracts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {(['all', 'hardware', 'cloud', 'enterprise'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => {
                  setFlowFilter(filter);
                  if (filter === 'all') {
                    setSelectedNodeId('all');
                  } else if (filter === 'hardware') {
                    setSelectedNodeId('nvda');
                  } else if (filter === 'cloud') {
                    setSelectedNodeId('nbis');
                  } else if (filter === 'enterprise') {
                    setSelectedNodeId('meta');
                  }
                }}
                aria-pressed={flowFilter === filter}
                className={`px-3 py-1.5 rounded border text-xs font-black uppercase tracking-wider transition cursor-pointer ${
                  flowFilter === filter
                    ? 'bg-white text-black border-white'
                    : 'bg-white/5 text-white/60 border-white/10 hover:text-white hover:bg-white/10'
                }`}
              >
                {filter === 'all' && 'All Flows'}
                {filter === 'hardware' && 'Silicon & Hardware'}
                {filter === 'cloud' && 'Cloud & Compute'}
                {filter === 'enterprise' && 'Enterprise AI'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Visual SVG Flowchart Column */}
          <div className="lg:col-span-2 bg-[#0F1115] rounded-xl border border-white/10 p-4 flex items-center justify-center">
            <div className="w-full max-w-[640px] aspect-[640/420]">
              <svg viewBox="0 0 640 420" width="100%" height="100%" className="select-none font-sans text-[10px] font-semibold fill-white/60">
                <defs>
                  <pattern id="flow-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                    <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5"></path>
                  </pattern>
                </defs>

                <rect x="0" y="0" width="640" height="420" className="fill-[#0F1115]" rx="10"></rect>
                <rect x="0" y="0" width="640" height="420" fill="url(#flow-grid)" rx="10"></rect>

                <g className="opacity-40 font-mono uppercase text-[9px] tracking-widest fill-white/40">
                  <text x="22" y="16">Components</text>
                  <text x="372" y="16">AI chips</text>
                  <text x="22" y="108">GPU hosts</text>
                  <text x="22" y="208">Cloud buyers</text>
                  <text x="22" y="318">AI customers</text>
                </g>

                {/* FLOW LINES */}
                {/* Components to Chips */}
                <path d="M 100 42 Q 235 42 370 47" fill="none" stroke={isPathHighlighted('mu', 'nvda') ? '#10B981' : 'rgba(255,255,255,0.1)'} strokeWidth={isPathHighlighted('mu', 'nvda') ? '2' : '1'} className="transition" onClick={() => setSelectedNodeId('nvda')}></path>
                <path d="M 100 42 Q 305 10 510 47" fill="none" stroke={isPathHighlighted('mu', 'amd') ? '#F59E0B' : 'rgba(255,255,255,0.1)'} strokeWidth={isPathHighlighted('mu', 'amd') ? '2' : '1'} className="transition" onClick={() => setSelectedNodeId('amd')}></path>
                <path d="M 200 42 L 370 47" fill="none" stroke={isPathHighlighted('sndk', 'nvda') ? '#10B981' : 'rgba(255,255,255,0.1)'} strokeWidth={isPathHighlighted('sndk', 'nvda') ? '2' : '1'} className="transition" onClick={() => setSelectedNodeId('nvda')}></path>
                <path d="M 200 42 Q 355 20 510 47" fill="none" stroke={isPathHighlighted('sndk', 'amd') ? '#F59E0B' : 'rgba(255,255,255,0.1)'} strokeWidth={isPathHighlighted('sndk', 'amd') ? '2' : '1'} className="transition" onClick={() => setSelectedNodeId('amd')}></path>
                <path d="M 300 42 L 370 47" fill="none" stroke={isPathHighlighted('ampg', 'nvda') ? '#10B981' : 'rgba(255,255,255,0.1)'} strokeWidth={isPathHighlighted('ampg', 'nvda') ? '2' : '1'} className="transition" onClick={() => setSelectedNodeId('nvda')}></path>
                <path d="M 300 42 L 510 47" fill="none" stroke={isPathHighlighted('ampg', 'amd') ? '#F59E0B' : 'rgba(255,255,255,0.1)'} strokeWidth={isPathHighlighted('ampg', 'amd') ? '2' : '1'} className="transition" onClick={() => setSelectedNodeId('amd')}></path>

                {/* Chips to Hosts */}
                <path d="M 420 75 Q 312 97 205 120" fill="none" stroke={isPathHighlighted('nvda', 'nbis') ? '#10B981' : 'rgba(255,255,255,0.1)'} strokeWidth={isPathHighlighted('nvda', 'nbis') ? '2' : '1'} className="transition" onClick={() => setSelectedNodeId('nbis')}></path>
                <path d="M 420 75 L 435 120" fill="none" stroke={isPathHighlighted('nvda', 'dgxx') ? '#3B82F6' : 'rgba(255,255,255,0.1)'} strokeWidth={isPathHighlighted('nvda', 'dgxx') ? '2' : '1'} className="transition" onClick={() => setSelectedNodeId('dgxx')}></path>
                <path d="M 560 75 Q 382 97 205 120" fill="none" stroke={isPathHighlighted('amd', 'nbis') ? '#10B981' : 'rgba(255,255,255,0.1)'} strokeWidth={isPathHighlighted('amd', 'nbis') ? '2' : '1'} className="transition" onClick={() => setSelectedNodeId('nbis')}></path>
                <path d="M 560 75 Q 497 97 435 120" fill="none" stroke={isPathHighlighted('amd', 'dgxx') ? '#3B82F6' : 'rgba(255,255,255,0.1)'} strokeWidth={isPathHighlighted('amd', 'dgxx') ? '2' : '1'} className="transition" onClick={() => setSelectedNodeId('dgxx')}></path>

                {/* Hosts to Buyers */}
                <path d="M 205 175 L 95 220" fill="none" stroke={isPathHighlighted('nbis', 'meta') ? '#06B6D4' : 'rgba(255,255,255,0.1)'} strokeWidth={isPathHighlighted('nbis', 'meta') ? '2' : '1'} className="transition" onClick={() => setSelectedNodeId('meta')}></path>
                <path d="M 205 175 L 315 220" fill="none" stroke={isPathHighlighted('nbis', 'msft') ? '#8B5CF6' : 'rgba(255,255,255,0.1)'} strokeWidth={isPathHighlighted('nbis', 'msft') ? '2' : '1'} className="transition" onClick={() => setSelectedNodeId('msft')}></path>
                <path d="M 435 175 L 315 220" fill="none" stroke={isPathHighlighted('dgxx', 'msft') ? '#8B5CF6' : 'rgba(255,255,255,0.1)'} strokeWidth={isPathHighlighted('dgxx', 'msft') ? '2' : '1'} className="transition" onClick={() => setSelectedNodeId('msft')}></path>
                <path d="M 435 175 L 545 220" fill="none" stroke={isPathHighlighted('dgxx', 'goog') ? '#EF4444' : 'rgba(255,255,255,0.1)'} strokeWidth={isPathHighlighted('dgxx', 'goog') ? '2' : '1'} className="transition" onClick={() => setSelectedNodeId('goog')}></path>

                {/* Hosts to Direct Customers */}
                <path d="M 435 175 Q 265 240 95 330" fill="none" stroke={isPathHighlighted('dgxx', 'cere') ? '#6366F1' : 'rgba(255,255,255,0.1)'} strokeWidth={isPathHighlighted('dgxx', 'cere') ? '2' : '1'} className="transition" onClick={() => setSelectedNodeId('cere')}></path>
                <path d="M 435 175 Q 490 252 545 330" fill="none" stroke={isPathHighlighted('dgxx', 'subq') ? '#F43F5E' : 'rgba(255,255,255,0.1)'} strokeWidth={isPathHighlighted('dgxx', 'subq') ? '2' : '1'} className="transition" onClick={() => setSelectedNodeId('subq')}></path>

                {/* Platforms to Apps */}
                <path d="M 315 270 L 315 330" fill="none" stroke={isPathHighlighted('msft', 'now') ? '#14B8A6' : 'rgba(255,255,255,0.1)'} strokeWidth={isPathHighlighted('msft', 'now') ? '2' : '1'} className="transition" onClick={() => setSelectedNodeId('now')}></path>
                <path d="M 545 270 Q 432 300 320 330" fill="none" stroke={isPathHighlighted('goog', 'now') ? '#14B8A6' : 'rgba(255,255,255,0.1)'} strokeWidth={isPathHighlighted('goog', 'now') ? '2' : '1'} className="transition" onClick={() => setSelectedNodeId('now')}></path>

                {/* NODES GROUP */}
                {/* Micron */}
                <g className={`cursor-pointer group ${isHighlighted('mu') ? 'opacity-100 scale-[1.03]' : selectedNodeId !== 'all' ? 'opacity-45' : ''}`} onClick={() => setSelectedNodeId('mu')}>
                  <rect x="20" y="20" width="80" height="40" rx="4" className="fill-[#15181E] stroke-white/10 hover:stroke-pink-400 stroke transition-all" strokeWidth="1.5"></rect>
                  <text x="60" y="44" className="text-[10px] font-bold text-white/80 fill-white/80 transition-colors group-hover:fill-pink-400" textAnchor="middle">Micron</text>
                </g>

                {/* SanDisk */}
                <g className={`cursor-pointer group ${isHighlighted('sndk') ? 'opacity-100 scale-[1.03]' : selectedNodeId !== 'all' ? 'opacity-45' : ''}`} onClick={() => setSelectedNodeId('sndk')}>
                  <rect x="120" y="20" width="80" height="40" rx="4" className="fill-[#15181E] stroke-white/10 hover:stroke-emerald-400 stroke transition-all" strokeWidth="1.5"></rect>
                  <text x="160" y="44" className="text-[10px] font-bold text-white/80 fill-white/80 transition-colors group-hover:fill-emerald-400" textAnchor="middle">SanDisk</text>
                </g>

                {/* AMPG */}
                <g className={`cursor-pointer group ${isHighlighted('ampg') ? 'opacity-100 scale-[1.03]' : selectedNodeId !== 'all' ? 'opacity-45' : ''}`} onClick={() => setSelectedNodeId('ampg')}>
                  <rect x="220" y="20" width="80" height="40" rx="4" className="fill-[#15181E] stroke-white/10 hover:stroke-amber-500 stroke transition-all" strokeWidth="1.5"></rect>
                  <text x="260" y="44" className="text-[10px] font-bold text-white/80 fill-white/80 transition-colors group-hover:fill-amber-500" textAnchor="middle">AMPG</text>
                </g>

                {/* NVIDIA */}
                <g className={`cursor-pointer group ${isHighlighted('nvda') ? 'opacity-100 scale-[1.03]' : selectedNodeId !== 'all' ? 'opacity-45' : ''}`} onClick={() => setSelectedNodeId('nvda')}>
                  <rect x="370" y="20" width="100" height="50" rx="6" className="fill-[#15181E] stroke-white/15 hover:stroke-emerald-500 stroke transition-all" strokeWidth="2"></rect>
                  <text x="420" y="45" className="text-[11px] font-black text-white fill-white transition-colors group-hover:fill-emerald-400" textAnchor="middle">NVIDIA</text>
                  <text x="420" y="60" className="text-[8px] font-mono tracking-wider fill-white/40" textAnchor="middle">GPUS</text>
                </g>

                {/* AMD */}
                <g className={`cursor-pointer group ${isHighlighted('amd') ? 'opacity-100 scale-[1.03]' : selectedNodeId !== 'all' ? 'opacity-45' : ''}`} onClick={() => setSelectedNodeId('amd')}>
                  <rect x="510" y="20" width="100" height="50" rx="6" className="fill-[#15181E] stroke-white/15 hover:stroke-amber-500 stroke transition-all" strokeWidth="2"></rect>
                  <text x="560" y="45" className="text-[11px] font-black text-white fill-white transition-colors group-hover:fill-amber-400" textAnchor="middle">AMD</text>
                  <text x="560" y="60" className="text-[8px] font-mono tracking-wider fill-white/40" textAnchor="middle">CPUS/GPUS</text>
                </g>

                {/* Nebius */}
                <g className={`cursor-pointer group ${isHighlighted('nbis') ? 'opacity-100 scale-[1.03]' : selectedNodeId !== 'all' ? 'opacity-45' : ''}`} onClick={() => setSelectedNodeId('nbis')}>
                  <rect x="140" y="120" width="130" height="50" rx="6" className="fill-[#15181E] stroke-white/15 hover:stroke-emerald-400 stroke transition-all" strokeWidth="2"></rect>
                  <text x="205" y="142" className="text-[11px] font-black text-emerald-400 fill-emerald-400 transition-colors" textAnchor="middle">Nebius ★</text>
                  <text x="205" y="158" className="text-[8px] font-mono tracking-wider fill-white/40" textAnchor="middle">LARGE NEOCLOUD</text>
                </g>

                {/* Digi Power X */}
                <g className={`cursor-pointer group ${isHighlighted('dgxx') ? 'opacity-100 scale-[1.03]' : selectedNodeId !== 'all' ? 'opacity-45' : ''}`} onClick={() => setSelectedNodeId('dgxx')}>
                  <rect x="370" y="120" width="130" height="50" rx="6" className="fill-[#15181E] stroke-white/15 hover:stroke-blue-400 stroke transition-all" strokeWidth="2"></rect>
                  <text x="435" y="142" className="text-[11px] font-black text-blue-400 fill-blue-400 transition-colors" textAnchor="middle">Digi Power X ★</text>
                  <text x="435" y="158" className="text-[8px] font-mono tracking-wider fill-white/40" textAnchor="middle">SMALL NEOCLOUD</text>
                </g>

                {/* Meta */}
                <g className={`cursor-pointer group ${isHighlighted('meta') ? 'opacity-100 scale-[1.03]' : selectedNodeId !== 'all' ? 'opacity-45' : ''}`} onClick={() => setSelectedNodeId('meta')}>
                  <rect x="40" y="220" width="110" height="45" rx="4" className="fill-[#15181E] stroke-white/10 hover:stroke-cyan-400 stroke transition-all" strokeWidth="1.5"></rect>
                  <text x="95" y="246" className="text-[10px] font-bold text-white/80 fill-white/80 transition-colors group-hover:fill-cyan-400" textAnchor="middle">Meta</text>
                </g>

                {/* Microsoft */}
                <g className={`cursor-pointer group ${isHighlighted('msft') ? 'opacity-100 scale-[1.03]' : selectedNodeId !== 'all' ? 'opacity-45' : ''}`} onClick={() => setSelectedNodeId('msft')}>
                  <rect x="260" y="220" width="110" height="45" rx="4" className="fill-[#15181E] stroke-white/10 hover:stroke-indigo-400 stroke transition-all" strokeWidth="1.5"></rect>
                  <text x="315" y="246" className="text-[10px] font-bold text-white/80 fill-white/80 transition-colors group-hover:fill-indigo-400" textAnchor="middle">Microsoft</text>
                </g>

                {/* Google */}
                <g className={`cursor-pointer group ${isHighlighted('goog') ? 'opacity-100 scale-[1.03]' : selectedNodeId !== 'all' ? 'opacity-45' : ''}`} onClick={() => setSelectedNodeId('goog')}>
                  <rect x="490" y="220" width="110" height="45" rx="4" className="fill-[#15181E] stroke-white/10 hover:stroke-rose-400 stroke transition-all" strokeWidth="1.5"></rect>
                  <text x="545" y="246" className="text-[10px] font-bold text-white/80 fill-white/80 transition-colors group-hover:fill-rose-400" textAnchor="middle">Google</text>
                </g>

                {/* Cerebras */}
                <g className={`cursor-pointer group ${isHighlighted('cere') ? 'opacity-100 scale-[1.03]' : selectedNodeId !== 'all' ? 'opacity-45' : ''}`} onClick={() => setSelectedNodeId('cere')}>
                  <rect x="40" y="330" width="110" height="45" rx="4" className="fill-[#15181E] stroke-white/10 hover:stroke-indigo-400 stroke transition-all" strokeWidth="1.5"></rect>
                  <text x="95" y="356" className="text-[10px] font-black text-indigo-400 fill-indigo-400" textAnchor="middle">Cerebras ★</text>
                </g>

                {/* ServiceNow */}
                <g className={`cursor-pointer group ${isHighlighted('now') ? 'opacity-100 scale-[1.03]' : selectedNodeId !== 'all' ? 'opacity-45' : ''}`} onClick={() => setSelectedNodeId('now')}>
                  <rect x="260" y="330" width="120" height="45" rx="4" className="fill-[#15181E] stroke-white/10 hover:stroke-teal-400 stroke transition-all" strokeWidth="1.5"></rect>
                  <text x="320" y="356" className="text-[10px] font-bold text-white/80 fill-white/80 transition-colors group-hover:fill-teal-400" textAnchor="middle">ServiceNow</text>
                </g>

                {/* SubQ AI */}
                <g className={`cursor-pointer group ${isHighlighted('subq') ? 'opacity-100 scale-[1.03]' : selectedNodeId !== 'all' ? 'opacity-45' : ''}`} onClick={() => setSelectedNodeId('subq')}>
                  <rect x="490" y="330" width="110" height="45" rx="4" className="fill-[#15181E] stroke-white/10 hover:stroke-rose-400 stroke transition-all" strokeWidth="1.5"></rect>
                  <text x="545" y="356" className="text-[10px] font-bold text-white/80 fill-white/80 transition-colors group-hover:fill-rose-400" textAnchor="middle">SubQ AI</text>
                </g>
              </svg>
            </div>
          </div>

          {/* Details Sidebar Column */}
          <div className="bg-[#15181E]/40 rounded-xl border border-white/10 p-4 md:p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-4 max-h-[560px] overflow-y-auto pr-1 aiw-scroll-region">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Node Insight</span>
                  <h3 className="text-base font-black uppercase tracking-tight text-white mt-1">{activeNodeInfo.title}</h3>
                  <span className="text-xs font-mono text-emerald-400 tracking-wider mt-1 block">{activeNodeInfo.role}</span>
                </div>
                {selectedNodeId !== 'all' && (
                  <button
                    onClick={() => setSelectedNodeId('all')}
                    className="text-[10px] font-mono text-white/60 hover:text-white px-2.5 py-1 bg-white/5 rounded border border-white/10 cursor-pointer"
                  >
                    RESET
                  </button>
                )}
              </div>

              <p className="text-xs text-white/60 leading-relaxed pt-3 border-t border-white/10">
                {activeNodeInfo.plain}
              </p>

              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3 space-y-1">
                <span className="text-[9px] font-mono uppercase tracking-[0.1em] text-[#10B981] font-black flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5" /> Layman Connection &amp; Benefit
                </span>
                <p className="text-xs text-white/80 leading-normal">
                  {activeNodeInfo.layman}
                </p>
              </div>

              <div className="space-y-3 pt-4">
                <h4 className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/40">Key Metrics / Relationships</h4>
                <div className="space-y-2">
                  {activeNodeInfo.metrics.map((m, index) => (
                    <div key={index} className="flex justify-between items-start text-xs border-b border-white/5 pb-2.5">
                      <span className="text-white/40 mr-2">{m.k}</span>
                      <span className="text-white font-medium text-right">{m.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => onNavigate(activeNodeInfo.actionView)}
              className="w-full flex items-center justify-center space-x-2 border border-white text-xs font-black uppercase tracking-widest py-3 hover:bg-white hover:text-black transition group mt-4 cursor-pointer"
            >
              <span>{activeNodeInfo.actionText}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid: Headlines & Checklists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* News Headlines Card */}
        <div className="bg-[#15181E]/30 border border-white/10 rounded-2xl p-5 md:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              <h3 className="text-xs font-black uppercase tracking-widest text-white">Recent Market Signals</h3>
            </div>
            <button type="button" onClick={() => onNavigate('research')} className="text-[9px] font-mono uppercase tracking-wider text-cyan-200/80 hover:text-cyan-200">Open research</button>
          </div>
          <div className="space-y-3 pt-1">
            {news.filter(item => item?.title && item?.url)
              .slice()
              .sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')))
              .slice(0,4)
              .map((item, index) => {
                const dateLabel = item.date ? new Date(item.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Date unavailable';
                return <a key={item.url || index} href={item.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-white/5 bg-black/10 p-3 hover:border-emerald-400/20 hover:bg-emerald-400/[.03] transition">
                  <div className="text-xs md:text-sm text-white/90 font-bold line-clamp-2">{item.title}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] font-mono uppercase tracking-wider text-white/35">
                    <span>{item.source || 'Web source'}</span><span>•</span><span>{dateLabel}</span>
                  </div>
                </a>;
              })}
            {!news.some(item => item?.title && item?.url) && (
              <div className="rounded-xl border border-amber-400/10 bg-amber-400/[.025] p-3 text-[10px] leading-4 text-amber-100/70">
                No current AI-infrastructure headlines are available from the live feed. Use AI Research for the latest evidence search.
              </div>
            )}
          </div>
        </div>

        {/* Quick Checklists Column */}
        <div className="bg-[#15181E]/30 border border-white/10 rounded-2xl p-5 md:p-6 space-y-4">
          <div className="flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-amber-500" />
            <h3 className="text-xs font-black uppercase tracking-widest text-white">Sectors &amp; Deep-dives</h3>
          </div>
          <p className="text-xs text-white/60 leading-relaxed">
            The market is allocating capital dynamically. Dig deeper into contracts, build milestones, and trade signals:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => onNavigate('contracts')}
              className="flex items-center justify-between p-4 rounded bg-[#15181E]/40 hover:bg-white/10 border border-white/10 text-left transition cursor-pointer"
            >
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-white">Contracts Ledger</span>
                <p className="text-[10px] font-mono text-white/40 mt-1">{evidenceAvailability.contracts?.count ?? 0} live SEC records</p>
              </div>
              <ArrowRight className="w-4 h-4 text-white/40" />
            </button>
            <button
              onClick={() => onNavigate('tracker')}
              className="flex items-center justify-between p-4 rounded bg-[#15181E]/40 hover:bg-white/10 border border-white/10 text-left transition cursor-pointer"
            >
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-white">Progress Tracker</span>
                <p className="text-[10px] font-mono text-white/40 mt-1">Monitor MW connected rates</p>
              </div>
              <ArrowRight className="w-4 h-4 text-white/40" />
            </button>
            <button
              onClick={() => onNavigate('congress')}
              className="flex items-center justify-between p-4 rounded bg-[#15181E]/40 hover:bg-white/10 border border-white/10 text-left transition cursor-pointer"
            >
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-white">Congress Trades</span>
                <p className="text-[10px] font-mono text-white/40 mt-1">{evidenceAvailability.congress?.count ?? 0} disclosure records</p>
              </div>
              <ArrowRight className="w-4 h-4 text-white/40" />
            </button>
            <button
              onClick={() => onNavigate('macro')}
              className="flex items-center justify-between p-4 rounded bg-[#15181E]/40 hover:bg-white/10 border border-white/10 text-left transition cursor-pointer"
            >
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-white">Geopolitical Signals</span>
                <p className="text-[10px] font-mono text-white/40 mt-1">{evidenceAvailability.political?.count ?? 0} policy signals</p>
              </div>
              <ArrowRight className="w-4 h-4 text-white/40" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
