import { test } from 'node:test';
import assert from 'node:assert/strict';
import { telegramAccepted } from './reentry-alerts.js';

test('Telegram delivery counts only a successful API response with a message id', () => {
  assert.equal(telegramAccepted(true, { ok: true, result: { message_id: 42 } }), true);
});

test('Telegram HTTP 200 with API ok=false is not accepted', () => {
  assert.equal(telegramAccepted(true, { ok: false, description: 'chat not found' }), false);
});

test('Telegram success without a message id is not accepted as delivery evidence', () => {
  assert.equal(telegramAccepted(true, { ok: true, result: {} }), false);
});

test('HTTP failure is never accepted even if the body claims success', () => {
  assert.equal(telegramAccepted(false, { ok: true, result: { message_id: 42 } }), false);
});

test('re-entry notification fires only when entering the candidate state', async () => {
  const { shouldNotifyCandidate } = await import('./reentry-alerts.js');
  assert.equal(shouldNotifyCandidate('NOT_CANDIDATE', true), true);
  assert.equal(shouldNotifyCandidate(null, true), true);
  assert.equal(shouldNotifyCandidate('REENTRY_CANDIDATE', true), false);
  assert.equal(shouldNotifyCandidate('REENTRY_CANDIDATE', false), false);
  assert.equal(shouldNotifyCandidate('NOT_CANDIDATE', false), false);
});

test('a failed delivery leaves the previous non-candidate signature eligible for retry', async () => {
  const { shouldNotifyCandidate } = await import('./reentry-alerts.js');
  // State is only patched after sendTelegram succeeds in runScan; a failed send therefore retries next scan.
  const persistedSignature = 'NOT_CANDIDATE';
  assert.equal(shouldNotifyCandidate(persistedSignature, true), true);
  assert.equal(shouldNotifyCandidate(persistedSignature, true), true);
});


import { classifyScan } from './reentry-alerts.js';

test('empty watchlist is not reported as a successful no-candidate evaluation', () => {
  assert.equal(classifyScan({ activeRows: 0, evaluatedRows: 0, qualifyingCandidates: 0, notifyEligibleCandidates: 0, telegramSent: 0, errors: 0 }), 'empty_watchlist');
});

test('evaluated watchlist with no qualifying candidate is reported distinctly', () => {
  assert.equal(classifyScan({ activeRows: 4, evaluatedRows: 4, qualifyingCandidates: 0, notifyEligibleCandidates: 0, telegramSent: 0, errors: 0 }), 'evaluated_no_qualifying_candidate');
});

test('candidate with accepted Telegram message is explicitly identified', () => {
  assert.equal(classifyScan({ activeRows: 2, evaluatedRows: 2, qualifyingCandidates: 1, notifyEligibleCandidates: 1, telegramSent: 1, errors: 0 }), 'telegram_delivery_confirmed');
});

test('candidate without accepted Telegram message is not reported as delivered', () => {
  assert.equal(classifyScan({ activeRows: 2, evaluatedRows: 2, qualifyingCandidates: 1, notifyEligibleCandidates: 1, telegramSent: 0, errors: 0 }), 'candidate_not_delivered');
});

test('an already-active candidate without a new transition is not falsely called undelivered', () => {
  assert.equal(classifyScan({ activeRows: 1, evaluatedRows: 1, qualifyingCandidates: 1, notifyEligibleCandidates: 0, telegramSent: 0, errors: 0 }), 'evaluated_existing_candidate_no_new_alert');
});

test('partial/error scan is not reported as a completed clean evaluation', () => {
  assert.equal(classifyScan({ activeRows: 2, evaluatedRows: 2, qualifyingCandidates: 0, notifyEligibleCandidates: 0, telegramSent: 0, errors: 1 }), 'completed_with_errors');
});


test('partial evaluation without explicit errors is reported as incomplete', () => {
  assert.equal(classifyScan({ activeRows: 3, evaluatedRows: 2, qualifyingCandidates: 0, notifyEligibleCandidates: 0, telegramSent: 0, errors: 0 }), 'incomplete_scan');
});


import { buildDeliveryKey } from './reentry-alerts.js';

test('durable delivery key is stable for the same configured thesis and target', () => {
  const row = { symbol: 'nvda', target_price: 120, sale_date: '2026-01-10', thesis: 'AI infra growth', updated_at: '2026-10-15T05:00:00Z' };
  assert.equal(buildDeliveryKey(row), buildDeliveryKey({ ...row, symbol: 'NVDA' }));
});

test('changing target or thesis creates a distinct delivery episode key', () => {
  const row = { symbol: 'NVDA', target_price: 120, sale_date: '2026-01-10', thesis: 'AI infra growth', updated_at: '2026-10-15T05:00:00Z' };
  assert.notEqual(buildDeliveryKey(row), buildDeliveryKey({ ...row, target_price: 110 }));
  assert.notEqual(buildDeliveryKey(row), buildDeliveryKey({ ...row, thesis: 'Changed thesis' }));
});

test('durable delivery key does not contain raw thesis text', () => {
  const key = buildDeliveryKey({ symbol: 'NVDA', target_price: 120, thesis: 'private thesis text' });
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key.includes('private thesis text'), false);
});


import { sendOnceWithDurableClaim } from './reentry-alerts.js';

test('failure injection: accepted Telegram message ID survives delivery-state persistence failure', async () => {
  let claimed = false;
  let sendCount = 0;
  const failureRecords = [];
  const result = await sendOnceWithDurableClaim({
    claim: async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    },
    send: async () => { sendCount += 1; return 9876; },
    recordAccepted: async () => { throw new Error('simulated database timeout after Telegram acceptance'); },
    recordFailure: async (status, messageId, error) => {
      failureRecords.push({ status, messageId, error });
      return true;
    },
  });

  assert.equal(result.status, 'accepted_state_persistence_failed');
  assert.equal(result.messageId, 9876);
  assert.equal(result.deliveryRecordPersisted, true);
  assert.equal(result.reconciliationRequired, true);
  assert.deepEqual(failureRecords, [{
    status: 'uncertain',
    messageId: 9876,
    error: 'simulated database timeout after Telegram acceptance',
  }]);

  const retry = await sendOnceWithDurableClaim({
    claim: async () => false,
    send: async () => { sendCount += 1; return 1111; },
    recordAccepted: async () => {},
    recordFailure: async () => {},
  });
  assert.equal(retry.status, 'existing_claim_suppressed');
  assert.equal(retry.attempted, false);
  assert.equal(sendCount, 1, 'no duplicate automatic Telegram send after ambiguous persistence');
});

test('failure injection: ambiguous Telegram timeout records uncertain and suppresses retry', async () => {
  let failureRecord = null;
  const result = await sendOnceWithDurableClaim({
    claim: async () => true,
    send: async () => { throw new Error('simulated timeout with unknown Telegram outcome'); },
    recordAccepted: async () => {},
    recordFailure: async (status, messageId, error) => { failureRecord = { status, messageId, error }; return true; },
  });
  assert.equal(result.status, 'uncertain');
  assert.equal(result.messageId, null);
  assert.equal(result.reconciliationRequired, true);
  assert.deepEqual(failureRecord, {
    status: 'uncertain',
    messageId: null,
    error: 'simulated timeout with unknown Telegram outcome',
  });
});

test('Telegram rejection is recorded as rejected, not successful delivery', async () => {
  let failureRecord = null;
  const error = new Error('Telegram rejected request');
  error.deliveryStatus = 'rejected';
  const result = await sendOnceWithDurableClaim({
    claim: async () => true,
    send: async () => { throw error; },
    recordAccepted: async () => {},
    recordFailure: async (status, messageId, message) => { failureRecord = { status, messageId, message }; return true; },
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.messageId, null);
  assert.equal(failureRecord.status, 'rejected');
});

test('accepted Telegram delivery is confirmed only after delivery record persistence', async () => {
  const result = await sendOnceWithDurableClaim({
    claim: async () => true,
    send: async () => 42,
    recordAccepted: async (messageId) => { assert.equal(messageId, 42); return true; },
    recordFailure: async () => assert.fail('failure finalizer should not be called'),
  });
  assert.equal(result.status, 'accepted');
  assert.equal(result.messageId, 42);
  assert.equal(result.deliveryRecordPersisted, true);
});


test('failure injection: durable finalization outage still retains accepted ID and suppresses a second send', async () => {
  let claimed = false;
  let sendCount = 0;
  const attempt = () => sendOnceWithDurableClaim({
    claim: async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    },
    send: async () => { sendCount += 1; return 7654; },
    recordAccepted: async () => { throw new Error('simulated accepted-state DB outage'); },
    recordFailure: async () => { throw new Error('simulated uncertainty-state DB outage'); },
  });

  const first = await attempt();
  assert.equal(first.status, 'accepted_state_persistence_failed');
  assert.equal(first.messageId, 7654);
  assert.equal(first.deliveryRecordPersisted, false);
  assert.equal(first.reconciliationRequired, true);

  const second = await attempt();
  assert.equal(second.status, 'existing_claim_suppressed');
  assert.equal(sendCount, 1);
});


test('a later candidate episode gets a new key while retry within the same episode stays stable', async () => {
  const base = {
    symbol: 'NVDA',
    target_price: 120,
    sale_date: '2026-01-10',
    thesis: 'AI infra growth',
    updated_at: '2026-10-15T05:00:00Z',
  };
  assert.equal(buildDeliveryKey(base), buildDeliveryKey({ ...base }));
  assert.notEqual(
    buildDeliveryKey(base),
    buildDeliveryKey({ ...base, updated_at: '2026-10-15T14:15:00Z' }),
    'a persisted state transition should create a new notification episode key',
  );
});


test('SEC 13F parser sums META positions by CUSIP and converts reported value from thousands to dollars', async () => {
  const { parseMeta13fPosition } = await import('./reentry-alerts.js');
  const xml = `<informationTable>
    <infoTable><nameOfIssuer>META PLATFORMS INC</nameOfIssuer><cusip>30303M102</cusip><value>125000</value><shrsOrPrnAmt><sshPrnamt>100000</sshPrnamt></shrsOrPrnAmt></infoTable>
    <infoTable><nameOfIssuer>META PLATFORMS INC</nameOfIssuer><cusip>30303M102</cusip><value>25000</value><shrsOrPrnAmt><sshPrnamt>20000</sshPrnamt></shrsOrPrnAmt></infoTable>
    <infoTable><nameOfIssuer>OTHER INC</nameOfIssuer><cusip>000000000</cusip><value>900000</value><shrsOrPrnAmt><sshPrnamt>900000</sshPrnamt></shrsOrPrnAmt></infoTable>
  </informationTable>`;
  assert.deepEqual(parseMeta13fPosition(xml), { reported: true, shares: 120000, marketValueUsd: 150000000 });
});

test('SEC 13F parser explicitly marks META absent rather than inferring a zero holding', async () => {
  const { parseMeta13fPosition } = await import('./reentry-alerts.js');
  assert.deepEqual(parseMeta13fPosition('<informationTable><infoTable><cusip>037833100</cusip><value>100</value></infoTable></informationTable>'), {
    reported: false, shares: null, marketValueUsd: null,
  });
});

test('only a transition into an actionable review state generates a Telegram notification', async () => {
  const { shouldNotifySignal } = await import('./reentry-alerts.js');
  assert.equal(shouldNotifySignal('HOLDING', 'EXIT_REVIEW'), true);
  assert.equal(shouldNotifySignal('EXIT_REVIEW', 'EXIT_REVIEW'), false);
  assert.equal(shouldNotifySignal('NOT_READY', 'EVIDENCE_REVIEW_REQUIRED'), true);
  assert.equal(shouldNotifySignal('EVIDENCE_REVIEW_REQUIRED', 'EVIDENCE_REVIEW_REQUIRED'), false);
  assert.equal(shouldNotifySignal('HOLDING', 'HOLDING'), false);
});

test('delivery claim key changes when ownership mode or the upper evidence threshold changes', async () => {
  const { buildDeliveryKey } = await import('./reentry-alerts.js');
  const row = {
    symbol: 'META', target_price: 720, sale_date: null, thesis: 'META long-term AI thesis',
    ownership_status: 'holding', planned_exit_price: 770, upper_review_price: 770,
    updated_at: '2026-10-15T00:00:00Z',
  };
  assert.notEqual(buildDeliveryKey(row), buildDeliveryKey({ ...row, ownership_status: 'sold', sale_date: '2026-10-16' }));
  assert.notEqual(buildDeliveryKey(row), buildDeliveryKey({ ...row, upper_review_price: 800 }));
});


test('SEC 13F research selects the XML information table rather than the HTML display table', async () => {
  const { find13fInformationTableXmlHref } = await import('./reentry-alerts.js');
  const indexHtml = `<html><table>
    <tr><td><a href="56757.html">56757.html</a></td><td>INFORMATION TABLE FOR FORM 13F</td></tr>
    <tr><td><a href="56757.xml">56757.xml</a></td><td>INFORMATION TABLE FOR FORM 13F</td></tr>
    <tr><td><a href="primary_doc.xml">primary document</a></td><td>13F-HR</td></tr>
  </table></html>`;
  assert.equal(
    find13fInformationTableXmlHref(indexHtml, 'https://www.sec.gov/Archives/edgar/data/1067983/000119312526352200/'),
    'https://www.sec.gov/Archives/edgar/data/1067983/000119312526352200/56757.xml',
  );
});

test('SEC 13F selector does not silently fall back to an HTML information table', async () => {
  const { find13fInformationTableXmlHref } = await import('./reentry-alerts.js');
  assert.equal(
    find13fInformationTableXmlHref('<tr><td><a href="table.html">Information Table</a></td></tr>', 'https://www.sec.gov/archive/'),
    null,
  );
});
