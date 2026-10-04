import { requireAccess } from '../../api/_access-auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers(prefer = 'return=representation') {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase service configuration is missing');
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    Prefer: prefer,
  };
}

async function supabase(path, options = {}) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  });
  const text = await response.text();
  let data = [];
  try { data = text ? JSON.parse(text) : []; } catch { data = text; }
  if (!response.ok) throw new Error('Supabase scorecard request failed: HTTP ' + response.status);
  return data;
}

function isCron(req) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  return Boolean(secret) && req.headers?.authorization === 'Bearer ' + secret;
}

function authorize(req, res) {
  if (isCron(req)) return true;
  return requireAccess(req, res);
}

async function yahooHistory(symbol) {
  const now = Math.floor(Date.now() / 1000);
  const yearAgo = now - 370 * 86400;
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) +
    '?period1=' + yearAgo + '&period2=' + now + '&interval=1d&events=history';
  const response = await fetch(url, { headers: { 'User-Agent': 'ai-infra-watch/1.0' } });
  if (!response.ok) throw new Error('Yahoo history HTTP ' + response.status);
  const body = await response.json();
  const result = body?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  return timestamps.map((ts, i) => ({
    date: new Date(ts * 1000).toISOString().slice(0, 10),
    price: Number(closes[i]),
  })).filter(row => Number.isFinite(row.price)).sort((a, b) => a.date.localeCompare(b.date));
}

function forwardReturn(series, signalDate, signalPrice, offset) {
  if (!Number.isFinite(signalPrice) || signalPrice <= 0) return null;
  const start = series.findIndex(row => row.date > signalDate);
  if (start < 0 || start + offset >= series.length) return null;
  const target = series[start + offset];
  return { date: target.date, returnPct: (target.price / signalPrice - 1) * 100 };
}

async function evaluateDue() {
  const rows = await supabase(
    'portfolio_signal_scorecard?or=(target_5_status.eq.pending,target_20_status.eq.pending)&select=*&order=observed_at.asc&limit=250',
    { method: 'GET' }
  );
  if (!rows.length) return { evaluated: 0, families: 0 };

  const symbols = [...new Set(rows.map(row => String(row.symbol || '').toUpperCase()).filter(Boolean))];
  const series = {};
  for (const symbol of symbols) {
    try { series[symbol] = await yahooHistory(symbol); } catch { series[symbol] = []; }
  }
  const spy = await yahooHistory('SPY');
  let evaluated = 0;

  for (const row of rows) {
    const symbolSeries = series[String(row.symbol || '').toUpperCase()] || [];
    const signalDate = String(row.observed_at || '').slice(0, 10);
    const signalPrice = Number(row.signal_price);
    const updates = { updated_at: new Date().toISOString() };

    if (row.target_5_status === 'pending') {
      const target = forwardReturn(symbolSeries, signalDate, signalPrice, 4);
      if (target) {
        const benchStart = spy.findIndex(item => item.date > signalDate);
        const benchPrice = benchStart >= 0 ? spy[benchStart]?.price : null;
        const bench = benchPrice ? forwardReturn(spy, signalDate, benchPrice, 4) : null;
        updates.target_5_status = 'scored';
        updates.target_5_date = target.date;
        updates.target_5_return_pct = target.returnPct;
        updates.target_5_benchmark_return_pct = bench?.returnPct ?? null;
        updates.target_5_excess_return_pct = bench ? target.returnPct - bench.returnPct : null;
        evaluated++;
      }
    }

    if (row.target_20_status === 'pending') {
      const target = forwardReturn(symbolSeries, signalDate, signalPrice, 19);
      if (target) {
        const benchStart = spy.findIndex(item => item.date > signalDate);
        const benchPrice = benchStart >= 0 ? spy[benchStart]?.price : null;
        const bench = benchPrice ? forwardReturn(spy, signalDate, benchPrice, 19) : null;
        updates.target_20_status = 'scored';
        updates.target_20_date = target.date;
        updates.target_20_return_pct = target.returnPct;
        updates.target_20_benchmark_return_pct = bench?.returnPct ?? null;
        updates.target_20_excess_return_pct = bench ? target.returnPct - bench.returnPct : null;
        evaluated++;
      }
    }

    await supabase('portfolio_signal_scorecard?id=eq.' + encodeURIComponent(row.id), {
      method: 'PATCH',
      body: JSON.stringify(updates),
      headers: { Prefer: 'return=minimal' },
    });
  }

  const completed = await supabase(
    'portfolio_signal_scorecard?target_20_status=eq.scored&select=signal_type,symbol,observed_at,target_20_excess_return_pct&order=observed_at.asc',
    { method: 'GET' }
  );
  // Prevent repeated signals for the same ticker on the same observation date from inflating the evidence.
  const families = new Map();
  for (const row of completed) {
    const key = row.signal_type || 'unknown';
    const bucket = families.get(key) || new Map();
    const sampleKey = String(row.symbol || 'unknown').toUpperCase() + ':' + String(row.observed_at || '').slice(0, 10);
    if (!bucket.has(sampleKey) && Number.isFinite(Number(row.target_20_excess_return_pct))) {
      bucket.set(sampleKey, Number(row.target_20_excess_return_pct));
    }
    families.set(key, bucket);
  }
  for (const [signalType, sampleMap] of families) {
    const values = [...sampleMap.values()];
    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median = !sorted.length ? null : sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    const wins = values.filter(v => v > 0).length;
    const winRate = values.length ? wins / values.length : null;
    const lifecycle = values.length >= 30 && median != null && median > 0 && winRate != null && winRate > 0.5
      ? 'active'
      : values.length >= 30 && (median == null || median <= 0 || (winRate != null && winRate <= 0.5))
        ? 'retired'
        : values.length >= 10
          ? 'under_review'
          : 'experimental';
    await supabase('portfolio_signal_family_scorecard', {
      method: 'POST',
      body: JSON.stringify({
        signal_type: signalType,
        evaluated_samples: values.length,
        mean_20d_excess_return_pct: mean,
        median_20d_excess_return_pct: median,
        win_rate_20d: winRate,
        lifecycle_status: lifecycle,
        last_evaluated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
  }
  return { evaluated, families: families.size };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!authorize(req, res)) return;
  try {
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const signalKey = String(body.signalKey || body.signal_key || '').trim();
      if (!signalKey) return res.status(400).json({ error: 'signalKey is required' });
      const payload = {
        signal_key: signalKey,
        symbol: body.symbol ? String(body.symbol).toUpperCase() : null,
        signal_type: String(body.signalType || body.signal_type || 'unknown'),
        signal_state: body.signalState || body.signal_state || null,
        confidence: Number.isFinite(Number(body.confidence)) ? Number(body.confidence) : null,
        evidence: body.evidence || {},
        signal_price: Number.isFinite(Number(body.signalPrice)) ? Number(body.signalPrice) : null,
        observed_at: body.observedAt || new Date().toISOString(),
      };
      const result = await supabase('portfolio_signal_scorecard?on_conflict=signal_key', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      });
      return res.status(200).json({ ok: true, signal: result?.[0] || null });
    }

    if (req.method === 'GET') {
      if (isCron(req)) {
        const evaluated = await evaluateDue();
        return res.status(200).json({ ok: true, ...evaluated });
      }
      const result = await supabase('portfolio_signal_family_scorecard?select=*&order=signal_type.asc', { method: 'GET' });
      const families = result.map(row => ({
        ...row,
        decision_eligible: row.lifecycle_status === 'active'
          && Number(row.evaluated_samples) >= 30
          && Number(row.median_20d_excess_return_pct) > 0
          && Number(row.win_rate_20d) > 0.5,
      }));
      return res.status(200).json({ families });
    }

    if (req.method === 'PUT') {
      const result = await evaluateDue();
      return res.status(200).json({ ok: true, ...result });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Signal scorecard failed' });
  }
}
