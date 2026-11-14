// Fictional construction only. No vendor calendar, model, settings, filesystem or HTTP.
import { createHash } from 'node:crypto';
const encode = value => Buffer.from(JSON.stringify(value) + '\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const closureDays = new Set(['2026-06-19', '2026-07-03']);

function calendarDays() {
  const days = [];
  for (let date = '2026-06-01'; date <= '2026-08-31'; date = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10)) {
    const day = new Date(date).getUTCDay();
    days.push(day === 0 || day === 6 || closureDays.has(date) ? { date, status: 'closed' } :
      { date, status: 'open', openAt: date + 'T13:30:00Z', closeAt: date + 'T20:00:00Z' });
  }
  return days;
}

export function fictionalForecastWindow({ id, decisionAt, entryDate, targetDate, actualReturnPct, prediction = null, assessedAt, symbol = 'FICT', horizonSessions = 5 }) {
  const days = calendarDays();
  const completed = days.filter(day => day.status === 'open' && Date.parse(day.closeAt) <= Date.parse(decisionAt)).slice(-2);
  const calendar = { schemaVersion: 'forecast-calendar-archive-v1', recordId: 'fictional-calendar', sourceId: 'fictional-calendar',
    revisionId: 'fictional-v1', publishedAt: '2026-05-01T00:00:00Z', venue: 'XNYS', timeZone: 'America/New_York',
    coverageStart: '2026-06-01', coverageEnd: '2026-08-31', days };
  const history = (role, selected) => ({ schemaVersion: 'forecast-price-archive-v1', recordId: id + '-' + role,
    sourceId: 'fictional-prices', vintageId: id + '-' + role + '-v1', publishedAt: selected.at(-1).date + 'T20:01:00Z',
    symbol, venue: 'XNYS', currency: 'USD', priceBasis: 'split_dividend_adjusted_close', stale: false,
    coverageStart: selected[0].date, coverageEnd: selected.at(-1).date,
    records: selected.map(day => ({ recordId: id + ':' + day.date, sessionDate: day.date,
      rawClose: role === 'outcomes' && day.date === targetDate ? 100 + actualReturnPct : 100,
      adjustedClose: role === 'outcomes' && day.date === targetDate ? 100 + actualReturnPct : 100,
      publishedAt: day.date + 'T20:01:00Z' })) });
  const selected = days.filter(day => day.status === 'open' && day.date >= entryDate && day.date <= targetDate);
  const documents = { calendar, features: history('features', completed), outcomes: history('outcomes', selected) };
  const artifacts = new Map();
  const manifest = { schemaVersion: 'forecast-evidence-manifest-v1', bundleId: id, calendar: null, features: null, outcomes: null };
  for (const [role, document] of Object.entries(documents)) {
    const bytes = encode(document); artifacts.set(role, bytes);
    manifest[role] = { artifactId: role, recordId: document.recordId, sourceId: document.sourceId,
      versionId: document.revisionId || document.vintageId, sha256: hash(bytes), byteLength: bytes.length };
  }
  const manifestBytes = encode(manifest);
  return { id, prediction, archive: { request: { protocolVersion: 'session-close-v1-experimental', symbol, venue: 'XNYS', currency: 'USD',
    horizonSessions, decisionAt, assessedAt }, manifestBytes, expectedManifestSha256: hash(manifestBytes), artifacts } };
}

export function fictionalWalkForwardInput(assessedAt = '2026-08-03T22:00:00Z') {
  const modelId = 'fictional-fixed-v1';
  const initial = ['train-a', 'train-b'], expanded = [...initial, 'train-overlap'];
  const frozen = [...expanded, 'validation-a', 'validation-b'];
  const prediction = (issuedAt, trainingWindowIds, quantiles) => ({ modelId, issuedAt, trainingWindowIds: [...trainingWindowIds],
    p10: quantiles[0], p25: quantiles[1], median: quantiles[2], p75: quantiles[3], p90: quantiles[4] });
  const specifications = [
    { id: 'train-a', decisionAt: '2026-06-02T20:10:00Z', entryDate: '2026-06-03', targetDate: '2026-06-10', actualReturnPct: 10 },
    { id: 'train-b', decisionAt: '2026-06-09T20:10:00Z', entryDate: '2026-06-10', targetDate: '2026-06-17', actualReturnPct: 20 },
    { id: 'train-overlap', decisionAt: '2026-06-16T20:10:00Z', entryDate: '2026-06-17', targetDate: '2026-06-25', actualReturnPct: -10 },
    { id: 'validation-a', decisionAt: '2026-06-18T20:10:00Z', entryDate: '2026-06-22', targetDate: '2026-06-29', actualReturnPct: 10,
      prediction: prediction('2026-06-18T20:10:00Z', initial, [0, 5, 15, 25, 30]) },
    { id: 'validation-b', decisionAt: '2026-06-25T20:10:00Z', entryDate: '2026-06-26', targetDate: '2026-07-06', actualReturnPct: -10,
      prediction: prediction('2026-06-25T20:10:00Z', expanded, [-20, -10, 0, 10, 20]) },
    { id: 'holdout-a', decisionAt: '2026-07-08T20:10:00Z', entryDate: '2026-07-09', targetDate: '2026-07-16', actualReturnPct: 0,
      prediction: prediction('2026-07-08T20:10:00Z', frozen, [0, 0, 0, 0, 0]) },
    { id: 'holdout-b', decisionAt: '2026-07-15T20:10:00Z', entryDate: '2026-07-16', targetDate: '2026-07-23', actualReturnPct: 5,
      prediction: prediction('2026-07-15T20:10:00Z', frozen, [-5, 0, 0, 5, 10]) },
    { id: 'missing-prediction', decisionAt: '2026-07-20T20:10:00Z', entryDate: '2026-07-21', targetDate: '2026-07-28', actualReturnPct: 5 },
    { id: 'holdout-pending', decisionAt: '2026-07-27T20:10:00Z', entryDate: '2026-07-28', targetDate: '2026-08-04', actualReturnPct: -5,
      prediction: prediction('2026-07-27T20:10:00Z', frozen, [-10, -5, 0, 5, 10]) },
  ];
  return { protocolVersion: 'purged-expanding-origin-v1-experimental', assessedAt,
    config: { trainStartAt: '2026-06-01T00:00:00Z', validationStartAt: '2026-06-18T00:00:00Z',
      holdoutStartAt: '2026-07-08T00:00:00Z', holdoutEndAt: '2026-08-15T00:00:00Z', modelFrozenAt: '2026-07-07T20:10:00Z',
      modelId, minimumTrainingRows: 2, minimumFeatureSessions: 2, gapMs: 0 },
    windows: specifications.map(specification => fictionalForecastWindow({ ...specification, assessedAt })) };
}
