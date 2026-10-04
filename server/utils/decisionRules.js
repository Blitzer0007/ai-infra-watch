export function safeDistancePct(price, target, direction) {
  if (!(price > 0) || !(target > 0)) return null;
  return direction === 'below' ? (price / target - 1) * 100 : (target / price - 1) * 100;
}

export function normalizeBrokerAlerts(holding) {
  const structured = Array.isArray(holding?.broker_alerts) ? holding.broker_alerts : [];
  if (structured.length) {
    return structured.map((item, index) => ({
      price: Number(item?.price),
      direction: item?.direction === 'below' ? 'below' : 'above',
      label: String(item?.label || (item?.direction === 'below' ? 'stop / downside review' : 'target / upside review')),
      index,
    })).filter(item => Number.isFinite(item.price) && item.price > 0);
  }
  const legacy = Array.isArray(holding?.broker_alert_prices) ? holding.broker_alert_prices : [];
  const averageCost = Number(holding?.average_cost);
  return legacy.map((value, index) => {
    const price = Number(value);
    const direction = Number.isFinite(averageCost) && price < averageCost ? 'below' : 'above';
    return { price, direction, label: direction === 'below' ? 'stop / downside review' : 'target / upside review', index };
  }).filter(item => Number.isFinite(item.price) && item.price > 0);
}

export function normalizeStageState(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

export function evaluateRuleStages(holding, price, history, today = new Date()) {
  const stages = Array.isArray(holding?.rule_stages) ? holding.rule_stages : [];
  if (!stages.length) return { state: null, rules: [], nearest: null, nextState: normalizeStageState(holding?.rule_stage_state) };

  const points = (history?.points || [])
    .filter(point => point?.date && Number(point?.price) > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const nextState = normalizeStageState(holding?.rule_stage_state);
  const rules = [];
  let targetReached = null;

  for (const [index, stage] of stages.entries()) {
    const type = String(stage?.type || '').toLowerCase();
    const pctValue = Number(stage?.pct);
    if (!(pctValue > 0)) continue;

    if (type === 'stop') {
      const basisPrice = String(stage?.basis || 'average_cost').toLowerCase() === 'average_cost'
        ? Number(holding.average_cost)
        : Number(stage?.price);
      const target = basisPrice > 0 ? basisPrice * (1 - pctValue / 100) : null;
      if (target) rules.push({
        type: 'stop',
        target,
        direction: 'below',
        distancePct: safeDistancePct(price, target, 'below'),
        breached: price <= target,
        stageIndex: index,
      });
      continue;
    }

    if (type === 'take_profit') {
      const target = Number(stage?.price) > 0
        ? Number(stage.price)
        : Number(holding.average_cost) * (1 + pctValue / 100);
      const hitPoint = points.find(point => Number(point.price) >= target);
      const hit = price >= target || Boolean(hitPoint);
      if (hit) {
        const hitDate = hitPoint?.date || today.toISOString().slice(0, 10);
        const hitPrice = Number(hitPoint?.price) > 0 ? Number(hitPoint.price) : price;
        nextState['stage' + index + '_hit_at'] = nextState['stage' + index + '_hit_at'] || hitDate;
        nextState['stage' + index + '_hit_price'] = nextState['stage' + index + '_hit_price'] || hitPrice;
        targetReached = { type: 'take profit', target, stageIndex: index, hitDate };
      }
      rules.push({
        type: 'take profit',
        target,
        direction: 'above',
        distancePct: safeDistancePct(price, target, 'above'),
        breached: price >= target,
        targetReached: hit,
        stageIndex: index,
      });
      continue;
    }

    if (type === 'trailing') {
      const activatesAfter = String(stage?.activates_after || '').toLowerCase();
      const activationIndex = activatesAfter
        ? stages.findIndex(prior => String(prior?.type || '').toLowerCase() === activatesAfter)
        : -1;
      const activationDate = activationIndex >= 0 ? nextState['stage' + activationIndex + '_hit_at'] : null;
      if (activatesAfter && !activationDate) continue;

      const stateKey = 'stage' + index + '_peak_price';
      const historicalPeak = activationDate
        ? points.filter(point => String(point.date) >= String(activationDate)).reduce((max, point) => Math.max(max, Number(point.price)), 0)
        : 0;
      const priorPeak = Number(nextState[stateKey]) || 0;
      const peak = Math.max(priorPeak, historicalPeak, price);
      if (peak > 0) nextState[stateKey] = peak;
      if (peak > priorPeak) nextState['stage' + index + '_peak_date'] = today.toISOString().slice(0, 10);

      const target = peak > 0 ? peak * (1 - pctValue / 100) : null;
      if (target) rules.push({
        type: 'trailing stop',
        target,
        direction: 'below',
        distancePct: safeDistancePct(price, target, 'below'),
        breached: price <= target,
        stageIndex: index,
        activated: true,
      });
    }
  }

  const downside = rules.filter(rule => rule.direction === 'below');
  const nearest = rules.length
    ? [...rules].sort((a, b) => (a.distancePct ?? 9999) - (b.distancePct ?? 9999))[0]
    : null;
  if (downside.some(rule => rule.breached)) return { state: 'breached', rules, nearest, nextState, targetReached };
  if (targetReached && price >= targetReached.target) return { state: 'target-reached', rules, nearest, nextState, targetReached };
  if (downside.some(rule => !rule.breached && Number.isFinite(rule.distancePct) && rule.distancePct >= 0 && rule.distancePct <= 3)) {
    return { state: 'near', rules, nearest, nextState, targetReached };
  }
  return { state: 'clear', rules, nearest, nextState, targetReached };
}

export function ruleDistance(holding, quote, history, today = new Date()) {
  const price = quote?.price;
  if (!(price > 0)) return null;
  const rules = [];
  const lossPct = Number(holding?.loss_limit_pct);
  if (Number.isFinite(lossPct) && lossPct > 0) {
    const stop = Number(holding.average_cost) * (1 - lossPct / 100);
    if (stop > 0) rules.push({
      type: 'loss limit',
      target: stop,
      direction: 'below',
      distancePct: safeDistancePct(price, stop, 'below'),
      breached: price <= stop,
    });
  }
  for (const alert of normalizeBrokerAlerts(holding)) {
    rules.push({
      type: alert.label || 'broker alert',
      target: alert.price,
      direction: alert.direction,
      distancePct: safeDistancePct(price, alert.price, alert.direction),
      breached: alert.direction === 'below' ? price <= alert.price : price >= alert.price,
    });
  }
  const staged = evaluateRuleStages(holding, price, history, today);
  if (staged.state) return { ...staged, rules: [...rules, ...staged.rules] };

  const exitType = String(holding?.exit_rule_type || '').toLowerCase();
  const exitValue = Number(holding?.exit_rule_value);
  if (exitType.includes('trailing') && Number.isFinite(exitValue) && exitValue > 0 && Array.isArray(history?.points) && history.points.length) {
    const start = String(holding.purchase_date || history.points[0]?.date || '');
    const since = history.points.filter(point => point.date >= start && Number(point.price) > 0);
    const peak = since.reduce((max, point) => Math.max(max, Number(point.price)), 0);
    const stop = peak * (1 - exitValue / 100);
    if (stop > 0) rules.push({
      type: 'trailing stop',
      target: stop,
      direction: 'below',
      distancePct: safeDistancePct(price, stop, 'below'),
      breached: price <= stop,
    });
  }
  if (exitType.includes('time') && Number.isFinite(exitValue) && exitValue > 0 && holding.purchase_date) {
    const heldDays = businessDaysBetween(holding.purchase_date, localDate(today));
    rules.push({
      type: 'time limit',
      target: exitValue,
      direction: 'below',
      distancePct: exitValue - heldDays,
      breached: heldDays >= exitValue,
      unit: 'days',
    });
  }
  if (!rules.length) return { state: 'no-rule', rules: [], nearest: null, nextState: normalizeStageState(holding.rule_stage_state) };
  const actionable = rules.filter(rule => !rule.unit);
  const nearest = actionable.length
    ? [...actionable].sort((a,b)=>(a.distancePct ?? 9999)-(b.distancePct ?? 9999))[0]
    : rules[0];
  if (rules.some(rule => rule.breached && rule.direction === 'below')) return { state: 'breached', rules, nearest, nextState: normalizeStageState(holding.rule_stage_state) };
  const target = rules.find(rule => rule.breached && rule.direction === 'above');
  if (target) return { state: 'target-reached', rules, nearest: target, nextState: normalizeStageState(holding.rule_stage_state), targetReached: target };
  if (rules.some(rule => !rule.breached && !rule.unit && Number.isFinite(rule.distancePct) && rule.distancePct >= 0 && rule.distancePct <= 3)) return { state: 'near', rules, nearest, nextState: normalizeStageState(holding.rule_stage_state) };
  return { state: 'clear', rules, nearest, nextState: normalizeStageState(holding.rule_stage_state) };
}

export function businessDaysBetween(from, to) {
  const start = new Date(String(from) + 'T00:00:00Z');
  const end = new Date(String(to) + 'T00:00:00Z');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0;
  let days = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) days++;
  }
  return days;
}

export function localDate(value = new Date(), timeZone = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

export function countIndependentForecasts(rows) {
  const perTicker = new Map();
  const ordered = [...rows].filter(row => row?.status === 'verified')
    .sort((a,b)=>String(a.created_at || a.verified_at || a.target_date || '').localeCompare(String(b.created_at || b.verified_at || b.target_date || '')));
  for (const row of ordered) {
    const ticker = String(row.ticker || '').toUpperCase();
    if (!ticker) continue;
    const anchor = String(row.created_at || row.verified_at || row.target_date || '').slice(0,10);
    const list = perTicker.get(ticker) || [];
    if (!list.length || businessDaysBetween(list.at(-1), anchor) >= 20) list.push(anchor);
    perTicker.set(ticker, list);
  }
  return [...perTicker.values()].reduce((sum,list)=>sum+list.length,0);
}

export function simulateSameCash(transactions, benchmarkHistory, benchmarkCurrent) {
  const points=[...(benchmarkHistory?.points||[])].filter(point=>point?.date&&Number(point?.price)>0).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const priceAtOrBefore=date=>{let selected=null; for(const point of points){if(String(point.date)<=String(date))selected=point;else break;} return selected ? Number(selected.price):null;};
  let shares=0, netDeposits=0, transactionsUsed=0;
  const ordered=[...transactions].sort((a,b)=>String(a.trade_date).localeCompare(String(b.trade_date))||Number(a.source_row||0)-Number(b.source_row||0));
  for(const tx of ordered){
    const price=priceAtOrBefore(tx.trade_date);
    if(!(price>0)) continue;
    transactionsUsed++;
    if(tx.transaction_type==='BUY'){const cash=transactionNetCash(tx); shares+=cash/price; netDeposits+=cash;}
    else {const cash=transactionNetCash(tx); const sharesToSell=Math.min(shares,cash/price); shares-=sharesToSell; netDeposits-=cash;}
  }
  const value=shares*Number(benchmarkCurrent||0);
  const coveragePct=ordered.length?transactionsUsed/ordered.length*100:100;
  return {value,netDeposits,pnl:value-netDeposits,shares,transactionsTotal:ordered.length,transactionsUsed,coveragePct:Number(coveragePct.toFixed(1)),status:transactionsUsed===ordered.length?'complete':'partial'};
}

export function transactionNetCash(transaction) {
  const amount = Number(transaction?.amount) || 0;
  const brokerage = Number(transaction?.brokerage) || 0;
  return transaction?.transaction_type === 'SELL' ? Math.max(0, amount - brokerage) : amount + brokerage;
}
