"""Actual browser admission/state/transport tests using only invented observations."""
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_real_browser_quote_alert_path_has_no_transport_or_notification_activity(page):
    # A fulfilled loopback document establishes a normal storage origin, with no backend.
    page.route('**/__quote-alert-offline-test', lambda route: route.fulfill(status=200, content_type='text/html', body='<title>Fictional quote-alert test</title>'))
    page.goto('/__quote-alert-offline-test')
    bundle = subprocess.check_output(['node', '--input-type=module', '-e', """
import {buildSync} from 'esbuild';
process.stdout.write(buildSync({stdin:{contents:`export {evaluateQuoteAlerts,ALERT_EVENTS_KEY,ALERT_STATE_KEY} from './src/utils/alertEngine'; export {admitBrowserAlertQuote,QUOTE_ALERT_STATE_KEY} from './src/utils/quoteAlertEvaluation'; export {fetchLiveQuote} from './src/utils';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'browser',format:'iife',globalName:'QuoteAlerts',write:false}).outputFiles[0].text);
"""], cwd=ROOT, text=True)
    requests = []; errors = []
    page.on('request', lambda request: requests.append((request.method, request.url)))
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_script_tag(content=bundle)
    result = page.evaluate("""async () => {
      const now=Date.parse('2026-11-13T18:00:00Z');
      const cfg={alerts:[{symbol:'FICT',type:'above',targetPrice:105,active:true}],largeMoveEnabled:true,largeMovePct:5};
      const q=(price,minute,extra={})=>({price,changePct:0,returnedSymbol:'FICT',sourceMode:'live',adjustedBasis:'raw',provider:'yahoo',currency:'USD',marketTimePrecision:'instant',isMarketSessionOpen:true,status:'valid',marketTime:new Date(now+minute*60000).toISOString(),retrievedAt:new Date(now+minute*60000).toISOString(),...extra});
      window.fetch=()=>{throw Error('network forbidden');};
      window.Notification=class {constructor(){throw Error('notification forbidden');}};
      Date.now=()=>{throw Error('ambient clock forbidden');};
      localStorage.setItem(QuoteAlerts.ALERT_STATE_KEY,JSON.stringify({'catalyst:fictional':true}));
      const detect=(price,minute,extra={})=>QuoteAlerts.evaluateQuoteAlerts(cfg,{FICT:q(price,minute,extra)},false,now+minute*60000);
      const invalid=detect(110,0,{simulated:true});
      const baseline=detect(100,1);
      const crossing=detect(110,2);
      const before=localStorage.getItem(QuoteAlerts.QUOTE_ALERT_STATE_KEY);
      const stale=detect(100,3,{stale:true});
      const unchanged=before===localStorage.getItem(QuoteAlerts.QUOTE_ALERT_STATE_KEY);
      const duplicate=detect(110,4);
      const rebound=QuoteAlerts.admitBrowserAlertQuote('FICT',q(110,4,{returnedSymbol:'OTHER'}),now+240000).eligible;
      // Exercise the actual source-fetch adapter with a fake in-memory response only.
      window.fetch=async()=>new Response(JSON.stringify(q(110,4,{stale:'false',independentObservations:[null]})));
      const loaded=await QuoteAlerts.fetchLiveQuote('FICT','');
      const malformedRejected=!QuoteAlerts.admitBrowserAlertQuote('FICT',loaded,now+240000).eligible;
      window.fetch=()=>{throw Error('network forbidden');};
      const history=JSON.parse(localStorage.getItem(QuoteAlerts.ALERT_EVENTS_KEY));
      return {counts:[invalid.length,baseline.length,crossing.length,stale.length,duplicate.length],unchanged,rebound,malformedRejected,history:history.map(e=>e.type),legacy:localStorage.getItem(QuoteAlerts.ALERT_STATE_KEY)};
    }""")
    assert result == {'counts': [0, 0, 1, 0, 0], 'unchanged': True, 'rebound': False, 'malformedRejected': True, 'history': ['price'], 'legacy': '{"catalyst:fictional":true}'}
    assert requests == [] and errors == []
