import { deliveryEvidence } from '../../shared/alertDeliveryEvidence.js';
export { deliveryEvidence } from '../../shared/alertDeliveryEvidence.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

const PAGE_SIZE = 100;
const DAY = 86400000;
const COLUMNS = 'id,delivery_key,symbol,status,telegram_message_id,created_at,completed_at';
const digest = (key, value) => createHmac('sha256',key).update(value).digest('base64url');
function timestamp(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))return null;
  const day=value.slice(0,10);
  if(new Date(day).toISOString().slice(0,10)!==day||Number(value.slice(11,13))>23||Number(value.slice(14,16))>59||Number(value.slice(17,19))>59)return null;
  return value;
}
function micros(value) {
  const fraction=(value.match(/\.(\d+)/)?.[1]||'').padEnd(6,'0');
  return BigInt(Date.parse(value))*1000n+BigInt(fraction.slice(3));
}

export const inboxError = message => Object.assign(new Error(message),{status:400});
function decodeCursor(value, key, scope, days, nowMs) {
  if (typeof value!=='string' || value.length>2048) throw inboxError('Invalid continuation cursor.');
  const [body, signature, extra]=value.split('.');
  const expected=digest(key,body || '');
  if (extra || !signature || Buffer.byteLength(signature)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) throw inboxError('Invalid continuation cursor.');
  let data;try { data=JSON.parse(Buffer.from(body,'base64url').toString('utf8')); } catch { throw inboxError('Invalid continuation cursor.'); }
  if (!data || typeof data!=='object' || Array.isArray(data) || data.v!==1 || data.scope!==scope || data.days!==days || !timestamp(data.until) || !timestamp(data.before) || !Number.isSafeInteger(data.id) || data.id<=0
    || Date.parse(data.until)>nowMs || nowMs-Date.parse(data.until)>30*60000 || micros(data.before)>micros(data.until) || micros(data.before)<micros(data.until)-BigInt(days*DAY)*1000n) throw inboxError('Invalid or expired continuation cursor.');
  return data;
}

/** One SELECT-only request. No import from a scanner, sender, RPC, or notification module. */
export async function readAlertInboxPage({ config, query={}, nowMs=Date.now(), fetchImpl=fetch }) {
  if (!Number.isFinite(nowMs)) throw new Error('Clock unavailable');
  for (const key of Object.keys(query)) if (!['route','days','cursor'].includes(key)) throw inboxError('Unsupported inbox parameter.');
  const rawDays=query.days===undefined?'7':query.days;
  if (typeof rawDays!=='string'|| !/^([1-9]|[12][0-9]|30)$/.test(rawDays)) throw inboxError('Choose a window from 1 to 30 days.');
  const days=Number(rawDays);
  if (!config?.url || !config.key || !/^(?:-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/.test(config.recipient || '')) throw new Error('Inbox scope unavailable');
  const base=new URL(config.url);
  if (base.protocol!=='https:'||base.username||base.password||base.search||base.hash) throw new Error('Inbox configuration unavailable');
  const scope=digest(config.key,'scope:'+base.origin+':'+config.recipient);
  const cursor=query.cursor===undefined?null:decodeCursor(query.cursor,config.key,scope,days,nowMs);
  const until=cursor?.until || new Date(nowMs).toISOString();
  const since=new Date(Date.parse(until)-days*DAY).toISOString();
  const params=new URLSearchParams({select:COLUMNS,chat_id:'eq.'+config.recipient,order:'created_at.desc,id.desc',limit:String(PAGE_SIZE+1)});
  params.append('created_at','gte.'+since);params.append('created_at','lte.'+until);
  if (cursor) params.set('or',`(created_at.lt.${cursor.before},and(created_at.eq.${cursor.before},id.lt.${cursor.id}))`);
  const headers={apikey:config.key,Accept:'application/json'};
  if (!config.key.startsWith('sb_secret_')) headers.Authorization='Bearer '+config.key;
  const response=await fetchImpl(base.origin+'/rest/v1/reentry_telegram_deliveries?'+params,{method:'GET',headers,signal:AbortSignal.timeout(6000)});
  if (!response.ok) throw new Error('Inbox read unavailable');
  const rows=await response.json();
  if (!Array.isArray(rows)||rows.length>PAGE_SIZE+1) throw new Error('Invalid inbox response');
  // Reject malformed/scope-contradictory data instead of displaying a healthy empty ledger.
  let previous=null;
  for (const row of rows) {
    if (!row || !Number.isSafeInteger(row.id)||row.id<=0 || typeof row.delivery_key!=='string'||!row.delivery_key.trim()||row.delivery_key.length>1024
      || typeof row.symbol!=='string'||!/^[A-Z][A-Z0-9.-]{0,14}$/.test(row.symbol) || !timestamp(row.created_at)
      || micros(row.created_at)<micros(since)||micros(row.created_at)>micros(until)
      || (row.chat_id!=null && row.chat_id!==config.recipient)) throw new Error('Invalid inbox response');
    const created=micros(row.created_at);
    if (previous&&(created>previous.time||(created===previous.time&&row.id>=previous.id))) throw new Error('Invalid inbox ordering');
    if (cursor&&(created>micros(cursor.before)||(created===micros(cursor.before)&&row.id>=cursor.id))) throw new Error('Invalid inbox cursor result');
    previous={time:created,id:row.id};
  }
  const selected=rows.slice(0,PAGE_SIZE);
  const items=selected.map(row=>({
    id:'server:'+digest(config.key,scope+':row:'+row.id),episodeId:digest(config.key,scope+':episode:'+row.delivery_key),
    origin:'reentry-server',symbol:row.symbol,severity:null,title:row.symbol+' re-entry delivery record',ruleId:null,evidenceIds:[],
    observedAt:new Date(row.created_at).toISOString(),completedAt:timestamp(row.completed_at)?new Date(row.completed_at).toISOString():null,suppressionReason:null,...deliveryEvidence(row),
  }));
  const last=selected.at(-1);
  const continuation=rows.length>PAGE_SIZE?{v:1,scope,days,until,before:timestamp(last.created_at),id:last.id}:null;
  const body=continuation?Buffer.from(JSON.stringify(continuation)).toString('base64url'):null;
  return {ok:true,source:'reentry-telegram-ledger',coverage:'partial',from:since,until,items,nextCursor:body?body+'.'+digest(config.key,body):null,
    limitation:'Only the configured recipient’s re-entry Telegram ledger is covered. Other alert classes and browser detections are not correlated with these records.'};
}
