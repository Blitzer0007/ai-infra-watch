const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

function send(res, status, body) {
  res.status(status).json(body);
}

function authHeaders(prefer = 'return=representation') {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('AI quality storage is not configured.');
  }
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    Prefer: prefer,
  };
}

function normalize(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    suite: row.suite,
    target: row.target,
    status: row.status,
    qualityScore: row.quality_score == null ? null : Number(row.quality_score),
    faithfulness: row.faithfulness == null ? null : Number(row.faithfulness),
    relevance: row.relevance == null ? null : Number(row.relevance),
    safety: row.safety == null ? null : Number(row.safety),
    hallucinationRate: row.hallucination_rate == null ? null : Number(row.hallucination_rate),
    citationCoverage: row.citation_coverage == null ? null : Number(row.citation_coverage),
    adversarialSuccessRate: row.adversarial_success_rate == null ? null : Number(row.adversarial_success_rate),
    caseCount: Number(row.case_count || 0),
    failures: Number(row.failures || 0),
    summary: row.summary || '',
    metrics: row.metrics || {},
    cases: Array.isArray(row.cases) ? row.cases : [],
  };
}

function validNumber(value, min = 0, max = 100) {
  return value == null || (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return send(res, 503, { error: 'AI quality storage is not configured for this deployment.' });
    }

    if (req.method === 'GET') {
      const limit = Math.min(Math.max(Number(req.query?.limit) || 20, 1), 100);
      const url = SUPABASE_URL + '/rest/v1/ai_quality_runs?select=*&order=created_at.desc&limit=' + limit;
      const response = await fetch(url, { headers: authHeaders('return=representation') });
      const data = await response.json();
      if (!response.ok) return send(res, response.status, { error: data?.message || 'Failed to load AI quality runs.' });
      return send(res, 200, { runs: data.map(normalize), persistent: true, source: 'supabase' });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const metrics = body.metrics && typeof body.metrics === 'object' ? body.metrics : {};
      const cases = Array.isArray(body.cases) ? body.cases.slice(0, 50) : [];

      const numericFields = [
        'qualityScore',
        'faithfulness',
        'relevance',
        'safety',
        'hallucinationRate',
        'citationCoverage',
        'adversarialSuccessRate',
      ];
      for (const field of numericFields) {
        if (!validNumber(body[field], 0, 100)) {
          return send(res, 400, { error: field + ' must be between 0 and 100.' });
        }
      }

      if (body.caseCount != null && (!Number.isInteger(Number(body.caseCount)) || Number(body.caseCount) < 0)) {
        return send(res, 400, { error: 'caseCount must be a non-negative integer.' });
      }
      if (body.failures != null && (!Number.isInteger(Number(body.failures)) || Number(body.failures) < 0)) {
        return send(res, 400, { error: 'failures must be a non-negative integer.' });
      }

      const row = {
        suite: String(body.suite || 'red-team').slice(0, 80),
        target: String(body.target || 'ai-infra-watch-research').slice(0, 120),
        status: String(body.status || 'completed').slice(0, 40),
        quality_score: body.qualityScore == null ? null : Number(body.qualityScore),
        faithfulness: body.faithfulness == null ? null : Number(body.faithfulness),
        relevance: body.relevance == null ? null : Number(body.relevance),
        safety: body.safety == null ? null : Number(body.safety),
        hallucination_rate: body.hallucinationRate == null ? null : Number(body.hallucinationRate),
        citation_coverage: body.citationCoverage == null ? null : Number(body.citationCoverage),
        adversarial_success_rate: body.adversarialSuccessRate == null ? null : Number(body.adversarialSuccessRate),
        case_count: Number(body.caseCount || cases.length),
        failures: Number(body.failures || 0),
        summary: String(body.summary || '').slice(0, 2000),
        metrics,
        cases,
      };

      const response = await fetch(SUPABASE_URL + '/rest/v1/ai_quality_runs', {
        method: 'POST',
        headers: authHeaders('return=representation'),
        body: JSON.stringify(row),
      });
      const data = await response.json();
      if (!response.ok) return send(res, response.status, { error: data?.message || 'Failed to save AI quality run.' });
      return send(res, 201, { run: normalize(data[0]), persistent: true, source: 'supabase' });
    }

    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    console.error('ai quality API error:', error);
    return send(res, 500, { error: error?.message || 'AI quality service unavailable.' });
  }
}