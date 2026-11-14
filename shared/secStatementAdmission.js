/** Independent original-row admission. Shares policy constants, never calls producer. */
import {SEC_STATEMENT_CONCEPTS,SEC_STATEMENT_FAILURES,SEC_STATEMENT_LIMITS} from './secStatementObservations.js';
import {forecastDay,forecastInstantMicros} from '../src/utils/forecastInputs.js';
import {councilPublicationWindow} from './councilAdmission.js';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const originalCik=v=>typeof v==='string'&&/^\d{1,10}$/.test(v)&&Number(v)>0?v.padStart(10,'0'):typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<1e10?String(v).padStart(10,'0'):null;
const unsupported=['total-interest-bearing-debt','enterprise-value','ebitda','price-earnings','enterprise-value-ebitda'];
const allowedRow=new Set(['start','end','val','accn','fy','fp','form','filed','frame']);
function equal(a,b,depth=0){
  if(depth>16)return false;
  if(a===b)return true;
  if(Array.isArray(b))return Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>equal(a[i],v,depth+1));
  if(object(b))return exact(a,Object.keys(b))&&Object.keys(b).every(k=>equal(a[k],b[k],depth+1));
  return false;
}

function audit(request){
  if(!exact(request,['symbol','expectedCik','assessedAt','retrievedAt','period','source'])||typeof request.symbol!=='string'||!/^[A-Z0-9.^=-]{1,20}$/.test(request.symbol)
    ||typeof request.expectedCik!=='string'||!/^\d{10}$/.test(request.expectedCik)||originalCik(request.expectedCik)===null
    ||forecastInstantMicros(request.assessedAt)===null||(request.retrievedAt!==null&&forecastInstantMicros(request.retrievedAt)===null)
    ||!exact(request.period,['start','end'])||!forecastDay(request.period.end))return null;
  const p=request.period;
  if(p.start!==null&&(!forecastDay(p.start)||(Date.parse(p.end)-Date.parse(p.start))<300*86400000||(Date.parse(p.end)-Date.parse(p.start))>400*86400000))return null;
  const kind=p.start===null?'instant':'annual-duration',specs=SEC_STATEMENT_CONCEPTS.filter(c=>c.kind===kind);
  const out={contractVersion:'sec-statement-observations-v1',symbol:request.symbol,cik:request.expectedCik,assessedAt:request.assessedAt,retrievedAt:null,
    requestedPeriod:{start:p.start,end:p.end,kind},requestedMetrics:specs.map(c=>c.metric),status:'invalid-payload',sourceStatus:'invalid-payload',observations:[],issues:[],missingMetrics:specs.map(c=>c.metric),rowsInspected:0,
    unsupportedDerivedMetrics:[...unsupported],sourceCoverage:'unverified',sourceAuthenticityVerified:false,issuerMappingVerified:false,simulationStatus:'not-established',grantsDecisionEligibility:false,grantsValuationEligibility:false,
    usageScope:'projection-only',usage:{providerCalls:0,modelCalls:0,databaseCalls:0}};
  const finding=(metric,code)=>{if(out.issues.length<SEC_STATEMENT_LIMITS.issues&&!out.issues.find(i=>i.metric===metric&&i.code===code))out.issues.push({metric,code});};
  const reject=(code,status='invalid-payload')=>{finding(null,code);out.status=status;out.observations=[];return out;};
  if(exact(request.source,['status'])&&SEC_STATEMENT_FAILURES.includes(request.source.status)){out.status=out.sourceStatus=request.source.status;return out;}
  if(!exact(request.source,['status','facts'])||request.source.status!=='loaded')return reject('INVALID_SOURCE_ENVELOPE');
  const acquired=forecastInstantMicros(request.retrievedAt);
  if(acquired===null)return reject('RETRIEVAL_UNAVAILABLE');
  if(acquired>forecastInstantMicros(request.assessedAt))return reject('FUTURE_RETRIEVAL');
  out.retrievedAt=request.retrievedAt;
  const raw=request.source.facts;
  if(!object(raw)||originalCik(raw.cik)!==request.expectedCik)return reject(object(raw)?'ISSUER_MISMATCH':'INVALID_SOURCE');
  if(!object(raw.facts)||['us-gaap','dei'].some(ns=>Object.hasOwn(raw.facts,ns)&&!object(raw.facts[ns])))return reject('INVALID_SOURCE');
  if(Object.hasOwn(raw,'simulated')&&typeof raw.simulated!=='boolean')return reject('INVALID_SOURCE');
  if(raw.simulated===true){out.sourceStatus='loaded';out.simulationStatus='declared-simulated';return reject('SIMULATED_SOURCE','unavailable');}
  out.sourceStatus='loaded';out.status='unavailable';
  let budget=0;
  for(const spec of SEC_STATEMENT_CONCEPTS){
    const concept=raw.facts[spec.namespace]?.[spec.tag];if(concept===undefined)continue;
    if(!object(concept)||!object(concept.units))return reject('INVALID_UNIT_CONTAINER');
    const arrays=Object.values(concept.units);
    if(arrays.length>8)return reject('SOURCE_LIMIT');
    if(arrays.some(rows=>!Array.isArray(rows)))return reject('INVALID_UNIT_CONTAINER');
    const count=arrays.reduce((n,rows)=>n+rows.length,0);budget+=count;
    if(count>SEC_STATEMENT_LIMITS.rowsPerConcept||budget>SEC_STATEMENT_LIMITS.totalRows)return reject('SOURCE_LIMIT');
  }
  const filings=new Map();
  for(const spec of specs){
    const concept=raw.facts[spec.namespace]?.[spec.tag];
    if(!concept){finding(spec.metric,'MISSING_CONCEPT');continue;}
    const records=concept.units[spec.unit];if(!records){finding(spec.metric,'UNSUPPORTED_OR_MISSING_UNIT');continue;}
    out.rowsInspected+=records.length;
    const malformed=records.some(r=>!object(r)||!forecastDay(r.end)||(r.start!==undefined&&r.start!==null&&(!forecastDay(r.start)||r.start>r.end))
      ||((r.start??null)===p.start&&r.end===p.end&&(!forecastDay(r.filed)||typeof r.accn!=='string'||!/^\d{10}-\d{2}-\d{6}$/.test(r.accn))));
    if(malformed){finding(spec.metric,'VINTAGE_OR_PERIOD_UNRESOLVED');continue;}
    const candidates=records.map((row,index)=>({row,index})).filter(({row})=>(row.start??null)===p.start&&row.end===p.end)
      .sort((a,b)=>a.row.filed===b.row.filed?a.index-b.index:a.row.filed>b.row.filed?-1:1);
    if(!candidates.length){finding(spec.metric,'PERIOD_NOT_LOADED');continue;}
    const current=candidates.filter(c=>c.row.filed===candidates[0].row.filed);
    if(current.some(c=>c.row.accn!==current[0].row.accn)){finding(spec.metric,'AMBIGUOUS_VINTAGE');continue;}
    const window=councilPublicationWindow(current[0].row.filed);
    if(!window){finding(spec.metric,'PUBLICATION_PRECISION_UNSUPPORTED');continue;}
    if(acquired<forecastInstantMicros(window.latest_exclusive)){finding(spec.metric,'PUBLICATION_WINDOW_UNCLOSED');continue;}
    let rejected=false;
    for(const {row} of current){
      let reason=null;
      if(Object.keys(row).some(k=>!allowedRow.has(k)))reason='UNSUPPORTED_ROW_FIELDS';
      else if(!(['10-K','10-K/A'].includes(row.form)&&row.fp==='FY')&&!(kind==='instant'&&['10-Q','10-Q/A'].includes(row.form)&&['Q1','Q2','Q3'].includes(row.fp)))reason='UNSUPPORTED_FILING';
      else if(!Number.isInteger(row.fy)||row.fy<1000||row.fy>9999)reason='FILING_FISCAL_LABEL_MISSING';
      else if(row.end>row.filed)reason='TIME_ORDER_INVALID';
      else if(typeof row.val!=='number'||!Number.isFinite(row.val)||(spec.unit!=='USD/shares'&&row.val<0))reason='INVALID_VALUE';
      else if(Number.isInteger(row.val)&&!Number.isSafeInteger(row.val))reason='NUMERIC_PRECISION_UNSUPPORTED';
      else if(row.frame!==undefined&&(typeof row.frame!=='string'||!/^CY\d{4}(?:Q[1-4])?I?$/.test(row.frame)))reason='UNSUPPORTED_FRAME';
      if(reason){rejected=true;finding(spec.metric,reason);}
    }
    if(rejected)continue;
    const {row,index}=current[0];
    if(current.some(c=>c.row.val!==row.val||c.row.form!==row.form||c.row.fy!==row.fy||c.row.fp!==row.fp||(c.row.frame??null)!==(row.frame??null))){finding(spec.metric,'CONFLICTING_NEWEST_FACT');continue;}
    const filing=[row.filed,row.form,row.fy,row.fp];
    if(filings.has(row.accn)&&!equal(filings.get(row.accn),filing))return reject('FILING_METADATA_CONFLICT');
    filings.set(row.accn,filing);
    const prior=new Set(candidates.filter(c=>c.row.filed<row.filed).map(c=>c.row.filed+':'+c.row.accn)).size;
    out.observations.push({id:['sec',spec.metric,row.accn,p.start??'instant',p.end].join(':'),symbol:request.symbol,cik:request.expectedCik,
      metric:spec.metric,label:spec.label,value:row.val,unit:spec.unit,currency:spec.unit==='shares'?null:'USD',measurementBasis:spec.basis,
      period:{start:p.start,end:p.end,kind,fiscalYear:null,fiscalPeriod:null},
      filing:{accession:row.accn,form:row.form,filedOn:row.filed,filingFiscalYear:row.fy,filingFiscalPeriod:row.fp,calendarFrame:row.frame??null,
        revisionStatus:row.form.endsWith('/A')?'amendment-declared':prior?'later-vintage-selected':'not-established',priorVintageCount:prior,priorValuesCompared:false},
      sourceLocator:{namespace:spec.namespace,tag:spec.tag,unit:spec.unit,rowIndex:index},sourceId:'sec-edgar-companyfacts',reportingBasis:'declared-'+spec.namespace,
      sourceReference:{kind:'constructed-companyfacts-and-accession',companyfactsUrl:`https://data.sec.gov/api/xbrl/companyfacts/CIK${request.expectedCik}.json`,
        filingIndexUrl:`https://www.sec.gov/Archives/edgar/data/${Number(request.expectedCik)}/${row.accn.replaceAll('-','')}/${row.accn}-index.html`,originalSourceUrl:null,originalDocumentRetained:false},
      retrievedAt:request.retrievedAt,publishedAt:null,observedAt:null,publicationWindow:{...window},timeProvenance:'caller-declared',adjustmentBasis:'unknown',valuePrecision:'not-supplied',dimensionalScope:'not-established',simulationStatus:'not-established',
      aggregationEligibility:false,sourceAuthenticityVerified:false,issuerMappingVerified:false,grantsDecisionEligibility:false,grantsValuationEligibility:false});
  }
  if(filings.size>1)finding(null,'MIXED_FILING_VINTAGES');
  out.missingMetrics=specs.map(s=>s.metric).filter(m=>!out.observations.some(o=>o.metric===m));
  if(out.observations.length)out.status='partial';else finding(null,'NO_SUPPORTED_OBSERVATIONS');
  return out;
}

export function validateSecStatementReceipt(request,receipt){
  const base={contractVersion:'sec-statement-admission-v1',status:'invalid',snapshot:null,reason:'STATEMENT_RECEIPT_NOT_BOUND',verifiesSourceRecords:false,issuerMappingVerified:false,grantsDecisionEligibility:false,grantsValuationEligibility:false,aggregationEligibility:false,usageScope:'validation-only',usage:{providerCalls:0,modelCalls:0,databaseCalls:0}};
  try{
    const expected=audit(request);
    if(!expected||!equal(receipt,expected))return base;
    return {...base,status:expected.status==='partial'?'conditional':'needs-data',snapshot:expected,reason:expected.status==='partial'?'ORIGINAL_INPUTS_BOUND':'INPUTS_UNAVAILABLE'};
  }catch{return base;}
}
