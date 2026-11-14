// QA-only loopback transport: real GET handler, fictional database, no outbound IO.
import assert from 'node:assert/strict';
import http from 'node:http';
import { writeFileSync } from 'node:fs';
import handler from '../server/api/forecast-validation.js';

const day = days => new Date(Date.UTC(2016, 0, 1 + days)).toISOString().slice(0, 10);
const makeRow = (ticker, horizon, i) => ({
  ticker, horizon, status: 'verified', created_at: day(i * 35) + 'T12:00:00Z',
  target_date: day(i * 35 + horizon), verified_at: day(i * 35 + horizon + 1) + 'T12:00:00Z',
  median: 1, actual_return: 0, p10: -1, p25: 1, p75: 2, p90: 3,
});
const rows = [
  ...Array.from({ length: 100 }, (_, i) => makeRow('FICT', 20, i)),
  ...Array.from({ length: 25 }, (_, i) => makeRow('DEMO', 5, i)),
];
globalThis.fetch = async (address, options = {}) => {
  const url = new URL(address);
  assert.equal(url.origin, 'https://fixture.invalid');
  assert.equal(url.pathname, '/rest/v1/forecast_snapshots');
  assert.equal(options.method || 'GET', 'GET');
  assert.equal(url.searchParams.get('status'), 'eq.verified');
  const ticker = url.searchParams.get('ticker')?.replace(/^eq\./, '');
  const horizon = url.searchParams.get('horizon');
  const selected = rows.filter(row => (!ticker || row.ticker === ticker) &&
    (!horizon || horizon === 'in.(5,20)' || horizon === 'eq.' + row.horizon));
  return { ok: true, json: async () => selected };
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/health') { res.writeHead(204); res.end(); return; }
  if (url.pathname !== '/api/forecast-validation') { res.writeHead(404); res.end(); return; }
  const adapter = {
    setHeader: (name, value) => res.setHeader(name, value),
    status(code) { res.statusCode = code; return this; },
    json(value) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); },
  };
  await handler({ method: req.method, headers: req.headers, query: Object.fromEntries(url.searchParams) }, adapter);
});
server.listen(0, '127.0.0.1', () => writeFileSync(process.argv[2], String(server.address().port)));
