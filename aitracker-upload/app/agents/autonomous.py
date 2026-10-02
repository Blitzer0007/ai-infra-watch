"""Autonomous MCP investigation agent.

The agent runs a bounded discover -> plan/act -> observe loop.
A real LLM chooses the next tool from the live MCP catalog and prior outputs.
Every proposed call is schema-validated before execution. The loop has a hard
step bound, records a trajectory, and falls back to the deterministic keyword
router when no LLM planner is available.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Any

from app.agents.router import extract_symbols, keyword_router
from app.agents.schemas import ToolCallRecord
from app.agents.trajectory import AgentTrajectory, Step, llm_call, tool_call
from app.llm.client import LLMClient
from app.mcp_client import MCPToolbox, ToolInfo
from app.mcp_client.client import MCPClientError
from app.config import settings
from app.jev.client import JevClient, JevDecision
from app.jev.assess import assess
from app.agents.evidence_quality import citation_coverage, deduplicate_evidence, detect_conflicts, enrich_calls
from app.assertions.semantic import claim_grounding_score


@dataclass
class AutonomousResult:
    question: str
    summary: str
    calls: list[ToolCallRecord]
    discovered: list[str]
    trajectory: AgentTrajectory
    jev: dict[str, Any] = field(default_factory=dict)
    hallucination: dict[str, Any] = field(default_factory=dict)
    answer_source: str = "agent-llm"
    error: str = ""
    resolution: str = "completed"

    def ok(self) -> bool:
        return bool(self.summary) and any(c.ok for c in self.calls)

    def degraded(self) -> bool:
        return self.ok() and (bool(self.error) or any(not c.ok for c in self.calls))


def _required_params(tool: ToolInfo) -> list[str]:
    schema = tool.input_schema or {}
    required = schema.get("required")
    return list(required) if isinstance(required, list) else []


def _validate_arguments(tool: ToolInfo, arguments: dict[str, Any]) -> str | None:
    missing = [name for name in _required_params(tool) if name not in arguments]
    return f"missing required args: {', '.join(missing)}" if missing else None


def _tool_catalog_text(tools: list[ToolInfo]) -> str:
    rows = []
    for tool in tools:
        rows.append(json.dumps({
            "tool": tool.qualified_name,
            "description": tool.description,
            "input_schema": tool.input_schema,
        }, ensure_ascii=False))
    return "\n".join(rows)


def _result_preview(value: Any, limit: int = 5000) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        text = str(value)
    return text[:limit] + ("..." if len(text) > limit else "")


def _hallucination_audit(summary: str, calls: list[ToolCallRecord]) -> dict[str, Any]:
    """Audit final claims against successful MCP outputs using shared grounding heuristics."""
    claims = [
        claim.strip()
        for claim in re.split(r"(?<=[.!?])\\s+|\\n+", str(summary or ""))
        if len(claim.strip()) >= 18
    ]
    sources = []
    for call in calls:
        if not call.ok or call.output is None:
            continue
        sources.append(_result_preview(call.output, 5000))
    flagged = []
    for index, claim in enumerate(claims):
        score = claim_grounding_score(claim, sources)
        if score < 0.25 and not re.search(r"https?://", claim):
            flagged.append({
                "index": index + 1,
                "claim": claim,
                "overlap": round(score, 3),
                "grounded": False,
            })
    grounded = max(0, len(claims) - len(flagged))
    return {
        "enabled": True,
        "evaluator": "shared-claim-grounding-v1",
        "claimCount": len(claims),
        "groundedClaims": grounded,
        "ungroundedClaims": len(flagged),
        "hallucinationRate": round((len(flagged) / len(claims)) * 100, 1) if claims else None,
        "status": "REVIEW" if flagged else "CLEAR",
        "threshold": 0.25,
        "flaggedClaims": flagged[:8],
        "note": "Heuristic claim-to-MCP-evidence grounding; review flagged claims against primary sources before treating them as established facts.",
    }


def _extract_json_object(text: str) -> dict[str, Any] | None:
    """Extract the first valid JSON object from model output.

    OpenAI-compatible reasoning models may wrap the requested JSON in
    markdown or explanatory text. Tolerate those wrappers while still
    requiring the extracted value to be a JSON object.
    """
    raw = text.strip()
    if not raw:
        return None

    candidates: list[str] = []
    fenced = re.search(
        r"```(?:json)?\s*(\{.*?\})\s*```",
        raw,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if fenced:
        candidates.append(fenced.group(1))

    # Scan for balanced JSON objects embedded in prose/reasoning.
    for start_match in re.finditer(r"\{", raw):
        start = start_match.start()
        depth = 0
        in_string = False
        escaped = False
        for index in range(start, len(raw)):
            char = raw[index]
            if in_string:
                if escaped:
                    escaped = False
                elif char == chr(92):
                    escaped = True
                elif char == chr(34):
                    in_string = False
                continue
            if char == chr(34):
                in_string = True
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    candidates.append(raw[start:index + 1])
                    break

    candidates.append(raw)
    for candidate in candidates:
        try:
            value = json.loads(candidate.strip())
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    return None



JEV_ROUTE_PATTERNS: dict[str, tuple[str, ...]] = {
    "market": (".get_quotes", ".get_quote", ".get_snapshot"),
    "earnings": (".get_earnings",),
    "event_study": (".get_event_study",),
    "filings": (".get_catalysts", ".search_filings", ".get_filings"),
    "macro": (".get_macro", ".macro", ".get_risks"),
    "congress": ("congress.", ".get_congress", ".get_trades"),
    "news": ("news.search",),
    "rotation": (".get_rotation",),
}

JEV_ROUTE_CRITERIA = {
    "market": "Current price, daily move, quote or snapshot request",
    "earnings": "Earnings date, EPS, revenue, earnings report or earnings surprise",
    "event_study": "Historical event study or post-event price reaction",
    "filings": "SEC filing, contract, material agreement, disclosure or filing catalyst",
    "macro": "Macro, geopolitics, Taiwan, power/grid or export-control exposure",
    "congress": "Congressional/public official stock transaction disclosure",
    "news": "Recent news or media reporting about a company or ticker",
    "rotation": "Relative rotation, peer basket, hardware/application or sector rotation",
    "multi_source": "Question requires combining several evidence sources before answering",
}

def _jev_route(question: str, tools: list[ToolInfo], client: JevClient) -> JevDecision:
    tool_names = ", ".join(t.qualified_name for t in tools[:80])
    state = f"AI Infra Watch research question: {question}\nAvailable tool names: {tool_names}"
    return client.choose(
        state=state,
        instructions="Which research route should run first? Choose multi_source when the question asks why/what changed or clearly needs multiple evidence sources.",
        criteria={**JEV_ROUTE_CRITERIA},
    )

def _tool_for_jev_route(route: str, tools: list[ToolInfo]) -> ToolInfo | None:
    patterns = JEV_ROUTE_PATTERNS.get(route, ())
    if not patterns:
        return None
    for tool in tools:
        name = tool.qualified_name.lower()
        if any(pattern.lower() in name for pattern in patterns):
            return tool
    return None

def _planner_prompt(question: str, tools: list[ToolInfo], history: list[dict[str, Any]]) -> str:
    return f'''You are the autonomous tool planner for AI Infra Watch.

User question:
{question}

Available MCP tools:
{_tool_catalog_text(tools)}

Recent execution history:
{json.dumps(history[-6:], ensure_ascii=False, indent=2)}

Choose exactly one next action.
Return JSON only:
{{"action":"tool","tool":"server.tool","arguments":{{}},"reason":"..."}}
or:
{{"action":"final","answer":"..."}}

Rules:
- Use only a discovered tool.
- Respect its input schema. Do not invent required arguments.
- Prefer evidence retrieval before interpretation.
- Use explicitly named tickers when the selected schema supports symbol/symbols.
- Do not claim current facts unless retrieved from a tool result.
- Stop when the evidence is sufficient.
- Do not repeat the exact same tool with the exact same arguments unless the
  prior call failed and retrying is necessary.
'''


def _driver_research_plan(question: str, tools: list[ToolInfo], calls: list[ToolCallRecord]) -> dict[str, Any] | None:
    """Build a bounded evidence sequence for 'what changed / why / drivers' questions.

    Prefer one batched quote call, then historical earnings-event reaction, then
    a filing search. This avoids spending the six-step budget on repeated
    per-symbol quote calls and gives the synthesizer evidence about both price
    reaction and material disclosures.
    """
    lower = question.lower()
    terms = ("driver", "drivers", "why", "cause", "causes", "catalyst", "catalysts", "changed recently", "what changed", "recent developments", "could affect", "affect", "stock price")
    if not any(term in lower for term in terms):
        return None
    symbols = [s.upper() for s in extract_symbols(question)]
    if not symbols:
        return None

    def successful_tool(predicate):
        return any(c.ok and predicate(c) for c in calls)

    # Step 1: one quote batch for all explicitly named symbols.
    batch = next(
        (
            t for t in tools
            if t.qualified_name.lower().endswith(".get_quotes")
            and "symbols" in ((t.input_schema or {}).get("properties") or {})
        ),
        None,
    )
    if batch is not None and not successful_tool(
        lambda c: c.tool.lower().endswith(".get_quotes")
        or c.tool.lower().endswith(".get_quote")
    ):
        return {
            "action": "tool",
            "tool": batch.qualified_name,
            "arguments": {"symbols": symbols},
            "reason": "driver question: batch current quotes before causal research",
        }

    # Step 2: use event-study evidence only when the user explicitly asks
    # about earnings/reactions. On serverless deployments, running one event
    # study per ticker can consume the whole step budget before filings/news
    # are retrieved, which was a major source of slow or incomplete answers.
    event_terms = ("earnings", "earning", "event study", "price reaction", "reaction", "reacted", "historical market data", "historical price data", "price history", "historical stock price")
    needs_event_study = any(term in lower for term in event_terms)
    if needs_event_study:
        event_tools = [
            t for t in tools
            if t.qualified_name.lower().endswith(".get_event_study")
            and "symbol" in ((t.input_schema or {}).get("properties") or {})
        ]
        completed_events = {
            str((c.arguments or {}).get("symbol", "")).upper()
            for c in calls
            if c.ok and c.tool.lower().endswith(".get_event_study")
        }
        for symbol in symbols[:1]:
            if symbol not in completed_events and event_tools:
                return {
                    "action": "tool",
                    "tool": event_tools[0].qualified_name,
                    "arguments": {"symbol": symbol},
                    "reason": f"driver question: retrieve historical earnings price reaction for {symbol}",
                }

    # Step 3: retrieve company-specific SEC evidence in one batched call.
    # The generic RAG corpus may contain sector-level documents that do not
    # mention the requested tickers. get_catalysts uses primary EDGAR 8-K data
    # and preserves accession URLs, material-event items, and contract evidence.
    catalyst_tool = next(
        (
            t for t in tools
            if t.qualified_name.lower().endswith(".get_catalysts")
            and "symbols" in ((t.input_schema or {}).get("properties") or {})
        ),
        None,
    )
    if catalyst_tool is not None and not successful_tool(
        lambda c: c.tool.lower().endswith(".get_catalysts")
    ):
        return {
            "action": "tool",
            "tool": catalyst_tool.qualified_name,
            "arguments": {"symbols": symbols},
            "reason": "driver question: retrieve company-specific SEC catalyst evidence",
        }

    # Step 4: retrieve recent market/company news for the explicitly named
    # symbols. One keyword search keeps the bounded six-tool budget while
    # adding the missing news/macroeconomic evidence layer.
    news_search = next(
        (
            t for t in tools
            if t.qualified_name.lower().endswith(".search")
            and t.qualified_name.lower().startswith("news.")
            and "query" in ((t.input_schema or {}).get("properties") or {})
        ),
        None,
    )
    if news_search is not None and not successful_tool(
        lambda c: c.tool.lower().startswith("news.") and c.tool.lower().endswith(".search")
    ):
        return {
            "action": "tool",
            "tool": news_search.qualified_name,
            "arguments": {"query": " ".join(symbols), "days": 7},
            "reason": "driver question: retrieve recent news for named symbols",
        }

    # Once quotes, historical event studies, SEC catalysts, and news have all
    # been collected, stop the bounded investigation.
    if successful_tool(lambda c: c.tool.lower().endswith(".get_catalysts")) and successful_tool(
        lambda c: c.tool.lower().startswith("news.") and c.tool.lower().endswith(".search")
    ):
        return {"action": "final", "answer": ""}

    return None


def _needs_evidence_gate(question: str) -> bool:
    """Return whether a question benefits from an explicit evidence sufficiency check."""
    lower = question.lower()
    terms = (
        "why",
        "what changed",
        "drivers",
        "driver",
        "catalyst",
        "catalysts",
        "impact",
        "affect",
        "affected",
        "recent developments",
        "stock price",
        "risk",
        "analyze",
        "analysis",
        "compare",
        "comparison",
        "outlook",
    )
    return any(term in lower for term in terms)


def _required_evidence_families(question: str) -> tuple[str, ...]:
    """Return only *explicitly required* evidence families.

    Generic stock/ETF research no longer requires market + news + SEC as a
    fixed checklist. The sufficiency policy instead requires multiple usable
    families, while explicit requests such as "check SEC" remain hard
    requirements. This makes the gate question-driven rather than SEC-driven.
    """
    lower = question.lower()
    families: list[str] = []
    if any(term in lower for term in ("sec", "edgar", "10-k", "10-q", "8-k", "filing", "filings", "regulatory disclosure")):
        families.append("regulatory_primary")
    if any(term in lower for term in ("company announcement", "company press", "investor relations", "ir release", "official documentation", "official docs", "company docs", "product documentation")):
        families.append("issuer_primary")
    if any(term in lower for term in ("analyst", "price target", "target price", "consensus", "wall street", "estimate revision", "rating")):
        families.append("analyst_consensus")
    if any(term in lower for term in ("earnings", "eps", "revenue surprise", "results", "guidance")):
        families.append("earnings")
    if any(term in lower for term in ("reaction", "reacted", "event study", "price history", "historical market data", "historical price data", "historical stock price")):
        families.append("event_study")
    if any(term in lower for term in ("congress", "senator", "representative", "official trade", "congressional trade")):
        families.append("congress")
    if any(term in lower for term in ("macro", "geopolit", "taiwan", "export", "power", "grid")):
        families.append("macro")
    if any(term in lower for term in ("portfolio", "my holdings", "my positions", "held stocks", "holdings")):
        families.append("portfolio")
    if any(term in lower for term in ("forecast", "forecast track", "prediction accuracy", "forecast accuracy", "verification history")):
        families.append("forecast")
    if any(term in lower for term in ("ai quality", "hallucination", "red team", "red-team", "research quality", "agent reliability")):
        families.append("quality")
    return tuple(dict.fromkeys(families))


def _evidence_availability(question: str, calls: list[ToolCallRecord]) -> dict[str, Any]:
    """Build a typed evidence coverage matrix from the actual MCP trajectory.

    Distinguishes a successful source with useful data from a successful tool
    that returned an empty dataset, and from an actual tool/provider failure.
    This prevents "source returned nothing" from being mislabeled as "source
    unavailable".
    """
    expected = _required_evidence_families(question)
    matrix: dict[str, Any] = {}

    def has_payload(value: Any) -> bool:
        """Return True only when a tool response contains usable evidence.

        MCP adapters commonly return structured envelopes such as
        {"data": [], "error": ...} or {"events": [], "status": "ok"}.
        A non-empty envelope must not be mistaken for evidence merely because
        it contains metadata or an error string.
        """
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, (list, tuple, set)):
            return any(has_payload(item) for item in value)
        if isinstance(value, dict):
            # Explicit provider/tool errors are failures or empty evidence,
            # not usable payloads. The actual ToolCallRecord.ok flag still
            # determines whether the channel is classified as FAILED.
            if value.get("error") and not any(
                key in value and has_payload(value.get(key))
                for key in ("data", "results", "records", "items", "events", "hits", "quotes", "filings", "contracts", "trades", "articles")
            ):
                return False
            evidence_keys = (
                "data", "results", "records", "items", "events", "hits",
                "quotes", "filings", "contracts", "trades", "articles",
                "price", "changePct", "change_pct", "event", "summary",
                "narrative", "content", "document", "documents", "claims",
            )
            if any(key in value and has_payload(value.get(key)) for key in evidence_keys):
                return True
            # Small scalar evidence objects are valid when they are not just
            # transport/status metadata.
            metadata_only = {"status", "ok", "success", "cached", "source", "provider", "timestamp", "retrievedAt"}
            return any(key not in metadata_only and has_payload(child) for key, child in value.items())
        return True

    for family in expected:
        family_calls = [call for call in calls if _evidence_family(call.tool) == family]
        successful = [call for call in family_calls if call.ok]
        failed = [call for call in family_calls if not call.ok]
        usable = [call for call in successful if has_payload(call.output)]

        if usable:
            status = "AVAILABLE"
        elif successful:
            status = "EMPTY"
        elif failed:
            status = "FAILED"
        else:
            status = "MISSING"

        latest = (usable or successful or failed or [None])[-1]
        matrix[family] = {
            "status": status,
            "observedCalls": len(family_calls),
            "successfulCalls": len(successful),
            "failedCalls": len(failed),
            "usableCalls": len(usable),
            "lastError": getattr(latest, "error", None) if latest is not None and not latest.ok else None,
        }

    missing = [
        family for family, item in matrix.items()
        if item["status"] != "AVAILABLE"
    ]
    usable_families = [
        family for family, item in matrix.items()
        if item["status"] == "AVAILABLE"
    ]
    return {
        "required": list(expected),
        "channels": matrix,
        "missing": missing,
        "usable_families": usable_families,
        "usable_family_count": len(usable_families),
        "complete": not missing,
        "status_counts": {
            status: sum(1 for item in matrix.values() if item["status"] == status)
            for status in ("AVAILABLE", "EMPTY", "FAILED", "MISSING")
        },
    }


def _store_evidence_gate(question: str, calls: list[ToolCallRecord], client: JevClient) -> tuple[str, dict[str, Any]]:
    """Run one batched Jev assessment and record the typed gate decision."""
    successful = [call for call in calls if call.ok]
    availability = _evidence_availability(question, calls)
    evidence_quality = enrich_calls(successful)
    conflict_report = detect_conflicts(successful)
    dedupe_report = deduplicate_evidence(successful)
    citation_report = citation_coverage(successful)
    state = {
        "question": question,
        "evidence_availability": availability,
        "evidence_freshness": evidence_quality,
        "conflict_detection": conflict_report,
        "deduplication": dedupe_report,
        "citation_coverage": citation_report,
        "successful_calls": [
            {
                "tool": call.tool,
                "arguments": call.arguments,
                "output": _result_preview(call.output, 1800),
            }
            for call in successful
        ],
        "failed_calls": [
            {
                "tool": call.tool,
                "arguments": call.arguments,
                "error": call.error,
            }
            for call in calls
            if not call.ok
        ],
    }
    evaluation = assess("research", state, client)
    gate: dict[str, Any] = {
        "enabled": client.enabled,
        "checked_after_successful_calls": len(successful),
        "action": "continue",
        "fallback": not evaluation.usable,
        "minimum_independent_families": 2,
        "usable_families": availability.get("usable_families", []),
        "usable_family_count": availability.get("usable_family_count", 0),
        "required_families": availability.get("required", []),
        "missing_required_families": availability.get("missing", []),
        "evidence_availability": availability,
        "evidence_freshness": evidence_quality,
        "conflict_detection": conflict_report,
        "deduplication": dedupe_report,
        "citation_coverage": citation_report,
    }
    if not evaluation.usable:
        gate["error"] = evaluation.error or "Jev evidence gate unavailable"
        decision = "continue"
    else:
        sufficiency = evaluation.answers.get("sufficiency")
        quality = evaluation.answers.get("evidence_quality")
        choice = (sufficiency.choice or "").strip().lower().replace(" ", "_") if sufficiency else ""
        score = quality.score if quality else None
        confidence = sufficiency.confidence if sufficiency else None

        # JEV is the sufficiency advisor; deterministic policy supplies the
        # safety rails. Generic research does NOT require Market+News+SEC.
        # We require at least two usable families, while explicit user-requested
        # families remain hard requirements. "Usable" is enough; "Strong" is
        # better evidence but is not mandatory for every question.
        conflict_detected = bool(conflict_report.get("detected"))
        usable_family_count = int(availability.get("usable_family_count", 0) or 0)
        explicit_requirements_met = availability["complete"]
        jev_stop_ready = (
            choice == "stop"
            and isinstance(score, (int, float))
            and score >= 2.0
            and (confidence is None or confidence >= 0.50)
        )
        policy_stop_ready = (
            not conflict_detected
            and explicit_requirements_met
            and usable_family_count >= 2
        )

        if conflict_detected:
            decision = "gather_more"
        elif not explicit_requirements_met:
            decision = "gather_more"
        elif jev_stop_ready and policy_stop_ready:
            decision = "stop"
        elif (
            policy_stop_ready
            and usable_family_count >= 3
            and isinstance(score, (int, float))
            and score >= 2.0
        ):
            # JEV can be conservative on broad questions. Three distinct,
            # usable families with no conflict are enough to finalize under the
            # platform policy, even when JEV returns a non-stop advisory.
            decision = "stop"
        elif choice in {"gather_more", "resolve_conflict"} or usable_family_count < 2:
            decision = "gather_more"
        elif isinstance(score, (int, float)) and score < 2.0:
            decision = "gather_more"
        else:
            decision = "continue"

        gate.update(
            {
                "action": decision,
                "choice": choice,
                "choice_confidence": confidence,
                "conflict_detected": conflict_detected,
                "conflict_count": int(conflict_report.get("count", 0) or 0),
                "raw_score": score,
                "evidence_quality": (
                    round(max(0.0, min(3.0, float(score))) / 3.0 * 100.0)
                    if isinstance(score, (int, float))
                    else None
                ),
                "model": evaluation.model,
                "latency_ms": round(evaluation.latency_ms, 1),
                "input_tokens": evaluation.input_tokens,
            }
        )
    return decision, gate


def _evidence_family(tool_name: str) -> str:
    """Normalize MCP tools into provenance-aware research families."""
    name = tool_name.lower()
    if name.startswith("news."):
        return "news"
    if any(token in name for token in ("analyst.", "analyst_", "price_target", "target_price", "consensus", "estimate_revision", "recommendation", "ratings")):
        return "analyst_consensus"
    if any(token in name for token in (
        "investor_relations", "investor-relations", "company.", "companies.",
        "issuer.", "press_release", "press-release", "newsroom", "official.",
        "product_docs", "product-docs", "company_docs", "company-docs",
    )):
        return "issuer_primary"
    if "get_event_study" in name:
        return "event_study"
    if "get_earnings" in name:
        return "earnings"
    if name.startswith("filings.") or "sec" in name or "edgar" in name:
        return "regulatory_primary"
    if "congress" in name:
        return "congress"
    if "macro" in name or "risk" in name:
        return "macro"
    if "forecast" in name or "verification" in name:
        return "forecast"
    if "portfolio" in name or "holdings" in name:
        return "portfolio"
    if "quality" in name or "red_team" in name or "red-team" in name:
        return "quality"
    if "rotation" in name or "relationship" in name:
        return "relationship"
    if any(token in name for token in (".get_quote", ".get_quotes", ".get_snapshot")):
        return "market"
    return name.split(".", 1)[0] if "." in name else name


def _question_evidence_priorities(question: str) -> tuple[str, ...]:
    """Return evidence channels in a deterministic complementary order.

    These are preferences, not mandatory requirements. The agent can answer
    with any sufficient combination of usable, relevant families.
    """
    lower = question.lower()
    priorities: list[str] = []
    if any(term in lower for term in ("forecast", "prediction accuracy", "forecast track", "verification history")):
        priorities.extend(["forecast", "market", "event_study"])
    if any(term in lower for term in ("portfolio", "my holdings", "my positions", "held stocks", "holdings")):
        priorities.extend(["portfolio", "market", "news", "issuer_primary"])
    if any(term in lower for term in ("analyst", "price target", "target price", "consensus", "wall street", "estimate revision", "rating")):
        priorities.append("analyst_consensus")
    if any(term in lower for term in ("official documentation", "official docs", "company docs", "product documentation", "investor relations", "company announcement")):
        priorities.append("issuer_primary")
    if any(term in lower for term in ("earnings", "earning", "eps", "revenue surprise")):
        priorities.extend(["earnings", "event_study"])
    if any(term in lower for term in ("reaction", "event study", "reacted", "price moved", "price movement", "historical market data", "historical price data", "price history", "historical stock price")):
        priorities.append("event_study")
    if any(term in lower for term in ("sec", "edgar", "filing", "contract", "disclosure", "material agreement")):
        priorities.append("regulatory_primary")
    if any(term in lower for term in ("congress", "senator", "representative", "official trade")):
        priorities.append("congress")
    if any(term in lower for term in ("macro", "geopolit", "taiwan", "export", "power", "grid", "risk")):
        priorities.append("macro")
    if any(term in lower for term in ("why", "driver", "changed", "catalyst", "impact", "affected", "recent developments")):
        priorities.extend(["market", "news", "issuer_primary", "analyst_consensus", "regulatory_primary", "event_study"])
    priorities.extend([
        "market", "news", "issuer_primary", "regulatory_primary",
        "analyst_consensus", "earnings", "event_study", "macro", "congress",
        "portfolio", "forecast", "quality",
    ])
    return tuple(dict.fromkeys(priorities))


def _channel_tool_usable(family: str, name: str) -> bool:
    """Reject tool names that only happen to belong to a family but are not evidence queries."""
    lower = name.lower()
    if family == "news":
        return any(
            token in lower
            for token in ("news.search", "news.company", "news.sector", "news.global", "news.geopolitical", "news.health")
        )
    if family == "issuer_primary":
        return any(token in lower for token in (
            "investor_relations", "investor-relations", "company.", "companies.",
            "issuer.", "press_release", "press-release", "newsroom", "official.",
            "product_docs", "product-docs", "company_docs", "company-docs",
        ))
    if family == "analyst_consensus":
        return any(token in lower for token in (
            "analyst.", "analyst_", "price_target", "target_price", "consensus",
            "estimate_revision", "recommendation", "ratings",
        ))
    if family == "regulatory_primary":
        return any(token in lower for token in (
            "filings.get_catalysts", "filings.search_filings", "filings.get_filings",
            "filings.get_contracts", "filings.get_milestones", "filings.get_documents",
            "sec.", "edgar",
        ))
    if family == "event_study":
        return "get_event_study" in lower
    if family == "earnings":
        return "get_earnings" in lower
    if family == "market":
        return any(token in lower for token in (".get_quote", ".get_quotes", ".get_snapshot"))
    if family == "congress":
        return "congress" in lower and any(token in lower for token in ("trade", "transaction", "get_"))
    if family == "macro":
        return "macro" in lower or "risk" in lower
    if family == "portfolio":
        return "portfolio" in lower or "holdings" in lower
    if family == "forecast":
        return "forecast" in lower or "verification" in lower
    if family == "quality":
        return "quality" in lower or "red_team" in lower or "red-team" in lower
    if family == "relationship":
        return "relationship" in lower or "rotation" in lower
    # Unknown tools are not evidence channels; only recognized evidence
    # families may be selected as complementary research sources.
    return False


def _next_evidence_plan(
    question: str,
    tools: list[ToolInfo],
    calls: list[ToolCallRecord],
) -> dict[str, Any] | None:
    """Pick the strongest unused complementary evidence channel."""
    symbols = extract_symbols(question)
    used = {call.tool for call in calls if call.ok}
    used_families = {_evidence_family(call.tool) for call in calls if call.ok}
    lower = question.lower()

    def candidate_score(tool: ToolInfo) -> int:
        name = tool.qualified_name.lower()
        family = _evidence_family(name)
        if family in used_families or not _channel_tool_usable(family, name):
            return -100
        score = 0
        priorities = _question_evidence_priorities(question)
        if family in priorities:
            score += max(1, 12 - priorities.index(family))
        if family == "news" and any(term in lower for term in ("why", "driver", "changed", "catalyst", "impact")):
            score += 6
        if family == "sec" and any(term in lower for term in ("why", "driver", "changed", "catalyst", "contract", "impact")):
            score += 6
        if family == "event_study" and any(term in lower for term in ("reaction", "event study", "earnings", "changed")):
            score += 6
        if family == "earnings" and "earnings" in lower:
            score += 7
        if family == "congress" and "congress" in lower:
            score += 7
        if family == "macro" and any(term in lower for term in ("macro", "geopolit", "taiwan", "export", "power", "grid")):
            score += 7
        props = (tool.input_schema or {}).get("properties") or {}
        if "symbol" in props and symbols:
            score += 2
        if "symbols" in props and symbols:
            score += 2
        return score

    ranked = sorted(
        (tool for tool in tools if tool.qualified_name not in used),
        key=lambda tool: (-candidate_score(tool), tool.qualified_name),
    )
    for tool in ranked:
        family = _evidence_family(tool.qualified_name)
        if family in used_families or not _channel_tool_usable(family, tool.qualified_name):
            continue
        props = (tool.input_schema or {}).get("properties") or {}
        required = _required_params(tool)
        args: dict[str, Any] = {}
        if "symbols" in props and symbols:
            args["symbols"] = symbols
        elif "symbol" in props and symbols:
            args["symbol"] = symbols[0]
        if "query" in props:
            args["query"] = question
        if "days" in props:
            args["days"] = 7
        if "limit" in props and "limit" in required:
            args["limit"] = 20
        if all(name in args for name in required):
            return {
                "action": "tool",
                "tool": tool.qualified_name,
                "arguments": args,
                "reason": f"Jev evidence gate requested another independent {family} source",
            }
    return None


def _deterministic_summary(question: str, calls: list[ToolCallRecord], evidence_status: str = "") -> str:
    """Readable fallback when the final LLM synthesis is unavailable."""
    successful = [call for call in calls if call.ok]
    if not successful:
        return "No MCP tool produced usable evidence."

    lines = [
        "Facts retrieved:",
        f"- Research question: {question}",
        f"- Successful evidence calls: {len(successful)}",
    ]
    for call in successful:
        preview = _result_preview(call.output, 700)
        lines.append(f"- {call.tool}: {preview}")

    lines.append("")
    if evidence_status == "insufficient":
        lines.append("Evidence status: INSUFFICIENT — the evidence did not meet the research sufficiency gate. Conclusions are provisional and no unsupported causal conclusion is inferred.")
    else:
        lines.append("Interpretation note: this is a deterministic evidence summary because the final synthesis model was unavailable. No causal conclusion is inferred.")
    return "\n".join(lines)


def _final_prompt(question: str, calls: list[ToolCallRecord], evidence_status: str = "") -> str:
    evidence = [{
        "tool": c.tool,
        "ok": c.ok,
        "arguments": c.arguments,
        "output": _result_preview(c.output, 1200) if c.ok else str(c.error or "")[:500],
    } for c in calls]
    return f'''Answer this AI Infra Watch question using only the retrieved evidence.

Question:
{question}

Evidence status:
{evidence_status or "sufficiency not independently reported"}

Retrieved evidence:
{json.dumps(evidence, ensure_ascii=False, indent=2, default=str)}

Requirements:
- Separate retrieved facts from interpretation.
- State missing or conflicting evidence.
- If evidence status is "insufficient", explicitly say the available evidence did not meet the research sufficiency gate and keep conclusions provisional.
- Do not invent prices, events, contracts, or causal explanations.
- Do not present model signals as guaranteed outcomes.
- For event-study output, report the actual number of returned events and distinguish
  an empty events list from events whose return fields are null.
- Prefer company-specific primary SEC evidence over generic sector-level filing text
  when explaining possible catalysts.
- For each named ticker, identify what is directly observed and label any driver
  not directly supported by retrieved evidence as a hypothesis.
- Return only the final user-facing answer. Do not restate these instructions,
  the question, or the full retrieved-evidence payload.
- Keep the answer concise but complete, with a clear Facts section followed by
  Interpretation/Hypotheses.
'''


class AutonomousMCPAgent:
    def __init__(self, toolbox: MCPToolbox, client: LLMClient | None = None, max_steps: int | None = None, planner: Any | None = None, jev: JevClient | None = None) -> None:
        self.toolbox = toolbox
        self.client = client or LLMClient()
        self.max_steps = max_steps or int(os.getenv("AUTONOMOUS_MAX_STEPS", "4" if os.getenv("VERCEL") else "6"))
        self.planner = planner
        self.jev = jev or JevClient()
        self.last_jev: dict[str, Any] = {}

    def _plan(self, question: str, tools: list[ToolInfo], history: list[dict[str, Any]]) -> dict[str, Any]:
        if self.planner is not None:
            return self.planner(question, tools, history)
        mode = os.getenv("AUTONOMOUS_MODE", "llm").strip().lower()
        # Jev is a per-question routing decision, not a loop-level
        # planner. Cache its decision for the lifetime of this investigation
        # so repeated iterations do not call the same route/tool again.
        if self.jev.enabled and mode != "keyword" and not self.last_jev:
            try:
                decision = _jev_route(question, tools, self.jev)
                self.last_jev = {
                    "enabled": True,
                    "choice": decision.choice,
                    "confidence": decision.confidence,
                    "probabilities": decision.probabilities or {},
                    "model": decision.model,
                    "latency_ms": round(decision.latency_ms, 1),
                }
                route_tool = _tool_for_jev_route(decision.choice, tools)
                if route_tool is not None and decision.confidence >= settings.JEV_ROUTE_THRESHOLD:
                    symbols = extract_symbols(question)
                    arguments: dict[str, Any] = {}
                    properties = (route_tool.input_schema or {}).get("properties") or {}
                    if "symbols" in properties and symbols:
                        arguments["symbols"] = symbols
                    elif "symbol" in properties and symbols:
                        arguments["symbol"] = symbols[0]
                    self.last_jev["action"] = "direct_tool"
                    self.last_jev["tool"] = route_tool.qualified_name
                    return {
                        "action": "tool",
                        "tool": route_tool.qualified_name,
                        "arguments": arguments,
                        "reason": f"Jev route={decision.choice} confidence={decision.confidence:.2f}",
                    }
                self.last_jev["action"] = "llm_planner"
            except Exception as exc:
                self.last_jev = {
                    "enabled": True,
                    "action": "fallback",
                    "error": f"{type(exc).__name__}: {exc}",
                }

        mode = os.getenv("AUTONOMOUS_MODE", "llm").strip().lower()
        if mode == "keyword" or self.client.provider == "stub":
            used_tools = {
                str(item.get("tool", ""))
                for item in history
                if isinstance(item, dict) and item.get("tool")
            }
            # A single investigation should use each discovered tool at most
            # once; this prevents a keyword fallback from looping on the same
            # tool and encourages cross-source evidence gathering.
            filtered = []
            for tool in tools:
                candidate_args = {}
                props = (tool.input_schema or {}).get("properties") or {}
                symbols = extract_symbols(question)
                if "symbol" in props and symbols:
                    candidate_args["symbol"] = symbols[0]
                if "symbols" in props and symbols:
                    candidate_args["symbols"] = symbols
                if tool.qualified_name not in used_tools:
                    filtered.append(tool)
            plans = keyword_router(question, filtered, max_tools=1)
            if not plans:
                return {"action": "final", "answer": "No unused MCP tool matches the question; the retrieved evidence can be finalized."}
            plan = plans[0]
            return {"action": "tool", "tool": plan.tool, "arguments": plan.arguments, "reason": "deterministic fallback router"}
        # Keep ticker-focused investigations inside the explicitly named\n        # symbols. Broad relationship/rotation tools can otherwise query a\n        # default universe of many tickers and hit the Vercel timeout.\n        planning_tools = tools\n        symbols = extract_symbols(question)\n        if symbols:\n            lower_question = question.lower()\n            filing_terms = (\n                "sec", "filing", "filings", "10-k", "10-q", "8-k",\n                "contract", "contracts", "disclosure", "disclosures", "cik",\n            )\n            is_filing_question = any(term in lower_question for term in filing_terms)\n            ticker_tools = []\n            for tool in tools:\n                props = (tool.input_schema or {}).get("properties") or {}\n                if "symbol" not in props and "symbols" not in props:\n                    continue\n                if not is_filing_question and "milestone" in tool.qualified_name.lower():\n                    continue\n                ticker_tools.append(tool)\n            if ticker_tools:\n                planning_tools = ticker_tools\n\n        raw = self.client.generate(\n            _planner_prompt(question, planning_tools, history),\n            max_tokens=800,\n            temperature=0.0,\n        )\n        parsed = _extract_json_object(raw)\n        if not parsed:\n            raise ValueError("planner did not return a valid JSON object")\n        return parsed

    def _finalize(self, question: str, calls: list[ToolCallRecord], steps: list[Step], resolution: str = "completed") -> AutonomousResult:
        successful = [c for c in calls if c.ok]
        if not successful:
            steps.append(Step(node="finalize", kind="node", note="no successful calls"))
            return AutonomousResult(
                question,
                "No MCP tool produced usable evidence.",
                calls,
                [tool.qualified_name for tool in self.toolbox.tools()],
                AgentTrajectory(steps=steps),
                answer_source="none",
                error="no successful tool calls",
                resolution="error",
            )
        # Stub mode is intentionally offline and may not have a matching
        # final-answer fixture for every possible question. The MCP result is
        # still valid evidence, so fall back to a deterministic JSON rendering
        # instead of marking a successful investigation as degraded.
        if self.client.stub:
            final_text = _result_preview(successful[-1].output, 4000)
            hallucination = _hallucination_audit(final_text, successful)
            steps.append(Step(node="finalize", kind="node", note="deterministic evidence synthesis"))
            return AutonomousResult(
                question,
                final_text,
                calls,
                [tool.qualified_name for tool in self.toolbox.tools()],
                AgentTrajectory(steps=steps),
                jev=self.last_jev,
                hallucination=hallucination,
                answer_source="deterministic-evidence",
                resolution=resolution,
            )

        try:
            final_provider = settings.LLM_FINAL_PROVIDER or self.client.provider
            final_model = settings.LLM_FINAL_MODEL or self.client.model
            final_client = self.client
            if (
                final_provider != self.client.provider
                or final_model != self.client.model
            ):
                final_client = LLMClient(provider=final_provider, model=final_model)
            final_text = final_client.generate(
                _final_prompt(question, successful, evidence_status=("insufficient" if resolution == "jev_evidence_insufficient" else "")),
                max_tokens=settings.LLM_FINAL_MAX_TOKENS,
                temperature=0.0,
                timeout_sec=settings.LLM_FINAL_TIMEOUT_SEC,
                max_retries=1,
                reasoning_effort=(
                    settings.LLM_FINAL_REASONING_EFFORT
                    if final_provider == "openai"
                    and settings.LLM_FINAL_REASONING_EFFORT
                    else None
                ),
            )
        except Exception as exc:
            final_text = _deterministic_summary(question, calls, evidence_status=("insufficient" if resolution == "jev_evidence_insufficient" else ""))
            error = f"finalization_failed: {type(exc).__name__}: {exc}"
            hallucination = hallucination_audit(final_text, successful)
            steps.append(Step(node="finalize", kind="node", note=error))
            return AutonomousResult(
                question,
                final_text,
                calls,
                [tool.qualified_name for tool in self.toolbox.tools()],
                AgentTrajectory(steps=steps),
                jev=self.last_jev,
                hallucination=hallucination,
                answer_source="deterministic-fallback",
                error=error,
                resolution=resolution,
            )
        hallucination = hallucination_audit(final_text, successful)
        steps.append(
            Step(
                node="hallucination_audit",
                kind="node",
                note="deterministic claim grounding audit",
            )
        )
        steps.append(llm_call("autonomous.finalize", note="evidence synthesis"))
        final_note = {
            "jev_evidence_sufficient": "evidence sufficient",
            "jev_evidence_insufficient": "evidence insufficient; conclusions are provisional",
            "max_steps": "research budget exhausted; finalizing available evidence",
        }.get(resolution, resolution.replace("_", " "))
        steps.append(Step(node="finalize", kind="node", note=final_note))
        return AutonomousResult(
            question,
            final_text,
            calls,
            [tool.qualified_name for tool in self.toolbox.tools()],
            AgentTrajectory(steps=steps),
            jev=self.last_jev,
            hallucination=hallucination,
            resolution=resolution,
        )

    def run(self, question: str) -> AutonomousResult:
        tools = self.toolbox.tools()
        discovered = [tool.qualified_name for tool in tools]
        by_name = {tool.qualified_name: tool for tool in tools}
        history: list[dict[str, Any]] = []
        calls: list[ToolCallRecord] = []
        steps: list[Step] = [Step(node="discover", kind="node", note=f"{len(tools)} tools")]
        self.last_jev = {}
        if not tools:
            return AutonomousResult(
                question,
                "No MCP tools are currently available.",
                [],
                [],
                AgentTrajectory(steps=steps),
                resolution="no_tool",
            )

        evidence_enabled = _needs_evidence_gate(question) and self.jev.enabled
        step_limit = self.max_steps + (2 if evidence_enabled else 0)

        for iteration in range(1, step_limit + 1):
            gate = self.last_jev.get("evidence_gate") or {}
            successful_count = sum(1 for call in calls if call.ok)
            gate_checked = int(gate.get("checked_after_successful_calls", 0) or 0)

            # Once Jev asks for more evidence, let the evidence selector
            # choose the next independent channel directly.
            gate_forces_more = (
                evidence_enabled
                and gate.get("action") == "gather_more"
                and successful_count >= 2
                and successful_count == gate_checked
            )
            if gate_forces_more:
                additional = _next_evidence_plan(question, tools, calls)
                if additional is None:
                    gate = dict(gate)
                    gate["action"] = "insufficient"
                    gate["budget_exhausted"] = False
                    gate["checked_sources"] = successful_count
                    gate["reason"] = "No unused complementary evidence channel was available."
                    self.last_jev["evidence_gate"] = gate
                    steps.append(
                        Step(
                            node="evidence_gate",
                            kind="node",
                            note="action=insufficient; no complementary evidence channel available",
                        )
                    )
                    return self._finalize(
                        question,
                        calls,
                        steps,
                        resolution="jev_evidence_insufficient",
                    )
                plan = additional
                steps.append(
                    Step(
                        node="plan",
                        kind="node",
                        note="Jev evidence gate selected additional source",
                    )
                )
            else:
                # Driver investigations record Jev routing once, while the
                # bounded evidence sequence controls retrieval for known driver
                # questions.
                if (
                    iteration == 1
                    and self.jev.enabled
                    and not self.last_jev
                    and any(
                        term in question.lower()
                        for term in (
                            "driver",
                            "drivers",
                            "why",
                            "cause",
                            "causes",
                            "catalyst",
                            "catalysts",
                            "changed recently",
                            "what changed",
                        )
                    )
                ):
                    try:
                        decision = _jev_route(question, tools, self.jev)
                        self.last_jev = {
                            "enabled": True,
                            "choice": decision.choice,
                            "confidence": decision.confidence,
                            "probabilities": decision.probabilities or {},
                            "model": decision.model,
                            "latency_ms": round(decision.latency_ms, 1),
                            "action": "forced_driver_plan",
                        }
                    except Exception as exc:
                        self.last_jev = {
                            "enabled": True,
                            "action": "fallback",
                            "error": f"{type(exc).__name__}: {exc}",
                        }

                # Custom planners are used by tests and integrations to control
                # the exact next action; keep the production-only forced driver
                # sequence out of that injected planner path.
                forced_driver = (
                    _driver_research_plan(question, tools, calls)
                    if self.planner is None
                    else None
                )
                plan = forced_driver if forced_driver is not None else self._plan(question, tools, history)
                steps.append(
                    Step(
                        node="plan",
                        kind="node",
                        note=f"iteration={iteration}" + ("; forced driver evidence" if forced_driver else ""),
                    )
                )

                if not isinstance(plan, dict):
                    fallback_plans = keyword_router(question, tools, max_tools=1)
                    if fallback_plans:
                        fallback = fallback_plans[0]
                        plan = {
                            "action": "tool",
                            "tool": fallback.tool,
                            "arguments": fallback.arguments,
                            "reason": "planner returned no usable action; deterministic fallback",
                        }
                        steps.append(Step(node="plan", kind="node", note="planner fallback"))
                    else:
                        error = "planner returned no usable action"
                        steps.append(tool_call("autonomous.planner", ok=False, note=error))
                        return AutonomousResult(
                            question,
                            "",
                            calls,
                            discovered,
                            AgentTrajectory(steps=steps),
                            error=error,
                            resolution="error",
                        )

            action = str(plan.get("action", "")).strip().lower()
            if action == "final":
                forced = _driver_research_plan(question, tools, calls)
                if forced is not None:
                    forced_action = str(forced.get("action", "")).strip().lower()
                    if forced_action == "final":
                        steps.append(
                            Step(
                                node="finalize",
                                kind="node",
                                note="forced driver evidence complete",
                            )
                        )
                        return self._finalize(question, calls, steps)
                    plan = forced
                    action = "tool"
                    steps.append(Step(node="plan", kind="node", note="forced driver evidence"))
                else:
                    answer = str(plan.get("answer", "")).strip()
                    placeholder = "No unused MCP tool matches the question; the retrieved evidence can be finalized."
                    if any(c.ok for c in calls) and answer == placeholder:
                        return self._finalize(question, calls, steps)
                    if answer:
                        steps.append(Step(node="finalize", kind="node", note="planner settled"))
                        return AutonomousResult(
                            question,
                            answer,
                            calls,
                            discovered,
                            AgentTrajectory(steps=steps),
                            jev=self.last_jev,
                        )
                    if any(c.ok for c in calls):
                        return self._finalize(question, calls, steps)

            tool_name = str(plan.get("tool", "")).strip()
            tool = by_name.get(tool_name)
            if tool is None:
                error = f"unknown discovered tool: {tool_name}"
                steps.append(tool_call(tool_name or "unknown", ok=False, note=error))
                return AutonomousResult(
                    question,
                    "",
                    calls,
                    discovered,
                    AgentTrajectory(steps=steps),
                    error=error,
                    resolution="error",
                )

            arguments = plan.get("arguments") or {}
            if not isinstance(arguments, dict):
                arguments = {}
            symbols = extract_symbols(question)
            props = (tool.input_schema or {}).get("properties") or {}
            if "symbol" in props and "symbol" not in arguments and symbols:
                arguments["symbol"] = symbols[0]
            if "symbols" in props and "symbols" not in arguments and symbols:
                arguments["symbols"] = symbols

            if any(
                c.ok and c.tool == tool_name and c.arguments == arguments
                for c in calls
            ):
                # A planner may repeat a successful call after the evidence
                # gate has not been satisfied. For evidence-enabled research,
                # do not finalize just because the planner repeated itself;
                # first try an unused complementary evidence family.
                if evidence_enabled:
                    additional = _next_evidence_plan(question, tools, calls)
                    if additional is not None:
                        plan = additional
                        tool_name = str(plan.get("tool", "")).strip()
                        tool = by_name.get(tool_name)
                        arguments = plan.get("arguments") or {}
                        if not isinstance(arguments, dict):
                            arguments = {}
                        symbols = extract_symbols(question)
                        props = (tool.input_schema or {}).get("properties") or {} if tool else {}
                        if tool is not None:
                            if "symbol" in props and "symbol" not in arguments and symbols:
                                arguments["symbol"] = symbols[0]
                            if "symbols" in props and "symbols" not in arguments and symbols:
                                arguments["symbols"] = symbols
                        steps.append(
                            Step(
                                node="plan",
                                kind="node",
                                note="duplicate successful tool redirected to complementary evidence source",
                            )
                        )
                    else:
                        steps.append(
                            Step(
                                node="plan",
                                kind="node",
                                note="duplicate successful tool skipped; no complementary evidence source available",
                            )
                        )
                        return self._finalize(question, calls, steps)
                else:
                    steps.append(
                        Step(
                            node="plan",
                            kind="node",
                            note="duplicate successful tool skipped",
                        )
                    )
                    return self._finalize(question, calls, steps)

            validation_error = _validate_arguments(tool, arguments)
            if validation_error:
                record = ToolCallRecord(
                    tool=tool_name,
                    arguments=arguments,
                    ok=False,
                    error=validation_error,
                )
                calls.append(record)
                steps.append(tool_call(tool_name, arguments, ok=False, note=validation_error))
                history.append({"tool": tool_name, "arguments": arguments, "error": validation_error})
                continue

            try:
                output = self.toolbox.call(tool_name, arguments)
            except MCPClientError as exc:
                record = ToolCallRecord(
                    tool=tool_name,
                    arguments=arguments,
                    ok=False,
                    error=f"{exc.code}: {exc.message}",
                )
                calls.append(record)
                steps.append(tool_call(tool_name, arguments, ok=False, note=exc.code))
                history.append({"tool": tool_name, "arguments": arguments, "error": record.error})
            except Exception as exc:
                record = ToolCallRecord(
                    tool=tool_name,
                    arguments=arguments,
                    ok=False,
                    error=f"{type(exc).__name__}: {exc}",
                )
                calls.append(record)
                steps.append(tool_call(tool_name, arguments, ok=False, note=type(exc).__name__))
                history.append({"tool": tool_name, "arguments": arguments, "error": record.error})
            else:
                record = ToolCallRecord(
                    tool=tool_name,
                    arguments=arguments,
                    ok=True,
                    output=output,
                )
                calls.append(record)
                steps.append(tool_call(tool_name, arguments, note="ok"))
                history.append(
                    {
                        "tool": tool_name,
                        "arguments": arguments,
                        "output": _result_preview(output),
                    }
                )

                if evidence_enabled:
                    successful_count = sum(1 for call in calls if call.ok)
                    gate = self.last_jev.get("evidence_gate") or {}
                    gate_checked = int(gate.get("checked_after_successful_calls", 0) or 0)
                    if successful_count >= 2 and successful_count > gate_checked:
                        gate_decision, gate = _store_evidence_gate(question, calls, self.jev)
                        prior_checks = int((self.last_jev.get("evidence_gate") or {}).get("checks", 0) or 0)
                        gate["checks"] = prior_checks + 1
                        self.last_jev["evidence_gate"] = gate
                        steps.append(
                            Step(
                                node="evidence_gate",
                                kind="node",
                                note=f"action={gate_decision}; successful_calls={gate['checked_after_successful_calls']}",
                            )
                        )
                        if gate_decision == "stop":
                            return self._finalize(
                                question,
                                calls,
                                steps,
                                resolution="jev_evidence_sufficient",
                            )

                if (
                    self.last_jev.get("action") == "direct_tool"
                    and not evidence_enabled
                ):
                    return self._finalize(question, calls, steps)

        successful = [c for c in calls if c.ok]
        gate = self.last_jev.get("evidence_gate") or {}
        if successful and evidence_enabled and gate.get("action") == "gather_more":
            gate = dict(gate)
            gate["action"] = "insufficient"
            gate["budget_exhausted"] = True
            gate["evidence_budget"] = step_limit
            gate["checked_sources"] = len(successful)
            gate["reason"] = "Evidence remained below the sufficiency threshold within the bounded research budget."
            self.last_jev["evidence_gate"] = gate
            steps.append(
                Step(
                    node="evidence_gate",
                    kind="node",
                    note=f"action=insufficient; evidence budget exhausted at {len(successful)} successful calls",
                )
            )
            return self._finalize(
                question,
                calls,
                steps,
                resolution="jev_evidence_insufficient",
            )

        if successful:
            return self._finalize(question, calls, steps, resolution="max_steps")

        steps.append(Step(node="finalize", kind="node", note="no successful calls"))
        return AutonomousResult(
            question,
            "No MCP tool produced usable evidence.",
            calls,
            discovered,
            AgentTrajectory(steps=steps),
            error="no successful tool calls",
            resolution="error",
        )


__all__ = ["AutonomousMCPAgent", "AutonomousResult"]
