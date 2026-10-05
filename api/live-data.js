    politicalSignals(),
  ]);
  const currentNews = newsResult?.items || [];
  const contracts = contractsResult?.items || [];
  const congressTrades = congressResult?.items || [];
  const politicalSignalsResult = politicalResult?.items || [];
  const feedRetrievedAt = new Date().toISOString();
  evidenceAvailability.news = { status: currentNews.length ? 'AVAILABLE' : 'NOT_FOUND', count: currentNews.length, source: newsResult?.provider || 'GDELT', retrievedAt: feedRetrievedAt, refreshIntervalSeconds: 300, fallback: Boolean(newsResult?.fallback) };
  evidenceAvailability.contracts = { status: contracts.length ? 'AVAILABLE' : 'NOT_FOUND', count: contracts.length, source: contractsResult?.source || 'SEC EDGAR', retrievedAt: feedRetrievedAt, refreshIntervalSeconds: 300, stale: Boolean(contractsResult?.stale), upstreamError: contractsResult?.upstreamError || null };
  evidenceAvailability.political = { status: politicalSignalsResult.length ? 'AVAILABLE' : 'NOT_FOUND', count: politicalSignalsResult.length, source: 'GDELT + White House primary coverage', retrievedAt: feedRetrievedAt, refreshIntervalSeconds: 300, fallback: Boolean(politicalResult?.upstreamError), upstreamError: politicalResult?.upstreamError || null };
  evidenceAvailability.congress = { status: congressTrades.length ? 'AVAILABLE' : 'NOT_FOUND', count: congressTrades.length, source: congressResult?.source || 'Congress API', retrievedAt: feedRetrievedAt, refreshIntervalSeconds: 300, stale: Boolean(congressResult?.stale), upstreamError: congressResult?.upstreamError || null };
  evidenceAvailability.macro = { ...evidenceAvailability.macro, retrievedAt: feedRetrievedAt, refreshIntervalSeconds: 300 };
  const latestMarketQuote = Object.values(stockPrices).reduce((latest, item) => {
    if (!latest || String(item?.marketTime || item?.retrievedAt || item?.asOf || '') > String(latest.marketTime || latest.retrievedAt || latest.asOf || '')) return item;
    return latest;
  }, null);
  evidenceAvailability.market = {
    ...evidenceAvailability.market,
    retrievedAt: latestMarketQuote?.retrievedAt || latestMarketQuote?.asOf || null,
    marketTime: latestMarketQuote?.marketTime || latestMarketQuote?.asOf || null,
    asOf: latestMarketQuote?.asOf || latestMarketQuote?.marketTime || null,
    refreshIntervalSeconds: 60,
  };

  const data = {
    build: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
      environment: process.env.VERCEL_ENV || 'local'
    },
    stockPrices,
    news: currentNews,
    contracts,
    congressTrades,
    macroRisks,
    politicalSignals: politicalSignalsResult,
    evidenceAvailability,