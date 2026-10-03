export const FORECAST_VALIDATION_MINIMUM = 50;

export type ForecastSampleStatus =
  | 'insufficient'
  | 'early'
  | 'developing'
  | 'initial-validation'
  | 'established';

export function forecastSampleStatus(count: number): ForecastSampleStatus {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (n < 10) return 'insufficient';
  if (n < 25) return 'early';
  if (n < FORECAST_VALIDATION_MINIMUM) return 'developing';
  if (n < 100) return 'initial-validation';
  return 'established';
}

export function forecastValidationGate(count: number) {
  const verifiedCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return {
    minimumRequired: FORECAST_VALIDATION_MINIMUM,
    verifiedCount,
    ready: verifiedCount >= FORECAST_VALIDATION_MINIMUM,
    status: verifiedCount >= FORECAST_VALIDATION_MINIMUM
      ? '50+ validated forecasts'
      : 'building validation sample',
  };
}
