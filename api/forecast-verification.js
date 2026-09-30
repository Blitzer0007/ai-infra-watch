const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

function configError() {
  return !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY;
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
  if (configError()) return send(res, 503, { error: 'Supabase forecast storage is not configured.' });
  try {
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
