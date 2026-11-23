"""Production frontend with fictional loopback APIs, never a deployed application."""
import json
from playwright.sync_api import expect
from test_ui import mock_local_apis
from test_application_workspace import ROUTES


def test_production_navigation_does_not_persist_settings_or_upload_legacy_forecasts(page):
    mock_local_apis(page)
    writes=[];errors=[]
    page.on('request',lambda request:writes.append(request.url) if request.method not in ('GET','HEAD','OPTIONS') else None)
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto('/overview')
    # This must fail if the server is accidentally still serving the QA build.
    expect(page.get_by_role('heading',name='Private dashboard',exact=True)).to_be_visible()
    legacy=[{'id':'fictional-device-only','ticker':'FICT','horizon':5,'entryPrice':100,'median':1}]
    page.evaluate('value => {sessionStorage.setItem("aiw_access_token_v1","fictional-production-smoke-session");localStorage.setItem("aiw-forward-outlook-forecasts-v1",JSON.stringify(value));}',legacy)
    page.route('**/api/forecast-verification*',lambda route:route.fulfill(status=200,json={'forecasts':[],'analytics':None,'model':'analogue-v1','config':None}))
    page.reload()
    for view in ROUTES:
        page.goto('/'+view)
        expect(page.get_by_test_id('workspace-title')).to_be_visible()
        page.wait_for_load_state('networkidle')
    page.evaluate('window.dispatchEvent(new CustomEvent("aiw-config-changed",{detail:{watchlist:["FICT"],alerts:[]}}))')
    page.wait_for_load_state('networkidle')
    assert writes==[], 'Production navigation must not write API records or dispatch alerts'
    assert errors==[]
    assert json.loads(page.evaluate('localStorage.getItem("aiw-forward-outlook-forecasts-v1")'))==legacy
