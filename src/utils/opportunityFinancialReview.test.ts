import test from 'node:test';
import assert from 'node:assert/strict';
import {fictionalSecDossier} from '../../qa/fixtures/sec-dossier.fictional.mjs';
import {admitSecDossierPayload,secDossierFailureMessage} from './secDossierConnection';
import {opportunityFinancialReview} from './opportunityFinancialReview';
const load=(packet=fictionalSecDossier())=>admitSecDossierPayload('DEMO',{ok:true,cacheStatus:'miss',packet})!;

test('Opportunities review preserves annual source rows, negative income and distinct periods without granting eligibility',()=>{
  const connection=load(),before=JSON.stringify(connection),r=opportunityFinancialReview('DEMO',connection);
  assert.equal(r.status,'partial');assert.equal(r.periods.length,2);
  const latest=r.periods.find(p=>p.end==='2025-12-31')!;
  assert(latest.rows.some(o=>o.metric==='net_income_loss'&&o.value===-8));
  assert(latest.rows.some(o=>o.metric==='operating_cash_flow'));assert(latest.rows.some(o=>o.metric==='ppe_payments'));
  assert.equal(r.grantsResearchEligibility,false);assert.equal(r.grantsDecisionEligibility,false);assert.equal(r.aggregationEligibility,false);
  assert(latest.rows.every(o=>o.aggregationEligibility===false));assert.equal(JSON.stringify(connection),before);
  assert(!JSON.stringify(r).includes('free_cash_flow_usd'));assert.deepEqual(latest.missing,[]);
});
test('missing financial declarations stay missing rather than acquiring zero values or calculations',()=>{
  const p=fictionalSecDossier();delete p.facts.facts['us-gaap'].NetCashProvidedByUsedInOperatingActivities;
  const r=opportunityFinancialReview('DEMO',load(p)),latest=r.periods[0];
  assert(latest.missing.includes('Operating cash flow'));assert(!latest.rows.some(o=>o.metric==='operating_cash_flow'));
  assert.equal(opportunityFinancialReview('DEMO',null).status,'not-loaded');
});
test('mismatched scopes, forged receipts or promoted verification claims withhold the review',()=>{
  for(const edit of [(c:any)=>c.symbol='OTHER',(c:any)=>c.cik='0000000002',(c:any)=>c.assetClass='equity',(c:any)=>c.issuerMappingVerified=true,(c:any)=>c.grantsDecisionEligibility=true,(c:any)=>c.request=null,(c:any)=>c.operations.entries[0].receipt.observations[0].value++]){
    const c=load();edit(c);const r=opportunityFinancialReview('DEMO',c);assert.equal(r.status,'invalid');assert.deepEqual(r.periods,[]);
  }
});
test('conflicting newest declarations are withheld while alternative revenue definitions remain separate',()=>{
  const p=fictionalSecDossier(),gaap=p.facts.facts['us-gaap'];
  gaap.NetIncomeLoss.units.USD.push({...gaap.NetIncomeLoss.units.USD[0],val:999});
  gaap.Revenues=structuredClone(gaap.RevenueFromContractWithCustomerExcludingAssessedTax);
  gaap.Revenues.units.USD[0].val=200;
  const latest=opportunityFinancialReview('DEMO',load(p)).periods[0];
  assert(!latest.rows.some(o=>o.metric==='net_income_loss'));assert(latest.missing.includes('Net income (loss)'));
  assert.equal(latest.rows.filter(o=>['revenues_declared','revenue_contract_excluding_tax'].includes(o.metric)).length,2);
  assert(!latest.rows.some(o=>o.value===320));
});
test('unknown and prototype-named API failure codes have only the fixed fallback explanation',()=>{
  const expected='SEC financial acquisition is unavailable. No automatic retry will run.';
  for(const code of [undefined,{},['NO_DATA'],'constructor','__proto__','toString','private-detail'])assert.equal(secDossierFailureMessage(code),expected);
  assert.match(secDossierFailureMessage('CONTACT_NOT_CONFIGURED'),/SEC contact configuration/);
});
