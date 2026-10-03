import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => !file.endsWith('.env.example') && !file.endsWith('.lock'));

const rules = [
  { name: 'private key material', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{20,}/ },
  { name: 'OpenAI secret key', re: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9_]{20,}/ },
  { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'hard-coded bearer token', re: /Authorization\s*[:=]\s*["']Bearer\s+[A-Za-z0-9._-]{20,}["']/i },
];

const findings = [];
for (const file of files) {
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  for (const rule of rules) {
    if (rule.re.test(text)) findings.push(file + ': ' + rule.name);
  }
}

if (findings.length) {
  console.error('Potential committed secret material found:');
  findings.forEach((item) => console.error(' - ' + item));
  process.exit(1);
}
console.log('Security audit passed: no known secret signatures found in tracked source.');
