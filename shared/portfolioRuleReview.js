// Strict admission around the retained legacy math; no transport, clock or storage.
import { evaluateExistingRules } from './portfolioRuleEvaluation.js';
import { optionalFiniteNumber } from './portfolioRuleMath.js';
import { admitRuleHistory } from './ruleHistoryAdmission.js';

const missing = value => value == null || value === '';
const record = value => value != null && typeof value === 'object' && !Array.isArray(value);
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const positive = value => optionalFiniteNumber(value) > 0;
const percent = value => positive(value) && optionalFiniteNumber(value) < 100;
const dayCount = value => Number.isSafeInteger(optionalFiniteNumber(value)) && positive(value);
const exitTypes = new Set(['trailing', 'trailing_stop', 'trailing-stop', 'time_limit', 'time-limit', 'price_stop', 'thesis_break', 'custom']);
const stageTypes = new Set(['stop', 'take_profit', 'trailing', 'time_limit']);

export function reviewHoldingRules(holding, quote, history, nowMs) {
  const issues = [];
  const incomplete = [];
  const blocked = (state, reasons) => ({ state, issues: reasons, rules: [], nearest: null, stageState: {}, stageStateDirty: false });
  if (!record(holding)) return blocked('invalid-config', ['Holding rule configuration must be an object.']);
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs > 253402300799999) return blocked('incomplete', ['An exact supported assessment instant is required.']);
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const stages = holding.rule_stages == null ? [] : holding.rule_stages;
  const alerts = holding.broker_alerts == null ? null : holding.broker_alerts;
  const prices = holding.broker_alert_prices == null ? [] : holding.broker_alert_prices;
  if (!Array.isArray(stages) || stages.length > 32) issues.push('Rule stages must be a bounded array.');
  if (alerts !== null && (!Array.isArray(alerts) || alerts.length > 64)) issues.push('Directional broker alerts must be a bounded array.');
  if (!Array.isArray(prices) || prices.length > 64) issues.push('Legacy broker prices must be a bounded array.');
  if (issues.length) return blocked('invalid-config', issues);

  const exitType = typeof holding.exit_rule_type === 'string' ? holding.exit_rule_type.toLowerCase() : '';
  if (!missing(holding.exit_rule_type) && !exitTypes.has(exitType)) issues.push('Unsupported exit rule type.');
  if (missing(holding.exit_rule_type) && !missing(holding.exit_rule_value)) issues.push('Exit value has no rule type.');
  if (!missing(holding.loss_limit_pct) && !percent(holding.loss_limit_pct)) issues.push('Loss limit must be greater than zero and less than 100 percent.');
  if (prices.some(value => !positive(value))) issues.push('Each legacy broker price must be a positive finite number.');
  if (alerts?.some(value => !record(value) || !positive(value.price) || !['above', 'below'].includes(value.direction) ||
      (!missing(value.label) && (typeof value.label !== 'string' || value.label.length > 160)))) issues.push('Each broker alert needs a positive price, explicit direction and bounded label.');
  if (holding.broker_alerts_review_required === true) incomplete.push('Broker alert directions require review.');
  if (holding.broker_alerts_review_required != null && typeof holding.broker_alerts_review_required !== 'boolean') issues.push('Malformed broker review marker.');
  // The explicit array takes precedence in the old calculator. Conflicting legacy
  // values must be resolved instead of silently discarding either collection.
  if (alerts !== null && prices.length && (prices.length !== alerts.length || prices.some((price, index) => optionalFiniteNumber(price) !== optionalFiniteNumber(alerts[index]?.price)))) {
    issues.push('Explicit and legacy broker price collections disagree.');
  }

  let needsCost = !missing(holding.loss_limit_pct) || (alerts === null && prices.length > 0);
  let needsDate = false;
  let needsHistory = false;
  const seen = new Set();
  for (const stage of stages) {
    if (!record(stage) || !stageTypes.has(stage.type)) { issues.push('Unsupported rule stage.'); continue; }
    if (seen.has(stage.type)) issues.push('Duplicate stage types have ambiguous activation/precedence.');
    seen.add(stage.type);
    if (stage.type === 'stop' || stage.type === 'trailing') {
      if (!percent(stage.pct)) issues.push('Stop/trailing percentages must be greater than zero and less than 100.');
    }
    if (stage.type === 'take_profit' && !positive(stage.pct)) issues.push('Take-profit percentage must be positive and finite.');
    if (stage.fraction != null && (!positive(stage.fraction) || optionalFiniteNumber(stage.fraction) > 1)) issues.push('Stage fraction must be greater than zero and at most one.');
    if (stage.type === 'time_limit') { needsDate = true; if (!dayCount(stage.days)) issues.push('Time limits require a positive whole number of calendar days.'); }
    else needsCost = true;
    if (stage.type === 'take_profit' || stage.type === 'trailing') needsHistory = needsDate = true;
    if (stage.type === 'trailing' && (stage.activates_after !== 'take_profit' || stages.filter(value => value?.type === 'take_profit').length !== 1)) issues.push('Trailing stage requires one unambiguous take-profit activation stage.');
    if (stage.type !== 'trailing' && !missing(stage.activates_after)) issues.push('Only trailing stages support activation dependencies.');
  }
  if (!stages.length && exitType.startsWith('trailing')) {
    needsHistory = needsDate = true;
    if (!percent(holding.exit_rule_value)) issues.push('Trailing exit requires a percentage greater than zero and less than 100.');
  }
  if (!stages.length && ['time_limit', 'time-limit'].includes(exitType)) {
    needsDate = true;
    if (!dayCount(holding.exit_rule_value)) issues.push('Time exit requires a positive whole number of calendar days.');
  }
  if (!stages.length && ['price_stop', 'thesis_break', 'custom'].includes(exitType)) incomplete.push('This exit type requires manual review; automatic monitoring is not implemented.');
  if (needsCost && !positive(holding.average_cost)) incomplete.push('A positive finite average cost is required by the configured rules.');
  if (needsDate && (!date(holding.purchase_date) || holding.purchase_date > today)) incomplete.push('A valid purchase date on or before assessment is required.');
  if (!positive(quote?.price)) incomplete.push('A positive finite quote is required for mathematical review.');
  if (issues.length) return blocked('invalid-config', [...new Set(issues)]);

  if (needsHistory) {
    const admitted=admitRuleHistory(holding.symbol,history,nowMs);
    if(!admitted.eligible)incomplete.push(admitted.reason);
    const coverage = history?.coverage;
    const points = history?.points;
    if (!record(coverage) || coverage.status !== 'complete' || !date(coverage.startDate) || !date(coverage.endDate) ||
        coverage.startDate > holding.purchase_date || coverage.endDate < today || coverage.endDate > today ||
        !Array.isArray(points) || !points.length || points.length > 10000 ||
        points.some(point => !record(point) || !date(point.date) || !positive(point.price) || point.date > today || point.date < coverage.startDate) ||
        new Set(points.map(point => point.date)).size !== points.length) {
      incomplete.push('Complete, non-duplicated history covering purchase through assessment must be declared; loaded points alone do not prove coverage.');
    }
  }
  if (incomplete.length) return blocked('incomplete', [...new Set(incomplete)]);
  // Recompute stage state from admitted full history rather than trusting stored
  // activation/peak fields from another rule version or partial observation set.
  const projected = { average_cost: holding.average_cost, purchase_date: holding.purchase_date,
    loss_limit_pct: holding.loss_limit_pct, exit_rule_type: holding.exit_rule_type, exit_rule_value: holding.exit_rule_value,
    broker_alerts: alerts, broker_alert_prices: prices, rule_stages: stages.map(stage => ({ type: stage.type,
      pct: stage.pct, days: stage.days, fraction: stage.fraction == null ? undefined : stage.fraction,
      activates_after: stage.activates_after })), rule_stage_state: {} };
  const result = evaluateExistingRules(projected, quote, needsHistory ? history : { points: [] }, nowMs);
  const minimumRules = (missing(holding.loss_limit_pct) || seen.has('stop') ? 0 : 1) + (alerts ?? prices).length +
    stages.filter((stage,index) => stage.type !== 'trailing' || result?.stageState?.['stage_' + index]?.activatedDate).length +
    (!stages.length && exitType ? 1 : 0);
  if (!result || result.rules.length < minimumRules) {
    return blocked('incomplete', ['Configured rules could not be calculated.']);
  }
  // Read-only review never authorizes persistence of inferred stage state.
  return { ...result, stageStateDirty: false, issues: [] };
}
