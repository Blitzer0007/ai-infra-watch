const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

const TICKERS = ['NVDA','MSFT','MU','AVGO','AMD','TSM','META','NBIS'];
const HORIZONS = [5,20,60,120,252];

function sbHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}
function mean(v) { return v.length ? v.reduce((a,b)=>a+b,0)/v.length : 0; }
function stdev(v) { if (v.length < 2) return 0; const m=mean(v); return Math.sqrt(mean(v.map(x=>(x-m)**2))); }
function percentile(v,p) {
  if (!v.length) return 0;
  const s=[...v].sort((a,b)=>a-b), x=(s.length-1)*p, lo=Math.floor(x), hi=Math.ceil(x);
  return lo===hi?s[lo]:s[lo]+(s[hi]-s[lo])*(x-lo);
}
function features(history, i) {
  const price=history[i]?.price;
  if (!(price>0) || i<20) return null;
  const ret=(days)=>{
    if(i<days) return 0;
    const a=history[i-days]?.price;
    return a>0 ? (price/a-1)*100 : 0;
  };
  const daily=[];
  for(let j=Math.max(1,i-20);j<=i;j++){
    const a=history[j-1]?.price,b=history[j]?.price;
    if(a>0&&b>0) daily.push((b/a-1)*100);
  }
  return { m20:ret(20), m60:ret(60), m252:ret(252), vol:stdev(daily)*Math.sqrt(252) };
}
function featureScales(history, asOf) {
  const vals={m20:[],m60:[],m252:[],vol:[]};
  const start=Math.max(60,asOf-500);
  for(let i=start;i<asOf;i++){
    const f=features(history,i);
    if(!f) continue;
    Object.keys(vals).forEach(k=>vals[k].push(f[k]));
  }
  return Object.fromEntries(Object.entries(vals).map(([k,v])=>[k,Math.max(stdev(v),0.25)]));
}
function sample(history, asOf, horizon, model) {
  const current=features(history,asOf);
  if(!current) return [];
  const scales=model==='analogue-v2'?featureScales(history,asOf):{m20:1,m60:1,m252:1,vol:1};
  const candidates=[];
  for(let j=60;j+horizon<asOf;j++){
    const base=history[j]?.price,future=history[j+horizon]?.price;
    if(!(base>0&&future>0)) continue;
    const f=features(history,j);
    if(!f) continue;
    let distance;
    if(model==='analogue-v2'){
      distance=Math.sqrt(
        ((f.m20-current.m20)/scales.m20)**2+
        ((f.m60-current.m60)/scales.m60)**2+
        0.5*((f.m252-current.m252)/scales.m252)**2+
        0.8*((f.vol-current.vol)/scales.vol)**2
      );
    } else {
      distance=Math.abs(f.m20-current.m20)+0.7*Math.abs(f.vol-current.vol);
    }
    candidates.push({distance,ret:(future/base-1)*100});
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  return candidates.slice(0,25).map(x=>x.ret);
}
function run(history,horizon,model) {
  if(history.length<220+horizon) return null;
  const rows=[];
  const step=horizon>=120?15:20;
  for(let asOf=220;asOf<=history.length-horizon-1;asOf+=step){
    const s=sample(history,asOf,horizon,model);
    if(s.length<8) continue;
    const median=percentile(s,.5);
    const actual=(history[asOf+horizon].price/history[asOf].price-1)*100;
    rows.push({median,actual});
  }
  if(!rows.length) return null;
  const direction=rows.filter(r=>r.median!==0&&r.actual!==0&&Math.sign(r.median)===Math.sign(r.actual)).length/rows.filter(r=>r.median!==0&&r.actual!==0).length;
  const error=percentile(rows.map(r=>Math.abs(r.actual-r.median)),.5);
  return {direction,error,tests:rows.length};
}
async function history(ticker) {
  const url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(ticker)+'?range=5y&interval=1d&events=div%2Csplits';
  const r=await fetch(url,{headers:{'User-Agent':'ai-infra-watch/1.0'}});
  if(!r.ok) throw new Error(ticker+' market history HTTP '+r.status);
  const j=await r.json(), result=j?.chart?.result?.[0];
  const ts=result?.timestamp||[], closes=result?.indicators?.quote?.[0]?.close||[];
  return ts.map((t,i)=>({date:new Date(t*1000).toISOString().slice(0,10),price:closes[i]})).filter(p=>Number.isFinite(p.price));
}
function choose(v1,v2){
  if(!v1) return 'analogue-v2';
  if(!v2) return 'analogue-v1';
  const directionImproved=v2.direction>=v1.direction+0.02;
  const errorImproved=v2.error<=v1.error*0.95;
  return directionImproved && errorImproved ? 'analogue-v2' : 'analogue-v1';
}
async function upsert(row){
  const r=await fetch(SUPABASE_URL+'/rest/v1/forecast_model_config?on_conflict=ticker%2Chorizon',{
    method:'POST',
    headers:{...sbHeaders(),Prefer:'resolution=merge-duplicates,return=representation'},
    body:JSON.stringify(row)
  });
  const d=await r.json();
  if(!r.ok) throw new Error(d?.message||'Model config save failed');
  return d[0];
}
export default async function handler(req,res){
  if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({error:'Supabase model configuration is not configured.'});
  try{
    const cronSecret=String(process.env.CRON_SECRET||'').trim();
    const auth=String(req.headers?.authorization||'');
    const isCron=cronSecret && auth==='Bearer '+cronSecret;
    if(req.method==='GET'){
      const ticker=String(req.query?.ticker||'NVDA').toUpperCase();
      const horizon=Number(req.query?.horizon||20);
      const r=await fetch(SUPABASE_URL+'/rest/v1/forecast_model_config?ticker=eq.'+encodeURIComponent(ticker)+'&horizon=eq.'+horizon+'&limit=1',{headers:sbHeaders()});
      const d=await r.json();
      if(!r.ok) return res.status(r.status).json({error:d?.message||'Model config lookup failed'});
      return res.status(200).json({model:d[0]?.active_model||'analogue-v1',config:d[0]||null});
    }
    if(!isCron) return res.status(401).json({error:'Model evaluation is restricted to the scheduled job.'});
    if(req.method!=='POST' && req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
    const results=[];
    for(const ticker of TICKERS){
      const h=await history(ticker);
      for(const horizon of HORIZONS){
        const v1=run(h,horizon,'analogue-v1');
        const v2=run(h,horizon,'analogue-v2');
        if(!v1&&!v2) continue;
        const active=choose(v1,v2);
        const selected=active==='analogue-v2'?v2:v1;
        const row=await upsert({
          ticker,horizon,active_model:active,score:selected?selected.direction-(selected.error/1000):0,
          v1_direction:v1?.direction||null,v1_error:v1?.error||null,
          v2_direction:v2?.direction||null,v2_error:v2?.error||null,
          validation_tests:Math.max(v1?.tests||0,v2?.tests||0),updated_at:new Date().toISOString()
        });
        results.push({ticker,horizon,active,v1,v2});
      }
    }
    return res.status(200).json({ok:true,results});
  }catch(error){ return res.status(500).json({error:error?.message||'Model evaluation failed'}); }
}