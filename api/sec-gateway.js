const SEC_HOSTS = new Set(['www.sec.gov', 'data.sec.gov']);
const CACHE = {
  tickers: 'public, s-maxage=86400, stale-while-revalidate=604800',
  submissions: 'public, s-maxage=300, stale-while-revalidate=1800',
  archive: 'public, s-maxage=3600, stale-while-revalidate=86400',
  companyfacts: 'public, s-maxage=86400, stale-while-revalidate=604800',
};

function bad(res, status, error) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error });
}

function upstreamUrl(req) {
  const resource = String(req.query?.resource || '').trim().toLowerCase();

  if (resource === 'tickers') {
    return {
      resource,
      url: 'https://www.sec.gov/files/company_tickers.json',
      cacheControl: CACHE.tickers,
    };
  }

  if (resource === 'submissions') {
    const cik = String(req.query?.cik || '').replace(/\D/g, '');
    if (!/^\d{1,10}$/.test(cik)) return null;
    return {
      resource,
      url: 'https://data.sec.gov/submissions/CIK' + cik.padStart(10, '0') + '.json',
      cacheControl: CACHE.submissions,
    };
  }

  if (resource === 'companyfacts') {
    const cik = String(req.query?.cik || '').replace(/\D/g, '');
    if (!/^\d{1,10}$/.test(cik)) return null;
    return {
      resource,
      url: 'https://data.sec.gov/api/xbrl/companyfacts/CIK' + cik.padStart(10, '0') + '.json',
      cacheControl: CACHE.companyfacts,
    };
  }

  if (resource === 'archive') {
    const raw = String(req.query?.url || '');
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      return null;
    }

    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'www.sec.gov' ||
      !parsed.pathname.startsWith('/Archives/edgar/data/')
    ) {
      return null;
    }

    return {
      resource,
      url: parsed.toString(),
      cacheControl: CACHE.archive,
    };
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return bad(res, 405, 'Only GET is supported.');
  }

  const configuredToken = String(process.env.SEC_GATEWAY_TOKEN || '').trim();
  if (configuredToken) {
    const auth = String(req.headers?.authorization || '');
    if (auth !== 'Bearer ' + configuredToken) {
      return bad(res, 401, 'SEC gateway authentication required.');
    }
  }

  const target = upstreamUrl(req);
  if (!target) {
    return bad(
      res,
      400,
      'Supported resources: tickers, submissions, companyfacts, archive.'
    );
  }

  const userAgent =
    String(process.env.EDGAR_USER_AGENT || '').trim() ||
    'AI Infra Watch/1.0 (SEC research; contact: github-actions[bot]@users.noreply.github.com)';

  try {
    const upstream = await fetch(target.url, {
      headers: {
        'User-Agent': userAgent,
        'Accept-Encoding': 'gzip, deflate',
        Accept: target.resource === 'archive' ? 'text/html,*/*' : 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    res.setHeader('Cache-Control', target.cacheControl);
    res.setHeader('X-AIW-SEC-Gateway', 'live');
    res.setHeader('X-AIW-Upstream-Status', String(upstream.status));

    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    const body = await upstream.text();
    return res.status(upstream.status).send(body);
  } catch (error) {
    return bad(
      res,
      504,
      'SEC gateway upstream fetch failed: ' + String(error?.message || error)
    );
  }
}
