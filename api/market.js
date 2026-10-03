import quoteHandler from '../server/api/quote.js';
import companyScaleHandler from '../server/api/company-scale.js';
import contractDetailHandler from '../server/api/contract-detail.js';
import earningsAlertsHandler from '../server/api/earnings-alerts.js';
import alertNotifyHandler from '../server/api/alert-notify.js';
import alertConfigHandler from '../server/api/alert-config.js';
import serverAlertsHandler from '../server/api/server-alerts.js';
import forecastValidationHandler from '../server/api/forecast-validation.js';

const routes = {
  quote: quoteHandler,
  'company-scale': companyScaleHandler,
  'contract-detail': contractDetailHandler,
  'earnings-alerts': earningsAlertsHandler,
  'alert-notify': alertNotifyHandler,
  'alert-config': alertConfigHandler,
  'server-alerts': serverAlertsHandler,
  'forecast-validation': forecastValidationHandler,
};

export default async function handler(req, res) {
  const route = String(req.query?.route || '').trim().toLowerCase();
  const target = routes[route];
  if (!target) return res.status(404).json({ error: 'Unknown market API route.' });
  return target(req, res);
}
