import { history } from './_market-data.js';

const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.^-]{0,9}$/;
const ALLOWED_RANGES = new Set(['1y', '2y', '5y']);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const rawSymbols = String(req.query?.symbols || '');
  const symbols = [...new Set(rawSymbols.split(',').map(value => value.trim().toUpperCase()).filter(Boolean))];
  if (!symbols.length || symbols.length > 10 || symbols.some(symbol => !SYMBOL_PATTERN.test(symbol))) {
    return res.status(400).json({ ok: false, error: 'Provide between 1 and 10 valid ticker symbols.' });
  }

  const requestedRange = String(req.query?.range || '2y');
  const range = ALLOWED_RANGES.has(requestedRange) ? requestedRange : '2y';
  const results = await Promise.all(symbols.map(async symbol => {
    try {
      const result = await history(symbol, range);
      const points = Array.isArray(result.points) ? result.points : [];
      const dates = points.map(point => point.date).filter(date => /^\\d{4}-\\d{2}-\\d{2}$/.test(date)).sort();
      return {
        symbol,
        ok: dates.length > 0,
        source: result.source || result.provider || 'unknown',
        stale: Boolean(result.stale),
        cached: Boolean(result.cached),
        pointCount: dates.length,
        firstDate: dates[0] || null,
        lastDate: dates.at(-1) || null,
        // Coverage metadata only. These closes are not asserted to be adjusted prices
        // or to carry point-in-time publication timestamps for a valid backtest.
      };
    } catch {
      return { symbol, ok: false, source: null, stale: false, pointCount: 0, firstDate: null, lastDate: null, error: 'Historical data unavailable from configured providers.' };
    }
  }));

  return res.status(200).json({
    ok: results.some(result => result.ok),
    range,
    fetchedAt: new Date().toISOString(),
    results,
    purpose: 'coverage_check_only',
  });
}
