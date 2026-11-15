import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildSecOperatingObservations,buildSecStatementObservations,SEC_OPERATING_CONCEPTS,SEC_STATEMENT_FAILURES} from '../../shared/secStatementObservations.js';
import {validateSecOperatingReceipt,validateSecStatementReceipt} from '../../shared/secStatementAdmission.js';
const facts=()=>JSON.parse(readFileSync('scripts/fixtures/sec-operating.fictional/companyfacts.json'));
const request=(year=2025)=>({symbol:'FICT',expectedCik:'0000000001',assessedAt:'2026-11-14T12:00:00Z',retrievedAt:'2026-11-09T12:00:00Z',period:{start:year+'-01-01',end:year+'-12-31'},source:{status:'loaded',facts:facts()}});
const rows=(r,tag='NetIncomeLoss')=>r.source.facts.facts['us-gaap'][tag].units.USD;
function checked(r){const receipt=buildSecOperatingObservations(r),a=validateSecOperatingReceipt(r,receipt);assert.notEqual(a.status,'invalid');assert.deepEqual(a.snapshot,receipt);return receipt;}
function invalid(r,receipt){const a=validateSecOperatingReceipt(r,receipt);assert.equal(a.status,'invalid');assert.equal(a.snapshot,null);assert.equal(a.grantsDecisionEligibility,false);assert.equal(a.grantsValuationEligibility,false);return a;}
describe('annual SEC operating declarations, independent from core v1 scope',()=>{
  it('projects seven supplied declarations and leaves two alternative revenue tags missing',()=>{
    const s=checked(request());assert.equal(s.contractVersion,'sec-operating-observations-v1');assert.equal(s.status,'partial');assert.equal(s.observations.length,7);assert.equal(s.requestedMetrics.length,9);assert.equal(s.rowsInspected,14);assert.equal(s.missingMetrics.length,2);assert(s.missingMetrics.includes('revenues_declared'));assert(s.missingMetrics.includes('net_sales_declared'));assert(s.observations.every(o=>o.unit==='USD'&&o.currency==='USD'&&o.period.kind==='annual-duration'));
  });
  it('retains exact original rows, filing focus and unknown financial context',()=>{
    const s=checked(request(2024)),o=s.observations.find(o=>o.metric==='net_income_loss');assert.equal(o.value,12);assert.equal(o.sourceLocator.rowIndex,1);assert.equal(o.filing.filingFiscalYear,2025);assert.equal(o.period.fiscalYear,null);assert.equal(o.period.fiscalPeriod,null);assert.equal(o.period.end,'2024-12-31');assert.equal(o.adjustmentBasis,'unknown');assert.equal(o.dimensionalScope,'not-established');assert.equal(o.sourceReference.originalDocumentRetained,false);assert.equal(o.sourceAuthenticityVerified,false);assert.equal(o.issuerMappingVerified,false);
  });
  it('keeps revenue alternatives separate instead of selecting, combining or substituting a preferred tag',()=>{
    const r=request(),original=rows(r,'RevenueFromContractWithCustomerExcludingAssessedTax');r.source.facts.facts['us-gaap'].Revenues={units:{USD:[{...original[0],val:140}]}};r.source.facts.facts['us-gaap'].SalesRevenueNet={units:{USD:[{...original[0],val:130}]}};
    const s=checked(r);assert.equal(s.observations.length,9);assert.equal(s.observations.filter(o=>['revenue_contract_excluding_tax','revenues_declared','net_sales_declared'].includes(o.metric)).length,3);assert(!s.observations.some(o=>o.value===390));assert.equal(s.aggregationEligibility,false);assert(s.observations.every(o=>o.aggregationEligibility===false));
  });
  for(const tag of ['RevenueFromContractWithCustomerExcludingAssessedTax','OperatingIncomeLoss','NetIncomeLoss','NetCashProvidedByUsedInOperatingActivities','DepreciationDepletionAndAmortization','ShareBasedCompensation'])it(`preserves signed and observed-zero ${tag} declarations without an eligibility grant`,()=>{
    for(const value of [-3,0,1e-10]){const r=request();rows(r,tag)[0].val=value;const s=checked(r),o=s.observations.find(o=>o.sourceLocator.tag===tag);assert.equal(o.value,value);assert.equal(o.grantsValuationEligibility,false);assert.equal(o.grantsDecisionEligibility,false);assert.equal(o.aggregationEligibility,false);}
  });
  it('requires nonnegative PP&E payments but retains a reported zero',()=>{
    for(const value of [-1,0]){const r=request();rows(r,'PaymentsToAcquirePropertyPlantAndEquipment')[0].val=value;const s=checked(r);assert.equal(s.observations.some(o=>o.metric==='ppe_payments'),value===0);if(value<0)assert(s.issues.some(i=>i.code==='INVALID_VALUE'));}
  });
  it('never derives EBITDA, growth, margins or free cash flow from raw declarations',()=>{
    const s=checked(request());assert.equal(s.observations.find(o=>o.metric==='net_income_loss').value,-8);for(const id of ['ebitda','revenue-growth','operating-margin','free-cash-flow'])assert(s.unsupportedDerivedMetrics.includes(id));assert(!s.observations.some(o=>['ebitda','free_cash_flow_usd','revenue_growth_pct','operating_margin_pct'].includes(o.metric)));assert.equal(s.grantsValuationEligibility,false);
  });
  for(const status of SEC_STATEMENT_FAILURES)it(`preserves ${status} with no invented retrieval or monetary declarations`,()=>{
    const r={...request(),retrievedAt:null,source:{status}},s=checked(r);assert.equal(s.status,status);assert.equal(s.retrievedAt,null);assert.deepEqual(s.observations,[]);assert.equal(validateSecOperatingReceipt(r,s).status,'needs-data');
  });
  it('requires an explicit annual duration and rejects instant, quarterly/YTD, invalid or widened scopes',()=>{
    for(const period of [{start:null,end:'2025-12-31'},{start:'2025-10-01',end:'2025-12-31'},{start:'2025-01-01',end:'2025-06-30'},{start:'2025-02-30',end:'2025-12-31'}]){const r={...request(),period};assert.throws(()=>buildSecOperatingObservations(r));invalid(r,{});}
    const r=request();r.profile='core';assert.throws(()=>buildSecOperatingObservations(r));invalid(r,{});
  });
  it('does not promote quarterly filings, unsupported taxonomy, or EUR units into annual USD facts',()=>{
    const r=request();rows(r)[0].form='10-Q';rows(r)[0].fp='Q2';const s=checked(r);assert(!s.observations.some(o=>o.metric==='net_income_loss'));
    const q=request();q.source.facts.facts['ifrs-full']=q.source.facts.facts['us-gaap'];delete q.source.facts.facts['us-gaap'];assert.equal(checked(q).observations.length,0);
    const t=request();t.source.facts.facts['us-gaap'].NetIncomeLoss.units={EUR:rows(t)};assert(!checked(t).observations.some(o=>o.metric==='net_income_loss'));
  });
  it('does not accept a quarterly/instant calendar frame as an annual operating context',()=>{
    for(const frame of ['CY2025Q1','CY2025Q4I','CY2025I']){const r=request();rows(r)[0].frame=frame;const s=checked(r);assert(!s.observations.some(o=>o.metric==='net_income_loss'));assert(s.issues.some(i=>i.code==='UNSUPPORTED_FRAME'));}
  });
  it('preserves issuer/simulation failures and labels expense/adjustment statement context unverified',()=>{
    const r=request();r.source.facts.cik=2;assert.equal(checked(r).observations.length,0);const q=request();q.source.facts.simulated=true;assert.equal(checked(q).simulationStatus,'declared-simulated');assert.equal(checked(q).observations.length,0);
    const s=checked(request());for(const tag of ['DepreciationDepletionAndAmortization','ShareBasedCompensation']){const row=s.observations.find(o=>o.sourceLocator.tag===tag);assert.match(row.label,/context unverified/);assert.match(row.measurementBasis,/context-unverified/);assert.equal(row.dimensionalScope,'not-established');}
  });
  it('withholds malformed or unsupported newest records without falling back to an older successful declaration',()=>{
    for(const patch of [{val:null},{val:true},{val:'100'},{val:Infinity},{val:Number.MAX_SAFE_INTEGER+1},{form:'10-Q',fp:'Q2'},{fy:null},{frame:'unknown'},{private:'do-not-echo'}]){const r=request();rows(r).push({...rows(r)[0],filed:'2026-03-01',accn:'0000000001-26-000002',...patch});const s=checked(r);assert(!s.observations.some(o=>o.metric==='net_income_loss'));assert(!JSON.stringify(s).includes('do-not-echo'));}
  });
  it('retains newest-vintage ambiguity, duplicates and amendment metadata',()=>{
    const r=request();rows(r).push({...rows(r)[0]});assert.equal(checked(r).observations.filter(o=>o.metric==='net_income_loss').length,1);rows(r)[2].val=-9;assert(!checked(r).observations.some(o=>o.metric==='net_income_loss'));
    const q=request();rows(q).push({...rows(q)[0],filed:'2026-03-01',accn:'0000000001-26-000002',form:'10-K/A'});const o=checked(q).observations.find(o=>o.metric==='net_income_loss');assert.equal(o.filing.revisionStatus,'amendment-declared');assert.equal(o.filing.priorValuesCompared,false);
  });
  it('checks publication uncertainty, future microsecond retrieval and unclosed new vintages',()=>{
    const r=request();r.retrievedAt='2026-02-20T00:00:00Z';assert.equal(checked(r).observations.length,0);
    const q=request();q.retrievedAt='2026-11-14T12:00:00.000001Z';assert.equal(checked(q).status,'invalid-payload');
    const t=request();rows(t).push({...rows(t)[0],filed:'2026-11-09',accn:'0000000001-26-000002'});assert(!checked(t).observations.some(o=>o.metric==='net_income_loss'));
  });
  it('withholds a whole snapshot on conflicting shared-accession metadata',()=>{
    const r=request();rows(r)[0].fy=2024;const s=checked(r);assert.equal(s.status,'invalid-payload');assert.equal(s.observations.length,0);assert(s.issues.some(i=>i.code==='FILING_METADATA_CONFLICT'));
  });
  it('independently rejects changed originals, normalized values, periods, locators and private fields',()=>{
    const r=request(),s=buildSecOperatingObservations(r);for(const change of [v=>v.observations[0].value++,v=>v.observations[0].period.end='2024-12-31',v=>v.observations[0].sourceLocator.rowIndex++,v=>v.observations[0].measurementBasis='ebitda',v=>v.observations[0].filing.filingFiscalYear=2024,v=>v.observations[0].sourceReference.originalDocumentRetained=true,v=>v.grantsValuationEligibility=true,v=>v.private='do-not-echo']){const v=structuredClone(s);change(v);assert(!JSON.stringify(invalid(r,v)).includes('do-not-echo'));}
    rows(r)[0].val=-99;invalid(r,s);
  });
  it('cannot substitute an operating receipt for the core contract in either validator',()=>{
    const r=request(),operating=buildSecOperatingObservations(r),core=buildSecStatementObservations(r);invalid(r,core);assert.equal(validateSecStatementReceipt(r,operating).status,'invalid');
    const relabelled={...operating,contractVersion:'sec-statement-observations-v1'};assert.equal(validateSecStatementReceipt(r,relabelled).status,'invalid');
  });
  it('bounds unsupported units and all recognized operating tags before projecting any values',()=>{
    const r=request();r.source.facts.facts['us-gaap'].NetIncomeLoss.units.EUR=Array(501).fill(rows(r)[0]);assert.equal(checked(r).status,'invalid-payload');
    const q=request();for(const tag of ['OperatingIncomeLoss','NetIncomeLoss','NetCashProvidedByUsedInOperatingActivities','PaymentsToAcquirePropertyPlantAndEquipment','DepreciationDepletionAndAmortization'])q.source.facts.facts['us-gaap'][tag].units.USD=Array(401).fill(rows(q,tag)[0]);assert.equal(checked(q).observations.length,0);
  });
  it('keeps every existing core-v1 normalized field byte-compatible with the pre-extension baseline',()=>{
    const base={...request(),source:{status:'loaded',facts:JSON.parse(readFileSync('qa/fixtures/sec-statements.fictional.json')).facts}};
    const snapshots=[{start:null,end:'2025-12-31'},{start:'2025-01-01',end:'2025-12-31'},{start:null,end:'2026-02-10'}].map(period=>buildSecStatementObservations({...base,period}));
    assert.equal(createHash('sha256').update(JSON.stringify(snapshots)).digest('hex'),'9d856c9561bb40adcbf97c2e8f5d5dfcc37a0d7437156568acdcb92f8265296a');
  });
  it('does not let unrelated operating concepts widen the core-v1 budgets or result',()=>{
    const r={...request(),source:{status:'loaded',facts:JSON.parse(readFileSync('qa/fixtures/sec-statements.fictional.json')).facts}},before=buildSecStatementObservations(r);r.source.facts.facts['us-gaap'].NetIncomeLoss={units:{USD:Array(501).fill(rows(request())[0])}};assert.deepEqual(buildSecStatementObservations(r),before);
  });
  it('uses no network or ambient clock and returns fresh independently reconstructed objects',t=>{
    const r=request(),before=JSON.stringify(r);t.mock.method(globalThis,'fetch',()=>{throw Error('Network forbidden');});t.mock.method(Date,'now',()=>{throw Error('Clock forbidden');});const s=buildSecOperatingObservations(r),a=validateSecOperatingReceipt(r,s);assert.equal(a.status,'conditional');a.snapshot.observations[0].value=999;assert.notEqual(a.snapshot.observations[0].value,s.observations[0].value);assert.equal(JSON.stringify(r),before);assert.deepEqual(s.usage,{providerCalls:0,modelCalls:0,databaseCalls:0});assert.equal(SEC_OPERATING_CONCEPTS.length,9);
  });
});
