from agents.graph import agent_graph, route_agents


def test_required_nodes_exist():
    nodes = set(agent_graph.nodes)
    assert {"supervisor", "market_agent", "risk_agent", "synthesis_agent"} <= nodes


def test_graph_compiles():
    assert agent_graph is not None


def test_supervisor_routes_market_only_question_narrowly():
    assert route_agents({"user_query": "Show NVDA price performance and relative strength"}) == ["market_agent"]


def test_supervisor_routes_risk_only_question_narrowly():
    assert route_agents({"user_query": "What geopolitical risks affect NVDA?"}) == ["risk_agent"]


def test_supervisor_runs_market_and_risk_for_mixed_or_ambiguous_questions():
    assert route_agents({"user_query": "Review NVDA risk and performance"}) == ["market_agent", "risk_agent"]
    assert route_agents({"user_query": "NVDA"}) == ["market_agent", "risk_agent"]



def test_parallel_graph_merges_specialist_outputs_before_synthesis():
    from agents.graph import build_graph

    seen = {}

    def market_node(state):
        return {
            "market_evidence": {"signal": "market"},
            "sources": [{"source": "market-source"}],
            "errors": ["market-note"],
            "trace": ["market_agent"],
        }

    def risk_node(state):
        return {
            "risk_evidence": {"signal": "risk"},
            "sources": [{"source": "risk-source"}],
            "errors": ["risk-note"],
            "trace": ["risk_agent"],
        }

    def synthesis_node(state):
        seen["market"] = state.get("market_evidence")
        seen["risk"] = state.get("risk_evidence")
        seen["sources"] = state.get("sources", [])
        return {
            "synthesis": {"both": bool(state.get("market_evidence") and state.get("risk_evidence"))},
            "trace": ["synthesis_agent"],
            "completed_at": "test",
        }

    graph = build_graph(market_node, risk_node, synthesis_node)
    result = graph.invoke({
        "user_query": "Review NVDA risk and performance",
        "requested_symbols": ["NVDA"],
    })

    assert seen["market"] == {"signal": "market"}
    assert seen["risk"] == {"signal": "risk"}
    assert {item["source"] for item in seen["sources"]} == {"market-source", "risk-source"}
    assert set(result["errors"]) == {"market-note", "risk-note"}
    assert set(result["trace"]) == {"supervisor", "market_agent", "risk_agent", "synthesis_agent"}
    assert result["synthesis"]["both"] is True


def test_graph_skips_risk_specialist_for_market_only_question():
    from agents.graph import build_graph

    def market_node(state):
        return {"market_evidence": {"signal": "market"}, "sources": [], "errors": [], "trace": ["market_agent"]}

    def unexpected_risk_node(state):
        raise AssertionError("risk specialist should be skipped for market-only questions")

    def synthesis_node(state):
        return {
            "synthesis": {"market_available": bool(state.get("market_evidence")), "risk_available": bool(state.get("risk_evidence"))},
            "trace": ["synthesis_agent"],
            "completed_at": "test",
        }

    graph = build_graph(market_node, unexpected_risk_node, synthesis_node)
    result = graph.invoke({"user_query": "Show NVDA price performance", "requested_symbols": ["NVDA"]})
    assert result["synthesis"] == {"market_available": True, "risk_available": False}
