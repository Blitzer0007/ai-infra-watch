"""Explicit development-only fictional-evidence probe; stdout contains no prompts/keys."""
import argparse
import json
from datetime import datetime, timezone
from app.agents.council_model import configured_role_model
from app.agents.portfolio_council import PortfolioCouncil, FictionalCouncilModel, fictional_packet

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--live',action='store_true',help='Use explicitly configured development models, at most six inference calls')
    args=parser.parse_args()
    packet=fictional_packet('model-probe',datetime.now(timezone.utc).isoformat())
    baseline=PortfolioCouncil(FictionalCouncilModel()).run(packet)
    output={'contract_version':'council-model-probe-v1','evidence':'fictional-only','live_requested':args.live,
            'baseline_kind':'deterministic-protocol-fixture','baseline':{'status':baseline['status'],'disposition':baseline['disposition']},'status':'offline-only','routes':None,'receipts':[],
            'grounding_usefulness_established':False,'forecast_validity_established':False,'grants_decision_eligibility':False}
    if args.live:
        model=configured_role_model()
        if model is None:output['status']='development-configuration-unavailable'
        else:
            result=PortfolioCouncil(model).run(packet)
            output.update(status=result['status'],routes=model.manifest,receipts=model.receipts,
                          interpretation={'disposition':result['disposition'],'termination_reason':result['termination_reason'],'usage':result['usage']})
    print(json.dumps(output,sort_keys=True,allow_nan=False))

if __name__=='__main__':main()
