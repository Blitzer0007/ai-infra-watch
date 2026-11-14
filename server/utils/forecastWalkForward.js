// Offline evaluation of supplied forecasts; no model fitting, selection, IO or trading.
import { evaluateArchivedForecastWindow } from './forecastArchiveAdapter.js';
import { forecastInstantMicros, forecastNumber, forecastHorizon } from '../../src/utils/forecastInputs.js';

export const FORECAST_WALK_FORWARD_PROTOCOL = 'purged-expanding-origin-v1-experimental';
const MAX_WINDOWS = 32;
const MAX_INSPECTED_BYTES = 32 * 1024 * 1024;
const MAX_ONE_BUNDLE = 3 * 2 * 1024 * 1024 + 32768;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const token = value => typeof value === 'string' && TOKEN.test(value);
const integer = (value, low, high) => Number.isSafeInteger(value) && value >= low && value <= high;
const authority = () => ({ sourceVerified: false, predictionProvenanceVerified: false, modelFitVerified: false, productionEligible: false, predictiveValidityEstablished: false });
class EvaluationError extends Error {}
const stop = code => { throw new EvaluationError(code); };
const mean = values => {
  if (!values.length) return null;
  const scale = Math.max(...values.map(Math.abs));
  return scale === 0 ? 0 : values.reduce((sum, value) => sum + value / scale, 0) / values.length * scale;
};
export const forecastInstrument = request => ({
  symbol: typeof request?.symbol === 'string' && /^[A-Z0-9.^=-]{1,20}$/.test(request.symbol) ? request.symbol : null,
  venue: ['XNYS', 'XNAS'].includes(request?.venue) ? request.venue : null,
  currency: request?.currency === 'USD' ? 'USD' : null,
});

export function validateForecastWalkForwardInput(args) {
  if (!exact(args, ['protocolVersion', 'assessedAt', 'config', 'windows']) || args.protocolVersion !== FORECAST_WALK_FORWARD_PROTOCOL) stop('EVALUATION_PROTOCOL_INVALID');
  const config = args.config;
  if (!exact(config, ['trainStartAt', 'validationStartAt', 'holdoutStartAt', 'holdoutEndAt', 'modelFrozenAt', 'modelId', 'minimumTrainingRows', 'minimumFeatureSessions', 'gapMs']) ||
    !token(config.modelId) || !integer(config.minimumTrainingRows, 1, MAX_WINDOWS) ||
    !integer(config.minimumFeatureSessions, 1, 4000) || !integer(config.gapMs, 0, 31 * 86400000)) stop('EVALUATION_CONFIG_INVALID');
  const times = Object.fromEntries(['trainStartAt', 'validationStartAt', 'holdoutStartAt', 'holdoutEndAt', 'modelFrozenAt'].map(key => [key, forecastInstantMicros(config[key])]));
  const assessed = forecastInstantMicros(args.assessedAt);
  if (assessed === null || Object.values(times).some(value => value === null) ||
    !(times.trainStartAt < times.validationStartAt && times.validationStartAt <= times.modelFrozenAt &&
      times.modelFrozenAt < times.holdoutStartAt && times.holdoutStartAt < times.holdoutEndAt) || assessed < times.trainStartAt) stop('EVALUATION_CUTOFF_INVALID');
  if (!Array.isArray(args.windows) || !args.windows.length || args.windows.length > MAX_WINDOWS) stop('EVALUATION_WINDOW_LIMIT');
  const ids = new Set(), origins = new Set();
  for (const window of args.windows) {
    if (!exact(window, ['id', 'archive', 'prediction']) || !token(window.id) || !record(window.archive) ||
      (window.prediction !== null && !record(window.prediction))) stop('EVALUATION_WINDOW_INVALID');
    if (ids.has(window.id)) stop('EVALUATION_DUPLICATE_ID');
    ids.add(window.id);
    const request = window.archive.request, identity = forecastInstrument(request);
    const decision = forecastInstantMicros(request?.decisionAt), horizon = forecastHorizon(request?.horizonSessions);
    if (identity.symbol && identity.venue && identity.currency && decision !== null && [5, 20].includes(horizon)) {
      const key = JSON.stringify([identity.symbol, identity.venue, identity.currency, horizon, decision.toString()]);
      if (origins.has(key)) stop('EVALUATION_DUPLICATE_ORIGIN');
      origins.add(key);
    }
  }
  return { config, times, assessed };
}

export function forecastPartitionAt(time, times) {
  if (time < times.trainStartAt || time >= times.holdoutEndAt) return 'outside';
  if (time < times.validationStartAt) return 'train';
  return time < times.holdoutStartAt ? 'validation' : 'holdout';
}

// Shared chronological selection; callers still own archive loading and phase cutoffs.
export function selectForecastTraining(row, loaded, config, times) {
  const fitCutoff = row.partition === 'holdout' ? times.modelFrozenAt : row.decision;
  const candidates = loaded.filter(other => other.horizon === row.horizon && other.symbol === row.symbol && other.venue === row.venue && other.currency === row.currency &&
    (other.partition === 'train' || (row.partition === 'holdout' && other.partition === 'validation')) &&
    other.decision !== null && other.decision < fitCutoff);
  const valid = candidates.filter(other => ['training-context', 'candidate'].includes(other.status));
  const eligible = valid.filter(other => other.target + BigInt(config.gapMs) * 1000n < fitCutoff && other.labelAvailable !== null && other.labelAvailable <= fitCutoff);
  return { fitCutoff, eligible, receipt: {
    fitCutoffAt: row.partition === 'holdout' ? config.modelFrozenAt : row.window.archive.request.decisionAt,
    eligibleIds: eligible.map(other => other.window.id),
    purgedOverlapIds: valid.filter(other => other.target + BigInt(config.gapMs) * 1000n >= fitCutoff).map(other => other.window.id),
    unavailableIds: candidates.filter(other => !valid.includes(other) ||
      (other.target + BigInt(config.gapMs) * 1000n < fitCutoff && (other.labelAvailable === null || other.labelAvailable > fitCutoff))).map(other => other.window.id),
    minimumRequired: config.minimumTrainingRows,
  } };
}

function forecast(prediction, modelId, decision, fitCutoff, trainingIds) {
  if (!exact(prediction, ['modelId', 'issuedAt', 'trainingWindowIds', 'p10', 'p25', 'median', 'p75', 'p90']) || prediction.modelId !== modelId) stop('PREDICTION_METADATA_INVALID');
  const issued = forecastInstantMicros(prediction.issuedAt);
  if (issued === null || issued < fitCutoff || issued > decision) stop('PREDICTION_CUTOFF_INVALID');
  if (!Array.isArray(prediction.trainingWindowIds) || prediction.trainingWindowIds.length !== trainingIds.length ||
    new Set(prediction.trainingWindowIds).size !== prediction.trainingWindowIds.length ||
    !trainingIds.every(id => prediction.trainingWindowIds.includes(id))) stop('PREDICTION_TRAINING_SET_MISMATCH');
  const values = ['p10', 'p25', 'median', 'p75', 'p90'].map(key => forecastNumber(prediction[key]));
  if (values.some(value => value === null || value < -100) || values.some((value, index) => index > 0 && value < values[index - 1]) ||
    !Number.isFinite(values[4] - values[0])) stop('PREDICTION_QUANTILES_INVALID');
  return values;
}

function empirical(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return [.1, .25, .5, .75, .9].map(q => {
    const position = (sorted.length - 1) * q, lower = Math.floor(position), upper = Math.ceil(position), weight = position - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  });
}

function measurements(actual, predictions) {
  const errors = predictions.map(value => actual - value);
  if (!errors.every(Number.isFinite)) stop('EVALUATION_NONFINITE_METRIC');
  const pinball = errors.map((error, index) => Math.max([.1, .25, .5, .75, .9][index] * error, ([.1, .25, .5, .75, .9][index] - 1) * error));
  return { signedError: errors[2], absoluteError: Math.abs(errors[2]), pinball: mean(pinball),
    centralHit: actual >= predictions[1] && actual <= predictions[3], wideHit: actual >= predictions[0] && actual <= predictions[4],
    centralWidth: predictions[3] - predictions[1], wideWidth: predictions[4] - predictions[0] };
}

function aggregate(rows) {
  if (!rows.length) return { count: 0, maePP: null, rmsePP: null, meanSignedErrorPP: null, meanPinballLossPP: null,
    centralCoveragePct: null, wideCoveragePct: null, centralMeanWidthPP: null, wideMeanWidthPP: null };
  const maxError = Math.max(...rows.map(row => row.absoluteError));
  return { count: rows.length, maePP: mean(rows.map(row => row.absoluteError)),
    rmsePP: maxError === 0 ? 0 : maxError * Math.sqrt(mean(rows.map(row => (row.absoluteError / maxError) ** 2))),
    meanSignedErrorPP: mean(rows.map(row => row.signedError)), meanPinballLossPP: mean(rows.map(row => row.pinball)),
    centralCoveragePct: mean(rows.map(row => row.centralHit ? 100 : 0)), wideCoveragePct: mean(rows.map(row => row.wideHit ? 100 : 0)),
    centralMeanWidthPP: mean(rows.map(row => row.centralWidth)), wideMeanWidthPP: mean(rows.map(row => row.wideWidth)) };
}

/**
 * Score precomputed forecasts on pinned archive windows with explicit logical fit receipts.
 * Receipts/timestamps do not authenticate prediction issuance or prove a model was fitted.
 * Validation expands over train rows; holdout training is frozen before holdout starts.
 */
export function evaluateWalkForwardForecasts(args) {
  try {
    const { config, times, assessed } = validateForecastWalkForwardInput(args);
    let inspectedBytes = 0;
    const loaded = args.windows.map(window => {
      const decision = forecastInstantMicros(window.archive?.request?.decisionAt);
      const horizon = forecastHorizon(window.archive?.request?.horizonSessions);
      if (decision === null) return { window, decision, horizon, partition: 'unassigned', status: 'needs-data', code: 'WINDOW_CUTOFF_INVALID' };
      const partition = forecastPartitionAt(decision, times);
      const common = { window, decision, horizon, partition, ...forecastInstrument(window.archive.request) };
      if (partition === 'outside') return { ...common, status: 'excluded', code: 'OUTSIDE_PROTOCOL' };
      if (decision > assessed) return { ...common, status: 'pending', code: 'FUTURE_ORIGIN' };
      if (forecastInstantMicros(window.archive.request.assessedAt) !== assessed) return { ...common, status: 'needs-data', code: 'ASSESSMENT_CUTOFF_MISMATCH' };
      if (MAX_INSPECTED_BYTES - inspectedBytes < MAX_ONE_BUNDLE) return { ...common, status: 'not-assessed', code: 'EVALUATION_BYTE_BUDGET' };
      const archive = evaluateArchivedForecastWindow(window.archive);
      inspectedBytes += archive.receipt.inspectedBytes;
      const assessment = archive.assessment;
      if (archive.status !== 'conditional-outcome') return { ...common, status: archive.status, code: archive.code };
      if (assessment.featureCount < config.minimumFeatureSessions) return { ...common, status: 'needs-data', code: 'MODEL_LOOKBACK_INSUFFICIENT' };
      return { ...common, status: partition === 'train' ? 'training-context' : 'candidate', code: 'ARCHIVE_WINDOW_CHECKS_PASSED',
        target: forecastInstantMicros(assessment.plan.targetCloseAt),
        labelAvailable: forecastInstantMicros(archive.receipt.snapshotAvailableAt.outcomes), actual: assessment.outcome.grossReturnPct };
    });
    // Work on copies. Equal-origin windows are ordered by stable caller ID.
    loaded.sort((a, b) => a.decision === null ? (b.decision === null ? a.window.id.localeCompare(b.window.id) : 1) :
      b.decision === null ? -1 : a.decision < b.decision ? -1 : a.decision > b.decision ? 1 : a.window.id.localeCompare(b.window.id));
    const scored = [];
    const windows = loaded.map(row => {
      const output = { id: row.window.id, partition: row.partition, horizonSessions: row.horizon,
        symbol: row.symbol || null, status: row.status, code: row.code, actualReturnPct: null, training: null };
      if (row.status !== 'candidate') return output;
      const { fitCutoff, eligible, receipt } = selectForecastTraining(row, loaded, config, times);
      output.training = receipt;
      if (eligible.length < config.minimumTrainingRows) return { ...output, status: 'needs-data', code: 'TRAINING_SAMPLE_INSUFFICIENT' };
      if (row.window.prediction === null) return { ...output, status: 'needs-data', code: 'PREDICTION_MISSING' };
      try {
        const model = forecast(row.window.prediction, config.modelId, row.decision, fitCutoff, eligible.map(other => other.window.id));
        const paired = { id: row.window.id, partition: row.partition, horizon: row.horizon,
          model: measurements(row.actual, model), noChange: measurements(row.actual, [0, 0, 0, 0, 0]),
          trainingDistribution: measurements(row.actual, empirical(eligible.map(other => other.actual))) };
        scored.push(paired);
        return { ...output, status: 'scored', code: 'DESCRIPTIVE_PAIRED_MEASUREMENT', actualReturnPct: row.actual };
      } catch (error) {
        return { ...output, status: 'needs-data', code: error instanceof EvaluationError ? error.message : 'EVALUATION_INPUT_INVALID' };
      }
    });
    const summaries = ['validation', 'holdout'].flatMap(partition => [5, 20].map(horizon => {
      const paired = scored.filter(row => row.partition === partition && row.horizon === horizon);
      const model = aggregate(paired.map(row => row.model)), noChange = aggregate(paired.map(row => row.noChange));
      const trainingDistribution = aggregate(paired.map(row => row.trainingDistribution));
      return { partition, horizonSessions: horizon, suppliedWindowCount: windows.filter(row => row.partition === partition && row.horizonSessions === horizon).length,
        pairedCount: paired.length, model, noChange, trainingDistribution,
        modelMinusNoChangeMaePP: paired.length ? model.maePP - noChange.maePP : null,
        modelMinusTrainingMaePP: paired.length ? model.maePP - trainingDistribution.maePP : null };
    }));
    return { protocolVersion: FORECAST_WALK_FORWARD_PROTOCOL, status: scored.length ? 'descriptive-results' : 'insufficient',
      config: { ...config }, assessedAt: args.assessedAt,
      scope: { training: 'same-symbol-venue-currency-horizon', summaries: 'pooled-within-partition-horizon', dependenceAdjusted: false },
      windows, summaries, coverage: { supplied: windows.length, scored: scored.length,
        trainingContext: windows.filter(row => row.status === 'training-context').length,
        pending: windows.filter(row => row.status === 'pending').length,
        needsData: windows.filter(row => row.status === 'needs-data').length,
        excluded: windows.filter(row => row.status === 'excluded').length,
        unassessed: windows.filter(row => row.status === 'not-assessed').length },
      usage: { inspectedBytes, maximumInspectedBytes: MAX_INSPECTED_BYTES, maximumWindows: MAX_WINDOWS }, ...authority() };
  } catch (error) {
    return { protocolVersion: FORECAST_WALK_FORWARD_PROTOCOL, status: 'needs-data',
      code: error instanceof EvaluationError ? error.message : 'EVALUATION_INPUT_INVALID', windows: [], summaries: [], ...authority() };
  }
}
