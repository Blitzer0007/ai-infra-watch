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

const deploymentWorkflowPath = '.github/workflows/vercel-production-deploy.yml';
if (files.includes(deploymentWorkflowPath)) {
  const workflow = readFileSync(deploymentWorkflowPath, 'utf8');
  const expectedTokenLine = "VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}";
  const stepScopedTokenCount = workflow
    .split(/\r?\n/)
    .filter((line) => line.startsWith('          VERCEL_TOKEN:') && line.trim() === expectedTokenLine)
    .length;

  if (/^ {6}VERCEL_TOKEN:/m.test(workflow)) {
    findings.push(deploymentWorkflowPath + ': VERCEL_TOKEN must not be exposed at job scope');
  }
  if (/^\s*run:\s*vercel\s+(?:whoami|pull|build|deploy)\b[^\n]*(?:--token\b|--debug\b)/m.test(workflow)) {
    findings.push(deploymentWorkflowPath + ': avoid Vercel token CLI flags and verbose debug output');
  }
  if (stepScopedTokenCount < 5) {
    findings.push(deploymentWorkflowPath + ': expected step-scoped VERCEL_TOKEN for auth/deploy CLI steps');
  }
  if (/cat\s+\/tmp\/production-(?:auth|portfolio)\.json/.test(workflow)) {
    findings.push(deploymentWorkflowPath + ': do not print raw access-control response bodies into CI logs');
  }
}

const reentryWorkflowPath = '.github/workflows/reentry-alerts.yml';
if (files.includes(reentryWorkflowPath)) {
  const workflow = readFileSync(reentryWorkflowPath, 'utf8');
  if (!workflow.includes("if: ${{ vars.REENTRY_ALERTS_ENABLED == 'true' }}")) {
    findings.push(reentryWorkflowPath + ': live scanning must remain behind REENTRY_ALERTS_ENABLED=true');
  }
  if (!workflow.includes('cron: "*/15 13-20 * * 1-5"')) {
    findings.push(reentryWorkflowPath + ': expected the bounded weekday polling schedule');
  }
  if (/^\s*workflow_dispatch:\s*$/m.test(workflow)) {
    findings.push(reentryWorkflowPath + ': manual re-entry scans are not permitted by the release gate');
  }
  if (/\bcat\s+response\.json\b/.test(workflow)) {
    findings.push(reentryWorkflowPath + ': do not print private scan response bodies into CI logs');
  }
  if (!/timeZone:\s*["']America\/New_York["']/.test(workflow) ||
      (workflow.match(/if: steps\.session\.outputs\.open == 'true'/g) || []).length < 2) {
    findings.push(reentryWorkflowPath + ': OIDC and scanning must both require the New York regular-session preflight');
  }
}

if (findings.length) {
  console.error('Potential security issues found:');
  findings.forEach((item) => console.error(' - ' + item));
  process.exit(1);
}
console.log('Security audit passed: no known secret signatures or deploy-workflow diagnostic violations found.');
