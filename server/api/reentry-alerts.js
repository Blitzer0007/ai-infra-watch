import { createHash, createPublicKey, createVerify } from 'node:crypto';
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
export function telegramAccepted(httpOk, payload) {
  return httpOk === true && payload?.ok === true && Number.isInteger(payload?.result?.message_id) && payload.result.message_id > 0;
}

/** Notify only on entry into the candidate state; a failed send leaves persisted state unchanged for retry. */
export function shouldNotifyCandidate(lastAlertSignature, candidate) {
  return candidate === true && lastAlertSignature !== 'REENTRY_CANDIDATE';
}

export function buildDeliveryKey(row) {
  const keyMaterial=[String(row?.symbol||'').toUpperCase(),String(row?.target_price??''),String(row?.sale_date||''),String(row?.thesis||'')].join('|');
  return createHash('sha256').update(keyMaterial).digest('hex');
}

/**
 * One automatic attempt protected by a durable unique claim.
 * Failure after send retains the returned message ID in evidence. A claimed key
 * is never auto-reclaimed; ambiguous cases require reconciliation to avoid duplicates.
 */
export async function sendOnceWithDurableClaim({ claim, send, recordAccepted, recordFailure }) {
  const claimed = await claim();
  if (claimed !== true) {
    return { status: 'existing_claim_suppressed', messageId: null, attempted: false, deliveryRecordPersisted: null };
  }

  let messageId = null;
  try {
    messageId = await send();
  } catch (error) {
    const status = error?.deliveryStatus === 'rejected' ? 'rejected' : 'uncertain';
    let deliveryRecordPersisted = false;
    try {
      await recordFailure(status, null, String(error?.message || error));
      deliveryRecordPersisted = true;
    } catch {
      // The original durable claim remains in "sending", suppressing automatic retries.
    }
    return {
      status,
      messageId: null,
      attempted: true,
      deliveryRecordPersisted,
      error: String(error?.message || error),
      reconciliationRequired: status === 'uncertain' || !deliveryRecordPersisted,
    };
  }

  try {
    await recordAccepted(messageId);
    return { status: 'accepted', messageId, attempted: true, deliveryRecordPersisted: true };
  } catch (error) {
    const message = String(error?.message || error);
    let deliveryRecordPersisted = false;
    try {
      // We know Telegram returned this ID. Preserve it even while marking the DB outcome uncertain.
      await recordFailure('uncertain', messageId, message);
      deliveryRecordPersisted = true;
    } catch {
      // The claim remains durable if the database update cannot be confirmed.
    }
    return {
      status: 'accepted_state_persistence_failed',
      messageId,
      attempted: true,
      deliveryRecordPersisted,
      error: message,
      reconciliationRequired: true,
    };
  }
}

export function classifyScan({ activeRows, evaluatedRows, qualifyingCandidates, notifyEligibleCandidates, telegramSent, errors }) {
  if (activeRows === 0) return 'empty_watchlist';
  if (errors > 0) return 'completed_with_errors';
  if (notifyEligibleCandidates > 0 && telegramSent > 0) return 'telegram_delivery_confirmed';
  if (notifyEligibleCandidates > 0) return 'candidate_not_delivered';
  if (evaluatedRows === activeRows && qualifyingCandidates === 0) return 'evaluated_no_qualifying_candidate';
  if (evaluatedRows === activeRows) return 'evaluated_existing_candidate_no_new_alert';
  return 'incomplete_scan';
}

async function sendTelegram(row,q) {
  const token=String(process.env.TELEGRAM_BOT_TOKEN||'').trim(), chat=String(process.env.TELEGRAM_CHAT_ID||'').trim();
  if(!token||!chat) throw new Error('Telegram credentials are not configured');
  const message=['🟢 AI Infra Watch · Re-entry Candidate','',row.symbol+' · '+assess(row,q).status,'Latest price: $'+q.price.toFixed(2),'Your target: $'+Number(row.target_price).toFixed(2),'20-day average: $'+q.sma20.toFixed(2),'50-day average: $'+q.sma50.toFixed(2),'52-week high drawdown: '+(q.drawdownFrom52WeekHighPct==null?'unavailable':q.drawdownFrom52WeekHighPct.toFixed(1)+'%'),'Saved thesis: '+String(row.thesis||'not recorded'),'','Why now: target reached and trend confirmation met.','Before acting, re-check current valuation, earnings, fresh company evidence, and portfolio concentration.','Review alert only — no automatic buy/sell instruction.'].join('\n');
  const response=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text:message}),signal:AbortSignal.timeout(10000)});
  const payload=await response.json().catch(()=>null);
  if(!response.ok) {
    const error = new Error('Telegram delivery rejected: HTTP '+response.status);
    error.deliveryStatus = 'rejected';
    throw error;
  }
  if(!telegramAccepted(response.ok,payload)) {
    const error = new Error('Telegram API did not confirm message acceptance');
    error.deliveryStatus = 'rejected';
    throw error;
  }
  return payload.result.message_id;
}
async function runScan() {
  const rows=await db('reentry_watchlist?active=eq.true&select=*');
  const results=[]; let sent=0; let qualifyingCandidates=0; let notifyEligibleCandidates=0; const errors=[]; const deliveryEvidence=[];
  for(const row of Array.isArray(rows)?rows:[]) {
    let acceptedMessageId = null;
    try {
      const q=await quoteHistory(row.symbol), signal=assess(row,q);
      const candidate=signal.status==='REENTRY_CANDIDATE';
      if (candidate) qualifyingCandidates++;
      const notifyEligible = shouldNotifyCandidate(row.last_alert_signature, candidate);
      if (notifyEligible) notifyEligibleCandidates++;
      if(notifyEligible) {
        const chatId=String(process.env.TELEGRAM_CHAT_ID||'').trim();
        if(!chatId) throw new Error('Telegram chat ID is not configured');
        // One notification per configured thesis/target episode. Existing claims are never auto-retried.
        const deliveryKey=buildDeliveryKey(row);
        const delivery=await sendOnceWithDurableClaim({
          claim: async () => db('rpc/claim_reentry_telegram_delivery',{method:'POST',body:JSON.stringify({p_delivery_key:deliveryKey,p_symbol:row.symbol,p_chat_id:chatId})}),
          send: async () => sendTelegram(row,q),
          recordAccepted: async (messageId) => db('rpc/finish_reentry_telegram_delivery',{method:'POST',body:JSON.stringify({p_delivery_key:deliveryKey,p_status:'accepted',p_message_id:messageId,p_error:null})}),
          recordFailure: async (status,messageId,error) => db('rpc/finish_reentry_telegram_delivery',{method:'POST',body:JSON.stringify({p_delivery_key:deliveryKey,p_status:status,p_message_id:messageId,p_error:error})}),
        });
        deliveryEvidence.push({symbol:row.symbol,...delivery,statePersisted:false});
        if(delivery.status==='accepted') {
          acceptedMessageId=delivery.messageId;
          sent++;
        } else if(delivery.status==='accepted_state_persistence_failed') {
          acceptedMessageId=delivery.messageId;
          sent++;
          throw new Error('Telegram accepted message ID '+delivery.messageId+', but delivery-state persistence is unconfirmed; automatic duplicate sends are suppressed pending reconciliation.');
        } else if(delivery.status==='rejected' || delivery.status==='uncertain') {
          throw new Error('Telegram delivery '+delivery.status+': '+delivery.error);
        }
      }
      const patch={last_price:q.price,sma20:q.sma20,sma50:q.sma50,drawdown_from_52_week_high_pct:q.drawdownFrom52WeekHighPct,retrieved_at:q.retrievedAt,last_alert_signature:candidate?'REENTRY_CANDIDATE':'NOT_CANDIDATE',updated_at:new Date().toISOString()};
      await db('reentry_watchlist?symbol=eq.'+encodeURIComponent(row.symbol),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});
      if (acceptedMessageId) {
        const evidence = deliveryEvidence.find(item => item.symbol === row.symbol && item.messageId === acceptedMessageId);
        if (evidence) evidence.statePersisted = true;
      }
      results.push({...row,...patch,status:signal.status,reasons:signal.reasons});
    } catch(e) {
      const detail = String(e?.message||e);
      const deliveryNote = acceptedMessageId
        ? ' Telegram accepted message ID '+acceptedMessageId+'; the durable notification claim suppresses automatic duplicate sends while state is reconciled.'
        : '';
      errors.push(row.symbol+': '+detail+deliveryNote);
      results.push({...row,status:'INSUFFICIENT_DATA',reasons:[acceptedMessageId
        ? 'Telegram returned accepted message ID '+acceptedMessageId+'. Delivery-state reconciliation is required; automatic duplicate sends remain suppressed by the durable claim.'
        : 'Could not refresh quote/history or persist the scan; alert delivery was not confirmed.']});
    }
  }
  const summary = { activeRows: Array.isArray(rows) ? rows.length : 0, evaluatedRows: results.length, qualifyingCandidates, notifyEligibleCandidates, telegramSent: sent, errors: errors.length };
  return {ok:errors.length===0,scanStatus:classifyScan(summary),...summary,errors,deliveryEvidence,items:results};
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
