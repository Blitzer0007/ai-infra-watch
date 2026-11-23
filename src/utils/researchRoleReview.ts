export {researchRoleReview,researchRoleReviewEnvelope,RESEARCH_REVIEW_CODES} from '../../shared/researchRoleReview.js';
export type ResearchRoleName='company'|'catalyst'|'daily';
export type ResearchRoleReview={
  contract_version:'research-role-review-v1';rules_version:'loaded-review-roles-v1';mode:'deterministic';
  run_id:string;request_sha256:string;symbol:string;assessed_at:string;horizon_months:number;status:'conditional'|'needs-data';
  roles:Record<ResearchRoleName,{status:'conditional'|'needs-data';evidence_ids:string[];review_codes:string[]}>;
  policy:{read_only:true;max_evidence:8;max_review_codes:7;model_calls:0;provider_requests:0;tool_calls:0};
  source_authenticity_verified:false;forecast_validity_established:false;grants_decision_eligibility:false;changes_allocation:false;sends_messages:false;
};
