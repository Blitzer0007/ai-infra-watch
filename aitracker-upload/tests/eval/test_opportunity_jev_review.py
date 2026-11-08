"""No-network billing boundary and deterministic gates for on-demand coverage review."""
from copy import deepcopy
from app.jev.assess import assess
from app.jev.client import JevAnswer, JevEvaluation


def summary(**overrides):
    return {"schemaVersion":1,"symbol":"FICT","ruleVersion":"reported-growth-cash-flow-v1-experimental","dataEligibility":"insufficient","status":"needs-data","asOf":None,"missingInputCount":3,"evidenceReferenceCount":1,"supportingReasonCount":0,"adverseReasonCount":0,**overrides}


class Client:
    def __init__(self, choice="monitor", context="bounded_review"):
        self.calls=[]
        self.choice=choice
        self.context=context
    def evaluate(self, **kwargs):
        self.calls.append(kwargs)
        return JevEvaluation(answers={"next_check":JevAnswer(type="choice",choice=self.choice),"context":JevAnswer(type="choice",choice=self.context)},model="fixture-model",input_tokens=99)


def test_one_provider_call_asks_two_questions_without_private_metadata():
    client=Client();state=summary();before=deepcopy(state)
    result=assess("opportunities",state,client)
    assert result.usable and len(client.calls)==1
    assert set(client.calls[0]["questions"])=={"next_check","context"}
    assert result.input_tokens==99
    assert state==before


def test_missing_and_conflicting_inputs_cannot_be_upgraded_by_model():
    for eligibility,expected in [("insufficient","insufficient"),("conflicting","conflicting")]:
        result=assess("opportunities",summary(dataEligibility=eligibility),Client())
        assert result.answers["context"].choice==expected
        assert result.answers["next_check"].choice==("resolve_conflicts" if eligibility=="conflicting" else "gather_evidence")


def test_eligible_input_still_requires_references_and_produces_only_advisory_output():
    for count,expected in [(0,"insufficient"),(2,"bounded_review")]:
        state=summary(dataEligibility="eligible",status="research-candidate",missingInputCount=0,evidenceReferenceCount=count,asOf="2026-01-01T00:00:00Z")
        result=assess("opportunities",state,Client())
        assert result.answers["context"].choice==expected


def test_malformed_and_private_states_never_reach_provider():
    cases=[None,{},summary(token="fixture-private"),summary(notes="private thesis"),summary(symbol="invalid/path"),summary(missingInputCount=True),summary(missingInputCount=101),summary(asOf="2099-01-01T00:00:00Z"),summary(asOf="2026-01-01"),summary(asOf="2026-01-01T00:00:00."+"0"*8000+"Z"),summary(dataEligibility="eligible"),summary(dataEligibility="eligible",status="research-candidate",missingInputCount=0),summary(ruleVersion="unknown")]
    for state in cases:
        client=Client();result=assess("opportunities",state,client)
        assert not result.usable and client.calls==[]
        assert "fixture-private" not in result.error


def test_invalid_model_choices_are_not_silently_accepted():
    result=assess("opportunities",summary(),Client(choice="buy_now"))
    assert not result.usable and "invalid typed answers" in result.error
