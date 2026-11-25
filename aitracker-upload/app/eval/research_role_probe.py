"""Single fictional case for bounded research agents; never a financial benchmark."""
from app.agents.research_role_agent import (
    PROVIDER_ROLES, FictionalResearchRoleModel, ResearchRoleAgent, configured_research_role_model,
)
from app.agents.research_role_review import research_role_review
from app.eval.council_benchmark import load_suite, _telemetry, _observed_total


def run_probe(*, case_id=None, live=False):
    if live and case_id is None:
        raise ValueError("One explicit fictional case is required")
    suite, digest = load_suite()
    chosen = case_id or "growth-with-cash-burn"
    case = next((case for case in suite.cases if case.case_id == chosen), None)
    if case is None:
        raise ValueError("Unknown fictional case")
    baseline = research_role_review(case.raw)
    report = {"contract_version": "research-role-agent-probe-v1", "fictional_only": True,
        "fixture_sha256": digest, "case_id": chosen, "live_requested": live,
        "status": "offline-fixture", "baseline": baseline, "agent": None, "telemetry": None,
        "financial_usefulness_established": False, "forecast_validity_established": False,
        "grants_decision_eligibility": False}
    # Offline path never asks the provider factory for configuration.
    model = configured_research_role_model() if live else FictionalResearchRoleModel()
    if model is None:
        report["status"] = "development-configuration-unavailable"
        return report
    result = ResearchRoleAgent(model).run(case.raw)
    report["agent"] = result
    if live:
        telemetry = _telemetry(model.router)
        inverse = {provider: role for role, provider in PROVIDER_ROLES.items()}
        for receipt in telemetry["receipts"]:
            receipt["provider_role"] = receipt["role"]
            receipt["role"] = inverse.get(receipt["role"])
        telemetry["routes"] = {role: {**telemetry["routes"][provider], "provider_role": provider}
                               for role, provider in PROVIDER_ROLES.items()}
        report["telemetry"] = telemetry
        report["status"] = "live-trial-complete" if result["status"] == "complete" else "candidate-unavailable"
    return report


def render_probe(report):
    result = report["agent"]
    lines = ["# Fictional research-role agent probe", "", f"Status: {report['status']}",
             f"Case: {report['case_id']}", "", "| Role | Input status | Selected review codes | Citations |",
             "| --- | --- | --- | --- |"]
    for role in PROVIDER_ROLES:
        value = result["roles"].get(role) if result else None
        lines.append("| " + " | ".join([role, value["input_status"] if value else "not returned",
            ", ".join(value["review_codes"]) if value else "not returned",
            ", ".join(value["evidence_ids"]) if value and value["evidence_ids"] else "none"]) + " |")
    if result:
        usage = result["usage"]
        lines += ["", f"Protocol: {result['status']} · model calls {usage['model_calls']}/6 · loaded tools {usage['tool_calls']}/3 · provider attempts {usage['provider_requests']}."]
    if report["telemetry"] is not None:
        lines += ["", "| Research role | Provider alias | Model | Attempts | Latency sum (ms) | Reported cost (USD) |",
                  "| --- | --- | --- | --- | --- | --- |"]
        for role in PROVIDER_ROLES:
            route = report["telemetry"]["routes"][role]
            receipts = [row for row in report["telemetry"]["receipts"] if row["role"] == role]
            latency = _observed_total([row["latency_ms"] for row in receipts])
            cost = _observed_total([row["reported_cost_usd"] for row in receipts])
            lines.append("| " + " | ".join([role, route["provider_role"], route["model"], str(len(receipts)),
                "unknown" if latency is None else str(latency), "unknown" if cost is None else str(cost)]) + " |")
        lines += ["", "Missing usage/cost stays unknown. Reported cost is not a verified bill."]
    lines += ["", "Selections are not exhaustive. Financial usefulness and source authenticity remain unestablished.",
              "No decision eligibility, allocation change, source acquisition or messaging authority is granted.", ""]
    return "\n".join(lines)
