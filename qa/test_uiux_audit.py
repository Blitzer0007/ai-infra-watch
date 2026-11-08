"""Fixture-only route inventory; generated evidence stays outside the repository."""
import json
import os
from pathlib import Path
import pytest
from test_ui import mock_local_apis

ROUTES = ['overview','contracts','tracker','congress','macro','portfolio','opportunities','watchlist','research','jev-lab','quality','outlook','health','guide','settings']

AUDIT = r'''() => {
  const visible = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
  const name = e => e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') || '').split(' ').map(id=>document.getElementById(id)?.textContent || '').join('').trim() || Array.from(e.labels || []).map(l=>l.textContent).join('').trim() || (e.tagName==='BUTTON' ? e.textContent.trim() : '');
  const main = document.querySelector('main');
  const controls = [...main.querySelectorAll('button,input:not([type=hidden]),select,textarea')].filter(visible);
  const unlabeled = controls.filter(e=>!name(e)).map(e=>({tag:e.tagName,type:e.getAttribute('type'),placeholder:e.getAttribute('placeholder')}));
  const clipped = controls.filter(e=>{const r=e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth+1;}).map(e=>({name:name(e).slice(0,80),tag:e.tagName,scrollable:!!e.closest('[role=region][tabindex="0"]')}));
  const leaves = [...main.querySelectorAll('p,span,label,button,td,th')].filter(e=>visible(e) && e.textContent.trim() && !e.children.length);
  const headings = [...main.querySelectorAll('h1,h2,h3')].filter(visible).map(e=>({level:Number(e.tagName.slice(1)),text:e.textContent.trim().slice(0,100)}));
  return {width:innerWidth,documentOverflow:document.documentElement.scrollWidth>innerWidth,headings,
    unlabeled,clipped,smallText:leaves.filter(e=>parseFloat(getComputedStyle(e).fontSize)<12).length,
    tables:main.querySelectorAll('table').length,focusableScrollRegions:main.querySelectorAll('[role=region][tabindex="0"]').length};
}'''

@pytest.mark.parametrize('width',[1440,768,360])
def test_route_inventory(page,width):
    mock_local_apis(page)
    page.set_viewport_size({'width':width,'height':1000 if width==1440 else 800})
    stage=os.getenv('QA_AUDIT_STAGE','after')
    root=Path(os.getenv('QA_ARTIFACT_DIR','/tmp/aiw-uiux'))/'uiux-audit'/stage
    root.mkdir(parents=True,exist_ok=True)
    results=[]
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    for route in ROUTES:
        errors.clear()
        page.goto('/'+route,wait_until='domcontentloaded')
        page.locator('main').wait_for(state='visible')
        page.wait_for_load_state('networkidle')
        result=page.evaluate(AUDIT)
        result['route']=route
        result['pageErrors']=list(errors)
        page.screenshot(path=str(root/f'{route}-{width}.png'),animations='disabled')
        results.append(result)
    (root/f'inventory-{width}.json').write_text(json.dumps(results,indent=2))
    if stage=='after':
        assert not [r['route'] for r in results if r['pageErrors']], results
        assert not [r['route'] for r in results if r['documentOverflow']], results
        assert not [r['route'] for r in results if len([h for h in r['headings'] if h['level']==1]) != 1], results
        assert not [r['route'] for r in results if r['headings'][0]['level'] != 1], results
        assert not [r['route'] for r in results if r['unlabeled']], results
        assert not [r['route'] for r in results if any(not control['scrollable'] for control in r['clipped'])], results
        assert not [r['route'] for r in results if r['smallText']], results
