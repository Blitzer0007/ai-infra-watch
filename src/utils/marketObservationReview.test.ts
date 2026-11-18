import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeMarketObservation as review } from './marketObservationReview.js';

const good = {
  symbol:'FICT', quote: {available:true,ageSeconds:60,stale:false,fallbackUsed:false,providerAttempts:[]},
  history: {available:true,ageDays:1,stale:false,adjustedCloseAvailable:true,providerAttempts:[]},
};

describe('Milestone 5 read-only market lag and quota evidence', () => {
  it('does not call an empty or failed response healthy', () => {
    assert.equal(review([]).state, 'unknown');
    assert.equal(review(null, {loading:true}).state, 'loading');
    assert.equal(review([good], {error:'transport unavailable'}).state, 'unknown');
    assert.equal(review([{...good},null,'bad',[]]).sampleRows, 1);
  });
  it('retains genuinely observed recent metadata without claiming provider quota', () => {
    const result=review([good]);
    assert.equal(result.state, 'observed-only');
    assert.equal(result.quoteTimeUnknown, 0);
    assert.equal(result.quotaRemaining, null);
    assert.equal(result.sampleRows, 1);
  });
  it('shows missing observation time and adjustment coverage as PARTIAL, never valid history', () => {
    const result=review([{
      ...good,
      quote:{available:true,ageSeconds:null},
      history:{available:true,ageDays:null,adjustedCloseAvailable:false},
      secret:'should never leave the adapter',
    }]);
    assert.equal(result.state,'partial');
    assert.equal(result.quoteTimeUnknown,1);
    assert.equal(result.historyDateUnknown,1);
    assert.equal(result.adjustedIncomplete,1);
    assert.doesNotMatch(JSON.stringify(result),/should never leave/);
  });
  it('distinguishes aged quote/calendar history and provider HTTP 429 attempts', () => {
    const result=review([{
      ...good,
      quote:{available:true,ageSeconds:901,providerAttempts:[{provider:'A',errorCode:'rate_limited'}]},
      history:{available:true,ageDays:6,adjustedCloseAvailable:true,providerAttempts:[{provider:'B',errorCode:'rate_limited'}]},
    }]);
    assert.equal(result.state,'attention');
    assert.equal(result.quoteAged,1);
    assert.equal(result.historyAged,1);
    assert.equal(result.rateLimitedAttempts,2);
    assert.equal(result.quotaRemaining,null);
  });
  it('does not coerce string ages or interpret fallback-only evidence as primary', () => {
    const result=review([{
      ...good,quote:{available:true,ageSeconds:'30',fallbackUsed:true},
      history:{available:false,errorCode:'rate_limited'},
    }]);
    assert.equal(result.quoteTimeUnknown,1);
    assert.equal(result.historyUnavailable,1);
    assert.equal(result.rateLimitedAttempts,1);
    assert.equal(result.fallbackRows,1);
    assert.equal(result.state,'attention');
  });
});
