const DEFAULT_TIMEOUT_MS = 25000;

function backendUrl() {
  return String(process.env.AI_INFRA_AGENT_URL || '').trim().replace(/\/+$/, '');
}

function backendHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = String(process.env.AI_INFRA_AGENT_TOKEN || '').trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function withTimeout(ms = DEFAULT_TIMEOUT_MS) {
  return AbortSignal.timeout(ms);
}

export default async function handler(req, res) {
  const base = backendUrl();

  if (!base) {
    res.status(503).json({
      ok: false,
      error: 'Autonomous backend is not configured',
      hint: 'Set AI_INFRA_AGENT_URL in Vercel environment variables to the deployed Python backend.',
    });
    return;
  }

  if (req.method === 'GET') {
    try {
      const upstream = await fetch(`${base}/api/health`, {
        method: 'GET',
        headers: backendHeaders(),
        signal: withTimeout(8000),
      });
      const body = await upstream.json().catch(() => ({}));
      res.status(upstream.status).json(body);
    } catch (error) {
      res.status(502).json({
        ok: false,
        error: 'Autonomous backend health check failed',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const upstream = await fetch(`${base}/api/ask/autonomous`, {
      method: 'POST',
      headers: backendHeaders(),
      body: JSON.stringify(req.body || {}),
      signal: withTimeout(),
    });

    const body = await upstream.json().catch(() => ({
      ok: false,
      error: 'Autonomous backend returned a non-JSON response',
    }));

    res.status(upstream.status).json(body);
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: 'Autonomous backend request failed',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
