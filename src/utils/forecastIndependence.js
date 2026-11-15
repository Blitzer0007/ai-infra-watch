import { forecastCreationDay, forecastDay, forecastHorizon } from './forecastInputs.js';
export function forecastWindow(row) {
  const start = forecastCreationDay(row?.created_at);
  const end = row?.target_date;
  if (!start || !forecastDay(end) || end <= start) return null;
  return { start, end };
}

export function independentForecastRows(rows = []) {
  const sorted = [...rows]
    .filter(row => row?.status === 'verified')
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
    const ticker = typeof item.row?.ticker === 'string' ? item.row.ticker.trim().toUpperCase() : '';
    const horizon = forecastHorizon(item.row?.horizon);
    if (!/^[A-Z0-9.^=-]{1,20}$/.test(ticker) || horizon === null) continue;
    const key = ticker + '|' + horizon;
    const previousEnd = lastEndByKey.get(key);
    if (previousEnd && item.window.start < previousEnd) continue;
    selected.push(item.row);
    lastEndByKey.set(key, item.window.end);
  }

  // Preserve the existing per-stream greedy thinning cohort, then order by
  // market-window end. Processing/backfill time is not outcome chronology.
  return selected.sort((a,b)=>a.target_date.localeCompare(b.target_date)||
    String(a.created_at).localeCompare(String(b.created_at))||
    String(a.ticker).localeCompare(String(b.ticker))||Number(a.horizon)-Number(b.horizon));
}

export function independentForecastCount(rows = []) {
  return independentForecastRows(rows).length;
}
