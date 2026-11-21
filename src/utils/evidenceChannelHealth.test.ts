import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reviewEvidenceChannel as review, summarizeEvidenceChannels as summarize } from './evidenceChannelHealth';

const now = Date.parse('2026-11-21T12:00:00Z');
const current = {status: 'AVAILABLE', retrievedAt: '2026-11-21T11:59:00Z', refreshIntervalSeconds: 60};

describe('evidence channel collection health', () => {
  it('requires a declared successful state and supported timing before showing healthy', () => {
    assert.equal(review(current, now).state, 'healthy');
    for (const status of ['UNKNOWN', 'UNEXPECTED', '', null])
      assert.equal(review({...current, status}, now).state, 'unknown');
    for (const value of [null, [], 'invalid', 0]) assert.equal(review(value, now).state, 'unknown');
    for (const retrievedAt of [undefined, '', 'bad', '2026-11-21', '2026-11-21T12:00:00'])
      assert.equal(review({...current, retrievedAt}, now).state, 'unknown');
    for (const refreshIntervalSeconds of [null, 0, -1, '60', Infinity, NaN])
      assert.equal(review({...current, refreshIntervalSeconds}, now).state, 'unknown');
  });
  it('never turns provider failures into healthy or empty evidence because a capture time exists', () => {
    for (const failure of [{status: 'FAILED'}, {status: 'ERROR'}, {status: 'UNAVAILABLE'},
      {feedHealth: {status: 'FAILED'}}, {upstreamError: 'fictional-private-error'},
      {lastRefreshStatus: 'FAILED'}, {lastRefreshError: 'fictional-private-error'}]) {
      assert.equal(review({...current, ...failure}, now).state, 'failed');
      assert.doesNotMatch(JSON.stringify(review({...current, ...failure}, now)), /fictional-private-error/);
    }
    assert.equal(review({...current, status: 'NOT_FOUND', feedHealth: {status: 'FAILED'}}, now).state, 'failed');
  });
  it('retains conflicts even when age or fallback would otherwise mask them', () => {
    assert.equal(review({...current, conflictStatus: 'CONFLICT', stale: true, fallback: true}, now).state, 'conflict');
    assert.equal(review({...current, status: 'CONFLICT', feedHealth: {status: 'FAILED'}}, now).state, 'conflict');
  });
  it('separates absent results, pending results and inapplicable channels', () => {
    assert.equal(review({status: 'NOT_FOUND'}, now).state, 'missing');
    assert.equal(review({...current, status: 'PENDING'}, now).state, 'pending');
    assert.equal(review({status: 'NOT_APPLICABLE'}, now).state, 'not-applicable');
  });
  it('counts stale evidence by semantic state regardless of its friendly label', () => {
    for (const fields of [{stale: true}, {status: 'STALE'}, {freshness: {status: 'STALE'}},
      {freshness: {status: 'VERY_STALE'}}, {retrievedAt: '2026-11-21T11:54:59Z'}]) {
      const channel = review({...current, ...fields}, now);
      assert.equal(channel.state, 'stale');
      assert.equal(channel.label, 'Needs refresh');
      assert.equal(summarize({news: {...current, ...fields}}, {nowMs: now}).attention, 1);
    }
    assert.equal(review({...current, retrievedAt: '2026-11-21T11:55:00Z'}, now).state, 'aging');
    assert.equal(review({...current, retrievedAt: '2026-11-21T11:58:00Z'}, now).state, 'healthy');
    assert.equal(review({...current, retrievedAt: '2026-11-21T11:57:59Z'}, now).state, 'aging');
  });
  it('keeps explicit aging and fallback separate from a successful primary collection', () => {
    for (const fields of [{status: 'AGING'}, {freshness: {status: 'AGING', ageMinutes: 30}}])
      assert.equal(review({...current, ...fields}, now).state, 'aging');
    for (const fields of [{fallback: true}, {status: 'FALLBACK'}, {feedHealth: {status: 'FALLBACK'}}])
      assert.equal(review({...current, ...fields}, now).state, 'fallback');
  });
  it('does not let future or unknown source timestamps establish current health', () => {
    assert.equal(review({...current, retrievedAt: '2026-11-21T12:02:01Z'}, now).state, 'unknown');
    assert.equal(review({...current, retrievedAt: '2026-11-21T12:02:00Z'}, now).retrievedAgeSeconds, 0);
    assert.equal(review(current, NaN).state, 'unknown');
    for (const fields of [{feedHealth: {status: 'UNEXPECTED'}}, {feedHealth: []}, {freshness: []},
      {freshness: {status: 'UNKNOWN', ageMinutes: null}}, {freshness: {status: 'FRESH', ageMinutes: -1}},
      {stale: 'false'}, {fallback: 'false'}])
      assert.equal(review({...current, ...fields}, now).state, 'unknown');
    assert.equal(review({...current, freshness: {status: 'FRESH', ageMinutes: 0}}, now).state, 'healthy');
  });
  it('partitions the summary without conflating failures, unknowns or inapplicable channels', () => {
    const result = summarize({current, stale: {...current, stale: true}, failed: {status: 'FAILED'},
      conflict: {status: 'CONFLICT'}, fallback: {...current, fallback: true}, aging: {...current, status: 'AGING'},
      missing: {status: 'NOT_FOUND'}, pending: {status: 'PENDING'}, unknown: null,
      excluded: {status: 'NOT_APPLICABLE'}}, {nowMs: now});
    assert.deepEqual([result.healthy, result.attention, result.missing, result.unknown, result.notApplicable, result.total], [1, 5, 1, 2, 1, 10]);
    assert.equal(result.state, 'attention');
    assert.equal(summarize({excluded: {status: 'NOT_APPLICABLE'}}, {nowMs: now}).state, 'not-applicable');
  });
  it('does not present empty, loading or failed latest responses as a healthy fleet', () => {
    for (const value of [{}, null, []]) {
      const result = summarize(value, {nowMs: now});
      assert.equal(result.state, 'unknown');
      assert.equal(result.observed, false);
    }
    assert.equal(summarize({}, {loading: true}).state, 'loading');
    const failed = summarize({current}, {nowMs: now, error: true});
    assert.equal(failed.healthy, 0);
    assert.equal(failed.unknown, 1);
    assert.equal(failed.observed, false);
    assert.equal(failed.channels[0].state, 'unknown');
  });
});
