// Paired with Python's controlled renderer; cross-language fixtures test parity.
export const COUNCIL_PRESENTATION_VERSION='council-evidence-summary-v1';
export const COUNCIL_LIMITATIONS=Object.freeze([
  'Source authenticity remains unverified.',
  'Support or challenge is a model interpretation, not a verified causal effect.',
  'A cited observation does not establish a future outcome.',
]);
const judge=Object.freeze({
  bull:'The judge recorded a provisional bull preference. Future outcomes remain unknown.',
  bear:'The judge recorded a provisional bear preference. Future outcomes remain unknown.',
  balanced:'The judge recorded a balanced comparison. Future outcomes remain unknown.',
  insufficient:'The judge abstained. Future outcomes remain unknown.',
});
export function councilSummary(role,item) {
  if(role==='judge')return Object.hasOwn(judge,item.preference)?judge[item.preference]:null;
  if(!['bull','bear'].includes(role)||!Array.isArray(item.claims))return null;
  return item.claims.length?`The ${role} case cites inspected observations for conditional research.`:`No evidence claims were accepted for the ${role} case.`;
}
