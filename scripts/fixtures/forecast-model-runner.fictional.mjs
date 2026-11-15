// Fixed fictional baseline replay. No precomputed predictions are passed to the runner.
import {fictionalWalkForwardInput} from './forecast-walk-forward.fictional.mjs';
import {FORECAST_RUNNER_PROTOCOL,FORECAST_REFERENCE_MODEL} from '../../server/utils/forecastModelRunner.js';
export function fictionalModelRunInput(assessedAt='2026-08-03T22:00:00Z') {
  const source=fictionalWalkForwardInput(assessedAt);
  return {...source,protocolVersion:FORECAST_RUNNER_PROTOCOL,config:{...source.config,modelId:FORECAST_REFERENCE_MODEL},
    windows:source.windows.map(({id,archive})=>({id,archive}))};
}
