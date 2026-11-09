// Experimental offline protocol. No IO, ambient clock, writer, model or promotion capability.
import { forecastDay, forecastInstantMicros as preciseInstant, forecastHorizon, forecastNumber } from '../../src/utils/forecastInputs.js';

export const FORECAST_EVALUATION_PROTOCOL = 'session-close-v1-experimental';
const MAX_DAYS = 4000;
const MAX_POINTS = 4000;
const BASIS = 'split_dividend_adjusted_close';
const TIME_ZONE = 'America/New_York';
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const token = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(value);
const symbol = value => typeof value === 'string' && /^[A-Z0-9.^=-]{1,20}$/.test(value);
const shape = (value, keys) => record(value) && Object.keys(value).every(key => keys.includes(key));
const dayAt = instant => {
  const millis = instant / 1000n - (instant < 0n && instant % 1000n !== 0n ? 1n : 0n);
  const parts = Object.fromEntries(dayFormatter.formatToParts(Number(millis)).map(part => [part.type, part.value]));
  return parts.year + '-' + parts.month + '-' + parts.day;
};
const nextDay = day => new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
const authority = () => ({ sourceVerified: false, productionEligible: false, predictiveValidityEstablished: false });

/**
 * @typedef {Object} ForecastWindowAssessment
 * @property {string} protocolVersion
 * @property {'planned'|'needs-data'|'pending'|'conditional-outcome'} status
 * @property {string} code
 * @property {ReturnType<typeof prepare>['plan']|null} plan
 * @property {{measurement:string,grossReturnPct:number,entryDate:string,targetDate:string,entryRawClose:number,targetRawClose:number,entryAdjustedClose:number,targetAdjustedClose:number}|null} outcome
 * @property {number} [featureCount]
 * @property {string} [featureVintageId]
 * @property {number} [outcomeCount]
 * @property {string} [outcomeVintageId]
 * @property {boolean} sourceVerified
 * @property {boolean} productionEligible
 * @property {boolean} predictiveValidityEstablished
 */

class ProtocolError extends Error {}
function stop(code) { throw new ProtocolError(code); }
const errorCode = error => error instanceof ProtocolError ? error.message : 'PREFLIGHT_INPUT_INVALID';

function calendarSessions(calendar, venue, decision) {
  if (!shape(calendar, ['schemaVersion', 'venue', 'timeZone', 'sourceId', 'revisionId', 'availableAt', 'coverageStart', 'coverageEnd', 'days']) ||
    calendar.schemaVersion !== 'forecast-session-calendar-v1' || calendar.venue !== venue || calendar.timeZone !== TIME_ZONE ||
    !token(calendar.sourceId) || !token(calendar.revisionId)) stop('CALENDAR_METADATA_INVALID');
  const available = preciseInstant(calendar.availableAt);
  if (available === null || available > decision) stop('CALENDAR_UNAVAILABLE_AT_DECISION');
  if (!forecastDay(calendar.coverageStart) || !forecastDay(calendar.coverageEnd) ||
    calendar.coverageStart > calendar.coverageEnd || !Array.isArray(calendar.days) ||
    !calendar.days.length || calendar.days.length > MAX_DAYS) stop('CALENDAR_COVERAGE_INVALID');
  const decisionDay = dayAt(decision);
  if (decisionDay < calendar.coverageStart || decisionDay > calendar.coverageEnd) stop('DECISION_OUTSIDE_CALENDAR');

  let expected = calendar.coverageStart;
  let previousClose = null;
  const sessions = [];
  for (const day of calendar.days) {
    if (!record(day) || day.date !== expected || !forecastDay(day.date)) stop('CALENDAR_DAY_GAP_OR_DUPLICATE');
    if (day.status === 'closed') {
      if (!shape(day, ['date', 'status'])) stop('CALENDAR_CLOSED_DAY_INVALID');
    } else if (day.status === 'open') {
      const open = preciseInstant(day.openAt), close = preciseInstant(day.closeAt);
      const weekDay = new Date(day.date + 'T00:00:00Z').getUTCDay();
      if (!shape(day, ['date', 'status', 'openAt', 'closeAt']) || open === null || close === null ||
        open >= close || (previousClose !== null && open <= previousClose) || dayAt(open) !== day.date || dayAt(close) !== day.date ||
        weekDay === 0 || weekDay === 6) stop('CALENDAR_SESSION_INVALID');
      sessions.push({ date: day.date, openAt: day.openAt, closeAt: day.closeAt, open, close });
      previousClose = close;
    } else stop('CALENDAR_DAY_STATUS_UNKNOWN');
    expected = nextDay(expected);
  }
  if (calendar.days.at(-1).date !== calendar.coverageEnd) stop('CALENDAR_COVERAGE_INVALID');
  return sessions;
}

function prepare(input) {
  if (!shape(input, ['protocolVersion', 'symbol', 'venue', 'currency', 'horizonSessions', 'decisionAt', 'assessedAt', 'calendar', 'featureHistory', 'outcomeHistory']) ||
    input.protocolVersion !== FORECAST_EVALUATION_PROTOCOL) stop('PROTOCOL_UNSUPPORTED');
  const decision = preciseInstant(input.decisionAt), assessed = preciseInstant(input.assessedAt);
  if (decision === null || assessed === null || assessed < decision) stop('CUTOFF_INVALID');
  if (!symbol(input.symbol) || !['XNYS', 'XNAS'].includes(input.venue) || input.currency !== 'USD') stop('INSTRUMENT_UNSUPPORTED');
  const horizon = forecastHorizon(input.horizonSessions);
  if (![5, 20].includes(horizon)) stop('HORIZON_UNSUPPORTED');
  const sessions = calendarSessions(input.calendar, input.venue, decision);
  const entryIndex = sessions.findIndex(session => session.close > decision);
  if (entryIndex < 0 || !sessions[entryIndex + horizon]) stop('TARGET_OUTSIDE_CALENDAR');
  const completed = sessions.filter(session => session.close <= decision).at(-1);
  if (!completed) stop('FEATURE_SESSION_OUTSIDE_CALENDAR');
  const entry = sessions[entryIndex], target = sessions[entryIndex + horizon];
  const plan = {
    protocolVersion: FORECAST_EVALUATION_PROTOCOL,
    symbol: input.symbol, venue: input.venue, currency: input.currency,
    decisionAt: input.decisionAt, assessedAt: input.assessedAt,
    entryConvention: 'first-session-close-strictly-after-decision',
    horizonSessions: horizon,
    entryDate: entry.date, entryCloseAt: entry.closeAt,
    targetDate: target.date, targetCloseAt: target.closeAt,
    featureThrough: completed.date, priceBasis: BASIS,
    calendarSourceId: input.calendar.sourceId, calendarRevisionId: input.calendar.revisionId,
    calendarAvailableAt: input.calendar.availableAt,
  };
  return { plan, sessions, decision, assessed, entry, target, completed };
}

/** @returns {ForecastWindowAssessment} */
function failure(code, plan = null) {
  return { protocolVersion: FORECAST_EVALUATION_PROTOCOL, status: 'needs-data', code, plan, outcome: null, ...authority() };
}

/**
 * Plans only from a caller-declared calendar; it never generates holidays or certifies a source.
 * @returns {ForecastWindowAssessment}
 */
export function planForecastSessions(input) {
  try {
    return { protocolVersion: FORECAST_EVALUATION_PROTOCOL, status: 'planned', code: 'DECLARED_CALENDAR_CHECKS_PASSED', plan: prepare(input).plan, outcome: null, ...authority() };
  } catch (error) { return failure(errorCode(error)); }
}

function historyRows(history, input, sessions, start, end, cutoff) {
  if (!shape(history, ['schemaVersion', 'symbol', 'venue', 'currency', 'priceBasis', 'sourceId', 'vintageId', 'snapshotAvailableAt', 'stale', 'coverageStart', 'coverageEnd', 'points']) ||
    history.schemaVersion !== 'forecast-history-v1' || history.symbol !== input.symbol || history.venue !== input.venue ||
    history.currency !== input.currency || !token(history.sourceId) || !token(history.vintageId)) stop('HISTORY_METADATA_INVALID');
  if (history.priceBasis !== BASIS) stop('HISTORY_BASIS_UNSUPPORTED');
  if (history.stale !== false) stop('HISTORY_STALE_OR_UNKNOWN');
  const snapshotAvailable = preciseInstant(history.snapshotAvailableAt);
  if (snapshotAvailable === null || snapshotAvailable > cutoff) stop('HISTORY_UNAVAILABLE_AT_CUTOFF');
  if (!forecastDay(start) || !forecastDay(history.coverageStart) || !forecastDay(history.coverageEnd) ||
    history.coverageStart !== start || history.coverageEnd !== end || start > end || start < input.calendar.coverageStart) stop('HISTORY_COVERAGE_MISMATCH');
  if (!Array.isArray(history.points) || !history.points.length || history.points.length > MAX_POINTS) stop('HISTORY_SIZE_INVALID');
  const expected = sessions.filter(session => session.date >= start && session.date <= end);
  const byDay = new Map(expected.map(session => [session.date, session]));
  const seen = new Set();
  const recordIds = new Set();
  let previous = '';
  const normalized = [];
  for (const point of history.points) {
    if (!shape(point, ['date', 'rawClose', 'adjustedClose', 'availableAt', 'recordId']) || !forecastDay(point.date) || !token(point.recordId)) stop('BAR_METADATA_INVALID');
    const raw = forecastNumber(point.rawClose), adjusted = forecastNumber(point.adjustedClose);
    if (raw === null || adjusted === null || raw <= 0 || adjusted <= 0) stop('BAR_PRICE_INVALID');
    if (seen.has(point.date) || recordIds.has(point.recordId)) stop('BAR_DUPLICATE');
    if (point.date <= previous) stop('BAR_ORDER_INVALID');
    const session = byDay.get(point.date);
    if (!session) stop('BAR_OUTSIDE_REQUESTED_SESSIONS');
    const available = preciseInstant(point.availableAt);
    if (available === null || available < session.close || available > snapshotAvailable || available > cutoff) stop('BAR_UNAVAILABLE_AT_CUTOFF');
    seen.add(point.date); recordIds.add(point.recordId); previous = point.date;
    normalized.push({ date: point.date, rawClose: raw, adjustedClose: adjusted });
  }
  if (!expected.length || expected.length !== normalized.length) stop('BAR_MISSING_SESSION');
  return normalized;
}

/**
 * Conditional hypothetical close-to-close measurement, not a backtest/promotion verdict.
 * Feature vintages must predate decision; label vintages must predate assessment.
 * Both label endpoints come from the same supplied adjustment vintage.
 * @returns {ForecastWindowAssessment}
 */
export function evaluateForecastWindow(input) {
  let prepared;
  try { prepared = prepare(input); } catch (error) { return failure(errorCode(error)); }
  const { plan, sessions, decision, assessed, target } = prepared;
  let features;
  try {
    features = historyRows(input.featureHistory, input, sessions,
      input.featureHistory?.coverageStart, plan.featureThrough, decision);
  } catch (error) { return failure(errorCode(error), plan); }
  const receipt = { featureCount: features.length, featureVintageId: input.featureHistory.vintageId };
  if (assessed < target.close) {
    return { protocolVersion: FORECAST_EVALUATION_PROTOCOL, status: 'pending', code: 'TARGET_SESSION_NOT_CLOSED', plan, outcome: null, ...receipt, ...authority() };
  }
  let labels;
  try {
    labels = historyRows(input.outcomeHistory, input, sessions, plan.entryDate, plan.targetDate, assessed);
  } catch (error) { return { ...failure(errorCode(error), plan), ...receipt }; }
  const entry = labels[0], targetBar = labels.at(-1);
  const grossReturnPct = (targetBar.adjustedClose / entry.adjustedClose - 1) * 100;
  if (!Number.isFinite(grossReturnPct)) return { ...failure('RETURN_NONFINITE', plan), ...receipt };
  return {
    protocolVersion: FORECAST_EVALUATION_PROTOCOL, status: 'conditional-outcome', code: 'DECLARED_INPUT_CHECKS_PASSED', plan,
    ...receipt, outcomeCount: labels.length, outcomeVintageId: input.outcomeHistory.vintageId,
    outcome: { measurement: 'hypothetical-adjusted-close-return', grossReturnPct,
      entryDate: entry.date, targetDate: targetBar.date,
      entryRawClose: entry.rawClose, targetRawClose: targetBar.rawClose,
      entryAdjustedClose: entry.adjustedClose, targetAdjustedClose: targetBar.adjustedClose },
    ...authority(),
  };
}
