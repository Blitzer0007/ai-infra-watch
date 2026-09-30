import { history as routedHistory, providerSymbol } from './_market-data.js';

const ALLOWED_RANGES = new Set(['1y', '2y', '5y', 'max']);

function validateSymbol(symbol) {
  return typeof symbol === 'string' && /^[A-Za-z0-9.^=-]{1,20}$/.test(symbol);
}

export default async function handler(req, res) {
  const symbol = String(req.query?.symbol || '').trim().toUpperCase();
  const range = String(req.query?.range || '2y').trim();

  if (!validateSymbol(symbol)) return res.status(400).json({ error: 'Valid symbol is required' });
  if (!ALLOWED_RANGES.has(range)) return res.status(400).json({ error: 'Unsupported history range' });

  try {
    const data = await routedHistory(symbol, range);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
    return res.status(200).json({
      symbol,
      yahooSymbol: providerSymbol(symbol),
      ...data
    });
  } catch (error) {
    return res.status(503).json({
      error: error?.message || 'Market history providers unavailable',
      providerErrors: error?.providers || []
    });
  }
}
