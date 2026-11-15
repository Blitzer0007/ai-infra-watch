import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSecOperatingObservations,buildSecStatementObservations} from '../../shared/secStatementObservations.js';
import {admitDossierOperating,reviewDossierOperating,type DossierOperatingPacket} from './dossierOperating';
import {fictionalDossierRequest,fictionalDossierStatements,fictionalDossierOperations} from '../components/portfolio/CompanyDossierPreview';
import {dossierFinancials} from './companyDossier';
import {reviewDossierValuation} from './dossierValuation';
const packet=():DossierOperatingPacket=>{
  const base={symbol:'FICT',expectedCik:'0000000001',assessedAt:fictionalDossierRequest.assessedAt,retrievedAt:'2026-11-09T12:00:00Z',source:{status:'loaded',facts:JSON.parse(readFileSync('qa/fixtures/dossier-operating.fictional.json','utf8'))}};
  return {contractVersion:'company-dossier-operating-v1',...base,entries:[2025,2024].map(y=>{const period={start:y+'-01-01',end:y+'-12-31'};return {period,receipt:buildSecOperatingObservations({...base,period})};})};
};
const raw=(p:DossierOperatingPacket)=>(p.source as any).facts.facts['us-gaap'];
function rebuild(p:DossierOperatingPacket){p.entries=p.entries.map(e=>({...e,receipt:buildSecOperatingObservations({symbol:p.symbol,expectedCik:p.expectedCik,assessedAt:p.assessedAt,retrievedAt:p.retrievedAt,source:p.source,period:e.period})}));return p;}
const review=(p:unknown=packet(),core:unknown=fictionalDossierStatements())=>reviewDossierOperating('FICT',fictionalDossierRequest,core,p);
describe('annual dossier consumer and cross-source presentation',()=>{
  it('binds both annual receipts, folds two matching visible declarations and preserves unknown scope',()=>{
    const r=review(),v=r.operating;assert.equal(v.status,'conditional');assert.equal(v.boundCount,14);assert.equal(v.foldedCount,2);assert.equal(v.rows.length,12);assert.equal(v.sourceRows.length,14);assert.equal(v.definitionOverlapCount,2);assert.equal(v.periods.length,2);assert.equal(v.scope,'FICT|0000000001|2026-11-14T12:00:00Z');assert.equal(v.rows.find(o=>o.metric==='net_income_loss')?.value,-8);assert.equal(v.grantsDecisionEligibility,false);assert.equal(v.grantsValuationEligibility,false);assert.equal(v.sourceAuthenticityVerified,false);assert.equal(r.valuation.pe.value,null);
    assert(v.rows.some(o=>o.metric==='operating_income_loss'&&o.period.end==='2025-12-31')); // Matching input is not an existing source card.
  });
  it('leaves the existing financial and valuation views unchanged when no operating packet is supplied',()=>{
    const r=review(null);assert.equal(r.operating.status,'not-connected');assert.deepEqual(r.financials,dossierFinancials('FICT',fictionalDossierRequest));assert.deepEqual(r.valuation,reviewDossierValuation('FICT',fictionalDossierRequest,fictionalDossierStatements()));
  });
  it('rejects forged receipts, identity/assessment widening and private fields atomically',()=>{
    for(const edit of [(p:any)=>p.entries[0].receipt.observations[0].value=999,(p:any)=>p.entries[0].receipt.grantsDecisionEligibility=true,(p:any)=>p.symbol='NVDA',(p:any)=>p.expectedCik='0000000002',(p:any)=>p.assessedAt='2026-11-14T12:00:01Z',(p:any)=>p.private='private-do-not-echo']){const p=packet();edit(p);const r=review(p);assert.equal(r.operating.status,'invalid');assert.deepEqual(r.operating.sourceRows,[]);assert.deepEqual(r.operating.rows,[]);assert(!JSON.stringify(r).includes('private-do-not-echo'));assert.equal(r.financials.snapshot?.observations.length,11);}
  });
  it('rejects duplicate, oversized, instant or malformed/cyclic period identifiers',()=>{
    for(const edit of [(p:any)=>p.entries.push(...p.entries),(p:any)=>p.entries[1]=p.entries[0],(p:any)=>p.entries[0].period.start=null,(p:any)=>p.entries[0].period.start=1n,(p:any)=>{const cycle:any={};cycle.self=cycle;p.entries[0].period.end=cycle;}]){const p=packet();edit(p);assert.equal(review(p).operating.status,'invalid');}
  });
  for(const status of ['not-configured','rate-limited','timeout','transport-error','no-data','unavailable'])it(`replaces annual figures with explicit ${status} coverage and leaves other scopes intact`,()=>{
    const p=packet();p.source={status};p.retrievedAt=null;const r=review(rebuild(p));assert.equal(r.operating.status,'needs-data');assert.equal(r.operating.sourceRows.length,0);assert(r.operating.periods.every(s=>s.sourceStatus===status&&s.retrievedAt===null));assert.equal(r.financials.snapshot?.observations.length,11);assert.equal(r.valuation.statementAdmission.status,'conditional');
  });
  it('withholds invalid source payloads and cross-period filing conflicts before comparison',()=>{
    const p=packet();raw(p).NetIncomeLoss.units.EUR=Array(501).fill(raw(p).NetIncomeLoss.units.USD[0]);assert.equal(review(rebuild(p)).operating.status,'invalid');
    const q=packet();for(const concept of Object.values(raw(q)) as any[])concept.units.USD[1].fy=2024;assert.equal(review(rebuild(q)).operating.status,'invalid');
  });
  it('withholds a conflicting income figure and every legacy calculation that uses it',()=>{
    const p=packet();raw(p).OperatingIncomeLoss.units.USD[0].val=991;const r=review(rebuild(p));assert.equal(r.operating.status,'conflicting');assert(r.operating.conflicts.some(c=>c.kind==='field'));assert(!r.operating.sourceRows.some(o=>o.sourceLocator.tag==='OperatingIncomeLoss'&&o.period.end==='2025-12-31'));assert(!r.financials.snapshot?.observations.some(o=>o.metric==='operating_income'||o.metric==='operating_margin_pct'));assert(r.financials.snapshot?.observations.some(o=>o.metric==='revenue_growth_pct'));assert(!JSON.stringify(r).includes('"value":991'));assert.equal(r.valuation.statementAdmission.status,'conditional');
  });
  it('withholds cash-flow conflicts and their derived FCF without substituting balance-sheet cash',()=>{
    const p=packet();raw(p).NetCashProvidedByUsedInOperatingActivities.units.USD[0].val=992;const r=review(rebuild(p));assert(!r.financials.snapshot?.observations.some(o=>o.metric==='operating_cash_flow'||o.metric==='free_cash_flow_usd'));assert(!r.operating.sourceRows.some(o=>o.metric==='operating_cash_flow'&&o.period.end==='2025-12-31'));assert.equal(r.valuation.statementAdmission.snapshots[0].observations.find(o=>o.metric==='cash_equivalents')?.value,25);assert(!JSON.stringify(r).includes('"value":992'));
  });
  it('detects the independent native demo cash-flow differences instead of silently reconciling them',()=>{
    const p=packet();p.source={status:'loaded',facts:JSON.parse(readFileSync('scripts/fixtures/sec-operating.fictional/companyfacts.json','utf8'))};const r=review(rebuild(p));assert.equal(r.operating.status,'conflicting');assert.equal(r.operating.withheldCount,2);assert(!r.financials.snapshot?.observations.some(o=>o.metric==='free_cash_flow_usd'));
  });
  it('treats a changed filing vintage as unreconciled instead of choosing a newer source',()=>{
    const p=packet(),row=raw(p).OperatingIncomeLoss.units.USD[0];row.accn='0000000001-26-000002';row.filed='2026-03-01';const r=review(rebuild(p));assert.equal(r.operating.status,'conflicting');assert(!r.operating.rows.some(o=>o.metric==='operating_income_loss'&&o.period.end==='2025-12-31'));assert(!r.financials.snapshot?.observations.some(o=>o.metric==='operating_margin_pct'));
  });
  it('folds matching visible revenue declarations but never merges different revenue definitions',()=>{
    const p=packet();raw(p).Revenues=structuredClone(raw(p).RevenueFromContractWithCustomerExcludingAssessedTax);const r=review(rebuild(p));assert.equal(r.operating.foldedCount,4);assert.equal(r.operating.definitionOverlapCount,2);assert(!r.operating.rows.some(o=>o.metric==='revenues_declared'));assert(r.operating.rows.some(o=>o.metric==='revenue_contract_excluding_tax'));
    const q=packet();raw(q).RevenueFromContractWithCustomerExcludingAssessedTax.units.USD[0].val=141;const t=review(rebuild(q));assert.equal(t.operating.status,'conditional');assert(t.operating.rows.some(o=>o.value===141));assert(t.financials.snapshot?.observations.some(o=>o.metric==='revenue_growth_pct'&&o.value===20));
  });
  it('does not let an agreeing revenue alternative hide a same-tag revenue conflict',()=>{
    const p=packet();raw(p).Revenues={units:{USD:[{...raw(p).RevenueFromContractWithCustomerExcludingAssessedTax.units.USD[0],val:993}]}};const r=review(rebuild(p));assert.equal(r.operating.status,'conflicting');assert(!r.financials.snapshot?.observations.some(o=>['revenue_growth_pct','operating_margin_pct'].includes(o.metric)));assert(!r.operating.sourceRows.some(o=>o.metric==='revenues_declared'));assert(r.operating.rows.some(o=>o.metric==='revenue_contract_excluding_tax'));assert(!JSON.stringify(r).includes('"value":993'));
  });
  it('withholds all implicated filing figures, including core share/EPS/cash cards and valuation checks',()=>{
    const p=packet();for(const concept of Object.values(raw(p)) as any[])for(const row of concept.units.USD)row.filed='2026-03-01';const r=review(rebuild(p));assert.equal(r.operating.status,'conflicting');assert(r.operating.conflicts.some(c=>c.kind==='filing'));assert.equal(r.operating.sourceRows.length,0);assert.equal(r.financials.snapshot?.observations.length,0);assert.equal(r.financials.status,'invalid-payload');assert.equal(r.valuation.statementAdmission.status,'invalid');assert.equal(r.valuation.statementAdmission.snapshots.length,0);assert.equal(r.valuation.pe.checks.find(c=>c.id==='eps')?.status,'missing');assert.equal(r.valuation.pe.value,null);
  });
  it('compares declared filing-focus metadata across the two raw profiles without inventing legacy fiscal labels',()=>{
    const p=packet();for(const concept of Object.values(raw(p)) as any[])for(const row of concept.units.USD)row.fy=2024;const r=review(rebuild(p));assert.equal(r.operating.status,'conflicting');assert.equal(r.valuation.statementAdmission.status,'invalid');
    const withoutCore=review(rebuild(p),null);assert.equal(withoutCore.operating.status,'conditional'); // Legacy has no supplied FY/FP, so no fiscal label is inferred.
  });
  for(const change of ['cik','assessment'])it(`withholds cross-profile ${change} disagreement even without a legacy financial reference`,()=>{
    const core=fictionalDossierStatements();if(change==='cik'){core.expectedCik='0000000002';(core.source as any).facts.cik=2;}else core.assessedAt='2026-11-14T12:00:01Z';
    core.entries=core.entries.map(e=>({...e,receipt:buildSecStatementObservations({symbol:core.symbol,expectedCik:core.expectedCik,assessedAt:core.assessedAt,retrievedAt:core.retrievedAt,source:core.source,period:e.period})}));
    const r=reviewDossierOperating('FICT',null,core,packet());assert.equal(r.operating.status,'conflicting');assert(r.operating.conflicts.some(c=>c.kind==='scope'));assert.equal(r.operating.sourceRows.length,0);assert.equal(r.valuation.statementAdmission.status,'invalid');assert.equal(r.valuation.statementAdmission.snapshots.length,0);
  });
  it('preserves zero and signed values independently of missing concepts or formulas',()=>{
    const p=packet();raw(p).NetIncomeLoss.units.USD[0].val=0;raw(p).DepreciationDepletionAndAmortization.units.USD[0].val=-2;const r=review(rebuild(p));assert(r.operating.rows.some(o=>o.metric==='net_income_loss'&&o.value===0));assert(r.operating.rows.some(o=>o.metric==='depreciation_depletion_amortization'&&o.value===-2));assert.equal(r.valuation.evEbitda.value,null);assert(!r.operating.rows.some(o=>o.metric==='ebitda'));
  });
  it('keeps independently admitted annual inputs when the separate legacy source is unavailable',()=>{
    const p=packet(),r=reviewDossierOperating('FICT',{...fictionalDossierRequest,source:{status:'timeout'}},null,p);assert.equal(r.financials.status,'timeout');assert.equal(r.operating.status,'conditional');assert.equal(r.operating.rows.length,14);assert.equal(r.operating.foldedCount,0);
  });
  it('does not read network, storage, ambient time or mutate caller-owned objects',t=>{
    const p=packet(),before=JSON.stringify(p);t.mock.method(globalThis,'fetch',()=>{throw Error('Network forbidden');});t.mock.method(Date,'now',()=>{throw Error('Clock forbidden');});const r=review(p);r.operating.rows[0].value=999;assert.equal(JSON.stringify(p),before);assert.equal(review(p).operating.rows[0].value,120);
  });
  it('keeps fixture originals identical and isolates each preview inspection',()=>{
    assert.deepEqual(JSON.parse(readFileSync('src/data/companyOperating.fictional.json','utf8')),JSON.parse(readFileSync('qa/fixtures/dossier-operating.fictional.json','utf8')));const a=fictionalDossierOperations();raw(a).NetIncomeLoss.units.USD[0].val=999;assert.equal(review(a).operating.status,'invalid');assert.equal(review(fictionalDossierOperations()).operating.boundCount,14);
  });
});
