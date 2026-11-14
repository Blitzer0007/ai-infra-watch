// Shared scalar/window validation only; no IO, clock, inference or eligibility grant.
export function forecastNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && (!value.trim() || value.length > 100 ||
    !/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(value.trim()))) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function forecastCount(value) {
  const n = forecastNumber(value);
  return n !== null && Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

export function forecastHorizon(value) {
  const n = forecastNumber(value);
  return n !== null && Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function forecastDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value;
}

export function forecastInstant(value) {
  if (typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !forecastDay(value.slice(0, 10))) return null;
  if (+value.slice(11, 13) > 23 || +value.slice(14, 16) > 59 || +value.slice(17, 19) > 59) return null;
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? instant : null;
}

// Exact ordering for archive/cutoff timestamps; never serialize this internal BigInt.
export function forecastInstantMicros(value) {
  const millis = forecastInstant(value);
  if (millis === null) return null;
  const fraction = value.match(/\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/)?.[1] || '';
  return BigInt(millis) * 1000n + BigInt(fraction.padEnd(6, '0').slice(3));
}

export function forecastCreationDay(value) {
  if (forecastDay(value)) return value; // Legacy date precision stays date-only.
  return forecastInstant(value) !== null ? value.slice(0, 10) : null;
}
