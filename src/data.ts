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

export const STOCK_HISTORY: Record<string, { date: string; price: number }[]> = {
  NVDA: [
    { date: 'Jan 2025', price: 115.0 },
    { date: 'Mar 2025', price: 122.0 },
    { date: 'May 2025', price: 130.0 },
    { date: 'Jul 2025', price: 135.0 },
    { date: 'Aug 2025', price: 142.0 },
    { date: 'Oct 2025', price: 150.0 },
    { date: 'Nov 2025', price: 158.0 },
    { date: 'Jan 2026', price: 168.0 },
    { date: 'Mar 2026', price: 175.0 },
    { date: 'May 2026', price: 184.0 },
    { date: 'Jun 2026', price: 192.53 }
  ],
  NBIS: [
    { date: 'Jan 2025', price: 15.2 },
    { date: 'Mar 2025', price: 18.5 },
    { date: 'May 2025', price: 24.0 },
    { date: 'Jul 2025', price: 32.0 },
    { date: 'Sep 2025', price: 48.0 },
    { date: 'Nov 2025', price: 72.0 },
    { date: 'Dec 2025', price: 105.0 },
    { date: 'Jan 2026', price: 140.0 },
    { date: 'Mar 2026', price: 178.0 },
    { date: 'May 2026', price: 212.0 },
    { date: 'Jun 2026', price: 240.30 }
  ],
  DGXX: [
    { date: 'Jan 2025', price: 0.95 },
    { date: 'Mar 2025', price: 1.20 },
    { date: 'May 2025', price: 1.15 },
    { date: 'Jul 2025', price: 1.45 },
    { date: 'Sep 2025', price: 1.30 },
    { date: 'Nov 2025', price: 1.65 },
    { date: 'Jan 2026', price: 1.80 },
    { date: 'Mar 2026', price: 1.95 },
    { date: 'Apr 2026', price: 2.10 },
    { date: 'May 1, 2026', price: 3.76 },
    { date: 'May 5, 2026', price: 5.11 },
    { date: 'May 8, 2026', price: 6.63 },
    { date: 'May 11, 2026', price: 7.43 },
    { date: 'May 12, 2026', price: 8.39 },
    { date: 'May 13, 2026', price: 8.46 },
    { date: 'May 14, 2026', price: 7.22 },
    { date: 'May 15, 2026', price: 7.54 },
    { date: 'May 19, 2026', price: 7.72 },
    { date: 'May 20, 2026', price: 7.56 },
    { date: 'May 21, 2026', price: 7.70 },
    { date: 'May 22, 2026', price: 7.94 },
    { date: 'May 26, 2026', price: 8.10 },
    { date: 'May 27, 2026', price: 8.01 },
    { date: 'May 28, 2026', price: 8.11 },
    { date: 'May 29, 2026', price: 7.81 },
    { date: 'Jun 2026', price: 4.50 }
  ],
  MU: [
    { date: 'Jan 2025', price: 75.61 },
    { date: 'Mar 2025', price: 92.50 },
    { date: 'Jun 2025', price: 110.0 },
    { date: 'Sep 2025', price: 118.0 },
    { date: 'Dec 2025', price: 122.5 },
    { date: 'Mar 2026', price: 125.0 },
    { date: 'May 2026', price: 129.5 },
    { date: 'Jun 2026', price: 132.0 }
  ],
  AMD: [
    { date: 'Jan 2025', price: 114.74 },
    { date: 'Mar 2025', price: 130.00 },
    { date: 'Jul 2025', price: 145.0 },
    { date: 'Oct 2025', price: 155.0 },
    { date: 'Jan 2026', price: 168.0 },
    { date: 'Mar 2026', price: 171.2 },
    { date: 'May 2026', price: 175.0 },
    { date: 'Jun 2026', price: 178.50 }
  ],
  META: [
    { date: 'Jan 2025', price: 450.0 },
    { date: 'Jul 2025', price: 480.0 },
    { date: 'Sep 2025', price: 502.0 },
    { date: 'Dec 2025', price: 515.0 },
    { date: 'Mar 2026', price: 535.0 },
    { date: 'May 2026', price: 542.5 },
    { date: 'Jun 2026', price: 550.00 }
  ],
  MSFT: [
    { date: 'Jan 2025', price: 320.0 },
    { date: 'May 2025', price: 335.0 },
    { date: 'Sep 2025', price: 350.0 },
    { date: 'Nov 2025', price: 362.0 },
    { date: 'Jan 2026', price: 368.0 },
    { date: 'Mar 2026', price: 370.0 },
    { date: 'May 2026', price: 371.5 },
    { date: 'Jun 2026', price: 372.97 }
  ],
  GOOG: [
    { date: 'Jan 2025', price: 155.0 },
    { date: 'Mar 2025', price: 180.0 },
    { date: 'Aug 2025', price: 210.0 },
    { date: 'Dec 2025', price: 245.0 },
    { date: 'Mar 2026', price: 285.0 },
    { date: 'May 2026', price: 315.0 },
    { date: 'Jun 2026', price: 334.69 }
  ],
  CERE: [
    { date: 'Jan 2025', price: 12.5 },
    { date: 'May 2025', price: 15.0 },
    { date: 'Oct 2025', price: 18.0 },
    { date: 'Mar 2026', price: 21.5 },
    { date: 'May 2026', price: 24.0 },
    { date: 'Jun 2026', price: 28.50 }
  ],
  NOW: [
    { date: 'Jan 2025', price: 65.0 },
    { date: 'Jul 2025', price: 72.0 },
    { date: 'Oct 2025', price: 80.0 },
    { date: 'Jan 2026', price: 88.0 },
    { date: 'Apr 2026', price: 94.0 },
    { date: 'Jun 2026', price: 98.34 }
  ],
  SUBQ: [
    { date: 'Jan 2025', price: 1.10 },
    { date: 'Aug 2025', price: 1.50 },
    { date: 'Jan 2026', price: 1.85 },
    { date: 'Apr 2026', price: 2.20 },
    { date: 'May 2026', price: 2.80 },
    { date: 'Jun 2026', price: 3.10 }
  ],
  SNDK: [
    { date: 'Jan 2025', price: 1250.0 },
    { date: 'Sep 2025', price: 1480.0 },
    { date: 'Dec 2025', price: 1650.0 },
    { date: 'Mar 2026', price: 1850.0 },
    { date: 'Jun 2026', price: 2090.71 }
  ],
  AMPG: [
    { date: 'Jan 2025', price: 1.55 },
    { date: 'Jul 2025', price: 2.40 },
    { date: 'Nov 2025', price: 3.80 },
    { date: 'Mar 2026', price: 5.10 },
    { date: 'Jun 2026', price: 6.55 }
  ]
};

export const INITIAL_MILESTONES: Milestone[] = [
  // NVIDIA (NVDA)
  { id: 'm1_nvda', stockSymbol: 'NVDA', date: 'Mar 2025', title: 'Blackwell production ramp begins', description: 'Production ramp-up for the Blackwell GPU architecture starts at TSMC, laying the groundwork for severe demand supply queues.', priceAtTime: 122.0, status: 'done' },
  { id: 'm2_nvda', stockSymbol: 'NVDA', date: 'May 2025', title: 'Q1 earnings guide beat', description: 'Reports exceptional datacenter revenue growth, validating massive AI capex commitments by primary hyperscalers.', priceAtTime: 130.0, status: 'done' },
  { id: 'm3_nvda', stockSymbol: 'NVDA', date: 'Aug 2025', title: 'Blackwell shipments to Tier-1 cloud providers', description: 'First batches of Blackwell samples and development nodes ship to key cloud builders for initial evaluation and clustering.', priceAtTime: 142.0, status: 'done' },
  { id: 'm4_nvda', stockSymbol: 'NVDA', date: 'Nov 2025', title: 'Datacenter segment hits record revenue', description: 'Revenues surge as AI server deployments grow globally, driving strategic dependencies across suppliers.', priceAtTime: 158.0, status: 'done' },
  { id: 'm5_nvda', stockSymbol: 'NVDA', date: 'Mar 2026', title: '$2.0B Strategic Investment in Nebius', description: 'Strategic backing signals confidence in Nebius as a vital alternative cloud host for NVIDIA architectures.', priceAtTime: 175.0, status: 'done' },
  { id: 'm6_nvda', stockSymbol: 'NVDA', date: 'Jun 2026', title: 'Vera Rubin architecture details unveiled', description: 'Unveils roadmap for the next-generation Vera Rubin platform, targeting Q1 2027 early access with selected partners.', priceAtTime: 192.53, status: 'active' },

  // Nebius Group (NBIS)
  { id: 'm1_nbis', stockSymbol: 'NBIS', date: 'Sep 2025', title: 'Microsoft dedicated capacity contract signed', description: 'Up to $19.4B dedicated GPU capacity contract over 5 years. Power and infrastructure to be served out of Vineland, NJ.', priceAtTime: 48.0, status: 'done' },
  { id: 'm2_nbis', stockSymbol: 'NBIS', date: 'Dec 2025', title: 'Original Meta AI compute agreement', description: 'Signs a $3.0B, 5-year GPU infrastructure hosting agreement, focusing on high-density data cluster development.', priceAtTime: 105.0, status: 'done' },
  { id: 'm3_nbis', stockSymbol: 'NBIS', date: 'Mar 2026', title: 'NVIDIA strategic investment closes', description: 'Direct equity backing of $2B from NVIDIA secures priority silicon pipeline allocations for next-gen products.', priceAtTime: 178.0, status: 'done' },
  { id: 'm4_nbis', stockSymbol: 'NBIS', date: 'May 2026', title: 'Meta contract expanded to $27.0B', description: 'Gigantic expansion incorporating dedicated Vera Rubin GPU capacity. Day of announcement sees stock rally heavily (+14%).', priceAtTime: 212.0, status: 'done' },
  { id: 'm5_nbis', stockSymbol: 'NBIS', date: 'Jun 2026', title: 'Connected capacity reaches 170MW', description: 'Current connected capacity reaches 170MW, tracking towards the company\'s ambitious 800MW-1GW year-end target.', priceAtTime: 240.30, status: 'active' },

  // Digi Power X (DGXX)
  { id: 'm1_dgxx', stockSymbol: 'DGXX', date: 'Mar 2025', title: 'Pivot from Bitcoin mining & corporate re-brand', description: 'Renamed from Digihost Technology to Digi Power X, shifting focus to high-performance AI hosting and power procurement.', priceAtTime: 1.20, status: 'done' },
  { id: 'm2_dgxx', stockSymbol: 'DGXX', date: 'Apr 2026', title: 'SubQ AI contract signed ($19.6M)', description: 'Signs a 24-month contract for bare-metal Blackwell GPU-as-a-Service on the NeoCloudz platform with SubQ AI.', priceAtTime: 2.10, status: 'done' },
  { id: 'm3_dgxx', stockSymbol: 'DGXX', date: 'May 5, 2026', title: 'Cerebras Systems $2.5B colocation deal', description: 'Signs anchor 10-year, 40MW colocation contract for its Columbiana, Alabama campus. DGXX closed at $5.11 on May 5, then reached an $8.46 closing peak on May 13 (+65.6% from the event-day close) before closing at $7.81 on May 29.', priceAtTime: 5.11, status: 'done' },
  { id: 'm4_dgxx', stockSymbol: 'DGXX', date: 'Jun 2026', title: 'NVIDIA Vera Rubin access secured', description: 'Secures placement in NVIDIA\'s early-access target list for Rubin systems, positioning NeoCloudz as a key niche provider.', priceAtTime: 4.50, status: 'active' },

  // Micron (MU)
  { id: 'm1_mu', stockSymbol: 'MU', date: 'Jun 2025', title: 'HBM3E qualification with NVIDIA Blackwell', description: 'High-Bandwidth Memory (HBM3E) passes strict validation trials, securing high-margin supply slots on next-gen boards.', priceAtTime: 110.0, status: 'done' },
  { id: 'm2_mu', stockSymbol: 'MU', date: 'Sep 2025', title: 'Mass production shipment of 24GB HBM3E', description: 'Volume deliveries commence for high-density 24GB units, crucial for addressing larger token contexts natively in memory.', priceAtTime: 118.0, status: 'done' },
  { id: 'm3_mu', stockSymbol: 'MU', date: 'Mar 2026', title: 'DRAM revenue hits record highs on AI demand', description: 'AI datacenter demand drives margins and sales, leading to a massive earnings beat and upward guidance revision.', priceAtTime: 125.0, status: 'done' },
  { id: 'm4_mu', stockSymbol: 'MU', date: 'Jun 2026', title: '36GB 12H HBM3E sample distribution', description: 'Commences sample distribution of next-generation 36GB stacked memory layers, aiming to reduce cluster-wide memory latency.', priceAtTime: 132.0, status: 'active' },

  // AMD (AMD)
  { id: 'm1_amd', stockSymbol: 'AMD', date: 'Jul 2025', title: 'ROCm 6.2 open-source stack released', description: 'Major optimization update for Instinct MI300X software ecosystem, narrowing the developer experience gap with CUDA.', priceAtTime: 145.0, status: 'done' },
  { id: 'm2_amd', stockSymbol: 'AMD', date: 'Oct 2025', title: 'Azure expands MI300X instance footprint', description: 'Microsoft expands commercial availability of MI300X instances, validating competitive compute pricing metrics.', priceAtTime: 155.0, status: 'done' },
  { id: 'm3_amd', stockSymbol: 'AMD', date: 'Jan 2026', title: 'Instinct MI325X mass production launch', description: 'Volume manufacturing begins for MI325X, featuring expanded memory capacities to compete directly with Blackwell systems.', priceAtTime: 168.0, status: 'done' },
  { id: 'm4_amd', stockSymbol: 'AMD', date: 'May 2026', title: 'Next-gen Instinct MI350 timeline confirmed', description: 'Confirms timeline and architecture specs for CDNA 4-based MI350 series, targeting a massive 35x jump in inference efficiency.', priceAtTime: 175.0, status: 'active' },

  // Meta (META)
  { id: 'm1_meta', stockSymbol: 'META', date: 'Jul 2025', title: 'Llama 3.1 open-weights model family debuts', description: 'Launches flagship 405B model, establishing open-weights leadership and fueling hyper-scale compute demand.', priceAtTime: 480.0, status: 'done' },
  { id: 'm2_meta', stockSymbol: 'META', date: 'Dec 2025', title: '$3B infrastructure lease with Nebius', description: 'Leases GPU capacity to supplement internal computing facilities and secure training resources for upcoming models.', priceAtTime: 515.0, status: 'done' },
  { id: 'm3_meta', stockSymbol: 'META', date: 'Mar 2026', title: 'Nebius lease expanded to $27B', description: 'Secures massive block of Nebius\'s planned Vera Rubin and Blackwell datacenter capacity to anchor open-weights training models.', priceAtTime: 535.0, status: 'done' },
  { id: 'm4_meta', stockSymbol: 'META', date: 'Jun 2026', title: 'Llama 4 cluster construction and training launch', description: 'Builds massive high-speed cluster fabrics, putting Llama 4 on a fast-track training regimen to beat closed model peers.', priceAtTime: 550.0, status: 'active' },

  // Microsoft (MSFT)
  { id: 'm1_msft', stockSymbol: 'MSFT', date: 'Sep 2025', title: 'Vineland capacity deal with Nebius ($19.4B)', description: 'Leases large portion of planned Nebius NJ capacity to maintain Azure commercial dominance amid silicon supply tightness.', priceAtTime: 350.0, status: 'done' },
  { id: 'm2_msft', stockSymbol: 'MSFT', date: 'Nov 2025', title: 'Azure Maia 100 processor deployment', description: 'Deployments of proprietary silicon begin in selected regional hubs to alleviate high GPU procurement costs.', priceAtTime: 362.0, status: 'done' },
  { id: 'm3_msft', stockSymbol: 'MSFT', date: 'Mar 2026', title: 'Enterprise Copilot Pro monetization accelerates', description: 'Reports heavy recurring seat licenses for enterprise GenAI integrations, driving long-term infrastructure demand.', priceAtTime: 370.0, status: 'done' },
  { id: 'm4_msft', stockSymbol: 'MSFT', date: 'May 2026', title: 'AI energy grid infrastructure procurement', description: 'Secures gigawatts of nuclear and renewable PPAs to support upcoming datacenter power requirements through 2030.', priceAtTime: 371.5, status: 'active' },

  // Google (GOOG)
  { id: 'm1_goog', stockSymbol: 'GOOG', date: 'Aug 2025', title: 'TPU v5p hardware globally available', description: 'Makes highest-end proprietary Tensor Processing Units commercially rentable, expanding internal training capability.', priceAtTime: 210.0, status: 'done' },
  { id: 'm2_goog', stockSymbol: 'GOOG', date: 'Dec 2025', title: 'Gemini 1.5 Ultra model released', description: 'Releases top-tier Gemini architecture featuring a massive 2 million token context window, setting standard.', priceAtTime: 245.0, status: 'done' },
  { id: 'm3_goog', stockSymbol: 'GOOG', date: 'Mar 2026', title: 'Gemini API traffic exceeds 10B tokens daily', description: 'Sees heavy developer and enterprise API usage growth, driving heavy inference datacenter deployment workloads.', priceAtTime: 285.0, status: 'done' },
  { id: 'm4_goog', stockSymbol: 'GOOG', date: 'May 2026', title: 'TPU v6 (Trillium) chip architecture unveiled', description: 'Reveals sixth-generation hardware boasting up to 4.7x performance density compared to prior TPU models.', priceAtTime: 315.0, status: 'active' },

  // Cerebras (CERE)
  { id: 'm1_cere', stockSymbol: 'CERE', date: 'May 2025', title: 'Wafer-Scale Engine 3 benchmarked', description: 'Demonstrates industry-leading AI training throughput with a massive single-silicon wafer engine containing 4 trillion transistors.', priceAtTime: 15.0, status: 'done' },
  { id: 'm2_cere', stockSymbol: 'CERE', date: 'Oct 2025', title: 'Confidential IPO prospectus filed', description: 'Prepares for public market listing, showcasing heavy growth in dedicated hardware platform leasing.', priceAtTime: 18.0, status: 'done' },
  { id: 'm3_cere', stockSymbol: 'CERE', date: 'May 5, 2026', title: '$2.5B Alabama hosting contract signed', description: 'Signs pivotal 40MW colocation agreement with Digi Power X to establish hardware facilities inside their secure campus.', priceAtTime: 24.0, status: 'done' },
  { id: 'm4_cere', stockSymbol: 'CERE', date: 'Jun 2026', title: 'WSE-3 cloud deployment launches', description: 'Launches public wafer-scale cloud services, enabling near-instantaneous scaling for training large LLM parameters.', priceAtTime: 28.5, status: 'active' },

  // ServiceNow (NOW)
  { id: 'm1_now', stockSymbol: 'NOW', date: 'Jul 2025', title: 'Now Assist workflow automation rollout', description: 'Commercial release of IT service, HR, and customer agent workflows using embedded generative models.', priceAtTime: 72.0, status: 'done' },
  { id: 'm2_now', stockSymbol: 'NOW', date: 'Oct 2025', title: 'SaaS recurring revenue jumps 30%', description: 'Generative software modules drive rapid expansion in contract values and premium tier upgrades.', priceAtTime: 80.0, status: 'done' },
  { id: 'm3_now', stockSymbol: 'NOW', date: 'Jan 2026', title: 'NVIDIA partnership for custom agent avatars', description: 'Expands partnership to build customized avatar agents that automate customer-facing service desks.', priceAtTime: 88.0, status: 'done' },
  { id: 'm4_now', stockSymbol: 'NOW', date: 'Apr 2026', title: 'Autonomous IT agent suite deployed', description: 'Releases zero-touch IT troubleshooting agents, shifting from co-pilot assistants to fully autonomous software.', priceAtTime: 94.0, status: 'active' },

  // SubQ AI (SUBQ)
  { id: 'm1_subq', stockSymbol: 'SUBQ', date: 'Aug 2025', title: 'Series B funding round closes', description: 'Secures funding to expand its rentable bare-metal GPU node inventory with high-end NVIDIA chips.', priceAtTime: 1.50, status: 'done' },
  { id: 'm2_subq', stockSymbol: 'SUBQ', date: 'Apr 20, 2026', title: '$19.6M Blackwell rental lease signed', description: 'Signs rental agreement with Digi Power X to host specialized workloads on their NeoCloudz Blackwell systems.', priceAtTime: 2.20, status: 'done' },
  { id: 'm3_subq', stockSymbol: 'SUBQ', date: 'May 15, 2026', title: 'NeoCloudz bare-metal GPU beta launches', description: 'Launches service to its client base, with primary capacity allocated to high-performance analytics pipelines.', priceAtTime: 2.80, status: 'active' },

  // SanDisk (SNDK)
  { id: 'm1_sndk', stockSymbol: 'SNDK', date: 'Sep 2025', title: 'Ultrastar 24TB PCIe Gen5 SSD launch', description: 'Unveils high-density solid-state drives specifically engineered to deliver training dataset speeds.', priceAtTime: 1480.0, status: 'done' },
  { id: 'm2_sndk', stockSymbol: 'SNDK', date: 'Dec 2025', title: 'Hyperscaler datacenter storage volume ship', description: 'Commences heavy volume deliveries to primary cloud operators struggling with data-ingest speed bottlenecks.', priceAtTime: 1650.0, status: 'done' },
  { id: 'm3_sndk', stockSymbol: 'SNDK', date: 'Mar 2026', title: 'NAND segment record profitability', description: 'Record-setting demand for high-capacity enterprise storage lines drives high segment operating margins.', priceAtTime: 1850.0, status: 'done' },

  // AmpliTech Group (AMPG)
  { id: 'm1_ampg', stockSymbol: 'AMPG', date: 'Jul 2025', title: 'Low-noise amplifier production ramp', description: 'Ramps manufacturing of custom amplifiers for high-throughput satellite communications systems.', priceAtTime: 2.40, status: 'done' },
  { id: 'm2_ampg', stockSymbol: 'AMPG', date: 'Nov 2025', title: 'Next-gen O-RAN radio designs finalized', description: 'Completes designs for 6G radio modules incorporating high-speed signal noise mitigation layers.', priceAtTime: 3.80, status: 'done' },
  { id: 'm3_ampg', stockSymbol: 'AMPG', date: 'Mar 2026', title: 'NVIDIA AI Aerial RAN showcase participation', description: 'Radio hardware is selected for showcasing in NVIDIA\'s high-speed AI-RAN network trials at Northeastern University.', priceAtTime: 5.10, status: 'done' }
];

export const CONTRACTS_LEDGER: Contract[] = [
  {
    id: 'c1',
    company: 'NBIS',
    client: 'Meta Platforms Inc.',
    value: '$27.0B',
    duration: '5 Years',
    hardware: 'NVIDIA Blackwell & Vera Rubin Platforms',
    details: 'Dedicated AI computing and cluster services leased across multiple global data center hubs.',
    status: 'Active (Expanded from $3.0B on Mar 16, 2026)',
    statusLevel: 'high-verified',
    dateSigned: 'Mar 16, 2026'
  },
  {
    id: 'c2',
    company: 'NBIS',
    client: 'Microsoft Corporation',
    value: 'Up to $19.4B',
    duration: '5 Years',
    hardware: 'NVIDIA GPU datacenters',
    details: 'Dedicated high-density computing services hosted at the Vineland, New Jersey site for Azure.',
    status: 'Active',
    statusLevel: 'high-verified',
    dateSigned: 'Sep 2025'
  },
  {
    id: 'c3',
    company: 'DGXX',
    client: 'Cerebras Systems',
    value: 'Up to $2.5B',
    duration: '10 Years (Colocation)',
    hardware: 'Cerebras Wafer-Scale Engines',
    details: 'Anchor colocation contract for up to 40MW capacity at the Columbiana, Alabama data center site.',
    status: 'Active (Under construction)',
    statusLevel: 'in-progress',
    dateSigned: 'May 5, 2026'
  },
  {
    id: 'c4',
    company: 'DGXX',
    client: 'SubQ AI',
    value: '$19.6M',
    duration: '24 Months',
    hardware: 'NVIDIA Blackwell servers',
    details: 'Hosting and bare-metal service on DGXX\'s NeoCloudz platform. Includes non-refundable $2.95M upfront payment.',
    status: 'Active (Effective May 15, 2026)',
    statusLevel: 'high-verified',
    dateSigned: 'Apr 20, 2026'
  },
  {
    id: 'c5',
    company: 'NVDA',
    client: 'TSMC Advanced Packaging Allocation',
    value: '$12.5B',
    duration: '3 Years',
    hardware: 'CoWoS Packaging Capacity',
    details: 'Securing massive high-speed manufacturing allocations for upcoming Vera Rubin line.',
    status: 'Verified Allocation',
    statusLevel: 'high-verified',
    dateSigned: 'May 2026'
  },
  {
    id: 'c6',
    company: 'NVDA',
    client: 'OpenAI GPT-5 Cluster Lease',
    value: '$8.0B',
    duration: '2 Years',
    hardware: '100,000 Blackwell B200 Link',
    details: 'Leasing agreement for dedicated supercomputer clusters to power advanced reasoning model training.',
    status: 'In-progress Negotiations',
    statusLevel: 'in-progress',
    dateSigned: 'Jun 2026'
  },
  {
    id: 'c7',
    company: 'MU',
    client: 'NVIDIA HBM3E Supply Agreement',
    value: '$4.2B',
    duration: '18 Months',
    hardware: '24GB & 36GB HBM3E Modules',
    details: 'Exclusive memory supply contract guaranteeing high-bandwidth stacked memory allocations for Blackwell GPUs.',
    status: 'Verified Production Contract',
    statusLevel: 'high-verified',
    dateSigned: 'Jan 2026'
  },
  {
    id: 'c8',
    company: 'AMD',
    client: 'Oracle Cloud Infrastructure',
    value: '$1.8B',
    duration: '3 Years',
    hardware: 'AMD Instinct MI325X Accelerators',
    details: 'Procurement of high-performance Instinct chips to expand OCI bare-metal instances.',
    status: 'Active Rollout',
    statusLevel: 'high-verified',
    dateSigned: 'Feb 2026'
  },
  {
    id: 'c9',
    company: 'AMD',
    client: 'Amazon Web Services (AWS)',
    value: '$2.1B',
    duration: '3 Years',
    hardware: 'AMD Instinct MI350 Series',
    details: 'Unverified negotiations for future CDNA 4-based MI350 system procurement to counter NVIDIA supply pricing.',
    status: 'Rumoured Pipeline',
    statusLevel: 'low-rumour',
    dateSigned: 'Jun 2026'
  },
  {
    id: 'c10',
    company: 'META',
    client: 'Vineland Energy PPA',
    value: '$1.5B',
    duration: '15 Years',
    hardware: '200MW Clean Nuclear Energy Power',
    details: 'Power purchase agreement to sustain future high-density LLM training centers nearby.',
    status: 'Verified Agreement',
    statusLevel: 'high-verified',
    dateSigned: 'Apr 2026'
  },
  {
    id: 'c11',
    company: 'MSFT',
    client: 'OpenAI Infra Support Upgrade',
    value: '$15.0B',
    duration: '4 Years',
    hardware: 'Azure Custom Maia & NVIDIA Clusters',
    details: 'Massive infrastructure capacity upgrades across Azure hubs to support real-time ChatGPT search traffic.',
    status: 'Active Integration',
    statusLevel: 'high-verified',
    dateSigned: 'Jan 2026'
  },
  {
    id: 'c12',
    company: 'GOOG',
    client: 'Apple Gemini Integration Deal',
    value: '$3.5B/year',
    duration: 'Recurring (Annual)',
    hardware: 'TPU Cloud Infrastructure (Trillium)',
    details: 'Back-end infrastructure lease to support Apple Intelligence local-fallback cloud queries utilizing customized Gemini models.',
    status: 'Active Service',
    statusLevel: 'high-verified',
    dateSigned: 'Feb 2026'
  },
  {
    id: 'c13',
    company: 'CERE',
    client: 'Saudi Aramco AI Center',
    value: '$1.2B',
    duration: '5 Years',
    hardware: 'WSE-3 Wafer-Scale Supercomputers',
    details: 'Discussions around exporting multiple CS-3 wafer scale nodes for advanced geologic and seismology analytics.',
    status: 'Rumoured Export Talks',
    statusLevel: 'low-rumour',
    dateSigned: 'May 2026'
  },
  {
    id: 'c14',
    company: 'NOW',
    client: 'Accenture Enterprise Agent Fleet',
    value: '$450M',
    duration: '3 Years',
    hardware: 'Now Assist AI Platform',
    details: 'Largest deployment of autonomous customer support and IT agents across Accenture global workspaces.',
    status: 'Active Rollout',
    statusLevel: 'high-verified',
    dateSigned: 'Mar 2026'
  },
  {
    id: 'c15',
    company: 'SUBQ',
    client: 'HedgeFund Group Alpha',
    value: '$45M',
    duration: '2 Years',
    hardware: 'Bare-Metal Analytics Engine',
    details: 'Providing custom data pipelines powered by Blackwell servers leased from Digi Power X.',
    status: 'Under Contract',
    statusLevel: 'high-verified',
    dateSigned: 'May 2026'
  },
  {
    id: 'c16',
    company: 'SNDK',
    client: 'Google Cloud Platform Storage',
    value: '$820M',
    duration: '2 Years',
    hardware: 'PCIe Gen5 Ultrastar Solid State Arrays',
    details: 'Volume supply contract for high-speed storage arrays powering regional Gemini training partitions.',
    status: 'Verified Delivery',
    statusLevel: 'high-verified',
    dateSigned: 'Dec 2025'
  },
  {
    id: 'c17',
    company: 'AMPG',
    client: 'NVIDIA AI-RAN Integration Project',
    value: '$12M',
    duration: '1 Year',
    hardware: 'Custom Cryogenic Low-Noise Amplifiers',
    details: 'Pilot deployment of high-frequency wireless amplifiers in cell towers utilizing NVIDIA Aerial platform.',
    status: 'In-progress Deployment',
    statusLevel: 'in-progress',
    dateSigned: 'Mar 2026'
  }
];

export const CONGRESS_TRADES: CongressTrade[] = [
  { id: 'ct1', politician: 'Nancy Pelosi', chamber: 'House', stockSymbol: 'NVDA', transactionType: 'buy', amountRange: '$1,000,001 - $5,000,000', date: '2026-03-12', stockPrice: 151.20 },
  { id: 'ct2', politician: 'Tommy Tuberville', chamber: 'Senate', stockSymbol: 'DGXX', transactionType: 'buy', amountRange: '$15,001 - $50,000', date: '2026-05-08', stockPrice: 3.90 },
  { id: 'ct3', politician: 'Ro Khanna', chamber: 'House', stockSymbol: 'MU', transactionType: 'buy', amountRange: '$50,001 - $100,000', date: '2026-03-24', stockPrice: 125.50 },
  { id: 'ct4', politician: 'Mark Green', chamber: 'House', stockSymbol: 'AMD', transactionType: 'sell', amountRange: '$100,001 - $250,000', date: '2026-05-15', stockPrice: 174.50 },
  { id: 'ct5', politician: 'Sheldon Whitehouse', chamber: 'Senate', stockSymbol: 'MSFT', transactionType: 'buy', amountRange: '$15,001 - $50,000', date: '2026-04-10', stockPrice: 436.80 },
  { id: 'ct6', politician: 'Nancy Pelosi', chamber: 'House', stockSymbol: 'GOOG', transactionType: 'buy', amountRange: '$250,001 - $500,000', date: '2026-02-18', stockPrice: 176.40 },
  { id: 'ct7', politician: 'John Curtis', chamber: 'House', stockSymbol: 'META', transactionType: 'sell', amountRange: '$50,001 - $100,000', date: '2026-03-20', stockPrice: 536.10 }
];

export const MACRO_RISKS: MacroRisk[] = [
  { id: 'r1', category: 'Taiwan Geopolitics', title: 'Taiwan Strait Shipping Lane Control', impactRating: 'high', description: 'Any escalation around Taiwan directly impacts TSMC manufacturing facilities, potentially severing the entire high-performance silicon supply line for years.', dateUpdated: 'June 2026' },
  { id: 'r2', category: 'Regulatory Actions', title: 'GPU Power & Emission Ceilings', impactRating: 'medium', description: 'Draft regional policies seeking to cap maximum single-site datacenters above 100MW based on local grids, affecting expansion models.', dateUpdated: 'May 2026' },
  { id: 'r3', category: 'Chip Sanctions', title: 'Extended High-End Silicon Embargoes', impactRating: 'medium', description: 'US/EU expanding list of prohibited AI chips and accelerator models to extra jurisdictions, narrowing secondary market demand pipelines.', dateUpdated: 'June 2026' },
  { id: 'r4', category: 'Grid Integrity', title: 'Alabama & Northeast Power Shortfalls', impactRating: 'medium', description: 'Local power operators expressing capacity shortfalls due to high concurrent industrial load growth, dragging physical deployment schedules.', dateUpdated: 'June 2026' }
];
