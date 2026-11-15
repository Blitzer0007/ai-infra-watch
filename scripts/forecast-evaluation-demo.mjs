// Fixed fictional fixture only. No user file, credential, provider or writer capability.
import { readFileSync } from 'node:fs';
import { evaluateForecastWindow, FORECAST_EVALUATION_PROTOCOL } from '../server/utils/forecastEvaluationPreflight.js';

if (process.argv.length !== 2) {
  process.stderr.write('This offline demo accepts no arguments or external input.\n');
  process.exit(2);
}
const packet = JSON.parse(readFileSync(new URL('./fixtures/forecast-evaluation-window.fictional.json', import.meta.url), 'utf8'));
const pending = structuredClone(packet);
pending.assessedAt = '2026-07-13T19:00:00Z';
delete pending.outcomeHistory;
const missing = structuredClone(packet);
missing.outcomeHistory.points.pop();
const futureFeatures = structuredClone(packet);
futureFeatures.featureHistory.snapshotAvailableAt = packet.outcomeHistory.snapshotAvailableAt;

process.stdout.write(JSON.stringify({
  fictional: true, mode: 'offline-only', protocolVersion: FORECAST_EVALUATION_PROTOCOL,
  notice: 'Declared fixture checks only. No source verification, model accuracy, production eligibility or deployment.',
  cases: {
    completeDeclaredWindow: evaluateForecastWindow(packet),
    notMatured: evaluateForecastWindow(pending),
    missingTarget: evaluateForecastWindow(missing),
    futureFeatureVintage: evaluateForecastWindow(futureFeatures),
  },
}, null, 2) + '\n');
