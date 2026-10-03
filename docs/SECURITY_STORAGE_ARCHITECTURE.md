# AI Infra Watch — Security and Storage Architecture

## Security boundaries

- Browser code may use public runtime configuration and non-secret identifiers only.
- Provider credentials, LLM keys, cron credentials, access tokens, and external-service secrets remain server-side environment variables.
- Server API routes are the boundary for provider calls and secret-bearing operations.
- `VITE_*` variables must never contain credentials or bearer tokens.
- Production response headers provide baseline clickjacking, MIME-sniffing, referrer, and unnecessary browser-capability protections.
- The CI security audit scans tracked source for common private-key and credential signatures.

## Canonical storage ownership

| State | Canonical owner | Runtime cache | Client persistence |
| --- | --- | --- | --- |
| Portfolio holdings | Portfolio API / persistent backend | Optional warm cache | No authoritative copy |
| Provider/API secrets | Deployment environment | Process memory only where required | Never |
| Market quotes | Provider response | Short-lived server memory cache | UI state only |
| Historical market data | Provider/API layer | Short-lived cache | UI state only |
| Forecast/validation state | Existing forecast persistence layer | Optional runtime cache | UI presentation only |
| Evidence/research results | Existing API/agent evidence pipeline | Runtime cache where explicitly marked | UI presentation only |
| Watchlist/UI preferences | Client configuration | React state | Local browser storage where already supported |

## Storage rules

1. Persistent portfolio state must not be inferred from a browser-only snapshot.
2. Cached provider responses must carry freshness/stale metadata when exposed to the UI.
3. Secrets must never be copied into client state, local storage, committed files, or Vite-exposed variables.
4. Runtime caches are performance layers, not authoritative storage.
5. Fallback data must remain explicitly marked as fallback and must not be presented as a fresh provider result.

This document records the intended ownership model; it does not migrate existing storage providers by itself.
