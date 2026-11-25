export function validMarketDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const ms=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value;
}
export const positiveMarketNumber=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
export function marketDateFromSeconds(value) {
  if(!positiveMarketNumber(value))return null;
  const date=new Date(value*1000);
  return Number.isFinite(date.getTime())?date.toISOString().slice(0,10):null;
}
export function completeHistoryQuality(data) {
  const q=data?.historyQuality;
  return q===undefined||q?.contractVersion==='market-history-quality-v1'&&Number.isSafeInteger(q.inputPointCount)&&
    q.inputPointCount===data?.points?.length&&['discardedPointCount','duplicatePointCount','invalidAdjustedPointCount'].every(key=>q[key]===0);
}

/** Adapter observations only; does not certify complete sessions or source identity. */
export function normalizeMarketHistory(data,nowMs=Date.now()) {
  if(!Number.isFinite(nowMs)||!Array.isArray(data?.points)||data.points.length>20000)throw Error('No usable market history points');
  const today=new Date(nowMs).toISOString().slice(0,10),seen=new Map();
  const quality={contractVersion:'market-history-quality-v1',inputPointCount:data.points.length,discardedPointCount:0,duplicatePointCount:0,invalidAdjustedPointCount:0};
  for(const point of data.points){
    if(!point||!validMarketDate(point.date)||point.date>today||!positiveMarketNumber(point.price)){
      quality.discardedPointCount++;continue;
    }
    const adjusted=point.adjusted===true&&positiveMarketNumber(point.adjustedPrice);
    if(point.adjusted===true&&!adjusted)quality.invalidAdjustedPointCount++;
    const value={date:point.date,price:point.price,adjustedPrice:adjusted?point.adjustedPrice:null,adjusted};
    const prior=seen.get(value.date);
    if(prior){
      if(prior.price!==value.price||prior.adjusted!==value.adjusted||prior.adjustedPrice!==value.adjustedPrice)
        throw Error('Conflicting market history points');
      quality.duplicatePointCount++;continue;
    }
    seen.set(value.date,value);
  }
  if(!seen.size)throw Error('No usable market history points');
  return {...data,points:[...seen.values()].sort((a,b)=>a.date.localeCompare(b.date)),historyQuality:quality};
}
