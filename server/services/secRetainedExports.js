// Supplied bytes only. No file/network access, ambient clock, configuration or writer.
import {createHash} from 'node:crypto';
import {forecastDay,forecastInstantMicros} from '../../src/utils/forecastInputs.js';
import {buildSecStatementObservations,SEC_STATEMENT_FAILURES} from '../../shared/secStatementObservations.js';
import {validateSecStatementReceipt} from '../../shared/secStatementAdmission.js';

export const SEC_EXPORT_LIMITS=Object.freeze({manifestBytes:16384,listingsBytes:4*1024*1024,companyfactsBytes:16*1024*1024,listingRows:30000,depth:32,nodes:400000});
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v)&&v.trim()===v;
const symbol=v=>typeof v==='string'&&/^[A-Z0-9.^=-]{1,20}$/.test(v);
const cik=v=>Number.isSafeInteger(v)&&v>0&&v<1e10?String(v).padStart(10,'0'):null;
const digest=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const sha=b=>createHash('sha256').update(b).digest('hex');
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(v);
class ExportError extends Error{}
const stop=code=>{throw new ExportError(code);};
function checkedNumber(raw){
  if(raw.length>128)throw Error();
  const n=Number(raw);if(!Number.isFinite(n))throw Error();
  const [coefficient,exponent='0']=raw.toLowerCase().split('e'),fraction=(coefficient.split('.')[1]??'').length;
  const digits=coefficient.replace('.',''),nonzero=/[1-9]/.test(digits);
  // JSON.parse must not turn an underflow or rounded fraction into an observed
  // zero/integer identity. Other fractional binary64 precision remains unverified.
  if(n===0&&nonzero)throw Error();
  if(Number.isInteger(n)){
    if(!Number.isSafeInteger(n))throw Error();
    if(!nonzero)return;
    const power=Number(exponent)-fraction,mantissa=BigInt(digits);
    if(power>=0){if(mantissa*10n**BigInt(power)!==BigInt(n))throw Error();}
    else{const divisor=10n**BigInt(-power);if(mantissa%divisor!==0n||mantissa/divisor!==BigInt(n))throw Error();}
  }
}
function bytes(value,limit){
  if(!(value instanceof Uint8Array)||value.byteLength<1||value.byteLength>limit||(typeof SharedArrayBuffer!=='undefined'&&value.buffer instanceof SharedArrayBuffer))stop('EXPORT_BYTES_INVALID');
  return Buffer.from(value);
}

// Native exports need not be canonicalized. Scan before JSON.parse to reject duplicate
// decoded keys, nonfinite numbers and excessive depth/nodes without losing raw bytes.
function nativeJson(b){
  try{
    const s=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(b);
    let pos=0,nodes=0;
    const white=()=>{while(pos<s.length&&' \r\n\t'.includes(s[pos]))pos++;};
    const string=()=>{
      if(s[pos]!=='"')throw Error();const start=pos++;
      while(pos<s.length){if(s[pos]==='\\'){pos+=2;continue;}if(s[pos++]==='"')return JSON.parse(s.slice(start,pos));}
      throw Error();
    };
    const primitive=/(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/y;
    function value(depth){
      if(depth>SEC_EXPORT_LIMITS.depth||++nodes>SEC_EXPORT_LIMITS.nodes)throw Error();white();
      if(s[pos]==='"'){string();return;}
      if(s[pos]==='{'||s[pos]==='['){
        const isObject=s[pos++]==='{',end=isObject?'}':']',keys=new Set();white();if(s[pos]===end){pos++;return;}
        while(true){
          if(isObject){const key=string();if(keys.has(key))throw Error();keys.add(key);white();if(s[pos++]!==':')throw Error();}
          value(depth+1);white();if(s[pos]===end){pos++;return;}if(s[pos++]!==',')throw Error();white();
        }
      }
      primitive.lastIndex=pos;const match=primitive.exec(s);if(!match)throw Error();pos=primitive.lastIndex;
      if(!['true','false','null'].includes(match[0]))checkedNumber(match[0]);
    }
    value(0);white();if(pos!==s.length)throw Error();return JSON.parse(s);
  }catch{stop('EXPORT_JSON_INVALID');}
}
function requestValid(r){
  if(!exact(r,['symbol','expectedCik','expectedExchange','assessedAt','periods'])||!symbol(r.symbol)||typeof r.expectedCik!=='string'||!/^\d{10}$/.test(r.expectedCik)||!cik(Number(r.expectedCik))||!text(r.expectedExchange,80)||forecastInstantMicros(r.assessedAt)===null||!Array.isArray(r.periods)||!r.periods.length||r.periods.length>3)return false;
  const periods=new Set();
  for(const p of r.periods){
    if(!exact(p,['start','end'])||!forecastDay(p.end)||(p.start!==null&&(!forecastDay(p.start)||(Date.parse(p.end)-Date.parse(p.start))<300*86400000||(Date.parse(p.end)-Date.parse(p.start))>400*86400000)))return false;
    const key=(p.start??'instant')+'>'+p.end;if(periods.has(key))return false;periods.add(key);
  }
  return true;
}
function sourceValid(s,role,r){
  if(exact(s,['status'])&&SEC_STATEMENT_FAILURES.includes(s.status))return true;
  const url=role==='listings'?'https://www.sec.gov/files/company_tickers_exchange.json':`https://data.sec.gov/api/xbrl/companyfacts/CIK${r.expectedCik}.json`;
  return exact(s,['status','artifactId','requestedUrl','finalUrl','httpStatus','contentType','retrievedAt','byteLength','sha256'])&&s.status==='loaded'&&id(s.artifactId)&&s.requestedUrl===url&&s.finalUrl===url&&s.httpStatus===200
    &&typeof s.contentType==='string'&&/^application\/json(?:;\s*charset=utf-8)?$/i.test(s.contentType)&&forecastInstantMicros(s.retrievedAt)!==null&&forecastInstantMicros(s.retrievedAt)<=forecastInstantMicros(r.assessedAt)
    &&Number.isSafeInteger(s.byteLength)&&s.byteLength>0&&s.byteLength<=SEC_EXPORT_LIMITS[role+'Bytes']&&digest(s.sha256);
}
function listingFrom(v,r){
  const fields=['cik','name','ticker','exchange'];
  if(!exact(v,['fields','data'])||!Array.isArray(v.fields)||v.fields.length!==4||!fields.every(f=>v.fields.includes(f))||!Array.isArray(v.data)||!v.data.length||v.data.length>SEC_EXPORT_LIMITS.listingRows)stop('LISTINGS_SHAPE_INVALID');
  const index=Object.fromEntries(fields.map(f=>[f,v.fields.indexOf(f)])),matches=[];
  for(const [rowIndex,row] of v.data.entries()){
    if(!Array.isArray(row)||row.length!==4||!cik(row[index.cik])||!text(row[index.name],240)||!symbol(row[index.ticker])||(row[index.exchange]!==null&&!text(row[index.exchange],80)))stop('LISTINGS_SHAPE_INVALID');
    if(row[index.ticker]===r.symbol)matches.push({symbol:r.symbol,cik:cik(row[index.cik]),declaredName:row[index.name],declaredExchange:row[index.exchange],rowIndex});
  }
  if(matches.length!==1)stop(matches.length?'LISTING_AMBIGUOUS':'LISTING_NOT_FOUND');
  const match=matches[0];if(match.cik!==r.expectedCik||match.declaredExchange!==r.expectedExchange)stop('LISTING_IDENTITY_MISMATCH');
  return match;
}

/** Integrity and supplied-listing consistency only, never publisher authentication. */
export function reviewRetainedSecExports(args){
  const bindings={manifestPinMatched:false,manifestSha256:null,manifestBytes:0,listings:{bytesMatched:false,inspectedBytes:0,sha256:null,requestedUrl:null,finalUrl:null,retrievedAt:null},companyfacts:{bytesMatched:false,inspectedBytes:0,sha256:null,requestedUrl:null,finalUrl:null,retrievedAt:null}};
  const sourceStatus={listings:'not-inspected',companyfacts:'not-inspected'};
  const base={contractVersion:'sec-retained-export-review-v1',status:'needs-data',code:'EXPORT_INPUT_INVALID',bindings,sourceStatus,listing:null,companyfactsEntityName:null,nameAgreement:'not-checked',simulationStatus:'not-established',snapshots:[],sourceAuthenticityVerified:false,issuerMappingVerified:false,historicalAvailabilityVerified:false,originalFilingDocumentRetained:false,grantsDecisionEligibility:false,grantsValuationEligibility:false,aggregationEligibility:false,usageScope:'offline-validation-only',usage:{providerCalls:0,modelCalls:0,databaseCalls:0},acquisitionUsage:'unknown'};
  try{
    if(!exact(args,['request','manifestBytes','expectedManifestSha256','artifacts']))stop('EXPORT_INPUT_INVALID');
    const r=args.request;if(!requestValid(r))stop('EXPORT_REQUEST_INVALID');
    if(!digest(args.expectedManifestSha256))stop('MANIFEST_PIN_REQUIRED');
    const mb=bytes(args.manifestBytes,SEC_EXPORT_LIMITS.manifestBytes);bindings.manifestBytes=mb.length;
    if(sha(mb)!==args.expectedManifestSha256)stop('MANIFEST_PIN_MISMATCH');bindings.manifestPinMatched=true;bindings.manifestSha256=args.expectedManifestSha256;
    const m=nativeJson(mb);
    if(!exact(m,['schemaVersion','bundleId','simulationStatus','sources'])||m.schemaVersion!=='sec-export-manifest-v1'||!id(m.bundleId)||!['fictional','not-established'].includes(m.simulationStatus)||!exact(m.sources,['listings','companyfacts']))stop('EXPORT_METADATA_INVALID');
    for(const role of ['listings','companyfacts'])if(!sourceValid(m.sources[role],role,r))stop('EXPORT_METADATA_INVALID');
    const ids=['listings','companyfacts'].filter(role=>m.sources[role].status==='loaded').map(role=>m.sources[role].artifactId);
    if(new Set(ids).size!==ids.length)stop('EXPORT_METADATA_INVALID');
    if(!(args.artifacts instanceof Map)||args.artifacts.size>2||[...Map.prototype.keys.call(args.artifacts)].some(k=>!ids.includes(k)))stop('EXPORT_ARTIFACTS_INVALID');
    for(const role of ['listings','companyfacts'])sourceStatus[role]=m.sources[role].status;
    base.simulationStatus=m.simulationStatus;
    const load=role=>{
      const ref=m.sources[role];if(ref.status!=='loaded')stop(role.toUpperCase()+'_'+ref.status.toUpperCase().replaceAll('-','_'));
      const b=bytes(Map.prototype.get.call(args.artifacts,ref.artifactId),SEC_EXPORT_LIMITS[role+'Bytes']);bindings[role].inspectedBytes=b.length;
      if(b.length!==ref.byteLength||sha(b)!==ref.sha256)stop('EXPORT_PIN_MISMATCH');
      Object.assign(bindings[role],{bytesMatched:true,sha256:ref.sha256,requestedUrl:ref.requestedUrl,finalUrl:ref.finalUrl,retrievedAt:ref.retrievedAt});
      return nativeJson(b);
    };
    const listing=listingFrom(load('listings'),r),facts=load('companyfacts');
    if(!exact(facts,['cik','entityName','facts'])||!text(facts.entityName,240)||!object(facts.facts))stop('COMPANYFACTS_SHAPE_INVALID');
    if(cik(facts.cik)!==r.expectedCik)stop('COMPANYFACTS_IDENTITY_MISMATCH');
    const snapshots=[],filings=new Map();
    for(const period of r.periods){
      const request={symbol:r.symbol,expectedCik:r.expectedCik,assessedAt:r.assessedAt,retrievedAt:m.sources.companyfacts.retrievedAt,period,source:{status:'loaded',facts}};
      const projection=buildSecStatementObservations(request),admitted=validateSecStatementReceipt(request,projection);
      if(admitted.status==='invalid'||!admitted.snapshot||admitted.snapshot.status==='invalid-payload')stop('STATEMENT_INPUTS_INVALID');
      for(const row of admitted.snapshot.observations){
        const f=row.filing,metadata=JSON.stringify([f.form,f.filedOn,f.filingFiscalYear,f.filingFiscalPeriod]);
        if(filings.has(f.accession)&&filings.get(f.accession)!==metadata)stop('FILING_METADATA_CONFLICT');filings.set(f.accession,metadata);
      }
      snapshots.push(admitted.snapshot);
    }
    if(!snapshots.some(s=>s.observations.length))stop('NO_SUPPORTED_STATEMENTS');
    return {...base,status:'conditional',code:'RETAINED_EXPORT_DECLARATIONS_BOUND',listing,companyfactsEntityName:facts.entityName,nameAgreement:listing.declaredName===facts.entityName?'exact-declarations':'different-declarations',snapshots};
  }catch(e){return {...base,code:e instanceof ExportError?e.message:'EXPORT_INPUT_INVALID'};}
}
