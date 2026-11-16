/** Offline projection of already-loaded SEC receipts. No provider/model/DB I/O. */
import {secCouncilReceipt} from '../../shared/councilSources.js';
import {councilPublicationWindow} from '../../shared/councilAdmission.js';
import {forecastInstant,forecastInstantMicros} from './forecastInputs.js';

export const financialSourceFailures=['not-configured','rate-limited','timeout','transport-error','no-data','unavailable'] as const;
type Failure=typeof financialSourceFailures[number];
type Fact={tag:string;accession:string;form:'10-K'|'10-K/A';period_start:string|null;period_end:string;filed_on:string;value:number;unit:'USD'};
type Receipt={symbol:string;cik:string;retrieved_at:string;status:'partial'|'unavailable';issues:string[];observations:{method:string;evidence:{metric:string;value:number;unit:'USD'|'percent'|'ratio';period_start:string|null;period_end:string};inputs:Fact[]}[]};
export type FinancialObservationRequest={symbol:string;cik:string;assessedAt:string;source:{status:'loaded';receipt:unknown}|{status:Failure}};
export const financialMetricLabels={
  revenue:'Revenue',operating_income:'Operating income',operating_cash_flow:'Operating cash flow',capital_expenditure:'Payments for property, plant and equipment',
  liabilities:'Total liabilities',stockholders_equity:'Stockholders’ equity',revenue_growth_pct:'Revenue growth versus the adjacent annual period',
  operating_margin_pct:'Operating income / revenue',free_cash_flow_usd:'Operating cash flow less property, plant and equipment payments',liabilities_equity:'Total liabilities / stockholders’ equity',
} as const;
type Metric=keyof typeof financialMetricLabels;
const tags:Record<string,Metric>={RevenueFromContractWithCustomerExcludingAssessedTax:'revenue',Revenues:'revenue',SalesRevenueNet:'revenue',OperatingIncomeLoss:'operating_income',
  NetCashProvidedByUsedInOperatingActivities:'operating_cash_flow',PaymentsToAcquirePropertyPlantAndEquipment:'capital_expenditure',Liabilities:'liabilities',StockholdersEquity:'stockholders_equity'};
type Reference={cik:string;accession:string;form:'10-K'|'10-K/A';filedOn:string;publicationPrecision:'date-only';publishedAt:null;
  publicationWindow:NonNullable<ReturnType<typeof councilPublicationWindow>>;url:string;referenceKind:'constructed-accession-index';restatementStatus:'amendment-declared'|'not-established'};
export type CompanyFinancialObservation={id:string;metric:Metric;label:string;value:number;unit:'USD'|'percent'|'ratio';currency:'USD'|null;inputCurrency:'USD';
  sourceId:'sec-edgar-companyfacts';
  kind:'source-field-declaration'|'derived';reportingBasis:'declared-sec-input';period:{start:string|null;end:string;scope:'annual-duration'|'instant';fiscalYear:null;fiscalPeriod:null};
  retrievedAt:string;observedAt:null;publishedAt:null;adjustmentBasis:'unknown';simulated:false;method:string|null;inputs:Fact[];references:Reference[];
  sourceAuthenticityVerified:false;issuerMappingVerified:false;grantsDecisionEligibility:false};
export type CompanyFinancialSnapshot={contractVersion:'company-financial-observations-v1';symbol:string;cik:string;assessedAt:string;status:'partial'|Failure|'invalid-payload';
  sourceStatus:'loaded'|Failure|'invalid-payload';observations:CompanyFinancialObservation[];issues:string[];
  unsupportedMetrics:readonly ['cash','interest-bearing-debt','shares','earnings-per-share','ebitda','price-earnings','enterprise-value-ebitda'];
  sourceCoverage:'unverified';sourceAuthenticityVerified:false;issuerMappingVerified:false;grantsDecisionEligibility:false;usageScope:'projection-only';usage:{providerCalls:0;modelCalls:0;databaseCalls:0}};
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fatal=new Set(['ISSUER_MISMATCH','INVALID_SOURCE','SOURCE_LIMIT']);

export function buildCompanyFinancialObservations(request:FinancialObservationRequest):CompanyFinancialSnapshot {
  if(!request||typeof request.symbol!=='string'||!/^[A-Z0-9.^=-]{1,20}$/.test(request.symbol)||typeof request.cik!=='string'||!/^\d{10}$/.test(request.cik)||Number(request.cik)<=0||forecastInstant(request.assessedAt)===null)throw Error('Invalid financial scope');
  const result:CompanyFinancialSnapshot={contractVersion:'company-financial-observations-v1',symbol:request.symbol,cik:request.cik,assessedAt:request.assessedAt,status:'invalid-payload',sourceStatus:'invalid-payload',observations:[],issues:[],
    unsupportedMetrics:['cash','interest-bearing-debt','shares','earnings-per-share','ebitda','price-earnings','enterprise-value-ebitda'],sourceCoverage:'unverified',sourceAuthenticityVerified:false,issuerMappingVerified:false,grantsDecisionEligibility:false,usageScope:'projection-only',usage:{providerCalls:0,modelCalls:0,databaseCalls:0}};
  const issue=(code:string)=>{if(!result.issues.includes(code))result.issues.push(code);};
  const source=request.source;
  if(!object(source))return result;
  if(financialSourceFailures.includes(source.status as Failure)){
    if(Object.keys(source).length!==1)return result;
    result.status=result.sourceStatus=source.status as Failure;return result;
  }
  if(source.status!=='loaded'||Object.keys(source).sort().join(',')!=='receipt,status'||!secCouncilReceipt(source.receipt)){issue('INVALID_SOURCE_RECEIPT');return result;}
  const receipt=source.receipt as Receipt;
  if(receipt.symbol!==request.symbol||receipt.cik!==request.cik){issue('ISSUER_MISMATCH');return result;}
  if(receipt.issues.some(code=>fatal.has(code))&&receipt.observations.length){issue('INVALID_SOURCE_RECEIPT');return result;}
  const retrieved=forecastInstantMicros(receipt.retrieved_at)!;
  if(retrieved>forecastInstantMicros(request.assessedAt)!){issue('FUTURE_RETRIEVAL');return result;}
  result.sourceStatus='loaded';result.status='unavailable';receipt.issues.forEach(issue);
  const copied=new Map<string,CompanyFinancialObservation>();
  const factId=(f:Fact)=>['declared',f.tag,f.accession,f.period_start??'instant',f.period_end].join(':');
  const copyFact=(f:Fact):Fact=>({tag:f.tag,accession:f.accession,form:f.form,period_start:f.period_start,period_end:f.period_end,filed_on:f.filed_on,value:f.value,unit:'USD'});
  const reference=(f:Fact):Reference=>({cik:request.cik,accession:f.accession,form:f.form,filedOn:f.filed_on,publicationPrecision:'date-only',publishedAt:null,
    publicationWindow:{...councilPublicationWindow(f.filed_on)!},referenceKind:'constructed-accession-index',url:`https://www.sec.gov/Archives/edgar/data/${Number(request.cik)}/${f.accession.replaceAll('-','')}/${f.accession}-index.html`,restatementStatus:f.form==='10-K/A'?'amendment-declared':'not-established'});
  const base=(f:Fact)=>({sourceId:'sec-edgar-companyfacts' as const,reportingBasis:'declared-sec-input' as const,inputCurrency:'USD' as const,period:{start:f.period_start,end:f.period_end,scope:f.period_start===null?'instant' as const:'annual-duration' as const,fiscalYear:null,fiscalPeriod:null},
    retrievedAt:receipt.retrieved_at,observedAt:null,publishedAt:null,adjustmentBasis:'unknown' as const,simulated:false as const,sourceAuthenticityVerified:false as const,issuerMappingVerified:false as const,grantsDecisionEligibility:false as const});
  for(const row of receipt.observations){
    // A filing day is not midnight UTC. Reuse the reviewed date-only envelope;
    // the whole range must close by retrieval, without backdating availability.
    const windows=row.inputs.map(f=>councilPublicationWindow(f.filed_on));
    if(windows.some(w=>!w)){issue('PUBLICATION_PRECISION_UNSUPPORTED');continue;}
    if(windows.some(w=>forecastInstantMicros(w!.latest_exclusive)!>retrieved)){issue('PUBLICATION_WINDOW_UNCLOSED');continue;}
    for(const fact of row.inputs){
      const id=factId(fact);if(copied.has(id))continue;
      const metric=tags[fact.tag];
      copied.set(id,{...base(fact),id,metric,label:financialMetricLabels[metric],value:fact.value,unit:'USD',currency:'USD',kind:'source-field-declaration',method:null,inputs:[copyFact(fact)],references:[reference(fact)]});
    }
    const metric=row.evidence.metric as Metric;
    copied.set('derived:'+metric,{...base(row.inputs[0]),id:'derived:'+metric,metric,label:financialMetricLabels[metric],value:row.evidence.value,unit:row.evidence.unit,currency:row.evidence.unit==='USD'?'USD':null,
      kind:'derived',method:row.method,inputs:row.inputs.map(copyFact),references:row.inputs.map(reference).filter((ref,index,all)=>all.findIndex(other=>other.accession===ref.accession)===index)});
  }
  result.observations=[...copied.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  if(result.observations.length)result.status='partial';else issue('NO_SUPPORTED_OBSERVATIONS');
  return result;
}
