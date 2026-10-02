import forecastHandler from '../server/api/forecast-verification.js';
import digestHandler from '../server/api/portfolio-digest.js';

const routes = { 'forecast-verification': forecastHandler, 'portfolio-digest': digestHandler };

export default async function handler(req, res) {
  const route = String(req.query?.route || '').trim().toLowerCase();
  const target = routes[route];
  if (!target) return res.status(404).json({ error: 'Unknown scheduled API route.' });
  return target(req, res);
}
