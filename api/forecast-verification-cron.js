const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const CRON_SECRET = String(process.env.CRON_SECRET || '').trim();

function supabaseHeaders() {
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

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

async function marketHistory(ticker) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(ticker) +
    '?range=5y&interval=1d&events=div%2Csplits';
  const response = await fetch(url, { headers: { 'User-Agent': 'ai-infra-watch/1.0' } });
  if (!response.ok) throw new Error('Yahoo Finance returned HTTP ' + response.status);
  const json = await response.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('No Yahoo Finance history for ' + ticker);
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  return timestamps
    .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), price: closes[i] }))
    .filter(point => Number.isFinite(point.price));
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'Method not allowed.' });
  }

  if (CRON_SECRET) {
    const auth = String(req.headers?.authorization || '');
    if (auth !== 'Bearer ' + CRON_SECRET) return send(res, 401, { error: 'Unauthorized.' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return send(res, 503, { error: 'Supabase forecast storage is not configured.' });
  }

  try {
    const dueResponse = await fetch(
      SUPABASE_URL + '/rest/v1/forecast_snapshots?select=*&status=eq.pending&target_date=lte.' + todayUtc() + '&order=target_date.asc&limit=100',
      { headers: supabaseHeaders() }
    );
    const due = await dueResponse.json();
    if (!dueResponse.ok) return send(res, dueResponse.status, { error: due?.message || 'Failed to load due forecasts.' });

    const verified = [];
    const skipped = [];
    const failed = [];

    for (const forecast of due) {
      try {
        const points = await marketHistory(String(forecast.ticker).toUpperCase());
        const point = points.find(item => item.date >= forecast.target_date) || points[points.length - 1];
        if (!point || !(Number(forecast.entry_price) > 0) || !(Number(point.price) > 0)) {
          skipped.push({ id: forecast.id, ticker: forecast.ticker, reason: 'No usable market point yet.' });
          continue;
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
          { method: 'PATCH', headers: supabaseHeaders(), body: JSON.stringify(patch) }
        );
        const updateData = await updateResponse.json();
        if (!updateResponse.ok) throw new Error(updateData?.message || 'Supabase update failed.');

        verified.push({
          id: forecast.id,
          ticker: forecast.ticker,
          targetDate: forecast.target_date,
          actualDate: point.date,
          actualReturn
        });
      } catch (error) {
        failed.push({ id: forecast.id, ticker: forecast.ticker, error: error?.message || 'Verification failed.' });
      }
    }

    return send(res, 200, {
      ok: true,
      checked: due.length,
      verified: verified.length,
      skipped: skipped.length,
      failed: failed.length,
      results: verified,
      skippedItems: skipped,
      failures: failed
    });
  } catch (error) {
    return send(res, 500, { error: error?.message || 'Automatic forecast verification failed.' });
  }
}
