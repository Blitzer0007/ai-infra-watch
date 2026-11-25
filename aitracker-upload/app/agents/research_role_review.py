"""Deterministic research-role baseline over conditional declared inputs only."""
from app.agents.council_admission import evaluate, parse_request

AUTHORITY = ("source_authenticity_verified", "forecast_validity_established",
             "grants_decision_eligibility", "changes_allocation", "sends_messages")


def research_role_review(raw: bytes):
    """No LLM, source acquisition, settings, persistence or delivery capability.

    The Company/Catalyst/Daily views share one frozen admission result. Daily
    means a single-symbol checklist, not a portfolio or full-day assessment.
    """
    packet, _, _ = parse_request(raw)
    admission = evaluate(raw)
    usable = set(admission["quality"]["usable_ids"])
    rows = [row for row in packet.evidence if row.evidence_id in usable]
    missing = admission["quality"]["missing_families"]
    company = [row.evidence_id for row in rows if row.family in ("financial", "risk")]
    catalyst = [row.evidence_id for row in rows if row.family == "catalyst"]
    codes = ["VERIFY_ORIGINAL_FILINGS"]
    if "financial" in missing:
        codes.append("FINANCIAL_INPUTS_MISSING")
    if "risk" in missing:
        codes.append("RISK_INPUTS_MISSING")
    for row in rows:
        if row.metric == "free_cash_flow_usd":
            code = ("REVIEW_NEGATIVE_CASH_FLOW" if row.value < 0 else
                    "REVIEW_ZERO_CASH_FLOW" if row.value == 0 else "REVIEW_CASH_FLOW_CONTEXT")
            if code not in codes:
                codes.append(code)
    if any(row.metric == "revenue_growth_pct" for row in rows):
        codes.append("REVIEW_GROWTH_CONTEXT")
    if any(row.family == "risk" for row in rows):
        codes.append("REVIEW_LEVERAGE_CONTEXT")
    daily = ["CHECK_SOURCE_AUTHENTICITY", "RECORD_REVIEW_QUESTIONS"]
    daily.extend({"market": "REFRESH_MARKET_EVIDENCE", "financial": "FILL_FINANCIAL_COVERAGE",
                  "catalyst": "FILL_CATALYST_COVERAGE", "risk": "FILL_RISK_COVERAGE"}[family]
                 for family in missing)
    if admission["quality"]["conflicting_ids"]:
        daily.append("RECONCILE_CONFLICTING_INPUTS")
    return {
        "contract_version": "research-role-review-v1", "rules_version": "loaded-review-roles-v1",
        "mode": "deterministic", "run_id": packet.run_id,
        "request_sha256": admission["request_sha256"], "symbol": packet.symbol,
        "assessed_at": packet.assessed_at, "horizon_months": packet.horizon_months,
        "status": admission["status"],
        "roles": {
            "company": {"status": "needs-data" if any(f in missing for f in ("financial", "risk")) else "conditional",
                        "evidence_ids": company, "review_codes": codes},
            "catalyst": {"status": "conditional" if catalyst else "needs-data", "evidence_ids": catalyst,
                         "review_codes": ["VERIFY_EVENT_SOURCE", "REVIEW_EVENT_TIMING" if catalyst else "EVENT_CONFIRMATION_REQUIRED"]},
            "daily": {"status": admission["status"], "evidence_ids": [row.evidence_id for row in rows], "review_codes": daily},
        },
        "policy": {"read_only": True, "max_evidence": 8, "max_review_codes": 7,
                   "model_calls": 0, "provider_requests": 0, "tool_calls": 0},
        **dict.fromkeys(AUTHORITY, False),
    }
