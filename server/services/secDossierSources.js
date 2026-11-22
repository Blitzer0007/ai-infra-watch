import {connectSecDossierSources,retainDossierFacts,SEC_DOSSIER_LIMITS} from '../../shared/secDossierConnection.js';

/** Process-local controls only; not a distributed/account-wide SEC budget. */
export function createSecDossierLoader({fetchImpl=(...args)=>fetch(...args),now=()=>Date.now()}={}){
  const cache=new Map(),inflight=new Map();let minute=-1,used=0;
  const fail=code=>({ok:false,code});
  async function get(url,userAgent){
    const window=Math.floor(now()/60000);if(window!==minute){minute=window;used=0;}
    if(used>=6)throw Error('RATE_LIMITED');used++;
    const response=await fetchImpl(url,{headers:{'User-Agent':userAgent,Accept:'application/json'},signal:AbortSignal.timeout(6000),redirect:'error'});
    if(!response.ok)throw Error(response.status===429?'RATE_LIMITED':response.status===404?'NO_DATA':'SOURCE_UNAVAILABLE');
    if(!/application\/json/i.test(response.headers.get('content-type')??''))throw Error('INVALID_SOURCE');
    if(Number(response.headers.get('content-length'))>SEC_DOSSIER_LIMITS.upstreamBytes)throw Error('SOURCE_LIMIT');
    const reader=response.body?.getReader();if(!reader)throw Error('INVALID_SOURCE');
    const chunks=[];let bytes=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>SEC_DOSSIER_LIMITS.upstreamBytes)throw Error('SOURCE_LIMIT');chunks.push(value);}}
    finally{await reader.cancel().catch(()=>{});}
    const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
    try{return JSON.parse(new TextDecoder().decode(buffer));}catch{throw Error('INVALID_SOURCE');}
  }
  async function acquire(symbol,userAgent){
    // At most one acquisition per process; overlapping same-symbol callers share it.
    if(inflight.size)return fail('BUSY');
    try{
      const directoryData=await get('https://www.sec.gov/files/company_tickers.json',userAgent);
      if(!directoryData||typeof directoryData!=='object'||Array.isArray(directoryData))return fail('INVALID_SOURCE');
      const rows=Object.values(directoryData);if(rows.length>SEC_DOSSIER_LIMITS.directoryRows)return fail('SOURCE_LIMIT');
      const directory=rows.filter(row=>row?.ticker===symbol);
      if(directory.length!==1||!/^\d{1,10}$/.test(String(directory[0].cik_str))||Number(directory[0].cik_str)<=0)return fail('ISSUER_UNRESOLVED');
      const cik=String(directory[0].cik_str).padStart(10,'0');
      const submissionsData=await get(`https://data.sec.gov/submissions/CIK${cik}.json`,userAgent);
      const submissions={cik:submissionsData?.cik,name:submissionsData?.name??null,tickers:submissionsData?.tickers};
      if(String(submissions.cik).padStart(10,'0')!==cik||!Array.isArray(submissions.tickers)||submissions.tickers.length>SEC_DOSSIER_LIMITS.tickers||submissions.tickers.some(t=>typeof t!=='string'||t.length>30)||submissions.tickers.filter(t=>t===symbol).length!==1)return fail('ISSUER_MISMATCH');
      const facts=retainDossierFacts(await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,userAgent));
      if(!facts)return fail('SOURCE_LIMIT_OR_INVALID');
      const retrievedAt=new Date(now()).toISOString();
      const packet={contractVersion:'sec-dossier-sources-v1',symbol,assessedAt:retrievedAt,retrievedAt,directory:directory.map(row=>({ticker:row.ticker,cik_str:row.cik_str})),submissions,facts};
      if(new TextEncoder().encode(JSON.stringify(packet)).length>SEC_DOSSIER_LIMITS.bytes)return fail('SOURCE_LIMIT');
      const result=connectSecDossierSources(symbol,packet);
      if(!result.connection)return fail(result.code);
      cache.set(symbol,{expires:now()+3600000,packet});
      while(cache.size>20)cache.delete(cache.keys().next().value);
      return {ok:true,cacheStatus:'miss',packet:structuredClone(packet)};
    }catch(error){
      const code=error?.name==='TimeoutError'?'TIMEOUT':['RATE_LIMITED','NO_DATA','SOURCE_UNAVAILABLE','INVALID_SOURCE','SOURCE_LIMIT'].includes(error?.message)?error.message:'SOURCE_UNAVAILABLE';
      return fail(code);
    }
  }
  return async (symbol,userAgent)=>{
    if(typeof symbol!=='string'||!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol))return fail('INVALID_SYMBOL');
    if(typeof userAgent!=='string'||userAgent.length>250||/[\r\n]/.test(userAgent)||!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(userAgent))return fail('CONTACT_NOT_CONFIGURED');
    const hit=cache.get(symbol);if(hit&&hit.expires>now())return {ok:true,cacheStatus:'hit',packet:structuredClone(hit.packet)};
    if(inflight.has(symbol))return inflight.get(symbol);
    const pending=acquire(symbol,userAgent);inflight.set(symbol,pending);
    try{return await pending;}finally{inflight.delete(symbol);}
  };
}
