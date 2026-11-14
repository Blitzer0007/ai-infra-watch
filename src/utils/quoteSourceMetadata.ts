/** Preserve declared source metadata without promoting a requested symbol to returned identity. */
export function providerObservationInstant(seconds:unknown):string|null {
  return typeof seconds==='number'&&Number.isFinite(seconds)&&seconds>0&&seconds<=8640000000000?new Date(seconds*1000).toISOString():null;
}
export function quoteSourceMetadata(value:Record<string,unknown>) {
  return {
    returnedSymbol:typeof value.returnedSymbol==='string'?value.returnedSymbol:null,
    sourceMode:value.sourceMode==='live'?'live' as const:value.sourceMode==='simulated'?'simulated' as const:'unknown' as const,
    adjustedBasis:['raw','split_adjusted','total_return'].includes(String(value.adjustedBasis))?value.adjustedBasis as 'raw'|'split_adjusted'|'total_return':undefined,
    marketDate:typeof value.marketDate==='string'?value.marketDate:null,
    marketTimePrecision:['instant','date-only','unknown'].includes(String(value.marketTimePrecision))?value.marketTimePrecision as 'instant'|'date-only'|'unknown':undefined,
    independentObservations:value.independentObservations,
  };
}
