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

export function coverageInterval(rows = [], lowerKey, upperKey) {
  const eligible = rows.filter(row =>
    Number.isFinite(Number(row?.actual_return)) &&
    Number.isFinite(Number(row?.[lowerKey])) &&
    Number.isFinite(Number(row?.[upperKey])),
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
  if (Number(count) < 50 || p25p75Coverage == null || p10p90Coverage == null) return 'insufficient';
  const middleNarrow = p25p75Coverage.upperPct < 50;
  const wideNarrow = p10p90Coverage.upperPct < 80;
  const middleWide = p25p75Coverage.lowerPct > 50;
  const wideWide = p10p90Coverage.lowerPct > 80;
  if (middleNarrow && wideNarrow) return 'too narrow';
  if (middleWide && wideWide) return 'too wide';
  if (middleNarrow || wideNarrow || middleWide || wideWide) return 'mixed';
  return 'well calibrated';
}