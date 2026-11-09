import {councilEnvelope,councilPayload} from '../../shared/portfolioCouncilContract.js';
import {forecastInstant} from './forecastInputs.js';
export {councilEnvelope,councilPayload};
export type CouncilEvidence = { evidence_id:string;symbol:string;family:string;metric:string;value:number;unit:string;source_id:string;observed_at:string|null;published_at:string|null;retrieved_at:string|null;basis:'reported'|'unknown';period_start:string|null;period_end:string|null;simulated:boolean };
export type CouncilResult = {
  contract_version:string;run_id:string;snapshot_id:string;symbol:string;horizon_months:number;assessed_at:string;mode:'fixture'|'nvidia'|'unconfigured';status:string;termination_reason:string;disposition:string;
  quality:{usable_ids:string[];missing_families:string[];conflicting_ids:string[];issues:Array<{evidence_id:string;codes:string[]}>};
  roles:Partial<Record<'bull'|'bear'|'judge',{summary:string;claims?:Array<{claim_id:string;evidence_id:string;stance:string;implication:string}>;limitations?:string[];preference?:string;winning_claim_ids?:string[]}>>;
  evidence:CouncilEvidence[];trace:Array<{role:string;action:string;status:string}>;
  usage:{model_calls:number;tool_calls:number;prompt_chars:number;provider_requests:number|null;jev_calls:number};
};
const stamp=(value:unknown):string|null=>forecastInstant(value)!==null?value as string:null;
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);

/** Public loaded facts only. No holding amounts, rule/thesis text or raw provider bodies. */
export function buildCouncilPacket(symbol:string,quote:unknown,financial:unknown,runId:string,nowMs:number,horizon:3|6|12) {
  if(!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)||!Number.isFinite(nowMs))throw Error('Invalid council input');
  const evidence:CouncilEvidence[]=[];
  const q=quote&&typeof quote==='object'&&!Array.isArray(quote)?quote as Record<string,unknown>:null;
  if(q&&q.symbol===symbol&&q.returnedSymbol===symbol) {
    const name=typeof q.provider==='string'?q.provider.toLowerCase():'';
    const source=['yahoo','finnhub','alpha-vantage'].includes(name)?name:/fixture|mock|^qa$/.test(name)?'fixture':'unknown';
    const simulated=q.simulated===true||q.sourceMode==='simulated'||source==='fixture';
    for(const [metric,field,unit] of [['price','price','USD'],['daily_change_pct','changePct','percent']]) {
      const value=q[field];if(!finite(value)||(metric==='price'&&(q.currency!=='USD'||value<=0)))continue;
      evidence.push({evidence_id:'loaded:'+metric,symbol,family:'market',metric,value,unit,source_id:source,
        observed_at:stamp(q.marketTime),published_at:stamp(q.publishedAt),retrieved_at:stamp(q.retrievedAt),basis:q.sourceMode==='live'?'reported':'unknown',period_start:null,period_end:null,simulated});
    }
  }
  const f=financial&&typeof financial==='object'&&!Array.isArray(financial)?financial as Record<string,any>:null;
  if(f?.symbol===symbol&&f.metrics)for(const [key,metric] of [['revenueGrowth','revenue_growth_pct'],['operatingMargin','operating_margin_pct']]) {
    const row=f.metrics[key];if(!row||row.status!=='verified'||row.unit!=='percent'||!finite(row.value))continue;
    evidence.push({evidence_id:'loaded:'+metric,symbol,family:'financial',metric,value:row.value,unit:'percent',source_id:'loaded-financial',observed_at:stamp(row.observedAt),published_at:null,retrieved_at:null,basis:'unknown',period_start:null,period_end:typeof row.periodEnd==='string'?row.periodEnd:null,simulated:false});
  }
  const packet={run_id:runId,symbol,horizon_months:horizon,assessed_at:new Date(nowMs).toISOString(),evidence};
  if(!councilPayload({mode:'loaded',packet}))throw Error('Invalid loaded council evidence');
  return packet;
}

export function councilCoverageState(result:CouncilResult) {
  return {contract_version:'council-coverage-v1',mode:result.mode,observed_count:result.evidence.length,usable_count:result.quality.usable_ids.length,
    missing_families:result.quality.missing_families,conflict_count:result.quality.conflicting_ids.length,bull_claim_count:result.roles.bull?.claims?.length||0,bear_claim_count:result.roles.bear?.claims?.length||0,
    role_count:Object.keys(result.roles).length,judge_abstained:result.roles.judge?.preference==='insufficient'};
}
