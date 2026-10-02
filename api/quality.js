import aiQualityHandler from '../server/api/ai-quality.js';
import signalScorecardHandler from '../server/api/signal-scorecard.js';

const routes = { 'ai-quality': aiQualityHandler, 'signal-scorecard': signalScorecardHandler };

export default async function handler(req, res) {
  const route = String(req.query?.route || '').trim().toLowerCase();
  const target = routes[route];
  if (!target) return res.status(404).json({ error: 'Unknown quality API route.' });
  return target(req, res);
}
