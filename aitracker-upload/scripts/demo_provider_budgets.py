"""Fictional admission-only demo. No HTTP, credential read, model or hosted state."""
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from mcp_servers.provider_budget import BudgetDenied, Limits, ProviderBudget

class Clock:
    now=0.0
    def read(self):return self.now
    def advance(self,seconds):self.now+=seconds

clock=Clock()
budget=ProviderBudget({'finnhub':Limits(requests_per_window=2),'sec':Limits()},clock=clock.read,sleep=clock.advance)
events=[]
for role in ['quote','research','earnings']:
    try:
        with budget.operation('finnhub').attempt():events.append({'role':role,'outcome':'admitted-without-HTTP'})
    except BudgetDenied as error:events.append({'role':role,'outcome':error.code})
print(json.dumps({'mode':'fictional-admission-demo','httpRequests':0,'events':events,'receipt':budget.snapshot()},indent=2))
