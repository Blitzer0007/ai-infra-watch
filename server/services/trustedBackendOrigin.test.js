import test from 'node:test';
import assert from 'node:assert/strict';
import { agentBackendOrigin, configuredBackendOrigin, vercelDeploymentOrigin } from './trustedBackendOrigin.js';

const native = { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_URL: 'fictional-preview-123.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'fictional-production.vercel.app' };
test('native origin is the current platform deployment, never the production alias', () => {
  assert.equal(vercelDeploymentOrigin(native), 'https://fictional-preview-123.vercel.app');
  assert.equal(agentBackendOrigin(native), 'https://fictional-preview-123.vercel.app');
  assert.equal(vercelDeploymentOrigin({ VERCEL: '1', VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'fictional-production.vercel.app' }), null);
});
test('explicit approved backend takes precedence and normalizes only an origin', () => {
  assert.equal(agentBackendOrigin({ ...native, AI_INFRA_AGENT_URL: ' https://research.example.invalid:443/ ' }), 'https://research.example.invalid');
  assert.equal(agentBackendOrigin({ ...native, AI_INFRA_AGENT_URL: 'invalid' }), null);
});
for (const url of [undefined, '', 'not-a-url', '//research.example.invalid', 'http://research.example.invalid',
  'https://user:pass@research.example.invalid', 'https://research.example.invalid/api', 'https://research.example.invalid/.',
  'https://research.example.invalid//', 'https://research.example.invalid?token=fictional', 'https://research.example.invalid?',
  'https://research.example.invalid#', 'https://research.example.invalid:8443', 'file:///etc/hosts',
  'https://research.example.invalid\\@other.invalid', 'https://research%2eexample.invalid',
  'https://research.example.invalid\n.evil.invalid', 'https://127.0.0.1', 'https://169.254.169.254', 'https://10.0.0.1',
  'https://[::1]', 'https://[::ffff:127.0.0.1]', 'https://internal', 'https://service.local', 'https://service.internal',
  'https://foo.localhost', 'https://research.example.invalid.', 'https://bad_label.example.invalid']) {
  test('reject unsupported configured origin: ' + String(url), () => assert.equal(configuredBackendOrigin(url), null));
}
for (const url of ['http://127.0.0.1:8001', 'http://localhost:8001/', 'http://[::1]:8001']) test('explicit loopback backend is development-only: ' + url, () => {
  assert.ok(configuredBackendOrigin(url, { NODE_ENV: 'test' }));
  for (const env of [{ NODE_ENV: 'production' }, { VERCEL: '1' }, { VERCEL_ENV: 'preview' }]) assert.equal(configuredBackendOrigin(url, env), null);
});
for (const host of ['https://fictional.vercel.app', 'fictional.vercel.app/evil', 'fictional.vercel.app.evil.invalid',
  'fictional.vercel.app:443', 'fictional.vercel.app?', 'fictional.vercel.app#', 'other.invalid', '127.0.0.1', 'user@fictional.vercel.app']) {
  test('malformed native deployment metadata is withheld: ' + host, () => assert.equal(vercelDeploymentOrigin({ ...native, VERCEL_URL: host }), null));
}
test('unconfigured/non-hosted runtimes cannot infer a destination', () => {
  assert.equal(agentBackendOrigin({}), null);
  assert.equal(agentBackendOrigin({ VERCEL_URL: 'fictional.vercel.app' }), null);
});
