/** Per-view request bound only; not an account-wide provider quota. */
export async function loadPortfolioHistoryBatch<T>(symbols: readonly string[], load: (symbol: string) => Promise<T>, cancelled: () => boolean) {
  const histories: Record<string, T> = {};
  const failures: string[] = [];
  let next = 0;
  async function worker() {
    while (!cancelled() && next < symbols.length) {
      const symbol = symbols[next++];
      try { histories[symbol] = await load(symbol); }
      catch { failures.push(symbol); }
    }
  }
  await Promise.all(Array.from({length: Math.min(3, symbols.length)}, worker));
  return {histories, failures};
}
