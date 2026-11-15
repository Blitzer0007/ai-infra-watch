// Offline fictional handler replay. Every transport is replaced before import.
const mode = process.argv[2] || 'valid';
if (!['valid','unknown-fee','partial','simulated','tiny','zero','loss'].includes(mode)) throw Error('Unknown fictional case');
const now = Date.parse('2026-11-13T18:00:00Z');
const NativeDate = Date;
globalThis.Date = class extends NativeDate {
  constructor(...values) { super(...(values.length ? values : [now])); }
  static now() { return now; }
};
process.env.SUPABASE_URL = 'https://fictional-decision-db.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fictional-only-key';
const testAccess = 'fictional-only-access';
process.env.AIW_ACCESS_TOKEN = testAccess;
delete process.env.FINNHUB_API_KEY;
delete process.env.ALPHA_VANTAGE_API_KEY;
const cost = mode === 'tiny' ? 1e-10 : 100;
const price = mode === 'tiny' ? 2e-10 : mode === 'zero' ? 100 : mode === 'loss' ? 80 : 150;
const symbols = mode === 'partial' ? ['FICT','DEMO'] : ['FICT'];
const holdings = symbols.map(symbol => ({id:'fictional-'+symbol,symbol,quantity:1,average_cost:mode === 'loss' ? 100 : 999,
  purchase_date:'2026-01-01',loss_limit_pct:mode === 'loss' ? 10 : null}));
const trades = symbols.map(symbol => ({id:'fictional-buy-'+symbol,symbol,transaction_type:'BUY',quantity:1,amount:cost,
  brokerage:mode === 'unknown-fee' ? null : 0,currency:'USD',trade_date:'2026-01-01',order_executed_at:null,
  quantity_derived:false,price_derived:false}));
const requests = [];
globalThis.fetch = async (input, options={}) => {
  const url = new URL(String(input));
  requests.push({origin:url.origin,method:options.method||'GET'});
  if (options.method && options.method !== 'GET') throw Error('Write forbidden in fictional replay');
  const reply = value => new Response(JSON.stringify(value),{status:200});
  if (url.origin === 'https://fictional-decision-db.invalid') {
    if (url.pathname.endsWith('/portfolio_holdings')) return reply(holdings);
    if (url.pathname.endsWith('/portfolio_transactions')) {
      for (const field of ['id','order_executed_at','price']) if (!url.searchParams.get('select').split(',').includes(field)) throw Error('Required original field was not requested');
      return reply(trades);
    }
    if (['/forecast_snapshots','/portfolio_signal_family_scorecard'].some(path=>url.pathname.endsWith(path))) return reply([]);
  }
  if (url.origin === 'https://query1.finance.yahoo.com' && url.pathname.startsWith('/v8/finance/chart/')) {
    const symbol = decodeURIComponent(url.pathname.split('/').at(-1));
    if (mode === 'partial' && symbol === 'DEMO' && url.searchParams.get('range') === '5d') return new Response('{}',{status:503});
    return reply({chart:{result:[{meta:{symbol,currency:'USD',regularMarketPrice:price,regularMarketTime:now/1000,
      simulated:mode === 'simulated',exchangeTimezoneName:'America/New_York',currentTradingPeriod:{regular:{start:now/1000-3600,end:now/1000+3600}}},
      timestamp:[Date.parse('2026-01-01T18:00:00Z')/1000],indicators:{quote:[{close:[999]}]}}]}});
  }
  throw Error('Unexpected offline destination');
};
const {default:handler} = await import('../../server/api/decision-center.js');
let status, body;
const response = {setHeader(){},status(value){status=value;return this;},json(value){body=value;return this;}};
await handler({method:'GET',headers:{authorization:'Bearer '+testAccess}},response);
if (status !== 200 || !requests.length || requests.some(row=>row.method!=='GET')) throw Error('Fictional handler replay failed');
process.stdout.write(JSON.stringify(body));
