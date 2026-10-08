import { requireAccess } from '../../api/_access-auth.js';
import { history as routedHistory, quote as routedQuote } from '../../api/_market-data.js';
import { independentForecastCount } from '../utils/forecastIndependence.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const LEVERAGE = { SOXL: 3 };

function sbHeaders() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase service configuration is missing');
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  };
}

async function supabase(path, options = {}) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...options,
    headers: { ...sbHeaders(), ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error('Supabase request failed: HTTP ' + response.status);
  return response.json();
}

function money(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
}

function pct(value) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
}

function dateOnly(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function addDays(date, count) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  const a = new Date(from + 'T00:00:00Z').getTime();
  const b = new Date(to + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}
function previousOrSamePoint(points, date) {
  const ordered = (points || []).filter(point => point?.date && Number(point?.price) > 0).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  let selected = null;
  for (const point of ordered) {
    if (String(point.date) <= String(date)) selected = point;
    else break;
  }
  return selected;
}
function signed(value) {
  return (value >= 0 ? '+' : '') + value.toFixed(2);
}

function transactionNetCash(transaction) {
  const amount = Number(transaction.amount) || 0;
  const brokerage = Number(transaction.brokerage) || 0;
  return transaction.transaction_type === 'SELL' ? Math.max(0, amount - brokerage) : amount + brokerage;
}

function simulateSameCash(transactions, benchmarkHistory, benchmarkCurrent) {
  const ordered=[...transactions].sort((a,b)=>String(a.trade_date).localeCompare(String(b.trade_date))||Number(a.source_row||0)-Number(b.source_row||0));
  let shares=0, netDeposits=0, used=0, fallbackTrades=0; const skipped=[];
  for(const tx of ordered){
    const matched=previousOrSamePoint(benchmarkHistory?.points||[],tx.trade_date);
    const price=Number(matched?.price);
    if(!(price>0)){skipped.push(String(tx.trade_date||'unknown'));continue;}
    used++; if(String(matched.date)<String(tx.trade_date))fallbackTrades++;
    const cash=transactionNetCash(tx);
    if(tx.transaction_type==='BUY'){shares+=cash/price;netDeposits+=cash;}else{const sharesToSell=Math.min(shares,cash/price);shares-=sharesToSell;netDeposits-=cash;}
  }
  const live=Number(benchmarkCurrent), last=sortedHistoryPoints(benchmarkHistory).at(-1), current=live>0?live:Number(last?.price);
  const value=current>0?shares*current:null;
  return {value,netDeposits,pnl:value==null?null:value-netDeposits,shares,coverage:{
    totalTrades:ordered.length,tradesUsed:used,tradesSkipped:skipped.length,coveragePct:ordered.length?used/ordered.length*100:100,fallbackTrades,skippedDates:skipped,status:skipped.length?'partial':'complete'
  }};
}

function calculateActualPortfolio(holdings, transactionRows, quotes, histories = {}) {
  let currentValue=0, liveQuotes=0, staleFallbacks=0, missingQuotes=0;
  for(const holding of holdings){
    const symbol=String(holding.symbol).toUpperCase();
    const live=Number(quotes[symbol]?.price);
    if(live>0){currentValue+=live*Number(holding.quantity);liveQuotes++;continue;}
    const last=sortedHistoryPoints(histories[symbol]).at(-1);
    if(Number(last?.price)>0){currentValue+=Number(last.price)*Number(holding.quantity);staleFallbacks++;}else missingQuotes++;
  }
  let buyCash=0,saleCash=0;
  for(const tx of transactionRows){if(tx.transaction_type==='BUY')buyCash+=transactionNetCash(tx);else saleCash+=transactionNetCash(tx);}
  const netContributed=buyCash-saleCash;
  return {currentValue,buyCash,saleCash,netContributed,pnl:currentValue-netContributed,quoteCoverage:{
    totalHoldings:holdings.length,liveQuotes,staleFallbacks,missingQuotes,
    coveragePct:holdings.length?(liveQuotes+staleFallbacks)/holdings.length*100:100,
    status:missingQuotes?'partial':staleFallbacks?'stale-fallback':'complete'
  }};
}

function sortedHistoryPoints(history) {
  return Array.isArray(history?.points)
    ? [...history.points].filter(point => point?.date && Number(point?.price) > 0).sort((a,b) => String(a.date).localeCompare(String(b.date)))
    : [];
}

function dailyVolatilityPct(points, lookback = 20) {
  const ordered = sortedHistoryPoints({ points }).slice(-(lookback + 1));
  const returns = [];
  for (let i = 1; i < ordered.length; i++) {
    const previous = Number(ordered[i - 1]?.price);
    const current = Number(ordered[i]?.price);
    if (previous > 0 && current > 0) returns.push((current / previous - 1) * 100);
  }
  if (returns.length < 2) return null;
  const average = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / returns.length;
  return Math.sqrt(Math.max(0, variance));
}

function pullbackThresholdPct(points) {
  const dailyVol = dailyVolatilityPct(points);
  if (dailyVol == null) return null;
  return Math.max(2, Number((dailyVol * 2).toFixed(2)));
}

function normalizeBrokerAlerts(holding) {
  if (Array.isArray(holding?.broker_alerts)) {
    return holding.broker_alerts
      .map(item => ({
        price: Number(item?.price),
        direction: item?.direction === 'below' ? 'below' : item?.direction === 'above' ? 'above' : null,
        label: String(item?.label || '').trim() || null,
      }))
      .filter(item => Number.isFinite(item.price) && item.price > 0 && item.direction);
  }
  const averageCost = Number(holding?.average_cost);
  return Array.isArray(holding?.broker_alert_prices)
    ? holding.broker_alert_prices.map(Number).filter(v => v > 0).map(price => ({
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
  if (!stages.length) return { stages: [], state: stored, dirty: false };

  const points = sortedHistoryPoints(history);
  const baseDate = String(holding.purchase_date || points[0]?.date || '');
  const averageCost = Number(holding.average_cost);
  const state = JSON.parse(JSON.stringify(stored));
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

export function ruleDistance(holding, quote, history) {
  const price = quote?.price;
  if (!(price > 0)) return null;

  const rules = [];
  const averageCost = Number(holding.average_cost);
  const lossPct = Number(holding.loss_limit_pct);
  const stages = Array.isArray(holding?.rule_stages) ? holding.rule_stages : [];
  const hasStagedStop = stages.some(stage => String(stage?.type || '').toLowerCase() === 'stop');

  if (!hasStagedStop && Number.isFinite(lossPct) && lossPct > 0 && Number.isFinite(averageCost) && averageCost > 0) {
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

      if (type === 'stop' && Number.isFinite(stagePct) && stagePct > 0 && Number.isFinite(averageCost) && averageCost > 0) {
        const target = averageCost * (1 - stagePct / 100);
        rules.push({ type:'staged stop', target, direction:'below', distancePct:(price / target - 1) * 100, breached:price <= target, stageIndex:index });
      }

      if (type === 'take_profit' && Number.isFinite(stagePct) && stagePct > 0 && Number.isFinite(averageCost) && averageCost > 0) {
        const target = averageCost * (1 + stagePct / 100);
        rules.push({ type:'take profit', target, direction:'above', distancePct:(target / price - 1) * 100, breached:price >= target,
          fraction:Number.isFinite(Number(stage?.fraction)) ? Number(stage.fraction) : null, stageIndex:index });
      }

      if (type === 'time_limit' && Number.isFinite(days) && days > 0 && baseDate) {
        const heldDays = daysBetween(baseDate, dateOnly(new Date()));
        rules.push({ type:'time limit', target:days, distancePct:days - heldDays, breached:heldDays >= days, unit:'days', stageIndex:index });
      }

      if (type.includes('trailing')) {
        const state = stageEvaluation.state['stage_' + index];
        if (state?.activatedDate && Number(state.peak) > 0 && Number.isFinite(stagePct) && stagePct > 0) {
          const target = Number(state.peak) * (1 - stagePct / 100);
          rules.push({ type:'trailing stop', target, direction:'below', distancePct:(price / target - 1) * 100, breached:price <= target,
            stageIndex:index, active:true, activatedDate:state.activatedDate });
        }
      }
    });
  } else {
    const exitType = String(holding.exit_rule_type || '').toLowerCase();
    const exitValue = Number(holding.exit_rule_value);

    if (exitType.includes('trailing') && Number.isFinite(exitValue) && exitValue > 0 && sortedHistoryPoints(history).length) {
      const points = sortedHistoryPoints(history);
      const startDate = String(holding.purchase_date || points[0]?.date || '');
      const peak = points.filter(point => point.date >= startDate).reduce((max,point) => Math.max(max,Number(point.price)),0);
      const stop = peak * (1 - exitValue / 100);
      if (stop > 0) rules.push({ type:'trailing stop', target:stop, direction:'below', distancePct:(price / stop - 1) * 100, breached:price <= stop });
    }

    if (exitType.includes('time') && Number.isFinite(exitValue) && exitValue > 0 && holding.purchase_date) {
      const heldDays = daysBetween(holding.purchase_date, dateOnly(new Date()));
      rules.push({ type:'time limit', target:exitValue, distancePct:exitValue - heldDays, breached:heldDays >= exitValue, unit:'days' });
    }
  }

  if (!rules.length) return { state:'no-rule', rules:[], nearest:null, stageState:stageEvaluation.state, stageStateDirty:stageEvaluation.dirty };

  const actionable = rules.filter(rule => !rule.unit);
  const nearest = actionable.length
    ? [...actionable].sort((a,b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))[0]
    : [...rules].sort((a,b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))[0];

  if (rules.some(rule => rule.breached && rule.direction === 'below')) return { state:'breached', rules, nearest, stageState:stageEvaluation.state, stageStateDirty:stageEvaluation.dirty };
  const targetReached = rules.find(rule => rule.breached && rule.direction === 'above');
  if (targetReached) return { state:'target-reached', rules, nearest:targetReached, targetReached, stageState:stageEvaluation.state, stageStateDirty:stageEvaluation.dirty };
  if (rules.some(rule => !rule.breached && !rule.unit && Number.isFinite(rule.distancePct) && rule.distancePct >= 0 && rule.distancePct <= 3)) return { state:'near', rules, nearest, stageState:stageEvaluation.state, stageStateDirty:stageEvaluation.dirty };

  const timeRule = rules.find(rule => rule.unit === 'days');
  if (timeRule?.breached) return { state:'breached', rules, nearest:timeRule, stageState:stageEvaluation.state, stageStateDirty:stageEvaluation.dirty };
  if (timeRule && Number.isFinite(timeRule.distancePct) && timeRule.distancePct >= 0 && timeRule.distancePct <= 3) return { state:'near', rules, nearest:timeRule, stageState:stageEvaluation.state, stageStateDirty:stageEvaluation.dirty };

  return { state:'clear', rules, nearest, stageState:stageEvaluation.state, stageStateDirty:stageEvaluation.dirty };
}

async function fetchSignalGate() {
  const rows = await supabase(
    'portfolio_signal_family_scorecard?select=signal_type,evaluated_samples,mean_20d_excess_return_pct,median_20d_excess_return_pct,win_rate_20d,lifecycle_status&order=signal_type.asc',
  );
  const families = rows.map(row => ({
    signalType: String(row.signal_type || 'unknown'),
    samples: Number(row.evaluated_samples || 0),
    meanExcessPct: row.mean_20d_excess_return_pct == null ? null : Number(row.mean_20d_excess_return_pct),
    medianExcessPct: row.median_20d_excess_return_pct == null ? null : Number(row.median_20d_excess_return_pct),
    winRatePct: row.win_rate_20d == null ? null : Number(row.win_rate_20d) * 100,
    lifecycle: String(row.lifecycle_status || 'experimental'),
    decisionEligible: String(row.lifecycle_status) === 'active'
      && Number(row.evaluated_samples) >= 30
      && Number(row.median_20d_excess_return_pct) > 0
      && Number(row.win_rate_20d) > 0.5,
  }));
  return {
    eligible: families.filter(row => row.decisionEligible).length,
    experimental: families.filter(row => row.lifecycle === 'experimental' || row.lifecycle === 'under_review').length,
    retired: families.filter(row => row.lifecycle === 'retired').length,
    families,
    note: 'Decision-driving signal families require 30+ samples, positive median 20D excess return, and win rate above 50%.',
  };
}

async function fetchEarnings(symbols) {
  const key = String(process.env.FINNHUB_API_KEY || '').trim();
  if (!symbols.length) return { status: 'ok', events: [] };
  if (!key) return { status: 'no_key', events: [] };
  const today = dateOnly(new Date());
  const to = addDays(today, 7);
  try {
    const url = new URL('https://finnhub.io/api/v1/calendar/earnings');
    url.searchParams.set('from', today);
    url.searchParams.set('to', to);
    url.searchParams.set('international', 'false');
    url.searchParams.set('token', key);
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return { status: 'unavailable', events: [], reason: 'HTTP ' + response.status };
    const body = await response.json();
    const wanted = new Set(symbols.map(s => s.toUpperCase()));
    const events = (Array.isArray(body?.earningsCalendar) ? body.earningsCalendar : [])
      .filter(row => wanted.has(String(row?.symbol || '').toUpperCase()))
      .map(row => ({ symbol:String(row.symbol).toUpperCase(), date:String(row.date), daysUntil:daysBetween(today,String(row.date)), hour:row.hour||null }))
      .filter(row => row.daysUntil >= 0 && row.daysUntil <= 7)
      .sort((a,b)=>a.daysUntil-b.daysUntil||a.symbol.localeCompare(b.symbol));
    return { status:'ok', events };
  } catch(error){ return {status:'unavailable',events:[],reason:error instanceof Error?error.message:'Earnings request failed'}; }
}

async function fetchForecastProgress() {
  const rows = await supabase(
    'forecast_snapshots?select=ticker,horizon,status,target_date,verified_at,created_at&horizon=eq.20&order=created_at.desc&limit=2000',
  );
  const today = dateOnly(new Date());
  const verified = rows.filter(row => row.status === 'verified');
  const pending = rows.filter(row => row.status === 'pending');
  const due = pending
    .filter(row => row.target_date && row.target_date <= today)
    .sort((a, b) => String(a.target_date).localeCompare(String(b.target_date)));

  const verifiedTickers = new Set(verified.map(row => String(row.ticker).toUpperCase()));
  const verifiedDates = new Set(verified.map(row => String(row.verified_at || '').slice(0, 10)).filter(Boolean));
  const independentHint = Math.min(
    verified.length,
    new Set(verified.map(row => String(row.ticker).toUpperCase() + ':' + String(row.verified_at || '').slice(0, 10))).size,
  );

  return {
      verified: verified.length,
      independentVerified: independentForecastCount(verified),
      pending: pending.length,
      due: due.length,
      remaining: Math.max(0, 50 - verified.length),
      tickers: verifiedTickers.size,
      dates: verifiedDates.size,
      distinctTickerDates: independentHint,
      gate: verified.length >= 50 ? 'established' : 'building',
    };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
  if (!requireAccess(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET required' });

  try {
    const holdingRows = await supabase(
      'portfolio_holdings?select=id,symbol,quantity,average_cost,purchase_date,decision_thesis,loss_limit_pct,exit_rule_type,exit_rule_value,exit_rule_text,broker_alert_prices,broker_alerts,broker_alerts_review_required,rule_stages,rule_stage_state,target_allocation_pct,max_allocation_pct,risk_group,risk_beta,risk_leverage,scenario_shock_pct&quantity=gt.0&order=symbol.asc',
    );
    const transactionRows = await supabase(
      'portfolio_transactions?select=symbol,transaction_type,trade_date,quantity,amount,brokerage,source_row&order=trade_date.asc,source_row.asc',
    );

    const symbols = holdingRows.map(row => String(row.symbol).toUpperCase());
    const quoteEntries = await Promise.all(symbols.map(async symbol => {
      try { return [symbol, await routedQuote(symbol)]; } catch { return [symbol, null]; }
    }));
    const quotes = Object.fromEntries(quoteEntries);

    const totalCurrentValue = symbols.reduce((sum, symbol) => {
      const holding = holdingRows.find(row => String(row.symbol).toUpperCase() === symbol);
      const price = Number(quotes[symbol]?.price);
      const quantity = Number(holding?.quantity);
      return sum + (price > 0 && quantity > 0 ? price * quantity : 0);
    }, 0);

    const histories = {};
    await Promise.all([...symbols, 'SPY', 'SOXX'].filter((symbol,index,list)=>list.indexOf(symbol)===index).map(async symbol => {
      try { histories[symbol] = await routedHistory(symbol, '1y'); } catch {}
    }));

    const actionItems = [];
    const ruleStates = [];

    for (const holding of holdingRows) {
      const symbol = String(holding.symbol).toUpperCase();
      const q = quotes[symbol];
      if (!q?.price) {
        ruleStates.push({ symbol, state: 'no-data', message: 'Live price unavailable.' });
        continue;
      }
      const rules = ruleDistance(holding, q, histories[symbol]);
      if (rules?.stageStateDirty && holding.id) {
        try {
          await supabase('portfolio_holdings?id=eq.' + encodeURIComponent(holding.id), {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ rule_stage_state: rules.stageState || {} }),
          });
        } catch {}
      }
      ruleStates.push({
        symbol,
        state: rules.state,
        nearestRule: rules.nearest ? {
          type: rules.nearest.type,
          target: money(rules.nearest.target),
          distance: rules.nearest.unit === 'days'
            ? Number(rules.nearest.distancePct.toFixed(0))
            : pct(rules.nearest.distancePct),
          unit: rules.nearest.unit || 'percent',
        } : null,
        holdingSince: holding.purchase_date || null,
      });

      const currentAllocationPct = totalCurrentValue > 0 && Number(q?.price) > 0
        ? (Number(q.price) * Number(holding.quantity) / totalCurrentValue) * 100
        : null;
      const targetAllocationPct = Number(holding.target_allocation_pct);
      const maxAllocationPct = Number(holding.max_allocation_pct);
      const hasTarget = Number.isFinite(targetAllocationPct) && targetAllocationPct >= 0;
      const hasMax = Number.isFinite(maxAllocationPct) && maxAllocationPct >= 0;

      if (currentAllocationPct != null && hasMax && currentAllocationPct >= maxAllocationPct) {
        const excess = currentAllocationPct - maxAllocationPct;
        actionItems.push({
          severity: excess >= 2 ? 'ACT' : 'WATCH',
          symbol,
          title: 'Allocation above maximum',
          detail: 'Current weight is ' + currentAllocationPct.toFixed(1) + '% vs your ' + maxAllocationPct.toFixed(1) + '% maximum. Review reducing exposure; this is not an automatic sell instruction.',
          impact: null,
        });
      } else if (
        currentAllocationPct != null &&
        hasTarget &&
        currentAllocationPct < targetAllocationPct &&
        String(holding.decision_thesis || '').trim() &&
        rules.state === 'clear'
      ) {
        const recent = sortedHistoryPoints(histories[symbol]).slice(-20);
        const recentHigh = recent.length ? Math.max(...recent.map(point => Number(point.price))) : null;
        const pullbackPct = recentHigh && Number(q.price) > 0 ? (recentHigh / Number(q.price) - 1) * 100 : null;
        const pullbackThreshold = pullbackThresholdPct(recent);
        const benchmarkSymbol = String(holding.risk_group || '').toLowerCase() === 'semiconductor' ? 'SOXX' : 'SPY';
        const benchmarkRecent = sortedHistoryPoints(histories[benchmarkSymbol]).slice(-20);
        const stockStart = recent.length > 1 ? Number(recent[0].price) : null;
        const stockEnd = recent.length > 1 ? Number(recent.at(-1).price) : null;
        const benchmarkStart = benchmarkRecent.length > 1 ? Number(benchmarkRecent[0].price) : null;
        const benchmarkEnd = benchmarkRecent.length > 1 ? Number(benchmarkRecent.at(-1).price) : null;
        const stockReturn = stockStart > 0 && stockEnd > 0 ? (stockEnd / stockStart - 1) * 100 : null;
        const benchmarkReturn = benchmarkStart > 0 && benchmarkEnd > 0 ? (benchmarkEnd / benchmarkStart - 1) * 100 : null;
        const supportingEvidence = stockReturn != null && benchmarkReturn != null && stockReturn >= benchmarkReturn;
        const meaningfulPullback = pullbackPct != null && pullbackThreshold != null && pullbackPct >= pullbackThreshold;
        if (meaningfulPullback || supportingEvidence) {
          actionItems.push({
            severity: 'WATCH',
            symbol,
            title: 'Increase allocation review',
            detail: 'Recorded thesis is present and no rule is near/breached. Evidence: ' +
              (meaningfulPullback
                ? 'pullback ' + pullbackPct.toFixed(1) + '% from recent high vs ' + pullbackThreshold.toFixed(1) + '% volatility-scaled threshold (2× recent daily volatility)'
                : '20-day return is holding up versus ' + benchmarkSymbol) +
              '. Review only; this is not an automatic buy instruction.',
            impact: null,
          });
        }
      }

      if (rules.state === 'breached') {
        const hit = rules.rules.find(rule => rule.breached && rule.direction === 'below') || rules.rules.find(rule => rule.breached) || rules.nearest;
        actionItems.push({
          severity: 'ACT',
          symbol,
          title: 'Rule reached',
          detail: hit?.unit === 'days'
            ? 'Your ' + hit.type + ' has reached ' + hit.target + ' days.'
            : 'Price $' + q.price.toFixed(2) + ' is at/below your ' + hit.type + ' of $' + hit.target.toFixed(2) + '.',
          impact: money((Number(holding.quantity) * Math.max(0, q.price - Number(holding.average_cost))) || 0),
        });
      } else if (rules.state === 'target-reached') {
        const target = rules.targetReached || rules.nearest;
        actionItems.push({
          severity: 'WATCH',
          symbol,
          title: 'Target reached',
          detail: 'Price $' + q.price.toFixed(2) + ' is at/above your broker upside alert of $' + target.target.toFixed(2) + '. Review your staged exit rule.',
          impact: money((Number(holding.quantity) * Math.max(0, q.price - Number(holding.average_cost))) || 0),
        });
      } else if (rules.state === 'near') {
        const near = rules.nearest;
        actionItems.push({
          severity: 'WATCH',
          symbol,
          title: 'Close to your rule',
          detail: near?.unit === 'days'
            ? Math.max(0, Number(near.distance)) + ' days remain on your ' + near.type + '.'
            : '$' + q.price.toFixed(2) + ' is ' + Math.max(0, near?.distancePct ?? 0).toFixed(1) + '% above your ' + near?.type + ' at $' + near.target.toFixed(2) + '.',
          impact: null,
        });
      } else if (rules.state === 'no-rule') {
        actionItems.push({
          severity: 'SETUP',
          symbol,
          title: 'No active rule',
          detail: 'Add a loss limit or exit rule so the dashboard can monitor this holding automatically.',
          impact: null,
        });
      }
    }

    const earningsResult = await fetchEarnings(symbols);
    const earnings = earningsResult.events;
    for (const event of earnings.slice(0, 3)) {
      actionItems.push({
        severity: 'WATCH',
        symbol: event.symbol,
        title: event.daysUntil === 0 ? 'Earnings today' : 'Earnings in ' + event.daysUntil + ' day' + (event.daysUntil === 1 ? '' : 's'),
        detail: event.date + (event.hour ? ' · ' + event.hour.toUpperCase() : ''),
        impact: null,
      });
    }

    actionItems.sort((a, b) => ({ ACT: 0, WATCH: 1, SETUP: 2 }[a.severity] - { ACT: 0, WATCH: 1, SETUP: 2 }[b.severity]) || a.symbol.localeCompare(b.symbol));

    const actual = calculateActualPortfolio(holdingRows, transactionRows, quotes, histories);
    const benchmark = {};
    for (const symbol of ['SPY', 'SOXX']) {
      try {
        const q = await routedQuote(symbol);
        benchmark[symbol] = simulateSameCash(transactionRows, histories[symbol], q.price);
      } catch {
        benchmark[symbol] = simulateSameCash(transactionRows, histories[symbol], null);
      }
    }

    const topHoldings = holdingRows.map(holding => {
      const q = quotes[String(holding.symbol).toUpperCase()];
      return {
        symbol: String(holding.symbol).toUpperCase(),
        value: q?.price > 0 ? q.price * Number(holding.quantity) : 0,
      };
    }).filter(row => row.value > 0).sort((a, b) => b.value - a.value);

    const topValue = topHoldings.slice(0, 3).reduce((sum, row) => sum + row.value, 0);
    const concentrationPct = actual.currentValue > 0 ? topValue / actual.currentValue * 100 : null;

    const scenarioGroups = {};
    for (const holding of holdingRows) {
      const symbol=String(holding.symbol).toUpperCase();
      const last=sortedHistoryPoints(histories[symbol]).at(-1);
      const price=Number(quotes[symbol]?.price)>0?Number(quotes[symbol].price):Number(last?.price);
      const value=price>0?price*Number(holding.quantity):0;
      if(!(value>0))continue;
      const group=String(holding.risk_group||'unclassified').trim().toLowerCase()||'unclassified';
      const beta=Number.isFinite(Number(holding.risk_beta))?Math.max(0,Number(holding.risk_beta)):1;
      const leverage=Number.isFinite(Number(holding.risk_leverage))&&Number(holding.risk_leverage)>0?Number(holding.risk_leverage):1;
      const shockPct=Number.isFinite(Number(holding.scenario_shock_pct))?Math.max(0,Number(holding.scenario_shock_pct)):15;
      scenarioGroups[group] ||= {group,grossValue:0,stressValue:0,weightedShock:0,holdings:0};
      scenarioGroups[group].grossValue+=value;
      scenarioGroups[group].stressValue+=value*beta*leverage;
      scenarioGroups[group].weightedShock+=value*beta*leverage*shockPct/100;
      scenarioGroups[group].holdings++;
    }
    const riskScenarios=Object.values(scenarioGroups).map(item=>({...item,shock:-item.weightedShock,effectiveShockPct:item.stressValue>0?item.weightedShock/item.stressValue*100:null})).sort((a,b)=>b.weightedShock-a.weightedShock);
    const totalScenarioShock=riskScenarios.reduce((sum,item)=>sum+item.shock,0);

    const portfolioRules = {
      total: ruleStates.length,
      breached: ruleStates.filter(row => row.state === 'breached').length,
      targetReached: ruleStates.filter(row => row.state === 'target-reached').length,
      near: ruleStates.filter(row => row.state === 'near').length,
      noRule: ruleStates.filter(row => row.state === 'no-rule').length,
      noData: ruleStates.filter(row => row.state === 'no-data').length,
      states: ruleStates,
    };

    const forecast = await fetchForecastProgress();
    const signalGate = await fetchSignalGate();

    return res.status(200).json({
      ok: true,
      checkedAt: new Date().toISOString(),
      actionItems: actionItems.filter(item => item.severity !== 'SETUP').slice(0, 3),
      rules: portfolioRules,
      portfolio: {
        holdings: holdingRows.length,
        currentValue: money(actual.currentValue),
        netContributed: money(actual.netContributed),
        cashFlowPnl: money(actual.pnl),
        concentrationTop3Pct: pct(concentrationPct),
        semiconductorShock15Pct: money(totalScenarioShock),
        scenarioShockTotal: money(totalScenarioShock),
        riskScenarios,
        quoteCoverage: actual.quoteCoverage,
      },
      benchmark,
      benchmarkCoverage: Object.fromEntries(Object.entries(benchmark).map(([symbol,item])=>[symbol,item.coverage||null])),
      earnings: earnings.slice(0, 7),
      earningsStatus: earningsResult.status,
      earningsError: earningsResult.reason || null,
      forecast,
      signalGate,
      notes: [
        'Action items are review prompts based on your stored rules and current evidence; they are not automatic trade instructions.',
        'Benchmark results mirror your dated portfolio cash flows using the same cash amounts on the same dates.',
        'Semiconductor shock includes SOXL at 3x leverage and is a scenario, not a prediction.',
        '50 verified forecasts is a minimum evidence gate; independent count uses non-overlapping forecast windows by ticker and horizon.',
        'Decision-driving signal families require 30+ samples, positive median 20D excess return, and win rate above 50%.'
      ],
    });
  } catch (error) {
    console.error('decision center error:', error);
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Decision center unavailable.' });
  }
}