export type JevAllocatorCandidate = {
  symbol: string;
  sector: string;
  peerCount?: number;
  peerComparabilityScore?: number;
  currentPrice?: number | null;
  averageCost?: number | null;
  quoteFresh?: boolean;
  currentWeightPct?: number | null;
  targetAllocationPct?: number | null;
  maxAllocationPct?: number | null;
  lossLimitPct?: number | null;
  exitRuleType?: string | null;
  exitRuleValue?: number | null;
  purchaseDate?: string | null;
};

export type JevAllocatorInput = {
  candidates: JevAllocatorCandidate[];
  capital: number;
  evidenceComplete: boolean;
  evidenceFresh: boolean;
  conflictCount: number;
  gateAction?: string | null;
  thesisBreaches?: string[];
  savedRulesLoaded?: boolean;
  maxPositionWeight?: number;
  maxSectorWeight?: number;
  minCashWeight?: number;
};

export type JevAllocatorResult = {
  allocationAllowed: boolean;
  blockedReasons: string[];
  suggestedWeights: Array<{ symbol: string; sector: string; weight: number; dollars: number }>;
  cashWeight: number;
  cashDollars: number;
  balanceScore: number | null;
  sectorWeights: Record<string, number>;
  alerts: string[];
  methodology: string;
};

const finite = (value: number) => Number.isFinite(value);
const roundWeight = (value: number) => Number(value.toFixed(6));

/**
 * Paper-only allocator. It deliberately does not turn peer comparability into
 * a stock-strength score: fundamental peer metrics must be supplied by an
 * evidence-backed source before they can influence investment ranking.
 */
export function buildJevPaperAllocator(input: JevAllocatorInput): JevAllocatorResult {
  const maxPosition = input.maxPositionWeight ?? 0.15;
  const maxSector = input.maxSectorWeight ?? 0.35;
  const minCash = input.minCashWeight ?? 0.05;
  if (!finite(input.capital) || input.capital <= 0) throw new Error('Capital must be a positive finite number.');
  if (![maxPosition, maxSector, minCash].every(finite) || maxPosition <= 0 || maxPosition > 1 || maxSector <= 0 || maxSector > 1 || minCash < 0 || minCash >= 1) {
    throw new Error('Invalid allocator risk limits.');
  }
  const seen = new Set<string>();
  for (const item of input.candidates) {
    const symbol = String(item.symbol || '').trim().toUpperCase();
    if (!symbol || seen.has(symbol)) throw new Error('Allocator candidates must have unique symbols.');
    seen.add(symbol);
    if (!String(item.sector || '').trim()) throw new Error('Every candidate requires a sector.');
    if (item.peerCount != null && (!Number.isInteger(item.peerCount) || item.peerCount < 0)) throw new Error('Peer count must be a non-negative integer.');
    if (item.peerComparabilityScore != null && (!finite(item.peerComparabilityScore) || item.peerComparabilityScore < 0 || item.peerComparabilityScore > 100)) throw new Error('Peer comparability must be between 0 and 100.');
    for (const field of ['currentWeightPct', 'targetAllocationPct', 'maxAllocationPct', 'lossLimitPct'] as const) {
      const value = item[field];
      if (value != null && (!finite(value) || value < 0 || value > 100)) throw new Error(field + ' must be between 0 and 100.');
    }
  }

  const action = String(input.gateAction || '').toLowerCase();
  const blockedReasons: string[] = [];
  if (!input.candidates.length) blockedReasons.push('Select at least one candidate.');
  if (input.savedRulesLoaded === false) blockedReasons.push('Saved portfolio rules could not be loaded; allocation is blocked until rule checks are available.');
  if (input.evidenceComplete !== true) blockedReasons.push('JEV evidence gate is incomplete.');
  if (input.evidenceFresh !== true) blockedReasons.push('Evidence freshness is not confirmed.');
  if (input.conflictCount > 0) blockedReasons.push('Resolve material evidence conflicts first.');
  if (['insufficient', 'gather_more', 'stop'].includes(action)) blockedReasons.push('JEV gate action blocks allocation.');
  if (input.thesisBreaches?.length) blockedReasons.push('Review invalidated thesis or breached holding rules: ' + input.thesisBreaches.join(', '));
  for (const candidate of input.candidates) {
    const symbol = candidate.symbol.toUpperCase();
    const price = Number(candidate.currentPrice);
    const cost = Number(candidate.averageCost);
    const hasFreshQuote = candidate.quoteFresh === true && Number.isFinite(price) && price > 0;
    if (hasFreshQuote && candidate.lossLimitPct != null && candidate.lossLimitPct > 0 && cost > 0 && price <= cost * (1 - candidate.lossLimitPct / 100)) {
      blockedReasons.push(symbol + ' is at or below its saved loss limit; review the holding rule before allocating.');
    }
    const exitType = String(candidate.exitRuleType || '').toLowerCase().replace(/[ _]+/g, '-');
    if (hasFreshQuote && ['price-stop', 'price-stop-loss'].includes(exitType) && Number(candidate.exitRuleValue) > 0 && price <= Number(candidate.exitRuleValue)) {
      blockedReasons.push(symbol + ' is at or below its saved price stop; review before allocating.');
    }
    if (exitType === 'time-limit' && candidate.purchaseDate && Number(candidate.exitRuleValue) > 0) {
      const purchaseTime = Date.parse(candidate.purchaseDate + (candidate.purchaseDate.length === 10 ? 'T00:00:00Z' : ''));
      if (Number.isFinite(purchaseTime) && Date.now() - purchaseTime >= Number(candidate.exitRuleValue) * 86400000) {
        blockedReasons.push(symbol + ' has reached its saved time limit; review the exit rule before allocating.');
      }
    }
    if (candidate.currentWeightPct != null && candidate.maxAllocationPct != null && candidate.currentWeightPct > candidate.maxAllocationPct + 0.5) {
      // Existing holdings may already be above the saved maximum; the allocator must not add to that exposure.
    }
  }
  const allocationAllowed = blockedReasons.length === 0;

  const suggestedWeights: JevAllocatorResult['suggestedWeights'] = [];
  const alerts: string[] = [];
  const sectorWeights: Record<string, number> = {};
  if (allocationAllowed) {
    const equalWeight = Math.min(maxPosition, (1 - minCash) / input.candidates.length);
    const desiredWeight = (candidate: JevAllocatorCandidate) => {
      const requested = candidate.targetAllocationPct == null ? equalWeight : candidate.targetAllocationPct / 100;
      const savedMax = candidate.maxAllocationPct == null ? maxPosition : Math.min(maxPosition, candidate.maxAllocationPct / 100);
      return Math.max(0, Math.min(requested, savedMax, maxPosition));
    };
    const grouped = new Map<string, JevAllocatorCandidate[]>();
    for (const candidate of input.candidates) {
      const sector = candidate.sector.trim().toLowerCase();
      grouped.set(sector, [...(grouped.get(sector) || []), candidate]);
    }
    for (const [sector, members] of grouped) {
      const requested = members.reduce((sum, member) => sum + desiredWeight(member), 0);
      const groupScale = requested > maxSector ? maxSector / requested : 1;
      const groupWeight = requested * groupScale;
      sectorWeights[sector] = roundWeight(groupWeight);
      for (const member of members) {
        const weight = desiredWeight(member) * groupScale;
        suggestedWeights.push({
          symbol: member.symbol.toUpperCase(),
          sector,
          weight: roundWeight(weight),
          dollars: Number((input.capital * roundWeight(weight)).toFixed(2)),
        });
        if (member.currentWeightPct != null && member.maxAllocationPct != null && member.currentWeightPct > member.maxAllocationPct + 0.5) {
          alerts.push(member.symbol.toUpperCase() + ' is already above its saved maximum allocation; proposed paper weight is capped and should be reviewed.');
        }
        if (member.exitRuleType && String(member.exitRuleType).toLowerCase().includes('thesis')) {
          alerts.push(member.symbol.toUpperCase() + ' has a qualitative thesis rule; confirm the thesis remains valid before manual approval.');
        }
        if (String(member.exitRuleType || '').toLowerCase().includes('trailing')) {
          alerts.push(member.symbol.toUpperCase() + ' has a trailing-stop rule; its peak-price reference must be checked before approval.');
        }
        if (member.quoteFresh !== true && (member.lossLimitPct != null || member.exitRuleType)) {
          alerts.push(member.symbol.toUpperCase() + ' has saved risk rules but no fresh quote to evaluate them.');
        }
      }
      if (requested > maxSector + 1e-9) alerts.push(`${sector} exposure capped at ${(maxSector * 100).toFixed(0)}% to protect diversification.`);
    }
    const requestedWeight = suggestedWeights.reduce((sum, row) => sum + row.weight, 0);
    const maxInvestedWeight = 1 - minCash;
    if (requestedWeight > maxInvestedWeight + 1e-9) {
      const scale = maxInvestedWeight / requestedWeight;
      for (const row of suggestedWeights) {
        row.weight = roundWeight(row.weight * scale);
        row.dollars = Number((input.capital * row.weight).toFixed(2));
      }
      for (const sector of Object.keys(sectorWeights)) {
        sectorWeights[sector] = roundWeight(suggestedWeights.filter(row => row.sector === sector).reduce((sum, row) => sum + row.weight, 0));
      }
      alerts.push('Total investment capped to preserve the minimum cash reserve.');
    }
    const invested = suggestedWeights.reduce((sum, row) => sum + row.weight, 0);
    const investedDollars = suggestedWeights.reduce((sum, row) => sum + row.dollars, 0);
    const cashDollars = Number((input.capital - investedDollars).toFixed(2));
    const cashWeight = input.capital > 0 ? cashDollars / input.capital : Math.max(0, 1 - invested);
    if (cashWeight < minCash - 1e-6) alerts.push('Suggested allocation would breach the minimum cash reserve.');
    if (suggestedWeights.some(row => row.weight > maxPosition + 1e-9)) alerts.push('A suggested position exceeds the maximum position limit.');
    const score = Math.max(0, Math.min(100, 100 - Math.max(0, Math.max(...Object.values(sectorWeights), 0) - 0.2) * 100));
    return {
      allocationAllowed, blockedReasons, suggestedWeights: suggestedWeights.sort((a, b) => a.symbol.localeCompare(b.symbol)),
      cashWeight: roundWeight(cashWeight), cashDollars,
      balanceScore: Number(score.toFixed(1)), sectorWeights, alerts,
      methodology: 'Equal-weight paper proposal, capped at 15% per holding and 35% per sector, with at least 5% cash. Peer coverage is shown as context only; it does not rank stocks. No broker orders are sent.',
    };
  }

  if (input.candidates.length === 0) alerts.push('No candidates selected.');
  else alerts.push('No suggested weights are released until JEV evidence is complete, fresh, conflict-free, and allowed by the gate.');
  if (input.candidates.some(item => (item.peerCount ?? 0) === 0)) alerts.push('At least one candidate has no configured peer comparison; peer coverage is incomplete.');
  return {
    allocationAllowed, blockedReasons, suggestedWeights: [], cashWeight: 1, cashDollars: Number(input.capital.toFixed(2)),
    balanceScore: null, sectorWeights: {}, alerts,
    methodology: 'Allocation blocked. Peer comparability is not fundamental peer strength and cannot override missing evidence. Paper-only; manual approval required.',
  };
}
