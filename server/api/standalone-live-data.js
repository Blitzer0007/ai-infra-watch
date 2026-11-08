/** The standalone server has no independently verified feed adapter configured. */
export default function standaloneLiveData(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(503).json({
    error: 'A deterministic data feed is not configured for the standalone server.',
    code: 'STANDALONE_FEED_UNAVAILABLE',
    sourceMode: 'unavailable',
    stockPrices: {}, contracts: [], congressTrades: [], macroRisks: [], news: [], politicalSignals: [],
    evidenceAvailability: { market: { status: 'UNAVAILABLE', source: null, marketTime: null, retrievedAt: null } },
  });
}
