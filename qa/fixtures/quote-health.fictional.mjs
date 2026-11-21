// Pure source-to-health projection. No production state or external transport.
globalThis.fetch = () => { throw Error('Network forbidden in fictional quote health'); };
const { summarizeMarketDataHealth } = await import('../../server/api/market-data-health.js');
const now = Date.parse('2026-11-20T18:00:00Z');
const quote = {
  price:123.45,currency:'USD',adjustedBasis:'raw',provider:'declared-source',sourceMode:'live',
  marketTimePrecision:'instant',marketTime:'2026-11-20T17:59:00Z',retrievedAt:'2026-11-20T18:00:00Z',
  isMarketSessionOpen:true,providerStatus:'PRIMARY',
};
const history = {provider:'declared-source',points:[
  {date:'2026-11-18',price:120,adjustedPrice:120,adjusted:true},
  {date:'2026-11-19',price:121,adjustedPrice:121,adjusted:true},
]};
const rows = [
  summarizeMarketDataHealth('FICT',{...quote,returnedSymbol:'FICT'},history,now),
  summarizeMarketDataHealth('BADT',{...quote,returnedSymbol:'BADT',currency:'CAD'},history,now),
  summarizeMarketDataHealth('OLDCL',{...quote,returnedSymbol:'OLDCL',marketTime:'2026-11-19T21:00:00Z',
    isMarketSessionOpen:false,status:'last_close'},history,now),
];
rows.push({symbol:'LEGACY',quote:{available:true,provider:'declared-source',ageSeconds:60},history:rows[0].history});
process.stdout.write(JSON.stringify({ok:true,rows}));
