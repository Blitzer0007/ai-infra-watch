"""Process-shared HTTP admission; no credentials, URLs, persistent or remote state."""
from __future__ import annotations

from collections import deque
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from email.utils import parsedate_to_datetime
import math
from threading import RLock
import time
from types import MappingProxyType

import httpx

BUDGET_CODES = frozenset({"BUDGET_WINDOW", "BUDGET_BUSY", "BUDGET_TIME", "BUDGET_ATTEMPTS", "BUDGET_COOLDOWN"})


class BudgetDenied(RuntimeError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class Limits:
    requests_per_window: int = 30
    window_seconds: float = 60
    min_interval_seconds: float = .25
    max_in_flight: int = 1
    attempts_per_operation: int = 3
    operation_seconds: float = 8

    def __post_init__(self):
        for name in ("requests_per_window", "max_in_flight", "attempts_per_operation"):
            value = getattr(self, name)
            if type(value) is not int or not 1 <= value <= 1000:
                raise ValueError("Invalid provider limits")
        for name in ("window_seconds", "operation_seconds", "min_interval_seconds"):
            value = getattr(self, name)
            if type(value) not in (int, float) or not math.isfinite(value) or value < 0 or (name != "min_interval_seconds" and value == 0):
                raise ValueError("Invalid provider limits")
        if self.operation_seconds > 60 or self.window_seconds > 86400 or self.min_interval_seconds > 60:
            raise ValueError("Invalid provider limits")


class ProviderBudget:
    """Shared by all integrated clients in this interpreter, not across workers."""
    def __init__(self, limits=None, *, clock=time.monotonic, sleep=time.sleep, wall_clock=time.time):
        selected = {"finnhub": Limits(), "sec": Limits(requests_per_window=60)} if limits is None else dict(limits)
        if set(selected) != {"finnhub", "sec"} or not all(isinstance(v, Limits) for v in selected.values()):
            raise ValueError("Invalid provider limits")
        self.limits = MappingProxyType(selected)
        self.clock, self.sleep, self.wall_clock = clock, sleep, wall_clock
        self._lock = RLock()
        self._last_clock = -math.inf
        self._state = {key: {"starts": deque(), "last_start": None, "active": 0, "admitted": 0, "denied": {}, "cooldown_until": 0.0} for key in selected}

    def _now(self):
        now = self.clock()
        if type(now) not in (int, float) or not math.isfinite(now) or now < self._last_clock:
            raise BudgetDenied("BUDGET_TIME")
        self._last_clock = now
        return now

    def _deny(self, provider, code):
        counts = self._state[provider]["denied"]
        counts[code] = counts.get(code, 0) + 1
        raise BudgetDenied(code)

    def operation(self, provider):
        if provider not in self.limits:
            raise ValueError("Unknown provider budget")
        with self._lock:
            return Operation(self, provider, self._now() + self.limits[provider].operation_seconds)

    def cooldown(self, provider, seconds):
        if type(seconds) not in (int, float) or math.isnan(seconds) or seconds < 1:
            seconds = 30
        with self._lock:
            state = self._state[provider]
            state["cooldown_until"] = max(state["cooldown_until"], self._now() + seconds)

    def snapshot(self):
        with self._lock:
            now = self._now()
            result = {}
            for provider, state in self._state.items():
                policy = self.limits[provider]
                while state["starts"] and now - state["starts"][0] >= policy.window_seconds:
                    state["starts"].popleft()
                remaining = max(0, state["cooldown_until"] - now)
                result[provider] = {"policy": asdict(policy), "admittedAttempts": state["admitted"],
                    "attemptsInWindow": len(state["starts"]), "inFlight": state["active"],
                    "denials": dict(state["denied"]), "cooldownActive": remaining > 0,
                    "cooldownSecondsRemaining": remaining if math.isfinite(remaining) else None}
            return {"scope": "process", "contractVersion": "provider-budget-v1", "providers": result}


class Operation:
    def __init__(self, owner, provider, deadline):
        self.owner, self.provider, self.deadline = owner, provider, deadline
        self.attempts = 0

    def _check(self, now, *, next_attempt=False):
        if now >= self.deadline:
            self.owner._deny(self.provider, "BUDGET_TIME")
        if next_attempt and self.attempts >= self.owner.limits[self.provider].attempts_per_operation:
            self.owner._deny(self.provider, "BUDGET_ATTEMPTS")

    @contextmanager
    def attempt(self, min_interval=0):
        owner, provider = self.owner, self.provider
        policy, state = owner.limits[provider], owner._state[provider]
        with owner._lock:
            now = owner._now()
            self._check(now, next_attempt=True)
            if now < state["cooldown_until"]:
                owner._deny(provider, "BUDGET_COOLDOWN")
            if state["active"] >= policy.max_in_flight:
                owner._deny(provider, "BUDGET_BUSY")
            while state["starts"] and now - state["starts"][0] >= policy.window_seconds:
                state["starts"].popleft()
            if len(state["starts"]) >= policy.requests_per_window:
                owner._deny(provider, "BUDGET_WINDOW")
            gap = max(policy.min_interval_seconds, min_interval)
            wait = max(0, state["last_start"] + gap - now) if state["last_start"] is not None else 0
            if now + wait >= self.deadline:
                owner._deny(provider, "BUDGET_TIME")
            state["active"] += 1  # Reserve while pacing; other callers fail promptly.
        try:
            if wait:
                owner.sleep(wait)
            with owner._lock:
                now = owner._now()
                self._check(now, next_attempt=True)
                if now < state["cooldown_until"]:
                    owner._deny(provider, "BUDGET_COOLDOWN")
                # A sleep that returned early must not bypass pacing.
                if state["last_start"] is not None and now - state["last_start"] + 1e-9 < gap:
                    owner._deny(provider, "BUDGET_TIME")
                state["last_start"] = now
                state["starts"].append(now)
                state["admitted"] += 1
                self.attempts += 1
                remaining = self.deadline - now
            yield remaining
            with owner._lock:
                self._check(owner._now())  # Withhold late successful responses.
        finally:
            with owner._lock:
                state["active"] -= 1

    def pause(self, seconds):
        owner = self.owner
        with owner._lock:
            now = owner._now()
            self._check(now, next_attempt=True)
            if now + seconds >= self.deadline:
                owner._deny(self.provider, "BUDGET_TIME")
        if seconds:
            owner.sleep(seconds)
        with owner._lock:
            self._check(owner._now(), next_attempt=True)


_PROCESS_BUDGET = ProviderBudget()


def process_budget():
    return _PROCESS_BUDGET


def retry_after_seconds(value, wall_clock=time.time):
    """Honor numeric/HTTP-date Retry-After without retaining the raw header."""
    if not isinstance(value, str) or not value.strip():
        return 30.0
    value = value.strip()
    if value.isascii() and value.isdigit():
        return max(1.0, float(value)) if len(value) <= 100 else math.inf
    if len(value) > 100:
        return 30.0
    try:
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            return 30.0
        return max(1.0, parsed.timestamp() - wall_clock())
    except (ValueError, TypeError, OverflowError):
        return 30.0


def budgeted_get(provider, url, *, error_type, params=None, headers=None, timeout=15, max_retries=2, base_delay=1, min_interval=0, budget=None):
    """Every integrated transport attempt, including retries, passes admission."""
    numeric = (timeout, base_delay, min_interval)
    if (any(type(v) not in (int, float) or not math.isfinite(v) for v in numeric)
        or not 0 < timeout <= 120 or not 0 <= base_delay <= 30 or not 0 <= min_interval <= 60
        or type(max_retries) is not int or not 0 <= max_retries <= 10):
        raise error_type("CONFIG", "Invalid provider request configuration")
    owner = budget if budget is not None else process_budget()
    try:
        operation = owner.operation(provider)
        for attempt in range(max_retries + 1):
            try:
                with operation.attempt(min_interval) as remaining:
                    with httpx.Client(timeout=min(timeout, remaining), headers=headers or {}, follow_redirects=False) as client:
                        response = client.get(url, params=params) if params is not None else client.get(url)
                    status = response.status_code
                    if status == 429:
                        values = getattr(response, "headers", {})
                        retry_after = values.get("Retry-After") if hasattr(values, "get") else None
                        owner.cooldown(provider, retry_after_seconds(retry_after, owner.wall_clock))
                        raise error_type("RATE_LIMIT", "Provider rate limit reached; retry deferred")
                if 200 <= status < 300:
                    return response
                if status in (408, 409) or 500 <= status < 600:
                    if attempt < max_retries:
                        operation.pause(base_delay * (2 ** attempt))
                        continue
                raise error_type("HTTP_ERROR", "Provider HTTP request failed")
            except httpx.HTTPError:
                if attempt < max_retries:
                    operation.pause(base_delay * (2 ** attempt))
                    continue
                raise error_type("HTTP_ERROR", "Provider transport failed") from None
    except BudgetDenied as error:
        raise error_type(error.code, "Local provider budget withheld the request") from None


def budgeted_json(*args, error_type, **kwargs):
    response = budgeted_get(*args, error_type=error_type, **kwargs)
    try:
        return response.json()
    except (ValueError, TypeError):
        raise error_type("NO_DATA", "Provider returned invalid JSON") from None
