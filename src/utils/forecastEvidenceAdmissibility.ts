/** Read-only evidence claims boundary for forecast outcome studies.
 * Private archive rows and stored validation statuses are observations, not
 * independent evidence of original publication, adjusted outcomes, or holdouts.
 */
type HistoricalArchive = {
  inventoryWindow?: {returnedRows?:unknown;totalIndexedRows?:unknown;capped?:unknown};
  historicalGate?: {status?:unknown;reason?:unknown};
  providers?:unknown;
};
type EvaluationProtocol = {
  version?:unknown;
  coverage?: {returnedRows?:unknown;truncated?:unknown};
  lifecycle?: {independentScorable?:unknown;verifiedUnscorable?:unknown;pendingDueForReview?:unknown};
};
const count=(value:unknown):number|null=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;

export function summarizeForecastEvidenceAdmissibility(archiveInput:unknown, evaluationInput:unknown, evaluationStatus:unknown) {
  const archive:HistoricalArchive|null=archiveInput&&typeof archiveInput==='object'&&!Array.isArray(archiveInput)?archiveInput as HistoricalArchive:null;
  const evalReport:EvaluationProtocol|null=evaluationInput&&typeof evaluationInput==='object'&&!Array.isArray(evaluationInput)?evaluationInput as EvaluationProtocol:null;
  const hasEvaluation=evaluationStatus==='ready'&&evalReport?.version==='forecast-evaluation-v1'&&evalReport.lifecycle&&evalReport.coverage;
  const evaluation=hasEvaluation?evalReport:null;
  const indexedCount=count(archive?.inventoryWindow?.returnedRows);
  const fullIndexCount=count(archive?.inventoryWindow?.totalIndexedRows);
  const archiveInventoryState=archive===null?'unavailable':indexedCount===null?'unknown':indexedCount===0?'no-indexed-metadata':'indexed-metadata-only';
  const recordedGate=typeof archive?.historicalGate?.status==='string'?archive.historicalGate.status:'unknown';
  const independentCount=count(evaluation?.lifecycle?.independentScorable);
  const pendingDue=count(evaluation?.lifecycle?.pendingDueForReview);
  const unusable=count(evaluation?.lifecycle?.verifiedUnscorable);
  const evaluatedRows=count(evaluation?.coverage?.returnedRows);
  const result={
    version:'forecast-evidence-admissibility-v1' as const,
    archive:{
      state:archiveInventoryState,
      indexedMetadataRows:indexedCount,
      indexedTotalRows:fullIndexCount,
      windowCapped:archive?.inventoryWindow?.capped===true,
      recordedHistoricalGate:recordedGate,
    },
    evaluation:{
      state:hasEvaluation?'recent-window-only':'unavailable',
      returnedRows:evaluatedRows,
      independentScorable:independentCount,
      dueForReview:pendingDue,
      unscorable:unusable,
      windowTruncated:hasEvaluation?evaluation?.coverage?.truncated===true:null,
    },
    requiredProof:{
      sourcePublishedBeforeDecision:'not-independently-established' as const,
      adjustedMarketOutcome:'not-independently-established' as const,
      universeMembershipAtDecision:'not-independently-established' as const,
      prospectiveHoldoutAndLeakageAudit:'not-independently-established' as const,
    },
    historicalEvaluationEligible:false as const,
    investmentDecisionEligible:false as const,
    note:'Archive metadata, recorded hashes and stored verified labels do not prove source publication before prediction, adjusted-close/corporate-action accuracy, point-in-time index membership or prospective out-of-sample independence.',
  };
  return result;
}
