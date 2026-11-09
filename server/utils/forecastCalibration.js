import { forecastNumber, forecastCount } from '../../src/utils/forecastInputs.js';
export function wilsonInterval(hits, total, z = 1.96) {
  const n = forecastNumber(total);
  const k = forecastNumber(hits);
  if (!Number.isSafeInteger(n) || n <= 0 || !Number.isSafeInteger(k) || k < 0 || k > n || !Number.isFinite(z) || z <= 0) return null;
  const p = k / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n) / denominator;
  return {
    lowerPct: Math.max(0, (centre - margin) * 100),
    upperPct: Math.min(100, (centre + margin) * 100),
  };
}

function isPresentFiniteNumber(value) { return forecastNumber(value) !== null; }

function orderedKnownQuantiles(row) {
  const known=['p10','p25','p75','p90'].map(key=>forecastNumber(row?.[key])).filter(value=>value!==null);
  return known.every((value,index)=>index===0||known[index-1]<=value);
}

export function coverageInterval(rows = [], lowerKey, upperKey) {
  const eligible = rows.filter(row =>
    orderedKnownQuantiles(row) && isPresentFiniteNumber(row?.actual_return) &&
    isPresentFiniteNumber(row?.[lowerKey]) &&
    isPresentFiniteNumber(row?.[upperKey]) && Number(row[lowerKey]) <= Number(row[upperKey]),
  );
  const hits = eligible.filter(row =>
    Number(row.actual_return) >= Number(row[lowerKey]) &&
    Number(row.actual_return) <= Number(row[upperKey]),
  ).length;
  const interval = wilsonInterval(hits, eligible.length);
  return {
    count: eligible.length,
    hits,
    coveragePct: eligible.length ? Number((hits / eligible.length * 100).toFixed(1)) : null,
    lowerPct: interval ? Number(interval.lowerPct.toFixed(1)) : null,
    upperPct: interval ? Number(interval.upperPct.toFixed(1)) : null,
  };
}

export function calibrationVerdict(p25p75Coverage, p10p90Coverage, count) {
  const validCoverage = interval => {
    const n=forecastCount(interval?.count), lower=forecastNumber(interval?.lowerPct), upper=forecastNumber(interval?.upperPct);
    return n>=50&&n<=forecastCount(count)&&lower!==null&&upper!==null&&lower>=0&&upper<=100&&lower<=upper;
  };
  if (forecastCount(count)<50||!validCoverage(p25p75Coverage)||!validCoverage(p10p90Coverage)) return 'insufficient';
  const narrow=p25p75Coverage.upperPct<50||p10p90Coverage.upperPct<80;
  const wide=p25p75Coverage.lowerPct>50||p10p90Coverage.lowerPct>80;
  if(narrow&&wide)return 'mixed coverage';
  if(narrow)return 'too narrow';
  if(wide)return 'too wide';
  return 'consistent with target coverage';
}
