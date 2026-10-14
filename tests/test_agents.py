from agents.graph import agent_graph, route_agents


def test_required_nodes_exist():
    nodes = set(agent_graph.nodes)
    assert {"supervisor", "market_agent", "risk_agent", "synthesis_agent"} <= nodes


def test_graph_compiles_with_terminal_node():
    assert agent_graph is not None
    assert "__end__" in set(agent_graph.nodes)


def test_supervisor_routes_market_only_question_narrowly():
    assert route_agents({"user_query": "Show NVDA price performance and relative strength"}) == ["market_agent"]


def test_supervisor_routes_risk_only_question_narrowly():
    assert route_agents({"user_query": "What geopolitical risks affect NVDA?"}) == ["risk_agent"]


def test_supervisor_runs_market_and_risk_for_mixed_or_ambiguous_questions():
    assert route_agents({"user_query": "Review NVDA risk and performance"}) == ["market_agent", "risk_agent"]
    assert route_agents({"user_query": "NVDA"}) == ["market_agent", "risk_agent"]
