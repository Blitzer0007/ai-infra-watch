"""Main-based release UI consumes fictional API projections; no providers or writes."""
import datetime
import json
import os
import subprocess
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import pytest
from playwright.sync_api import expect
from test_ui import goto_app,mock_local_apis
ROOT=Path(__file__).resolve().parents[1]


def test_performance_history_requests_are_scoped_and_market_data_is_separate_from_account_reconciliation(page):
 mock_local_apis(page)
 requested=[];writes=[]
 page.on('request',lambda r:writes.append(r.url) if r.method not in ('GET','HEAD','OPTIONS') else None)
 def history(route):
  query=parse_qs(urlparse(route.request.url).query)
  if query.get('action')!=['history']:return route.fallback()
  requested.append(query.get('symbol',[''])[0])
  route.fulfill(status=200,json={'symbol':requested[-1],'provider':'yahoo','points':[
   {'date':'2026-11-18','price':100},{'date':'2026-11-19','price':101}]})
 page.route('**/api/company-scale?*',history)
 page.goto('/portfolio?portfolio_tab=performance')
 panel=page.get_by_test_id('portfolio-chart-readiness')
 expect(panel).to_contain_text('4 symbol histories returned')
 expect(panel).to_contain_text('full broker history and corporate actions are unverified')
 expect(panel).to_contain_text('does not mean market-price history is unavailable')
 assert set(requested)=={'NVDA','SPY','QQQ','SOXX'}
 assert 'AMD' not in requested and 'NBIS' not in requested
 page.wait_for_load_state('networkidle')
 before=list(requested)
 panel.get_by_role('button',name='Review individual holding charts',exact=True).click()
 expect(page.get_by_role('button',name='Open NVDA holding details from table',exact=True)).to_be_visible()
 assert requested==before and writes==[]

@pytest.mark.parametrize('mode',['available','stale','unknown','invalid','error'])
def test_performance_renders_price_history_without_certifying_account_returns(page,mode):
 page.clock.set_fixed_time(datetime.datetime(2026,11,24,12,tzinfo=datetime.timezone.utc))
 mock_local_apis(page)
 calls=[];writes=[];errors=[]
 page.on('request',lambda r:writes.append(r.url) if r.method not in ('GET','HEAD','OPTIONS') else None)
 page.on('pageerror',lambda e:errors.append(str(e)))
 def history(route):
  query=parse_qs(urlparse(route.request.url).query)
  if query.get('action')!=['history']:return route.fallback()
  symbol=query['symbol'][0];calls.append((symbol,query['range'][0]))
  if mode=='error':return route.fulfill(status=503,json={'error':'private-provider-body'})
  points=[{'date':'2026-11-20','price':100},{'date':'2026-11-23','price':102}]
  if mode=='invalid':points=[{'date':'2026-02-30','price':100},{'date':'2026-11-23','price':None}]
  data={'symbol':symbol,'points':points}
  if mode!='unknown':data.update({'provider':'yahoo','currency':'USD','stale':mode=='stale','cached':mode=='stale','cacheAgeMs':600000 if mode=='stale' else 0})
  route.fulfill(status=200,json=data)
 page.route('**/api/company-scale?*',history)
 page.goto('/portfolio?portfolio_tab=performance')
 panel=page.get_by_test_id('performance-market-history')
 expect(panel).to_be_visible()
 chart=panel.get_by_test_id('holding-price-chart')
 if mode in ('available','stale','unknown'):
  expect(chart.locator('.recharts-line-curve')).to_have_count(1)
  expect(chart).to_contain_text('2026-11-20 → 2026-11-23')
  expect(chart).to_contain_text('Currency: '+('not reported' if mode=='unknown' else 'USD'))
  expect(chart).to_contain_text('adjusted returns and complete source coverage are unverified')
  if mode=='stale':expect(chart).to_contain_text('provider returned stale cached history')
  if mode=='unknown':expect(chart).to_contain_text('Provider freshness was not reported')
  chart.get_by_role('button',name='1M',exact=True).click()
  expect(chart.locator('.recharts-line-curve')).to_have_count(1)
 else:
  expect(chart).to_contain_text('No usable holding price history returned')
  expect(chart.locator('.recharts-line-curve')).to_have_count(0)
  expect(chart).not_to_contain_text('private-provider-body')
 expect(page.get_by_test_id('portfolio-chart-readiness')).to_contain_text('full broker history and corporate actions are unverified')
 expect(page.get_by_text('Account return history withheld: broker history and corporate actions are unverified.',exact=True)).to_be_visible()
 page.wait_for_load_state('networkidle')
 assert calls.count(('NVDA','1y'))==1, 'Chart must reuse the bounded batch; switching display ranges does not repeat provider calls'
 page.set_viewport_size({'width':360,'height':900})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 if mode=='available':
  folder=Path(os.getenv('QA_ARTIFACT_DIR','/tmp/aiw-market-history'));folder.mkdir(parents=True,exist_ok=True)
  panel.screenshot(path=str(folder/'performance-price-history-fictional-mobile.png'))
 assert writes==[] and errors==[]

def test_performance_company_selection_reuses_packets_without_relabeling_old_history(page):
 page.clock.set_fixed_time(datetime.datetime(2026,11,24,12,tzinfo=datetime.timezone.utc))
 mock_local_apis(page)
 holdings=[{'id':symbol,'symbol':symbol,'quantity':1,'averageCost':100,'purchaseDate':'2026-01-02'} for symbol in ['NVDA','AMD']]
 page.route('**/api/portfolio?includeLots=true',lambda route:route.fulfill(json={'holdings':holdings}))
 calls=[]
 def history(route):
  query=parse_qs(urlparse(route.request.url).query)
  if query.get('action')!=['history']:return route.fallback()
  symbol=query['symbol'][0];calls.append(symbol)
  route.fulfill(json={'symbol':symbol,'provider':'alpha-vantage' if symbol=='AMD' else 'yahoo','currency':'USD','stale':False,'points':[
   {'date':'2026-11-20','price':101 if symbol=='AMD' else 100},{'date':'2026-11-23','price':103 if symbol=='AMD' else 102}]})
 page.route('**/api/company-scale?*',history)
 page.goto('/portfolio?portfolio_tab=performance')
 panel=page.get_by_test_id('performance-market-history');chart=panel.get_by_test_id('holding-price-chart')
 expect(chart.locator('.recharts-line-curve')).to_have_count(1)
 expect(chart.get_by_role('heading',name='NVDA',exact=True)).to_be_visible()
 panel.get_by_role('combobox',name='Holding price chart',exact=True).select_option('AMD')
 expect(chart.get_by_role('heading',name='AMD',exact=True)).to_be_visible()
 expect(chart.get_by_test_id('holding-history-source')).to_contain_text('alpha-vantage')
 expect(chart.get_by_test_id('holding-history-source')).not_to_contain_text('yahoo')
 loaded=chart.get_by_text('Loaded in this browser',exact=False).inner_text()
 page.clock.set_fixed_time(datetime.datetime(2026,11,24,12,0,30,tzinfo=datetime.timezone.utc))
 chart.get_by_role('button',name='1M',exact=True).click()
 expect(chart.locator('.recharts-line-curve')).to_have_count(1)
 expect(chart.get_by_text('Loaded in this browser',exact=False)).to_have_text(loaded)
 assert calls.count('AMD')==calls.count('NVDA')==1

@pytest.mark.parametrize('mode,expected',[
 ('valid','+$50'),('unknown-fee','—'),('partial','—'),('simulated','—'),
 ('tiny','+1.0000e-10 USD'),('zero','+$0'),('loss','−$20'),('unavailable','—')])
def test_production_layout_withholds_unsupported_money_without_runtime_errors(page,mode,expected):
 body=json.loads(subprocess.check_output(['node','qa/fixtures/milestone1-portfolio.fictional.mjs',mode],cwd=ROOT,env={'PATH':os.environ['PATH']},text=True))
 page.clock.install(time=datetime.datetime(2026,11,13,18,tzinfo=datetime.timezone.utc))
 errors=[];writes=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.on('request',lambda request:writes.append(request.url) if request.method not in ('GET','HEAD') else None)
 mock_local_apis(page)
 def portfolio(route):
  query=parse_qs(urlparse(route.request.url).query)
  if 'includeTransactions' in query:
   route.fulfill(status=503 if mode=='unavailable' else 200,content_type='application/json',body=json.dumps({'transactions':body['transactions']}))
  else:route.fulfill(status=200,content_type='application/json',body=json.dumps({'holdings':body['holdings'],'cashFlows':[]}))
 page.route('**/api/portfolio?*',portfolio)
 page.route('**/api/portfolio',portfolio)
 def quote(route):
  symbol=parse_qs(urlparse(route.request.url).query).get('symbol',['NVDA'])[0]
  packet={'symbol':symbol,'returnedSymbol':symbol,'price':body['price'],'changePct':0,'provider':'fictional-source',
   'sourceMode':'live','currency':'USD','adjustedBasis':'raw','marketTimePrecision':'instant',
   'marketTime':'2026-11-13T18:00:00Z','retrievedAt':'2026-11-13T18:00:00Z','isMarketSessionOpen':True,
   'simulated':mode=='simulated','stale':False,'cached':False}
  if mode=='partial' and symbol=='AMD':packet['currency']='EUR'
  route.fulfill(status=200,content_type='application/json',body=json.dumps(packet))
 page.route('**/api/quote?*',quote)
 goto_app(page)
 page.get_by_test_id('nav-portfolio').click()
 center=page.get_by_test_id('portfolio-intelligence')
 metric=center.get_by_text('Total trading P&L',exact=True).locator('..')
 expect(metric).to_contain_text(expected)
 expect(center.get_by_test_id('portfolio-accounting-status')).to_contain_text('full history unverified')
 if mode in ('unknown-fee','unavailable'):
  expect(center.get_by_text('Open cost basis',exact=True).locator('..')).to_contain_text('—')
 if mode in ('partial','simulated'):
  expect(center.get_by_text('Holdings value',exact=True).locator('..')).to_contain_text('—')
 center.get_by_role('button',name='Performance',exact=True).click()
 expect(center).to_contain_text('Portfolio return history withheld: full history unverified')
 expect(center).to_contain_text('Verified accounting and historical source coverage required')
 if mode in ('partial','simulated'):
  expect(center.get_by_text('Top 3 share',exact=True).locator('..')).to_contain_text('—')
 center.get_by_role('button',name='My Holdings',exact=True).click()
 expect(center).to_contain_text('NVDA')
 page.set_viewport_size({'width':360,'height':800})
 assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
 assert errors==[] and writes==[]
