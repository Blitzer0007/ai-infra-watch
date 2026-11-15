// Fixed fictional files and reviewed pin only. No external paths, credentials or providers.
import { readFileSync } from 'node:fs';
import { evaluateArchivedForecastWindow } from '../server/utils/forecastArchiveAdapter.js';

if (process.argv.length !== 2) {
  process.stderr.write('This fictional archive demo accepts no arguments or external input.\n');
  process.exit(2);
}
// Kept outside the archive manifest: changing a bundled digest cannot repin this reader.
const MANIFEST_SHA256 = '1aca0089d6cf5c4f06deaee108e649e52ff7d96b06091d8105b14f18ae8f440e';
const manifestBytes = readFileSync(new URL('./fixtures/forecast-archive/manifest.json', import.meta.url));
const artifacts = new Map([
  ['calendar', readFileSync(new URL('./fixtures/forecast-archive/calendar.json', import.meta.url))],
  ['features', readFileSync(new URL('./fixtures/forecast-archive/features.json', import.meta.url))],
  ['outcomes', readFileSync(new URL('./fixtures/forecast-archive/outcomes.json', import.meta.url))],
]);
const request = { protocolVersion: 'session-close-v1-experimental', symbol: 'FICT', venue: 'XNYS', currency: 'USD',
  horizonSessions: 5, decisionAt: '2026-07-02T20:10:00Z', assessedAt: '2026-07-13T20:05:00Z' };
const run = (selectedRequest, selectedArtifacts, pin = MANIFEST_SHA256) => evaluateArchivedForecastWindow({
  request: selectedRequest, artifacts: selectedArtifacts, manifestBytes, expectedManifestSha256: pin,
});
const pendingArtifacts = new Map(artifacts); pendingArtifacts.delete('outcomes');
const changedArtifacts = new Map(artifacts); changedArtifacts.set('outcomes', Buffer.from('tampered fixture bytes'));
const cases = {
  completeRetainedWindow: run(request, artifacts),
  notMaturedWithoutOutcomeBytes: run({ ...request, assessedAt: '2026-07-13T19:00:00Z' }, pendingArtifacts),
  tamperedArtifact: run(request, changedArtifacts),
  unreviewedManifest: run(request, artifacts, '0'.repeat(64)),
};
process.stdout.write(JSON.stringify({ fictional: true, mode: 'offline-only',
  notice: 'Pinned fixture integrity and content binding only. Publisher authenticity and predictive validity remain unverified.', cases }, null, 2) + '\n');
if (cases.completeRetainedWindow.status !== 'conditional-outcome' || cases.notMaturedWithoutOutcomeBytes.status !== 'pending' ||
  cases.tamperedArtifact.code !== 'ARTIFACT_PIN_MISMATCH' || cases.unreviewedManifest.code !== 'MANIFEST_PIN_MISMATCH') process.exitCode = 1;
