import { forecastNumber, forecastCount, forecastHorizon, forecastInstant } from '../../src/utils/forecastInputs.js';
import { forecastWindow } from '../../src/utils/forecastIndependence.js';
import { independentForecastRows } from './forecastIndependence.js';
import { coverageInterval, calibrationVerdict } from './forecastCalibration.js';

const FORECAST_VALIDATION_MINIMUM = 50;
const DEFAULT_FORECAST_HORIZON = 20;

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value / values.length, 0) : 0;
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
  count = forecastCount(count);
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
    directionalSampleCount: eligible(rows).length,
    scoreSampleCount: eligible(rows).length,
    neutralOrZeroCount: rows.length - eligible(rows).length,
    directionRightPct: directionRightPct(rows),
    predictionMatchPct: predictionMatchPct(rows),
    typicalMiss: typicalMiss(rows),
    medianAbsoluteError: typicalMiss(rows),
    meanSignedErrorPct: signedErrors.length ? Number(mean(signedErrors).toFixed(2)) : null,
    p25p75CoverageCount: middleCoverage.count,
    p10p90CoverageCount: wideCoverage.count,
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

function eligibleMetricRows(rows) {
  return rows.filter(row=>{
    const actual=forecastNumber(row?.actual_return), median=forecastNumber(row?.median);
    const ticker=typeof row?.ticker==='string'?row.ticker.trim().toUpperCase():'';
    return row?.status==='verified'&&/^[A-Z0-9.^=-]{1,20}$/.test(ticker)&&forecastHorizon(row?.horizon)!==null&&forecastWindow(row)!==null&&
      actual!==null&&median!==null&&Number.isFinite(actual-median);
  });
}
function selectionReceipt(rows, verified, independent) {
  const declared=rows.filter(row=>row?.status==='verified').length;
  return {inputRowCount:rows.length,verifiedRowCount:declared,eligibleRowCount:verified.length,
    invalidVerifiedRowCount:declared-verified.length,unverifiedRowCount:rows.length-declared,
    retainedRowCount:independent.length,overlapExcludedRowCount:verified.length-independent.length,
    chronology:'target-date',scope:'per-ticker-horizon-non-overlap',statisticalIndependenceEstablished:false};
}

export function summarizeForecastRows(rows = []) {
  const verified = eligibleMetricRows(rows);

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
      scoreSampleCount: summary.scoreSampleCount,
      directionalSampleCount: summary.directionalSampleCount,
      neutralOrZeroCount: summary.neutralOrZeroCount,
    };
  };

  return {
    count: verified.length,
    selection: selectionReceipt(rows, verified, independent),
    independentCount: independent.length,
    predictionMatchPct: base.predictionMatchPct,
    scoreSampleCount: base.scoreSampleCount,
    directionalSampleCount: base.directionalSampleCount,
    neutralOrZeroCount: base.neutralOrZeroCount,
    p25p75CoverageCount: base.p25p75CoverageCount,
    p10p90CoverageCount: base.p10p90CoverageCount,
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
    oldestVerifiedAt: independent.map(row => row.verified_at).filter(value=>forecastInstant(value)!==null).sort((a,b)=>Date.parse(a)-Date.parse(b))[0] || null,
    newestVerifiedAt: independent.map(row => row.verified_at).filter(value=>forecastInstant(value)!==null).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1) || null,
  };
}

export function buildForecastLearningSummary(rows = []) {
  const verified = eligibleMetricRows(rows);
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
    return ['news', 'contracts', 'political', 'macro'].filter(key => forecastCount(counts[key]) > 0).length +
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
    selection: selectionReceipt(rows, verified, independent),
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
  const verifiedCount = forecastCount(count);
  return {
    minimumRequired: FORECAST_VALIDATION_MINIMUM,
    verifiedCount,
    ready: verifiedCount >= FORECAST_VALIDATION_MINIMUM,
    status: verifiedCount >= FORECAST_VALIDATION_MINIMUM ? '50+ validated forecasts' : 'building validation sample',
  };
}

export function buildForecastValidationSummary(rows = []) {
  const overall = summarizeForecastRows(rows);
  const independent = independentForecastRows(eligibleMetricRows(rows));
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
      verifiedCount: independent.length,
      independent5D: independent.filter(row => Number(row.horizon) === 5).length,
      independent20D: independent.filter(row => Number(row.horizon) === 20).length,
      ready: independent.length >= FORECAST_VALIDATION_MINIMUM &&
        independent.filter(row => Number(row.horizon) === 5).length >= 25 &&
        independent.filter(row => Number(row.horizon) === 20).length >= 25,
      status: independent.length >= FORECAST_VALIDATION_MINIMUM &&
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
    row?.status === 'verified'
  );
  if (!eligibleMetricRows(subset).length) return null;

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