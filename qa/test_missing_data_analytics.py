"""Offline browser → intercepted API → missing/observed analytics regression."""
import json
import os
from datetime import date, timedelta, datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import pytest
from playwright.sync_api import expect
from test_ui import mock_local_apis
VALUATION_NOW=datetime(2026,11,13,18,0,tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def no_errors_or_writes(page):
    errors=[];writes=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('request',lambda request:writes.append(request.url) if request.method in ('POST','PUT','PATCH','DELETE') else None)
    yield
    assert errors==[]
    assert writes==[]


def setup(page,symbols=('NVDA','AMD'),observed=('NVDA',),histories=None):
    page.clock.set_fixed_time(VALUATION_NOW)
    mock_local_apis(page)
    control={'stale':False,'quotes':0}
    rows=[{'id':'fictional-'+symbol,'symbol':symbol,'quantity':1,'averageCost':100,'purchaseDate':'2026-01-01'} for symbol in symbols]
    page.route('**/api/portfolio?includeLots=true',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps({'holdings':rows})))
    page.route('**/api/live-data**',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps({'stockPrices':{},'contracts':[],'news':[],'macroRisks':[]})))
    def quote(route):
        symbol=parse_qs(urlparse(route.request.url).query).get('symbol',[''])[0]
        if symbol not in observed:
            route.fulfill(status=503,content_type='application/json',body='{"error":"fictional unavailable"}');return
        control['quotes']+=1
        instant=VALUATION_NOW.isoformat()
        route.fulfill(status=200,content_type='application/json',body=json.dumps({'symbol':symbol,'returnedSymbol':symbol,'price':100,'changePct':0,'stale':control['stale'],'provider':'declared-source','sourceMode':'live','currency':'USD','adjustedBasis':'raw','marketTimePrecision':'instant','marketTime':instant,'retrievedAt':instant,'isMarketSessionOpen':True}))
    page.route('**/api/quote**',quote)
    def company(route):
        query=parse_qs(urlparse(route.request.url).query)
        if query.get('action')!=['history']:
            route.fallback();return
        symbol=query.get('symbol',[''])[0]
        points=(histories or {}).get(symbol)
        route.fulfill(status=200 if points else 503,content_type='application/json',body=json.dumps({'symbol':symbol,'points':points or []}))
    page.route('**/api/company-scale**',company)
    return control


def test_empty_holdings_do_not_render_a_healthy_zero_stress(page):
    setup(page,symbols=(),observed=())
    page.goto('/portfolio?portfolio_tab=performance')
    stress=page.get_by_test_id('portfolio-stress')
    expect(stress.get_by_test_id('portfolio-stress-score')).to_have_text('Unavailable')
    expect(stress).to_contain_text('Insufficient data')
    assert 'Contained' not in stress.inner_text()
    assert '0/100' not in stress.inner_text()


def test_partial_prices_never_become_a_complete_reweighted_stress_score(page):
    setup(page)
    page.goto('/portfolio?portfolio_tab=performance')
    stress=page.get_by_test_id('portfolio-stress')
    expect(stress).to_contain_text('1/2 usable · partial')
    expect(stress.get_by_test_id('portfolio-stress-score')).to_have_text('Unavailable')
    assert 'Contained' not in stress.inner_text()


def test_loss_of_price_coverage_clears_an_older_numeric_score(page):
    page.clock.install()
    control=setup(page,symbols=('NVDA',))
    page.goto('/portfolio?portfolio_tab=performance')
    score=page.get_by_test_id('portfolio-stress-score')
    expect(score).to_have_text('5/100')
    page.wait_for_load_state('networkidle')
    before=control['quotes'];control['stale']=True
    page.clock.fast_forward(61000)
    expect(score).to_have_text('Unavailable')
    assert control['quotes']>before
    expect(page.get_by_test_id('portfolio-stress')).to_contain_text('Insufficient data')


@pytest.mark.parametrize('width',[360,768,1440])
def test_missing_rotation_has_no_neutral_rank_or_fake_pair_trend(page,width):
    setup(page)
    page.set_viewport_size({'width':width,'height':1000 if width==1440 else 800})
    page.goto('/portfolio?portfolio_tab=rotation')
    expect(page.get_by_role('status').filter(has_text='Rotation ranking unavailable')).to_be_visible()
    scores=page.get_by_test_id('rotation-score')
    assert scores.count()>0
    assert all(text=='Unavailable' for text in scores.all_text_contents())
    pair=page.get_by_test_id('rotation-pair').first
    expect(pair).to_contain_text('horizon comparison')
    assert pair.inner_text().count('Unavailable')==6
    assert 'widening' not in pair.inner_text() and 'narrowing' not in pair.inner_text()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    root=Path(os.getenv('QA_ARTIFACT_DIR','/tmp/aiw-uiux'));root.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(root/f'missing-analytics-{width}.png'),full_page=True)


def test_observed_rotation_shows_real_periods_and_partial_source_coverage(page):
    def history(step):
        return [{'date':str(date(2026,1,1)+timedelta(days=index)),'price':100+index*step} for index in range(21)]
    setup(page,histories={'NVDA':history(1),'AMD':history(0.5),'MU':history(0)})
    page.goto('/portfolio?portfolio_tab=rotation')
    expect(page.get_by_test_id('portfolio-intelligence')).to_contain_text('Compared source dates: 2026-01-01 to 2026-01-21.')
    groups=page.get_by_test_id('rotation-group')
    expect(groups.filter(has_text='NVDA').first).to_contain_text('history coverage: 2/')
    assert any(text!='Unavailable' for text in page.get_by_test_id('rotation-score').all_text_contents())
    pair=page.get_by_test_id('rotation-pair').first
    expect(pair).to_contain_text('+10.00 pts')
    expect(pair).to_contain_text('3M')
