export function hasFreshMarketHistory(result) {
  return result?.stale !== true &&
    Array.isArray(result?.points) &&
    result.points.some(point =>
      point?.date &&
      Number.isFinite(Number(point.price)) &&
      Number(point.price) > 0
    );
}
