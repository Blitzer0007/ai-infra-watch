import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteFailureReason, explainQuoteFailures } from '../utils/quoteFailureReasons.js';

test('provider diagnostics expose fixed reasons and discard arbitrary upstream fields', () => {
  const secret = 'private-provider-message';
  const message = quoteFailureReason({
    message: secret, providers: [
      {provider:'yahoo', errorCode:'rate_limited', message:secret},
      {provider:'finnhub', errorCode:'not_configured'},
      {provider:'alpha-vantage', errorCode:'timeout'},
    ],
  });
  assert.match(message, /Yahoo rate limited; Finnhub not configured; Alpha Vantage timed out/);
  assert.ok(!message.includes(secret));
  assert.equal(quoteFailureReason({providers:[{provider:secret,errorCode:'timeout'}]}),
    'Quote retrieval failed; review provider availability.');
});

test('retrieval diagnostics explain withheld marks without altering accounting or quality decisions', () => {
  const review = {currentValue:null, accountingReconciled:false,
    accountingIssues:[{code:'QUOTE_WITHHELD',symbol:'FICT',message:'Generic'},
      {code:'QUANTITY_MISMATCH',symbol:'FICT',message:'Keep'},
      {code:'QUOTE_WITHHELD',symbol:'OTHER',message:'Missing identity'}]};
  const result = explainQuoteFailures(review, [['FICT',null,'Yahoo rate limited.']]);
  assert.equal(result.accountingIssues[0].message,'Yahoo rate limited.');
  assert.equal(result.accountingIssues[1].message,'Keep');
  assert.equal(result.accountingIssues[2].message,'Missing identity');
  assert.equal(result.currentValue,null);
  assert.equal(result.accountingReconciled,false);
  assert.equal(review.accountingIssues[0].message,'Generic');
});
