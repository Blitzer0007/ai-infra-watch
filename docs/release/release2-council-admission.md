# Versioned conditional research admission

Implemented in Codex Cloud on the Release 2 feature branch, 9 November 2026. Extends the [source receipts](release2-council-source-adapters.md) without rewriting v1 evidence, forecasts, portfolios or outcomes. All verification is fictional/intercepted; no live financial/SEC/NVIDIA/TypeSafe call or credit expenditure is included.

## User flow

**Inspect loaded sources** remains a local, zero-request capture. A separate **Validate research inputs** action now runs deterministic Python admission through the existing authenticated loopback relay. It needs no model configuration, invokes no model factory, and makes no provider call. It shows each record's conditional eligibility, reason codes and any publication uncertainty range.

**Analyze loaded evidence** uses `loaded-v2`, sending the same frozen evidence and original public filing references to the private Python backend. The backend independently revalidates them; it never trusts the browser's admission result. A source check is optional before analysis, but explicit local inspection remains required. New inspection or company/horizon changes clear earlier results. There is no page-open call, polling or automatic retry.

Original filing references go to the private validation backend, **not to NVIDIA or TypeSafe**. Model prompts receive the selected numeric evidence and bounded admission diagnostics, including uncertainty bounds, without original accession/CIK/input-receipt objects, raw documents/URLs, private quantities/costs/theses/notes or credentials. The optional existing TypeSafe action still receives only bounded coverage counts on a separate click.

## Versioned contracts and binding

- `admission-v2` and `loaded-v2` requests contain exactly `mode`, the existing bounded `packet`, and `sources` with nullable SEC and catalyst receipts. Existing v1 requests/results keep their contract and admission behavior.
- Python owns `council-admission-v1` / `family-provenance-v1`. It validates the source receipt independently of JavaScript, including original inputs, formulas, periods, units, field types and correlations to the exact packet evidence. Unused/unbound/widened or malformed proofs are rejected before any model factory is reached.
- Repeated references to one original fact must agree. A single accession must have consistent form and filing date. Fatal issuer/source/limit issues cannot carry usable observations. This strengthens the shared receipt validator as well as Python admission; the source-adapter restatement fixture now uses a distinct accession for its revised filing.
- Admission receipts include SHA-256 of the **actual request bytes**. Both relay and browser recompute it from the exact serialized payload and validate coverage, reasons, windows and false-authority flags. A changed mode, retained declaration or receipt cannot reuse a prior response. V2 council snapshots use that request hash and include the independently computed admission receipt.
- SHA-256 binds a response to submitted bytes. It does not authenticate a publisher, issuer, historical availability, model fitting or prediction issuance. Consistent forged declarations can pass structural checks; tests deliberately demonstrate this while all authority flags remain false.

## Family-specific rules

| Input family | Conditional research requirements |
| --- | --- |
| Market | Known declared quote provider, reported basis, no simulation, explicit observation and retrieval, consistent ordering/cutoff and observation age at most fifteen minutes. An absent publication instant stays absent; the actual observation is used, not a borrowed publication/retrieval timestamp. |
| SEC duration metrics | Bound source receipt, supported USD/form/annual-duration inputs, matching filing vintages and recalculated growth/margin/cash-flow formulas; original date-only publication range fully closed before retrieval and assessment; period end and conservative publication age within five hundred fifty days. No exact observation/publication instant is fabricated. |
| SEC balance ratio | Same source/formula/date requirements, with a point-in-time period end and no invented duration start. Liabilities/equity remains distinct from debt/equity. |
| Catalyst countdown | Exact event instant, declared confirmed status with issuer/regulator basis, explicit publication/retrieval in order before assessment, publication age at most thirty days, event between assessment and three hundred sixty-six days ahead, and independently recalculated elapsed UTC days. This is not exchange-session timing or proof of issuer confirmation. Estimated, cancelled, missing-time or out-of-window inputs withhold admission. |

These are versioned input-integrity/metadata rules, not a complete financial-quality, event-relevance, valuation or investability certificate. The bounded event window is independent of the displayed research horizon. Source labels/confirmation bases and acquisition times are declarations. The backend does not retrieve original filings or independently verify them. Source-producer FY selection remains separate from the retained duration/form contract; additional periods, currencies and taxonomies remain unsupported.

Conflicting comparable observations remove every conflicting record. Any conflict makes the overall receipt needs-data even when another metric still covers that family. Missing families also make it needs-data. Genuine zeroes and negative cash flow are preserved. Unsupported legacy observations without bound lineage cannot gain admission merely by claiming a reported basis.

## Date-only publication uncertainty

A filing date is not midnight and contains no recovered timezone. For supported dates in 2000–2099, the rule constructs a conservative envelope over its **explicitly supported civil UTC-offset domain −12 through +14**:

- Earliest: filing-date UTC midnight minus fourteen hours.
- Latest exclusive: the next date's UTC midnight plus twelve hours.

This is a fifty-hour range under the declared offset policy, not a claimed actual timestamp or independent timezone fact. Both endpoints are labelled uncertainty bounds. The range must be wholly closed by **both retrieval and assessment**. An early same-day retrieval cannot manufacture a precise publication instant; another later retrieval can be assessed under the same rule. Exact ordering uses full microseconds. Tests independently check leap/year boundaries and one microsecond before/at/after the upper boundary.

Financial observations retain their original null observation/publication fields and `basis: unknown`; the validated derivation and day bounds are recorded separately. Periods represent reported duration/instant context rather than market-event timestamps. The original v1 path still rejects this missing exact-time/reported-basis evidence; nothing silently upgrades old clients.

## Council meaning and limits

The result says **conditionally usable for research**. Source authenticity, forecast validity, decision eligibility, allocation changes and message authority remain false. A v2 Judge can return a *provisional* evidence preference only after the existing direct-citation checks and conditional family gates pass. Consistency does not prove a future bull/bear outcome. Fictional-mode councils still cannot yield a directional disposition.

The fixed role sequence, independent openings, one chosen loaded-data tool per role, six-call/three-tool/forty-second model budget, prompt/output limits, private access, 32 KiB request/64 KiB response bounds, one Python-process task, explicit loopback-only relay, shared twelve-per-minute JS limit and five requests per mounted panel remain. Admission actions share the view request budget, require the same development guard, and are blocked on Vercel/production even though they invoke no model. They use no external tools, persistence, hosted data, sender or scheduler. Model/provider timing and account-wide quotas remain separate acceptance work.

## Verification

- 45 new pure Python admission cases and seven endpoint cases: exact retained JS/Python fixtures, formula/reference/vintage/type checks, fatal/unbound lineage, shared-fact consistency, date-window and market microsecond boundaries, early retrieval, declared-source forgery limits, conflicts/empty coverage, catalyst timing/confirmation, privacy, authenticated model-free admission, fake-model v2 orchestration and production guards. The council/API selection now has **101 passing cases**.
- 18 new JS/TS wire/uncertainty/hash cases and nine actual-handler/relay cases. All **944 Node tests pass**. Spoofed authority, wrong digest/windows/coverage/version, private fields and malformed lineage fail closed without raw upstream details.
- **481 broader offline Python checks pass**, with eight live cases excluded; the existing fully mocked LLM transport case passes separately without its global stub override. These are fixture/contract checks, not model-effectiveness or market evidence.
- Eight council browser scenarios use the real JS middleware/handler → private Python endpoint → admission/council → UI, with fake models and TypeSafe. Two new cases verify model-free admission, immutable input reuse, same-day uncertainty, no synthetic publication times, double-click/selection guards and 360/768/1440 layouts. The normal production build omits the development panel. Existing calendar coverage is retained in combined regression/CI.
- TypeScript, production build, source security scan, local migration-manifest integrity and whitespace checks pass. Existing large-bundle and broader accessibility/cross-browser work remains open. Existing CI now includes the exact fixture/new Python module and runs the new Python suite; live and deployment controls are unchanged.

The fully fictional request, exact request bytes and actual Python receipts are in `qa/fixtures/council-admission.fictional.json`. Screenshots are retained outside Git at `/tmp/aiw-council/portfolio-council-admission-fictional-{360,768,1440}.png`. The existing scoped REA reference investigation remains unchanged; this increment makes no new REA runtime/parity/performance claim.

Next: build independently labelled grounding/adversarial evaluation cases and measure citation quality, abstention and judge agreement against deterministic baselines before a separately approved live development smoke test. Authentic source/acquisition evidence, source/provider entitlements, matured outcomes, persistent provenance/evaluation integration and account-wide cost/resource coordination remain pending. Core Release 2 engineering remains approximately 55%; production rollout has not started. No production secrets, hosted database changes, real messages, merge, deployment or dependency installation is included.
