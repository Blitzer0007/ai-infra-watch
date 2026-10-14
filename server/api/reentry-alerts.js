import { createPublicKey, createVerify } from 'node:crypto';
import { requireAccess } from '../../api/_access-auth.js';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ISSUER = 'https://token.actions.githubusercontent.com';
const REPOSITORY = 'Blitzer0007/ai-infra-watch';
const ALLOWED_WORKFLOW = '.github/workflows/reentry-alerts.yml';
let jwks = { expiresAt: 0, keys: [] };
function decode(segment) { try { return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')); } catch { return null; } }
async function oidcVerified(req) {
  const authorization = String(req.headers?.authorization || '');
  if (!authorization.startsWith('Bearer ')) return false;
  const parts = authorization.slice(7).trim().split('.');
  if (parts.length !== 3) return false;
  const header = decode(parts[0]), claims = decode(parts[1]);
  const now = Math.floor(Date.now()/1000);
  if (!header || !claims || header.alg !== 'RS256' || !header.kid || claims.iss !== ISSUER ||
      ![claims.aud].flat().includes('ai-infra-watch') || claims.repository !== REPOSITORY ||
      claims.ref !== 'refs/heads/main' || !String(claims.job_workflow_ref || '').startsWith(REPOSITORY + '/' + ALLOWED_WORKFLOW + '@') ||
      Number(claims.exp) <= now) return false;
  try {
    if (jwks.expiresAt <= Date.now()) {
      const r = await fetch(ISSUER + '/.well-known/jwks', { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return false;
      const body = await r.json(); if (!Array.isArray(body.keys)) return false;
      jwks = { expiresAt: Date.now()+300000, keys: body.keys };
    }
    const key = jwks.keys.find(k => k.kid === header.kid && k.kty === 'RSA'); if (!key) return false;
    const verifier = createVerify('RSA-SHA256'); verifier.update(parts[0]+'.'+parts[1]); verifier.end();
    return verifier.verify(createPublicKey({key,format:'jwk'}), Buffer.from(parts[2],'base64url'));
  } catch { return false; }
}
async function isCron(req) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (secret && req.headers?.authorization === 'Bearer '+secret) return true;
  return oidcVerified(req);
}
async function db(path, options={}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase service configuration is missing');
  const response = await fetch(SUPABASE_URL+'/rest/v1/'+path,{...options,headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY,'Content-Type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('Re-entry storage failed: HTTP '+response.status);
  const text=await response.text(); return text ? JSON.parse(text) : null;
}
async function quoteHistory(symbol) {
  const url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?range=1y&interval=1d';
  const response=await fetch(url,{headers:{'User-Agent':'ai-infra-watch/1.0'},signal:AbortSignal.timeout(10000)});
  if(!response.ok) throw new Error('Market quote unavailable for '+symbol);
  const body=await response.json(), result=body?.chart?.result?.[0];
  const meta=result?.meta, closes=result?.indicators?.quote?.[0]?.close;
  if(!meta || !Array.isArray(closes)) throw new Error('History unavailable for '+symbol);
  const valid=closes.filter(v=>Number.isFinite(v));
  const price=Number(meta.regularMarketPrice || valid.at(-1));
  if(!(price>0) || valid.length<50) throw new Error('Insufficient history for '+symbol);
  const avg=n=>valid.slice(-n).reduce((a,b)=>a+b,0)/n;
  const high=Math.max(...valid);
  return {price,sma20:avg(20),sma50:avg(50),drawdownFrom52WeekHighPct:high>0?(high-price)/high*100:null,retrievedAt:new Date().toISOString()};
}
function assess(row,q) {
  const targetReached=q.price<=Number(row.target_price);
  const trendConfirmed=q.price>=q.sma20 && q.sma20>=q.sma50;
  if(row.thesis_invalidated) return {status:'NOT_READY',reasons:['Saved thesis is marked invalidated; a lower price is not a buy signal.']};
  if(targetReached && trendConfirmed && String(row.thesis||'').trim()) return {status:'REENTRY_CANDIDATE',reasons:['Price is at or below your saved target.','Price is above the 20-day average and the 20-day average is above the 50-day average.','Review fresh valuation, earnings, news and portfolio risk before acting.']};
  if(targetReached) return {status:'WATCH_ENTRY',reasons:['Target reached, but trend confirmation or saved thesis is missing.']};
  return {status:'NOT_READY',reasons:['Price remains above your saved target.']};
}
async function sendTelegram(row,q) {
  const token=String(process.env.TELEGRAM_BOT_TOKEN||'').trim(), chat=String(process.env.TELEGRAM_CHAT_ID||'').trim();
  if(!token||!chat) throw new Error('Telegram credentials are not configured');
  const message=['🟢 AI Infra Watch · Re-entry Candidate','',row.symbol+' · '+assess(row,q).status,'Latest price: $'+q.price.toFixed(2),'Your target: $'+Number(row.target_price).toFixed(2),'20-day average: $'+q.sma20.toFixed(2),'50-day average: $'+q.sma50.toFixed(2),'52-week high drawdown: '+(q.drawdownFrom52WeekHighPct==null?'unavailable':q.drawdownFrom52WeekHighPct.toFixed(1)+'%'),'Saved thesis: '+String(row.thesis||'not recorded'),'','Why now: target reached and trend confirmation met.','Before acting, re-check current valuation, earnings, fresh company evidence, and portfolio concentration.','Review alert only — no automatic buy/sell instruction.'].join('\n');
  const response=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text:message}),signal:AbortSignal.timeout(10000)});
  const result=await response.json().catch(()=>null);
  if(!response.ok || result?.ok !== true) {
    const detail=String(result?.description||'').slice(0,200);
    throw new Error('Telegram delivery failed: '+(response.ok?'API rejected the message (HTTP '+response.status+')':'HTTP '+response.status)+(detail?': '+detail:''));
  }
}
async function runScan() {
  const rows=await db('reentry_watchlist?active=eq.true&select=*');
  const results=[]; let sent=0; const errors=[];
  for(const row of Array.isArray(rows)?rows:[]) {
    try {
      const q=await quoteHistory(row.symbol), signal=assess(row,q);
      const candidate=signal.status==='REENTRY_CANDIDATE';
      if(candidate && row.last_alert_signature!=='REENTRY_CANDIDATE') { await sendTelegram(row,q); sent++; }
      const patch={last_price:q.price,sma20:q.sma20,sma50:q.sma50,drawdown_from_52_week_high_pct:q.drawdownFrom52WeekHighPct,retrieved_at:q.retrievedAt,last_alert_signature:candidate?'REENTRY_CANDIDATE':'NOT_CANDIDATE',updated_at:new Date().toISOString()};
      await db('reentry_watchlist?symbol=eq.'+encodeURIComponent(row.symbol),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});
      results.push({...row,...patch,status:signal.status,reasons:signal.reasons});
    } catch(e) { errors.push(row.symbol+': '+String(e?.message||e)); results.push({...row,status:'INSUFFICIENT_DATA',reasons:['Could not refresh quote/history; no alert sent.']}); }
  }
  return {ok:errors.length===0,scanned:results.length,telegramSent:sent,errors,items:results};
}
function publicRow(row) {
  return {symbol:row.symbol,salePrice:row.sale_price==null?null:Number(row.sale_price),saleDate:row.sale_date||null,targetPrice:Number(row.target_price),thesis:row.thesis||'',thesisInvalidated:Boolean(row.thesis_invalidated),active:Boolean(row.active),lastPrice:row.last_price==null?null:Number(row.last_price),sma20:row.sma20==null?null:Number(row.sma20),sma50:row.sma50==null?null:Number(row.sma50),drawdownFrom52WeekHighPct:row.drawdown_from_52_week_high_pct==null?null:Number(row.drawdown_from_52_week_high_pct),retrievedAt:row.retrieved_at||null,status:row.status||'INSUFFICIENT_DATA',reasons:row.reasons||['Refresh market data for a current assessment.']};
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  const cron=await isCron(req);
  if(cron && req.method==='GET' && String(req.query?.run||'')==='true') {
    try { return res.status(200).json(await runScan()); }
    catch(e) { return res.status(500).json({ok:false,error:String(e?.message||e)}); }
  }
  if(!requireAccess(req,res)) return;
  try {
    if(req.method==='GET') {
      let rows=await db('reentry_watchlist?select=*&order=symbol.asc');
      if(String(req.query?.refresh||'')==='true') {
        const refreshed=await runScan();
        rows=refreshed.items;
      }
      return res.status(200).json({ok:true,items:(Array.isArray(rows)?rows:[]).map(publicRow)});
    }
    if(req.method==='POST') {
      const symbol=String(req.body?.symbol||'').trim().toUpperCase(), target=Number(req.body?.targetPrice);
      const thesis=String(req.body?.thesis||'').trim().slice(0,1200);
      if(!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)||!(target>0)||!Number.isFinite(target)) return res.status(400).json({ok:false,error:'Valid ticker and positive target price are required.'});
      const salePrice=req.body?.salePrice==null||req.body?.salePrice===''?null:Number(req.body.salePrice);
      const payload={symbol,sale_price:Number.isFinite(salePrice)&&salePrice>0?salePrice:null,sale_date:/^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.saleDate||''))?String(req.body.saleDate):null,target_price:target,thesis,thesis_invalidated:Boolean(req.body?.thesisInvalidated),active:req.body?.active!==false,updated_at:new Date().toISOString()};
      const saved=await db('reentry_watchlist?on_conflict=symbol',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(payload)});
      return res.status(200).json({ok:true,item:publicRow(saved?.[0]||payload)});
    }
    if(req.method==='DELETE') {
      const symbol=String(req.body?.symbol||'').trim().toUpperCase();
      if(!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)) return res.status(400).json({ok:false,error:'Valid ticker is required.'});
      await db('reentry_watchlist?symbol=eq.'+encodeURIComponent(symbol),{method:'DELETE',headers:{Prefer:'return=minimal'}});
      return res.status(200).json({ok:true,deleted:symbol});
    }
    return res.status(405).json({ok:false,error:'Method not allowed'});
  } catch(e) { return res.status(500).json({ok:false,error:String(e?.message||e)}); }
}
