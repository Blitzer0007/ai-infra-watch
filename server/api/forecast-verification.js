import { history as routedHistory } from '../../api/_market-data.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

function missingConfig() {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  return missing;
}

function headers() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

function send(res, status, body) {
  res.status(status).json(body);
}

async function verifyDueForecasts() {
  const today = new Date().toISOString().slice(0, 10);
  const dueResponse = await fetch(
    SUPABASE_URL + '/rest/v1/forecast_snapshots?select=*&status=eq.pending&target_date=lte.' + today + '&order=target_date.asc&limit=100',
    { headers: headers() }
  );
  const due = await dueResponse.json();
  if (!dueResponse.ok) throw new Error(due?.message || 'Failed to load due forecasts.');

  const results = [];
  const failures = [];
  for (const forecast of due) {
    try {
      const marketData = await routedHistory(String(forecast.ticker).toUpperCase(), '5y');
      const points = marketData.points || [];
      // Never verify against a point before the forecast target date.
      // If the market history has not reached the target yet, leave it pending.
      const point = points.find(item => item.date >= forecast.target_date);
      if (!point || !(Number(forecast.entry_price) > 0) || !(Number(point.price) > 0)) {
        throw new Error('No market point on or after the target date yet.');
      }

      const actualReturn = (Number(point.price) / Number(forecast.entry_price) - 1) * 100;
      const patch = {
        status: 'verified',
        verified_at: new Date().toISOString(),
        actual_date: point.date,
        actual_price: Number(point.price),
        actual_return: actualReturn,
        median_error: actualReturn - Number(forecast.median)
      };
      const updateResponse = await fetch(
        SUPABASE_URL + '/rest/v1/forecast_snapshots?id=eq.' + encodeURIComponent(forecast.id),
        { method: 'PATCH', headers: headers(), body: JSON.stringify(patch) }
      );
      const updateData = await updateResponse.json();
      if (!updateResponse.ok) throw new Error(updateData?.message || 'Supabase update failed.');
      results.push({ id: forecast.id, ticker: forecast.ticker, targetDate: forecast.target_date, actualDate: point.date, actualReturn });
    } catch (error) {
      failures.push({ id: forecast.id, ticker: forecast.ticker, error: error?.message || 'Verification failed.' });
    }
  }
  return { checked: due.length, verified: results.length, failed: failures.length, results, failures };
}

function mean(v) { return v.length ? v.reduce((a,b)=>a+b,0)/v.length : 0; }
function stdev(v) { if (v.length < 2) return 0; const m=mean(v); return Math.sqrt(mean(v.map(x=>(x-m)**2))); }
function percentile(v,p) {
  if (!v.length) return 0;
  const s=[...v].sort((a,b)=>a-b), x=(s.length-1)*p, lo=Math.floor(x), hi=Math.ceil(x);
  return lo===hi?s[lo]:s[lo]+(s[hi]-s[lo])*(x-lo);
}
function features(history, i) {
  const price=history[i]?.price;
  if (!(price>0) || i<20) return null;
  const ret=(days)=>{
    if(i<days) return 0;
    const a=history[i-days]?.price;
    return a>0 ? (price/a-1)*100 : 0;
  };
  const daily=[];
  for(let j=Math.max(1,i-20);j<=i;j++){
    const a=history[j-1]?.price,b=history[j]?.price;
    if(a>0&&b>0) daily.push((b/a-1)*100);
  }
  return { m20:ret(20), m60:ret(60), m252:ret(252), vol:stdev(daily)*Math.sqrt(252) };
}
function featureScales(history, asOf) {
  const vals={m20:[],m60:[],m252:[],vol:[]};
  const start=Math.max(60,asOf-500);
  for(let i=start;i<asOf;i++){
    const f=features(history,i);
    if(!f) continue;
    Object.keys(vals).forEach(k=>vals[k].push(f[k]));
  }
  return Object.fromEntries(Object.entries(vals).map(([k,v])=>[k,Math.max(stdev(v),0.25)]));
}
function sample(history, asOf, horizon, model) {
  const current=features(history,asOf);
  if(!current) return [];
  const scales=model==='analogue-v2'?featureScales(history,asOf):{m20:1,m60:1,m252:1,vol:1};
  const candidates=[];
  for(let j=60;j+horizon<asOf;j++){
    const base=history[j]?.price,future=history[j+horizon]?.price;
    if(!(base>0&&future>0)) continue;
    const f=features(history,j);
    if(!f) continue;
    let distance;
    if(model==='analogue-v2'){
      distance=Math.sqrt(
        ((f.m20-current.m20)/scales.m20)**2+
        ((f.m60-current.m60)/scales.m60)**2+
        0.5*((f.m252-current.m252)/scales.m252)**2+
        0.8*((f.vol-current.vol)/scales.vol)**2
      );
    } else {
      distance=Math.abs(f.m20-current.m20)+0.7*Math.abs(f.vol-current.vol);
    }
    candidates.push({distance,ret:(future/base-1)*100});
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  return candidates.slice(0,25).map(x=>x.ret);
}
function runModelBacktest(history,horizon,model) {
  if(history.length<220+horizon) return null;
  const rows=[];
  const step=horizon>=120?15:20;
  for(let asOf=220;asOf<=history.length-horizon-1;asOf+=step){
    const s=sample(history,asOf,horizon,model);
    if(s.length<8) continue;
    const median=percentile(s,.5);
    const actual=(history[asOf+horizon].price/history[asOf].price-1)*100;
    rows.push({median,actual});
  }
  if(!rows.length) return null;
  const direction=rows.filter(r=>r.median!==0&&r.actual!==0&&Math.sign(r.median)===Math.sign(r.actual)).length/rows.filter(r=>r.median!==0&&r.actual!==0).length;
  const error=percentile(rows.map(r=>Math.abs(r.actual-r.median)),.5);
  return {direction,error,tests:rows.length};
}
async function modelHistory(ticker) {
  const data = await routedHistory(ticker, '5y');
  return data.points || [];
}
function chooseModel(v1,v2){
  if(!v1) return 'analogue-v2';
  if(!v2) return 'analogue-v1';
  const directionImproved=v2.direction>=v1.direction+0.02;
  const errorImproved=v2.error<=v1.error*0.95;
  return directionImproved && errorImproved ? 'analogue-v2' : 'analogue-v1';
}
async function evaluateForecastModels() {
  const TICKERS = ['NVDA','MSFT','MU','AVGO','AMD','TSM','META','NBIS'];
  const HORIZONS = [5,20,60,120,252];
  const results = [];
  for (const ticker of TICKERS) {
    const h = await modelHistory(ticker);
    for (const horizon of HORIZONS) {
      const v1 = runModelBacktest(h, horizon, 'analogue-v1');
      const v2 = runModelBacktest(h, horizon, 'analogue-v2');
      if (!v1 && !v2) continue;
      const active = chooseModel(v1, v2);
      const selected = active === 'analogue-v2' ? v2 : v1;
      await upsertModelConfig({
        ticker, horizon, active_model: active,
        score: selected ? selected.direction - selected.error / 1000 : 0,
        v1_direction: v1?.direction ?? null, v1_error: v1?.error ?? null,
        v2_direction: v2?.direction ?? null, v2_error: v2?.error ?? null,
        validation_tests: Math.max(v1?.tests || 0, v2?.tests || 0),
        updated_at: new Date().toISOString()
      });
      results.push({ ticker, horizon, active, v1, v2 });
    }
  }
  return results;
}

async function upsertModelConfig(row){
  const r=await fetch(SUPABASE_URL+'/rest/v1/forecast_model_config?on_conflict=ticker%2Chorizon',{
    method:'POST',
    headers:{...headers(),Prefer:'resolution=merge-duplicates,return=representation'},
    body:JSON.stringify(row)
  });
  const d=await r.json();
  if(!r.ok) throw new Error(d?.message||'Model config save failed');
  return d[0];
}

function sampleStatus(count) {
  if (count < 10) return 'insufficient';
  if (count < 25) return 'early';
  if (count < 50) return 'developing';
  if (count < 100) return 'initial-validation';
  return 'established';
}

function aggregateForecastSubset(subset) {
  if (!subset.length) return {
    count: 0, sampleStatus: sampleStatus(0), directionalAccuracyPct: null,
    medianAbsoluteError: null, meanSignedErrorPct: null,
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

function forecastAnalytics(rows) {
  const verified = rows.filter(row =>
    String(row.status) === 'verified' &&
    Number.isFinite(Number(row.actual_return)) &&
    Number.isFinite(Number(row.median))
  );
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

  return {
    sampleSize:verified.length,
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
    evidenceSnapshot: row.evidence_snapshot && typeof row.evidence_snapshot === 'object' ? row.evidence_snapshot : undefined,
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
  // revalidation from serving an older snapshot list after a new save.
  res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');

  const missing = missingConfig();
  if (missing.length) return send(res, 503, {
    error: 'Supabase forecast storage is not configured for this deployment.',
    missing
  });
  try {
    const cronSecret = String(process.env.CRON_SECRET || '').trim();
    const authorization = String(req.headers?.authorization || '');
    const isCronRequest = cronSecret && authorization === 'Bearer ' + cronSecret;
    if (isCronRequest) {
      if (req.method !== 'GET') return send(res, 405, { error: 'Cron verification requires GET.' });
      const verification = await verifyDueForecasts();
      let modelEvaluation = null;
      if (new Date().getUTCDay() === 0) modelEvaluation = await evaluateForecastModels();
      return send(res, 200, { ok: true, verification, modelEvaluation });
    }

    if (req.method === 'GET') {
      const ticker = String(req.query?.ticker || '').trim().toUpperCase();
      const horizon = Number(req.query?.horizon);
      if (ticker && Number.isFinite(horizon)) {
        const configResponse = await fetch(
          SUPABASE_URL +
            '/rest/v1/forecast_model_config?select=*&ticker=eq.' +
            encodeURIComponent(ticker) +
            '&horizon=eq.' +
            encodeURIComponent(String(horizon)) +
            '&limit=1',
          { headers: headers() }
        );
        const configData = await configResponse.json();
        if (!configResponse.ok) {
          return send(res, configResponse.status, {
            error: configData?.message || 'Failed to load forecast model configuration.'
          });
        }
        const config = Array.isArray(configData) ? configData[0] : null;
        return send(res, 200, {
          model: config?.active_model || 'analogue-v1',
          config
        });
      }

      const response = await fetch(SUPABASE_URL + '/rest/v1/forecast_snapshots?select=*&order=created_at.desc&limit=500', { headers: headers() });
      const data = await response.json();
      if (!response.ok) return send(res, response.status, { error: data?.message || 'Failed to load forecasts.' });
      const analytics = forecastAnalytics(data);
      return send(res, 200, { forecasts: data.map(normalize), analytics });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const required = ['id','ticker','createdAt','targetDate','horizon','scenarioId','entryPrice','median','p25','p75','p10','p90'];
      if (required.some(key => body[key] === undefined || body[key] === null || body[key] === '')) return send(res, 400, { error: 'Missing forecast fields.' });
      const existingResponse = await fetch(
        SUPABASE_URL + '/rest/v1/forecast_snapshots?select=*&id=eq.' + encodeURIComponent(body.id) + '&limit=1',
        { headers: headers() }
      );
      const existingData = await existingResponse.json();
      if (!existingResponse.ok) return send(res, existingResponse.status, { error: existingData?.message || 'Failed to check existing forecast.' });
      if (Array.isArray(existingData) && existingData[0]) {
        return send(res, 200, { forecast: normalize(existingData[0]), unchanged: true });
      }

      const row = {
        id: body.id, ticker: String(body.ticker).toUpperCase(), created_at: body.createdAt, target_date: body.targetDate,
        horizon: String(body.horizon), scenario_id: body.scenarioId, entry_price: Number(body.entryPrice), median: Number(body.median),
        p25: Number(body.p25), p75: Number(body.p75), p10: Number(body.p10), p90: Number(body.p90),
        model_version: String(body.modelVersion || 'analogue-v1'),
        evidence_snapshot: body.evidenceSnapshot && typeof body.evidenceSnapshot === 'object' ? body.evidenceSnapshot : {},
        status: 'pending'
      };
      const response = await fetch(SUPABASE_URL + '/rest/v1/forecast_snapshots', { method: 'POST', headers: { ...headers(), Prefer: 'return=representation' }, body: JSON.stringify(row) });
      const data = await response.json();
      if (!response.ok) return send(res, response.status, { error: data?.message || 'Failed to save forecast.' });
      return send(res, 201, { forecast: normalize(data[0]) });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      if (!body.id) return send(res, 400, { error: 'Forecast id is required.' });
      const patch = {};
      if (body.status) patch.status = body.status;
      if (body.verifiedAt) patch.verified_at = body.verifiedAt;
      if (body.actualDate) patch.actual_date = body.actualDate;
      if (body.actualPrice != null) patch.actual_price = Number(body.actualPrice);
      if (body.actualReturn != null) patch.actual_return = Number(body.actualReturn);
      if (body.medianError != null) patch.median_error = Number(body.medianError);
      const response = await fetch(SUPABASE_URL + '/rest/v1/forecast_snapshots?id=eq.' + encodeURIComponent(body.id), { method: 'PATCH', headers: headers(), body: JSON.stringify(patch) });
      const data = await response.json();
      if (!response.ok) return send(res, response.status, { error: data?.message || 'Failed to update forecast.' });
      return send(res, 200, { forecast: normalize(data[0]) });
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return send(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    return send(res, 500, { error: error?.message || 'Forecast storage request failed.' });
  }
}
