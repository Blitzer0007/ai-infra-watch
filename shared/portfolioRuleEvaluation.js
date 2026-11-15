// Pure legacy rule calculations. Caller supplies the clock; no IO or persistence.
import { optionalFiniteNumber } from './portfolioRuleMath.js';

function dateOnly(value) {
  return new Date(value).toISOString().slice(0, 10);
}
function daysBetween(from, to) {
  const a = new Date(from + 'T00:00:00Z').getTime();
  const b = new Date(to + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}
function validRuleDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}

export function sortedHistoryPoints(history) {
  return Array.isArray(history?.points)
    ? [...history.points].filter(point => point?.date && Number(point?.price) > 0).sort((a,b) => String(a.date).localeCompare(String(b.date)))
    : [];
}


function normalizeBrokerAlerts(holding) {
  if (Array.isArray(holding?.broker_alerts)) {
    return holding.broker_alerts
      .map(item => ({
        price: optionalFiniteNumber(item?.price),
        direction: item?.direction === 'below' ? 'below' : item?.direction === 'above' ? 'above' : null,
        label: String(item?.label || '').trim() || null,
      }))
      .filter(item => Number.isFinite(item.price) && item.price > 0 && item.direction);
  }
  const averageCost = optionalFiniteNumber(holding?.average_cost);
  if (!(averageCost > 0)) return [];
  return Array.isArray(holding?.broker_alert_prices)
    ? holding.broker_alert_prices.map(optionalFiniteNumber).filter(v => v != null && v > 0).map(price => ({
        price,
        direction: Number.isFinite(averageCost) && price < averageCost ? 'below' : 'above',
        label: Number.isFinite(averageCost) && price < averageCost ? 'stop (inferred)' : 'target (inferred)',
      }))
    : [];
}

function findStageHit(points, startDate, target, direction) {
  return points.find(point => String(point.date) >= String(startDate || '') && (
    direction === 'above' ? Number(point.price) >= target : Number(point.price) <= target
  )) || null;
}

function evaluateStageState(holding, history) {
  const stages = Array.isArray(holding?.rule_stages) ? holding.rule_stages : [];
  const stored = holding?.rule_stage_state && typeof holding.rule_stage_state === 'object' ? holding.rule_stage_state : {};
  const state = JSON.parse(JSON.stringify(stored));
  if (!stages.length) return { stages: [], state, dirty: false };

  const points = sortedHistoryPoints(history);
  const baseDate = String(holding.purchase_date || points[0]?.date || '');
  const averageCost = Number(holding.average_cost);
  let dirty = false;

  stages.forEach((stage,index) => {
    const type = String(stage?.type || '').toLowerCase();
    const stagePct = Number(stage?.pct);
    if (type === 'take_profit' && Number.isFinite(stagePct) && stagePct > 0 && Number.isFinite(averageCost) && averageCost > 0) {
      const target = averageCost * (1 + stagePct / 100);
      const hit = findStageHit(points, baseDate, target, 'above');
      if (hit) {
        const key = 'stage_' + index;
        const next = { type, hitDate: String(hit.date), hitPrice: Number(hit.price), target };
        if (JSON.stringify(state[key]) !== JSON.stringify(next)) {
          state[key] = next;
          dirty = true;
        }
      }
    }
  });

  stages.forEach((stage,index) => {
    const type = String(stage?.type || '').toLowerCase();
    if (!type.includes('trailing')) return;
    const activatesAfter = String(stage?.activates_after || '').toLowerCase();
    const activationIndex = stages.findIndex(candidate => String(candidate?.type || '').toLowerCase() === activatesAfter);
    const activation = activationIndex >= 0 ? state['stage_' + activationIndex] : null;
    if (!activation?.hitDate) return;
    const peak = points.filter(point => String(point.date) >= String(activation.hitDate))
      .reduce((max,point) => Math.max(max,Number(point.price)),0);
    const pct = Number(stage?.pct);
    const key = 'stage_' + index;
    const next = {
      type,
      activatesAfter,
      activatedDate: activation.hitDate,
      peak: peak || null,
      target: peak > 0 && Number.isFinite(pct) && pct > 0 ? peak * (1 - pct / 100) : null,
    };
    if (JSON.stringify(state[key]) !== JSON.stringify(next)) {
      state[key] = next;
      dirty = true;
    }
  });

  return { stages, state, dirty };
}

export function evaluateExistingRules(holding, quote, history, nowMs) {
  if (!Number.isSafeInteger(nowMs) || Math.abs(nowMs) > 8640000000000000 || !holding || typeof holding !== 'object') return null;
  const asOf = new Date(nowMs);
  if (!validRuleDate(dateOnly(asOf))) return null;
  const price = optionalFiniteNumber(quote?.price);
  if (!(price > 0)) return null;
  history = { points: sortedHistoryPoints(history).filter(point => validRuleDate(point.date) && point.date <= dateOnly(asOf)) };

  const rules = [];
  const averageCost = optionalFiniteNumber(holding.average_cost);
  const lossPct = optionalFiniteNumber(holding.loss_limit_pct);
  const stages = Array.isArray(holding?.rule_stages) ? holding.rule_stages : [];
  const hasStagedStop = stages.some(stage => String(stage?.type || '').toLowerCase() === 'stop' &&
    optionalFiniteNumber(stage?.pct) > 0 && optionalFiniteNumber(stage?.pct) < 100);

  if (!hasStagedStop && Number.isFinite(lossPct) && lossPct > 0 && lossPct < 100 && Number.isFinite(averageCost) && averageCost > 0) {
    const stop = averageCost * (1 - lossPct / 100);
    rules.push({ type:'loss limit', target:stop, direction:'below', distancePct:(price / stop - 1) * 100, breached:price <= stop });
  }

  for (const alert of normalizeBrokerAlerts(holding)) {
    const distancePct = alert.direction === 'above'
      ? (alert.price / price - 1) * 100
      : (price / alert.price - 1) * 100;
    rules.push({
      type: alert.direction === 'below' ? 'broker downside alert' : 'broker upside alert',
      target: alert.price,
      direction: alert.direction,
      label: alert.label,
      distancePct,
      breached: alert.direction === 'below' ? price <= alert.price : price >= alert.price,
    });
  }

  const stageEvaluation = evaluateStageState(holding, history);
  if (stages.length) {
    const points = sortedHistoryPoints(history);
    const baseDate = String(holding.purchase_date || points[0]?.date || '');

    stages.forEach((stage,index) => {
      const type = String(stage?.type || '').toLowerCase();
      const stagePct = Number(stage?.pct);
      const days = Number(stage?.days);

      if (type === 'stop' && Number.isFinite(stagePct) && stagePct > 0 && stagePct < 100 && Number.isFinite(averageCost) && averageCost > 0) {
        const target = averageCost * (1 - stagePct / 100);
        rules.push({ type:'staged stop', target, direction:'below', distancePct:(price / target - 1) * 100, breached:price <= target, stageIndex:index });
      }

      if (type === 'take_profit' && Number.isFinite(stagePct) && stagePct > 0 && Number.isFinite(averageCost) && averageCost > 0) {
        const target = averageCost * (1 + stagePct / 100);
        rules.push({ type:'take profit', target, direction:'above', distancePct:(target / price - 1) * 100, breached:price >= target,
          fraction:Number.isFinite(Number(stage?.fraction)) ? Number(stage.fraction) : null, stageIndex:index });
      }

      if (type === 'time_limit' && Number.isInteger(days) && days > 0 && validRuleDate(holding.purchase_date)) {
        const heldDays = daysBetween(holding.purchase_date, dateOnly(asOf));
        rules.push({ type:'time limit', target:days, distancePct:days - heldDays, breached:heldDays >= days, unit:'days', stageIndex:index });
      }

      if (type.includes('trailing')) {
        const state = stageEvaluation.state['stage_' + index];
        if (state?.activatedDate && Number(state.peak) > 0 && Number.isFinite(stagePct) && stagePct > 0 && stagePct < 100) {
          const target = Number(state.peak) * (1 - stagePct / 100);
          rules.push({ type:'trailing stop', target, direction:'below', distancePct:(price / target - 1) * 100, breached:price <= target,
            stageIndex:index, active:true, activatedDate:state.activatedDate });
        }
      }
    });
  } else {
    const exitType = String(holding.exit_rule_type || '').toLowerCase();
    const exitValue = Number(holding.exit_rule_value);

    if (exitType.includes('trailing') && Number.isFinite(exitValue) && exitValue > 0 && exitValue < 100 && sortedHistoryPoints(history).length) {
      const points = sortedHistoryPoints(history);
      const startDate = String(holding.purchase_date || points[0]?.date || '');
      const peak = points.filter(point => point.date >= startDate).reduce((max,point) => Math.max(max,Number(point.price)),0);
      const stop = peak * (1 - exitValue / 100);
      if (stop > 0) rules.push({ type:'trailing stop', target:stop, direction:'below', distancePct:(price / stop - 1) * 100, breached:price <= stop });
    }

    if (exitType.includes('time') && Number.isInteger(exitValue) && exitValue > 0 && validRuleDate(holding.purchase_date)) {
      const heldDays = daysBetween(holding.purchase_date, dateOnly(asOf));
      rules.push({ type:'time limit', target:exitValue, distancePct:exitValue - heldDays, breached:heldDays >= exitValue, unit:'days' });
    }
  }

  for (let index = rules.length - 1; index >= 0; index--) {
    if (!Number.isFinite(rules[index].target) || rules[index].target <= 0 || !Number.isFinite(rules[index].distancePct)) rules.splice(index, 1);
  }
  if (!rules.length) return { state:'no-rule', rules:[], nearest:null, stageState:stageEvaluation.state, stageStateDirty:stageEvaluation.dirty };

  const actionable = rules.filter(rule => !rule.unit);
  const nearest = actionable.length
    ? [...actionable].sort((a,b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))[0]
    : [...rules].sort((a,b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))[0];

  if (rules.some(rule => rule.breached && rule.direction === 'below')) return { state:'breached', rules, nearest, stageState:stageEvaluation.state, stageStateDirty:stageEvaluation.dirty };
  const timeRule = rules.find(rule => rule.unit === 'days');
  if (timeRule?.breached) return { state:'breached', rules, nearest:timeRule, stageState:stageEvaluation.state, stageStateDirty:stageEvaluation.dirty };
  const targetReached = rules.find(rule => rule.breached && rule.direction === 'above');
  if (targetReached) return { state:'target-reached', rules, nearest:targetReached, targetReached, stageState:stageEvaluation.state, stageStateDirty:stageEvaluation.dirty };
  // Compare against the same 3% price limit directly. Ratio subtraction and
  // subtracting nearly equal prices can both misclassify a decimal boundary.
  const nearPriceRule = rules.some(rule => {
    if (rule.breached || rule.unit || !Number.isFinite(rule.distancePct) || rule.distancePct < 0) return false;
    const basis = rule.direction === 'above' ? price : rule.target;
    const limit = basis * 1.03;
    return (rule.direction === 'above' ? rule.target : price) <= limit;
  });
  if (nearPriceRule) return { state:'near', rules, nearest, stageState:stageEvaluation.state, stageStateDirty:stageEvaluation.dirty };

  if (timeRule && Number.isFinite(timeRule.distancePct) && timeRule.distancePct >= 0 && timeRule.distancePct <= 3) return { state:'near', rules, nearest:timeRule, stageState:stageEvaluation.state, stageStateDirty:stageEvaluation.dirty };

  return { state:'clear', rules, nearest, stageState:stageEvaluation.state, stageStateDirty:stageEvaluation.dirty };
}
