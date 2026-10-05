import { requireAccess } from '../../api/_access-auth.js';
import { history as routedHistory } from '../../api/_market-data.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const TIME_ZONE = process.env.PORTFOLIO_DIGEST_TIMEZONE || 'Asia/Kolkata';

function isCron(req) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  return Boolean(secret) && req.headers?.authorization === 'Bearer ' + secret;
}
function authorize(req, res) {
  return isCron(req) || requireAccess(req, res);
}
function headers(prefer = 'return=representation') {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase service configuration is missing');
  return { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: prefer };
}
async function supabase(path, options = {}) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  });
  const body = await response.text();
  let data = [];
  try { data = body ? JSON.parse(body) : []; } catch { data = body; }
  if (!response.ok) throw new Error('Supabase decision journal request failed: HTTP ' + response.status + ' ' + body.slice(0, 300));
  return data;
}
function localDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}
function addDays(date, days) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function sameOrPreviousPoint(points, date) {
  const eligible = (points || []).filter(p => p.date <= date && Number(p.price) > 0);
  return eligible.length ? eligible[eligible.length - 1] : null;
}
function twentiethSessionAfter(points, date) {
  return (points || []).filter(p => p.date > date && Number(p.price) > 0)[19] || null;
}
function ruleTextFromHolding(h) {
  const parts = [];
  if (Number(h.loss_limit_pct) > 0) parts.push('Loss limit ' + Number(h.loss_limit_pct).toFixed(1) + '%');
  if (h.exit_rule_type) parts.push(String(h.exit_rule_type) + (h.exit_rule_value != null ? ' ' + Number(h.exit_rule_value).toFixed(1) : ''));
  if (Array.isArray(h.broker_alert_prices) && h.broker_alert_prices.length) parts.push('Broker alerts $' + h.broker_alert_prices.map(Number).filter(v => v > 0).map(v => v.toFixed(2)).join(' / $'));
  return parts.join(' · ');
}
async function getHolding(holdingId) {
  const rows = await supabase('portfolio_holdings?id=eq.' + encodeURIComponent(holdingId) + '&quantity=gt.0&select=*&limit=1', { method: 'GET' });
  return rows[0] || null;
}
async function getLatestForecast(symbol) {
  const rows = await supabase('forecast_snapshots?ticker=eq.' + encodeURIComponent(symbol) + '&horizon=eq.20&select=id,ticker,target_date,entry_price,median,p25,p75,created_at&order=created_at.desc&limit=1', { method: 'GET' });
  return rows[0] || null;
}
function decisionScore(decision, excessReturn) {
  if (!Number.isFinite(Number(excessReturn))) return null;
  const normalized = String(decision || '').toUpperCase();
  return ['REDUCE_REVIEW','EXIT_REVIEW'].includes(normalized)
    ? -Number(excessReturn)
    : Number(excessReturn);
}

export async function reviewDueDecisionJournal() {
  const today = localDate();
  const rows = await supabase('decision_journal_entries?review_status=eq.pending&review_target_date=lte.' + encodeURIComponent(today) + '&select=*&order=review_target_date.asc&limit=100', { method: 'GET' });
  let outcomesReady = 0;
  for (const row of rows) {
    try {
      const benchmarkSymbol = String(row.benchmark_symbol || 'SPY').toUpperCase() === 'SOXX' ? 'SOXX' : 'SPY';
      const [series, benchmarkSeries] = await Promise.all([
        routedHistory(String(row.symbol).toUpperCase(), '1y'),
        routedHistory(benchmarkSymbol, '1y'),
      ]);
      const target = twentiethSessionAfter(series.points || [], String(row.decision_date));
      if (!target || !(Number(row.decision_price) > 0) || !(Number(row.benchmark_entry_price) > 0)) continue;
      const benchmarkTarget = sameOrPreviousPoint(benchmarkSeries.points || [], target.date);
      if (!benchmarkTarget) continue;
      const outcomeReturn = (Number(target.price) / Number(row.decision_price) - 1) * 100;
      const benchmarkReturn = (Number(benchmarkTarget.price) / Number(row.benchmark_entry_price) - 1) * 100;
      const excessReturn = outcomeReturn - benchmarkReturn;
      const forecastError = row.forecast_median == null ? null : outcomeReturn - Number(row.forecast_median);
      const score = decisionScore(row.decision, excessReturn);
      await supabase('decision_journal_entries?id=eq.' + encodeURIComponent(row.id), {
        method: 'PATCH',
        body: JSON.stringify({
          review_status: 'outcome_ready',
          outcome_date: target.date,
          outcome_price: Number(target.price),
          outcome_return_pct: outcomeReturn,
          benchmark_return_pct: benchmarkReturn,
          excess_return_pct: excessReturn,
          decision_score_pct: score,
          forecast_error_pct: forecastError,
        }),
        headers: { Prefer: 'return=minimal' },
      });
      outcomesReady++;
    } catch {
      // Keep pending when market data is unavailable or transiently failing.
    }
  }
  return { checked: rows.length, outcomesReady };
}
export async function getWeeklyDecisionReview() {
  const today = localDate();
  const start = addDays(today, -6);
  const rows = await supabase('decision_journal_entries?select=decision_date,decision,review_status,outcome_return_pct,benchmark_return_pct,excess_return_pct,decision_score_pct,forecast_error_pct,rule_followed&order=decision_date.desc&limit=500', { method: 'GET' });
  const week = rows.filter(r => String(r.decision_date) >= start && String(r.decision_date) <= today);
  const outcomes = week.filter(r => Number.isFinite(Number(r.excess_return_pct)));
  const scored = outcomes.map(r => Number.isFinite(Number(r.decision_score_pct))
    ? Number(r.decision_score_pct)
    : decisionScore(r.decision, r.excess_return_pct)).filter(Number.isFinite);
  const ruleRows = week.filter(r => r.review_status === 'completed' && typeof r.rule_followed === 'boolean');
  const average = key => {
    const values = outcomes.map(r => Number(r[key])).filter(Number.isFinite);
    return values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
  };
  const adherence = ruleRows.length ? ruleRows.filter(r => r.rule_followed).length / ruleRows.length * 100 : null;
  const avgExcess = average('excess_return_pct');
  const avgScore = scored.length ? scored.reduce((a,b)=>a+b,0)/scored.length : null;
  const sampleAdequate = scored.length >= 10;
  const reflection = outcomes.length === 0
    ? 'No completed outcomes this week yet — make sure the next due review gets a rule-adherence decision.'
    : !sampleAdequate
      ? 'Small sample this week — use the outcomes as learning signals, not a performance conclusion.'
      : adherence != null && adherence < 100
        ? 'Which decision was hardest to follow, and what made the original rule unclear or inconvenient?'
        : avgScore != null && avgScore < 0
          ? 'Which decision score was weakest, and what evidence would have changed the original decision?'
          : 'Which thesis or evidence was most useful in explaining the outcome, and should it change your next rule?';
  return {
    period: { start, end: today },
    decisions: week.length,
    outcomes: outcomes.length,
    scoredOutcomes: scored.length,
    beatsBenchmark: scored.filter(v => v > 0).length,
    averageExcessReturnPct: avgExcess,
    averageDecisionScorePct: avgScore,
    averageForecastErrorPct: average('forecast_error_pct'),
    ruleAdherencePct: adherence,
    openOutcomeReviews: rows.filter(r => r.review_status === 'outcome_ready').length,
    sampleAdequate,
    sampleLabel: sampleAdequate ? 'Decision score is directional; n=' + scored.length : 'INSUFFICIENT SAMPLE · n=' + scored.length + ' < 10',
    reflection,
  };
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
  if (!authorize(req, res)) return;
  try {
    if (isCron(req)) return res.status(200).json({ ok: true, ...(await reviewDueDecisionJournal()) });
    if (req.method === 'GET') {
      const entries = await supabase('decision_journal_entries?select=*&order=decision_date.desc,created_at.desc&limit=100', { method: 'GET' });
      return res.status(200).json({ ok: true, entries, weekly: await getWeeklyDecisionReview() });
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const holdingId = String(body.holdingId || body.holding_id || '').trim();
      const decision = String(body.decision || '').trim().toUpperCase();
      const thesis = String(body.thesis || body.decisionThesis || '').trim();
      if (!holdingId || !['HOLD','ADD_REVIEW','REDUCE_REVIEW','EXIT_REVIEW','WATCH'].includes(decision)) return res.status(400).json({ error: 'holdingId and a valid decision are required.' });
      if (!thesis) return res.status(400).json({ error: 'Record the thesis before logging the decision.' });
      const holding = await getHolding(holdingId);
      if (!holding) return res.status(404).json({ error: 'Held portfolio position not found.' });
      const symbol = String(holding.symbol).toUpperCase();
      const benchmarkSymbol = String(body.benchmarkSymbol || 'SPY').toUpperCase() === 'SOXX' ? 'SOXX' : 'SPY';
      const [series, benchmarkSeries, forecast] = await Promise.all([routedHistory(symbol, '1y'), routedHistory(benchmarkSymbol, '1y'), getLatestForecast(symbol)]);
      const points = series.points || [];
      const latest = points.filter(p => Number(p.price) > 0).at(-1);
      const benchmarkEntry = sameOrPreviousPoint(benchmarkSeries.points || [], latest?.date || '');
      if (!latest || !benchmarkEntry) return res.status(503).json({ error: 'Market close or benchmark price is unavailable for this decision.' });
      const reviewTarget = twentiethSessionAfter(points, latest.date);
      const targetReviewDate = reviewTarget?.date || addDays(latest.date, 28);
      const effectiveRule = String(body.ruleText || '').trim() || ruleTextFromHolding(holding) || null;
      const ruleSnapshot = {
        lossLimitPct: holding.loss_limit_pct == null ? null : Number(holding.loss_limit_pct),
        exitRuleType: holding.exit_rule_type || null,
        exitRuleValue: holding.exit_rule_value == null ? null : Number(holding.exit_rule_value),
        exitRuleText: holding.exit_rule_text || '',
        brokerAlertPrices: Array.isArray(holding.broker_alert_prices) ? holding.broker_alert_prices.map(Number).filter(Number.isFinite) : [],
        practicalNotes: holding.practical_notes || '',
      };
      const row = {
        holding_id: holding.id,
        symbol,
        decision_date: latest.date,
        decision,
        thesis,
        rule_text: effectiveRule,
        rule_snapshot: ruleSnapshot,
        decision_price: Number(latest.price),
        benchmark_symbol: benchmarkSymbol,
        benchmark_entry_price: Number(benchmarkEntry.price),
        action_taken: ['none', 'BUY', 'SELL', 'HOLD', 'OTHER'].includes(String(body.actionTaken || '').toUpperCase())
          ? String(body.actionTaken || 'none').toUpperCase()
          : 'none',
        transaction_id: String(body.transactionId || '').trim() || null,
        forecast_snapshot_id: forecast?.id || null,
        forecast_median: forecast?.median == null ? null : Number(forecast.median),
        forecast_p25: forecast?.p25 == null ? null : Number(forecast.p25),
        forecast_p75: forecast?.p75 == null ? null : Number(forecast.p75),
        review_target_date: targetReviewDate,
      };
      const saved = await supabase('decision_journal_entries', { method: 'POST', body: JSON.stringify(row) });
      return res.status(201).json({ ok: true, entry: saved?.[0] || null });
    }
    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const id = String(body.id || req.query?.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id is required' });
      const update = {};
      if (body.ruleFollowed !== undefined) update.rule_followed = body.ruleFollowed == null ? null : Boolean(body.ruleFollowed);
      if (body.reviewNotes !== undefined) update.review_notes = String(body.reviewNotes || '').trim() || null;
      if (body.ruleFollowed !== undefined) {
        update.review_status = body.ruleFollowed == null ? 'outcome_ready' : 'completed';
        update.reviewed_at = body.ruleFollowed == null ? null : new Date().toISOString();
      }
      const saved = await supabase('decision_journal_entries?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(update) });
      if (!saved.length) return res.status(404).json({ error: 'Decision journal entry not found.' });
      return res.status(200).json({ ok: true, entry: saved[0] });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Decision journal failed.' });
  }
}
