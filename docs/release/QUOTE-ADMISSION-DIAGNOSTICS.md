# Quote admission diagnostics

Built from deployed main `529e956254bc73c12ed8d7f4ffa6510f9b3d4442` on branch `feature/quote-admission-diagnostics`.

## Problem and resulting behavior

Data Health classified positive-price provider responses as available and could display PRIMARY even when portfolio valuation withheld the same quote. It did not show the identity, currency, timing or session reason. Valid empty samples also retained an indefinite loading message.

The existing authenticated market-health sample now applies the same `evaluateDeclaredQuote` function as portfolio valuation. Each quote reports only eligibility, status and fixed reasons. The admitted quote packet and raw price are discarded from the diagnostic projection. Direct helper callers without a requested symbol receive unknown eligibility.

Data Health shows WITHHELD with reasons, LAST CLOSE with its own scope, or the existing provider/history statuses when the declared checks support them. Legacy responses without the new metadata stay unknown. The sample summary counts withheld and unknown checks separately. A completed empty sample displays unknown coverage.

This remains the existing sample of SPY and up to three holdings. It is not a full portfolio audit. Passing quote metadata checks does not establish complete accounting or authenticated issuer/source records.

## Verification

- 1,087 Node tests passed.
- 13 focused Chromium cases passed, including 360/768/1440px admission presentation, legacy responses, empty samples, no unexpected writes and no browser errors.
- Unit cases cover matching and mismatched identities, missing/non-USD currency, stale/future observations, missing sessions, simulations, last close and output privacy.
- TypeScript and the production build passed.
- Require fresh GitHub CI on the draft PR's exact commit before release.

No provider acquisition path, timer, credential, database schema, sender or deployment control changed. The display uses the existing response and adds no request. React StrictMode may replay the existing mount effect in the development QA bundle; the regression keeps those initial reads bounded and verifies zero writes.

## Continue

Inspect this branch and its live draft PR/check results. Resolve authentic CI failures before further implementation. Preserve the merged PR #180 branch and its release attestation. Any future production release needs its own approval and must not extend the PR #180 exception implicitly. Current production remains READY deployment `dpl_8jCVHBD3ZrnZWsnc9AcdaAE91e1v`.
