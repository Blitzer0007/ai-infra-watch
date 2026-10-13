import { history } from './_market-data.js';
import { requireAccess } from './_access-auth.js';

const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.^-]{0,9}$/;
const ALLOWED_RANGES = new Set(['1y', '2y', '5y']);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAccess(req, res)) return;
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
  const includePrices = String(req.query?.includePrices || '').toLowerCase() === 'true';
  const fetched = await Promise.all(symbols.map(async symbol => {
    try {
      const result = await history(symbol, range);
      const points = Array.isArray(result.points) ? result.points : [];
      const datedPoints = points
        .filter(point => /^\d{4}-\d{2}-\d{2}$/.test(String(point.date || '')) && Number.isFinite(point.price) && point.price > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
      const adjustedPoints = datedPoints.filter(point => point.adjusted === true && Number.isFinite(point.adjustedPrice) && point.adjustedPrice > 0);
      const adjusted = datedPoints.length > 0 && adjustedPoints.length === datedPoints.length;
      const row = {
        symbol,
        ok: datedPoints.length > 0,
        source: result.source || result.provider || 'unknown',
        provider: result.provider || 'unknown',
        stale: Boolean(result.stale),
        cached: Boolean(result.cached),
        pointCount: datedPoints.length,
        adjustedPointCount: adjustedPoints.length,
        adjusted,
        availabilityStatus: 'assumed',
        firstDate: datedPoints[0]?.date || null,
        lastDate: datedPoints.at(-1)?.date || null,
        error: datedPoints.length ? null : 'Historical data unavailable from configured providers.',
      };
      if (includePrices && adjusted) {
        row.prices = adjustedPoints.map(point => ({
          symbol,
          date: point.date,
          close: point.adjustedPrice,
          adjusted: true,
          // Historical providers return daily bars, not immutable publication timestamps.
          // This conservative calendar-day timestamp is an assumption, not verified provenance.
          availableAt: point.date + 'T23:59:59.999Z',
          availabilityStatus: 'assumed',
        }));
      } else if (includePrices) {
        row.prices = [];
        row.error = 'Provider did not return complete adjusted-close history; backtest blocked for this symbol.';
      }
      return row;
    } catch {
      return {
        symbol, ok: false, source: null, provider: null, stale: false, cached: false,
        pointCount: 0, adjustedPointCount: 0, adjusted: false, availabilityStatus: 'unknown',
        firstDate: null, lastDate: null, prices: [],
        error: 'Historical data unavailable from configured providers.',
      };
    }
  }));

  const allAdjusted = fetched.every(item => item.adjusted && !item.stale);
  let prices = [];
  let backtestReady = false;
  let commonRange = null;
  let alignmentError = null;
  if (includePrices && allAdjusted) {
    const starts = fetched.map(item => item.firstDate).filter(Boolean).sort();
    const ends = fetched.map(item => item.lastDate).filter(Boolean).sort();
    const commonStart = starts.at(-1);
    const commonEnd = ends[0];
    if (!commonStart || !commonEnd || commonStart > commonEnd) {
      alignmentError = 'The selected holdings and both benchmarks have no overlapping adjusted-price date range.';
    } else {
      commonRange = { startDate: commonStart, endDate: commonEnd };
      const pointsBySymbol = fetched.map(item => ({
        symbol: item.symbol,
        points: (item.prices || []).filter(point => point.date >= commonStart && point.date <= commonEnd),
      }));
      const dateSets = pointsBySymbol.map(item => new Set(item.points.map(point => point.date)));
      const baseDates = [...(dateSets[0] || [])].sort();
      const missingDate = baseDates.find(date => dateSets.some(dates => !dates.has(date)));
      const referenceDates = new Set(baseDates);
      const extraDate = dateSets.some(dates => [...dates].some(date => !referenceDates.has(date)));
      if (!baseDates.length || missingDate || extraDate || dateSets.some(dates => dates.size !== baseDates.length)) {
        alignmentError = 'Adjusted-price histories contain non-matching trading dates inside the common range; backtest blocked rather than silently dropping gaps.';
      } else {
        prices = pointsBySymbol.flatMap(item => item.points);
        backtestReady = prices.length > 0;
      }
    }
  } else if (includePrices) {
    alignmentError = 'Every selected holding and both benchmarks must have fresh adjusted-close history.';
  }
  return res.status(200).json({
    ok: fetched.some(item => item.ok),
    range,
    fetchedAt: new Date().toISOString(),
    results: fetched.map(({ prices: _prices, ...item }) => item),
    ...(includePrices ? { prices, backtestReady, commonRange, alignmentError } : {}),
    availabilityAssumption: 'Daily bars are treated as available after the UTC calendar day ends; this is an explicit assumption, not verified point-in-time provider provenance.',
    purpose: includePrices ? 'adjusted_close_backtest_input' : 'coverage_check_only',
  });
}
