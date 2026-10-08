import { PORTFOLIO_POSITIONS, type PortfolioPosition } from './portfolioPositions';

export type ExposureLevel = 'Direct' | 'Secondary' | 'Limited';
export type ExposureAssessment = 'assessed' | 'not_assessed';
export type MacroScenario = 'taiwan' | 'power' | 'export';

export type ExposureEvidenceItem = {
  level: ExposureLevel;
  assessment: ExposureAssessment;
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

function termPattern(keyword: string) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('\\b' + escaped.replace(/\\s+/g, '\\s+') + '\\b', 'i');
}

function matches(text: string, keywords: string[]) {
  return keywords.filter(keyword => termPattern(keyword).test(text));
}

function symbolMatches(text: string, symbol: string) {
  const normalized = String(symbol || '').trim().toUpperCase();
  if (!normalized) return false;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('\\b' + escaped + '\\b', 'i').test(text);
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
    symbolMatches(clean(item.client), symbolUpper)
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
    return symbolMatches(searchable, symbolUpper);
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
  const assessed = Boolean(BASELINE[symbolUpper]?.[scenario]) || uniqueHits.length > 0;

  const basis = uniqueHits.length
    ? uniqueHits.slice(0, 4).join(', ')
    : 'baseline portfolio exposure; no matching live evidence';

  return {
    level,
    assessment: assessed ? 'assessed' : 'not_assessed',
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


export type ExposureValidationStatus = 'VALIDATED' | 'PARTIAL' | 'NOT ASSESSED';

export type ExposureValidation = {
  status: ExposureValidationStatus;
  holdings: number;
  dimensions: number;
  assessedDimensions: number;
  notAssessedDimensions: number;
  assessedPct: number;
  fullyAssessedHoldings: number;
};

const DIMENSIONS: MacroScenario[] = ['taiwan', 'power', 'export'];

export function validatePortfolioExposure(
  rows: Array<{
    symbol: string;
    taiwan: ExposureEvidenceItem;
    power: ExposureEvidenceItem;
    export: ExposureEvidenceItem;
  }>,
): ExposureValidation {
  const holdings = rows.length;
  const dimensions = holdings * DIMENSIONS.length;
  const assessedDimensions = rows.reduce(
    (sum, row) => sum + DIMENSIONS.filter(scenario => row[scenario]?.assessment === 'assessed').length,
    0,
  );
  const notAssessedDimensions = Math.max(0, dimensions - assessedDimensions);
  const fullyAssessedHoldings = rows.filter(row =>
    DIMENSIONS.every(scenario => row[scenario]?.assessment === 'assessed'),
  ).length;
  const assessedPct = dimensions > 0 ? assessedDimensions / dimensions * 100 : 0;

  return {
    status: dimensions === 0 || assessedDimensions === 0
      ? 'NOT ASSESSED'
      : assessedDimensions === dimensions
        ? 'VALIDATED'
        : 'PARTIAL',
    holdings,
    dimensions,
    assessedDimensions,
    notAssessedDimensions,
    assessedPct: Number(assessedPct.toFixed(1)),
    fullyAssessedHoldings,
  };
}


export type MacroRiskInput = {
  title?: string | null;
  category?: string | null;
  impactRating?: string | null;
};

export type ExposureWeightedMacroLoad = {
  assessedLoad: number;
  worstCaseLoad: number;
  assessedCoveragePct: number;
  assessedExposureByScenario: Record<MacroScenario, number>;
  worstCaseExposureByScenario: Record<MacroScenario, number>;
  scenarioSeverity: Record<MacroScenario, number>;
};

const SCENARIO_MATCHERS: Record<MacroScenario, RegExp> = {
  taiwan: /\b(taiwan|tsmc|advanced[ -]?node|foundry)\b/i,
  power: /\b(power|grid|data[ -]?center)\b/i,
  export: /\b(export|chip[ -]?control|china|sanction|embargo)\b/i,
};

function riskSeverity(risk: MacroRiskInput): number {
  const rating = String(risk?.impactRating || '').toLowerCase();
  return rating === 'high' ? 12 : rating === 'medium' ? 6 : 0;
}

function scenarioSeverityFromRisks(scenario: MacroScenario, risks: MacroRiskInput[]) {
  return Math.min(12, Math.max(0, risks
    .filter(risk => SCENARIO_MATCHERS[scenario].test(String(risk?.title || '') + ' ' + String(risk?.category || '')))
    .reduce((max, risk) => Math.max(max, riskSeverity(risk)), 0)));
}

/**
 * Converts exposure evidence into a capped 30-point macro load.
 * Assessed load uses only validated dimensions. Worst case assumes any
 * unassessed dimension could be Direct exposure, making the missing-data
 * effect visible instead of silently lowering the headline risk.
 */
export function calculateExposureWeightedMacroLoad(
  rows: Array<{
    symbol: string;
    value: number;
    taiwan: ExposureEvidenceItem;
    power: ExposureEvidenceItem;
    export: ExposureEvidenceItem;
  }>,
  risks: MacroRiskInput[] = [],
): ExposureWeightedMacroLoad {
  const scenarios: MacroScenario[] = ['taiwan', 'power', 'export'];
  const totalValue = rows.reduce((sum, row) => sum + Math.max(0, Number(row.value) || 0), 0);
  const severity = Object.fromEntries(
    scenarios.map(scenario => [scenario, scenarioSeverityFromRisks(scenario, risks)]),
  ) as Record<MacroScenario, number>;

  const assessedExposureByScenario = {} as Record<MacroScenario, number>;
  const worstCaseExposureByScenario = {} as Record<MacroScenario, number>;

  scenarios.forEach(scenario => {
    if (!totalValue) {
      assessedExposureByScenario[scenario] = 0;
      worstCaseExposureByScenario[scenario] = 0;
      return;
    }
    let assessedWeighted = 0;
    let worstWeighted = 0;
    rows.forEach(row => {
      const weight = Math.max(0, Number(row.value) || 0) / totalValue;
      const evidence = row[scenario];
      const assessedLevel = evidence?.assessment === 'assessed' ? LEVEL_SCORE[evidence.level] : 0;
      const worstLevel = evidence?.assessment === 'assessed' ? LEVEL_SCORE[evidence.level] : 1;
      assessedWeighted += weight * assessedLevel;
      worstWeighted += weight * worstLevel;
    });
    assessedExposureByScenario[scenario] = assessedWeighted;
    worstCaseExposureByScenario[scenario] = worstWeighted;
  });

  const assessedLoad = Math.min(
    30,
    scenarios.reduce((sum, scenario) => sum + severity[scenario] * assessedExposureByScenario[scenario], 0),
  );
  const worstCaseLoad = Math.min(
    30,
    scenarios.reduce((sum, scenario) => sum + severity[scenario] * worstCaseExposureByScenario[scenario], 0),
  );

  const dimensions = rows.length * scenarios.length;
  const assessedDimensions = rows.reduce(
    (sum, row) => sum + scenarios.filter(scenario => row[scenario]?.assessment === 'assessed').length,
    0,
  );

  return {
    assessedLoad: Number(assessedLoad.toFixed(1)),
    worstCaseLoad: Number(worstCaseLoad.toFixed(1)),
    assessedCoveragePct: dimensions ? Number((assessedDimensions / dimensions * 100).toFixed(1)) : 0,
    assessedExposureByScenario,
    worstCaseExposureByScenario,
    scenarioSeverity: severity,
  };
}

export { BASELINE };