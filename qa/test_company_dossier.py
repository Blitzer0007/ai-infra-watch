"""Fictional dossier, forbidden transport/persistence, and intercepted holding flow."""
import os
from pathlib import Path
import subprocess
import pytest
from playwright.sync_api import expect
from test_holding_detail import open_holdings

ROOT=Path(__file__).resolve().parents[1]
SECTIONS=['Overview','Growth','Financial health','Valuation','Catalysts','Risks','Sources']


@pytest.fixture(scope='module')
def dossier_bundle():
    script="""
import {buildSync} from 'esbuild';
const contents=`import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
import CompanyDossier from './src/components/portfolio/CompanyDossier';
import CompanyDossierPreview,{fictionalDossierRequest} from './src/components/portfolio/CompanyDossierPreview';
function Harness(){const [mode,setMode]=useState('preview');let request=structuredClone(fictionalDossierRequest),symbol='FICT';
if(mode==='not-configured')request=null;
if(['timeout','rate-limited','transport-error','no-data','unavailable'].includes(mode))request.source={status:mode};
if(mode==='invalid')request.source.receipt.private='private-payload-do-not-render';
if(mode==='mismatch')symbol='NVDA';
if(mode==='zero'){const o=request.source.receipt.observations.find(o=>o.method==='operating-margin');o.inputs[0].value=0;o.evidence.value=0;}
if(mode==='amendment')for(const o of request.source.receipt.observations)for(const f of o.inputs)f.form='10-K/A';
return <><label>Test dossier packet<select aria-label='Test dossier packet' value={mode} onChange={e=>setMode(e.target.value)}>{['preview','full','not-configured','timeout','rate-limited','transport-error','no-data','unavailable','invalid','mismatch','zero','amendment'].map(s=><option key={s}>{s}</option>)}</select></label>
{mode==='preview'?<CompanyDossierPreview/>:<CompanyDossier key={mode} symbol={symbol} request={request} fictional/>}</>}
createRoot(document.getElementById('root')).render(<Harness/>);`;
process.stdout.write(buildSync({stdin:{contents,resolveDir:process.cwd(),loader:'tsx'},bundle:true,jsx:'automatic',platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},write:false}).outputFiles[0].text);
"""
    return subprocess.check_output(['node','--input-type=module','-e',script],cwd=ROOT,text=True,env={'PATH':os.environ.get('PATH','')})


@pytest.fixture
def isolated_dossier(page,dossier_bundle):
    requests=[];errors=[]
    page.on('request',lambda request:requests.append(request.url));page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_content('<div id="root"></div>')
    page.evaluate("""() => {
      window.fetch=()=>{throw Error('Dossier fetch forbidden');};
      window.WebSocket=class {constructor(){throw Error('Dossier socket forbidden');}};
      window.setInterval=()=>{throw Error('Dossier polling forbidden');};
      Storage.prototype.setItem=()=>{throw Error('Dossier persistence forbidden');};
      Storage.prototype.getItem=()=>{throw Error('Dossier storage read forbidden');};
      window.Notification=class {constructor(){throw Error('Dossier notification forbidden');}};
    }""")
    page.add_script_tag(content=dossier_bundle)
    yield page
    assert requests==[] and errors==[]


def choose(page,section):
    dossier=page.get_by_test_id('company-dossier')
    dossier.get_by_role('button',name=section,exact=True).click()
    expect(dossier.get_by_test_id('dossier-section').get_by_role('heading',name=section,exact=True)).to_be_visible()
    return dossier.get_by_test_id('dossier-section')


def test_manual_fictional_preview_separates_sections_and_retains_source_limits(isolated_dossier):
    page=isolated_dossier
    expect(page.get_by_test_id('company-dossier')).to_have_count(0)
    page.get_by_role('button',name='Open fictional dossier',exact=True).click()
    dossier=page.get_by_test_id('company-dossier')
    expect(dossier).to_contain_text('Fictional data only')
    expect(dossier).to_contain_text('11 · partial coverage')
    growth=choose(page,'Growth')
    expect(growth.get_by_test_id('dossier-observation')).to_have_count(4)
    expect(growth.locator('[data-metric="revenue_growth_pct"]')).to_contain_text('20%')
    expect(growth.locator('[data-metric="revenue_growth_pct"]')).to_contain_text('2025-01-01 to 2025-12-31')
    margin=growth.locator('[data-metric="operating_margin_pct"]')
    margin.get_by_text('Definition and original inputs',exact=True).click()
    expect(margin).to_contain_text('OperatingIncomeLoss: 24 USD')
    health=choose(page,'Financial health')
    expect(health.get_by_test_id('dossier-observation')).to_have_count(6)
    expect(health.locator('[data-metric="free_cash_flow_usd"]')).to_contain_text('-5 USD')
    expect(health.locator('[data-metric="liabilities_equity"]')).to_contain_text('As of 2025-12-31 · instant balance')
    expect(health).to_contain_text('different measure from debt / equity')
    sources=choose(page,'Sources')
    expect(sources).to_contain_text('calendar-day precision; exact publication time not supplied')
    expect(sources).to_contain_text('Restatement status not established')
    expect(sources).to_contain_text('acquisition usage unknown')
    expect(sources.get_by_role('link')).to_have_count(0)
    sources.get_by_text('Publication uncertainty bounds',exact=True).click()
    expect(sources).to_contain_text('2026-02-19T10:00:00.000Z')
    expect(sources).to_contain_text('not known publication timestamps')


@pytest.mark.parametrize('mode,message',[
    ('not-configured','Financial source not connected'),('timeout','timeout'),('rate-limited','rate limit'),('transport-error','transport error'),('no-data','no supported data'),('unavailable','Financial observations unavailable'),('invalid','Financial inputs need review'),('mismatch','Financial inputs need review'),
])
def test_missing_failed_or_wrong_issuer_inputs_never_become_zero_financials(isolated_dossier,mode,message):
    page=isolated_dossier;page.get_by_label('Test dossier packet',exact=True).select_option(mode)
    expect(page.get_by_test_id('dossier-source-status')).to_contain_text(message)
    panel=choose(page,'Growth');expect(panel.get_by_test_id('dossier-observation')).to_have_count(0)
    expect(panel).to_contain_text('does not mean zero revenue')
    sources=choose(page,'Sources');expect(sources).to_contain_text('not an empty filing history')
    assert 'private-payload-do-not-render' not in sources.inner_text()


def test_observed_zero_and_amendment_do_not_become_missing_or_verified(isolated_dossier):
    page=isolated_dossier;page.get_by_label('Test dossier packet',exact=True).select_option('zero')
    expect(choose(page,'Growth').locator('[data-metric="operating_margin_pct"]').get_by_test_id('dossier-value')).to_have_text('0%')
    page.get_by_label('Test dossier packet',exact=True).select_option('amendment')
    expect(choose(page,'Sources')).to_contain_text('financial restatement is not certified')
    expect(page.get_by_test_id('company-dossier')).to_contain_text('issuer verification remain unverified')


def test_valuation_catalyst_and_risk_gaps_never_supply_scores_or_clearance(isolated_dossier):
    page=isolated_dossier;page.get_by_label('Test dossier packet',exact=True).select_option('full')
    expect(choose(page,'Valuation')).to_contain_text('Valuation multiples unavailable')
    expect(choose(page,'Catalysts')).to_contain_text('coverage is unknown')
    expect(choose(page,'Risks')).to_contain_text('cannot establish a low-risk result')
    expect(page.get_by_test_id('dossier-observation')).to_have_count(0)


def test_real_holding_disclosure_is_unconnected_and_preserves_navigation(page):
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    portfolio=open_holdings(page)
    trigger=portfolio.get_by_role('button',name='Open NVDA holding details',exact=True);trigger.click()
    dialog=page.get_by_role('dialog',name='NVDA holding details',exact=True)
    expect(dialog.get_by_test_id('company-dossier')).to_have_count(0)
    page.wait_for_load_state('networkidle');requests=[]
    page.on('request',lambda request:requests.append((request.method,request.url)))
    dialog.get_by_test_id('holding-company-dossier').get_by_text('Company dossier',exact=True).click()
    expect(dialog.get_by_test_id('dossier-source-status')).to_contain_text('Financial source not connected')
    for name in SECTIONS:
        dialog.get_by_role('button',name=name,exact=True).focus();dialog.get_by_role('button',name=name,exact=True).press('Enter')
        expect(dialog.get_by_test_id('dossier-section').get_by_role('heading',name=name,exact=True)).to_be_visible()
    assert not [url for method,url in requests if '/api/' in url or method not in ('GET','HEAD')]
    assert errors==[]
    expect(dialog.get_by_test_id('dossier-observation')).to_have_count(0)
    dialog.press('Escape');expect(trigger).to_be_focused()
    trigger.click();dialog.get_by_test_id('holding-company-dossier').get_by_text('Company dossier',exact=True).click()
    expect(dialog.get_by_test_id('dossier-section').get_by_role('heading',name='Overview',exact=True)).to_be_visible()


@pytest.mark.parametrize('width',[360,768,1440])
def test_preview_keyboard_sections_layout_and_screenshots(page,width):
    from test_ui import mock_local_apis
    mock_local_apis(page);page.set_viewport_size({'width':width,'height':1000})
    page.goto('/portfolio?portfolio_tab=research')
    preview=page.get_by_test_id('company-dossier-preview')
    page.wait_for_load_state('networkidle');requests=[];page.on('request',lambda request:requests.append(request.url))
    preview.get_by_role('button',name='Open fictional dossier',exact=True).focus()
    preview.get_by_role('button',name='Open fictional dossier',exact=True).press('Enter')
    dossier=preview.get_by_test_id('company-dossier')
    for name in SECTIONS:
        button=dossier.get_by_role('button',name=name,exact=True);button.focus();button.press('Enter')
        expect(button).to_have_attribute('aria-pressed','true')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    dossier.get_by_role('button',name='Financial health',exact=True).click()
    root=Path(os.getenv('QA_ARTIFACT_DIR','/tmp/aiw-dossier'));root.mkdir(parents=True,exist_ok=True)
    page.evaluate('document.activeElement?.blur();scrollTo(0,0)')
    page.screenshot(path=str(root/f'company-dossier-{width}.png'),full_page=True,animations='disabled')
    assert requests==[]


def test_fictional_preview_is_absent_from_production_build():
    scripts=list((ROOT/'dist/assets').glob('*.js'));assert scripts
    bundle='\n'.join(path.read_text() for path in scripts)
    assert 'Open fictional dossier' not in bundle and 'Fictional Components Ltd' not in bundle


def test_failed_code_download_stays_inside_the_holding_disclosure(page):
    script="""
import {build} from 'esbuild';
const contents=`import React from 'react';import {createRoot} from 'react-dom/client';import HoldingCompanyDossier from './src/components/portfolio/HoldingCompanyDossier';createRoot(document.getElementById('root')).render(<><p>Retained holding context</p><HoldingCompanyDossier symbol='FICT'/><button>Continue holding review</button></>);`;
const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'tsx'},bundle:true,jsx:'automatic',platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},write:false,plugins:[{name:'failed-view',setup(build){build.onResolve({filter:/^\\.\\/CompanyDossier$/},args=>args.kind==='dynamic-import'?{path:'failed-view',namespace:'fictional-failure'}:null);build.onLoad({filter:/.*/,namespace:'fictional-failure'},()=>({contents:"throw Error('Fictional static view load failure');export default null;",loader:'js'}));}}]});
process.stdout.write(result.outputFiles[0].text);
"""
    bundle=subprocess.check_output(['node','--input-type=module','-e',script],cwd=ROOT,text=True,env={'PATH':os.environ.get('PATH','')})
    errors=[];requests=[]
    page.on('pageerror',lambda error:errors.append(str(error)));page.on('request',lambda request:requests.append(request.url))
    page.set_content('<div id="root"></div>');page.add_script_tag(content=bundle)
    panel=page.get_by_test_id('holding-company-dossier');panel.get_by_text('Company dossier',exact=True).click()
    expect(panel.get_by_role('alert')).to_contain_text('Your holding review remains available')
    expect(page.get_by_text('Retained holding context',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Continue holding review',exact=True)).to_be_visible()
    panel.get_by_text('Company dossier',exact=True).click();expect(panel.get_by_role('alert')).not_to_be_visible()
    assert errors==[] and requests==[]
