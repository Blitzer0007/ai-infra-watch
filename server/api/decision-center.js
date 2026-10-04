import { requireAccess } from '../../api/_access-auth.js';
import { history as routedHistory, quote as routedQuote } from '../../api/_market-data.js';

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

async function supabase(path) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: sbHeaders() });
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
function businessDaysBetween(from, to) {
  const start = new Date(String(from) + 'T00:00:00Z');
  const end = new Date(String(to) + 'T00:00:00Z');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}
function independentForecastCount(rows) {
  const byTicker = new Map();
  const ordered = [...rows].filter(row => row?.status === 'verified')
    .sort((a,b)=>String(a.created_at || a.verified_at || a.target_date || '').localeCompare(String(b.created_at || b.verified_at || b.target_date || '')));
  for (const row of ordered) {
    const ticker = String(row.ticker || '').toUpperCase();
    const anchor = String(row.created_at || row.verified_at || row.target_date || '').slice(0,10);
    if (!ticker || !anchor) continue;
    const list = byTicker.get(ticker) || [];
    if (!list.length || businessDaysBetween(list[list.length-1], anchor) >= 20) list.push(anchor);
    byTicker.set(ticker, list);
  }
  return [...byTicker.values()].reduce((sum,list)=>sum+list.length,0);
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
  const priceByDate = new Map((benchmarkHistory?.points || []).map(point => [point.date, Number(point.price)]));
  let shares = 0;
  let netDeposits = 0;
  const ordered = [...transactions].sort(
    (a, b) => String(a.trade_date).localeCompare(String(b.trade_date)) || Number(a.source_row || 0) - Number(b.source_row || 0),
  );

  for (const tx of ordered) {
    const price = Number(previousOrSamePoint(benchmarkHistory?.points || [], tx.trade_date)?.price);
    if (!(price > 0)) continue;

    if (tx.transaction_type === 'BUY') {
      const cash = transactionNetCash(tx);
      shares += cash / price;
      netDeposits += cash;
    } else {
      const cash = transactionNetCash(tx);
      const sharesToSell = Math.min(shares, cash / price);
      shares -= sharesToSell;
      netDeposits -= cash;
    }
  }

  const value = shares * benchmarkCurrent;
  return {
    value,
    netDeposits,
    pnl: value - netDeposits,
    shares,
  };
}

function calculateActualPortfolio(holdings, transactionRows, quotes) {
  const currentValue = holdings.reduce((sum, holding) => {
    const q = quotes[holding.symbol];
    return sum + (q?.price > 0 ? q.price * Number(holding.quantity) : 0);
  }, 0);

  let buyCash = 0;
  let saleCash = 0;
  for (const tx of transactionRows) {
    if (tx.transaction_type === 'BUY') buyCash += transactionNetCash(tx);
    else saleCash += transactionNetCash(tx);
  }

  const netContributed = buyCash - saleCash;
  const pnl = currentValue - netContributed;
  return {
    currentValue,
    buyCash,
    saleCash,
    netContributed,
    pnl,
  };
}

export function ruleDistance(holding, quote, history) {
  const price = quote?.price;
  if (!(price > 0)) return null;

  const rules = [];
  const lossPct = Number(holding.loss_limit_pct);
  if (Number.isFinite(lossPct) && lossPct > 0) {
    const stop = Number(holding.average_cost) * (1 - lossPct / 100);
    if (stop > 0) {
      const distancePct = (price / stop - 1) * 100;
      rules.push({
        type: 'loss limit',
        target: stop,
        direction: 'below',
        distancePct,
        breached: price <= stop,
      });
    }
  }

  const alertPrices = Array.isArray(holding.broker_alert_prices)
    ? holding.broker_alert_prices.map(Number).filter(v => v > 0)
    : [];
  const averageCost = Number(holding.average_cost);
  for (const target of alertPrices) {
    const direction = Number.isFinite(averageCost) && target < averageCost ? 'below' : 'above';
    const distancePct = direction === 'above' ? (target / price - 1) * 100 * -1 : (price / target - 1) * 100;
    rules.push({
      type: direction === 'below' ? 'broker downside alert' : 'broker upside alert',
      target,
      direction,
      distancePct,
      breached: direction === 'below' ? price <= target : price >= target,
    });
  }

  const exitType = String(holding.exit_rule_type || '').toLowerCase();
  const exitValue = Number(holding.exit_rule_value);

  if (
    exitType.includes('trailing') &&
    Number.isFinite(exitValue) &&
    exitValue > 0 &&
    Array.isArray(history?.points) &&
    history.points.length
  ) {
    const start = String(holding.purchase_date || history.points[0]?.date || '');
    const since = history.points.filter(point => point.date >= start && Number(point.price) > 0);
    const peak = since.reduce((max, point) => Math.max(max, Number(point.price)), 0);
    const stop = peak * (1 - exitValue / 100);
    if (stop > 0) {
      const distancePct = (price / stop - 1) * 100;
      rules.push({
        type: 'trailing stop',
        target: stop,
        direction: 'below',
        distancePct,
        breached: price <= stop,
      });
    }
  }

  if (
    exitType.includes('time') &&
    Number.isFinite(exitValue) &&
    exitValue > 0 &&
    holding.purchase_date
  ) {
    const today = dateOnly(new Date());
    const heldDays = daysBetween(holding.purchase_date, today);
    const distanceDays = exitValue - heldDays;
    rules.push({
      type: 'time limit',
      target: exitValue,
      distancePct: distanceDays,
      breached: heldDays >= exitValue,
      unit: 'days',
    });
  }

  if (!rules.length) return { state: 'no-rule', rules: [], nearest: null };

  const actionable = rules.filter(rule => !rule.unit);
  const nearest = actionable.length
    ? [...actionable].sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))[0]
    : [...rules].sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))[0];

  if (rules.some(rule => rule.breached && rule.direction === 'below')) return { state: 'breached', rules, nearest };
  const targetReached = rules.find(rule => rule.breached && rule.direction === 'above');
  if (targetReached) return { state: 'target-reached', rules, nearest: targetReached, targetReached };
  if (rules.some(rule => !rule.breached && !rule.unit && Number.isFinite(rule.distancePct) && rule.distancePct >= 0 && rule.distancePct <= 3)) return { state: 'near', rules, nearest };

  const timeRule = rules.find(rule => rule.unit === 'days');
  if (timeRule?.breached) return { state: 'breached', rules, nearest: timeRule };
  if (
    timeRule &&
    Number.isFinite(timeRule.distancePct) &&
    timeRule.distancePct >= 0 &&
    timeRule.distancePct <= 3
  ) {
    return { state: 'near', rules, nearest: timeRule };
  }

  return { state: 'clear', rules, nearest };
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
    'forecast_snapshots?select=ticker,horizon,status,target_date,verified_at&horizon=eq.20&order=created_at.desc&limit=2000',
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
      'portfolio_holdings?select=id,symbol,quantity,average_cost,purchase_date,decision_thesis,loss_limit_pct,exit_rule_type,exit_rule_value,exit_rule_text,broker_alert_prices,target_allocation_pct,max_allocation_pct&quantity=gt.0&order=symbol.asc',
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
    await Promise.all(symbols.map(async symbol => {
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
        Number(q?.price) > Number(holding.average_cost) &&
        Number(q?.changePct) > 0
      ) {
        actionItems.push({
          severity: 'WATCH',
          symbol,
          title: 'Increase allocation review',
          detail: 'Current weight is ' + currentAllocationPct.toFixed(1) + '% vs your ' + targetAllocationPct.toFixed(1) + '% target while the position is profitable and up today. Review adding only if your thesis and evidence remain supportive.',
          impact: null,
        });
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

    const actual = calculateActualPortfolio(holdingRows, transactionRows, quotes);
    let benchmark = null;
    for (const symbol of ['SPY', 'SOXX']) {
      try {
        const [h, q] = await Promise.all([routedHistory(symbol, '5y'), routedQuote(symbol)]);
        benchmark = benchmark || {};
        benchmark[symbol] = simulateSameCash(transactionRows, h, q.price);
      } catch {}
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

    const semiconductorValue = holdingRows.reduce((sum, holding) => {
      const symbol = String(holding.symbol).toUpperCase();
      const isSemis = ['SOXL', 'NVDA', 'DRAM'].includes(symbol);
      if (!isSemis) return sum;
      const q = quotes[symbol];
      const leverage = LEVERAGE[symbol] || 1;
      return sum + (q?.price > 0 ? q.price * Number(holding.quantity) * leverage : 0);
    }, 0);
    const semiconductorShock = semiconductorValue > 0 ? -semiconductorValue * 0.15 : 0;

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
        semiconductorShock15Pct: money(semiconductorShock),
      },
      benchmark,
      earnings: earnings.slice(0, 7),
      earningsStatus: earningsResult.status,
      earningsError: earningsResult.reason || null,
      forecast,
      signalGate,
      notes: [
        'Action items are review prompts based on your stored rules and current evidence; they are not automatic trade instructions.',
        'Benchmark results mirror your dated portfolio cash flows using the same cash amounts on the same dates.',
        'Semiconductor shock includes SOXL at 3x leverage and is a scenario, not a prediction.',
        '50 verified forecasts is a minimum evidence gate; independent count uses non-overlapping 20-business-day anchors per ticker.',
        'Decision-driving signal families require 30+ samples, positive median 20D excess return, and win rate above 50%.'
      ],
    });
  } catch (error) {
    console.error('decision center error:', error);
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Decision center unavailable.' });
  }
}
