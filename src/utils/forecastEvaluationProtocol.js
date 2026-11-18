import { independentForecastRows } from './forecastIndependence.js';
import { coverageInterval } from '../../server/utils/forecastCalibration.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_RE = /T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
const finite = value => (value == null || value === '' || typeof value === 'boolean' || !Number.isFinite(Number(value))) ? null : Number(value);
const round = value => Number(value.toFixed(2));

function validDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}
function utcInstantDate(value) {
  if (typeof value !== 'string' || !CLOCK_RE.test(value)) return null;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0, 10) : null;
}
function median(values) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const half = Math.floor(ordered.length / 2);
  return round(ordered.length % 2 ? ordered[half] : (ordered[half - 1] + ordered[half]) / 2);
}
function newCounts() {
  return {
    total: 0,
    pendingNotDue: 0, pendingDueForReview: 0, pendingUnknownTarget: 0,
    verifiedReported: 0, verifiedScorable: 0, verifiedUnscorable: 0,
    unknownStatus: 0, independentScorable: 0, overlappingExcluded: 0,
  };
}
function intervalRows(rows, lower, upper) {
  return rows.filter(row => {
    const a = finite(row?.[lower]), b = finite(row?.[upper]);
    return a !== null && b !== null && a <= b;
  });
}
function coverage(rows, lower, upper) {
  const countable = intervalRows(rows, lower, upper);
  const scored = coverageInterval(countable, lower, upper);
  return {
    n: scored.count,
    hits: scored.hits,
    coveragePct: scored.coveragePct,
    wilson95Pct: scored.count ? [scored.lowerPct, scored.upperPct] : null,
  };
}

/** Strict, read-only descriptive review of the bounded rows returned by the server.
 * Counts are NOT the whole database, and declared sources are NOT verified issuer records.
 * This must never be used to grant a trade, provider access or forecast authority.
 */
export function buildForecastEvaluationProtocol(rows = [], {
  asOfDate = new Date().toISOString().slice(0, 10),
  rowLimit = 1000,
  truncated = false,
} = {}) {
  const today = validDate(asOfDate);
  if (!today) throw new TypeError('Invalid UTC evaluation date');
  const input = Array.isArray(rows) ? rows : [];
  const lifecycle = newCounts();
  const horizons = { '5D': newCounts(), '20D': newCounts(), other: newCounts() };
  const excluded = {
    missingOrInvalidWindow: 0,
    missingOrInvalidOutcome: 0,
    missingOrInvalidMedian: 0,
    invalidVerificationTime: 0,
    futureTargetMarkedVerified: 0,
    invalidHorizon: 0,
  };
  const scorable = [];

  for (const item of input) {
    const row = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
    const horizonNumber = finite(row.horizon);
    const bucket = horizonNumber === 5 ? horizons['5D'] : horizonNumber === 20 ? horizons['20D'] : horizons.other;
    lifecycle.total++; bucket.total++;
    const status = String(row.status || '').toLowerCase();
    const target = validDate(row.target_date);

    if (status === 'pending') {
      const key = !target ? 'pendingUnknownTarget' : target <= today ? 'pendingDueForReview' : 'pendingNotDue';
      lifecycle[key]++; bucket[key]++;
      continue;
    }
    if (status !== 'verified') {
      lifecycle.unknownStatus++; bucket.unknownStatus++;
      continue;
    }
    lifecycle.verifiedReported++; bucket.verifiedReported++;
    const created = utcInstantDate(row.created_at);
    const verified = utcInstantDate(row.verified_at);
    const outcome = finite(row.actual_return);
    const predicted = finite(row.median);
    let reason = null;
    if (!(Number.isSafeInteger(horizonNumber) && horizonNumber > 0)) reason = 'invalidHorizon';
    else if (!created || !target || target <= created) reason = 'missingOrInvalidWindow';
    else if (target > today) reason = 'futureTargetMarkedVerified';
    else if (!verified || verified < target) reason = 'invalidVerificationTime';
    else if (outcome === null || outcome < -100) reason = 'missingOrInvalidOutcome';
    else if (predicted === null || predicted < -100) reason = 'missingOrInvalidMedian';
    if (reason) {
      excluded[reason]++;
      lifecycle.verifiedUnscorable++; bucket.verifiedUnscorable++;
      continue;
    }
    lifecycle.verifiedScorable++; bucket.verifiedScorable++;
    scorable.push(row);
  }

  const independent = independentForecastRows(scorable);
  const selected = new Set(independent);
  const overlap = scorable.filter(row => !selected.has(row));
  lifecycle.independentScorable = independent.length;
  lifecycle.overlappingExcluded = overlap.length;
  for (const row of independent) {
    const key = Number(row.horizon) === 5 ? '5D' : Number(row.horizon) === 20 ? '20D' : 'other';
    horizons[key].independentScorable++;
  }
  for (const row of overlap) {
    const key = Number(row.horizon) === 5 ? '5D' : Number(row.horizon) === 20 ? '20D' : 'other';
    horizons[key].overlappingExcluded++;
  }

  const signedErrors = independent.map(row => finite(row.actual_return) - finite(row.median));
  const directionRows = independent.filter(row => finite(row.median) !== 0 && finite(row.actual_return) !== 0);
  const directionHits = directionRows.filter(row => Math.sign(finite(row.median)) === Math.sign(finite(row.actual_return))).length;
  const declaredSourceCount = independent.filter(row => typeof row.created_source === 'string' && row.created_source.trim()).length;
  return {
    version: 'forecast-evaluation-v1',
    coverage: {
      asOfUtcDate: today,
      returnedRows: input.length,
      rowLimit,
      truncated: Boolean(truncated),
      completeUniverse: false,
      note: 'Recent-record window only; the service may also cap rows. Counts are not a total of all historical forecasts.',
    },
    lifecycle,
    horizons,
    exclusions: excluded,
    metrics: {
      scoredNonoverlapping: independent.length,
      medianAbsoluteErrorPctPoints: median(signedErrors.map(Math.abs)),
      medianNoChangeBaselineErrorPctPoints: median(independent.map(row => Math.abs(finite(row.actual_return)))),
      meanSignedErrorPctPoints: signedErrors.length ? round(signedErrors.reduce((sum, n) => sum + n, 0) / signedErrors.length) : null,
      direction: {
        n: directionRows.length,
        hits: directionHits,
        accuracyPct: directionRows.length ? round(directionHits / directionRows.length * 100) : null,
      },
      middle50: coverage(independent, 'p25', 'p75'),
      wide80: coverage(independent, 'p10', 'p90'),
      declaredCreationSourceCount: declaredSourceCount,
      independentlyAuthenticatedSourceCount: null,
    },
    interpretation: independent.length < 10 ? 'insufficient' : 'descriptive-only',
    decisionEligible: false,
    limitations: [
      'The data-window totals can be incomplete, and forecast records do not independently prove historical point-in-time source access.',
      'Non-overlap is tested within ticker and horizon; shared market shocks across symbols and horizons are not independent.',
      'Due means a target date has passed in UTC, not that a valid adjusted market outcome is available.',
      'Declared providers, creation sources and verification labels do not establish forecast profitability or source authenticity.',
    ],
  };
}
