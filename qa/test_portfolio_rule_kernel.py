"""Actual browser execution of the pure client rule adapter. No app/backend requests."""
import json
from pathlib import Path
import subprocess
import pytest
from playwright.sync_api import expect
from test_ui import goto_app, mock_local_apis

ROOT=Path(__file__).resolve().parents[1]


def test_browser_rule_adapter_matches_frozen_server_outputs_without_network_or_state_writes(page):
    bundle=subprocess.check_output(['node','--input-type=module','-e',
        "import {buildSync} from 'esbuild'; process.stdout.write(buildSync({entryPoints:['src/utils/portfolioRuleEvaluation.ts'],bundle:true,platform:'browser',format:'iife',globalName:'PortfolioRules',write:false,target:'es2022'}).outputFiles[0].text);"],cwd=ROOT,text=True)
    requests=[];errors=[]
    page.on('request',lambda request:requests.append(request.url))
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.add_script_tag(content=bundle)
    fixture=json.loads((ROOT/'scripts/fixtures/portfolio-rule-parity.fictional.json').read_text())
    for case in fixture['cases']:
        h=case['holding']
        holding={client:h[server] for client,server in [
            ('averageCost','average_cost'),('purchaseDate','purchase_date'),('lossLimitPct','loss_limit_pct'),
            ('exitRuleType','exit_rule_type'),('exitRuleValue','exit_rule_value'),('brokerAlertPrices','broker_alert_prices'),
            ('brokerAlerts','broker_alerts'),('ruleStages','rule_stages'),('ruleStageState','rule_stage_state')
        ] if server in h}
        result=page.evaluate("""({holding,quote,history,nowMs})=>{
          globalThis.fetch=()=>{throw Error('network forbidden');};
          Date.now=()=>{throw Error('ambient clock forbidden');};
          const before=JSON.stringify({holding,quote,history});
          const result=PortfolioRules.evaluateStoredHoldingRules(holding,quote,history,nowMs);
          if(JSON.stringify({holding,quote,history})!==before)throw Error('input mutation');
          return result;
        }""",{'holding':holding,'quote':case['quote'],'history':case['history'],'nowMs':case['nowMs']})
        assert result==case['expected'],case['id']
    for price,target,direction in [(100,103,'above'),(103,100,'below'),(80,82.4,'above'),(82.4,80,'below')]:
        result=page.evaluate("""({price,target,direction,nowMs})=>PortfolioRules.evaluateStoredHoldingRules(
          {averageCost:100,brokerAlerts:[{price:target,direction}]},{price},{points:[]},nowMs)""",
          {'price':price,'target':target,'direction':direction,'nowMs':fixture['cases'][0]['nowMs']})
        assert result['state']=='near'
    assert requests==[] and errors==[]


def test_strict_browser_review_withholds_bad_configuration_and_partial_history(page):
    bundle=subprocess.check_output(['node','--input-type=module','-e',
        "import {buildSync} from 'esbuild'; process.stdout.write(buildSync({entryPoints:['src/utils/portfolioRuleEvaluation.ts'],bundle:true,platform:'browser',format:'iife',globalName:'PortfolioRules',write:false,target:'es2022'}).outputFiles[0].text);"],cwd=ROOT,text=True)
    page.add_script_tag(content=bundle)
    result=page.evaluate("""()=>{
      globalThis.fetch=()=>{throw Error('network forbidden');};
      Date.now=()=>{throw Error('ambient clock forbidden');};
      const at=Date.parse('2026-11-14T12:00:00Z'), quote={price:100};
      const run=(holding,history={})=>PortfolioRules.reviewStoredHoldingRules(holding,quote,history,at);
      const holding={symbol:'FICT',purchaseDate:'2026-11-01',exitRuleType:'trailing_stop',exitRuleValue:10};
      const history={points:[{date:'2026-11-01',price:100},{date:'2026-11-02',price:140}]};
      const before=JSON.stringify({holding,history});
      const partial=run(holding,history);
      const complete=run(holding,{...history,points:history.points.map(p=>({...p,availableAt:p.date+'T21:00:00Z'})),
        coverage:{status:'complete',startDate:'2026-11-01',endDate:'2026-11-14'},provenance:{
          contractVersion:'retained-rule-history-v1',symbol:'FICT',currency:'USD',priceBasis:'raw-close',sourceMode:'retained-declarations',
          retrievedAt:'2026-11-14T12:00:00Z',corporateActions:'declared-none',expectedSessionDates:history.points.map(p=>p.date)}});
      if(JSON.stringify({holding,history})!==before)throw Error('input mutation');
      return {invalid:run({averageCost:100,lossLimitPct:100}),partial,complete};
    }""")
    assert result['invalid']['state']=='invalid-config'
    assert result['partial']['state']=='incomplete'
    assert result['partial']['rules']==[]
    assert result['complete']['state']=='breached'
    assert result['complete']['nearest']['target']==126
    assert result['complete']['stageStateDirty'] is False


@pytest.mark.parametrize('rule_counts,expected_count',[
    ({'total':3,'evaluated':0,'invalidConfig':1,'incomplete':1,'noData':1,'noRule':0}, '0'),
    ({'total':3,'evaluated':3,'invalidConfig':1,'incomplete':0,'noData':0,'noRule':0}, 'Unknown'),
    ({'total':3,'noData':0,'noRule':0}, 'Unknown'),
])
def test_position_gate_withholds_readiness_for_missing_or_inconsistent_rule_reviews(page,rule_counts,expected_count):
    mock_local_apis(page)
    writes=[]
    page.on('request',lambda request:writes.append(request.url) if request.method in ('POST','PATCH','PUT','DELETE') else None)
    payload={'ok':True,'rules':{'breached':0,'near':0,**rule_counts,'configurationIssues':[
            {'symbol':'FICT','issues':['Complete history coverage is required.']}]},'actionItems':[],
        'portfolio':{'holdings':3,'currentValue':300,'netContributed':300,'cashFlowPnl':0,'concentrationTop3Pct':100,
            'quoteCoverage':{'status':'complete','coveragePct':100}},
        'signalGate':{'eligible':1,'experimental':0},
        'forecast':{'verified':100,'pending':0,'due':0,'remaining':0,'gate':'ready','independentVerified':100,'independent5D':50,'independent20D':50}}
    page.route('**/api/decision-center**',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(payload)))
    goto_app(page)
    center=page.get_by_test_id('decision-impact-center')
    expect(center.get_by_test_id('pre-trade-gate')).to_contain_text('Portfolio review is incomplete')
    expect(center.get_by_test_id('pre-trade-gate')).to_contain_text(expected_count + '/3 holdings have mathematically evaluated rules')
    expect(center).to_contain_text('Rules evaluated')
    expect(center.get_by_text('Action now',exact=True).locator('..')).to_contain_text('Unknown')
    expect(center).to_contain_text('Review coverage needs attention')
    center.get_by_text('Rule configuration and coverage issues',exact=True).click()
    expect(center.get_by_test_id('decision-rule-issues')).to_contain_text('FICT: Complete history coverage is required.')
    assert writes==[]
