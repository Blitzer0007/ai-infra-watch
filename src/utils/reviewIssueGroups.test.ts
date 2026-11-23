import { test } from 'node:test';
import assert from 'node:assert/strict';
import {groupAccountingIssues, groupRuleIssues} from './reviewIssueGroups';
test('repeated accounting issues group affected tickers and retain field-specific diagnoses without raw messages', () => {
  const result = groupAccountingIssues([{code:'INVALID_TRANSACTION',detailCode:'AMOUNT_INVALID',symbol:'FICT',message:'private-secret'},
    {code:'INVALID_TRANSACTION',detailCode:'AMOUNT_INVALID',symbol:'DEMO'}, {code:'INVALID_TRANSACTION',detailCode:'AMOUNT_INVALID',symbol:'DEMO'},
    {code:'INVALID_TRANSACTION',detailCode:'QUANTITY_INVALID',symbol:'FICT'}]);
  assert.equal(result.length,2); assert.equal(result[0].entries,3); assert.deepEqual(result[0].symbols,['FICT','DEMO']);
  assert.match(result[0].message,/amount/); assert.doesNotMatch(JSON.stringify(result),/private-secret/);
});
test('rules share each prerequisite once while keeping the affected tickers', () => {
  const result=groupRuleIssues([{symbol:'FICT',issues:['Declared history required','Review alert directions']},
    {symbol:'DEMO',issues:['Declared history required','Declared history required']}]);
  assert.equal(result.length,2);assert.equal(result[0].entries,2);assert.deepEqual(result[0].symbols,['FICT','DEMO']);
});
