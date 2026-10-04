import { requireAccess } from '../../api/_access-auth.js';
import { history as routedHistory, quote as routedQuote } from '../../api/_market-data.js';
import { calculateActualPortfolio, evaluateRuleStages, ruleDistance, simulateSameCash, countIndependentForecasts } from '../utils/decisionRules.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const LEVERAGE = { SOXL: 3 };
const DIGEST_TIME_ZONE = process.env.PORTFOLIO_DIGEST_TIMEZONE || 'Asia/Kolkata';
function localDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: DIGEST_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}
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

function signed(value) {
  return (value >= 0 ? '+' : '') + value.toFixed(2);
}

function transactionNetCash(transaction) {
  const amount = Number(transaction.amount) || 0;
  const brokerage = Number(transaction.brokerage) || 0;
  return transaction.transaction_type === 'SELL' ? Math.max(0, amount - brokerage) : amount + brokerage;
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
    note: 'Decision-driving signals require 30+ ticker/date samples, positive median 20D excess return, and win rate above 50%.',
  };
}

async function fetchEarnings(symbols) {
  const key=String(process.env.FINNHUB_API_KEY||'').trim();
  if(!symbols.length) return {status:'ok',events:[]};
  if(!key) return {status:'no_key',events:[]};
  const today=localDate(), to=addDays(today,7);
  try {
    const url=new URL('https://finnhub.io/api/v1/calendar/earnings');
    url.searchParams.set('from',today); url.searchParams.set('to',to); url.searchParams.set('international','false'); url.searchParams.set('token',key);
    const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
    if(!response.ok) return {status:'unavailable',events:[],reason:'HTTP '+response.status};
    const body=await response.json(), wanted=new Set(symbols.map(s=>s.toUpperCase()));
    const events=(Array.isArray(body?.earningsCalendar)?body.earningsCalendar:[])
      .filter(row=>wanted.has(String(row?.symbol||'').toUpperCase()))
      .map(row=>({symbol:String(row.symbol).toUpperCase(),date:String(row.date),daysUntil:daysBetween(today,String(row.date)),hour:row.hour||null}))
      .filter(row=>row.daysUntil>=0&&row.daysUntil<=7)
      .sort((a,b)=>a.daysUntil-b.daysUntil||a.symbol.localeCompare(b.symbol));
    return {status:'ok',events};
  } catch(error){ return {status:'unavailable',events:[],reason:error instanceof Error?error.message:'earnings fetch failed'}; }
}

async function fetchForecastProgress() {
  const rows=await supabase('forecast_snapshots?select=ticker,horizon,status,target_date,verified_at,created_at&horizon=eq.20&order=created_at.desc&limit=2000');
  const today=localDate();
  const verified=rows.filter(row=>row.status==='verified');
  const pending=rows.filter(row=>row.status==='pending');
  const due=pending.filter(row=>row.target_date&&row.target_date<=today).sort((a,b)=>String(a.target_date).localeCompare(String(b.target_date)));
  return {
    verified:verified.length,
    independentVerified:countIndependentForecasts(verified),
    pending:pending.length,
    due:due.length,
    remaining:Math.max(0,50-verified.length),
    tickers:new Set(verified.map(row=>String(row.ticker).toUpperCase())).size,
    dates:new Set(verified.map(row=>String(row.verified_at||'').slice(0,10)).filter(Boolean)).size,
    distinctTickerDates:new Set(verified.map(row=>String(row.ticker).toUpperCase()+':'+String(row.verified_at||'').slice(0,10))).size,
    gate:verified.length>=50?'established':'building',
    horizons:[20],
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
  if (!requireAccess(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET required' });

  try {
    const holdingRows = await supabase(
      'portfolio_holdings?select=id,symbol,quantity,average_cost,purchase_date,decision_thesis,loss_limit_pct,exit_rule_type,exit_rule_value,exit_rule_text,broker_alert_prices,broker_alerts,rule_stages,rule_stage_state,target_allocation_pct,max_allocation_pct,risk_group,shock_sensitivity&quantity=gt.0&order=symbol.asc',
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
        const hit = rules.rules.find(rule => rule.breached) || rules.nearest;
        actionItems.push({
          severity: 'ACT',
          symbol,
          title: 'Rule reached',
          detail: hit?.unit === 'days'
            ? 'Your ' + hit.type + ' has reached ' + hit.target + ' days.'
            : 'Price $' + q.price.toFixed(2) + ' is at/below your ' + hit.type + ' of $' + hit.target.toFixed(2) + '.',
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

    const earnings = await fetchEarnings(symbols);
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
      actionItems: actionItems.slice(0, 5),
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
      forecast,
      signalGate,
      notes: [
        'Action items are review prompts based on your stored rules and current evidence; they are not automatic trade instructions.',
        'Benchmark results mirror your dated portfolio cash flows using the same cash amounts on the same dates.',
        'Semiconductor shock includes SOXL at 3x leverage and is a scenario, not a prediction.',
        '50 verified forecasts is a minimum validation gate; it does not imply 50 independent tests.',
        'Unproven signal families remain experimental and are excluded from decision-driving status until the independent-sample gate is met.',
      ],
    });
  } catch (error) {
    console.error('decision center error:', error);
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Decision center unavailable.' });
  }
}
