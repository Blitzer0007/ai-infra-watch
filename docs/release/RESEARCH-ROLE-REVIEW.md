# Company, Catalyst and Daily Review baseline — 23 November 2026

This adds three **deterministic read-only role views** after an explicit conditional input-validation request in the development JEV council panel. These views are not autonomous AI agents and do not require NVIDIA credentials. A separate [bounded tool-calling role runner](RESEARCH-ROLE-AGENTS.md) is implemented for offline/development probes; live provider acceptance, UI integration and independent usefulness evaluation remain pending.

## Role interfaces

`research_role_review(raw)` in Python and `researchRoleReview(payload, admission, requestDigest)` in JavaScript implement `research-role-review-v1` / `loaded-review-roles-v1`. Python independently parses and evaluates original source declarations; the browser requires the existing strict conditional-admission envelope and exact frozen request digest. Eight fictional cross-language fixtures verify matching results.

| Role | Cited inputs | Review items |
| --- | --- | --- |
| Company | Conditionally usable financial and risk observations | Original filings/issuer; growth and liability context; positive, zero or negative cash-flow context; missing financial/risk coverage. |
| Catalyst | Conditionally usable catalyst observations | Independent event-source verification; declared timing and confirmation gaps. Countdown remains elapsed calendar days. |
| Daily review | Conditionally usable observations for one symbol and frozen snapshot | Source authenticity, unresolved review questions, missing market/financial/catalyst/risk coverage and conflicting inputs. This is not a whole-day or portfolio assessment. |

Each role returns bounded evidence IDs, fixed review codes and conditional/needs-data status. Policy caps eight input observations and seven review codes per role. Model calls, provider requests and agent-tool calls are zero. Source authenticity, forecast validity, decision eligibility, allocation changes and message authority remain false.

No new source/API endpoint, model route, scheduler, persistence, broker/accounting calculation, trading signal or delivery capability is added. The UI reuses the already-requested admission receipt; tab/theme changes make no additional request. Existing authentication, development guards, request limits and source admission remain unchanged.

## UI behavior

- Three keyboard-accessible tabs in one compact panel; Left/Right/Home/End move selection and focus.
- Citations expand on demand and collapse when switching roles. Numbers and units come from the bound original observations; zero remains a value, and negative cash flow receives its own review question.
- Missing or uncertain filing lineage yields no company citations. Unconfirmed catalysts yield no catalyst citations. Missing coverage is never presented as a clean day or a successful trade review.
- Symbol, horizon, reinspection or new-review changes clear the role result. Stale asynchronous validation cannot replace the current selection.
- Shared semantic surfaces support light and dark themes. Responsive checks cover 360,768 and1440 pixels.
- Views remain inside the existing development-only council gate and absent from normal production builds.

## Verification and limits

Python admission/roles and JavaScript wire fixtures use only invented FICT declarations. The real local Python→private relay→browser test uses fictional MSFT observations already labelled as QA fixtures; no live financial request or model call is made. Tests cover schema/digest/authority tampering, unavailable lineage, uncertain filing times, catalyst confirmation, numeric zero/negative preservation, keyboard interaction, zero extra requests, responsive themes and production exclusion.

These helpers organize review work. They do not independently inspect original documents, authenticate sources, measure model usefulness, generate portfolio-wide daily decisions or place trades. The NVIDIA-first benchmark/probe still needs a dedicated Cloud development secret, followed by actual availability/quota/cost/latency tests and independently reviewed grounding/usefulness cases. No live trial has run.

This increment extends draft PR #189; it is not merged or deployed. Production remains PR #188 at79fddf79a452c2a385b596fced604397781316eb. Read the current continuation and remaining-work register before resuming.
