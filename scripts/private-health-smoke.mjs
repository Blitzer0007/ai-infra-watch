// Explicit opt-in, read-only private health diagnostic.
// No redirect, token output, response-body logging, or provider-refresh parameters.
import { pathToFileURL } from 'node:url';

export const PRODUCTION_ORIGIN = 'https://ai-infra-watch-theta.vercel.app';
const ROUTES = ['/api/job-health', '/api/forecast-validation'];
const keys = Object.freeze(['scheduler', 'forecast']);

export async function inspectPrivateHealth({ token, fetcher = fetch, origin = PRODUCTION_ORIGIN } = {}) {
  if (origin !== PRODUCTION_ORIGIN) throw Error('Unexpected production origin');
  if (typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) throw Error('Private health access token required');
  const checks = {};
  for (let index = 0; index < ROUTES.length; index++) {
    const key = keys[index];
    let response;
    try {
      response = await fetcher(origin + ROUTES[index], {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      checks[key] = 'transport-unavailable';
      continue;
    }
    if (response.status === 401 || response.status === 403) { checks[key] = 'access-denied'; continue; }
    if (response.status === 503) { checks[key] = 'not-configured'; continue; }
    // A partial/accepted/no-content response cannot attest the full contract.
    // Require an exact 200, not merely any 2xx `ok` status.
    if (response.status !== 200 || response.ok !== true) {
      checks[key] = 'endpoint-unavailable';
      continue;
    }
    const contentType = String(response.headers?.get?.('content-type') || '');
    if (!/\bapplication\/json\b/i.test(contentType)) { checks[key] = 'unexpected-content'; continue; }
    // The routes return bounded internal metadata; read for contract only.
    // Never emit any response properties, counts, provider IDs, prices or private rows.
    let body;
    try { body = await response.json(); } catch { checks[key] = 'unexpected-content'; continue; }
    if (!body || typeof body !== 'object' || Array.isArray(body) || body.ok !== true) {
      checks[key] = 'unexpected-content';
      continue;
    }
    if (key === 'scheduler') {
      checks[key] = Array.isArray(body.jobs) && body.jobs.length <= 100 ? 'contract-observed' : 'unexpected-content';
    } else {
      checks[key] = body.overall && typeof body.overall === 'object' &&
        body.validationGate && typeof body.validationGate === 'object' &&
        ['ready','unavailable'].includes(body.evaluationProtocolStatus) ? 'contract-observed' : 'unexpected-content';
    }
  }
  return { version: 'private-health-smoke-v1', mode: 'read-only', origin: PRODUCTION_ORIGIN, checks,
    ready: keys.every(key => checks[key] === 'contract-observed') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] !== 'run') {
    console.error('Use explicit: node scripts/private-health-smoke.mjs run');
    process.exitCode = 2;
  } else {
    inspectPrivateHealth({ token: process.env.AIW_ACCESS_TOKEN }).then(result => {
      console.log(JSON.stringify(result));
      if (!result.ready) process.exitCode = 1;
    }).catch(() => {
      console.error('Private health verification did not complete. Check approved access and deployment protection.');
      process.exitCode = 1;
    });
  }
}
