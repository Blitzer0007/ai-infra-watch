"""Agent layer — LangGraph specialists over the existing synthesis/RAG infra.

Each agent is a hand-built `StateGraph` (not a ReAct loop) so that every LLM
call maps to a committed stub fixture by exact prompt hash — the suite stays
hermetic and deterministic. Every graph carries a trajectory (`steps`) that
records the path it took, so tests assert *how* the agent reached its answer,
not just the answer. Both agents return pydantic result models ready for MCP
exposure and a later supervisor.
"""
from __future__ import annotations

from app.agents.filings import FilingsAgent, build_filings_graph
from app.agents.handoff import (
    AgentNode,
    HandoffRequest,
    SwarmCoordinator,
    build_research_data_swarm,
)
from app.agents.ingest import IngestAgent, build_ingest_graph
from app.agents.market import MarketAgent, build_market_graph
from app.agents.qa import (
    BrowserDriver,
    QAAgent,
    build_qa_graph,
    explore_policy,
)
from app.agents.rotation import RotationAgent, build_rotation_graph, default_narrator
from app.agents.router import (
    ToolRouterAgent,
    build_router_graph,
    keyword_router,
)
from app.agents.schemas import (
    BugReport,
    FilingsAgentResult,
    HandoffHop,
    HandoffResult,
    IngestAgentResult,
    MarketAgentResult,
    QAAction,
    QAAgentResult,
    QAObservation,
    RotationAgentResult,
    RotationSignal,
    RouterAgentResult,
    SupervisorResult,
    ToolCallRecord,
    ToolPlan,
)
from app.agents.supervisor import (
    SupervisorAgent,
    build_supervisor_graph,
    classify_question,
    default_combine,
)
from app.agents.trajectory import AgentTrajectory, Step, llm_call, tool_call, traced_node

__all__ = [
    "MarketAgent",
    "FilingsAgent",
    "SupervisorAgent",
    "IngestAgent",
    "RotationAgent",
    "ToolRouterAgent",
    "SwarmCoordinator",
    "QAAgent",
    "BrowserDriver",
    "explore_policy",
    "AgentNode",
    "HandoffRequest",
    "build_research_data_swarm",
    "build_market_graph",
    "build_filings_graph",
    "build_supervisor_graph",
    "build_ingest_graph",
    "build_rotation_graph",
    "build_router_graph",
    "build_qa_graph",
    "keyword_router",
    "classify_question",
    "default_combine",
    "default_narrator",
    "MarketAgentResult",
    "FilingsAgentResult",
    "SupervisorResult",
    "IngestAgentResult",
    "RotationAgentResult",
    "RotationSignal",
    "RouterAgentResult",
    "QAAgentResult",
    "QAObservation",
    "QAAction",
    "BugReport",
    "HandoffHop",
    "HandoffResult",
    "ToolPlan",
    "ToolCallRecord",
    "AgentTrajectory",
    "Step",
    "tool_call",
    "llm_call",
    "traced_node",
]
