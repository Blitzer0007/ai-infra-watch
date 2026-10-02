import { PORTFOLIO_POSITIONS } from './portfolioPositions';

export type ExposureLevel = 'Direct' | 'Secondary' | 'Limited';
export type MacroScenario = 'taiwan' | 'power' | 'export';

export type ExposureEvidenceItem = {
  level: ExposureLevel;
  basis: string;
  sourceCounts: {
    profile: number;
    contracts: number;
    news: number;
  };
};

type ContractLike = {
  company?: string;
  client?: string;
  value?: string;
  duration?: string;
  hardware?: string;
  details?: string;
  status?: string;
};

type NewsLike = {
  title?: string;
  summary?: string;
  description?: string;
  symbols?: string[] | string;
};

const BASELINE: Record<string, Record<MacroScenario, ExposureLevel>> = {
  DGXX: { taiwan: 'Limited', power: 'Direct', export: 'Limited' },
  DRAM: { taiwan: 'Direct', power: 'Secondary', export: 'Secondary' },
  SOXL: { taiwan: 'Direct', power: 'Secondary', export: 'Direct' },
  NVDA: { taiwan: 'Direct', power: 'Secondary', export: 'Direct' },
  MSFT: { taiwan: 'Secondary', power: 'Secondary', export: 'Secondary' },
  NBIS: { taiwan: 'Secondary', power: 'Direct', export: 'Secondary' },
  VIVO: { taiwan: 'Limited', power: 'Direct', export: 'Limited' },
  META: { taiwan: 'Secondary', power: 'Secondary', export: 'Secondary' },
  NOW: { taiwan: 'Limited', power: 'Secondary', export: 'Limited' },
  PHVS: { taiwan: 'Limited', power: 'Limited', export: 'Limited' },
};

const KEYWORDS: Record<MacroScenario, string[]> = {
  taiwan: ['taiwan', 'tsmc', 'taiwanese', 'foundry', 'hbm', 'dram', 'nand'],
  power: ['power', 'grid', 'data center', 'datacenter', 'mw', 'gw', 'utility', 'nuclear', 'solar', 'colocation', 'facility', 'campus'],
  export: ['export', 'china', 'sanction', 'embargo', 'restricted', 'restriction', 'export control', 'chip controls', 'advanced chip', 'gpu export'],
};

const LEVEL_SCORE: Record<ExposureLevel, number> = {
  Limited: 0.2,
  Secondary: 0.55,
  Direct: 1,
};

function clean(value: unknown) {
  return String(value ?? '').toLowerCase();
}

function matches(text: string, keywords: string[]) {
  return keywords.filter(keyword => text.includes(keyword));
}

function toLevel(score: number): ExposureLevel {
  if (score >= 0.78) return 'Direct';
  if (score >= 0.45) return 'Secondary';
  return 'Limited';
}

export function deriveExposure(
  symbol: string,
  scenario: MacroScenario,
  contracts: ContractLike[] = [],
  news: NewsLike[] = [],
  positions: PortfolioPosition[] = PORTFOLIO_POSITIONS,
): ExposureEvidenceItem {
  const position = positions.find(item => item.symbol === symbol);
  const keywords = KEYWORDS[scenario];

  const profileText = [
    position?.name,
    position?.group,
    position?.theme,
    position?.geo,
    position?.notes,
  ].map(clean).join(' ');

  const symbolUpper = symbol.toUpperCase();
  const relatedContracts = contracts.filter(item =>
    clean(item.company).toUpperCase() === symbolUpper ||
    clean(item.client).toUpperCase().includes(symbolUpper)
  );

  const contractText = relatedContracts
    .map(item => [
      item.company, item.client, item.value, item.duration,
      item.hardware, item.details, item.status,
    ].map(clean).join(' '))
    .join(' ');

  const relatedNews = news.filter(item => {
    const symbols = Array.isArray(item.symbols)
      ? item.symbols.join(' ')
      : clean(item.symbols);
    const searchable = [item.title, item.summary, item.description, symbols]
      .map(clean)
      .join(' ');
    return searchable.toUpperCase().includes(symbolUpper);
  });

  const newsText = relatedNews
    .map(item => [item.title, item.summary, item.description].map(clean).join(' '))
    .join(' ');

  const profileHits = matches(profileText, keywords);
  const contractHits = matches(contractText, keywords);
  const newsHits = matches(newsText, keywords);

  const uniqueHits = [...new Set([...profileHits, ...contractHits, ...newsHits])];
  const baselineScore = LEVEL_SCORE[BASELINE[symbol]?.[scenario] || 'Limited'];

  // Evidence adjusts the static baseline rather than replacing it entirely.
  // Company metadata is weak context; a matching SEC contract or recent news
  // headline provides stronger incremental support.
  const evidenceBonus =
    Math.min(profileHits.length, 2) * 0.08 +
    Math.min(contractHits.length, 3) * 0.16 +
    Math.min(newsHits.length, 2) * 0.10;

  const score = Math.min(1, baselineScore * 0.72 + evidenceBonus);
  const level = toLevel(score);

  const basis = uniqueHits.length
    ? uniqueHits.slice(0, 4).join(', ')
    : 'baseline portfolio exposure; no matching live evidence';

  return {
    level,
    basis,
    sourceCounts: {
      profile: profileHits.length,
      contracts: contractHits.length,
      news: newsHits.length,
    },
  };
}

export function derivePortfolioExposure(
  symbols: string[],
  contracts: ContractLike[] = [],
  news: NewsLike[] = [],
  positions: PortfolioPosition[] = PORTFOLIO_POSITIONS,
) {
  return symbols.map(symbol => ({
    symbol,
    taiwan: deriveExposure(symbol, 'taiwan', contracts, news, positions),
    power: deriveExposure(symbol, 'power', contracts, news, positions),
    export: deriveExposure(symbol, 'export', contracts, news, positions),
  }));
}

export { BASELINE };
