import test from 'node:test';
import assert from 'node:assert/strict';
import { authHeaders, clearAccessToken, setAccessToken } from './apiAuth';

const store = new Map<string, string>();

Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  },
});

test('authHeaders adds the bearer token stored for the private app session', () => {
  clearAccessToken();
  assert.deepEqual(authHeaders({ 'Content-Type': 'application/json' }), {
    'Content-Type': 'application/json',
  });

  setAccessToken('test-token');
  assert.equal(authHeaders().Authorization, 'Bearer test-token');
  assert.equal(authHeaders({ 'Content-Type': 'application/json' }).Authorization, 'Bearer test-token');

  clearAccessToken();
  assert.equal(authHeaders().Authorization, undefined);
});
