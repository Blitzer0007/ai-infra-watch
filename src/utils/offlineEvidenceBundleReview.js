/**
 * One offline review across detached signed receipts, real local artifact bytes,
 * and prospective split metadata. No user-provided status flags are trusted.
 * A structurally complete review is NOT independent verification of accuracy.
 */
import { auditArtifactFiles } from './offlineArtifactIntegrity.js';
import { auditProspectiveHoldoutSplit } from './prospectiveHoldoutSplit.js';

export async function reviewOfflineEvidenceBundle(input = {}) {
  const result = {
    version:'offline-evidence-bundle-v1',
    state:'blocked',
    artifactState:'not-reviewed',
    holdoutState:'unverified',
    decisionAligned:false,
    filesVerified:0,
    leakedSampleCount:null,
    historicalAccuracyEligible:false,
    investmentDecisionEligible:false,
    note:'Signed artifact bytes and a structural holdout split cannot establish independent source history, absence of training contamination, or forecast accuracy.',
  };
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !input.commitment || typeof input.commitment !== 'object' ||
      !input.decisionAt || input.decisionAt !== input.commitment.decisionAt) {
    return {...result,state:'decision-mismatch'};
  }
  // Do not touch local artifacts if the holdout manifest already contradicts
  // the signed receipt's decision timestamp or has invalid/overlapping samples.
  const holdout = auditProspectiveHoldoutSplit({
    commitment:input.commitment,
    now:input.now,
  });
  if (holdout.state !== 'structural-checks-observed') {
    return {...result,state:'holdout-blocked',holdoutState:holdout.state,
      decisionAligned:true,leakedSampleCount:holdout.leakedSampleCount};
  }
  const artifact = await auditArtifactFiles({
    decisionAt:input.decisionAt,receipts:input.receipts,
    trustAnchors:input.trustAnchors,files:input.files,now:input.now,
  });
  return {
    ...result,
    state:artifact.state==='signed-digests-observed'?'structural-evidence-observed':'artifact-blocked',
    artifactState:artifact.state,
    holdoutState:holdout.state,
    decisionAligned:true,
    filesVerified:artifact.filesVerified,
    leakedSampleCount:holdout.leakedSampleCount,
  };
}
