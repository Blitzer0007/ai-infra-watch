import assert from 'node:assert/strict';
import test from 'node:test';
import handler, { agentBackendToken } from '../../api/agent-ask.js';

test('agent proxy token precedence matches the Python settings contract', () => {
  assert.equal(agentBackendToken({
    AI_INFRA_AGENT_TOKEN: 'infra-token',
    AIW_ACCESS_TOKEN: 'app-token',
    AGENT_API_TOKEN: 'legacy-token',
    CRON_SECRET: 'cron-token',
  }), 'infra-token');
  assert.equal(agentBackendToken({ AIW_ACCESS_TOKEN: 'app-token', AGENT_API_TOKEN: 'legacy-token' }), 'app-token');
  assert.equal(agentBackendToken({ AGENT_API_TOKEN: 'legacy-token' }), 'legacy-token');
  assert.equal(agentBackendToken({ CRON_SECRET: 'cron-token' }), 'cron-token');
  assert.equal(agentBackendToken({}), '');
});

test('authenticated agent proxy forwards the selected internal token to the Python route', async () => {
  const envKeys = ['AIW_ACCESS_TOKEN', 'AGENT_API_TOKEN', 'AI_INFRA_AGENT_TOKEN', 'CRON_SECRET', 'AI_INFRA_AGENT_URL'];
  const priorEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedInit;

  try {
    process.env.AIW_ACCESS_TOKEN = 'browser-token';
    process.env.AI_INFRA_AGENT_TOKEN = 'internal-agent-token';
    delete process.env.AGENT_API_TOKEN;
    delete process.env.CRON_SECRET;
    delete process.env.AI_INFRA_AGENT_URL;
    globalThis.fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return { status: 200, json: async () => ({ ok: true, mode: 'autonomous-mcp' }) };
    };

    const response = {
      statusCode: 0,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      setHeader() {},
    };
    await handler({
      method: 'POST',
      headers: {
        authorization: 'Bearer browser-token',
        host: 'aiw.test',
        'x-forwarded-proto': 'https',
        'x-forwarded-for': '198.51.100.42',
      },
      body: { question: 'fixture research' },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.mode, 'autonomous-mcp');
    assert.equal(capturedUrl, 'https://aiw.test/api/agent-python');
    assert.equal(capturedInit.headers.Authorization, 'Bearer internal-agent-token');
    assert.equal(JSON.parse(capturedInit.body).question, 'fixture research');
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of envKeys) {
      if (priorEnv[key] === undefined) delete process.env[key];
      else process.env[key] = priorEnv[key];
    }
  }
});
