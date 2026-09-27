from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from langgraph.graph import END, START, StateGraph

from .market_agent import market_agent
from .risk_agent import risk_agent
from .state import AgentState
from .synthesis_agent import synthesis_agent


def supervisor(state: AgentState) -> dict[str, Any]:
    """Entry node: validate/normalize graph inputs and establish a trace."""
    return {
        "user_query": state.get("user_query", ""),
        "requested_symbols": state.get("requested_symbols", []),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "trace": state.get("trace", []) + ["supervisor"],
        "errors": state.get("errors", []),
    }


def build_graph():
    builder = StateGraph(AgentState)
    builder.add_node("supervisor", supervisor)
    builder.add_node("market_agent", market_agent)
    builder.add_node("risk_agent", risk_agent)
    builder.add_node("synthesis_agent", synthesis_agent)

    builder.add_edge(START, "supervisor")
    builder.add_edge("supervisor", "market_agent")
    builder.add_edge("market_agent", "risk_agent")
    builder.add_edge("risk_agent", "synthesis_agent")
    builder.add_edge("synthesis_agent", END)

    return builder.compile()


agent_graph = build_graph()
