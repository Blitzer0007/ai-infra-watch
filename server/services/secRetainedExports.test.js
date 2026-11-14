import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {reviewRetainedSecExports,SEC_EXPORT_LIMITS} from './secRetainedExports.js';
const root=new URL('../../scripts/fixtures/sec-exports.fictional/',import.meta.url);
const hash=b=>createHash('sha256').update(b).digest('hex');
const encode=v=>Buffer.from(JSON.stringify(v)+'\n');
const input=()=>({request:{symbol:'FICT',expectedCik:'0000000001',expectedExchange:'Nasdaq',assessedAt:'2026-11-14T12:00:00Z',periods:[{start:null,end:'2025-12-31'},{start:'2025-01-01',end:'2025-12-31'},{start:null,end:'2026-02-10'}]},manifestBytes:readFileSync(new URL('manifest.json',root)),expectedManifestSha256:'823645db0cb3ba28215f00e1462be0bc8d027727376d1840f957709f9c7b2710',artifacts:new Map(['listings','companyfacts'].map(role=>[role,readFileSync(new URL(role+'.json',root))]))});
function manifestEdit(i,fn){const m=JSON.parse(i.manifestBytes.toString());fn(m);i.manifestBytes=encode(m);i.expectedManifestSha256=hash(i.manifestBytes);}
function bodyEdit(i,role,fn){const v=JSON.parse(i.artifacts.get(role).toString());fn(v);bodyBytes(i,role,encode(v));}
function bodyBytes(i,role,bytes){i.artifacts.set(role,bytes);manifestEdit(i,m=>{m.sources[role].sha256=hash(bytes);m.sources[role].byteLength=bytes.length;});}
function deny(i,code){const r=reviewRetainedSecExports(i);assert.equal(r.status,'needs-data');if(code)assert.equal(r.code,code);assert.deepEqual(r.snapshots,[]);assert.equal(r.sourceAuthenticityVerified,false);assert.equal(r.issuerMappingVerified,false);assert.equal(r.grantsValuationEligibility,false);assert.equal(r.grantsDecisionEligibility,false);assert.equal(r.aggregationEligibility,false);return r;}
describe('retained SEC native exports, offline only',()=>{
  it('binds pinned native export bytes, one exact listing and all original statement periods',()=>{
    const r=reviewRetainedSecExports(input());assert.equal(r.status,'conditional');assert.equal(r.snapshots.flatMap(s=>s.observations).length,10);assert.equal(r.listing.symbol,'FICT');assert.equal(r.listing.declaredExchange,'Nasdaq');assert.equal(r.listing.cik,'0000000001');assert.equal(r.listing.rowIndex,0);assert.equal(r.nameAgreement,'exact-declarations');assert.equal(r.simulationStatus,'fictional');assert.equal(r.bindings.manifestPinMatched,true);assert.equal(r.bindings.companyfacts.bytesMatched,true);assert.equal(r.originalFilingDocumentRetained,false);assert.equal(r.historicalAvailabilityVerified,false);assert.deepEqual(r.usage,{providerCalls:0,modelCalls:0,databaseCalls:0});assert.equal(r.acquisitionUsage,'unknown');
    assert.equal(r.bindings.manifestSha256,input().expectedManifestSha256);assert(r.snapshots.every(s=>!s.sourceAuthenticityVerified&&!s.issuerMappingVerified&&!s.grantsDecisionEligibility&&!s.grantsValuationEligibility));
  });
  it('keeps native export companyfacts identical to the reviewed original-row fixture',()=>assert.deepEqual(JSON.parse(readFileSync(new URL('companyfacts.json',root))),JSON.parse(readFileSync('qa/fixtures/sec-statements.fictional.json')).facts));
  it('does not allow a matching hash or declared official URL to authenticate a publisher',()=>{
    const i=input();manifestEdit(i,m=>m.simulationStatus='not-established');const r=reviewRetainedSecExports(i);assert.equal(r.status,'conditional');assert.equal(r.simulationStatus,'not-established');assert.equal(r.sourceAuthenticityVerified,false);assert.equal(r.issuerMappingVerified,false);
  });
  it('requires the separate manifest pin and exact original bytes before content inspection',()=>{
    for(const bad of [null,'','A'.repeat(64),'0'.repeat(64)]){const i=input();i.expectedManifestSha256=bad;deny(i,bad==='0'.repeat(64)?'MANIFEST_PIN_MISMATCH':'MANIFEST_PIN_REQUIRED');}
    const i=input();i.manifestBytes=Buffer.concat([i.manifestBytes,Buffer.from(' ')]);deny(i,'MANIFEST_PIN_MISMATCH');
  });
  for(const role of ['listings','companyfacts'])it(`rejects missing or changed ${role} bytes without old-value fallback`,()=>{
    const i=input();i.artifacts.delete(role);deny(i,'EXPORT_BYTES_INVALID');const j=input();j.artifacts.set(role,Buffer.from('{}'));deny(j,'EXPORT_PIN_MISMATCH');
  });
  for(const role of ['listings','companyfacts'])for(const status of ['not-configured','rate-limited','timeout','transport-error','no-data','unavailable'])it(`preserves ${role} ${status} without reading its body`,()=>{
    const i=input();manifestEdit(i,m=>m.sources[role]={status});i.artifacts.delete(role);const r=deny(i,role.toUpperCase()+'_'+status.toUpperCase().replaceAll('-','_'));assert.equal(r.sourceStatus[role],status);assert.equal(r.bindings[role].bytesMatched,false);
  });
  it('does not inspect companyfacts bytes when issuer listing evidence fails',()=>{
    const i=input();manifestEdit(i,m=>m.sources.listings={status:'timeout'});i.artifacts.delete('listings');i.artifacts.set('companyfacts',Buffer.from('private-body-do-not-read'));const r=deny(i,'LISTINGS_TIMEOUT');assert.equal(r.bindings.companyfacts.inspectedBytes,0);assert(!JSON.stringify(r).includes('private-body'));
  });
  it('rejects request widening, duplicate periods, invalid periods and ambiguous clocks',()=>{
    for(const change of [r=>r.symbol='fict',r=>r.expectedCik='1',r=>r.expectedExchange='',r=>r.private='private-do-not-echo',r=>r.periods.push(r.periods[0]),r=>r.periods[0]={start:null,end:'2025-02-30'},r=>r.periods[1].start='2025-09-01',r=>r.assessedAt='2026-11-14',r=>r.periods=[]]){const i=input();change(i.request);assert(!JSON.stringify(deny(i,'EXPORT_REQUEST_INVALID')).includes('private-do-not-echo'));}
  });
  it('requires exact requested and final URLs with no redirects, credentials, queries or aliases',()=>{
    for(const role of ['listings','companyfacts'])for(const url of ['http://www.sec.gov/files/company_tickers_exchange.json','https://sec.gov/files/company_tickers_exchange.json','https://www.sec.gov.evil.example/','https://user:pass@www.sec.gov/files/company_tickers_exchange.json','https://www.sec.gov/files/company_tickers_exchange.json?key=private','https://data.sec.gov/api/xbrl/companyfacts/CIK0000000002.json','https://www.sec.gov/files/%63ompany_tickers_exchange.json']){const i=input();manifestEdit(i,m=>m.sources[role].finalUrl=url);const r=deny(i,'EXPORT_METADATA_INVALID');assert(!JSON.stringify(r).includes('pass@'));}
    const i=input();manifestEdit(i,m=>m.sources.companyfacts.requestedUrl='https://example.com/');deny(i,'EXPORT_METADATA_INVALID');
  });
  it('rejects non-200/content mismatch and unbound/private manifest fields without echo',()=>{
    for(const change of [m=>m.sources.companyfacts.httpStatus=304,m=>m.sources.listings.contentType='text/html',m=>m.sources.listings.authorization='private-secret',m=>m.private='private-secret',m=>m.sources.companyfacts.byteLength++,m=>m.simulationStatus='verified']){const i=input();manifestEdit(i,change);assert(!JSON.stringify(deny(i)).includes('private-secret'));}
  });
  it('orders every retrieval against the frozen assessment at microsecond precision',()=>{
    for(const role of ['listings','companyfacts']){const i=input();manifestEdit(i,m=>m.sources[role].retrievedAt='2026-11-14T12:00:00.000001Z');deny(i,'EXPORT_METADATA_INVALID');}
    const i=input();manifestEdit(i,m=>m.sources.listings.retrievedAt='2026-11-14T12:00:00Z');assert.equal(reviewRetainedSecExports(i).status,'conditional');
  });
  it('accepts ordinary native whitespace/key ordering but rejects escaped duplicate JSON keys',()=>{
    const i=input();bodyBytes(i,'listings',Buffer.from(' \n'+JSON.stringify(JSON.parse(i.artifacts.get('listings')))+' \r\n'));assert.equal(reviewRetainedSecExports(i).status,'conditional');
    for(const role of ['listings','companyfacts']){const j=input(),key=role==='listings'?'data':'cik';const text=j.artifacts.get(role).toString().replace('{','{"'+key+'":null,"'+key.replace(key[0],'\\u'+key.charCodeAt(0).toString(16).padStart(4,'0'))+'":null,');bodyBytes(j,role,Buffer.from(text));deny(j,'EXPORT_JSON_INVALID');}
  });
  it('rejects nonfinite JSON numbers, trailing data, invalid UTF-8, BOM and excessive JSON depth',()=>{
    for(const bytes of [Buffer.from('{"cik":1e999}'),Buffer.from('{}{}'),Buffer.from([0xff,0xfe]),Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('{}')]),Buffer.from('['.repeat(SEC_EXPORT_LIMITS.depth+1)+'0'+']'.repeat(SEC_EXPORT_LIMITS.depth+1))]){const i=input();bodyBytes(i,'companyfacts',bytes);deny(i,'EXPORT_JSON_INVALID');}
  });
  it('does not collapse duplicate nested unit/row fields, including escaped spellings',()=>{
    for(const replacement of ['"val":25,"val":26','"val":25,"\\u0076al":26']){const i=input();bodyBytes(i,'companyfacts',Buffer.from(i.artifacts.get('companyfacts').toString().replace('"val": 25',replacement)));deny(i,'EXPORT_JSON_INVALID');}
  });
  it('withholds numeric underflow and rounded integer/identity tokens rather than inventing zero or an exact CIK',()=>{
    for(const token of ['1e-999','-1e-999','1.00000000000000000001','9007199254740993','1'.repeat(129)]){const i=input();bodyBytes(i,'companyfacts',Buffer.from(i.artifacts.get('companyfacts').toString().replace('"val": 25','"val": '+token)));deny(i,'EXPORT_JSON_INVALID');}
    const i=input();bodyBytes(i,'companyfacts',Buffer.from(i.artifacts.get('companyfacts').toString().replace('"cik": 1','"cik": 1.00000000000000000001')));deny(i,'EXPORT_JSON_INVALID');
    for(const token of ['25.00','2.5e1','250e-1']){const j=input();bodyBytes(j,'companyfacts',Buffer.from(j.artifacts.get('companyfacts').toString().replace('"val": 25','"val": '+token)));assert.equal(reviewRetainedSecExports(j).snapshots[0].observations[0].value,25);}
  });
  it('enforces native JSON node, listing-row and actual byte bounds before projection',()=>{
    const i=input();bodyBytes(i,'listings',Buffer.from('['+Array(SEC_EXPORT_LIMITS.nodes).fill('0').join(',')+']'));deny(i,'EXPORT_JSON_INVALID');
    const j=input();bodyEdit(j,'listings',v=>v.data=Array(SEC_EXPORT_LIMITS.listingRows+1).fill(v.data[0]));deny(j,'LISTINGS_SHAPE_INVALID');
    const k=input();k.artifacts.set('companyfacts',new Uint8Array(SEC_EXPORT_LIMITS.companyfactsBytes+1));deny(k,'EXPORT_BYTES_INVALID');
  });
  it('requires a unique exact ticker and expected exchange/CIK without fuzzy symbol normalization',()=>{
    for(const edit of [v=>v.data.push([...v.data[0]]),v=>v.data.push([2,'Other','FICT','Nasdaq']),v=>v.data[0][2]='FICT.A',v=>v.data[0][0]=2,v=>v.data[0][3]='NYSE',v=>v.data[0][3]=null]){const i=input();bodyEdit(i,'listings',edit);deny(i);}
  });
  it('supports native listing column permutations and multiple distinct tickers for one CIK',()=>{
    const i=input();bodyEdit(i,'listings',v=>{v.data.push([1,'Fictional Components Ltd','FICT-B','NYSE']);v.fields=['ticker','exchange','name','cik'];v.data=v.data.map(([c,n,t,e])=>[t,e,n,c]);});const r=reviewRetainedSecExports(i);assert.equal(r.status,'conditional');assert.equal(r.listing.symbol,'FICT');
  });
  it('rejects malformed listing scope, including unrelated malformed rows, rather than silently filtering',()=>{
    for(const edit of [v=>v.fields.push('private'),v=>v.fields[0]='ticker',v=>v.data[1].pop(),v=>v.data[1][0]='2',v=>v.data[1][1]='bad\nname',v=>v.data=[],v=>v.private='do-not-echo']){const i=input();bodyEdit(i,'listings',edit);deny(i);}
  });
  it('binds companyfacts CIK and keeps different issuer-name declarations explicitly unverified',()=>{
    const i=input();bodyEdit(i,'companyfacts',v=>v.cik=2);deny(i,'COMPANYFACTS_IDENTITY_MISMATCH');const j=input();bodyEdit(j,'companyfacts',v=>v.entityName='Other supplied legal-name spelling');const r=reviewRetainedSecExports(j);assert.equal(r.status,'conditional');assert.equal(r.nameAgreement,'different-declarations');assert.equal(r.issuerMappingVerified,false);
  });
  it('rejects widened native companyfacts shapes and incomplete recognized statement coverage stays partial',()=>{
    const i=input();bodyEdit(i,'companyfacts',v=>v.private='private-field');deny(i,'COMPANYFACTS_SHAPE_INVALID');const j=input();bodyEdit(j,'companyfacts',v=>v.facts={'us-gaap':{CashAndCashEquivalentsAtCarryingValue:v.facts['us-gaap'].CashAndCashEquivalentsAtCarryingValue}});const r=reviewRetainedSecExports(j);assert.equal(r.status,'conditional');assert.equal(r.snapshots.flatMap(s=>s.observations).length,1);assert(r.snapshots.every(s=>s.sourceCoverage==='unverified'));
  });
  it('preserves supported source gaps and malformed statement rows without promoting full coverage',()=>{
    const i=input();bodyEdit(i,'companyfacts',v=>v.facts={});const r=deny(i,'NO_SUPPORTED_STATEMENTS');assert.equal(r.bindings.companyfacts.bytesMatched,true);
    const j=input();bodyEdit(j,'companyfacts',v=>v.facts['us-gaap'].CashAndCashEquivalentsAtCarryingValue.units.USD[0].val=-1);const a=reviewRetainedSecExports(j);assert.equal(a.status,'conditional');assert(a.snapshots[0].missingMetrics.includes('cash_equivalents'));assert(!a.snapshots[0].observations.some(o=>o.metric==='cash_equivalents'));
  });
  it('cannot use declared unclosed filing dates or older values as a historical-availability shortcut',()=>{
    const i=input();manifestEdit(i,m=>m.sources.companyfacts.retrievedAt='2026-02-20T00:00:00Z');deny(i,'NO_SUPPORTED_STATEMENTS');
    const j=input();bodyEdit(j,'companyfacts',v=>{const rows=v.facts['us-gaap'].CashAndCashEquivalentsAtCarryingValue.units.USD;rows.push({...rows[0],val:90,filed:'2026-11-09',accn:'0000000001-26-000002'});});const r=reviewRetainedSecExports(j);assert.equal(r.status,'conditional');assert(r.snapshots[0].missingMetrics.includes('cash_equivalents'));assert(!r.snapshots[0].observations.some(o=>o.metric==='cash_equivalents'));
  });
  it('atomically withholds statements with shared-accession metadata conflicts across periods',()=>{
    const i=input();bodyEdit(i,'companyfacts',v=>{for(const tag of ['EarningsPerShareBasic','EarningsPerShareDiluted','WeightedAverageNumberOfSharesOutstandingBasic','WeightedAverageNumberOfDilutedSharesOutstanding'])Object.values(v.facts['us-gaap'][tag].units)[0][0].fy=2024;});deny(i,'FILING_METADATA_CONFLICT');
  });
  it('rejects artifacts not listed in the manifest, aliases, over-budget and shared-memory bytes',()=>{
    const i=input();i.artifacts.set('secret',Buffer.from('private'));deny(i,'EXPORT_ARTIFACTS_INVALID');const j=input();manifestEdit(j,m=>m.sources.companyfacts.artifactId=m.sources.listings.artifactId);deny(j,'EXPORT_METADATA_INVALID');
    const k=input();k.manifestBytes=new Uint8Array(SEC_EXPORT_LIMITS.manifestBytes+1);deny(k,'EXPORT_BYTES_INVALID');const l=input();l.artifacts.set('companyfacts',new Uint8Array(new SharedArrayBuffer(4)));deny(l,'EXPORT_BYTES_INVALID');
    const n=input();manifestEdit(n,m=>m.sources.companyfacts.byteLength=SEC_EXPORT_LIMITS.companyfactsBytes+1);deny(n,'EXPORT_METADATA_INVALID');
  });
  it('uses no ambient clock, network or caller-owned output references',t=>{
    const i=input(),before=Buffer.from(i.artifacts.get('companyfacts'));t.mock.method(Date,'now',()=>{throw Error('Clock forbidden');});t.mock.method(globalThis,'fetch',()=>{throw Error('Network forbidden');});const r=reviewRetainedSecExports(i);assert.equal(r.status,'conditional');r.snapshots[0].observations[0].value=999;r.listing.symbol='OTHER';assert.deepEqual(i.artifacts.get('companyfacts'),before);assert.equal(reviewRetainedSecExports(i).snapshots[0].observations[0].value,25);
  });
  it('actual fixed-pin demo is offline, fictional and rejects external path arguments',()=>{
    const env={PATH:process.env.PATH};const r=JSON.parse(execFileSync(process.execPath,['scripts/sec-retained-exports-demo.mjs'],{env,encoding:'utf8'}));assert.equal(r.fictional,true);assert.equal(r.result.status,'conditional');assert.equal(r.result.snapshots.flatMap(s=>s.observations).length,10);assert(!JSON.stringify(r).includes('"units"'));assert.equal(spawnSync(process.execPath,['scripts/sec-retained-exports-demo.mjs','/tmp/unapproved'],{env}).status,2);
  });
});
