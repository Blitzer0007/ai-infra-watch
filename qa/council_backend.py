"""QA-only loopback server; actual council orchestration, fake model, no provider config."""
import importlib.util
from pathlib import Path
from app.agents import council_http
from app.agents.portfolio_council import FictionalCouncilModel
from app.jev import council
from app.jev.client import JevEvaluation,JevAnswer

spec=importlib.util.spec_from_file_location('council_ui_backend',Path(__file__).resolve().parents[1]/'api/agent-python.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
def forbidden(*_a,**_k):raise RuntimeError('General planner forbidden in council QA')
module.get_toolbox=forbidden;module.AutonomousMCPAgent=forbidden
class MockNvidia(FictionalCouncilModel):
    mode='nvidia'  # Exercises loaded/JEV UI; zero HTTP requests, never a live acceptance claim.
    def complete(self,role,messages,**kwargs):
        if any(key in '\n'.join(m['content'] for m in messages) for key in ['"accession"','"inputs"','"cik"']):
            raise AssertionError('Original filing receipts must not enter model prompts')
        return super().complete(role,messages,**kwargs)
class MockJev:
    def evaluate(self,**_kwargs):return JevEvaluation(answers={'coverage':JevAnswer(type='choice',choice='reviewable'),'next_check':JevAnswer(type='choice',choice='wait_for_outcome')},input_tokens=123)
real_assess=council.assess_council_summary
council.assess_council_summary=lambda state,run_id:real_assess(state,run_id,client=MockJev())
council_http.loaded_model=lambda:MockNvidia()
app=module.app
