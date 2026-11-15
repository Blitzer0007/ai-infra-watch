"""Actual annual producer/admission/cross-scope review/UI over invented inputs only."""
import os
from pathlib import Path
import subprocess
import pytest
from playwright.sync_api import expect
from test_ui import mock_local_apis

ROOT=Path(__file__).resolve().parents[1]
PERIOD='2025-01-01>2025-12-31'


@pytest.fixture(scope='module')
def annual_bundle():
    script="""
import {buildSync} from 'esbuild';
const contents=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import CompanyDossier from './src/components/portfolio/CompanyDossier';
import {fictionalDossierRequest,fictionalDossierStatements,fictionalDossierOperations} from './src/components/portfolio/CompanyDossierPreview';
import {buildSecOperatingObservations,buildSecStatementObservations} from './shared/secStatementObservations';
function Harness(){const [mode,setMode]=useState('valid');const request=structuredClone(fictionalDossierRequest),core=fictionalDossierStatements(),p=fictionalDossierOperations(),facts=p.source.facts.facts['us-gaap'];
if(mode==='tampered')p.entries[0].receipt.observations[0].value=999;
if(mode==='private')p.private='private-payload-never-render';
if(mode==='income-conflict')facts.OperatingIncomeLoss.units.USD[0].val=991;
if(mode==='cash-conflict')facts.NetCashProvidedByUsedInOperatingActivities.units.USD[0].val=992;
if(mode==='revenue-conflict')facts.Revenues={units:{USD:[{...facts.RevenueFromContractWithCustomerExcludingAssessedTax.units.USD[0],val:993}]}};
if(mode==='filing-conflict')for(const c of Object.values(facts))for(const r of c.units.USD)r.filed='2026-03-01';
if(mode==='alias-overlap')facts.RevenueFromContractWithCustomerExcludingAssessedTax.units.USD[0].val=141;
if(mode==='alias-duplicates')facts.Revenues=structuredClone(facts.RevenueFromContractWithCustomerExcludingAssessedTax);
if(mode==='zero-income')facts.NetIncomeLoss.units.USD[0].val=0;
if(mode==='no-data')p.source.facts.facts={};
if(mode==='new-assessment'){p.assessedAt=request.assessedAt=core.assessedAt='2026-11-14T12:00:01Z';core.entries=core.entries.map(e=>({...e,receipt:buildSecStatementObservations({symbol:core.symbol,expectedCik:core.expectedCik,assessedAt:core.assessedAt,retrievedAt:core.retrievedAt,source:core.source,period:e.period})}));}
if(mode==='scope-conflict'){core.expectedCik='0000000002';core.source.facts.cik=2;core.entries=core.entries.map(e=>({...e,receipt:buildSecStatementObservations({symbol:core.symbol,expectedCik:core.expectedCik,assessedAt:core.assessedAt,retrievedAt:core.retrievedAt,source:core.source,period:e.period})}));}
if(mode==='timeout'){p.source={status:'timeout'};p.retrievedAt=null;}
if(!['tampered','private','none','valid'].includes(mode))p.entries=p.entries.map(e=>({...e,receipt:buildSecOperatingObservations({symbol:p.symbol,expectedCik:p.expectedCik,assessedAt:p.assessedAt,retrievedAt:p.retrievedAt,source:p.source,period:e.period})}));
return <><label>Annual case<select aria-label='Annual case' value={mode} onChange={e=>setMode(e.target.value)}>{['valid','none','tampered','private','income-conflict','cash-conflict','revenue-conflict','filing-conflict','alias-overlap','alias-duplicates','zero-income','timeout','no-data','new-assessment','scope-conflict'].map(s=><option key={s}>{s}</option>)}</select></label><CompanyDossier symbol='FICT' request={mode==='scope-conflict'?null:request} statements={core} operations={mode==='none'?null:p} fictional/></>}
createRoot(document.getElementById('root')).render(<Harness/>);`;
process.stdout.write(buildSync({stdin:{contents,resolveDir:process.cwd(),loader:'tsx'},bundle:true,jsx:'automatic',platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},write:false}).outputFiles[0].text);
"""
    return subprocess.check_output(['node','--input-type=module','-e',script],cwd=ROOT,text=True,env={'PATH':os.environ.get('PATH','')})


@pytest.fixture
def annual(page,annual_bundle):
    requests=[];errors=[];page.on('request',lambda r:requests.append(r.url));page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content('<div id="root"></div>')
    page.evaluate("""() => {window.fetch=()=>{throw Error('Annual fetch forbidden')};window.WebSocket=class{constructor(){throw Error('Annual socket forbidden')}};window.setInterval=()=>{throw Error('Annual polling forbidden')};Storage.prototype.setItem=()=>{throw Error('Annual write forbidden')};Storage.prototype.getItem=()=>{throw Error('Annual read forbidden')};window.Notification=class{constructor(){throw Error('Annual send forbidden')}};}""")
    page.add_script_tag(content=annual_bundle);yield page
    assert requests==[] and errors==[]


def section(page,name):
    page.get_by_test_id('company-dossier').get_by_role('button',name=name,exact=True).click()
    return page.get_by_test_id('dossier-section')


def inspect(page,name='Growth'):
    panel=section(page,name);annual=panel.get_by_test_id('dossier-operating-panel')
    if not annual.evaluate('(node)=>node.open'):annual.locator('summary').first.click()
    annual.get_by_label('Annual period to inspect',exact=True).select_option(PERIOD)
    return annual


def test_explicit_period_selection_shows_loss_and_keeps_reading_context_across_sections(annual):
    page=annual;panel=section(page,'Growth');extra=panel.get_by_test_id('dossier-operating-panel')
    assert not extra.evaluate('(node)=>node.open');extra.locator('summary').first.focus();extra.locator('summary').first.press('Enter')
    expect(extra.get_by_label('Annual period to inspect',exact=True)).to_have_value('');expect(extra.get_by_test_id('dossier-operating-row')).to_have_count(0)
    extra.get_by_label('Annual period to inspect',exact=True).select_option(PERIOD)
    expect(extra.get_by_test_id('dossier-operating-row')).to_have_count(3)
    expect(extra.locator('[data-metric="net_income_loss"]').get_by_test_id('statement-value')).to_have_text('-8 USD')
    extra.locator('[data-metric="net_income_loss"]').get_by_text('Original statement input and filing',exact=True).click();expect(extra).to_contain_text('us-gaap:NetIncomeLoss')
    health=section(page,'Financial health').get_by_test_id('dossier-operating-panel');expect(health.get_by_label('Annual period to inspect',exact=True)).to_have_value(PERIOD)
    if not health.evaluate('(node)=>node.open'):health.locator('summary').first.click()
    expect(health.get_by_test_id('dossier-operating-row')).to_have_count(2);expect(health).to_contain_text('context unverified')
    expect(health).to_contain_text('2 matching source cards folded');expect(section(page,'Valuation')).to_contain_text('Valuation multiples unavailable')


@pytest.mark.parametrize('mode,metric,legacy_metric', [('income-conflict','operating_income_loss','operating_margin_pct'),('cash-conflict','operating_cash_flow','free_cash_flow_usd'),('revenue-conflict','revenues_declared','revenue_growth_pct')])
def test_conflicting_fields_and_dependent_legacy_calculations_are_withheld_everywhere(annual,mode,metric,legacy_metric):
    page=annual;page.get_by_label('Annual case',exact=True).select_option(mode);inspect(page,'Financial health' if mode=='cash-conflict' else 'Growth')
    expect(page.get_by_test_id('dossier-operating-status')).to_contain_text('sources conflict')
    expect(page.get_by_test_id('dossier-operating-panel').locator(f'[data-metric="{metric}"]')).to_have_count(0)
    expect(page.get_by_test_id('dossier-section').locator(f'[data-testid="dossier-observation"][data-metric="{legacy_metric}"]')).to_have_count(0)
    sources=section(page,'Sources').get_by_role('region',name='Annual input sources')
    for summary in sources.locator('summary').all():summary.click()
    assert not any(value in sources.inner_text() for value in ['991 USD','992 USD','993 USD'])


def test_filing_conflicts_withdraw_core_figures_and_do_not_leak_values_through_sources(annual):
    page=annual;page.get_by_label('Annual case',exact=True).select_option('filing-conflict')
    expect(page.get_by_test_id('dossier-statement-status')).to_contain_text('inputs withheld')
    expect(section(page,'Valuation').get_by_test_id('dossier-statement')).to_have_count(0)
    expect(section(page,'Growth').get_by_test_id('dossier-observation')).to_have_count(0)
    sources=section(page,'Sources').get_by_role('region',name='Annual input sources')
    for summary in sources.locator('summary').all():summary.click()
    expect(sources.get_by_test_id('dossier-operating-source-row')).to_have_count(0)


def test_cross_profile_issuer_scope_cannot_be_mixed_without_a_legacy_reference(annual):
    page=annual;page.get_by_label('Annual case',exact=True).select_option('scope-conflict')
    expect(page.get_by_test_id('dossier-operating-status')).to_contain_text('sources conflict')
    expect(section(page,'Valuation').get_by_test_id('dossier-statement')).to_have_count(0)
    panel=inspect(page);expect(panel.get_by_test_id('dossier-operating-row')).to_have_count(0)
    expect(panel).to_contain_text('issuer or assessment scopes disagree')


def test_loaded_missing_annual_coverage_does_not_offer_an_impossible_selection_or_empty_history(annual):
    page=annual;page.get_by_label('Annual case',exact=True).select_option('no-data');panel=section(page,'Growth').get_by_test_id('dossier-operating-panel');panel.locator('summary').first.click()
    expect(panel.get_by_label('Annual period to inspect',exact=True)).to_have_count(0)
    expect(panel).to_contain_text('not an empty financial history');expect(page.get_by_test_id('dossier-section').get_by_test_id('dossier-observation')).to_have_count(4)


@pytest.mark.parametrize('mode',['tampered','private'])
def test_invalid_annual_packets_do_not_replace_other_independently_loaded_scopes(annual,mode):
    page=annual;page.get_by_label('Annual case',exact=True).select_option(mode)
    expect(page.get_by_test_id('dossier-operating-status')).to_contain_text('Annual inputs withheld')
    expect(section(page,'Growth').get_by_test_id('dossier-observation')).to_have_count(4)
    expect(page.get_by_test_id('dossier-operating-row')).to_have_count(0)
    assert 'private-payload-never-render' not in page.get_by_test_id('company-dossier').inner_text()


def test_aliases_stay_distinct_and_matching_source_cards_are_folded_without_corroboration_claims(annual):
    page=annual;page.get_by_label('Annual case',exact=True).select_option('alias-overlap');panel=inspect(page)
    expect(panel.locator('[data-metric="revenue_contract_excluding_tax"]')).to_contain_text('141 USD')
    expect(panel).to_contain_text('not added or interchanged');expect(section(page,'Growth').locator('[data-metric="revenue_growth_pct"]')).to_contain_text('20%')
    page.get_by_label('Annual case',exact=True).select_option('alias-duplicates');panel=inspect(page)
    expect(panel).to_contain_text('4 matching source cards folded');expect(panel.locator('[data-metric="revenues_declared"]')).to_have_count(0)
    expect(panel).to_contain_text('not independent corroboration')


def test_zero_failure_and_new_assessment_cannot_leave_stale_annual_figures(annual):
    page=annual;inspect(page);page.get_by_label('Annual case',exact=True).select_option('zero-income')
    expect(page.get_by_test_id('dossier-operating-panel').locator('[data-metric="net_income_loss"]')).to_contain_text('0 USD')
    page.get_by_label('Annual case',exact=True).select_option('new-assessment');panel=page.get_by_test_id('dossier-operating-panel');expect(panel.get_by_label('Annual period to inspect',exact=True)).to_have_value('');expect(panel.get_by_test_id('dossier-operating-row')).to_have_count(0)
    panel.get_by_label('Annual period to inspect',exact=True).select_option(PERIOD);page.get_by_label('Annual case',exact=True).select_option('timeout')
    expect(page.get_by_test_id('dossier-operating-status')).to_contain_text('need data');expect(page.get_by_test_id('dossier-operating-row')).to_have_count(0)
    sources=section(page,'Sources').get_by_role('region',name='Annual input sources');sources.locator('summary').first.click();expect(sources).to_contain_text('timeout');expect(sources).to_contain_text('retrieval: unavailable')


@pytest.mark.parametrize('width',[360,768,1440])
def test_manual_fictional_load_period_keyboard_layout_reset_and_zero_requests(page,width):
    mock_local_apis(page);page.set_viewport_size({'width':width,'height':1000});page.goto('/portfolio?portfolio_tab=research')
    preview=page.get_by_test_id('company-dossier-preview');preview.get_by_role('button',name='Open fictional dossier',exact=True).click();expect(preview.get_by_test_id('dossier-operating-status')).to_have_count(0)
    page.wait_for_load_state('networkidle');requests=[];page.on('request',lambda r:requests.append(r.url));preview.get_by_role('button',name='Add fictional statement inputs',exact=True).click()
    extra=inspect(page);extra.get_by_label('Annual period to inspect',exact=True).focus();extra.get_by_label('Annual period to inspect',exact=True).press('ArrowDown');extra.get_by_label('Annual period to inspect',exact=True).press('ArrowUp')
    expect(extra.get_by_label('Annual period to inspect',exact=True)).to_have_value(PERIOD)
    for name in ['Financial health','Growth']:
        section(page,name);panel=page.get_by_test_id('dossier-operating-panel')
        if not panel.evaluate('(node)=>node.open'):panel.locator('summary').first.click()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    artifacts=Path(os.getenv('QA_ARTIFACT_DIR','/tmp/aiw-operating-ui'));artifacts.mkdir(parents=True,exist_ok=True)
    page.evaluate('document.activeElement?.blur();scrollTo(0,0)')
    page.screenshot(path=str(artifacts/f'dossier-operating-{width}.png'),full_page=True,animations='disabled')
    preview.get_by_role('button',name='Close fictional dossier',exact=True).click();preview.get_by_role('button',name='Open fictional dossier',exact=True).click();expect(preview.get_by_test_id('dossier-operating-status')).to_have_count(0)
    assert requests==[]


def test_annual_fictional_input_payload_is_excluded_from_production_assets():
    bundle='\n'.join(p.read_text() for p in (ROOT/'dist/assets').glob('*.js'))
    assert bundle and 'Add fictional statement inputs' not in bundle and '0000000001-26-000001' not in bundle
