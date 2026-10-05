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

function sampleStatus(count) {
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
  const p25p75 = rows.length
    ? rows.filter(row => Number(row.p25) <= Number(row.actual_return) && Number(row.actual_return) <= Number(row.p75)).length / rows.length * 100
    : null;
  const p10p90 = rows.length
    ? rows.filter(row => Number(row.p10) <= Number(row.actual_return) && Number(row.actual_return) <= Number(row.p90)).length / rows.length * 100
    : null;

  return {
    count: rows.length,
    directionRightPct: directionRightPct(rows),
    predictionMatchPct: predictionMatchPct(rows),
    typicalMiss: typicalMiss(rows),
    medianAbsoluteError: typicalMiss(rows),
    meanSignedErrorPct: signedErrors.length ? Number(mean(signedErrors).toFixed(2)) : null,
    p25p75CoveragePct: p25p75 == null ? null : Number(p25p75.toFixed(1)),
    p10p90CoveragePct: p10p90 == null ? null : Number(p10p90.toFixed(1)),
  };
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

  const signedErrors = verified
    .map(row => Number(row.actual_return) - Number(row.median))
    .filter(Number.isFinite);

  const base = summarizeSubset(verified);
  const rolling = (size) => {
    const subset = verified.slice(0, size);
    const summary = summarizeSubset(subset);
    return {
      count: summary.count,
      directionRightPct: summary.directionRightPct,
      predictionMatchPct: summary.predictionMatchPct,
    };
  };

  return {
    count: verified.length,
    predictionMatchPct: base.predictionMatchPct,
    rolling: {
      last10: rolling(10),
      last25: rolling(25),
      last50: rolling(50),
    },
    sampleStatus: sampleStatus(verified.length),
    directionalAccuracyPct: base.directionRightPct,
    medianAbsoluteError: base.medianAbsoluteError,
    meanSignedErrorPct: signedErrors.length ? Number(mean(signedErrors).toFixed(2)) : null,
    p25p75CoveragePct: base.p25p75CoveragePct,
    p10p90CoveragePct: base.p10p90CoveragePct,
    oldestVerifiedAt: verified.map(row => row.verified_at).filter(Boolean).sort()[0] || null,
    newestVerifiedAt: verified.map(row => row.verified_at).filter(Boolean).sort().at(-1) || null,
  };
}

export function buildForecastLearningSummary(rows = []) {
  const verified = rows.filter(row => String(row?.status || 'verified') === 'verified');
  const typicalMiss = subset => {
    const values = subset.map(row => Math.abs(Number(row.actual_return) - Number(row.median))).filter(Number.isFinite);
    return values.length ? Number(percentile(values, 0.5).toFixed(2)) : null;
  };
  const baselineMiss = subset => {
    const values = subset.map(row => Math.abs(Number(row.actual_return))).filter(Number.isFinite);
    return values.length ? Number(percentile(values, 0.5).toFixed(2)) : null;
  };
  const score = subset => ({
    count: subset.length,
    directionRightPct: directionRightPct(subset),
    predictionMatchPct: predictionMatchPct(subset),
  });
  const modelMiss = typicalMiss(verified);
  const noChangeMiss = baselineMiss(verified);
  const improvementPct = modelMiss != null && noChangeMiss > 0
    ? Number(((noChangeMiss - modelMiss) / noChangeMiss * 100).toFixed(1))
    : null;
  const recent = score(verified.slice(0, 10));
  const prior = score(verified.slice(10, 20));
  const driftScore = recent.predictionMatchPct != null && prior.predictionMatchPct != null
    ? Number((recent.predictionMatchPct - prior.predictionMatchPct).toFixed(1))
    : null;
  const driftStatus = driftScore == null || verified.length < 20
    ? 'insufficient'
    : driftScore >= 5 ? 'improving' : driftScore <= -5 ? 'declining' : 'steady';

  const channelCount = row => {
    const snapshot = row?.evidence_snapshot && typeof row.evidence_snapshot === 'object' ? row.evidence_snapshot : {};
    const counts = snapshot.counts || {};
    return ['news', 'contracts', 'political', 'macro'].filter(key => Number(counts[key]) > 0).length +
      (snapshot.analystConsensus?.status === 'available' ? 1 : 0);
  };
  const multi = verified.filter(row => channelCount(row) >= 2);
  const other = verified.filter(row => channelCount(row) < 2);
  const multiScore = score(multi);
  const otherScore = score(other);
  const evidenceLift = multiScore.predictionMatchPct != null && otherScore.predictionMatchPct != null
    ? Number((multiScore.predictionMatchPct - otherScore.predictionMatchPct).toFixed(1))
    : null;

  return {
    sampleSize: verified.length,
    model: { typicalMiss: modelMiss, directionRightPct: score(verified).directionRightPct, predictionMatchPct: score(verified).predictionMatchPct },
    baseline: { name: 'No-change baseline', typicalMiss: noChangeMiss, improvementPct },
    drift: { status: driftStatus, score: driftScore, recent, prior },
    evidenceLearning: {
      multipleChannelSamples: multi.length,
      otherSamples: other.length,
      predictionMatchLift: evidenceLift,
      note: evidenceLift == null
        ? 'Not enough evidence history to compare evidence quality.'
        : evidenceLift >= 5
          ? 'Forecasts with multiple evidence channels have been performing better in this sample.'
          : evidenceLift <= -5
            ? 'More evidence has not improved results in this sample; treat the evidence mix as a learning signal, not proof of causation.'
            : 'Multiple evidence channels have not produced a clear performance difference yet.',
    },
  };
}

export function buildForecastValidationSummary(rows = []) {
  const overall = summarizeForecastRows(rows);
  const groups = new Map();

  for (const row of rows) {
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
      verifiedCount: overall.count,
      ready: overall.count >= FORECAST_VALIDATION_MINIMUM,
      status: overall.count >= FORECAST_VALIDATION_MINIMUM
        ? '50+ validated forecasts'
        : 'building validation sample',
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