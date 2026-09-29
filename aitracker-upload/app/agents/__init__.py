"""Agent layer public exports.

Keep package import lightweight so the Vercel autonomous MCP entrypoint does not
eagerly import the optional LangGraph specialist stack. Public names remain
available through lazy module loading.
"""
from __future__ import annotations

from importlib import import_module
from typing import Any

_EXPORTS = {
    "MarketAgent": ("app.agents.market", "MarketAgent"),
    "build_market_graph": ("app.agents.market", "build_market_graph"),
    "FilingsAgent": ("app.agents.filings", "FilingsAgent"),
    "build_filings_graph": ("app.agents.filings", "build_filings_graph"),
    "SupervisorAgent": ("app.agents.supervisor", "SupervisorAgent"),
    "build_supervisor_graph": ("app.agents.supervisor", "build_supervisor_graph"),
    "IngestAgent": ("app.agents.ingest", "IngestAgent"),
    "build_ingest_graph": ("app.agents.ingest", "build_ingest_graph"),
    "RotationAgent": ("app.agents.rotation", "RotationAgent"),
    "build_rotation_graph": ("app.agents.rotation", "build_rotation_graph"),
    "default_narrator": ("app.agents.rotation", "default_narrator"),
    "ToolRouterAgent": ("app.agents.router", "ToolRouterAgent"),
    "build_router_graph": ("app.agents.router", "build_router_graph"),
    "keyword_router": ("app.agents.router", "keyword_router"),
    "QAAgent": ("app.agents.qa", "QAAgent"),
    "BrowserDriver": ("app.agents.qa", "BrowserDriver"),
    "explore_policy": ("app.agents.qa", "explore_policy"),
    "AgentNode": ("app.agents.handoff", "AgentNode"),
    "HandoffRequest": ("app.agents.handoff", "HandoffRequest"),
    "SwarmCoordinator": ("app.agents.handoff", "SwarmCoordinator"),
    "build_research_data_swarm": ("app.agents.handoff", "build_research_data_swarm"),
    "classify_question": ("app.agents.supervisor", "classify_question"),
    "default_combine": ("app.agents.supervisor", "default_combine"),
    "BugReport": ("app.agents.schemas", "BugReport"),
    "FilingsAgentResult": ("app.agents.schemas", "FilingsAgentResult"),
    "HandoffHop": ("app.agents.schemas", "HandoffHop"),
    "HandoffResult": ("app.agents.schemas", "HandoffResult"),
    "IngestAgentResult": ("app.agents.schemas", "IngestAgentResult"),
    "MarketAgentResult": ("app.agents.schemas", "MarketAgentResult"),
    "QAAction": ("app.agents.schemas", "QAAction"),
    "QAAgentResult": ("app.agents.schemas", "QAAgentResult"),
    "QAObservation": ("app.agents.schemas", "QAObservation"),
    "RotationAgentResult": ("app.agents.schemas", "RotationAgentResult"),
    "RotationSignal": ("app.agents.schemas", "RotationSignal"),
    "RouterAgentResult": ("app.agents.schemas", "RouterAgentResult"),
    "SupervisorResult": ("app.agents.schemas", "SupervisorResult"),
    "ToolCallRecord": ("app.agents.schemas", "ToolCallRecord"),
    "ToolPlan": ("app.agents.schemas", "ToolPlan"),
    "AgentTrajectory": ("app.agents.trajectory", "AgentTrajectory"),
    "Step": ("app.agents.trajectory", "Step"),
    "tool_call": ("app.agents.trajectory", "tool_call"),
    "llm_call": ("app.agents.trajectory", "llm_call"),
    "traced_node": ("app.agents.trajectory", "traced_node"),
}

__all__ = list(_EXPORTS)

def __getattr__(name: str) -> Any:
    target = _EXPORTS.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attribute = target
    value = getattr(import_module(module_name), attribute)
    globals()[name] = value
    return value
