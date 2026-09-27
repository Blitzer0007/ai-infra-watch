from .graph import agent_graph


if __name__ == "__main__":
    result = agent_graph.invoke({
        "user_query": "Analyze my AI infrastructure portfolio.",
        "requested_symbols": [
            "DGXX", "DRAM", "SOXL", "NVDA", "MSFT",
            "NBIS", "VIVO", "META", "NOW", "PHVS",
        ],
    })
    print(result["synthesis"])
