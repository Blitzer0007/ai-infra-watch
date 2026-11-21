/** Collection diagnostics only; these states never grant quote or accounting eligibility. */
export type EvidenceChannelState = 'healthy' | 'aging' | 'stale' | 'missing' | 'conflict' |
  'failed' | 'fallback' | 'pending' | 'not-applicable' | 'unknown';

const guidance: Record<EvidenceChannelState, {label: string; nextStep: string}> = {
  healthy: {label: 'Healthy', nextStep: 'Inspect source records before using this evidence in a decision.'},
  aging: {label: 'Aging', nextStep: 'Refresh evidence and check the observation time before relying on it.'},
  stale: {label: 'Needs refresh', nextStep: 'Refresh evidence; verify the provider if the same stale result persists.'},
  missing: {label: 'Missing', nextStep: 'Check source coverage. No returned evidence does not establish that no events occurred.'},
  conflict: {label: 'Conflict', nextStep: 'Compare the original source records and resolve the conflicting claims.'},
  failed: {label: 'Provider issue', nextStep: 'Check the existing source configuration and provider availability, then retry the refresh.'},
  fallback: {label: 'Fallback', nextStep: 'Inspect the substitute source and its time; primary-source recovery is not confirmed.'},
  pending: {label: 'Pending', nextStep: 'Wait for the current collection request to finish before assessing this channel.'},
  'not-applicable': {label: 'Not applicable', nextStep: 'This channel is excluded from applicable coverage; no recovery is required.'},
  unknown: {label: 'Unknown', nextStep: 'Verify the source status, retrieval timestamp and declared refresh cadence.'},
};

export type EvidenceChannelHealth = {
  state: EvidenceChannelState; label: string; reason: string; nextStep: string;
  retrievedAgeSeconds: number | null;
};

const record = (value: unknown): Record<string, any> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;

export function reviewEvidenceChannel(value: unknown, nowMs = Date.now()): EvidenceChannelHealth {
  const item = record(value);
  const finish = (state: EvidenceChannelState, reason: string, retrievedAgeSeconds: number | null = null) =>
    ({state, reason, retrievedAgeSeconds, ...guidance[state]});
  if (!item) return finish('unknown', 'Channel metadata was not supplied in a supported format.');
  const status = typeof item.status === 'string' ? item.status.toUpperCase() : '';
  const feed = record(item.feedHealth);
  const freshness = record(item.freshness);
  if (status === 'CONFLICT' || item.conflictStatus === 'CONFLICT')
    return finish('conflict', 'The response declares conflicting evidence.');
  if (['FAILED', 'ERROR', 'UNAVAILABLE'].includes(status) ||
      ['FAILED', 'ERROR', 'UNAVAILABLE'].includes(feed?.status) ||
      item.upstreamError || item.lastRefreshError || ['FAILED', 'ERROR'].includes(item.lastRefreshStatus))
    return finish('failed', 'The latest declared source or refresh attempt failed. Previously returned items may still exist.');
  if (status === 'NOT_APPLICABLE') return finish('not-applicable', 'The response declares this channel inapplicable.');
  if (status === 'PENDING') return finish('pending', 'A completed source result has not been declared.');
  if (['NOT_FOUND', 'MISSING'].includes(status)) return finish('missing', 'No usable evidence was returned for this channel.');
  if (!['AVAILABLE', 'STALE', 'AGING', 'FALLBACK'].includes(status))
    return finish('unknown', 'The response does not declare a recognized availability state.');
  if (item.stale === true || status === 'STALE' || ['STALE', 'VERY_STALE'].includes(freshness?.status))
    return finish('stale', 'The source explicitly marks its evidence as stale.');
  if (item.fallback === true || status === 'FALLBACK' || feed?.status === 'FALLBACK')
    return finish('fallback', 'The response declares substitute-source evidence.');
  if ((item.feedHealth != null && (!feed || feed.status !== 'OK')) ||
      (item.freshness != null && !freshness) ||
      (item.stale != null && typeof item.stale !== 'boolean') ||
      (item.fallback != null && typeof item.fallback !== 'boolean'))
    return finish('unknown', 'Declared source-health metadata is incomplete or unrecognized.');

  const retrievedMs = typeof item.retrievedAt === 'string' &&
    /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(item.retrievedAt) ? Date.parse(item.retrievedAt) : NaN;
  if (!Number.isFinite(nowMs) || !Number.isFinite(retrievedMs))
    return finish('unknown', 'A valid retrieval timestamp with a timezone is missing.');
  if (retrievedMs > nowMs + 120_000)
    return finish('unknown', 'The retrieval timestamp is more than two minutes in the future.');
  const ageSeconds = Math.max(0, (nowMs - retrievedMs) / 1000);
  const cadence = item.refreshIntervalSeconds;
  if (typeof cadence !== 'number' || !Number.isFinite(cadence) || cadence <= 0)
    return finish('unknown', 'A positive numeric refresh cadence is missing.', ageSeconds);
  if (ageSeconds > cadence * 5)
    return finish('stale', 'The retrieval is older than five declared refresh intervals.', ageSeconds);
  if (ageSeconds > cadence * 2 || status === 'AGING' || freshness?.status === 'AGING')
    return finish('aging', 'The evidence or its retrieval is aging.', ageSeconds);
  if (freshness && (freshness.status !== 'FRESH' ||
      typeof freshness.ageMinutes !== 'number' || !Number.isFinite(freshness.ageMinutes) || freshness.ageMinutes < 0))
    return finish('unknown', 'Source freshness metadata is unknown or incomplete.', ageSeconds);
  return finish('healthy', 'Declared collection status and retrieval cadence are current. Source accuracy is not certified.', ageSeconds);
}

export function summarizeEvidenceChannels(value: unknown, {nowMs = Date.now(), loading = false, error = false} = {}) {
  const entries = Object.entries(record(value) ?? {});
  const channels = entries.map(([key, item]) => ({key, ...(error
    ? {state: 'unknown' as const, ...guidance.unknown, reason: 'The latest feed request failed; previous channel observations are unconfirmed.', retrievedAgeSeconds: null}
    : reviewEvidenceChannel(item, nowMs))}));
  const count = (states: EvidenceChannelState[]) => channels.filter(channel => states.includes(channel.state)).length;
  const healthy = count(['healthy']);
  const attention = count(['aging', 'stale', 'conflict', 'failed', 'fallback']);
  const missing = count(['missing']);
  const unknown = count(['unknown', 'pending']);
  const notApplicable = count(['not-applicable']);
  const total = channels.length;
  return {
    channels, healthy, attention, missing, unknown, notApplicable, total,
    observed: total > 0 && !error,
    state: loading ? 'loading' : error || !total ? 'unknown' : attention || missing ? 'attention' :
      unknown ? 'partial' : healthy ? 'healthy' : 'not-applicable',
  };
}
