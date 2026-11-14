"""Actual browser execution of the pure client rule adapter. No app/backend requests."""
import json
from pathlib import Path
import subprocess

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
