import { independentForecastRows } from './forecastIndependence.js';
import { coverageInterval, calibrationVerdict } from './forecastCalibration.js';

const FORECAST_VALIDATION_MINIMUM = 50;
const DEFAULT_FORECAST_HORIZON = 20;

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function forecastSampleStatus(count) {
  if (count < 10) return 'insufficient';
  if (count < 25) return 'early';
  if (count < FORECAST_VALIDATION_MINIMUM) return 'developing';
  if (count < 100) return 'initial-validation';
  return 'established';
}

function eligible(rows) {
  return rows.filter(row => Number(row?.median) !== 0 && Number(row?.actual_return) !== 0);
}

function directionRightPct(rows) {
  const usable = eligible(rows);
  if (!usable.length) return null;
  return Number((usable.filter(row => Math.sign(Number(row.median)) === Math.sign(Number(row.actual_return))).length / usable.length * 100).toFixed(1));
}

function predictionMatchPct(rows) {
  const usable = eligible(rows);
  if (!usable.length) return null;
  return Number(mean(usable.map(row => {
    const actual = Math.abs(Number(row.actual_return));
    const miss = Math.abs(Number(row.median) - Number(row.actual_return));
    return Math.max(0, 100 - (miss / Math.max(actual, 1)) * 100);
  })).toFixed(1));
}

function typicalMiss(rows) {
  const errors = rows
    .map(row => Math.abs(Number(row.actual_return) - Number(row.median)))
    .filter(Number.isFinite);
  return errors.length ? Number(percentile(errors, 0.5).toFixed(2)) : null;
}

function summarizeSubset(rows) {
  const signedErrors = rows
    .map(row => Number(row.actual_return) - Number(row.median))
    .filter(Number.isFinite);
  const middleCoverage = coverageInterval(rows, 'p25', 'p75');
  const wideCoverage = coverageInterval(rows, 'p10', 'p90');

  return {
    count: rows.length,
    directionRightPct: directionRightPct(rows),
    predictionMatchPct: predictionMatchPct(rows),
    typicalMiss: typicalMiss(rows),
    medianAbsoluteError: typicalMiss(rows),
    meanSignedErrorPct: signedErrors.length ? Number(mean(signedErrors).toFixed(2)) : null,
    p25p75CoveragePct: middleCoverage.coveragePct,
    p25p75CoverageCiPct: middleCoverage.lowerPct == null ? null : {
      lower: middleCoverage.lowerPct,
      upper: middleCoverage.upperPct,
    },
    p10p90CoveragePct: wideCoverage.coveragePct,
    p10p90CoverageCiPct: wideCoverage.lowerPct == null ? null : {
      lower: wideCoverage.lowerPct,
      upper: wideCoverage.upperPct,
    },
    calibrationVerdict: calibrationVerdict(middleCoverage, wideCoverage, rows.length),
  };
}

function businessDaysBetween(from, to) {
  const start = new Date(String(from).slice(0, 10) + 'T00:00:00Z');
  const end = new Date(String(to).slice(0, 10) + 'T00:00:00Z');
  if (!(start < end)) return 0;
  let count = 0;
  for (const cursor = new Date(start); cursor < end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

function independentRows(rows, minimumBusinessDayGap = 20) {
  const sorted = [...rows]
    .filter(row => String(row?.status || 'verified') === 'verified')
    .sort((a, b) => String(a.verified_at || a.created_at || '').localeCompare(String(b.verified_at || b.created_at || '')));
  const selected = [];
  const lastByTickerHorizon = new Map();
  for (const row of sorted) {
    const ticker = String(row?.ticker || '').trim().toUpperCase();
    if (!ticker) continue;
    const horizon = Number(row?.horizon);
    const key = ticker + '|' + horizon;
    const previous = lastByTickerHorizon.get(key);
    const currentDate = row.verified_at || row.created_at;
    if (previous && businessDaysBetween(previous, currentDate) < minimumBusinessDayGap) continue;
    selected.push(row);
    lastByTickerHorizon.set(key, currentDate);
  }
  return selected;
}
export function summarizeForecastRows(rows = []) {
  const verified = rows.filter(row => {
    const actualRaw = row?.actual_return;
    const medianRaw = row?.median;
    return String(row?.status || 'verified') === 'verified' &&
      actualRaw !== null && actualRaw !== undefined && actualRaw !== '' &&
      medianRaw !== null && medianRaw !== undefined && medianRaw !== '' &&
      Number.isFinite(Number(actualRaw)) &&
      Number.isFinite(Number(medianRaw));
  });

  const independent = independentForecastRows(verified);
  const signedErrors = independent
    .map(row => Number(row.actual_return) - Number(row.median))
    .filter(Number.isFinite);

  const base = summarizeSubset(independent);
  const rolling = (size) => {
    const subset = independent.slice(-size);
    const summary = summarizeSubset(subset);
    return {
      count: summary.count,
      directionRightPct: summary.directionRightPct,
      predictionMatchPct: summary.predictionMatchPct,
    };
  };

  return {
    count: verified.length,
    independentCount: independent.length,
    predictionMatchPct: base.predictionMatchPct,
    rolling: {
      last10: rolling(10),
      last25: rolling(25),
      last50: rolling(50),
    },
    sampleStatus: forecastSampleStatus(independent.length),
    directionalAccuracyPct: base.directionRightPct,
    medianAbsoluteError: base.medianAbsoluteError,
    meanSignedErrorPct: signedErrors.length ? Number(mean(signedErrors).toFixed(2)) : null,
    p25p75CoveragePct: base.p25p75CoveragePct,
    p10p90CoveragePct: base.p10p90CoveragePct,
    calibrationVerdict: base.calibrationVerdict,
    oldestVerifiedAt: independent.map(row => row.verified_at).filter(Boolean).sort()[0] || null,
    newestVerifiedAt: independent.map(row => row.verified_at).filter(Boolean).sort().at(-1) || null,
  };
}

export function buildForecastLearningSummary(rows = []) {
  const verified = rows.filter(row => String(row?.status || 'verified') === 'verified');
  const independent = independentForecastRows(verified);
  const score = subset => ({
    count: subset.length,
    directionRightPct: directionRightPct(subset),
    predictionMatchPct: predictionMatchPct(subset),
    calibrationVerdict: summarizeSubset(subset).calibrationVerdict,
  });
  const typicalMiss = subset => {
    const values = subset.map(row => Math.abs(Number(row.actual_return) - Number(row.median))).filter(Number.isFinite);
    return values.length ? Number(percentile(values, 0.5).toFixed(2)) : null;
  };
  const baselineMiss = subset => {
    const values = subset.map(row => Math.abs(Number(row.actual_return))).filter(Number.isFinite);
    return values.length ? Number(percentile(values, 0.5).toFixed(2)) : null;
  };
  const modelMiss = typicalMiss(independent);
  const noChangeMiss = baselineMiss(independent);
  const improvementPct = modelMiss != null && noChangeMiss > 0
    ? Number(((noChangeMiss - modelMiss) / noChangeMiss * 100).toFixed(1))
    : null;

  const recent = score(independent.slice(-20));
  const prior = score(independent.slice(-40, -20));
  const driftScore = recent.predictionMatchPct != null && prior.predictionMatchPct != null
    ? Number((recent.predictionMatchPct - prior.predictionMatchPct).toFixed(1))
    : null;
  const driftStatus = independent.length < 40 || driftScore == null
    ? 'insufficient'
    : driftScore >= 5 ? 'improving' : driftScore <= -5 ? 'declining' : 'steady';

  const channelCount = row => {
    const snapshot = row?.evidence_snapshot && typeof row.evidence_snapshot === 'object' ? row.evidence_snapshot : {};
    const counts = snapshot.counts || {};
    return ['news', 'contracts', 'political', 'macro'].filter(key => Number(counts[key]) > 0).length +
      (snapshot.analystConsensus?.status === 'available' ? 1 : 0);
  };
  const multi = independent.filter(row => channelCount(row) >= 2);
  const other = independent.filter(row => channelCount(row) < 2);
  const multiScore = score(multi);
  const otherScore = score(other);
  const evidenceReady = multi.length >= 15 && other.length >= 15;
  const evidenceLift = evidenceReady && multiScore.predictionMatchPct != null && otherScore.predictionMatchPct != null
    ? Number((multiScore.predictionMatchPct - otherScore.predictionMatchPct).toFixed(1))
    : null;

  const horizon5 = independent.filter(row => Number(row.horizon) === 5);
  const horizon20 = independent.filter(row => Number(row.horizon) === 20);
  const validationGate = {
    minimumOverall: 50,
    minimum5D: 25,
    minimum20D: 25,
    independentOverall: independent.length,
    independent5D: horizon5.length,
    independent20D: horizon20.length,
    ready: independent.length >= 50 && horizon5.length >= 25 && horizon20.length >= 25,
  };

  return {
    sampleSize: verified.length,
    independentSampleSize: independent.length,
    model: {
      typicalMiss: modelMiss,
      directionRightPct: score(independent).directionRightPct,
      predictionMatchPct: score(independent).predictionMatchPct,
    },
    baseline: { name: 'No-change baseline', typicalMiss: noChangeMiss, improvementPct },
    drift: { status: driftStatus, score: driftScore, recent, prior, minimumIndependentSamples: 40 },
    evidenceLearning: {
      multipleChannelSamples: multi.length,
      otherSamples: other.length,
      minimumPerGroup: 15,
      predictionMatchLift: evidenceLift,
      status: evidenceReady ? 'measurable' : 'insufficient',
      note: !evidenceReady
        ? 'Need at least 15 independent forecasts in each evidence group before comparing evidence lift.'
        : evidenceLift == null
          ? 'Evidence groups are large enough, but the comparison is not yet computable.'
          : 'Evidence lift is descriptive only; ticker and horizon mix must be reviewed before causal interpretation.',
    },
    validationGate,
    calibration: {
      p25p75TargetPct: 50,
      p10p90TargetPct: 80,
      verdict: summarizeSubset(independent).calibrationVerdict,
    },
  };
}

export function forecastValidationGate(count) {
  const verifiedCount = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0;
  return {
    minimumRequired: FORECAST_VALIDATION_MINIMUM,
    verifiedCount,
    ready: verifiedCount >= FORECAST_VALIDATION_MINIMUM,
    status: verifiedCount >= FORECAST_VALIDATION_MINIMUM ? '50+ validated forecasts' : 'building validation sample',
  };
}

export function buildForecastValidationSummary(rows = []) {
  const overall = summarizeForecastRows(rows);
  const independent = independentForecastRows(rows);
  const groups = new Map();

  for (const row of independent) {
    if (String(row?.status || 'verified') !== 'verified') continue;
    const ticker = String(row?.ticker || '').trim().toUpperCase();
    const horizon = Number(row?.horizon);
    if (!ticker || !Number.isFinite(horizon)) continue;
    const key = ticker + '|' + horizon;
    const bucket = groups.get(key) || [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  const byTickerHorizon = [...groups.values()]
    .map(group => {
      const first = group[0];
      return {
        ticker: String(first.ticker).toUpperCase(),
        horizon: Number(first.horizon),
        ...summarizeForecastRows(group),
      };
    })
    .sort((a, b) => a.ticker.localeCompare(b.ticker) || a.horizon - b.horizon);

  return {
    overall,
    byTickerHorizon,
    validationGate: {
      minimumRequired: FORECAST_VALIDATION_MINIMUM,
      minimum5D: 25,
      minimum20D: 25,
      verifiedCount: overall.independentSampleSize,
      independent5D: independent.filter(row => Number(row.horizon) === 5).length,
      independent20D: independent.filter(row => Number(row.horizon) === 20).length,
      ready: overall.independentSampleSize >= FORECAST_VALIDATION_MINIMUM &&
        independent.filter(row => Number(row.horizon) === 5).length >= 25 &&
        independent.filter(row => Number(row.horizon) === 20).length >= 25,
      status: overall.independentSampleSize >= FORECAST_VALIDATION_MINIMUM &&
        independent.filter(row => Number(row.horizon) === 5).length >= 25 &&
        independent.filter(row => Number(row.horizon) === 20).length >= 25
        ? '50+ independent validated forecasts with 25+ per horizon'
        : 'building independent validation sample',
    },
  };
}

export function getTickerValidationContext(rows = [], ticker, horizon = DEFAULT_FORECAST_HORIZON) {
  const symbol = String(ticker || '').trim().toUpperCase();
  const targetHorizon = Number(horizon);
  const subset = rows.filter(row =>
    String(row?.ticker || '').trim().toUpperCase() === symbol &&
    Number(row?.horizon) === targetHorizon &&
    String(row?.status || 'verified') === 'verified'
  );
  if (!subset.length) return null;

  const summary = summarizeForecastRows(subset);
  return {
    ticker: symbol,
    horizon: targetHorizon,
    count: summary.count,
    sampleStatus: summary.sampleStatus,
    directionalAccuracyPct: summary.directionalAccuracyPct,
    medianAbsoluteError: summary.medianAbsoluteError,
    p25p75CoveragePct: summary.p25p75CoveragePct,
    meanSignedErrorPct: summary.meanSignedErrorPct,
    newestVerifiedAt: summary.newestVerifiedAt,
  };
}

export { FORECAST_VALIDATION_MINIMUM, DEFAULT_FORECAST_HORIZON };