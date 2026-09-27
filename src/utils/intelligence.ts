export type PricePoint = { price: number; changePct: number };
export type IntelligenceGroup = {
  name: string;
  members: string[];
  avgChange: number;
  breadth: number;
  relativeToUniverse: number;
  score: number;
};

export type PairSignal = {
  left: string;
  right: string;
  spread: number | null;
  label: string;
};

export type IntelligenceSnapshot = {
  groups: IntelligenceGroup[];
  portfolioBreadth: number;
  portfolioAverage: number;
  universeAverage: number;
  topGroup: string | null;
  bottomGroup: string | null;
  pairSignals: PairSignal[];
};

const GROUP_MEMBERS: Record<string, string[]> = {
  'AI Infrastructure': ['DGXX', 'NBIS', 'VIVO', 'IREN', 'CIFR'],
  'AI Compute': ['NVDA', 'AMD', 'CBRS', 'QCOM'],
  'AI Platform': ['MSFT', 'META', 'GOOGL', 'AMZN', 'AAPL'],
  'Enterprise Software': ['NOW', 'CRM', 'TEAM', 'IBM'],
  'Memory': ['DRAM', 'MU', 'SNDK', '000660.KS'],
  'Semiconductors': ['SOXL', 'SOXX', 'TSM', 'INTC'],
  'Healthcare': ['PHVS'],
  'Fintech': ['SOFI'],
};

const PAIRS: Array<[string,string,string]> = [
  ['NVDA','AMD','Accelerator relative strength'],
  ['NOW','CRM','Enterprise software relative strength'],
  ['MU','000660.KS','Memory cycle spread'],
  ['NBIS','IREN','AI infrastructure capacity'],
  ['DGXX','CIFR','Power-to-compute exposure'],
  ['META','GOOGL','AI platform relative strength'],
];

function avg(values: number[]) {
  return values.length ? values.reduce((a,b) => a+b, 0) / values.length : 0;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function buildIntelligence(prices: Record<string, PricePoint>): IntelligenceSnapshot {
  const allReturns = Object.values(prices)
    .map(x => x?.changePct)
    .filter((x): x is number => typeof x === 'number' && Number.isFinite(x));

  const universeAverage = avg(allReturns);

  const groups = Object.entries(GROUP_MEMBERS).map(([name, members]) => {
    const returns = members
      .map(t => prices[t]?.changePct)
      .filter((x): x is number => typeof x === 'number' && Number.isFinite(x));

    const avgChange = avg(returns);
    const breadth = returns.length ? returns.filter(x => x >= 0).length / returns.length : 0;
    const relativeToUniverse = avgChange - universeAverage;

    // Transparent relative-strength score:
    // 50 baseline + return-vs-universe + breadth contribution.
    const score = clamp(50 + relativeToUniverse * 7 + (breadth - 0.5) * 30, 0, 100);

    return {
      name,
      members,
      avgChange,
      breadth,
      relativeToUniverse,
      score,
    };
  });

  const portfolio = ['DGXX','DRAM','SOXL','NVDA','MSFT','NBIS','VIVO','META','NOW','PHVS'];
  const portfolioReturns = portfolio
    .map(t => prices[t]?.changePct)
    .filter((x): x is number => typeof x === 'number' && Number.isFinite(x));

  const pairSignals = PAIRS.map(([left,right,label]) => ({
    left,
    right,
    spread: typeof prices[left]?.changePct === 'number' && typeof prices[right]?.changePct === 'number'
      ? prices[left].changePct - prices[right].changePct
      : null,
    label,
  }));

  const sorted = [...groups].sort((a,b) => b.score - a.score);

  return {
    groups,
    portfolioBreadth: portfolioReturns.length ? portfolioReturns.filter(x => x >= 0).length / portfolioReturns.length : 0,
    portfolioAverage: avg(portfolioReturns),
    universeAverage,
    topGroup: sorted[0]?.name || null,
    bottomGroup: sorted.at(-1)?.name || null,
    pairSignals,
  };
}
