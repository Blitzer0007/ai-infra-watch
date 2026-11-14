import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dossierFinancials,dossierObservations,formatDossierValue,DOSSIER_SECTIONS} from './companyDossier';
import {financialSourceFailures,type FinancialObservationRequest} from './companyFinancialObservations';
import {adaptSecCouncilFacts} from '../../server/utils/councilSecAdapter.js';
const receipt=()=>JSON.parse(readFileSync('src/data/companyDossier.fictional.json','utf8'));
const request=():FinancialObservationRequest=>({symbol:'FICT',cik:'0000000001',assessedAt:'2026-11-14T12:00:00Z',source:{status:'loaded',receipt:receipt()}});
describe('read-only company dossier presentation boundary',()=>{
  it('keeps the bundled invented receipt bound to the existing source adapter',()=>{
    assert.deepEqual(receipt(),adaptSecCouncilFacts({symbol:'FICT',expectedCik:'0000000001',facts:JSON.parse(readFileSync('qa/fixtures/council-sec.fictional.json','utf8')),retrievedAt:'2026-11-09T12:00:00Z'}));
  });
  it('does not invent a CIK, statements or zeros for an unconnected holding',()=>{
    assert.deepEqual(dossierFinancials('NVDA',null),{status:'not-configured',snapshot:null});
    assert.deepEqual(dossierObservations(null,'Growth'),[]);
  });
  it('withholds a receipt from another displayed symbol',()=>assert.deepEqual(dossierFinancials('NVDA',request()),{status:'invalid-payload',snapshot:null}));
  for(const symbol of ['', 'fict', null,123])it(`withholds invalid displayed identity ${symbol}`,()=>assert.equal(dossierFinancials(symbol as any,request()).snapshot,null));
  for(const input of [undefined,[],{}, {symbol:'FICT',source:{status:'loaded',receipt:{private:'not retained'}}}])it('sanitizes malformed request states without rendering their contents',()=>{
    const r=dossierFinancials('FICT',input as any);assert.equal(r.status,'invalid-payload');assert(!JSON.stringify(r).includes('not retained'));
  });
  for(const status of financialSourceFailures)it(`preserves ${status} in the presentation contract`,()=>{
    const r=dossierFinancials('FICT',{...request(),source:{status}});assert.equal(r.status,status);assert.deepEqual(dossierObservations(r.snapshot,'Growth'),[]);
  });
  it('partitions financial periods without adding scores, estimates or valuation multiples',()=>{
    const r=dossierFinancials('FICT',request());assert.equal(r.status,'partial');
    assert.equal(dossierObservations(r.snapshot,'Growth').length,4);assert.equal(dossierObservations(r.snapshot,'Financial health').length,6);
    for(const section of ['Valuation','Catalysts','Risks','Overview','Sources'] as const)assert.deepEqual(dossierObservations(r.snapshot,section),[]);
    assert.equal(r.snapshot?.grantsDecisionEligibility,false);assert.equal(r.snapshot?.issuerMappingVerified,false);
    assert.deepEqual(DOSSIER_SECTIONS,['Overview','Growth','Financial health','Valuation','Catalysts','Risks','Sources']);
  });
  for(const [value,unit,expected] of [[0,'USD','0 USD'],[-0,'USD','0 USD'],[-5,'USD','-5 USD'],[20,'percent','20%'],[2,'ratio','2 ratio'],[1e-10,'USD','1.0000e-10 USD'],[-1e-10,'percent','-1.0000e-10%']] as const)it(`preserves units and nonzero precision for ${value} ${unit}`,()=>assert.equal(formatDossierValue(value,unit),expected));
  for(const value of [NaN,Infinity,null,true,'0'])it('never renders malformed amounts as observed zero',()=>assert.equal(formatDossierValue(value as any,'USD'),'Unavailable'));
  it('rejects unsupported display units',()=>assert.equal(formatDossierValue(2,'EUR' as any),'Unavailable'));
});
