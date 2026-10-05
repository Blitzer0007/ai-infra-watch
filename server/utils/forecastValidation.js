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

  const eligible = verified.filter(row => Number(row.median) !== 0 && Number(row.actual_return) !== 0);
  const signedErrors = verified
    .map(row => Number(row.actual_return) - Number(row.median))
    .filter(Number.isFinite);
  const absErrors = signedErrors.map(value => Math.abs(value));
  const p25p75 = verified.length
    ? verified.filter(row => Number(row.p25) <= Number(row.actual_return) && Number(row.actual_return) <= Number(row.p75)).length / verified.length * 100
    : null;
  const p10p90 = verified.length
    ? verified.filter(row => Number(row.p10) <= Number(row.actual_return) && Number(row.actual_return) <= Number(row.p90)).length / verified.length * 100
    : null;

  const directionalAccuracyPct = eligible.length
    ? eligible.filter(row => Math.sign(Number(row.median)) === Math.sign(Number(row.actual_return))).length / eligible.length * 100
    : null;

  const predictionMatchPct = (subset) => {
    const eligible = subset.filter(row => Number(row.median) !== 0 && Number(row.actual_return) !== 0);
    if (!eligible.length) return null;
    return Number(mean(eligible.map(row => {
      const actual = Math.abs(Number(row.actual_return));
      const miss = Math.abs(Number(row.median) - Number(row.actual_return));
      return Math.max(0, 100 - (miss / Math.max(actual, 1)) * 100);
    })).toFixed(1));
  };
  const rolling = (size) => {
    const subset = verified.slice(0, size);
    const eligible = subset.filter(row => Number(row.median) !== 0 && Number(row.actual_return) !== 0);
    const directionRightPct = eligible.length
      ? Number((eligible.filter(row => Math.sign(Number(row.median)) === Math.sign(Number(row.actual_return))).length / eligible.length * 100).toFixed(2))
      : null;
    return { directionRightPct, predictionMatchPct: predictionMatchPct(subset) };
  };

  return {
    count: verified.length,
    predictionMatchPct: predictionMatchPct(verified),
    rolling: {
      last10: { count: Math.min(10, verified.length), directionRightPct: rolling(10).directionalAccuracyPct, predictionMatchPct: predictionMatchPct(verified.slice(0, 10)) },
      last25: { count: Math.min(25, verified.length), directionRightPct: rolling(25).directionalAccuracyPct, predictionMatchPct: predictionMatchPct(verified.slice(0, 25)) },
      last50: { count: Math.min(50, verified.length), directionRightPct: rolling(50).directionalAccuracyPct, predictionMatchPct: predictionMatchPct(verified.slice(0, 50)) },
    },
    sampleStatus: sampleStatus(verified.length),
    directionalAccuracyPct: directionalAccuracyPct == null ? null : Number(directionalAccuracyPct.toFixed(2)),
    medianAbsoluteError: absErrors.length ? Number(percentile(absErrors, 0.5).toFixed(4)) : null,
    meanSignedErrorPct: signedErrors.length ? Number(mean(signedErrors).toFixed(4)) : null,
    p25p75CoveragePct: p25p75 == null ? null : Number(p25p75.toFixed(2)),
    p10p90CoveragePct: p10p90 == null ? null : Number(p10p90.toFixed(2)),
    oldestVerifiedAt: verified.map(row => row.verified_at).filter(Boolean).sort()[0] || null,
    newestVerifiedAt: verified.map(row => row.verified_at).filter(Boolean).sort().at(-1) || null,
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
