import snapshot from '../../data/portfolio_snapshot.json';
import type { IntelligenceSnapshot, PricePoint } from './intelligence';

export type PortfolioPosition = {
  symbol: string;
  name: string;
  group: string;
  theme: string;
  peers: string[];
  geo: string;
  quantity: number;
  averageCost: number;
  investedValue: number;
  snapshotCurrentValue: number;
  notes?: string;
};

export type PositionAnalysis = PortfolioPosition & {
  livePrice: number | null;
  currentValue: number;
  pnl: number;
  pnlPct: number;
  dailyChangePct: number | null;
  groupScore: number | null;
  groupBreadth: number | null;
  relativeToUniverse: number | null;
  peerAverageChange: number | null;
  vsPeers: number | null;
  state: 'ADD REVIEW' | 'HOLD / WATCH' | 'RISK REVIEW' | 'INSUFFICIENT DATA';
  rationale: string;
  addTrigger: string;
  riskTrigger: string;
};

export const PORTFOLIO_SNAPSHOT = snapshot.portfolio;
export const PORTFOLIO_AS_OF = snapshot.asOf;
export const PORTFOLIO_POSITIONS: PortfolioPosition[] = snapshot.positions;

function avg(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function buildPositionAnalyses(
  prices: Record<string, PricePoint>,
  intelligence: IntelligenceSnapshot,
): PositionAnalysis[] {
  return PORTFOLIO_POSITIONS.map((position) => {
    const quote = prices[position.symbol];
    const livePrice = quote?.price ?? null;
    const currentValue = livePrice != null ? livePrice * position.quantity : position.snapshotCurrentValue;
    const pnl = currentValue - position.investedValue;
    const pnlPct = position.investedValue ? (pnl / position.investedValue) * 100 : 0;
    const group = intelligence.groups.find((item) => item.name === position.group) ?? null;

    const peerReturns = position.peers
      .map((symbol) => prices[symbol]?.changePct)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const peerAverageChange = avg(peerReturns);
    const dailyChangePct = quote?.changePct ?? null;
    const vsPeers = dailyChangePct != null && peerAverageChange != null
      ? dailyChangePct - peerAverageChange
      : null;

    const isLeveraged = position.symbol === 'SOXL';
    const groupScore = group?.score ?? null;
    const groupBreadth = group?.breadth ?? null;
    const relativeToUniverse = group?.relativeToUniverse ?? null;

    const addEligible = groupScore != null &&
      groupBreadth != null &&
      relativeToUniverse != null &&
      groupScore >= (isLeveraged ? 68 : 62) &&
      groupBreadth >= (isLeveraged ? 0.67 : 0.50) &&
      relativeToUniverse >= 0 &&
      (vsPeers == null || vsPeers >= 0);

    const riskEligible = groupScore != null && (
      (groupScore <= (isLeveraged ? 45 : 38) && pnlPct <= -10) ||
      (vsPeers != null && vsPeers <= (isLeveraged ? -1.5 : -1.0) && groupBreadth != null && groupBreadth < 0.50)
    );

    let state: PositionAnalysis['state'] = 'HOLD / WATCH';
    if (!quote && position.snapshotCurrentValue == null) state = 'INSUFFICIENT DATA';
    else if (riskEligible) state = 'RISK REVIEW';
    else if (addEligible) state = 'ADD REVIEW';

    const rationale = state === 'ADD REVIEW'
      ? 'Group momentum, breadth and relative strength currently align with the configured review thresholds.'
      : state === 'RISK REVIEW'
        ? 'The model shows weaker group conditions and/or peer-relative deterioration while the position is under pressure.'
        : 'Current evidence does not meet the configured thresholds for an add or risk review.';

    const addTrigger = isLeveraged
      ? 'Review an add only when semiconductor group score ≥68, breadth ≥67%, and peer-relative return is non-negative.'
      : 'Review an add when group score ≥62, breadth ≥50%, group relative strength is ≥0, and peer-relative return is non-negative.';

    const riskTrigger = isLeveraged
      ? 'Reassess exposure when group score falls below 45 or the position trails tracked peers by ≥1.5 percentage points while group breadth is weak.'
      : 'Reassess exposure when group score ≤38 with a ≥10% position drawdown, or when the position trails tracked peers by ≥1.0 point with group breadth below 50%.';

    return {
      ...position,
      livePrice,
      currentValue,
      pnl,
      pnlPct,
      dailyChangePct,
      groupScore,
      groupBreadth,
      relativeToUniverse,
      peerAverageChange,
      vsPeers,
      state,
      rationale,
      addTrigger,
      riskTrigger,
    };
  });
}
