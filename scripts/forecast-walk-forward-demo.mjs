// No external input or live model; generated fictional bytes are not vendor evidence.
import { fictionalWalkForwardInput } from './fixtures/forecast-walk-forward.fictional.mjs';
import { evaluateWalkForwardForecasts } from '../server/utils/forecastWalkForward.js';
if (process.argv.length !== 2) {
  process.stderr.write('This fictional evaluation demo accepts no arguments or external input.\n');
  process.exit(2);
}
const result = evaluateWalkForwardForecasts(fictionalWalkForwardInput());
process.stdout.write(JSON.stringify({ fictional: true, mode: 'offline-only',
  notice: 'Precomputed fictional forecasts and constructed archives. No model fitting, publisher verification, prediction provenance or predictive validity.', result }, null, 2) + '\n');
if (result.status !== 'descriptive-results' || result.coverage?.scored !== 4 || result.coverage?.pending !== 1) process.exitCode = 1;
