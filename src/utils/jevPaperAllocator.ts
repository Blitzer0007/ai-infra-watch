export type JevAllocatorCandidate = {
  symbol: string;
  sector: string;
  peerCount?: number;
  peerComparabilityScore?: number;
};

export type JevAllocatorInput = {
  candidates: JevAllocatorCandidate[];
  capital: number;
  evidenceComplete: boolean;
  evidenceFresh: boolean;
  conflictCount: number;
  gateAction?: string | null;
  thesisBreaches?: string[];
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
  }

  const action = String(input.gateAction || '').toLowerCase();
  const blockedReasons: string[] = [];
  if (!input.candidates.length) blockedReasons.push('Select at least one candidate.');
  if (input.evidenceComplete !== true) blockedReasons.push('JEV evidence gate is incomplete.');
  if (input.evidenceFresh !== true) blockedReasons.push('Evidence freshness is not confirmed.');
  if (input.conflictCount > 0) blockedReasons.push('Resolve material evidence conflicts first.');
  if (['insufficient', 'gather_more', 'stop'].includes(action)) blockedReasons.push('JEV gate action blocks allocation.');
  if (input.thesisBreaches?.length) blockedReasons.push('Review invalidated thesis or breached holding rules: ' + input.thesisBreaches.join(', '));
  const allocationAllowed = blockedReasons.length === 0;

  const suggestedWeights: JevAllocatorResult['suggestedWeights'] = [];
  const alerts: string[] = [];
  const sectorWeights: Record<string, number> = {};
  if (allocationAllowed) {
    const equalWeight = Math.min(maxPosition, (1 - minCash) / input.candidates.length);
    const grouped = new Map<string, JevAllocatorCandidate[]>();
    for (const candidate of input.candidates) {
      const sector = candidate.sector.trim().toLowerCase();
      grouped.set(sector, [...(grouped.get(sector) || []), candidate]);
    }
    for (const [sector, members] of grouped) {
      const requested = equalWeight * members.length;
      const groupWeight = Math.min(requested, maxSector);
      const perName = members.length ? groupWeight / members.length : 0;
      sectorWeights[sector] = roundWeight(groupWeight);
      for (const member of members) suggestedWeights.push({
        symbol: member.symbol.toUpperCase(),
        sector,
        weight: roundWeight(perName),
        dollars: Number((input.capital * perName).toFixed(2)),
      });
      if (requested > maxSector + 1e-9) alerts.push(`${sector} exposure capped at ${(maxSector * 100).toFixed(0)}% to protect diversification.`);
    }
    const invested = suggestedWeights.reduce((sum, row) => sum + row.weight, 0);
    const cashWeight = Math.max(0, 1 - invested);
    if (cashWeight < minCash - 1e-9) alerts.push('Suggested allocation would breach the minimum cash reserve.');
    if (suggestedWeights.some(row => row.weight > maxPosition + 1e-9)) alerts.push('A suggested position exceeds the maximum position limit.');
    const score = Math.max(0, Math.min(100, 100 - Math.max(0, Math.max(...Object.values(sectorWeights), 0) - 0.2) * 100));
    return {
      allocationAllowed, blockedReasons, suggestedWeights: suggestedWeights.sort((a, b) => a.symbol.localeCompare(b.symbol)),
      cashWeight: roundWeight(cashWeight), cashDollars: Number((input.capital * cashWeight).toFixed(2)),
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
