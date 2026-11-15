import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Child processes receive fictional credentials only. No fetch may reach a network.
function run(mode) {
  const script=`
    import assert from 'node:assert/strict';
    import handler from './server/api/quote.js';
    const mode=${JSON.stringify(mode)},calls=[],unexpected=[];let failed=false;
    const symbol=mode==='alias'?'CERE':'NVDA';
    const market=Math.floor(Date.now()/1000);
    globalThis.fetch=async(input,options={})=>{
      const url=String(input);calls.push(url);assert.equal(options.method||'GET','GET');
      if(url.startsWith('https://query1.finance.yahoo.com/v8/finance/chart/'+symbol+'?')){
        if(failed||mode==='unavailable'||mode==='fallback')return new Response('{}',{status:429});
        const meta=mode==='missing'?{symbol,regularMarketPrice:100}:{symbol,regularMarketPrice:110,regularMarketPreviousClose:100,
          currency:'USD',regularMarketTime:market,currentTradingPeriod:{regular:{start:market-1000,end:market+1000}}};
        return new Response(JSON.stringify({chart:{result:[{meta}]}}));
      }
      if(url.startsWith('https://finnhub.io/api/v1/quote?')&&mode==='fallback')return new Response(JSON.stringify({c:100,pc:100,dp:0,t:market}));
      unexpected.push(url);throw new Error('Unexpected fixture fetch');
    };
    const invoke=async(method='GET',query={symbol})=>{
      let status=200,body;const headers={};const res={setHeader(key,value){headers[key]=value;},status(value){status=value;return this;},json(value){body=value;return this;}};
      await handler({method,query},res);return {status,body,headers};
    };
    if(mode==='reject'){
      assert.equal((await invoke('POST')).status,405);assert.equal((await invoke('GET',{symbol:'../bad'})).status,400);assert.equal(calls.length,0);
    }else{
      const first=await invoke();assert.equal(first.headers['Cache-Control'],'no-store');
      if(mode==='unavailable'){
        assert.equal(first.status,503);assert.equal(first.body.error,'Market quote providers unavailable');assert.ok(!JSON.stringify(first.body).includes('fixture-key'));
      }else{
        assert.equal(first.status,200);assert.equal(first.body.symbol,symbol);
        if(mode==='primary'){assert.equal(first.body.currency,'USD');assert.equal(first.body.isMarketSessionOpen,true);assert.equal(first.body.asOf,first.body.marketTime);assert.equal(calls.length,1);}
        if(mode==='missing'){assert.equal(first.body.changePct,null);assert.equal(first.body.marketTime,null);assert.equal(first.body.asOf,null);assert.equal(first.body.prevClose,null);}
        if(mode==='fallback'){assert.equal(first.body.provider,'finnhub');assert.equal(first.body.changePct,0);assert.equal(first.body.fallbackUsed,true);assert.equal(first.body.providerAttempts[0].errorCode,'rate_limited');assert.equal(first.body.currency,null);assert.equal(calls.length,2);}
        if(mode==='cache'){const cached=await invoke();assert.equal(cached.body.cached,true);assert.equal(calls.length,1);await invoke('GET',{symbol,refresh:'true'});assert.equal(calls.length,2);}
        if(mode==='stale'){failed=true;const stale=await invoke('GET',{symbol,refresh:'true'});assert.equal(stale.body.providerStatus,'STALE_FALLBACK');assert.equal(stale.body.stale,true);assert.equal(stale.body.marketTime,first.body.marketTime);}
        if(mode==='alias'){assert.equal(first.body.yahooSymbol,'CERE');assert.ok(calls.every(url=>!url.includes('CBRS')));}
      }
    }
    assert.deepEqual(unexpected,[]);console.log(JSON.stringify({passed:true,calls:calls.length}));
  `;
  const env={PATH:process.env.PATH};
  if(mode==='fallback')env.FINNHUB_API_KEY='fixture-key';
  return JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:process.cwd(),env,timeout:15000,encoding:'utf8'}).trim());
}

test('quote route preserves shared provider currency, session and observation provenance',()=>assert.equal(run('primary').passed,true));
test('quote route preserves unavailable move and time rather than inventing zero/current data',()=>assert.equal(run('missing').passed,true));
test('quote route uses the existing fallback chain with safe provider diagnostics',()=>assert.equal(run('fallback').passed,true));
test('shared quote cache is reused and explicit refresh bypasses its warm entry',()=>assert.equal(run('cache').passed,true));
test('failed refresh keeps cached observations explicitly stale without restamping them',()=>assert.equal(run('stale').passed,true));
test('all-provider failure is unavailable and never exposes a provider credential',()=>assert.equal(run('unavailable').passed,true));
test('quote route no longer silently maps the unrelated legacy CERE request to CBRS',()=>assert.equal(run('alias').passed,true));
test('quote route rejects non-GET and invalid symbols without any provider request',()=>assert.equal(run('reject').passed,true));

test('history keeps reported currency while fallback providers cannot manufacture USD',()=>{
  const script=`
    import assert from 'node:assert/strict';import {history} from './api/_market-data.js';
    let mode='unknown';const time=Math.floor(Date.now()/1000),day=new Date().toISOString().slice(0,10),unexpected=[];
    globalThis.fetch=async(input)=>{
      const url=String(input);
      if(url.startsWith('https://query1.finance.yahoo.com/'))return mode==='finnhub'||mode==='alpha'?new Response('{}',{status:503}):new Response(JSON.stringify({chart:{result:[{meta:mode==='reported'?{currency:'KRW'}:{},timestamp:[time],indicators:{quote:[{close:[100]}]}}]}}));
      if(url.startsWith('https://finnhub.io/api/v1/stock/candle?'))return mode==='finnhub'?new Response(JSON.stringify({s:'ok',t:[time],c:[100]})):new Response('{}',{status:503});
      if(url.startsWith('https://www.alphavantage.co/query?'))return new Response(JSON.stringify({'Time Series (Daily)':{[day]:{'4. close':'100'}}}));
      unexpected.push(url);throw new Error('Unexpected fixture transport');
    };
    assert.equal((await history('HISTA')).currency,null);mode='reported';assert.equal((await history('HISTB')).currency,'KRW');
    mode='finnhub';assert.equal((await history('HISTC')).currency,null);mode='alpha';assert.equal((await history('HISTD')).currency,null);assert.deepEqual(unexpected,[]);
  `;
  execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:process.cwd(),env:{PATH:process.env.PATH,FINNHUB_API_KEY:'fixture-key',ALPHA_VANTAGE_API_KEY:'fixture-key'},timeout:15000});
});
