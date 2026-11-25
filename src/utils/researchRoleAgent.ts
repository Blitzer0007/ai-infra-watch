import type {CouncilAdmission} from './portfolioCouncil';
import type {ResearchRoleName} from './researchRoleReview';
export {researchRoleResponseEnvelope} from '../../shared/researchRoleAgent.js';
export type ResearchAgentResponse={
  contract_version:'research-role-response-v1';admission:CouncilAdmission;
  result:{contract_version:'research-role-agent-v1';run_id:string;request_sha256:string;symbol:string;assessed_at:string;horizon_months:number;
    scope:'single-symbol-frozen-snapshot';mode:'fixture'|'multi-model'|'unconfigured';status:'complete'|'partial'|'failed'|'unavailable';termination_reason:string;
    input_status:'conditional'|'needs-data';selection_is_exhaustive:false;
    roles:Partial<Record<ResearchRoleName,{input_status:'conditional'|'needs-data';review_codes:string[];evidence_ids:string[]}>>;
    trace:Array<{role:ResearchRoleName;action:'inspect'|'coverage'|'review';status:'ok';evidence_ids:string[];families:string[]}>;
    usage:{model_calls:number;tool_calls:number;prompt_chars:number;provider_requests:number|null};
  };
};
