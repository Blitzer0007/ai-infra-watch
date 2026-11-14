"""Versioned fictional statement receipts through the actual producer/verifier/UI."""
import os
from pathlib import Path
import subprocess
import pytest
from playwright.sync_api import expect
from test_ui import mock_local_apis

ROOT=Path(__file__).resolve().parents[1]


@pytest.fixture(scope='module')
def statement_bundle():
    script="""
import {buildSync} from 'esbuild';
const contents=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import CompanyDossier from './src/components/portfolio/CompanyDossier';
import {fictionalDossierRequest,fictionalDossierStatements} from './src/components/portfolio/CompanyDossierPreview';
import {buildSecStatementObservations} from './shared/secStatementObservations';
function Harness(){const [mode,setMode]=useState('valid');const p=fictionalDossierStatements();let symbol='FICT';
if(mode==='forged-value')p.entries[0].receipt.observations[0].value=999;
if(mode==='changed-original')p.source.facts.facts['us-gaap'].CashAndCashEquivalentsAtCarryingValue.units.USD[0].val=999;
if(mode==='forged-authority')p.entries[0].receipt.grantsDecisionEligibility=true;
if(mode==='private-field')p.entries[0].receipt.private='private-forged-body-do-not-render';
if(mode==='wrong-symbol')p.symbol='NVDA';
if(mode==='wrong-assessment')p.assessedAt='2026-11-14T12:00:01Z';
if(mode==='duplicate-period')p.entries[1]=p.entries[0];
if(['zero-eps','negative-eps','tiny-eps'].includes(mode))p.source.facts.facts['us-gaap'].EarningsPerShareBasic.units['USD/shares'][0].val=mode==='zero-eps'?0:mode==='negative-eps'?-.5:1e-10;
if(mode==='cash-only')p.source.facts.facts={'us-gaap':{CashAndCashEquivalentsAtCarryingValue:p.source.facts.facts['us-gaap'].CashAndCashEquivalentsAtCarryingValue}};
if(mode==='source-timeout'){p.source={status:'timeout'};p.retrievedAt=null;}
if(['zero-eps','negative-eps','tiny-eps','source-timeout','cash-only'].includes(mode))p.entries=p.entries.map(e=>({...e,receipt:buildSecStatementObservations({symbol:p.symbol,expectedCik:p.expectedCik,assessedAt:p.assessedAt,retrievedAt:p.retrievedAt,period:e.period,source:p.source})}));
return <><label>Statement case<select aria-label='Statement case' value={mode} onChange={e=>setMode(e.target.value)}>{['valid','forged-value','changed-original','forged-authority','private-field','wrong-symbol','wrong-assessment','duplicate-period','zero-eps','negative-eps','tiny-eps','source-timeout','cash-only'].map(s=><option key={s}>{s}</option>)}</select></label><CompanyDossier key={mode} symbol={symbol} request={fictionalDossierRequest} statements={p} fictional/></>}
createRoot(document.getElementById('root')).render(<Harness/>);`;
process.stdout.write(buildSync({stdin:{contents,resolveDir:process.cwd(),loader:'tsx'},bundle:true,jsx:'automatic',platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},write:false}).outputFiles[0].text);
"""
    return subprocess.check_output(['node','--input-type=module','-e',script],cwd=ROOT,text=True,env={'PATH':os.environ.get('PATH','')})


@pytest.fixture
def statements(page,statement_bundle):
    requests=[];errors=[]
    page.on('request',lambda request:requests.append(request.url));page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_content('<div id="root"></div>')
    page.evaluate("""() => {
      window.fetch=()=>{throw Error('Statement fetch forbidden');};
      window.WebSocket=class{constructor(){throw Error('Statement socket forbidden');}};
      Storage.prototype.setItem=()=>{throw Error('Statement persistence forbidden');};
      Storage.prototype.getItem=()=>{throw Error('Statement storage forbidden');};
      window.setInterval=()=>{throw Error('Statement polling forbidden');};
      window.Notification=class{constructor(){throw Error('Statement notification forbidden');}};
    }""")
    page.add_script_tag(content=statement_bundle)
    yield page
    assert requests==[] and errors==[]


def section(page,name):
    panel=page.get_by_test_id('company-dossier');panel.get_by_role('button',name=name,exact=True).click()
    expect(panel.get_by_test_id('dossier-section').get_by_role('heading',name=name,exact=True)).to_be_visible()
    return panel.get_by_test_id('dossier-section')


def test_statement_units_dates_and_bases_stay_distinct_and_valuation_withheld(statements):
    page=statements
    expect(page.get_by_test_id('dossier-statement-status')).to_contain_text('partial, bound declarations')
    expect(page.get_by_test_id('company-dossier')).to_contain_text('Additional statement observations: 10')
    health=section(page,'Financial health');expect(health.get_by_test_id('dossier-statement')).to_have_count(4)
    expect(health.locator('[data-metric="cash_equivalents"]')).to_contain_text('25 USD')
    expect(health.locator('[data-metric="short_term_borrowings"]').get_by_test_id('statement-value')).to_have_text('0 USD')
    expect(health).to_contain_text('components are not summed')
    values=section(page,'Valuation');expect(values.get_by_test_id('dossier-statement')).to_have_count(6)
    expect(values.locator('[data-metric="basic_eps"]').get_by_test_id('statement-value')).to_have_text('2 USD per share')
    expect(values.locator('[data-metric="weighted_average_basic_shares"]')).to_contain_text('8 shares')
    expect(values.locator('[data-metric="weighted_average_basic_shares"]')).to_contain_text('not point-in-time shares')
    expect(values.locator('[data-metric="common_shares_outstanding"]')).to_contain_text('As of 2025-12-31')
    expect(values.locator('[data-metric="cover_page_shares_outstanding"]')).to_contain_text('As of 2026-02-10')
    expect(values).to_contain_text('Valuation multiples unavailable')
    eps=values.locator('[data-metric="basic_eps"]');eps.get_by_text('Original statement input and filing',exact=True).click()
    expect(eps).to_contain_text('Filing focus: 2025 / FY. This is not the fact’s fiscal year or period')
    expect(eps).to_contain_text('Original supplied value: 2 USD/shares')
    expect(eps).to_contain_text('Exact publication time is not supplied')


@pytest.mark.parametrize('mode',['forged-value','changed-original','forged-authority','private-field','wrong-symbol','wrong-assessment','duplicate-period'])
def test_one_invalid_receipt_atomically_withholds_all_new_figures(statements,mode):
    page=statements;page.get_by_label('Statement case',exact=True).select_option(mode)
    expect(page.get_by_test_id('dossier-statement-status')).to_contain_text('inputs withheld')
    expect(section(page,'Financial health').get_by_test_id('dossier-statement')).to_have_count(0)
    expect(section(page,'Valuation').get_by_test_id('dossier-statement')).to_have_count(0)
    assert 'private-forged-body-do-not-render' not in page.get_by_test_id('company-dossier').inner_text()
    # Existing v1 declarations remain separately labelled and are not promoted.
    expect(section(page,'Growth').get_by_test_id('dossier-observation')).to_have_count(4)


@pytest.mark.parametrize('mode,value',[('zero-eps','0 USD per share'),('negative-eps','-0.5 USD per share'),('tiny-eps','1.0000e-10 USD per share')])
def test_supported_zero_loss_and_tiny_eps_are_not_missing_or_multiples(statements,mode,value):
    page=statements;page.get_by_label('Statement case',exact=True).select_option(mode)
    panel=section(page,'Valuation');expect(panel.locator('[data-metric="basic_eps"]').get_by_test_id('statement-value')).to_have_text(value)
    expect(panel).to_contain_text('Valuation multiples unavailable')


def test_source_timeout_stays_distinct_and_cannot_restore_prior_statement_values(statements):
    page=statements;section(page,'Financial health');expect(page.get_by_test_id('dossier-statement')).to_have_count(4)
    page.get_by_label('Statement case',exact=True).select_option('source-timeout')
    expect(page.get_by_test_id('dossier-statement-status')).to_contain_text('inputs need data')
    expect(section(page,'Financial health').get_by_test_id('dossier-statement')).to_have_count(0)
    sources=section(page,'Sources');validation=sources.get_by_role('region',name='Statement input validation')
    validation.locator('summary').first.click();expect(validation).to_contain_text('timeout')
    expect(validation).to_contain_text('supplied retrieval unavailable')


def test_cash_only_coverage_neither_invents_eps_nor_calls_loaded_cash_missing(statements):
    page=statements;page.get_by_label('Statement case',exact=True).select_option('cash-only')
    health=section(page,'Financial health');expect(health.get_by_test_id('dossier-statement')).to_have_count(1)
    expect(health.locator('[data-metric="cash_equivalents"]')).to_contain_text('25 USD')
    values=section(page,'Valuation');expect(values.get_by_test_id('dossier-statement')).to_have_count(0)
    expect(values).to_contain_text('supported share/EPS coverage')
    assert 'Unsupported inputs: cash' not in values.inner_text()


@pytest.mark.parametrize('width',[360,768,1440])
def test_explicit_manual_statement_loading_keyboard_layout_and_no_requests(page,width):
    mock_local_apis(page);page.set_viewport_size({'width':width,'height':1000});page.goto('/portfolio?portfolio_tab=research')
    preview=page.get_by_test_id('company-dossier-preview');preview.get_by_role('button',name='Open fictional dossier',exact=True).click()
    expect(preview.get_by_test_id('dossier-statement-status')).to_have_count(0)
    page.wait_for_load_state('networkidle');requests=[];page.on('request',lambda request:requests.append((request.method,request.url)))
    button=preview.get_by_role('button',name='Add fictional statement inputs',exact=True);button.focus();button.press('Enter')
    expect(preview.get_by_test_id('dossier-statement-status')).to_contain_text('partial, bound declarations')
    for name in ['Financial health','Valuation','Sources']:
        nav=preview.get_by_role('button',name=name,exact=True);nav.focus();nav.press('Enter')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    preview.get_by_role('button',name='Valuation',exact=True).click()
    root=Path(os.getenv('QA_ARTIFACT_DIR','/tmp/aiw-statement-admission'));root.mkdir(parents=True,exist_ok=True)
    page.evaluate('document.activeElement?.blur();scrollTo(0,0)');page.screenshot(path=str(root/f'dossier-statements-{width}.png'),full_page=True,animations='disabled')
    preview.get_by_role('button',name='Close fictional dossier',exact=True).click();preview.get_by_role('button',name='Open fictional dossier',exact=True).click()
    expect(preview.get_by_test_id('dossier-statement-status')).to_have_count(0)
    assert requests==[]


def test_statement_fixture_action_and_payload_are_excluded_from_production_build():
    bundle='\n'.join(p.read_text() for p in (ROOT/'dist/assets').glob('*.js'))
    assert bundle and 'Add fictional statement inputs' not in bundle and '0000000001-26-000001' not in bundle
