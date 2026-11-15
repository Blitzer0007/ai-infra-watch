import {optionalFiniteNumber} from '../../shared/portfolioRuleMath.js';
import {financialNotificationAdmission} from '../../shared/financialNotificationAdmission.js';
const THRESHOLDS = [25, 30];

// Retained pure compatibility calculations; these do not grant source or send authority.
export function getReturnThresholdTransitions(returnPct, states = new Map()) {
  if (returnPct == null || returnPct === '') return { trigger: [], reset: [] };
  const value = optionalFiniteNumber(returnPct);
  if (!Number.isFinite(value)) return { trigger: [], reset: [] };
  const trigger = [];
  const reset = [];
  for (const threshold of THRESHOLDS) {
    const old = states.get('portfolio-return:' + threshold);
    if (value >= threshold && !old?.active) trigger.push(threshold);
    if (value < threshold && old?.active) reset.push(threshold);
  }
  return { trigger, reset };
}

export async function evaluatePortfolioReturnAlerts(digest) {
  const admission = financialNotificationAdmission(digest);
  return { evaluated: false, status: admission.status, reason: admission.reason, evaluatedHoldings: 0, triggered: [], sent: 0, errors: [] };
}
