"""Configured watchlist research stays distinct from holdings; all APIs intercepted."""
import json
import os
import subprocess
from pathlib import Path
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

def sec_packet(symbol='DEMO'):
 root=Path(__file__).resolve().parents[1]
 return json.loads(subprocess.check_output(['node','qa/fixtures/sec-dossier.fictional.mjs',symbol],cwd=root,env={'PATH':os.environ['PATH']},text=True))

@pytest.mark.parametrize('width,theme',[(390,'dark'),(1440,'light')])
def test_opportunity_financial_review_is_explicit_and_does_not_promote_frozen_scan(page,width,theme):
 fictional_portfolio(page);page.set_viewport_size({'width':width,'height':1000})
 page.add_init_script(f'localStorage.setItem("aiw-ui-theme-v1",{json.dumps(theme)});sessionStorage.setItem("aiw_access_token_v1","fictional-opportunity-financial-session");Date.now=()=>1794744000000;')
 calls=[]
 def respond(route):
  calls.append(route.request);route.fulfill(status=200,json=sec_packet())
 page.route('**/api/company-scale?action=dossier&symbol=*',respond)
 page.goto('/opportunities');scanner=page.get_by_test_id('opportunity-scanner')
 scanner.get_by_role('button',name='Scan loaded snapshot',exact=True).click()
 panel=scanner.get_by_test_id('opportunity-financial-review')
 panel.locator('summary').first.click();assert calls==[]
 panel.get_by_role('combobox',name='Financial review company',exact=True).select_option('DEMO')
 panel.get_by_role('button',name='Load SEC financial inputs',exact=True).click()
 expect(panel).to_contain_text('declared CIK 0000000001')
 panel.get_by_role('combobox',name='Annual financial period',exact=True).select_option(index=1)
 table=panel.get_by_test_id('opportunity-financial-table');expect(table).to_contain_text('120 USD');expect(table).to_contain_text('-8 USD')
 expect(scanner).to_contain_text('Research input coverage: 0/2 eligible')
 assert len(calls)==1 and calls[0].method=='GET'
 assert calls[0].headers.get('authorization')=='Bearer fictional-opportunity-financial-session'
 panel.locator('summary').first.click();panel.locator('summary').first.click()
 page.wait_for_load_state('networkidle');assert len(calls)==1
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 scanner.get_by_role('button',name='Scan loaded snapshot',exact=True).click()
 panel=scanner.get_by_test_id('opportunity-financial-review');panel.locator('summary').first.click()
 expect(panel.get_by_test_id('opportunity-financial-table')).to_have_count(0)
 expect(panel).to_contain_text('0/3 attempts');assert len(calls)==1

def test_opportunity_financial_failures_and_issuer_switch_discard_previous_review(page):
 fictional_portfolio(page);calls=[]
 def respond(route):
  calls.append(route.request.url)
  if 'symbol=DEMO' in route.request.url:route.fulfill(status=200,json=sec_packet())
  else:route.fulfill(status=429,json={'ok':False,'code':'RATE_LIMITED','error':'private-upstream-detail'})
 page.route('**/api/company-scale?action=dossier&symbol=*',respond)
 page.goto('/opportunities');scanner=page.get_by_test_id('opportunity-scanner');scanner.get_by_role('button',name='Scan loaded snapshot',exact=True).click()
 panel=scanner.get_by_test_id('opportunity-financial-review');panel.locator('summary').first.click()
 picker=panel.get_by_role('combobox',name='Financial review company',exact=True);picker.select_option('DEMO')
 panel.get_by_role('button',name='Load SEC financial inputs',exact=True).click();expect(panel).to_contain_text('declared CIK 0000000001')
 picker.select_option('FICT');expect(panel).not_to_contain_text('declared CIK');expect(panel).to_contain_text('0/3 attempts')
 panel.get_by_role('button',name='Load SEC financial inputs',exact=True).click();expect(panel.get_by_role('alert')).to_contain_text('rate limited')
 expect(panel).not_to_contain_text('private-upstream-detail');page.wait_for_load_state('networkidle');assert len(calls)==2

def test_opportunity_financial_inflight_switch_drops_late_packet(page):
 fictional_portfolio(page);pending=[]
 page.route('**/api/company-scale?action=dossier&symbol=*',lambda route:pending.append(route))
 page.goto('/opportunities');scanner=page.get_by_test_id('opportunity-scanner');scanner.get_by_role('button',name='Scan loaded snapshot',exact=True).click()
 panel=scanner.get_by_test_id('opportunity-financial-review');panel.locator('summary').first.click()
 picker=panel.get_by_role('combobox',name='Financial review company',exact=True);picker.select_option('DEMO')
 with page.expect_request('**/api/company-scale?action=dossier&symbol=DEMO'):
  panel.get_by_role('button',name='Load SEC financial inputs',exact=True).click()
 picker.select_option('FICT');expect(panel).to_contain_text('0/3 attempts')
 pending[0].fulfill(status=200,json=sec_packet())
 expect(panel).not_to_contain_text('DEMO · declared CIK');expect(panel.get_by_role('button',name='Load SEC financial inputs',exact=True)).to_be_enabled()
 expect(panel.get_by_test_id('opportunity-financial-table')).to_have_count(0)

@pytest.mark.parametrize('width,theme',[(390,'dark'),(1440,'light')])
def test_manual_sec_connection_populates_original_declarations_without_background_calls(page,width,theme):
 fictional_portfolio(page);page.set_viewport_size({'width':width,'height':1000})
 page.add_init_script(f'localStorage.setItem("aiw-ui-theme-v1",{json.dumps(theme)});sessionStorage.setItem("aiw_access_token_v1","fictional-sec-browser-session");')
 calls=[]
 def respond(route):
  calls.append(route.request)
  route.fulfill(status=200,json=sec_packet())
 page.route('**/api/company-scale?action=dossier&symbol=*',respond)
 page.goto('/portfolio?portfolio_tab=research&research_symbol=DEMO')
 research=workspace(page);research.get_by_text('Company dossier',exact=True).click()
 expect(research.get_by_test_id('company-dossier')).to_be_visible();assert calls==[]
 research.get_by_role('button',name='Load SEC financial declarations',exact=True).click()
 expect(research.get_by_test_id('sec-dossier-connection')).to_contain_text('CIK 0000000001')
 expect(research.get_by_test_id('dossier-source-status')).to_contain_text('Partial loaded declarations')
 assert len(calls)==1 and calls[0].method=='GET'
 assert calls[0].headers.get('authorization')=='Bearer fictional-sec-browser-session'
 dossier=research.get_by_test_id('company-dossier')
 dossier.get_by_role('button',name='Growth',exact=True).click()
 expect(dossier).not_to_contain_text('Definition unavailable')
 dossier.get_by_test_id('dossier-operating-panel').locator('summary').first.click()
 dossier.get_by_role('combobox').select_option(index=1)
 expect(dossier).to_contain_text('Net income (loss)')
 expect(dossier).to_contain_text('-8 USD')
 dossier.get_by_role('button',name='Financial health',exact=True).click();expect(dossier).to_contain_text('Cash and cash equivalents')
 dossier.get_by_role('button',name='Valuation',exact=True).click();expect(dossier).to_contain_text('Valuation multiples unavailable')
 research.get_by_text('Company dossier',exact=True).click();research.get_by_text('Company dossier',exact=True).click()
 page.wait_for_load_state('networkidle');assert len(calls)==1
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 research.get_by_role('combobox',name='Research company',exact=True).select_option('FICT')
 expect(research.get_by_test_id('sec-dossier-connection')).to_have_count(0)

@pytest.mark.parametrize('status,code,expected',[(401,'PRIVATE','Sign in again'),(503,'CONTACT_NOT_CONFIGURED','SEC contact configuration'),(429,'RATE_LIMITED','rate limited'),(502,'UNRECOGNIZED','acquisition is unavailable')])
def test_manual_sec_failures_are_bounded_and_do_not_retry(page,status,code,expected):
 fictional_portfolio(page);calls=[]
 def respond(route):
  calls.append(route.request.url);route.fulfill(status=status,json={'ok':False,'code':code,'error':'private-upstream-detail'})
 page.route('**/api/company-scale?action=dossier&symbol=*',respond)
 page.goto('/portfolio?portfolio_tab=research&research_symbol=DEMO')
 research=workspace(page);research.get_by_text('Company dossier',exact=True).click()
 research.get_by_role('button',name='Load SEC financial declarations',exact=True).click()
 expect(research.get_by_role('alert')).to_contain_text(expected)
 expect(research).not_to_contain_text('private-upstream-detail');expect(research.get_by_test_id('sec-dossier-connection')).to_have_count(0)
 page.wait_for_load_state('networkidle');assert len(calls)==1

def test_manual_sec_packet_for_another_issuer_cannot_populate_dossier(page):
 fictional_portfolio(page)
 page.route('**/api/company-scale?action=dossier&symbol=*',lambda route:route.fulfill(status=200,json=sec_packet('FICT')))
 page.goto('/portfolio?portfolio_tab=research&research_symbol=DEMO')
 research=workspace(page);research.get_by_text('Company dossier',exact=True).click()
 research.get_by_role('button',name='Load SEC financial declarations',exact=True).click()
 expect(research.get_by_role('alert')).to_contain_text('failed issuer or input checks')
 expect(research.get_by_test_id('dossier-source-status')).to_contain_text('Financial source not connected')

def test_manual_sec_attempt_limit_and_symbol_change_do_not_reuse_old_issuer(page):
 fictional_portfolio(page);calls=[]
 def respond(route):
  calls.append(route.request.url);route.fulfill(status=502,json={'ok':False,'code':'NO_DATA'})
 page.route('**/api/company-scale?action=dossier&symbol=*',respond)
 page.goto('/portfolio?portfolio_tab=research&research_symbol=DEMO')
 research=workspace(page);research.get_by_text('Company dossier',exact=True).click()
 button=research.get_by_role('button',name='Load SEC financial declarations',exact=True)
 for i in range(3):
  button.click();expect(research.get_by_role('alert')).to_contain_text('was not available')
 expect(button).to_be_disabled();assert len(calls)==3
 research.get_by_role('combobox',name='Research company',exact=True).select_option('FICT')
 research.get_by_text('Company dossier',exact=True).click()
 expect(research.get_by_role('button',name='Load SEC financial declarations',exact=True)).to_be_enabled()
 expect(research).to_contain_text('0/3 attempts')

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
