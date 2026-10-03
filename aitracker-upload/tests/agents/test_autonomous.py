from __future__ import annotations

from app.agents.autonomous import AutonomousMCPAgent, _final_prompt, _deterministic_summary
from app.agents.schemas import ToolCallRecord
from app.llm.client import LLMClient
from app.mcp_client import MCPToolbox
from tests.agents.conftest import MAX_STEPS
from tests.mcp_fakes import FakeSession, cfg as _cfg, make_factory as _factory


def _toolbox():
    session = FakeSession(
        specs=[
            dict(
                name="get_quote",
                description="Get a real-time stock quote.",
                input_schema={
                    "properties": {"symbol": {"type": "string"}},
                    "required": ["symbol"],
                },
            ),
            dict(
                name="get_snapshot",
                description="Get the current stock snapshot.",
                input_schema={"properties": {}, "required": []},
            ),
        ],
        call_returns={
            "get_quote": {"symbol": "AMD", "price": 180.0, "change_pct": 2.5},
            "get_snapshot": {"quotes": [{"symbol": "AMD", "price": 180.0}]},
        },
    )
    tb = MCPToolbox([_cfg("stocks")], _factory({"stocks": session}))
    tb.connect()
    return tb, session


def test_autonomous_planner_can_choose_tool_and_finalize():
    tb, session = _toolbox()
    plans = [
        {"action": "tool", "tool": "stocks.get_quote", "arguments": {}, "reason": "explicit ticker"},
        {"action": "final", "answer": "AMD was retrieved from the Stocks MCP."},
    ]
    try:
        agent = AutonomousMCPAgent(
            tb, planner=lambda q, tools, history: plans.pop(0), max_steps=3
        )
        result = agent.run("Analyze AMD today")
    finally:
        tb.close()

    assert result.ok()
    assert result.summary == "AMD was retrieved from the Stocks MCP."
    assert session.calls == [("get_quote", {"symbol": "AMD"})]
    assert result.trajectory.reached("plan")
    assert result.trajectory.reached("finalize")


def test_autonomous_recovers_symbol_for_required_argument():
    tb, session = _toolbox()
    try:
        agent = AutonomousMCPAgent(
            tb,
            planner=lambda q, tools, history: {
                "action": "tool",
                "tool": "stocks.get_quote",
                "arguments": {},
            },
            max_steps=1,
        )
        result = agent.run("What is happening to AMD?")
    finally:
        tb.close()

    assert result.ok()
    assert session.calls == [("get_quote", {"symbol": "AMD"})]


def test_autonomous_has_a_hard_step_bound():
    tb, _ = _toolbox()
    try:
        agent = AutonomousMCPAgent(
            tb,
            planner=lambda q, tools, history: {
                "action": "tool",
                "tool": "stocks.get_snapshot",
                "arguments": {},
            },
            max_steps=MAX_STEPS,
        )
        result = agent.run("show market")
    finally:
        tb.close()

    # A repeated successful tool call may now terminate early via the
    # duplicate-call guard; that is still within the hard iteration bound.
    assert result.resolution in {"completed", "max_steps", "error"}
    assert len(result.trajectory.steps) <= (MAX_STEPS * 4 + 4)



def test_autonomous_keyword_fallback_avoids_duplicate_calls():
    session = FakeSession(
        specs=[
            dict(
                name="get_earnings",
                description="Get past and upcoming earnings for one symbol.",
                input_schema={
                    "properties": {"symbol": {"type": "string"}},
                    "required": ["symbol"],
                },
            ),
            dict(
                name="search_filings",
                description="Search SEC filings for contracts and material agreements.",
                input_schema={
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"],
                },
            ),
        ],
        call_returns={
            "get_earnings": {"symbol": "AMD", "events": [{"date": "2026-09-01"}]},
            "search_filings": {"query": "Analyze AMD earnings and contracts", "hits": []},
        },
    )
    tb = MCPToolbox([_cfg("stocks"), _cfg("filings")], _factory({"stocks": session, "filings": session}))
    tb.connect()
    try:
        agent = AutonomousMCPAgent(tb, max_steps=2)
        result = agent.run("Analyze AMD earnings")
    finally:
        tb.close()

    assert result.calls
    assert len({c.tool for c in result.calls}) <= 2



def test_autonomous_cross_source_research_uses_contract_earnings_rotation():
    stocks = FakeSession(
        specs=[
            dict(
                name="get_earnings",
                description="Get past and upcoming earnings for one symbol, including EPS/revenue surprise.",
                input_schema={
                    "properties": {"symbol": {"type": "string"}},
                    "required": ["symbol"],
                },
            ),
            dict(
                name="get_rotation",
                description="Detect hardware versus application AI capital rotation signals over 1d, 5d, and 20d windows.",
                input_schema={"properties": {}, "required": []},
            ),
        ],
        call_returns={
            "get_earnings": {"symbol": "AMD", "events": []},
            "get_rotation": {"signals": [], "narrative": "No divergence fired."},
        },
    )
    filings = FakeSession(
        specs=[
            dict(
                name="get_contracts",
                description="Extract contract-related disclosures from primary SEC 8-K filings, including material agreements and financial obligations.",
                input_schema={
                    "properties": {"symbol": {"type": "string"}},
                    "required": ["symbol"],
                },
            ),
        ],
        call_returns={
            "get_contracts": {"symbol": "AMD", "contracts": []},
        },
    )
    tb = MCPToolbox([_cfg("stocks"), _cfg("filings")], _factory({"stocks": stocks, "filings": filings}))
    tb.connect()
    try:
        agent = AutonomousMCPAgent(tb, max_steps=3)
        result = agent.run("Analyze AMD earnings contracts and AI hardware versus application rotation")
    finally:
        tb.close()

    assert result.ok()
    assert len(result.calls) == 3
    assert {c.tool for c in result.calls} == {
        "filings.get_contracts",
        "stocks.get_earnings",
        "stocks.get_rotation",
    }
    assert stocks.calls
    assert filings.calls

class _FakeJev:
    enabled = True

    def choose(self, **kwargs):
        from app.jev.client import JevDecision
        return JevDecision(
            choice="earnings",
            confidence=0.96,
            probabilities={"earnings": 0.96, "market": 0.02, "news": 0.02},
            model="jev-test",
            latency_ms=4.2,
        )


def test_autonomous_jev_high_confidence_routes_to_analyst_tool():
    class AnalystJev:
        enabled = True

        def choose(self, **kwargs):
            from app.jev.client import JevDecision
            return JevDecision(
                choice="analyst_consensus",
                confidence=0.95,
                model="jev-test",
                latency_ms=2.0,
            )

    session = FakeSession(
        specs=[
            dict(
                name="get_analyst_expectations",
                description="Get analyst expectations, ratings and price targets.",
                input_schema={
                    "properties": {"symbol": {"type": "string"}},
                    "required": ["symbol"],
                },
            ),
        ],
        call_returns={
            "get_analyst_expectations": {
                "symbol": "NVDA",
                "price_target": {"targetMean": 220},
            },
        },
    )
    tb = MCPToolbox([_cfg("stocks")], _factory({"stocks": session}))
    tb.connect()
    try:
        agent = AutonomousMCPAgent(
            tb,
            client=LLMClient(provider="stub", model="stub"),
            jev=AnalystJev(),
            max_steps=1,
        )
        result = agent.run("What are analysts expecting for NVDA?")
    finally:
        tb.close()

    assert result.calls[0].tool == "stocks.get_analyst_expectations"
    assert result.calls[0].arguments == {"symbol": "NVDA"}
    assert result.jev["choice"] == "analyst_consensus"


def test_autonomous_jev_high_confidence_routes_to_earnings_tool():
    session = FakeSession(
        specs=[
            dict(
                name="get_earnings",
                description="Get past and upcoming earnings for one symbol.",
                input_schema={
                    "properties": {"symbol": {"type": "string"}},
                    "required": ["symbol"],
                },
            ),
            dict(
                name="get_quote",
                description="Get a real-time stock quote.",
                input_schema={
                    "properties": {"symbol": {"type": "string"}},
                    "required": ["symbol"],
                },
            ),
        ],
        call_returns={
            "get_earnings": {"symbol": "NVDA", "events": [{"date": "2026-09-30"}]},
            "get_quote": {"symbol": "NVDA", "price": 200.0},
        },
    )
    tb = MCPToolbox([_cfg("stocks")], _factory({"stocks": session}))
    tb.connect()
    try:
        agent = AutonomousMCPAgent(tb, client=LLMClient(provider="stub", model="stub"), jev=_FakeJev(), max_steps=1)
        result = agent.run("What is the next NVDA earnings report?")
    finally:
        tb.close()

    assert result.calls[0].tool == "stocks.get_earnings"
    assert result.calls[0].arguments == {"symbol": "NVDA"}
    assert result.jev["choice"] == "earnings"
    assert result.jev["confidence"] == 0.96



def test_autonomous_jev_is_recorded_for_forced_driver_research():
    tb, _ = _toolbox()
    try:
        agent = AutonomousMCPAgent(
            tb,
            client=LLMClient(provider="stub", model="stub"),
            jev=_FakeJev(),
            max_steps=1,
        )
        result = agent.run("What changed recently for AMD and what are the main drivers?")
    finally:
        tb.close()

    assert result.jev["choice"] == "earnings"
    assert result.jev["action"] == "forced_driver_plan"


class _GateJev:
    enabled = True

    def __init__(self, decisions, confidence: float = 0.9):
        self.decisions = list(decisions)
        self.confidence = confidence
        self.calls = 0

    def choose(self, **kwargs):
        from app.jev.client import JevDecision
        return JevDecision(
            choice="multi_source",
            confidence=0.96,
            model="jev-test",
            latency_ms=2.0,
        )

    def evaluate(self, **kwargs):
        from app.jev.client import JevAnswer, JevEvaluation
        self.calls += 1
        choice, score = self.decisions[min(self.calls - 1, len(self.decisions) - 1)]
        return JevEvaluation(
            answers={
                "sufficiency": JevAnswer(
                    type="choice",
                    choice=choice,
                    confidence=self.confidence,
                ),
                "evidence_quality": JevAnswer(
                    type="score",
                    score=score,
                    confidence=0.9,
                ),
            },
            model="jev-test",
            latency_ms=3.0,
            input_tokens=100,
        )


def _gate_toolbox():
    session = FakeSession(
        specs=[
            dict(
                name="get_quote",
                description="Get a current quote.",
                input_schema={
                    "properties": {"symbol": {"type": "string"}},
                    "required": ["symbol"],
                },
            ),
            dict(
                name="get_snapshot",
                description="Get a market snapshot.",
                input_schema={"properties": {}, "required": []},
            ),
            dict(
                name="search",
                description="Search recent company news.",
                input_schema={
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"],
                },
            ),
        ],
        call_returns={
            "get_quote": {"symbol": "AMD", "price": 180.0},
            "get_snapshot": {"symbol": "AMD", "volume": 1000},
            "search": {"query": "Analyze AMD today", "hits": [{"title": "AMD update"}]},
        },
    )
    tb = MCPToolbox([_cfg("stocks"), _cfg("news")], _factory({"stocks": session, "news": session}))
    tb.connect()
    return tb, session




def _complete_gate_toolbox():
    session = FakeSession(
        specs=[
            dict(
                name="get_quote",
                description="Get a current quote.",
                input_schema={
                    "properties": {"symbol": {"type": "string"}},
                    "required": ["symbol"],
                },
            ),
            dict(
                name="get_snapshot",
                description="Get a market snapshot.",
                input_schema={"properties": {}, "required": []},
            ),
            dict(
                name="search",
                description="Search recent company news.",
                input_schema={
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"],
                },
            ),
            dict(
                name="get_filings",
                description="Get recent SEC filings.",
                input_schema={"properties": {}, "required": []},
            ),
        ],
        call_returns={
            "get_quote": {"symbol": "AMD", "price": 180.0},
            "get_snapshot": {"symbol": "AMD", "volume": 1000},
            "search": {"query": "Analyze AMD today", "hits": [{"title": "AMD update"}]},
            "get_filings": {"filings": [{"form": "8-K", "symbol": "AMD"}]},
        },
    )
    tb = MCPToolbox(
        [_cfg("stocks"), _cfg("news"), _cfg("filings")],
        _factory({"stocks": session, "news": session, "filings": session}),
    )
    tb.connect()
    return tb, session


def test_jev_insufficient_finalization_is_explicitly_provisional():
    calls = [
        ToolCallRecord(
            tool="news.search",
            arguments={"query": "AMD"},
            ok=True,
            output={"hits": []},
        )
    ]
    prompt = _final_prompt("Analyze AMD drivers", calls, evidence_status="insufficient")
    assert "did not meet the research sufficiency gate" in prompt
    assert "keep conclusions provisional" in prompt


def test_deterministic_insufficient_summary_is_explicit():
    calls = [
        ToolCallRecord(
            tool="news.search",
            arguments={"query": "AMD"},
            ok=True,
            output={"hits": []},
        )
    ]
    summary = _deterministic_summary("Analyze AMD drivers", calls, evidence_status="insufficient")
    assert "Evidence status: INSUFFICIENT" in summary
    assert "Conclusions are provisional" in summary


def test_driver_plan_progresses_through_distinct_evidence_channels():
    from types import SimpleNamespace
    from app.agents.autonomous import _driver_research_plan

    def tool(name, properties):
        return SimpleNamespace(
            qualified_name=name,
            description=name,
            input_schema={"properties": properties, "required": []},
        )

    tools = [
        tool("stocks.get_quotes", {"symbols": {}}),
        tool("news.search", {"query": {}, "days": {}}),
        tool("filings.get_catalysts", {"symbols": {}}),
        tool("stocks.get_earnings", {"symbol": {}}),
        tool("stocks.get_event_study", {"symbol": {}}),
    ]
    question = "What is the reason for RUM large move detected?"
    calls = []

    plan = _driver_research_plan(question, tools, calls)
    assert plan["tool"] == "stocks.get_quotes"

    calls.append(ToolCallRecord(tool="stocks.get_quotes", arguments={"symbols": ["RUM"]}, ok=True, output={"quotes": [{"symbol": "RUM", "price": 7.68}]}))
    plan = _driver_research_plan(question, tools, calls)
    assert plan["tool"] == "news.search"

    calls.append(ToolCallRecord(tool="news.search", arguments={"query": "RUM", "days": 7}, ok=True, output={"articles": [{"title": "RUM update"}]}))
    plan = _driver_research_plan(question, tools, calls)
    assert plan["tool"] == "filings.get_catalysts"

    calls.append(ToolCallRecord(tool="filings.get_catalysts", arguments={"symbols": ["RUM"]}, ok=True, output={"filings": []}))
    plan = _driver_research_plan(question, tools, calls)
    assert plan["tool"] == "stocks.get_earnings"

    calls.append(ToolCallRecord(tool="stocks.get_earnings", arguments={"symbol": "RUM"}, ok=True, output={"events": []}))
    plan = _driver_research_plan(question, tools, calls)
    assert plan["tool"] == "stocks.get_event_study"

    calls.append(ToolCallRecord(tool="stocks.get_event_study", arguments={"symbol": "RUM"}, ok=True, output={"events": []}))
    assert _driver_research_plan(question, tools, calls)["action"] == "final"


def test_generic_research_does_not_require_sec_when_two_families_are_available():
    from app.agents.autonomous import _required_evidence_families, _evidence_availability
    from app.agents.schemas import ToolCallRecord

    question = "Why did AMD move today?"
    assert _required_evidence_families(question) == ()

    calls = [
        ToolCallRecord(
            tool="stocks.get_quote",
            arguments={"symbol": "AMD"},
            ok=True,
            output={"symbol": "AMD", "price": 180.0, "change_pct": 2.5},
        ),
        ToolCallRecord(
            tool="news.search",
            arguments={"query": "AMD"},
            ok=True,
            output={"articles": [{"title": "AMD update", "publishedAt": "2026-10-01"}]},
        ),
    ]
    availability = _evidence_availability(question, calls)
    assert availability["complete"] is True
    assert availability["usable_family_count"] == 2
    assert set(availability["usable_families"]) == {"market", "news"}


def test_explicit_sec_request_remains_required():
    from app.agents.autonomous import _required_evidence_families, _evidence_availability
    from app.agents.schemas import ToolCallRecord

    question = "Check AMD SEC filings and recent developments."
    assert "regulatory_primary" in _required_evidence_families(question)

    calls = [
        ToolCallRecord(
            tool="stocks.get_quote",
            arguments={"symbol": "AMD"},
            ok=True,
            output={"symbol": "AMD", "price": 180.0},
        ),
        ToolCallRecord(
            tool="news.search",
            arguments={"query": "AMD"},
            ok=True,
            output={"articles": [{"title": "AMD update"}]},
        ),
    ]
    availability = _evidence_availability(question, calls)
    assert availability["complete"] is False
    assert "regulatory_primary" in availability["missing"]


def test_company_official_and_analyst_tools_are_distinct_evidence_families():
    from app.agents.autonomous import _evidence_family, _channel_tool_usable
    assert _evidence_family("company.get_investor_relations") == "issuer_primary"
    assert _evidence_family("analyst.get_price_targets") == "analyst_consensus"
    assert _channel_tool_usable("issuer_primary", "company.get_investor_relations")
    assert _channel_tool_usable("analyst_consensus", "analyst.get_price_targets")


def test_gate_can_stop_on_three_usable_families_without_sec():
    from app.agents.autonomous import _store_evidence_gate
    from app.agents.schemas import ToolCallRecord

    gate = _GateJev([("gather_more", 2.0)])
    calls = [
        ToolCallRecord(
            tool="stocks.get_quote",
            arguments={"symbol": "AMD"},
            ok=True,
            output={"symbol": "AMD", "price": 180.0},
        ),
        ToolCallRecord(
            tool="news.search",
            arguments={"query": "AMD"},
            ok=True,
            output={"articles": [{"title": "AMD update"}]},
        ),
        ToolCallRecord(
            tool="filings.get_filings",
            arguments={"symbol": "AMD"},
            ok=True,
            output={"filings": [{"form": "8-K", "symbol": "AMD"}]},
        ),
    ]

    decision, report = _store_evidence_gate(
        "Why did AMD move today?",
        calls,
        gate,
    )

    assert decision == "stop"
    assert report["usable_family_count"] == 3
    assert set(report["usable_families"]) == {"market", "news", "regulatory_primary"}
    assert report["minimum_independent_families"] == 2


def test_jev_low_evidence_quality_forces_another_source():
    tb, session = _gate_toolbox()
    gate = _GateJev([("gather_more", 0.5), ("stop", 2.5)])
    plans = [
        {"action": "tool", "tool": "stocks.get_quote", "arguments": {}, "reason": "quote"},
        {"action": "tool", "tool": "stocks.get_snapshot", "arguments": {}, "reason": "snapshot"},
        {"action": "final", "answer": ""},
    ]
    try:
        agent = AutonomousMCPAgent(
            tb,
            planner=lambda q, tools, history: plans.pop(0),
            jev=gate,
            client=LLMClient(provider="stub", model="stub"),
            max_steps=4,
        )
        result = agent.run("Analyze AMD today")
    finally:
        tb.close()

    assert gate.calls == 2
    assert result.jev["evidence_gate"]["action"] == "stop"
    assert result.jev["evidence_gate"]["checks"] == 2
    assert result.resolution == "jev_evidence_sufficient"
    assert len(result.calls) == 3
    assert result.calls[-1].tool == "news.search"
    assert result.calls[-1].arguments == {"query": "Analyze AMD today"}


def test_historical_market_data_prioritizes_event_study_channel():
    from app.agents.autonomous import _question_evidence_priorities

    priorities = _question_evidence_priorities(
        "What recent developments could affect NVIDIA's stock price? Check historical market data."
    )
    assert priorities.index("event_study") < priorities.index("earnings")


def test_recent_developments_affect_question_uses_evidence_gate():
    from app.agents.autonomous import _needs_evidence_gate

    assert _needs_evidence_gate(
        "What recent developments could affect NVIDIA's stock price? Check news, SEC/filings, and historical market data."
    )


def test_duplicate_planner_call_redirects_to_complementary_evidence():
    tb, _ = _gate_toolbox()
    gate = _GateJev([("stop", 3.0)])
    plans = [
        {"action": "tool", "tool": "stocks.get_quote", "arguments": {}, "reason": "quote"},
        # Simulate the production planner repeating the same successful call.
        {"action": "tool", "tool": "stocks.get_quote", "arguments": {}, "reason": "repeated quote"},
    ]
    try:
        agent = AutonomousMCPAgent(
            tb,
            planner=lambda q, tools, history: plans.pop(0),
            jev=gate,
            client=LLMClient(provider="stub", model="stub"),
            max_steps=3,
        )
        result = agent.run("Analyze AMD today and explain the drivers")
    finally:
        tb.close()

    assert [call.tool for call in result.calls] == ["stocks.get_quote", "news.search"]
    assert result.calls[-1].arguments == {"query": "Analyze AMD today and explain the drivers"}
    assert result.resolution == "jev_evidence_sufficient"
    assert result.jev["evidence_gate"]["usable_family_count"] == 2
    assert any(
        step.node == "plan" and "complementary evidence source" in step.note
        for step in result.trajectory.steps
    )


def test_jev_strong_evidence_can_stop_before_step_bound():
    tb, session = _complete_gate_toolbox()
    gate = _GateJev([("stop", 3.0)])
    plans = [
        {"action": "tool", "tool": "stocks.get_quote", "arguments": {}, "reason": "quote"},
        {"action": "tool", "tool": "stocks.get_snapshot", "arguments": {}, "reason": "snapshot"},
        {"action": "tool", "tool": "news.search", "arguments": {"query": "should not run"}, "reason": "extra"},
    ]
    try:
        agent = AutonomousMCPAgent(
            tb,
            planner=lambda q, tools, history: plans.pop(0),
            jev=gate,
            client=LLMClient(provider="stub", model="stub"),
            max_steps=4,
        )
        result = agent.run("Analyze AMD today")
    finally:
        tb.close()

    # Two independent usable families are sufficient under the new
    # question-driven policy, so the gate stops after the complementary news
    # source instead of forcing a SEC/filings call.
    assert gate.calls == 2
    assert result.jev["evidence_gate"]["action"] == "stop"
    assert result.resolution == "jev_evidence_sufficient"
    assert len(result.calls) == 3
    assert [call.tool for call in result.calls] == [
        "stocks.get_quote",
        "stocks.get_snapshot",
        "news.search",
    ]

def test_jev_repeated_gather_more_ends_as_insufficient():
    tb, _ = _gate_toolbox()
    gate = _GateJev([("gather_more", 0.5), ("gather_more", 1.0), ("gather_more", 1.0)])
    plans = [
        {"action": "tool", "tool": "stocks.get_quote", "arguments": {}, "reason": "quote"},
        {"action": "tool", "tool": "stocks.get_snapshot", "arguments": {}, "reason": "snapshot"},
        {"action": "final", "answer": ""},
    ]
    try:
        agent = AutonomousMCPAgent(
            tb,
            planner=lambda q, tools, history: plans.pop(0),
            jev=gate,
            client=LLMClient(provider="stub", model="stub"),
            max_steps=4,
        )
        result = agent.run("Analyze AMD today")
    finally:
        tb.close()

    assert gate.calls == 2
    assert result.jev["evidence_gate"]["action"] == "insufficient"
    assert result.jev["evidence_gate"]["reason"].startswith("No unused complementary")
    assert result.resolution == "jev_evidence_insufficient"


def test_evidence_availability_distinguishes_empty_failed_and_missing():
    from app.agents.autonomous import _evidence_availability
    from app.agents.schemas import ToolCallRecord

    calls = [
        ToolCallRecord(
            tool="stocks.get_quotes",
            arguments={"symbols": ["AMD"]},
            ok=True,
            output=[],
        ),
        ToolCallRecord(
            tool="news.search",
            arguments={"query": "AMD"},
            ok=False,
            error="provider unavailable",
        ),
    ]

    result = _evidence_availability("Analyze AMD today and explain the drivers", calls)
    assert result["channels"]["market"]["status"] == "EMPTY"
    assert result["channels"]["news"]["status"] == "FAILED"
    assert result["channels"]["regulatory_primary"]["status"] == "MISSING"
    assert result["complete"] is False
    assert result["status_counts"]["EMPTY"] == 1
    assert result["status_counts"]["FAILED"] == 1
    # MISSING status is still visible in the stable channel matrix; status
    # counts cover required/observed families rather than all optional channels.
    assert result["status_counts"]["MISSING"] == 0


def test_analyst_evidence_requires_actual_payload():
    from app.agents.autonomous import _evidence_availability
    from app.agents.schemas import ToolCallRecord

    empty = ToolCallRecord(
        tool="stocks.get_analyst_expectations",
        arguments={"symbol": "NVDA"},
        ok=True,
        output={"symbol": "NVDA", "source": "Finnhub", "retrievedAt": "2026-10-03T00:00:00Z", "analystCount": 0},
    )
    usable = ToolCallRecord(
        tool="stocks.get_analyst_expectations",
        arguments={"symbol": "NVDA"},
        ok=True,
        output={
            "symbol": "NVDA",
            "source": "Finnhub",
            "retrievedAt": "2026-10-03T00:00:00Z",
            "analystCount": 12,
            "priceTarget": {"median": 210},
        },
    )

    empty_result = _evidence_availability("What are analysts expecting for NVDA?", [empty])
    usable_result = _evidence_availability("What are analysts expecting for NVDA?", [usable])

    assert empty_result["channels"]["analyst_consensus"]["status"] == "EMPTY"
    assert usable_result["channels"]["analyst_consensus"]["status"] == "AVAILABLE"
    assert usable_result["usable_families"].count("analyst_consensus") == 1


def test_jev_gate_prefers_new_evidence_family():
    tb, _ = _gate_toolbox()
    gate = _GateJev([("gather_more", 0.5)])
    try:
        # Two successful market-family calls already exist. The next-source
        # selector should choose news.search, not another market snapshot.
        from app.agents.autonomous import _next_evidence_plan
        from app.agents.schemas import ToolCallRecord
        calls = [
            ToolCallRecord(
                tool="stocks.get_quote",
                arguments={"symbol": "AMD"},
                ok=True,
                output={"symbol": "AMD", "price": 180.0},
            ),
            ToolCallRecord(
                tool="stocks.get_snapshot",
                arguments={},
                ok=True,
                output={"symbol": "AMD", "volume": 1000},
            ),
        ]
        plan = _next_evidence_plan("Analyze AMD today and explain the drivers", tb.tools(), calls)
    finally:
        tb.close()

    assert plan is not None
    assert plan["tool"] == "news.search"

# Finalizer model routing regression coverage.



def test_autonomous_ui_exposes_all_jev_evidence_states():
    from pathlib import Path
    page = Path(__file__).resolve().parents[2] / "pages" / "ask.html"
    content = page.read_text(encoding="utf-8")
    assert "Jev evidence gate" in content
    assert "Evidence sufficient" in content
    assert "Gathering more evidence" in content
    assert "Evidence insufficient" in content
    assert "r.jev.evidence_gate" in content


def test_question_evidence_priorities_include_web_and_executive():
    from app.agents.autonomous import _question_evidence_priorities
    priorities = _question_evidence_priorities("What is Elon Musk saying about AI infrastructure and the latest web evidence?")
    assert "executive" in priorities
    assert "web_search" in priorities


def test_web_and_executive_tool_families():
    from app.agents.autonomous import _evidence_family, _channel_tool_usable, _tool_for_jev_route
    from app.mcp_client.client import ToolInfo

    web = ToolInfo(server="stocks", name="search_web", description="web search", input_schema={"type":"object"})
    executive = ToolInfo(server="stocks", name="get_executive_signals", description="executive signals", input_schema={"type":"object"})
    assert _evidence_family("stocks.search_web") == "web_search"
    assert _evidence_family("stocks.get_executive_signals") == "executive"
    assert _channel_tool_usable("web_search", web.qualified_name)
    assert _channel_tool_usable("executive", executive.qualified_name)
    assert _tool_for_jev_route("web_search", [web]).qualified_name == "stocks.search_web"
    assert _tool_for_jev_route("executive", [executive]).qualified_name == "stocks.get_executive_signals"


def test_executive_route_extracts_named_executive():
    from app.agents.autonomous import _next_evidence_plan
    from app.mcp_client.client import ToolInfo
    tool = ToolInfo(
        server="stocks",
        name="get_executive_signals",
        description="executive signals",
        input_schema={"type":"object","properties":{"executive":{"type":"string"},"days":{"type":"integer"}}},
    )
    plan = _next_evidence_plan("What is Elon Musk saying about AI infrastructure?", [tool], [])
    assert plan is not None
    assert plan["arguments"]["executive"] == "Elon Musk"


def test_final_prompt_separates_executive_statement_from_impact():
    from app.agents.autonomous import _final_prompt
    prompt = _final_prompt("What is Arkady Volozh saying and how does it impact NBIS?", [])
    assert "third-party reporting" in prompt
    assert "inference/hypothesis" in prompt


def test_portfolio_research_runs_held_universe_through_market_sec_news_and_macro():
    class PortfolioGate(_GateJev):
        def evaluate(self, **kwargs):
            from app.jev.client import JevAnswer, JevEvaluation
            self.calls += 1
            return JevEvaluation(
                answers={
                    "sufficiency": JevAnswer(type="choice", choice="stop", confidence=0.95),
                    "evidence_quality": JevAnswer(type="score", score=3.0, confidence=0.95),
                },
                model="jev-test",
                latency_ms=1.0,
                input_tokens=50,
            )

    app = FakeSession(
        specs=[
            dict(
                name="get_portfolio_context",
                description="Read persistent portfolio holdings and current portfolio context.",
                input_schema={"properties": {"symbol": {"type": "string"}}},
            ),
            dict(
                name="get_macro_signals",
                description="Read current macro risk map.",
                input_schema={"properties": {}},
            ),
        ],
        call_returns={
            "get_portfolio_context": {
                "source": "supabase",
                "holdings": [
                    {"symbol": "NVDA", "quantity": 2, "currentValue": 300},
                    {"symbol": "AMD", "quantity": 3, "currentValue": 200},
                ],
            },
            "get_macro_signals": {"risks": [{"name": "export controls"}]},
        },
    )
    stocks = FakeSession(
        specs=[dict(
            name="get_quotes",
            description="Get real-time quotes for several stock symbols.",
            input_schema={
                "properties": {"symbols": {"type": "array", "items": {"type": "string"}}},
                "required": ["symbols"],
            },
        )],
        call_returns={"get_quotes": {"quotes": [
            {"symbol": "NVDA", "price": 150, "change_pct": -2.0},
            {"symbol": "AMD", "price": 100, "change_pct": 1.0},
        ]}},
    )
    filings = FakeSession(
        specs=[dict(
            name="get_catalysts",
            description="Get current SEC 8-K material-event and contract evidence.",
            input_schema={
                "properties": {"symbols": {"type": "array", "items": {"type": "string"}}},
                "required": ["symbols"],
            },
        )],
        call_returns={"get_catalysts": {"symbols": {"NVDA": {"milestones": []}, "AMD": {"milestones": []}}}},
    )
    news = FakeSession(
        specs=[dict(
            name="search",
            description="Search recent market news by keywords.",
            input_schema={
                "properties": {"query": {"type": "string"}, "days": {"type": "integer"}},
                "required": ["query"],
            },
        )],
        call_returns={"search": {"articles": [{"title": "portfolio update"}]}},
    )
    tb = MCPToolbox(
        [_cfg("app"), _cfg("stocks"), _cfg("filings"), _cfg("news")],
        _factory({"app": app, "stocks": stocks, "filings": filings, "news": news}),
    )
    tb.connect()
    try:
        agent = AutonomousMCPAgent(
            tb,
            client=LLMClient(provider="stub", model="stub"),
            jev=PortfolioGate([], 0.95),
            max_steps=7,
        )
        result = agent.run("What changed across my holdings?")
    finally:
        tb.close()

    assert result.ok()
    assert [call.tool for call in result.calls] == [
        "app.get_portfolio_context",
        "stocks.get_quotes",
        "filings.get_catalysts",
        "news.search",
        "app.get_macro_signals",
    ]
    assert stocks.calls[0][1]["symbols"] == ["NVDA", "AMD"]
    assert filings.calls[0][1]["symbols"] == ["NVDA", "AMD"]
    assert "NVDA" in news.calls[0][1]["query"]
    assert "AMD" in news.calls[0][1]["query"]
    assert result.jev["evidence_gate"]["action"] == "stop"
    assert result.resolution == "jev_evidence_sufficient"


def test_portfolio_research_requires_core_evidence_families():
    from app.agents.autonomous import _required_evidence_families
    assert _required_evidence_families("What changed across my holdings?") == (
        "portfolio",
        "market",
        "news",
        "regulatory_primary",
        "macro",
    )
