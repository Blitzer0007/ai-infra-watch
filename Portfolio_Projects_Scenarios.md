# Portfolio Projects — When to Use & Why They Matter for AI QA Engineer Roles

A breakdown of all 7 projects from the AI Engineering Roadmap: what real-world scenario each one addresses, and how it demonstrates value specifically for an AI QA Engineer role.

---

## Project #1: LLM Testing Framework
**Phase 1 | Weeks 3-5**

### When you'll use this
Any time you need to validate an LLM's output isn't just "reasonable-looking" but actually correct — checking factual accuracy, format compliance, or topic relevance across hundreds of prompt variations instead of eyeballing a few responses manually.

### Real scenario
Your team ships a customer-support chatbot. Before every release, you need to run 200 test prompts and confirm none of them produce factually wrong answers, broken JSON, or off-topic responses — without a human reading all 200 outputs.

### Why it matters for AI QA Engineer roles
This is the direct upgrade path from your Selenium/REST Assured background — same pytest fixture and assertion pattern you already know, just pointed at non-deterministic LLM outputs instead of deterministic UI/API responses. It's proof you can write `assert_semantically_similar()` and `assert_passes_judge()` the same way you'd write `assertEquals()` — the single most common day-one expectation in an AI QA job description.

---

## Project #2: RAG System with Built-In Evaluation
**Phase 2 | Weeks 6-9**

### When you'll use this
Whenever a company has a "chat with your documents" feature (support docs, financial filings, internal knowledge base) and needs proof the answers are actually grounded in the source material — not hallucinated.

### Real scenario
Your org builds an internal tool where employees ask questions against SEC filings. Leadership wants a dashboard showing: are the answers faithful to the source? Are we retrieving the right documents? Did the last prompt change make things worse?

### Why it matters for AI QA Engineer roles
RAG is the single most common production AI pattern right now — most "AI QA" job postings assume RAG testing knowledge. This project proves you know RAGAS metrics (faithfulness, relevance, precision, recall) and can build a **golden eval dataset**, which is the AI-world equivalent of a regression test suite — a concept every hiring manager immediately recognizes from your QA background.

---

## Project #3: Conversational RAG with Continuous Evaluation
**Phase 3 | Weeks 10-12**

### When you'll use this
Any system that holds a multi-turn conversation (not just single Q&A) — where you need to catch if quality silently degrades over time, not just at launch.

### Real scenario
A chatbot performs great at launch, but three weeks later, after a prompt tweak or a model provider update, users start noticing worse answers. Nobody catches it until complaints pile up — because there was no ongoing quality monitoring, only a one-time launch test.

### Why it matters for AI QA Engineer roles
This is the "shift beyond pre-release testing" skill — traditional QA stops at release; AI QA has to continue *after* release because models drift and prompts get silently edited. Demonstrating LangSmith tracing + drift detection shows you understand **production monitoring**, not just pre-ship testing — a distinction hiring managers specifically probe for.

---

## Project #4: Agent Testing Harness
**Phase 4 | Weeks 13-16**

### When you'll use this
Testing any AI system that takes multiple steps to complete a task — calling tools, making decisions about what to do next, looping until done — rather than a single input→output call.

### Real scenario
An agent is supposed to: search the web, read a document, then calculate a number, then answer. It works in your demo, but in production it sometimes skips the search step and hallucinates the calculation instead. You need to catch this class of bug systematically, not by luck.

### Why it matters for AI QA Engineer roles
This is where your QA background becomes a genuine differentiator rather than just "transferable." Concepts like **trajectory assertions** (did it call the right tool, in the right order?) and **replay testing** (record a run, replay to catch regressions) map almost exactly to end-to-end test automation and are things most AI engineers — who lack a QA background — don't think to build. This is your strongest interview talking point.

---

## Project #5: MCP-Powered Multi-Agent System
**Phase 5 | Weeks 17-20**

### When you'll use this
Any scenario where multiple specialized AI agents need to collaborate and pull from real external systems (databases, APIs, file systems) through a standardized connection protocol, rather than one agent trying to do everything.

### Real scenario
A research platform needs a supervisor agent to delegate: one sub-agent searches the web, another queries a database, a third does data analysis, a fourth writes the report — each connecting to its data source via MCP, with the supervisor combining results into one coherent output.

### Why it matters for AI QA Engineer roles
MCP is becoming the industry-standard way AI systems connect to tools — same trajectory REST APIs took for web services. Being able to say "I've built 3+ custom MCP servers and tested multi-agent coordination (isolation, integration, chaos testing)" positions you ahead of most candidates, since MCP fluency is still rare. This directly reinforces your existing Salesforce Agentforce experience, giving you a second, technically deeper MCP credential.

---

## Project #6: AI Red-Teaming & Evaluation Platform
**Phase 6 | Weeks 21-24**

### When you'll use this
Any pre-launch security/safety review of an AI system — checking whether it can be manipulated into leaking data, producing unsafe content, or hallucinating confidently-stated false facts.

### Real scenario
Before shipping a customer-facing AI assistant, security/compliance asks: "Can someone jailbreak this into giving harmful advice? Can it be tricked into revealing system prompts? How often does it confidently state something false?" You need a repeatable process to answer this, not a one-off manual attempt.

### Why it matters for AI QA Engineer roles
This is explicitly positioned in your roadmap as **"Playwright for AI systems"** — and it's the project that separates a junior AI tester from someone who understands adversarial testing, a skill increasingly required as companies face real security incidents from prompted AI systems. Hallucination detection + automated red-teaming is a high-demand, low-supply skill set right now.

---

## Project #7: Production AI Quality Pipeline
**Phase 7 | Weeks 25-28**

### When you'll use this
Any team that wants AI quality checks built into their deployment process — so a bad prompt change or model regression gets blocked automatically before it reaches production, the same way a failing unit test blocks a bad code merge.

### Real scenario
A developer tweaks a prompt to fix one edge case, but it silently breaks accuracy on 15 other cases. Without an eval-gated pipeline, this ships straight to production. With one, the PR gets auto-blocked with a report showing exactly which quality dimension dropped.

### Why it matters for AI QA Engineer roles
This is the capstone that ties your entire GitHub Actions background directly into AI quality — "eval-gated CI/CD" is the single most cited gap companies have (shipping AI with no automated quality gates at all). Being able to say "I built a pipeline that blocks a PR if faithfulness drops below 0.85" is a concrete, quantifiable claim that resonates immediately in interviews.

---

## The Overall Narrative (for your resume/interviews)

These 7 projects aren't random — read together, they tell one story:

> *"I can test simple LLM outputs (#1) → build and measure RAG systems (#2) → monitor them in production (#3) → test complex multi-step agents (#4) → orchestrate and test multi-agent systems connected via MCP (#5) → break AI systems on purpose to find weaknesses (#6) → and ship it all through an automated, quality-gated pipeline (#7)."*

That progression — from single-output testing to full production-grade AI quality engineering — is exactly the hybrid "AI Builder + AI QA" positioning your roadmap is built around, and it directly leverages the QA automation background (Playwright, pytest, CI/CD, API testing) you already have.
