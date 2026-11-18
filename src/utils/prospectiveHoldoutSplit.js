/**
 * Deterministic, metadata-only prospective holdout leakage screen.
 * A claimed freeze date or hashed sample ID is not independently trusted.
 * This module can REJECT unsafe splits but can never approve accuracy/trading.
 * No file, network or private-row access.
 */
const strictUtc = v => {
  if (typeof v !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v)) return null;
  const ms=Date.parse(v);
  const normalized=v.replace(/(?:\.(\d{1,3}))?Z$/,(_match,fraction)=>'.'+(fraction??'').padEnd(3,'0')+'Z');
  return Number.isFinite(ms) && new Date(ms).toISOString()===normalized ? ms : null;
};
const validId = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const plain = x => !!x && typeof x === 'object' && !Array.isArray(x) &&
  (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
const validIds = x => Array.isArray(x) && x.length > 0 && x.length <= 5000 &&
  x.every(validId);

export function auditProspectiveHoldoutSplit(input) {
  const base={
    version:'prospective-holdout-split-audit-v1',
    state:'unverified',
    trainingCount:null, holdoutCount:null, duplicateTraining:0,
    duplicateHoldout:0, leakedSampleCount:0,
    temporalOrderValid:false, holdoutWindowComplete:false,
    independentlyTimestamped:false,
    holdoutAccuracyEligible:false, investmentDecisionEligible:false,
    note:'Metadata split checks cannot authenticate a historical commitment, exclude model-training leakage, validate labels, or establish forward performance.',
  };
  if(!plain(input) || !plain(input.commitment)) return base;
  const c=input.commitment;
  if(!validIds(c.trainingSampleDigests) || !validIds(c.holdoutSampleDigests)) return base;
  const train=new Set(c.trainingSampleDigests), holdout=new Set(c.holdoutSampleDigests);
  const overlap=[...holdout].filter(x=>train.has(x)).length;
  const duplicateTraining=c.trainingSampleDigests.length-train.size;
  const duplicateHoldout=c.holdoutSampleDigests.length-holdout.size;
  const dates=['trainingThrough','frozenAt','decisionAt','holdoutStart','holdoutEnd'];
  const times=dates.map(k=>strictUtc(c[k]));
  const temporalOrderValid=times.every(x=>x!==null) &&
    times[0] <= times[1] && times[1] < times[2] &&
    times[2] <= times[3] && times[3] < times[4];
  const now=input.now === undefined ? Date.now() : strictUtc(input.now);
  const holdoutWindowComplete=now!==null && times[4]!==null && times[4] <= now;
  const counts={trainingCount:c.trainingSampleDigests.length,
    holdoutCount:c.holdoutSampleDigests.length,
    duplicateTraining,duplicateHoldout,leakedSampleCount:overlap,
    temporalOrderValid,holdoutWindowComplete};
  const violations=overlap>0||duplicateTraining>0||duplicateHoldout>0||!temporalOrderValid;
  return {...base,...counts,state:violations?'unsafe-split':
    holdoutWindowComplete?'structural-checks-observed':'pending-holdout-window'};
}
