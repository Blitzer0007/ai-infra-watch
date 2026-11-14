import { usablePricePoint, type IntelligenceSnapshot, type PricePoint } from './intelligence';
import type { PortfolioPurchaseLot, StoredPortfolioHolding, BrokerAlert, RuleStage } from './portfolioApi';
import { STOCK_UNIVERSE } from './stockUniverse';
import { evaluateDeclaredQuote } from './quoteAdmission';
import type { DataQualityStatus } from './decisionEligibility';
import { calculatePortfolioConcentration } from './measurement';

export type PortfolioPosition = {
  symbol: string;
  name: string;
  group: string;
  theme: string;
  peers: string[];
  geo: string;
  quantity: number;
  averageCost: number;
  investedValue: number | null;
  snapshotCurrentValue: number | null;
  currency: string | null;
  quantitySupported?: boolean;
  costBasisSupported?: boolean;
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
  pnl: number | null;
  pnlPct: number | null;
  valuationStatus: DataQualityStatus;
  valuationIssues: string[];
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
  portfolioWeight?: number | null;
  minorPosition?: boolean | null;
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
  const original = holding.valuationInputs;
  const hasOriginal = original !== undefined;
  const bound = original?.contractVersion === 'stored-holding-valuation-v1' && original.symbol === holding.symbol;
  const quantitySupported = typeof holding.quantity === 'number' && Number.isFinite(holding.quantity) && holding.quantity >= 0
    && (!hasOriginal || (bound && original.quantity !== null && original.quantity === holding.quantity));
  const costBasisSupported = quantitySupported && typeof holding.averageCost === 'number' && Number.isFinite(holding.averageCost) && holding.averageCost >= 0
    && holding.currency === 'USD'
    && (!hasOriginal || (bound && original.averageCost !== null && original.averageCost === holding.averageCost && original.currency === 'USD'));
  const cost = holding.quantity * holding.averageCost;
  const investedValue = costBasisSupported && Number.isFinite(cost) ? cost : null;
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
    snapshotCurrentValue: null,
    currency: holding.currency ?? null,
    quantitySupported,
    costBasisSupported,
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
  nowMs = Date.now(),
): PositionAnalysis[] {
  return positions.map((position) => {
    const quote = prices[position.symbol];
    const quality = evaluateDeclaredQuote(position.symbol, quote, nowMs);
    const livePrice = quality.quote?.price ?? null;
    const liveIsFresh = quality.eligible;
    const quantityValid = position.quantitySupported !== false && typeof position.quantity === 'number' && Number.isFinite(position.quantity) && position.quantity >= 0;
    const value = livePrice == null || !quantityValid ? null : livePrice * position.quantity;
    const currentValue = value != null && Number.isFinite(value) ? value : null;
    const costValid = recordedCostSupported(position);
    const difference = currentValue != null && costValid ? currentValue - position.investedValue! : null;
    const pnl = difference != null && Number.isFinite(difference) ? difference : null;
    const percent = pnl != null && position.investedValue! > 0 ? pnl / position.investedValue! * 100 : null;
    const pnlPct = percent != null && Number.isFinite(percent) ? percent : null;
    const valuationIssues = [...quality.reasons, ...(!quantityValid || (value != null && currentValue == null) ? ['Quantity or position-value arithmetic is unsupported.'] : []), ...(!costValid ? ['Loaded cost basis or USD cost currency is unavailable or invalid; P&L is withheld.'] : [])];
    const group = intelligence.groups.find((item) => item.name === position.group) ?? null;

    const peerReturns = position.peers
      .map((symbol) => prices[symbol])
      .filter(usablePricePoint)
      .map((peer) => peer.changePct)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const peerAverageChange = avg(peerReturns);
    const dailyChangePct = liveIsFresh && usablePricePoint(quote) ? quote.changePct : null;
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
      vsPeers != null && vsPeers >= 0;

    const riskEligible = groupScore != null && (
      (groupScore <= (isLeveraged ? 45 : 38) && pnlPct != null && pnlPct <= -10) ||
      (vsPeers != null && vsPeers <= (isLeveraged ? -1.5 : -1.0) && groupBreadth != null && groupBreadth < 0.50)
    );

    let state: PositionAnalysis['state'] = 'INSUFFICIENT DATA';
    const supportingMetricsAvailable = pnlPct != null && currentValue != null && group?.coverage.status === 'complete' && position.peers.length > 0 &&
      peerReturns.length === position.peers.length && groupScore != null && groupBreadth != null && relativeToUniverse != null && vsPeers != null;
    if (liveIsFresh && supportingMetricsAvailable && riskEligible) state = 'RISK REVIEW';
    else if (liveIsFresh && supportingMetricsAvailable && addEligible) state = 'ADD REVIEW';
    else if (liveIsFresh && supportingMetricsAvailable) state = 'HOLD / WATCH';

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
      pnlPct != null && pnlPct < 0 &&
      groupScore != null &&
      groupBreadth != null &&
      relativeToUniverse != null &&
      vsPeers != null &&
      groupScore >= (isLeveraged ? 68 : 62) &&
      groupBreadth >= (isLeveraged ? 0.67 : 0.50) &&
      relativeToUniverse >= 0 &&
      vsPeers >= 0;

    const recoveryAlert = liveIsFresh &&
      pnlPct != null && pnlPct < 0 &&
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
      quantitySupported: quantityValid,
      costBasisSupported: costValid,
      investedValue: costValid ? position.investedValue : null,
      livePrice,
      liveRetrievedAt: quote?.retrievedAt ?? null,
      liveProvider: quote?.provider ?? null,
      liveStale: quote?.stale === true || quality.status === 'stale',
      valuationStatus: quality.status,
      valuationIssues,
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
      whatIfProfitAt10Pct: livePrice == null ? null : calculatePositionScenario(position, livePrice * 1.10).pnl,
      whatIfProfitAt20Pct: livePrice == null ? null : calculatePositionScenario(position, livePrice * 1.20).pnl,
      potentialUpsideSignal: !liveIsFresh || !supportingMetricsAvailable || groupScore == null || groupBreadth == null
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
              ? 'Usable price, group and peer observations are required before assessing review signals.'
              : 'Continue monitoring the holding against its purchase thesis, group strength, peers, catalysts and risk signals before changing exposure.',
    };
  });
}

type LoadedCostInput = Pick<PortfolioPosition, 'quantity' | 'averageCost' | 'investedValue' | 'currency' | 'quantitySupported' | 'costBasisSupported'>;
function recordedCostSupported(position: LoadedCostInput) {
  return position.currency === 'USD' && position.quantitySupported !== false && position.costBasisSupported !== false && typeof position.quantity === 'number' && Number.isFinite(position.quantity) && position.quantity >= 0
    && typeof position.averageCost === 'number' && Number.isFinite(position.averageCost) && position.averageCost >= 0
    && typeof position.investedValue === 'number' && Number.isFinite(position.investedValue) && position.investedValue >= 0
    && position.investedValue === position.quantity * position.averageCost;
}

/** Hypothetical target math only. It does not supply a current observation or a forecast. */
export function calculatePositionScenario(position: LoadedCostInput, price: number) {
  const value = position.quantitySupported !== false && typeof price === 'number' && Number.isFinite(price) && price > 0 && typeof position.quantity === 'number' && Number.isFinite(position.quantity) && position.quantity >= 0 ? price * position.quantity : null;
  const saleValue = value != null && Number.isFinite(value) ? value : null;
  const profit = saleValue != null && recordedCostSupported(position) ? saleValue - position.investedValue! : null;
  const pnl = profit != null && Number.isFinite(profit) ? profit : null;
  const percent = pnl != null && position.investedValue! > 0 ? pnl / position.investedValue! * 100 : null;
  return { saleValue, pnl, returnPct: percent != null && Number.isFinite(percent) ? percent : null };
}

export function withCurrentPortfolioWeights(positions: PositionAnalysis[]): PositionAnalysis[] {
  const concentration = calculatePortfolioConcentration(positions);
  const weights = new Map(concentration.weights.map(row => [row.symbol, row.weight]));
  return positions.map(row => ({ ...row, portfolioWeight: weights.get(row.symbol) ?? null,
    minorPosition: weights.has(row.symbol) ? weights.get(row.symbol)! < 0.02 : null }));
}
