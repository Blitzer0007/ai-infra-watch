import quoteHandler from '../server/api/quote.js';
import companyScaleHandler from '../server/api/company-scale.js';
import contractDetailHandler from '../server/api/contract-detail.js';
import earningsAlertsHandler from '../server/api/earnings-alerts.js';
import alertNotifyHandler from '../server/api/alert-notify.js';

const routes = { quote: quoteHandler, 'company-scale': companyScaleHandler, 'contract-detail': contractDetailHandler, 'earnings-alerts': earningsAlertsHandler, 'alert-notify': alertNotifyHandler };

export default async function handler(req, res) {
  const route = String(req.query?.route || '').trim().toLowerCase();
  const target = routes[route];
  if (!target) return res.status(404).json({ error: 'Unknown market API route.' });
  return target(req, res);
}
