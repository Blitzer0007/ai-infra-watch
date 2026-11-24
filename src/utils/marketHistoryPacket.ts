export type MarketHistoryPoint={date:string;price:number};
export type MarketHistoryPacket={symbol:string;points:MarketHistoryPoint[];provider:string|null;currency:string|null;stale:boolean|null;cached:boolean|null;cacheAgeMs:number|null;loadedAt:string;excludedPoints:number};

/** Display-only closing prices. Does not certify adjusted returns or accounting. */
export function marketHistoryPacket(symbol:string,value:any,loadedAt:string):MarketHistoryPacket {
  if(!Number.isFinite(Date.parse(loadedAt))||!value||!Array.isArray(value.points)||value.points.length>20000||
    (value.symbol!==undefined&&value.symbol!==symbol))throw Error('Historical price response is incompatible with this holding.');
  const points=new Map<string,number>();let excludedPoints=0;
  for(const row of value.points){
    if(!row||typeof row.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(Date.parse(row.date+'T00:00:00Z'))||
      new Date(row.date+'T00:00:00Z').toISOString().slice(0,10)!==row.date||row.date>loadedAt.slice(0,10)||typeof row.price!=='number'||!Number.isFinite(row.price)||row.price<=0){excludedPoints++;continue;}
    if(points.has(row.date)&&points.get(row.date)!==row.price)throw Error('Historical price response contains conflicting dates.');
    if(points.has(row.date))excludedPoints++;
    points.set(row.date,row.price);
  }
  if(!points.size)throw Error('No usable closing prices were returned for this holding.');
  return {symbol,points:[...points].sort(([a],[b])=>a.localeCompare(b)).map(([date,price])=>({date,price})),
    provider:typeof value.provider==='string'&&/^[a-z][a-z0-9-]{0,39}$/.test(value.provider)?value.provider:null,
    currency:typeof value.currency==='string'&&/^[A-Z]{3}$/.test(value.currency)?value.currency:null,
    stale:typeof value.stale==='boolean'?value.stale:null,cached:typeof value.cached==='boolean'?value.cached:null,
    cacheAgeMs:typeof value.cacheAgeMs==='number'&&Number.isFinite(value.cacheAgeMs)&&value.cacheAgeMs>=0?value.cacheAgeMs:null,
    loadedAt,excludedPoints};
}
