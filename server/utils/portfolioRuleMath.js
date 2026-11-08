// Shared numerical contracts for rule review; these functions perform no IO.
export function optionalFiniteNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && (!value.trim() || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function allocationLimits(holding) {
  const percent = value => { const number = optionalFiniteNumber(value); return number != null && number >= 0 && number <= 100 ? number : null; };
  const target = percent(holding.target_allocation_pct), maximum = percent(holding.max_allocation_pct);
  const issues = [];
  if (holding.target_allocation_pct != null && String(holding.target_allocation_pct).trim() && target == null) issues.push('Invalid target allocation percentage.');
  if (holding.max_allocation_pct != null && String(holding.max_allocation_pct).trim() && maximum == null) issues.push('Invalid maximum allocation percentage.');
  if (target != null && maximum != null && target > maximum) issues.push('Target allocation exceeds maximum allocation.');
  return { target: issues.length ? null : target, maximum: issues.length ? null : maximum, issues };
}

export function peakDrawdownPct(peak, price) {
  const high = optionalFiniteNumber(peak), current = optionalFiniteNumber(price);
  return high != null && current != null && high > 0 && current > 0 ? Math.max(0, (1 - current / high) * 100) : null;
}

export function scenarioParameters(holding) {
  const beta = optionalFiniteNumber(holding.risk_beta), leverage = optionalFiniteNumber(holding.risk_leverage), shock = optionalFiniteNumber(holding.scenario_shock_pct);
  return { beta: beta == null ? 1 : Math.max(0, beta), leverage: leverage != null && leverage > 0 ? leverage : 1,
    shockPct: shock == null ? 15 : Math.max(0, shock) };
}

export function ruleProximityText(rule, price) {
  return rule.unit === 'days'
    ? Math.max(0, rule.distancePct) + ' calendar days remain on your ' + rule.type + '.'
    : rule.direction === 'above'
      ? '$' + price.toFixed(2) + ' needs a ' + Math.max(0, rule.distancePct).toFixed(1) + '% rise to your ' + rule.type + ' at $' + rule.target.toFixed(2) + '.'
      : '$' + price.toFixed(2) + ' is ' + Math.max(0, rule.distancePct).toFixed(1) + '% above your ' + rule.type + ' at $' + rule.target.toFixed(2) + '.';
}
