"""UI-only glossary acceptance with fictional sessions and fully intercepted APIs."""
import os
from pathlib import Path
from playwright.sync_api import expect
from test_ui import mock_local_apis

ARTIFACTS=Path(os.getenv('QA_ARTIFACT_DIR','/tmp/aiw-glossary-release'))

def prepare(page):
    mock_local_apis(page)
    page.add_init_script('sessionStorage.setItem("aiw_access_token_v1","fictional-glossary-session")')
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('/guide');page.get_by_role('heading',name='Financial glossary',exact=True).wait_for()
    page.wait_for_load_state('networkidle')
    calls=[];page.on('request',lambda r:calls.append(r.url) if '/api/' in r.url else None)
    return page.get_by_role('region',name='Financial glossary',exact=True),calls,errors

def test_glossary_search_modal_and_related_terms_make_no_requests(page):
    glossary,calls,errors=prepare(page)
    expect(glossary.get_by_role('status')).to_have_text('20 definitions found')
    search=glossary.get_by_role('searchbox',name='Find a financial term',exact=True)
    search.fill('  FoRwArD P/E ');expect(glossary.get_by_role('status')).to_have_text('1 definitions found')
    trigger=glossary.get_by_role('button',name='Explain Forward P/E',exact=True)
    trigger.focus();trigger.press('Enter')
    dialog=page.get_by_role('dialog',name='Forward P/E',exact=True);expect(dialog).to_be_visible()
    expect(dialog).to_contain_text('An estimate is not a reported result.')
    dialog.get_by_role('button',name='Risk/reward ratio',exact=True).click()
    expect(page.get_by_role('dialog',name='Risk/reward ratio',exact=True)).to_be_visible()
    page.keyboard.press('Escape');expect(trigger).to_be_focused()
    trigger.click();expect(page.get_by_role('dialog',name='Forward P/E',exact=True)).to_be_visible()
    page.get_by_role('button',name='Close explanation',exact=True).click()
    assert calls==[] and errors==[]

def test_glossary_empty_search_keyboard_containment_and_focus_restore(page):
    glossary,calls,errors=prepare(page)
    search=glossary.get_by_role('searchbox',name='Find a financial term',exact=True)
    search.fill('unmatched-fictional-term');expect(glossary).to_contain_text('No matching definitions.')
    search.fill('EPS');trigger=glossary.get_by_role('button',name='Explain EPS',exact=True);trigger.click()
    dialog=page.get_by_role('dialog',name='EPS',exact=True)
    for key in ['Tab']*8+['Shift+Tab']*8:
        page.keyboard.press(key)
        assert dialog.evaluate('(e)=>e.contains(document.activeElement)')
    page.keyboard.press('Escape');expect(trigger).to_be_focused()
    assert search.input_value()=='EPS' and calls==[] and errors==[]

def test_glossary_mobile_tablet_desktop_and_dialog_have_no_horizontal_overflow(page):
    glossary,calls,errors=prepare(page)
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    for width in [360,768,1440]:
        page.set_viewport_size({'width':width,'height':1000})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        glossary.screenshot(path=str(ARTIFACTS/f'glossary-{width}.png'))
        glossary.get_by_role('button',name='Explain Free cash flow',exact=True).click()
        dialog=page.get_by_role('dialog',name='Free cash flow',exact=True)
        assert dialog.evaluate('(e)=>e.scrollWidth<=e.clientWidth')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        dialog.screenshot(path=str(ARTIFACTS/f'glossary-dialog-{width}.png'))
        page.keyboard.press('Escape')
    assert calls==[] and errors==[]
