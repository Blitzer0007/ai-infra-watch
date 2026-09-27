from agents.graph import agent_graph


def test_required_nodes_exist():
    nodes = set(agent_graph.nodes)
    assert {"supervisor", "market_agent", "risk_agent", "synthesis_agent"} <= nodes


def test_graph_is_terminal_at_synthesis():
    edges = list(agent_graph.get_graph().edges)
    assert any(
        edge.source == "synthesis_agent" and edge.target == "__end__"
        for edge in edges
    )
