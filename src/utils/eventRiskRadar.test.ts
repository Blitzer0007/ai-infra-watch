import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSync } from 'esbuild';
import { buildEventRiskRadar, parsePublicXPostUrl, RADAR_WATCH, scoreEventRiskReplay } from './eventRiskRadar';
import { EVENT_RISK_FIXTURE, EVENT_RISK_OUTCOMES, RADAR_REPLAY_END, RADAR_REPLAY_START } from '../fixtures/eventRiskRadar.fictional';

const fixture = () => structuredClone(EVENT_RISK_FIXTURE);
const run = (f = fixture(), asOf = RADAR_REPLAY_END, symbols = ['NVDA', 'AMD']) => buildEventRiskRadar(f, symbols, asOf);
const find = (claim: string, result = run()) => result.events.find(e => e.id === JSON.stringify([claim === 'amd-policy' ? 'AMD' : 'NVDA', claim]))!;

test('priority watch does not confer source confidence or an official account identity', () => {
  assert.equal(RADAR_WATCH.handle, 'aravind'); assert.equal(RADAR_WATCH.accountId, null);
  assert.equal(RADAR_WATCH.factConfidenceBoost, 0);
  const lead = find('board-change-cause', run(fixture(), RADAR_REPLAY_START));
  assert.equal(lead.stage, 'discovery-unverified'); assert.equal(lead.evidence[0].discoveryPriority, 'high');
  assert.equal(lead.evidence[0].verification, 'unverified'); assert.equal(lead.sourceAuthenticityVerified, false);
});
test('a copied X post shares a fingerprint and cannot corroborate its own origin', () => {
  const lead = find('board-change-cause', run(fixture(), RADAR_REPLAY_START));
  assert.equal(lead.evidence.length, 2); assert.equal(lead.evidence[0].fingerprint, lead.evidence[1].fingerprint);
  assert.equal(lead.independentReportingOrigins, 0); assert.equal(lead.stage, 'discovery-unverified');
});
test('issuer denial retains history; a filed event does not confirm its rumoured cause', () => {
  assert.equal(find('board-change-cause').stage, 'disputed');
  assert.deepEqual(find('board-change-cause').contradictingIds, ['denial']);
  assert.equal(find('board-change-cause').evidence.length, 3);
  assert.equal(find('board-change-cause').confirmedAt, null);
  assert.equal(find('board-change-event').stage, 'primary-confirmed');
});
test('news copies are excluded; two separately bound original newsrooms corroborate', () => {
  const f = fixture(); f.observations = f.observations.filter(r => r.id !== 'export-news-b');
  assert.equal(find('export-policy', run(f)).stage, 'discovery-unverified');
  assert.equal(find('export-policy').stage, 'corroborated');
  assert.equal(find('export-policy').independentReportingOrigins, 2);
});
for (const field of ['publisher', 'originKey'] as const) test(`shared ${field} cannot count as independent reporting`, () => {
  const f = fixture(); const a = f.observations.find(r => r.id === 'export-news-a')!, b = f.observations.find(r => r.id === 'export-news-b')!;
  b[field] = a[field]; if (b.receipt) b.receipt.publisher = b.publisher;
  assert.equal(find('export-policy', run(f)).stage, 'discovery-unverified');
});
test('retraction is retained and cannot be forged by another social publisher', () => {
  assert.equal(find('funding-concern').stage, 'retracted');
  const f = fixture(); const r = f.observations.find(r => r.id === 'funding-retraction')!;
  r.publisher = 'Other account'; r.receipt!.publisher = r.publisher;
  assert.equal(find('funding-concern', run(f)).stage, 'discovery-unverified');
});
test('ticker/underlying issuer disagreement is rejected; exact held symbols only', () => {
  assert.ok(run().issues.some(i => i.id === 'wrong-issuer' && i.reason.includes('issuer')));
  assert.equal(run(fixture(), RADAR_REPLAY_END, ['NVDAA']).events.length, 0);
  assert.ok(run(fixture(), RADAR_REPLAY_END, ['AMD']).events.every(e => e.symbol === 'AMD'));
});
for (const field of ['reference', 'issuerId', 'publisher', 'checkedAt'] as const) test(`primary promotion requires a bound fictional receipt: ${field}`, () => {
  const f = fixture(); f.observations.find(r => r.id === 'board-event')!.receipt![field] = 'mismatch';
  assert.equal(find('board-change-event', run(f)).stage, 'discovery-unverified');
});
test('a primary-looking domain or supplied source kind alone grants no verification', () => {
  const f = fixture(); delete f.observations.find(r => r.id === 'board-event')!.receipt;
  assert.equal(find('board-change-event', run(f)).stage, 'discovery-unverified');
});
test('confirmation time cannot precede the actual fictional reference check', () => {
  const f = fixture(); f.observations.find(r => r.id === 'board-event')!.receipt!.checkedAt = '2024-06-11T12:00:00Z';
  assert.equal(find('board-change-event', run(f, '2024-06-10T21:00:00Z')).stage, 'discovery-unverified');
  assert.equal(find('board-change-event', run(f)).confirmedAt, '2024-06-11T12:00:00Z');
});
test('lookahead rows and future retrievals cannot enter the earlier timeline', () => {
  const early = run(fixture(), RADAR_REPLAY_START);
  assert.deepEqual(early.events.map(e => e.stage), ['discovery-unverified']);
  assert.ok(early.issues.some(i => i.id === 'denial' && i.reason.includes('lookahead')));
  const f = fixture(); f.observations[0].retrievedAt = RADAR_REPLAY_END;
  assert.ok(!run(f, RADAR_REPLAY_START).events.some(e => e.evidence.some(r => r.id === 'lead-cause')));
});
test('invalid clocks, backfilled observations, unsafe references and duplicate IDs are withheld', () => {
  for (const edits of [{ firstObservedAt: '2024-06-07T00:00:00Z' }, { publishedAt: '2024-02-30T00:00:00Z' }, { sourceUrl: 'javascript:alert(1)' }, { reportedAt: 'tomorrow' }]) {
    const f = fixture(); Object.assign(f.observations[0], edits);
    assert.ok(run(f).issues.some(i => i.id === 'lead-cause'));
  }
  const f = fixture(); f.observations.push(structuredClone(f.observations[0]));
  assert.ok(run(f).issues.some(i => i.reason.includes('Duplicate')));
});
test('deleted and time-uncertain sources remain limited and unscorable', () => {
  const event = find('unknown-post'); assert.equal(event.stage, 'discovery-unverified');
  assert.ok(event.evidence[0].limits.some(i => i.includes('deleted')));
  const score = scoreEventRiskReplay(fixture(), EVENT_RISK_OUTCOMES, RADAR_REPLAY_END);
  assert.equal(score.cases.find(c => c.claimId === 'unknown-post')!.status, 'unscorable');
});
test('closed-session observations align only to caller-supplied known sessions', () => {
  assert.equal(find('board-change-cause').nextSupportedSession, '2024-06-10');
  const f = fixture(); f.calendarKnownAt = '2025-01-01T00:00:00Z';
  assert.equal(find('board-change-cause', run(f)).nextSupportedSession, null);
  f.calendarKnownAt = EVENT_RISK_FIXTURE.calendarKnownAt; f.sessions = [];
  assert.equal(find('board-change-cause', run(f)).nextSupportedSession, null);
});
test('at-close posts move to the next declared session; unknown/overlapping calendars withhold mapping', () => {
  const f = fixture(); Object.assign(f.observations[0], { publishedAt: '2024-06-10T20:00:00Z', reportedAt: null, firstObservedAt: '2024-06-10T20:00:00Z', retrievedAt: '2024-06-10T20:00:00Z' });
  f.observations = [f.observations[0]];
  assert.equal(find('board-change-cause', run(f)).nextSupportedSession, '2024-06-11');
  f.sessions[1].opensAt = f.sessions[0].opensAt;
  assert.equal(find('board-change-cause', run(f)).nextSupportedSession, null);
});
test('price impact and all decision/source/predictive authority remain withheld', () => {
  for (const e of run().events) {
    assert.equal(e.priceImpactPct, null); assert.equal(e.impactDirection, 'unknown');
    assert.equal(e.decisionEligible, false); assert.equal(e.sourceAuthenticityVerified, false);
  }
  assert.equal(run().liveCoverage, 'not-configured'); assert.equal(run().coverage, 'partial');
});
test('fixed replay counts false leads, missed events, late commentary and missing evidence', () => {
  const score = scoreEventRiskReplay(fixture(), EVENT_RISK_OUTCOMES, RADAR_REPLAY_END);
  assert.deepEqual([score.labelledCases, score.scorableCases, score.falsePositives, score.detected, score.missed, score.postEvent, score.unscorable], [7, 5, 2, 1, 1, 1, 2]);
  const exports = score.cases.find(c => c.claimId === 'export-policy')!;
  assert.deepEqual([exports.officialLeadMinutes, exports.newsLeadMinutes, exports.priceAlertLeadMinutes], [null, 60, 120]);
  assert.equal(score.cases.find(c => c.claimId === 'late-comment')!.officialLeadMinutes, -30);
  assert.equal(score.predictiveAuthority, false); assert.match(score.verdict, /Insufficient/);
});
test('outcomes cannot leak into discovery or be scored before their label/window exists', () => {
  const before = run(); const outcomes = structuredClone(EVENT_RISK_OUTCOMES);
  outcomes[2].outcome = 'no-event'; scoreEventRiskReplay(fixture(), outcomes, RADAR_REPLAY_END);
  assert.deepEqual(run(), before);
  assert.equal(scoreEventRiskReplay(fixture(), EVENT_RISK_OUTCOMES, RADAR_REPLAY_START).unscorable, 7);
  assert.throws(() => scoreEventRiskReplay(fixture(), [...EVENT_RISK_OUTCOMES, EVENT_RISK_OUTCOMES[0]], RADAR_REPLAY_END));
});
test('unknown labels and incomplete original account identity withhold lead-time metrics', () => {
  const f = fixture(), outcomes = structuredClone(EVENT_RISK_OUTCOMES);
  outcomes[2].outcome = 'unknown';
  const score = scoreEventRiskReplay(f, outcomes, RADAR_REPLAY_END).cases.find(c => c.claimId === 'export-policy')!;
  assert.equal(score.status, 'unscorable'); assert.equal(score.newsLeadMinutes, null);
  delete f.observations.find(r => r.id === 'export-lead')!.accountId;
  assert.equal(scoreEventRiskReplay(f, EVENT_RISK_OUTCOMES, RADAR_REPLAY_END).cases.find(c => c.claimId === 'export-policy')!.status, 'unscorable');
});
test('late collection of an official announcement cannot turn post-event commentary into an early warning', () => {
  const f = fixture(), official = f.observations.find(r => r.id === 'late-official')!;
  official.firstObservedAt = '2024-06-10T17:00:00Z'; official.retrievedAt = official.firstObservedAt; official.receipt!.checkedAt = official.retrievedAt;
  assert.equal(scoreEventRiskReplay(f, EVENT_RISK_OUTCOMES, RADAR_REPLAY_END).cases.find(c => c.claimId === 'late-comment')!.status, 'post-event');
});
test('lead time uses first observation instead of the earlier publication timestamp', () => {
  const f = fixture(), social = f.observations.find(r => r.id === 'export-lead')!;
  social.firstObservedAt = '2024-06-10T12:10:00Z'; social.retrievedAt = '2024-06-10T12:15:00Z';
  assert.equal(scoreEventRiskReplay(f, EVENT_RISK_OUTCOMES, RADAR_REPLAY_END).cases.find(c => c.claimId === 'export-policy')!.newsLeadMinutes, 50);
  assert.equal(find('export-policy', run(f)).evidence[0].firstObservedAt, social.firstObservedAt);
});
test('ambiguous worries are not scored as advance predictions', () => {
  const f = fixture(); f.observations.find(r => r.id === 'export-lead')!.claimClarity = 'ambiguous';
  assert.equal(scoreEventRiskReplay(f, EVENT_RISK_OUTCOMES, RADAR_REPLAY_END).cases.find(c => c.claimId === 'export-policy')!.status, 'unscorable');
  assert.ok(find('export-policy', run(f)).evidence[0].limits.some(limit => limit.includes('Ambiguous')));
});
test('replay is deterministic, does not mutate inputs and needs no ambient clock', () => {
  const f = fixture(), before = structuredClone(f), original = Date.now;
  try { Date.now = () => { throw Error('ambient clock forbidden'); }; assert.deepEqual(run(f), run(f)); }
  finally { Date.now = original; }
  assert.deepEqual(f, before);
  const result = run(f); result.events[0].evidence[0].limits.push('local edit');
  assert.deepEqual(f, before);
});
test('bounds, explicit clock and fictional-only boundary reject unsupported input', () => {
  assert.throws(() => run({ ...fixture(), fictional: false } as any));
  assert.throws(() => run(fixture(), 'bad'));
  const f = fixture(); f.observations = Array(201).fill(f.observations[0]); assert.throws(() => run(f));
});
test('public original URL syntax canonicalizes but never authenticates or fetches it', () => {
  assert.deepEqual(parsePublicXPostUrl('https://twitter.com/Aravind/status/123456'), { url: 'https://x.com/aravind/status/123456', handle: 'aravind', postId: '123456' });
  for (const u of ['http://x.com/aravind/status/1', 'https://x.com.evil.test/aravind/status/1', 'https://user:pass@x.com/aravind/status/1', 'https://x.com/aravind', 'https://x.com/aravind/status/1?token=hidden', 'https://x.com/aravind/status/1#hidden', 'https://x.com:444/aravind/status/1', 'https://x.com/aravind/status/not-an-id']) assert.equal(parsePublicXPostUrl(u), null);
});
test('browser bundle is self-contained with no transport, storage, credentials or provider imports', () => {
  const bundle = buildSync({ entryPoints: ['src/utils/eventRiskRadar.ts'], bundle: true, platform: 'browser', write: false }).outputFiles[0].text;
  assert.doesNotMatch(bundle, /\bfetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|process\.env|supabase|alert-notify|setInterval|apiAuth/);
});
