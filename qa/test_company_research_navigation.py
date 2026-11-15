"""Configured watchlist research stays distinct from holdings; all APIs intercepted."""
import json
import pytest
from playwright.sync_api import expect
from test_release2 import fictional_portfolio

@pytest.fixture(autouse=True)
def readonly(page):
 errors=[];writes=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.on('request',lambda request:writes.append(request.url) if request.method not in ('GET','HEAD') else None)
 yield
 assert errors==[] and writes==[]

def workspace(page):return page.get_by_test_id('company-research-workspace')

def test_opportunity_to_unheld_dossier_and_explicit_rescan_retains_filters(page):
 fictional_portfolio(page)
 page.goto('/opportunities?opportunity_q=DEMO&opportunity_status=needs-data&opportunity_limit=40')
 scanner=page.get_by_test_id('opportunity-scanner')
 scanner.get_by_role('button',name='Scan loaded snapshot',exact=True).click()
 card=scanner.get_by_test_id('opportunity-card');expect(card).to_have_count(1)
 card.get_by_role('link',name='Open company dossier',exact=True).click()
 research=workspace(page)
 expect(research.get_by_role('heading',name='Company research: DEMO',exact=True)).to_be_visible()
 expect(research.get_by_test_id('research-position-context')).to_contain_text('no loaded position')
 page.wait_for_load_state('networkidle');calls=[];page.on('request',lambda request:calls.append(request.url) if '/api/' in request.url else None)
 research.get_by_text('Company dossier',exact=True).click()
 expect(research.get_by_test_id('dossier-source-status')).to_contain_text('Financial source not connected')
 expect(research.get_by_test_id('company-dossier')).to_contain_text('DEMO')
 expect(research.get_by_test_id('company-dossier')).not_to_contain_text('FICT')
 assert calls==[]
 research.get_by_role('link',name='Return to Opportunities',exact=True).click()
 scanner=page.get_by_test_id('opportunity-scanner');expect(scanner).to_contain_text('No scan has run')
 assert 'opportunity_limit=40' in page.url
 scanner.get_by_role('button',name='Scan loaded snapshot',exact=True).click()
 expect(scanner.get_by_role('searchbox',name='Search research candidates')).to_have_value('DEMO')
 expect(scanner.get_by_role('combobox',name='Research status')).to_have_value('needs-data')
 expect(scanner.get_by_test_id('opportunity-card')).to_have_count(1)

def test_legacy_unheld_company_link_is_canonical_before_reload(page):
 fictional_portfolio(page)
 page.goto('/portfolio?portfolio_tab=research&portfolio_symbol=DEMO')
 research=workspace(page)
 expect(research.get_by_role('combobox',name='Research company',exact=True)).to_have_value('DEMO')
 page.wait_for_load_state('networkidle')
 assert 'research_symbol=DEMO' in page.url
 page.reload()
 expect(research.get_by_role('combobox',name='Research company',exact=True)).to_have_value('DEMO')
 expect(research.get_by_test_id('research-position-context')).to_contain_text('no loaded position')


def test_company_picker_back_forward_never_replaces_the_selected_holding(page):
 fictional_portfolio(page)
 page.goto('/portfolio?portfolio_tab=research&research_symbol=DEMO&portfolio_symbol=FICT')
 research=workspace(page);picker=research.get_by_role('combobox',name='Research company',exact=True)
 expect(picker).to_have_value('DEMO')
 picker.select_option('FICT');expect(research).to_contain_text('Company research: FICT')
 expect(research.get_by_test_id('research-position-context')).to_contain_text('In loaded holdings')
 page.go_back();expect(picker).to_have_value('DEMO');expect(research).to_contain_text('no loaded position')
 page.go_forward();expect(picker).to_have_value('FICT')
 assert 'portfolio_symbol=FICT' in page.url

@pytest.mark.parametrize('query',[
 'research_symbol=%3Cscript%3E','research_symbol=','research_symbol=UNKNOWN',
 'research_symbol=FICT&research_symbol=DEMO'])
def test_invalid_or_unconfigured_company_cannot_show_another_dossier(page,query):
 fictional_portfolio(page)
 page.goto('/portfolio?portfolio_tab=research&portfolio_symbol=FICT&'+query)
 research=workspace(page);page.wait_for_load_state('networkidle')
 expect(research.get_by_role('alert')).to_contain_text('No substitute company is shown')
 expect(research.get_by_test_id('holding-company-dossier')).to_have_count(0)
 expect(research.get_by_role('combobox',name='Research company',exact=True)).to_have_value('')

def test_holdings_failure_does_not_claim_an_unheld_company(page):
 fictional_portfolio(page)
 page.route('**/api/portfolio?includeLots=true',lambda route:route.fulfill(status=503,content_type='application/json',body=json.dumps({'error':'fictional unavailable'})))
 page.goto('/portfolio?portfolio_tab=research&research_symbol=DEMO')
 research=workspace(page)
 expect(research.get_by_test_id('research-position-context')).to_contain_text('Holding membership is unavailable')
 expect(research).not_to_contain_text('no loaded position')
 expect(research.get_by_role('heading',name='Company research: DEMO',exact=True)).to_be_visible()

@pytest.mark.parametrize('width',[360,768,1440])
def test_company_research_mobile_keyboard_and_no_automatic_detail_reads(page,width):
 fictional_portfolio(page);page.set_viewport_size({'width':width,'height':900})
 calls=[];page.on('request',lambda request:calls.append(request.url))
 page.goto('/portfolio?portfolio_tab=research&research_symbol=DEMO')
 research=workspace(page);picker=research.get_by_role('combobox',name='Research company',exact=True)
 expect(picker).to_have_value('DEMO');picker.focus();expect(picker).to_be_focused()
 page.wait_for_load_state('networkidle')
 assert not [url for url in calls if 'action=history' in url or 'action=analyst' in url]
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
