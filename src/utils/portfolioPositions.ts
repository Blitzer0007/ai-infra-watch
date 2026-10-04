import type { IntelligenceSnapshot, PricePoint } from './intelligence';
import type { PortfolioPurchaseLot, StoredPortfolioHolding, BrokerAlert, RuleStage } from './portfolioApi';
import { STOCK_UNIVERSE } from './stockUniverse';

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
  decisionThesis?: string;
  lossLimitPct?: number | null;
  exitRuleType?: string | null;
  exitRuleValue?: number | null;
  exitRuleText?: string;
  practicalNotes?: string;
  brokerAlertPrices?: number[];
  brokerAlerts?: BrokerAlert[];
  brokerAlertsReviewRequired?: boolean;
  ruleStages?: RuleStage[];
  ruleStageState?: Record<string, any>;
  riskGroup?: string | null;
  riskBeta?: number | null;
  riskLeverage?: number;
  scenarioShockPct?: number;
  targetAllocationPct?: number | null;
  maxAllocationPct?: number | null;
  id?: string;
  purchaseDate?: string | null;
  purchaseLotCount?: number;
  firstPurchaseDate?: string | null;
  currentLotFirstPurchaseDate?: string | null;
  holdingPeriodDays?: number | null;
};

export type PositionAnalysis = PortfolioPosition & {
  livePrice: number | null;
  liveRetrievedAt: string | null;
  liveProvider: string | null;
  liveStale: boolean;
  currentValue: number | null;
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
  whatIfProfitAt10Pct: number | null;
  whatIfProfitAt20Pct: number | null;
  potentialUpsideSignal: 'SUPPORTED' | 'MIXED' | 'WEAK' | 'INSUFFICIENT DATA';
  averageInAlert: boolean;
  recoveryAlert: boolean;
  strategyContext: string;
  portfolioWeight?: number;
  minorPosition?: boolean;
};

export const PORTFOLIO_SNAPSHOT = null;
export const PORTFOLIO_AS_OF = null;
export const PORTFOLIO_POSITIONS: PortfolioPosition[] = [];

function enrichHolding(holding: StoredPortfolioHolding): PortfolioPosition {
  const meta = STOCK_UNIVERSE.find(item => item.symbol === holding.symbol);
  const lots: PortfolioPurchaseLot[] = Array.isArray(holding.purchaseLots) ? holding.purchaseLots : [];
  const currentLotFirstPurchaseDate = lots
    .map(lot => lot.purchaseDate)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
  const firstPurchaseDate = holding.purchaseDate ?? currentLotFirstPurchaseDate ?? null;
  const holdingPeriodDays = firstPurchaseDate
    ? Math.max(0, Math.floor((Date.now() - new Date(firstPurchaseDate + 'T00:00:00Z').getTime()) / 86400000))
    : null;
  const investedValue = holding.quantity * holding.averageCost;
  return {
    id: holding.id,
    symbol: holding.symbol,
    name: meta?.name ?? holding.symbol,
    group: meta?.group ?? 'Custom Holding',
    theme: meta?.theme ?? 'Custom holding',
    peers: meta?.peers ?? [],
    geo: meta?.geo ?? 'Not configured',
    quantity: holding.quantity,
    averageCost: holding.averageCost,
    investedValue,
    snapshotCurrentValue: investedValue,
    notes: holding.notes,
    decisionThesis: holding.decisionThesis || holding.notes || '',
    lossLimitPct: holding.lossLimitPct ?? null,
    exitRuleType: holding.exitRuleType ?? null,
    exitRuleValue: holding.exitRuleValue ?? null,
    exitRuleText: holding.exitRuleText || '',
    practicalNotes: holding.practicalNotes || '',
    brokerAlertPrices: holding.brokerAlertPrices || [],
    brokerAlerts: holding.brokerAlerts || [],
    brokerAlertsReviewRequired: Boolean(holding.brokerAlertsReviewRequired),
    ruleStages: holding.ruleStages || [],
    ruleStageState: holding.ruleStageState || {},
    riskGroup: holding.riskGroup ?? null,
    riskBeta: holding.riskBeta ?? null,
    riskLeverage: holding.riskLeverage ?? 1,
    scenarioShockPct: holding.scenarioShockPct ?? 15,
    targetAllocationPct: holding.targetAllocationPct ?? null,
    maxAllocationPct: holding.maxAllocationPct ?? null,
    purchaseDate: firstPurchaseDate,
    purchaseLotCount: lots.length,
    firstPurchaseDate,
    currentLotFirstPurchaseDate,
    holdingPeriodDays,
  };
}

export function mapStoredPortfolioHoldings(holdings: StoredPortfolioHolding[]): PortfolioPosition[] {
  return holdings.map(enrichHolding);
}

function avg(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function buildPositionAnalyses(
  prices: Record<string, PricePoint>,
  intelligence: IntelligenceSnapshot,
  positions: PortfolioPosition[] = PORTFOLIO_POSITIONS,
): PositionAnalysis[] {
  return positions.map((position) => {
    const quote = prices[position.symbol];
    const livePrice = quote?.price ?? null;
    const liveIsFresh = livePrice != null && quote?.stale !== true;
    const currentValue = liveIsFresh ? livePrice * position.quantity : null;
    const pnl = liveIsFresh ? (currentValue ?? 0) - position.investedValue : 0;
    const pnlPct = liveIsFresh && position.investedValue ? (pnl / position.investedValue) * 100 : 0;
    const group = intelligence.groups.find((item) => item.name === position.group) ?? null;

    const peerReturns = position.peers
      .map((symbol) => prices[symbol])
      .filter((peer): peer is PricePoint => peer != null && peer.stale !== true)
      .map((peer) => peer.changePct)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const peerAverageChange = avg(peerReturns);
    const dailyChangePct = liveIsFresh ? (quote?.changePct ?? null) : null;
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

    let state: PositionAnalysis['state'] = 'INSUFFICIENT DATA';
    if (liveIsFresh && riskEligible) state = 'RISK REVIEW';
    else if (liveIsFresh && addEligible) state = 'ADD REVIEW';
    else if (liveIsFresh) state = 'HOLD / WATCH';

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

    const averageInAlert = liveIsFresh &&
      pnlPct < 0 &&
      groupScore != null &&
      groupBreadth != null &&
      relativeToUniverse != null &&
      vsPeers != null &&
      groupScore >= (isLeveraged ? 68 : 62) &&
      groupBreadth >= (isLeveraged ? 0.67 : 0.50) &&
      relativeToUniverse >= 0 &&
      vsPeers >= 0;

    const recoveryAlert = liveIsFresh &&
      pnlPct < 0 &&
      dailyChangePct != null &&
      dailyChangePct < 0 &&
      groupScore != null &&
      groupBreadth != null &&
      relativeToUniverse != null &&
      vsPeers != null &&
      groupScore >= (isLeveraged ? 68 : 62) &&
      groupBreadth >= (isLeveraged ? 0.67 : 0.50) &&
      relativeToUniverse >= 0 &&
      vsPeers >= 0;

    return {
      ...position,
      livePrice,
      liveRetrievedAt: quote?.retrievedAt ?? null,
      liveProvider: quote?.provider ?? null,
      liveStale: quote?.stale === true,
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
      whatIfProfitAt10Pct: livePrice == null || !liveIsFresh ? null : (livePrice * 1.10 - position.averageCost) * position.quantity,
      whatIfProfitAt20Pct: livePrice == null || !liveIsFresh ? null : (livePrice * 1.20 - position.averageCost) * position.quantity,
      potentialUpsideSignal: groupScore == null || groupBreadth == null
        ? 'INSUFFICIENT DATA'
        : groupScore >= 62 && groupBreadth >= 0.5
          ? 'SUPPORTED'
          : groupScore >= 48 && groupBreadth >= 0.4
            ? 'MIXED'
            : 'WEAK',
      averageInAlert,
      recoveryAlert,
      strategyContext: recoveryAlert
        ? 'The holding is declining today and remains below cost, while group breadth, relative strength and peer-relative evidence remain supportive. This is a recovery-watch alert for review, not an automatic buy instruction.'
        : averageInAlert
          ? 'Price is below the average cost, while current group breadth/relative strength and peer-relative evidence remain supportive. This is an evidence-gated average-in review, not an automatic buy instruction.'
          : state === 'RISK REVIEW'
          ? 'The position is under pressure while supporting group evidence is weak or deteriorating. Review exposure and the original thesis before adding.'
          : state === 'ADD REVIEW'
            ? 'Current group breadth/relative strength and peer-relative evidence meet the configured review thresholds. This is a review signal, not an automatic buy instruction.'
            : state === 'INSUFFICIENT DATA'
              ? 'A fresh market quote is required before calculating current P&L and review signals.'
              : 'Continue monitoring the holding against its purchase thesis, group strength, peers, catalysts and risk signals before changing exposure.',
    };
  });
}
