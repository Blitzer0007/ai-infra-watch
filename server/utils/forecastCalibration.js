export function wilsonInterval(hits, total, z = 1.96) {
  const n = Number(total);
  const k = Number(hits);
  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(k) || k < 0 || k > n) return null;
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

function isPresentFiniteNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

export function coverageInterval(rows = [], lowerKey, upperKey) {
  const eligible = rows.filter(row =>
    isPresentFiniteNumber(row?.actual_return) &&
    isPresentFiniteNumber(row?.[lowerKey]) &&
    isPresentFiniteNumber(row?.[upperKey]),
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
  const validCoverage = interval =>
    Number(interval?.count) >= 50 &&
    Number.isFinite(Number(interval?.lowerPct)) &&
    Number.isFinite(Number(interval?.upperPct));
  if (
    Number(count) < 50 ||
    !validCoverage(p25p75Coverage) ||
    !validCoverage(p10p90Coverage)
  ) return 'insufficient';
  const middleNarrow = p25p75Coverage.upperPct < 50;
  const wideNarrow = p10p90Coverage.upperPct < 80;
  const middleWide = p25p75Coverage.lowerPct > 50;
  const wideWide = p10p90Coverage.lowerPct > 80;
  if (middleNarrow && wideNarrow) return 'too narrow';
  if (middleWide && wideWide) return 'too wide';
  return 'well calibrated';
}