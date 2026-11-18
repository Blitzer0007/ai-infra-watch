/** Read-only, display-only fleet review for already loaded scheduler metadata.
 * Missing observation is UNKNOWN, never a successful execution.
 * No schedule is enabled, dispatched or polled by this utility.
 */
export function summarizeSchedulerFleet(jobs, { loading = false, error = '' } = {}) {
  const rows = Array.isArray(jobs) ? jobs.filter(row => row && typeof row === 'object' && !Array.isArray(row)) : [];
  const counts = { healthy: 0, attention: 0, incomplete: 0, unknown: 0 };
  if (loading && rows.length === 0 && !error) return { state: 'loading', ...counts, total: 0, observed: false };
  if (error || rows.length === 0) return { state: 'unknown', ...counts, total: 0, observed: false };
  for (const row of rows) {
    const status = String(row.status || '').toLowerCase();
    const conclusion = String(row.conclusion || '').toLowerCase();
    const failure = ['failure', 'failed', 'cancelled', 'timed_out'].includes(status) ||
      ['failure', 'failed', 'cancelled', 'timed_out'].includes(conclusion) ||
      positive(row.recentFailureCount) || positive(row.stuckRunCount) || row.isStuck === true;
    const incomplete = status === 'disabled' || status === 'skipped' ||
      conclusion === 'skipped' || positive(row.recentSkippedCount);
    const observedSuccess = conclusion === 'success' &&
      validObservedTimestamp(row.lastSuccessAt) &&
      !['missing', 'disabled', 'unavailable', 'no_runs', 'stale'].includes(status);
    const key = failure ? 'attention' : incomplete ? 'incomplete' : observedSuccess ? 'healthy' : 'unknown';
    counts[key]++;
  }
  const state = counts.attention > 0 ? 'attention' : counts.incomplete > 0 || counts.unknown > 0 ? 'incomplete' : 'healthy';
  return { state, ...counts, total: rows.length, observed: true };
}

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const validObservedTimestamp = value => {
  if (typeof value !== 'string' || !/T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return false;
  return Number.isFinite(Date.parse(value));
};
