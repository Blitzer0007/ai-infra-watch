# Shared Python provider/SEC admission

Implemented 9 November 2026 in Codex Cloud. This increment shares **process-local** HTTP admission across the existing Python Finnhub quote, research, earnings, candle and news clients, and all existing `LiveEdgarClient` reads including the optional SEC gateway. It does not establish account-wide quotas or activate a live integration.

## Policy and scope

| Resource | Default local policy |
| --- | --- |
| Finnhub | 30 admitted transport attempts per rolling 60 seconds |
| SEC/direct or gateway | 60 admitted transport attempts per rolling 60 seconds |
| Concurrency | One active/reserved attempt per provider, shared across instances and tools |
| Start spacing | At least 250 ms per provider; a stricter existing SEC interval remains effective |
| One transport operation | At most three attempts and an eight-second cooperative deadline |
| HTTP timeout | No larger than the remaining operation budget or the caller's smaller timeout |
| 429 | Stop immediate retry; share a cooldown honoring usable numeric or HTTP-date Retry-After, with a conservative fallback |

These are reviewed development guard defaults, not vendor entitlement claims or calibrated optimal limits. Actual account terms, server latency and permitted requests remain unverified. Separate interpreters, serverless workers, hosts and the Node/Vercel data routes do not share this memory. SEC requests made by a separate gateway are outside the caller process; only its admitted gateway transport is counted here.

Every integrated client resolves the same coordinator. Creating another provider object cannot reset a process window. Retries consume admission just like first attempts; exhausted windows/cooldowns and busy slots fail before HTTP. Locks protect shared counters, pacing and concurrency, while bounded pacing/backoff sleeps occur outside the lock. A reserved pacing slot blocks competing work promptly rather than creating an unbounded queue. Provider families have separate buckets.

Successful responses that return after their deadline are withheld. The synchronous httpx timeout bounds individual I/O phases, not a hard total cancellation guarantee; a blocked call can overrun before control returns. Rejected transport attempts still consume admission when they reached client construction. Counts describe **admitted attempts**, not confirmed server receipt, successful responses, vendor billing or remaining account credits.

## Retry, failures and receipts

Transient transport/408/409/5xx failures retry only while the caller's retry cap and shared operation budgets permit. Backoff that cannot fit or would precede an inadmissible fourth attempt is not slept. Redirects are not followed. Permanent failures and malformed JSON have fixed redacted errors; request URLs/tokens, raw response bodies and gateway credentials are not included.

A 429 produces RATE_LIMIT and a shared cooldown, with no immediate retry. Local denials retain BUDGET_WINDOW, BUDGET_BUSY, BUDGET_TIME, BUDGET_ATTEMPTS or BUDGET_COOLDOWN. Stock batches preserve those categories rather than calling them generic provider errors. The earnings service cannot evade a local budget or provider rate denial by switching to its secondary vendor. Existing best-effort optional fields can remain unavailable; this does not certify all application coverage envelopes.

The in-memory snapshot includes policy, admitted/window counts, active work, fixed-code denials and cooldown state. It stores no keys, URLs, account identifiers, symbols, response data or original Retry-After values. Extremely long numeric cooldowns remain blocked, with a JSON-safe unknown remaining duration if it cannot be represented finitely. Clock rollback/nonfinite clock input fails closed. Policies are immutable; snapshots cannot mutate them. No HTTP monitoring endpoint, scheduler, database or new telemetry sink is added.

## Implementation and validation

`aitracker-upload/mcp_servers/provider_budget.py` owns the coordinator and shared GET/JSON seams. Existing provider classes retain their public service contracts and normalization. The default retry behavior deliberately changes: fewer bounded attempts, shorter remaining-time limits, immediate cooldown on 429 and explicit local denials can surface where older code retried for longer. No production settings or workflows are dispatched.

Tests use a fresh coordinator per test with real policy behavior and a virtual clock. This isolates process state and advances actual pacing/backoff durations without disabling admission. Tests prove sharing across separate client instances/families, exact window expiry, real-thread contention/release, retry counting, late-result withholding, cooldown, gateway/direct sharing, denial propagation, fallback prevention and secret/error redaction. **46 additional cases** are included in the existing offline CI selection. Final local broad agent/MCP/evaluation/API run: **657 passed, 13 live cases deselected**. Source security, migration-manifest integrity, whitespace and 25 offline workflow-safety cases pass. Exact-head CI is recorded in draft PR #168.

A zero-network Cloud demonstration is available:

```bash
/workspace/venvs/ai-infra-watch/bin/python aitracker-upload/scripts/demo_provider_budgets.py
```

It simulates quote and research admissions to one Finnhub bucket, then rejects earnings at the configured demonstration limit. It makes zero HTTP/model requests and reads no credential configuration. Retained fictional receipt: `/workspace/artifacts/provider-budget-demo.json`.

## Remaining work and rollout

Add reviewed Node/Vercel coordination, cross-tool caching/deduplication and bounded HTTP bodies; measure real latency, resource use, provider limits and licensing with separately authorized development access. A cross-worker/account-wide quota would need a separately reviewed coordinator/storage design; no Redis or hosted infrastructure is introduced here. A provider window is not an agent run/token budget or JEV credit balance. Existing Python portfolio context continues reporting providerRequestCount unknown rather than attributing concurrent process counters to one request.

Rollback is a reviewed code/test/workflow revert; no stored data repair is required. No live financial-data/SEC/NVIDIA/JEV request, production secret, hosted query/write, message, merge or deployment occurred. Public GitHub source reads and the user's requested image generation are documented separately. Production activation remains separate; Release 2 is still approximately 55% engineering complete.
