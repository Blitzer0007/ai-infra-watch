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
