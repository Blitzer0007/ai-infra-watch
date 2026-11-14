import { isIP } from 'node:net';

const hosted = env => Boolean(env?.VERCEL || env?.VERCEL_ENV || env?.NODE_ENV === 'production');
const dnsName = host => host.length <= 253 && host.includes('.') && !host.endsWith('.')
  && host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));

/** Server configuration is the trust boundary. No request headers or redirect targets enter here. */
export function configuredBackendOrigin(value, env = {}) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (raw.length > 2048 || /[^\x21-\x7e]|[\\%@?#]/.test(raw) || !/^https?:\/\/[^/]+\/?$/i.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    const host = url.hostname;
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(host);
    if (loopback) return !hosted(env) && url.protocol === 'http:' ? url.origin : null;
    if (url.protocol !== 'https:' || url.port || isIP(host.replace(/^\[|\]$/g, '')) || !dnsName(host)
      || /\.(?:localhost|local|internal)$/i.test(host)) return null;
    return url.origin;
  } catch { return null; }
}

/** Current deployment only. Never fall back to a production alias from a preview or to Host. */
export function vercelDeploymentOrigin(env = process.env) {
  if (env?.VERCEL !== '1' || !['preview', 'production'].includes(env?.VERCEL_ENV) || typeof env?.VERCEL_URL !== 'string') return null;
  const host = env.VERCEL_URL;
  if (!dnsName(host) || !host.endsWith('.vercel.app')) return null;
  return configuredBackendOrigin('https://' + host, env);
}

export function agentBackendOrigin(env = process.env) {
  if (env?.AI_INFRA_AGENT_URL != null && env.AI_INFRA_AGENT_URL !== '') return configuredBackendOrigin(env.AI_INFRA_AGENT_URL, env);
  return vercelDeploymentOrigin(env);
}
