import { quote as routedQuote, providerSymbol } from '../../api/_market-data.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });
  const symbol = String(req.query?.symbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)) return res.status(400).json({ error: 'Valid symbol is required' });
  const forceRefresh = String(req.query?.refresh || '').toLowerCase() === 'true' || req.query?.refresh === '1';
  try {
    const data = await routedQuote(symbol, { forceRefresh });
    return res.status(200).json({ ...data, symbol, yahooSymbol: providerSymbol(symbol) });
  } catch (error) {
    return res.status(503).json({ error: 'Market quote providers unavailable', providerErrors: error?.providers || [] });
  }
}
