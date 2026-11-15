import {validCalendarDay,validCalendarInstant} from './calendarInstant.js';
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fields=['contractVersion','symbol','currency','priceBasis','sourceMode','retrievedAt','corporateActions','expectedSessionDates'];

/** Consistency of retained declarations, never calendar/publisher authentication. */
export function admitRuleHistory(symbol,history,nowMs) {
  const blocked=reason=>({eligible:false,reason,verifiesSourceRecords:false,grantsDecisionEligibility:false});
  if(!Number.isSafeInteger(nowMs)||nowMs<0||nowMs>253402300799999)return blocked('An exact supported history assessment instant is required.');
  const p=history?.provenance;
  if(!/^[A-Z0-9.^=-]{1,20}$/.test(symbol||'')||!record(p)||Object.keys(p).length!==fields.length||Object.keys(p).some(key=>!fields.includes(key))||
    p.contractVersion!=='retained-rule-history-v1'||p.symbol!==symbol||p.currency!=='USD'||p.priceBasis!=='raw-close'||
    p.sourceMode!=='retained-declarations'||p.corporateActions!=='declared-none') {
    return blocked('Versioned issuer, USD/raw-close, retained-source and corporate-action declarations are required.');
  }
  if(!validCalendarInstant(p.retrievedAt)||Date.parse(p.retrievedAt)>nowMs)return blocked('Retained history retrieval must be an explicit instant at or before assessment.');
  const expected=p.expectedSessionDates,points=history.points;
  if(!Array.isArray(expected)||expected.length===0||expected.length>10000||expected.some(day=>!validCalendarDay(day))||new Set(expected).size!==expected.length||
    !Array.isArray(points)||points.length!==expected.length)return blocked('Declared calendar sessions and observed bars must have complete, unique, matching coverage.');
  const dates=new Set(expected);
  if(points.some(point=>!record(point)||typeof point.price!=='number'||!Number.isFinite(point.price)||point.price<=0||Object.keys(point).some(key=>!['date','price','availableAt'].includes(key))||
    !dates.has(point.date)||!validCalendarInstant(point.availableAt)||point.availableAt.slice(0,10)<point.date||Date.parse(point.availableAt)>Date.parse(p.retrievedAt))||
    new Set(points.map(point=>point.date)).size!==points.length) return blocked('Each declared session needs one compatible bar and original availability instant before retrieval.');
  return {eligible:true,reason:null,verifiesSourceRecords:false,grantsDecisionEligibility:false};
}
