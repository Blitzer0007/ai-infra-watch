/** Metadata-only provenance review. Recorded archive statuses and SHA-256 values
 * are not independently verified publication receipts. Never lift this gate.
 * Does not return stored object paths, full hashes, symbols or private rows.
 */
export function summarizeHistoricalProvenance(archiveInput, evaluationInput, evaluationStatus = 'unavailable') {
  const archive = archiveInput && typeof archiveInput === 'object' && !Array.isArray(archiveInput) ? archiveInput : null;
  const artifacts = Array.isArray(archive?.recentArtifacts) ? archive.recentArtifacts.slice(0, 20) : [];
  const validTime = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  const dateOnly = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value+'T00:00:00.000Z')) &&
    new Date(value+'T00:00:00.000Z').toISOString().slice(0,10) === value;
  let recordedHash = 0, captureTimeKnown = 0, claimedSourceDateKnown = 0, sourceAfterCapture = 0;
  for(const item of artifacts) {
    if(!item || typeof item !== 'object' || Array.isArray(item)) continue;
    if(typeof item.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(item.sha256)) recordedHash++;
    const capture = validTime(item.retrievedAt) ? Date.parse(item.retrievedAt) : null;
    const source = validTime(item.sourceAsOf) ? Date.parse(item.sourceAsOf) :
      dateOnly(item.sourceAsOf) ? Date.parse(item.sourceAsOf+'T00:00:00.000Z') : null;
    if(capture !== null) captureTimeKnown++;
    if(source !== null) claimedSourceDateKnown++;
    if(capture !== null && source !== null && source > capture) sourceAfterCapture++;
  }
  const index = archive?.inventoryWindow && typeof archive.inventoryWindow === 'object' ? archive.inventoryWindow : null;
  const returnedRows = Number.isSafeInteger(index?.returnedRows) && index.returnedRows >= 0 ? index.returnedRows : null;
  const record = evaluationInput && typeof evaluationInput === 'object' && !Array.isArray(evaluationInput) ? evaluationInput : null;
  const validEvaluation = evaluationStatus === 'ready' && record?.version === 'forecast-evaluation-v1' &&
    record?.coverage && typeof record.coverage === 'object';
  return {
    version: 'historical-provenance-review-v1',
    state: !archive ? 'unavailable' : sourceAfterCapture ? 'conflicting-metadata' : 'metadata-only',
    indexedWindowRows: returnedRows,
    windowCapped: index?.capped === true,
    sampledArtifacts: artifacts.length,
    recordedHash,
    captureTimeKnown,
    claimedSourceDateKnown,
    sourceAfterCapture,
    forecastWindowObserved: Boolean(validEvaluation),
    independentPublisherReceipt: false,
    sourceAtDecisionVerified: false,
    adjustedOutcomeVerified: false,
    universeAtDecisionVerified: false,
    prospectiveHoldoutVerified: false,
    usableForHistoricalAccuracy: false,
    note: 'Recorded hashes, retrieval timestamps, source-as-of labels, and stored verification statuses do not authenticate original publication, event-time membership, adjustment or independent holdout. Metadata-only and partial windows remain blocked.',
  };
}
