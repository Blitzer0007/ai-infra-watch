/** Bounded projection of already-loaded companyfacts. No I/O or valuation. */
import {forecastDay,forecastInstantMicros} from '../src/utils/forecastInputs.js';
import {councilPublicationWindow} from './councilAdmission.js';

export const SEC_STATEMENT_LIMITS=Object.freeze({rowsPerConcept:500,totalRows:2000,issues:80});
export const SEC_STATEMENT_FAILURES=Object.freeze(['not-configured','rate-limited','timeout','transport-error','no-data','unavailable']);
export const SEC_STATEMENT_CONCEPTS=Object.freeze([
  {metric:'cash_equivalents',namespace:'us-gaap',tag:'CashAndCashEquivalentsAtCarryingValue',unit:'USD',kind:'instant',label:'Cash and cash equivalents, carrying value',basis:'carrying-value-cash-and-equivalents'},
  {metric:'long_term_debt_current',namespace:'us-gaap',tag:'LongTermDebtCurrent',unit:'USD',kind:'instant',label:'Long-term debt, current portion — declared component',basis:'debt-component-scope-unverified'},
  {metric:'long_term_debt_noncurrent',namespace:'us-gaap',tag:'LongTermDebtNoncurrent',unit:'USD',kind:'instant',label:'Long-term debt, noncurrent — declared component',basis:'debt-component-scope-unverified'},
  {metric:'short_term_borrowings',namespace:'us-gaap',tag:'ShortTermBorrowings',unit:'USD',kind:'instant',label:'Short-term borrowings — declared component',basis:'debt-component-scope-unverified'},
  {metric:'common_shares_outstanding',namespace:'us-gaap',tag:'CommonStockSharesOutstanding',unit:'shares',kind:'instant',label:'Common shares outstanding at the declared date',basis:'point-in-time-common-shares'},
  {metric:'cover_page_shares_outstanding',namespace:'dei',tag:'EntityCommonStockSharesOutstanding',unit:'shares',kind:'instant',label:'Cover-page common shares at the declared date',basis:'point-in-time-cover-page-shares'},
  {metric:'weighted_average_basic_shares',namespace:'us-gaap',tag:'WeightedAverageNumberOfSharesOutstandingBasic',unit:'shares',kind:'annual-duration',label:'Weighted-average basic shares',basis:'duration-weighted-basic-shares'},
  {metric:'weighted_average_diluted_shares',namespace:'us-gaap',tag:'WeightedAverageNumberOfDilutedSharesOutstanding',unit:'shares',kind:'annual-duration',label:'Weighted-average diluted shares',basis:'duration-weighted-diluted-shares'},
  {metric:'basic_eps',namespace:'us-gaap',tag:'EarningsPerShareBasic',unit:'USD/shares',kind:'annual-duration',label:'Basic earnings per share',basis:'duration-basic-eps'},
  {metric:'diluted_eps',namespace:'us-gaap',tag:'EarningsPerShareDiluted',unit:'USD/shares',kind:'annual-duration',label:'Diluted earnings per share',basis:'duration-diluted-eps'},
].map(Object.freeze));
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const cik=v=>typeof v==='string'&&/^\d{1,10}$/.test(v)&&Number(v)>0?v.padStart(10,'0'):Number.isSafeInteger(v)&&v>0&&v<=9999999999?String(v).padStart(10,'0'):null;
const ROW_KEYS=new Set(['start','end','val','accn','fy','fp','form','filed','frame']);
const DAY=86400000;

/** Period is explicit. FY/FP below are filing focus, not the fact's fiscal year. */
export function buildSecStatementObservations(request){
  if(!exact(request,['symbol','expectedCik','assessedAt','retrievedAt','period','source'])||typeof request.symbol!=='string'||!/^[A-Z0-9.^=-]{1,20}$/.test(request.symbol)
    ||typeof request.expectedCik!=='string'||!/^\d{10}$/.test(request.expectedCik)||!cik(request.expectedCik)
    ||forecastInstantMicros(request.assessedAt)===null||(request.retrievedAt!==null&&forecastInstantMicros(request.retrievedAt)===null)
    ||!exact(request.period,['start','end'])||!forecastDay(request.period.end)
    ||(request.period.start!==null&&(!forecastDay(request.period.start)||(Date.parse(request.period.end)-Date.parse(request.period.start))/DAY<300||(Date.parse(request.period.end)-Date.parse(request.period.start))/DAY>400)))throw Error('Invalid statement scope');
  const kind=request.period.start===null?'instant':'annual-duration';
  const concepts=SEC_STATEMENT_CONCEPTS.filter(c=>c.kind===kind);
  const result={contractVersion:'sec-statement-observations-v1',symbol:request.symbol,cik:request.expectedCik,assessedAt:request.assessedAt,retrievedAt:null,
    requestedPeriod:{...request.period,kind},requestedMetrics:concepts.map(c=>c.metric),status:'invalid-payload',sourceStatus:'invalid-payload',observations:[],issues:[],missingMetrics:concepts.map(c=>c.metric),rowsInspected:0,
    unsupportedDerivedMetrics:['total-interest-bearing-debt','enterprise-value','ebitda','price-earnings','enterprise-value-ebitda'],
    sourceCoverage:'unverified',sourceAuthenticityVerified:false,issuerMappingVerified:false,simulationStatus:'not-established',grantsDecisionEligibility:false,grantsValuationEligibility:false,
    usageScope:'projection-only',usage:{providerCalls:0,modelCalls:0,databaseCalls:0}};
  const issue=(metric,code)=>{if(result.issues.length<SEC_STATEMENT_LIMITS.issues&&!result.issues.some(i=>i.metric===metric&&i.code===code))result.issues.push({metric,code});};
  const stop=(code,status='invalid-payload')=>{issue(null,code);result.status=status;result.observations=[];return result;};
  if(exact(request.source,['status'])&&SEC_STATEMENT_FAILURES.includes(request.source.status)){result.status=result.sourceStatus=request.source.status;return result;}
  if(!exact(request.source,['status','facts'])||request.source.status!=='loaded')return stop('INVALID_SOURCE_ENVELOPE');
  const retrieved=forecastInstantMicros(request.retrievedAt);
  if(retrieved===null)return stop('RETRIEVAL_UNAVAILABLE');
  if(retrieved>forecastInstantMicros(request.assessedAt))return stop('FUTURE_RETRIEVAL');
  result.retrievedAt=request.retrievedAt;
  const facts=request.source.facts;
  if(!object(facts)||cik(facts.cik)!==request.expectedCik)return stop(object(facts)?'ISSUER_MISMATCH':'INVALID_SOURCE');
  if(!object(facts.facts)||['us-gaap','dei'].some(ns=>Object.hasOwn(facts.facts,ns)&&!object(facts.facts[ns])))return stop('INVALID_SOURCE');
  if(Object.hasOwn(facts,'simulated')&&typeof facts.simulated!=='boolean')return stop('INVALID_SOURCE');
  if(facts.simulated===true){result.sourceStatus='loaded';result.simulationStatus='declared-simulated';return stop('SIMULATED_SOURCE','unavailable');}
  result.sourceStatus='loaded';result.status='unavailable';
  // Bound every recognized unit array, including unsupported units and periods.
  let total=0;
  for(const c of SEC_STATEMENT_CONCEPTS){
    const concept=facts.facts[c.namespace]?.[c.tag];if(concept===undefined)continue;
    if(!object(concept)||!object(concept.units))return stop('INVALID_UNIT_CONTAINER');
    if(Object.keys(concept.units).length>8)return stop('SOURCE_LIMIT');
    let conceptRows=0;
    for(const rows of Object.values(concept.units)){
      if(!Array.isArray(rows))return stop('INVALID_UNIT_CONTAINER');
      conceptRows+=rows.length;total+=rows.length;if(conceptRows>SEC_STATEMENT_LIMITS.rowsPerConcept||total>SEC_STATEMENT_LIMITS.totalRows)return stop('SOURCE_LIMIT');
    }
  }
  const filingMetadata=new Map();
  for(const c of concepts){
    const concept=facts.facts[c.namespace]?.[c.tag];
    if(!concept){issue(c.metric,'MISSING_CONCEPT');continue;}
    const rows=concept.units[c.unit];
    if(!rows){issue(c.metric,'UNSUPPORTED_OR_MISSING_UNIT');continue;}
    result.rowsInspected+=rows.length;
    const candidates=[];let badScope=false;
    for(const [index,row] of rows.entries()){
      // An unidentifiable record cannot silently disappear into an older success.
      if(!object(row)||!forecastDay(row.end)||(row.start!==undefined&&row.start!==null&&(!forecastDay(row.start)||row.start>row.end))){badScope=true;continue;}
      const start=row.start??null;
      if(start!==request.period.start||row.end!==request.period.end)continue;
      if(!forecastDay(row.filed)||typeof row.accn!=='string'||!/^\d{10}-\d{2}-\d{6}$/.test(row.accn)){badScope=true;continue;}
      candidates.push({row,index});
    }
    if(badScope){issue(c.metric,'VINTAGE_OR_PERIOD_UNRESOLVED');continue;}
    if(!candidates.length){issue(c.metric,'PERIOD_NOT_LOADED');continue;}
    const latestDay=candidates.reduce((day,{row})=>row.filed>day?row.filed:day,'');
    const newest=candidates.filter(({row})=>row.filed===latestDay);
    if(new Set(newest.map(({row})=>row.accn)).size!==1){issue(c.metric,'AMBIGUOUS_VINTAGE');continue;}
    const window=councilPublicationWindow(latestDay);
    if(!window){issue(c.metric,'PUBLICATION_PRECISION_UNSUPPORTED');continue;}
    if(forecastInstantMicros(window.latest_exclusive)>retrieved){issue(c.metric,'PUBLICATION_WINDOW_UNCLOSED');continue;}
    const accepted=[];
    for(const item of newest){
      const row=item.row;
      if(Object.keys(row).some(k=>!ROW_KEYS.has(k))){issue(c.metric,'UNSUPPORTED_ROW_FIELDS');continue;}
      const annual=['10-K','10-K/A'].includes(row.form)&&row.fp==='FY';
      const quarterly=kind==='instant'&&['10-Q','10-Q/A'].includes(row.form)&&['Q1','Q2','Q3'].includes(row.fp);
      if(!annual&&!quarterly){issue(c.metric,'UNSUPPORTED_FILING');continue;}
      if(!Number.isInteger(row.fy)||row.fy<1000||row.fy>9999){issue(c.metric,'FILING_FISCAL_LABEL_MISSING');continue;}
      if(row.end>row.filed){issue(c.metric,'TIME_ORDER_INVALID');continue;}
      if(typeof row.val!=='number'||!Number.isFinite(row.val)||(c.unit!=='USD/shares'&&row.val<0)){issue(c.metric,'INVALID_VALUE');continue;}
      if(Number.isInteger(row.val)&&!Number.isSafeInteger(row.val)){issue(c.metric,'NUMERIC_PRECISION_UNSUPPORTED');continue;}
      if(row.frame!==undefined&&(typeof row.frame!=='string'||!/^CY\d{4}(?:Q[1-4])?I?$/.test(row.frame))){issue(c.metric,'UNSUPPORTED_FRAME');continue;}
      accepted.push(item);
    }
    // A malformed newest duplicate/vintage invalidates the metric, never falls back.
    if(accepted.length!==newest.length)continue;
    const signature=({row})=>JSON.stringify([row.val,row.form,row.fy,row.fp,row.frame??null]);
    if(new Set(accepted.map(signature)).size!==1){issue(c.metric,'CONFLICTING_NEWEST_FACT');continue;}
    const {row,index}=accepted[0];
    const filing=JSON.stringify([row.filed,row.form,row.fy,row.fp]);
    if(filingMetadata.has(row.accn)&&filingMetadata.get(row.accn)!==filing)return stop('FILING_METADATA_CONFLICT');
    filingMetadata.set(row.accn,filing);
    const priorVintageCount=new Set(candidates.filter(item=>item.row.filed<latestDay).map(item=>item.row.filed+':'+item.row.accn)).size;
    result.observations.push({id:['sec',c.metric,row.accn,request.period.start??'instant',request.period.end].join(':'),symbol:request.symbol,cik:request.expectedCik,
      metric:c.metric,label:c.label,value:row.val,unit:c.unit,currency:c.unit==='shares'?null:'USD',measurementBasis:c.basis,
      period:{start:request.period.start,end:request.period.end,kind,fiscalYear:null,fiscalPeriod:null},
      filing:{accession:row.accn,form:row.form,filedOn:row.filed,filingFiscalYear:row.fy,filingFiscalPeriod:row.fp,calendarFrame:row.frame??null,
        revisionStatus:row.form.endsWith('/A')?'amendment-declared':priorVintageCount?'later-vintage-selected':'not-established',priorVintageCount,priorValuesCompared:false},
      sourceLocator:{namespace:c.namespace,tag:c.tag,unit:c.unit,rowIndex:index},sourceId:'sec-edgar-companyfacts',reportingBasis:'declared-'+c.namespace,
      sourceReference:{kind:'constructed-companyfacts-and-accession',companyfactsUrl:`https://data.sec.gov/api/xbrl/companyfacts/CIK${request.expectedCik}.json`,
        filingIndexUrl:`https://www.sec.gov/Archives/edgar/data/${Number(request.expectedCik)}/${row.accn.replaceAll('-','')}/${row.accn}-index.html`,originalSourceUrl:null,originalDocumentRetained:false},
      retrievedAt:request.retrievedAt,publishedAt:null,observedAt:null,publicationWindow:{...window},timeProvenance:'caller-declared',
      adjustmentBasis:'unknown',valuePrecision:'not-supplied',dimensionalScope:'not-established',simulationStatus:'not-established',
      aggregationEligibility:false,sourceAuthenticityVerified:false,issuerMappingVerified:false,grantsDecisionEligibility:false,grantsValuationEligibility:false});
  }
  if(new Set(result.observations.map(o=>o.filing.accession)).size>1)issue(null,'MIXED_FILING_VINTAGES');
  result.missingMetrics=concepts.map(c=>c.metric).filter(metric=>!result.observations.some(o=>o.metric===metric));
  if(result.observations.length)result.status='partial';
  else issue(null,'NO_SUPPORTED_OBSERVATIONS');
  return result;
}
