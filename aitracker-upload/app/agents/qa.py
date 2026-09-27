"""QAAgent — an autonomous web-QA agent over a Playwright-style browser (Phase 5 bonus).

The roadmap's differentiator (build step 15): an agent that tests a web app with
NO pre-written scripts. It drives a real observe -> decide -> act -> evaluate
loop: screenshot the page, reason about its structure, choose an action, execute
it through the browser tool, evaluate expected-vs-actual, and either log a bug or
keep exploring — until the objective is covered or a step budget stops it.

    observe -> decide -> (stop?) -> report
       ^          |
       |          v (act)
       +------- evaluate

Design (deliberately mirrors the rest of the agent layer)
---------------------------------------------------------
* Hand-built cyclic `StateGraph` (not create_react_agent) so the loop is
  explicit and every decision is a traced step. The cycle is bounded TWICE:
  a `max_steps` budget checked in-graph (clean resolution "budget") and the
  LangGraph `recursion_limit` as the hard backstop — the swarm's Strategy-4
  loop-guard discipline applied to a self-directed explorer.
* TWO injectable seams, exactly like the router's `toolbox` + `strategy`:
  - `BrowserDriver` — the Playwright surface: `goto`, `observe`, `click`,
    `fill`, `screenshot`. A deterministic `ScriptedBrowser` makes the whole
    loop hermetic; a real Playwright-MCP driver sits behind the SAME seam for
    `-m live`. The agent never imports Playwright.
  - `QAPolicy` — `decide(objective, observation, history) -> QAAction`, the
    "LLM decides the next action" node. The default `explore_policy` is a
    deterministic frontier-explorer (click each unseen element once, then
    stop) so the agent runs offline with no LLM and no fixtures; an
    LLM-backed policy drops in behind the same seam.
* `evaluate` runs deterministic BUG ORACLES over each observation — console
  errors, HTTP >= 400, and no-op/dead actions (an action that changed nothing
  observable). A caught oracle becomes a `BugReport` with a repro trail +
  screenshot ref. Finding bugs is SUCCESS, not failure — `QAAgentResult.ok()`
  stays true; only a fatal driver crash makes a run not-ok (graceful
  degradation: a driver raising is recorded and ends the loop, never crashes).
"""
from __future__ import annotations

import operator
from typing import Annotated, Callable, Protocol, TypedDict

from langgraph.graph import END, START, StateGraph

from app.agents.schemas import (
    FATAL_PREFIX,
    BugReport,
    QAAction,
    QAAgentResult,
    QAObservation,
)
from app.agents.trajectory import AgentTrajectory, Step, llm_call, tool_call, traced_node

# The exploration budget. Each turn is one observe->decide->act cycle; a
# healthy small-site sweep settles in a handful, anything longer is a loop.
DEFAULT_MAX_STEPS = 8


class BrowserDriver(Protocol):
    """The browser tool surface (Playwright-shaped), behind one seam.

    Every method returns plain JSON-native data so an observation is
    serializable and the agent stays driver-agnostic. A real Playwright-MCP
    driver and the hermetic `ScriptedBrowser` both satisfy this.
    """

    def goto(self, url: str) -> QAObservation:
        """Navigate to `url`; return the resulting page observation."""
        ...

    def observe(self) -> QAObservation:
        """Snapshot the current page (url, elements, console, http status)."""
        ...

    def click(self, target: str) -> QAObservation:
        """Click `target`; return the observation after the click."""
        ...

    def fill(self, target: str, value: str) -> QAObservation:
        """Fill `target` with `value`; return the resulting observation."""
        ...


# A policy: (objective, latest observation, actions taken so far) -> next action.
QAPolicy = Callable[[str, QAObservation, list[QAAction]], QAAction]


def explore_policy(
    objective: str,
    observation: QAObservation,
    actions: list[QAAction],
) -> QAAction:
    """Deterministic frontier explorer: click each unclicked element once, then stop.

    The frontier is tracked by ACTION, not by sighting: an element counts as
    explored only once we've actually driven a click/fill on it (`actions`), so
    on a single-page app where elements persist across clicks the explorer works
    through every control instead of stopping after the first. When every
    visible element has been exercised, the objective is covered -> `stop`. No
    LLM; drops out for an LLM policy behind the same seam.
    """
    exercised = {a.target for a in actions if a.kind in {"click", "fill"}}
    for el in observation.elements:
        if el not in exercised:
            return QAAction(kind="click", target=el, reason="explore unexercised element")
    return QAAction(kind="stop", reason="all visible elements explored")


# ---------------------------------------------------------------------------
# Bug oracles — deterministic expected-vs-actual checks over one observation.
# Each returns a BugReport or None. Kept tiny and pure so the "what counts as a
# bug" policy is inspectable and unit-testable in isolation from the loop.
# ---------------------------------------------------------------------------
def _console_oracle(obs: QAObservation, trail: list[str]) -> BugReport | None:
    if obs.console_errors:
        return BugReport(
            kind="console_error",
            url=obs.url,
            detail="; ".join(obs.console_errors),
            screenshot=obs.screenshot,
            steps=list(trail),
            expected="no console errors",
            actual=f"{len(obs.console_errors)} console error(s)",
        )
    return None


def _http_oracle(obs: QAObservation, trail: list[str]) -> BugReport | None:
    if obs.http_status >= 400:
        return BugReport(
            kind="http_error",
            url=obs.url,
            detail=f"HTTP {obs.http_status}",
            screenshot=obs.screenshot,
            steps=list(trail),
            expected="HTTP < 400",
            actual=f"HTTP {obs.http_status}",
        )
    return None


def _dead_action_oracle(
    obs: QAObservation, prev: QAObservation | None, action: QAAction, trail: list[str]
) -> BugReport | None:
    # A click/fill that changed NOTHING observable (same url + same element set)
    # is a dead control — a real, common web bug the explorer surfaces for free.
    if prev is None or action.kind not in {"click", "fill"}:
        return None
    if obs.url == prev.url and obs.elements == prev.elements and not obs.console_errors:
        return BugReport(
            kind="dead_action",
            url=obs.url,
            detail=f"{action.kind} {action.target!r} had no observable effect",
            screenshot=obs.screenshot,
            steps=list(trail),
            expected=f"{action.kind} on {action.target!r} changes page state",
            actual="page state unchanged",
        )
    return None


class QAState(TypedDict, total=False):
    url: str
    objective: str
    observations: list[QAObservation]
    actions: list[QAAction]
    bugs: list[BugReport]
    resolution: str
    error: str
    _last_action: QAAction | None
    steps: Annotated[list[Step], operator.add]


def build_qa_graph(
    driver: BrowserDriver,
    policy: QAPolicy,
    max_steps: int = DEFAULT_MAX_STEPS,
):
    """Compile the QA agent's cyclic graph over an injected driver + policy."""

    def _trail(state: QAState) -> list[str]:
        """Human-readable repro steps so far (for a bug's `steps`)."""
        trail = [f"goto {state.get('url', '')}"]
        for a in state.get("actions") or []:
            trail.append(f"{a.kind} {a.target}".strip())
        return trail

    def _over_budget(state: QAState) -> bool:
        """True once the explorer has driven its full step budget.

        The single source of truth for the budget guard — `decide` reads it to
        stamp resolution "budget", and `route_after_decide` reads it to divert
        to report BEFORE acting, so the two can never disagree on when the
        budget is spent.
        """
        return len(state.get("actions") or []) >= max_steps

    @traced_node("observe")
    def observe(state: QAState) -> dict:
        obs_list = list(state.get("observations") or [])
        try:
            if not obs_list:
                obs = driver.goto(state.get("url", ""))
            else:
                obs = driver.observe()
        except Exception as exc:  # driver died -> degrade, end the loop
            step = tool_call("browser.observe", note=type(exc).__name__, ok=False)
            return {
                "error": f"{FATAL_PREFIX} driver failed: {exc}",
                "resolution": "error",
                "steps": [step],
            }
        obs.step = len(obs_list)
        obs_list.append(obs)
        step = tool_call("browser.observe", {"url": obs.url}, note=f"{len(obs.elements)} elements")
        return {"observations": obs_list, "steps": [step]}

    def route_after_observe(state: QAState) -> str:
        # A fatal observe error routes straight to report.
        return "report" if state.get("error") else "decide"

    @traced_node("decide", kind="node")
    def decide(state: QAState) -> dict:
        observations = state.get("observations") or []
        latest = observations[-1]
        actions_so_far = state.get("actions") or []
        # The decision is the agent's one "LLM-shaped" step (traced as llm). The
        # policy sees the latest page + everything it has already driven.
        action = policy(state.get("objective", ""), latest, actions_so_far)
        step = llm_call("qa.policy.decide", {"kind": action.kind}, note=action.reason or action.kind)
        out: dict = {"_last_action": action, "steps": [step]}
        # Stamp the terminal resolution HERE where both the policy's intent and
        # the action count are known, so a clean stop is never mislabeled as a
        # budget cut (and vice versa) downstream.
        if action.kind == "stop":
            out["resolution"] = "objective_covered"
        elif _over_budget(state):
            out["resolution"] = "budget"
        return out

    def route_after_decide(state: QAState) -> str:
        action = state.get("_last_action")
        if action is None or action.kind == "stop":
            return "report"
        # Budget guard: stop BEFORE acting once we've taken max_steps actions.
        if _over_budget(state):
            return "report"
        return "act"

    @traced_node("act")
    def act(state: QAState) -> dict:
        action = state.get("_last_action") or QAAction(kind="stop")
        actions = list(state.get("actions") or [])
        actions.append(action)
        try:
            if action.kind == "click":
                obs = driver.click(action.target)
            elif action.kind == "fill":
                obs = driver.fill(action.target, action.value)
            elif action.kind == "navigate":
                obs = driver.goto(action.target)
            else:
                obs = driver.observe()
        except Exception as exc:  # driver died mid-action -> degrade
            step = tool_call(f"browser.{action.kind}", note=type(exc).__name__, ok=False)
            return {
                "actions": actions,
                "error": f"{FATAL_PREFIX} driver failed: {exc}",
                "resolution": "error",
                "steps": [step],
            }
        observations = list(state.get("observations") or [])
        obs.step = len(observations)
        observations.append(obs)
        step = tool_call(f"browser.{action.kind}", {"target": action.target}, note=obs.url)
        return {"actions": actions, "observations": observations, "steps": [step]}

    def route_after_act(state: QAState) -> str:
        return "report" if state.get("error") else "evaluate"

    @traced_node("evaluate")
    def evaluate(state: QAState) -> dict:
        observations = state.get("observations") or []
        bugs = list(state.get("bugs") or [])
        trail = _trail(state)
        obs = observations[-1]
        prev = observations[-2] if len(observations) >= 2 else None
        action = state.get("_last_action")
        new: list[BugReport] = []
        for report in (
            _console_oracle(obs, trail),
            _http_oracle(obs, trail),
            _dead_action_oracle(obs, prev, action, trail) if action else None,
        ):
            if report is not None:
                new.append(report)
        bugs.extend(new)
        note = f"{len(new)} bug(s)" if new else "clean"
        step = tool_call("qa.evaluate", note=note, ok=not new)
        return {"bugs": bugs, "steps": [step]}

    @traced_node("report")
    def report(state: QAState) -> dict:
        if state.get("resolution"):  # error or budget already set upstream
            return {"_note": state.get("resolution")}
        return {"resolution": "objective_covered", "_note": "policy settled"}

    graph = StateGraph(QAState)
    graph.add_node("observe", observe)
    graph.add_node("decide", decide)
    graph.add_node("act", act)
    graph.add_node("evaluate", evaluate)
    graph.add_node("report", report)

    graph.add_edge(START, "observe")
    graph.add_conditional_edges(
        "observe", route_after_observe, {"decide": "decide", "report": "report"}
    )
    graph.add_conditional_edges(
        "decide",
        route_after_decide,
        {"act": "act", "report": "report"},
    )
    graph.add_conditional_edges(
        "act", route_after_act, {"evaluate": "evaluate", "report": "report"}
    )
    graph.add_edge("evaluate", "observe")  # the loop
    graph.add_edge("report", END)
    return graph.compile()


class QAAgent:
    """Autonomously explores a URL, drives actions, and reports bugs it finds.

    `driver` and `policy` are injected (the router's shared-resource pattern):
    the caller owns the browser's lifecycle. `max_steps` bounds the exploration
    loop; `recursion_limit` is the hard backstop. Offline by default —
    `explore_policy` needs no LLM — so the whole agent is hermetic.
    """

    def __init__(
        self,
        driver: BrowserDriver,
        policy: QAPolicy = explore_policy,
        max_steps: int = DEFAULT_MAX_STEPS,
        recursion_limit: int = 50,
    ) -> None:
        self.driver = driver
        self.policy = policy
        self.max_steps = max_steps
        self.recursion_limit = recursion_limit
        self.graph = build_qa_graph(driver, policy, max_steps)

    def run(self, url: str, objective: str = "") -> QAAgentResult:
        state: QAState = {"url": url, "objective": objective, "steps": []}
        final = self.graph.invoke(state, {"recursion_limit": self.recursion_limit})
        # `decide`/`observe`/`act` always stamp a resolution before report;
        # default to objective_covered only as a defensive fallback.
        resolution = final.get("resolution") or "objective_covered"
        return QAAgentResult(
            url=url,
            objective=objective,
            observations=final.get("observations", []),
            actions=final.get("actions", []),
            bugs=final.get("bugs", []),
            resolution=resolution,
            error=final.get("error", ""),
            trajectory=AgentTrajectory(steps=final.get("steps", [])),
        )
