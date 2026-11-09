/** Source receipts are separate from model evidence. No I/O or issuer-truth grant. */
import {forecastDay,forecastInstant} from '../src/utils/forecastInputs.js';
import {councilEvidence} from './portfolioCouncilContract.js';
export const SEC_COUNCIL_METHODS=['revenue-growth-yoy','operating-margin','operating-cash-flow-less-capex','liabilities-to-equity'];
export const SEC_COUNCIL_ISSUES=['ISSUER_MISMATCH','INVALID_SOURCE','SOURCE_LIMIT','INVALID_FACT','AMBIGUOUS_FACT','MISSING_INPUT','PERIOD_ALIGNMENT','NONPOSITIVE_DENOMINATOR','INVALID_CAPEX','NONFINITE_RESULT','DATE_ONLY_PUBLICATION'];
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const tags=['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet','OperatingIncomeLoss','NetCashProvidedByUsedInOperatingActivities','PaymentsToAcquirePropertyPlantAndEquipment','Liabilities','StockholdersEquity'];
export function secCouncilReceipt(v) {
  if(!exact(v,['contract_version','symbol','cik','retrieved_at','status','observations','issues','source_authenticity_verified'])||v.contract_version!=='council-sec-v1'||
    typeof v.symbol!=='string'||!/^[A-Z0-9.^=-]{1,20}$/.test(v.symbol)||typeof v.cik!=='string'||!/^\d{10}$/.test(v.cik)||Number(v.cik)<=0||forecastInstant(v.retrieved_at)===null||
    !['partial','unavailable'].includes(v.status)||v.source_authenticity_verified!==false||!Array.isArray(v.issues)||v.issues.length>12||!v.issues.every(c=>SEC_COUNCIL_ISSUES.includes(c))||
    !Array.isArray(v.observations)||v.observations.length>4)return false;
  const ids=new Set();
  for(const o of v.observations) {
    if(!exact(o,['evidence','method','inputs'])||!SEC_COUNCIL_METHODS.includes(o.method)||!councilEvidence(o.evidence)||o.evidence.symbol!==v.symbol||
      o.evidence.source_id!=='sec-edgar-companyfacts'||o.evidence.basis!=='unknown'||o.evidence.simulated!==false||o.evidence.observed_at!==null||o.evidence.published_at!==null||o.evidence.retrieved_at!==v.retrieved_at||
      ids.has(o.evidence.evidence_id)||!Array.isArray(o.inputs)||o.inputs.length!==2)return false;
    ids.add(o.evidence.evidence_id);
    if(!o.inputs.every(f=>exact(f,['tag','accession','form','period_start','period_end','filed_on','value','unit'])&&tags.includes(f.tag)&&/^\d{10}-\d{2}-\d{6}$/.test(f.accession)&&['10-K','10-K/A'].includes(f.form)&&
      (f.period_start===null||forecastDay(f.period_start)&&f.period_start<=f.period_end)&&forecastDay(f.period_end)&&forecastDay(f.filed_on)&&f.period_end<=f.filed_on&&f.filed_on<=new Date(Date.parse(v.retrieved_at)).toISOString().slice(0,10)&&typeof f.value==='number'&&Number.isFinite(f.value)&&f.unit==='USD'))return false;
    const [a,b]=o.inputs, e=o.evidence;
    if(o.inputs.some(f=>f.period_start!==null&&((Date.parse(f.period_end)-Date.parse(f.period_start))/86400000<300||(Date.parse(f.period_end)-Date.parse(f.period_start))/86400000>400)))return false;
    const samePeriod=a.period_start===b.period_start&&a.period_end===b.period_end&&a.accession===b.accession&&a.filed_on===b.filed_on;
    let expected,metric;
    if(o.method==='revenue-growth-yoy') {
      if(!tags.slice(0,3).includes(a.tag)||a.tag!==b.tag||a.accession!==b.accession||a.filed_on!==b.filed_on||!a.period_start||!b.period_start||b.value<=0||a.value<0||Date.parse(a.period_start)-Date.parse(b.period_end)!==86400000||Math.abs((Date.parse(a.period_end)-Date.parse(a.period_start))-(Date.parse(b.period_end)-Date.parse(b.period_start)))>14*86400000)return false;
      metric='revenue_growth_pct';expected=(a.value-b.value)/b.value*100;
    }else if(o.method==='operating-margin') {
      if(a.tag!=='OperatingIncomeLoss'||!tags.slice(0,3).includes(b.tag)||b.value<=0||!samePeriod||!a.period_start)return false;
      metric='operating_margin_pct';expected=a.value/b.value*100;
    }else if(o.method==='operating-cash-flow-less-capex') {
      if(a.tag!=='NetCashProvidedByUsedInOperatingActivities'||b.tag!=='PaymentsToAcquirePropertyPlantAndEquipment'||b.value<0||!samePeriod||!a.period_start)return false;
      metric='free_cash_flow_usd';expected=a.value-b.value;
    }else {
      if(a.tag!=='Liabilities'||b.tag!=='StockholdersEquity'||a.value<0||b.value<=0||!samePeriod||a.period_start!==null)return false;
      metric='liabilities_equity';expected=a.value/b.value;
    }
    if(!Number.isFinite(expected)||e.value!==expected||e.metric!==metric||e.evidence_id!=='sec:'+metric||e.period_start!==a.period_start||e.period_end!==a.period_end)return false;
  }
  return v.status!=='unavailable'||v.observations.length===0;
}
