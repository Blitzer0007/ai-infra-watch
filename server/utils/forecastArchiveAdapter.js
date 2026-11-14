// Offline byte adapter only. No filesystem, path resolution, network, clock or writer.
import { createHash } from 'node:crypto';
import { forecastInstantMicros } from '../../src/utils/forecastInputs.js';
import { evaluateForecastWindow, planForecastSessions, FORECAST_EVALUATION_PROTOCOL } from './forecastEvaluationPreflight.js';

export const FORECAST_ARCHIVE_SCHEMA = 'forecast-archive-assessment-v1';
const MAX_MANIFEST_BYTES = 32768;
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const token = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(value);
const artifactId = value => typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value);
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const authority = () => ({ sourceVerified: false, productionEligible: false, predictiveValidityEstablished: false });
class ArchiveError extends Error {}
const stop = code => { throw new ArchiveError(code); };

function copiedBytes(value, limit) {
  if (!(value instanceof Uint8Array) || value.byteLength < 1 || value.byteLength > limit ||
    (typeof SharedArrayBuffer !== 'undefined' && value.buffer instanceof SharedArrayBuffer)) stop('ARCHIVE_BYTES_INVALID');
  return Buffer.from(value);
}

function parsedRecord(bytes) {
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { stop('ARCHIVE_JSON_INVALID'); }
  // Deliberately narrow export format: compact JSON.stringify bytes plus newline.
  // Duplicate keys, nonfinite JSON numbers, BOMs and ambiguous encodings cannot round-trip.
  if (!record(value) || !Buffer.from(JSON.stringify(value) + '\n').equals(bytes)) stop('ARCHIVE_ENCODING_UNSUPPORTED');
  return value;
}

function reference(value) {
  return exact(value, ['artifactId', 'recordId', 'sourceId', 'versionId', 'sha256', 'byteLength']) &&
    artifactId(value.artifactId) && token(value.recordId) && token(value.sourceId) && token(value.versionId) && digest(value.sha256) &&
    Number.isSafeInteger(value.byteLength) && value.byteLength > 0 && value.byteLength <= MAX_ARTIFACT_BYTES;
}

function checkedManifest(bytes, expectedPin) {
  if (!digest(expectedPin)) stop('MANIFEST_PIN_REQUIRED');
  const copy = copiedBytes(bytes, MAX_MANIFEST_BYTES);
  if (sha256(copy) !== expectedPin) stop('MANIFEST_PIN_MISMATCH');
  const manifest = parsedRecord(copy);
  if (!exact(manifest, ['schemaVersion', 'bundleId', 'calendar', 'features', 'outcomes']) ||
    manifest.schemaVersion !== 'forecast-evidence-manifest-v1' || !token(manifest.bundleId) ||
    !reference(manifest.calendar) || !reference(manifest.features) ||
    (manifest.outcomes !== null && !reference(manifest.outcomes))) stop('MANIFEST_METADATA_INVALID');
  const refs = [manifest.calendar, manifest.features, manifest.outcomes].filter(Boolean);
  if (new Set(refs.map(ref => ref.artifactId)).size !== refs.length || new Set(refs.map(ref => ref.sha256)).size !== refs.length ||
    new Set(refs.map(ref => ref.sourceId + '|' + ref.recordId + '|' + ref.versionId)).size !== refs.length) stop('MANIFEST_ARTIFACT_ALIAS');
  return { manifest, manifestBytes: copy.byteLength };
}

function calendarFromArchive(value, ref) {
  if (!exact(value, ['schemaVersion', 'recordId', 'sourceId', 'revisionId', 'publishedAt', 'venue', 'timeZone', 'coverageStart', 'coverageEnd', 'days']) ||
    value.schemaVersion !== 'forecast-calendar-archive-v1' || value.recordId !== ref.recordId ||
    value.sourceId !== ref.sourceId || value.revisionId !== ref.versionId) stop('CALENDAR_CONTENT_BINDING_MISMATCH');
  return { schemaVersion: 'forecast-session-calendar-v1', sourceId: value.sourceId, revisionId: value.revisionId,
    availableAt: value.publishedAt, venue: value.venue, timeZone: value.timeZone,
    coverageStart: value.coverageStart, coverageEnd: value.coverageEnd, days: value.days };
}

function historyFromArchive(value, ref) {
  if (!exact(value, ['schemaVersion', 'recordId', 'sourceId', 'vintageId', 'publishedAt', 'symbol', 'venue', 'currency', 'priceBasis', 'stale', 'coverageStart', 'coverageEnd', 'records']) ||
    value.schemaVersion !== 'forecast-price-archive-v1' || value.recordId !== ref.recordId || value.sourceId !== ref.sourceId ||
    value.vintageId !== ref.versionId || !Array.isArray(value.records) || value.records.length > 4000 ||
    value.records.some(row => !exact(row, ['recordId', 'sessionDate', 'rawClose', 'adjustedClose', 'publishedAt']))) stop('HISTORY_CONTENT_BINDING_MISMATCH');
  return { schemaVersion: 'forecast-history-v1', sourceId: value.sourceId, vintageId: value.vintageId,
    snapshotAvailableAt: value.publishedAt, symbol: value.symbol, venue: value.venue, currency: value.currency,
    priceBasis: value.priceBasis, stale: value.stale, coverageStart: value.coverageStart, coverageEnd: value.coverageEnd,
    points: value.records.map(row => ({ recordId: row.recordId, date: row.sessionDate, rawClose: row.rawClose,
      adjustedClose: row.adjustedClose, availableAt: row.publishedAt })) };
}

/**
 * Derive inputs from pinned retained export bytes, never parallel caller price/time claims.
 * `expectedManifestSha256` must come from a separately reviewed pin, not the bundle itself.
 * Matching bytes/identities is not publisher authentication or historical availability proof.
 * No path or read callback is accepted. Artifacts are an already-loaded Map of opaque IDs.
 */
export function evaluateArchivedForecastWindow(args) {
  const receipt = { manifestPinMatched: false, inspectedArtifactCount: 0, inspectedBytes: 0,
    allRequiredArtifactsMatched: false,
    artifactSha256: { calendar: null, features: null, outcomes: null },
    snapshotAvailableAt: { features: null, outcomes: null },
    bindings: { calendar: 'not-checked', features: 'not-checked', outcomes: 'not-checked' } };
  const result = (status, code, assessment = null) => ({ schemaVersion: FORECAST_ARCHIVE_SCHEMA,
    status, code, receipt, assessment, ...authority() });
  try {
    if (!exact(args, ['request', 'manifestBytes', 'expectedManifestSha256', 'artifacts'])) stop('ARCHIVE_INPUT_INVALID');
    const { request, manifestBytes, expectedManifestSha256, artifacts } = args;
    if (!exact(request, ['protocolVersion', 'symbol', 'venue', 'currency', 'horizonSessions', 'decisionAt', 'assessedAt']) ||
      request.protocolVersion !== FORECAST_EVALUATION_PROTOCOL) stop('ARCHIVE_REQUEST_INVALID');
    const { manifest, manifestBytes: size } = checkedManifest(manifestBytes, expectedManifestSha256);
    receipt.manifestPinMatched = true; receipt.inspectedBytes = size;
    if (!(artifacts instanceof Map) || artifacts.size > 3) stop('ARTIFACT_MAP_INVALID');
    const allowed = new Set([manifest.calendar.artifactId, manifest.features.artifactId, manifest.outcomes?.artifactId].filter(Boolean));
    for (const key of Map.prototype.keys.call(artifacts)) if (!allowed.has(key)) stop('ARTIFACT_NOT_LISTED');
    const load = role => {
      const ref = manifest[role];
      if (!ref) stop('OUTCOME_ARTIFACT_MISSING');
      const original = Map.prototype.get.call(artifacts, ref.artifactId);
      if (original === undefined) stop('ARTIFACT_BYTES_MISSING');
      const bytes = copiedBytes(original, MAX_ARTIFACT_BYTES);
      receipt.inspectedArtifactCount += 1; receipt.inspectedBytes += bytes.byteLength;
      if (bytes.byteLength !== ref.byteLength || sha256(bytes) !== ref.sha256) stop('ARTIFACT_PIN_MISMATCH');
      receipt.artifactSha256[role] = ref.sha256;
      const value = parsedRecord(bytes);
      const normalized = role === 'calendar' ? calendarFromArchive(value, ref) : historyFromArchive(value, ref);
      receipt.bindings[role] = 'matched';
      if (role !== 'calendar' && forecastInstantMicros(normalized.snapshotAvailableAt) !== null) {
        receipt.snapshotAvailableAt[role] = normalized.snapshotAvailableAt;
      }
      return normalized;
    };
    const input = { ...request, calendar: load('calendar') };
    const planned = planForecastSessions(input);
    if (planned.status !== 'planned') return result(planned.status, planned.code, planned);
    input.featureHistory = load('features');
    if (forecastInstantMicros(request.assessedAt) < forecastInstantMicros(planned.plan.targetCloseAt)) {
      receipt.bindings.outcomes = 'not-required-yet';
    } else input.outcomeHistory = load('outcomes');
    receipt.allRequiredArtifactsMatched = true;
    const assessment = evaluateForecastWindow(input);
    return result(assessment.status, assessment.code, assessment);
  } catch (error) {
    return result('needs-data', error instanceof ArchiveError ? error.message : 'ARCHIVE_INPUT_INVALID');
  }
}
