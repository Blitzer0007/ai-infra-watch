import { test } from 'node:test';
import assert from 'node:assert/strict';
import { financialTerms, findFinancialTerm } from '../data/financialTerms';
test('glossary contains 22 distinct, complete, linked static definitions', () => {
  assert.equal(financialTerms.length,22); assert.equal(new Set(financialTerms.map(t=>t.id)).size,22);
  for (const term of financialTerms) { for (const [key,value] of Object.entries(term)) assert.ok(value.length > 0,key); for (const id of term.relatedTermIds) assert.ok(findFinancialTerm(id)); }
  assert.match(findFinancialTerm('pe')!.example,/20/); assert.equal(findFinancialTerm('unknown'),undefined);
});
test('glossary search is case insensitive, local, and returns empty results safely', async () => {
  const { searchFinancialTerms } = await import('../data/financialTerms');
  assert.equal(searchFinancialTerms('  FoRwArD P/E ')[0].id,'forward-pe');
  assert.equal(searchFinancialTerms('not-a-real-term').length,0);
  assert.equal(searchFinancialTerms('').length,22);
});
test('new valuation definitions preserve denominator, share-basis and capital-scope caveats',()=>{
  const eps=findFinancialTerm('eps-growth')!,ev=findFinancialTerm('ev-ebitda')!,pe=findFinancialTerm('pe')!;
  assert.match(eps.detailedExplanation,/zero baseline makes the percentage undefined/);assert.match(eps.detailedExplanation,/negative baseline/);assert.match(eps.commonMisinterpretation,/loss-to-profit/i);assert.match(eps.example,/20%/);
  assert.match(ev.detailedExplanation,/preferred equity or noncontrolling interests/);assert.match(ev.detailedExplanation,/Zero or negative EBITDA/);assert.match(ev.commonMisinterpretation,/liabilities are not total debt/);assert.match(pe.detailedExplanation,/fiscal year is not automatically trailing twelve months/);
  assert(findFinancialTerm('eps')!.relatedTermIds.includes('eps-growth'));
});
