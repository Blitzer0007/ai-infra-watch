/** Pure normalization of already-loaded SEC facts. Never fetches, infers timestamps or reads keys. */
import {forecastDay,forecastInstant} from '../../src/utils/forecastInputs.js';
import {secCouncilReceipt} from '../../shared/councilSources.js';
const DAY=86400000;
const REVENUE=['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet'];
const TAGS=[...REVENUE,'OperatingIncomeLoss','NetCashProvidedByUsedInOperatingActivities','PaymentsToAcquirePropertyPlantAndEquipment','Liabilities','StockholdersEquity'];
const cik=value=>(typeof value==='string'&&/^\d{1,10}$/.test(value)||Number.isSafeInteger(value)&&value>0&&value<=9999999999)?String(value).padStart(10,'0'):null;

export function adaptSecCouncilFacts({symbol,expectedCik,facts,retrievedAt}) {
  const identity=cik(expectedCik);
  if(!identity||Number(identity)<=0||typeof symbol!=='string'||!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)||forecastInstant(retrievedAt)===null)throw Error('Invalid SEC council scope');
  const receipt={contract_version:'council-sec-v1',symbol,cik:identity,retrieved_at:retrievedAt,status:'partial',observations:[],issues:[],source_authenticity_verified:false};
  const issue=code=>{if(!receipt.issues.includes(code))receipt.issues.push(code);};
  const stop=code=>{issue(code);receipt.status='unavailable';return receipt;};
  if(!facts||typeof facts!=='object'||Array.isArray(facts)||!facts.facts?.['us-gaap']||typeof facts.facts['us-gaap']!=='object'||Array.isArray(facts.facts['us-gaap']))return stop('INVALID_SOURCE');
  if(cik(facts.cik)!==identity)return stop('ISSUER_MISMATCH');
  let count=0;
  for(const tag of TAGS){const rows=facts.facts['us-gaap'][tag]?.units?.USD;if(rows!==undefined&&!Array.isArray(rows))return stop('INVALID_SOURCE');count+=rows?.length||0;if(count>10000)return stop('SOURCE_LIMIT');}
  function rows(tag,instant=false) {
    const valid=[];
    for(const r of facts.facts['us-gaap'][tag]?.units?.USD||[]) {
      if(!r||typeof r.val!=='number'||!Number.isFinite(r.val)||!['10-K','10-K/A'].includes(r.form)||r.fp!=='FY'||!forecastDay(r.end)||!forecastDay(r.filed)||r.end>r.filed||r.filed>new Date(Date.parse(retrievedAt)).toISOString().slice(0,10)||typeof r.accn!=='string'||!/^\d{10}-\d{2}-\d{6}$/.test(r.accn)||
        (instant?r.start!=null:!forecastDay(r.start)||(Date.parse(r.end)-Date.parse(r.start))/DAY<300||(Date.parse(r.end)-Date.parse(r.start))/DAY>400)) {issue('INVALID_FACT');continue;}
      valid.push({tag,accession:r.accn,form:r.form,period_start:instant?null:r.start,period_end:r.end,filed_on:r.filed,value:r.val,unit:'USD'});
    }
    const groups=new Map();for(const r of valid){const key=JSON.stringify([r.period_start,r.period_end]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
    const picked=[];
    for(const group of groups.values()) {
      group.sort((a,b)=>b.filed_on.localeCompare(a.filed_on));const latest=group.filter(r=>r.filed_on===group[0].filed_on);
      if(new Set(latest.map(r=>JSON.stringify([r.value,r.accession]))).size!==1){issue('AMBIGUOUS_FACT');return [];}
      picked.push(latest[0]);
    }
    if(new Set(picked.map(r=>r.period_end)).size!==picked.length){issue('AMBIGUOUS_FACT');return [];}
    return picked.sort((a,b)=>b.period_end.localeCompare(a.period_end));
  }
  const all=Object.fromEntries(TAGS.map(t=>[t,rows(t,['Liabilities','StockholdersEquity'].includes(t))]));
  const alternatives=REVENUE.filter(t=>all[t].length).sort((a,b)=>all[b][0].period_end.localeCompare(all[a][0].period_end));
  let revenue=alternatives.length?all[alternatives[0]]:[];
  if(revenue.length&&alternatives.some(t=>all[t][0].period_end===revenue[0].period_end&&(all[t][0].period_start!==revenue[0].period_start||all[t][0].value!==revenue[0].value))) {issue('AMBIGUOUS_FACT');revenue=[];}
  function add(method,metric,family,unit,value,inputs) {
    if(!Number.isFinite(value)){issue('NONFINITE_RESULT');return;}
    receipt.observations.push({method,inputs,evidence:{evidence_id:'sec:'+metric,symbol,family,metric,value,unit,source_id:'sec-edgar-companyfacts',observed_at:null,published_at:null,retrieved_at:retrievedAt,basis:'unknown',period_start:inputs[0].period_start,period_end:inputs[0].period_end,simulated:false}});
    issue('DATE_ONLY_PUBLICATION');
  }
  function aligned(a,b) {return a&&b&&a.period_start===b.period_start&&a.period_end===b.period_end&&a.accession===b.accession&&a.filed_on===b.filed_on;}
  const [current,prior]=revenue;
  if(current&&prior) {
    if(prior.value<=0||current.value<0)issue('NONPOSITIVE_DENOMINATOR');
    else if(current.accession!==prior.accession||current.filed_on!==prior.filed_on||Date.parse(current.period_start)-Date.parse(prior.period_end)!==DAY||Math.abs((Date.parse(current.period_end)-Date.parse(current.period_start))-(Date.parse(prior.period_end)-Date.parse(prior.period_start)))>14*DAY)issue('PERIOD_ALIGNMENT');
    else add('revenue-growth-yoy','revenue_growth_pct','financial','percent',(current.value-prior.value)/prior.value*100,[current,prior]);
  }else issue('MISSING_INPUT');
  const operating=all.OperatingIncomeLoss.find(r=>r.period_start===current?.period_start&&r.period_end===current?.period_end);
  if(current&&operating&&current.value>0&&aligned(operating,current))add('operating-margin','operating_margin_pct','financial','percent',operating.value/current.value*100,[operating,current]);
  else issue(current&&operating?'PERIOD_ALIGNMENT':'MISSING_INPUT');
  const cash=all.NetCashProvidedByUsedInOperatingActivities[0];
  const capex=all.PaymentsToAcquirePropertyPlantAndEquipment.find(r=>r.period_start===cash?.period_start&&r.period_end===cash?.period_end);
  if(cash&&capex) {
    if(capex.value<0)issue('INVALID_CAPEX');
    else if(!aligned(cash,capex))issue('PERIOD_ALIGNMENT');
    else add('operating-cash-flow-less-capex','free_cash_flow_usd','financial','USD',cash.value-capex.value,[cash,capex]);
  }else issue('MISSING_INPUT');
  const liabilities=all.Liabilities[0],equity=all.StockholdersEquity.find(r=>r.period_end===liabilities?.period_end);
  if(liabilities&&equity) {
    if(equity.value<=0||liabilities.value<0)issue('NONPOSITIVE_DENOMINATOR');
    else if(!aligned(liabilities,equity))issue('PERIOD_ALIGNMENT');
    else add('liabilities-to-equity','liabilities_equity','risk','ratio',liabilities.value/equity.value,[liabilities,equity]);
  }else issue('MISSING_INPUT');
  if(!secCouncilReceipt(receipt))return {...receipt,status:'unavailable',observations:[],issues:['INVALID_SOURCE']};
  return receipt;
}
