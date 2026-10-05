    p25p75CoveragePct: null, p10p90CoveragePct: null
  };
  const eligible = subset.filter(row => Number(row.actual_return)!==0 && Number(row.median)!==0);
  const direction = eligible.length
    ? eligible.filter(row => Math.sign(Number(row.actual_return))===Math.sign(Number(row.median))).length/eligible.length*100
    : null;
  const signedErrors = subset.map(row => Number(row.actual_return)-Number(row.median)).filter(Number.isFinite);
  const errors = signedErrors.map(value => Math.abs(value)).sort((a,b)=>a-b);
  const middle = subset.filter(row=>Number(row.p25)<=Number(row.actual_return)&&Number(row.actual_return)<=Number(row.p75)).length/subset.length*100;
  const wide = subset.filter(row=>Number(row.p10)<=Number(row.actual_return)&&Number(row.actual_return)<=Number(row.p90)).length/subset.length*100;
  return {
    count: subset.length,
    sampleStatus: sampleStatus(subset.length),
    directionalAccuracyPct: direction==null?null:Number(direction.toFixed(2)),
    medianAbsoluteError: errors.length ? Number(errors[Math.floor((errors.length-1)*0.5)].toFixed(4)) : null,
    meanSignedErrorPct: signedErrors.length ? Number(mean(signedErrors).toFixed(4)) : null,
    p25p75CoveragePct: Number(middle.toFixed(2)),
    p10p90CoveragePct: Number(wide.toFixed(2)),
  };
}

function hasCreationEvidence(row) {
  const snapshot = row?.evidence_snapshot;
  return Boolean(snapshot && typeof snapshot === 'object' && snapshot.capturedAt && snapshot.source === 'forward_outlook');
}

function evidenceState(row) {
  if (hasCreationEvidence(row)) return 'CAPTURED';
  const snapshot = row?.evidence_snapshot;
  if (snapshot && typeof snapshot === 'object' && Object.keys(snapshot).length > 0) return 'INVALID_SNAPSHOT';
  return 'LEGACY_NO_SNAPSHOT';
}

function forecastAnalytics(rows) {
  const verified = rows.filter(row =>
    String(row.status) === 'verified' &&
    Number.isFinite(Number(row.actual_return)) &&
    Number.isFinite(Number(row.median)) &&
    hasCreationEvidence(row)
  );
  const legacyVerifiedCount = rows.filter(row =>
    String(row.status) === 'verified' &&
    Number.isFinite(Number(row.actual_return)) &&
    Number.isFinite(Number(row.median)) &&
    !hasCreationEvidence(row)
  ).length;
  const aggregate = aggregateForecastSubset;
  const overall = aggregate(verified);
  const grouped=(keyFn, decorate)=>{
    const map=new Map();
    for(const row of verified){
      const key=keyFn(row);
      const bucket=map.get(key)||[];
      bucket.push(row);
      map.set(key,bucket);
    }
    return [...map.values()].map(subset=>({...decorate(subset[0]),...aggregate(subset)}))
      .sort((a,b)=>String(a.ticker||a.modelVersion||a.scenarioId||'').localeCompare(String(b.ticker||b.modelVersion||b.scenarioId||''))||Number(a.horizon||0)-Number(b.horizon||0));
  };
  const byDirection=['up','down','flat'].map(bucket=>{
    const subset=verified.filter(row=>{
      const value=Number(row.actual_return);
      return bucket==='up'?value>0:bucket==='down'?value<0:value===0;
    });
    return {bucket,...aggregate(subset)};
  });
  const evidenceSnapshots = verified
    .map(row => row.evidence_snapshot)
    .filter(snapshot => snapshot && typeof snapshot === 'object');
  const evidenceCoverage = {
    forecastsWithSnapshot: evidenceSnapshots.length,
    analystAvailable: evidenceSnapshots.filter(snapshot => snapshot?.analystConsensus?.status === 'available').length,
    analystMissingOrFailed: evidenceSnapshots.filter(snapshot => snapshot?.analystConsensus?.status === 'missing' || snapshot?.analystConsensus?.status === 'failed').length,
    withNews: evidenceSnapshots.filter(snapshot => Number(snapshot?.counts?.news) > 0).length,
    withContracts: evidenceSnapshots.filter(snapshot => Number(snapshot?.counts?.contracts) > 0).length,
    withPolitical: evidenceSnapshots.filter(snapshot => Number(snapshot?.counts?.political) > 0).length,
    withMacro: evidenceSnapshots.filter(snapshot => Number(snapshot?.counts?.macro) > 0).length,
    multiChannel: evidenceSnapshots.filter(snapshot => {
      const counts = snapshot?.counts || {};
      return ['news', 'contracts', 'political', 'macro'].filter(key => Number(counts[key]) > 0).length +
        (snapshot?.analystConsensus?.status === 'available' ? 1 : 0) >= 2;
    }).length,
  };

  const stateRows = rows.reduce((counts, row) => {
    const state = evidenceState(row);
    counts[state] = (counts[state] || 0) + 1;
    return counts;
  }, { CAPTURED: 0, LEGACY_NO_SNAPSHOT: 0, INVALID_SNAPSHOT: 0 });

  const verifiedStateRows = verified.reduce((counts, row) => {
    const state = evidenceState(row);
    counts[state] = (counts[state] || 0) + 1;
    return counts;
  }, { CAPTURED: 0, LEGACY_NO_SNAPSHOT: 0, INVALID_SNAPSHOT: 0 });

  return {
    sampleSize:verified.length,
    legacyVerifiedCount,
    evidenceStateCounts: stateRows,
    verifiedEvidenceStateCounts: verifiedStateRows,
    sampleStatus: overall.sampleStatus,
    evidenceCoverage,
    directionalAccuracyPct: overall.directionalAccuracyPct,
    medianAbsoluteError: overall.medianAbsoluteError,
    meanSignedErrorPct: overall.meanSignedErrorPct,
    p25p75CoveragePct: overall.p25p75CoveragePct,
    p10p90CoveragePct: overall.p10p90CoveragePct,
    byTickerHorizon:grouped(
      row=>String(row.ticker||'').toUpperCase()+'|'+String(Number(row.horizon)),
      row=>({ticker:String(row.ticker||'').toUpperCase(),horizon:Number(row.horizon)})
    ),
    byScenario:grouped(row=>String(row.scenario_id||'unknown'),row=>({scenarioId:String(row.scenario_id||'unknown')})),
    byModel:grouped(row=>String(row.model_version||'analogue-v1'),row=>({modelVersion:String(row.model_version||'analogue-v1')})),
    byDirection,
    validationGate: {
      minimumRequired: 50,
      verifiedCount: verified.length,
      ready: verified.length >= 50,
      status: verified.length >= 50 ? '50+ validated forecasts' : 'building validation sample',
    },
    longTerm:{
      verifiedCount:verified.length,
      oldestVerifiedAt:verified.map(row=>row.verified_at).filter(Boolean).sort()[0]||null,
      newestVerifiedAt:verified.map(row=>row.verified_at).filter(Boolean).sort().at(-1)||null,
    },
  };
}

function normalize(row) {
  return {
    id: row.id,
    ticker: row.ticker,
    createdAt: row.created_at,
    targetDate: row.target_date,
    horizon: Number(row.horizon),
    scenarioId: row.scenario_id,
    entryPrice: Number(row.entry_price),
    median: Number(row.median),
    p25: Number(row.p25),
    p75: Number(row.p75),
    p10: Number(row.p10),
    p90: Number(row.p90),
    modelVersion: row.model_version || 'analogue-v1',
    createdSource: row.created_source || 'forward_outlook',
    evidenceSnapshot: row.evidence_snapshot && typeof row.evidence_snapshot === 'object' ? row.evidence_snapshot : undefined,
    evidenceState: evidenceState(row),
    status: row.status,
    verifiedAt: row.verified_at || undefined,
    actualDate: row.actual_date || undefined,
    actualPrice: row.actual_price == null ? undefined : Number(row.actual_price),
    actualReturn: row.actual_return == null ? undefined : Number(row.actual_return),
    medianError: row.median_error == null ? undefined : Number(row.median_error)
  };
}

export default async function handler(req, res) {
  // Forecast snapshots are user-specific application state. Prevent browser