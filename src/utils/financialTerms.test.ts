import { test } from 'node:test';
import assert from 'node:assert/strict';
import { financialTerms, findFinancialTerm } from '../data/financialTerms';
test('glossary contains 20 distinct, complete, linked static definitions', () => {
  assert.equal(financialTerms.length,20); assert.equal(new Set(financialTerms.map(t=>t.id)).size,20);
  for (const term of financialTerms) { for (const [key,value] of Object.entries(term)) assert.ok(value.length > 0,key); for (const id of term.relatedTermIds) assert.ok(findFinancialTerm(id)); }
  assert.match(findFinancialTerm('pe')!.example,/20/); assert.equal(findFinancialTerm('unknown'),undefined);
});
