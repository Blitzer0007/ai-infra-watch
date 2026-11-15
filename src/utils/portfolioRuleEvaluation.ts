import type { StoredPortfolioHolding } from './portfolioApi';
import { evaluateExistingRules } from '../../shared/portfolioRuleEvaluation.js';
import { reviewHoldingRules } from '../../shared/portfolioRuleReview.js';

export type RuleReviewHolding = Pick<StoredPortfolioHolding,
  'averageCost' | 'purchaseDate' | 'lossLimitPct' | 'exitRuleType' | 'exitRuleValue' |
  'brokerAlertPrices' | 'brokerAlerts' | 'brokerAlertsReviewRequired' | 'ruleStages' | 'ruleStageState'> & {symbol?:string};
export type RuleReviewHistory = { points?: Array<{date:string;price:number;availableAt?:string}>; coverage?: {status:string;startDate:string;endDate:string};provenance?:Record<string,unknown> };

/** Strict read-only admission; a clear mathematical result grants no data/trade eligibility. */
export function reviewStoredHoldingRules(holding: RuleReviewHolding, quote: {price:number|null}, history: RuleReviewHistory, nowMs:number) {
  if (!holding || typeof holding !== 'object') return reviewHoldingRules(null, quote, history, nowMs);
  return reviewHoldingRules({ symbol:holding.symbol,average_cost:holding.averageCost, purchase_date:holding.purchaseDate,
    loss_limit_pct:holding.lossLimitPct, exit_rule_type:holding.exitRuleType, exit_rule_value:holding.exitRuleValue,
    broker_alert_prices:holding.brokerAlertPrices, broker_alerts:holding.brokerAlerts,
    broker_alerts_review_required:holding.brokerAlertsReviewRequired, rule_stages:holding.ruleStages,
  }, quote, history, nowMs);
}

/** Local mathematical review only. No quote-quality or decision eligibility is granted. */
export function evaluateStoredHoldingRules(holding: RuleReviewHolding, quote: {price:number|null}, history: RuleReviewHistory, nowMs:number) {
  if (!holding || typeof holding !== 'object') return null;
  return evaluateExistingRules({
    average_cost:holding.averageCost, purchase_date:holding.purchaseDate,
    loss_limit_pct:holding.lossLimitPct, exit_rule_type:holding.exitRuleType,
    exit_rule_value:holding.exitRuleValue, broker_alert_prices:holding.brokerAlertPrices,
    broker_alerts:holding.brokerAlerts, rule_stages:holding.ruleStages,
    rule_stage_state:holding.ruleStageState,
  }, quote, history, nowMs);
}
