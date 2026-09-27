"""QAAgent tests — Phase 5 bonus (roadmap build step 15, Playwright-MCP QA agent).

The autonomous QA agent drives a real observe -> decide -> act -> evaluate loop
over a browser tool surface, with NO pre-written per-page scripts: a policy
explores, deterministic oracles judge expected-vs-actual, and the loop is bounded
so a self-directed explorer can't run away. This suite proves that behavior
hermetically — the "browser" is an in-process `ScriptedBrowser` behind the same
`BrowserDriver` seam a real Playwright-MCP driver satisfies, so no browser is
launched.

Mapped to the roadmap's agent-testing strategies:
  1. schema        — a run validates as QAAgentResult; ok() semantics (finding
                     bugs is SUCCESS, only a fatal driver crash is not-ok)
  2. behavioral    — observe precedes every decide; the loop actually cycles
  3. tool-call val — the action the policy chose is the action driven on the browser
  4. state-machine — node path is the expected observe/decide/act/evaluate cycle,
                     and termination is bounded (budget guard, no infinite loop)
  5. adversarial   — a driver that crashes mid-run degrades (resolution "error",
                     no exception); dead controls / console / HTTP bugs are caught

Plus the bug ORACLES unit-tested in isolation, and a @pytest.mark.live smoke
placeholder for a real Playwright-MCP driver.
"""
from __future__ import annotations

import json

import pytest

from app.agents import BugReport, QAAgent, QAAgentResult, explore_policy
from app.agents.qa import (
    DEFAULT_MAX_STEPS,
    _console_oracle,
    _dead_action_oracle,
    _http_oracle,
)
from app.agents.schemas import QAAction, QAObservation


# ---------------------------------------------------------------------------
# ScriptedBrowser — an in-process single-page-app model behind BrowserDriver.
# Elements persist across clicks (an SPA), so a frontier explorer can exercise
# each control in turn. A click can toggle a page into an ERROR state (console
# error / HTTP >= 400) or be a DEAD control (no observable change) — the three
# bug classes the oracles catch. No Playwright, no network.
# ---------------------------------------------------------------------------
class ScriptedBrowser:
    """Deterministic fake browser.

    `elements` is the stable control set. `on_click` maps an element to an
    effect dict: {"errors": [...], "status": int, "dead": bool}. A dead control
    leaves state unchanged; otherwise the click is recorded so the element set
    stays the same (SPA) but console/status reflect the effect of the LAST
    click (cleared on the next non-erroring interaction).
    """

    def __init__(self, url: str, elements: list[str], on_click: dict | None = None) -> None:
        self._url = url
        self._elements = list(elements)
        self._on_click = on_click or {}
        self._console: list[str] = []
        self._status = 200
        self.calls: list[tuple[str, str]] = []

    def _obs(self) -> QAObservation:
        return QAObservation(
            url=self._url,
            elements=list(self._elements),
            console_errors=list(self._console),
            http_status=self._status,
            screenshot=f"shot:{self._url}:{len(self.calls)}",
        )

    def goto(self, url: str) -> QAObservation:
        self.calls.append(("goto", url))
        self._url = url
        self._console = []
        self._status = 200
        return self._obs()

    def observe(self) -> QAObservation:
        self.calls.append(("observe", ""))
        return self._obs()

    def click(self, target: str) -> QAObservation:
        self.calls.append(("click", target))
        effect = self._on_click.get(target, {})
        if effect.get("dead"):
            # A dead control: state is unchanged (same url, same elements, no
            # new console) — the _dead_action_oracle should catch this.
            return self._obs()
        self._console = list(effect.get("errors", []))
        self._status = effect.get("status", 200)
        # A working control changes SOMETHING observable: bump the url fragment
        # so the dead-action oracle does not false-positive on a real action.
        self._url = f"{self._url}#{target}"
        return self._obs()

    def fill(self, target: str, value: str) -> QAObservation:
        self.calls.append(("fill", target))
        self._url = f"{self._url}#{target}={value}"
        return self._obs()


class BoomBrowser:
    """A driver that navigates once, then crashes on the next interaction —
    the hermetic stand-in for a browser subprocess dying mid-run."""

    def __init__(self, boom_on: str = "observe") -> None:
        self._boom_on = boom_on
        self._navigated = False

    def goto(self, url: str) -> QAObservation:
        if self._boom_on == "goto":
            raise RuntimeError("browser crashed on goto")
        self._navigated = True
        return QAObservation(url=url, elements=["a"], screenshot="shot")

    def observe(self) -> QAObservation:
        raise RuntimeError("browser crashed on observe")

    def click(self, target: str) -> QAObservation:
        raise RuntimeError("browser crashed on click")

    def fill(self, target: str, value: str) -> QAObservation:
        raise RuntimeError("browser crashed on fill")


def _clean_site() -> ScriptedBrowser:
    # Two working controls, nothing wrong — a clean sweep, zero bugs.
    return ScriptedBrowser("/", ["a", "b"], on_click={})


# ===========================================================================
# 1. schema + ok() semantics
# ===========================================================================
def test_run_returns_qa_result_clean_sweep():
    r = QAAgent(_clean_site(), explore_policy).run("/", "sweep the app")
    assert isinstance(r, QAAgentResult)
    assert r.ok()  # explored + terminated cleanly
    assert r.resolution == "objective_covered"
    assert r.bugs == [] and not r.found_bugs()
    assert r.error == ""


def test_finding_bugs_is_still_ok():
    # A console error on control 'a' — the agent's JOB is to find it, so a run
    # that surfaces bugs is a SUCCESSFUL run, not a failed one.
    site = ScriptedBrowser("/", ["a", "b"], on_click={"a": {"errors": ["TypeError: x"]}})
    r = QAAgent(site, explore_policy).run("/", "find bugs")
    assert r.ok()  # found a bug, but ran cleanly
    assert r.found_bugs()
    assert any(b.kind == "console_error" for b in r.bugs)


# ===========================================================================
# 2. behavioral — observe precedes every decide; the loop cycles
# ===========================================================================
def test_observe_precedes_decide_and_loop_cycles():
    r = QAAgent(_clean_site(), explore_policy).run("/", "x")
    nodes = r.trajectory.nodes()
    assert nodes[0] == "observe"
    # every decide is preceded by an observe
    for i, n in enumerate(nodes):
        if n == "decide":
            assert "observe" in nodes[:i]
    # the loop actually cycled at least twice (>=2 observes) then reported
    assert nodes.count("observe") >= 2
    assert nodes[-1] == "report"


# ===========================================================================
# 3. tool-call validation — the chosen action is the action driven
# ===========================================================================
def test_chosen_action_reaches_the_browser():
    site = _clean_site()
    QAAgent(site, explore_policy).run("/", "x")
    # explore_policy clicks each unseen element once, in order: a then b.
    clicks = [t for (kind, t) in site.calls if kind == "click"]
    assert clicks == ["a", "b"]
    # first call is the initial navigation
    assert site.calls[0] == ("goto", "/")


def test_policy_action_is_recorded_verbatim():
    # A canned policy that clicks 'b' once then stops — the recorded actions
    # must match exactly what the policy emitted.
    def canned(objective, observation, actions):
        if not actions:  # first turn only
            return QAAction(kind="click", target="b", reason="canned")
        return QAAction(kind="stop", reason="done")

    site = _clean_site()
    r = QAAgent(site, canned).run("/", "x")
    assert [(a.kind, a.target) for a in r.actions] == [("click", "b")]


# ===========================================================================
# 4. state-machine — node path + bounded termination (no infinite loop)
# ===========================================================================
def test_single_action_cycle_node_path():
    # One working control -> exactly one observe/decide/act/evaluate cycle,
    # then a final observe/decide that stops.
    site = ScriptedBrowser("/", ["a"], on_click={})
    r = QAAgent(site, explore_policy).run("/", "x")
    assert r.trajectory.nodes() == [
        "observe", "decide", "act", "evaluate",
        "observe", "decide", "report",
    ]


def test_budget_bounds_a_never_settling_policy():
    # A policy that ALWAYS clicks (never stops) must be stopped by the budget,
    # not loop forever. Resolution is "budget" and actions == max_steps.
    always_click = lambda o, obs, h: QAAction(kind="click", target="a", reason="never stop")
    site = ScriptedBrowser("/", ["a"], on_click={})
    r = QAAgent(site, always_click, max_steps=3).run("/", "x")
    assert r.resolution == "budget"
    assert r.ok()  # a bounded stop is a clean outcome
    assert len(r.actions) == 3
    # Exact, not a loose ceiling: 3 full observe/decide/act/evaluate cycles then
    # a final observe/decide that the budget diverts to report — no runaway, and
    # the guard trips at precisely the budget, never one cycle over.
    assert r.trajectory.nodes() == (
        ["observe", "decide", "act", "evaluate"] * 3
        + ["observe", "decide", "report"]
    )


def test_default_max_steps_is_the_budget():
    always_click = lambda o, obs, h: QAAction(kind="click", target="a", reason="x")
    site = ScriptedBrowser("/", ["a"], on_click={})
    r = QAAgent(site, always_click).run("/", "x")
    assert len(r.actions) == DEFAULT_MAX_STEPS


# ===========================================================================
# 5. adversarial — driver crash degrades; bug oracles catch defects
# ===========================================================================
def test_driver_crash_midrun_degrades_not_raises():
    # Navigates once, then the browser dies on the next observe -> the loop
    # ends with resolution "error", a fatal error recorded, and NO exception.
    r = QAAgent(BoomBrowser(boom_on="observe"), explore_policy).run("/", "x")
    assert r.resolution == "error"
    assert not r.ok()
    assert "fatal:" in r.error
    # It got as far as the first observe+decide+act before the crash.
    assert r.trajectory.nodes()[0] == "observe"


def test_driver_crash_on_goto_degrades():
    r = QAAgent(BoomBrowser(boom_on="goto"), explore_policy).run("/", "x")
    assert r.resolution == "error"
    assert not r.ok()
    assert "fatal:" in r.error


def test_http_error_is_reported():
    site = ScriptedBrowser("/", ["a"], on_click={"a": {"status": 500}})
    r = QAAgent(site, explore_policy).run("/", "x")
    assert any(b.kind == "http_error" and "500" in b.detail for b in r.bugs)


def test_dead_control_is_reported():
    # A control that changes nothing observable is a dead-action bug.
    site = ScriptedBrowser("/", ["a"], on_click={"a": {"dead": True}})
    r = QAAgent(site, explore_policy).run("/", "x")
    assert any(b.kind == "dead_action" for b in r.bugs)


def test_bug_report_carries_repro_trail_and_screenshot():
    site = ScriptedBrowser("/", ["a"], on_click={"a": {"errors": ["boom"]}})
    r = QAAgent(site, explore_policy).run("/", "x")
    bug = next(b for b in r.bugs if b.kind == "console_error")
    assert bug.screenshot.startswith("shot:")
    assert bug.steps and bug.steps[0].startswith("goto /")
    assert bug.expected and bug.actual  # expected-vs-actual filled in


# ===========================================================================
# Bug ORACLES in isolation (pure functions, no loop)
# ===========================================================================
def test_console_oracle():
    obs = QAObservation(url="/p", console_errors=["Err"], screenshot="s")
    assert _console_oracle(obs, ["goto /p"]).kind == "console_error"
    assert _console_oracle(QAObservation(url="/p"), []) is None


def test_http_oracle():
    assert _http_oracle(QAObservation(http_status=404), []).kind == "http_error"
    assert _http_oracle(QAObservation(http_status=200), []) is None
    assert _http_oracle(QAObservation(http_status=302), []) is None  # redirect is not a bug


def test_dead_action_oracle():
    prev = QAObservation(url="/p", elements=["a", "b"])
    same = QAObservation(url="/p", elements=["a", "b"])
    changed = QAObservation(url="/p#a", elements=["a", "b"])
    elements_changed = QAObservation(url="/p", elements=["a", "b", "c"])
    click = QAAction(kind="click", target="a")
    assert _dead_action_oracle(same, prev, click, []).kind == "dead_action"
    assert _dead_action_oracle(changed, prev, click, []) is None
    # DOM mutated in place (same url, new element) is a LIVE control, not dead —
    # a click that reveals content without navigating still had an effect.
    assert _dead_action_oracle(elements_changed, prev, click, []) is None
    # a "stop" action is never a dead control
    assert _dead_action_oracle(same, prev, QAAction(kind="stop"), []) is None
    # no prior observation -> nothing to compare, not a bug
    assert _dead_action_oracle(same, None, click, []) is None


# ===========================================================================
# readiness — the report serializes for a bug-report artifact
# ===========================================================================
def test_result_json_round_trips():
    site = ScriptedBrowser("/", ["a", "b"], on_click={"a": {"errors": ["boom"]}})
    r = QAAgent(site, explore_policy).run("/", "sweep")
    reloaded = QAAgentResult.model_validate(json.loads(r.model_dump_json()))
    assert reloaded.url == "/"
    assert [b.kind for b in reloaded.bugs] == [b.kind for b in r.bugs]
    assert reloaded.trajectory.nodes() == r.trajectory.nodes()


@pytest.mark.live
def test_live_qa_over_playwright_mcp():
    # A real run would inject a Playwright-MCP-backed BrowserDriver (same seam)
    # and an LLM policy. Skipped by default so CI stays hermetic / browser-free.
    pytest.skip("live QA needs a Playwright-MCP server + LLM policy")
