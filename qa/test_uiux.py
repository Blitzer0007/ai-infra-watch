"""Keyboard and responsive interaction checks with intercepted API fixtures only."""
import pytest
from test_ui import mock_local_apis


@pytest.fixture(autouse=True)
def interaction_timeout(page):
    page.set_default_timeout(7000)


@pytest.mark.parametrize('width', [320, 768])
def test_mobile_navigation_is_modal_and_restores_focus(page, width):
    mock_local_apis(page)
    page.set_viewport_size({'width': width, 'height': 800})
    page.goto('/overview')
    trigger = page.locator('.aiw-mobile-header button')
    trigger.click()
    menu = page.get_by_role('dialog', name='Navigation menu')
    assert menu.evaluate('(dialog) => dialog.matches(":modal")')
    assert trigger.get_attribute('aria-expanded') == 'true'
    close = menu.get_by_role('button', name='Close navigation menu')
    assert close.evaluate('(button) => document.activeElement === button')
    close.press('Shift+Tab')
    assert menu.get_by_role('button', name='Settings').evaluate('(button) => document.activeElement === button')
    page.keyboard.press('Tab')
    assert close.evaluate('(button) => document.activeElement === button')
    page.keyboard.press('Escape')
    assert menu.count() == 0
    assert trigger.evaluate('(button) => document.activeElement === button')
    assert trigger.get_attribute('aria-expanded') == 'false'
    trigger.click()
    menu.get_by_role('button', name='Opportunities').click()
    page.wait_for_url('**/opportunities')
    page.wait_for_function('document.activeElement?.tagName === "H1"')
    assert menu.count() == 0
    assert 'Opportunity research' in page.title()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    # A breakpoint change must not leave an invisible modal blocking the desktop.
    trigger.click()
    page.set_viewport_size({'width': 1440, 'height': 1000})
    menu.wait_for(state='detached')
    assert page.locator('dialog:modal').count() == 0
    assert page.locator('body').evaluate('(body) => body.style.overflow') != 'hidden'


def test_universal_search_focus_loop_escape_and_navigation(page):
    mock_local_apis(page)
    page.goto('/overview')
    trigger = page.get_by_role('button', name='Open universal search')
    trigger.click()
    search = page.get_by_role('dialog', name='Universal search')
    query = search.get_by_role('textbox')
    assert search.evaluate('(dialog) => dialog.matches(":modal")')
    assert query.evaluate('(input) => document.activeElement === input')
    query.press('Shift+Tab')
    assert search.locator('button').last.evaluate('(button) => document.activeElement === button')
    page.keyboard.press('Tab')
    assert query.evaluate('(input) => document.activeElement === input')
    page.keyboard.press('Escape')
    assert search.count() == 0
    assert trigger.evaluate('(button) => document.activeElement === button')
    page.keyboard.press('Control+k')
    query.fill('settings')
    query.press('Enter')
    page.wait_for_url('**/settings')
    page.wait_for_function('document.activeElement?.tagName === "H1"')
    assert search.count() == 0
    page.go_back()
    page.wait_for_url('**/overview')
    page.wait_for_function('document.activeElement?.tagName === "H1" && document.title.includes("Ecosystem")')


def test_skip_link_ticker_and_feed_progressive_disclosure(page):
    mock_local_apis(page)
    page.goto('/overview')
    page.get_by_role('heading', level=1).wait_for()
    page.keyboard.press('Tab')
    skip = page.get_by_role('link', name='Skip to main content')
    assert skip.evaluate('(link) => document.activeElement === link')
    skip.press('Enter')
    page.wait_for_function('document.activeElement?.tagName === "MAIN"')
    ticker = page.locator('.aiw-ticker-toggle')
    ticker.click()
    assert ticker.get_attribute('aria-pressed') == 'true'
    page.get_by_role('button', name='Resume ticker').click()
    status = page.get_by_role('region', name='Market feed status')
    assert not status.locator('details').evaluate('(details) => details.open')
    status.locator('summary').click()
    status.get_by_text('Auto refresh:', exact=False).wait_for(state='visible')
    page.set_viewport_size({'width': 360, 'height': 800})
    assert status.get_by_role('button', name='REFRESH FEED').is_visible()
    status.locator('summary').click()
    # Mobile chrome should not cover the search control at the top of the page.
    page.evaluate('scrollTo(0,0)')
    header = page.locator('.aiw-mobile-header').bounding_box()
    search = page.get_by_role('button', name='Open universal search').bounding_box()
    assert search['y'] >= header['y'] + header['height']


def test_mobile_table_keyboard_scroll_and_sort_semantics(page):
    mock_local_apis(page)
    page.set_viewport_size({'width': 360, 'height': 800})
    page.goto('/congress')
    region = page.get_by_role('region', name='Data table')
    region.wait_for()
    assert region.evaluate('(element) => element.scrollWidth > element.clientWidth')
    region.focus()
    region.press('ArrowRight')
    page.wait_for_function('(region) => region.scrollLeft > 0', arg=region.element_handle())
    sort = page.get_by_role('button', name='Sort by Filed', exact=True)
    sort.scroll_into_view_if_needed()
    sort.press('Enter')
    assert sort.locator('..').get_attribute('aria-sort') == 'ascending'
    assert sort.get_attribute('aria-sort') is None
    sort.press('Enter')
    assert sort.locator('..').get_attribute('aria-sort') == 'descending'
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
