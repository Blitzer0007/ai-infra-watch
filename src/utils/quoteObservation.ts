/** Quote display inputs must be observed numbers. Never impute a flat move or range. */
export function parseQuoteObservation(input: unknown, requestedSymbol: string) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (value.symbol != null && (typeof value.symbol !== 'string' || value.symbol.trim().toUpperCase() !== requestedSymbol.trim().toUpperCase())) return null;
  const positive = (item: unknown): item is number => typeof item === 'number' && Number.isFinite(item) && item > 0;
  if (!positive(value.price) || typeof value.changePct !== 'number' || !Number.isFinite(value.changePct)) return null;
  let low = positive(value.low) ? value.low : null;
  let high = positive(value.high) ? value.high : null;
  if (low != null && high != null && low > high) { low = null; high = null; }
  return { price: value.price, changePct: value.changePct, low, high, prevClose: positive(value.prevClose) ? value.prevClose : null };
}
