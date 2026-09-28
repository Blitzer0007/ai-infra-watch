import { Milestone, Contract, CongressTrade, MacroRisk } from './types';

export const STOCK_METADATA: Record<string, { name: string; sector: string; desc: string; logoColor: string }> = {
  NVDA: { name: 'NVIDIA Corporation', sector: 'Semiconductors', desc: 'Designs high-performance GPUs and AI compute clusters powering modern AI workloads.', logoColor: '#76B900' },
  NBIS: { name: 'Nebius Group N.V.', sector: 'AI Cloud Hosting', desc: 'Large-scale AI cloud infrastructure operator delivering NVIDIA-powered high-performance computing.', logoColor: '#10B981' },
  DGXX: { name: 'Digi Power X Inc.', sector: 'AI Cloud / Power Infrastructure', desc: 'Micro/small-cap power-to-compute operator pivoting from Bitcoin mining to AI colocation and bare-metal GPU rental.', logoColor: '#3B82F6' },
  MU: { name: 'Micron Technology', sector: 'Semiconductors (Memory)', desc: 'Supplies ultra-fast High-Bandwidth Memory (HBM3E) essential for GPU memory data rates.', logoColor: '#EC4899' },
  AMD: { name: 'Advanced Micro Devices', sector: 'Semiconductors', desc: 'Designs high-performance Instinct AI accelerators, competing with NVIDIA in compute infrastructure.', logoColor: '#F59E0B' },
  META: { name: 'Meta Platforms Inc.', sector: 'Consumer Technology / AI Dev', desc: 'Major developer of open Llama models and a massive consumer of AI infrastructure rentals.', logoColor: '#06B6D4' },
  MSFT: { name: 'Microsoft Corporation', sector: 'Cloud Platform & Software', desc: 'Anchor AI platform reselling compute via Azure and integrating AI across its massive software suite.', logoColor: '#8B5CF6' },
  GOOG: { name: 'Alphabet Inc. (Google)', sector: 'Cloud Platform & AI Dev', desc: 'Dual strategy of designing proprietary TPU hardware and offering commercial Gemini AI services.', logoColor: '#EF4444' },
  CERE: { name: 'Cerebras Systems', sector: 'AI Chip Innovator', desc: 'Designs the revolutionary Wafer-Scale Engine and rents high-density compute clusters.', logoColor: '#6366F1' },
  NOW: { name: 'ServiceNow Inc.', sector: 'Enterprise AI Software', desc: 'Integrates GenAI workflow automation agents into everyday enterprise systems.', logoColor: '#14B8A6' },
  SUBQ: { name: 'SubQ AI', sector: 'Enterprise AI Partner', desc: 'Leases high-end GPU power to deliver customized, secure AI workloads for business clients.', logoColor: '#F43F5E' },
  SNDK: { name: 'SanDisk / WD', sector: 'Enterprise Storage', desc: 'Provides large-capacity PCIe enterprise SSD storage arrays used to train massive model datasets.', logoColor: '#10B981' },
  AMPG: { name: 'AmpliTech Group', sector: 'Telecom RF Hardware', desc: 'Designs low-noise radio amplifiers; showcased in NVIDIA AI-RAN cellular networking demonstrations.', logoColor: '#D97706' }
};

export const INITIAL_MILESTONES: Milestone[] = [
  // NVIDIA (NVDA)
  { id: 'm1_nvda', stockSymbol: 'NVDA', date: 'Mar 2025', title: 'Blackwell production ramp begins', description: 'Production ramp-up for the Blackwell GPU architecture starts at TSMC, laying the groundwork for severe demand supply queues.', status: 'done' },
  { id: 'm2_nvda', stockSymbol: 'NVDA', date: 'May 2025', title: 'Q1 earnings guide beat', description: 'Reports exceptional datacenter revenue growth, validating massive AI capex commitments by primary hyperscalers.', status: 'done' },
  { id: 'm3_nvda', stockSymbol: 'NVDA', date: 'Aug 2025', title: 'Blackwell shipments to Tier-1 cloud providers', description: 'First batches of Blackwell samples and development nodes ship to key cloud builders for initial evaluation and clustering.', status: 'done' },
  { id: 'm4_nvda', stockSymbol: 'NVDA', date: 'Nov 2025', title: 'Datacenter segment hits record revenue', description: 'Revenues surge as AI server deployments grow globally, driving strategic dependencies across suppliers.', status: 'done' },
  { id: 'm5_nvda', stockSymbol: 'NVDA', date: 'Mar 2026', title: '$2.0B Strategic Investment in Nebius', description: 'Strategic backing signals confidence in Nebius as a vital alternative cloud host for NVIDIA architectures.', status: 'done' },
  { id: 'm6_nvda', stockSymbol: 'NVDA', date: 'Jun 2026', title: 'Vera Rubin architecture details unveiled', description: 'Unveils roadmap for the next-generation Vera Rubin platform, targeting Q1 2027 early access with selected partners.', status: 'active' },

  // Nebius Group (NBIS)
  { id: 'm1_nbis', stockSymbol: 'NBIS', date: 'Sep 2025', title: 'Microsoft dedicated capacity contract signed', description: 'Up to $19.4B dedicated GPU capacity contract over 5 years. Power and infrastructure to be served out of Vineland, NJ.', status: 'done' },
  { id: 'm2_nbis', stockSymbol: 'NBIS', date: 'Dec 2025', title: 'Original Meta AI compute agreement', description: 'Signs a $3.0B, 5-year GPU infrastructure hosting agreement, focusing on high-density data cluster development.', status: 'done' },
  { id: 'm3_nbis', stockSymbol: 'NBIS', date: 'Mar 2026', title: 'NVIDIA strategic investment closes', description: 'Direct equity backing of $2B from NVIDIA secures priority silicon pipeline allocations for next-gen products.', status: 'done' },
  { id: 'm4_nbis', stockSymbol: 'NBIS', date: 'May 2026', title: 'Meta contract expanded to $27.0B', description: 'Gigantic expansion incorporating dedicated Vera Rubin GPU capacity. Day of announcement sees stock rally heavily (+14%).', status: 'done' },
  { id: 'm5_nbis', stockSymbol: 'NBIS', date: 'Jun 2026', title: 'Connected capacity reaches 170MW', description: 'Current connected capacity reaches 170MW, tracking towards the company\'s ambitious 800MW-1GW year-end target.', status: 'active' },

  // Digi Power X (DGXX)
  { id: 'm1_dgxx', stockSymbol: 'DGXX', date: 'Mar 2025', title: 'Pivot from Bitcoin mining & corporate re-brand', description: 'Renamed from Digihost Technology to Digi Power X, shifting focus to high-performance AI hosting and power procurement.', status: 'done' },
  { id: 'm2_dgxx', stockSymbol: 'DGXX', date: 'Apr 2026', title: 'SubQ AI contract signed ($19.6M)', description: 'Signs a 24-month contract for bare-metal Blackwell GPU-as-a-Service on the NeoCloudz platform with SubQ AI.', status: 'done' },
  { id: 'm3_dgxx', stockSymbol: 'DGXX', date: 'May 5, 2026', title: 'Cerebras Systems $2.5B colocation deal', description: 'Signs anchor 10-year, 40MW colocation contract for its Columbiana, Alabama campus. DGXX closed at $5.11 on May 5, then reached an $8.46 closing peak on May 13 (+65.6% from the event-day close) before closing at $7.81 on May 29.', status: 'done' },
  { id: 'm4_dgxx', stockSymbol: 'DGXX', date: 'Jun 2026', title: 'NVIDIA Vera Rubin access secured', description: 'Secures placement in NVIDIA\'s early-access target list for Rubin systems, positioning NeoCloudz as a key niche provider.', status: 'active' },

  // Micron (MU)
  { id: 'm1_mu', stockSymbol: 'MU', date: 'Jun 2025', title: 'HBM3E qualification with NVIDIA Blackwell', description: 'High-Bandwidth Memory (HBM3E) passes strict validation trials, securing high-margin supply slots on next-gen boards.', status: 'done' },
  { id: 'm2_mu', stockSymbol: 'MU', date: 'Sep 2025', title: 'Mass production shipment of 24GB HBM3E', description: 'Volume deliveries commence for high-density 24GB units, crucial for addressing larger token contexts natively in memory.', status: 'done' },
  { id: 'm3_mu', stockSymbol: 'MU', date: 'Mar 2026', title: 'DRAM revenue hits record highs on AI demand', description: 'AI datacenter demand drives margins and sales, leading to a massive earnings beat and upward guidance revision.', status: 'done' },
  { id: 'm4_mu', stockSymbol: 'MU', date: 'Jun 2026', title: '36GB 12H HBM3E sample distribution', description: 'Commences sample distribution of next-generation 36GB stacked memory layers, aiming to reduce cluster-wide memory latency.', status: 'active' },

  // AMD (AMD)
  { id: 'm1_amd', stockSymbol: 'AMD', date: 'Jul 2025', title: 'ROCm 6.2 open-source stack released', description: 'Major optimization update for Instinct MI300X software ecosystem, narrowing the developer experience gap with CUDA.', status: 'done' },
  { id: 'm2_amd', stockSymbol: 'AMD', date: 'Oct 2025', title: 'Azure expands MI300X instance footprint', description: 'Microsoft expands commercial availability of MI300X instances, validating competitive compute pricing metrics.', status: 'done' },
  { id: 'm3_amd', stockSymbol: 'AMD', date: 'Jan 2026', title: 'Instinct MI325X mass production launch', description: 'Volume manufacturing begins for MI325X, featuring expanded memory capacities to compete directly with Blackwell systems.', status: 'done' },
  { id: 'm4_amd', stockSymbol: 'AMD', date: 'May 2026', title: 'Next-gen Instinct MI350 timeline confirmed', description: 'Confirms timeline and architecture specs for CDNA 4-based MI350 series, targeting a massive 35x jump in inference efficiency.', status: 'active' },

  // Meta (META)
  { id: 'm1_meta', stockSymbol: 'META', date: 'Jul 2025', title: 'Llama 3.1 open-weights model family debuts', description: 'Launches flagship 405B model, establishing open-weights leadership and fueling hyper-scale compute demand.', status: 'done' },
  { id: 'm2_meta', stockSymbol: 'META', date: 'Dec 2025', title: '$3B infrastructure lease with Nebius', description: 'Leases GPU capacity to supplement internal computing facilities and secure training resources for upcoming models.', status: 'done' },
  { id: 'm3_meta', stockSymbol: 'META', date: 'Mar 2026', title: 'Nebius lease expanded to $27B', description: 'Secures massive block of Nebius\'s planned Vera Rubin and Blackwell datacenter capacity to anchor open-weights training models.', status: 'done' },
  { id: 'm4_meta', stockSymbol: 'META', date: 'Jun 2026', title: 'Llama 4 cluster construction and training launch', description: 'Builds massive high-speed cluster fabrics, putting Llama 4 on a fast-track training regimen to beat closed model peers.', status: 'active' },

  // Microsoft (MSFT)
  { id: 'm1_msft', stockSymbol: 'MSFT', date: 'Sep 2025', title: 'Vineland capacity deal with Nebius ($19.4B)', description: 'Leases large portion of planned Nebius NJ capacity to maintain Azure commercial dominance amid silicon supply tightness.', status: 'done' },
  { id: 'm2_msft', stockSymbol: 'MSFT', date: 'Nov 2025', title: 'Azure Maia 100 processor deployment', description: 'Deployments of proprietary silicon begin in selected regional hubs to alleviate high GPU procurement costs.', status: 'done' },
  { id: 'm3_msft', stockSymbol: 'MSFT', date: 'Mar 2026', title: 'Enterprise Copilot Pro monetization accelerates', description: 'Reports heavy recurring seat licenses for enterprise GenAI integrations, driving long-term infrastructure demand.', status: 'done' },
  { id: 'm4_msft', stockSymbol: 'MSFT', date: 'May 2026', title: 'AI energy grid infrastructure procurement', description: 'Secures gigawatts of nuclear and renewable PPAs to support upcoming datacenter power requirements through 2030.', status: 'active' },

  // Google (GOOG)
  { id: 'm1_goog', stockSymbol: 'GOOG', date: 'Aug 2025', title: 'TPU v5p hardware globally available', description: 'Makes highest-end proprietary Tensor Processing Units commercially rentable, expanding internal training capability.', status: 'done' },
  { id: 'm2_goog', stockSymbol: 'GOOG', date: 'Dec 2025', title: 'Gemini 1.5 Ultra model released', description: 'Releases top-tier Gemini architecture featuring a massive 2 million token context window, setting standard.', status: 'done' },
  { id: 'm3_goog', stockSymbol: 'GOOG', date: 'Mar 2026', title: 'Gemini API traffic exceeds 10B tokens daily', description: 'Sees heavy developer and enterprise API usage growth, driving heavy inference datacenter deployment workloads.', status: 'done' },
  { id: 'm4_goog', stockSymbol: 'GOOG', date: 'May 2026', title: 'TPU v6 (Trillium) chip architecture unveiled', description: 'Reveals sixth-generation hardware boasting up to 4.7x performance density compared to prior TPU models.', status: 'active' },

  // Cerebras (CERE)
  { id: 'm1_cere', stockSymbol: 'CERE', date: 'May 2025', title: 'Wafer-Scale Engine 3 benchmarked', description: 'Demonstrates industry-leading AI training throughput with a massive single-silicon wafer engine containing 4 trillion transistors.', status: 'done' },
  { id: 'm2_cere', stockSymbol: 'CERE', date: 'Oct 2025', title: 'Confidential IPO prospectus filed', description: 'Prepares for public market listing, showcasing heavy growth in dedicated hardware platform leasing.', status: 'done' },
  { id: 'm3_cere', stockSymbol: 'CERE', date: 'May 5, 2026', title: '$2.5B Alabama hosting contract signed', description: 'Signs pivotal 40MW colocation agreement with Digi Power X to establish hardware facilities inside their secure campus.', status: 'done' },
  { id: 'm4_cere', stockSymbol: 'CERE', date: 'Jun 2026', title: 'WSE-3 cloud deployment launches', description: 'Launches public wafer-scale cloud services, enabling near-instantaneous scaling for training large LLM parameters.', status: 'active' },

  // ServiceNow (NOW)
  { id: 'm1_now', stockSymbol: 'NOW', date: 'Jul 2025', title: 'Now Assist workflow automation rollout', description: 'Commercial release of IT service, HR, and customer agent workflows using embedded generative models.', status: 'done' },
  { id: 'm2_now', stockSymbol: 'NOW', date: 'Oct 2025', title: 'SaaS recurring revenue jumps 30%', description: 'Generative software modules drive rapid expansion in contract values and premium tier upgrades.', status: 'done' },
  { id: 'm3_now', stockSymbol: 'NOW', date: 'Jan 2026', title: 'NVIDIA partnership for custom agent avatars', description: 'Expands partnership to build customized avatar agents that automate customer-facing service desks.', status: 'done' },
  { id: 'm4_now', stockSymbol: 'NOW', date: 'Apr 2026', title: 'Autonomous IT agent suite deployed', description: 'Releases zero-touch IT troubleshooting agents, shifting from co-pilot assistants to fully autonomous software.', status: 'active' },

  // SubQ AI (SUBQ)
  { id: 'm1_subq', stockSymbol: 'SUBQ', date: 'Aug 2025', title: 'Series B funding round closes', description: 'Secures funding to expand its rentable bare-metal GPU node inventory with high-end NVIDIA chips.', status: 'done' },
  { id: 'm2_subq', stockSymbol: 'SUBQ', date: 'Apr 20, 2026', title: '$19.6M Blackwell rental lease signed', description: 'Signs rental agreement with Digi Power X to host specialized workloads on their NeoCloudz Blackwell systems.', status: 'done' },
  { id: 'm3_subq', stockSymbol: 'SUBQ', date: 'May 15, 2026', title: 'NeoCloudz bare-metal GPU beta launches', description: 'Launches service to its client base, with primary capacity allocated to high-performance analytics pipelines.', status: 'active' },

  // SanDisk (SNDK)
  { id: 'm1_sndk', stockSymbol: 'SNDK', date: 'Sep 2025', title: 'Ultrastar 24TB PCIe Gen5 SSD launch', description: 'Unveils high-density solid-state drives specifically engineered to deliver training dataset speeds.', status: 'done' },
  { id: 'm2_sndk', stockSymbol: 'SNDK', date: 'Dec 2025', title: 'Hyperscaler datacenter storage volume ship', description: 'Commences heavy volume deliveries to primary cloud operators struggling with data-ingest speed bottlenecks.', status: 'done' },
  { id: 'm3_sndk', stockSymbol: 'SNDK', date: 'Mar 2026', title: 'NAND segment record profitability', description: 'Record-setting demand for high-capacity enterprise storage lines drives high segment operating margins.', status: 'done' },

  // AmpliTech Group (AMPG)
  { id: 'm1_ampg', stockSymbol: 'AMPG', date: 'Jul 2025', title: 'Low-noise amplifier production ramp', description: 'Ramps manufacturing of custom amplifiers for high-throughput satellite communications systems.', status: 'done' },
  { id: 'm2_ampg', stockSymbol: 'AMPG', date: 'Nov 2025', title: 'Next-gen O-RAN radio designs finalized', description: 'Completes designs for 6G radio modules incorporating high-speed signal noise mitigation layers.', status: 'done' },
  { id: 'm3_ampg', stockSymbol: 'AMPG', date: 'Mar 2026', title: 'NVIDIA AI Aerial RAN showcase participation', description: 'Radio hardware is selected for showcasing in NVIDIA\'s high-speed AI-RAN network trials at Northeastern University.', status: 'done' }
];

