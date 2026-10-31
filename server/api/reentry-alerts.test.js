import { test } from 'node:test';
import assert from 'node:assert/strict';
import { telegramAccepted, isRegularUsEquitySession, isSameNewYorkMarketDate, isWithinRegularSessionBounds, canSendReentryNotification, resolveLastAlertSignature, classifyScan } from './reentry-alerts.js';

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

test('a previously accepted outbox record reconciled this scan is delivery evidence', () => {
  assert.equal(classifyScan({
    activeRows: 1, evaluatedRows: 1, qualifyingCandidates: 1,
    notifyEligibleCandidates: 1, telegramSent: 0, telegramPreviouslyAccepted: 1, errors: 0,
  }), 'telegram_delivery_confirmed');
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

test('a definitively rejected delivery can be retried after the durable claim is reclaimed', async () => {
  let persistedStatus = 'new';
  let sendCount = 0;
  const attempt = () => sendOnceWithDurableClaim({
    claim: async () => {
      // Mirrors the atomic database rule: insert new claim or reclaim only rejected status.
      if (persistedStatus === 'new' || persistedStatus === 'rejected') {
        persistedStatus = 'sending';
        return true;
      }
      return false;
    },
    inspectExistingClaim: async () => ({
      status: persistedStatus,
      telegram_message_id: persistedStatus === 'accepted' ? 5566 : null,
    }),
    send: async () => {
      sendCount++;
      if (sendCount === 1) {
        const rejected = new Error('Telegram definitively rejected request');
        rejected.deliveryStatus = 'rejected';
        throw rejected;
      }
      return 5566;
    },
    recordAccepted: async () => { persistedStatus = 'accepted'; return true; },
    recordFailure: async status => { persistedStatus = status; return true; },
  });
  const first = await attempt();
  assert.equal(first.status, 'rejected');
  const retry = await attempt();
  assert.equal(retry.status, 'accepted');
  assert.equal(sendCount, 2);
  assert.equal(persistedStatus, 'accepted');
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

test('accepted existing claim is reconciled without sending a duplicate message', async () => {
  let sendCount = 0;
  const result = await sendOnceWithDurableClaim({
    claim: async () => false,
    inspectExistingClaim: async () => ({ status: 'accepted', telegram_message_id: 7654 }),
    send: async () => { sendCount++; return 7655; },
    recordAccepted: async () => true,
    recordFailure: async () => true,
  });
  assert.equal(result.status, 'already_accepted');
  assert.equal(result.messageId, 7654);
  assert.equal(result.attempted, false);
  assert.equal(result.deliveryRecordPersisted, true);
  assert.equal(sendCount, 0);
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
  assert.deepEqual(parseMeta13fPosition(xml), {
    reported: true,
    commonStockReported: true,
    shares: 120000,
    marketValueUsd: 150000000,
    options: {
      call: { reported: false, reportedQuantity: null, marketValueUsd: null },
      put: { reported: false, reportedQuantity: null, marketValueUsd: null },
    },
    otherReportableLines: 0,
  });
});

test('SEC 13F parser explicitly marks META absent rather than inferring a zero holding', async () => {
  const { parseMeta13fPosition } = await import('./reentry-alerts.js');
  assert.deepEqual(parseMeta13fPosition('<informationTable><infoTable><cusip>037833100</cusip><value>100</value></infoTable></informationTable>'), {
    reported: false, shares: null, marketValueUsd: null, commonStockReported: false,
    options: {
      call: { reported: false, reportedQuantity: null, marketValueUsd: null },
      put: { reported: false, reportedQuantity: null, marketValueUsd: null },
    },
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


test('SEC 13F parser separates META common shares from call and put option disclosures', async () => {
  const { parseMeta13fPosition } = await import('./reentry-alerts.js');
  const xml = `<informationTable>
    <infoTable><cusip>30303M102</cusip><value>1000</value><shrsOrPrnAmt><sshPrnamt>100</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>
    <infoTable><cusip>30303M102</cusip><value>250</value><shrsOrPrnAmt><sshPrnamt>5</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt><putCall>Call</putCall></infoTable>
    <infoTable><cusip>30303M102</cusip><value>80</value><shrsOrPrnAmt><sshPrnamt>2</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt><putCall>Put</putCall></infoTable>
  </informationTable>`;
  const result = parseMeta13fPosition(xml);
  assert.equal(result.shares, 100);
  assert.equal(result.marketValueUsd, 1000000);
  assert.deepEqual(result.options.call, { reported: true, reportedQuantity: 5, marketValueUsd: 250000 });
  assert.deepEqual(result.options.put, { reported: true, reportedQuantity: 2, marketValueUsd: 80000 });
});


test('fresh analyst consensus is available and its recommendation period is labelled fresh', async () => {
  const { normalizeAnalystResearch } = await import('./reentry-alerts.js');
  const now = Date.parse('2026-10-15T00:00:00Z');
  const result = normalizeAnalystResearch([
    { period: '2026-04', strongBuy: 9, buy: 4, hold: 2, sell: 1, strongSell: 0 },
    { period: '2026-10', strongBuy: 8, buy: 3, hold: 1, sell: 0, strongSell: 0 },
  ], { targetMean: 220, targetMedian: 225, lastUpdated: '2026-10-10', numberOfAnalysts: 12 }, now);
  assert.equal(result.status, 'available');
  assert.equal(result.ratingFreshness, 'fresh');
  assert.equal(result.recommendationPeriod, '2026-10');
  assert.equal(result.ratings.strongBuy, 8);
  assert.equal(result.targets.freshness, 'fresh');
});

test('stale analyst counts are excluded rather than making research appear current', async () => {
  const { normalizeAnalystResearch } = await import('./reentry-alerts.js');
  const result = normalizeAnalystResearch([
    { period: '2026-03', strongBuy: 99, buy: 99, hold: 0, sell: 0, strongSell: 0 },
  ], null, Date.parse('2026-10-15T00:00:00Z'));
  assert.equal(result.status, 'stale');
  assert.equal(result.ratingFreshness, 'stale');
  assert.equal(result.ratings, null);
  assert.match(result.message, /stale/i);
});

test('fresh targets may remain available while stale analyst counts are explicitly excluded', async () => {
  const { normalizeAnalystResearch } = await import('./reentry-alerts.js');
  const result = normalizeAnalystResearch([
    { period: '2026-03', strongBuy: 99, buy: 99, hold: 0, sell: 0, strongSell: 0 },
  ], { targetMean: 220, targetMedian: 225, lastUpdated: '2026-10-10', numberOfAnalysts: 12 }, Date.parse('2026-10-15T00:00:00Z'));
  assert.equal(result.status, 'available');
  assert.equal(result.ratingFreshness, 'stale');
  assert.equal(result.ratings, null);
  assert.equal(result.targets.freshness, 'fresh');
  assert.match(result.message, /stale and excluded/i);
});

test('fund ownership research matches associated managers for any selected ticker', async () => {
  const { normalizeFundOwnership } = await import('./reentry-alerts.js');
  const result = normalizeFundOwnership('NVDA', {
    symbol: 'NVDA',
    ownership: [
      { name: 'Berkshire Hathaway Inc.', share: 100000, change: 1200, filingDate: '2026-08-14', portfolioPercent: 2.1 },
      { name: 'Pershing Square Capital Management, L.P.', share: 50000, change: -100, filingDate: '2026-08-14', portfolioPercent: 1.5 },
      { name: 'Example Institutional Partners LLC', share: 20000, change: 300, filingDate: '2026-08-14', portfolioPercent: 0.8 },
    ],
  });
  assert.equal(result.symbol, 'NVDA');
  assert.equal(result.status, 'available');
  assert.equal(result.funds.length, 3);
  assert.deepEqual(result.billionaireAssociatedFunds.map(fund => fund.name), [
    'Berkshire Hathaway Inc.',
    'Pershing Square Capital Management, L.P.',
  ]);
  assert.equal(result.billionaireAssociatedFunds[0].shares, 100000);
  assert.equal(result.billionaireAssociatedFunds[0].shareChange, 1200);
  assert.equal(result.billionaireAssociatedFunds[0].filingDate, '2026-08-14');
  assert.equal(result.funds[2].billionaireAssociation, null);
});

test('empty generic fund ownership response is not represented as zero ownership', async () => {
  const { normalizeFundOwnership } = await import('./reentry-alerts.js');
  const result = normalizeFundOwnership('DGXX', { symbol: 'DGXX', ownership: [] });
  assert.equal(result.status, 'no_records_returned');
  assert.equal(result.funds.length, 0);
  assert.match(result.message, /not proof/i);
});

test('missing fund ownership fields remain unavailable instead of becoming zeros', async () => {
  const { normalizeFundOwnership } = await import('./reentry-alerts.js');
  const result = normalizeFundOwnership('META', {
    ownership: [{ name: 'Berkshire Hathaway', filingDate: '2026-08-14' }],
  });
  assert.equal(result.billionaireAssociatedFunds[0].shares, null);
  assert.equal(result.billionaireAssociatedFunds[0].shareChange, null);
  assert.equal(result.billionaireAssociatedFunds[0].portfolioPercent, null);
});


test('regular-session gate observes New York time across daylight-saving changes', () => {
  assert.equal(isRegularUsEquitySession(new Date('2026-10-26T13:30:00Z')), true); // 09:30 EDT
  assert.equal(isRegularUsEquitySession(new Date('2026-10-26T13:29:00Z')), false);
  assert.equal(isRegularUsEquitySession(new Date('2026-10-26T20:00:00Z')), false); // 16:00 EDT, close is exclusive
  assert.equal(isRegularUsEquitySession(new Date('2026-11-02T14:30:00Z')), true); // 09:30 EST
  assert.equal(isRegularUsEquitySession(new Date('2026-10-24T14:00:00Z')), false); // Saturday
});

test('same-market-date guard rejects missing, invalid, and stale holiday/weekend quotes', () => {
  const now = new Date('2026-10-26T14:00:00Z');
  assert.equal(isSameNewYorkMarketDate('2026-10-26T13:35:00Z', now), true);
  assert.equal(isSameNewYorkMarketDate('2026-10-23T19:55:00Z', now), false);
  assert.equal(isSameNewYorkMarketDate(null, now), false);
  assert.equal(isSameNewYorkMarketDate('not-a-date', now), false);
});

test('re-entry notification requires an approved scheduled run, same-date quote, and valid provider session bounds', () => {
  const marketTime = '2026-10-26T13:35:00Z';
  const now = new Date('2026-10-26T14:00:00Z');
  const regularSession = { start: Date.parse('2026-10-26T13:30:00Z') / 1000, end: Date.parse('2026-10-26T20:00:00Z') / 1000 };
  assert.equal(canSendReentryNotification(marketTime, now), false); // interactive/UI refreshes are not allowed to send
  assert.equal(canSendReentryNotification(marketTime, now, true, regularSession), true);
  assert.equal(canSendReentryNotification(marketTime, new Date('2026-10-26T20:00:00Z'), true, regularSession), false);
  assert.equal(canSendReentryNotification('2026-10-23T19:55:00Z', now, true, regularSession), false);
  assert.equal(canSendReentryNotification(marketTime, now, true, null), false); // fail closed if the source omits session metadata
});

test('provider session bounds enforce early closes even when ordinary weekday hours are open', () => {
  const earlyClose = { start: Date.parse('2026-11-27T14:30:00Z') / 1000, end: Date.parse('2026-11-27T18:00:00Z') / 1000 }; // 09:30–13:00 EST
  assert.equal(isWithinRegularSessionBounds(earlyClose, new Date('2026-11-27T17:55:00Z')), true);
  assert.equal(isWithinRegularSessionBounds(earlyClose, new Date('2026-11-27T18:01:00Z')), false);
  assert.equal(isWithinRegularSessionBounds(null, new Date('2026-11-27T17:55:00Z')), false);
});

test('deferred off-hours notification preserves the prior alert signature for the next live session', () => {
  assert.equal(resolveLastAlertSignature('NOT_READY', 'WATCH_ENTRY', true), 'NOT_READY');
  assert.equal(resolveLastAlertSignature(null, 'REENTRY_CANDIDATE', true), null);
  assert.equal(resolveLastAlertSignature('NOT_READY', 'WATCH_ENTRY', false), 'WATCH_ENTRY');
});

test('scan status explicitly distinguishes fully deferred notifications from failed delivery', () => {
  assert.equal(classifyScan({ activeRows: 1, evaluatedRows: 1, qualifyingCandidates: 0, notifyEligibleCandidates: 1, notificationsDeferred: 1, notificationsDeferredOutsideSession: 1, telegramSent: 0, errors: 0 }), 'notifications_deferred_outside_market_session');
  assert.equal(classifyScan({ activeRows: 1, evaluatedRows: 1, qualifyingCandidates: 0, notifyEligibleCandidates: 1, notificationsDeferred: 1, notificationsDeferredNonScheduled: 1, telegramSent: 0, errors: 0 }), 'notifications_deferred_non_scheduled_scan');
  assert.equal(classifyScan({ activeRows: 1, evaluatedRows: 1, qualifyingCandidates: 0, notifyEligibleCandidates: 1, notificationsDeferred: 1, notificationsDeferredStaleQuote: 1, telegramSent: 0, errors: 0 }), 'notifications_deferred_stale_quote');
  assert.equal(classifyScan({ activeRows: 1, evaluatedRows: 1, qualifyingCandidates: 0, notifyEligibleCandidates: 1, notificationsDeferred: 1, notificationsDeferredMissingSession: 1, telegramSent: 0, errors: 0 }), 'notifications_deferred_missing_session_metadata');
  assert.equal(classifyScan({ activeRows: 2, evaluatedRows: 2, qualifyingCandidates: 1, notifyEligibleCandidates: 2, notificationsDeferred: 1, notificationsDeferredNonScheduled: 1, telegramSent: 1, errors: 0 }), 'completed_with_deferred_notifications');
});

test('Re-entry indicators align live quote adjustment factor to the completed bar timestamp', async () => {
  const { calculateReentryIndicators } = await import('./reentry-alerts.js');
  const timestamps = Array.from({ length: 51 }, (_, i) => Date.UTC(2026, 0, 1 + i) / 1000);
  const closes = Array(51).fill(100);
  const adjustedCloses = Array(51).fill(50);
  // Last point is newer than the provider's regularMarketTime and may be an in-progress bar.
  adjustedCloses[50] = 25;
  const result = calculateReentryIndicators({
    price: 100,
    closes,
    adjustedCloses,
    timestamps,
    regularMarketTime: timestamps[49],
  });
  assert.equal(result.price, 100);
  assert.equal(result.sma20, 48.75);
  assert.equal(result.sma50, 48.5);
  assert.equal(result.adjustmentReferenceDate, '2026-02-19');
  assert.equal(result.adjustmentFactor, 0.5);
  assert.equal(result.drawdownFrom52WeekHighPct, 0);
  assert.equal(result.priceBasis, 'split_dividend_adjusted_close');
  assert.equal(result.adjustedPointCount, 51);
});

test('Re-entry indicators fail closed when adjusted-close history is missing or misaligned', async () => {
  const { calculateReentryIndicators } = await import('./reentry-alerts.js');
  const timestamps = Array.from({ length: 60 }, (_, i) => Date.UTC(2026, 0, 1 + i) / 1000);
  assert.throws(() => calculateReentryIndicators({
    price: 100, closes: Array(60).fill(100), adjustedCloses: [], timestamps,
  }), /Aligned raw and adjusted daily history/);
  assert.throws(() => calculateReentryIndicators({
    price: 100, closes: Array(60).fill(100), adjustedCloses: Array(60).fill(100),
    timestamps: timestamps.slice(1),
  }), /Aligned raw and adjusted daily history/);
});

test('Re-entry indicators fail closed on partial adjusted-close coverage', async () => {
  const { calculateReentryIndicators } = await import('./reentry-alerts.js');
  const timestamps = Array.from({ length: 60 }, (_, i) => Date.UTC(2026, 0, 1 + i) / 1000);
  const adjustedCloses = Array(60).fill(100);
  adjustedCloses[20] = null;
  assert.throws(() => calculateReentryIndicators({
    price: 100, closes: Array(60).fill(100), adjustedCloses, timestamps,
  }), /At least 50 complete aligned adjusted daily bars/);
});

test('Re-entry adjusted indicators require at least 50 complete aligned daily points', async () => {
  const { calculateReentryIndicators } = await import('./reentry-alerts.js');
  const timestamps = Array.from({ length: 49 }, (_, i) => Date.UTC(2026, 0, 1 + i) / 1000);
  assert.throws(() => calculateReentryIndicators({
    price: 100,
    closes: Array(49).fill(100),
    adjustedCloses: Array(49).fill(100),
    timestamps,
  }), /At least 50 complete aligned adjusted daily bars/);
});

