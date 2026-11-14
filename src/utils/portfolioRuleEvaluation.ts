import type { StoredPortfolioHolding } from './portfolioApi';
import { evaluateExistingRules } from '../../shared/portfolioRuleEvaluation.js';

export type RuleReviewHolding = Pick<StoredPortfolioHolding,
  'averageCost' | 'purchaseDate' | 'lossLimitPct' | 'exitRuleType' | 'exitRuleValue' |
  'brokerAlertPrices' | 'brokerAlerts' | 'ruleStages' | 'ruleStageState'>;
export type RuleReviewHistory = { points?: Array<{date:string;price:number}> };

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
