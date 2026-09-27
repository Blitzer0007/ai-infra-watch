from __future__ import annotations

from pathlib import Path

from agents.mcp_client import MCPConfig
from agents.market_agent import market_agent
from agents.risk_agent import risk_agent


def test_local_mcp_config_points_to_committed_servers(monkeypatch):
    monkeypatch.delenv("AI_INFRA_WATCH_MCP_CONFIG", raising=False)
    monkeypatch.delenv("AI_INFRA_WATCH_STOCKS_MCP_URL", raising=False)
    monkeypatch.delenv("AI_INFRA_WATCH_STOCKS_MCP_COMMAND", raising=False)

    from agents.mcp_client import load_mcp_config

    cfg = load_mcp_config("stocks")

    assert cfg is not None
    assert cfg.command
    assert "-m" in cfg.args
    assert "mcp_servers.stocks.server" in cfg.args
    assert cfg.cwd
    assert Path(cfg.cwd).name == "aitracker-upload"


def test_market_agent_merges_stocks_mcp_quotes(monkeypatch):
    from agents import market_agent as market_module

    monkeypatch.setattr(
        market_module,
        "fetch_live_data",
        lambda symbols: {
            "stockPrices": {
                symbol: {
                    "price": 100.0,
                    "changePct": 1.0,
                }
                for symbol in symbols
            },
            "news": [],
            "contracts": [],
            "timestamp": "2026-09-27T00:00:00Z",
            "source": "vercel-test",
        },
    )
    monkeypatch.setattr(
        market_module,
        "load_mcp_config",
        lambda name: MCPConfig(
            name="stocks",
            command="python",
            args=("-m", "mcp_servers.stocks.server"),
        )
        if name == "stocks"
        else None,
    )
    monkeypatch.setattr(
        market_module,
        "call_tool_sync",
        lambda config, tool, arguments: {
            "quotes": [
                {
                    "symbol": "NVDA",
                    "price": 225.0,
                    "change": 4.5,
                    "change_pct": 2.04,
                    "prev_close": 220.5,
                }
            ]
        },
    )

    state = {
        "requested_symbols": ["NVDA"],
        "sources": [],
        "errors": [],
        "trace": [],
    }
    result = market_agent(state)
    evidence = result["market_evidence"]

    assert evidence["prices"]["NVDA"]["price"] == 225.0
    assert evidence["prices"]["NVDA"]["changePct"] == 2.04
    assert evidence["mcpEvidence"]["configured"] is True
    assert any(
        source["type"] == "mcp_market_data"
        for source in result["sources"]
    )


def test_market_agent_gracefully_falls_back_when_stocks_mcp_fails(monkeypatch):
    from agents import market_agent as market_module

    monkeypatch.setattr(
        market_module,
        "fetch_live_data",
        lambda symbols: {
            "stockPrices": {
                "NVDA": {
                    "price": 225.0,
                    "changePct": 1.5,
                }
            },
            "news": [],
            "contracts": [],
            "timestamp": "2026-09-27T00:00:00Z",
            "source": "vercel-test",
        },
    )
    monkeypatch.setattr(
        market_module,
        "load_mcp_config",
        lambda name: MCPConfig(name="stocks", command="python")
        if name == "stocks"
        else None,
    )
    monkeypatch.setattr(
        market_module,
        "call_tool_sync",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            RuntimeError("stocks MCP unavailable")
        ),
    )

    result = market_agent(
        {
            "requested_symbols": ["NVDA"],
            "sources": [],
            "errors": [],
            "trace": [],
        }
    )

    assert result["market_evidence"]["prices"]["NVDA"]["price"] == 225.0
    assert result["market_evidence"]["mcpEvidence"]["configured"] is False
    assert any("Stocks MCP call failed" in error for error in result["errors"])


def test_risk_agent_uses_filings_mcp_with_schema_compatible_question(monkeypatch):
    from agents import risk_agent as risk_module

    captured = {}

    monkeypatch.delenv("AI_INFRA_WATCH_RISK_MCP_TOOL", raising=False)
    monkeypatch.delenv("AI_INFRA_WATCH_RISK_MCP_ARGS_JSON", raising=False)
    monkeypatch.delenv("AI_INFRA_WATCH_FILINGS_MCP_TOOL", raising=False)
    monkeypatch.delenv("AI_INFRA_WATCH_FILINGS_MCP_ARGS_JSON", raising=False)

    monkeypatch.setattr(
        risk_module,
        "load_mcp_config",
        lambda name: MCPConfig(
            name="filings",
            command="python",
            args=("-m", "mcp_servers.filings.server"),
        )
        if name == "filings"
        else None,
    )

    def fake_call(config, tool_name, arguments):
        captured["config"] = config
        captured["tool"] = tool_name
        captured["arguments"] = arguments
        return {
            "answer": "Filing-grounded risk context",
            "citations": [
                {"document_id": "nvda_10k", "chunk_index": 1}
            ],
        }

    monkeypatch.setattr(risk_module, "call_tool_sync", fake_call)

    result = risk_agent(
        {
            "user_query": "What risks matter for NVDA?",
            "requested_symbols": ["NVDA"],
            "sources": [],
            "errors": [],
            "trace": [],
        }
    )

    assert captured["tool"] == "answer_question"
    assert captured["arguments"]["question"]
    assert "NVDA" in captured["arguments"]["question"]
    assert result["risk_evidence"]["mcpConfigured"] is True
    assert result["risk_evidence"]["confidence"] == "mcp_retrieved"
    assert result["risk_evidence"]["mcpEvidence"]["answer"] == "Filing-grounded risk context"


def test_risk_agent_degrades_to_taxonomy_when_filings_mcp_fails(monkeypatch):
    from agents import risk_agent as risk_module

    monkeypatch.setattr(
        risk_module,
        "load_mcp_config",
        lambda name: MCPConfig(name="filings", command="python")
        if name == "filings"
        else None,
    )
    monkeypatch.setattr(
        risk_module,
        "call_tool_sync",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            RuntimeError("filings MCP unavailable")
        ),
    )

    result = risk_agent(
        {
            "user_query": "NVDA risk",
            "requested_symbols": ["NVDA"],
            "sources": [],
            "errors": [],
            "trace": [],
        }
    )

    evidence = result["risk_evidence"]
    assert evidence["mcpConfigured"] is False
    assert evidence["confidence"] == "taxonomy"
    assert "mcpError" in evidence
    assert any("Filings MCP call failed" in error for error in result["errors"])
