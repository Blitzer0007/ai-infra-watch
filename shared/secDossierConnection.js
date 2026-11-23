/** Join supplied SEC documents deterministically. No I/O or eligibility upgrade. */
import {forecastDay,forecastInstantMicros} from '../src/utils/forecastInputs.js';
import {SEC_OPERATING_CONCEPTS,SEC_STATEMENT_CONCEPTS,SEC_STATEMENT_LIMITS,buildSecOperatingObservations,buildSecStatementObservations} from './secStatementObservations.js';

export const SEC_DOSSIER_LIMITS=Object.freeze({bytes:3000000,upstreamBytes:16000000,directoryRows:20000,tickers:100,annualPeriods:2});
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const cik=v=>(typeof v==='string'&&/^\d{1,10}$/.test(v)||Number.isSafeInteger(v)&&v>0&&v<=9999999999)&&Number(v)>0?String(v).padStart(10,'0'):null;
const fail=code=>({status:'unavailable',code,connection:null});
const registry=[...SEC_STATEMENT_CONCEPTS,...SEC_OPERATING_CONCEPTS];

/** Retain every row/unit of recognized concepts; never trim bad or newer rows. */
export function retainDossierFacts(input){
  if(!object(input)||!cik(input.cik)||!object(input.facts)||input.simulated===true)return null;
  const facts={};let total=0;
  for(const ns of ['us-gaap','dei'])if(Object.hasOwn(input.facts,ns)&&!object(input.facts[ns]))return null;
  for(const {namespace,tag} of registry){
    const c=input.facts[namespace]?.[tag];if(c===undefined)continue;
    if(!object(c)||!object(c.units)||Object.keys(c.units).length>8)return null;
    let count=0;
    for(const rows of Object.values(c.units)){
      if(!Array.isArray(rows))return null;
      count+=rows.length;total+=rows.length;
      if(count>SEC_STATEMENT_LIMITS.rowsPerConcept||total>SEC_STATEMENT_LIMITS.totalRows)return null;
    }
    facts[namespace]??={};facts[namespace][tag]={units:structuredClone(c.units)};
  }
  return {cik:input.cik,...(input.simulated!==undefined?{simulated:input.simulated}:{}),facts};
}

export function connectSecDossierSources(symbol,input){
  if(typeof symbol!=='string'||!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)||!exact(input,['contractVersion','symbol','assessedAt','retrievedAt','directory','submissions','facts'])||input.contractVersion!=='sec-dossier-sources-v1'||input.symbol!==symbol)return fail('INVALID_PACKET');
  const at=forecastInstantMicros(input.assessedAt),retrieved=forecastInstantMicros(input.retrievedAt);
  if(at===null||retrieved===null||retrieved>at)return fail('INVALID_TIME');
  if(!Array.isArray(input.directory)||input.directory.length>SEC_DOSSIER_LIMITS.directoryRows)return fail('INVALID_DIRECTORY');
  const matches=input.directory.filter(row=>object(row)&&row.ticker===symbol);
  if(matches.length!==1||!cik(matches[0].cik_str))return fail('ISSUER_UNRESOLVED');
  const expectedCik=cik(matches[0].cik_str),s=input.submissions;
  if(!object(s)||cik(s.cik)!==expectedCik||!Array.isArray(s.tickers)||s.tickers.length>SEC_DOSSIER_LIMITS.tickers||s.tickers.some(t=>typeof t!=='string'||t.length>30)||s.tickers.filter(t=>t===symbol).length!==1)return fail('ISSUER_MISMATCH');
  if(!object(input.facts)||cik(input.facts.cik)!==expectedCik)return fail('ISSUER_MISMATCH');
  const facts=retainDossierFacts(input.facts);if(!facts)return fail('SOURCE_LIMIT_OR_INVALID');
  const source={status:'loaded',facts},base={symbol,expectedCik,assessedAt:input.assessedAt,retrievedAt:input.retrievedAt,source};
  const annual=new Map(),instant=new Set();
  for(const c of registry)for(const row of facts.facts[c.namespace]?.[c.tag]?.units?.[c.unit]??[]){
    if(!object(row)||!forecastDay(row.end))continue;
    if(c.kind==='instant'&&(row.start===null||row.start===undefined))instant.add(row.end);
    if(c.kind==='annual-duration'&&forecastDay(row.start)){
      const days=(Date.parse(row.end)-Date.parse(row.start))/86400000;
      if(days>=300&&days<=400)annual.set(row.start+'>'+row.end,{start:row.start,end:row.end});
    }
  }
  const periods=[...annual.values()].sort((a,b)=>b.end.localeCompare(a.end)||b.start.localeCompare(a.start)).slice(0,SEC_DOSSIER_LIMITS.annualPeriods);
  const instantEnds=[...instant].sort().reverse().slice(0,2);
  const statementPeriods=[...instantEnds.map(end=>({start:null,end})),...periods.slice(0,1)];
  const statements=statementPeriods.length?{contractVersion:'company-dossier-statements-v2',...base,entries:statementPeriods.map(period=>({period,receipt:buildSecStatementObservations({...base,period})}))}:null;
  const operations=periods.length?{contractVersion:'company-dossier-operating-v1',...base,entries:periods.map(period=>({period,receipt:buildSecOperatingObservations({...base,period})}))}:null;
  const count=[...(statements?.entries??[]),...(operations?.entries??[])].reduce((n,e)=>n+e.receipt.observations.length,0);
  const request={symbol,cik:expectedCik,assessedAt:input.assessedAt,source:{status:'loaded',receipt:{contract_version:'council-sec-v1',symbol,cik:expectedCik,retrieved_at:input.retrievedAt,status:'unavailable',observations:[],issues:['MISSING_INPUT'],source_authenticity_verified:false}}};
  return {status:count?'partial':'unavailable',code:count?'DECLARATIONS_LOADED':'NO_SUPPORTED_OBSERVATIONS',connection:{symbol,cik:expectedCik,
    name:typeof s.name==='string'&&s.name.length<=240?s.name:null,retrievedAt:input.retrievedAt,assessedAt:input.assessedAt,
    mappingBasis:'matching-sec-directory-and-submissions-declarations',assetClass:'unknown',sourceAuthenticityVerified:false,issuerMappingVerified:false,
    grantsDecisionEligibility:false,grantsValuationEligibility:false,request,statements,operations,
    urls:{directory:'https://www.sec.gov/files/company_tickers.json',submissions:`https://data.sec.gov/submissions/CIK${expectedCik}.json`,companyfacts:`https://data.sec.gov/api/xbrl/companyfacts/CIK${expectedCik}.json`}}};
}
