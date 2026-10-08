export function forecastWindow(row) {
  const start = String(row?.created_at || '').slice(0, 10);
  const end = String(row?.target_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return null;
  return { start, end };
}

export function independentForecastRows(rows = []) {
  const sorted = [...rows]
    .filter(row => String(row?.status || 'verified') === 'verified')
    .map(row => ({ row, window: forecastWindow(row) }))
    .filter(item => item.window)
    .sort((a, b) =>
      String(a.row?.ticker || '').trim().toUpperCase().localeCompare(String(b.row?.ticker || '').trim().toUpperCase()) ||
      Number(a.row?.horizon) - Number(b.row?.horizon) ||
      a.window.start.localeCompare(b.window.start),
    );

  const selected = [];
  const lastEndByKey = new Map();

  for (const item of sorted) {
    const ticker = String(item.row?.ticker || '').trim().toUpperCase();
    const horizon = Number(item.row?.horizon);
    if (!ticker || !Number.isFinite(horizon)) continue;
    const key = ticker + '|' + horizon;
    const previousEnd = lastEndByKey.get(key);
    if (previousEnd && item.window.start < previousEnd) continue;
    selected.push(item.row);
    lastEndByKey.set(key, item.window.end);
  }

  return selected;
}

export function independentForecastCount(rows = []) {
  return independentForecastRows(rows).length;
}