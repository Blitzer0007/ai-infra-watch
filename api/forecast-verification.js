const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

function missingConfig() {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  return missing;
}

function headers() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

function send(res, status, body) {
  res.status(status).json(body);
}

async function verifyDueForecasts() {
  const today = new Date().toISOString().slice(0, 10);
  const dueResponse = await fetch(
    SUPABASE_URL + '/rest/v1/forecast_snapshots?select=*&status=eq.pending&target_date=lte.' + today + '&order=target_date.asc&limit=100',
    { headers: headers() }
  );
  const due = await dueResponse.json();
  if (!dueResponse.ok) throw new Error(due?.message || 'Failed to load due forecasts.');

  const results = [];
  const failures = [];
  for (const forecast of due) {
    try {
      const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
        encodeURIComponent(String(forecast.ticker).toUpperCase()) +
        '?range=5y&interval=1d&events=div%2Csplits';
      const marketResponse = await fetch(url, { headers: { 'User-Agent': 'ai-infra-watch/1.0' } });
      if (!marketResponse.ok) throw new Error('Yahoo Finance returned HTTP ' + marketResponse.status);
      const marketJson = await marketResponse.json();
      const result = marketJson?.chart?.result?.[0];
      if (!result) throw new Error('No market history found.');
      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      const points = timestamps
        .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), price: closes[i] }))
        .filter(point => Number.isFinite(point.price));
      const point = points.find(item => item.date >= forecast.target_date) || points[points.length - 1];
      if (!point || !(Number(forecast.entry_price) > 0) || !(Number(point.price) > 0)) {
        throw new Error('No usable market point yet.');
      }

      const actualReturn = (Number(point.price) / Number(forecast.entry_price) - 1) * 100;
      const patch = {
        status: 'verified',
        verified_at: new Date().toISOString(),
        actual_date: point.date,
        actual_price: Number(point.price),
        actual_return: actualReturn,
        median_error: actualReturn - Number(forecast.median)
      };
      const updateResponse = await fetch(
        SUPABASE_URL + '/rest/v1/forecast_snapshots?id=eq.' + encodeURIComponent(forecast.id),
        { method: 'PATCH', headers: headers(), body: JSON.stringify(patch) }
      );
      const updateData = await updateResponse.json();
      if (!updateResponse.ok) throw new Error(updateData?.message || 'Supabase update failed.');
      results.push({ id: forecast.id, ticker: forecast.ticker, targetDate: forecast.target_date, actualDate: point.date, actualReturn });
    } catch (error) {
      failures.push({ id: forecast.id, ticker: forecast.ticker, error: error?.message || 'Verification failed.' });
    }
  }
  return { checked: due.length, verified: results.length, failed: failures.length, results, failures };
}

function normalize(row) {
  return {
    id: row.id,
    ticker: row.ticker,
    createdAt: row.created_at,
    targetDate: row.target_date,
    horizon: Number(row.horizon),
    scenarioId: row.scenario_id,
    entryPrice: Number(row.entry_price),
    median: Number(row.median),
    p25: Number(row.p25),
    p75: Number(row.p75),
    p10: Number(row.p10),
    p90: Number(row.p90),
    status: row.status,
    verifiedAt: row.verified_at || undefined,
    actualDate: row.actual_date || undefined,
    actualPrice: row.actual_price == null ? undefined : Number(row.actual_price),
    actualReturn: row.actual_return == null ? undefined : Number(row.actual_return),
    medianError: row.median_error == null ? undefined : Number(row.median_error)
  };
}

export default async function handler(req, res) {
  const missing = missingConfig();
  if (missing.length) return send(res, 503, {
    error: 'Supabase forecast storage is not configured for this deployment.',
    missing
  });
  try {
    const cronSecret = String(process.env.CRON_SECRET || '').trim();
    const authorization = String(req.headers?.authorization || '');
    const isCronRequest = cronSecret && authorization === 'Bearer ' + cronSecret;
    if (isCronRequest) {
      if (req.method !== 'GET') return send(res, 405, { error: 'Cron verification requires GET.' });
      const verification = await verifyDueForecasts();
      return send(res, 200, { ok: true, ...verification });
    }

    if (req.method === 'GET') {
      const response = await fetch(SUPABASE_URL + '/rest/v1/forecast_snapshots?select=*&order=created_at.desc&limit=100', { headers: headers() });
      const data = await response.json();
      if (!response.ok) return send(res, response.status, { error: data?.message || 'Failed to load forecasts.' });
      return send(res, 200, { forecasts: data.map(normalize) });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const required = ['id','ticker','createdAt','targetDate','horizon','scenarioId','entryPrice','median','p25','p75','p10','p90'];
      if (required.some(key => body[key] === undefined || body[key] === null || body[key] === '')) return send(res, 400, { error: 'Missing forecast fields.' });
      const row = {
        id: body.id, ticker: String(body.ticker).toUpperCase(), created_at: body.createdAt, target_date: body.targetDate,
        horizon: String(body.horizon), scenario_id: body.scenarioId, entry_price: Number(body.entryPrice), median: Number(body.median),
        p25: Number(body.p25), p75: Number(body.p75), p10: Number(body.p10), p90: Number(body.p90), status: 'pending'
      };
      const response = await fetch(SUPABASE_URL + '/rest/v1/forecast_snapshots?on_conflict=id', { method: 'POST', headers: { ...headers(), Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(row) });
      const data = await response.json();
      if (!response.ok) return send(res, response.status, { error: data?.message || 'Failed to save forecast.' });
      return send(res, 201, { forecast: normalize(data[0]) });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      if (!body.id) return send(res, 400, { error: 'Forecast id is required.' });
      const patch = {};
      if (body.status) patch.status = body.status;
      if (body.verifiedAt) patch.verified_at = body.verifiedAt;
      if (body.actualDate) patch.actual_date = body.actualDate;
      if (body.actualPrice != null) patch.actual_price = Number(body.actualPrice);
      if (body.actualReturn != null) patch.actual_return = Number(body.actualReturn);
      if (body.medianError != null) patch.median_error = Number(body.medianError);
      const response = await fetch(SUPABASE_URL + '/rest/v1/forecast_snapshots?id=eq.' + encodeURIComponent(body.id), { method: 'PATCH', headers: headers(), body: JSON.stringify(patch) });
      const data = await response.json();
      if (!response.ok) return send(res, response.status, { error: data?.message || 'Failed to update forecast.' });
      return send(res, 200, { forecast: normalize(data[0]) });
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return send(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    return send(res, 500, { error: error?.message || 'Forecast storage request failed.' });
  }
}
