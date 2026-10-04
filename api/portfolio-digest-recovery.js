import digestHandler from '../server/api/portfolio-digest.js';

export default async function handler(req, res) {
  req.query = { ...(req.query || {}), recovery: '1' };
  return digestHandler(req, res);
}
