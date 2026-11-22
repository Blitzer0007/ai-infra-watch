/** Explicit projections only: never serialize a provider or account packet directly. */
import { summarizeEvidenceChannels } from './evidenceChannelHealth';
import { ledgerIssueLabels, ledgerDetailLabels } from '../../shared/loadedLedgerReview.js';

const record = (v: unknown): Record<string, any> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {};
const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 1_000_000 ? v : null;
const flag = (v: unknown) => typeof v === 'boolean' ? v : null;
const choice = (v: unknown, allowed: readonly string[]) => typeof v === 'string' && allowed.includes(v) ? v : 'unknown';
const providers = ['yahoo', 'finnhub', 'alpha-vantage'];
const errors = ['rate_limited', 'not_configured', 'timeout', 'no_data', 'provider_server_error', 'provider_http_error', 'provider_error'];
const nowTime = (nowMs: number) => Number.isSafeInteger(nowMs) && nowMs >= 0 && nowMs <= 253402300799999 ? nowMs : null;
function instant(v: unknown, nowMs: number | null) {
  if (nowMs === null || typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)) return null;
  const ms = Date.parse(v);
  const localDay = Date.parse(v.slice(0, 10) + 'T00:00:00Z');
  return Number.isFinite(localDay) && new Date(localDay).toISOString().slice(0, 10) === v.slice(0, 10) &&
    Number.isFinite(ms) && ms >= 0 && ms <= nowMs ? new Date(ms).toISOString() : null;
}
function header(kind: string, nowMs: number) {
  const clock = nowTime(nowMs);
  return {
    contractVersion: 'health-diagnostic-snapshot-v1', kind,
    preparedAt: clock === null ? null : new Date(clock).toISOString(),
    scope: 'Already loaded observations only; preparing or copying makes no network request.',
    privacy: 'Symbols, record IDs, account values, quantities, raw messages and credentials are omitted.',
    grantsDecisionEligibility: false,
  };
}
function providerDiagnostic(value: unknown) {
  const p = record(value);
  return {
    available: flag(p.available), provider: choice(p.provider, providers),
    providerStatus: choice(p.providerStatus, ['PRIMARY', 'FALLBACK', 'CACHED', 'STALE']),
    errorCode: choice(p.errorCode, errors), cached: flag(p.cached), stale: flag(p.stale), fallbackUsed: flag(p.fallbackUsed),
    attempts: (Array.isArray(p.providerAttempts) ? p.providerAttempts.slice(0, 3) : []).map((v: unknown) => {
      const a = record(v);
      return { provider: choice(a.provider, providers), status: choice(a.status, ['ok', 'failed']), errorCode: choice(a.errorCode, errors) };
    }),
  };
}

export function buildSourceDiagnosticSnapshot(input: {
  channels?: unknown; market?: unknown; loading?: boolean; failed?: boolean;
  channelsLoading?: boolean; channelsFailed?: boolean;
}, nowMs = Date.now()) {
  const clock = nowTime(nowMs);
  const market = record(input.market);
  const usable = !input.loading && !input.failed && market.ok === true && Array.isArray(market.rows);
  const rows = usable ? market.rows.slice(0, 4) : [];
  const channelInput = record(input.channels);
  const known = ['market', 'contracts', 'news', 'political', 'congress', 'macro'];
  const channels = summarizeEvidenceChannels(Object.fromEntries(known.filter(key => Object.hasOwn(channelInput, key)).map(key => [key, channelInput[key]])),
    { nowMs: clock ?? NaN, loading: input.channelsLoading, error: input.channelsFailed });
  return {
    ...header('source-observations', nowMs),
    sourcePath: 'Internal provider-router sample; this does not test the public Yahoo quote endpoint.',
    sampleScope: 'SPY and up to three holdings; not full portfolio coverage.',
    state: input.loading ? 'loading' : input.failed ? 'unavailable' : rows.length ? 'observed-only' : 'unknown',
    observedAt: usable ? instant(market.retrievedAt, clock) : null,
    summaryCached: usable ? flag(market.cached) : null,
    truncated: usable && market.rows.length > 4,
    channels: { state: channels.state, additionalChannelsOmitted: Object.keys(channelInput).some(key => !known.includes(key)),
      observations: channels.channels.map(c => ({ channel: c.key, state: c.state })) },
    rows: rows.map((v: unknown, index: number) => {
      const r = record(v), q = record(r.quote), h = record(r.history), admission = record(q.valuationAdmission), metadata = record(q.metadataCoverage);
      return {
        sampleRow: index + 1,
        quote: { ...providerDiagnostic(q),
          reportedEligible: flag(admission.eligible),
          reportedStatus: choice(admission.status, ['valid', 'delayed', 'last_close', 'stale', 'missing', 'conflicting', 'invalid', 'simulated']),
          observedAt: instant(q.asOf, clock), reportedAgeSeconds: count(q.ageSeconds),
          metadata: { dailyMove: flag(metadata.dailyMove), currency: flag(metadata.currency), marketTime: flag(metadata.marketTime), session: flag(metadata.session) },
        },
        history: { ...providerDiagnostic(h), reportedAgeDays: count(h.ageDays), pointCount: count(h.pointCount),
          adjustedPointCount: count(h.adjustedPointCount), adjustedCloseAvailable: flag(h.adjustedCloseAvailable) },
      };
    }),
    limitations: 'Reported ages and admission states belong to the loaded sample. Copying does not refresh them or verify source accuracy, public quotes or accounting.',
  };
}

export function buildAccountingDiagnosticSnapshot(value: unknown, nowMs = Date.now()) {
  const packet = record(value), portfolio = record(packet.portfolio), coverage = record(portfolio.quoteCoverage);
  const usable = packet.ok === true && Object.keys(portfolio).length > 0;
  const issues = usable && Array.isArray(portfolio.accountingIssues) ? portfolio.accountingIssues : null;
  const knownCodes = [...Object.keys(ledgerIssueLabels), 'INVALID_PACKET', 'QUOTE_WITHHELD'];
  const issueCounts: Record<string, number> = {};
  const fieldIssueCounts: Record<string, number> = {};
  for (const entry of issues?.slice(0, 250) ?? []) {
    const code = choice(record(entry).code, knownCodes);
    issueCounts[code] = (issueCounts[code] ?? 0) + 1;
    const detail = choice(record(entry).detailCode, Object.keys(ledgerDetailLabels));
    if (detail !== 'unknown') fieldIssueCounts[detail] = (fieldIssueCounts[detail] ?? 0) + 1;
  }
  return {
    ...header('accounting-observations', nowMs),
    state: usable ? 'observed-only' : 'unknown', observedAt: usable ? instant(packet.checkedAt, nowTime(nowMs)) : null,
    accountingStatus: usable ? choice(portfolio.accountingStatus, ['ledger-inputs-unverified', 'quotes-incomplete', 'conditional-loaded-records']) : 'unknown',
    reportedAccountingReconciled: usable ? flag(portfolio.accountingReconciled) : null,
    historyCoverage: usable ? choice(portfolio.historyCoverage, ['unverified']) : 'unknown',
    corporateActionCoverage: usable ? choice(portfolio.corporateActionCoverage, ['unverified']) : 'unknown',
    quoteCoverageStatus: usable ? choice(coverage.status, ['unavailable', 'invalid', 'partial', 'empty', 'last-close', 'complete']) : 'unknown',
    issues: issues === null ? null : issueCounts, issuesTruncated: issues !== null && issues.length > 250,
    fieldIssues: issues === null ? null : fieldIssueCounts,
    issueCountBasis: 'Returned issue entries only; not unique records or complete ledger coverage.',
    nextStep: 'Review original broker records for reported issue codes. Matched loaded records do not establish full-history, cash-flow, currency or corporate-action coverage.',
  };
}
