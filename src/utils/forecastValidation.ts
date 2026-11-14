import { forecastCount } from './forecastInputs.js';
export const FORECAST_VALIDATION_MINIMUM = 50;

export type ForecastSampleStatus =
  | 'insufficient'
  | 'early'
  | 'developing'
  | 'initial-validation'
  | 'established';

export function forecastSampleStatus(count: number): ForecastSampleStatus {
  const n = forecastCount(count);
  if (n < 10) return 'insufficient';
  if (n < 25) return 'early';
  if (n < FORECAST_VALIDATION_MINIMUM) return 'developing';
  if (n < 100) return 'initial-validation';
  return 'established';
}

export function forecastValidationGate(count: number) {
  const verifiedCount = forecastCount(count);
  return {
    minimumRequired: FORECAST_VALIDATION_MINIMUM,
    verifiedCount,
    ready: verifiedCount >= FORECAST_VALIDATION_MINIMUM,
    status: verifiedCount >= FORECAST_VALIDATION_MINIMUM
      ? '50+ validated forecasts'
      : 'building validation sample',
  };
}
