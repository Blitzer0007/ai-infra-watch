import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceDiagnosticSnapshot as source, buildAccountingDiagnosticSnapshot as accounting } from './healthDiagnosticSnapshot';

const now = Date.parse('2026-11-22T10:00:00Z');
const observedAt = '2026-11-22T09:59:00Z';
const row = {
  symbol: 'PRIVATEHOLDING', price: 12345.67, quantity: 9876, account: 'private-account',
  quote: { available: true, provider: 'yahoo', price: 12345.67, asOf: observedAt, ageSeconds: 60,
    valuationAdmission: {eligible: false, status: 'missing', reasons: ['private-token']},
    metadataCoverage: {currency: true, dailyMove: false, session: true, marketTime: true},
    providerAttempts: [{provider: 'yahoo', status: 'failed', errorCode: 'rate_limited', error: 'private-token'}] },
  history: {available: true, provider: 'yahoo', adjustedCloseAvailable: false, pointCount: 20, adjustedPointCount: 0, ageDays: 1},
};

describe('redacted loaded-data diagnostic snapshots', () => {
  it('retains actionable provider/metadata states without raw financial or error data', () => {
    const input = {market: {ok: true, retrievedAt: observedAt, rows: [row]},
      channels: {market: {status: 'FAILED', upstreamError: 'private-token'}, PRIVATEHOLDING: {status: 'AVAILABLE'}}};
    const before = JSON.stringify(input), result = source(input, now);
    assert.equal(result.rows[0].quote.attempts[0].errorCode, 'rate_limited');
    assert.equal(result.rows[0].quote.metadata.dailyMove, false);
    assert.equal(result.rows[0].quote.reportedEligible, false);
    assert.equal(result.observedAt, new Date(observedAt).toISOString());
    assert.equal(result.rows[0].history.adjustedCloseAvailable, false);
    assert.equal(result.channels.observations[0].state, 'failed');
    assert.match(result.sourcePath, /does not test the public Yahoo/);
    assert.equal(result.grantsDecisionEligibility, false);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATEHOLDING|private-token|private-account|12345|9876/);
    assert.equal(JSON.stringify(input), before);
  });
  it('treats failed, pending, empty and malformed samples as unobserved', () => {
    for (const market of [null, [], {}, {ok: false, rows: [row]}, {ok: true, rows: null}, {ok: true, rows: []}]) {
      const result = source({market}, now);
      assert.equal(result.state, 'unknown');
      assert.deepEqual(result.rows, []);
    }
    for (const options of [{failed: true}, {loading: true}]) {
      const result = source({market: {ok: true, rows: [row]}, ...options}, now);
      assert.deepEqual(result.rows, []);
      assert.equal(result.observedAt, null);
    }
  });
  it('bounds rows and attempts and maps arbitrary vocabulary to unknown', () => {
    const input = {quote: {provider: 'private-token', providerStatus: 'private-token', errorCode: 'private-token',
      providerAttempts: Array(9).fill({provider: 'private-token', status: 'private-token', errorCode: 'private-token'}),
      ageSeconds: '60', available: 'true', valuationAdmission: {status: 'private-token', eligible: 'true'}}, history: null};
    const result = source({market: {ok: true, rows: Array(200).fill(input)}}, now);
    assert.equal(result.rows.length, 4);
    assert.equal(result.truncated, true);
    assert.equal(result.rows[0].quote.attempts.length, 3);
    assert.equal(result.rows[0].quote.provider, 'unknown');
    assert.equal(result.rows[0].quote.available, null);
    assert.equal(result.rows[0].quote.reportedEligible, null);
    assert.equal(result.rows[0].quote.reportedAgeSeconds, null);
    assert.doesNotMatch(JSON.stringify(result), /private-token/);
  });
  it('does not replace original observation times/ages with the copy time', () => {
    const first = source({market: {ok: true, retrievedAt: observedAt, rows: [row]}}, now);
    const later = source({market: {ok: true, retrievedAt: observedAt, rows: [row]}}, now + 3600000);
    assert.notEqual(later.preparedAt, first.preparedAt);
    assert.equal(later.observedAt, first.observedAt);
    assert.equal(later.rows[0].quote.reportedAgeSeconds, 60);
    assert.match(later.limitations, /does not refresh/);
    assert.equal(source({market: {ok: true, retrievedAt: '2999-01-01T00:00:00Z', rows: []}}, now).observedAt, null);
    assert.equal(source({market: {ok: true, retrievedAt: '2026-02-30T00:00:00Z', rows: []}}, now).observedAt, null);
    assert.equal(source({}, NaN).preparedAt, null);
    assert.equal(source({market: {ok: true, rows: [null, []]}}, now).rows[0].quote.available, null);
  });
  it('exports canonical ledger issue counts, not symbols, record IDs, messages or P&L', () => {
    const result = accounting({ok: true, checkedAt: observedAt, portfolio: {
      accountingStatus: 'ledger-inputs-unverified', accountingReconciled: false,
      historyCoverage: 'unverified', corporateActionCoverage: 'unverified', currentValue: 12345.67,
      quoteCoverage: {status: 'partial', liveQuotes: 9, missingQuotes: 1},
      accountingIssues: [{code: 'FEE_UNKNOWN', symbol: 'PRIVATEHOLDING', recordId: 'private-account', message: 'private-token'},
        {code: 'FEE_UNKNOWN'}, {code: 'QUOTE_WITHHELD'}, {code: 'private-token'}],
    }}, now);
    assert.deepEqual(result.issues, {FEE_UNKNOWN: 2, QUOTE_WITHHELD: 1, unknown: 1});
    assert.equal(result.reportedAccountingReconciled, false);
    assert.equal(result.historyCoverage, 'unverified');
    assert.equal(result.quoteCoverageStatus, 'partial');
    assert.doesNotMatch(JSON.stringify(result), /PRIVATEHOLDING|private-token|private-account|12345|liveQuotes|missingQuotes/);
  });
  it('does not turn absent issues or failed packets into a clean ledger', () => {
    for (const value of [null, [], {}, {ok: false, portfolio: {}}, {ok: true, portfolio: {accountingIssues: null}}]) {
      const result = accounting(value, now);
      assert.equal(result.issues, null);
      assert.equal(result.reportedAccountingReconciled, null);
      assert.equal(result.grantsDecisionEligibility, false);
    }
    const result = accounting({ok: true, portfolio: {accountingIssues: [], accountingStatus: 'conditional-loaded-records', accountingReconciled: false}}, now);
    assert.deepEqual(result.issues, {});
    assert.equal(result.reportedAccountingReconciled, false);
    assert.match(result.nextStep, /do not establish full-history/);
  });
  it('bounds ledger issue projection and never echoes unknown coverage claims', () => {
    const result = accounting({ok: true, portfolio: {accountingIssues: Array(300).fill({code: 'QUANTITY_MISMATCH'}),
      historyCoverage: 'private-token', corporateActionCoverage: 'verified', accountingStatus: 'private-token'}}, now);
    assert.deepEqual(result.issues, {QUANTITY_MISMATCH: 250});
    assert.equal(result.issuesTruncated, true);
    assert.equal(result.historyCoverage, 'unknown');
    assert.equal(result.corporateActionCoverage, 'unknown');
    assert.equal(result.accountingStatus, 'unknown');
  });
});
