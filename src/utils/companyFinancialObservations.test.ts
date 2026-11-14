import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCompanyFinancialObservations,financialSourceFailures,type FinancialObservationRequest} from './companyFinancialObservations';
import {adaptSecCouncilFacts} from '../../server/utils/councilSecAdapter.js';
const fixture=()=>JSON.parse(readFileSync('qa/fixtures/council-sec.fictional.json','utf8'));
const receipt=(facts=fixture(),retrievedAt='2026-11-09T12:00:00Z')=>adaptSecCouncilFacts({symbol:'FICT',expectedCik:'0000000001',facts,retrievedAt});
const request=(r:unknown=receipt()):FinancialObservationRequest=>({symbol:'FICT',cik:'0000000001',assessedAt:'2026-11-14T12:00:00Z',source:{status:'loaded',receipt:r}});
const find=(r:ReturnType<typeof buildCompanyFinancialObservations>,metric:string)=>r.observations.filter(o=>o.metric===metric);

describe('company financial observations from loaded declarations',()=>{
  it('projects the existing source calculations without recalculating or replacing definitions',()=>{
    const r=buildCompanyFinancialObservations(request());assert.equal(r.status,'partial');assert.equal(r.sourceStatus,'loaded');assert.equal(r.observations.length,11);
    assert.deepEqual(find(r,'revenue').map(o=>o.value).sort((a,b)=>a-b),[100,120]);
    for(const [metric,value,unit] of [['revenue_growth_pct',20,'percent'],['operating_margin_pct',20,'percent'],['free_cash_flow_usd',-5,'USD'],['liabilities_equity',2,'ratio']]){
      const o=find(r,String(metric))[0];assert.equal(o.value,value);assert.equal(o.unit,unit);assert.equal(o.kind,'derived');assert.equal(o.inputs.length,2);
      assert.equal(o.currency,unit==='USD'?'USD':null);assert.equal(o.inputCurrency,'USD');
    }
    assert.equal(find(r,'liabilities_equity')[0].label,'Total liabilities / stockholders’ equity');assert.equal(find(r,'debt_equity').length,0);
    assert.deepEqual(r.usage,{providerCalls:0,modelCalls:0,databaseCalls:0});assert.equal(r.usageScope,'projection-only');assert(r.observations.every(o=>o.sourceId==='sec-edgar-companyfacts'));assert.equal(r.grantsDecisionEligibility,false);assert.equal(r.sourceAuthenticityVerified,false);assert.equal(r.issuerMappingVerified,false);assert.equal(r.sourceCoverage,'unverified');
  });
  it('keeps duration and instant periods distinct without inventing fiscal metadata',()=>{
    const r=buildCompanyFinancialObservations(request());const flow=find(r,'free_cash_flow_usd')[0],balance=find(r,'liabilities')[0];
    assert.deepEqual(flow.period,{start:'2025-01-01',end:'2025-12-31',scope:'annual-duration',fiscalYear:null,fiscalPeriod:null});
    assert.deepEqual(balance.period,{start:null,end:'2025-12-31',scope:'instant',fiscalYear:null,fiscalPeriod:null});
    for(const o of r.observations){assert.equal(o.publishedAt,null);assert.equal(o.observedAt,null);assert.equal(o.adjustmentBasis,'unknown');assert.equal(o.reportingBasis,'declared-sec-input');assert.equal(o.grantsDecisionEligibility,false);}
  });
  it('retains original filed day with a constructed reference and conservative availability window',()=>{
    const o=find(buildCompanyFinancialObservations(request()),'revenue_growth_pct')[0],ref=o.references[0];
    assert.equal(ref.filedOn,'2026-02-20');assert.equal(ref.publishedAt,null);assert.equal(ref.publicationPrecision,'date-only');assert.equal(ref.referenceKind,'constructed-accession-index');
    assert.equal(ref.url,'https://www.sec.gov/Archives/edgar/data/1/000000000126000001/0000000001-26-000001-index.html');
    assert.equal(ref.publicationWindow.earliest,'2026-02-19T10:00:00.000Z');assert.equal(ref.publicationWindow.latest_exclusive,'2026-02-21T12:00:00.000Z');
    assert.equal(ref.restatementStatus,'not-established');assert.equal(o.references.length,1);
  });
  for(const [at,allowed] of [['2026-02-20T23:59:59Z',false],['2026-02-21T11:59:59.999999Z',false],['2026-02-21T12:00:00Z',true],['2026-02-21T12:00:00.000001Z',true]] as const)it(`requires the complete date-only envelope to close by ${at}`,()=>{
    const r=buildCompanyFinancialObservations(request(receipt(fixture(),at)));
    assert.equal(r.observations.length>0,allowed);if(!allowed){assert.equal(r.status,'unavailable');assert(r.issues.includes('PUBLICATION_WINDOW_UNCLOSED'));}
  });
  it('rejects future retrieval at microsecond precision',()=>{
    const r=buildCompanyFinancialObservations({...request(receipt(fixture(),'2026-11-14T12:00:00.000001Z')),assessedAt:'2026-11-14T12:00:00Z'});
    assert.equal(r.status,'invalid-payload');assert.equal(r.observations.length,0);assert(r.issues.includes('FUTURE_RETRIEVAL'));
  });
  for(const status of financialSourceFailures)it(`preserves ${status} independently of an empty financial history`,()=>{
    const r=buildCompanyFinancialObservations({...request(),source:{status}});assert.equal(r.status,status);assert.equal(r.sourceStatus,status);assert.deepEqual(r.observations,[]);assert.equal(r.sourceCoverage,'unverified');
  });
  it('does not turn a loaded receipt without supported observations into complete source coverage',()=>{
    const facts=fixture();facts.facts['us-gaap']={};const r=buildCompanyFinancialObservations(request(receipt(facts)));
    assert.equal(r.sourceStatus,'loaded');assert.equal(r.status,'unavailable');assert.equal(r.observations.length,0);assert(r.issues.includes('MISSING_INPUT'));assert(r.issues.includes('NO_SUPPORTED_OBSERVATIONS'));
  });
  for(const [key,value] of [['symbol','OTHER'],['cik','0000000002']] as const)it(`binds the requested ${key}`,()=>{
    const r=buildCompanyFinancialObservations({...request(),[key]:value});assert.equal(r.status,'invalid-payload');assert(r.issues.includes('ISSUER_MISMATCH'));
  });
  it('retains a declared amendment without asserting a non-amendment was never restated',()=>{
    const facts=fixture();for(const concept of Object.values(facts.facts['us-gaap']) as any[])for(const row of concept.units.USD)row.form='10-K/A';
    const r=buildCompanyFinancialObservations(request(receipt(facts)));assert.equal(r.observations.length,11);assert(r.observations.every(o=>o.references.every(ref=>ref.restatementStatus==='amendment-declared')));
  });
  it('retains negative operating cash flow/free cash flow and genuine observed zero',()=>{
    const facts=fixture();facts.facts['us-gaap'].NetCashProvidedByUsedInOperatingActivities.units.USD[0].val=-10;
    facts.facts['us-gaap'].OperatingIncomeLoss.units.USD[0].val=0;facts.facts['us-gaap'].Liabilities.units.USD[0].val=0;
    const r=buildCompanyFinancialObservations(request(receipt(facts)));assert.equal(find(r,'operating_cash_flow')[0].value,-10);assert.equal(find(r,'free_cash_flow_usd')[0].value,-25);assert.equal(find(r,'operating_margin_pct')[0].value,0);assert.equal(find(r,'liabilities_equity')[0].value,0);
  });
  it('withholds unsupported valuation inputs and never substitutes liabilities for interest-bearing debt',()=>{
    const r=buildCompanyFinancialObservations(request());assert.deepEqual(r.unsupportedMetrics,['cash','interest-bearing-debt','shares','earnings-per-share','ebitda','price-earnings','enterprise-value-ebitda']);
    assert(r.observations.every(o=>!['debt_equity','enterprise-value-ebitda','price-earnings'].includes(o.metric)));
  });
  for(const changes of [{source_authenticity_verified:true},{private:'not retained'},{status:'complete'}])it(`rejects widened source declarations ${JSON.stringify(changes)}`,()=>{
    const r=buildCompanyFinancialObservations(request({...receipt(),...changes}));assert.equal(r.status,'invalid-payload');assert.equal(r.observations.length,0);assert(!JSON.stringify(r).includes('not retained'));
  });
  it('rejects changed formulas, input units, widened facts and duplicate source methods',()=>{
    const variants=[receipt(),receipt(),receipt(),receipt()];variants[0].observations[0].evidence.value=99;variants[1].observations[0].inputs[0].unit='EUR';variants[2].observations[0].inputs[0].private='not retained';variants[3].observations.push(variants[3].observations[0]);
    for(const v of variants){const r=buildCompanyFinancialObservations(request(v));assert.equal(r.status,'invalid-payload');assert.deepEqual(r.observations,[]);}
  });
  it('fails closed on contradictory fatal source issues rather than projecting their observations',()=>{
    const r=buildCompanyFinancialObservations(request({...receipt(),issues:['ISSUER_MISMATCH']}));assert.equal(r.status,'invalid-payload');assert.equal(r.observations.length,0);
  });
  it('withholds invalid or mismatched periods through the original adapter instead of inventing comparisons',()=>{
    const facts=fixture();facts.facts['us-gaap'].OperatingIncomeLoss.units.USD[0].start='2025-02-01';const r=buildCompanyFinancialObservations(request(receipt(facts)));
    assert.equal(find(r,'operating_margin_pct').length,0);assert(r.issues.includes('MISSING_INPUT'));assert.equal(find(r,'revenue_growth_pct')[0].value,20);
  });
  for(const [tag,index,value,metric,reason] of [
    ['Revenues',1,0,'revenue_growth_pct','NONPOSITIVE_DENOMINATOR'],['StockholdersEquity',0,0,'liabilities_equity','NONPOSITIVE_DENOMINATOR'],
    ['StockholdersEquity',0,-1,'liabilities_equity','NONPOSITIVE_DENOMINATOR'],['PaymentsToAcquirePropertyPlantAndEquipment',0,-1,'free_cash_flow_usd','INVALID_CAPEX'],
  ] as const)it(`retains the original ${reason} gate for ${tag} = ${value}`,()=>{
    const facts=fixture();facts.facts['us-gaap'][tag].units.USD[index].val=value;const r=buildCompanyFinancialObservations(request(receipt(facts)));
    assert.equal(find(r,metric).length,0);assert(r.issues.includes(reason));
  });
  it('does not combine numerator and denominator from different filing vintages',()=>{
    const facts=fixture();facts.facts['us-gaap'].OperatingIncomeLoss.units.USD[0].accn='0000000001-26-000002';const r=buildCompanyFinancialObservations(request(receipt(facts)));
    assert.equal(find(r,'operating_margin_pct').length,0);assert(r.issues.includes('PERIOD_ALIGNMENT'));
  });
  for(const bad of [null,{},[],{status:'loaded'},{status:'loaded',receipt:null},{status:'timeout',private:'not retained'}])it('sanitizes invalid source envelopes',()=>{
    const r=buildCompanyFinancialObservations({...request(),source:bad as any});assert.equal(r.status,'invalid-payload');assert(!JSON.stringify(r).includes('not retained'));
  });
  it('does not mutate inputs or retain their object references',()=>{
    const source=receipt(),before=JSON.stringify(source),r=buildCompanyFinancialObservations(request(source));assert.equal(JSON.stringify(source),before);
    r.observations[0].inputs[0].value=999;assert.equal(JSON.stringify(source),before);
  });
  for(const changes of [{symbol:'fict'},{cik:'1'},{assessedAt:'2026-11-14'},{assessedAt:'2026-02-30T00:00:00Z'}])it('rejects invalid scope without echoing it',()=>assert.throws(()=>buildCompanyFinancialObservations({...request(),...changes}),/^Error: Invalid financial scope$/));
});
