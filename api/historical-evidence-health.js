import { requireAccess } from './_access-auth.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const BUCKET = 'aiw-private-historical-evidence';
const INDEX_LIMIT = 1000;

const PROVIDERS = [
  {
    provider: 'ohlc',
    label: 'OHLC as-of snapshots',
    description: 'Daily end-of-day snapshots; retained as candidate evidence pending separate point-in-time review.',
  },
  {
    provider: 'marketparquet',
    label: 'MarketParquet daily archive',
    description: 'Private daily full-market file; retrieval-time archive, not proof of original publication time.',
  },
  {
    provider: 'sp500-membership',
    label: 'S&P 500 membership evidence',
    description: 'Dated membership source bundle; legacy event provenance and coverage remain under review.',
  },
];

function parseTotalCount(contentRange, fallback) {
  const match = String(contentRange || '').match(/\/(\d+)$/);
  return match ? Number(match[1]) : fallback;
}

function safeArtifact(row) {
  return {
    id: row.id,
    provider: row.provider,
    artifactType: row.artifact_type,
    sha256: row.sha256,
    objectPath: row.object_path,
    retrievedAt: row.retrieved_at,
    sourceAsOf: row.source_as_of,
    marketDate: row.market_date,
    rowCount: row.row_count,
    symbolCount: row.symbol_count,
    evidenceStatus: row.evidence_status,
  };
}

export function summarizeArtifacts(rows, totalIndexedRows = Array.isArray(rows) ? rows.length : 0) {
  const validRows = Array.isArray(rows) ? rows.filter(row =>
    row && PROVIDERS.some(provider => provider.provider === row.provider)
  ) : [];
  const providers = PROVIDERS.map(provider => {
    const ownRows = validRows
      .filter(row => row.provider === provider.provider)
      .sort((a, b) => String(b.retrieved_at || '').localeCompare(String(a.retrieved_at || '')));
    const statusCounts = {};
    for (const row of ownRows) {
      const status = String(row.evidence_status || 'unknown');
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
    return {
      ...provider,
      artifactCountInWindow: ownRows.length,
      statusCounts,
      latest: ownRows.length ? safeArtifact(ownRows[0]) : null,
    };
  });
  return {
    providers,
    recentArtifacts: validRows
      .slice()
      .sort((a, b) => String(b.retrieved_at || '').localeCompare(String(a.retrieved_at || '')))
      .slice(0, 20)
      .map(safeArtifact),
    inventoryWindow: {
      returnedRows: validRows.length,
      totalIndexedRows: Number.isFinite(totalIndexedRows) ? totalIndexedRows : validRows.length,
      capped: Number.isFinite(totalIndexedRows) && totalIndexedRows > validRows.length,
      limit: INDEX_LIMIT,
    },
    // Recording an archive is not enough to prove original publication time or full membership provenance.
    historicalGate: {
      status: 'BLOCKED',
      reason: 'Archive presence and recorded hashes do not establish historical publication timing or complete event-level membership provenance.',
    },
  };
}

function supabaseHeaders(key) {
  const headers = { apikey: key, Accept: 'application/json', Prefer: 'count=exact' };
  // New Supabase secret keys are opaque API keys. Legacy service_role keys are JWTs.
  if (!key.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + key;
  return headers;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAccess(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ ok: false, error: 'Private archive metadata is not configured' });
  }

  try {
    const query = 'select=id,provider,artifact_type,sha256,object_path,retrieved_at,source_as_of,market_date,row_count,symbol_count,evidence_status&order=retrieved_at.desc&limit=' + INDEX_LIMIT;
    const response = await fetch(SUPABASE_URL + '/rest/v1/historical_data_artifacts?' + query, {
      headers: supabaseHeaders(SUPABASE_SERVICE_ROLE_KEY),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('Supabase archive metadata HTTP ' + response.status);
    const contentRange = response.headers.get('content-range');
    const rows = await response.json();
    const summary = summarizeArtifacts(rows, parseTotalCount(contentRange, Array.isArray(rows) ? rows.length : 0));
    return res.status(200).json({
      ok: true,
      retrievedAt: new Date().toISOString(),
      source: 'Supabase private metadata index',
      bucket: BUCKET,
      ...summary,
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Private archive inventory unavailable',
    });
  }
}
