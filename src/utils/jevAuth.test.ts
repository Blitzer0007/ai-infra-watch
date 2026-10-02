import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('JevDecisionPanel sends the private session token to /api/jev-assess', async () => {
  const source = await readFile(new URL('../components/JevDecisionPanel.tsx', import.meta.url), 'utf8');
  assert.match(source, /import\s*\{\s*authHeaders\s*\}\s*from ['"]\.\.\/utils\/apiAuth['"]/);
  assert.match(source, /headers:\s*authHeaders\(\{\s*['"]Content-Type['"]:\s*['"]application\/json['"]\s*\}\)/);
});
