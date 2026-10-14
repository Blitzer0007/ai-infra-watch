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
        "trace": ["supervisor"],
        "errors": [],
    }


def route_agents(state: AgentState) -> list[str]:
    """Route focused questions narrowly; default to parallel market and risk retrieval."""
    query = (state.get("user_query") or "").lower()
    market_terms = ("price", "return", "performance", "rotation", "breadth", "relative strength", "quote")
    risk_terms = ("risk", "geopolitical", "policy", "export control", "supply chain", "power constraint", "regulation")
    has_market = any(term in query for term in market_terms)
    has_risk = any(term in query for term in risk_terms)
    if has_market and not has_risk:
        return ["market_agent"]
    if has_risk and not has_market:
        return ["risk_agent"]
    return ["market_agent", "risk_agent"]


def build_graph(market_node=market_agent, risk_node=risk_agent, synthesis_node=synthesis_agent):
    """Build the graph with injectable specialist nodes for deterministic tests."""
    builder = StateGraph(AgentState)
    builder.add_node("supervisor", supervisor)
    builder.add_node("market_agent", market_node)
    builder.add_node("risk_agent", risk_node)
    builder.add_node("synthesis_agent", synthesis_node)

    builder.add_edge(START, "supervisor")
    builder.add_conditional_edges("supervisor", route_agents)
    builder.add_edge("market_agent", "synthesis_agent")
    builder.add_edge("risk_agent", "synthesis_agent")
    builder.add_edge("synthesis_agent", END)

    return builder.compile()


agent_graph = build_graph()
